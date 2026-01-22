import { useState, useEffect } from 'react';
import { useAniListStore, AniListMedia } from '../../stores/anilistStore';
import { useLibraryStore, Manga } from '../../features/library/stores/libraryStore';
import { useDialog } from '../ConfirmModal/DialogContext';
import './AniListLinkModal.css';

interface AniListLinkModalProps {
    isOpen: boolean;
    mangaTitle: string;
    mangaId: string;
    currentAnilistId?: number | null;
    onClose: () => void;
    onLinked: (anilistId: number) => void;
    onUnlinked: () => void;
}

function AniListLinkModal({
    isOpen,
    mangaTitle,
    mangaId,
    currentAnilistId,
    onClose,
    onLinked,
    onUnlinked,
}: AniListLinkModalProps) {
    const { searchManga, linkManga, unlinkManga, isAuthenticated } = useAniListStore();
    const { library } = useLibraryStore();
    const dialog = useDialog();
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<AniListMedia[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedMedia, setSelectedMedia] = useState<AniListMedia | null>(null);

    useEffect(() => {
        if (isOpen && mangaTitle) {
            setSearchQuery(mangaTitle);
            handleSearch(mangaTitle);
        }
    }, [isOpen, mangaTitle]);

    const handleSearch = async (query: string) => {
        if (!query.trim()) return;
        setIsSearching(true);
        try {
            const results = await searchManga(query);
            setSearchResults(results);
        } catch (error) {
            console.error('Search error:', error);
            setSearchResults([]);
        } finally {
            setIsSearching(false);
        }
    };

    const handleLink = async () => {
        if (!selectedMedia) return;

        // Check if this AniList ID is already linked to another manga
        const existingLink = library.find((m: Manga) => m.anilist_id === selectedMedia.id && m.id !== mangaId);

        if (existingLink) {
            const confirmed = await dialog.confirm({
                title: 'Already Linked',
                message: `"${selectedMedia.title.english || selectedMedia.title.romaji}" is already linked to "${existingLink.title}" (${existingLink.source_id}) in your library.\n\nDo you want to unlink it from the existing manga and link it to this one instead?`,
                confirmLabel: 'Unlink & Relink'
            });

            if (!confirmed) return;

            // Unlink from the old one
            const unlinkSuccess = await unlinkManga(existingLink.id);
            if (!unlinkSuccess) {
                // Could handle error here, but for now just return
                console.error('Failed to unlink existing manga');
                return;
            }
        }

        const success = await linkManga(mangaId, selectedMedia.id);
        if (success) {
            onLinked(selectedMedia.id);
            onClose();
        }
    };

    const handleUnlink = async () => {
        const success = await unlinkManga(mangaId);
        if (success) {
            onUnlinked();
            onClose();
        }
    };

    if (!isOpen) return null;

    if (!isAuthenticated) {
        return (
            <div className="modal-overlay" onClick={onClose}>
                <div className="modal-content anilist-link-modal" onClick={e => e.stopPropagation()}>
                    <div className="modal-header">
                        <h2>Link to AniList</h2>
                        <button className="modal-close" onClick={onClose}>×</button>
                    </div>
                    <div className="modal-body">
                        <div className="not-authenticated">
                            <span className="warning-icon">⚠️</span>
                            <p>Connect your AniList account in Settings to use tracking.</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content anilist-link-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>{currentAnilistId ? 'Manage AniList Link' : 'Link to AniList'}</h2>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>

                <div className="modal-body">
                    {currentAnilistId ? (
                        <div className="current-link">
                            <p>This manga is linked to AniList ID: <strong>{currentAnilistId}</strong></p>
                            <button className="unlink-btn" onClick={handleUnlink}>
                                Unlink from AniList
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="search-section">
                                <div className="search-input-group">
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSearch(searchQuery)}
                                        placeholder="Search AniList..."
                                        className="search-input"
                                    />
                                    <button
                                        className="search-btn"
                                        onClick={() => handleSearch(searchQuery)}
                                        disabled={isSearching}
                                    >
                                        {isSearching ? '...' : 'Search'}
                                    </button>
                                </div>
                            </div>

                            <div className="search-results">
                                {isSearching ? (
                                    <div className="loading">Searching...</div>
                                ) : searchResults.length === 0 ? (
                                    <div className="no-results">No results found</div>
                                ) : (
                                    searchResults.map((media) => {
                                        const alreadyLinkedTo = library.find((m: Manga) => m.anilist_id === media.id);
                                        const isLinkedToThis = alreadyLinkedTo && alreadyLinkedTo.id === mangaId;
                                        const isLinkedToOther = alreadyLinkedTo && alreadyLinkedTo.id !== mangaId;

                                        return (
                                            <div
                                                key={media.id}
                                                className={`result-item ${selectedMedia?.id === media.id ? 'selected' : ''}`}
                                                onClick={() => setSelectedMedia(media)}
                                            >
                                                <img
                                                    src={media.coverImage.medium}
                                                    alt={media.title.romaji}
                                                    className="result-cover"
                                                />
                                                <div className="result-info">
                                                    <div className="result-title-row">
                                                        <h4>{media.title.english || media.title.romaji}</h4>
                                                        {isLinkedToOther && (
                                                            <span className="linked-badge" title={`Already linked to "${alreadyLinkedTo.title}"`}>
                                                                Linked
                                                            </span>
                                                        )}
                                                    </div>
                                                    {media.title.english && media.title.english !== media.title.romaji && (
                                                        <p className="romaji-title">{media.title.romaji}</p>
                                                    )}
                                                    <p className="result-meta">
                                                        {media.chapters ? `${media.chapters} chapters` : 'Ongoing'}
                                                        {media.averageScore && ` • ${media.averageScore}%`}
                                                    </p>
                                                    {isLinkedToOther && (
                                                        <p className="linked-info">
                                                            Linked to: {alreadyLinkedTo.title}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </>
                    )}
                </div>

                {!currentAnilistId && (
                    <div className="modal-footer">
                        <button className="cancel-btn" onClick={onClose}>Cancel</button>
                        <button
                            className="link-btn"
                            onClick={handleLink}
                            disabled={!selectedMedia}
                        >
                            {selectedMedia && library.some((m: Manga) => m.anilist_id === selectedMedia.id && m.id !== mangaId)
                                ? 'Unlink & Link'
                                : 'Link Selected'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default AniListLinkModal;
