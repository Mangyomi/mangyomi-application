import { create } from 'zustand';

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

interface BrowseState {
    browseManga: any[];
    browseLoading: boolean;
    browseHasMore: boolean;
    browsePage: number;
    browseMode: 'popular' | 'latest' | 'search';
    searchQuery: string;
    currentExtensionId: string | null;

    // Filter state
    availableFilters: ExtensionFilter[];
    activeFilters: FilterValues;
    filtersLoading: boolean;

    setBrowseLoading: (loading: boolean) => void;

    // Filter actions
    loadFilters: (extensionId: string) => Promise<void>;
    setFilter: (filterId: string, value: string | string[]) => void;
    clearFilters: () => void;

    // Browse actions
    setCurrentExtension: (extensionId: string | null) => void;
    browseMangaList: (extensionId: string, mode: 'popular' | 'latest', page?: number, resetFilters?: boolean) => Promise<void>;
    searchMangaList: (extensionId: string, query: string, page?: number) => Promise<void>;
    loadMoreBrowse: (extensionId: string) => Promise<void>;
    resetBrowse: () => void;
}

export const useBrowseStore = create<BrowseState>((set, get) => ({
    browseManga: [],
    browseLoading: false,
    browseHasMore: true,
    browsePage: 1,
    browseMode: 'popular',
    searchQuery: '',
    currentExtensionId: null,
    availableFilters: [],
    activeFilters: {},
    filtersLoading: false,

    setBrowseLoading: (loading) => set({ browseLoading: loading }),

    setCurrentExtension: (extensionId) => {
        const { currentExtensionId } = get();

        // Clear previous extension if different
        if (currentExtensionId && currentExtensionId !== extensionId) {
            window.electronAPI.extensions.clearActive(currentExtensionId).catch(() => { });
        }

        // Set new active extension
        if (extensionId) {
            window.electronAPI.extensions.setActive(extensionId).catch(() => { });
        }

        set({ currentExtensionId: extensionId });
    },

    loadFilters: async (extensionId) => {
        set({ filtersLoading: true });
        try {
            const filters = await window.electronAPI.extensions.getFilters(extensionId);
            // Build default values from filter definitions
            const defaultFilters: FilterValues = {};
            for (const filter of filters) {
                if (filter.default !== undefined) {
                    defaultFilters[filter.id] = filter.default;
                }
            }
            set({
                availableFilters: filters,
                activeFilters: defaultFilters,
                filtersLoading: false
            });
        } catch (error) {
            console.error('Failed to load filters:', error);
            set({ availableFilters: [], activeFilters: {}, filtersLoading: false });
        }
    },

    setFilter: (filterId, value) => {
        set((state) => ({
            activeFilters: { ...state.activeFilters, [filterId]: value }
        }));
    },

    clearFilters: () => {
        const { availableFilters } = get();
        const defaultFilters: FilterValues = {};
        for (const filter of availableFilters) {
            if (filter.default !== undefined) {
                defaultFilters[filter.id] = filter.default;
            }
        }
        set({ activeFilters: defaultFilters });
    },

    resetBrowse: () => {
        const { currentExtensionId } = get();
        // Clear active extension on reset (leaving browse)
        if (currentExtensionId) {
            window.electronAPI.extensions.clearActive(currentExtensionId).catch(() => { });
        }
        set({
            browseManga: [],
            browsePage: 1,
            browseHasMore: true,
            browseMode: 'popular',
            searchQuery: '',
            currentExtensionId: null,
            availableFilters: [],
            activeFilters: {},
        });
    },

    browseMangaList: async (extensionId, mode, page = 1, resetFilters = false) => {
        const { activeFilters, availableFilters } = get();

        // If resetFilters is true, reset to defaults for UI display, but don't pass filters to API
        let filtersToUse = activeFilters;
        if (resetFilters) {
            // Reset UI to show default filter values
            const defaultFilters: FilterValues = {};
            for (const filter of availableFilters) {
                if (filter.default !== undefined) {
                    defaultFilters[filter.id] = filter.default;
                }
            }
            set({ activeFilters: defaultFilters });
            // Don't apply any filters to the API call - let Popular/Latest work as intended
            filtersToUse = {};
        }

        // Clear existing list if loading first page to avoid showing stale data from previous tab
        if (page === 1) {
            set({ browseManga: [] });
        }

        set({ browseLoading: true, browseMode: mode, searchQuery: '' });

        try {
            const filters = Object.keys(filtersToUse).length > 0 ? filtersToUse : undefined;
            const result = mode === 'popular'
                ? await window.electronAPI.extensions.getPopularManga(extensionId, page, filters)
                : await window.electronAPI.extensions.getLatestManga(extensionId, page, filters);

            set({
                browseManga: page === 1 ? result.manga : [...get().browseManga, ...result.manga],
                browseHasMore: result.hasNextPage,
                browsePage: page,
                browseLoading: false,
            });
        } catch (error: any) {
            console.error('Failed to browse manga:', error);
            set({ browseLoading: false });
        }
    },

    searchMangaList: async (extensionId, query, page = 1) => {
        if (!query.trim()) return;
        const { activeFilters } = get();
        set({ browseLoading: true, browseMode: 'search', searchQuery: query });

        try {
            const filters = Object.keys(activeFilters).length > 0 ? activeFilters : undefined;
            const result = await window.electronAPI.extensions.searchManga(extensionId, query, page, filters);

            set({
                browseManga: page === 1 ? result.manga : [...get().browseManga, ...result.manga],
                browseHasMore: result.hasNextPage,
                browsePage: page,
                browseLoading: false,
            });
        } catch (error: any) {
            console.error('Failed to search manga:', error);
            set({ browseLoading: false });
        }
    },

    loadMoreBrowse: async (extensionId) => {
        const { browseMode, browsePage, searchQuery, browseHasMore, browseLoading } = get();

        if (browseLoading || !browseHasMore) return;

        if (browseMode === 'search') {
            await get().searchMangaList(extensionId, searchQuery, browsePage + 1);
        } else {
            await get().browseMangaList(extensionId, browseMode, browsePage + 1);
        }
    },
}));

