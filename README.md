# NFL Pick'em

A mobile-first pick'em app for picking winners each week, sharing picks into
a group chat, and tracking a live, multi-week scoreboard. The frontend is
static HTML/CSS/JS with no framework and no build step, hosted on GitHub
Pages. It's backed by a small Express + Postgres API (`/server`) deployed on
a DigitalOcean droplet, which also auto-grades games from ESPN's public
scoreboard.

**Live app:** `https://robbycorrs23.github.io/nfl-pickem-gh/`
**Scoreboard:** `https://robbycorrs23.github.io/nfl-pickem-gh/scoreboard.html`
**Commissioner admin:** `https://robbycorrs23.github.io/nfl-pickem-gh/admin.html`
**API:** `https://nfl.similollc.com/api` (deployed from `/server`, separately from the frontend)

## How it works (for friends)

1. Tap your name (or add yourself if you're new — no typing required after
   the first time).
2. Pick a winner for each game (big, tappable team buttons). A "Picking
   for" dropdown lets you switch weeks — pick ahead for next week, or
   revisit an old one — the app defaults to whichever week is current.
3. Once every game is picked, tap **Generate My Picks** — this immediately
   saves your picks to the scoreboard *and* gives you a clean,
   group-chat-ready message:

   ```
   🏈 ROB'S WEEK 1 PICKS

   Bears over Panthers
   Ravens over Colts
   ...

   🔒 LOCKED IN — 14/14
   ```

4. Tap **Copy Picks** and paste it into the chat (purely for fun/bragging —
   the scoreboard already has your picks either way).

Your name and picks are cached in `localStorage` on your device as a draft
(namespaced per week), so an accidental refresh mid-pick doesn't lose
progress. The real source of truth is the server, though — if you make
picks on one device, they'll still be there if you visit from another
device under the same name.

## Multi-week support — fully automatic

Weeks are first-class: each one has its own games, picks, and results in
Postgres. Nobody has to create or activate anything:

- **Weeks 1–18 are pre-populated automatically.** On boot and every 6 hours,
  the API checks for any week that doesn't exist yet and fetches its real
  schedule from ESPN (`server/src/weekAuto.js: ensureSeasonWeeks`). Re-running
  is a no-op for weeks that already exist, so this is always safe.
- **"Current" is computed, not stored.** A week counts as current until its
  last game's kickoff + a 6-hour buffer has passed; the earliest week that
  hasn't hit that point yet wins (`computeCurrentWeekId`). This is why the
  app rolls over to the next week as soon as the previous one's games are
  done — not when the next week's games start — so people have all week to
  pick before Thursday night kickoff.
- **Pick ahead, or look back.** `index.html` has a "Picking for" dropdown
  (defaults to the computed current week) — nothing stops a friend from
  picking Week 3 today if they want to. The scoreboard has an equivalent
  week switcher for browsing any past week's results.

None of this requires an admin to do anything. The commissioner's "create a
new week" form in `admin.html` still exists as a manual fallback (postseason
weeks, or fixing a matchup ESPN got wrong), but it's no longer part of the
normal weekly flow.

## Scoreboard

`scoreboard.html` is public and read-only (no password) — anyone with the
link can view it. It shows:

- A week switcher (only appears once more than one week exists).
- A leaderboard ranked by correct picks, with tie handling.
- A "games final" progress indicator.
- A collapsible, game-by-game breakdown of who picked what and who got it
  right, with a badge noting whether a result was auto-synced from ESPN or
  set manually by the commissioner.

## Auto-grading via ESPN

The API polls ESPN's public scoreboard endpoint
(`site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard`, no API key
needed) every 5 minutes for any week that still has undecided games, matches
events to our games by team name, and fills in the winner once a game goes
final. A manually-set result (via the admin page) always takes precedence
and is never overwritten by auto-sync. This only works for a week that has
`espnWeek` set to the real NFL week number (see below) — otherwise, mark
results manually.

## Commissioner admin page

`admin.html` (password-gated) is where you import picks and mark results.
Every action here writes straight to the database — there's no publish/wait
step. Weeks themselves are automatic (see above); the "Advanced: manually
add/fix a week" form is a rarely-needed fallback, not a required step.

- **Import picks** — paste the exact "Generate My Picks" messages friends
  send in chat (handy if someone picks by texting instead of using the
  site); it parses each into a name + picks and saves immediately.
  Re-pasting a message for an existing name overwrites their picks.
