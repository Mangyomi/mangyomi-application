import { useEffect, lazy, Suspense } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { useAppStore } from './stores/appStore';
import { useExtensionStore } from './features/extensions/stores/extensionStore';
import { useLibraryStore } from './features/library/stores/libraryStore';
import { useSettingsStore } from './features/settings/stores/settingsStore';
import { useAniListStore } from './stores/anilistStore';
import { useSourceBehaviorStore } from './stores/sourceBehaviorStore';
import { useTagStore } from './features/tags/stores/tagStore';
import { useUpdateStore } from './stores/updateStore';
import Sidebar from './components/Layout/Sidebar/Sidebar';
import CaptchaModal from './components/CaptchaModal';
import { DialogProvider } from './components/ConfirmModal/DialogContext';
import MangaDetail from './pages/MangaDetail/MangaDetail';
import TitleBar from './components/Layout/TitleBar/TitleBar';
import PrefetchOverlay from './components/PrefetchOverlay/PrefetchOverlay';
import { UpdateNotificationModal } from './components/UpdateNotificationModal/UpdateNotificationModal';
import './App.css';

// Lazy Load Reader
const ReaderPage = lazy(() => import('./features/reader/components/ReaderPage'));
const Browse = lazy(() => import('./features/browse/components/Browse'));
const History = lazy(() => import('./features/history/components/History'));
const Downloads = lazy(() => import('./features/downloads/components/Downloads'));
const Tags = lazy(() => import('./features/tags/components/Tags'));
const Extensions = lazy(() => import('./features/extensions/components/Extensions'));
const Library = lazy(() => import('./features/library/components/Library'));
const Settings = lazy(() => import('./features/settings/components/Settings'));
const Stats = lazy(() => import('./features/stats/components/Stats'));

function App() {
    const { loadExtensions } = useExtensionStore();
    const { loadLibrary } = useLibraryStore();
    const { loadTags } = useTagStore();
    const {
        captchaUrl,
        captchaCallback,
        hideCaptcha,
    } = useAppStore();

    const { loadSettings, betaUpdates } = useSettingsStore();
    const { loadFromStorage: loadAniListFromStorage } = useAniListStore();
    const { showNotification, dismissNotification, checkForUpdates } = useUpdateStore();

    useEffect(() => {
        // Initialize app data
        loadSettings();
        loadAniListFromStorage();
        loadExtensions();
        loadLibrary();
        loadTags();
        // Load adaptive prefetch training data
        useSourceBehaviorStore.getState().initialize();
    }, []);

    // Check for updates on startup (after settings are loaded)
    useEffect(() => {
        const checkUpdates = async () => {
            // Small delay to ensure settings are loaded
            await new Promise(resolve => setTimeout(resolve, 2000));
            // Get fresh value from store (not stale closure)
            const currentBetaUpdates = useSettingsStore.getState().betaUpdates;
            checkForUpdates(currentBetaUpdates);
        };
        checkUpdates();
    }, []);

    // Handle .mgb file opened via file association
    useEffect(() => {
        const unsubscribe = window.electronAPI.app.onFileOpened(async (_, filePath) => {
            console.log('File opened via association:', filePath);
            // Import the store dynamically to avoid circular deps
            const { usePendingImportStore } = await import('./stores/pendingImportStore');
            usePendingImportStore.getState().setPendingFilePath(filePath);
            // Navigate to settings page - the Settings component will handle opening the modal
            window.location.hash = '#/settings';
        });
        return unsubscribe;
    }, []);

    const handleCaptchaSolved = () => {
        const callback = captchaCallback;
        hideCaptcha();

        if (callback) {
            setTimeout(callback, 500);
        }
    };

    // Determine if in reader mode (no title bar)
    const location = useLocation();
    const isReaderRoute = location.pathname.startsWith('/read');

    return (
        <DialogProvider>
            <div className="app">
                <TitleBar />
                <div className="app-content" style={{ marginTop: isReaderRoute ? 0 : 32, height: isReaderRoute ? '100vh' : 'calc(100vh - 32px)' }}>
                    <Sidebar />
                    <main className="main-content">
                        <Suspense fallback={
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                                <div className="spinner"></div>
                            </div>
                        }>
                            <Routes>
                                <Route path="/" element={<Library />} />
                                <Route path="/browse" element={<Browse />} />
                                <Route path="/history" element={<History />} />
                                <Route path="/downloads" element={<Downloads />} />
                                <Route path="/tags" element={<Tags />} />
                                <Route path="/stats" element={<Stats />} />
                                <Route path="/extensions" element={<Extensions />} />
                                <Route path="/settings" element={<Settings />} />
                                <Route path="/manga/:extensionId/:mangaId" element={<MangaDetail />} />
                                <Route path="/read/:extensionId/*" element={<ReaderPage />} />
                            </Routes>
                        </Suspense>
                    </main>
                </div>

                {/* Global Prefetch Overlay */}
                <PrefetchOverlay />

                {/* Update Notification Modal */}
                {showNotification && (
                    <UpdateNotificationModal onClose={dismissNotification} />
                )}

                {/* Global Captcha Modal */}
                {captchaUrl && (
                    <CaptchaModal
                        url={captchaUrl}
                        onSolved={handleCaptchaSolved}
                        onClose={hideCaptcha}
                    />
                )}
            </div>
        </DialogProvider>
    );
}

export default App;
