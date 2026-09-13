# NFL Week 1 Pick'em

A tiny, dependency-free, mobile-first pick'em app for picking winners in the
14 remaining NFL Week 1 games (Sept 13–14, 2026), sharing picks into a group
chat, and tracking a live scoreboard. No backend, no database, no login
system, no build step, no third-party libraries — just static HTML/CSS/JS
hosted on GitHub Pages. The one exception: the commissioner's admin page
calls GitHub's REST API directly from the browser to publish scoreboard
data, using a personal access token the commissioner supplies (see below).

**Live app:** `https://robbycorrs23.github.io/nfl-pickem-gh/`
**Scoreboard:** `https://robbycorrs23.github.io/nfl-pickem-gh/scoreboard.html`
**Commissioner admin:** `https://robbycorrs23.github.io/nfl-pickem-gh/admin.html`

## How it works (for friends)

1. Enter your name.
2. Pick a winner for each of the 14 games (big, tappable team buttons).
3. Once all 14 are picked, tap **Generate My Picks** to get a clean,
   group-chat-ready message like:

   ```
   🏈 ROB'S WEEK 1 PICKS

   Bears over Panthers
   Ravens over Colts
   ...

   🔒 LOCKED IN — 14/14
   ```

4. Tap **Copy Picks** and paste it into the chat.

Your name and picks are saved to `localStorage` on your device, so an
accidental refresh won't wipe your progress. Nothing is ever sent anywhere —
everything happens in your browser until you paste it into the chat
yourself.

## Scoreboard

`scoreboard.html` reads `data/league-data.json` (published by the
commissioner via the admin page) and shows:

- A leaderboard ranked by correct picks, with tie handling.
- A "games final" progress indicator.
- A collapsible, game-by-game breakdown of who picked what and who got it
  right, once the commissioner marks a result.

It's read-only and has no password — anyone with the link can view it.

## Commissioner admin page

`admin.html` is where you (the commissioner) import everyone's picks and
mark game results so the scoreboard can score them.

1. **Unlock it** with the admin password (see below — this is a light
   deterrent for casual friends, not real security; don't use it for
   anything sensitive).
2. **Connect a GitHub token** — a fine-grained personal access token scoped
   only to this repo, with **Contents: Read and write** permission. Full
   step-by-step instructions are inline on the page. The token is stored
   only in your browser's `localStorage` and is only ever sent to
   `api.github.com`.
3. **Import picks** — paste the exact "Generate My Picks" messages your
   friends send in the group chat (you can paste several at once). The page
   parses each one into a name + 14 picks, lets you fix any name casing,
   and adds them to the staged list. Pasting a message for a name that's
   already staged overwrites that person's picks (handy for corrections).
4. **Mark results** — tap the winner for each game as it finishes. Each
   button shows how many staged friends picked that team, as a gut check.
5. **Publish** — writes the staged picks + results to
   `data/league-data.json` in this repo via GitHub's Contents API. GitHub
   Pages rebuilds automatically, so the live scoreboard reflects the update
   about a minute later.

Unpublished edits are cached in your browser (`localStorage`) so an
accidental refresh doesn't lose your work — a banner reminds you when you
have local changes that haven't been published yet.

### Admin password

The current admin password was generated when this feature was built and
shared with you separately — check your conversation history with Claude if
you need a reminder. To change it:

1. Pick a new password and compute its SHA-256 hash, e.g.:
   ```bash
   python3 -c "import hashlib; print(hashlib.sha256(b'your-new-password').hexdigest())"
   ```
2. Replace the `ADMIN_PASSWORD_HASH` constant near the top of `js/admin.js`
   with the new hash.
3. Commit and push. Existing sessions stay logged in until they clear
   `sessionStorage`; everyone else needs the new password.

## Project structure

```
index.html           # Pick'em app: name entry, picks, summary/copy
scoreboard.html       # Public read-only leaderboard + game-by-game results
admin.html            # Password-gated commissioner tools
css/styles.css        # All styling — dark, NFL-inspired, mobile-first
js/games.js           # The schedule data (edit this for future weeks)
js/app.js             # Pick'em app logic: state, rendering, localStorage
js/league.js           # Shared helpers: load data, parse pasted picks, score
js/scoreboard.js        # Scoreboard rendering
js/admin.js              # Admin logic: auth gate, GitHub publish, results
data/league-data.json    # Published picks + results (the "database")
```

## Updating the schedule for a future week

Everything about the games lives in one place: `js/games.js`. Update
`WEEK_LABEL` and the `GAMES` array (each entry has `id`, `away`, `home`, and
an ISO `kickoff` timestamp with UTC offset) — the cards, progress counter,
and generated message all rebuild automatically from that data. No other
file needs to change.

## Running locally

No build step needed — it's static files. From the project root:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploying to GitHub Pages

This repo is already wired for Pages from the root of the `main` branch:

1. Push to `main`.
2. In the repo's **Settings → Pages**, set **Source** to `Deploy from a
   branch`, branch `main`, folder `/ (root)` (already configured for this
   repo).
3. The app is served at `https://robbycorrs23.github.io/nfl-pickem-gh/`.

All asset paths in `index.html` are relative (`./css/...`, `./js/...`), so
this works whether the site is served from the domain root or a
`/<repo-name>/` subpath — no configuration changes needed either way.
