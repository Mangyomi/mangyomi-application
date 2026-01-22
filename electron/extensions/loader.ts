import path from 'path';
import fs from 'fs';
import type { MangaExtension, ExtensionManifest } from './types';
import { executeInSandbox, destroySandbox, getSandboxedExtension, registerExtensionMetadata, setActiveExtension, clearActiveExtension, isSandboxReady } from './sandbox/sandboxRunner';

const extensions: Map<string, MangaExtension> = new Map();

export async function loadExtensions(extensionsPath: string): Promise<void> {
    if (!fs.existsSync(extensionsPath)) {
        console.log('Extensions directory does not exist, creating:', extensionsPath);
        fs.mkdirSync(extensionsPath, { recursive: true });
        return;
    }

    const dirs = fs.readdirSync(extensionsPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

    for (const dir of dirs) {
        const extPath = path.join(extensionsPath, dir);
        const manifestPath = path.join(extPath, 'manifest.json');
        const indexPath = path.join(extPath, 'index.js');

        if (!fs.existsSync(manifestPath) || !fs.existsSync(indexPath)) {
            console.warn(`Skipping ${dir}: missing manifest.json or index.js`);
            continue;
        }

        try {
            const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
            const manifest: ExtensionManifest = JSON.parse(manifestContent);

            // Register metadata for lazy loading (sandbox created on first use)
            registerExtensionMetadata(manifest.id, manifest, extPath);

            let resolvedIcon: string | undefined;
            if (manifest.icon) {
                if (typeof manifest.icon === 'string') {
                    resolvedIcon = manifest.icon.startsWith('http')
                        ? manifest.icon
                        : path.join(extPath, manifest.icon);
                } else {
                    const iconObj = manifest.icon;
                    const iconFile = iconObj.svg || iconObj.png;
                    if (iconFile) {
                        resolvedIcon = iconFile.startsWith('http')
                            ? iconFile
                            : path.join(extPath, iconFile);
                    }
                }
            }

            const extension: MangaExtension = {
                ...manifest,
                icon: resolvedIcon,
                language: manifest.lang || manifest.language || 'en', // Map lang to language
                getImageHeaders: () => {
                    return { 'Referer': manifest.baseUrl + '/' };
                },
                getFilters: async () => {
                    try {
                        return await executeInSandbox(manifest.id, 'getFilters', []);
                    } catch {
                        return [];
                    }
                },
                getPopularManga: async (page, filters) => {
                    return executeInSandbox(manifest.id, 'getPopularManga', [page, filters || {}]);
                },
                getLatestManga: async (page, filters) => {
                    return executeInSandbox(manifest.id, 'getLatestManga', [page, filters || {}]);
                },
                searchManga: async (query, page, filters) => {
                    return executeInSandbox(manifest.id, 'searchManga', [query, page, filters || {}]);
                },
                getMangaDetails: async (mangaId) => {
                    return executeInSandbox(manifest.id, 'getMangaDetails', [mangaId]);
                },
                getChapterList: async (mangaId) => {
                    return executeInSandbox(manifest.id, 'getChapterList', [mangaId]);
                },
                getChapterPages: async (chapterId) => {
                    return executeInSandbox(manifest.id, 'getChapterPages', [chapterId]);
                },
                // Check if extension supports streaming (for main.ts to decide)
                getChapterPagesStreaming: async (chapterId, onProgress) => {
                    // Can't relay callbacks through sandbox IPC, so fallback to batch
                    const pages = await executeInSandbox(manifest.id, 'getChapterPages', [chapterId]) as string[];
                    onProgress(pages, true);
                },
                getMangaCover: async (mangaId) => {
                    // Don't create sandbox just for cover fetch (passive operation)
                    // Only use existing sandbox to avoid spawning processes for history views
                    if (!isSandboxReady(manifest.id)) {
                        return null;
                    }
                    try {
                        return await executeInSandbox(manifest.id, 'getMangaCover', [mangaId]);
                    } catch {
                        return null; // Method not implemented or failed
                    }
                },
                normalizeTachiURL: async (rawUrl, title) => {
                    try {
                        return await executeInSandbox(manifest.id, 'normalizeTachiURL', [rawUrl, title]);
                    } catch (e) {
                        console.warn(`[Loader] normalizeTachiURL failed for ${manifest.id}:`, (e as Error).message);
                        return rawUrl; // Method not implemented, return original
                    }
                },
                getTachiyomiSourceNames: async () => {
                    try {
                        const result = await executeInSandbox(manifest.id, 'getTachiyomiSourceNames', []);
                        return result as string[] | undefined;
                    } catch {
                        return undefined; // Method not implemented
                    }
                },
                getImageUrl: async (pageUrl: string) => {
                    try {
                        return await executeInSandbox(manifest.id, 'getImageUrl', [pageUrl]);
                    } catch (e) {
                        // Silently return original URL if getImageUrl not implemented
                        // Only log actual errors (not "Function not found")
                        const msg = (e as Error).message;
                        if (!msg.includes('not found')) {
                            console.warn(`[Loader] getImageUrl failed for ${manifest.id}:`, msg);
                        }
                        return pageUrl; // Fallback - return original URL
                    }
                },
            };

            extensions.set(extension.id, extension);
            console.log(`Registered extension: ${extension.name} v${extension.version} (sandbox created on first use)`);
        } catch (error) {
            console.error(`Failed to load extension ${dir}:`, error);
        }
    }

    console.log(`Registered ${extensions.size} extension(s) for lazy loading`);
}

// Re-export active extension functions for IPC
export { setActiveExtension, clearActiveExtension };

export function getExtension(id: string): MangaExtension | undefined {
    return extensions.get(id);
}

export function getAllExtensions(): MangaExtension[] {
    return Array.from(extensions.values());
}

export function hasExtension(id: string): boolean {
    return extensions.has(id);
}

export function unloadExtension(id: string): boolean {
    if (!extensions.has(id)) {
        return false;
    }
    destroySandbox(id);
    extensions.delete(id);
    return true;
}

export async function reloadExtensions(extensionsPath: string): Promise<void> {
    for (const id of extensions.keys()) {
        destroySandbox(id);
    }
    extensions.clear();
    await loadExtensions(extensionsPath);
}
