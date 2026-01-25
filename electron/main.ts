import { app, BrowserWindow, ipcMain, webContents } from 'electron';
import path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { initDatabase, getDatabase } from './database';
import { loadExtensions } from './extensions/loader';
import { connect as connectDiscord, disconnect as disconnectDiscord } from './discord';
import { destroyAllSandboxes } from './extensions/sandbox/sandboxRunner';
import { getSetting, setSetting } from './store';

// GPU failure auto-recovery system
const gpuFlagPath = path.join(app.getPath('userData'), 'gpu-disabled.flag');
let gpuDisabledMode = false;

// Check if we should run with GPU disabled (set by previous GPU crash)
if (fs.existsSync(gpuFlagPath)) {
    gpuDisabledMode = true;
    app.commandLine.appendSwitch('disable-gpu');
    app.commandLine.appendSwitch('disable-software-rasterizer');
    console.log('[GPU] Running in GPU-disabled mode due to previous GPU failure');
}

// Disable unused Electron features to reduce process overhead
app.commandLine.appendSwitch('disable-features', 'AudioServiceOutOfProcess,WebRtcHideLocalIpsWithMdns');
app.commandLine.appendSwitch('disable-audio');
app.commandLine.appendSwitch('disable-speech-synthesis-api');
app.commandLine.appendSwitch('disable-webrtc');
// Reduce idle memory usage
app.commandLine.appendSwitch('js-flags', '--lite-mode');

// Track GPU crashes to trigger recovery
let gpuCrashCount = 0;
const GPU_CRASH_THRESHOLD = 3; // Relaunch after 3 GPU crashes

// Handle GPU process crashes (child-process-gone is the modern event)
app.on('child-process-gone', (_event, details) => {
    if (details.type === 'GPU' && details.reason !== 'clean-exit') {
        gpuCrashCount++;
        console.error(`[GPU] GPU process crashed (reason: ${details.reason}, count: ${gpuCrashCount})`);

        if (gpuCrashCount >= GPU_CRASH_THRESHOLD && !gpuDisabledMode) {
            console.log('[GPU] Threshold reached, setting GPU-disabled flag and relaunching...');
            fs.writeFileSync(gpuFlagPath, new Date().toISOString());
            app.relaunch();
            app.exit(0);
        }
    }
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// File association handling (.mgb files)
let pendingFilePath: string | null = null;

function handleFileOpen(filePath: string) {
    if (filePath && filePath.endsWith('.mgb') && fs.existsSync(filePath)) {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('file-opened', filePath);
        } else {
            pendingFilePath = filePath;
        }
    }
}

function checkArgsForFile(args: string[]) {
    for (const arg of args) {
        if (arg.endsWith('.mgb') && !arg.startsWith('--')) {
            handleFileOpen(arg);
            break;
        }
    }
}

// Handle second instance (Windows: app already running, user opens another .mgb file)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (_, commandLine) => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
        checkArgsForFile(commandLine);
    });
}

// Logging setup - captures console output for dump logs
import { setupLogging, getFormattedMainLogs } from './logging';
setupLogging();

import * as memoryMonitor from './memoryMonitor';

// Image proxy and network capture
import { setupImageProxy, getFormattedMainNetwork } from './imageProxy';

let mainWindow: BrowserWindow | null = null;
export { mainWindow };

