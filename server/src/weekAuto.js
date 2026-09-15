/**
 * Fully automatic week lifecycle — no commissioner button-clicking.
 *
 * 1. ensureSeasonWeeks() pre-creates weeks 1..N for the season from ESPN's
 *    published schedule (skips any week id that already exists, so it's
 *    safe to re-run constantly — it only ever fills gaps).
 * 2. computeCurrentWeekId() figures out which week friends should be
 *    picking *right now*, purely from each week's game kickoff times —
 *    no stored "is current" flag to toggle.
 *
 * The rule for "current": a week is still current until its last game's
 * kickoff + a buffer (long enough for that game to have finished) has
 * passed. The first week (earliest games) that hasn't hit that point yet
 * is current. This means the app rolls over to next week as soon as the
 * previous week's games are done — not when the next week's games start —
 * which is what lets people pick well ahead of Thursday night kickoff.
 */

const { fetchWeekSchedule } = require("./espn");

const CURRENT_WEEK_BUFFER_MS = 6 * 60 * 60 * 1000; // 6 hours past last kickoff

function slugify(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function ensureSeasonWeeks(pool, { season, throughWeek = 18, seasonType = 2 } = {}) {
  const results = [];
  for (let n = 1; n <= throughWeek; n++) {
    const weekId = `week${n}`;
    const existing = await pool.query("SELECT 1 FROM weeks WHERE id = $1", [weekId]);
    if (existing.rows.length) continue;

    try {
      const games = await fetchWeekSchedule({ espnWeek: n, season, seasonType });
      if (!games.length) {
        results.push({ weekId, created: false, reason: "no ESPN schedule yet" });
        continue;
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO weeks (id, label, season, espn_week, espn_seasontype) VALUES ($1, $2, $3, $4, $5)`,
          [weekId, `Week ${n}`, season, n, seasonType]
        );
        for (const g of games) {
          const gameId = `${weekId}__${slugify(g.awayName)}-${slugify(g.homeName)}`;
          await client.query(
            `INSERT INTO games (id, week_id, away_city, away_name, home_city, home_name, kickoff)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [gameId, weekId, g.awayCity, g.awayName, g.homeCity, g.homeName, g.kickoff]
          );
        }
        await client.query("COMMIT");
        results.push({ weekId, created: true, games: games.length });
        console.log(`[weekAuto] provisioned ${weekId} with ${games.length} games from ESPN`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      console.error(`[weekAuto] failed to provision week ${n}:`, err.message);
      results.push({ weekId, created: false, reason: err.message });
    }
  }
  return results;
}

/**
 * Returns the id of whichever week should currently be shown for picking,
 * or null if no week has any games yet.
 */
async function computeCurrentWeekId(pool) {
  const { rows } = await pool.query(`
    SELECT w.id, MIN(g.kickoff) AS first_kickoff, MAX(g.kickoff) AS last_kickoff
    FROM weeks w
    JOIN games g ON g.week_id = w.id
    GROUP BY w.id
    ORDER BY MIN(g.kickoff) ASC
  `);
  if (!rows.length) return null;

  const now = Date.now();
  const upcoming = rows.find((r) => new Date(r.last_kickoff).getTime() + CURRENT_WEEK_BUFFER_MS > now);
  return upcoming ? upcoming.id : rows[rows.length - 1].id;
}

module.exports = { ensureSeasonWeeks, computeCurrentWeekId, slugify };
