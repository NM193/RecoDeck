-- Taste profile cache (singleton row)
CREATE TABLE IF NOT EXISTS taste_profile (
    id INTEGER PRIMARY KEY DEFAULT 1,
    profile_json TEXT NOT NULL,
    rebuilt_at INTEGER NOT NULL
);

-- Explicit user preferences saved by AI
CREATE TABLE IF NOT EXISTS user_preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    preference TEXT NOT NULL,
    context TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_category ON user_preferences(category);
