/**
 * Discord RPC IPC Handlers
 */
import { ipcMain } from 'electron';
import { updateActivity, clearActivity } from '../discord';

export function setupDiscordHandlers() {
    ipcMain.handle('discord:updateActivity', async (_, details: string, state: string, largeImageKey?: string, largeImageText?: string, smallImageKey?: string, smallImageText?: string, buttons?: { label: string; url: string }[]) => {
        return await updateActivity(details, state, largeImageKey, largeImageText, smallImageKey, smallImageText, buttons);
    });

    ipcMain.handle('discord:clearActivity', async () => {
        return await clearActivity();
    });
}
