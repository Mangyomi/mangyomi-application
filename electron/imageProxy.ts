import { protocol, net } from 'electron';
import { getExtension } from './extensions/loader';
import { imageCache } from './cache/imageCache';

interface NetworkEntry {
    timestamp: string;
    method: string;
    url: string;
    status?: number;
    duration?: number;
    error?: string;
}

const MAX_NETWORK_ENTRIES = 300;
const mainNetworkActivity: NetworkEntry[] = [];

export function captureNetworkRequest(entry: NetworkEntry) {
    mainNetworkActivity.push(entry);
    if (mainNetworkActivity.length > MAX_NETWORK_ENTRIES) {
        mainNetworkActivity.shift();
    }
}

export function getFormattedMainNetwork(): string {
    if (mainNetworkActivity.length === 0) return 'No main process network activity captured.';
    return mainNetworkActivity
        .map(n => {
            const status = n.status ? `${n.status}` : 'FAILED';
            const duration = n.duration ? `${n.duration}ms` : '?';
            const error = n.error ? ` - Error: ${n.error}` : '';
            return `[${n.timestamp}] ${n.method} ${n.url.substring(0, 100)} → ${status} (${duration})${error}`;
        })
        .join('\n');
}

export function setupImageProxy() {
    protocol.handle('manga-image', async (request) => {
        const url = new URL(request.url);
        let imageUrl = decodeURIComponent(url.searchParams.get('url') || '');
        const extensionId = url.searchParams.get('ext') || '';
        const mangaId = url.searchParams.get('manga');
        const chapterId = url.searchParams.get('chapter');

        if (!imageUrl) {
            return new Response('Missing image URL', { status: 400 });
        }

        const startTime = Date.now();
        const entry: NetworkEntry = {
            timestamp: new Date().toISOString(),
            method: 'GET',
            url: imageUrl,
        };

        try {
            // Lazy image URL resolution - extensions can resolve page refs to image URLs
            const ext = getExtension(extensionId);
            if (ext?.getImageUrl) {
                try {
                    const resolvedUrl = await ext.getImageUrl(imageUrl);
                    if (resolvedUrl !== imageUrl) {
                        console.log(`[ImageProxy] Resolved: ${imageUrl} → ${resolvedUrl}`);
                        imageUrl = resolvedUrl;
                    }
                } catch (e) {
                    console.error(`[ImageProxy] getImageUrl failed:`, e);
                    return new Response('Failed to resolve image URL', { status: 500 });
                }
            }

            // Bypass cache for local files (icons)
            if (imageUrl.startsWith('file:') || extensionId === 'local') {
                return net.fetch(imageUrl);
            }

            // Check strict cache (for chapter images)
            if (mangaId && chapterId) {
                const cachedPath = imageCache.getCachedImagePath(imageUrl);
                if (cachedPath) {
                    return net.fetch(`file://${cachedPath}`);
                }
            }

            // Check cover cache
            const cachedCoverPath = imageCache.getCachedCoverPath(imageUrl);
            if (cachedCoverPath) {
                return net.fetch(`file://${cachedCoverPath}`);
            }

            // Fallback check
            if (!mangaId || !chapterId) {
                const cachedPath = imageCache.getCachedImagePath(imageUrl);
                if (cachedPath) {
                    return net.fetch(`file://${cachedPath}`);
                }
            }

            const headers: Record<string, string> = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            };

            if (ext) {
                Object.assign(headers, ext.getImageHeaders());
            }

            try {
                let filePath: string | null;
                if (mangaId && chapterId) {
                    filePath = await imageCache.saveToCache(imageUrl, headers, mangaId, chapterId);
                } else {
                    filePath = await imageCache.saveCover(imageUrl, headers, mangaId || undefined);
                }

                if (filePath === null) {
                    throw new Error('Cache limit reached');
                }

                entry.status = 200;
                entry.duration = Date.now() - startTime;
                captureNetworkRequest(entry);
                return net.fetch(`file://${filePath}`);
            } catch (cacheError) {
                let response = await net.fetch(imageUrl, { headers });

                if (response.status === 403) {
                    const u = new URL(imageUrl);
                    const autoReferer = u.origin + '/';
                    const retryHeaders = { ...headers, 'Referer': autoReferer };
                    response = await net.fetch(imageUrl, { headers: retryHeaders });
                }

                entry.status = response.status;
                entry.duration = Date.now() - startTime;
                captureNetworkRequest(entry);
                return response;
            }
        } catch (error) {
            entry.error = error instanceof Error ? error.message : 'Unknown error';
            entry.duration = Date.now() - startTime;
            captureNetworkRequest(entry);
            console.error('Image proxy error:', error);
            return new Response('Failed to fetch image', { status: 500 });
        }
    });
}
