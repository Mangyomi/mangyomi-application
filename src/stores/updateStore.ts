import { create } from 'zustand';

export interface UpdateInfo {
    hasUpdate: boolean;
    currentVersion: string;
    latestVersion: string;
    downloadUrl: string | null;
    blockmapUrl: string | null;
    fileName: string | null;
    fileSize: number;
    releaseNotes: string;
    publishedAt: string;
    isNightly: boolean;
    isDifferential?: boolean;
    error?: string;
}

interface UpdateState {
    updateInfo: UpdateInfo | null;
    isChecking: boolean;
    isDownloading: boolean;
    downloadProgress: { percent: number; bytesDownloaded: number; totalBytes: number; isDifferential?: boolean } | null;
    isDownloadComplete: boolean;
    lastChecked: Date | null;
    showNotification: boolean;
    checkForUpdates: (useBeta: boolean) => Promise<UpdateInfo | null>;
    startDownload: () => void;
    setDownloadProgress: (progress: { percent: number; bytesDownloaded: number; totalBytes: number }) => void;
    setDownloadComplete: (success: boolean) => void;
    installUpdate: () => Promise<void>;
    dismissNotification: () => void;
    clearUpdate: () => void;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
    updateInfo: null,
    isChecking: false,
    isDownloading: false,
    downloadProgress: null,
    isDownloadComplete: false,
    lastChecked: null,
    showNotification: false,

    checkForUpdates: async (useBeta: boolean) => {
        set({ isChecking: true });
        try {
            const result = await window.electronAPI.app.checkForUpdates(useBeta);
            const updateInfo = result as UpdateInfo;
            set({
                updateInfo,
                isChecking: false,
                lastChecked: new Date(),
                showNotification: updateInfo.hasUpdate,
                isDownloadComplete: false,
                downloadProgress: null
            });
            return updateInfo;
        } catch (error) {
            console.error('Failed to check for updates:', error);
            set({ isChecking: false });
            return null;
        }
    },

    startDownload: async () => {
        const { updateInfo } = get();
        if (!updateInfo?.downloadUrl || !updateInfo?.fileName) return;

        set({ isDownloading: true, downloadProgress: { percent: 0, bytesDownloaded: 0, totalBytes: updateInfo.fileSize } });

        try {
            await window.electronAPI.app.downloadUpdate(updateInfo.downloadUrl, updateInfo.fileName, updateInfo.blockmapUrl || undefined, updateInfo.latestVersion);
        } catch (error) {
            console.error('Download failed:', error);
            set({ isDownloading: false });
        }
    },

    setDownloadProgress: (progress) => {
        set({ downloadProgress: progress });
    },

    setDownloadComplete: (success: boolean) => {
        set({ isDownloading: false, isDownloadComplete: success });
    },

    installUpdate: async () => {
        try {
            await window.electronAPI.app.installUpdate();
        } catch (error) {
            console.error('Install failed:', error);
        }
    },

    dismissNotification: () => {
        set({ showNotification: false });
    },

    clearUpdate: () => {
        set({
            updateInfo: null,
            downloadProgress: null,
            isDownloadComplete: false,
            showNotification: false
        });
    },
}));
