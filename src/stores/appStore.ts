import { create } from 'zustand';
import { useAniListStore } from './anilistStore';
import { useSourceBehaviorStore } from './sourceBehaviorStore';
import { useLibraryStore } from '../features/library/stores/libraryStore';
import { useSettingsStore } from '../features/settings/stores/settingsStore';
import { Extension } from '@/features/extensions/stores/extensionStore';

export interface Manga {
    id: string;
    source_id: string;
    source_manga_id: string;
    title: string;
    cover_url: string;
    author?: string;
    artist?: string;
    description?: string;
    status?: string;
    added_at?: number;
    updated_at?: number;
    in_library?: boolean;
    total_chapters?: number;
    read_chapters?: number;
    anilist_id?: number;
    url?: string;
}

export interface Chapter {
    id: string;
    manga_id: string;
    source_chapter_id: string;
    title: string;
    chapter_number: number;
    volume_number?: number;
    url: string;
    read_at?: number;
    page_count?: number;
    last_page_read?: number;
    chapterNumber?: number;
    uploadDate?: number;
}

export interface Tag {
    id: number;
    name: string;
    color: string;
    count?: number;
}

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

interface AppState {


    currentManga: any | null;
    currentChapters: Chapter[];


    captchaUrl: string | null;
    captchaCallback: (() => void) | null;

    prefetchedChapters: Map<string, string[]>;
    prefetchInProgress: Set<string>;

    loadMangaDetails: (extensionId: string, mangaId: string) => Promise<void>;
    loadChapters: (extensionId: string, mangaId: string) => Promise<void>;
    markChapterRead: (chapterId: string, pageNumber?: number) => Promise<void>;
    markChapterUnread: (chapterId: string) => Promise<void>;
    markChaptersRead: (chapterIds: string[]) => Promise<void>;
    markChaptersUnread: (chapterIds: string[]) => Promise<void>;
    markChapterReadInternal: (chapterId: string, pageNumber?: number) => Promise<void>;
    showCaptcha: (url: string, callback: () => void) => void;
    hideCaptcha: () => void;
    prefetchChapter: (extensionId: string, chapterId: string) => void;
    getPrefetchedPages: (chapterId: string) => string[] | undefined;
    clearPrefetchCache: () => void;
    // Global Prefetch State
    isPrefetching: boolean;
    prefetchMangaId: string | null;
    prefetchHistoryId: number | null;
    prefetchProgress: { current: number; total: number; chapter: string; error?: string };
    prefetchSummary: {
        mangaTitle: string;
        status: 'completed' | 'cancelled' | 'failed';
        successCount: number;
        failedCount: number;
        skippedCount: number;
        failedPages: { url: string; chapter: string; error: string }[];
    } | null;
    cancelPrefetch: () => void;
    resumePrefetch: () => void;
    acknowledgePrefetchSummary: () => void;
    startPrefetch: (chapters: Chapter[], extensionId: string, mangaId: string, mangaTitle: string) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
    currentManga: null,
    currentChapters: [],
    captchaUrl: null,
    captchaCallback: null,
    prefetchedChapters: new Map(),
    prefetchInProgress: new Set(),

    // Global Prefetch Init
    isPrefetching: false,
    prefetchMangaId: null,
    prefetchHistoryId: null,
    prefetchProgress: { current: 0, total: 0, chapter: '', error: undefined },
    prefetchSummary: null,
    cancelPrefetch: () => { },
    resumePrefetch: () => { }, // placeholder, replaced in startPrefetch
    acknowledgePrefetchSummary: () => set({ prefetchSummary: null }),

    loadMangaDetails: async (extensionId: string, mangaId: string) => {
        try {
            const details = await window.electronAPI.extensions.getMangaDetails(extensionId, mangaId);
            set({ currentManga: { ...details, extensionId } });

            // Update database with fresh cover URL if available
            if (details.coverUrl) {
                const dbMangaId = `${extensionId}:${mangaId}`;
                try {
                    await window.electronAPI.db.updateMangaMetadata(dbMangaId, {
                        cover_url: details.coverUrl
                    });
                } catch (e) {
                    // Non-critical - just log and continue
                    console.warn('Failed to update cover in DB:', e);
                }
            }
        } catch (error) {
            console.error('Failed to load manga details:', error);
        }
    },

