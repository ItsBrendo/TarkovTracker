CREATE TABLE tracker_api_connections (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  encrypted_token TEXT NOT NULL,
  game_mode TEXT NOT NULL CHECK (game_mode IN ('pvp', 'pve', 'seasonal')),
  etag TEXT,
  progress_json TEXT,
  cached_at INTEGER,
  connected_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);