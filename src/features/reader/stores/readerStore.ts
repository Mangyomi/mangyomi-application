import { create } from 'zustand';

// Simple in-memory page cache (chapterId -> pages)
const pageCache: Map<string, string[]> = new Map();

interface ReaderState {
    pages: string[];
    currentPageIndex: number;
    zoomLevel: number;
    readerMode: 'vertical' | 'horizontal';
    loading: boolean;
    loadingProgress: number; // Number of pages loaded so far
    totalExpected?: number;  // Total pages if known
    error: string | null;

    setPages: (pages: string[]) => void;
    appendPages: (newPages: string[]) => void;
    setCurrentPageIndex: (index: number) => void;
    setZoomLevel: (zoom: number) => void;
    setReaderMode: (mode: 'vertical' | 'horizontal') => void;
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;

    // Actions
    loadChapterPages: (extensionId: string, chapterId: string) => Promise<void>;
    loadChapterPagesStreaming: (extensionId: string, chapterId: string) => () => void;
}

export const useReaderStore = create<ReaderState>((set, get) => ({
    pages: [],
    currentPageIndex: 0,
    zoomLevel: 1,
    readerMode: 'vertical',
    loading: false,
    loadingProgress: 0,
    totalExpected: undefined,
    error: null,

    setPages: (pages) => set({ pages, loadingProgress: pages.length }),
    appendPages: (newPages) => set((state) => ({
        pages: [...state.pages, ...newPages],
        loadingProgress: state.pages.length + newPages.length
    })),
    setCurrentPageIndex: (index) => set({ currentPageIndex: index }),
    setZoomLevel: (zoom) => set({ zoomLevel: zoom }),
    setReaderMode: (mode) => set({ readerMode: mode }),
    setLoading: (loading) => set({ loading }),
    setError: (error) => set({ error }),

    // Traditional loading (for fallback)
    loadChapterPages: async (extensionId, chapterId) => {
        // Check cache first
        const cached = pageCache.get(chapterId);
        if (cached && cached.length > 0) {
            console.log(`[ReaderStore] Using cached pages for ${chapterId} (${cached.length} pages)`);
            set({ pages: cached, loading: false, loadingProgress: cached.length, currentPageIndex: 0 });
            return;
        }

        set({ loading: true, error: null, pages: [], currentPageIndex: 0, loadingProgress: 0, totalExpected: undefined });
        try {
            const pages = await window.electronAPI.extensions.getChapterPages(extensionId, chapterId);
            pageCache.set(chapterId, pages); // Cache the pages
            set({ pages, loading: false, loadingProgress: pages.length });
        } catch (error: any) {
            console.error('Failed to load chapter pages:', error);
            set({ error: error.message || 'Failed to load pages', loading: false });
        }
    },

    // Streaming loading (progressive display) with persistent DB cache
    loadChapterPagesStreaming: (extensionId, chapterId) => {
        // Store extensionId for cleanup
        const currentExtensionId = extensionId;

        // Check in-memory cache first (instant)
        const cached = pageCache.get(chapterId);
        if (cached && cached.length > 0) {
            console.log(`[ReaderStore] Using memory-cached pages for ${chapterId} (${cached.length} pages)`);
            set({ pages: cached, loading: false, loadingProgress: cached.length, currentPageIndex: 0, totalExpected: cached.length });
            return () => { }; // No cleanup needed for cached
        }

        // Set loading state while we check DB cache
        set({ loading: true, error: null, pages: [], currentPageIndex: 0, loadingProgress: 0, totalExpected: undefined });

        // Check DB cache (async) before starting stream
        window.electronAPI.extensions.getCachedChapterPages(chapterId).then((dbCached) => {
            if (dbCached && dbCached.length > 0) {
                console.log(`[ReaderStore] Using DB-cached pages for ${chapterId} (${dbCached.length} pages)`);
                pageCache.set(chapterId, dbCached); // Also store in memory
                set({ pages: dbCached, loading: false, loadingProgress: dbCached.length, totalExpected: dbCached.length });
                return;
            }

            // Not cached - start streaming
            window.electronAPI.extensions.getChapterPagesStreaming(extensionId, chapterId);
        });

        // Track pages already queued for caching to avoid duplicates
        const cachedPageUrls = new Set<string>();
        let mangaId: string | undefined;

        // Listen for progress (handles non-cached case)
        const unsubscribe = window.electronAPI.extensions.onChapterPagesProgress((data) => {
            if (data.error) {
                set({ error: data.error, loading: false });
                unsubscribe();
                return;
            }

            if (data.total) {
                set({ totalExpected: data.total });
            }

            if (data.pages && data.pages.length > 0) {
                // SET pages directly (extension sends accumulated, not batches)
                set({
                    pages: data.pages,
                    loadingProgress: data.pages.length
                });

                // Progressive image caching: cache new pages as they arrive
                // Find pages that haven't been queued for caching yet
                const newPages = data.pages.filter(url => !cachedPageUrls.has(url));
                if (newPages.length > 0) {
                    console.log(`[ReaderStore] Queueing ${newPages.length} new pages for background caching`);
                    // Queue each new page for caching (fire-and-forget, don't await)
                    newPages.forEach(pageUrl => {
                        cachedPageUrls.add(pageUrl);
                        // Trigger cache save in background
                        window.electronAPI.cache.save(pageUrl, currentExtensionId, mangaId || 'unknown', chapterId)
                            .catch((e: any) => console.warn(`[ReaderStore] Failed to cache ${pageUrl}:`, e.message));
                    });
                }
            }

            if (data.done) {
                // Cache the complete pages (both memory and DB)
                const finalPages = get().pages;
                if (finalPages.length > 0) {
                    pageCache.set(chapterId, finalPages);
                    // Save to persistent DB cache
                    window.electronAPI.extensions.cacheChapterPages(chapterId, extensionId, finalPages);
                    console.log(`[ReaderStore] Cached ${finalPages.length} pages for ${chapterId}`);
                }
                set({ loading: false });
                unsubscribe();
            }
        });

        // Return cleanup function
        return () => {
            console.log(`[ReaderStore] Cancelling streaming for ${currentExtensionId}`);
            window.electronAPI.extensions.cancelChapterPagesStreaming(currentExtensionId);
            unsubscribe();
        };
    }
}));
