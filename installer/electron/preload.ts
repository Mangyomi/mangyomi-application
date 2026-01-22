import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('installerAPI', {
    getDefaultPath: () => ipcRenderer.invoke('installer:getDefaultPath'),
    selectFolder: () => ipcRenderer.invoke('installer:selectFolder'),
    install: (path: string) => ipcRenderer.invoke('installer:install', path),
    launch: (exePath: string) => ipcRenderer.invoke('installer:launch', exePath),
    onProgress: (callback: (data: { status: string; percent: number }) => void) => {
        const handler = (_: any, data: any) => callback(data);
        ipcRenderer.on('installer:progress', handler);
        return () => ipcRenderer.removeListener('installer:progress', handler);
    },
    window: {
        close: () => ipcRenderer.invoke('window:close'),
        minimize: () => ipcRenderer.invoke('window:minimize'),
    }
});
