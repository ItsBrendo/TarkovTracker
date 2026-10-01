CREATE TABLE daily_selection (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  item_date TEXT NOT NULL,
  item_id TEXT NOT NULL,
  selected_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at INTEGER NOT NULL
);
