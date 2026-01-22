import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import './App.css';

type Screen = 'install' | 'progress' | 'complete';

interface ProgressPayload {
    status: string;
    percent: number;
}

function App() {
    const [screen, setScreen] = useState<Screen>('install');
    const [installPath, setInstallPath] = useState('');
    const [progress, setProgress] = useState({ status: '', percent: 0 });
    const [exePath, setExePath] = useState('');
    const [launchOnClose, setLaunchOnClose] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        // Get default install path
        invoke<string>('get_default_path').then(setInstallPath).catch(console.error);

        // Listen for progress updates
        const unlisten = listen<ProgressPayload>('install-progress', (event) => {
            setProgress(event.payload);
            if (event.payload.percent >= 100) {
                setTimeout(() => setScreen('complete'), 500);
            }
        });

        return () => {
            unlisten.then(f => f());
        };
    }, []);

    const handleBrowse = async () => {
        const selected = await open({
            directory: true,
            multiple: false,
        });
        if (selected) {
            setInstallPath(selected as string + '\\Mangyomi');
        }
    };

    const handleInstall = async () => {
        setScreen('progress');
        setError('');
        try {
            await invoke('install_app', { installPath });
            setExePath(`${installPath}\\Mangyomi.exe`); // Assuming standard path
        } catch (err) {
            setError(String(err) || 'Installation failed');
            setScreen('install');
        }
    };

    const handleFinish = async () => {
        if (launchOnClose && exePath) {
            try {
                await invoke('launch_app', { exePath });
            } catch (e) {
                console.error(e);
            }
        }
        await getCurrentWindow().close();
    };

    return (
        <div className="installer">
            {/* Title Bar */}
            <div className="title-bar" data-tauri-drag-region>
                <div className="title-bar-drag" data-tauri-drag-region>
                    <span className="title">Mangyomi Setup</span>
                </div>
                <div className="title-bar-buttons">
                    <button className="title-btn minimize" onClick={() => getCurrentWindow().minimize()}>
                        <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 6h8" stroke="currentColor" strokeWidth="1.5" /></svg>
                    </button>
                    <button className="title-btn close" onClick={() => getCurrentWindow().close()}>
                        <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" /></svg>
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="content">
                {screen === 'install' && (
                    <div className="screen install-screen">
                        <div className="logo-section">
                            <div className="logo">
                                <img src="/icon.png" alt="Mangyomi" width="64" height="64" />
                            </div>
                            <h1>Welcome to Mangyomi</h1>
                            <p>A beautiful manga reader for your desktop</p>
                        </div>

                        <div className="install-options">
                            <label className="input-label">Install Location</label>
                            <div className="path-input">
                                <input
                                    type="text"
                                    value={installPath}
                                    onChange={(e) => setInstallPath(e.target.value)}
                                    readOnly
                                />
                                <button className="browse-btn" onClick={handleBrowse}>Browse</button>
                            </div>
                        </div>

                        {error && <div className="error-message">{error}</div>}

                        <button className="install-btn" onClick={handleInstall}>
                            <span>Install</span>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M5 12h14M12 5l7 7-7 7" />
                            </svg>
                        </button>
                    </div>
                )}

                {screen === 'progress' && (
                    <div className="screen progress-screen">
                        <div className="progress-content">
                            <div className="spinner">
                                <div className="spinner-ring"></div>
                            </div>
                            <h2>Installing Mangyomi</h2>
                            <p className="status-text">{progress.status || 'Preparing installation...'}</p>
                            <div className="progress-bar">
                                <div
                                    className="progress-fill"
                                    style={{ width: `${progress.percent}%` }}
                                />
                            </div>
                            <span className="progress-percent">{progress.percent}%</span>
                        </div>
                    </div>
                )}

                {screen === 'complete' && (
                    <div className="screen complete-screen">
                        <div className="success-icon">
                            <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
                                <circle cx="40" cy="40" r="38" stroke="url(#successGradient)" strokeWidth="4" />
                                <path d="M24 40l10 10 22-22" stroke="#10b981" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="checkmark" />
                                <defs>
                                    <linearGradient id="successGradient" x1="0" y1="0" x2="80" y2="80">
                                        <stop offset="0%" stopColor="#10b981" />
                                        <stop offset="100%" stopColor="#34d399" />
                                    </linearGradient>
                                </defs>
                            </svg>
                        </div>
                        <h2>Installation Complete!</h2>
                        <p>Mangyomi has been installed successfully.</p>

                        <label className="launch-checkbox">
                            <input
                                type="checkbox"
                                checked={launchOnClose}
                                onChange={(e) => setLaunchOnClose(e.target.checked)}
                            />
                            <span className="checkmark-box"></span>
                            <span>Launch Mangyomi</span>
                        </label>

                        <button className="finish-btn" onClick={handleFinish}>
                            Finish
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default App;
