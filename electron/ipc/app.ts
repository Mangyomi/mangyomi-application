/**
 * App-level IPC Handlers (memory, updates, version)
 */
import { ipcMain, BrowserWindow, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as memoryMonitor from '../memoryMonitor';
import { differentialUpdater } from '../updater';
import { getFormattedMainLogs } from '../logging';
import { getFormattedMainNetwork } from '../imageProxy';
import { createLogger, LogLevel } from '../utils/logger';

export function setupAppHandlers(mainWindow: BrowserWindow) {
    // Memory monitoring
    ipcMain.handle('app:getMemoryStats', async () => {
        return memoryMonitor.getMemoryStats();
    });

    ipcMain.handle('app:startMemoryMonitoring', async () => {
        memoryMonitor.startMonitoring();
        return { success: true };
    });

    ipcMain.handle('app:stopMemoryMonitoring', async () => {
        memoryMonitor.stopMonitoring();
        return { success: true };
    });

    // Version and updates
    const pkgPath = app.isPackaged
        ? path.join(process.resourcesPath, 'app.asar', 'package.json')
        : path.join(app.getAppPath(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

    differentialUpdater.setMainWindow(mainWindow);
    differentialUpdater.initializeCache(pkg.version);

    ipcMain.handle('app:getVersion', () => {
        return pkg.version;
    });

    ipcMain.handle('app:checkForUpdates', async (_, useBeta: boolean) => {
        return differentialUpdater.checkForUpdates(useBeta, pkg.version);
    });

    ipcMain.handle('app:downloadUpdate', async (_, downloadUrl: string, fileName: string, blockmapUrl?: string, targetVersion?: string) => {
        return differentialUpdater.downloadUpdate(downloadUrl, blockmapUrl || null, fileName, pkg.version, targetVersion);
    });

    ipcMain.handle('app:installUpdate', async () => {
        return differentialUpdater.installUpdate();
    });

    // Dump logs for debugging
    ipcMain.handle('app:createDumpLog', async (_, rendererConsoleLogs: string, rendererNetworkActivity: string) => {
        const { shell } = await import('electron');

        const dumpDir = path.join(app.getPath('userData'), 'dumps');
        if (!fs.existsSync(dumpDir)) {
            fs.mkdirSync(dumpDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const dumpPath = path.join(dumpDir, `mangyomi-dump-${timestamp}.txt`);

        // Gather system information
        const systemInfo = [
            `App Version: ${pkg.version}`,
            `Electron: ${process.versions.electron}`,
            `Chrome: ${process.versions.chrome}`,
            `Node.js: ${process.versions.node}`,
            `V8: ${process.versions.v8}`,
            `Platform: ${process.platform}`,
            `Architecture: ${process.arch}`,
            `OS: ${os.type()} ${os.release()}`,
            `Total Memory: ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB`,
            `Free Memory: ${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)} GB`,
            `CPU Cores: ${os.cpus().length}`,
            `CPU Model: ${os.cpus()[0]?.model || 'Unknown'}`,
            `Uptime: ${(os.uptime() / 3600).toFixed(2)} hours`,
            `User Data Path: ${app.getPath('userData')}`,
            `App Path: ${app.getAppPath()}`,
            `Is Packaged: ${app.isPackaged}`,
        ].join('\n');

        // Get main process logs
        const mainConsoleLogs = getFormattedMainLogs();
        const mainNetworkLogs = getFormattedMainNetwork();

        // Get current memory stats
        const memStats = memoryMonitor.getMemoryStats();
        const memoryInfo = memStats?.current ? [
            `Heap Used: ${(memStats.current.heapUsed / 1024 / 1024).toFixed(2)} MB`,
            `Heap Total: ${(memStats.current.heapTotal / 1024 / 1024).toFixed(2)} MB`,
            `External: ${(memStats.current.external / 1024 / 1024).toFixed(2)} MB`,
            `RSS: ${(memStats.current.rss / 1024 / 1024).toFixed(2)} MB`,
            `Trend: ${memStats.trend}`,
            `Leak Warning: ${memStats.leakWarning ? 'YES' : 'No'}`,
        ].join('\n') : 'Memory stats not available';

        const separator = '='.repeat(60);
        const content = [
            `Mangyomi Debug Dump - ${new Date().toISOString()}`,
            separator,
            '',
            `${separator}`,
            `SYSTEM INFORMATION`,
            `${separator}`,
            systemInfo,
            '',
            `${separator}`,
            `MEMORY USAGE`,
            `${separator}`,
            memoryInfo,
            '',
            `${separator}`,
            `MAIN PROCESS LOGS (Terminal)`,
            `${separator}`,
            mainConsoleLogs,
            '',
            `${separator}`,
            `MAIN PROCESS NETWORK ACTIVITY`,
            `${separator}`,
            mainNetworkLogs,
            '',
            `${separator}`,
            `RENDERER CONSOLE LOGS`,
            `${separator}`,
            rendererConsoleLogs,
            '',
            `${separator}`,
            `RENDERER NETWORK ACTIVITY`,
            `${separator}`,
            rendererNetworkActivity,
        ].join('\n');

        fs.writeFileSync(dumpPath, content, 'utf-8');

        // Open Explorer with file highlighted
        shell.showItemInFolder(dumpPath);

        return { success: true, path: dumpPath };
    });

    // Renderer-to-main logging (for frontend logs to appear in terminal)
    const rendererLogger = createLogger('Renderer');
    ipcMain.handle('app:log', async (_, level: LogLevel, context: string, message: string) => {
        const contextLogger = createLogger(context);
        switch (level) {
            case 'error': contextLogger.error(message); break;
            case 'warn': contextLogger.warn(message); break;
            case 'info': contextLogger.info(message); break;
            case 'debug': contextLogger.debug(message); break;
            case 'verbose': contextLogger.verbose(message); break;
        }
    });

    // GPU status management
    const gpuFlagPath = path.join(app.getPath('userData'), 'gpu-disabled.flag');

    ipcMain.handle('app:isGpuDisabled', async () => {
        return fs.existsSync(gpuFlagPath);
    });

    ipcMain.handle('app:resetGpuFlag', async () => {
        if (fs.existsSync(gpuFlagPath)) {
            fs.unlinkSync(gpuFlagPath);
            return { success: true, needsRestart: true };
        }
        return { success: true, needsRestart: false };
    });
}
