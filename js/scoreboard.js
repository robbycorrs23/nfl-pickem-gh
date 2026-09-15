/**
 * NFL Pick'em — Scoreboard rendering
 * Fetches all weeks from the API and renders a week switcher (so old
 * weeks stay fully viewable/archived), plus the leaderboard and
 * game-by-game breakdown for whichever week is selected.
 */

(function () {
  "use strict";

  const loadErrorEl = document.getElementById("load-error");
  const loadErrorMessageEl = document.getElementById("load-error-message");
  const loadingStateEl = document.getElementById("loading-state");
  const weekTabsEl = document.getElementById("week-tabs");
  const emptyStateEl = document.getElementById("empty-state");
  const contentEl = document.getElementById("scoreboard-content");

  const gamesFinalCountEl = document.getElementById("games-final-count");
  const resultsProgressFillEl = document.getElementById("results-progress-fill");
  const resultsProgressTrackEl = document.getElementById("results-progress-track");

  const leaderboardListEl = document.getElementById("leaderboard-list");
  const breakdownListEl = document.getElementById("game-breakdown-list");

  let allWeeks = [];
  let selectedWeekId = null;

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function resultBadge(sourceLabel) {
    if (sourceLabel === "espn") return " (auto)";
    if (sourceLabel === "manual") return "";
    return "";
  }

  function buildLeaderboard(picks, games) {
    const rows = picks.map((entry) => {
      const { correct, decided } = League.scoreForPerson(entry.picks, games);
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

  function renderBreakdown(picks, games) {
    breakdownListEl.innerHTML = games
      .map((game) => {
        const isDecided = Boolean(game.winnerSide);
        const winnerName = isDecided ? (game.winnerSide === "home" ? game.home.name : game.away.name) : null;

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
              const correct = pick === game.winnerSide;
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
                ${isDecided ? `${escapeHtml(winnerName)} won${resultBadge(game.resultSource)}` : "Not final yet"}
              </span>
            </summary>
            <ul class="pick-list">${rows}</ul>
          </details>
        `;
      })
      .join("");
  }

  function renderWeekTabs() {
    if (allWeeks.length <= 1) {
      weekTabsEl.hidden = true;
      return;
    }
    weekTabsEl.hidden = false;
    weekTabsEl.innerHTML = allWeeks
      .map(
        (w) => `
        <button type="button" class="week-tab ${w.id === selectedWeekId ? "is-active" : ""}" data-week-id="${w.id}" aria-current="${w.id === selectedWeekId}">
          ${escapeHtml(w.label)}${w.isCurrent ? " <span class=\"week-tab__badge\">current</span>" : ""}
        </button>
      `
      )
      .join("");

    weekTabsEl.querySelectorAll(".week-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedWeekId = btn.dataset.weekId;
        renderWeekTabs();
        loadSelectedWeek();
      });
    });
  }

  async function loadSelectedWeek() {
    contentEl.hidden = true;
    emptyStateEl.hidden = true;
    loadingStateEl.hidden = false;

    try {
      const detail = await Api.getWeek(selectedWeekId);
      loadingStateEl.hidden = true;

      if (!detail.picks.length) {
        emptyStateEl.hidden = false;
        return;
      }

      contentEl.hidden = false;

      const decidedCount = detail.games.filter((g) => g.winnerSide).length;
      gamesFinalCountEl.textContent = `${decidedCount} / ${detail.games.length} games final`;
      resultsProgressFillEl.style.width = `${Math.round((decidedCount / detail.games.length) * 100)}%`;
      resultsProgressTrackEl.setAttribute("aria-valuemax", String(detail.games.length));
      resultsProgressTrackEl.setAttribute("aria-valuenow", String(decidedCount));

      const rows = buildLeaderboard(detail.picks, detail.games);
      renderLeaderboard(rows);
      renderBreakdown(detail.picks, detail.games);
    } catch (err) {
      loadingStateEl.hidden = true;
      loadErrorMessageEl.textContent = err.message || "Couldn't load this week.";
      loadErrorEl.hidden = false;
    }
  }

  async function init() {
    try {
      allWeeks = await Api.getWeeks();
    } catch (err) {
      loadingStateEl.hidden = true;
      loadErrorMessageEl.textContent = err.message || "Couldn't load the scoreboard.";
      loadErrorEl.hidden = false;
      return;
    }

    if (!allWeeks.length) {
      loadingStateEl.hidden = true;
      emptyStateEl.hidden = false;
      return;
    }

    const current = allWeeks.find((w) => w.isCurrent) || allWeeks[allWeeks.length - 1];
    selectedWeekId = current.id;
    renderWeekTabs();
    await loadSelectedWeek();
  }

  init();
})();
