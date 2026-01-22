import { create } from 'zustand';

export interface HistoryEntry {
    id: number;
    manga_id: string;
    chapter_id: string;
    read_at: number;
    page_number: number;
    manga_title: string;
    cover_url: string;
    chapter_title: string;
    chapter_number: number;
    source_id: string;
}

const PAGE_SIZE = 50;

interface HistoryState {
    history: HistoryEntry[];
    loadingHistory: boolean;
    loadingMore: boolean;
    hasMore: boolean;
    offset: number;

    loadHistory: () => Promise<void>;
    loadMore: () => Promise<void>;
    removeFromHistory: (mangaId: string) => Promise<void>;
    resetHistory: () => void;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
    history: [],
    loadingHistory: false,
    loadingMore: false,
    hasMore: true,
    offset: 0,

    loadHistory: async () => {
        set({ loadingHistory: true, offset: 0, hasMore: true });
        try {
            const history = await window.electronAPI.db.getHistory(PAGE_SIZE, 0);
            set({
                history,
                loadingHistory: false,
                offset: PAGE_SIZE,
                hasMore: history.length === PAGE_SIZE
            });
        } catch (error) {
            console.error('Failed to load history:', error);
            set({ loadingHistory: false });
        }
    },

    loadMore: async () => {
        const { loadingMore, hasMore, offset, history } = get();
        if (loadingMore || !hasMore) return;

        set({ loadingMore: true });
        try {
            const moreHistory = await window.electronAPI.db.getHistory(PAGE_SIZE, offset);
            set({
                history: [...history, ...moreHistory],
                loadingMore: false,
                offset: offset + PAGE_SIZE,
                hasMore: moreHistory.length === PAGE_SIZE
            });
        } catch (error) {
            console.error('Failed to load more history:', error);
            set({ loadingMore: false });
        }
    },

    removeFromHistory: async (mangaId: string) => {
        try {
            await window.electronAPI.db.deleteHistory(mangaId);
            set(state => ({
                history: state.history.filter(h => h.manga_id !== mangaId)
            }));
        } catch (error) {
            console.error('Failed to remove from history:', error);
        }
    },

    resetHistory: () => {
        set({ history: [], offset: 0, hasMore: true });
    }
}));
