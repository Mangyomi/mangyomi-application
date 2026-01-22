import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import * as protobuf from 'protobufjs';
import { getDatabase } from '../database';
import { getAllExtensions } from '../extensions/loader';

const BACKUP_PROTO = `
syntax = "proto2";

message Backup {
  repeated BackupManga backupManga = 1;
  repeated BackupCategory backupCategories = 2;
  repeated BrokenBackupSource backupBrokenSources = 100;
  repeated BackupSource backupSources = 101;
  repeated BackupPreference backupPreferences = 104;
  repeated BackupSourcePreferences backupSourcePreferences = 105;
}

message BackupManga {
  required int64 source = 1;
  required string url = 2;
  optional string title = 3;
  optional string artist = 4;
  optional string author = 5;
  optional string description = 6;
  repeated string genre = 7;
  optional int32 status = 8;
  optional string thumbnailUrl = 9;
  optional int64 dateAdded = 13;
  optional int32 viewer = 14;
  repeated BackupChapter chapters = 16;
  repeated int64 categories = 17;
  repeated BackupTracking tracking = 18;
  optional bool favorite = 100;
  optional int32 chapterFlags = 101;
  repeated BrokenBackupHistory brokenHistory = 102;
  optional int32 viewer_flags = 103;
  repeated BackupHistory history = 104;
  optional UpdateStrategy updateStrategy = 105;
  optional int64 lastModifiedAt = 106;
  optional int64 favoriteModifiedAt = 107;
}

message BackupCategory {
  required string name = 1;
  optional int64 order = 2;
  optional int64 flags = 100;
}

message BrokenBackupSource {
  optional string name = 0;
  required int64 sourceId = 1;
}

message BackupSource {
  optional string name = 1;
  required int64 sourceId = 2;
}

message BackupPreference {
  required string key = 1;
  required PreferenceValue value = 2;
}

message BackupSourcePreferences {
  required string sourceKey = 1;
  repeated BackupPreference prefs = 2;
}

message BackupChapter {
  required string url = 1;
  required string name = 2;
  optional string scanlator = 3;
  optional bool read = 4;
  optional bool bookmark = 5;
  optional int64 lastPageRead = 6;
  optional int64 dateFetch = 7;
  optional int64 dateUpload = 8;
  optional float chapterNumber = 9;
  optional int64 sourceOrder = 10;
  optional int64 lastModifiedAt = 11;
}

message BackupTracking {
  required int32 syncId = 1;
  required int64 libraryId = 2;
  optional int32 mediaIdInt = 3;
  optional string trackingUrl = 4;
  optional string title = 5;
  optional float lastChapterRead = 6;
  optional int32 totalChapters = 7;
  optional float score = 8;
  optional int32 status = 9;
  optional int64 startedReadingDate = 10;
  optional int64 finishedReadingDate = 11;
  optional int64 mediaId = 100;
}

message BrokenBackupHistory {
  required string url = 0;
  required int64 lastRead = 1;
  optional int64 readDuration = 2;
}

message BackupHistory {
  required string url = 1;
  required int64 lastRead = 2;
  optional int64 readDuration = 3;
}

enum UpdateStrategy {
  ALWAYS_UPDATE = 0;
  ONLY_FETCH_ONCE = 1;
}

message PreferenceValue {
  required string type = 1;
  required bytes value = 2;
}
`;



