import path from 'path';
import fs from 'fs';
import os from 'os';
import AdmZip from 'adm-zip';
import type { ExtensionManifest } from './types';

interface AvailableExtension extends ExtensionManifest {
    repoUrl: string;
    folderName: string;
}

interface InstallResult {
    success: boolean;
    extension?: ExtensionManifest;
    error?: string;
}

/**
 * Parse a GitHub repository URL to extract owner and repo name
 */
function parseGitHubUrl(url: string): { owner: string; repo: string; branch?: string } | null {
    const patterns = [
        /^https?:\/\/github\.com\/([^\/]+)\/([^\/]+?)(?:\/tree\/([^\/]+))?(?:\.git)?$/,
        /^github\.com\/([^\/]+)\/([^\/]+?)(?:\/tree\/([^\/]+))?(?:\.git)?$/,
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
            return {
                owner: match[1],
                repo: match[2].replace(/\.git$/, ''),
                branch: match[3],
            };
        }
    }
    return null;
}

/**
 * Download a GitHub repository as a ZIP archive
 */
async function downloadRepoZip(owner: string, repo: string, branch: string = 'main'): Promise<Buffer> {
    const zipUrl = `https://github.com/${owner}/${repo}/archive/refs/heads/${branch}.zip`;

    const response = await fetch(zipUrl);

    if (!response.ok) {
        if (branch === 'main') {
            const masterResponse = await fetch(
                `https://github.com/${owner}/${repo}/archive/refs/heads/master.zip`
            );
            if (masterResponse.ok) {
                const arrayBuffer = await masterResponse.arrayBuffer();
                return Buffer.from(arrayBuffer);
            }
        }
        throw new Error(`Failed to download repository: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

/**
 * Extract ZIP to a temporary directory and return the path
 */
function extractZipToTemp(zipBuffer: Buffer): string {
    const tempDir = path.join(os.tmpdir(), `mangyomi-ext-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    const zip = new AdmZip(zipBuffer);
    zip.extractAllTo(tempDir, true);

    return tempDir;
}

/**
 * Find all valid extension folders in an extracted repository
 * Prioritizes dist/ directory for bundled extensions (new modular architecture)
 */
function findExtensionFolders(extractedPath: string): string[] {
    const extensionFolders: string[] = [];

    const contents = fs.readdirSync(extractedPath, { withFileTypes: true });
    const rootDir = contents.find(d => d.isDirectory());

    if (!rootDir) return extensionFolders;

    const repoRoot = path.join(extractedPath, rootDir.name);

    // Check for dist/ directory first (bundled extensions from new modular architecture)
    const distDir = path.join(repoRoot, 'dist');
    if (fs.existsSync(distDir)) {
        try {
            const distContents = fs.readdirSync(distDir, { withFileTypes: true });
            for (const item of distContents) {
                if (item.isDirectory()) {
                    const extDir = path.join(distDir, item.name);
                    const items = fs.readdirSync(extDir, { withFileTypes: true });
                    const hasManifest = items.some(i => i.name === 'manifest.json' && i.isFile());
                    const hasIndex = items.some(i => i.name === 'index.js' && i.isFile());
                    if (hasManifest && hasIndex) {
                        extensionFolders.push(extDir);
                    }
                }
            }
        } catch (error) {
            // Continue to legacy scan if dist/ fails
        }
    }

    // If dist/ found extensions, return them
    if (extensionFolders.length > 0) {
        return extensionFolders;
    }

    // Legacy: scan repo root for old-style extensions (manifest.json + index.js at root level)
    const scanDir = (dir: string, depth: number = 0) => {
        if (depth > 2) return;

        try {
            const items = fs.readdirSync(dir, { withFileTypes: true });

            const hasManifest = items.some(i => i.name === 'manifest.json' && i.isFile());
            const hasIndex = items.some(i => i.name === 'index.js' && i.isFile());

            if (hasManifest && hasIndex) {
                extensionFolders.push(dir);
            } else {
                for (const item of items) {
                    if (item.isDirectory() && !item.name.startsWith('.') && item.name !== 'node_modules' && item.name !== 'dist') {
                        scanDir(path.join(dir, item.name), depth + 1);
                    }
                }
            }
        } catch (error) {
            // Ignore ENOTDIR and other access errors
        }
    };

    scanDir(repoRoot);
    return extensionFolders;
}

/**
 * Read and validate an extension manifest
 */
function readManifest(folderPath: string): ExtensionManifest | null {
    const manifestPath = path.join(folderPath, 'manifest.json');

    try {
        const content = fs.readFileSync(manifestPath, 'utf-8');
        const manifest = JSON.parse(content) as ExtensionManifest;

        if (!manifest.id || !manifest.name || !manifest.version) {
            console.warn(`Invalid manifest in ${folderPath}: missing required fields`);
            return null;
        }

        return manifest;
    } catch (error) {
        console.error(`Failed to read manifest from ${folderPath}:`, error);
        return null;
    }
}

/**
 * List all available extensions in a GitHub repository
 */
export async function listAvailableExtensions(repoUrl: string): Promise<AvailableExtension[]> {
    const parsed = parseGitHubUrl(repoUrl);
    if (!parsed) {
        throw new Error('Invalid GitHub URL format');
    }

    const zipBuffer = await downloadRepoZip(parsed.owner, parsed.repo, parsed.branch);
    const tempDir = extractZipToTemp(zipBuffer);

    try {
        const extensionFolders = findExtensionFolders(tempDir);
        const extensions: AvailableExtension[] = [];

        for (const folder of extensionFolders) {
            const manifest = readManifest(folder);
            if (manifest) {
                let iconUrl: string | undefined;
                if (manifest.icon) {
                    let iconFile: string | undefined;

                    if (typeof manifest.icon === 'string') {

                        iconFile = manifest.icon;
                    } else {
                        iconFile = manifest.icon.svg || manifest.icon.png;
                    }

                    if (iconFile) {
                        if (iconFile.startsWith('http')) {
                            iconUrl = iconFile;
                        } else {
                            // Get the folder path relative to temp dir (includes dist/extensionId)
                            const folderRelative = folder.split(path.sep).slice(-2).join('/');
                            const relativeIconPath = `${folderRelative}/${iconFile}`;
                            iconUrl = `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${parsed.branch || 'main'}/${relativeIconPath}`;
                        }
                    }
                }

                // Map lang → language for Tachiyomi-style manifests
                const language = (manifest as any).lang || manifest.language || 'unknown';

                extensions.push({
                    ...manifest,
                    language,
                    icon: iconUrl,
                    repoUrl,
                    folderName: path.basename(folder),
                });
            }
        }

        return extensions;
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

/**
 * Install a specific extension from a GitHub repository
 */
export async function installExtension(
    repoUrl: string,
    extensionId: string,
    extensionsPath: string
): Promise<InstallResult> {
    const parsed = parseGitHubUrl(repoUrl);
    if (!parsed) {
        return { success: false, error: 'Invalid GitHub URL format' };
    }

    const zipBuffer = await downloadRepoZip(parsed.owner, parsed.repo, parsed.branch);
    const tempDir = extractZipToTemp(zipBuffer);

    try {
        const extensionFolders = findExtensionFolders(tempDir);

        for (const folder of extensionFolders) {
            const manifest = readManifest(folder);
            if (manifest && manifest.id === extensionId) {
                const targetPath = path.join(extensionsPath, extensionId);

                if (fs.existsSync(targetPath)) {
                    fs.rmSync(targetPath, { recursive: true, force: true });
                }

                fs.mkdirSync(targetPath, { recursive: true });
                copyFolderRecursive(folder, targetPath);

                return { success: true, extension: manifest };
            }
        }

        return { success: false, error: `Extension "${extensionId}" not found in repository` };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error during installation'
        };
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

/**
 * Uninstall an extension by removing its folder
 */
export function uninstallExtension(extensionId: string, extensionsPath: string): InstallResult {
    const targetPath = path.join(extensionsPath, extensionId);

    if (!fs.existsSync(targetPath)) {
        return { success: false, error: `Extension "${extensionId}" is not installed` };
    }

    try {
        fs.rmSync(targetPath, { recursive: true, force: true });
        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error during uninstallation'
        };
    }
}

/**
 * Check if an extension is installed
 */
export function isExtensionInstalled(extensionId: string, extensionsPath: string): boolean {
    const targetPath = path.join(extensionsPath, extensionId);
    const manifestPath = path.join(targetPath, 'manifest.json');
    const indexPath = path.join(targetPath, 'index.js');

    return fs.existsSync(manifestPath) && fs.existsSync(indexPath);
}

/**
 * Helper function to copy a folder recursively
 */
function copyFolderRecursive(source: string, target: string): void {
    const items = fs.readdirSync(source, { withFileTypes: true });

    for (const item of items) {
        const srcPath = path.join(source, item.name);
        const destPath = path.join(target, item.name);

        if (item.isDirectory()) {
            fs.mkdirSync(destPath, { recursive: true });
            copyFolderRecursive(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

/**
 * Install a local extension from a folder path
 */
export function installLocalExtension(
    sourcePath: string,
    extensionsPath: string
): InstallResult {
    try {
        const manifest = readManifest(sourcePath);
        if (!manifest) {
            return { success: false, error: 'Invalid or missing manifest.json' };
        }

        const targetPath = path.join(extensionsPath, manifest.id);

        if (fs.existsSync(targetPath)) {
            fs.rmSync(targetPath, { recursive: true, force: true });
        }

        fs.mkdirSync(targetPath, { recursive: true });
        copyFolderRecursive(sourcePath, targetPath);

        return { success: true, extension: manifest };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error during local installation'
        };
    }
}

export type { AvailableExtension, InstallResult };
