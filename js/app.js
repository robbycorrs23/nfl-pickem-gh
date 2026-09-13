/**
 * NFL Week 1 Pick'em — App Logic
 * --------------------------------
 * No frameworks, no build step, no dependencies. Reads game data from
 * GAMES (js/games.js) and drives three screens: name entry, picks,
 * and the shareable summary. State (name + picks) is persisted to
 * localStorage so an accidental refresh never loses progress.
 */

(function () {
  "use strict";

  const STORAGE_KEY = "nfl-pickem:week1-2026";
  const TOTAL_GAMES = GAMES.length;

  /* ---------------------------------------------------------
     State
     --------------------------------------------------------- */

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { name: "", picks: {} };
      const parsed = JSON.parse(raw);
      return {
        name: typeof parsed.name === "string" ? parsed.name : "",
        picks: parsed.picks && typeof parsed.picks === "object" ? parsed.picks : {},
      };
    } catch (err) {
      return { name: "", picks: {} };
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      /* localStorage unavailable (private mode / storage full) — app still
         works for the current session, it just won't persist. */
    }
  }

  let state = loadState();

  /* ---------------------------------------------------------
     DOM references
     --------------------------------------------------------- */

  const nameScreen = document.getElementById("name-screen");
  const picksScreen = document.getElementById("picks-screen");
  const summaryScreen = document.getElementById("summary-screen");

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
  const generateBtn = document.getElementById("generate-btn");

  const summaryOutput = document.getElementById("summary-output");
  const copyBtn = document.getElementById("copy-btn");
  const copyBtnLabel = document.getElementById("copy-btn-label");
  const copyConfirm = document.getElementById("copy-confirm");
  const editPicksBtn = document.getElementById("edit-picks-btn");
  const resetBtn = document.getElementById("reset-btn");

  /* ---------------------------------------------------------
     Formatting helpers
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

  function possessiveName(rawName) {
    const upper = rawName.trim().toUpperCase();
    if (!upper) return "MY";
    return upper.endsWith("S") ? `${upper}'` : `${upper}'S`;
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ---------------------------------------------------------
     Build the games list (once)
     --------------------------------------------------------- */

  function teamOptionMarkup(radioName, side, team, isChecked) {
    const label = side === "away" ? "Away" : "Home";
    return `
      <label class="team-option" data-side="${side}">
        <input
          class="team-option__input"
          type="radio"
          name="${radioName}"
          value="${side}"
          ${isChecked ? "checked" : ""}
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
    const pick = state.picks[game.id];
    return `
      <li>
        <fieldset class="game-card" data-game-id="${game.id}">
          <legend class="game-card__legend">
            <span class="game-card__matchup">
              ${escapeHtml(game.away.name)} <span class="game-card__at" aria-hidden="true">@</span> ${escapeHtml(game.home.name)}
            </span>
            <span class="game-card__kickoff">${formatKickoff(game.kickoff)}</span>
          </legend>
          <div class="game-card__teams">
            ${teamOptionMarkup(radioName, "away", game.away, pick === "away")}
            ${teamOptionMarkup(radioName, "home", game.home, pick === "home")}
          </div>
        </fieldset>
      </li>
    `;
  }

  function buildGamesList() {
    gamesList.innerHTML = GAMES.map(gameCardMarkup).join("");
  }

  /* ---------------------------------------------------------
     Progress + screen switching
     --------------------------------------------------------- */

  function pickedCount() {
    return GAMES.reduce((count, game) => (state.picks[game.id] ? count + 1 : count), 0);
  }

  function updateProgress() {
    const count = pickedCount();
    const pct = Math.round((count / TOTAL_GAMES) * 100);

    progressFill.style.width = `${pct}%`;
    progressTrack.setAttribute("aria-valuenow", String(count));
    progressLabel.textContent = `${count} / ${TOTAL_GAMES} Picks Made`;

    const complete = count === TOTAL_GAMES;
    generateBtn.disabled = !complete;
    generateBtn.setAttribute("aria-disabled", String(!complete));
    generateBtn.textContent = complete
      ? "Generate My Picks"
      : `Generate My Picks (${TOTAL_GAMES - count} left)`;
  }

  function showScreen(id) {
    [nameScreen, picksScreen, summaryScreen].forEach((el) => {
      el.hidden = el.id !== id;
    });
    progressRegion.hidden = id !== "picks-screen";
    window.scrollTo(0, 0);
  }

  /* ---------------------------------------------------------
     Name screen
     --------------------------------------------------------- */

  nameForm.addEventListener("submit", (event) => {
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

    state.name = value;
    saveState();
    greetingName.textContent = state.name;
    updateProgress();
    showScreen("picks-screen");
  });

  nameInput.addEventListener("input", () => {
    if (!nameError.hidden && nameInput.value.trim()) {
      nameError.hidden = true;
      nameInput.removeAttribute("aria-invalid");
    }
  });

  editNameBtn.addEventListener("click", () => {
    nameInput.value = state.name;
    showScreen("name-screen");
    window.requestAnimationFrame(() => nameInput.focus());
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
    state.picks[gameId] = input.value;
    saveState();
    updateProgress();
  });

  generateBtn.addEventListener("click", () => {
    if (pickedCount() < TOTAL_GAMES) return;
    summaryOutput.textContent = buildSummaryText();
    showScreen("summary-screen");
  });

  /* ---------------------------------------------------------
     Summary screen
     --------------------------------------------------------- */

  function buildSummaryText() {
    const header = `🏈 ${possessiveName(state.name)} WEEK 1 PICKS`;
    const lines = GAMES.map((game) => {
      const pick = state.picks[game.id];
      if (!pick) return null;
      const winner = pick === "home" ? game.home.name : game.away.name;
      const loser = pick === "home" ? game.away.name : game.home.name;
      return `${winner} over ${loser}`;
    }).filter(Boolean);
    const footer = `🔒 LOCKED IN — ${lines.length}/${TOTAL_GAMES}`;

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
      "Start over? This clears your name and all 14 picks on this device."
    );
    if (!confirmed) return;

    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      /* ignore */
    }

    state = { name: "", picks: {} };
    nameInput.value = "";
    nameError.hidden = true;
    buildGamesList();
    updateProgress();
    showScreen("name-screen");
    window.requestAnimationFrame(() => nameInput.focus());
  });

  /* ---------------------------------------------------------
     Init
     --------------------------------------------------------- */

  function init() {
    buildGamesList();
    updateProgress();

    if (state.name) {
      nameInput.value = state.name;
      greetingName.textContent = state.name;
      showScreen("picks-screen");
    } else {
      showScreen("name-screen");
    }
  }

  init();
})();
