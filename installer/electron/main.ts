import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;

// Check for silent mode
const args = process.argv.slice(1);
const isSilent = args.includes('--silent');
const installPathArg = args.indexOf('--install-path');
let silentInstallPath = installPathArg !== -1 ? args[installPathArg + 1] : null;

async function performSilentInstall() {
    const installPath = silentInstallPath || path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Mangyomi');

    console.log('Silent install to:', installPath);

    try {
        // Create install directory
        if (!fs.existsSync(installPath)) {
            fs.mkdirSync(installPath, { recursive: true });
        }

        // Get and extract the app archive
        const resourcesPath = process.resourcesPath || path.join(__dirname, '..');
        let archivePath = path.join(resourcesPath, 'resources', 'app.7z');
        let useZip = false;

        if (!fs.existsSync(archivePath)) {
            archivePath = path.join(resourcesPath, 'resources', 'app.zip');
            useZip = true;
        }

        if (!fs.existsSync(archivePath)) {
            console.error('No app archive found');
            app.quit();
            return;
        }

        // Extract
        if (useZip) {
            const { exec } = await import('child_process');
            const { promisify } = await import('util');
            const execAsync = promisify(exec);
            await execAsync(`powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${installPath}' -Force"`);
        } else {
            const Seven = (await import('node-7z')).default;
            const sevenBin = await import('7zip-bin');
            await new Promise<void>((resolve, reject) => {
                const stream = Seven.extractFull(archivePath, installPath, { $bin: sevenBin.path7za });
                stream.on('end', () => resolve());
                stream.on('error', (err: Error) => reject(err));
            });
        }

        console.log('Silent install complete');
        app.quit();
    } catch (error) {
        console.error('Silent install failed:', error);
        app.quit();
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 600,
        height: 450,
        resizable: false,
        maximizable: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        titleBarStyle: 'hidden',
        frame: false,
        backgroundColor: '#0f0f0f',
        show: false,
    });

    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
    });

    // Disable DevTools in production
    if (!(process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL)) {
        mainWindow.webContents.on('before-input-event', (event, input) => {
            // Block Ctrl+Shift+I, F12
            if ((input.control && input.shift && input.key.toLowerCase() === 'i') || input.key === 'F12') {
                event.preventDefault();
            }
        });
    }

    if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// IPC Handlers
ipcMain.handle('installer:getDefaultPath', () => {
    return path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Mangyomi');
});

