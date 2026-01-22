/**
 * AniList IPC Handlers
 */
import { ipcMain, BrowserWindow } from 'electron';
import { getDatabase } from '../database';
import {
    anilistAPI,
    setClientId,
    openAuthWindow,
    logout,
    isAuthenticated,
    serializeTokenData,
    deserializeTokenData
} from '../anilist';

export function setupAnilistHandlers(mainWindow: BrowserWindow) {
    const db = getDatabase();

    ipcMain.handle('anilist:setClientId', async (_, clientId: string) => {
        setClientId(clientId);
    });

    ipcMain.handle('anilist:login', async () => {
        if (!mainWindow) throw new Error('Main window not available');
        try {
            const token = await openAuthWindow(mainWindow);
            return { success: true, token };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    });

    ipcMain.handle('anilist:logout', async () => {
        logout();
        return { success: true };
    });

    ipcMain.handle('anilist:isAuthenticated', async () => {
        return isAuthenticated();
    });

    ipcMain.handle('anilist:getUser', async () => {
        return await anilistAPI.getViewer();
    });

    ipcMain.handle('anilist:searchManga', async (_, query: string) => {
        return await anilistAPI.searchManga(query);
    });

    ipcMain.handle('anilist:getMangaById', async (_, anilistId: number) => {
        return await anilistAPI.getMangaById(anilistId);
    });

    ipcMain.handle('anilist:linkManga', async (_, mangaId: string, anilistId: number) => {
        db.prepare('UPDATE manga SET anilist_id = ? WHERE id = ?').run(anilistId, mangaId);
        return { success: true };
    });

    ipcMain.handle('anilist:unlinkManga', async (_, mangaId: string) => {
        db.prepare('UPDATE manga SET anilist_id = NULL WHERE id = ?').run(mangaId);
        return { success: true };
    });

    ipcMain.handle('anilist:updateProgress', async (_, anilistId: number, progress: number) => {
        try {
            const result = await anilistAPI.updateProgress(anilistId, progress);
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    });

    ipcMain.handle('anilist:syncProgress', async (_, mangaId: string) => {
        const manga = db.prepare('SELECT * FROM manga WHERE id = ?').get(mangaId) as any;
        if (!manga?.anilist_id) {
            return { success: false, error: 'Manga not linked to AniList' };
        }

        const highestRead = db.prepare(`
            SELECT MAX(chapter_number) as max_chapter 
            FROM chapter 
            WHERE manga_id = ? AND read_at IS NOT NULL
        `).get(mangaId) as any;

        if (!highestRead?.max_chapter) {
            return { success: false, error: 'No chapters read' };
        }

        try {
            const result = await anilistAPI.updateProgress(
                manga.anilist_id,
                Math.floor(highestRead.max_chapter)
            );
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    });

    ipcMain.handle('anilist:getTokenData', async () => {
        return serializeTokenData();
    });

    ipcMain.handle('anilist:setTokenData', async (_, data: string) => {
        deserializeTokenData(data);
    });
}
