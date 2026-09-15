-- NFL Pick'em GH — schema
-- One row per week; games belong to a week; picks belong to a (week, game,
-- player); the actual winner lives directly on the game row (at most one
-- result per game, so no separate results table needed).

CREATE TABLE IF NOT EXISTS weeks (
  id          TEXT PRIMARY KEY,             -- e.g. 'week1'
  label       TEXT NOT NULL,                -- e.g. 'Week 1'
  season      INTEGER NOT NULL,             -- e.g. 2026
  espn_week   INTEGER,                      -- NFL week number for ESPN score sync
  espn_seasontype INTEGER NOT NULL DEFAULT 2, -- 1=pre, 2=regular, 3=post
  is_current  BOOLEAN NOT NULL DEFAULT false, -- the week friends currently pick
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS games (
  id            TEXT PRIMARY KEY,           -- e.g. 'week1__bears-panthers'
  week_id       TEXT NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  away_city     TEXT NOT NULL,
  away_name     TEXT NOT NULL,
  home_city     TEXT NOT NULL,
  home_name     TEXT NOT NULL,
  kickoff       TIMESTAMPTZ NOT NULL,
  winner_side   TEXT CHECK (winner_side IN ('home', 'away')),
  result_source TEXT CHECK (result_source IN ('espn', 'manual')),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_games_week ON games(week_id);

CREATE TABLE IF NOT EXISTS picks (
  id              SERIAL PRIMARY KEY,
  week_id         TEXT NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  player_name     TEXT NOT NULL,
  player_name_key TEXT GENERATED ALWAYS AS (lower(btrim(player_name))) STORED,
  game_id         TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  side            TEXT NOT NULL CHECK (side IN ('home', 'away')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (week_id, player_name_key, game_id)
);

CREATE INDEX IF NOT EXISTS idx_picks_week_player ON picks(week_id, player_name_key);

-- The league roster, persisted independently of any single week so it's
-- available to render a "pick your name" list even on a brand new week
-- with zero picks yet. Grows automatically the first time a new name
-- submits picks (see POST /:weekId/picks) — no separate signup step.
CREATE TABLE IF NOT EXISTS players (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  name_key   TEXT GENERATED ALWAYS AS (lower(btrim(name))) STORED UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One-time backfill: anyone who already has picks but isn't in the roster
-- yet (i.e. everyone, the first time this migration runs) gets added.
-- Safe to re-run.
INSERT INTO players (name)
SELECT DISTINCT player_name FROM picks
ON CONFLICT (name_key) DO NOTHING;
