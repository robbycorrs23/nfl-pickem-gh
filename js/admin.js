/**
 * NFL Week 1 Pick'em — Commissioner (admin) page logic
 * Depends on GAMES (js/games.js) and League (js/league.js).
 *
 * IMPORTANT: this is a static site with no server. The password gate below
 * is a light deterrent for casual friends, NOT real security — the hash is
 * sitting right here in this file. Don't use it to protect anything
 * sensitive. The GitHub token you paste in is stored only in your own
 * browser's localStorage and is only ever sent to api.github.com.
 */

(function () {
  "use strict";

  const REPO = "robbycorrs23/nfl-pickem-gh";
  const FILE_PATH = "data/league-data.json";
  const API_URL = `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`;

  // SHA-256 of the admin password. Generated once; see README for how to
  // rotate it if you want a different password.
  const ADMIN_PASSWORD_HASH =
    "55e0c8b461a54a895322cbfa2c09e9d1117a2c5175efbf6b396fe03b3692c621";

  const AUTH_SESSION_KEY = "nfl-pickem:admin-authed";
  const TOKEN_STORAGE_KEY = "nfl-pickem:admin-gh-token";
  const DRAFT_STORAGE_KEY = "nfl-pickem:admin-draft";

  /* ---------------------------------------------------------
     DOM references
     --------------------------------------------------------- */

  const authGate = document.getElementById("auth-gate");
  const adminContent = document.getElementById("admin-content");
  const authForm = document.getElementById("auth-form");
  const passwordInput = document.getElementById("password-input");
  const authError = document.getElementById("auth-error");
  const lockBtn = document.getElementById("lock-btn");

  const draftBanner = document.getElementById("draft-banner");
  const discardDraftBtn = document.getElementById("discard-draft-btn");

  const tokenInput = document.getElementById("token-input");
  const saveTokenBtn = document.getElementById("save-token-btn");
  const forgetTokenBtn = document.getElementById("forget-token-btn");
  const tokenStatus = document.getElementById("token-status");

  const pasteInput = document.getElementById("paste-input");
  const parseBtn = document.getElementById("parse-btn");
  const parsedPreview = document.getElementById("parsed-preview");

  const stagedCountBadge = document.getElementById("staged-count-badge");
  const stagedPicksList = document.getElementById("staged-picks-list");

  const resultsList = document.getElementById("results-list");

  const publishBtn = document.getElementById("publish-btn");
  const publishStatus = document.getElementById("publish-status");

  /* ---------------------------------------------------------
     Working state
     --------------------------------------------------------- */

  let adminState = { picks: [], results: {} };
  let hasUnpublishedDraft = false;
  let lastKnownSha = null; // sha of the file as last fetched, for conflict-free writes
  let currentParsed = []; // pending parsed preview entries

  function saveDraft() {
    hasUnpublishedDraft = true;
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(adminState));
    } catch (err) {
      /* ignore */
    }
    draftBanner.hidden = false;
  }

  function clearDraftFlag() {
    hasUnpublishedDraft = false;
    try {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch (err) {
      /* ignore */
    }
    draftBanner.hidden = true;
  }

  async function initState() {
    let draft = null;
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (raw) draft = JSON.parse(raw);
    } catch (err) {
      draft = null;
    }

    if (draft && (draft.picks || draft.results)) {
      adminState = { picks: draft.picks || [], results: draft.results || {} };
      hasUnpublishedDraft = true;
      draftBanner.hidden = false;
    } else {
      const live = await League.load();
      adminState = { picks: live.picks, results: live.results };
    }

    renderStagedPicks();
    renderResults();
  }

  /* ---------------------------------------------------------
     Password gate
     --------------------------------------------------------- */

  async function sha256Hex(text) {
    const encoded = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function unlockAdmin() {
    authGate.hidden = true;
    adminContent.hidden = false;
    initState();
    loadSavedToken();
  }

  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const value = passwordInput.value;
    const hash = await sha256Hex(value);
    if (hash === ADMIN_PASSWORD_HASH) {
      authError.hidden = true;
      try {
        sessionStorage.setItem(AUTH_SESSION_KEY, "1");
      } catch (err) {
        /* ignore */
      }
      passwordInput.value = "";
      unlockAdmin();
    } else {
      authError.hidden = false;
      passwordInput.focus();
      passwordInput.select();
    }
  });

  lockBtn.addEventListener("click", () => {
    try {
      sessionStorage.removeItem(AUTH_SESSION_KEY);
    } catch (err) {
      /* ignore */
    }
    adminContent.hidden = true;
    authGate.hidden = false;
    passwordInput.focus();
  });

  /* ---------------------------------------------------------
     Token management
     --------------------------------------------------------- */

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_STORAGE_KEY) || "";
    } catch (err) {
      return "";
    }
  }

  function loadSavedToken() {
    const token = getToken();
    tokenStatus.textContent = token
      ? "Token saved on this device."
      : "No token saved on this device.";
  }

  saveTokenBtn.addEventListener("click", () => {
    const value = tokenInput.value.trim();
    if (!value) {
      tokenStatus.textContent = "Paste a token above first.";
      return;
    }
    try {
      localStorage.setItem(TOKEN_STORAGE_KEY, value);
    } catch (err) {
      /* ignore */
    }
    tokenInput.value = "";
    tokenStatus.textContent = "Token saved on this device.";
  });

  forgetTokenBtn.addEventListener("click", () => {
    try {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch (err) {
      /* ignore */
    }
    tokenStatus.textContent = "No token saved on this device.";
  });

  /* ---------------------------------------------------------
     Draft banner
     --------------------------------------------------------- */

  discardDraftBtn.addEventListener("click", async () => {
    const confirmed = window.confirm(
      "Discard your unpublished local changes and reload the currently published picks and results?"
    );
    if (!confirmed) return;
    clearDraftFlag();
    const live = await League.load();
    adminState = { picks: live.picks, results: live.results };
    renderStagedPicks();
    renderResults();
  });

  /* ---------------------------------------------------------
     Import / parse picks
     --------------------------------------------------------- */

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

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
            <p class="field-hint ${entry.parsedCount < GAMES.length ? "field-hint--warn" : ""}">
              ${entry.parsedCount} / ${GAMES.length} games parsed${entry.parsedCount < GAMES.length ? " — double check the pasted text" : ""}
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
      <button class="btn btn--primary btn--block" id="confirm-add-btn" type="button">Add Selected to Staged Picks</button>
    `;

    parsedPreview.querySelectorAll("[data-parsed-index]").forEach((input) => {
      input.addEventListener("input", () => {
        const idx = Number(input.dataset.parsedIndex);
        currentParsed[idx].name = input.value;
      });
    });

    document.getElementById("confirm-add-btn").addEventListener("click", () => {
      const included = currentParsed.filter((_, i) => {
        const cb = parsedPreview.querySelector(`[data-parsed-include="${i}"]`);
        return cb ? cb.checked : true;
      });
      addParsedEntriesToStaged(included);
      currentParsed = [];
      parsedPreview.innerHTML = "";
      pasteInput.value = "";
    });
  }

  parseBtn.addEventListener("click", () => {
    const raw = pasteInput.value;
    if (!raw.trim()) return;
    currentParsed = League.parseMessages(raw);
    if (!currentParsed.length) {
      parsedPreview.innerHTML = `<p class="field-hint field-hint--warn">Couldn't find any "Team over Team" lines in that text. Make sure you pasted the message exactly as copied.</p>`;
      return;
    }
    renderParsedPreview();
  });

  function addParsedEntriesToStaged(entries) {
    entries.forEach((entry) => {
      const name = entry.name.trim() || "Unnamed";
      const existingIndex = adminState.picks.findIndex(
        (p) => p.name.trim().toLowerCase() === name.toLowerCase()
      );
      if (existingIndex >= 0) {
        adminState.picks[existingIndex] = { name, picks: entry.picks };
      } else {
        adminState.picks.push({ name, picks: entry.picks });
      }
    });
    saveDraft();
    renderStagedPicks();
  }

  /* ---------------------------------------------------------
     Staged picks list
     --------------------------------------------------------- */

  function renderStagedPicks() {
    stagedCountBadge.textContent = String(adminState.picks.length);

    if (!adminState.picks.length) {
      stagedPicksList.innerHTML = `<li class="staged-picks-list__empty">No one added yet — paste picks above.</li>`;
      return;
    }

    stagedPicksList.innerHTML = adminState.picks
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((entry) => {
        const count = Object.keys(entry.picks || {}).length;
        return `
          <li class="staged-picks-list__item">
            <span class="staged-picks-list__name">${escapeHtml(entry.name)}</span>
            <span class="staged-picks-list__count">${count}/${GAMES.length} picks</span>
            <button class="link-btn staged-picks-list__remove" type="button" data-remove-name="${escapeHtml(entry.name)}">Remove</button>
          </li>
        `;
      })
      .join("");

    stagedPicksList.querySelectorAll("[data-remove-name]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const name = btn.dataset.removeName;
        const confirmed = window.confirm(`Remove ${name} from the staged picks list?`);
        if (!confirmed) return;
        adminState.picks = adminState.picks.filter((p) => p.name !== name);
        saveDraft();
        renderStagedPicks();
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
    return adminState.picks.filter((p) => p.picks && p.picks[gameId] === side).length;
  }

  function renderResults() {
    resultsList.innerHTML = GAMES.map((game) => {
      const current = adminState.results[game.id];
      const totalPicks = adminState.picks.length;

      return `
        <fieldset class="result-card" data-game-id="${game.id}">
          <legend class="game-card__legend">
            <span class="game-card__matchup">${escapeHtml(game.away.name)} <span class="game-card__at" aria-hidden="true">@</span> ${escapeHtml(game.home.name)}</span>
            <span class="game-card__kickoff">${formatKickoff(game.kickoff)}</span>
          </legend>
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
          ${current ? `<button type="button" class="link-btn" data-clear-game="${game.id}">Clear result</button>` : ""}
        </fieldset>
      `;
    }).join("");
  }

  resultsList.addEventListener("click", (event) => {
    const optionBtn = event.target.closest(".result-option");
    const clearBtn = event.target.closest("[data-clear-game]");

    if (optionBtn) {
      const card = optionBtn.closest(".result-card");
      const gameId = card.dataset.gameId;
      adminState.results[gameId] = optionBtn.dataset.side;
      saveDraft();
      renderResults();
      return;
    }

    if (clearBtn) {
      const gameId = clearBtn.dataset.clearGame;
      delete adminState.results[gameId];
      saveDraft();
      renderResults();
    }
  });

  /* ---------------------------------------------------------
     Publish to GitHub
     --------------------------------------------------------- */

  function b64EncodeUnicode(str) {
    return btoa(
      encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) =>
        String.fromCharCode(parseInt(p1, 16))
      )
    );
  }

  function b64DecodeUnicode(str) {
    return decodeURIComponent(
      Array.prototype.map
        .call(atob(str), (c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
  }

  async function githubGetFile(token) {
    const res = await fetch(API_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });
    if (res.status === 404) return { sha: null };
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || `GitHub read failed (${res.status})`);
    }
    const json = await res.json();
    return { sha: json.sha };
  }

  async function githubPutFile(token, sha, dataObj) {
    const content = b64EncodeUnicode(JSON.stringify(dataObj, null, 2) + "\n");
    const body = {
      message: `Update league data — ${new Date().toISOString()}`,
      content,
      branch: "main",
    };
    if (sha) body.sha = sha;

    const res = await fetch(API_URL, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.message || `GitHub publish failed (${res.status})`);
    }
    return res.json();
  }

  function setPublishStatus(message, kind) {
    publishStatus.textContent = message;
    publishStatus.className = `publish-status ${kind ? `publish-status--${kind}` : ""}`;
  }

  publishBtn.addEventListener("click", async () => {
    const token = getToken();
    if (!token) {
      setPublishStatus("Add and save a GitHub token above first.", "error");
      return;
    }

    publishBtn.disabled = true;
    setPublishStatus("Publishing…", "loading");

    try {
      const { sha } = await githubGetFile(token);
      await githubPutFile(token, sha, {
        picks: adminState.picks,
        results: adminState.results,
      });
      clearDraftFlag();
      setPublishStatus(
        "Published! The live scoreboard will update in about a minute once GitHub Pages rebuilds.",
        "success"
      );
    } catch (err) {
      setPublishStatus(`Publish failed: ${err.message}`, "error");
    } finally {
      publishBtn.disabled = false;
    }
  });

  /* ---------------------------------------------------------
     Init
     --------------------------------------------------------- */

  function init() {
    let authed = false;
    try {
      authed = sessionStorage.getItem(AUTH_SESSION_KEY) === "1";
    } catch (err) {
      authed = false;
    }

    if (authed) {
      unlockAdmin();
    } else {
      passwordInput.focus();
    }
  }

  init();
})();
