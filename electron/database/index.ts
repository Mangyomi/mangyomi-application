import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { schema } from './schema';

let db: Database.Database | null = null;

export function initDatabase(dbPath: string): Database.Database {
    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    // Cleanup temp files
    const tempPath = `${dbPath}.tmp`;
    if (fs.existsSync(tempPath)) {
        try {
            fs.unlinkSync(tempPath);
            console.log('Cleaned up leftover temp database file');
        } catch (e) {
            console.error('Failed to clean up temp database file:', e);
        }
    }

    // Check for corrupt database
    if (fs.existsSync(dbPath)) {
        try {
            const buffer = fs.readFileSync(dbPath);
            const header = buffer.slice(0, 16).toString('utf8');
            if (!header.startsWith('SQLite format 3')) {
                console.error('Database file is corrupted (invalid header). Creating new database.');
                const corruptBackup = `${dbPath}.corrupt.${Date.now()}`;
                try {
                    fs.copyFileSync(dbPath, corruptBackup);
                    console.log('Corrupted database backed up to:', corruptBackup);
                } catch (e) {
                    console.error('Failed to backup corrupted database:', e);
                }
                fs.unlinkSync(dbPath);
            } else {
                // Create backup of working database
                const backupPath = `${dbPath}.backup`;
                try {
                    fs.copyFileSync(dbPath, backupPath);
                } catch (e) {
                    console.error('Failed to create database backup:', e);
                }
            }
        } catch (e) {
            console.error('Error reading database file:', e);
        }
    }

    // Open database (creates if doesn't exist)
    db = new Database(dbPath);

    // Enable foreign keys
    db.pragma('foreign_keys = ON');

    // Check if database is new (no tables)
    const tableCount = db.prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'").get() as { count: number };
    if (tableCount.count === 0) {
        console.log('Creating new database schema');
        db.exec(schema);
    }

    // Run migrations
    runMigrations(db);

    console.log('Database initialized at:', dbPath);
    return db;
}

