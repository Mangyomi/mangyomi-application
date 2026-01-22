/**
 * Extensions IPC Handlers
 */
import { ipcMain, BrowserWindow, net, dialog } from 'electron';
import { getDatabase } from '../database';
import {
    getExtension,
    getAllExtensions,
    reloadExtensions,
    setActiveExtension,
    clearActiveExtension
} from '../extensions/loader';
import {
    listAvailableExtensions,
    installExtension,
    uninstallExtension,
    installLocalExtension
} from '../extensions/installer';
import {
    destroySandbox,
    registerStreamingPagesCallback,
    unregisterStreamingPagesCallback,
    executeInSandbox
} from '../extensions/sandbox/sandboxRunner';
import * as fs from 'fs';
import * as path from 'path';

let streamingAbortController: AbortController | null = null;

interface ValidationResult {
    valid: boolean;
    id?: string;
    name?: string;
    errors: string[];
}

/**
 * Validate an extension folder has required files and manifest fields
 */
function validateExtension(extPath: string): ValidationResult {
    const errors: string[] = [];
    let id: string | undefined;
    let name: string | undefined;

    // Check manifest.json exists
    const manifestPath = path.join(extPath, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
        errors.push('Missing manifest.json');
        return { valid: false, errors };
    }

    // Check index.js or source.js exists
    const indexPath = path.join(extPath, 'index.js');
    const sourcePath = path.join(extPath, 'source.js');
    if (!fs.existsSync(indexPath) && !fs.existsSync(sourcePath)) {
        errors.push('Missing index.js or source.js');
    }

    // Parse and validate manifest
    try {
        const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
        const manifest = JSON.parse(manifestContent);

        // Check required fields
        if (!manifest.id) errors.push('Manifest missing required field: id');
        if (!manifest.name) errors.push('Manifest missing required field: name');
        if (!manifest.version && manifest.version !== 0) errors.push('Manifest missing required field: version');
        if (!manifest.baseUrl) errors.push('Manifest missing required field: baseUrl');

        id = manifest.id;
        name = manifest.name;
    } catch (e) {
        errors.push(`Invalid manifest.json: ${(e as Error).message}`);
    }

    return {
        valid: errors.length === 0,
        id,
        name,
        errors
    };
}

/**
 * Find all valid extension folders in a directory
 */
function findExtensionsInDirectory(dirPath: string): string[] {
    const extensions: string[] = [];

    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
        return extensions;
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isDirectory()) {
            const extPath = path.join(dirPath, entry.name);
            const validation = validateExtension(extPath);
            if (validation.valid) {
                extensions.push(extPath);
            }
        }
    }

    return extensions;
}

