import { net, app, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import * as crypto from 'crypto';

interface BlockmapFile {
    name: string;
    offset: number;
    checksumBlockSize?: number;
    sizes: number[];
    checksums: string[];
}

interface Blockmap {
    version: string;
    files: BlockmapFile[];
    blockSize?: number;
}

interface UpdateInfo {
    hasUpdate: boolean;
    currentVersion: string;
    latestVersion: string;
    downloadUrl: string | null;
    blockmapUrl: string | null;
    fileName: string | null;
    fileSize: number;
    releaseNotes: string;
    publishedAt: string;
    isNightly: boolean;
    error?: string;
}

interface DownloadProgress {
    percent: number;
    bytesDownloaded: number;
    totalBytes: number;
    isDifferential: boolean;
}

const REPO_OWNER = 'Mangyomi';
const REPO_NAME = 'mangyomi-application';

export class DifferentialUpdater {
    private mainWindow: BrowserWindow | null = null;
    private downloadedUpdatePath: string | null = null;

    constructor() {
        // No initialization needed
    }

    // Write debug info to a file for production diagnosis
    private debugLog(message: string): void {
        const logPath = path.join(app.getPath('userData'), 'updater-debug.log');
        const timestamp = new Date().toISOString();
        const logLine = `[${timestamp}] ${message}\n`;
        try {
            fs.appendFileSync(logPath, logLine);
        } catch (e) {
            // Ignore write errors
        }
        console.log(`[Updater] ${message}`);
    }

    setMainWindow(window: BrowserWindow) {
        this.mainWindow = window;
    }

    private getActiveWindow(): BrowserWindow | null {
        // Try stored window first
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            return this.mainWindow;
        }
        // Fallback to focused or first available window
        return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
    }

    private sendProgress(channel: string, data: any) {
        const win = this.getActiveWindow();
        if (win && !win.isDestroyed()) {
            win.webContents.send(channel, data);
        }
    }

    private getInstallDirectory(): string {
        return path.dirname(app.getPath('exe'));
    }



    private parseBlockmap(data: Buffer): Blockmap {
        try {
            const decompressed = zlib.gunzipSync(data);
            return JSON.parse(decompressed.toString('utf-8'));
        } catch (e) {
            console.error('[Updater] Failed to parse blockmap:', e);
            throw e;
        }
    }

    private async fetchBuffer(url: string): Promise<Buffer> {
        const response = await net.fetch(url, {
            headers: { 'User-Agent': 'Mangyomi-App' }
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }

    private async fetchWithRange(url: string, start: number, end: number): Promise<Buffer> {
        // GitHub uses redirects for downloads. First resolve the final URL.
        // Then make the range request to the final URL with caching disabled.
        try {
            // First, make a HEAD request to get the final URL after redirects
            const headResponse = await net.fetch(url, {
                method: 'HEAD',
                headers: { 'User-Agent': 'Mangyomi-App' }
            });
            const finalUrl = headResponse.url || url;

            // Now make the range request to the final URL with cache disabled
            const response = await net.fetch(finalUrl, {
                headers: {
                    'User-Agent': 'Mangyomi-App',
                    'Range': `bytes=${start}-${end}`,
                    'Cache-Control': 'no-cache'
                },
                cache: 'no-store' as any
            });

            if (!response.ok && response.status !== 206) {
                throw new Error(`HTTP ${response.status} for range request`);
            }
            const arrayBuffer = await response.arrayBuffer();
            return Buffer.from(arrayBuffer);
        } catch (error) {
            // If range request fails, throw to fall back to full download
            throw new Error(`Range request failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async checkForUpdates(useBeta: boolean, currentVersion: string): Promise<UpdateInfo> {
        try {
            let release: any;

            if (useBeta) {
                const releasesUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases?per_page=20`;
                const response = await net.fetch(releasesUrl, {
                    headers: {
                        'User-Agent': 'Mangyomi-App',
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });

                if (!response.ok) {
                    if (response.status === 403) {
                        return { hasUpdate: false, error: 'Rate limit exceeded. Try again later.', currentVersion, latestVersion: '', downloadUrl: null, blockmapUrl: null, fileName: null, fileSize: 0, releaseNotes: '', publishedAt: '', isNightly: true };
                    }
                    throw new Error(`GitHub API error: ${response.status}`);
                }

                const releases = await response.json() as any[];

                // Find latest nightly
                const nightlies = releases.filter(r => r.tag_name.startsWith('nightly-'));
                let latestNightly = null;
                if (nightlies.length > 0) {
                    nightlies.sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());
                    latestNightly = nightlies[0];
                }

                // Find latest stable (non-prerelease, non-draft, non-nightly)
                const stables = releases.filter(r =>
                    !r.prerelease &&
                    !r.draft &&
                    !r.tag_name.startsWith('nightly-') &&
                    r.tag_name.match(/^v?\d+\.\d+\.\d+/)
                );
                let latestStable = null;
                if (stables.length > 0) {
                    stables.sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());
                    latestStable = stables[0];
                }

                // Compare and pick the newer one
                if (latestNightly && latestStable) {
                    const nightlyTime = new Date(latestNightly.published_at).getTime();
                    const stableTime = new Date(latestStable.published_at).getTime();
                    // Also compare semver - stable 2.8.0 should beat nightly 2.7.0-*
                    const nightlyVersion = latestNightly.name?.match(/(\d+\.\d+\.\d+)/)?.[1] || '0.0.0';
                    const stableVersion = latestStable.tag_name.replace(/^v/, '');
                    const [nMajor, nMinor, nPatch] = nightlyVersion.split('.').map(Number);
                    const [sMajor, sMinor, sPatch] = stableVersion.split('.').map(Number);

                    // Prefer stable if it has equal or higher semver
                    if (sMajor > nMajor ||
                        (sMajor === nMajor && sMinor > nMinor) ||
                        (sMajor === nMajor && sMinor === nMinor && sPatch >= nPatch)) {
                        release = latestStable;
                        this.debugLog(`Beta mode: stable ${stableVersion} >= nightly ${nightlyVersion}, using stable`);
                    } else {
                        release = latestNightly;
                        this.debugLog(`Beta mode: nightly ${nightlyVersion} > stable ${stableVersion}, using nightly`);
                    }
                } else {
                    release = latestNightly || latestStable;
                }

                this.debugLog(`Found ${nightlies.length} nightlies, ${stables.length} stables, using: ${release?.tag_name || 'none'}`);

                if (!release) {
                    return { hasUpdate: false, error: 'No releases found', currentVersion, latestVersion: '', downloadUrl: null, blockmapUrl: null, fileName: null, fileSize: 0, releaseNotes: '', publishedAt: '', isNightly: true };
                }
            } else {
                const releaseUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
                const response = await net.fetch(releaseUrl, {
                    headers: {
                        'User-Agent': 'Mangyomi-App',
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });

                if (!response.ok) {
                    if (response.status === 404) {
                        return { hasUpdate: false, error: 'No releases found', currentVersion, latestVersion: '', downloadUrl: null, blockmapUrl: null, fileName: null, fileSize: 0, releaseNotes: '', publishedAt: '', isNightly: false };
                    } else if (response.status === 403) {
                        return { hasUpdate: false, error: 'Rate limit exceeded. Try again later.', currentVersion, latestVersion: '', downloadUrl: null, blockmapUrl: null, fileName: null, fileSize: 0, releaseNotes: '', publishedAt: '', isNightly: false };
                    }
                    throw new Error(`GitHub API error: ${response.status}`);
                }

                release = await response.json() as any;
            }

            let latestVersion = release.tag_name.replace(/^v/, '').replace(/^nightly-/, '');

            if (latestVersion === 'nightly' && release.name) {
                const match = release.name.match(/(\d+\.\d+\.\d+[-.\\w]*)/);
                if (match) {
                    latestVersion = match[1];
                } else {
                    const publishDate = new Date(release.published_at);
                    latestVersion = `nightly-${publishDate.toISOString().slice(0, 10).replace(/-/g, '')}`;
                }
            }

            let hasUpdate = false;

            // Extract base semver (e.g., "2.4.1" from "2.4.1-nightly.20260107.0207")
            const cleanCurrent = currentVersion.split('-')[0];
            const cleanLatest = latestVersion.split('-')[0];

            const currentParts = cleanCurrent.split('.').map(Number);
            const latestParts = cleanLatest.split('.').map(Number);

            // Compare semantic versions
            let semverComparison = 0; // -1 = latest older, 0 = same, 1 = latest newer
            for (let i = 0; i < 3; i++) {
                const l = latestParts[i] || 0;
                const c = currentParts[i] || 0;
                if (l > c) {
                    semverComparison = 1;
                    break;
                } else if (l < c) {
                    semverComparison = -1;
                    break;
                }
            }

            this.debugLog(`Version comparison: current=${currentVersion}, latest=${latestVersion}, cleanCurrent=${cleanCurrent}, cleanLatest=${cleanLatest}, semverComparison=${semverComparison}, useBeta=${useBeta}`);

            if (useBeta) {
                // For nightly updates: latest must have equal or higher base version
                if (semverComparison > 0) {
                    // Latest has higher base version
                    hasUpdate = true;
                } else if (semverComparison === 0) {
                    // Same base version - compare full version strings (nightly timestamp)
                    hasUpdate = latestVersion !== currentVersion;
                }
                // If semverComparison < 0, latest has LOWER base version - no update
                this.debugLog(`Beta check: semverComparison=${semverComparison}, hasUpdate=${hasUpdate}`);
            } else {
                // For stable updates
                if (semverComparison > 0) {
                    hasUpdate = true;
                }
                // If on nightly, allow upgrade to same-version stable
                if (!hasUpdate &&
                    cleanCurrent === cleanLatest &&
                    currentVersion.includes('-') &&
                    !latestVersion.includes('-')) {
                    hasUpdate = true;
                }
            }

            // Find the installer and blockmap assets based on platform
            const isLinux = process.platform === 'linux';
            let downloadAsset: any = null;
            let blockmapAsset: any = null;

            if (isLinux) {
                // Linux: Find AppImage asset
                downloadAsset = release.assets?.find((a: any) =>
                    a.name.endsWith('.AppImage')
                );
                // Linux doesn't support differential updates
            } else {
                // Windows: Find exe installer
                downloadAsset = release.assets?.find((a: any) =>
                    a.name === 'Mangyomi-Installer.exe'
                );
                if (!downloadAsset) {
                    downloadAsset = release.assets?.find((a: any) =>
                        a.name.endsWith('.exe') && !a.name.includes('blockmap')
                    );
                }
                // Find the blockmap file for differential updates
                blockmapAsset = release.assets?.find((a: any) =>
                    a.name.endsWith('.blockmap')
                );
            }

            return {
                hasUpdate,
                currentVersion,
                latestVersion,
                downloadUrl: downloadAsset?.browser_download_url || null,
                blockmapUrl: blockmapAsset?.browser_download_url || null,
                fileName: downloadAsset?.name || null,
                fileSize: downloadAsset?.size || 0,
                releaseNotes: release.body || '',
                publishedAt: release.published_at,
                isNightly: useBeta
            };
        } catch (error) {
            console.error('Update check failed:', error);
            return {
                hasUpdate: false,
                currentVersion,
                latestVersion: '',
                downloadUrl: null,
                blockmapUrl: null,
                fileName: null,
                fileSize: 0,
                releaseNotes: '',
                publishedAt: '',
                isNightly: useBeta,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    private calculateBlockRanges(
        oldBlockmap: Blockmap,
        newBlockmap: Blockmap
    ): { changedBlocks: Array<{ index: number; offset: number; size: number }>; unchangedBlocks: Array<{ index: number; offset: number; size: number }> } {
        const changedBlocks: Array<{ index: number; offset: number; size: number }> = [];
        const unchangedBlocks: Array<{ index: number; offset: number; size: number }> = [];

        // Get the main file from both blockmaps
        const oldFile = oldBlockmap.files[0];
        const newFile = newBlockmap.files[0];

        if (!oldFile || !newFile) {
            // No files to compare, treat as full download needed
            return { changedBlocks: [], unchangedBlocks: [] };
        }

        const blockSize = newBlockmap.blockSize || newFile.checksumBlockSize || 4096;
        let currentOffset = 0;

        for (let i = 0; i < newFile.checksums.length; i++) {
            const newChecksum = newFile.checksums[i];
            const newSize = newFile.sizes[i];
            const oldChecksum = oldFile.checksums?.[i];

            if (oldChecksum && oldChecksum === newChecksum) {
                unchangedBlocks.push({ index: i, offset: currentOffset, size: newSize });
            } else {
                changedBlocks.push({ index: i, offset: currentOffset, size: newSize });
            }

            currentOffset += newSize;
        }

        return { changedBlocks, unchangedBlocks };
    }

    async downloadUpdate(
        downloadUrl: string,
        blockmapUrl: string | null,
        fileName: string,
        currentVersion?: string,
        targetVersion?: string
    ): Promise<{ success: boolean; filePath?: string; error?: string; isDifferential?: boolean }> {
        try {
            const tempDir = app.getPath('temp');
            const filePath = path.join(tempDir, fileName);
            let isDifferential = false;

            // Debug logging
            this.debugLog(`downloadUpdate called - blockmapUrl: ${blockmapUrl ? 'present' : 'NULL'}, currentVersion: ${currentVersion || 'undefined'}, targetVersion: ${targetVersion || 'undefined'}`);


            // Full download fallback
            console.log('[Updater] Performing full download...');

            const response = await net.fetch(downloadUrl, {
                headers: {
                    'User-Agent': 'Mangyomi-App',
                    'Accept': 'application/octet-stream'
                }
            });

            if (!response.ok) {
                throw new Error(`Download failed: ${response.status}`);
            }

            const contentLength = parseInt(response.headers.get('content-length') || '0', 10);

            const reader = response.body?.getReader();

            if (!reader) {
                throw new Error('Failed to get response reader');
            }

            const chunks: Uint8Array[] = [];
            let receivedLength = 0;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                chunks.push(value);
                receivedLength += value.length;

                const currentPercent = contentLength > 0 ? Math.round((receivedLength / contentLength) * 100) : 0;
                this.sendProgress('update:downloadProgress', {
                    percent: currentPercent,
                    bytesDownloaded: receivedLength,
                    totalBytes: contentLength,
                    isDifferential: false
                } as DownloadProgress);
            }

            console.log(`[Updater] Download complete: ${Math.round(receivedLength / 1024 / 1024)}MB`);

            const allChunks = new Uint8Array(receivedLength);
            let position = 0;
            for (const chunk of chunks) {
                allChunks.set(chunk, position);
                position += chunk.length;
            }

            fs.writeFileSync(filePath, Buffer.from(allChunks));
            this.downloadedUpdatePath = filePath;



            this.sendProgress('update:downloadComplete', {
                success: true,
                filePath,
                isDifferential: false
            });

            return { success: true, filePath, isDifferential: false };

        } catch (error) {
            console.error('Download failed:', error);
            this.sendProgress('update:downloadComplete', {
                success: false,
                error: error instanceof Error ? error.message : 'Download failed'
            });
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Download failed'
            };
        }
    }

    async installUpdate(): Promise<{ success: boolean; error?: string }> {
        this.debugLog(`installUpdate called - downloadedUpdatePath: ${this.downloadedUpdatePath}`);

        if (!this.downloadedUpdatePath || !fs.existsSync(this.downloadedUpdatePath)) {
            this.debugLog(`Install failed: path is ${this.downloadedUpdatePath}, exists: ${this.downloadedUpdatePath ? fs.existsSync(this.downloadedUpdatePath) : 'N/A'}`);
            console.error('[Updater] Install failed: path is', this.downloadedUpdatePath, 'exists:', this.downloadedUpdatePath ? fs.existsSync(this.downloadedUpdatePath) : 'N/A');
            return { success: false, error: 'No update downloaded' };
        }

        try {
            // Linux: Replace-and-relaunch AppImage
            if (process.platform === 'linux') {
                return await this.installUpdateLinux();
            }

            // Windows: Run NSIS installer
            const installDir = this.getInstallDirectory();
            this.debugLog(`Installing update from: ${this.downloadedUpdatePath}`);
            this.debugLog(`Installing to: ${installDir}`);
            console.log(`[Updater] Installing update from: ${this.downloadedUpdatePath}`);
            console.log(`[Updater] Installing to: ${installDir}`);

            const { spawn } = await import('child_process');

            // Spawn the installer as detached process
            // Using shell: true helps with Windows "Mark of the Web" permission issues
            this.debugLog(`Spawning installer with args: --silent --install-path ${installDir}`);
            const child = spawn(this.downloadedUpdatePath, ['--silent', '--install-path', installDir], {
                detached: true,
                stdio: 'ignore',
                shell: true,
                windowsHide: true
            });

            child.on('error', (err) => {
                this.debugLog(`Spawn error: ${err.message}`);
                console.error('[Updater] Spawn error:', err);
            });

            child.unref();
            this.debugLog('Installer spawned, quitting app in 1 second...');

            setTimeout(() => {
                app.quit();
            }, 1000);

            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to launch installer'
            };
        }
    }

    /**
     * Linux-specific update installation.
     * Replaces the current AppImage with the new one and relaunches.
     */
    private async installUpdateLinux(): Promise<{ success: boolean; error?: string }> {
        const { spawn, execSync } = await import('child_process');

        // APPIMAGE env var contains the path to the running AppImage
        const currentAppImage = process.env.APPIMAGE;
        if (!currentAppImage) {
            this.debugLog('Linux install failed: Not running as AppImage (APPIMAGE env not set)');
            return { success: false, error: 'Not running as AppImage. Please download the update manually.' };
        }

        this.debugLog(`Linux: Current AppImage: ${currentAppImage}`);
        this.debugLog(`Linux: New AppImage: ${this.downloadedUpdatePath}`);

        try {
            // Backup current AppImage
            const backupPath = `${currentAppImage}.backup`;
            fs.copyFileSync(currentAppImage, backupPath);
            this.debugLog(`Linux: Backed up current AppImage to ${backupPath}`);

            // Replace with new AppImage
            fs.copyFileSync(this.downloadedUpdatePath!, currentAppImage);
            this.debugLog('Linux: Replaced AppImage with new version');

            // Make executable
            execSync(`chmod +x "${currentAppImage}"`);
            this.debugLog('Linux: Made new AppImage executable');

            // Clean up backup and temp file
            try {
                fs.unlinkSync(backupPath);
                fs.unlinkSync(this.downloadedUpdatePath!);
            } catch (e) {
                // Non-critical, ignore
            }

            // Spawn new AppImage and quit
            this.debugLog('Linux: Spawning new AppImage and quitting...');
            const child = spawn(currentAppImage, [], {
                detached: true,
                stdio: 'ignore'
            });
            child.unref();

            setTimeout(() => {
                app.quit();
            }, 500);

            return { success: true };
        } catch (error) {
            this.debugLog(`Linux install error: ${error instanceof Error ? error.message : String(error)}`);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to replace AppImage'
            };
        }
    }

    getDownloadedUpdatePath(): string | null {
        return this.downloadedUpdatePath;
    }


}

export const differentialUpdater = new DifferentialUpdater();
