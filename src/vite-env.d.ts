/// <reference types="vite/client" />

declare const APP_VERSION: string;

interface AvailableExtension {
    id: string;
    name: string;
    version: string | number;
    baseUrl: string;
    icon?: string;
    language: string;
    nsfw: boolean;
    repoUrl: string;
    folderName: string;
    installed: boolean;
}

interface FilterOption {
    value: string;
    label: string;
}

interface ExtensionFilter {
    id: string;
    label: string;
    type: 'select' | 'tri-state';
    options: FilterOption[];
    default?: string | string[];
}

interface TriStateFilterValue {
    include: string[];
    exclude: string[];
}

type FilterValues = Record<string, string | string[] | TriStateFilterValue>;

interface InstallResult {
    success: boolean;
    error?: string;
}

interface Window {
    electronAPI: {
        db: {
            getManga: (id: string) => Promise<any>;
            getAllManga: () => Promise<any[]>;
            addManga: (manga: any) => Promise<void>;
            updateManga: (id: string, data: any) => Promise<void>;
            deleteManga: (id: string) => Promise<void>;
            cleanLibrary: (deleteTags: boolean) => Promise<{ success: boolean }>;
            ensureManga: (manga: any) => Promise<void>;
            getChapters: (mangaId: string) => Promise<any[]>;
            addChapters: (chapters: any[]) => Promise<void>;
            markChapterRead: (chapterId: string, pageNumber?: number) => Promise<void>;
            markChapterUnread: (chapterId: string) => Promise<void>;
            markChaptersRead: (chapterIds: string[]) => Promise<void>;
            markChaptersUnread: (chapterIds: string[]) => Promise<void>;
            saveReadingProgress: (manga: any, chapter: any, pageNumber: number) => Promise<void>;
            getHistory: (limit?: number, offset?: number) => Promise<any[]>;
            deleteHistory: (mangaId: string) => Promise<void>;
            clearAllHistory: () => Promise<void>;
            getTags: () => Promise<any[]>;
            createTag: (name: string, color: string, isNsfw: boolean) => Promise<any>;
            updateTag: (id: number, name: string, color: string, isNsfw: boolean) => Promise<void>;
            deleteTag: (id: number) => Promise<void>;
            addTagToManga: (mangaId: string, tagId: number) => Promise<void>;
            removeTagFromManga: (mangaId: string, tagId: number) => Promise<void>;
            getMangaByTag: (tagId: number) => Promise<any[]>;
            getTagsForManga: (mangaId: string) => Promise<Tag[]>;
            restoreBackup: (filePath: string) => Promise<{ success: boolean; message: string; count?: number; libraryCount?: number }>;
            triggerRestore: () => Promise<{ success: boolean; message: string; count?: number; libraryCount?: number }>;
            exportBackup: () => Promise<{ success: boolean; message?: string; filePath?: string }>;
            clearAllData: () => Promise<{ success: boolean }>;
            viewBackup: () => Promise<{
                success: boolean;
                cancelled?: boolean;
                error?: string;
                fileName?: string;
                filePath?: string;
                exportedAt?: string;
                version?: number;
                stats?: { manga: number; tags: number; chapters: number; history: number; mangaTags: number; extensions: number };
                data?: any;
            }>;
            parseBackupFile: (filePath: string) => Promise<{
                success: boolean;
                error?: string;
                fileName?: string;
                filePath?: string;
                exportedAt?: string;
                version?: number;
                stats?: { manga: number; tags: number; chapters: number; history: number; mangaTags: number; extensions: number };
            }>;
            importBackup: (options: {
                filePath: string;
                options: { manga: boolean; tags: boolean; chapters: boolean; history: boolean; extensions: boolean; mergeStrategy: 'keep' | 'overwrite' };
            }) => Promise<{ success: boolean; counts?: any; error?: string }>;
            onImportProgress: (callback: (event: any, data: { status: string; current: number; total: number }) => void) => () => void;
            updateMangaMetadata: (mangaId: string, metadata: { cover_url?: string; title?: string; author?: string }) => Promise<void>;
            onRestoreProgress: (callback: (event: any, data: { status: string; current: number; total: number }) => void) => () => void;
            cancelRestore: () => Promise<{ success: boolean }>;
            // Prefetch History
            createPrefetchHistory: (data: { mangaId: string; mangaTitle: string; extensionId: string; totalChapters: number }) => Promise<number>;
            updatePrefetchHistory: (id: number, data: {
                status?: string;
                completedChapters?: number;
                totalPages?: number;
                successCount?: number;
                failedCount?: number;
                skippedCount?: number;
                failedPages?: { url: string; chapter: string; error: string }[];
            }) => Promise<void>;
            getPrefetchHistory: (mangaId?: string, limit?: number) => Promise<any[]>;
            clearPrefetchHistory: (mangaId?: string) => Promise<void>;
            // Adaptive Prefetch: Reading Stats
            recordReadingStats: (data: {
                sessionDate: number;
                sourceId: string;
                mangaId: string;
                chapterId: string;
                pagesViewed: number;
                readingTimeSeconds: number;
                chaptersCompleted: number;
                avgVelocity: number;
                forwardNavigations: number;
                backwardNavigations: number;
                startedAt: number;
                endedAt: number;
            }) => Promise<void>;
            getReadingStatsSummary: () => Promise<{
                todaySeconds: number;
                weekChapters: number;
                streak: number;
                avgVelocity: number;
                totalPages: number;
            }>;
            // Adaptive Prefetch: Source Behavior
            updateSourceBehavior: (data: {
                sourceId: string;
                currentRequestRate: number;
                maxObservedRate: number;
                initialRate: number;
                maxRate: number;
                consecutiveFailures: number;
                totalRequests: number;
                failedRequests: number;
                lastRateLimitTime: number | null;
                avgResponseTimeMs: number;
                backoffUntil: number | null;
                backoffMultiplier: number;
            }) => Promise<void>;
            getSourceBehavior: (sourceId: string) => Promise<any>;
            getAllSourceBehaviors: () => Promise<any[]>;
            clearAdaptiveTraining: () => Promise<{ success: boolean }>;
        };
        window: {
            minimize: () => Promise<void>;
            maximize: () => Promise<void>;
            close: () => Promise<void>;
            toggleFullscreen: () => Promise<boolean>;
            isFullscreen: () => Promise<boolean>;
            setFullscreen: (fullscreen: boolean) => Promise<void>;
        };
        extensions: {
            getAll: () => Promise<Extension[]>;
            enable: (id: string) => Promise<void>;
            disable: (id: string) => Promise<void>;
            listAvailable: (repoUrl: string) => Promise<AvailableExtension[]>;
            install: (repoUrl: string, extensionId: string) => Promise<InstallResult>;
            sideload: () => Promise<InstallResult>;
            sideloadBulk: () => Promise<{ success: boolean; installed: number; failed: number; error?: string }>;
            uninstall: (extensionId: string) => Promise<InstallResult>;
            getFilters: (extensionId: string) => Promise<ExtensionFilter[]>;
            getPopularManga: (extensionId: string, page: number, filters?: FilterValues) => Promise<any>;
            getLatestManga: (extensionId: string, page: number, filters?: FilterValues) => Promise<any>;
            searchManga: (extensionId: string, query: string, page: number, filters?: FilterValues) => Promise<any>;
            getMangaDetails: (extensionId: string, mangaId: string) => Promise<any>;
            getMangaCover: (extensionId: string, mangaId: string) => Promise<string | null>;
            getChapterList: (extensionId: string, mangaId: string) => Promise<any[]>;
            getChapterPages: (extensionId: string, chapterId: string) => Promise<string[]>;
            // Streaming page loading - sends pages as they're fetched
            getChapterPagesStreaming: (extensionId: string, chapterId: string) => void;
            onChapterPagesProgress: (callback: (data: { pages: string[], done: boolean, total?: number, progress?: number, error?: string }) => void) => () => void;
            cancelChapterPagesStreaming: (extensionId?: string) => void;
            // Chapter pages cache (persistent)
            getCachedChapterPages: (chapterId: string) => Promise<string[] | null>;
            cacheChapterPages: (chapterId: string, extensionId: string, pages: string[]) => Promise<boolean>;
            // Sandbox lifecycle (lazy loading)
            setActive: (extensionId: string) => Promise<void>;
            clearActive: (extensionId: string) => Promise<void>;
            destroySandbox: (extensionId: string) => Promise<void>;
            // Lazy image URL resolution (like Tachiyomi's imageUrlParse)
            getImageUrl: (extensionId: string, pageUrl: string) => Promise<string>;
        };
        app: {
            createDumpLog: (consoleLogs: string, networkActivity: string) => Promise<{ success: boolean; path: string }>;
            openExternal: (url: string) => Promise<void>;
            openInAppBrowser: (url: string) => Promise<void>;
            solveCloudflare: (url: string) => Promise<{ success: boolean; cookies?: string; message?: string }>;
            getMemoryStats: () => Promise<any>;
            startMemoryMonitoring: () => Promise<{ success: boolean }>;
            stopMemoryMonitoring: () => Promise<{ success: boolean }>;
            getVersion: () => Promise<string>;
            checkForUpdates: (useBeta: boolean) => Promise<{
                hasUpdate: boolean;
                currentVersion?: string;
                latestVersion?: string;
                downloadUrl?: string | null;
                blockmapUrl?: string | null;
                fileName?: string | null;
                fileSize?: number;
                releaseNotes?: string;
                publishedAt?: string;
                isNightly?: boolean;
                isDifferential?: boolean;
                error?: string;
            }>;
            downloadUpdate: (url: string, fileName: string, blockmapUrl?: string, targetVersion?: string) => Promise<{ success: boolean; filePath?: string; error?: string; isDifferential?: boolean }>;
            installUpdate: () => Promise<{ success: boolean; error?: string }>;
            onDownloadProgress: (callback: (event: any, data: { percent: number; bytesDownloaded: number; totalBytes: number; isDifferential?: boolean }) => void) => () => void;
            onDownloadComplete: (callback: (event: any, data: { success: boolean; filePath?: string; error?: string }) => void) => () => void;
            onFileOpened: (callback: (event: any, filePath: string) => void) => () => void;
            log: (level: 'error' | 'warn' | 'info' | 'debug' | 'verbose', context: string, message: string) => Promise<void>;
            isGpuDisabled: () => Promise<boolean>;
            resetGpuFlag: () => Promise<{ success: boolean; needsRestart: boolean }>;
        };
        cache: {
            save: (url: string, extensionId: string, mangaId: string, chapterId: string, isPrefetch?: boolean) => Promise<string | null>;
            clear: (mangaId?: string) => Promise<void>;
            setLimit: (bytes: number) => Promise<void>;
            getSize: () => Promise<number>;
            checkManga: (mangaId: string) => Promise<number>;
        };
        anilist: {
            login: () => Promise<{ success: boolean; token?: string; error?: string }>;
            logout: () => Promise<{ success: boolean }>;
            isAuthenticated: () => Promise<boolean>;
            getUser: () => Promise<any>;
            setClientId: (clientId: string) => Promise<void>;
            searchManga: (query: string) => Promise<any[]>;
            getMangaById: (anilistId: number) => Promise<any>;
            linkManga: (mangaId: string, anilistId: number) => Promise<{ success: boolean }>;
            unlinkManga: (mangaId: string) => Promise<{ success: boolean }>;
            updateProgress: (anilistId: number, progress: number) => Promise<{ success: boolean; data?: any; error?: string }>;
            syncProgress: (mangaId: string) => Promise<{ success: boolean; data?: any; error?: string }>;
            getTokenData: () => Promise<string | null>;
            setTokenData: (data: string) => Promise<void>;
        };
        settings: {
            get: (key: string) => Promise<any>;
            set: (key: string, value: any) => Promise<void>;
            getAll: () => Promise<any>;
            reset: () => Promise<void>;
        };
        getProxiedImageUrl: (url: string, extensionId: string, mangaId?: string, chapterId?: string) => string;
        discord: {
            updateActivity: (details: string, state: string, largeImageKey?: string, largeImageText?: string, smallImageKey?: string, smallImageText?: string, buttons?: { label: string; url: string }[]) => Promise<void>;
            clearActivity: () => Promise<void>;
        };
        proxy: {
            validate: (proxy: { type: string; ip: string; port: number; username?: string; password?: string }, skipValidation?: boolean) => Promise<{ valid: boolean; latency?: number; error?: string }>;
        };
    };
}