export function setupExtensionHandlers(extensionsPath: string) {
    const db = getDatabase();

    // Sandbox lifecycle
    ipcMain.handle('extensions:setActive', async (_, extensionId: string) => {
        setActiveExtension(extensionId);
    });

    ipcMain.handle('extensions:clearActive', async (_, extensionId: string) => {
        clearActiveExtension(extensionId);
    });

    ipcMain.handle('extensions:destroySandbox', async (_, extensionId: string) => {
        clearActiveExtension(extensionId);
        destroySandbox(extensionId);
    });

    // Lazy image URL resolution (like Tachiyomi's imageUrlParse)
    ipcMain.handle('extensions:getImageUrl', async (_, extensionId: string, pageUrl: string) => {
        const ext = getExtension(extensionId);
        if (!ext) throw new Error(`Extension ${extensionId} not found`);
        if (ext.getImageUrl) {
            return await ext.getImageUrl(pageUrl);
        }
        // Fallback - return original URL if extension doesn't support lazy loading
        return pageUrl;
    });

    // Extension listing
    ipcMain.handle('ext:getAll', async () => {
        return getAllExtensions().map(ext => ({
            id: ext.id,
            name: ext.name,
            version: ext.version,
            baseUrl: ext.baseUrl,
            icon: ext.icon,
            language: ext.language,
            nsfw: ext.nsfw,
        }));
    });

    ipcMain.handle('ext:getFilters', async (_, extensionId: string) => {
        const ext = getExtension(extensionId);
        if (!ext) return [];
        return ext.getFilters ? await ext.getFilters() : [];
    });

    // Manga operations
    ipcMain.handle('ext:getPopularManga', async (_, extensionId: string, page: number, filters?: Record<string, string | string[]>) => {
        const ext = getExtension(extensionId);
        if (!ext) throw new Error(`Extension ${extensionId} not found`);
        return ext.getPopularManga(page, filters);
    });

    ipcMain.handle('ext:getLatestManga', async (_, extensionId: string, page: number, filters?: Record<string, string | string[]>) => {
        const ext = getExtension(extensionId);
        if (!ext) throw new Error(`Extension ${extensionId} not found`);
        return ext.getLatestManga(page, filters);
    });

    ipcMain.handle('ext:searchManga', async (_, extensionId: string, query: string, page: number, filters?: Record<string, string | string[]>) => {
        const ext = getExtension(extensionId);
        if (!ext) throw new Error(`Extension ${extensionId} not found`);
        return ext.searchManga(query, page, filters);
    });

    ipcMain.handle('extensions:getMangaDetails', async (_event, extensionId: string, mangaId: string) => {
        const ext = getExtension(extensionId);
        if (!ext) throw new Error(`Extension ${extensionId} not found`);
        return await ext.getMangaDetails(mangaId);
    });

    ipcMain.handle('extensions:getMangaCover', async (_event, extensionId: string, mangaId: string) => {
        const ext = getExtension(extensionId);
        if (!ext) throw new Error(`Extension ${extensionId} not found`);

        if (ext.getMangaCover) {
            try {
                const cover = await ext.getMangaCover(mangaId);
                if (cover) {
                    const headers: Record<string, string> = {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    };

                    if (extensionId === 'mangakakalot') {
                        headers['Referer'] = 'https://www.mangakakalot.gg/';
                    } else if (extensionId === 'manganato') {
                        headers['Referer'] = 'https://manganato.com/';
                    } else if (extensionId === 'chapmanganato') {
                        headers['Referer'] = 'https://chapmanganato.com/';
                    } else if (extensionId === 'toonily') {
                        headers['Referer'] = 'https://toonily.com/';
                    }

                    if (ext.getImageHeaders) {
                        Object.assign(headers, ext.getImageHeaders());
                    }

                    try {
                        const response = await net.fetch(cover, { method: 'HEAD', headers });
                        if (response.ok) {
                            return cover;
                        }
                        console.warn(`[Extensions] Optimized cover URL failed verification (${response.status})`);
                    } catch (verifyError) {
                        console.warn(`[Extensions] Optimized cover URL verification error:`, verifyError);
                    }
                }
            } catch (e) {
                console.warn(`[Extensions] getMangaCover failed for ${extensionId}:`, e);
            }
        }

        return null;
    });

    // Chapter operations
    ipcMain.handle('extensions:getChapterList', async (_event, extensionId: string, mangaId: string) => {
        const ext = getExtension(extensionId);
        if (!ext) throw new Error(`Extension ${extensionId} not found`);
        return ext.getChapterList(mangaId);
    });

    ipcMain.handle('ext:getChapterPages', async (_, extensionId: string, chapterId: string) => {
        const ext = getExtension(extensionId);
        if (!ext) throw new Error(`Extension ${extensionId} not found`);
        return ext.getChapterPages(chapterId);
    });

    // Streaming page loading
    ipcMain.on('ext:getChapterPagesStreaming', async (event, extensionId: string, chapterId: string) => {
        const ext = getExtension(extensionId);
        if (!ext) {
            event.sender.send('ext:chapterPagesProgress', { pages: [], done: true, error: 'Extension not found' });
            return;
        }

        if (streamingAbortController) {
            streamingAbortController.abort();
            unregisterStreamingPagesCallback(extensionId);
        }
        streamingAbortController = new AbortController();
        const signal = streamingAbortController.signal;

        console.log(`[Main] Registering streaming callback for ${extensionId}`);
        registerStreamingPagesCallback(extensionId, (data) => {
            console.log(`[Main] Streaming callback received: ${data.pages?.length || 0} pages, done=${data.done}`);
            if (!signal.aborted) {
                event.sender.send('ext:chapterPagesProgress', data);
            }
            if (data.done) {
                unregisterStreamingPagesCallback(extensionId);
            }
        });

        try {
            const hasStreamingMethod = await executeInSandbox(extensionId, '__hasMethod__', ['getChapterPagesStreaming']);
            console.log(`[Main] Extension ${extensionId} hasStreamingMethod: ${hasStreamingMethod}`);

            if (hasStreamingMethod) {
                console.log(`[Main] Calling getChapterPagesStreaming for ${chapterId}`);
                await executeInSandbox(extensionId, 'getChapterPagesStreaming', [chapterId]);
                console.log(`[Main] getChapterPagesStreaming completed`);
            } else {
                const pages = await ext.getChapterPages(chapterId);
                if (!signal.aborted) {
                    event.sender.send('ext:chapterPagesProgress', { pages, done: true, total: pages.length });
                }
                unregisterStreamingPagesCallback(extensionId);
            }
        } catch (error: any) {
            if (!signal.aborted) {
                event.sender.send('ext:chapterPagesProgress', {
                    pages: [],
                    done: true,
                    error: error.message || 'Failed to load pages'
                });
            }
            unregisterStreamingPagesCallback(extensionId);
        }
    });

    ipcMain.on('ext:cancelChapterPagesStreaming', (_, extensionId?: string) => {
        if (streamingAbortController) {
            streamingAbortController.abort();
            streamingAbortController = null;
        }
        if (extensionId) {
            unregisterStreamingPagesCallback(extensionId);
        }
    });

    // Chapter pages cache (with 1 week TTL)
    const WEEK_IN_SECONDS = 7 * 24 * 60 * 60;

    ipcMain.handle('ext:getCachedChapterPages', async (_, chapterId: string) => {
        try {
            const now = Math.floor(Date.now() / 1000);
            const row = db.prepare(`
                SELECT pages FROM chapter_pages 
                WHERE chapter_id = @chapterId AND cached_at > @minTime
            `).get({
                chapterId: chapterId,
                minTime: now - WEEK_IN_SECONDS
            }) as { pages: string } | undefined;
            if (row) {
                console.log(`[Main] Found cached pages for ${chapterId}`);
                return JSON.parse(row.pages);
            }
            return null;
        } catch (e) {
            console.error('[Main] Error getting cached chapter pages:', e);
            return null;
        }
    });

    ipcMain.handle('ext:cacheChapterPages', async (_, chapterId: string, extensionId: string, pages: string[]) => {
        try {
            db.prepare(`
                INSERT OR REPLACE INTO chapter_pages (chapter_id, extension_id, pages, cached_at)
                VALUES (@chapterId, @extensionId, @pages, strftime('%s', 'now'))
            `).run({
                chapterId: chapterId,
                extensionId: extensionId,
                pages: JSON.stringify(pages)
            });
            console.log(`[Main] Cached ${pages.length} pages for chapter ${chapterId}`);
            return true;
        } catch (e) {
            console.error('[Main] Error caching chapter pages:', e);
            return false;
        }
    });

    // Extension management
    ipcMain.handle('ext:listAvailable', async (_, repoUrl: string) => {
        try {
            const available = await listAvailableExtensions(repoUrl);
            return available.map(ext => ({
                id: ext.id,
                name: ext.name,
                version: ext.version,
                repoUrl: ext.repoUrl,
                icon: ext.icon,
                language: ext.language,
                nsfw: ext.nsfw,
            }));
        } catch (e) {
            console.error('Failed to list available extensions:', e);
            throw e;
        }
    });

    ipcMain.handle('ext:install', async (_, repoUrl: string, extensionId: string) => {
        const result = await installExtension(repoUrl, extensionId, extensionsPath);
        if (result.success) {
            await reloadExtensions(extensionsPath);
        }
        return result;
    });

    ipcMain.handle('ext:uninstall', async (_, extensionId: string) => {
        const result = uninstallExtension(extensionId, extensionsPath);
        if (result.success) {
            await reloadExtensions(extensionsPath);
        }
        return result;
    });

    ipcMain.handle('ext:sideload', async () => {
        const result = await dialog.showOpenDialog({
            properties: ['openDirectory'],
            title: 'Select Extension Directory',
            buttonLabel: 'Install Extension'
        });

        if (result.canceled || result.filePaths.length === 0) {
            return { success: false, error: 'Installation cancelled' };
        }

        const sourcePath = result.filePaths[0];

        // Validate before installing
        const validation = validateExtension(sourcePath);
        if (!validation.valid) {
            return {
                success: false,
                error: `Invalid extension: ${validation.errors.join(', ')}`
            };
        }

        const installResult = installLocalExtension(sourcePath, extensionsPath);

        if (installResult.success) {
            await reloadExtensions(extensionsPath);
        }

        return installResult;
    });

    // Bulk sideload - scan directory for extensions
    ipcMain.handle('ext:sideloadBulk', async () => {
        const result = await dialog.showOpenDialog({
            properties: ['openDirectory'],
            title: 'Select Extensions Folder',
            buttonLabel: 'Scan for Extensions'
        });

        if (result.canceled || result.filePaths.length === 0) {
            return { success: false, error: 'Cancelled', installed: 0, failed: 0 };
        }

        const scanPath = result.filePaths[0];
        const validExtensions = findExtensionsInDirectory(scanPath);

        if (validExtensions.length === 0) {
            return {
                success: false,
                error: 'No valid extensions found in this directory',
                installed: 0,
                failed: 0
            };
        }

        let installed = 0;
        let failed = 0;
        const errors: string[] = [];

        for (const extPath of validExtensions) {
            const validation = validateExtension(extPath);
            const installResult = installLocalExtension(extPath, extensionsPath);

            if (installResult.success) {
                installed++;
            } else {
                failed++;
                errors.push(`${validation.name || path.basename(extPath)}: ${installResult.error}`);
            }
        }

        if (installed > 0) {
            await reloadExtensions(extensionsPath);
        }

        return {
            success: installed > 0,
            installed,
            failed,
            error: failed > 0 ? `Failed: ${errors.join('; ')}` : undefined
        };
    });
}