export async function importBackup(
    backupPath: string,
    onProgress?: (status: string, current?: number, total?: number) => void,
    isCancelled?: () => boolean
): Promise<{ success: boolean; message: string; count?: number; libraryCount?: number }> {
    const insertedMangaIds: string[] = [];

    try {
        const db = getDatabase();

        const root = protobuf.parse(BACKUP_PROTO).root;
        const Backup = root.lookupType("Backup");

        if (!fs.existsSync(backupPath)) {
            return { success: false, message: 'File not found' };
        }

        onProgress?.('Reading backup file...', 0, 0);
        let buffer = fs.readFileSync(backupPath);

        if (buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
            buffer = zlib.gunzipSync(buffer);
        }

        onProgress?.('Parsing backup data...', 0, 0);
        await new Promise(resolve => setTimeout(resolve, 50));

        const message = Backup.decode(buffer);
        const backup = Backup.toObject(message, {
            longs: String,
            enums: String,
            bytes: String,
        });

        const mangas = backup.backupManga || [];
        const backupSources = backup.backupSources || [];
        let importedCount = 0;
        let libraryCount = 0;

        const sourceMap = new Map<string, string>();
        if (backupSources) {
            backupSources.forEach((s: any) => {
                if (s.sourceId && s.name) {
                    sourceMap.set(String(s.sourceId), s.name);
                }
            });
        }

        const installedExtensions = getAllExtensions();

        // Build source name mapping dynamically from extensions
        // Extensions provide their Tachiyomi source names via getTachiyomiSourceNames()
        const sourceNameMapping: Record<string, string> = {};
        for (const ext of installedExtensions) {
            if (typeof ext.getTachiyomiSourceNames === 'function') {
                const sourceNames = await ext.getTachiyomiSourceNames();
                if (sourceNames) {
                    for (const sourceName of sourceNames) {
                        sourceNameMapping[sourceName.toLowerCase()] = ext.id;
                    }
                }
            }
            // Also map extension's own name/id to itself
            sourceNameMapping[ext.name.toLowerCase()] = ext.id;
            sourceNameMapping[ext.id.toLowerCase()] = ext.id;
        }
        console.log('[Importer] Source name mapping:', Object.keys(sourceNameMapping).slice(0, 20));

        onProgress?.(`Found ${mangas.length} entries. Validating...`, 0, mangas.length);

        const BATCH_SIZE = 50;
        const queue = [...mangas];

        const processManga = async (m: any) => {
            const sourceId = String(m.source);
            let sourceName = sourceMap.get(sourceId);

            if (!sourceName) return;

            // Normalize source name using mapping (e.g., "Manganato" -> "mangakakalot")
            const normalizedSourceName = sourceNameMapping[sourceName.toLowerCase()] || sourceName.toLowerCase();

            // DEBUG: Log for AsuraScans to file
            if (sourceName && sourceName.toLowerCase().includes('asura')) {
                const logPath = 'd:/asura-import-debug.log';
                const logEntry = `[${new Date().toISOString()}] Manga: "${m.title}" | Source: "${sourceName}" | Normalized: "${normalizedSourceName}" | URL: "${m.url}"\n`;
                try {
                    fs.appendFileSync(logPath, logEntry, 'utf-8');
                } catch (e) {
                    console.error('[Importer] Failed to write debug log:', e);
                }
            }

            // Find matching extension by normalized name
            const matchedExt = installedExtensions.find(ext =>
                ext.id.toLowerCase() === normalizedSourceName ||
                ext.name.toLowerCase() === normalizedSourceName ||
                ext.id.toLowerCase() === sourceName.toLowerCase() ||
                ext.name.toLowerCase() === sourceName.toLowerCase()
            );

            // DEBUG: Log matching result for Asura
            if (sourceName && sourceName.toLowerCase().includes('asura')) {
                const logPath = 'd:/asura-import-debug.log';
                const matchLog = `  -> Matched extension: ${matchedExt ? matchedExt.id : 'NONE'} | Has normalizeTachiURL: ${matchedExt && typeof matchedExt.normalizeTachiURL === 'function'}\n`;
                try {
                    fs.appendFileSync(logPath, matchLog, 'utf-8');
                } catch (e) { /* ignore */ }
            }

            if (matchedExt) {
                // If extension is matched but doesn't support URL normalization, skip this manga
                if (typeof matchedExt.normalizeTachiURL !== 'function') {
                    console.warn(`[Importer] Skipping manga "${m.title}" - extension "${matchedExt.id}" does not support URL normalization`);
                    return; // Skip this manga
                }

                // DEBUG: Log before calling
                if (sourceName && sourceName.toLowerCase().includes('asura')) {
                    const logPath = 'd:/asura-import-debug.log';
                    try {
                        fs.appendFileSync(logPath, `  -> CALLING normalizeTachiURL\n`, 'utf-8');
                    } catch (e) { /* ignore */ }
                }

                try {
                    const normalized = await matchedExt.normalizeTachiURL(m.url, m.title);

                    // DEBUG: Log result for Asura
                    if (sourceName && sourceName.toLowerCase().includes('asura')) {
                        const logPath = 'd:/asura-import-debug.log';
                        try {
                            fs.appendFileSync(logPath, `  -> Returned: "${normalized}" ${normalized === m.url ? '(UNCHANGED)' : '(CHANGED)'}\n`, 'utf-8');
                        } catch (e) { /* ignore */ }
                    }

                    if (normalized && normalized !== m.url) {
                        m.url = normalized;
                        m.thumbnailUrl = ''; // Clear to force re-fetch
                    }
                } catch (e) {
                    console.warn(`[Importer] Failed to normalize URL for ${m.title}:`, e);
                }
            } else {
                // Log unmapped sources to help debugging
                if (sourceName && !sourceName.toLowerCase().includes('merged')) {
                    console.warn(`[Importer] No extension matched for source "${sourceName}" (manga: "${m.title}")`);
                }
            }
        };

        for (let i = 0; i < queue.length; i += BATCH_SIZE) {
            if (isCancelled?.()) {
                throw new Error('Restore cancelled by user');
            }
            const batch = queue.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(m => processManga(m)));
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        const IMPORT_BATCH_SIZE = 20;

        for (let i = 0; i < mangas.length; i += IMPORT_BATCH_SIZE) {
            if (isCancelled?.()) {
                throw new Error('Restore cancelled by user');
            }

            const batch = mangas.slice(i, i + IMPORT_BATCH_SIZE);
            const currentCount = i;

            onProgress?.(`Restoring ${currentCount + 1}-${Math.min(currentCount + IMPORT_BATCH_SIZE, mangas.length)} of ${mangas.length}...`, currentCount, mangas.length);

            const transaction = db.transaction((batchItems: any[]) => {
                const insertMangaStmt = db.prepare(`
                    INSERT INTO manga (id, source_id, source_manga_id, title, cover_url, author, artist, description, status, in_library, added_at)
                    VALUES (@id, @source_id, @source_manga_id, @title, @cover_url, @author, @artist, @description, @status, @in_library, @added_at)
                    ON CONFLICT(id) DO UPDATE SET
                        in_library = MAX(in_library, excluded.in_library),
                        title = excluded.title,
                        cover_url = excluded.cover_url,
                        author = excluded.author,
                        artist = excluded.artist,
                        description = excluded.description,
                        status = excluded.status
                `);

                const insertChapterStmt = db.prepare(`
                    INSERT OR IGNORE INTO chapter (id, manga_id, source_chapter_id, title, chapter_number, url, read_at, last_page_read, added_at)
                    VALUES (@id, @manga_id, @source_chapter_id, @title, @chapter_number, @url, @read_at, @last_page_read, @added_at)
                `);

                const insertHistoryStmt = db.prepare(`
                    INSERT OR IGNORE INTO history (manga_id, chapter_id, read_at, page_number)
                    VALUES (@manga_id, @chapter_id, @read_at, @page_number)
                `);

                const checkHistoryStmt = db.prepare('SELECT id FROM history WHERE manga_id = ? AND chapter_id = ?');

                for (const m of batchItems) {
                    let sourceId = String(m.source);
                    const sourceName = sourceMap.get(sourceId);

                    if (sourceName) {
                        // Normalize source name using mapping (e.g., "Manganato" -> "mangakakalot")
                        const normalizedSourceName = sourceNameMapping[sourceName.toLowerCase()] || sourceName.toLowerCase();

                        // Find extension by normalized name
                        const matchedExt = installedExtensions.find(ext =>
                            ext.id.toLowerCase() === normalizedSourceName ||
                            ext.name.toLowerCase() === normalizedSourceName ||
                            ext.id.toLowerCase() === sourceName.toLowerCase() ||
                            ext.name.toLowerCase() === sourceName.toLowerCase()
                        );
                        if (matchedExt) {
                            sourceId = matchedExt.id;
                        } else {
                            continue;
                        }
                    } else {
                        continue;
                    }

                    const sourceMangaId = m.url;
                    const mangaId = `${sourceId}:${sourceMangaId}`;
                    const inLibrary = (m.favorite || (m.categories && m.categories.length > 0)) ? 1 : 0;

                    insertMangaStmt.run({
                        id: mangaId,
                        source_id: sourceId,
                        source_manga_id: sourceMangaId,
                        title: m.title || '',
                        cover_url: m.thumbnailUrl || '',
                        author: m.author || '',
                        artist: m.artist || '',
                        description: m.description || '',
                        status: m.status !== undefined ? String(m.status) : '0',
                        in_library: inLibrary,
                        added_at: m.dateAdded ? Math.floor(parseInt(m.dateAdded) / 1000) : Math.floor(Date.now() / 1000)
                    });

                    insertedMangaIds.push(mangaId);

                    if (m.chapters) {
                        for (const c of m.chapters) {
                            const chapterUrl = c.url;
                            // Extract clean chapter ID
                            let cleanChapterId = chapterUrl;
                            try {
                                if (chapterUrl.includes('://')) {
                                    cleanChapterId = new URL(chapterUrl).pathname.split('/').filter(Boolean).pop() || chapterUrl;
                                } else {
                                    cleanChapterId = chapterUrl.split('/').filter(Boolean).pop() || chapterUrl;
                                }
                            } catch {
                                cleanChapterId = chapterUrl.split('/').filter(Boolean).pop() || chapterUrl;
                            }

                            // FIX: Mangakakalot/Nato family requires the manga slug in the chapter ID
                            // e.g. "manga-slug/chapter-5" instead of just "chapter-5"
                            const isMangakakalotFamily =
                                sourceName?.toLowerCase().includes('mangakakalot') ||
                                sourceName?.toLowerCase().includes('manganato') ||
                                sourceName?.toLowerCase().includes('manganelo') ||
                                sourceId === 'mangakakalot';

                            if (isMangakakalotFamily) {
                                // Ensure we don't double add it if it's already there (though unlikely with the split pop above)
                                if (!cleanChapterId.includes('/')) {
                                    cleanChapterId = `${sourceMangaId}/${cleanChapterId}`;
                                }
                            }

                            const chapterId = `${sourceId}:${cleanChapterId}`;
                            const isRead = c.read || (c.lastPageRead && c.lastPageRead > 0);
                            const readAt = c.dateFetch ? Math.floor(parseInt(c.dateFetch) / 1000) : (isRead ? Math.floor(Date.now() / 1000) : null);

                            insertChapterStmt.run({
                                id: chapterId,
                                manga_id: mangaId,
                                source_chapter_id: cleanChapterId,
                                title: c.name || '',
                                chapter_number: c.chapterNumber || 0,
                                url: chapterUrl,
                                read_at: readAt,
                                last_page_read: c.lastPageRead || 0,
                                added_at: c.dateUpload ? Math.floor(parseInt(c.dateUpload) / 1000) : Math.floor(Date.now() / 1000)
                            });

                            if (isRead) {
                                const existing = checkHistoryStmt.get(mangaId, chapterId);
                                if (!existing) {
                                    insertHistoryStmt.run({
                                        manga_id: mangaId,
                                        chapter_id: chapterId,
                                        read_at: readAt || Math.floor(Date.now() / 1000),
                                        page_number: c.lastPageRead || 0
                                    });
                                }
                            }
                        }
                    }

                    if (inLibrary === 1) {
                        libraryCount++;
                    }
                    importedCount++;
                }
            });

            transaction(batch);
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        return {
            success: true,
            message: 'Import successful',
            count: importedCount,
            libraryCount: libraryCount
        };
    } catch (error) {
        if (error instanceof Error && error.message === 'Restore cancelled by user') {
            const db = getDatabase();
            console.log('[Importer] Rollback started...');
            onProgress?.('Cancelling and rolling back changes...', 0, 0);

            const ROLLBACK_BATCH = 100;
            for (let i = 0; i < insertedMangaIds.length; i += ROLLBACK_BATCH) {
                const batchIds = insertedMangaIds.slice(i, i + ROLLBACK_BATCH);
                const placeholders = batchIds.map(() => '?').join(',');
                db.prepare(`DELETE FROM manga WHERE id IN (${placeholders})`).run(...batchIds);
                await new Promise(resolve => setTimeout(resolve, 0));
            }

            console.log('[Importer] Rollback completed.');
            return { success: false, message: 'Restore cancelled' };
        }

        console.error('Import failed:', error);
        return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
}
