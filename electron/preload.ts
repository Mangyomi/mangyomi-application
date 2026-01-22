import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
    db: {
        getManga: (id: string) => ipcRenderer.invoke('db:getManga', id),
        getAllManga: () => ipcRenderer.invoke('db:getAllManga'),
        addManga: (manga: any) => ipcRenderer.invoke('db:addManga', manga),
        updateManga: (id: string, data: any) => ipcRenderer.invoke('db:updateManga', id, data),
        deleteManga: (id: string) => ipcRenderer.invoke('db:deleteManga', id),
        cleanLibrary: (deleteTags: boolean) => ipcRenderer.invoke('db:cleanLibrary', deleteTags),
        ensureManga: (manga: any) => ipcRenderer.invoke('db:ensureManga', manga),
        getChapters: (mangaId: string) => ipcRenderer.invoke('db:getChapters', mangaId),
        addChapters: (chapters: any[]) => ipcRenderer.invoke('db:addChapters', chapters),
        markChapterRead: (chapterId: string, pageNumber?: number) =>
            ipcRenderer.invoke('db:markChapterRead', chapterId, pageNumber),
        markChapterUnread: (chapterId: string) => ipcRenderer.invoke('db:markChapterUnread', chapterId),
        markChaptersRead: (chapterIds: string[]) => ipcRenderer.invoke('db:markChaptersRead', chapterIds),
        markChaptersUnread: (chapterIds: string[]) => ipcRenderer.invoke('db:markChaptersUnread', chapterIds),
        saveReadingProgress: (manga: any, chapter: any, pageNumber: number) =>
            ipcRenderer.invoke('db:saveReadingProgress', manga, chapter, pageNumber),
        getHistory: (limit?: number, offset?: number) => ipcRenderer.invoke('db:getHistory', limit, offset),
        deleteHistory: (mangaId: string) => ipcRenderer.invoke('db:deleteHistory', mangaId),
        clearAllHistory: () => ipcRenderer.invoke('db:clearAllHistory'),
        getTags: () => ipcRenderer.invoke('db:getTags'),
        createTag: (name: string, color: string, isNsfw: boolean) => ipcRenderer.invoke('db:createTag', name, color, isNsfw),
        updateTag: (id: number, name: string, color: string, isNsfw: boolean) => ipcRenderer.invoke('db:updateTag', id, name, color, isNsfw),
        deleteTag: (id: number) => ipcRenderer.invoke('db:deleteTag', id),
        addTagToManga: (mangaId: string, tagId: number) =>
            ipcRenderer.invoke('db:addTagToManga', mangaId, tagId),
        removeTagFromManga: (mangaId: string, tagId: number) =>
            ipcRenderer.invoke('db:removeTagFromManga', mangaId, tagId),
        getMangaByTag: (tagId: number) => ipcRenderer.invoke('db:getMangaByTag', tagId),
        getTagsForManga: (mangaId: string) => ipcRenderer.invoke('db:getTagsForManga', mangaId),
        restoreBackup: (filePath: string) => ipcRenderer.invoke('db:restoreBackup', filePath),
        triggerRestore: () => ipcRenderer.invoke('db:triggerRestore'),
        exportBackup: () => ipcRenderer.invoke('db:exportBackup'),
        clearAllData: () => ipcRenderer.invoke('db:clearAllData'),
        viewBackup: () => ipcRenderer.invoke('db:viewBackup'),
        parseBackupFile: (filePath: string) => ipcRenderer.invoke('db:parseBackupFile', filePath),
        importBackup: (options: { filePath: string; options: any }) => ipcRenderer.invoke('db:importBackup', options),
        updateMangaMetadata: (mangaId: string, metadata: { cover_url?: string; title?: string; author?: string }) =>
            ipcRenderer.invoke('db:updateMangaMetadata', mangaId, metadata),
        onImportProgress: (callback: (event: any, data: { status: string; current: number; total: number }) => void) => {
            const subscription = (_: any, data: any) => callback(_, data);
            ipcRenderer.on('import:progress', subscription);
            return () => {
                ipcRenderer.removeListener('import:progress', subscription);
            };
        },
        onRestoreProgress: (callback: (event: any, data: { status: string; current: number; total: number }) => void) => {
            ipcRenderer.on('restore:progress', callback);
            return () => ipcRenderer.removeListener('restore:progress', callback);
        },
        cancelRestore: () => ipcRenderer.invoke('db:cancelRestore'),
        // Prefetch History
        createPrefetchHistory: (data: { mangaId: string; mangaTitle: string; extensionId: string; totalChapters: number }) =>
            ipcRenderer.invoke('db:createPrefetchHistory', data),
        updatePrefetchHistory: (id: number, data: any) =>
            ipcRenderer.invoke('db:updatePrefetchHistory', id, data),
        getPrefetchHistory: (mangaId?: string, limit?: number) =>
            ipcRenderer.invoke('db:getPrefetchHistory', mangaId, limit),
        clearPrefetchHistory: (mangaId?: string) =>
            ipcRenderer.invoke('db:clearPrefetchHistory', mangaId),
        // Adaptive Prefetch: Reading Stats
        recordReadingStats: (data: any) =>
            ipcRenderer.invoke('db:recordReadingStats', data),
        getReadingStatsSummary: () =>
            ipcRenderer.invoke('db:getReadingStatsSummary'),
        // Adaptive Prefetch: Source Behavior
        updateSourceBehavior: (data: any) =>
            ipcRenderer.invoke('db:updateSourceBehavior', data),
        getSourceBehavior: (sourceId: string) =>
            ipcRenderer.invoke('db:getSourceBehavior', sourceId),
        getAllSourceBehaviors: () =>
            ipcRenderer.invoke('db:getAllSourceBehaviors'),
        clearAdaptiveTraining: () =>
            ipcRenderer.invoke('db:clearAdaptiveTraining'),
    },

    extensions: {
        getAll: () => ipcRenderer.invoke('ext:getAll'),
        enable: (id: string) => ipcRenderer.invoke('ext:enable', id),
        disable: (id: string) => ipcRenderer.invoke('ext:disable', id),
        listAvailable: (repoUrl: string) => ipcRenderer.invoke('ext:listAvailable', repoUrl),
        install: (repoUrl: string, extensionId: string) =>
            ipcRenderer.invoke('ext:install', repoUrl, extensionId),
        sideload: () => ipcRenderer.invoke('ext:sideload'),
        sideloadBulk: () => ipcRenderer.invoke('ext:sideloadBulk'),
        uninstall: (extensionId: string) => ipcRenderer.invoke('ext:uninstall', extensionId),
        getFilters: (extensionId: string) => ipcRenderer.invoke('ext:getFilters', extensionId),
        getPopularManga: (extensionId: string, page: number, filters?: Record<string, string | string[]>) =>
            ipcRenderer.invoke('ext:getPopularManga', extensionId, page, filters),
        getLatestManga: (extensionId: string, page: number, filters?: Record<string, string | string[]>) =>
            ipcRenderer.invoke('ext:getLatestManga', extensionId, page, filters),
        searchManga: (extensionId: string, query: string, page: number, filters?: Record<string, string | string[]>) =>
            ipcRenderer.invoke('ext:searchManga', extensionId, query, page, filters),
        getMangaDetails: (extensionId: string, mangaId: string) =>
            ipcRenderer.invoke('extensions:getMangaDetails', extensionId, mangaId),
        getMangaCover: (extensionId: string, mangaId: string) =>
            ipcRenderer.invoke('extensions:getMangaCover', extensionId, mangaId),
        getChapterList: (extensionId: string, mangaId: string) =>
            ipcRenderer.invoke('extensions:getChapterList', extensionId, mangaId),
        getChapterPages: (extensionId: string, chapterId: string) =>
            ipcRenderer.invoke('ext:getChapterPages', extensionId, chapterId),
        // Streaming page loading
        getChapterPagesStreaming: (extensionId: string, chapterId: string) =>
            ipcRenderer.send('ext:getChapterPagesStreaming', extensionId, chapterId),
        onChapterPagesProgress: (callback: (data: { pages: string[], done: boolean, total?: number, progress?: number, error?: string }) => void) => {
            const handler = (_event: any, data: { pages: string[], done: boolean, total?: number, progress?: number, error?: string }) => callback(data);
            ipcRenderer.on('ext:chapterPagesProgress', handler);
            return () => ipcRenderer.removeListener('ext:chapterPagesProgress', handler);
        },
        cancelChapterPagesStreaming: (extensionId?: string) => ipcRenderer.send('ext:cancelChapterPagesStreaming', extensionId),
        // Chapter pages cache
        getCachedChapterPages: (chapterId: string) =>
            ipcRenderer.invoke('ext:getCachedChapterPages', chapterId),
        cacheChapterPages: (chapterId: string, extensionId: string, pages: string[]) =>
            ipcRenderer.invoke('ext:cacheChapterPages', chapterId, extensionId, pages),
        // Sandbox lifecycle
        setActive: (extensionId: string) => ipcRenderer.invoke('extensions:setActive', extensionId),
        clearActive: (extensionId: string) => ipcRenderer.invoke('extensions:clearActive', extensionId),
        destroySandbox: (extensionId: string) => ipcRenderer.invoke('extensions:destroySandbox', extensionId),
        // Lazy image URL resolution
        getImageUrl: (extensionId: string, pageUrl: string) =>
            ipcRenderer.invoke('extensions:getImageUrl', extensionId, pageUrl),
    },

    getProxiedImageUrl: (url: string, extensionId: string, mangaId?: string, chapterId?: string) => {
        // Return empty string for invalid URLs to prevent 400 errors
        if (!url || url.trim() === '') {
            return '';
        }
        let proxyUrl = `manga-image://proxy?url=${encodeURIComponent(url)}&ext=${extensionId}`;
        if (mangaId) proxyUrl += `&manga=${encodeURIComponent(mangaId)}`;
        if (chapterId) proxyUrl += `&chapter=${encodeURIComponent(chapterId)}`;
        return proxyUrl;
    },

    window: {
        minimize: () => ipcRenderer.invoke('window:minimize'),
        maximize: () => ipcRenderer.invoke('window:maximize'),
        close: () => ipcRenderer.invoke('window:close'),
        toggleFullscreen: () => ipcRenderer.invoke('window:toggleFullscreen') as Promise<boolean>,
        isFullscreen: () => ipcRenderer.invoke('window:isFullscreen') as Promise<boolean>,
        setFullscreen: (fullscreen: boolean) => ipcRenderer.invoke('window:setFullscreen', fullscreen),
    },

    app: {
        createDumpLog: (consoleLogs: string, networkActivity: string) =>
            ipcRenderer.invoke('app:createDumpLog', consoleLogs, networkActivity),
        openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),
        openInAppBrowser: (url: string) => ipcRenderer.invoke('app:openInAppBrowser', url),
        solveCloudflare: (url: string) => ipcRenderer.invoke('app:solveCloudflare', url),
        getMemoryStats: () => ipcRenderer.invoke('app:getMemoryStats'),
        startMemoryMonitoring: () => ipcRenderer.invoke('app:startMemoryMonitoring'),
        stopMemoryMonitoring: () => ipcRenderer.invoke('app:stopMemoryMonitoring'),
        getVersion: () => ipcRenderer.invoke('app:getVersion') as Promise<string>,
        checkForUpdates: (useBeta: boolean) => ipcRenderer.invoke('app:checkForUpdates', useBeta),
        downloadUpdate: (url: string, fileName: string, blockmapUrl?: string, targetVersion?: string) => ipcRenderer.invoke('app:downloadUpdate', url, fileName, blockmapUrl, targetVersion),
        installUpdate: () => ipcRenderer.invoke('app:installUpdate'),
        onDownloadProgress: (callback: (event: any, data: { percent: number; bytesDownloaded: number; totalBytes: number; isDifferential?: boolean }) => void) => {
            ipcRenderer.on('update:downloadProgress', callback);
            return () => ipcRenderer.removeListener('update:downloadProgress', callback);
        },
        onDownloadComplete: (callback: (event: any, data: { success: boolean; filePath?: string; error?: string }) => void) => {
            ipcRenderer.on('update:downloadComplete', callback);
            return () => ipcRenderer.removeListener('update:downloadComplete', callback);
        },
        onFileOpened: (callback: (event: any, filePath: string) => void) => {
            ipcRenderer.on('file-opened', callback);
            return () => ipcRenderer.removeListener('file-opened', callback);
        },
        // Forward renderer logs to main process (for terminal output)
        log: (level: 'error' | 'warn' | 'info' | 'debug' | 'verbose', context: string, message: string) =>
            ipcRenderer.invoke('app:log', level, context, message),
        // GPU status management
        isGpuDisabled: () => ipcRenderer.invoke('app:isGpuDisabled') as Promise<boolean>,
        resetGpuFlag: () => ipcRenderer.invoke('app:resetGpuFlag') as Promise<{ success: boolean; needsRestart: boolean }>,
    },

    cache: {
        save: (url: string, extensionId: string, mangaId: string, chapterId: string, isPrefetch?: boolean) =>
            ipcRenderer.invoke('cache:save', url, extensionId, mangaId, chapterId, isPrefetch ?? false),
        clear: (mangaId?: string) => ipcRenderer.invoke('cache:clear', mangaId),
        setLimit: (bytes: number) => ipcRenderer.invoke('cache:setLimit', bytes),
        getSize: () => ipcRenderer.invoke('cache:getSize') as Promise<number>,
        checkManga: (mangaId: string) => ipcRenderer.invoke('cache:checkManga', mangaId) as Promise<number>
    },

    anilist: {
        login: () => ipcRenderer.invoke('anilist:login'),
        logout: () => ipcRenderer.invoke('anilist:logout'),
        isAuthenticated: () => ipcRenderer.invoke('anilist:isAuthenticated') as Promise<boolean>,
        getUser: () => ipcRenderer.invoke('anilist:getUser'),
        setClientId: (clientId: string) => ipcRenderer.invoke('anilist:setClientId', clientId),
        searchManga: (query: string) => ipcRenderer.invoke('anilist:searchManga', query),
        getMangaById: (anilistId: number) => ipcRenderer.invoke('anilist:getMangaById', anilistId),
        linkManga: (mangaId: string, anilistId: number) =>
            ipcRenderer.invoke('anilist:linkManga', mangaId, anilistId),
        unlinkManga: (mangaId: string) => ipcRenderer.invoke('anilist:unlinkManga', mangaId),
        updateProgress: (anilistId: number, progress: number) =>
            ipcRenderer.invoke('anilist:updateProgress', anilistId, progress),
        syncProgress: (mangaId: string) => ipcRenderer.invoke('anilist:syncProgress', mangaId),
        getTokenData: () => ipcRenderer.invoke('anilist:getTokenData'),
        setTokenData: (data: string) => ipcRenderer.invoke('anilist:setTokenData', data),
    },

    settings: {
        get: (key: string) => ipcRenderer.invoke('settings:get', key),
        set: (key: string, value: any) => ipcRenderer.invoke('settings:set', key, value),
        getAll: () => ipcRenderer.invoke('settings:getAll'),
        reset: () => ipcRenderer.invoke('settings:reset'),
    },

    discord: {
        updateActivity: (details: string, state: string, largeImageKey?: string, largeImageText?: string, smallImageKey?: string, smallImageText?: string, buttons?: { label: string; url: string }[]) =>
            ipcRenderer.invoke('discord:updateActivity', details, state, largeImageKey, largeImageText, smallImageKey, smallImageText, buttons),
        clearActivity: () => ipcRenderer.invoke('discord:clearActivity'),
    },

    proxy: {
        validate: (proxy: { type: string; ip: string; port: number; username?: string; password?: string }, skipValidation?: boolean) =>
            ipcRenderer.invoke('proxy:validate', proxy, skipValidation) as Promise<{ valid: boolean; latency?: number; error?: string }>,
    },

    export: {
        libraryPng: (options?: { includeNsfwSources?: boolean; includeNsfwTags?: boolean }) =>
            ipcRenderer.invoke('export-library-png', options),
    },

    onExportProgress: (callback: (event: any, data: { current: number; total: number; status: string }) => void) => {
        ipcRenderer.on('export-progress', callback);
    },
    offExportProgress: (callback: (event: any, data: { current: number; total: number; status: string }) => void) => {
        ipcRenderer.removeListener('export-progress', callback);
    },
});
