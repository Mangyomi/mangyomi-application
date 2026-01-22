import { useState, useEffect, useRef } from 'react';
import { useExtensionStore, AvailableExtension } from '../stores/extensionStore';
import { useSettingsStore } from '../../settings/stores/settingsStore';
import { Icons } from '../../../components/Icons';
import './Extensions.css';

const isUpdateAvailable = (current: string | number, latest: string | number) => {
    // Convert to numbers for comparison - handles both integer (1, 2, 3) and semver ("1.0.0")
    const currentNum = typeof current === 'number' ? current : parseFloat(String(current).split('.')[0]) || 0;
    const latestNum = typeof latest === 'number' ? latest : parseFloat(String(latest).split('.')[0]) || 0;

    // If both are simple integers, compare directly
    if (typeof current === 'number' && typeof latest === 'number') {
        return latest > current;
    }

    // For semver strings, do full comparison
    const v1 = String(current).split('.').map(Number);
    const v2 = String(latest).split('.').map(Number);
    for (let i = 0; i < Math.max(v1.length, v2.length); i++) {
        const n1 = v1[i] || 0;
        const n2 = v2[i] || 0;
        if (n2 > n1) return true;
        if (n2 < n1) return false;
    }
    return false;
};


const DEFAULT_REPO_URL = 'https://github.com/Mangyomi/mangyomi-extensions';