- **Mark results** — tap a winner to override/set a result manually, or hit
  **Sync Scores From ESPN Now** to force an immediate auto-grade check.

### Admin password

Shared with you separately when this was built — check your conversation
history if you need a reminder. To change it, SSH into the droplet and edit
`/var/www/nfl-pickem-gh-api/server/.env`:

```bash
ssh root@138.197.115.249
nano /var/www/nfl-pickem-gh-api/server/.env   # update ADMIN_PASSWORD
pm2 restart nfl-pickem-gh-api
```

Everyone's existing admin session (a JWT cached in their browser) keeps
working until it expires (30 days) or they hit "Lock commissioner page" —
so rotate `ADMIN_SECRET` too if you need to invalidate sessions immediately.

## If you ever need to add a week manually

Normal weeks need zero manual steps (see "Multi-week support" above). If you
ever do need to add one by hand — postseason, or ESPN got a matchup wrong —
open `admin.html` → **Weeks** → **Advanced: manually add/fix a week**, give
it an id/label/season/NFL week number, hit **Auto-fill Games From ESPN** (or
type games in manually), then **Create Week**. There's no activation step;
which week is "current" is always computed from kickoff times.

## Project structure

```
index.html            Pick'em app: name entry, picks, summary/copy
scoreboard.html        Public read-only leaderboard + game-by-game results
admin.html              Password-gated commissioner tools
css/styles.css          All styling — dark, NFL-inspired, mobile-first
js/api.js                Client for the Express API (js/api.js -> nfl.similollc.com)
js/league.js              Pure helpers: parse pasted picks, score a player
js/app.js                  Pick'em app logic
js/scoreboard.js            Scoreboard rendering + week switcher
js/admin.js                  Admin logic: auth, weeks, picks, results

server/                Express + Postgres API, deployed separately (see below)
  schema.sql            weeks / games / picks / players tables
  src/index.js            App entry + ESPN sync + week auto-provision timers
  src/weekAuto.js           Auto-creates weeks 1-18 from ESPN; computes "current"
  src/routes/weeks.js         Week/game/pick/result endpoints
  src/routes/players.js        Roster endpoints
  src/routes/admin.js           Admin login (issues a JWT)
  src/espn.js                    ESPN scoreboard fetch + matching logic
  src/db.js, src/auth.js          Postgres pool, JWT middleware
```

## Running the frontend locally

No build step needed — it's static files, and they talk to the real
production API by default (see `API_BASE` in `js/api.js`).

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

If you want to point at a local API instead, change `API_BASE` in
`js/api.js` and make sure that origin is in the API's `CORS_ORIGINS`.

## Running / deploying the API

The API lives in `/server` in this same repo but deploys independently, to
a DigitalOcean droplet (`138.197.115.249`) that hosts several other
projects:

- **Database:** dedicated `nfl_pickem_gh` Postgres database + role on the
  droplet's shared Postgres 16 cluster (not a new service — just a new DB).
- **App:** `/var/www/nfl-pickem-gh-api`, process-managed by **PM2**
  (`server/ecosystem.config.js`), listening on `127.0.0.1:3061` only.
- **Reverse proxy + TLS:** **nginx** + **certbot**, serving
  `https://nfl.similollc.com` (reusing the domain/certificate freed up when
  an earlier, separate pick'em project on this droplet was retired).

### Redeploying the API after a change

```bash
ssh root@138.197.115.249
cd /var/www/nfl-pickem-gh-api
git pull origin main
cd server
npm install --omit=dev        # if dependencies changed
node src/migrate.js            # if schema.sql changed (safe to always re-run)
pm2 restart nfl-pickem-gh-api
```

### Local API development

```bash
cd server
npm install
ssh -N -L 5433:127.0.0.1:5432 root@138.197.115.249   # tunnel to the real Postgres
cp .env.example .env    # point DATABASE_URL at 127.0.0.1:5433/nfl_pickem_gh with the real password
node src/migrate.js
npm start                # listens on PORT (default 3061)
```

## Deploying the frontend to GitHub Pages

Already wired up: **Settings → Pages** is set to deploy from the `main`
branch, root folder. Just push to `main` — GitHub Pages rebuilds
automatically (usually under a minute) and serves from
`https://robbycorrs23.github.io/nfl-pickem-gh/`. All asset paths are
relative, so this works whether served from the domain root or a
`/<repo-name>/` subpath.
