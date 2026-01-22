import { create } from 'zustand';

// Assuming Manga interface is needed, we should probably export it from a shared type file or here.
// For now, let's redefine or import if possible. 
// appStore has Manga interface. I should duplicate it here or move it to a shared types file.
// Ideally shared types. But for now I'll include it here to make it self-contained.

export interface Manga {
    id: string; // Database ID
    source_id: string;
    source_manga_id: string;
    title: string;
    cover_url: string;
    anilist_id?: number;
    // ... other fields as needed
}

interface LibraryState {
    library: Manga[];
    loadingLibrary: boolean;
    isRefreshing: boolean;
    refreshProgress: { current: number; total: number } | null;

    loadLibrary: () => Promise<void>;
    fetchMissingCovers: (library: Manga[]) => Promise<void>;
    addToLibrary: (manga: any, extensionId: string) => Promise<void>;
    removeFromLibrary: (mangaId: string) => Promise<void>;
    getMangaByTag: (tagId: number) => Promise<any[]>;
    refreshLibrary: () => Promise<void>;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
    library: [],
    loadingLibrary: false,
    isRefreshing: false,
    refreshProgress: null,

    loadLibrary: async () => {
        set({ loadingLibrary: true });
        try {
            const library = await window.electronAPI.db.getAllManga();
            set({ library, loadingLibrary: false });

            // Start background task to fetch missing covers
            get().fetchMissingCovers(library);
        } catch (error) {
            console.error('Failed to load library:', error);
            set({ loadingLibrary: false });
        }
    },

    fetchMissingCovers: async (library: Manga[]) => {
        // Find manga with missing covers
        const missingCovers = library.filter(m => !m.cover_url || m.cover_url.trim() === '');
        if (missingCovers.length === 0) return;

        console.log(`[Library] Fetching covers for ${missingCovers.length} manga in background...`);

        // Process one at a time to avoid rate limiting
        for (const manga of missingCovers) {
            try {
                const extensionId = manga.source_id;
                const mangaId = manga.source_manga_id;

                // Fetch fresh details from extension
                const details = await window.electronAPI.extensions.getMangaDetails(extensionId, mangaId);

                if (details.coverUrl) {
                    // Update database
                    await window.electronAPI.db.updateMangaMetadata(manga.id, {
                        cover_url: details.coverUrl
                    });

                    // Update local state immediately for that manga
                    set(state => ({
                        library: state.library.map(m =>
                            m.id === manga.id ? { ...m, cover_url: details.coverUrl } : m
                        )
                    }));
                }

                // Small delay to avoid hammering the server
                await new Promise(r => setTimeout(r, 300));
            } catch (e) {
                console.warn(`[Library] Failed to fetch cover for ${manga.title}:`, e);
            }
        }

        console.log('[Library] Finished fetching missing covers');
    },

    addToLibrary: async (manga, extensionId) => {
        try {
            const sourceId = extensionId || manga.extensionId || manga.source_id;

            if (!sourceId) {
                console.error('addToLibrary: Missing extensionId/source_id', { manga, extensionId });
                throw new Error('Missing source_id for manga');
            }

            const id = `${sourceId}:${manga.id}`;
            await window.electronAPI.db.addManga({
                id,
                source_id: sourceId,
                source_manga_id: manga.id,
                title: manga.title,
                cover_url: manga.coverUrl || manga.cover_url,
                author: manga.author || '',
                artist: manga.artist || '',
                description: manga.description || '',
                status: manga.status || 'unknown',
            });
            await get().loadLibrary();
        } catch (error) {
            console.error('Failed to add to library:', error);
        }
    },

    removeFromLibrary: async (mangaId) => {
        try {
            await window.electronAPI.db.deleteManga(mangaId);
            set(state => ({
                library: state.library.filter(m => m.id !== mangaId)
            }));
        } catch (error) {
            console.error('Failed to remove from library:', error);
        }
    },

    getMangaByTag: async (tagId) => {
        try {
            return await window.electronAPI.db.getMangaByTag(tagId);
        } catch (error) {
            console.error('Failed to load manga by tag:', error);
            return [];
        }
    },

    refreshLibrary: async () => {
        const { library, isRefreshing } = get();
        if (isRefreshing) return;

        set({ isRefreshing: true, refreshProgress: { current: 0, total: library.length } });

        try {
            for (let i = 0; i < library.length; i++) {
                const manga = library[i];
                set({ refreshProgress: { current: i + 1, total: library.length } });
                try {
                    const chapters = await window.electronAPI.extensions.getChapterList(
                        manga.source_id,
                        manga.source_manga_id
                    );

                    // Save chapters to database so total_chapters updates
                    if (chapters && chapters.length > 0) {
                        // Use source_id:ch.id format to match appStore.ts (line 140)
                        const chaptersToSave = chapters.map((ch: any, index: number) => ({
                            id: `${manga.source_id}:${ch.id}`,
                            manga_id: manga.id,
                            source_chapter_id: ch.source_chapter_id || ch.id.split('/').pop(),
                            title: ch.title || `Chapter ${index + 1}`,
                            chapter_number: ch.chapterNumber ?? (chapters.length - index),
                            volume_number: ch.volumeNumber || null,
                            url: ch.url || ''
                        }));
                        await window.electronAPI.db.addChapters(chaptersToSave);
                    }
                } catch (e) {
                    console.warn(`Failed to refresh ${manga.title}:`, e);
                }
            }
            await get().loadLibrary();
        } finally {
            set({ isRefreshing: false, refreshProgress: null });
        }
    }
}));
