import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icons } from '../../../components/Icons';
import { useLibraryStore, Manga } from '../stores/libraryStore';
import { useTagStore } from '../../tags/stores/tagStore';
import { useExtensionStore } from '../../extensions/stores/extensionStore';
import { useSettingsStore } from '../../settings/stores/settingsStore';
import { useDialog } from '../../../components/ConfirmModal/DialogContext';
import MangaCard from '../../../components/MangaCard';
import CustomDropdown from '../../../components/CustomDropdown/CustomDropdown';
import ContextMenu, { ContextMenuItem } from '../../../components/ContextMenu/ContextMenu';
import TagSelector from '../../../components/TagSelector';
import './Library.css';

const CARD_MIN_WIDTH = 160;
const TITLE_AREA_HEIGHT = 60;
const GAP = 20;
const OVERSCAN = 3;

interface VirtualizedGridProps {
    manga: Manga[];
    onContextMenu: (e: React.MouseEvent, manga: { id: string; title: string; extensionId: string }) => void;
}

const VirtualizedMangaGrid: React.FC<VirtualizedGridProps> = ({ manga, onContextMenu }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [containerHeight, setContainerHeight] = useState(800);
    const [containerWidth, setContainerWidth] = useState(1200);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleScroll = () => setScrollTop(container.scrollTop);
        const handleResize = () => {
            setContainerWidth(container.clientWidth);
            setContainerHeight(container.clientHeight);
        };

        container.addEventListener('scroll', handleScroll, { passive: true });
        const resizeObserver = new ResizeObserver(handleResize);
        resizeObserver.observe(container);
        handleResize();

        return () => {
            container.removeEventListener('scroll', handleScroll);
            resizeObserver.disconnect();
        };
    }, []);

    const columnCount = Math.max(1, Math.floor((containerWidth + GAP) / (CARD_MIN_WIDTH + GAP)));
    const cardWidth = (containerWidth - GAP * (columnCount - 1)) / columnCount;
    const cardHeight = (cardWidth * 4 / 3) + TITLE_AREA_HEIGHT;
    const rowHeight = cardHeight + GAP;
    const rowCount = Math.ceil(manga.length / columnCount);
    const totalHeight = rowCount * rowHeight;

    const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
    const visibleRows = Math.ceil(containerHeight / rowHeight) + OVERSCAN * 2;
    const endRow = Math.min(rowCount, startRow + visibleRows);

    const visibleItems = [];
    for (let row = startRow; row < endRow; row++) {
        for (let col = 0; col < columnCount; col++) {
            const index = row * columnCount + col;
            if (index < manga.length) {
                visibleItems.push({ manga: manga[index], row, col, index });
            }
        }
    }

    return (
        <div
            ref={containerRef}
            className="virtualized-grid-container"
            style={{
                flex: 1,
                overflow: 'auto',
                position: 'relative',
                marginRight: -8,
                paddingRight: 8
            }}
        >
            <div style={{ height: totalHeight, position: 'relative' }}>
                {visibleItems.map(({ manga: m, row, col, index }) => (
                    <div
                        key={m.id}
                        style={{
                            position: 'absolute',
                            top: row * rowHeight,
                            left: col * (cardWidth + GAP),
                            width: cardWidth,
                            height: cardHeight
                        }}
                    >
                        <MangaCard
                            id={m.source_manga_id}
                            title={m.title}
                            coverUrl={m.cover_url}
                            extensionId={m.source_id}
                            index={index}
                            inLibrary
                            totalChapters={(m as any).total_chapters}
                            readChapters={(m as any).read_chapters}
                            onContextMenu={onContextMenu}
                            uniqueId={m.id}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
};

interface ContextMenuState {
    visible: boolean;
    x: number;
    y: number;
    manga: { id: string; title: string; extensionId: string } | null;
}

function Library() {
    const { library, loadingLibrary, removeFromLibrary, isRefreshing, refreshProgress, refreshLibrary } = useLibraryStore();
    const { tags } = useTagStore();
    const { extensions } = useExtensionStore();
    const { hideNsfwInLibrary, hideNsfwInTags, hideNsfwCompletely, browseViewMode, setBrowseViewMode } = useSettingsStore();

    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTagId, setSelectedTagId] = useState<number | null>(null);
    const [sortBy, setSortBy] = useState<'title' | 'updated' | 'added'>('updated');
    const [showUnreadOnly, setShowUnreadOnly] = useState(false);
    const [tagsExpanded, setTagsExpanded] = useState(false);
    const navigate = useNavigate();
    const dialog = useDialog();

    const [filteredMangaIds, setFilteredMangaIds] = useState<Set<string> | null>(null);
    const [isFiltering, setIsFiltering] = useState(false);

    const [contextMenu, setContextMenu] = useState<ContextMenuState>({
        visible: false,
        x: 0,
        y: 0,
        manga: null
    });

    const [isTagSelectorOpen, setIsTagSelectorOpen] = useState(false);
    const [tagEditManga, setTagEditManga] = useState<Manga | null>(null);

    // Export state
    const [isExporting, setIsExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState<{ current: number; total: number; status: string } | null>(null);
    const [showExportOptions, setShowExportOptions] = useState(false);
    const [exportOptions, setExportOptions] = useState({
        includeNsfwSources: false,
        includeNsfwTags: false
    });

    // Handle export library as PNG
    const handleExportLibrary = async () => {
        // Show options dialog first
        setShowExportOptions(true);
    };

    const executeExport = async () => {
        setShowExportOptions(false);
        setIsExporting(true);
        setExportProgress({ current: 0, total: 0, status: 'Starting export...' });

        try {
            const result = await (window as any).electronAPI.export.libraryPng(exportOptions);
            if (result.success) {
                dialog.alert(`Exported ${result.count} manga covers to ${result.path}`, 'Export Complete');
            } else if (result.error !== 'Export cancelled') {
                dialog.alert(result.error, 'Export Failed');
            }
        } catch (error) {
            dialog.alert((error as Error).message, 'Export Failed');
        } finally {
            setIsExporting(false);
            setExportProgress(null);
        }
    };

    // Listen for export progress
    useEffect(() => {
        const handleProgress = (_event: any, progress: { current: number; total: number; status: string }) => {
            setExportProgress(progress);
        };

        (window as any).electronAPI?.onExportProgress?.(handleProgress);
        return () => {
            (window as any).electronAPI?.offExportProgress?.(handleProgress);
        };
    }, []);

    const sortOptions = [
        { value: 'updated', label: 'Last Updated' },
        { value: 'added', label: 'Recently Added' },
        { value: 'title', label: 'Title A-Z' }
    ];

    useEffect(() => {
        const fetchTaggedManga = async () => {
            if (selectedTagId === null) {
                setFilteredMangaIds(null);
                return;
            }

            setIsFiltering(true);
            try {
                const results = await window.electronAPI.db.getMangaByTag(selectedTagId);
                setFilteredMangaIds(new Set(results.map((m: any) => m.id)));
            } catch (error) {
                console.error('Failed to filter by tag:', error);
            } finally {
                setIsFiltering(false);
            }
        };

        fetchTaggedManga();
    }, [selectedTagId]);

    // State to track manga IDs that belong to NSFW tags
    const [nsfwTagMangaIds, setNsfwTagMangaIds] = useState<Set<string>>(new Set());

    // Fetch manga IDs that belong to any NSFW tag
    useEffect(() => {
        const fetchNsfwTagManga = async () => {
            const nsfwTags = tags.filter(t => t.isNsfw);
            if (nsfwTags.length === 0) {
                setNsfwTagMangaIds(new Set());
                return;
            }

            const allNsfwMangaIds = new Set<string>();
            for (const tag of nsfwTags) {
                try {
                    const results = await window.electronAPI.db.getMangaByTag(tag.id);
                    results.forEach((m: any) => allNsfwMangaIds.add(m.id));
                } catch (error) {
                    console.error('Failed to fetch manga for NSFW tag:', error);
                }
            }
            setNsfwTagMangaIds(allNsfwMangaIds);
        };

        fetchNsfwTagManga();
    }, [tags]);

    // Base library count matching what filteredLibrary shows with no search/tag/unread filters
    const baseLibraryCount = useMemo(() => {
        if (!hideNsfwCompletely && !hideNsfwInLibrary) {
            return library.length;
        }
        const nsfwExtensions = new Set(
            extensions.filter(ext => ext.nsfw).map(ext => ext.id)
        );
        // Filter by NSFW extensions AND NSFW tags
        return library.filter(m =>
            !nsfwExtensions.has(m.source_id) && !nsfwTagMangaIds.has(m.id)
        ).length;
    }, [library, extensions, hideNsfwCompletely, hideNsfwInLibrary, nsfwTagMangaIds]);

    const filteredLibrary = useMemo(() => {
        // Build set of SAFE extension IDs (allowlist)
        // If an extension is not loaded or is NSFW, it won't be in this list.
        const safeExtensions = new Set(
            extensions.filter(ext => !ext.nsfw).map(ext => ext.id)
        );

        // Build set of NSFW tag IDs
        const nsfwTagIds = new Set(
            tags.filter(tag => tag.isNsfw).map(tag => tag.id)
        );

        console.log('Library Debug - Total In Store:', library.length);
        if (library.length > 0) {
            console.log('Sample Library Items:', library.slice(0, 5).map(m => ({
                title: m.title,
                id: m.id,
                source_id: m.source_id,
                source_manga_id: m.source_manga_id,
                cover_url: m.cover_url
            })));
        }

        console.log('Library Debug - Extensions Loaded:', extensions.length);
        console.log('Library Debug - Safe Extensions:', Array.from(safeExtensions));
        console.log('Library Debug - NSFW Tag IDs:', Array.from(nsfwTagIds));

        let filtered = [...library];

        // Apply NSFW filtering based on extensions
        if (hideNsfwCompletely) {
            filtered = filtered.filter(m => safeExtensions.has(m.source_id));
            // Also filter manga that belong to NSFW tags
            filtered = filtered.filter(m => !nsfwTagMangaIds.has(m.id));
        } else if (selectedTagId === null && hideNsfwInLibrary) {
            filtered = filtered.filter(m => safeExtensions.has(m.source_id));
            // Also filter manga that belong to NSFW tags
            filtered = filtered.filter(m => !nsfwTagMangaIds.has(m.id));
        } else if (selectedTagId !== null && hideNsfwInTags) {
            filtered = filtered.filter(m => safeExtensions.has(m.source_id));
        }

        // If filtering by an NSFW tag, also check if NSFW should be hidden
        if (selectedTagId !== null && nsfwTagIds.has(selectedTagId)) {
            if (hideNsfwCompletely || hideNsfwInTags) {
                // Don't show manga from NSFW tags when NSFW is hidden
                filtered = [];
            }
        }

        console.log('Library Debug - After NSFW Filter:', filtered.length);

        if (selectedTagId !== null && filteredMangaIds) {
            filtered = filtered.filter(m => filteredMangaIds.has(m.id));
        }

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(m =>
                m.title.toLowerCase().includes(query) ||
                (m as any).author?.toLowerCase().includes(query)
            );
        }

        // Filter to show only manga with unread chapters
        if (showUnreadOnly) {
            filtered = filtered.filter(m => {
                const total = (m as any).total_chapters || 0;
                const read = (m as any).read_chapters || 0;
                return total > 0 && read < total;
            });
        }

        console.log('Library Debug - Final:', filtered.length);

        filtered.sort((a, b) => {
            switch (sortBy) {
                case 'title':
                    return a.title.localeCompare(b.title);
                case 'updated':
                    // Assuming updated_at exists on Manga object at runtime even if not in my partial interface
                    return ((b as any).updated_at || 0) - ((a as any).updated_at || 0);
                case 'added':
                    return ((b as any).added_at || 0) - ((a as any).added_at || 0);
                default:
                    return 0;
            }
        });

        return filtered;
    }, [library, searchQuery, selectedTagId, filteredMangaIds, sortBy, showUnreadOnly, extensions, tags, nsfwTagMangaIds, hideNsfwInLibrary, hideNsfwInTags, hideNsfwCompletely]);

    const handleContextMenu = (e: React.MouseEvent, manga: { id: string; title: string; extensionId: string }) => {
        setContextMenu({
            visible: true,
            x: e.clientX,
            y: e.clientY,
            manga
        });
    };

    const closeContextMenu = () => {
        setContextMenu(prev => ({ ...prev, visible: false }));
    };

    const getContextMenuItems = (): ContextMenuItem[] => {
        if (!contextMenu.manga) return [];
        const { id, title, extensionId } = contextMenu.manga;

        // Find the full manga data
        const fullManga = library.find(m => m.source_manga_id === id && m.source_id === extensionId);

        return [
            {
                label: 'View Details',
                onClick: () => navigate(`/manga/${extensionId}/${encodeURIComponent(id)}`)
            },
            {
                label: 'Continue Reading',
                onClick: async () => {
                    // Load chapters and navigate to first chapter
                    const chapters = await window.electronAPI.extensions.getChapterList(extensionId, id);
                    if (chapters && chapters.length > 0) {
                        const firstChapter = chapters[chapters.length - 1]; // First chapter (oldest)
                        navigate(`/read/${extensionId}/${encodeURIComponent(firstChapter.id)}`, {
                            state: { mangaId: id, mangaTitle: title }
                        });
                    }
                }
            },
            { label: '', onClick: () => { }, divider: true },
            {
                label: 'Manage Tags',
                onClick: () => {
                    if (fullManga) {
                        setTagEditManga(fullManga);
                        setIsTagSelectorOpen(true);
                    }
                }
            },
            { label: '', onClick: () => { }, divider: true },
            {
                label: 'Remove from Library',
                danger: true,
                onClick: async () => {
                    const confirmed = await dialog.confirm({
                        title: 'Remove from Library',
                        message: `Remove "${title}" from your library?`
                    });
                    if (confirmed && fullManga) {
                        await removeFromLibrary(fullManga.id);
                    }
                }
            }
        ];
    };

    if (loadingLibrary) {
        return (
            <div className="loading-state">
                <div className="spinner"></div>
            </div>
        );
    }

    const MAX_VISIBLE_TAGS = 5;
    const visibleTags = tagsExpanded ? tags : tags.slice(0, MAX_VISIBLE_TAGS);
    const hiddenTagCount = tags.length - MAX_VISIBLE_TAGS;

    return (
        <div className="gallery-page">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Library</h1>
                    <p className="page-subtitle">
                        {filteredLibrary.length === baseLibraryCount
                            ? `${baseLibraryCount} manga in your collection`
                            : `Showing ${filteredLibrary.length} of ${baseLibraryCount} manga`}
                    </p>
                </div>
            </div>

            <div className="gallery-controls">
                <div className="search-bar">
                    <input
                        type="text"
                        className="input"
                        placeholder="Search your library..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <div className="filter-bar">
                    <div className="sort-group">
                        <span className="sort-label">Sort by:</span>
                        <CustomDropdown
                            options={sortOptions}
                            value={sortBy}
                            onChange={(value) => setSortBy(value as any)}
                        />
                    </div>
                    <button
                        className={`filter-btn ${showUnreadOnly ? 'active' : ''}`}
                        onClick={() => setShowUnreadOnly(!showUnreadOnly)}
                    >
                        Unread
                    </button>
                    <button
                        className={`filter-btn ${isRefreshing ? 'active' : ''}`}
                        onClick={refreshLibrary}
                        disabled={isRefreshing}
                        title="Check for new chapters"
                    >
                        <span className={isRefreshing ? 'spinning' : ''}>
                            <Icons.RefreshCW width={14} height={14} />
                        </span>
                        {refreshProgress && <span>{refreshProgress.current}/{refreshProgress.total}</span>}
                    </button>
                    <button
                        className={`filter-btn ${isExporting ? 'active' : ''}`}
                        onClick={handleExportLibrary}
                        disabled={isExporting}
                        title="Export library as PNG image"
                    >
                        <Icons.Download width={14} height={14} />
                        {exportProgress && <span>{exportProgress.current}/{exportProgress.total}</span>}
                    </button>
                </div>

                {tags.length > 0 && (
                    <div className="tag-filters">
                        <button
                            className={`tag-filter ${selectedTagId === null ? 'active' : ''}`}
                            onClick={() => setSelectedTagId(null)}
                        >
                            All
                        </button>
                        {visibleTags.map(tag => (
                            <button
                                key={tag.id}
                                className={`tag-filter ${selectedTagId === tag.id ? 'active' : ''}`}
                                style={{ '--tag-color': tag.color } as React.CSSProperties}
                                onClick={() => setSelectedTagId(tag.id)}
                            >
                                {tag.name}
                            </button>
                        ))}
                        {hiddenTagCount > 0 && (
                            <button
                                className="tag-filter tag-expand"
                                onClick={() => setTagsExpanded(!tagsExpanded)}
                            >
                                {tagsExpanded ? 'Show less' : `+${hiddenTagCount} more`}
                            </button>
                        )}
                    </div>
                )}
            </div>


            {filteredLibrary.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon"><Icons.Library width={64} height={64} opacity={0.5} /></div>
                    <h2 className="empty-state-title">
                        {searchQuery ? 'No results found' : 'Your library is empty'}
                    </h2>
                    <p className="empty-state-description">
                        {searchQuery
                            ? 'Try a different search term'
                            : 'Browse manga sources to add titles to your library'}
                    </p>
                </div>
            ) : (
                <VirtualizedMangaGrid
                    manga={filteredLibrary}
                    onContextMenu={handleContextMenu}
                />
            )}

            {contextMenu.visible && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    items={getContextMenuItems()}
                    onClose={closeContextMenu}
                />
            )}

            {isTagSelectorOpen && tagEditManga && (
                <TagSelector
                    mangaId={tagEditManga.id}
                    onClose={() => {
                        setIsTagSelectorOpen(false);
                        setTagEditManga(null);
                    }}
                />
            )}

            {showExportOptions && (
                <div className="modal-overlay" onClick={() => setShowExportOptions(false)}>
                    <div className="modal export-options-modal" onClick={(e) => e.stopPropagation()}>
                        <h2>Export Options</h2>
                        <p className="modal-description">Choose what to include in your export:</p>

                        <div className="export-option">
                            <label>
                                <input
                                    type="checkbox"
                                    checked={exportOptions.includeNsfwSources}
                                    onChange={(e) => setExportOptions(prev => ({
                                        ...prev,
                                        includeNsfwSources: e.target.checked
                                    }))}
                                />
                                <span>Include NSFW sources</span>
                            </label>
                            <p className="option-hint">E-Hentai, NHentai, etc.</p>
                        </div>

                        <div className="export-option">
                            <label>
                                <input
                                    type="checkbox"
                                    checked={exportOptions.includeNsfwTags}
                                    onChange={(e) => setExportOptions(prev => ({
                                        ...prev,
                                        includeNsfwTags: e.target.checked
                                    }))}
                                />
                                <span>Include NSFW-tagged manga</span>
                            </label>
                            <p className="option-hint">Manga with NSFW tag applied</p>
                        </div>

                        <div className="modal-actions">
                            <button className="btn-secondary" onClick={() => setShowExportOptions(false)}>
                                Cancel
                            </button>
                            <button className="btn-primary" onClick={executeExport}>
                                <Icons.Download width={16} height={16} />
                                Export
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Library;
