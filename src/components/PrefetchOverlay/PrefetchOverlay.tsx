import React from 'react';
import { useLocation } from 'react-router-dom';
import { useAppStore } from '../../stores/appStore';
import { Icons } from '../../components/Icons';
import './PrefetchOverlay.css';

const PrefetchOverlay: React.FC = () => {
    const { isPrefetching, prefetchProgress, cancelPrefetch, prefetchSummary, acknowledgePrefetchSummary } = useAppStore();
    const location = useLocation();

    // Hide overlay when on reader page (but still show summary modal)
    const hideProgress = location.pathname.startsWith('/read/');

    // Show summary modal after prefetch completes
    if (prefetchSummary) {
        const statusLabel = prefetchSummary.status === 'completed' ? 'Completed' :
            prefetchSummary.status === 'cancelled' ? 'Cancelled' : 'Failed';
        const statusColor = prefetchSummary.status === 'completed' ? 'var(--color-success)' :
            prefetchSummary.status === 'cancelled' ? 'var(--color-warning)' : 'var(--color-error)';

        return (
            <div className="prefetch-summary-overlay">
                <div className="prefetch-summary-modal">
                    <div className="prefetch-summary-header">
                        <h3>Prefetch {statusLabel}</h3>
                        <button className="btn-close-prefetch" onClick={acknowledgePrefetchSummary}>✕</button>
                    </div>
                    <div className="prefetch-summary-content">
                        <p className="prefetch-manga-title">{prefetchSummary.mangaTitle}</p>

                        <div className="prefetch-stats">
                            <div className="prefetch-stat success">
                                <Icons.Check width={16} height={16} />
                                <span>{prefetchSummary.successCount} pages cached</span>
                            </div>
                            {prefetchSummary.failedCount > 0 && (
                                <div className="prefetch-stat failed">
                                    <Icons.X width={16} height={16} />
                                    <span>{prefetchSummary.failedCount} pages failed</span>
                                </div>
                            )}
                            {prefetchSummary.skippedCount > 0 && (
                                <div className="prefetch-stat skipped">
                                    <Icons.AlertTriangle width={16} height={16} />
                                    <span>{prefetchSummary.skippedCount} chapters skipped</span>
                                </div>
                            )}
                        </div>

                        {prefetchSummary.failedPages.length > 0 && (
                            <div className="prefetch-failed-list">
                                <p className="failed-list-title">Failed pages (likely broken on source):</p>
                                <ul>
                                    {prefetchSummary.failedPages.slice(0, 10).map((fp, i) => (
                                        <li key={i}>
                                            <span className="failed-chapter">{fp.chapter}</span>
                                            <span className="failed-url" title={fp.url}>{fp.url.substring(fp.url.lastIndexOf('/') + 1)}</span>
                                        </li>
                                    ))}
                                    {prefetchSummary.failedPages.length > 10 && (
                                        <li className="more-failed">...and {prefetchSummary.failedPages.length - 10} more</li>
                                    )}
                                </ul>
                            </div>
                        )}
                    </div>
                    <div className="prefetch-summary-actions">
                        <button className="btn btn-primary" onClick={acknowledgePrefetchSummary}>OK</button>
                    </div>
                </div>
            </div>
        );
    }

    // Hide progress when not prefetching or on reader
    if (!isPrefetching || hideProgress) return null;

    const hasError = !!prefetchProgress.error;
    const progressPercent = prefetchProgress.total > 0
        ? (prefetchProgress.current / prefetchProgress.total) * 100
        : 0;

    return (
        <div className="prefetch-progress-overlay">
            <div className={`prefetch-card ${hasError ? 'prefetch-error' : ''}`}>
                <div className="prefetch-header">
                    <span className="prefetch-title">
                        {hasError ? 'Prefetch Paused' : 'Prefetching Chapters...'}
                    </span>
                    <div className="prefetch-header-right">
                        <span className="prefetch-count">{prefetchProgress.current} / {prefetchProgress.total}</span>
                        {hasError && (
                            <button className="btn-close-prefetch" onClick={cancelPrefetch} title="Cancel prefetch">
                                ✕
                            </button>
                        )}
                    </div>
                </div>
                <div className={`prefetch-bar-bg ${hasError ? 'prefetch-bar-error' : ''}`}>
                    <div
                        className={`prefetch-bar-fill ${hasError ? 'prefetch-bar-fill-error' : ''}`}
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>
                <div className="prefetch-status">
                    {hasError ? (
                        <span className="prefetch-error-message">{prefetchProgress.error}</span>
                    ) : (
                        <>
                            <span className="truncate">{prefetchProgress.chapter}</span>
                            <button className="btn-cancel-prefetch" onClick={cancelPrefetch}>Cancel</button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PrefetchOverlay;

