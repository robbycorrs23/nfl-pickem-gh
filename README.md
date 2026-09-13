# NFL Week 1 Pick'em

A tiny, dependency-free, mobile-first pick'em app for picking winners in the
14 remaining NFL Week 1 games (Sept 13–14, 2026) and sharing the results into
a group chat. No backend, no database, no login, no build step, no
third-party libraries — just static HTML/CSS/JS hosted on GitHub Pages.

**Live app:** `https://robbycorrs23.github.io/nfl-pickem-gh/`

## How it works

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
everything happens in your browser.

## Project structure

```
index.html        # Markup for the three screens (name, picks, summary)
css/styles.css     # All styling — dark, NFL-inspired, mobile-first
js/games.js         # The schedule data (edit this for future weeks)
js/app.js           # App logic: state, rendering, localStorage, clipboard
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