    loadChapters: async (extensionId: string, mangaId: string) => {
        try {
            const extChapters = await window.electronAPI.extensions.getChapterList(extensionId, mangaId);

            const dbMangaId = `${extensionId}:${mangaId}`;
            const existingManga = await window.electronAPI.db.getManga(dbMangaId);

            if (existingManga) {
                const dbChaptersToSync = extChapters.map(chapter => ({
                    id: `${extensionId}:${chapter.id}`,
                    manga_id: dbMangaId,
                    source_chapter_id: chapter.source_chapter_id || chapter.id.split('/').pop(),
                    title: chapter.title,
                    chapter_number: chapter.chapterNumber || 0,
                    volume_number: chapter.volume_number || 0,
                    url: chapter.url,
                }));

                try {
                    await window.electronAPI.db.addChapters(dbChaptersToSync);
                    await useLibraryStore.getState().loadLibrary();
                } catch (syncError) {
                    console.warn('Failed to sync chapters to DB:', syncError);
                }
            }

            const dbChapters = await window.electronAPI.db.getChapters(dbMangaId);
            const readMap = new Map();
            if (Array.isArray(dbChapters)) {
                dbChapters.forEach((c: any) => {
                    if (c.read_at) {
                        readMap.set(c.id, c.read_at);
                    }
                });
            }

            const mergedChapters = extChapters.map(c => ({
                ...c,
                read_at: readMap.get(`${extensionId}:${c.id}`)
            }));

            set({ currentChapters: mergedChapters });
        } catch (error) {
            console.error('Failed to load chapters:', error);
        }
    },





    markChapterRead: async (chapterId, pageNumber = 0) => {
        const { currentManga, currentChapters } = get();
        if (!currentManga) return;

        const chapter = currentChapters.find(c => c.id === chapterId);
        if (!chapter) return;

        try {
            await get().markChapterReadInternal(chapterId, pageNumber);

            set({
                currentChapters: currentChapters.map(c =>
                    c.id === chapterId ? { ...c, read_at: Date.now() / 1000 } : c
                )
            });

            await useLibraryStore.getState().loadLibrary();

            await useLibraryStore.getState().loadLibrary();

            // Sync with AniList
            const extensionId = currentManga.extensionId || currentManga.source_id;
            const dbMangaId = `${extensionId}:${currentManga.id}`;
            const libraryEntry = useLibraryStore.getState().library.find(m => m.id === dbMangaId);

            if (libraryEntry?.anilist_id) {
                await useAniListStore.getState().syncProgress(dbMangaId);
            }
        } catch (error) {
            console.error('Failed to mark chapter read:', error);
        }
    },

    markChapterReadInternal: async (chapterId: string, pageNumber: number = 0) => {
        const { currentManga, currentChapters } = get();
        if (!currentManga) return;
        const chapter = currentChapters.find(c => c.id === chapterId);
        if (!chapter) return;

        const extensionId = currentManga.extensionId || currentManga.source_id;
        const dbManga = {
            id: `${extensionId}:${currentManga.id}`,
            source_id: extensionId,
            source_manga_id: currentManga.id,
            title: currentManga.title,
            cover_url: currentManga.coverUrl || currentManga.cover_url,
            author: currentManga.author || '',
            artist: currentManga.artist || '',
            description: currentManga.description || '',
            status: currentManga.status || 'unknown',
        };
        const dbChapter = {
            id: `${extensionId}:${chapterId}`,
            manga_id: dbManga.id,
            source_chapter_id: chapter.source_chapter_id || chapterId.split('/').pop(),
            title: chapter.title,
            chapter_number: chapter.chapterNumber || 0,
            volume_number: chapter.volume_number || 0,
            url: chapter.url,
        };
        await window.electronAPI.db.saveReadingProgress(dbManga, dbChapter, pageNumber);
    },

