/**
 * NFL Pick'em — App Logic
 * --------------------------------
 * Fetches the currently-active week + its games from the API (js/api.js)
 * and drives three screens (name, picks, summary). The server is the real
 * source of truth: every pick autosaves the moment it's tapped (partial
 * is fine, no completion required), and changing a pick autosaves again.
 * "Share to Chat" is a secondary, optional bonus that also saves and then
 * produces a copyable group-chat message. localStorage is only a
 * per-device draft cache (namespaced by week id) so a refresh mid-pick
 * never loses progress.
 */

(function () {
  "use strict";

  /* ---------------------------------------------------------
     DOM references
     --------------------------------------------------------- */

  const loadingScreen = document.getElementById("loading-screen");
  const errorScreen = document.getElementById("error-screen");
  const errorMessage = document.getElementById("error-message");
  const retryBtn = document.getElementById("retry-btn");
  const noActiveWeekScreen = document.getElementById("no-active-week-screen");
  const nameScreen = document.getElementById("name-screen");
  const picksScreen = document.getElementById("picks-screen");
  const summaryScreen = document.getElementById("summary-screen");

  const weekTitle = document.getElementById("week-title");
  const picksWeekLabel = document.getElementById("picks-week-label");
  const weekSelect = document.getElementById("week-select");
  const syncBanner = document.getElementById("sync-banner");

  const playerPicker = document.getElementById("player-picker");
  const showNewNameBtn = document.getElementById("show-new-name-btn");
  const cancelNewNameBtn = document.getElementById("cancel-new-name-btn");
  const nameForm = document.getElementById("name-form");
  const nameInput = document.getElementById("name-input");
  const nameError = document.getElementById("name-error");
  const editNameBtn = document.getElementById("edit-name-btn");
  const greetingName = document.getElementById("greeting-name");

  const gamesList = document.getElementById("games-list");

  const progressRegion = document.getElementById("progress-bar-region");
  const progressFill = document.getElementById("progress-fill");
  const progressTrack = document.getElementById("progress-track");
  const progressLabel = document.getElementById("progress-label");
  const saveStatus = document.getElementById("save-status");
  const generateBtn = document.getElementById("generate-btn");

  const summaryOutput = document.getElementById("summary-output");
  const submitStatus = document.getElementById("submit-status");
  const copyBtn = document.getElementById("copy-btn");
  const copyBtnLabel = document.getElementById("copy-btn-label");
  const copyConfirm = document.getElementById("copy-confirm");
  const editPicksBtn = document.getElementById("edit-picks-btn");
  const resetBtn = document.getElementById("reset-btn");

  /* ---------------------------------------------------------
     State
     --------------------------------------------------------- */

  let week = null; // { id, label, ... }
  let games = []; // from the API
  let picks = {}; // { [gameId]: 'home' | 'away' }
  let playerName = "";
  let knownPlayers = []; // roster names from the API, for the picker
  let allWeeks = []; // every week that exists, for the "picking for" dropdown

  // The player's identity is the same across every week, so it gets one
  // global key. Picks are namespaced per week — switching weeks must only
  // reload the picks half, never re-read (and thereby clobber) the name.
  const NAME_STORAGE_KEY = "nfl-pickem:name";

  function picksStorageKey() {
    return `nfl-pickem:${week.id}:picks`;
  }

  function loadPlayerName() {
    try {
      playerName = localStorage.getItem(NAME_STORAGE_KEY) || "";
    } catch (err) {
      playerName = "";
    }
  }

  function savePlayerName() {
    try {
      localStorage.setItem(NAME_STORAGE_KEY, playerName);
    } catch (err) {
      /* ignore */
    }
  }

  function loadPicksDraft() {
    try {
      const raw = localStorage.getItem(picksStorageKey());
      picks = raw ? JSON.parse(raw) : {};
    } catch (err) {
      picks = {};
    }
  }

  function savePicksDraft() {
    try {
      localStorage.setItem(picksStorageKey(), JSON.stringify(picks));
    } catch (err) {
      /* ignore */
    }
  }

  /* ---------------------------------------------------------
     Formatting
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

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ---------------------------------------------------------
     Build the games list
     --------------------------------------------------------- */

  function isGameLocked(game) {
    return new Date(game.kickoff).getTime() <= Date.now();
  }

  function teamOptionMarkup(radioName, side, team, isChecked, isLocked) {
    const label = side === "away" ? "Away" : "Home";
    return `
      <label class="team-option ${isLocked ? "team-option--locked" : ""}" data-side="${side}">
        <input
          class="team-option__input"
          type="radio"
          name="${radioName}"
          value="${side}"
          ${isChecked ? "checked" : ""}
          ${isLocked ? "disabled" : ""}
        />
        <span class="team-option__content">
          <span class="team-option__tag">${label}</span>
          <span class="team-option__name">${escapeHtml(team.name)}</span>
          <span class="team-option__city">${escapeHtml(team.city)}</span>
          <span class="team-option__status">
            <span class="team-option__check" aria-hidden="true">&#10003;</span> Selected
          </span>
        </span>
      </label>
    `;
  }

  function gameCardMarkup(game) {
    const radioName = `game-${game.id}`;
    const pick = picks[game.id];
    const locked = isGameLocked(game);
    return `
      <li>
        <fieldset class="game-card ${locked ? "game-card--locked" : ""}" data-game-id="${game.id}">
          <legend class="visually-hidden">
            ${escapeHtml(game.away.name)} at ${escapeHtml(game.home.name)}, ${locked ? "locked, " : ""}${formatKickoff(game.kickoff)}${game.spread ? `, spread ${escapeHtml(game.spread)}` : ""}
          </legend>
          <div class="game-card__legend" aria-hidden="true">
            <span class="game-card__matchup">
              ${escapeHtml(game.away.name)} <span class="game-card__at" aria-hidden="true">@</span> ${escapeHtml(game.home.name)}
              ${game.spread ? `<span class="game-card__spread">${escapeHtml(game.spread)}</span>` : ""}
            </span>
            <span class="game-card__kickoff">
              ${locked ? `<span class="game-card__lock-badge">&#128274; Locked</span> &middot; ` : ""}${formatKickoff(game.kickoff)}
            </span>
          </div>
          <div class="game-card__teams">
            ${teamOptionMarkup(radioName, "away", game.away, pick === "away", locked)}
            ${teamOptionMarkup(radioName, "home", game.home, pick === "home", locked)}
          </div>
          ${locked && !pick ? `<p class="field-hint">This game already started &mdash; no pick was made.</p>` : ""}
        </fieldset>
      </li>
    `;
  }

  function buildGamesList() {
    gamesList.innerHTML = games.map(gameCardMarkup).join("");
  }

  /* ---------------------------------------------------------
     Progress + screen switching
     --------------------------------------------------------- */

  function pickedCount() {
    return games.reduce((count, game) => (picks[game.id] ? count + 1 : count), 0);
  }

  function updateProgress() {
    const total = games.length;
    const count = pickedCount();
    const pct = total ? Math.round((count / total) * 100) : 0;

    progressFill.style.width = `${pct}%`;
    progressTrack.setAttribute("aria-valuemax", String(total));
    progressTrack.setAttribute("aria-valuenow", String(count));
    progressLabel.textContent = `${count} / ${total} Picks Made`;

    // Sharing never requires finishing every game — it just needs at
    // least one pick.
    const hasAnyPicks = count > 0;
    generateBtn.disabled = !hasAnyPicks;
    generateBtn.setAttribute("aria-disabled", String(!hasAnyPicks));
  }

  const SCREENS = [
    "loading-screen",
    "error-screen",
    "no-active-week-screen",
    "name-screen",
    "picks-screen",
    "summary-screen",
  ];

  function showScreen(id) {
    SCREENS.forEach((screenId) => {
      const el = document.getElementById(screenId);
      if (el) el.hidden = screenId !== id;
    });
    progressRegion.hidden = id !== "picks-screen";
    window.scrollTo(0, 0);
  }

  /* ---------------------------------------------------------
     Boot: load the active week from the API
     --------------------------------------------------------- */

  async function boot() {
    showScreen("loading-screen");
    try {
      const weeks = await Api.getWeeks();
      if (!weeks.length) {
        showScreen("no-active-week-screen");
        return;
      }
      allWeeks = weeks;
      const current = weeks.find((w) => w.isCurrent) || weeks[weeks.length - 1];

      // Loaded before the week fetch (not after, as previously) so it can
      // be passed as the viewer identity — the API redacts everyone else's
      // not-yet-locked picks, but still needs to know who "you" are to
      // include your own.
      loadPlayerName();

      const [detail, players] = await Promise.all([Api.getWeek(current.id, playerName), Api.getPlayers()]);
      week = detail.week;
      games = detail.games;
      knownPlayers = players;

      weekTitle.innerHTML = `${escapeHtml(week.label)}<span class="app-header__title-accent">.</span>`;
      picksWeekLabel.textContent = week.label;
      renderWeekSelect();

      loadPicksDraft();

      // If this device has no local draft yet, but the server already has
      // picks under this player's saved name (e.g. they picked on another
      // device, or cleared storage), hydrate from the server instead of
      // starting blank.
      if (playerName && !Object.keys(picks).length) {
        const existing = detail.picks.find(
          (p) => p.name.trim().toLowerCase() === playerName.trim().toLowerCase()
        );
        if (existing) picks = { ...existing.picks };
      }

      buildGamesList();
      updateProgress();

      if (playerName) {
        nameInput.value = playerName;
        greetingName.textContent = playerName;
        showScreen("picks-screen");
      } else {
        renderPlayerPicker();
        showNamePickerView();
        showScreen("name-screen");
      }
    } catch (err) {
      errorMessage.textContent = err.message || "Check your connection and try again.";
      showScreen("error-screen");
    }
  }

  retryBtn.addEventListener("click", boot);

  /* ---------------------------------------------------------
     Week switcher — pick ahead for a future week, or revisit a past one
     --------------------------------------------------------- */

  function renderWeekSelect() {
    weekSelect.innerHTML = allWeeks
      .map(
        (w) => `<option value="${w.id}">${escapeHtml(w.label)}${w.isCurrent ? " (current)" : ""}</option>`
      )
      .join("");
    weekSelect.value = week.id;
  }

  async function switchWeek(weekId) {
    if (!weekId || weekId === week.id) return;
    const statusEl = document.getElementById("week-select-status");
    statusEl.textContent = "";

    try {
      const detail = await Api.getWeek(weekId, playerName);
      week = detail.week;
      games = detail.games;

      weekTitle.innerHTML = `${escapeHtml(week.label)}<span class="app-header__title-accent">.</span>`;
      picksWeekLabel.textContent = week.label;

      loadPicksDraft(); // playerName is intentionally left untouched here

      if (playerName && !Object.keys(picks).length) {
        const existing = detail.picks.find(
          (p) => p.name.trim().toLowerCase() === playerName.trim().toLowerCase()
        );
        if (existing) picks = { ...existing.picks };
      }

      buildGamesList();
      updateProgress();
      weekSelect.value = week.id;
      saveStatus.textContent = "";
    } catch (err) {
      statusEl.textContent = `Couldn't switch weeks: ${err.message}`;
      statusEl.className = "field-hint field-hint--warn";
      weekSelect.value = week.id; // snap back to whatever's actually loaded
    }
  }

  weekSelect.addEventListener("change", () => switchWeek(weekSelect.value));

  /* ---------------------------------------------------------
     Name screen: pick from the roster, or add a new name
     --------------------------------------------------------- */

  function renderPlayerPicker() {
    if (!knownPlayers.length) {
      playerPicker.innerHTML = "";
      return;
    }
    playerPicker.innerHTML = knownPlayers
      .map(
        (name) => `
        <button type="button" class="player-option" data-player-name="${escapeHtml(name)}">
          <span class="player-option__avatar" aria-hidden="true">${escapeHtml(name.trim()[0] || "?").toUpperCase()}</span>
          <span>${escapeHtml(name)}</span>
        </button>
      `
      )
      .join("");

    playerPicker.querySelectorAll("[data-player-name]").forEach((btn) => {
      btn.addEventListener("click", () => selectPlayer(btn.dataset.playerName));
    });
  }

  // Resets the name screen back to its default view (roster list + "not on
  // this list" link, or straight to the form if there's no roster yet).
  function showNamePickerView() {
    const nameScreenIntro = document.getElementById("name-screen-intro");
    if (knownPlayers.length) {
      playerPicker.hidden = false;
      showNewNameBtn.hidden = false;
      nameForm.hidden = true;
      nameScreenIntro.textContent = "Tap your name, or add yourself if you're new here.";
    } else {
      playerPicker.hidden = true;
      showNewNameBtn.hidden = true;
      nameForm.hidden = false;
      nameScreenIntro.textContent = "No one's picked yet this week — be the first!";
    }
  }

  async function selectPlayer(name) {
    const isSameAsCurrentDraft = playerName && playerName.trim().toLowerCase() === name.trim().toLowerCase();
    playerName = name;
    savePlayerName();

    if (!isSameAsCurrentDraft) {
      // Switching to a different identity on this device (e.g. handing the
      // phone to a friend, or picking from the roster after someone else
      // used this browser) — load whatever's already on the server for
      // them instead of carrying over the previous person's in-progress
      // picks.
      try {
        const fresh = await Api.getWeek(week.id, name);
        const existing = fresh.picks.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase());
        picks = existing ? { ...existing.picks } : {};
      } catch (err) {
        picks = {};
      }
      savePicksDraft();
    }

    greetingName.textContent = playerName;
    buildGamesList();
    updateProgress();
    showScreen("picks-screen");
  }

  showNewNameBtn.addEventListener("click", () => {
    playerPicker.hidden = true;
    showNewNameBtn.hidden = true;
    nameForm.hidden = false;
    nameInput.value = "";
    window.requestAnimationFrame(() => nameInput.focus());
  });

  cancelNewNameBtn.addEventListener("click", () => {
    nameError.hidden = true;
    showNamePickerView();
  });

  nameForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const value = nameInput.value.trim();

    if (!value) {
      nameError.hidden = false;
      nameInput.setAttribute("aria-invalid", "true");
      nameInput.focus();
      return;
    }

    nameError.hidden = true;
    nameInput.removeAttribute("aria-invalid");
    await selectPlayer(value);
  });

  nameInput.addEventListener("input", () => {
    if (!nameError.hidden && nameInput.value.trim()) {
      nameError.hidden = true;
      nameInput.removeAttribute("aria-invalid");
    }
  });

  editNameBtn.addEventListener("click", () => {
    renderPlayerPicker();
    showNamePickerView();
    showScreen("name-screen");
  });

  /* ---------------------------------------------------------
     Picks screen
     --------------------------------------------------------- */

  gamesList.addEventListener("change", (event) => {
    const input = event.target;
    if (!input.classList || !input.classList.contains("team-option__input")) return;

    const card = input.closest(".game-card");
    if (!card) return;

    const gameId = card.dataset.gameId;
    picks[gameId] = input.value;
    savePicksDraft();
    updateProgress();
    autosave(gameId);
  });

  // Used by Generate — saves whatever's currently in `picks` (partial is
  // fine) and describes what actually happened, since some entries may
  // have been dropped for games that started in between.
  async function persistPicksAndDescribe(verb) {
    const result = await Api.submitPicks(week.id, playerName, picks);
    if (result.locked > 0 && result.saved === 0) {
      return "Those picks were already locked in — nothing new to save.";
    }
    const countPhrase = `${result.saved} pick${result.saved === 1 ? "" : "s"}`;
    if (result.locked > 0) {
      return `✓ ${verb} ${countPhrase} to the scoreboard. (${result.locked} game${result.locked === 1 ? "" : "s"} already started, so ${result.locked === 1 ? "it wasn't" : "they weren't"} changed.)`;
    }
    return `✓ ${verb} ${countPhrase} to the scoreboard.`;
  }

  // Every tap saves the full current `picks` (not just the tapped game),
  // so a pick that failed to save earlier gets retried on the next tap.
  // Saves run one at a time: taps that land mid-request just flag that
  // another round is needed, so fast pick changes can't race each other
  // and leave an older choice as the last write on the server.
  let autosaveInFlight = false;
  let autosaveQueued = false;
  let autosaveLastGameId = null;
  let autosaveRetryTimeout = null;

  async function autosave(gameId) {
    autosaveLastGameId = gameId;
    if (autosaveInFlight) {
      autosaveQueued = true;
      return;
    }
    autosaveInFlight = true;
    window.clearTimeout(autosaveRetryTimeout);
    saveStatus.textContent = "Saving…";
    saveStatus.className = "field-hint";
    try {
      let result;
      do {
        autosaveQueued = false;
        result = await Api.submitPicks(week.id, playerName, picks);
      } while (autosaveQueued);

      // Earlier picks on already-started games ride along in `picks` and
      // get skipped by the server every time — only worth mentioning when
      // the game just tapped is one of them (kickoff passed while the page
      // sat open).
      if (result.lockedGameIds && result.lockedGameIds.includes(autosaveLastGameId)) {
        saveStatus.textContent = "That game already kicked off, so that pick couldn't be changed.";
        saveStatus.className = "field-hint field-hint--warn";
      } else {
        saveStatus.textContent = "✓ Saved";
      }
    } catch (err) {
      saveStatus.textContent = `Couldn't save (${err.message}). Your picks are still on this device — retrying…`;
      saveStatus.className = "field-hint field-hint--warn";
      window.clearTimeout(autosaveRetryTimeout);
      autosaveRetryTimeout = window.setTimeout(() => autosave(autosaveLastGameId), 10000);
    } finally {
      autosaveInFlight = false;
    }
  }

  generateBtn.addEventListener("click", async () => {
    if (pickedCount() === 0) return;

    summaryOutput.textContent = buildSummaryText();
    submitStatus.textContent = "Saving your picks…";
    submitStatus.className = "field-hint";
    showScreen("summary-screen");

    try {
      submitStatus.textContent = await persistPicksAndDescribe("Synced");
    } catch (err) {
      submitStatus.textContent = `Couldn't sync automatically (${err.message}). Copy your picks below and send them to the commissioner just in case.`;
      submitStatus.className = "field-hint field-hint--warn";
    }
  });

  /* ---------------------------------------------------------
     Summary screen
     --------------------------------------------------------- */

  function buildSummaryText() {
    const header = `🏈 ${League.possessiveName(playerName)} ${week.label.toUpperCase()} PICKS`;
    const lines = games
      .map((game) => {
        const pick = picks[game.id];
        if (!pick) return null;
        const winner = pick === "home" ? game.home.name : game.away.name;
        const loser = pick === "home" ? game.away.name : game.home.name;
        return `${winner} over ${loser}`;
      })
      .filter(Boolean);
    const footer =
      lines.length === games.length
        ? `🔒 LOCKED IN — ${lines.length}/${games.length}`
        : `📝 ${lines.length}/${games.length} SO FAR — MORE COMING`;

    return [header, "", ...lines, "", footer].join("\n");
  }

  let copyConfirmTimeout = null;

  function flashCopyConfirm(message) {
    copyConfirm.textContent = message;
    copyConfirm.classList.add("is-visible");
    if (copyConfirmTimeout) window.clearTimeout(copyConfirmTimeout);
    copyConfirmTimeout = window.setTimeout(() => {
      copyConfirm.classList.remove("is-visible");
    }, 2500);
  }

  function fallbackCopy(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    textarea.style.left = "-1000px";
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    let succeeded = false;
    try {
      succeeded = document.execCommand("copy");
    } catch (err) {
      succeeded = false;
    }
    document.body.removeChild(textarea);
    return succeeded;
  }

  copyBtn.addEventListener("click", async () => {
    const text = summaryOutput.textContent;
    let succeeded = false;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        succeeded = true;
      }
    } catch (err) {
      succeeded = false;
    }

    if (!succeeded) {
      succeeded = fallbackCopy(text);
    }

    if (succeeded) {
      copyBtnLabel.textContent = "Copied ✓";
      flashCopyConfirm("Copied to clipboard. Paste it into the group chat!");
      window.setTimeout(() => {
        copyBtnLabel.textContent = "Copy Picks";
      }, 2000);
    } else {
      flashCopyConfirm("Couldn't auto-copy — select the text above and copy manually.");
    }
  });

  editPicksBtn.addEventListener("click", () => {
    showScreen("picks-screen");
  });

  resetBtn.addEventListener("click", () => {
    const confirmed = window.confirm(
      "Start over? This clears your name and picks on this device (it won't remove anything already submitted to the scoreboard)."
    );
    if (!confirmed) return;

    try {
      localStorage.removeItem(NAME_STORAGE_KEY);
      localStorage.removeItem(picksStorageKey());
    } catch (err) {
      /* ignore */
    }

    window.clearTimeout(autosaveRetryTimeout);
    playerName = "";
    picks = {};
    nameInput.value = "";
    nameError.hidden = true;
    saveStatus.textContent = "";
    buildGamesList();
    updateProgress();
    showNamePickerView();
    showScreen("name-screen");
  });

  boot();
})();
