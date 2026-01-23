import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icons } from '../Icons';
import CloudflareImage from '../CloudflareImage';
import './MangaCard.css';

interface MangaCardProps {
    id: string;
    title: string;
    coverUrl: string;
    extensionId: string;
    index?: number;
    inLibrary?: boolean;
    totalChapters?: number;
    readChapters?: number;
    onContextMenu?: (e: React.MouseEvent, manga: { id: string; title: string; extensionId: string }) => void;
    action?: {
        icon: React.ReactNode;
        onClick: (e: React.MouseEvent, manga: { id: string; title: string; extensionId: string }) => void;
        variant?: 'default' | 'danger';
        title?: string;
    };
    uniqueId?: string;
}

function MangaCard({ id, title, coverUrl, extensionId, index = 0, inLibrary, totalChapters, readChapters, onContextMenu, action, uniqueId }: MangaCardProps) {
    const navigate = useNavigate();
    const [imageError, setImageError] = useState(false);

    const isFullyRead = inLibrary && totalChapters !== undefined && totalChapters > 0 && readChapters === totalChapters;

    const handleClick = () => {
        navigate(`/manga/${extensionId}/${encodeURIComponent(id)}`);
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        if (onContextMenu) {
            onContextMenu(e, { id, title, extensionId });
        }
    };

    // Use proxied URL for images
    // Pass uniqueId (internal DB ID) if available, otherwise fallback to source ID (id)
    const effectiveMangaId = uniqueId || id;
    const proxiedCoverUrl = window.electronAPI?.getProxiedImageUrl
        ? window.electronAPI.getProxiedImageUrl(coverUrl, extensionId, effectiveMangaId)
        : coverUrl;

    return (
        <div
            className={`manga-card ${isFullyRead ? 'fully-read' : ''}`}
            onClick={handleClick}
            onContextMenu={handleContextMenu}
            style={{ '--index': index } as React.CSSProperties}
        >
            <div className="manga-card-cover">
                {!imageError && proxiedCoverUrl ? (
                    <CloudflareImage
                        src={proxiedCoverUrl}
                        originalSrc={coverUrl}
                        alt={title}
                        onError={() => setImageError(true)}
                    />
                ) : (
                    <div className="manga-card-placeholder">
                        <Icons.Book width={48} height={48} opacity={0.3} />
                    </div>
                )}
                {inLibrary && (
                    <div className="manga-card-badge">
                        <span>{isFullyRead ? 'READ' : 'IN LIBRARY'}</span>
                    </div>
                )}
                {action && (
                    <div className="manga-card-actions">
                        <button
                            className={`manga-card-action-btn ${action.variant || 'default'}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                action.onClick(e, { id, title, extensionId });
                            }}
                            title={action.title}
                        >
                            {action.icon}
                        </button>
                    </div>
                )}
            </div>
            {/* Reading Progress Bar */}
            {inLibrary && readChapters !== undefined && readChapters > 0 && totalChapters !== undefined && totalChapters > 0 && (
                <div className="manga-card-progress">
                    <div
                        className="manga-card-progress-fill"
                        style={{ width: `${Math.min(100, (readChapters / totalChapters) * 100)}%` }}
                    />
                </div>
            )}
            <div className="manga-card-info">
                <h3 className="manga-card-title">{title}</h3>
            </div>
        </div>
    );
}

export default MangaCard;

