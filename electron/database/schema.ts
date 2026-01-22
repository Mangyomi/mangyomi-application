export const schema = `
-- Manga library entries
CREATE TABLE IF NOT EXISTS manga (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  source_manga_id TEXT NOT NULL,
  title TEXT NOT NULL,
  cover_url TEXT,
  author TEXT,
  artist TEXT,
  description TEXT,
  status TEXT,
  in_library INTEGER DEFAULT 0,
  anilist_id INTEGER,
  added_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  UNIQUE(source_id, source_manga_id)
);

-- Chapters for each manga
CREATE TABLE IF NOT EXISTS chapter (
  id TEXT PRIMARY KEY,
  manga_id TEXT NOT NULL REFERENCES manga(id) ON DELETE CASCADE,
  source_chapter_id TEXT NOT NULL,
  title TEXT NOT NULL,
  chapter_number REAL,
  volume_number INTEGER,
  url TEXT NOT NULL,
  read_at INTEGER,
  page_count INTEGER,
  last_page_read INTEGER DEFAULT 0,
  added_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Reading history
CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  manga_id TEXT NOT NULL REFERENCES manga(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL REFERENCES chapter(id) ON DELETE CASCADE,
  read_at INTEGER DEFAULT (strftime('%s', 'now')),
  page_number INTEGER
);

-- Tags for categorization
CREATE TABLE IF NOT EXISTS tag (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  color TEXT DEFAULT '#6366f1',
  is_nsfw INTEGER DEFAULT 0
);

-- Manga-Tag relationship
CREATE TABLE IF NOT EXISTS manga_tag (
  manga_id TEXT NOT NULL REFERENCES manga(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  PRIMARY KEY (manga_id, tag_id)
);

-- Extension metadata
CREATE TABLE IF NOT EXISTS extension (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  installed_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_manga_source ON manga(source_id, source_manga_id);
CREATE INDEX IF NOT EXISTS idx_chapter_manga ON chapter(manga_id);
CREATE INDEX IF NOT EXISTS idx_history_manga ON history(manga_id);
CREATE INDEX IF NOT EXISTS idx_history_read_at ON history(read_at DESC);
CREATE INDEX IF NOT EXISTS idx_manga_tag_manga ON manga_tag(manga_id);
CREATE INDEX IF NOT EXISTS idx_manga_tag_tag ON manga_tag(tag_id);

-- Image Caching
CREATE TABLE IF NOT EXISTS image_cache (
  url TEXT PRIMARY KEY,
  hash TEXT NOT NULL,
  manga_id TEXT NOT NULL,
  chapter_id TEXT NOT NULL,
  size INTEGER,
  cached_at INTEGER DEFAULT (strftime('%s', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_cache_chapter ON image_cache(chapter_id);

-- Prefetch History
CREATE TABLE IF NOT EXISTS prefetch_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  manga_id TEXT NOT NULL,
  manga_title TEXT,
  extension_id TEXT,
  status TEXT NOT NULL DEFAULT 'in_progress', -- 'completed', 'cancelled', 'failed'
  started_at INTEGER DEFAULT (strftime('%s', 'now')),
  completed_at INTEGER,
  total_chapters INTEGER DEFAULT 0,
  completed_chapters INTEGER DEFAULT 0,
  total_pages INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  failed_pages TEXT -- JSON array of { url, chapter, error }
);
CREATE INDEX IF NOT EXISTS idx_prefetch_manga ON prefetch_history(manga_id);
CREATE INDEX IF NOT EXISTS idx_prefetch_started ON prefetch_history(started_at DESC);

-- Chapter Pages Cache (stores page URLs per chapter)
CREATE TABLE IF NOT EXISTS chapter_pages (
  chapter_id TEXT PRIMARY KEY,
  extension_id TEXT NOT NULL,
  pages TEXT NOT NULL, -- JSON array of page URLs
  cached_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Source Behavior (adaptive prefetch rate limiting)
CREATE TABLE IF NOT EXISTS source_behavior (
  source_id TEXT PRIMARY KEY,
  current_request_rate REAL DEFAULT 2.0,
  max_observed_rate REAL DEFAULT 2.0,
  initial_rate REAL DEFAULT 2.0,
  max_rate REAL DEFAULT 10.0,
  consecutive_failures INTEGER DEFAULT 0,
  total_requests INTEGER DEFAULT 0,
  failed_requests INTEGER DEFAULT 0,
  last_rate_limit_time INTEGER,
  avg_response_time_ms REAL DEFAULT 500,
  backoff_until INTEGER,
  backoff_multiplier INTEGER DEFAULT 1,
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Reading Stats (per-session tracking)
CREATE TABLE IF NOT EXISTS reading_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_date INTEGER NOT NULL,
  source_id TEXT,
  manga_id TEXT,
  chapter_id TEXT,
  pages_viewed INTEGER DEFAULT 0,
  reading_time_seconds INTEGER DEFAULT 0,
  chapters_completed INTEGER DEFAULT 0,
  avg_velocity REAL,
  forward_navigations INTEGER DEFAULT 0,
  backward_navigations INTEGER DEFAULT 0,
  started_at INTEGER,
  ended_at INTEGER,
  UNIQUE(session_date, manga_id, chapter_id)
);
CREATE INDEX IF NOT EXISTS idx_reading_stats_date ON reading_stats(session_date);

-- Reading Stats Daily (aggregated)
CREATE TABLE IF NOT EXISTS reading_stats_daily (
  date INTEGER PRIMARY KEY,
  total_pages INTEGER DEFAULT 0,
  total_chapters INTEGER DEFAULT 0,
  total_reading_time_seconds INTEGER DEFAULT 0,
  unique_manga_count INTEGER DEFAULT 0,
  avg_velocity REAL,
  streak_days INTEGER DEFAULT 0
);
`;
