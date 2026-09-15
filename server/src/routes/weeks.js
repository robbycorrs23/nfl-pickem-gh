const express = require("express");
const { pool } = require("../db");
const { requireAdmin } = require("../auth");
const { syncWeekScores, fetchWeekSchedule } = require("../espn");

const router = express.Router();

function slugify(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function gameRowToJson(g) {
  return {
    id: g.id,
    away: { city: g.away_city, name: g.away_name },
    home: { city: g.home_city, name: g.home_name },
    kickoff: g.kickoff,
    winnerSide: g.winner_side,
    resultSource: g.result_source,
  };
}

// ---------------------------------------------------------------
// Public reads
// ---------------------------------------------------------------

// List all weeks (for the scoreboard's week switcher).
router.get("/", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT w.*,
              (SELECT count(*) FROM games g WHERE g.week_id = w.id) AS game_count
       FROM weeks w ORDER BY w.created_at ASC`
    );
    res.json(
      rows.map((w) => ({
        id: w.id,
        label: w.label,
        season: w.season,
        espnWeek: w.espn_week,
        isCurrent: w.is_current,
        gameCount: Number(w.game_count),
      }))
    );
  } catch (err) {
    next(err);
  }
});

// Look up a week's real schedule from ESPN (teams + kickoff times), so the
// commissioner can auto-fill the "create week" form instead of typing out
// every matchup by hand. Read-only — doesn't touch our database. NOTE: this
// must stay registered before GET /:weekId, or "espn-schedule" would be
// swallowed as a weekId param.
router.get("/espn-schedule", requireAdmin, async (req, res, next) => {
  try {
    const espnWeek = Number(req.query.week);
    const season = Number(req.query.season);
    const seasonType = req.query.seasontype ? Number(req.query.seasontype) : 2;

    if (!espnWeek || !season) {
      return res.status(400).json({ error: "week and season query params are required." });
    }

    const games = await fetchWeekSchedule({ espnWeek, season, seasonType });
    if (!games.length) {
      return res.status(404).json({ error: "ESPN has no schedule for that week/season yet." });
    }
    res.json({ games });
  } catch (err) {
    next(err);
  }
});

// Full data for one week: games + all submitted picks.
router.get("/:weekId", async (req, res, next) => {
  try {
    const { weekId } = req.params;
    const weekRes = await pool.query("SELECT * FROM weeks WHERE id = $1", [weekId]);
    if (!weekRes.rows.length) return res.status(404).json({ error: "Week not found." });
    const week = weekRes.rows[0];

    const gamesRes = await pool.query(
      "SELECT * FROM games WHERE week_id = $1 ORDER BY kickoff ASC",
      [weekId]
    );

    const picksRes = await pool.query(
      `SELECT player_name, game_id, side FROM picks WHERE week_id = $1 ORDER BY player_name ASC`,
      [weekId]
    );

    const picksByPlayer = new Map();
    picksRes.rows.forEach((row) => {
      const key = row.player_name.trim().toLowerCase();
      if (!picksByPlayer.has(key)) {
        picksByPlayer.set(key, { name: row.player_name, picks: {} });
      }
      picksByPlayer.get(key).picks[row.game_id] = row.side;
    });

    res.json({
      week: {
        id: week.id,
        label: week.label,
        season: week.season,
        espnWeek: week.espn_week,
        isCurrent: week.is_current,
      },
      games: gamesRes.rows.map(gameRowToJson),
      picks: Array.from(picksByPlayer.values()),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------
// Public write: a friend submitting their own picks
// ---------------------------------------------------------------

router.post("/:weekId/picks", async (req, res, next) => {
  try {
    const { weekId } = req.params;
    const { name, picks } = req.body || {};

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "name is required." });
    }
    if (!picks || typeof picks !== "object" || Array.isArray(picks)) {
      return res.status(400).json({ error: "picks must be an object of { gameId: 'home'|'away' }." });
    }

    const weekRes = await pool.query("SELECT id FROM weeks WHERE id = $1", [weekId]);
    if (!weekRes.rows.length) return res.status(404).json({ error: "Week not found." });

    const entries = Object.entries(picks).filter(([, side]) => side === "home" || side === "away");
    if (!entries.length) {
      return res.status(400).json({ error: "No valid picks provided." });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const [gameId, side] of entries) {
        await client.query(
          `INSERT INTO picks (week_id, player_name, game_id, side)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (week_id, player_name_key, game_id)
           DO UPDATE SET side = EXCLUDED.side, player_name = EXCLUDED.player_name, updated_at = now()`,
          [weekId, name.trim(), gameId, side]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    res.status(201).json({ ok: true, saved: entries.length });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------
// Admin: manage weeks + games
// ---------------------------------------------------------------

router.post("/", requireAdmin, async (req, res, next) => {
  try {
    const { id, label, season, espnWeek, espnSeasonType, games } = req.body || {};
    if (!id || !label || !season || !Array.isArray(games) || !games.length) {
      return res.status(400).json({ error: "id, label, season, and a non-empty games array are required." });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO weeks (id, label, season, espn_week, espn_seasontype) VALUES ($1, $2, $3, $4, $5)`,
        [id, label, season, espnWeek || null, espnSeasonType || 2]
      );

      for (const g of games) {
        const gameId = g.id || `${id}__${slugify(g.awayName)}-${slugify(g.homeName)}`;
        await client.query(
          `INSERT INTO games (id, week_id, away_city, away_name, home_city, home_name, kickoff)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [gameId, id, g.awayCity, g.awayName, g.homeCity, g.homeName, g.kickoff]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    res.status(201).json({ ok: true, id });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "A week with that id already exists." });
    next(err);
  }
});

router.post("/:weekId/games", requireAdmin, async (req, res, next) => {
  try {
    const { weekId } = req.params;
    const { awayCity, awayName, homeCity, homeName, kickoff } = req.body || {};
    if (!awayName || !homeName || !kickoff) {
      return res.status(400).json({ error: "awayName, homeName, and kickoff are required." });
    }
    const gameId = `${weekId}__${slugify(awayName)}-${slugify(homeName)}`;
    await pool.query(
      `INSERT INTO games (id, week_id, away_city, away_name, home_city, home_name, kickoff)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [gameId, weekId, awayCity || "", awayName, homeCity || "", homeName, kickoff]
    );
    res.status(201).json({ ok: true, id: gameId });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "That matchup already exists this week." });
    next(err);
  }
});

