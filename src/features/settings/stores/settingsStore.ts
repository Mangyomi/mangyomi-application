import { create } from 'zustand';
import { useAniListStore } from '../../../stores/anilistStore';
import { useLibraryStore } from '../../library/stores/libraryStore';
import { Extension } from '../../extensions/stores/extensionStore';
import type { LogLevel } from '../../../utils/logger';

export type Theme = 'light' | 'dark' | 'system';
export type ReaderMode = 'vertical' | 'horizontal';
export type BrowseViewMode = 'grid' | 'list' | 'compact';
export type ProxyType = 'http' | 'socks4' | 'socks5';

export interface ProxyConfig {
    type: ProxyType;
    ip: string;
    port: number;
    username?: string;
    password?: string;
}


interface SettingsState {
    theme: Theme;
    defaultReaderMode: ReaderMode;
    prefetchChapters: number; // 0 = disabled, 1-4 = chapters to prefetch ahead/behind
    maxCacheSize: number; // in bytes
    ignoreCacheLimitForPrefetch: boolean; // Allow prefetch to bypass cache limit
    logLevel: LogLevel; // Logging verbosity
    disabledExtensions: Set<string>;
    extensionOrder: string[]; // Ordered list of extension IDs for Browse page
    hideNsfwInLibrary: boolean;
    hideNsfwInHistory: boolean;
    hideNsfwInTags: boolean;
    hideNsfwCompletely: boolean;
    discordRpcEnabled: boolean;
    discordRpcHideNsfw: boolean;
    discordRpcStrictNsfw: boolean;
    developerMode: boolean;
    betaUpdates: boolean;
    browseViewMode: BrowseViewMode;
    proxies: ProxyConfig[];
    adaptivePrefetchEnabled: boolean;  // Adaptive prefetch (Beta)
    setTheme: (theme: Theme) => void;
    setDefaultReaderMode: (mode: ReaderMode) => void;
    setPrefetchChapters: (count: number) => void;
    setMaxCacheSize: (size: number) => void;
    setIgnoreCacheLimitForPrefetch: (value: boolean) => void;
    setLogLevel: (level: LogLevel) => void;
    toggleExtension: (extensionId: string) => void;
    isExtensionEnabled: (extensionId: string) => boolean;
    setExtensionOrder: (order: string[]) => void;
    setHideNsfwInLibrary: (value: boolean) => void;
    setHideNsfwInHistory: (value: boolean) => void;
    setHideNsfwInTags: (value: boolean) => void;
    setHideNsfwCompletely: (value: boolean) => void;
    setDiscordRpcEnabled: (value: boolean) => void;
    setDiscordRpcHideNsfw: (value: boolean) => void;
    setDiscordRpcStrictNsfw: (value: boolean) => void;
    setDeveloperMode: (value: boolean) => void;
    setBetaUpdates: (value: boolean) => void;
    setBrowseViewMode: (mode: BrowseViewMode) => void;
    addProxy: (proxy: ProxyConfig) => void;
    removeProxy: (index: number) => void;
    setAdaptivePrefetchEnabled: (value: boolean) => void;
    loadSettings: () => Promise<void>;
}

