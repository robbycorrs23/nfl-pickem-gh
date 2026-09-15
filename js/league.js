/**
 * NFL Week 1 Pick'em — Shared pure-JS helpers
 * ---------------------------------------------
 * Parsing pasted "generate my picks" messages back into structured data,
 * and scoring a player's picks against decided results. No network calls
 * here (see js/api.js for that) — everything below is pure functions so
 * it's easy to unit test and reuse across scoreboard.js and admin.js.
 */

const League = (function () {
  "use strict";

  /* ---------------------------------------------------------
     Parsing pasted "generate my picks" messages back into data
     --------------------------------------------------------- */

  // Build a lookup: "winner name|||loser name" (lowercase) -> { gameId, side }
  function buildMatchupIndex(games) {
    const index = new Map();
    games.forEach((game) => {
      index.set(`${game.away.name.toLowerCase()}|||${game.home.name.toLowerCase()}`, {
        gameId: game.id,
        side: "away",
      });
      index.set(`${game.home.name.toLowerCase()}|||${game.away.name.toLowerCase()}`, {
        gameId: game.id,
        side: "home",
      });
    });
    return index;
  }

  function titleCase(str) {
    return str
      .toLowerCase()
      .split(/\s+/)
      .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
      .join(" ");
  }

  function extractName(headerLine) {
    const match = headerLine.match(/🏈\s*(.+?)\s+WEEK\s*\d+\s*PICKS/i);
    if (!match) return "";
    let raw = match[1].trim();
    if (/['’]S$/i.test(raw)) {
      raw = raw.slice(0, -2);
    } else if (/['’]$/.test(raw)) {
      raw = raw.slice(0, -1);
    }
    return titleCase(raw.trim());
  }

  function parseLineToPick(line, matchupIndex) {
    const cleaned = line.replace(/[🔒✓✗]/g, "").trim();
    const match = cleaned.match(/^(.+?)\s+over\s+(.+?)[.!]?$/i);
    if (!match) return null;
    const winner = match[1].trim().toLowerCase();
    const loser = match[2].trim().toLowerCase();
    return matchupIndex.get(`${winner}|||${loser}`) || null;
  }

  /**
   * Parses one or more pasted pick messages (the exact text friends copy
   * out of the app) into structured entries, matched against the given
   * week's games. Messages don't need to be separated by anything special
   * — a new "🏈 ... WEEK N PICKS" header line starts a new entry.
   */
  function parseMessages(rawText, games) {
    const matchupIndex = buildMatchupIndex(games);
    const lines = rawText.split(/\r?\n/);
    const blocks = [];
    let current = null;

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      if (trimmed.includes("🏈")) {
        current = { name: extractName(trimmed), picks: {} };
        blocks.push(current);
        return;
      }

      if (!current) {
        current = { name: "", picks: {} };
        blocks.push(current);
      }

      const found = parseLineToPick(trimmed, matchupIndex);
      if (found) {
        current.picks[found.gameId] = found.side;
      }
    });

    return blocks
      .filter((block) => Object.keys(block.picks).length > 0)
      .map((block) => ({
        name: block.name,
        picks: block.picks,
        parsedCount: Object.keys(block.picks).length,
      }));
  }

  /* ---------------------------------------------------------
     Scoring
     --------------------------------------------------------- */

  // `games` is the array from the API (each with .id and .winnerSide).
  function scoreForPerson(picks, games) {
    const decided = games.filter((g) => g.winnerSide);
    let correct = 0;
    decided.forEach((g) => {
      if (picks && picks[g.id] === g.winnerSide) correct += 1;
    });
    return { correct, decided: decided.length };
  }

  function possessiveName(rawName) {
    const upper = rawName.trim().toUpperCase();
    if (!upper) return "MY";
    return upper.endsWith("S") ? `${upper}'` : `${upper}'S`;
  }

  return {
    parseMessages,
    scoreForPerson,
    titleCase,
    possessiveName,
  };
})();
