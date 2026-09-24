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

  const viewTabsEl = document.getElementById("view-tabs");
  const overallContentEl = document.getElementById("overall-content");
  const overallSummaryEl = document.getElementById("overall-summary");
  const overallListEl = document.getElementById("overall-list");
  const weekGridEl = document.getElementById("week-grid");

  let allWeeks = [];
  let selectedWeekId = null;
  let currentView = "overall";
  let allWeekDetails = null; // cached [{ week, games, picks }] for the overall view

  // Same localStorage key index.html uses to remember who you are — reused
  // here (read-only) purely so the API can reveal your own not-yet-locked
  // picks to you while keeping everyone else's hidden. See js/app.js.
  function getViewerName() {
    try {
      return localStorage.getItem("nfl-pickem:name") || "";
    } catch (err) {
      return "";
    }
  }

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
            // The API redacts anyone else's pick until this game locks (at
            // kickoff) — see server/src/routes/weeks.js — so friends can't
            // copy each other. Show that a pick exists without saying what
            // it is.
            if (pick === "hidden") {
              return `
                <li class="pick-list__item pick-list__item--hidden">
                  <span class="pick-list__name">${escapeHtml(entry.name || "Unnamed")}</span>
                  <span class="pick-list__pick">Picked <span class="pick-list__lock-icon" aria-hidden="true">&#128274;</span></span>
                  <span class="pick-list__status-text">Locks at kickoff</span>
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


  /* ---------------------------------------------------------
     Overall standings (all weeks combined)
     --------------------------------------------------------- */

  async function loadAllWeekDetails() {
    if (allWeekDetails) return allWeekDetails;
    const details = await Promise.all(
      allWeeks.map(async (w) => {
        const detail = await Api.getWeek(w.id, getViewerName());
        return { week: w, games: detail.games, picks: detail.picks };
      })
    );
    allWeekDetails = details;
    return details;
  }

  // Only weeks where something has been decided count toward standings.
  function buildOverall(details) {
    const scored = details.filter((d) => d.games.some((g) => g.winnerSide));
    const players = new Map(); // lowercase name -> row

    details.forEach((d) => {
      d.picks.forEach((entry) => {
        const key = (entry.name || "Unnamed").trim().toLowerCase();
        if (!players.has(key)) {
          players.set(key, { name: entry.name || "Unnamed", correct: 0, weekScores: {}, weekWins: 0 });
        }
      });
    });

    const decided = scored.reduce((sum, d) => sum + d.games.filter((g) => g.winnerSide).length, 0);

    scored.forEach((d) => {
      const weekComplete = d.games.every((g) => g.winnerSide);
      let best = 0;
      players.forEach((row, key) => {
        const entry = d.picks.find((p) => (p.name || "Unnamed").trim().toLowerCase() === key);
        const { correct } = League.scoreForPerson(entry ? entry.picks : null, d.games);
        row.weekScores[d.week.id] = correct;
        row.correct += correct;
        if (correct > best) best = correct;
      });
      d.winnerKeys = new Set();
      if (weekComplete && best > 0) {
        players.forEach((row, key) => {
          if (row.weekScores[d.week.id] === best) {
            row.weekWins += 1;
            d.winnerKeys.add(key);
          }
        });
      }
    });

    const rows = Array.from(players.values());
    rows.sort((a, b) => b.correct - a.correct || b.weekWins - a.weekWins || a.name.localeCompare(b.name));

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

    return { rows, scored, decided };
  }

  function renderOverall({ rows, scored, decided }) {
    if (!scored.length) {
      overallSummaryEl.textContent = "No games are final yet — standings show up once results come in.";
    } else {
      overallSummaryEl.textContent = `${decided} games final across ${scored.length} ${scored.length === 1 ? "week" : "weeks"}.`;
    }

    overallListEl.innerHTML = rows
      .map((row) => {
        const rankLabel = row.isTied ? `T-${ordinal(row.rank)}` : ordinal(row.rank);
        const medal = decided && row.rank === 1 ? "🏆" : decided && row.rank === 2 ? "🥈" : decided && row.rank === 3 ? "🥉" : "";
        const sub = row.weekWins
          ? `<span class="leaderboard-item__sub">${row.weekWins} week ${row.weekWins === 1 ? "win" : "wins"}</span>`
          : "";
        return `
          <li class="leaderboard-item">
            <span class="leaderboard-item__rank">${rankLabel}</span>
            <span class="leaderboard-item__name">${escapeHtml(row.name)} ${medal ? `<span aria-hidden="true">${medal}</span>` : ""}${sub}</span>
            <span class="leaderboard-item__score">
              <strong>${row.correct}</strong><span class="leaderboard-item__score-of">/${decided}</span>
              <span class="leaderboard-item__score-label">correct</span>
            </span>
          </li>
        `;
      })
      .join("");

    if (!scored.length) {
      weekGridEl.innerHTML = "";
      return;
    }

    const head = scored.map((d) => `<th scope="col">${escapeHtml(d.week.label.replace(/^Week\s*/i, "Wk "))}</th>`).join("");
    const body = rows
      .map((row) => {
        const key = row.name.trim().toLowerCase();
        const cells = scored
          .map((d) => {
            const score = row.weekScores[d.week.id];
            const isWin = d.winnerKeys.has(key);
            return `<td class="${isWin ? "week-grid__win" : ""}">${score}${isWin ? " <span aria-label=\"week winner\">🏆</span>" : ""}</td>`;
          })
          .join("");
        return `<tr><th scope="row">${escapeHtml(row.name)}</th>${cells}</tr>`;
      })
      .join("");
    weekGridEl.innerHTML = `<thead><tr><th scope="col">Player</th>${head}</tr></thead><tbody>${body}</tbody>`;
  }

  async function showOverall() {
    contentEl.hidden = true;
    emptyStateEl.hidden = true;
    weekTabsEl.hidden = true;
    loadErrorEl.hidden = true;
    overallContentEl.hidden = true;
    loadingStateEl.hidden = false;

    try {
      const details = await loadAllWeekDetails();
      if (currentView !== "overall") return; // user switched away while loading
      loadingStateEl.hidden = true;

      if (!details.some((d) => d.picks.length)) {
        emptyStateEl.hidden = false;
        return;
      }
      renderOverall(buildOverall(details));
      overallContentEl.hidden = false;
    } catch (err) {
      loadingStateEl.hidden = true;
      loadErrorMessageEl.textContent = err.message || "Couldn't load the overall standings.";
      loadErrorEl.hidden = false;
    }
  }

  function showWeekly() {
    overallContentEl.hidden = true;
    loadErrorEl.hidden = true;
    renderWeekTabs();
    return loadSelectedWeek();
  }

  function setView(view) {
    currentView = view;
    viewTabsEl.querySelectorAll(".view-tab").forEach((btn) => {
      const active = btn.dataset.view === view;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", String(active));
    });
    return view === "overall" ? showOverall() : showWeekly();
  }

  async function loadSelectedWeek() {
    contentEl.hidden = true;
    emptyStateEl.hidden = true;
    loadingStateEl.hidden = false;

    try {
      const weekId = selectedWeekId;
      const detail = await Api.getWeek(weekId, getViewerName());
      if (currentView !== "weekly" || weekId !== selectedWeekId) return; // stale response
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

    viewTabsEl.hidden = false;
    viewTabsEl.querySelectorAll(".view-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.dataset.view !== currentView) setView(btn.dataset.view);
      });
    });
    await setView("overall");
  }

  init();
})();
