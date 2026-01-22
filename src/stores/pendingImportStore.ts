import { create } from 'zustand';

interface PendingImportState {
    pendingFilePath: string | null;
    setPendingFilePath: (filePath: string | null) => void;
    clearPendingFilePath: () => void;
}

export const usePendingImportStore = create<PendingImportState>((set) => ({
    pendingFilePath: null,
    setPendingFilePath: (filePath) => set({ pendingFilePath: filePath }),
    clearPendingFilePath: () => set({ pendingFilePath: null }),
}));