    markChapterUnread: async (chapterId: string) => {
        const { currentManga, currentChapters } = get();
        if (!currentManga) return;
        const extensionId = currentManga.extensionId || currentManga.source_id;
        const dbChapterId = `${extensionId}:${chapterId}`;

        try {
            await window.electronAPI.db.markChapterUnread(dbChapterId);
            set({
                currentChapters: currentChapters.map(c =>
                    c.id === chapterId ? { ...c, read_at: undefined } : c
                )
            });

            await useLibraryStore.getState().loadLibrary();

            // Sync with AniList
            if (currentManga && (currentManga.anilist_id || currentManga.anilistId)) {
                await useAniListStore.getState().syncProgress(currentManga.id);
            }
        } catch (e) {
            console.error('Failed to mark unread:', e);
        }
    },

    markChaptersRead: async (chapterIds: string[]) => {
        const { currentManga, currentChapters } = get();
        if (!currentManga) return;
        const extensionId = currentManga.extensionId || currentManga.source_id;

        const dbChapterIds = chapterIds.map(id => `${extensionId}:${id}`);

        try {
            const chaptersToMark = currentChapters.filter(c => chapterIds.includes(c.id));
            const dbChapters = chaptersToMark.map(chapter => ({
                id: `${extensionId}:${chapter.id}`,
                manga_id: `${extensionId}:${currentManga.id}`,
                source_chapter_id: chapter.source_chapter_id || chapter.id.split('/').pop(),
                title: chapter.title,
                chapter_number: chapter.chapterNumber || 0,
                volume_number: chapter.volume_number || 0,
                url: chapter.url,
            }));

            const dbManga = {
                id: `${extensionId}:${currentManga.id}`,
                source_id: extensionId,
                source_manga_id: currentManga.id,
                title: currentManga.title,
                cover_url: currentManga.coverUrl || currentManga.cover_url,
                author: currentManga.author || '',
                artist: currentManga.artist || '',
                description: currentManga.description || '',
                status: currentManga.status || 'unknown',
            };

            await window.electronAPI.db.ensureManga(dbManga);
            await window.electronAPI.db.addChapters(dbChapters);
            await window.electronAPI.db.markChaptersRead(dbChapterIds);

            set({
                currentChapters: currentChapters.map(c =>
                    chapterIds.includes(c.id) ? { ...c, read_at: Date.now() / 1000 } : c
                )
            });

            await useLibraryStore.getState().loadLibrary();

            // Sync with AniList
            if (currentManga && (currentManga.anilist_id || currentManga.anilistId)) {
                await useAniListStore.getState().syncProgress(currentManga.id);
            }
        } catch (e) {
            console.error('Failed to bulk mark read:', e);
        }
    },

    markChaptersUnread: async (chapterIds: string[]) => {
        const { currentManga, currentChapters } = get();
        if (!currentManga) return;
        const extensionId = currentManga.extensionId || currentManga.source_id;

        const dbChapterIds = chapterIds.map(id => `${extensionId}:${id}`);

        try {
            await window.electronAPI.db.markChaptersUnread(dbChapterIds);

            set({
                currentChapters: currentChapters.map(c =>
                    chapterIds.includes(c.id) ? { ...c, read_at: undefined } : c
                )
            });

            await useLibraryStore.getState().loadLibrary();

        } catch (e) {
            console.error('Failed to bulk mark unread:', e);
        }
    },

    showCaptcha: (url, callback) => {
        set({ captchaUrl: url, captchaCallback: callback });
    },

    hideCaptcha: () => {
        set({ captchaUrl: null, captchaCallback: null });
    },

