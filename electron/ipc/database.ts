/**
 * Database IPC Handlers
 * 
 * Handles all database-related IPC operations including:
 * - Manga CRUD
 * - Chapter operations
 * - History
 * - Tags
 * - Backup/Restore
 * - Prefetch history
 */
import { ipcMain, BrowserWindow, app, dialog } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { getDatabase, initDatabase } from '../database';
import { importBackup } from '../backup/importer';

export interface DatabaseHandlerDependencies {
    mainWindow: BrowserWindow;
    getFormattedMainLogs: () => string;
    getFormattedMainNetwork: () => string;
}

export function setupDatabaseHandlers(deps: DatabaseHandlerDependencies) {
    const db = getDatabase();
    const { mainWindow } = deps;

    // === Backup/Restore ===

    let restoreCancellationToken: (() => boolean) | null = null;
    let isRestoreCancelled = false;

    ipcMain.handle('db:restoreBackup', async (_, filePath: string) => {
        return importBackup(filePath);
    });

    ipcMain.handle('db:triggerRestore', async () => {
        isRestoreCancelled = false;
        restoreCancellationToken = () => isRestoreCancelled;

        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: [
                { name: 'Tachiyomi Backup', extensions: ['tachibk', 'proto.gz', 'proto'] }
            ],
            title: 'Select Backup File',
            buttonLabel: 'Restore'
        });

        if (result.canceled || result.filePaths.length === 0) {
            return { success: false, message: 'Restore cancelled' };
        }

        const onProgress = (status: string, current?: number, total?: number) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('restore:progress', { status, current, total });
            }
        };

        try {
            return await importBackup(result.filePaths[0], onProgress, restoreCancellationToken!);
        } finally {
            restoreCancellationToken = null;
        }
    });

    ipcMain.handle('db:cancelRestore', async () => {
        isRestoreCancelled = true;
        return { success: true };
    });

    // Export backup
    ipcMain.handle('db:exportBackup', async () => {
        const zlib = await import('zlib');
        const { promisify } = await import('util');
        const gzip = promisify(zlib.gzip);

        const backup = {
            version: 1,
            exportedAt: new Date().toISOString(),
            manga: db.prepare('SELECT * FROM manga').all(),
            tags: db.prepare('SELECT * FROM tag').all(),
            mangaTags: db.prepare('SELECT * FROM manga_tag').all(),
            chapters: db.prepare('SELECT * FROM chapter').all(),
            history: db.prepare('SELECT * FROM history').all(),
            extensions: db.prepare('SELECT * FROM extension').all(),
        };

        const jsonStr = JSON.stringify(backup);
        const compressed = await gzip(Buffer.from(jsonStr, 'utf-8'));

        const result = await dialog.showSaveDialog({
            title: 'Export Mangyomi Backup',
            defaultPath: `mangyomi-backup-${new Date().toISOString().split('T')[0]}.mgb`,
            filters: [{ name: 'Mangyomi Backup', extensions: ['mgb'] }]
        });

        if (result.canceled || !result.filePath) {
            return { success: false, message: 'Export cancelled' };
        }

        fs.writeFileSync(result.filePath, compressed);

        const stats = {
            manga: backup.manga.length,
            tags: backup.tags.length,
            chapters: backup.chapters.length,
            history: backup.history.length,
            sizeKB: (compressed.length / 1024).toFixed(1)
        };

        console.log(`Backup exported: ${stats.manga} manga, ${stats.chapters} chapters, ${stats.sizeKB}KB`);

        return {
            success: true,
            message: `Exported ${stats.manga} manga, ${stats.tags} tags, ${stats.chapters} chapters (${stats.sizeKB}KB)`,
            filePath: result.filePath
        };
    });

    // View backup file
    ipcMain.handle('db:viewBackup', async () => {
        const zlib = await import('zlib');
        const { promisify } = await import('util');
        const gunzip = promisify(zlib.gunzip);

        const result = await dialog.showOpenDialog({
            title: 'View Mangyomi Backup',
            filters: [{ name: 'Mangyomi Backup', extensions: ['mgb'] }],
            properties: ['openFile']
        });

        if (result.canceled || !result.filePaths.length) {
            return { success: false, cancelled: true };
        }

        try {
            const filePath = result.filePaths[0];
            const compressed = fs.readFileSync(filePath);
            const decompressed = await gunzip(compressed);
            const backup = JSON.parse(decompressed.toString('utf-8'));

            return {
                success: true,
                filePath,
                fileName: path.basename(filePath),
                exportedAt: backup.exportedAt,
                version: backup.version,
                stats: {
                    manga: backup.manga?.length || 0,
                    tags: backup.tags?.length || 0,
                    chapters: backup.chapters?.length || 0,
                    history: backup.history?.length || 0,
                    mangaTags: backup.mangaTags?.length || 0,
                    extensions: backup.extensions?.length || 0,
                },
                data: backup
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message || 'Failed to read backup file'
            };
        }
    });

    // Parse backup file
    ipcMain.handle('db:parseBackupFile', async (_, filePath: string) => {
        const zlib = await import('zlib');
        const { promisify } = await import('util');
        const gunzip = promisify(zlib.gunzip);

        try {
            if (!fs.existsSync(filePath)) {
                return { success: false, error: 'File not found' };
            }

            const compressed = fs.readFileSync(filePath);
            const decompressed = await gunzip(compressed);
            const backup = JSON.parse(decompressed.toString('utf-8'));

            return {
                success: true,
                filePath,
                fileName: path.basename(filePath),
                exportedAt: backup.exportedAt,
                version: backup.version,
                stats: {
                    manga: backup.manga?.length || 0,
                    tags: backup.tags?.length || 0,
                    chapters: backup.chapters?.length || 0,
                    history: backup.history?.length || 0,
                    mangaTags: backup.mangaTags?.length || 0,
                    extensions: backup.extensions?.length || 0,
                },
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message || 'Failed to parse backup file'
            };
        }
    });

    // Import backup with granular control
    ipcMain.handle('db:importBackup', async (_, { filePath, options }) => {
        try {
            if (filePath.endsWith('.mgb')) {
                const { importJsonBackup } = await import('../backup/jsonImporter');
                const win = BrowserWindow.getAllWindows()[0];

                const onProgress = (status: string, current: number, total: number) => {
                    if (win) {
                        win.webContents.send('import:progress', { status, current, total });
                    }
                };

                return await importJsonBackup(filePath, options, onProgress);
            } else {
                // Use statically imported importBackup
                const win = BrowserWindow.getAllWindows()[0];

                const onProgress = (status: string, current?: number, total?: number) => {
                    if (win) {
                        win.webContents.send('import:progress', { status, current: current || 0, total: total || 0 });
                    }
                };

                return await importBackup(filePath, onProgress);
            }
        } catch (error: any) {
            console.error('Import error:', error);
            return { success: false, error: error.message };
        }
    });

    // Clear all data
    ipcMain.handle('db:clearAllData', async () => {
        const dbPath = path.join(app.getPath('userData'), 'mangyomi.db');
        (db as any).close();

        if (fs.existsSync(dbPath)) {
            fs.unlinkSync(dbPath);
        }

        const newDb = await initDatabase(dbPath);
        (global as any).__mangyomiDb = newDb;

        console.log('Database cleared - fresh start');
        return { success: true };
    });

    // === Manga CRUD ===

    ipcMain.handle('db:getManga', async (_, id: string) => {
        return db.prepare('SELECT * FROM manga WHERE id = ?').get(id);
    });

    ipcMain.handle('db:getAllManga', async () => {
        return db.prepare(`
            SELECT 
                m.*,
                (SELECT COUNT(*) FROM chapter c WHERE c.manga_id = m.id) as total_chapters,
                (SELECT COUNT(*) FROM chapter c WHERE c.manga_id = m.id AND c.read_at IS NOT NULL) as read_chapters
            FROM manga m 
            WHERE m.in_library = 1 
            ORDER BY m.updated_at DESC
        `).all();
    });

    ipcMain.handle('db:addManga', async (_, manga: any) => {
        const stmt = db.prepare(`
            INSERT INTO manga (id, source_id, source_manga_id, title, cover_url, author, artist, description, status, in_library)
            VALUES (@id, @source_id, @source_manga_id, @title, @cover_url, @author, @artist, @description, @status, 1)
            ON CONFLICT(source_id, source_manga_id) DO UPDATE SET
            in_library = 1,
            title = excluded.title,
            cover_url = excluded.cover_url,
            updated_at = strftime('%s', 'now')
        `);
        stmt.run({
            id: manga.id,
            source_id: manga.source_id,
            source_manga_id: manga.source_manga_id,
            title: manga.title,
            cover_url: manga.cover_url,
            author: manga.author,
            artist: manga.artist,
            description: manga.description,
            status: manga.status
        });
    });

    ipcMain.handle('db:updateManga', async (_, id: string, data: any) => {
        const allowedColumns = new Set([
            'title', 'cover_url', 'author', 'artist', 'description', 'status',
            'in_library', 'anilist_id', 'total_chapters', 'read_chapters'
        ]);
        const safeData: Record<string, any> = {};
        for (const key of Object.keys(data)) {
            if (allowedColumns.has(key)) {
                safeData[key] = data[key];
            }
        }
        if (Object.keys(safeData).length === 0) return;

        const sets = Object.keys(safeData).map(key => `${key} = @${key}`).join(', ');
        const stmt = db.prepare(`UPDATE manga SET ${sets}, updated_at = strftime('%s', 'now') WHERE id = @id`);
        stmt.run({ ...safeData, id });
    });

    ipcMain.handle('db:deleteManga', async (_, id: string) => {
        db.prepare('UPDATE manga SET in_library = 0 WHERE id = ?').run(id);
    });

    ipcMain.handle('db:ensureManga', async (_, manga: any) => {
        const stmt = db.prepare(`
            INSERT OR IGNORE INTO manga (id, source_id, source_manga_id, title, cover_url, author, artist, description, status)
            VALUES (@id, @source_id, @source_manga_id, @title, @cover_url, @author, @artist, @description, @status)
        `);
        stmt.run({
            id: manga.id,
            source_id: manga.source_id,
            source_manga_id: manga.source_manga_id,
            title: manga.title,
            cover_url: manga.cover_url,
            author: manga.author,
            artist: manga.artist,
            description: manga.description,
            status: manga.status
        });
    });

    ipcMain.handle('db:updateMangaMetadata', async (_, mangaId: string, metadata: { cover_url?: string; title?: string; author?: string; description?: string }) => {
        const updates: string[] = [];
        const params: any = { id: mangaId };

        if (metadata.cover_url !== undefined && metadata.cover_url !== '') {
            updates.push('cover_url = @cover_url');
            params.cover_url = metadata.cover_url;
        }
        if (metadata.title !== undefined) {
            updates.push('title = @title');
            params.title = metadata.title;
        }
        if (metadata.author !== undefined) {
            updates.push('author = @author');
            params.author = metadata.author;
        }
        if (metadata.description !== undefined) {
            updates.push('description = @description');
            params.description = metadata.description;
        }

        if (updates.length === 0) return;

        const sql = `UPDATE manga SET ${updates.join(', ')} WHERE id = @id`;
        db.prepare(sql).run(params);
    });

    ipcMain.handle('db:cleanLibrary', async (_, deleteTags: boolean) => {
        const transaction = db.transaction(() => {
            db.prepare('DELETE FROM manga WHERE in_library = 1').run();
            if (deleteTags) {
                db.prepare('DELETE FROM tag').run();
            }
        });
        transaction();
        return { success: true };
    });

    // === Chapters ===

    ipcMain.handle('db:getChapters', async (_, mangaId: string) => {
        return db.prepare('SELECT * FROM chapter WHERE manga_id = ? ORDER BY chapter_number DESC').all(mangaId);
    });

    ipcMain.handle('db:addChapters', async (_, chapters: any[]) => {
        const stmt = db.prepare(`
            INSERT INTO chapter (id, manga_id, source_chapter_id, title, chapter_number, volume_number, url)
            VALUES (@id, @manga_id, @source_chapter_id, @title, @chapter_number, @volume_number, @url)
            ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            chapter_number = excluded.chapter_number,
            volume_number = excluded.volume_number,
            url = excluded.url
        `);
        const transaction = db.transaction((chapters: any[]) => {
            for (const chapter of chapters) {
                stmt.run({
                    id: chapter.id,
                    manga_id: chapter.manga_id,
                    source_chapter_id: chapter.source_chapter_id,
                    title: chapter.title,
                    chapter_number: chapter.chapter_number,
                    volume_number: chapter.volume_number,
                    url: chapter.url
                });
            }
        });
        transaction(chapters);
    });

    ipcMain.handle('db:markChapterRead', async (_, chapterId: string, pageNumber?: number) => {
        const chapter = db.prepare('SELECT * FROM chapter WHERE id = ?').get(chapterId) as any;
        if (chapter) {
            db.prepare(`UPDATE chapter SET read_at = strftime('%s', 'now'), last_page_read = ? WHERE id = ?`)
                .run(pageNumber || 0, chapterId);
            db.prepare(`INSERT INTO history (manga_id, chapter_id, page_number) VALUES (?, ?, ?)`)
                .run(chapter.manga_id, chapterId, pageNumber || 0);
        }
    });

    ipcMain.handle('db:markChapterUnread', async (_, chapterId: string) => {
        db.prepare('UPDATE chapter SET read_at = NULL, last_page_read = 0 WHERE id = ?').run(chapterId);
        db.prepare('DELETE FROM history WHERE chapter_id = ?').run(chapterId);
    });

    ipcMain.handle('db:markChaptersRead', async (_, chapterIds: string[]) => {
        const transaction = db.transaction((ids: string[]) => {
            const updateStmt = db.prepare(`UPDATE chapter SET read_at = strftime('%s', 'now') WHERE id = ?`);
            const getChapterStmt = db.prepare('SELECT id, manga_id FROM chapter WHERE id = ?');
            const insertHistoryStmt = db.prepare(`INSERT INTO history (manga_id, chapter_id, page_number) VALUES (?, ?, 0)`);

            for (const id of ids) {
                updateStmt.run(id);
                const chapter = getChapterStmt.get(id) as any;
                if (chapter) {
                    insertHistoryStmt.run(chapter.manga_id, chapter.id);
                }
            }
        });
        transaction(chapterIds);
    });

    ipcMain.handle('db:markChaptersUnread', async (_, chapterIds: string[]) => {
        const transaction = db.transaction((ids: string[]) => {
            const updateStmt = db.prepare('UPDATE chapter SET read_at = NULL, last_page_read = 0 WHERE id = ?');
            const deleteHistoryStmt = db.prepare('DELETE FROM history WHERE chapter_id = ?');

            for (const id of ids) {
                updateStmt.run(id);
                deleteHistoryStmt.run(id);
            }
        });
        transaction(chapterIds);
    });

    ipcMain.handle('db:saveReadingProgress', async (_, manga: any, chapter: any, pageNumber: number) => {
        const transaction = db.transaction(() => {
            const mangaStmt = db.prepare(`
                INSERT OR IGNORE INTO manga (id, source_id, source_manga_id, title, cover_url, author, artist, description, status)
                VALUES (@id, @source_id, @source_manga_id, @title, @cover_url, @author, @artist, @description, @status)
            `);
            mangaStmt.run({
                id: manga.id,
                source_id: manga.source_id,
                source_manga_id: manga.source_manga_id,
                title: manga.title,
                cover_url: manga.cover_url,
                author: manga.author,
                artist: manga.artist,
                description: manga.description,
                status: manga.status
            });

            const chapterStmt = db.prepare(`
                INSERT OR IGNORE INTO chapter (id, manga_id, source_chapter_id, title, chapter_number, volume_number, url)
                VALUES (@id, @manga_id, @source_chapter_id, @title, @chapter_number, @volume_number, @url)
            `);
            chapterStmt.run({
                id: chapter.id,
                manga_id: manga.id,
                source_chapter_id: chapter.source_chapter_id,
                title: chapter.title,
                chapter_number: chapter.chapter_number,
                volume_number: chapter.volume_number,
                url: chapter.url
            });

            db.prepare(`UPDATE chapter SET read_at = strftime('%s', 'now'), last_page_read = ? WHERE id = ?`)
                .run(pageNumber, chapter.id);

            const lastEntry = db.prepare('SELECT id, chapter_id FROM history ORDER BY read_at DESC LIMIT 1').get() as any;

            if (lastEntry && lastEntry.chapter_id === chapter.id) {
                db.prepare('UPDATE history SET read_at = strftime(\'%s\', \'now\'), page_number = ? WHERE id = ?')
                    .run(pageNumber, lastEntry.id);
            } else {
                db.prepare('DELETE FROM history WHERE manga_id = ?').run(manga.id);
                db.prepare(`INSERT INTO history (manga_id, chapter_id, page_number) VALUES (?, ?, ?)`)
                    .run(manga.id, chapter.id, pageNumber);
            }
        });

        transaction();
    });

    // === History ===

    ipcMain.handle('db:getHistory', async (_, limit: number = 50, offset: number = 0) => {
        return db.prepare(`
            SELECT h.*, m.title as manga_title, m.cover_url, m.source_id,
                   c.title as chapter_title, c.chapter_number
            FROM history h
            JOIN manga m ON h.manga_id = m.id
            JOIN chapter c ON h.chapter_id = c.id
            WHERE h.id IN (
                SELECT h2.id FROM history h2
                INNER JOIN (
                    SELECT manga_id, MAX(read_at) as max_read_at
                    FROM history
                    GROUP BY manga_id
                ) latest ON h2.manga_id = latest.manga_id AND h2.read_at = latest.max_read_at
                GROUP BY h2.manga_id
            )
            ORDER BY h.read_at DESC
            LIMIT ? OFFSET ?
        `).all(limit, offset);
    });

    ipcMain.handle('db:deleteHistory', async (_, mangaId: string) => {
        db.prepare('DELETE FROM history WHERE manga_id = ?').run(mangaId);
    });

    ipcMain.handle('db:clearAllHistory', async () => {
        db.prepare('DELETE FROM history').run();
    });

    // === Prefetch History ===

    ipcMain.handle('db:createPrefetchHistory', async (_, data: {
        mangaId: string;
        mangaTitle: string;
        extensionId: string;
        totalChapters: number;
    }) => {
        try {
            console.log('Creating prefetch history:', data);
            const result = db.prepare(`
                INSERT INTO prefetch_history (manga_id, manga_title, extension_id, status, total_chapters)
                VALUES (@mangaId, @mangaTitle, @extensionId, 'in_progress', @totalChapters)
            `).run({
                mangaId: data.mangaId,
                mangaTitle: data.mangaTitle,
                extensionId: data.extensionId,
                totalChapters: data.totalChapters,
            });
            console.log('Created prefetch history with ID:', result.lastInsertRowid);
            return result.lastInsertRowid;
        } catch (e) {
            console.error('Failed to create prefetch history:', e);
            throw e;
        }
    });

    ipcMain.handle('db:updatePrefetchHistory', async (_, id: number, data: {
        status?: string;
        completedChapters?: number;
        totalPages?: number;
        successCount?: number;
        failedCount?: number;
        skippedCount?: number;
        failedPages?: { url: string; chapter: string; error: string }[];
    }) => {
        const updates: string[] = [];
        const params: any = { id: id };

        if (data.status !== undefined) {
            updates.push('status = @status');
            params.status = data.status;
            if (data.status === 'completed' || data.status === 'cancelled' || data.status === 'failed') {
                updates.push("completed_at = strftime('%s', 'now')");
            }
        }
        if (data.completedChapters !== undefined) {
            updates.push('completed_chapters = @completedChapters');
            params.completedChapters = data.completedChapters;
        }
        if (data.totalPages !== undefined) {
            updates.push('total_pages = @totalPages');
            params.totalPages = data.totalPages;
        }
        if (data.successCount !== undefined) {
            updates.push('success_count = @successCount');
            params.successCount = data.successCount;
        }
        if (data.failedCount !== undefined) {
            updates.push('failed_count = @failedCount');
            params.failedCount = data.failedCount;
        }
        if (data.skippedCount !== undefined) {
            updates.push('skipped_count = @skippedCount');
            params.skippedCount = data.skippedCount;
        }
        if (data.failedPages !== undefined) {
            updates.push('failed_pages = @failedPages');
            params.failedPages = JSON.stringify(data.failedPages);
        }

        if (updates.length === 0) return;

        const sql = `UPDATE prefetch_history SET ${updates.join(', ')} WHERE id = @id`;
        db.prepare(sql).run(params);
    });

    ipcMain.handle('db:getPrefetchHistory', async (_, mangaId?: string, limit: number = 50) => {
        if (mangaId) {
            return db.prepare(`
                SELECT * FROM prefetch_history 
                WHERE manga_id = ? 
                ORDER BY started_at DESC 
                LIMIT ?
            `).all(mangaId, limit);
        }
        return db.prepare(`
            SELECT * FROM prefetch_history 
            ORDER BY started_at DESC 
            LIMIT ?
        `).all(limit);
    });

    ipcMain.handle('db:clearPrefetchHistory', async (_, mangaId?: string) => {
        if (mangaId) {
            db.prepare('DELETE FROM prefetch_history WHERE manga_id = ?').run(mangaId);
        } else {
            db.prepare('DELETE FROM prefetch_history').run();
        }
    });

    // === Tags ===

    ipcMain.handle('db:getTags', async () => {
        return db.prepare(`
            SELECT t.id, t.name, t.color, t.is_nsfw, COUNT(mt.manga_id) as count 
            FROM tag t 
            LEFT JOIN manga_tag mt ON t.id = mt.tag_id 
            GROUP BY t.id 
            ORDER BY t.name
        `).all();
    });

    ipcMain.handle('db:createTag', async (_, name: string, color: string, isNsfw: boolean = false) => {
        const result = db.prepare('INSERT INTO tag (name, color, is_nsfw) VALUES (?, ?, ?)').run(name, color, isNsfw ? 1 : 0);
        return { id: result.lastInsertRowid, name, color, is_nsfw: isNsfw ? 1 : 0 };
    });

    ipcMain.handle('db:updateTag', async (_, id: number, name: string, color: string, isNsfw: boolean = false) => {
        db.prepare('UPDATE tag SET name = ?, color = ?, is_nsfw = ? WHERE id = ?').run(name, color, isNsfw ? 1 : 0, id);
    });

    ipcMain.handle('db:deleteTag', async (_, id: number) => {
        db.prepare('DELETE FROM tag WHERE id = ?').run(id);
    });

    ipcMain.handle('db:addTagToManga', async (_, mangaId: string, tagId: number) => {
        db.prepare('INSERT OR IGNORE INTO manga_tag (manga_id, tag_id) VALUES (?, ?)').run(mangaId, tagId);
    });

    ipcMain.handle('db:removeTagFromManga', async (_, mangaId: string, tagId: number) => {
        db.prepare('DELETE FROM manga_tag WHERE manga_id = ? AND tag_id = ?').run(mangaId, tagId);
    });

    ipcMain.handle('db:getMangaByTag', async (_, tagId: number) => {
        return db.prepare(`
            SELECT m.* FROM manga m
            JOIN manga_tag mt ON m.id = mt.manga_id
            WHERE mt.tag_id = ?
            ORDER BY m.title
        `).all(tagId);
    });

    ipcMain.handle('db:getTagsForManga', async (_, mangaId: string) => {
        return db.prepare(`
            SELECT t.* FROM tag t
            JOIN manga_tag mt ON t.id = mt.tag_id
            WHERE mt.manga_id = ?
            ORDER BY t.name
        `).all(mangaId);
    });

    // === Adaptive Prefetch: Reading Stats ===

    ipcMain.handle('db:recordReadingStats', async (_, data: {
        sessionDate: number;
        sourceId: string;
        mangaId: string;
        chapterId: string;
        pagesViewed: number;
        readingTimeSeconds: number;
        chaptersCompleted: number;
        avgVelocity: number;
        forwardNavigations: number;
        backwardNavigations: number;
        startedAt: number;
        endedAt: number;
    }) => {
        // Record the session stats
        db.prepare(`
            INSERT INTO reading_stats (session_date, source_id, manga_id, chapter_id, 
                pages_viewed, reading_time_seconds, chapters_completed, avg_velocity,
                forward_navigations, backward_navigations, started_at, ended_at)
            VALUES (@sessionDate, @sourceId, @mangaId, @chapterId,
                @pagesViewed, @readingTimeSeconds, @chaptersCompleted, @avgVelocity,
                @forwardNavigations, @backwardNavigations, @startedAt, @endedAt)
            ON CONFLICT(session_date, manga_id, chapter_id) DO UPDATE SET
                pages_viewed = pages_viewed + excluded.pages_viewed,
                reading_time_seconds = reading_time_seconds + excluded.reading_time_seconds,
                chapters_completed = MAX(chapters_completed, excluded.chapters_completed),
                avg_velocity = excluded.avg_velocity,
                ended_at = excluded.ended_at
        `).run(data);

        // Update daily aggregates and streak
        const todayMidnight = Math.floor(Date.now() / 86400000) * 86400;
        const yesterdayMidnight = todayMidnight - 86400;

        // Check yesterday's streak
        const yesterdayStats = db.prepare(
            `SELECT streak_days FROM reading_stats_daily WHERE date = ?`
        ).get(yesterdayMidnight) as { streak_days: number } | undefined;

        const previousStreak = yesterdayStats?.streak_days || 0;

        // If today already has stats, maintain streak; otherwise increment from yesterday
        const todayExists = db.prepare(
            `SELECT 1 FROM reading_stats_daily WHERE date = ?`
        ).get(todayMidnight);

        const newStreak = todayExists ? previousStreak : previousStreak + 1;

        // Aggregate today's stats
        const todayAgg = db.prepare(`
            SELECT 
                COALESCE(SUM(pages_viewed), 0) as total_pages,
                COALESCE(SUM(chapters_completed), 0) as total_chapters,
                COALESCE(SUM(reading_time_seconds), 0) as total_time,
                COUNT(DISTINCT manga_id) as unique_manga,
                COALESCE(AVG(avg_velocity), 0) as avg_velocity
            FROM reading_stats WHERE session_date = ?
        `).get(todayMidnight) as any;

        // Upsert daily stats
        db.prepare(`
            INSERT INTO reading_stats_daily (date, total_pages, total_chapters, 
                total_reading_time_seconds, unique_manga_count, avg_velocity, streak_days)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(date) DO UPDATE SET
                total_pages = excluded.total_pages,
                total_chapters = excluded.total_chapters,
                total_reading_time_seconds = excluded.total_reading_time_seconds,
                unique_manga_count = excluded.unique_manga_count,
                avg_velocity = excluded.avg_velocity
        `).run(
            todayMidnight,
            todayAgg?.total_pages || 0,
            todayAgg?.total_chapters || 0,
            todayAgg?.total_time || 0,
            todayAgg?.unique_manga || 0,
            todayAgg?.avg_velocity || 0,
            newStreak
        );
    });

    ipcMain.handle('db:getReadingStatsSummary', async () => {
        const todayMidnight = Math.floor(Date.now() / 86400000) * 86400;
        const weekAgo = todayMidnight - (7 * 86400);

        const todayResult = db.prepare(`SELECT COALESCE(SUM(reading_time_seconds), 0) as total FROM reading_stats WHERE session_date = ?`).get(todayMidnight) as { total: number } | undefined;
        const weekResult = db.prepare(`SELECT COALESCE(SUM(chapters_completed), 0) as total FROM reading_stats WHERE session_date >= ?`).get(weekAgo) as { total: number } | undefined;
        const streakResult = db.prepare(`SELECT streak_days FROM reading_stats_daily ORDER BY date DESC LIMIT 1`).get() as { streak_days: number } | undefined;
        const velocityResult = db.prepare(`SELECT COALESCE(AVG(avg_velocity), 0) as avg FROM reading_stats WHERE avg_velocity > 0`).get() as { avg: number } | undefined;
        const pagesResult = db.prepare(`SELECT COALESCE(SUM(pages_viewed), 0) as total FROM reading_stats`).get() as { total: number } | undefined;

        return {
            todaySeconds: todayResult?.total || 0,
            weekChapters: weekResult?.total || 0,
            streak: streakResult?.streak_days || 0,
            avgVelocity: velocityResult?.avg || 0,
            totalPages: pagesResult?.total || 0,
        };
    });

    // === Adaptive Prefetch: Source Behavior ===

    ipcMain.handle('db:updateSourceBehavior', async (_, data: {
        sourceId: string;
        currentRequestRate: number;
        maxObservedRate: number;
        initialRate: number;
        maxRate: number;
        consecutiveFailures: number;
        totalRequests: number;
        failedRequests: number;
        lastRateLimitTime: number | null;
        avgResponseTimeMs: number;
        backoffUntil: number | null;
        backoffMultiplier: number;
    }) => {
        db.prepare(`
            INSERT INTO source_behavior (source_id, current_request_rate, max_observed_rate,
                initial_rate, max_rate, consecutive_failures, total_requests, failed_requests,
                last_rate_limit_time, avg_response_time_ms, backoff_until, backoff_multiplier,
                updated_at)
            VALUES (@sourceId, @currentRequestRate, @maxObservedRate,
                @initialRate, @maxRate, @consecutiveFailures, @totalRequests, @failedRequests,
                @lastRateLimitTime, @avgResponseTimeMs, @backoffUntil, @backoffMultiplier,
                strftime('%s', 'now'))
            ON CONFLICT(source_id) DO UPDATE SET
                current_request_rate = excluded.current_request_rate,
                max_observed_rate = excluded.max_observed_rate,
                consecutive_failures = excluded.consecutive_failures,
                total_requests = excluded.total_requests,
                failed_requests = excluded.failed_requests,
                last_rate_limit_time = excluded.last_rate_limit_time,
                avg_response_time_ms = excluded.avg_response_time_ms,
                backoff_until = excluded.backoff_until,
                backoff_multiplier = excluded.backoff_multiplier,
                updated_at = strftime('%s', 'now')
        `).run(data);
    });

    ipcMain.handle('db:getSourceBehavior', async (_, sourceId: string) => {
        return db.prepare('SELECT * FROM source_behavior WHERE source_id = ?').get(sourceId);
    });

    ipcMain.handle('db:getAllSourceBehaviors', async () => {
        return db.prepare('SELECT * FROM source_behavior').all();
    });

    // Clear all adaptive prefetch training data (source behavior only, not reading stats)
    ipcMain.handle('db:clearAdaptiveTraining', async () => {
        db.prepare('DELETE FROM source_behavior').run();
        return { success: true };
    });
}
