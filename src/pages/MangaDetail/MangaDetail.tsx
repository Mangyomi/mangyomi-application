import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../../stores/appStore';
import { useLibraryStore } from '../../features/library/stores/libraryStore';
import { useAniListStore } from '../../stores/anilistStore';
import { useDialog } from '../../components/ConfirmModal/DialogContext';
import { useRef } from 'react';
import { useSettingsStore } from '../../features/settings/stores/settingsStore';
import './MangaDetail.css';

import TagSelector from '../../components/TagSelector';
import AniListLinkModal from '../../components/AniListLinkModal/AniListLinkModal';
import { Icons } from '../../components/Icons';
import Tooltip from '../../components/Tooltip';

function MangaDetail() {
    const { extensionId, mangaId } = useParams<{ extensionId: string; mangaId: string }>();
    const navigate = useNavigate();
    const {
        currentManga,
        currentChapters,
        loadMangaDetails,
        loadChapters,
    } = useAppStore();
    const {
        addToLibrary,
        removeFromLibrary,
        library,
    } = useLibraryStore();
    const dialog = useDialog();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isTagSelectorOpen, setIsTagSelectorOpen] = useState(false);
    const [mangaTags, setMangaTags] = useState<any[]>([]);
    const [isAniListModalOpen, setIsAniListModalOpen] = useState(false);
    const [anilistId, setAnilistId] = useState<number | null>(null);
    const [isWebViewModalOpen, setIsWebViewModalOpen] = useState(false);
    const [isImageZoomed, setIsImageZoomed] = useState(false);

    // Global Prefetch State
    const { isPrefetching, prefetchMangaId, startPrefetch } = useAppStore();

    const [cachedChaptersCount, setCachedChaptersCount] = useState(0);

    // Deduplicate chapters based on ID to avoid false mismatches
    const uniqueChapters = Array.from(new Map(currentChapters.map(c => [c.id, c])).values());

    const checkCacheStatus = async () => {
        if (!mangaId) return;
        try {
            const count = await window.electronAPI.cache.checkManga(decodeURIComponent(mangaId));
            setCachedChaptersCount(count);
        } catch (e) {
            console.error('Failed to check cache status', e);
        }
    };

    useEffect(() => {
        checkCacheStatus();
    }, [mangaId, isPrefetching]);

    const handlePrefetchAll = async () => {
        if (!extensionId || !mangaId || !uniqueChapters.length) return;

        const isRefresh = cachedChaptersCount >= uniqueChapters.length;
        const isLargeBatch = uniqueChapters.length > 500;

        let message: React.ReactNode = isRefresh
            ? 'This will delete existing cache and re-download all chapters. This may take a while.\n\nThe process will automatically stop if your defined Cache Limit is reached.'
            : 'This will download all images for all chapters to your local cache. This may take a while and use significant disk space.\n\nThe process will automatically stop if your defined Cache Limit is reached.';

        if (isLargeBatch) {
            message = (
                <div>
                    <div style={{ whiteSpace: 'pre-line' }}>{message}</div>
                    <div style={{
                        marginTop: '16px',
                        padding: '12px',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid var(--color-error)',
                        borderRadius: '6px',
                        color: 'var(--color-error)',
                        fontSize: '0.9em'
                    }}>
                        <strong>Warning: Large Batch ({uniqueChapters.length} chapters)</strong>
                        <br />
                        It is not recommended to prefetch this many chapters at once. Please rely on the pre-fetch settings, which will handle reading with close to zero delay just fine.
                    </div>
                </div>
            );
        } else {
            message = <div style={{ whiteSpace: 'pre-line' }}>{message}</div>;
        }

        const confirm = await dialog.confirm({
            title: isRefresh ? 'Refresh All Chapters?' : 'Prefetch All Chapters?',
            message: message,
            confirmLabel: isRefresh ? 'Refresh Cache' : 'Start Prefetch'
        });

        if (!confirm) return;

        // User asked for "prefetch entire manga" starting from first chapter.
        // Sort ascending by chapter number
        const chaptersToFetch = [...uniqueChapters].sort((a, b) =>
            (a.chapterNumber || 0) - (b.chapterNumber || 0)
        );
        // Use decodedMangaId to ensure consistency with DB checks
        startPrefetch(chaptersToFetch, extensionId, decodedMangaId, currentManga?.title || 'Unknown');
    };

    const { isAuthenticated: isAniListAuthenticated, syncProgress } = useAniListStore();

    const decodedMangaId = decodeURIComponent(mangaId || '');
    const libraryEntry = library.find(
        m => m.source_id === extensionId && m.source_manga_id === decodedMangaId
    );
    const isInLibrary = !!libraryEntry;

    const fetchTags = async () => {
        if (!libraryEntry) {
            setMangaTags([]);
            return;
        }
        try {
            const tags = await window.electronAPI.db.getTagsForManga(libraryEntry.id);
            setMangaTags(tags);
        } catch (e) {
            console.error('Failed to load tags for manga', e);
        }
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                navigate(-1);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [navigate]);

    useEffect(() => {
        fetchTags();
    }, [libraryEntry, isTagSelectorOpen]);

    // Load anilist_id from library entry
    useEffect(() => {
        if (libraryEntry?.anilist_id) {
            setAnilistId(libraryEntry.anilist_id);
        } else {
            setAnilistId(null);
        }
    }, [libraryEntry]);

    const handleRefresh = async () => {
        if (!extensionId || !mangaId) return;
        setLoading(true);
        setError(null);
        try {
            await Promise.all([
                loadMangaDetails(extensionId, decodedMangaId),
                loadChapters(extensionId, decodedMangaId),
            ]);
        } catch (e) {
            setError('Failed to refresh data');
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleToggleRead = async (e: React.MouseEvent, chapter: any) => {
        e.stopPropagation();
        if (chapter.read_at) {
            await useAppStore.getState().markChapterUnread(chapter.id);
        } else {
            await useAppStore.getState().markChapterRead(chapter.id);
        }
    };

    const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

    const sortedChapters = [...currentChapters].sort((a, b) => {
        const numA = a.chapterNumber || 0;
        const numB = b.chapterNumber || 0;
        return sortOrder === 'desc' ? numB - numA : numA - numB;
    });

    const handleMarkAllUnread = async () => {
        if (!currentChapters.length) return;
        const confirmed = await dialog.confirm({
            title: 'Mark All Unread',
            message: 'Mark all chapters as unread?',
            confirmLabel: 'Mark Unread',
        });
        if (confirmed) {
            const ids = currentChapters.map(c => c.id);
            await useAppStore.getState().markChaptersUnread(ids);
        }
    };

    const handleMarkPreviousRead = async (e: React.MouseEvent, chapterId: string) => {
        e.stopPropagation();

        const index = sortedChapters.findIndex(c => c.id === chapterId);
        if (index === -1) return;

        let idsToMark: string[] = [];

        if (sortOrder === 'desc') {
            const olderChapters = sortedChapters.slice(index + 1);
            idsToMark = [chapterId, ...olderChapters.map(c => c.id)];
        } else {
            const olderChapters = sortedChapters.slice(0, index);
            idsToMark = [...olderChapters.map(c => c.id), chapterId];
        }

        if (idsToMark.length > 0) {
            const confirmed = await dialog.confirm({
                title: 'Mark Chapters Read',
                message: `Mark ${idsToMark.length} chapters as read?`,
                confirmLabel: 'Mark Read',
            });
            if (confirmed) {
                await useAppStore.getState().markChaptersRead(idsToMark);
            }
        }
    };

    useEffect(() => {
        const loadData = async () => {
            if (!extensionId || !mangaId) return;

            setLoading(true);
            setError(null);

            try {
                await Promise.all([
                    loadMangaDetails(extensionId, decodedMangaId),
                    loadChapters(extensionId, decodedMangaId),
                ]);
            } catch (e) {
                setError('Failed to load manga details');
                console.error(e);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [extensionId, mangaId]);

    const handleAddToLibrary = async () => {
        if (!currentManga || !extensionId) return;
        await addToLibrary(currentManga, extensionId);
    };

    const handleRemoveFromLibrary = async () => {
        if (!libraryEntry) return;
        await removeFromLibrary(libraryEntry.id);
    };



    const handleWebViewClick = () => {
        setIsWebViewModalOpen(true);
    };

    const confirmWebView = async (mode: 'external' | 'internal') => {
        setIsWebViewModalOpen(false);
        if (!currentManga) return;
        const url = (currentManga as any).url;
        if (!url) {
            dialog.alert('No URL available for this manga');
            return;
        }

        try {
            if (mode === 'external') {
                await window.electronAPI.app.openExternal(url);
            } else {
                await window.electronAPI.app.openInAppBrowser(url);
            }
        } catch (e) {
            console.error('Failed to open link', e);
        }
    };

    const handleReadChapter = (chapterId: string) => {
        navigate(`/read/${extensionId}/${encodeURIComponent(chapterId)}`);
    };

    if (loading) {
        return (
            <div className="loading-state">
                <div className="spinner"></div>
            </div>
        );
    }

    if (error || !currentManga) {
        return (
            <div className="empty-state">
                <div className="empty-state-icon"><Icons.AlertTriangle width={48} height={48} color="var(--color-error)" /></div>
                <h2 className="empty-state-title">{error || 'Manga not found'}</h2>
                <button className="btn btn-primary" onClick={() => navigate(-1)}>
                    <Icons.ArrowLeft width={18} height={18} style={{ marginRight: '6px' }} /> Go Back
                </button>
            </div>
        );
    }

    const proxiedCoverUrl = window.electronAPI?.getProxiedImageUrl
        ? window.electronAPI.getProxiedImageUrl(currentManga.coverUrl, extensionId!)
        : currentManga.coverUrl;



    return (
        <div className="manga-detail-page">
            {/* Hero Section */}
            <div className="manga-hero" style={{ position: 'relative' }}>
                <div className="manga-hero-bg" style={{ backgroundImage: `url(${proxiedCoverUrl})` }} />

                {/* WebView Button */}
                <div style={{ position: 'absolute', top: '16px', right: '16px', zIndex: 10 }}>
                    <Tooltip content="Open in Webview">
                        <button
                            className="btn-icon"
                            onClick={handleWebViewClick}
                            style={{
                                background: 'transparent',
                                borderRadius: '50%',
                                width: '40px',
                                height: '40px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'white'
                            }}
                        >
                            <Icons.Globe width={20} height={20} />
                        </button>
                    </Tooltip>
                </div>



                {/* WebView Choice Modal */}
                {isWebViewModalOpen && (
                    <div className="confirm-modal-overlay" onClick={() => setIsWebViewModalOpen(false)}>
                        <div className="confirm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                            <div className="confirm-header">
                                <h3>Open Manga</h3>
                            </div>
                            <div className="confirm-content">
                                <p>Where would you like to view this manga?</p>
                            </div>
                            <div className="confirm-actions" style={{ flexDirection: 'column', gap: '8px' }}>
                                <button className="btn btn-secondary w-full" onClick={() => confirmWebView('internal')} style={{ width: '100%', justifyContent: 'center' }}>
                                    Open in App Browser
                                </button>
                                <button className="btn btn-primary w-full" onClick={() => confirmWebView('external')} style={{ width: '100%', justifyContent: 'center' }}>
                                    Open in Default Browser
                                </button>
                                <button className="btn btn-ghost w-full" onClick={() => setIsWebViewModalOpen(false)} style={{ width: '100%', justifyContent: 'center', marginTop: '4px' }}>
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="manga-hero-content">
                    <img
                        src={proxiedCoverUrl}
                        alt={currentManga.title}
                        className="manga-cover"
                        onClick={() => setIsImageZoomed(true)}
                        style={{ cursor: 'pointer' }}
                    />
                    <div className="manga-info">
                        <h1 className="manga-title">{currentManga.title}</h1>
                        <p className="manga-author">
                            {currentManga.author}
                            {currentManga.artist && currentManga.artist !== currentManga.author && (
                                <> • Art by {currentManga.artist}</>
                            )}
                        </p>
                        <div className="manga-status">
                            <span className={`status-badge ${currentManga.status}`}>
                                {currentManga.status}
                            </span>
                        </div>
                        <div className="manga-genres">
                            {currentManga.genres?.map((genre: string, index: number) => (
                                <span key={`${genre}-${index}`} className="genre-badge">{genre}</span>
                            ))}
                        </div>

                        {/* User Tags */}
                        {mangaTags.length > 0 && (
                            <div className="manga-user-tags">
                                {mangaTags.map(tag => (
                                    <span key={tag.id} className="user-tag-badge" style={{ borderColor: tag.color }}>
                                        <span className="tag-dot" style={{ background: tag.color }} />
                                        {tag.name}
                                    </span>
                                ))}
                            </div>
                        )}

                        {currentManga.details && (
                            <div className="manga-metadata">
                                {currentManga.details.map((item: any) => (
                                    <span key={item.label} className="metadata-item">
                                        <span className="metadata-label">{item.label}:</span>{' '}
                                        <span className="metadata-value">{item.value}</span>
                                    </span>
                                ))}
                            </div>
                        )}

                        <div className="manga-actions">
                            {isInLibrary ? (
                                <>
                                    <button className="btn btn-secondary" onClick={handleRemoveFromLibrary}>
                                        <Icons.Check width={16} height={16} style={{ marginRight: '6px' }} /> In Library
                                    </button>
                                    <button className="btn btn-secondary" onClick={() => setIsTagSelectorOpen(true)}>
                                        <Icons.Tag width={16} height={16} style={{ marginRight: '6px' }} /> Tags
                                    </button>
                                    <Tooltip content={anilistId ? `Linked to AniList (ID: ${anilistId})` : 'Track on AniList'}>
                                        <button
                                            className={`btn ${anilistId ? 'btn-anilist-linked' : 'btn-secondary'}`}
                                            onClick={() => setIsAniListModalOpen(true)}
                                        >
                                            <Icons.Chart width={16} height={16} style={{ marginRight: '6px' }} /> {anilistId ? 'Tracking' : 'Track'}
                                        </button>
                                    </Tooltip>
                                </>
                            ) : (
                                <button className="btn btn-primary" onClick={handleAddToLibrary}>
                                    <Icons.Plus width={18} height={18} style={{ marginRight: '6px' }} /> Add to Library
                                </button>
                            )}
                            {currentChapters.length > 0 && (
                                <>

                                    <button
                                        className="btn btn-primary"
                                        onClick={() => handleReadChapter(currentChapters[currentChapters.length - 1].id)}
                                    >
                                        <Icons.Play width={18} height={18} style={{ marginRight: '6px', fill: 'currentColor' }} /> Start Reading
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {
                isTagSelectorOpen && libraryEntry && (
                    <TagSelector
                        mangaId={libraryEntry.id}
                        onClose={() => setIsTagSelectorOpen(false)}
                    />
                )
            }

            {/* Description - only show if available */}
            {
                currentManga.description && (
                    <div className="manga-section">
                        <h2 className="section-title">Description</h2>
                        <p className="manga-description">
                            {currentManga.description}
                        </p>
                    </div>
                )
            }


            <div className="manga-section">
                <div className="section-header">
                    <h2 className="section-title">
                        Chapters
                        <span className="chapter-count">({uniqueChapters.length})</span>
                    </h2>
                    <div className="chapter-controls">
                        {uniqueChapters.length > 0 && (() => {
                            const isThisMangaPrefetching = isPrefetching && prefetchMangaId === decodeURIComponent(mangaId || '');
                            return (
                                <Tooltip
                                    content={cachedChaptersCount >= uniqueChapters.length ? "Refresh all cached chapters" : `Prefetch all chapters (${cachedChaptersCount}/${uniqueChapters.length} cached)`}
                                    position="top"
                                >
                                    <button
                                        className="btn-icon"
                                        onClick={handlePrefetchAll}
                                        disabled={isPrefetching}
                                        style={{ color: isThisMangaPrefetching ? 'var(--color-accent)' : undefined }}
                                    >
                                        {isThisMangaPrefetching ? (
                                            <Icons.Loader width={20} height={20} className="spin" />
                                        ) : cachedChaptersCount >= uniqueChapters.length ? (
                                            <Icons.RefreshCW width={20} height={20} />
                                        ) : (
                                            <Icons.Download width={20} height={20} />
                                        )}
                                    </button>
                                </Tooltip>
                            );
                        })()}
                        <Tooltip content={`Sort ${sortOrder === 'desc' ? 'Ascending' : 'Descending'}`}>
                            <button
                                className="btn-icon"
                                onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                            >
                                {sortOrder === 'desc' ? (
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 16 4 4 4-4" /><path d="M7 20V4" /><path d="M11 5h10" /><path d="M11 9h10" /><path d="M11 13h10" /></svg>
                                ) : (
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 8 4-4 4 4" /><path d="M7 4v16" /><path d="M11 12h10" /><path d="M11 8h10" /><path d="M11 16h10" /></svg>
                                )}
                            </button>
                        </Tooltip>
                        <Tooltip content="Mark all as unread">
                            <button
                                className="btn-icon"
                                onClick={handleMarkAllUnread}
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" /><line x1="2" y1="2" x2="22" y2="22" /></svg>
                            </button>
                        </Tooltip>
                    </div>
                </div>
                <div className="chapter-list">
                    {Array.from(new Map(sortedChapters.map(c => [c.id, c])).values()).map((chapter) => (
                        <div
                            key={chapter.id}
                            className={`chapter-item ${chapter.read_at ? 'read' : ''}`}
                            onClick={() => handleReadChapter(chapter.id)}
                        >
                            <div className="detail-chapter-info">
                                <span className="chapter-number">Ch. {chapter.chapterNumber}</span>
                                <span className="chapter-title">{chapter.title}</span>
                            </div>
                            {chapter.uploadDate && (
                                <span className="chapter-date">
                                    {(() => {
                                        const date = new Date(chapter.uploadDate);
                                        // Fix for extensions that parse MM/DD without year (defaults to 2001)
                                        if (date.getFullYear() < 2010) {
                                            date.setFullYear(new Date().getFullYear());
                                        }
                                        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                                    })()}
                                </span>
                            )}

                            <div className="chapter-actions">
                                <Tooltip content={chapter.read_at ? "Mark as unread" : "Mark as read"} position="left">
                                    <button
                                        className="action-icon-btn"
                                        onClick={(e) => handleToggleRead(e, chapter)}
                                    >
                                        {chapter.read_at ? (
                                            // Eye Off (Mark as Unread)
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                                <line x1="1" y1="1" x2="23" y2="23" />
                                            </svg>
                                        ) : (
                                            // Double Check (Mark as Read)
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M18 6 7 17l-5-5" />
                                                <path d="m22 10-7.5 7.5L13 16" />
                                            </svg>
                                        )}
                                    </button>
                                </Tooltip>
                                <Tooltip content={sortOrder === 'desc' ? "Mark previous (older) chapters as read" : "Mark previous (older) chapters as read"} position="left">
                                    <button
                                        className="action-icon-btn"
                                        onClick={(e) => handleMarkPreviousRead(e, chapter.id)}
                                    >
                                        {sortOrder === 'desc' ? (
                                            // Down Arrow (Desc: Older are below)
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <line x1="12" y1="5" x2="12" y2="19" />
                                                <polyline points="19 12 12 19 5 12" />
                                            </svg>
                                        ) : (
                                            // Up Arrow (Asc: Older are above)
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <line x1="12" y1="19" x2="12" y2="5" />
                                                <polyline points="5 12 12 5 19 12" />
                                            </svg>
                                        )}
                                    </button>
                                </Tooltip>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <AniListLinkModal
                isOpen={isAniListModalOpen}
                mangaTitle={currentManga?.title || ''}
                mangaId={libraryEntry?.id || ''}
                currentAnilistId={anilistId}
                onClose={() => setIsAniListModalOpen(false)}
                onLinked={(id) => {
                    setAnilistId(id);
                    // Sync progress immediately after linking
                    if (libraryEntry?.id && isAniListAuthenticated) {
                        syncProgress(libraryEntry.id);
                    }
                }}
                onUnlinked={() => setAnilistId(null)}
            />

            {/* Image Zoom Modal */}
            {isImageZoomed && (
                <div
                    className="confirm-modal-overlay"
                    onClick={() => setIsImageZoomed(false)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '20px'
                    }}
                >
                    <img
                        src={proxiedCoverUrl}
                        alt={currentManga.title}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            maxWidth: '90vw',
                            maxHeight: '90vh',
                            objectFit: 'contain',
                            borderRadius: '8px',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                        }}
                    />
                </div>
            )}
        </div >
    );
}

export default MangaDetail;