function runMigrations(db: Database.Database) {
    // Migration: Add in_library column if it doesn't exist
    try {
        const tableInfo = db.prepare("PRAGMA table_info(manga)").all() as { name: string }[];
        const hasInLibrary = tableInfo.some((col) => col.name === 'in_library');

        if (!hasInLibrary) {
            console.log('Migrating database: adding in_library column to manga table');
            db.exec('ALTER TABLE manga ADD COLUMN in_library INTEGER DEFAULT 0');
            db.exec('UPDATE manga SET in_library = 1');
        }
    } catch (error) {
        console.error('Migration failed:', error);
    }

    // Migration: Create image_cache table if it doesn't exist
    try {
        const hasImageCache = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='image_cache'").get();
        if (!hasImageCache) {
            console.log('Migrating database: creating image_cache table');
            db.exec(`
                CREATE TABLE IF NOT EXISTS image_cache (
                  url TEXT PRIMARY KEY,
                  hash TEXT NOT NULL,
                  manga_id TEXT NOT NULL,
                  chapter_id TEXT NOT NULL,
                  size INTEGER,
                  cached_at INTEGER DEFAULT (strftime('%s', 'now'))
                );
                CREATE INDEX IF NOT EXISTS idx_cache_chapter ON image_cache(chapter_id);
             `);
        }
    } catch (error) {
        console.error('Image Cache Migration failed:', error);
    }

    // Migration: Add anilist_id column if it doesn't exist
    try {
        const tableInfo = db.prepare("PRAGMA table_info(manga)").all() as { name: string }[];
        const hasAnilistId = tableInfo.some((col) => col.name === 'anilist_id');

        if (!hasAnilistId) {
            console.log('Migrating database: adding anilist_id column to manga table');
            db.exec('ALTER TABLE manga ADD COLUMN anilist_id INTEGER');
        }
    } catch (error) {
        console.error('AniList migration failed:', error);
    }

    // Migration: Add is_nsfw column to tag table if it doesn't exist
    try {
        const tagTableInfo = db.prepare("PRAGMA table_info(tag)").all() as { name: string }[];
        const hasIsNsfw = tagTableInfo.some((col) => col.name === 'is_nsfw');

        if (!hasIsNsfw) {
            console.log('Migrating database: adding is_nsfw column to tag table');
            db.exec('ALTER TABLE tag ADD COLUMN is_nsfw INTEGER DEFAULT 0');
        }
    } catch (error) {
        console.error('Tag NSFW migration failed:', error);
    }

    // Migration: Create prefetch_history table if it doesn't exist
    try {
        const hasPrefetchHistory = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='prefetch_history'").get();
        if (!hasPrefetchHistory) {
            console.log('Migrating database: creating prefetch_history table');
            db.exec(`
                CREATE TABLE IF NOT EXISTS prefetch_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    manga_id TEXT NOT NULL,
                    manga_title TEXT,
                    extension_id TEXT,
                    status TEXT NOT NULL DEFAULT 'in_progress',
                    started_at INTEGER DEFAULT (strftime('%s', 'now')),
                    completed_at INTEGER,
                    total_chapters INTEGER DEFAULT 0,
                    completed_chapters INTEGER DEFAULT 0,
                    total_pages INTEGER DEFAULT 0,
                    success_count INTEGER DEFAULT 0,
                    failed_count INTEGER DEFAULT 0,
                    skipped_count INTEGER DEFAULT 0,
                    failed_pages TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_prefetch_manga ON prefetch_history(manga_id);
                CREATE INDEX IF NOT EXISTS idx_prefetch_started ON prefetch_history(started_at DESC);
            `);
        }
    } catch (error) {
        console.error('Prefetch History migration failed:', error);
    }

    // Migration: Create chapter_pages table if it doesn't exist
    try {
        const hasChapterPages = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='chapter_pages'").get();
        if (!hasChapterPages) {
            console.log('Migrating database: creating chapter_pages table');
            db.exec(`
                CREATE TABLE IF NOT EXISTS chapter_pages (
                    chapter_id TEXT PRIMARY KEY,
                    extension_id TEXT NOT NULL,
                    pages TEXT NOT NULL,
                    cached_at INTEGER DEFAULT (strftime('%s', 'now'))
                );
            `);
        }
    } catch (error) {
        console.error('Chapter Pages migration failed:', error);
    }

    // Migration: Create reading_stats table (Adaptive Prefetch)
    try {
        const hasReadingStats = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='reading_stats'").get();
        if (!hasReadingStats) {
            console.log('Migrating database: creating reading_stats tables');
            db.exec(`
                CREATE TABLE IF NOT EXISTS reading_stats (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_date INTEGER NOT NULL,
                    source_id TEXT NOT NULL,
                    manga_id TEXT NOT NULL,
                    chapter_id TEXT NOT NULL,
                    pages_viewed INTEGER DEFAULT 0,
                    reading_time_seconds INTEGER DEFAULT 0,
                    chapters_completed INTEGER DEFAULT 0,
                    avg_velocity REAL DEFAULT 0,
                    forward_navigations INTEGER DEFAULT 0,
                    backward_navigations INTEGER DEFAULT 0,
                    started_at INTEGER,
                    ended_at INTEGER,
                    UNIQUE(session_date, manga_id, chapter_id)
                );
                CREATE INDEX IF NOT EXISTS idx_reading_stats_date ON reading_stats(session_date);
                CREATE INDEX IF NOT EXISTS idx_reading_stats_manga ON reading_stats(manga_id);

                CREATE TABLE IF NOT EXISTS reading_stats_daily (
                    date INTEGER PRIMARY KEY,
                    total_pages INTEGER DEFAULT 0,
                    total_chapters INTEGER DEFAULT 0,
                    total_reading_time_seconds INTEGER DEFAULT 0,
                    unique_manga_count INTEGER DEFAULT 0,
                    avg_velocity REAL DEFAULT 0,
                    streak_days INTEGER DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS source_behavior (
                    source_id TEXT PRIMARY KEY,
                    current_request_rate REAL DEFAULT 1.0,
                    max_observed_rate REAL DEFAULT 1.0,
                    initial_rate REAL DEFAULT 0.5,
                    max_rate REAL DEFAULT 2.0,
                    consecutive_failures INTEGER DEFAULT 0,
                    total_requests INTEGER DEFAULT 0,
                    failed_requests INTEGER DEFAULT 0,
                    last_rate_limit_time INTEGER,
                    avg_response_time_ms REAL DEFAULT 0,
                    backoff_until INTEGER,
                    backoff_multiplier REAL DEFAULT 1.0,
                    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
                );
            `);
        }
    } catch (error) {
        console.error('Reading Stats migration failed:', error);
    }
}

export function getDatabase(): Database.Database {
    if (!db) {
        throw new Error('Database not initialized. Call initDatabase first.');
    }
    return db;
}

export function closeDatabase(): void {
    if (db) {
        db.close();
        db = null;
    }
}
