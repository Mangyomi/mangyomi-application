import { create } from 'zustand';

export interface AniListUser {
    id: number;
    name: string;
    avatar: {
        medium: string;
    };
}

export interface AniListMedia {
    id: number;
    title: {
        romaji: string;
        english: string | null;
        native: string | null;
    };
    chapters: number | null;
    volumes: number | null;
    status: string;
    coverImage: {
        medium: string;
        large: string;
    };
    description: string | null;
    averageScore: number | null;
    genres: string[];
}

interface AniListState {
    isAuthenticated: boolean;
    user: AniListUser | null;
    clientId: string;
    isLoading: boolean;
    error: string | null;

    setClientId: (id: string) => void;
    login: () => Promise<boolean>;
    logout: () => Promise<void>;
    checkAuth: () => Promise<void>;
    searchManga: (query: string) => Promise<AniListMedia[]>;
    linkManga: (mangaId: string, anilistId: number) => Promise<boolean>;
    unlinkManga: (mangaId: string) => Promise<boolean>;
    syncProgress: (mangaId: string) => Promise<boolean>;
    loadFromStorage: () => void;
    saveToStorage: () => void;
}

const STORAGE_KEY = 'mangyomi-anilist';

export const useAniListStore = create<AniListState>((set, get) => ({
    isAuthenticated: false,
    user: null,
    clientId: '',
    isLoading: false,
    error: null,

    setClientId: (id) => {
        set({ clientId: id });
        window.electronAPI.anilist.setClientId(id);
        // Save to localStorage
        localStorage.setItem(`${STORAGE_KEY}-clientId`, id);
    },

    login: async () => {
        set({ isLoading: true, error: null });
        try {
            const result = await window.electronAPI.anilist.login();
            if (result.success) {
                // Get user info
                const user = await window.electronAPI.anilist.getUser();
                // Save token to localStorage
                const tokenData = await window.electronAPI.anilist.getTokenData();
                if (tokenData) {
                    localStorage.setItem(`${STORAGE_KEY}-token`, tokenData);
                }
                set({ isAuthenticated: true, user, isLoading: false });
                return true;
            } else {
                set({ error: result.error || 'Login failed', isLoading: false });
                return false;
            }
        } catch (error) {
            set({
                error: error instanceof Error ? error.message : 'Login failed',
                isLoading: false
            });
            return false;
        }
    },

    logout: async () => {
        await window.electronAPI.anilist.logout();
        localStorage.removeItem(`${STORAGE_KEY}-token`);
        set({ isAuthenticated: false, user: null });
    },

    checkAuth: async () => {
        const isAuth = await window.electronAPI.anilist.isAuthenticated();
        if (isAuth) {
            const user = await window.electronAPI.anilist.getUser();
            set({ isAuthenticated: true, user });
        } else {
            set({ isAuthenticated: false, user: null });
        }
    },

    searchManga: async (query) => {
        try {
            return await window.electronAPI.anilist.searchManga(query);
        } catch (error) {
            console.error('AniList search error:', error);
            return [];
        }
    },

    linkManga: async (mangaId, anilistId) => {
        try {
            const result = await window.electronAPI.anilist.linkManga(mangaId, anilistId);
            return result.success;
        } catch {
            return false;
        }
    },

    unlinkManga: async (mangaId) => {
        try {
            const result = await window.electronAPI.anilist.unlinkManga(mangaId);
            return result.success;
        } catch {
            return false;
        }
    },

    syncProgress: async (mangaId) => {
        try {
            const result = await window.electronAPI.anilist.syncProgress(mangaId);
            return result.success;
        } catch {
            return false;
        }
    },

    loadFromStorage: () => {
        // Load client ID
        const clientId = localStorage.getItem(`${STORAGE_KEY}-clientId`);
        if (clientId) {
            set({ clientId });
            window.electronAPI.anilist.setClientId(clientId);
        }

        // Load and restore token
        const tokenData = localStorage.getItem(`${STORAGE_KEY}-token`);
        if (tokenData) {
            window.electronAPI.anilist.setTokenData(tokenData);
            // Check if still valid
            get().checkAuth();
        }
    },

    saveToStorage: () => {
        const { clientId } = get();
        if (clientId) {
            localStorage.setItem(`${STORAGE_KEY}-clientId`, clientId);
        }
    },
}));