function Extensions() {
    // Adapted to use useExtensionStore instead of useAppStore as requested by refactor,
    // but preserving the user's specific component logic and structure.
    const { extensions, loadExtensions } = useExtensionStore();
    const { isExtensionEnabled, toggleExtension, developerMode } = useSettingsStore();

    const [repoUrl, setRepoUrl] = useState('');
    const [availableExtensions, setAvailableExtensions] = useState<AvailableExtension[]>([]);
    const [isAvailableCollapsed, setIsAvailableCollapsed] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [installingIds, setInstallingIds] = useState<Set<string>>(new Set());
    const [uninstallingIds, setUninstallingIds] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [showSideloadMenu, setShowSideloadMenu] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const hasInitiallyLoaded = useRef(false);

    const CACHE_KEY = 'cached_available_extensions';
    const CACHE_DURATION = 1000 * 60 * 60; // 1 hour

    useEffect(() => {
        if (!hasInitiallyLoaded.current) {
            hasInitiallyLoaded.current = true;
            loadDefaultExtensions();
        }
    }, []);

    const loadDefaultExtensions = async (forceRefresh = false) => {
        setError(null);

        // Try to load from cache first if not forcing refresh
        if (!forceRefresh) {
            try {
                const cached = localStorage.getItem(CACHE_KEY);
                if (cached) {
                    const { data, timestamp } = JSON.parse(cached);
                    const age = Date.now() - timestamp;

                    if (age < CACHE_DURATION) {
                        setAvailableExtensions(data);
                        // If we have cached data, we don't auto-fetch unless it's stale
                        // BUT user asked for "prefetch on first load, only update again when reported"
                        // So if we have cache, we are good.
                        return;
                    }
                }
            } catch (e) {
                console.warn('Failed to load extension cache', e);
            }
        }

        setIsLoading(true);
        try {
            const available = await window.electronAPI.extensions.listAvailable(DEFAULT_REPO_URL);
            setAvailableExtensions(available);

            // Cache the results
            localStorage.setItem(CACHE_KEY, JSON.stringify({
                data: available,
                timestamp: Date.now()
            }));
        } catch (err) {
            console.error('Failed to load default extensions:', err);
            // If fetch fails but we have stale cache, maybe show that? 
            // For now, standard error handling
            if (forceRefresh) {
                setError('Failed to refresh extensions');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleRefresh = () => {
        loadDefaultExtensions(true);
    };

    const handleBrowseRepo = async () => {
        if (!repoUrl.trim()) return;

        setIsLoading(true);
        setError(null);
        setAvailableExtensions([]);

        try {
            const available = await window.electronAPI.extensions.listAvailable(repoUrl.trim());
            setAvailableExtensions(available);
            if (available.length === 0) {
                setError('No extensions found in this repository');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch repository');
        } finally {
            setIsLoading(false);
        }
    };

    const handleInstall = async (ext: AvailableExtension) => {
        setInstallingIds(prev => new Set(prev).add(ext.id));
        setError(null);

        try {
            const result = await window.electronAPI.extensions.install(ext.repoUrl, ext.id);
            if (result.success) {
                await loadExtensions();
                setAvailableExtensions(prev =>
                    prev.map(e => e.id === ext.id ? { ...e, installed: true } : e)
                );
            } else {
                setError(result.error || 'Installation failed');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Installation failed');
        } finally {
            setInstallingIds(prev => {
                const next = new Set(prev);
                next.delete(ext.id);
                return next;
            });
        }
    };

    const handleUninstall = async (extensionId: string) => {
        setUninstallingIds(prev => new Set(prev).add(extensionId));
        setError(null);

        try {
            const result = await window.electronAPI.extensions.uninstall(extensionId);
            if (result.success) {
                await loadExtensions();
                setAvailableExtensions(prev =>
                    prev.map(e => e.id === extensionId ? { ...e, installed: false } : e)
                );
            } else {
                setError(result.error || 'Uninstallation failed');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Uninstallation failed');
        } finally {
            setUninstallingIds(prev => {
                const next = new Set(prev);
                next.delete(extensionId);
                return next;
            });
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleBrowseRepo();
        }
    };

    const getIconUrl = (iconPath?: string) => {
        if (!iconPath) return null;
        if (iconPath.startsWith('http')) return iconPath;
        // Convert Windows path to file URL format for the proxy
        const normalizedPath = iconPath.replace(/\\/g, '/');
        const fileUrl = `file:///${normalizedPath}`;
        return `manga-image://?url=${encodeURIComponent(fileUrl)}&ext=local`;
    };

    // Filter extensions based on search query
    const filteredAvailable = availableExtensions.filter(ext =>
        ext.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ext.id.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredInstalled = extensions.filter(ext =>
        ext.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ext.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ext.baseUrl?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="extensions-page">
            {/* Compact Header */}
            <div className="extensions-header">
                <div className="header-info">
                    <h1 className="page-title">Extensions</h1>
                    <p className="page-subtitle">Manage your manga sources</p>
                </div>
                <div className="stats-pills">
                    <div className="stat-pill">
                        <span className="stat-value">{extensions.length}</span>
                        <span className="stat-label">installed</span>
                    </div>
                    <div className="stat-pill">
                        <span className="stat-value">{extensions.filter(e => isExtensionEnabled(e.id)).length}</span>
                        <span className="stat-label">active</span>
                    </div>
                </div>
            </div>

            {/* Search Bar */}
            <div className="search-bar">
                <Icons.Search width={16} height={16} className="search-icon" />
                <input
                    type="text"
                    className="search-input"
                    placeholder="Search extensions..."
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
            </div>

            {/* Install from GitHub Section */}
            <div className="install-section">
                <h2 className="section-title">
                    <span className="icon-wrapper"><Icons.GitHub width={14} height={14} /></span>
                    Install from Repository
                </h2>

                <div className="repo-input-group">
                    <input
                        type="text"
                        className="repo-input"
                        placeholder="Enter GitHub repository URL (e.g., github.com/username/extensions)"
                        value={repoUrl}
                        onChange={(e) => setRepoUrl(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                    <button
                        className="browse-btn"
                        onClick={handleBrowseRepo}
                        disabled={isLoading || !repoUrl.trim()}
                    >
                        {isLoading ? (
                            <Icons.Refresh className="animate-spin" width={16} height={16} />
                        ) : (
                            <>
                                <Icons.Search width={16} height={16} />
                                Browse
                            </>
                        )}
                    </button>
                    {developerMode && (
                        <div className="sideload-dropdown" style={{ position: 'relative' }}>
                            <button
                                className="browse-btn sideload"
                                onClick={() => setShowSideloadMenu(!showSideloadMenu)}
                                title="Sideload extensions (Developer Mode)"
                            >
                                <Icons.Tools width={16} height={16} />
                                Sideload
                                <Icons.ChevronDown width={14} height={14} style={{ marginLeft: 4 }} />
                            </button>
                            {showSideloadMenu && (
                                <div className="sideload-menu" style={{
                                    position: 'absolute',
                                    top: '100%',
                                    right: 0,
                                    marginTop: 4,
                                    background: 'var(--bg-secondary)',
                                    borderRadius: 8,
                                    border: '1px solid var(--border-color)',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                                    zIndex: 100,
                                    minWidth: 200,
                                    overflow: 'hidden'
                                }}>
                                    <button
                                        className="sideload-option"
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            width: '100%',
                                            padding: '10px 14px',
                                            background: 'transparent',
                                            border: 'none',
                                            color: 'var(--text-primary)',
                                            cursor: 'pointer',
                                            fontSize: 14
                                        }}
                                        onClick={async () => {
                                            setShowSideloadMenu(false);
                                            setIsLoading(true);
                                            setError(null);
                                            try {
                                                const result = await window.electronAPI.extensions.sideload();
                                                if (result.success) {
                                                    await loadExtensions();
                                                    setSuccessMessage('Extension installed successfully!');
                                                    setTimeout(() => setSuccessMessage(null), 3000);
                                                } else if (result.error !== 'Installation cancelled') {
                                                    setError(result.error || 'Sideload failed');
                                                }
                                            } catch (err) {
                                                setError(err instanceof Error ? err.message : 'Sideload failed');
                                            } finally {
                                                setIsLoading(false);
                                            }
                                        }}
                                    >
                                        <Icons.Package width={16} height={16} />
                                        Single Extension
                                    </button>
                                    <button
                                        className="sideload-option"
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            width: '100%',
                                            padding: '10px 14px',
                                            background: 'transparent',
                                            border: 'none',
                                            color: 'var(--text-primary)',
                                            cursor: 'pointer',
                                            fontSize: 14,
                                            borderTop: '1px solid var(--border-color)'
                                        }}
                                        onClick={async () => {
                                            setShowSideloadMenu(false);
                                            setIsLoading(true);
                                            setError(null);
                                            try {
                                                const result = await window.electronAPI.extensions.sideloadBulk();
                                                if (result.success) {
                                                    await loadExtensions();
                                                    setSuccessMessage(`Installed ${result.installed} extension(s)${result.failed > 0 ? `, ${result.failed} failed` : ''}`);
                                                    setTimeout(() => setSuccessMessage(null), 5000);
                                                } else if (result.error !== 'Cancelled') {
                                                    setError(result.error || 'Bulk sideload failed');
                                                }
                                            } catch (err) {
                                                setError(err instanceof Error ? err.message : 'Bulk sideload failed');
                                            } finally {
                                                setIsLoading(false);
                                            }
                                        }}
                                    >
                                        <Icons.Library width={16} height={16} />
                                        Scan Folder
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {error && (
                    <div className="error-message">
                        <Icons.AlertTriangle width={18} height={18} style={{ marginRight: '8px' }} />
                        {error}
                    </div>
                )}

                {/* Available Extensions from Repo */}
                {filteredAvailable.length > 0 && (
                    <div className="available-extensions">
                        <div
                            className="collapsible-header"
                            onClick={() => setIsAvailableCollapsed(!isAvailableCollapsed)}
                        >
                            <div className="header-content">
                                <span className={`collapse-icon ${isAvailableCollapsed ? 'collapsed' : ''}`}>
                                    <Icons.ChevronDown width={16} height={16} />
                                </span>
                                <h3 className="subsection-title">
                                    Available Extensions
                                </h3>
                                <span className="section-badge">{filteredAvailable.length}</span>
                            </div>
                            <div className="section-actions">
                                <button
                                    className="refresh-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleRefresh();
                                    }}
                                    disabled={isLoading}
                                    title="Refresh available extensions"
                                >
                                    <Icons.Refresh
                                        width={14}
                                        height={14}
                                        className={isLoading ? 'animate-spin' : ''}
                                    />
                                    Refresh
                                </button>
                            </div>
                        </div>

                        {!isAvailableCollapsed && (
                            <div className="extensions-grid">
                                {filteredAvailable.map(ext => (
                                    <div key={ext.id} className="available-ext-card">
                                        <div className="available-ext-icon">
                                            {ext.icon ? (
                                                <img
                                                    src={getIconUrl(ext.icon) || ''}
                                                    alt={ext.name}
                                                    className="ext-icon-img"
                                                />
                                            ) : (
                                                <Icons.Book
                                                    width={24}
                                                    height={24}
                                                    opacity={0.5}
                                                    className="fallback-icon-svg"
                                                />
                                            )}
                                        </div>
                                        <div className="available-ext-info">
                                            <div className="available-ext-name">
                                                {ext.name}
                                                {ext.nsfw && <span className="extension-nsfw-badge">18+</span>}
                                            </div>
                                            <div className="available-ext-meta">
                                                v{ext.version} • {(ext.language || 'unknown').toUpperCase()}
                                            </div>
                                        </div>
                                        <button
                                            className={`install-btn ${extensions.some(e => e.id === ext.id)
                                                ? isUpdateAvailable(extensions.find(e => e.id === ext.id)?.version || 0, ext.version)
                                                    ? 'update'
                                                    : 'installed'
                                                : ''
                                                }`}
                                            onClick={() => {
                                                const installedExt = extensions.find(e => e.id === ext.id);
                                                if (installedExt) {
                                                    if (isUpdateAvailable(installedExt.version, ext.version)) {
                                                        handleInstall(ext);
                                                    } else {
                                                        handleUninstall(ext.id);
                                                    }
                                                } else {
                                                    handleInstall(ext);
                                                }
                                            }}
                                            disabled={installingIds.has(ext.id) || uninstallingIds.has(ext.id)}
                                        >
                                            {installingIds.has(ext.id) ? (
                                                <Icons.Refresh width={14} height={14} className="animate-spin" />
                                            ) : uninstallingIds.has(ext.id) ? (
                                                <Icons.Refresh width={14} height={14} className="animate-spin" />
                                            ) : extensions.some(e => e.id === ext.id) ? (
                                                isUpdateAvailable(extensions.find(e => e.id === ext.id)?.version || 0, ext.version) ? (
                                                    <>
                                                        <Icons.Download width={14} height={14} /> Update
                                                    </>
                                                ) : (
                                                    <>
                                                        <Icons.Check width={14} height={14} /> Installed
                                                    </>
                                                )
                                            ) : (
                                                <>
                                                    <Icons.Plus width={14} height={14} /> Install
                                                </>
                                            )}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Installed Extensions Section */}
            <div className="installed-section">
                <h2 className="section-title">
                    <span className="icon-wrapper"><Icons.Library /></span> Installed Extensions
                </h2>

                {filteredInstalled.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">
                            <Icons.Plug width={40} height={40} />
                        </div>
                        <h2 className="empty-state-title">
                            {searchQuery ? 'No matching extensions' : 'No extensions installed'}
                        </h2>
                        <p className="empty-state-description">
                            {searchQuery
                                ? 'Try a different search term'
                                : 'Browse available extensions above to get started with your favorite manga sources'
                            }
                        </p>
                    </div>
                ) : (
                    <div className="extensions-list">
                        {filteredInstalled.map(ext => (
                            <div key={ext.id} className={`extension-card ${!isExtensionEnabled(ext.id) ? 'disabled' : ''}`}>
                                <div className="extension-icon-large">
                                    {ext.icon ? (
                                        <img
                                            src={getIconUrl(ext.icon) || ''}
                                            alt={ext.name}
                                            className="ext-icon-img"
                                        />
                                    ) : (
                                        <Icons.Book className="fallback-icon-svg" width={28} height={28} opacity={0.5} />
                                    )}
                                </div>
                                <div className="extension-details">
                                    <h3 className="extension-title">
                                        {ext.name}
                                        {ext.nsfw && <span className="extension-nsfw-badge">18+</span>}
                                    </h3>
                                    <p className="extension-meta">
                                        v{ext.version} • {(ext.language || 'unknown').toUpperCase()} • {ext.baseUrl}
                                    </p>
                                </div>
                                <div className="extension-actions">
                                    <button
                                        className="uninstall-btn"
                                        onClick={() => handleUninstall(ext.id)}
                                        disabled={uninstallingIds.has(ext.id)}
                                        title="Uninstall extension"
                                    >
                                        {uninstallingIds.has(ext.id) ? <Icons.Refresh className="animate-spin" /> : <Icons.Trash />}
                                    </button>
                                    <label className="toggle">
                                        <input
                                            type="checkbox"
                                            checked={isExtensionEnabled(ext.id)}
                                            onChange={() => toggleExtension(ext.id)}
                                        />
                                        <span className="toggle-slider"></span>
                                    </label>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default Extensions;
