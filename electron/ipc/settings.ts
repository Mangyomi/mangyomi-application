/**
 * Settings IPC Handlers
 */
import { ipcMain } from 'electron';

export async function setupSettingsHandlers() {
    const { getSetting, setSetting, getAllSettings, resetSettings } = await import('../store');

    ipcMain.handle('settings:get', (_, key: any) => {
        return getSetting(key);
    });

    ipcMain.handle('settings:set', (_, key: any, value: any) => {
        setSetting(key, value);
    });

    ipcMain.handle('settings:getAll', () => {
        return getAllSettings();
    });

    ipcMain.handle('settings:reset', () => {
        resetSettings();
    });
}