function createWindow() {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8'));
    const isNightly = pkg.version.includes('nightly');
    const iconName = isNightly ? 'icon-nightly.png' : 'icon.png';
    const iconPath = path.join(__dirname, '../build', iconName);

    // Load saved window bounds from store
    const savedBounds = getSetting('windowBounds');

    // Default bounds
    let windowBounds = {
        width: 1400,
        height: 900,
        x: undefined as number | undefined,
        y: undefined as number | undefined,
    };

    // Apply saved bounds if available and valid
    if (savedBounds) {
        windowBounds.width = savedBounds.width;
        windowBounds.height = savedBounds.height;
        windowBounds.x = savedBounds.x;
        windowBounds.y = savedBounds.y;
    }

    mainWindow = new BrowserWindow({
        ...windowBounds,
        minWidth: 1000,
        minHeight: 700,
        icon: iconPath,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: true,
            webviewTag: true,
        },
        titleBarStyle: 'hidden',
        frame: false,
        backgroundColor: '#0f0f0f',
        show: false,
    });

    // Restore maximized state if it was maximized when closed
    if (savedBounds?.isMaximized) {
        mainWindow.maximize();
    }

    // Debounced function to save window bounds
    let saveBoundsTimeout: NodeJS.Timeout | null = null;
    const saveWindowBounds = () => {
        if (saveBoundsTimeout) clearTimeout(saveBoundsTimeout);
        saveBoundsTimeout = setTimeout(() => {
            if (!mainWindow || mainWindow.isDestroyed()) return;

            const bounds = mainWindow.getBounds();
            const isMaximized = mainWindow.isMaximized();

            setSetting('windowBounds', {
                x: bounds.x,
                y: bounds.y,
                width: bounds.width,
                height: bounds.height,
                isMaximized,
            });
        }, 500); // Debounce for 500ms
    };

    // Listen to window events and save bounds
    mainWindow.on('resize', saveWindowBounds);
    mainWindow.on('move', saveWindowBounds);
    mainWindow.on('maximize', saveWindowBounds);
    mainWindow.on('unmaximize', saveWindowBounds);

    // Window control handlers
    ipcMain.handle('window:minimize', () => mainWindow?.minimize());
    ipcMain.handle('window:maximize', () => {
        if (mainWindow?.isMaximized()) mainWindow?.unmaximize();
        else mainWindow?.maximize();
    });
    ipcMain.handle('window:close', () => mainWindow?.close());

    // Fullscreen controls for reader
    ipcMain.handle('window:toggleFullscreen', () => {
        if (!mainWindow) return false;
        const isFullscreen = mainWindow.isFullScreen();
        mainWindow.setFullScreen(!isFullscreen);
        return !isFullscreen;
    });

    ipcMain.handle('window:isFullscreen', () => {
        return mainWindow?.isFullScreen() ?? false;
    });

    ipcMain.handle('window:setFullscreen', (_, fullscreen: boolean) => {
        mainWindow?.setFullScreen(fullscreen);
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });

    ipcMain.handle('app:openExternal', async (_, url: string) => {
        if (!url.startsWith('https://') && !url.startsWith('http://')) {
            throw new Error('Invalid URL protocol: only http and https are allowed');
        }
        const { shell } = require('electron');
        await shell.openExternal(url);
    });

    ipcMain.handle('app:openInAppBrowser', async (_, url: string) => {
        const win = new BrowserWindow({
            width: 1200,
            height: 800,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                session: mainWindow?.webContents.session
            },
            autoHideMenuBar: true,
            title: 'Manga Browser'
        });
        win.loadURL(url);
    });

    // Cloudflare challenge solver
    ipcMain.handle('app:solveCloudflare', async (_, url: string) => {
        return new Promise((resolve) => {
            const win = new BrowserWindow({
                width: 600,
                height: 700,
                parent: mainWindow || undefined,
                modal: true,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    session: mainWindow?.webContents.session
                },
                autoHideMenuBar: true,
                title: 'Solve Cloudflare Challenge'
            });

            let resolved = false;
            let checkInterval: NodeJS.Timeout;

            const cleanup = () => {
                if (checkInterval) clearInterval(checkInterval);
                if (!win.isDestroyed()) win.close();
            };

            checkInterval = setInterval(async () => {
                if (win.isDestroyed()) {
                    clearInterval(checkInterval);
                    if (!resolved) {
                        resolved = true;
                        resolve({ success: false, message: 'Window closed' });
                    }
                    return;
                }

                try {
                    const pageUrl = win.webContents.getURL();
                    const title = win.webContents.getTitle();

                    if (!title.includes('Just a moment') && !pageUrl.includes('challenge')) {
                        const cookies = await win.webContents.session.cookies.get({ url });
                        const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');

                        if (!resolved) {
                            resolved = true;
                            cleanup();
                            resolve({
                                success: true,
                                cookies: cookieString,
                                cookieList: cookies.map(c => ({ name: c.name, value: c.value }))
                            });
                        }
                    }
                } catch (e) {
                    console.error('[CloudflareSolver] Error:', e);
                }
            }, 1000);

            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    cleanup();
                    resolve({ success: false, message: 'Timeout' });
                }
            }, 120000);

            win.on('closed', () => {
                if (!resolved) {
                    resolved = true;
                    if (checkInterval) clearInterval(checkInterval);
                    resolve({ success: false, message: 'Window closed by user' });
                }
            });

            win.loadURL(url);
        });
    });

    mainWindow.once('ready-to-show', () => mainWindow?.show());

    if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    mainWindow.on('closed', () => { mainWindow = null; });

    // Keyboard shortcuts
    mainWindow.webContents.on('before-input-event', (event, input) => {
        const isDev = process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL;

        if (!isDev) {
            if (input.key === 'F12' ||
                (input.control && input.shift && input.key === 'I') ||
                (input.control && input.shift && input.key === 'J') ||
                (input.control && input.shift && input.key === 'C')) {
                event.preventDefault();
                return;
            }
        }

        if (input.control && input.type === 'keyDown') {
            if (input.key === '=' || input.key === '+') {
                const currentZoom = mainWindow?.webContents.getZoomFactor() || 1;
                mainWindow?.webContents.setZoomFactor(currentZoom + 0.1);
                event.preventDefault();
            } else if (input.key === '-') {
                const currentZoom = mainWindow?.webContents.getZoomFactor() || 1;
                mainWindow?.webContents.setZoomFactor(Math.max(0.1, currentZoom - 0.1));
                event.preventDefault();
            } else if (input.key === '0') {
                mainWindow?.webContents.setZoomFactor(1);
                event.preventDefault();
            }
        }
    });
}


