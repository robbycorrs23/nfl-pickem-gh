/**
 * NFL Week 1 Pick'em — API client
 * Thin wrapper around fetch() for the Express + Postgres backend at
 * nfl.similollc.com. No third-party libraries.
 */

const Api = (function () {
  "use strict";

  const BASE = "https://nfl.similollc.com/api";
  const ADMIN_TOKEN_KEY = "nfl-pickem:admin-token";

  async function request(path, { method = "GET", body, token, auth } = {}) {
    const headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const authToken = token || (auth ? getAdminToken() : null);
    if (authToken) headers.Authorization = `Bearer ${authToken}`;

    let res;
    try {
      res = await fetch(`${BASE}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw new Error("Network error — check your connection and try again.");
    }

    let data = null;
    try {
      data = await res.json();
    } catch (err) {
      /* empty body is fine */
    }

    if (!res.ok) {
      throw new Error((data && data.error) || `Request failed (${res.status})`);
    }
    return data;
  }

  function getAdminToken() {
    try {
      return localStorage.getItem(ADMIN_TOKEN_KEY) || "";
    } catch (err) {
      return "";
    }
  }

  function setAdminToken(token) {
    try {
      localStorage.setItem(ADMIN_TOKEN_KEY, token);
    } catch (err) {
      /* ignore */
    }
  }

  function clearAdminToken() {
    try {
      localStorage.removeItem(ADMIN_TOKEN_KEY);
    } catch (err) {
      /* ignore */
    }
  }

  return {
    // Public reads
    getWeeks: () => request("/weeks"),
    getWeek: (weekId) => request(`/weeks/${encodeURIComponent(weekId)}`),

    // Public write
    submitPicks: (weekId, name, picks) =>
      request(`/weeks/${encodeURIComponent(weekId)}/picks`, { method: "POST", body: { name, picks } }),

    // Admin auth
    adminLogin: async (password) => {
      const { token } = await request("/admin/login", { method: "POST", body: { password } });
      setAdminToken(token);
      return token;
    },
    hasAdminToken: () => Boolean(getAdminToken()),
    logoutAdmin: clearAdminToken,

    // Admin writes (all require a saved admin token)
    getEspnSchedule: (espnWeek, season, seasonType) =>
      request(
        `/weeks/espn-schedule?week=${encodeURIComponent(espnWeek)}&season=${encodeURIComponent(season)}&seasontype=${encodeURIComponent(seasonType || 2)}`,
        { auth: true }
      ),
    createWeek: (payload) => request("/weeks", { method: "POST", body: payload, auth: true }),
    activateWeek: (weekId) => request(`/weeks/${encodeURIComponent(weekId)}/activate`, { method: "POST", auth: true }),
    addGame: (weekId, game) =>
      request(`/weeks/${encodeURIComponent(weekId)}/games`, { method: "POST", body: game, auth: true }),
    deleteGame: (weekId, gameId) =>
      request(`/weeks/${encodeURIComponent(weekId)}/games/${encodeURIComponent(gameId)}`, {
        method: "DELETE",
        auth: true,
      }),
    setResult: (weekId, gameId, winnerSide) =>
      request(`/weeks/${encodeURIComponent(weekId)}/games/${encodeURIComponent(gameId)}/result`, {
        method: "PUT",
        body: { winnerSide },
        auth: true,
      }),
    clearResult: (weekId, gameId) =>
      request(`/weeks/${encodeURIComponent(weekId)}/games/${encodeURIComponent(gameId)}/result`, {
        method: "DELETE",
        auth: true,
      }),
    syncScores: (weekId) =>
      request(`/weeks/${encodeURIComponent(weekId)}/sync-scores`, { method: "POST", auth: true }),
    deletePicks: (weekId, playerName) =>
      request(`/weeks/${encodeURIComponent(weekId)}/picks/${encodeURIComponent(playerName)}`, {
        method: "DELETE",
        auth: true,
      }),

    // Players (the league roster)
    getPlayers: () => request("/players"),
    deletePlayer: (name) => request(`/players/${encodeURIComponent(name)}`, { method: "DELETE", auth: true }),
  };
})();