    prefetchChapter: (extensionId, chapterId) => {
        // Already cached or in progress - skip
        if (get().prefetchedChapters.has(chapterId) || get().prefetchInProgress.has(chapterId)) {
            return;
        }

        // Mark as in progress immediately (synchronous)
        set((state) => ({
            prefetchInProgress: new Set(state.prefetchInProgress).add(chapterId)
        }));

        // Fire-and-forget async operation
        (async () => {
            const startTime = Date.now();
            const { recordSuccess, recordFailure, getOrCreateBehavior } = useSourceBehaviorStore.getState();

            // Initialize behavior tracking for this source
            getOrCreateBehavior(extensionId);

            try {
                const pages = await window.electronAPI.extensions.getChapterPages(extensionId, chapterId);

                // Record success with response time for AIMD
                const responseTime = Date.now() - startTime;
                recordSuccess(extensionId, responseTime);

                // Store pages with LRU eviction (keep max 10 chapters)
                set((state) => {
                    const newCache = new Map(state.prefetchedChapters);
                    newCache.set(chapterId, pages);

                    // LRU eviction: keep only last 10 chapters
                    const MAX_CACHED_CHAPTERS = 10;
                    if (newCache.size > MAX_CACHED_CHAPTERS) {
                        const keysToDelete = Array.from(newCache.keys()).slice(0, newCache.size - MAX_CACHED_CHAPTERS);
                        keysToDelete.forEach(key => newCache.delete(key));
                    }

                    const newInProgress = new Set(state.prefetchInProgress);
                    newInProgress.delete(chapterId);
                    return { prefetchedChapters: newCache, prefetchInProgress: newInProgress };
                });

                // Also save to DB cache so reader can find it when navigating
                console.log(`[Prefetch] Caching ${pages.length} page URLs for ${chapterId}`);
                window.electronAPI.extensions.cacheChapterPages(chapterId, extensionId, pages)
                    .catch(e => console.warn('[Prefetch] Failed to cache chapter pages to DB:', e));

                // Background caching (fully async, no blocking)
                const { currentManga } = get();
                const mangaId = currentManga?.id || 'unknown';

                const CONCURRENCY = 2;
                for (let i = 0; i < pages.length; i += CONCURRENCY) {
                    const batch = pages.slice(i, i + CONCURRENCY);
                    const results = await Promise.all(batch.map(url =>
                        window.electronAPI.cache.save(url, extensionId, mangaId, chapterId, true)
                            .catch(e => { console.error('Failed to cache page:', url, e); return null; })
                    ));
                    // If any save returned null (cache limit reached), stop prefetching
                    if (results.some(r => r === null)) {
                        console.log('Cache limit reached, stopping prefetch for chapter', chapterId);
                        break;
                    }
                    // Longer delay between batches to reduce CPU load
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } catch (error: any) {
                // Extract status code if available, default to -1 for network errors
                const statusCode = error?.status || error?.statusCode ||
                    (error?.message?.includes('429') ? 429 :
                        error?.message?.includes('403') ? 403 : -1);

                recordFailure(extensionId, statusCode);
                console.error('Failed to prefetch chapter:', chapterId, error);

                // Remove from in-progress on error
                set((state) => {
                    const newInProgress = new Set(state.prefetchInProgress);
                    newInProgress.delete(chapterId);
                    return { prefetchInProgress: newInProgress };
                });
            }
        })();
    },

    getPrefetchedPages: (chapterId) => {
        return get().prefetchedChapters.get(chapterId);
    },

    clearPrefetchCache: () => {
        set({ prefetchedChapters: new Map() });
    },

    startPrefetch: async (chapters: Chapter[], extensionId: string, mangaId: string, mangaTitle: string) => {
        const { isPrefetching } = get();
        if (isPrefetching) {
            console.log('Prefetch already in progress, skipping');
            return;
        }

        console.log('Starting prefetch for', chapters.length, 'chapters');

        // Create prefetch history entry in database
        let historyId: number | null = null;
        try {
            historyId = await window.electronAPI.db.createPrefetchHistory({
                mangaId,
                mangaTitle,
                extensionId,
                totalChapters: chapters.length,
            }) as number;
        } catch (e) {
            console.error('Failed to create prefetch history:', e);
        }

        // Initialize state
        set({
            isPrefetching: true,
            prefetchMangaId: mangaId,
            prefetchHistoryId: historyId,
            prefetchProgress: { current: 0, total: chapters.length, chapter: 'Starting...' }
        });

        let cancelled = false;
        set({
            cancelPrefetch: () => {
                console.log('Prefetch cancelled by user');
                cancelled = true;
            }
        });

        // Track overall stats
        let totalSuccessCount = 0;
        let totalFailedCount = 0;
        let totalSkippedCount = 0;
        let totalPagesProcessed = 0;
        const allFailedPages: { url: string; chapter: string; error: string }[] = [];

        try {
            // useSettingsStore is already imported at top of file

            let completed = 0;
            for (const chapter of chapters) {
                if (cancelled) break;

                set({ prefetchProgress: { current: completed + 1, total: chapters.length, chapter: `Ch. ${chapter.chapterNumber} - ${chapter.title}` } });

                try {
                    // Use streaming to fetch pages and start caching progressively
                    let pages: string[] = [];
                    let allPagesFetched = false;
                    const downloadQueue: string[] = [];
                    let downloadingCount = 0;
                    const CONCURRENCY = 8;
                    const MAX_RETRIES = 25;
                    let cacheLimitReached = false;
                    const chapterFailedPages: { url: string; chapter: string; error: string }[] = [];
                    let chapterSuccessCount = 0;
                    let chapterFailedCount = 0;

                    // Download function with retries
                    const downloadPage = async (page: string): Promise<'success' | 'failed' | 'limit'> => {
                        let attempts = 0;
                        let lastError = '';

                        while (attempts < MAX_RETRIES && !cancelled) {
                            attempts++;
                            try {
                                const result = await Promise.race([
                                    window.electronAPI.cache.save(page, extensionId, mangaId, chapter.id, true),
                                    new Promise<string | null>((_, reject) => setTimeout(() => reject(new Error('Save timeout')), 15000))
                                ]);

                                if (result === null) {
                                    return 'limit';
                                }
                                return 'success';
                            } catch (e: any) {
                                lastError = e.message || String(e);
                                await new Promise(r => setTimeout(r, 500 * Math.min(attempts, 5)));
                            }
                        }

                        chapterFailedPages.push({ url: page, chapter: String(chapter.chapterNumber || chapter.id), error: lastError });
                        return 'failed';
                    };

                    // Process download queue with concurrency
                    const processQueue = async () => {
                        while ((downloadQueue.length > 0 || !allPagesFetched) && !cancelled && !cacheLimitReached) {
                            // Wait if queue is empty but fetching not done
                            if (downloadQueue.length === 0) {
                                await new Promise(r => setTimeout(r, 50));
                                continue;
                            }

                            // Start as many downloads as we can up to concurrency limit
                            while (downloadQueue.length > 0 && downloadingCount < CONCURRENCY && !cancelled && !cacheLimitReached) {
                                const page = downloadQueue.shift();
                                if (!page) continue;

                                downloadingCount++;
                                downloadPage(page).then(result => {
                                    downloadingCount--;
                                    if (result === 'success') chapterSuccessCount++;
                                    else if (result === 'failed') chapterFailedCount++;
                                    else if (result === 'limit') cacheLimitReached = true;
                                });
                            }

                            // Brief yield to allow downloads to progress
                            await new Promise(r => setTimeout(r, 20));
                        }
                    };

                    // Start queue processor
                    const queueProcessor = processQueue();

                    // Use streaming API to get pages progressively
                    await new Promise<void>((resolve, reject) => {
                        const timeout = setTimeout(() => {
                            reject(new Error('Timeout waiting for streaming pages'));
                        }, 300000); // 5 min timeout

                        window.electronAPI.extensions.getChapterPagesStreaming(extensionId, chapter.id);

                        const unsubscribe = window.electronAPI.extensions.onChapterPagesProgress((data) => {
                            if (cancelled) {
                                clearTimeout(timeout);
                                unsubscribe();
                                // Cache whatever pages we have on cancellation
                                if (pages.length > 0) {
                                    window.electronAPI.extensions.cacheChapterPages(chapter.id, extensionId, pages)
                                        .catch(e => console.warn('Failed to cache pages on cancel:', e));
                                }
                                resolve();
                                return;
                            }

                            if (data.error) {
                                clearTimeout(timeout);
                                unsubscribe();
                                reject(new Error(data.error));
                                return;
                            }

                            if (data.pages && data.pages.length > 0) {
                                // Find new pages and add to download queue
                                const newPages = data.pages.filter(p => !pages.includes(p));
                                newPages.forEach(p => downloadQueue.push(p));
                                pages = data.pages;
                            }

                            if (data.done) {
                                allPagesFetched = true;
                                clearTimeout(timeout);
                                unsubscribe();

                                // Cache page URLs IMMEDIATELY when streaming finishes
                                // This ensures URLs are saved even if downloads are interrupted
                                if (pages.length > 0) {
                                    window.electronAPI.extensions.cacheChapterPages(chapter.id, extensionId, pages)
                                        .catch(e => console.warn('Failed to cache chapter pages:', e));
                                }

                                resolve();
                            }
                        });
                    });

                    // Wait for all downloads to complete
                    await queueProcessor;
                    while (downloadingCount > 0 && !cancelled) {
                        await new Promise(r => setTimeout(r, 100));
                    }

                    if (pages.length === 0) {
                        totalSkippedCount++;
                        completed++;
                        continue;
                    }

                    // Note: cacheChapterPages is now called immediately when streaming finishes (above)

                    totalPagesProcessed += pages.length;
                    totalSuccessCount += chapterSuccessCount;
                    totalFailedCount += chapterFailedCount;
                    allFailedPages.push(...chapterFailedPages);

                    // Update history periodically
                    if (historyId && completed % 5 === 0) {
                        window.electronAPI.db.updatePrefetchHistory(historyId, {
                            completedChapters: completed,
                            totalPages: totalPagesProcessed,
                            successCount: totalSuccessCount,
                            failedCount: totalFailedCount,
                        }).catch(() => { });
                    }

                } catch (e) {
                    console.error(`Unexpected error processing chapter ${chapter.id}`, e);
                    totalSkippedCount++;
                }
                completed++;
            }

            // Determine final status
            const finalStatus = cancelled ? 'cancelled' : (totalFailedCount > 0 && totalSuccessCount === 0 ? 'failed' : 'completed');

            // Update history with final results
            if (historyId) {
                await window.electronAPI.db.updatePrefetchHistory(historyId, {
                    status: finalStatus,
                    completedChapters: completed,
                    totalPages: totalPagesProcessed,
                    successCount: totalSuccessCount,
                    failedCount: totalFailedCount,
                    skippedCount: totalSkippedCount,
                    failedPages: allFailedPages.slice(0, 100), // Limit stored failures
                }).catch(e => console.error('Failed to update prefetch history:', e));
            }

            // Set summary for UI notification
            set({
                prefetchSummary: {
                    mangaTitle,
                    status: finalStatus,
                    successCount: totalSuccessCount,
                    failedCount: totalFailedCount,
                    skippedCount: totalSkippedCount,
                    failedPages: allFailedPages.slice(0, 20), // Limit displayed failures
                }
            });

        } catch (err) {
            console.error('Error during prefetch initialization:', err);
            if (historyId) {
                window.electronAPI.db.updatePrefetchHistory(historyId, { status: 'failed' }).catch(() => { });
            }
        } finally {
            console.log('Prefetch finished or cancelled');
            set({
                isPrefetching: false,
                prefetchMangaId: null,
                prefetchHistoryId: null,
                prefetchProgress: { current: 0, total: 0, chapter: '' }
            });
        }
    },
}));
