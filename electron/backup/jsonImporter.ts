import * as fs from 'fs';
import { getDatabase } from '../database';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gunzip = promisify(zlib.gunzip);

export interface ImportOptions {
    manga: boolean;
    chapters: boolean;
    tags: boolean;
    categories: boolean;
    history: boolean;
    extensions: boolean;
    mergeStrategy: 'keep' | 'overwrite';
}

export interface ImportCounts {
    manga: number;
    chapters: number;
    history: number;
    extensions: number;
    tags: number;
}

export async function importJsonBackup(
    filePath: string,
    options: ImportOptions,
    onProgress: (status: string, current: number, total: number) => void
): Promise<{ success: boolean; counts?: ImportCounts; error?: string }> {
    try {
        const db = getDatabase();

        // Handle potentially compressed file
        let data: string;
        try {
            const compressed = fs.readFileSync(filePath);
            try {
                // Try to gunzip first (standard .mgb format)
                const decompressed = await gunzip(compressed);
                data = decompressed.toString('utf-8');
            } catch (e) {
                // If gunzip fails, try reading as plain text (legacy or plain .json)
                data = compressed.toString('utf-8');
            }
        } catch (e) {
            throw new Error('Failed to read backup file');
        }

        const backup = JSON.parse(data);

        const counts: ImportCounts = {
            manga: 0,
            chapters: 0,
            history: 0,
            extensions: 0,
            tags: 0
        };

        const shouldOverwrite = options.mergeStrategy === 'overwrite';
        const CHUNK_SIZE = 50;

        // --- Import Manga ---
        if (options.manga && backup.manga) {
            const total = backup.manga.length;
            const chunks = Math.ceil(total / CHUNK_SIZE);

            onProgress('Preparing to import manga...', 0, total);

            for (let i = 0; i < chunks; i++) {
                const start = i * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE, total);
                const chunk = backup.manga.slice(start, end);

                onProgress(`Importing manga (${start + 1}-${end} of ${total})...`, start, total);

                // Run chunk in transaction
                const transaction = db.transaction(() => {
                    const insertManga = db.prepare(`
                        INSERT INTO manga (id, source_id, source_manga_id, title, cover_url, author, artist, description, status, added_at)
                        VALUES (@id, @source_id, @source_manga_id, @title, @cover_url, @author, @artist, @description, @status, @added_at)
                        ON CONFLICT(id) DO UPDATE SET
                        title = excluded.title, cover_url = excluded.cover_url, author = excluded.author,
                        artist = excluded.artist, description = excluded.description, status = excluded.status
                    `);

                    for (const m of chunk) {
                        try {
                            insertManga.run({
                                id: m.id, source_id: m.source_id, source_manga_id: m.source_manga_id,
                                title: m.title, cover_url: m.cover_url, author: m.author,
                                artist: m.artist, description: m.description, status: m.status,
                                added_at: m.added_at
                            });
                            counts.manga++;

                            // Import Tags for this manga
                            if (m.genre) {
                                let tags: string[] = [];
                                try {
                                    tags = Array.isArray(m.genre) ? m.genre : JSON.parse(m.genre);
                                } catch (e) {
                                    // ignore parse error
                                }

                                if (tags.length > 0) {
                                    const insertTag = db.prepare(`INSERT OR IGNORE INTO tag (id, name, is_nsfw) VALUES (@id, @name, 0)`);
                                    const insertMangaTag = db.prepare(`INSERT OR IGNORE INTO manga_tag (manga_id, tag_id) VALUES (@manga_id, @tag_id)`);

                                    for (const tagName of tags) {
                                        const tagId = tagName.toLowerCase().trim();
                                        insertTag.run({ id: tagId, name: tagName.trim() });
                                        insertMangaTag.run({ manga_id: m.id, tag_id: tagId });
                                        counts.tags++; // Counting tag associations, roughly
                                    }
                                }
                            }
                        } catch (e) {
                            console.error(`Failed to import manga ${m.id}:`, e);
                        }
                    }
                });

                transaction();
                // Yield to event loop
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }

        // --- Import Tags & MangaTags ---
        // Import user-created tags and their associations with manga
        if (options.tags && backup.tags && backup.mangaTags) {
            onProgress('Importing tags...', 0, backup.tags.length);

            const transaction = db.transaction(() => {
                // Import tags
                const insertTag = db.prepare(`
                    INSERT INTO tag (id, name, color, is_nsfw)
                    VALUES (@id, @name, @color, @is_nsfw)
                    ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name, color = excluded.color, is_nsfw = excluded.is_nsfw
                `);

                for (const tag of backup.tags) {
                    insertTag.run({
                        id: tag.id,
                        name: tag.name,
                        color: tag.color || '#808080',
                        is_nsfw: tag.is_nsfw || 0
                    });
                    counts.tags++;
                }

                // Import manga_tag associations
                const insertMangaTag = db.prepare(`
                    INSERT OR IGNORE INTO manga_tag (manga_id, tag_id)
                    VALUES (@manga_id, @tag_id)
                `);

                for (const mt of backup.mangaTags) {
                    try {
                        insertMangaTag.run({
                            manga_id: mt.manga_id,
                            tag_id: mt.tag_id
                        });
                    } catch (e) {
                        // Ignore FK errors if manga doesn't exist
                    }
                }
            });

            transaction();
        }


        // --- Import Chapters ---
        if (options.chapters && backup.chapters) {
            const total = backup.chapters.length;
            const chunks = Math.ceil(total / CHUNK_SIZE);

            onProgress('Preparing to import chapters...', 0, total);

            for (let i = 0; i < chunks; i++) {
                const start = i * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE, total);
                const chunk = backup.chapters.slice(start, end);

                onProgress(`Importing chapters (${start + 1}-${end} of ${total})...`, start, total);

                const transaction = db.transaction(() => {
                    const chapterSql = shouldOverwrite
                        ? `INSERT INTO chapter (id, manga_id, source_chapter_id, title, chapter_number, volume_number, url, read_at, page_count, last_page_read, added_at)
                           VALUES (@id, @manga_id, @source_chapter_id, @title, @chapter_number, @volume_number, @url, @read_at, @page_count, @last_page_read, @added_at)
                           ON CONFLICT(id) DO UPDATE SET
                           read_at = excluded.read_at, last_page_read = excluded.last_page_read`
                        : `INSERT OR IGNORE INTO chapter (id, manga_id, source_chapter_id, title, chapter_number, volume_number, url, read_at, page_count, last_page_read, added_at)
                           VALUES (@id, @manga_id, @source_chapter_id, @title, @chapter_number, @volume_number, @url, @read_at, @page_count, @last_page_read, @added_at)`;

                    const insertChapter = db.prepare(chapterSql);

                    for (const c of chunk) {
                        try {
                            insertChapter.run({
                                id: c.id, manga_id: c.manga_id, source_chapter_id: c.source_chapter_id,
                                title: c.title, chapter_number: c.chapter_number, volume_number: c.volume_number,
                                url: c.url, read_at: c.read_at, page_count: c.page_count,
                                last_page_read: c.last_page_read, added_at: c.added_at
                            });
                            counts.chapters++;
                        } catch (e) {
                            // Ignore FK errors (e.g. if manga wasn't imported)
                        }
                    }
                });

                transaction();
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }

        // --- Import History ---
        if (options.history && backup.history) {
            const total = backup.history.length;
            const chunks = Math.ceil(total / CHUNK_SIZE);

            onProgress('Preparing to import history...', 0, total);

            for (let i = 0; i < chunks; i++) {
                const start = i * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE, total);
                const chunk = backup.history.slice(start, end);

                onProgress(`Importing history (${start + 1}-${end} of ${total})...`, start, total);

                const transaction = db.transaction(() => {
                    const checkStmt = db.prepare('SELECT id FROM history WHERE chapter_id = ?');
                    const updateStmt = db.prepare('UPDATE history SET read_at = @read_at WHERE id = @id');
                    const insertStmt = db.prepare('INSERT INTO history (chapter_id, read_at) VALUES (@chapter_id, @read_at)');

                    for (const h of chunk) {
                        try {
                            const existing = checkStmt.get(h.chapter_id) as { id: number } | undefined;

                            if (existing) {
                                if (shouldOverwrite) {
                                    updateStmt.run({ read_at: h.read_at, id: existing.id });
                                    counts.history++;
                                }
                            } else {
                                insertStmt.run({ chapter_id: h.chapter_id, read_at: h.read_at });
                                counts.history++;
                            }
                        } catch (e) {
                            // Ignore FK errors
                        }
                    }
                });

                transaction();
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }

        // --- Import Extensions ---
        if (options.extensions && backup.extensions) {
            onProgress('Importing extensions...', 0, backup.extensions.length);

            // Extensions are usually few, so we can do them in one go or small chunks. 
            // Reuse logic for consistency.
            const transaction = db.transaction(() => {
                const extSql = shouldOverwrite
                    ? `INSERT INTO extension (id, name, version, enabled, installed_at) 
                       VALUES (@id, @name, @version, @enabled, @installed_at)
                       ON CONFLICT(id) DO UPDATE SET
                       version = excluded.version, enabled = excluded.enabled`
                    : `INSERT OR IGNORE INTO extension (id, name, version, enabled, installed_at) 
                       VALUES (@id, @name, @version, @enabled, @installed_at)`;

                const insertExt = db.prepare(extSql);
                for (const e of backup.extensions) {
                    insertExt.run({
                        id: e.id, name: e.name, version: e.version,
                        enabled: e.enabled, installed_at: e.installed_at
                    });
                    counts.extensions++;
                }
            });
            transaction();
        }

        return { success: true, counts };

    } catch (error: any) {
        console.error('JSON Import failed:', error);
        return { success: false, error: error.message };
    }
}
