import Store from 'electron-store';

interface SettingsSchema {
    theme: 'light' | 'dark' | 'system';
    defaultReaderMode: 'vertical' | 'horizontal';
    prefetchChapters: number;
    maxCacheSize: number;
    ignoreCacheLimitForPrefetch: boolean;
    logLevel: 'error' | 'warn' | 'info' | 'debug' | 'verbose';
    disabledExtensions: string[];
    extensionOrder: string[];
    hideNsfwInLibrary: boolean;
    hideNsfwInHistory: boolean;
    hideNsfwInTags: boolean;
    hideNsfwCompletely: boolean;
    discordRpcEnabled: boolean;
    discordRpcHideNsfw: boolean;
    discordRpcStrictNsfw: boolean;
    developerMode: boolean;
    windowBounds?: {
        x: number;
        y: number;
        width: number;
        height: number;
        isMaximized: boolean;
    };
}

const schema = {
    theme: {
        type: 'string',
        enum: ['light', 'dark', 'system'],
        default: 'dark'
    },
    defaultReaderMode: {
        type: 'string',
        enum: ['vertical', 'horizontal'],
        default: 'vertical'
    },
    prefetchChapters: {
        type: 'number',
        minimum: 0,
        maximum: 10,
        default: 0
    },
    maxCacheSize: {
        type: 'number',
        default: 1024 * 1024 * 1024 // 1GB
    },
    ignoreCacheLimitForPrefetch: {
        type: 'boolean',
        default: false
    },
    logLevel: {
        type: 'string',
        enum: ['error', 'warn', 'info', 'debug', 'verbose'],
        default: 'info'
    },
    disabledExtensions: {
        type: 'array',
        items: { type: 'string' },
        default: []
    },
    extensionOrder: {
        type: 'array',
        items: { type: 'string' },
        default: []
    },
    hideNsfwInLibrary: {
        type: 'boolean',
        default: false
    },
    hideNsfwInHistory: {
        type: 'boolean',
        default: false
    },
    hideNsfwInTags: {
        type: 'boolean',
        default: false
    },
    hideNsfwCompletely: {
        type: 'boolean',
        default: false
    },
    discordRpcEnabled: {
        type: 'boolean',
        default: true
    },
    discordRpcHideNsfw: {
        type: 'boolean',
        default: true
    },
    discordRpcStrictNsfw: {
        type: 'boolean',
        default: true
    },
    developerMode: {
        type: 'boolean',
        default: false
    },
    windowBounds: {
        type: 'object',
        properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            width: { type: 'number', minimum: 1000 },
            height: { type: 'number', minimum: 700 },
            isMaximized: { type: 'boolean' }
        },
        default: undefined
    }
} as const;

export const store = new Store<SettingsSchema>({
    schema: schema as any,
    name: 'mangyomi-config',
    fileExtension: 'json',
    clearInvalidConfig: true
});

// Helper functions for main process
export const getSetting = <K extends keyof SettingsSchema>(key: K): SettingsSchema[K] => {
    return store.get(key);
};

export const setSetting = <K extends keyof SettingsSchema>(key: K, value: SettingsSchema[K]): void => {
    store.set(key, value);
};

export const getAllSettings = (): SettingsSchema => {
    return store.store;
};

export const resetSettings = (): void => {
    store.clear();
};
