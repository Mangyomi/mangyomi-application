import { useMatch, useNavigate, useLocation } from 'react-router-dom';
import { useAppStore } from '../../../stores/appStore';

import { Icons } from '../../Icons';
import './TitleBar.css';
import { useState } from 'react';

function TitleBar() {
    const minimize = () => window.electronAPI.window.minimize();
    const maximize = () => window.electronAPI.window.maximize();
    const close = () => window.electronAPI.window.close();
    const navigate = useNavigate();
    const location = useLocation();

    // Determine if we can go back. 
    // Simplified check: if not root pages. 
    const isRoot = ['/', '/browse', '/extensions', '/history', '/settings', '/tags', '/stats'].includes(location.pathname);
    const isReader = location.pathname.startsWith('/read');
    const canGoBack = !isRoot && !isReader;

    const match = useMatch('/manga/:extensionId/:mangaId');
    const { loadMangaDetails, loadChapters } = useAppStore();
    const [refreshing, setRefreshing] = useState(false);

    const showRefresh = !!match;

    const handleRefresh = async () => {
        if (!match || refreshing) return;
        const { extensionId, mangaId } = match.params;
        if (!extensionId || !mangaId) return;

        setRefreshing(true);
        try {
            const decodedId = decodeURIComponent(mangaId);
            await Promise.all([
                loadMangaDetails(extensionId, decodedId),
                loadChapters(extensionId, decodedId),
            ]);
        } catch (e) {
            console.error('Failed to refresh from titlebar', e);
        } finally {
            setRefreshing(false);
        }
    };

    // Hide title bar in reader - manga uses full screen by default
    if (isReader) {
        return null;
    }

    return (
        <div className="titlebar">
            <div className="titlebar-drag-region">
                <div className="titlebar-left-controls">
                    {canGoBack && (
                        <button
                            className="titlebar-back-btn"
                            onClick={() => navigate(-1)}
                            title="Go Back"
                        >
                            <Icons.ArrowLeft width={14} height={14} />
                        </button>
                    )}
                </div>
            </div>
            <div className="window-controls">
                {showRefresh && (
                    <button
                        className={`control-btn refresh ${refreshing ? 'spinning' : ''}`}
                        onClick={handleRefresh}
                        title="Force Refresh Data"
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={refreshing ? { animation: 'spin 1s linear infinite' } : {}}>
                            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                        </svg>
                    </button>
                )}
                <button className="control-btn minimize" onClick={minimize} title="Minimize">
                    <svg width="10" height="1" viewBox="0 0 10 1">
                        <path d="M0 0h10v1H0z" fill="currentColor" />
                    </svg>
                </button>
                <button className="control-btn maximize" onClick={maximize} title="Maximize">
                    <svg width="10" height="10" viewBox="0 0 10 10">
                        <path d="M1 1h8v8H1V1zm1 1v6h6V2H2z" fill="currentColor" />
                    </svg>
                </button>
                <button className="control-btn close" onClick={close} title="Close">
                    <svg width="10" height="10" viewBox="0 0 10 10">
                        <path d="M0 0l10 10m0-10L0 10" stroke="currentColor" strokeWidth="1.2" />
                    </svg>
                </button>
            </div>
        </div>
    );
}

export default TitleBar;

