import { create } from 'zustand';

export interface Tag {
    id: number;
    name: string;
    color: string;
    isNsfw?: boolean;
    count?: number;
}

interface TagState {
    tags: Tag[];
    selectedTag: Tag | null;
    loadingTags: boolean;

    loadTags: () => Promise<void>;
    createTag: (name: string, color: string, isNsfw: boolean) => Promise<void>;
    updateTag: (id: number, name: string, color: string, isNsfw: boolean) => Promise<void>;
    deleteTag: (tagId: number) => Promise<void>;
    addTagToManga: (mangaId: string, tagId: number) => Promise<void>;
    removeTagFromManga: (mangaId: string, tagId: number) => Promise<void>;
    getMangaByTag: (tagId: number) => Promise<any[]>;
    setSelectedTag: (tag: Tag | null) => void;
}

export const useTagStore = create<TagState>((set, get) => ({
    tags: [],
    selectedTag: null,
    loadingTags: false,

    loadTags: async () => {
        set({ loadingTags: true });
        try {
            const rawTags = await window.electronAPI.db.getTags();
            // Map is_nsfw from DB to isNsfw in interface
            const tags = rawTags.map((t: any) => ({
                ...t,
                isNsfw: !!t.is_nsfw
            }));
            set({ tags, loadingTags: false });
        } catch (error) {
            console.error('Failed to load tags:', error);
            set({ loadingTags: false });
        }
    },

    createTag: async (name, color, isNsfw) => {
        try {
            await window.electronAPI.db.createTag(name, color, isNsfw);
            await get().loadTags();
        } catch (error) {
            console.error('Failed to create tag:', error);
        }
    },

    updateTag: async (id, name, color, isNsfw) => {
        try {
            await window.electronAPI.db.updateTag(id, name, color, isNsfw);
            await get().loadTags();
        } catch (error) {
            console.error('Failed to update tag:', error);
        }
    },

    deleteTag: async (tagId) => {
        try {
            await window.electronAPI.db.deleteTag(tagId);
            await get().loadTags();
        } catch (error) {
            console.error('Failed to delete tag:', error);
        }
    },

    addTagToManga: async (mangaId, tagId) => {
        try {
            await window.electronAPI.db.addTagToManga(mangaId, tagId);
            await get().loadTags();
        } catch (error) {
            console.error('Failed to add tag to manga:', error);
        }
    },

    removeTagFromManga: async (mangaId, tagId) => {
        try {
            await window.electronAPI.db.removeTagFromManga(mangaId, tagId);
            await get().loadTags();
        } catch (error) {
            console.error('Failed to remove tag from manga:', error);
        }
    },

    getMangaByTag: async (tagId) => {
        try {
            return await window.electronAPI.db.getMangaByTag(tagId);
        } catch (error) {
            console.error('Failed to get manga by tag:', error);
            return [];
        }
    },

    setSelectedTag: (tag) => set({ selectedTag: tag }),
}));
