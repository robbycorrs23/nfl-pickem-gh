/**
 * NFL Week 1 Pick'em — Scoreboard rendering
 * Depends on GAMES (js/games.js) and League (js/league.js).
 */

(function () {
  "use strict";

  const loadErrorEl = document.getElementById("load-error");
  const emptyStateEl = document.getElementById("empty-state");
  const contentEl = document.getElementById("scoreboard-content");

  const gamesFinalCountEl = document.getElementById("games-final-count");
  const resultsProgressFillEl = document.getElementById("results-progress-fill");
  const resultsProgressTrackEl = document.getElementById("results-progress-track");

  const leaderboardListEl = document.getElementById("leaderboard-list");
  const breakdownListEl = document.getElementById("game-breakdown-list");

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function buildLeaderboard(picks, results) {
    const rows = picks.map((entry) => {
      const { correct, decided } = League.scoreForPerson(entry.picks, results);
      return {
        name: entry.name || "Unnamed",
        correct,
        decided,
        totalPicks: Object.keys(entry.picks || {}).length,
      };
    });

    rows.sort((a, b) => b.correct - a.correct || a.name.localeCompare(b.name));

    let rank = 0;
    let lastScore = null;
    rows.forEach((row, i) => {
      if (row.correct !== lastScore) {
        rank = i + 1;
        lastScore = row.correct;
      }
      row.rank = rank;
    });

    // mark ties
    const scoreCounts = rows.reduce((acc, r) => {
      acc[r.correct] = (acc[r.correct] || 0) + 1;
      return acc;
    }, {});
    rows.forEach((row) => {
      row.isTied = scoreCounts[row.correct] > 1;
    });

    return rows;
  }

  function ordinal(n) {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function renderLeaderboard(rows) {
    leaderboardListEl.innerHTML = rows
      .map((row) => {
        const rankLabel = row.isTied ? `T-${ordinal(row.rank)}` : ordinal(row.rank);
        const medal = row.rank === 1 ? "🏆" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : "";
        return `
          <li class="leaderboard-item">
            <span class="leaderboard-item__rank">${rankLabel}</span>
            <span class="leaderboard-item__name">${escapeHtml(row.name)} ${medal ? `<span aria-hidden="true">${medal}</span>` : ""}</span>
            <span class="leaderboard-item__score">
              <strong>${row.correct}</strong><span class="leaderboard-item__score-of">/${row.decided}</span>
              <span class="leaderboard-item__score-label">correct</span>
            </span>
          </li>
        `;
      })
      .join("");
  }

  function renderBreakdown(picks, results) {
    breakdownListEl.innerHTML = GAMES.map((game) => {
      const decidedSide = results[game.id];
      const isDecided = Boolean(decidedSide);
      const winnerName = isDecided
        ? decidedSide === "home"
          ? game.home.name
          : game.away.name
        : null;

      const rows = picks
        .slice()
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
        .map((entry) => {
          const pick = entry.picks ? entry.picks[game.id] : null;
          if (!pick) {
            return `
              <li class="pick-list__item pick-list__item--pending">
                <span class="pick-list__name">${escapeHtml(entry.name || "Unnamed")}</span>
                <span class="pick-list__pick">No pick</span>
                <span class="pick-list__status-text">—</span>
              </li>
            `;
          }
          const pickedTeam = pick === "home" ? game.home.name : game.away.name;
          let statusClass = "pick-list__item--pending";
          let statusText = "Pending";
          let mark = "&middot;";
          if (isDecided) {
            const correct = pick === decidedSide;
            statusClass = correct ? "pick-list__item--correct" : "pick-list__item--incorrect";
            statusText = correct ? "Correct" : "Incorrect";
            mark = correct ? "&#10003;" : "&#10007;";
          }
          return `
            <li class="pick-list__item ${statusClass}">
              <span class="pick-list__name">${escapeHtml(entry.name || "Unnamed")}</span>
              <span class="pick-list__pick">${escapeHtml(pickedTeam)}</span>
              <span class="pick-list__mark" aria-hidden="true">${mark}</span>
              <span class="pick-list__status-text">${statusText}</span>
            </li>
          `;
        })
        .join("");

      return `
        <details class="game-breakdown">
          <summary class="game-breakdown__summary">
            <span class="game-breakdown__matchup">${escapeHtml(game.away.name)} <span aria-hidden="true">@</span> ${escapeHtml(game.home.name)}</span>
            <span class="game-breakdown__result-badge ${isDecided ? "is-decided" : "is-pending"}">
              ${isDecided ? `${escapeHtml(winnerName)} won` : "Not final yet"}
            </span>
          </summary>
          <ul class="pick-list">${rows}</ul>
        </details>
      `;
    }).join("");
  }

  async function render() {
    const { picks, results, loadError } = await League.load();

    if (loadError) {
      loadErrorEl.hidden = false;
      return;
    }

    if (!picks.length) {
      emptyStateEl.hidden = false;
      return;
    }

    contentEl.hidden = false;

    const decidedCount = Object.keys(results).length;
    gamesFinalCountEl.textContent = `${decidedCount} / ${GAMES.length} games final`;
    resultsProgressFillEl.style.width = `${Math.round((decidedCount / GAMES.length) * 100)}%`;
    resultsProgressTrackEl.setAttribute("aria-valuemax", String(GAMES.length));
    resultsProgressTrackEl.setAttribute("aria-valuenow", String(decidedCount));

    const rows = buildLeaderboard(picks, results);
    renderLeaderboard(rows);
    renderBreakdown(picks, results);
  }

  render();
})();
