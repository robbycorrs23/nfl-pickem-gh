/**
 * Auto-grading now reads results from TuddyBowl's own read-only scores
 * endpoint (see fetchScoresFromTuddybowl below) instead of calling ESPN
 * itself - added 2026-09-19. TuddyBowl already polls ESPN for its own
 * purposes; this avoids a third app (on top of TuddyBowl and, until
 * recently, ffplayeralerts) independently hammering the same endpoint.
 * fetchWeekSchedule() below still calls ESPN directly - that one's only
 * ever triggered by an admin clicking "Auto-fill from ESPN", not a timer,
 * so it doesn't have the same repeated-polling concern.
 *
 * We only ever UPDATE games already created by the commissioner (never
 * create games from ESPN data), and we never overwrite a manually-set
 * result (result_source = 'manual') — auto-sync only fills in games that
 * are still undecided or were previously set by a prior auto-sync.
 */

const ESPN_SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
const TUDDYBOWL_SCORES_URL = "https://tuddybowl.com/api/live-stats/scores";

/**
 * Fetch completed/in-progress game results from TuddyBowl's read-only
 * scores endpoint. Returns the same shape extractEventResult() produces
 * from ESPN directly, so syncWeekScores()'s matching logic is unchanged.
 */
async function fetchScoresFromTuddybowl() {
  const res = await fetch(TUDDYBOWL_SCORES_URL, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`TuddyBowl scores request failed: HTTP ${res.status}`);
  const data = await res.json();
  if (!data.success || !Array.isArray(data.games)) {
    throw new Error("TuddyBowl scores response missing games array");
  }
  return data.games.map((g) => ({
    homeName: g.homeName,
    awayName: g.awayName,
    homeScore: g.homeScore,
    awayScore: g.awayScore,
    completed: Boolean(g.completed),
  }));
}

async function fetchEspnScoreboard({ espnWeek, season, seasonType }) {
  const params = new URLSearchParams();
  if (espnWeek) params.set("week", String(espnWeek));
  if (season) params.set("year", String(season));
  if (seasonType) params.set("seasontype", String(seasonType));

  const url = `${ESPN_SCOREBOARD_URL}${params.toString() ? `?${params}` : ""}`;

  const res = await fetch(url, {
    headers: { "User-Agent": "curl/8.5.0", Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`ESPN scoreboard request failed: HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.events) ? data.events : [];
}

function extractEventResult(event) {
  const competition = event?.competitions?.[0];
  const statusType = event?.status?.type;
  const competitors = competition?.competitors ?? [];
  const home = competitors.find((c) => c.homeAway === "home");
  const away = competitors.find((c) => c.homeAway === "away");

  if (!competition || !statusType || !home?.team || !away?.team) return null;

  return {
    homeName: home.team.name,
    awayName: away.team.name,
    homeScore: home.score != null ? parseInt(home.score, 10) : null,
    awayScore: away.score != null ? parseInt(away.score, 10) : null,
    completed: Boolean(statusType.completed),
  };
}

/**
 * Syncs scores for one week's games against ESPN's scoreboard for that
 * week/season/seasontype. Returns { updated, checked }.
 */
async function syncWeekScores(pool, week) {
  if (!week.espn_week) return { updated: 0, checked: 0, skippedNoEspnWeek: true };

  const { rows: games } = await pool.query(
    `SELECT id, away_name, home_name, winner_side, result_source
     FROM games WHERE week_id = $1`,
    [week.id]
  );

  const pending = games.filter((g) => g.result_source !== "manual");
  if (!pending.length) return { updated: 0, checked: 0 };

  let results;
  try {
    results = await fetchScoresFromTuddybowl();
  } catch (err) {
    console.error(`[espn] TuddyBowl scores fetch failed for ${week.id}:`, err.message);
    return { updated: 0, checked: 0, error: err.message };
  }

  let updated = 0;

  for (const game of pending) {
    const match = results.find(
      (r) =>
        r.awayName.toLowerCase() === game.away_name.toLowerCase() &&
        r.homeName.toLowerCase() === game.home_name.toLowerCase()
    );
    if (!match || !match.completed || match.homeScore == null || match.awayScore == null) continue;
    if (match.homeScore === match.awayScore) continue; // no ties in the NFL (well, almost never) — skip ambiguous

    const winnerSide = match.homeScore > match.awayScore ? "home" : "away";
    if (game.winner_side === winnerSide && game.result_source === "espn") continue; // no change

    await pool.query(
      `UPDATE games SET winner_side = $1, result_source = 'espn', updated_at = now() WHERE id = $2`,
      [winnerSide, game.id]
    );
    updated += 1;
  }

  return { updated, checked: pending.length };
}

/**
 * Fetches a week's full schedule (teams + kickoff times) from ESPN, so the
 * commissioner doesn't have to hand-type 14 matchups every week. Used by
 * the admin page's "Auto-fill from ESPN" button — this only reads from
 * ESPN, it never touches our database (the admin still reviews/edits the
 * result and explicitly hits "Create Week" to save it).
 */
async function fetchWeekSchedule({ espnWeek, season, seasonType }) {
  const events = await fetchEspnScoreboard({ espnWeek, season, seasonType });

  return events
    .map((event) => {
      const competition = event?.competitions?.[0];
      const competitors = competition?.competitors ?? [];
      const home = competitors.find((c) => c.homeAway === "home");
      const away = competitors.find((c) => c.homeAway === "away");
      if (!competition || !home?.team || !away?.team) return null;

      return {
        awayCity: away.team.location || "",
        awayName: away.team.name || away.team.shortDisplayName || "",
        homeCity: home.team.location || "",
        homeName: home.team.name || home.team.shortDisplayName || "",
        kickoff: competition.date || event.date,
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
}

/**
 * Runs syncWeekScores for every week that still has at least one
 * non-manually-decided game. Called on a timer and via the admin's
 * "Sync scores now" button.
 */
async function syncAllPendingWeeks(pool) {
  const { rows: weeks } = await pool.query(
    `SELECT DISTINCT w.* FROM weeks w
     JOIN games g ON g.week_id = w.id
     WHERE g.winner_side IS NULL OR g.result_source = 'espn'`
  );

  const summary = [];
  for (const week of weeks) {
    const result = await syncWeekScores(pool, week);
    summary.push({ weekId: week.id, ...result });
  }
  return summary;
}

module.exports = { syncWeekScores, syncAllPendingWeeks, fetchWeekSchedule };