ipcMain.handle('installer:selectFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
        properties: ['openDirectory'],
        title: 'Select Installation Folder'
    });
    return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('installer:install', async (_, installPath: string) => {
    try {
        const sendProgress = (status: string, percent: number) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('installer:progress', { status, percent });
            }
        };

        // Create install directory
        sendProgress('Creating installation directory...', 5);
        if (!fs.existsSync(installPath)) {
            fs.mkdirSync(installPath, { recursive: true });
        }

        // Get the bundled app archive (support both 7z and zip)
        const resourcesPath = process.resourcesPath || path.join(__dirname, '..');
        let archivePath = path.join(resourcesPath, 'resources', 'app.7z');
        let useZip = false;

        if (!fs.existsSync(archivePath)) {
            archivePath = path.join(resourcesPath, 'resources', 'app.zip');
            useZip = true;
        }

        if (!fs.existsSync(archivePath)) {
            // No archive = dev mode, simulate installation
            console.log('Dev mode: simulating installation...');
            sendProgress('Simulating extraction (dev mode)...', 20);
            await new Promise(r => setTimeout(r, 800));
            sendProgress('Creating shortcuts...', 50);
            await new Promise(r => setTimeout(r, 800));
            sendProgress('Registering application...', 75);
            await new Promise(r => setTimeout(r, 800));
            sendProgress('Finalizing installation...', 95);
            await new Promise(r => setTimeout(r, 500));
            sendProgress('Installation complete!', 100);
            return { success: true, exePath: path.join(installPath, 'Mangyomi.exe') };
        }

        // Extract archive
        sendProgress('Extracting files...', 10);

        if (useZip) {
            // Use PowerShell to extract ZIP
            const { exec } = await import('child_process');
            const { promisify } = await import('util');
            const execAsync = promisify(exec);

            await execAsync(`powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${installPath}' -Force"`);
            sendProgress('Extracting files... 70%', 70);
        } else {

            const Seven = (await import('node-7z')).default;
            const sevenBin = await import('7zip-bin');

            await new Promise<void>((resolve, reject) => {
                const stream = Seven.extractFull(archivePath, installPath, {
                    $bin: sevenBin.path7za,
                    $progress: true
                });

                stream.on('progress', (progress: any) => {
                    const percent = 10 + Math.floor(progress.percent * 0.6);
                    sendProgress(`Extracting files... ${progress.percent}%`, percent);
                });

                stream.on('end', () => resolve());
                stream.on('error', (err: Error) => reject(err));
            });
        }

        // Create shortcuts
        sendProgress('Creating shortcuts...', 75);
        const exePath = path.join(installPath, 'Mangyomi.exe');

        // Desktop shortcut
        const desktopPath = path.join(app.getPath('desktop'), 'Mangyomi.lnk');
        await createShortcut(exePath, desktopPath, 'Mangyomi - Manga Reader');

        // Start Menu shortcut
        const startMenuPath = path.join(
            process.env.APPDATA || '',
            'Microsoft', 'Windows', 'Start Menu', 'Programs',
            'Mangyomi.lnk'
        );
        await createShortcut(exePath, startMenuPath, 'Mangyomi - Manga Reader');

        // Add to registry for uninstall
        sendProgress('Registering application...', 90);
        await addUninstallEntry(installPath);

        sendProgress('Installation complete!', 100);
        return { success: true, exePath };
    } catch (error) {
        console.error('Installation failed:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
});

ipcMain.handle('installer:launch', async (_, exePath: string) => {
    const { shell } = await import('electron');
    shell.openPath(exePath);
    app.quit();
});

ipcMain.handle('window:close', () => {
    app.quit();
});

ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize();
});

async function createShortcut(targetPath: string, shortcutPath: string, description: string) {
    try {
        // Use PowerShell to create shortcut
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);

        const psScript = `
            $WshShell = New-Object -ComObject WScript.Shell
            $Shortcut = $WshShell.CreateShortcut('${shortcutPath.replace(/'/g, "''")}')
            $Shortcut.TargetPath = '${targetPath.replace(/'/g, "''")}'
            $Shortcut.Description = '${description}'
            $Shortcut.Save()
        `;

        await execAsync(`powershell -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`);
    } catch (error) {
        console.error('Failed to create shortcut:', error);
    }
}

async function addUninstallEntry(installPath: string) {
    try {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);

        const uninstallKey = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Mangyomi';
        const exePath = path.join(installPath, 'Mangyomi.exe');

        const commands = [
            `New-Item -Path '${uninstallKey}' -Force`,
            `Set-ItemProperty -Path '${uninstallKey}' -Name 'DisplayName' -Value 'Mangyomi'`,
            `Set-ItemProperty -Path '${uninstallKey}' -Name 'DisplayIcon' -Value '${exePath}'`,
            `Set-ItemProperty -Path '${uninstallKey}' -Name 'InstallLocation' -Value '${installPath}'`,
            `Set-ItemProperty -Path '${uninstallKey}' -Name 'UninstallString' -Value '${path.join(installPath, 'Uninstall Mangyomi.exe')}'`,
            `Set-ItemProperty -Path '${uninstallKey}' -Name 'Publisher' -Value 'Mangyomi'`,
        ];

        await execAsync(`powershell -Command "${commands.join('; ')}"`);
    } catch (error) {
        console.error('Failed to add registry entry:', error);
    }
}

app.whenReady().then(() => {
    if (isSilent) {
        performSilentInstall();
    } else {
        createWindow();
    }
});

app.on('window-all-closed', () => {
    app.quit();
});
