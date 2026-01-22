import { useEffect } from 'react';
import { useUpdateStore } from '../../stores/updateStore';
import { useSettingsStore } from '../../features/settings/stores/settingsStore';
import { Logo } from '../Logo';
import './UpdateNotificationModal.css';

interface UpdateNotificationModalProps {
    onClose: () => void;
}

export function UpdateNotificationModal({ onClose }: UpdateNotificationModalProps) {
    const {
        updateInfo,
        isDownloading,
        downloadProgress,
        isDownloadComplete,
        startDownload,
        installUpdate,
        setDownloadProgress,
        setDownloadComplete,
    } = useUpdateStore();

    useEffect(() => {
        const cleanupProgress = window.electronAPI.app.onDownloadProgress((_: any, data: any) => {
            setDownloadProgress(data);
        });
        const cleanupComplete = window.electronAPI.app.onDownloadComplete((_: any, data: any) => {
            setDownloadComplete(data.success);
        });
        return () => {
            cleanupProgress();
            cleanupComplete();
        };
    }, [setDownloadProgress, setDownloadComplete]);

    if (!updateInfo?.hasUpdate) return null;

    const formatBytes = (bytes: number) => {
        if (bytes >= 1024 * 1024) {
            return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
        }
        return `${(bytes / 1024).toFixed(0)} KB`;
    };

    return (
        <div className="update-modal-overlay" onClick={onClose}>
            <div className="update-modal" onClick={(e) => e.stopPropagation()}>
                <div className="update-modal-header">
                    <Logo size={40} />
                    <div className="update-modal-title">
                        <h2>Update Available</h2>
                        <span className="update-badge">{updateInfo.isNightly ? 'Nightly' : 'Stable'}</span>
                    </div>
                </div>

                <div className="update-modal-versions">
                    <div className="version-info current">
                        <span className="version-label">Current</span>
                        <span className="version-number">v{updateInfo.currentVersion}</span>
                    </div>
                    <div className="version-arrow">→</div>
                    <div className="version-info new">
                        <span className="version-label">New</span>
                        <span className="version-number">v{updateInfo.latestVersion}</span>
                    </div>
                </div>

                {isDownloading && downloadProgress && (
                    <div className="update-download-progress">
                        <div className="progress-info">
                            <span>Downloading...</span>
                            <span>{downloadProgress.percent}%</span>
                        </div>
                        <div className="progress-bar">
                            <div
                                className="progress-fill"
                                style={{ width: `${downloadProgress.percent}%` }}
                            />
                        </div>
                        <span className="progress-size">
                            {formatBytes(downloadProgress.bytesDownloaded)} / {formatBytes(downloadProgress.totalBytes)}
                        </span>
                    </div>
                )}

                {isDownloadComplete && (
                    <div className="update-download-complete">
                        <span className="complete-icon">✓</span>
                        <span>Download complete! Ready to install.</span>
                    </div>
                )}

                <div className="update-modal-actions">
                    {isDownloadComplete ? (
                        <button className="update-btn primary" onClick={installUpdate}>
                            Install Now
                        </button>
                    ) : isDownloading ? (
                        <button className="update-btn" disabled>
                            Downloading...
                        </button>
                    ) : (
                        <>
                            <button className="update-btn secondary" onClick={onClose}>
                                Remind Me Later
                            </button>
                            <button className="update-btn primary" onClick={startDownload}>
                                Download & Install
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
