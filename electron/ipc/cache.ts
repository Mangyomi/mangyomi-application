/**
 * Cache IPC Handlers
 */
import { ipcMain, net } from 'electron';
import { imageCache } from '../cache/imageCache';
import { getExtension } from '../extensions/loader';

export function setupCacheHandlers() {
    ipcMain.handle('cache:save', async (_, url: string, extensionId: string, mangaId: string, chapterId: string, isPrefetch: boolean = false) => {
        const ext = getExtension(extensionId);
        // Full browser-like headers to prevent 400 errors from strict servers
        const headers: Record<string, string> = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Sec-Fetch-Dest': 'image',
            'Sec-Fetch-Mode': 'no-cors',
            'Sec-Fetch-Site': 'cross-site',
        };
        if (ext) {
            Object.assign(headers, ext.getImageHeaders());
        }

        try {
            return await imageCache.saveToCache(url, headers, mangaId, chapterId, isPrefetch);
        } catch (e) {
            console.error(`Cache save failed for ${url}:`, e);
            throw e;
        }
    });

    ipcMain.handle('cache:clear', async (_, mangaId?: string) => {
        await imageCache.clearCache(mangaId);
    });

    ipcMain.handle('cache:setLimit', async (_, bytes: number) => {
        imageCache.setLimit(bytes);
    });

    ipcMain.handle('cache:getSize', async () => {
        return imageCache.getCacheSize();
    });

    ipcMain.handle('cache:getStats', async () => {
        return {
            currentSize: await imageCache.getCacheSize(),
        };
    });

    ipcMain.handle('cache:checkManga', async (_, mangaId: string) => {
        return imageCache.getMangaCacheCount(mangaId);
    });
}
