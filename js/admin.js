/**
 * NFL Pick'em — Commissioner (admin) page logic.
 * Every write here hits the API immediately (js/api.js) — there's no
 * "publish" step anymore. We just refetch the working week after each
 * change and re-render.
 */

(function () {
  "use strict";

  const authGate = document.getElementById("auth-gate");
  const adminContent = document.getElementById("admin-content");
  const authForm = document.getElementById("auth-form");
  const passwordInput = document.getElementById("password-input");
  const authError = document.getElementById("auth-error");
  const lockBtn = document.getElementById("lock-btn");

  const playersListEl = document.getElementById("players-list");
  const weeksListEl = document.getElementById("weeks-list");
  const newWeekForm = document.getElementById("new-week-form");
  const newWeekGamesEl = document.getElementById("new-week-games");
  const addGameRowBtn = document.getElementById("add-game-row-btn");
  const newWeekStatus = document.getElementById("new-week-status");

  const workingWeekSelect = document.getElementById("working-week-select");

  const pasteInput = document.getElementById("paste-input");
  const parseBtn = document.getElementById("parse-btn");
  const parsedPreview = document.getElementById("parsed-preview");

  const stagedCountBadge = document.getElementById("staged-count-badge");
  const stagedPicksList = document.getElementById("staged-picks-list");

  const syncNowBtn = document.getElementById("sync-now-btn");
  const syncStatus = document.getElementById("sync-status");
  const resultsList = document.getElementById("results-list");

  let allWeeks = [];
  let workingWeekId = null;
  let workingDetail = { week: null, games: [], picks: [] };
  let currentParsed = [];

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ---------------------------------------------------------
     Auth
     --------------------------------------------------------- */

  function unlockAdmin() {
    authGate.hidden = true;
    adminContent.hidden = false;
    loadWeeks();
    loadPlayers();
  }

  /* ---------------------------------------------------------
     Players roster
     --------------------------------------------------------- */

  async function loadPlayers() {
    const players = await Api.getPlayers();
    if (!players.length) {
      playersListEl.innerHTML = `<li class="staged-picks-list__empty">No one's on the roster yet — it fills in automatically once someone picks.</li>`;
      return;
    }
    playersListEl.innerHTML = players
      .map(
        (name) => `
        <li class="staged-picks-list__item">
          <span class="staged-picks-list__name">${escapeHtml(name)}</span>
          <button class="link-btn" type="button" data-remove-player="${escapeHtml(name)}">Remove</button>
        </li>
      `
      )
      .join("");

    playersListEl.querySelectorAll("[data-remove-player]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const name = btn.dataset.removePlayer;
        const confirmed = window.confirm(`Remove ${name} from the roster? (Any picks they've already made are kept.)`);
        if (!confirmed) return;
        await Api.deletePlayer(name);
        await loadPlayers();
      });
    });
  }

  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await Api.adminLogin(passwordInput.value);
      authError.hidden = true;
      passwordInput.value = "";
      unlockAdmin();
    } catch (err) {
      authError.hidden = false;
      passwordInput.focus();
      passwordInput.select();
    }
  });

  lockBtn.addEventListener("click", () => {
    Api.logoutAdmin();
    adminContent.hidden = true;
    authGate.hidden = false;
    passwordInput.focus();
  });

  /* ---------------------------------------------------------
     Weeks
     --------------------------------------------------------- */

  async function loadWeeks() {
    allWeeks = await Api.getWeeks();
    renderWeeksList();

    workingWeekSelect.innerHTML = allWeeks
      .map((w) => `<option value="${w.id}">${escapeHtml(w.label)}${w.isCurrent ? " (current)" : ""}</option>`)
      .join("");

    const current = allWeeks.find((w) => w.isCurrent) || allWeeks[allWeeks.length - 1];
    workingWeekId = current ? current.id : null;
    workingWeekSelect.value = workingWeekId || "";

    if (workingWeekId) await loadWorkingWeek();
  }

  function renderWeeksList() {
    if (!allWeeks.length) {
      weeksListEl.innerHTML = `<li class="staged-picks-list__empty">No weeks yet — create one below.</li>`;
      return;
    }
    weeksListEl.innerHTML = allWeeks
      .map(
        (w) => `
        <li class="staged-picks-list__item">
          <span class="staged-picks-list__name">${escapeHtml(w.label)}</span>
          <span class="staged-picks-list__count">${w.gameCount} games</span>
          ${w.isCurrent ? `<span class="count-badge">current</span>` : ""}
        </li>
      `
      )
      .join("");
  }

  workingWeekSelect.addEventListener("change", async () => {
    workingWeekId = workingWeekSelect.value;
    await loadWorkingWeek();
  });

  async function loadWorkingWeek() {
    workingDetail = await Api.adminGetWeek(workingWeekId);
    renderStagedPicks();
    renderResults();
  }

  /* ---------------------------------------------------------
     Create a new week
     --------------------------------------------------------- */

  function gameRowMarkup(index) {
    return `
      <div class="parsed-preview__item" data-game-row="${index}">
        <div class="inline-actions">
          <div style="flex:1">
            <label class="field-label">Away city</label>
            <input class="field-input" data-field="awayCity" placeholder="Chicago" />
          </div>
          <div style="flex:1">
            <label class="field-label">Away team</label>
            <input class="field-input" data-field="awayName" placeholder="Bears" required />
          </div>
        </div>
        <div class="inline-actions">
          <div style="flex:1">
            <label class="field-label">Home city</label>
            <input class="field-input" data-field="homeCity" placeholder="Carolina" />
          </div>
          <div style="flex:1">
            <label class="field-label">Home team</label>
            <input class="field-input" data-field="homeName" placeholder="Panthers" required />
          </div>
        </div>
        <label class="field-label">Kickoff</label>
        <input class="field-input" type="datetime-local" data-field="kickoff" required />
        <button type="button" class="link-btn" data-remove-row="${index}">Remove this game</button>
      </div>
    `;
  }

  // Converts an ISO datetime (any timezone) into the value a
  // <input type="datetime-local"> expects, expressed in the browser's
  // local timezone (matching what new Date(value).toISOString() assumes
  // when the form is submitted).
  function toDatetimeLocalValue(iso) {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  let gameRowCount = 0;
  function addGameRow(prefill) {
    const div = document.createElement("div");
    div.innerHTML = gameRowMarkup(gameRowCount);
    const row = div.firstElementChild;
    newWeekGamesEl.appendChild(row);
    gameRowCount += 1;

    if (prefill) {
      row.querySelector('[data-field="awayCity"]').value = prefill.awayCity || "";
      row.querySelector('[data-field="awayName"]').value = prefill.awayName || "";
      row.querySelector('[data-field="homeCity"]').value = prefill.homeCity || "";
      row.querySelector('[data-field="homeName"]').value = prefill.homeName || "";
      if (prefill.kickoff) {
        row.querySelector('[data-field="kickoff"]').value = toDatetimeLocalValue(prefill.kickoff);
      }
    }
  }

  addGameRowBtn.addEventListener("click", () => addGameRow());
  // Start with one blank row.
  addGameRow();

  newWeekGamesEl.addEventListener("click", (event) => {
    const removeBtn = event.target.closest("[data-remove-row]");
    if (!removeBtn) return;
    removeBtn.closest("[data-game-row]").remove();
  });

  document.getElementById("autofill-espn-btn").addEventListener("click", async () => {
    const statusEl = document.getElementById("autofill-status");
    const season = Number(document.getElementById("week-season-input").value);
    const espnWeek = Number(document.getElementById("week-espn-input").value);

    if (!season || !espnWeek) {
      statusEl.textContent = "Fill in Season and NFL week # first.";
      statusEl.className = "field-hint field-hint--warn";
      return;
    }

    statusEl.textContent = "Fetching this week's real schedule from ESPN…";
    statusEl.className = "field-hint";

    try {
      const { games } = await Api.getEspnSchedule(espnWeek, season, 2);
      newWeekGamesEl.innerHTML = "";
      gameRowCount = 0;
      games.forEach((g) => addGameRow(g));
      statusEl.textContent = `Filled in ${games.length} games from ESPN — review kickoff times/teams below, then hit Create Week.`;
    } catch (err) {
      statusEl.textContent = `Couldn't auto-fill: ${err.message}. You can still add games manually below.`;
      statusEl.className = "field-hint field-hint--warn";
    }
  });

  newWeekForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    newWeekStatus.textContent = "Creating…";
    newWeekStatus.className = "field-hint";

    const id = document.getElementById("week-id-input").value.trim();
    const label = document.getElementById("week-label-input").value.trim();
    const season = Number(document.getElementById("week-season-input").value);
    const espnWeekVal = document.getElementById("week-espn-input").value;
    const espnWeek = espnWeekVal ? Number(espnWeekVal) : null;

    const rows = Array.from(newWeekGamesEl.querySelectorAll("[data-game-row]"));
    const games = rows.map((row) => {
      const get = (field) => row.querySelector(`[data-field="${field}"]`).value.trim();
      const kickoffLocal = get("kickoff");
      return {
        awayCity: get("awayCity"),
        awayName: get("awayName"),
        homeCity: get("homeCity"),
        homeName: get("homeName"),
        // datetime-local has no timezone — treat as entered in the browser's
        // local time and convert to an ISO string with offset.
        kickoff: kickoffLocal ? new Date(kickoffLocal).toISOString() : null,
      };
    });

    if (!id || !label || !games.length || games.some((g) => !g.awayName || !g.homeName || !g.kickoff)) {
      newWeekStatus.textContent = "Fill in week id, label, and every game's teams + kickoff.";
      newWeekStatus.className = "field-hint field-hint--warn";
      return;
    }

    try {
      await Api.createWeek({ id, label, season, espnWeek, games });
      newWeekStatus.textContent = `Created "${label}" with ${games.length} games.`;
      newWeekForm.reset();
      newWeekGamesEl.innerHTML = "";
      gameRowCount = 0;
      addGameRow();
      await loadWeeks();
    } catch (err) {
      newWeekStatus.textContent = err.message;
      newWeekStatus.className = "field-hint field-hint--warn";
    }
  });

  /* ---------------------------------------------------------
     Import / parse picks
     --------------------------------------------------------- */

  function renderParsedPreview() {
    if (!currentParsed.length) {
      parsedPreview.innerHTML = "";
      return;
    }

    parsedPreview.innerHTML = `
      <p class="parsed-preview__heading">Found ${currentParsed.length} pick set${currentParsed.length === 1 ? "" : "s"} — review before adding:</p>
      <ul class="parsed-preview__list">
        ${currentParsed
          .map(
            (entry, i) => `
          <li class="parsed-preview__item">
            <label class="field-label" for="parsed-name-${i}">Name</label>
            <input class="field-input" id="parsed-name-${i}" data-parsed-index="${i}" type="text" value="${escapeHtml(entry.name)}" />
            <p class="field-hint ${entry.parsedCount < workingDetail.games.length ? "field-hint--warn" : ""}">
              ${entry.parsedCount} / ${workingDetail.games.length} games parsed${entry.parsedCount < workingDetail.games.length ? " — double check the pasted text" : ""}
            </p>
            <label class="checkbox-label">
              <input type="checkbox" data-parsed-include="${i}" checked />
              Include this entry
            </label>
          </li>
        `
          )
          .join("")}
      </ul>
      <button class="btn btn--primary btn--block" id="confirm-add-btn" type="button">Add Selected to Scoreboard</button>
      <p id="add-parsed-status" class="field-hint" role="status" aria-live="polite"></p>
    `;

    parsedPreview.querySelectorAll("[data-parsed-index]").forEach((input) => {
      input.addEventListener("input", () => {
        const idx = Number(input.dataset.parsedIndex);
        currentParsed[idx].name = input.value;
      });
    });

    document.getElementById("confirm-add-btn").addEventListener("click", async () => {
      const statusEl = document.getElementById("add-parsed-status");
      const included = currentParsed.filter((_, i) => {
        const cb = parsedPreview.querySelector(`[data-parsed-include="${i}"]`);
        return cb ? cb.checked : true;
      });

      statusEl.textContent = "Saving…";
      try {
        for (const entry of included) {
          await Api.adminSubmitPicks(workingWeekId, entry.name.trim() || "Unnamed", entry.picks);
        }
        currentParsed = [];
        parsedPreview.innerHTML = "";
        pasteInput.value = "";
        await loadWorkingWeek();
        await loadPlayers();
      } catch (err) {
        statusEl.textContent = `Failed: ${err.message}`;
        statusEl.className = "field-hint field-hint--warn";
      }
    });
  }

  parseBtn.addEventListener("click", () => {
    const raw = pasteInput.value;
    if (!raw.trim()) return;
    currentParsed = League.parseMessages(raw, workingDetail.games);
    if (!currentParsed.length) {
      parsedPreview.innerHTML = `<p class="field-hint field-hint--warn">Couldn't find any "Team over Team" lines in that text. Make sure you pasted the message exactly as copied.</p>`;
      return;
    }
    renderParsedPreview();
  });

  /* ---------------------------------------------------------
     Submitted picks list
     --------------------------------------------------------- */

  function renderStagedPicks() {
    const picks = workingDetail.picks || [];
    stagedCountBadge.textContent = String(picks.length);

    if (!picks.length) {
      stagedPicksList.innerHTML = `<li class="staged-picks-list__empty">No one has picked this week yet.</li>`;
      return;
    }

    stagedPicksList.innerHTML = picks
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((entry) => {
        const count = Object.keys(entry.picks || {}).length;
        return `
          <li class="staged-picks-list__item">
            <span class="staged-picks-list__name">${escapeHtml(entry.name)}</span>
            <span class="staged-picks-list__count">${count}/${workingDetail.games.length} picks</span>
            <button class="link-btn staged-picks-list__remove" type="button" data-remove-name="${escapeHtml(entry.name)}">Remove</button>
          </li>
        `;
      })
      .join("");

    stagedPicksList.querySelectorAll("[data-remove-name]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const name = btn.dataset.removeName;
        const confirmed = window.confirm(`Remove ${name}'s picks from the scoreboard?`);
        if (!confirmed) return;
        await Api.deletePicks(workingWeekId, name);
        await loadWorkingWeek();
      });
    });
  }

  /* ---------------------------------------------------------
     Mark results
     --------------------------------------------------------- */

  const kickoffFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  function formatKickoff(iso) {
    try {
      return `${kickoffFormatter.format(new Date(iso))} ET`;
    } catch (err) {
      return "";
    }
  }

  function pickCountFor(gameId, side) {
    return (workingDetail.picks || []).filter((p) => p.picks && p.picks[gameId] === side).length;
  }

  function renderResults() {
    const games = workingDetail.games || [];
    const totalPicks = (workingDetail.picks || []).length;

    resultsList.innerHTML = games
      .map((game) => {
        const current = game.winnerSide;
        return `
          <fieldset class="result-card" data-game-id="${game.id}">
            <legend class="visually-hidden">${escapeHtml(game.away.name)} at ${escapeHtml(game.home.name)}, ${formatKickoff(game.kickoff)}</legend>
            <div class="game-card__legend" aria-hidden="true">
              <span class="game-card__matchup">${escapeHtml(game.away.name)} <span class="game-card__at" aria-hidden="true">@</span> ${escapeHtml(game.home.name)}</span>
              <span class="game-card__kickoff">${formatKickoff(game.kickoff)}</span>
            </div>
            <div class="result-card__options">
              <button type="button" class="result-option ${current === "away" ? "is-selected" : ""}" data-side="away" aria-pressed="${current === "away"}">
                ${escapeHtml(game.away.name)}
                ${totalPicks ? `<span class="result-option__hint">${pickCountFor(game.id, "away")}/${totalPicks} picked</span>` : ""}
              </button>
              <button type="button" class="result-option ${current === "home" ? "is-selected" : ""}" data-side="home" aria-pressed="${current === "home"}">
                ${escapeHtml(game.home.name)}
                ${totalPicks ? `<span class="result-option__hint">${pickCountFor(game.id, "home")}/${totalPicks} picked</span>` : ""}
              </button>
            </div>
            <p class="field-hint">${current ? `Source: ${game.resultSource === "espn" ? "auto-synced from ESPN" : "manually set"}` : "No result yet"}</p>
            ${current ? `<button type="button" class="link-btn" data-clear-game="${game.id}">Clear result</button>` : ""}
          </fieldset>
        `;
      })
      .join("");
  }

  resultsList.addEventListener("click", async (event) => {
    const optionBtn = event.target.closest(".result-option");
    const clearBtn = event.target.closest("[data-clear-game]");

    if (optionBtn) {
      const card = optionBtn.closest(".result-card");
      await Api.setResult(workingWeekId, card.dataset.gameId, optionBtn.dataset.side);
      await loadWorkingWeek();
      return;
    }

    if (clearBtn) {
      await Api.clearResult(workingWeekId, clearBtn.dataset.clearGame);
      await loadWorkingWeek();
    }
  });

  syncNowBtn.addEventListener("click", async () => {
    syncStatus.textContent = "Syncing…";
    syncStatus.className = "field-hint";
    try {
      const result = await Api.syncScores(workingWeekId);
      if (result.skippedNoEspnWeek) {
        syncStatus.textContent = "This week has no NFL week # set, so it can't auto-sync — mark results manually.";
        syncStatus.className = "field-hint field-hint--warn";
      } else {
        syncStatus.textContent = `Checked ${result.checked} game(s), updated ${result.updated}.`;
      }
      await loadWorkingWeek();
    } catch (err) {
      syncStatus.textContent = `Sync failed: ${err.message}`;
      syncStatus.className = "field-hint field-hint--warn";
    }
  });

  /* ---------------------------------------------------------
     Init
     --------------------------------------------------------- */

  if (Api.hasAdminToken()) {
    unlockAdmin();
  } else {
    passwordInput.focus();
  }
})();