const applyTheme = (theme: Theme) => {
    const root = document.documentElement;

    if (theme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
        root.setAttribute('data-theme', theme);
    }
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
    theme: 'dark',
    defaultReaderMode: 'vertical',
    prefetchChapters: 0,
    maxCacheSize: 1024 * 1024 * 1024, // 1GB
    ignoreCacheLimitForPrefetch: false,
    logLevel: 'info',
    disabledExtensions: new Set<string>(),
    extensionOrder: [],
    hideNsfwInLibrary: false,
    hideNsfwInHistory: false,
    hideNsfwInTags: false,
    hideNsfwCompletely: false,
    discordRpcEnabled: true,
    discordRpcHideNsfw: true,
    discordRpcStrictNsfw: true,
    developerMode: false,
    betaUpdates: false,
    browseViewMode: 'grid',
    proxies: [],
    adaptivePrefetchEnabled: false,  // Opt-in beta feature

    setTheme: (theme) => {
        set({ theme });
        window.electronAPI.settings.set('theme', theme);
        applyTheme(theme);
    },

    setDefaultReaderMode: (mode) => {
        set({ defaultReaderMode: mode });
        window.electronAPI.settings.set('defaultReaderMode', mode);
    },

    setPrefetchChapters: (count) => {
        const validCount = Math.max(0, Math.min(4, count));
        set({ prefetchChapters: validCount });
        window.electronAPI.settings.set('prefetchChapters', validCount);
    },

    setMaxCacheSize: (size) => {
        set({ maxCacheSize: size });
        window.electronAPI.settings.set('maxCacheSize', size);
        window.electronAPI.cache.setLimit(size);
    },

    setIgnoreCacheLimitForPrefetch: (value) => {
        set({ ignoreCacheLimitForPrefetch: value });
        window.electronAPI.settings.set('ignoreCacheLimitForPrefetch', value);
    },

    setLogLevel: (level) => {
        set({ logLevel: level });
        window.electronAPI.settings.set('logLevel', level);
    },

    toggleExtension: (extensionId) => {
        const { disabledExtensions } = get();
        const newDisabled = new Set(disabledExtensions);
        if (newDisabled.has(extensionId)) {
            newDisabled.delete(extensionId);
        } else {
            newDisabled.add(extensionId);
            // Destroy sandbox immediately when extension is disabled
            window.electronAPI.extensions.destroySandbox(extensionId).catch(() => { });
        }
        set({ disabledExtensions: newDisabled });
        window.electronAPI.settings.set('disabledExtensions', Array.from(newDisabled));
    },

    isExtensionEnabled: (extensionId) => {
        return !get().disabledExtensions.has(extensionId);
    },

    setExtensionOrder: (order) => {
        set({ extensionOrder: order });
        window.electronAPI.settings.set('extensionOrder', order);
    },

    setHideNsfwInLibrary: (value) => {
        set({ hideNsfwInLibrary: value });
        window.electronAPI.settings.set('hideNsfwInLibrary', value);
    },

    setHideNsfwInHistory: (value) => {
        set({ hideNsfwInHistory: value });
        window.electronAPI.settings.set('hideNsfwInHistory', value);
    },

    setHideNsfwInTags: (value) => {
        set({ hideNsfwInTags: value });
        window.electronAPI.settings.set('hideNsfwInTags', value);
    },

    setHideNsfwCompletely: (value) => {
        set({ hideNsfwCompletely: value });
        window.electronAPI.settings.set('hideNsfwCompletely', value);
    },

    setDeveloperMode: (value) => {
        set({ developerMode: value });
        window.electronAPI.settings.set('developerMode', value);
    },

    setBetaUpdates: (value) => {
        set({ betaUpdates: value });
        window.electronAPI.settings.set('betaUpdates', value);
    },

    setDiscordRpcEnabled: (value) => {
        set({ discordRpcEnabled: value });
        window.electronAPI.settings.set('discordRpcEnabled', value);
        if (!value) {
            window.electronAPI.discord.clearActivity();
        }
    },

    setDiscordRpcHideNsfw: (value) => {
        set({ discordRpcHideNsfw: value });
        window.electronAPI.settings.set('discordRpcHideNsfw', value);
    },

    setDiscordRpcStrictNsfw: (value) => {
        set({ discordRpcStrictNsfw: value });
        window.electronAPI.settings.set('discordRpcStrictNsfw', value);
    },

    setBrowseViewMode: (mode) => {
        set({ browseViewMode: mode });
        window.electronAPI.settings.set('browseViewMode', mode);
    },

    addProxy: (proxy) => {
        const current = get().proxies;
        const updated = [...current, proxy];
        set({ proxies: updated });
        window.electronAPI.settings.set('proxies', updated);
    },

    removeProxy: (index) => {
        const current = get().proxies;
        const updated = current.filter((_, i) => i !== index);
        set({ proxies: updated });
        window.electronAPI.settings.set('proxies', updated);
    },

    setAdaptivePrefetchEnabled: (value) => {
        set({ adaptivePrefetchEnabled: value });
        window.electronAPI.settings.set('adaptivePrefetchEnabled', value);
    },

    loadSettings: async () => {
        try {
            const stored = await window.electronAPI.settings.getAll();
            if (!stored) {
                applyTheme(get().theme);
                return;
            }

            const updates: Partial<SettingsState> = {};

            if (stored.theme) {
                updates.theme = stored.theme as Theme;
                applyTheme(stored.theme as Theme);
            } else {
                applyTheme(get().theme);
            }
            if (stored.defaultReaderMode) updates.defaultReaderMode = stored.defaultReaderMode as ReaderMode;
            if (stored.prefetchChapters !== undefined) updates.prefetchChapters = stored.prefetchChapters as number;
            if (stored.maxCacheSize !== undefined) {
                updates.maxCacheSize = stored.maxCacheSize as number;
                // Sync initial limit to backend
                setTimeout(() => {
                    window.electronAPI.cache.setLimit(stored.maxCacheSize as number);
                }, 1000);
            }
            if (stored.ignoreCacheLimitForPrefetch !== undefined) updates.ignoreCacheLimitForPrefetch = stored.ignoreCacheLimitForPrefetch;
            if (stored.logLevel) updates.logLevel = stored.logLevel as LogLevel;
            if (stored.disabledExtensions) {
                updates.disabledExtensions = new Set(stored.disabledExtensions as string[]);
            }
            if (stored.extensionOrder) updates.extensionOrder = stored.extensionOrder;
            if (stored.hideNsfwInLibrary !== undefined) updates.hideNsfwInLibrary = stored.hideNsfwInLibrary;
            if (stored.hideNsfwInHistory !== undefined) updates.hideNsfwInHistory = stored.hideNsfwInHistory;
            if (stored.hideNsfwInTags !== undefined) updates.hideNsfwInTags = stored.hideNsfwInTags;
            if (stored.hideNsfwCompletely !== undefined) updates.hideNsfwCompletely = stored.hideNsfwCompletely;
            if (stored.discordRpcEnabled !== undefined) updates.discordRpcEnabled = stored.discordRpcEnabled;
            if (stored.discordRpcHideNsfw !== undefined) updates.discordRpcHideNsfw = stored.discordRpcHideNsfw;
            if (stored.discordRpcStrictNsfw !== undefined) updates.discordRpcStrictNsfw = stored.discordRpcStrictNsfw;
            if (stored.developerMode !== undefined) updates.developerMode = stored.developerMode;
            if (stored.betaUpdates !== undefined) updates.betaUpdates = stored.betaUpdates;
            if (stored.browseViewMode) updates.browseViewMode = stored.browseViewMode as BrowseViewMode;
            if (stored.proxies) updates.proxies = stored.proxies as ProxyConfig[];
            if (stored.adaptivePrefetchEnabled !== undefined) updates.adaptivePrefetchEnabled = stored.adaptivePrefetchEnabled;

            set(updates as any);
        } catch (error) {
            console.error('Failed to load settings:', error);
            applyTheme(get().theme);
        }
    },
}));


if (typeof window !== 'undefined') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        const { theme } = useSettingsStore.getState();
        if (theme === 'system') {
            applyTheme('system');
        }
    });
}