router.delete("/:weekId", requireAdmin, async (req, res, next) => {
  try {
    await pool.query("DELETE FROM weeks WHERE id = $1", [req.params.weekId]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete("/:weekId/games/:gameId", requireAdmin, async (req, res, next) => {
  try {
    await pool.query("DELETE FROM games WHERE id = $1 AND week_id = $2", [
      req.params.gameId,
      req.params.weekId,
    ]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post("/:weekId/activate", requireAdmin, async (req, res, next) => {
  try {
    const { weekId } = req.params;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE weeks SET is_current = false");
      const result = await client.query("UPDATE weeks SET is_current = true WHERE id = $1", [weekId]);
      if (!result.rowCount) throw Object.assign(new Error("Week not found."), { status: 404 });
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------
// Admin: results
// ---------------------------------------------------------------

router.put("/:weekId/games/:gameId/result", requireAdmin, async (req, res, next) => {
  try {
    const { winnerSide } = req.body || {};
    if (winnerSide !== "home" && winnerSide !== "away") {
      return res.status(400).json({ error: "winnerSide must be 'home' or 'away'." });
    }
    await pool.query(
      `UPDATE games SET winner_side = $1, result_source = 'manual', updated_at = now()
       WHERE id = $2 AND week_id = $3`,
      [winnerSide, req.params.gameId, req.params.weekId]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete("/:weekId/games/:gameId/result", requireAdmin, async (req, res, next) => {
  try {
    await pool.query(
      `UPDATE games SET winner_side = NULL, result_source = NULL, updated_at = now()
       WHERE id = $1 AND week_id = $2`,
      [req.params.gameId, req.params.weekId]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post("/:weekId/sync-scores", requireAdmin, async (req, res, next) => {
  try {
    const weekRes = await pool.query("SELECT * FROM weeks WHERE id = $1", [req.params.weekId]);
    if (!weekRes.rows.length) return res.status(404).json({ error: "Week not found." });
    const result = await syncWeekScores(pool, weekRes.rows[0]);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------
// Admin: picks corrections
// ---------------------------------------------------------------

router.delete("/:weekId/picks/:playerName", requireAdmin, async (req, res, next) => {
  try {
    await pool.query(
      `DELETE FROM picks WHERE week_id = $1 AND player_name_key = $2`,
      [req.params.weekId, req.params.playerName.trim().toLowerCase()]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
