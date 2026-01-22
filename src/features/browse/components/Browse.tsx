import { useEffect, useState, useRef } from 'react';
import { useAppStore } from '../../../stores/appStore';
import { useSettingsStore } from '../../settings/stores/settingsStore';
import { useBrowseStore } from '../stores/browseStore';
import { useExtensionStore } from '../../extensions/stores/extensionStore';
import { useLibraryStore } from '../../library/stores/libraryStore';
import MangaCard from '../../../components/MangaCard';
import { Icons } from '../../../components/Icons';
import CustomDropdown from '../../../components/CustomDropdown/CustomDropdown';
import TriStateCheckbox, { TriState } from '../../../components/TriStateCheckbox/TriStateCheckbox';
import SourcesModal from '../../../components/SourcesModal/SourcesModal';
import './Browse.css';

function Browse() {
    const { library } = useLibraryStore();
    const { extensions, selectedExtension, selectExtension } = useExtensionStore();

    const {
        browseManga,
        browseLoading,
        browseHasMore,
        browseMode,
        searchQuery: storeSearchQuery,
        browseMangaList,
        searchMangaList,
        loadMoreBrowse,
        availableFilters,
        activeFilters,
        loadFilters,
        setFilter,
        setCurrentExtension,
    } = useBrowseStore();

    const { isExtensionEnabled, extensionOrder, setExtensionOrder, browseViewMode, setBrowseViewMode } = useSettingsStore();

    const [searchQuery, setSearchQuery] = useState(storeSearchQuery);
    const [activeTab, setActiveTab] = useState<'popular' | 'latest'>(browseMode === 'latest' ? 'latest' : 'popular');
    const observerRef = useRef<IntersectionObserver | null>(null);
    const loadMoreRef = useRef<HTMLDivElement>(null);
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [showFilters, setShowFilters] = useState(false);
    const [showSourcesModal, setShowSourcesModal] = useState(false);
    const triStateDebounceRef = useRef<NodeJS.Timeout | null>(null);

    const enabledExtensions = extensions.filter(ext => isExtensionEnabled(ext.id));
    const libraryIds = new Set(library.map(m => `${m.source_id}:${m.source_manga_id}`));

    // Sort extensions by saved order, putting unsorted ones at the end
    const orderedExtensions = [...enabledExtensions].sort((a, b) => {
        const aIndex = extensionOrder.indexOf(a.id);
        const bIndex = extensionOrder.indexOf(b.id);
        if (aIndex === -1 && bIndex === -1) return 0;
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
    });

    // Drag and drop handlers
    const handleDragStart = (e: React.DragEvent, extId: string) => {
        setDraggedId(extId);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', extId);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        if (!draggedId || draggedId === targetId) {
            setDraggedId(null);
            return;
        }

        const currentOrder = orderedExtensions.map(ext => ext.id);
        const draggedIndex = currentOrder.indexOf(draggedId);
        const targetIndex = currentOrder.indexOf(targetId);

        if (draggedIndex === -1 || targetIndex === -1) {
            setDraggedId(null);
            return;
        }

        // Reorder: remove dragged item and insert at target position
        currentOrder.splice(draggedIndex, 1);
        currentOrder.splice(targetIndex, 0, draggedId);

        setExtensionOrder(currentOrder);
        setDraggedId(null);
    };

    const handleDragEnd = () => {
        setDraggedId(null);
    };

    // Sync local search query with store (mostly for returning from other pages)
    useEffect(() => {
        if (storeSearchQuery && searchQuery !== storeSearchQuery) {
            setSearchQuery(storeSearchQuery);
        }
    }, [storeSearchQuery]);

    useEffect(() => {
        if (orderedExtensions.length > 0) {
            if (!selectedExtension || !isExtensionEnabled(selectedExtension.id)) {
                selectExtension(orderedExtensions[0]);
            }
        }
    }, [orderedExtensions, selectedExtension, isExtensionEnabled, selectExtension]);

    useEffect(() => {
        if (selectedExtension && isExtensionEnabled(selectedExtension.id)) {
            // Mark this extension as actively browsed (keeps sandbox alive)
            setCurrentExtension(selectedExtension.id);

            // Load filters for this extension
            loadFilters(selectedExtension.id);

            if (browseManga.length > 0 && ((browseMode === 'search') || (browseMode === activeTab))) {
                return;
            }
            browseMangaList(selectedExtension.id, activeTab, 1);
        }
    }, [selectedExtension]);

    // Re-attach observer when loading state changes
    useEffect(() => {
        observerRef.current = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && browseHasMore && !browseLoading && selectedExtension) {
                    loadMoreBrowse(selectedExtension.id);
                }
            },
            { threshold: 0.1 }
        );

        if (loadMoreRef.current) {
            observerRef.current.observe(loadMoreRef.current);
        }

        return () => {
            if (observerRef.current) {
                observerRef.current.disconnect();
            }
        };
    }, [browseHasMore, browseLoading, loadMoreBrowse, selectedExtension]);

    const getIconUrl = (iconPath?: string) => {
        if (!iconPath) return null;
        if (iconPath.startsWith('http')) return iconPath;
        const normalizedPath = iconPath.replace(/\\/g, '/');
        const fileUrl = `file:///${normalizedPath}`;
        return `manga-image://?url=${encodeURIComponent(fileUrl)}&ext=local`;
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchQuery.trim() && selectedExtension) {
            searchMangaList(selectedExtension.id, searchQuery, 1);
        }
    };

    const handleTabChange = (tab: 'popular' | 'latest') => {
        setActiveTab(tab);
        setSearchQuery('');

        if (selectedExtension) {
            // Pass resetFilters=true to clear filters atomically during the same call
            browseMangaList(selectedExtension.id, tab, 1, true);
        }
    };

    const handleFilterChange = (filterId: string, value: string) => {
        setFilter(filterId, value);
        if (selectedExtension) {
            if (browseMode === 'search' && storeSearchQuery) {
                searchMangaList(selectedExtension.id, storeSearchQuery, 1);
            } else {
                browseMangaList(selectedExtension.id, activeTab, 1);
            }
        }
    };

    const handleTriStateChange = (filterId: string, optionValue: string, newState: TriState) => {
        const currentValue = activeFilters[filterId] as unknown as { include: string[]; exclude: string[] } | undefined;
        const include = [...(currentValue?.include || [])];
        const exclude = [...(currentValue?.exclude || [])];

        // Remove from both arrays first
        const includeIdx = include.indexOf(optionValue);
        if (includeIdx > -1) include.splice(includeIdx, 1);
        const excludeIdx = exclude.indexOf(optionValue);
        if (excludeIdx > -1) exclude.splice(excludeIdx, 1);

        // Add to appropriate array based on new state
        if (newState === 'include') include.push(optionValue);
        if (newState === 'exclude') exclude.push(optionValue);

        setFilter(filterId, { include, exclude } as unknown as string[]);

        // Debounce the fetch - wait 2 seconds after user stops clicking
        if (triStateDebounceRef.current) {
            clearTimeout(triStateDebounceRef.current);
        }
        triStateDebounceRef.current = setTimeout(() => {
            if (selectedExtension) {
                if (browseMode === 'search' && storeSearchQuery) {
                    searchMangaList(selectedExtension.id, storeSearchQuery, 1);
                } else {
                    browseMangaList(selectedExtension.id, activeTab, 1);
                }
            }
        }, 2000);
    };

    const getTriState = (filterId: string, optionValue: string): TriState => {
        const value = activeFilters[filterId] as unknown as { include: string[]; exclude: string[] } | undefined;
        if (value?.include?.includes(optionValue)) return 'include';
        if (value?.exclude?.includes(optionValue)) return 'exclude';
        return 'neutral';
    };

    if (enabledExtensions.length === 0) {
        return (
            <div className="browse-page">
                <div className="empty-state">
                    <div className="empty-state-icon"><Icons.Plug width={48} height={48} /></div>
                    <h2 className="empty-state-title">No extensions enabled</h2>
                    <p className="empty-state-description">
                        Enable extensions in the Extensions page to browse manga sources
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="browse-page">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Browse</h1>
                    <p className="page-subtitle">Discover new manga from your sources</p>
                </div>
            </div>

            {/* Unified Search Bar with Source Selector */}
            <form className="unified-search-bar" onSubmit={handleSearch}>
                <button
                    type="button"
                    className="unified-source-btn"
                    onClick={() => setShowSourcesModal(true)}
                >
                    <span className="unified-source-icon">
                        {selectedExtension?.icon ? (
                            <img src={getIconUrl(selectedExtension.icon) || ''} alt="" className="ext-icon-img-small" />
                        ) : <Icons.Book width={16} height={16} opacity={0.7} />}
                    </span>
                    <span className="unified-source-name">{selectedExtension?.name || 'Source'}</span>
                    <Icons.ChevronDown width={14} height={14} />
                </button>
                <div className="unified-search-divider" />
                <input
                    type="text"
                    className="unified-search-input"
                    placeholder={`Search manga...`}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
                <button type="submit" className="unified-search-btn">
                    <Icons.Search width={18} height={18} />
                </button>
            </form>

            {/* Sources Modal */}
            <SourcesModal
                isOpen={showSourcesModal}
                extensions={orderedExtensions}
                selectedExtensionId={selectedExtension?.id || null}
                onSelect={(ext) => {
                    if (selectedExtension?.id !== ext.id) {
                        useBrowseStore.getState().resetBrowse();
                        selectExtension(ext);
                    }
                }}
                onClose={() => setShowSourcesModal(false)}
                getIconUrl={getIconUrl}
                onReorder={setExtensionOrder}
            />

            {/* Tabs */}
            <div className="tabs">
                <button
                    className={`tab ${activeTab === 'popular' && browseMode !== 'search' ? 'active' : ''}`}
                    onClick={() => handleTabChange('popular')}
                >
                    <Icons.Popular /> Popular
                </button>
                <button
                    className={`tab ${activeTab === 'latest' && browseMode !== 'search' ? 'active' : ''}`}
                    onClick={() => handleTabChange('latest')}
                >
                    <Icons.Latest /> Latest
                </button>
                {browseMode === 'search' && (
                    <button className="tab active">
                        <Icons.Search /> Search Results
                    </button>
                )}
                {availableFilters.length > 0 && (
                    <button
                        className={`tab filter-toggle ${showFilters ? 'active' : ''}`}
                        onClick={() => setShowFilters(!showFilters)}
                    >
                        <Icons.Filter />
                    </button>
                )}
                <div className="tab-spacer" />
                <div className="view-mode-toggle">
                    <button
                        className={`view-mode-btn ${browseViewMode === 'grid' ? 'active' : ''}`}
                        onClick={() => setBrowseViewMode('grid')}
                        title="Grid View"
                    >
                        <Icons.Grid width={16} height={16} />
                    </button>
                    <button
                        className={`view-mode-btn ${browseViewMode === 'compact' ? 'active' : ''}`}
                        onClick={() => setBrowseViewMode('compact')}
                        title="Compact View"
                    >
                        <Icons.Compact width={16} height={16} />
                    </button>
                </div>
            </div>

            {/* Filters */}
            {availableFilters.length > 0 && showFilters && (
                <div className="browse-filters">
                    {availableFilters.map(filter => (
                        <div key={filter.id} className={`filter-group ${filter.type === 'tri-state' ? 'tri-state-filter-group' : ''}`}>
                            <label className="filter-label">{filter.label}</label>
                            {filter.type === 'tri-state' ? (
                                <div className="tri-state-options">
                                    {filter.options.map(option => (
                                        <TriStateCheckbox
                                            key={option.value}
                                            label={option.label}
                                            state={getTriState(filter.id, option.value)}
                                            onChange={(newState) => handleTriStateChange(filter.id, option.value, newState)}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <CustomDropdown
                                    options={filter.options}
                                    value={(activeFilters[filter.id] as string) || (filter.default as string) || ''}
                                    onChange={(value) => handleFilterChange(filter.id, value)}
                                    placeholder="Select..."
                                />
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Manga Grid */}
            {browseManga.length === 0 && !browseLoading ? (
                <div className="empty-state">
                    <div className="empty-state-icon"><Icons.Inbox width={48} height={48} /></div>
                    <h2 className="empty-state-title">No manga found</h2>
                    <p className="empty-state-description">
                        {browseMode === 'search'
                            ? 'Try a different search term'
                            : 'Check back later for updates'}
                    </p>
                </div>
            ) : (
                <>
                    <div className={`manga-grid view-${browseViewMode}`}>
                        {browseManga.map((manga, index) => (
                            <MangaCard
                                key={`${manga.id}-${index}`}
                                id={manga.id}
                                title={manga.title}
                                coverUrl={manga.coverUrl}
                                extensionId={selectedExtension!.id}
                                index={index}
                                inLibrary={libraryIds.has(`${selectedExtension!.id}:${manga.id}`)}
                            />
                        ))}
                    </div>

                    {/* Load More Trigger */}
                    <div ref={loadMoreRef} className="load-more">
                        {browseLoading && (
                            <div className="loading-state">
                                <div className="spinner"></div>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

export default Browse;
