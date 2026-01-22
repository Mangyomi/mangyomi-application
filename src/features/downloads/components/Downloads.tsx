import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDialog } from '../../../components/ConfirmModal/DialogContext';
import './Downloads.css';

// Icons
const Icons = {
    Check: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
    ),
    X: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
    ),
    AlertTriangle: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
    ),
    Trash: () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18"></path>
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
        </svg>
    ),
    Clock: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
    ),
};

interface PrefetchHistoryEntry {
    id: number;
    manga_id: string;
    manga_title: string;
    extension_id: string;
    status: 'in_progress' | 'completed' | 'cancelled' | 'failed';
    started_at: number;
    completed_at: number | null;
    total_chapters: number;
    completed_chapters: number;
    total_pages: number;
    success_count: number;
    failed_count: number;
    skipped_count: number;
    failed_pages: string | null;
}

function Downloads() {
    const [history, setHistory] = useState<PrefetchHistoryEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const dialog = useDialog();
    const navigate = useNavigate();

    const loadHistory = async () => {
        setLoading(true);
        try {
            const data = await window.electronAPI.db.getPrefetchHistory(undefined, 50);
            setHistory(data);
        } catch (e) {
            console.error('Failed to load prefetch history:', e);
        }
        setLoading(false);
    };

    useEffect(() => {
        loadHistory();
    }, []);

    const handleClearAll = async () => {
        const confirmed = await dialog.confirm({
            title: 'Clear Download History',
            message: 'Delete all download history records? This cannot be undone.',
        });
        if (confirmed) {
            await window.electronAPI.db.clearPrefetchHistory();
            setHistory([]);
        }
    };

    const formatDate = (timestamp: number) => {
        const date = new Date(timestamp * 1000);
        return date.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getStatusBadge = (status: string) => {
        const styles: Record<string, { color: string; bg: string; label: string }> = {
            completed: { color: 'var(--color-success)', bg: 'rgba(34, 197, 94, 0.1)', label: 'Completed' },
            cancelled: { color: 'var(--color-warning)', bg: 'rgba(245, 158, 11, 0.1)', label: 'Cancelled' },
            failed: { color: 'var(--color-error)', bg: 'rgba(239, 68, 68, 0.1)', label: 'Failed' },
            in_progress: { color: 'var(--color-accent)', bg: 'rgba(139, 92, 246, 0.1)', label: 'In Progress' },
        };
        const style = styles[status] || styles.failed;
        return (
            <span className="status-badge" style={{ color: style.color, background: style.bg }}>
                {style.label}
            </span>
        );
    };

    return (
        <div className="downloads-page">
            <div className="downloads-header">
                <h1>Downloads</h1>
                <button
                    className="btn btn-danger"
                    onClick={handleClearAll}
                    disabled={history.length === 0}
                >
                    <Icons.Trash />
                    Clear All
                </button>
            </div>

            {loading ? (
                <div className="loading-state">
                    <div className="spinner"></div>
                </div>
            ) : history.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-icon">
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                    </div>
                    <h2>No Download History</h2>
                    <p>Prefetch chapters from a manga's detail page to start downloading.</p>
                </div>
            ) : (
                <div className="downloads-list">
                    {history.map((entry) => (
                        <div
                            key={entry.id}
                            className="download-card"
                            onClick={() => navigate(`/manga/${entry.extension_id}/${encodeURIComponent(entry.manga_id)}`)}
                        >
                            <div className="download-main">
                                <h3 className="download-title">{entry.manga_title || 'Unknown Manga'}</h3>
                                <div className="download-meta">
                                    {getStatusBadge(entry.status)}
                                    <span className="download-date">
                                        <Icons.Clock />
                                        {formatDate(entry.started_at)}
                                    </span>
                                </div>
                            </div>
                            <div className="download-stats">
                                <div className="stat">
                                    <span className="stat-label">Chapters</span>
                                    <span className="stat-value">{entry.completed_chapters} / {entry.total_chapters}</span>
                                </div>
                                <div className="stat">
                                    <span className="stat-label">Pages</span>
                                    <span className="stat-value">
                                        <span style={{ color: 'var(--color-success)' }}>{entry.success_count}</span>
                                        {entry.failed_count > 0 && (
                                            <span style={{ color: 'var(--color-error)', marginLeft: '4px' }}>
                                                / {entry.failed_count} failed
                                            </span>
                                        )}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default Downloads;
