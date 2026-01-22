import { create } from 'zustand';

export interface Extension {
    id: string;
    name: string;
    version: string | number;
    baseUrl: string;
    icon?: string;
    iconUrl?: string; // Pre-computed manga-image:// URL for icon
    language: string;
    nsfw: boolean;
}

export interface AvailableExtension {
    id: string;
    name: string;
    version: string | number;
    repoUrl: string;
    icon?: string;
    language: string;
    nsfw: boolean;
}

interface ExtensionState {
    extensions: Extension[];
    selectedExtension: Extension | null;
    loadingExtensions: boolean;

    // Install/Available State
    installing: Set<string>;
    uninstalling: Set<string>;
    availableExtensions: AvailableExtension[];
    loadingAvailable: boolean;
    repoUrl: string;
    error: string | null;

    // Captcha State
    captchaUrl: string | null;
    captchaCallback: (() => void) | null;

    loadExtensions: () => Promise<void>;
    selectExtension: (ext: Extension) => void;

    // Actions
    fetchAvailableExtensions: (url: string) => Promise<void>;
    installExtension: (ext: AvailableExtension) => Promise<void>;
    uninstallExtension: (extensionId: string) => Promise<void>;
    reloadExtensions: () => Promise<void>;
    setRepoUrl: (url: string) => void;

    showCaptcha: (url: string, callback: () => void) => void;
    hideCaptcha: () => void;
}

export const useExtensionStore = create<ExtensionState>((set, get) => ({
    extensions: [],
    selectedExtension: null,
    loadingExtensions: false,

    installing: new Set(),
    uninstalling: new Set(),
    availableExtensions: [],
    loadingAvailable: false,
    repoUrl: 'https://github.com/Mangyomi/mangyomi-extensions',
    error: null,

    captchaUrl: null,
    captchaCallback: null,

    loadExtensions: async () => {
        set({ loadingExtensions: true });
        try {
            const rawExtensions = await window.electronAPI.extensions.getAll();
            // Pre-compute iconUrl for each extension
            const extensions = rawExtensions.map(ext => ({
                ...ext,
                iconUrl: ext.icon ? `manga-image://?url=${encodeURIComponent(`file://${ext.icon.replace(/\\/g, '/')}`)}&ext=local` : undefined
            }));
            set({ extensions, loadingExtensions: false });
            // Don't set a default here - let the Browse component handle it
            // based on the user's custom extension order
        } catch (error) {
            console.error('Failed to load extensions:', error);
            set({ loadingExtensions: false });
        }
    },

    selectExtension: (ext) => {
        set({ selectedExtension: ext });
    },

    fetchAvailableExtensions: async (url) => {
        set({ loadingAvailable: true, error: null, repoUrl: url });
        try {
            const available = await window.electronAPI.extensions.listAvailable(url);
            set({ availableExtensions: available, loadingAvailable: false });
        } catch (error: any) {
            console.error('Failed to fetch available extensions:', error);
            set({ error: error.message || 'Failed to fetch extensions', loadingAvailable: false });
        }
    },

    installExtension: async (ext) => {
        set(state => ({ installing: new Set(state.installing).add(ext.id), error: null }));
        try {
            const result = await window.electronAPI.extensions.install(ext.repoUrl, ext.id);
            if (result.success) {
                await get().loadExtensions();
                // We don't manually update availableExtensions installed status in store, 
                // the UI derives it from matching ID in `extensions` list.
            } else {
                set({ error: result.error || 'Installation failed' });
            }
        } catch (error: any) {
            set({ error: error.message || 'Installation failed' });
        } finally {
            set(state => {
                const newSet = new Set(state.installing);
                newSet.delete(ext.id);
                return { installing: newSet };
            });
        }
    },

    uninstallExtension: async (extensionId) => {
        set(state => ({ uninstalling: new Set(state.uninstalling).add(extensionId), error: null }));
        try {
            const result = await window.electronAPI.extensions.uninstall(extensionId);
            if (result.success) {
                await get().loadExtensions();
            } else {
                set({ error: result.error || 'Uninstallation failed' });
            }
        } catch (error: any) {
            set({ error: error.message || 'Uninstallation failed' });
        } finally {
            set(state => {
                const newSet = new Set(state.uninstalling);
                newSet.delete(extensionId);
                return { uninstalling: newSet };
            });
        }
    },

    reloadExtensions: async () => {
        await get().loadExtensions();
    },

    setRepoUrl: (url) => set({ repoUrl: url }),

    showCaptcha: (url, callback) => {
        set({ captchaUrl: url, captchaCallback: callback });
    },

    hideCaptcha: () => {
        set({ captchaUrl: null, captchaCallback: null });
    },
}));