/**
 * Setup all IPC handlers using modular handler files.
 * This replaces the previous 1127-line inline implementation.
 */
async function setupIpcHandlers(extensionsPath: string) {
    const { setupDatabaseHandlers } = await import('./ipc/database');
    const { setupExtensionHandlers } = await import('./ipc/extensions');
    const { setupCacheHandlers } = await import('./ipc/cache');
    const { setupAnilistHandlers } = await import('./ipc/anilist');
    const { setupSettingsHandlers } = await import('./ipc/settings');
    const { setupAppHandlers } = await import('./ipc/app');
    const { setupDiscordHandlers } = await import('./ipc/discord');
    const { setupNetworkHandlers } = await import('./ipc/network');

    // Database handlers (manga, chapters, history, tags, backup/restore)
    setupDatabaseHandlers({
        mainWindow: mainWindow!,
        getFormattedMainLogs,
        getFormattedMainNetwork,
    });

    // Extension handlers (browsing, manga details, chapter pages, install/uninstall)
    setupExtensionHandlers(extensionsPath);

    // Cache handlers (image caching)
    setupCacheHandlers();

    // AniList handlers (sync, tracking)
    setupAnilistHandlers(mainWindow!);

    // Settings handlers
    await setupSettingsHandlers();

    // App handlers (memory, updates, version)
    setupAppHandlers(mainWindow!);

    // Discord RPC handlers
    setupDiscordHandlers();

    // Network handlers (proxy validation)
    setupNetworkHandlers();

    // Export handlers (library export as PNG)
    const { registerExportHandlers } = await import('./ipc/export');
    registerExportHandlers();

    console.log('[Main] All IPC handlers registered via modules');
}

// ============================================================
// App Lifecycle
// ============================================================

app.whenReady().then(async () => {
    // Initialize Discord RPC
    connectDiscord().catch(console.error);

    const dbPath = path.join(app.getPath('userData'), 'mangyomi.db');
    await initDatabase(dbPath);

    const extensionsPath = path.join(app.getPath('userData'), 'extensions');
    await loadExtensions(extensionsPath);

    setupImageProxy();
    await setupIpcHandlers(extensionsPath);

    createWindow();

    // Check startup arguments for .mgb file
    checkArgsForFile(process.argv);

    // Handle pending file (opened before app was ready)
    if (pendingFilePath && mainWindow) {
        setTimeout(() => {
            if (pendingFilePath) {
                mainWindow?.webContents.send('file-opened', pendingFilePath);
                pendingFilePath = null;
            }
        }, 1000);
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });

    app.on('open-file', (event, filePath) => {
        event.preventDefault();
        handleFileOpen(filePath);
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        // Cleanup
        disconnectDiscord().catch(() => { });

        try { memoryMonitor.stopMonitoring(); } catch (e) { }
        try { destroyAllSandboxes(); } catch (e) { }
        try {
            const db = getDatabase();
            if (db) db.close();
        } catch (e) { }

        try {
            webContents.getAllWebContents().forEach(wc => {
                try {
                    if (!wc.isDestroyed()) wc.close();
                } catch (e) { }
            });
        } catch (e) { }

        BrowserWindow.getAllWindows().forEach(win => {
            try {
                if (!win.isDestroyed()) win.destroy();
            } catch (e) { }
        });

        app.exit(0);
    }
});
