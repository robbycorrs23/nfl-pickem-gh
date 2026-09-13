/**
 * NFL Week 1 Pick'em — Shared League Data Helpers
 * -------------------------------------------------
 * Used by both scoreboard.html and admin.html. Depends on GAMES from
 * js/games.js being loaded first. Exposes a single `League` global with:
 *
 *   League.load()                 -> fetch data/league-data.json
 *   League.parseMessages(text)    -> turn pasted "🏈 NAME'S WEEK 1 PICKS"
 *                                     messages into { name, picks, parsedCount }
 *   League.scoreForPerson(picks, results) -> { correct, decided }
 *   League.DATA_PATH               -> path to the shared JSON data file
 */

const League = (function () {
  "use strict";

  const DATA_PATH = "./data/league-data.json";

  /* ---------------------------------------------------------
     Loading published data
     --------------------------------------------------------- */

  async function load() {
    try {
      const res = await fetch(`${DATA_PATH}?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return {
        picks: Array.isArray(data.picks) ? data.picks : [],
        results: data.results && typeof data.results === "object" ? data.results : {},
      };
    } catch (err) {
      return { picks: [], results: {}, loadError: true };
    }
  }

  /* ---------------------------------------------------------
     Parsing pasted "generate my picks" messages back into data
     --------------------------------------------------------- */

  // Build a lookup: "winner name|||loser name" (lowercase) -> { gameId, side }
  function buildMatchupIndex() {
    const index = new Map();
    GAMES.forEach((game) => {
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
    const match = headerLine.match(/🏈\s*(.+?)\s+WEEK\s*1\s*PICKS/i);
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
   * out of the app) into structured entries. Messages don't need to be
   * separated by anything special — a new "🏈 ... WEEK 1 PICKS" header
   * line starts a new entry.
   */
  function parseMessages(rawText) {
    const matchupIndex = buildMatchupIndex();
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
        // Picks pasted without a header line — stash under an unnamed block
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

  function scoreForPerson(picks, results) {
    const decidedGameIds = Object.keys(results || {});
    let correct = 0;
    decidedGameIds.forEach((gameId) => {
      if (picks && picks[gameId] && picks[gameId] === results[gameId]) {
        correct += 1;
      }
    });
    return { correct, decided: decidedGameIds.length };
  }

  return {
    DATA_PATH,
    load,
    parseMessages,
    scoreForPerson,
    titleCase,
  };
})();
