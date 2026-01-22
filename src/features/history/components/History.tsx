import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSettingsStore } from '../../settings/stores/settingsStore';
import { useHistoryStore, HistoryEntry } from '../stores/historyStore';
import { useExtensionStore, Extension } from '../../extensions/stores/extensionStore';
import { useDialog } from '../../../components/ConfirmModal/DialogContext';
import { Icons } from '../../../components/Icons';
import './History.css';

const ENTRY_HEIGHT = 110;
const DATE_HEADER_HEIGHT = 45;
const GAP = 16;
const ENTRY_MIN_WIDTH = 300;
const OVERSCAN = 5;
const LOAD_MORE_THRESHOLD = 500;

type VirtualItem =
    | { type: 'date'; date: string }
    | { type: 'row'; entries: HistoryEntry[] }
    | { type: 'loading' };

function History() {
    const { history, loadHistory, loadMore, removeFromHistory, loadingHistory, loadingMore, hasMore } = useHistoryStore();
    const { extensions } = useExtensionStore();
    const { disabledExtensions, hideNsfwInHistory, hideNsfwCompletely } = useSettingsStore();
    const navigate = useNavigate();
    const location = useLocation();
    const dialog = useDialog();

    const containerRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [containerHeight, setContainerHeight] = useState(800);
    const [containerWidth, setContainerWidth] = useState(1200);
    const [coverCache, setCoverCache] = useState<Record<string, string>>({});
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedExtensions, setSelectedExtensions] = useState<Set<string>>(new Set());
    const [showExtensionFilter, setShowExtensionFilter] = useState(false);
    const filterRef = useRef<HTMLDivElement>(null);
    const fetchingCovers = useRef<Set<string>>(new Set());

    useEffect(() => {
        loadHistory();
    }, [location.key]);

    // Use .main-content scroll for virtualization
    useEffect(() => {
        const mainContent = document.querySelector('.main-content');
        if (!mainContent) return;

        const handleScroll = () => {
            setScrollTop(mainContent.scrollTop);
        };

        const handleResize = () => {
            setContainerHeight(mainContent.clientHeight);
            setContainerWidth(mainContent.clientWidth);
        };

        mainContent.addEventListener('scroll', handleScroll, { passive: true });
        window.addEventListener('resize', handleResize);

        // Initial set
        handleScroll();
        handleResize();

        return () => {
            mainContent.removeEventListener('scroll', handleScroll);
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    // Intersection Observer for Load More
    // const loadMoreRef = useRef<HTMLDivElement>(null);

    // Get set of existing extension IDs
    const existingExtensions = useMemo(() => new Set(extensions.map(ext => ext.id)), [extensions]);

    const nsfwExtensions = useMemo(() => new Set(
        extensions.filter(ext => ext.nsfw).map(ext => ext.id)
    ), [extensions]);

    // Get unique extensions that have history entries
    const extensionsWithHistory = useMemo(() => {
        const extIds = new Set(history.map(entry => entry.source_id));
        return extensions.filter(ext => extIds.has(ext.id));
    }, [history, extensions]);

    // Memoized enabled extensions for filter dropdown (avoids double filter)
    const enabledExtensions = useMemo(() =>
        extensions.filter(ext => !disabledExtensions.has(ext.id)),
        [extensions, disabledExtensions]
    );

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
                setShowExtensionFilter(false);
            }
        };
        if (showExtensionFilter) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showExtensionFilter]);

    const toggleExtensionFilter = (extId: string) => {
        setSelectedExtensions(prev => {
            const newSet = new Set(prev);
            if (newSet.has(extId)) {
                newSet.delete(extId);
            } else {
                newSet.add(extId);
            }
            return newSet;
        });
    };

    const selectAllExtensions = () => {
        setSelectedExtensions(new Set(extensions.map(ext => ext.id)));
    };

    const clearExtensionFilter = () => {
        setSelectedExtensions(new Set());
    };

    // Helper to convert icon paths to proper URLs (matching Extensions.tsx approach)
    const getIconUrl = (iconPath?: string) => {
        if (!iconPath) return null;
        if (iconPath.startsWith('http')) return iconPath;
        // Convert Windows path to file URL format for the proxy
        const normalizedPath = iconPath.replace(/\\/g, '/');
        const fileUrl = `file:///${normalizedPath}`;
        return `manga-image://?url=${encodeURIComponent(fileUrl)}&ext=local`;
    };

    const visibleHistory = useMemo(() => history.filter(entry => {
        // Filter out entries from non-existent sources
        if (!existingExtensions.has(entry.source_id)) return false;
        if (disabledExtensions.has(entry.source_id)) return false;
        if (hideNsfwCompletely && nsfwExtensions.has(entry.source_id)) return false;
        if (hideNsfwInHistory && nsfwExtensions.has(entry.source_id)) return false;

        // Extension filter (when selections are made)
        if (selectedExtensions.size > 0 && !selectedExtensions.has(entry.source_id)) {
            return false;
        }

        // Search filter
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            const matchesTitle = entry.manga_title?.toLowerCase().includes(query);
            const matchesChapter = entry.chapter_title?.toLowerCase().includes(query);
            const matchesSource = entry.source_id?.toLowerCase().includes(query);
            if (!matchesTitle && !matchesChapter && !matchesSource) return false;
        }

        return true;
    }), [history, existingExtensions, disabledExtensions, nsfwExtensions, hideNsfwCompletely, hideNsfwInHistory, searchQuery, selectedExtensions]);

    const columnCount = Math.max(1, Math.floor((containerWidth + GAP) / (ENTRY_MIN_WIDTH + GAP)));

    const virtualItems = useMemo<VirtualItem[]>(() => {
        // Group by date, but keep order stable based on first entry's time
        const groups = new Map<string, HistoryEntry[]>();

        visibleHistory.forEach(entry => {
            const date = new Date(entry.read_at * 1000).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            });
            if (!groups.has(date)) {
                groups.set(date, []);
            }
            groups.get(date)!.push(entry);
        });

        const items: VirtualItem[] = [];
        // Since visibleHistory is already sorted by date desc, insertion order in Map is correct
        for (const [date, entries] of groups) {
            items.push({ type: 'date', date });
            for (let i = 0; i < entries.length; i += columnCount) {
                items.push({ type: 'row', entries: entries.slice(i, i + columnCount) });
            }
        }

        // Add loading indicator/footer at bottom
        if (visibleHistory.length > 0) {
            items.push({ type: 'loading' });
        }

        return items;
    }, [visibleHistory, columnCount, loadingMore, hasMore]);

    // Manual Load More instead of Intersection Observer
    const loadMoreRef = useRef<HTMLDivElement>(null);

    const getItemHeight = (item: VirtualItem) => {
        if (item.type === 'date') return DATE_HEADER_HEIGHT;
        if (item.type === 'loading') return 80; // Slightly taller for button
        return ENTRY_HEIGHT + GAP;
    };

    const itemOffsets = useMemo(() => {
        const offsets: number[] = [];
        let offset = 0;
        for (const item of virtualItems) {
            offsets.push(offset);
            offset += getItemHeight(item);
        }
        return offsets;
    }, [virtualItems]);

    const totalHeight = itemOffsets.length > 0
        ? itemOffsets[itemOffsets.length - 1] + getItemHeight(virtualItems[virtualItems.length - 1])
        : 0;

    const startIndex = useMemo(() => {
        let idx = 0;
        // Optimization: start binary search or just simple scan if list is small. 
        // Simple scan is fine for typical history size (~1000 items -> ~300 rows)
        while (idx < itemOffsets.length && itemOffsets[idx] < scrollTop - OVERSCAN * ENTRY_HEIGHT) {
            idx++;
        }
        return Math.max(0, idx - 1);
    }, [itemOffsets, scrollTop]);

    const endIndex = useMemo(() => {
        let idx = startIndex;
        const limitPos = scrollTop + containerHeight + OVERSCAN * ENTRY_HEIGHT;
        while (idx < itemOffsets.length && itemOffsets[idx] < limitPos) {
            idx++;
        }
        return Math.min(virtualItems.length, idx);
    }, [startIndex, itemOffsets, scrollTop, containerHeight, virtualItems.length]);

    const handleContinueReading = (entry: HistoryEntry) => {
        const [extensionId] = entry.manga_id.split(':');
        const sourceMangaId = entry.manga_id.split(':').slice(1).join(':');

        const chapterId = entry.chapter_id.startsWith(`${extensionId}:`)
            ? entry.chapter_id.slice(extensionId.length + 1)
            : entry.chapter_id;

        navigate(`/read/${extensionId}/${encodeURIComponent(chapterId)}`, {
            state: {
                mangaId: sourceMangaId,
                mangaTitle: entry.manga_title,
            }
        });
    };

    const handleOpenMangaDetails = (entry: HistoryEntry) => {
        const [extensionId] = entry.manga_id.split(':');
        const sourceMangaId = entry.manga_id.split(':').slice(1).join(':');
        navigate(`/manga/${extensionId}/${encodeURIComponent(sourceMangaId)}`);
    };

    const fetchCoverForEntry = useCallback(async (entry: HistoryEntry) => {
        const mangaId = entry.manga_id;
        if (coverCache[mangaId] || fetchingCovers.current.has(mangaId)) return;

        fetchingCovers.current.add(mangaId);
        try {
            const [extensionId] = mangaId.split(':');
            const sourceMangaId = mangaId.split(':').slice(1).join(':');

            // Try optimized cover fetch first
            const coverUrl = await window.electronAPI.extensions.getMangaCover(extensionId, sourceMangaId);
            if (coverUrl) {
                setCoverCache(prev => ({ ...prev, [mangaId]: coverUrl }));

                // Update database with fresh cover URL
                try {
                    await window.electronAPI.db.updateMangaMetadata(mangaId, { cover_url: coverUrl });
                } catch (dbErr) {
                    console.warn(`Failed to update cover in database for ${entry.manga_title}:`, dbErr);
                }
            } else {
                // Should already be handled by fallback in main process, but just in case
                console.warn(`No cover found for ${entry.manga_title}`);
            }
        } catch (e) {
            console.warn(`Failed to fetch cover for ${entry.manga_title}:`, e);
        } finally {
            fetchingCovers.current.delete(mangaId);
        }
    }, [coverCache]);



    if (loadingHistory && history.length === 0) {
        return (
            <div className="history-page">
                <div className="page-header">
                    <h1 className="page-title">History</h1>
                </div>
                <div className="loading-state">
                    <div className="spinner"></div>
                </div>
            </div>
        );
    }

    if (history.length === 0) {
        return (
            <div className="history-page">
                <div className="page-header">
                    <h1 className="page-title">History</h1>
                </div>
                <div className="empty-state">
                    <div className="empty-state-icon"><Icons.Book width={48} height={48} /></div>
                    <h2 className="empty-state-title">No reading history yet</h2>
                    <p className="empty-state-description">
                        Start reading manga to see your history here
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="history-page">
            <div className="page-header">
                <div>
                    <h1 className="page-title">History</h1>
                    <p className="page-subtitle">{visibleHistory.length} entries in your reading history</p>
                </div>
            </div>

            {/* Unified Search Bar with Integrated Filter */}
            <div className="history-search-bar" ref={filterRef}>
                {/* Sources Filter - Inline */}
                <button
                    className={`inline-filter-btn ${selectedExtensions.size > 0 ? 'has-filter' : ''} ${showExtensionFilter ? 'active' : ''}`}
                    onClick={() => setShowExtensionFilter(!showExtensionFilter)}
                >
                    <Icons.Filter width={14} height={14} />
                    <span>Sources</span>
                    {selectedExtensions.size > 0 && (
                        <span className="filter-count">{selectedExtensions.size}</span>
                    )}
                    <Icons.ChevronDown width={12} height={12} className={`chevron ${showExtensionFilter ? 'open' : ''}`} />
                </button>

                <span className="search-divider" />

                <Icons.Search width={16} height={16} className="search-icon" />
                <input
                    type="text"
                    className="search-input"
                    placeholder="Search manga, chapters, or sources..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                    <button
                        className="search-clear"
                        onClick={() => setSearchQuery('')}
                    >
                        <Icons.X width={14} height={14} />
                    </button>
                )}

                {/* Dropdown */}
                {showExtensionFilter && (
                    <div className="extension-filter-dropdown">
                        <div className="filter-header">
                            <span className="filter-title">Filter by Source</span>
                            <div className="filter-actions">
                                <button
                                    className="filter-action-btn"
                                    onClick={selectAllExtensions}
                                    disabled={selectedExtensions.size === extensions.length}
                                >
                                    Select All
                                </button>
                                <button
                                    className="filter-action-btn"
                                    onClick={clearExtensionFilter}
                                    disabled={selectedExtensions.size === 0}
                                >
                                    Clear
                                </button>
                            </div>
                        </div>
                        <div className="filter-list">
                            {enabledExtensions.length === 0 ? (
                                <div className="filter-empty">No sources enabled</div>
                            ) : (
                                enabledExtensions.map(ext => (
                                    <label
                                        key={ext.id}
                                        className={`filter-item ${selectedExtensions.has(ext.id) ? 'selected' : ''}`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedExtensions.has(ext.id)}
                                            onChange={() => toggleExtensionFilter(ext.id)}
                                        />
                                        <span className="filter-checkbox">
                                            {selectedExtensions.has(ext.id) && <Icons.Check width={12} height={12} />}
                                        </span>
                                        {ext.iconUrl ? (
                                            <img
                                                src={ext.iconUrl}
                                                alt=""
                                                className="filter-ext-icon"
                                            />
                                        ) : (
                                            <span className="filter-ext-icon-placeholder">
                                                {ext.name.charAt(0).toUpperCase()}
                                            </span>
                                        )}
                                        <span className="filter-ext-name">{ext.name}</span>
                                        {ext.nsfw && <span className="nsfw-badge">18+</span>}
                                    </label>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>

            <div
                ref={containerRef}
                className="history-list virtualized"
                style={{ flex: 1, position: 'relative' }}
            >
                <div style={{ height: totalHeight, position: 'relative' }}>
                    {virtualItems.slice(startIndex, endIndex).map((item, i) => {
                        const actualIndex = startIndex + i;
                        const top = itemOffsets[actualIndex];

                        if (item.type === 'date') {
                            return (
                                <h3
                                    key={`date-${item.date}`}
                                    className="history-date"
                                    style={{
                                        position: 'absolute',
                                        top,
                                        left: 0,
                                        right: 0,
                                        height: DATE_HEADER_HEIGHT,
                                        boxSizing: 'border-box',
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        margin: 0,
                                    }}
                                >
                                    <span style={{
                                        borderBottom: '1px solid var(--color-border)',
                                        paddingBottom: 8,
                                        width: '100%',
                                    }}>
                                        {item.date}
                                    </span>
                                </h3>
                            );
                        }

                        if (item.type === 'loading') {
                            return (
                                <div
                                    key="loading-more"
                                    ref={loadMoreRef}
                                    style={{
                                        position: 'absolute',
                                        top,
                                        left: 0,
                                        right: 0,
                                        height: 80,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        paddingBottom: 20
                                    }}
                                >
                                    {loadingMore ? (
                                        <div className="spinner" style={{ width: 24, height: 24 }}></div>
                                    ) : hasMore ? (
                                        <button
                                            className="btn btn-secondary"
                                            onClick={() => loadMore()}
                                            style={{
                                                padding: '8px 24px',
                                                cursor: 'pointer',
                                                fontSize: '14px',
                                                fontWeight: 500
                                            }}
                                        >
                                            Load More
                                        </button>
                                    ) : (
                                        <span style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>
                                            End of history
                                        </span>
                                    )}
                                </div>
                            );
                        }

                        return (
                            <div
                                key={`row-${actualIndex}`}
                                className="history-entries"
                                style={{
                                    position: 'absolute',
                                    top,
                                    left: 0,
                                    right: 0,
                                    height: ENTRY_HEIGHT,
                                    display: 'grid',
                                    gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
                                    gap: GAP
                                }}
                            >
                                {item.entries.map((entry) => (
                                    <HistoryItem
                                        key={`${entry.id}-${entry.chapter_id}`}
                                        entry={entry}
                                        cachedCover={coverCache[entry.manga_id]}
                                        onFetchCover={fetchCoverForEntry}
                                        onNavigate={handleContinueReading}
                                        onOpenDetails={handleOpenMangaDetails}
                                        onRemove={removeFromHistory}
                                    />
                                ))}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

// Sub-component to handle individual entry logic and effects
const HistoryItem = ({
    entry,
    cachedCover,
    onFetchCover,
    onNavigate,
    onOpenDetails,
    onRemove
}: {
    entry: HistoryEntry;
    cachedCover?: string;
    onFetchCover: (entry: HistoryEntry) => void;
    onNavigate: (entry: HistoryEntry) => void;
    onOpenDetails: (entry: HistoryEntry) => void;
    onRemove: (id: string) => void;
}) => {
    const dialog = useDialog();

    useEffect(() => {
        if (!cachedCover) {
            onFetchCover(entry);
        }
    }, [cachedCover, entry, onFetchCover]);

    const [extensionId] = entry.manga_id.split(':');
    const coverUrl = cachedCover || entry.cover_url;
    const proxiedCoverUrl = window.electronAPI?.getProxiedImageUrl
        ? window.electronAPI.getProxiedImageUrl(coverUrl, extensionId)
        : coverUrl;

    const title = entry.chapter_title;
    const num = entry.chapter_number;
    const isRedundant =
        title === `Chapter ${num}` ||
        title === num.toString() ||
        title.toLowerCase() === `chapter ${num}`;
    const chapterText = isRedundant ? `Chapter ${num}` : `Chapter ${num}: ${title}`;

    return (
        <div
            className="history-entry"
            onClick={() => onNavigate(entry)}
        >
            <img
                src={proxiedCoverUrl}
                alt={entry.manga_title}
                className="history-cover"
                onClick={(e) => {
                    e.stopPropagation();
                    onOpenDetails(entry);
                }}
            />
            <div className="history-info">
                <h4 className="history-manga-title">{entry.manga_title}</h4>
                <p className="history-chapter">{chapterText}</p>
                <p className="history-source">
                    {entry.source_id?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Unknown Source'}
                </p>
            </div>
            <button
                className="history-delete-btn"
                onClick={async (e) => {
                    e.stopPropagation();
                    const confirmed = await dialog.confirm({
                        title: 'Remove from History',
                        message: 'Remove this manga from history?',
                        confirmLabel: 'Remove',
                        isDestructive: true,
                    });
                    if (confirmed) {
                        onRemove(entry.manga_id);
                    }
                }}
                title="Remove from history"
            >
                <Icons.Trash width={18} height={18} />
            </button>
            <button className="btn btn-secondary history-continue">
                Continue
            </button>
        </div>
    );
}

export default History;
