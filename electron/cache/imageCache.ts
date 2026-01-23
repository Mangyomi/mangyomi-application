import { app, net, nativeImage, session } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { getDatabase } from '../database';
import { createLogger } from '../utils/logger';
import { store } from '../store';

const logger = createLogger('Cache');

// Proxy configuration interface
interface ProxyConfig {
    type: 'http' | 'socks4' | 'socks5';
    ip: string;
    port: number;
    username?: string;
    password?: string;
}

// Track failed proxies to temporarily deprioritize them
const failedProxies = new Map<string, number>(); // proxy key -> failure timestamp
const proxyFailCount = new Map<string, number>(); // proxy key -> consecutive failure count
const PROXY_COOLDOWN_MS = 5000; // 5 second cooldown for first failures (proxy might be SSH tunnel)
const PROXY_LONG_COOLDOWN_MS = 30000; // 30 second cooldown after 3+ failures

// Fast hash for URL to filename (MD5 is 3-5x faster than SHA256, sufficient for cache keys)
const fastHash = (str: string) => crypto.createHash('md5').update(str).digest('hex');

// Get proxy key for tracking
function getProxyKey(proxy: ProxyConfig): string {
    return `${proxy.type}://${proxy.ip}:${proxy.port}`;
}

// Get available proxies (excluding recently failed ones)
function getAvailableProxies(): ProxyConfig[] {
    const proxies = store.get('proxies', []) as ProxyConfig[];
    const now = Date.now();

    return proxies.filter(proxy => {
        const key = getProxyKey(proxy);
        const failTime = failedProxies.get(key);
        if (!failTime) return true;

        const failCount = proxyFailCount.get(key) || 0;
        const cooldown = failCount >= 3 ? PROXY_LONG_COOLDOWN_MS : PROXY_COOLDOWN_MS;

        if ((now - failTime) < cooldown) {
            return false; // Still in cooldown
        }
        return true;
    });
}

// Select a random connection (null = direct connection, ProxyConfig = use proxy)
function selectRandomConnection(): ProxyConfig | null {
    const proxies = getAvailableProxies();
    if (proxies.length === 0) {
        return null; // No proxies available, use direct connection
    }

    // Include direct connection as an option (index 0 = direct)
    const options = [null, ...proxies];
    const randomIndex = Math.floor(Math.random() * options.length);
    return options[randomIndex];
}

// Connection pool management - 6 concurrent per connection (balanced for performance vs rate limiting)
const CONCURRENT_PER_CONNECTION = 6;

// Semaphore for rate limiting per connection
class ConnectionSemaphore {
    private queue: (() => void)[] = [];
    private running: number = 0;

    constructor(private limit: number) { }

    async acquire(): Promise<void> {
        if (this.running < this.limit) {
            this.running++;
            return;
        }
        await new Promise<void>(resolve => this.queue.push(resolve));
        this.running++;
    }

    release(): void {
        this.running--;
        const next = this.queue.shift();
        if (next) next();
    }
}

// Persistent sessions and semaphores for each connection
const connectionSemaphores = new Map<string, ConnectionSemaphore>();
const proxySessions = new Map<string, Electron.Session>();

function getOrCreateSemaphore(connectionKey: string): ConnectionSemaphore {
    if (!connectionSemaphores.has(connectionKey)) {
        connectionSemaphores.set(connectionKey, new ConnectionSemaphore(CONCURRENT_PER_CONNECTION));
    }
    return connectionSemaphores.get(connectionKey)!;
}

async function getOrCreateProxySession(proxy: ProxyConfig): Promise<Electron.Session> {
    const key = getProxyKey(proxy);
    if (!proxySessions.has(key)) {
        // Build proxy URL with optional auth
        let proxyUrl: string;
        if (proxy.username && proxy.password) {
            proxyUrl = `${proxy.type}://${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@${proxy.ip}:${proxy.port}`;
        } else {
            proxyUrl = `${proxy.type}://${proxy.ip}:${proxy.port}`;
        }

        const proxySession = session.fromPartition(`prefetch-proxy-${key}`);
        await proxySession.setProxy({
            proxyRules: proxyUrl,
            proxyBypassRules: ''
        });
        proxySessions.set(key, proxySession);
    }
    return proxySessions.get(key)!;
}

// Round-robin counter for distributing work
let roundRobinIndex = 0;

// Get all available connections (DIRECT + proxies)
function getAllConnections(): (ProxyConfig | null)[] {
    const proxies = getAvailableProxies();
    return [null, ...proxies]; // null = DIRECT
}

// Select next connection round-robin style
function selectNextConnection(): ProxyConfig | null {
    const connections = getAllConnections();
    if (connections.length === 0) return null;

    const connection = connections[roundRobinIndex % connections.length];
    roundRobinIndex++;
    return connection;
}

// Fetch with connection pool (for prefetch)
// Increased retries and added exponential backoff for transient HTTP/2 errors (common with nhentai CDN)
async function proxyFetch(url: string, headers: Record<string, string>, maxRetries: number = 5): Promise<Response> {
    const logLevel = store.get('logLevel', 'warn');
    const shouldLogVerbose = logLevel === 'verbose';

    let lastError: Error | null = null;
    const triedConnections = new Set<string>();

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        // Select connection round-robin
        const proxy = selectNextConnection();
        const connectionKey = proxy ? getProxyKey(proxy) : 'DIRECT';

        // For HTTP/2 errors, allow retrying the same connection after backoff
        const isRetryAfterHttp2Error = lastError?.message?.includes('HTTP2') || lastError?.message?.includes('PROTOCOL_ERROR');
        if (triedConnections.has(connectionKey) && !isRetryAfterHttp2Error) {
            continue;
        }
        triedConnections.add(connectionKey);

        // Exponential backoff: 0ms, 500ms, 1s, 2s, 4s
        if (attempt > 0) {
            const backoffMs = Math.min(500 * Math.pow(2, attempt - 1), 4000);
            await new Promise(r => setTimeout(r, backoffMs));
        }

        // Acquire semaphore slot for this connection
        const semaphore = getOrCreateSemaphore(connectionKey);
        await semaphore.acquire();

        try {
            if (proxy) {
                // Use proxy session
                if (shouldLogVerbose) {
                    logger.verbose(`[Prefetch] Using proxy ${connectionKey} for ${url} (attempt ${attempt + 1}/${maxRetries})`);
                }

                const proxySession = await getOrCreateProxySession(proxy);
                const response = await proxySession.fetch(url, { headers });

                if (response.ok) {
                    if (shouldLogVerbose) {
                        logger.verbose(`[Prefetch] Success via ${connectionKey}: ${response.status}`);
                    }
                    // Reset fail counter on success
                    proxyFailCount.delete(connectionKey);
                    return response;
                } else {
                    throw new Error(`HTTP ${response.status}`);
                }
            } else {
                // Use direct connection
                if (shouldLogVerbose) {
                    logger.verbose(`[Prefetch] Using DIRECT connection for ${url} (attempt ${attempt + 1}/${maxRetries})`);
                }

                const response = await net.fetch(url, { headers });

                if (response.ok) {
                    if (shouldLogVerbose) {
                        logger.verbose(`[Prefetch] Success via DIRECT: ${response.status}`);
                    }
                    return response;
                } else {
                    throw new Error(`HTTP ${response.status}`);
                }
            }
        } catch (error: any) {
            lastError = error;
            const isHttp2Error = error.message?.includes('HTTP2') || error.message?.includes('PROTOCOL_ERROR');

            if (proxy) {
                // Only cooldown proxy for non-transient errors
                if (!isHttp2Error) {
                    failedProxies.set(connectionKey, Date.now());
                    const currentFails = (proxyFailCount.get(connectionKey) || 0) + 1;
                    proxyFailCount.set(connectionKey, currentFails);
                    const cooldownSecs = currentFails >= 3 ? PROXY_LONG_COOLDOWN_MS / 1000 : PROXY_COOLDOWN_MS / 1000;
                    if (shouldLogVerbose) {
                        logger.verbose(`[Prefetch] Proxy ${connectionKey} failed (${currentFails}x): ${error.message}. Cooldown for ${cooldownSecs}s`);
                    }
                } else if (shouldLogVerbose) {
                    logger.verbose(`[Prefetch] Proxy ${connectionKey} failed: ${error.message} (will retry)`);
                }
            } else {
                if (shouldLogVerbose) {
                    logger.verbose(`[Prefetch] DIRECT connection failed: ${error.message}${isHttp2Error ? ' (will retry)' : ''}`);
                }
            }
        } finally {
            semaphore.release();
        }
    }

    throw lastError || new Error('All connection attempts failed');
}

class ImageCache {
    private cacheDir: string = '';
    private coverCacheDir: string = '';
    private initialized: boolean = false;
    private maxCacheSize: number = 1024 * 1024 * 1024; // Default 1GB
    private isPruning: boolean = false;
    private coverTTL: number = 24 * 60 * 60; // 24 hours in seconds

    constructor() {
        // Delay path initialization until app is ready
    }

    init() {
        if (this.initialized) return;

        // Now safe to call app.getPath() since app is ready
        this.cacheDir = path.join(app.getPath('userData'), 'cache', 'images');
        this.coverCacheDir = path.join(app.getPath('userData'), 'cache', 'covers');

        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
        if (!fs.existsSync(this.coverCacheDir)) {
            fs.mkdirSync(this.coverCacheDir, { recursive: true });
        }
        this.initialized = true;
    }

    setLimit(bytes: number) {
        this.maxCacheSize = bytes;
        this.prune(); // Prune immediately if new limit is smaller
    }

    async getCacheSize(): Promise<number> {
        try {
            const db = getDatabase();
            const result = db.prepare('SELECT SUM(size) as total FROM image_cache').get() as { total: number };
            return result?.total || 0;
        } catch (e) {
            console.error('Failed to get cache size from DB:', e);
            return 0;
        }
    }

    getMangaCacheCount(mangaId: string): number {
        try {
            const db = getDatabase();
            const result = db.prepare('SELECT COUNT(*) as count FROM image_cache WHERE manga_id = ?').get(mangaId) as { count: number };
            return result?.count || 0;
        } catch (e) {
            console.error('Failed to get manga cache count:', e);
            return 0;
        }
    }

    getCachedImagePath(url: string): string | null {
        if (!this.initialized) this.init();

        const hash = fastHash(url);
        const filePath = path.join(this.cacheDir, hash);

        if (fs.existsSync(filePath)) {
            // Touch cached_at to mark as recently used
            try {
                const db = getDatabase();
                db.prepare('UPDATE image_cache SET cached_at = strftime(\'%s\', \'now\') WHERE url = ?').run(url);
            } catch (e) { /* ignore db lock errors on read */ }
            return filePath;
        }
        return null;
    }

    // Cover caching with TTL
    getCachedCoverPath(url: string): string | null {
        if (!this.initialized) this.init();

        const hash = fastHash(url);
        const metaPath = path.join(this.coverCacheDir, `${hash}.meta`);

        if (fs.existsSync(metaPath)) {
            try {
                const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                const now = Math.floor(Date.now() / 1000);

                // Check if TTL has expired
                if (meta.cachedAt + this.coverTTL > now) {
                    // Use stored filePath or fallback to .jpg
                    const filePath = meta.filePath || path.join(this.coverCacheDir, `${hash}.jpg`);
                    if (fs.existsSync(filePath)) {
                        return filePath; // Still valid
                    }
                }
                // Expired or file missing - cleanup
                try { fs.unlinkSync(metaPath); } catch (e) { }
                try { fs.unlinkSync(path.join(this.coverCacheDir, `${hash}.jpg`)); } catch (e) { }
                try { fs.unlinkSync(path.join(this.coverCacheDir, hash)); } catch (e) { }
            } catch (e) {
                // Invalid meta
                try { fs.unlinkSync(metaPath); } catch (e) { }
            }
        }
        return null;
    }

    async saveCover(url: string, headers: Record<string, string>, mangaId: string = 'UNKNOWN'): Promise<string> {
        if (!this.initialized) this.init();

        const hash = fastHash(url);
        const metaPath = path.join(this.coverCacheDir, `${hash}.meta`);
        const db = getDatabase();

        try {
            // Try net.fetch first
            let response = await net.fetch(url, { headers });

            // If 403, retry with extensions session to share Cloudflare cookies from browserFetch
            if (response.status === 403) {
                console.log(`[ImageCache] Cover fetch got 403; retrying with extensions session: ${url}`);
                const extensionsSession = session.fromPartition('persist:extensions');
                response = await extensionsSession.fetch(url, {
                    headers: {
                        ...headers,
                        'Referer': new URL(url).origin + '/',
                    }
                });
                console.log(`[ImageCache] Extensions session retry result: ${response.status}`);
            }

            if (!response.ok) {
                console.log(`[ImageCache] Cover fetch failed with status ${response.status} for: ${url}`);
                throw new Error(`Failed to fetch ${url}: ${response.status}`);
            }

            const buffer = await response.arrayBuffer();
            const originalData = Buffer.from(buffer);

            // Try to compress to 75% quality JPEG
            let filePath = path.join(this.coverCacheDir, `${hash}.jpg`);
            let dataToSave: Buffer | Uint8Array = originalData;

            try {
                const image = nativeImage.createFromBuffer(originalData);
                if (!image.isEmpty()) {
                    const compressedData = image.toJPEG(75);
                    if (compressedData.length > 0) {
                        dataToSave = compressedData;
                    }
                }
            } catch (compressError) {
                // Compression failed, use original
                console.log('Cover compression failed, using original:', url);
                // Keep original extension for non-JPEG compatible formats
                filePath = path.join(this.coverCacheDir, hash);
            }

            await fs.promises.writeFile(filePath, dataToSave);
            await fs.promises.writeFile(metaPath, JSON.stringify({
                url,
                filePath, // Store actual path used
                cachedAt: Math.floor(Date.now() / 1000)
            }));

            // Register in DB for size calculation
            try {
                db.prepare(`
                    INSERT OR REPLACE INTO image_cache (url, hash, manga_id, chapter_id, size, cached_at)
                    VALUES (@url, @hash, @manga_id, @chapter_id, @size, strftime('%s', 'now'))
                `).run({
                    url: url,
                    hash: hash,
                    manga_id: mangaId,
                    chapter_id: 'COVER', // Special chapter ID for covers
                    size: dataToSave.length
                });
            } catch (dbError) {
                console.error('Failed to register cover in DB:', dbError);
            }

            return filePath;
        } catch (error) {
            console.error('Failed to cache cover:', url, error);
            throw error;
        }
    }

    private pruneTimeout: NodeJS.Timeout | null = null;

    private schedulePrune() {
        if (this.pruneTimeout) {
            clearTimeout(this.pruneTimeout);
        }
        // Debounce pruning to 5 seconds after last write to avoid stalling downloads
        this.pruneTimeout = setTimeout(() => {
            this.prune();
        }, 5000);
    }

    private async prune() {
        if (this.isPruning) return;
        this.isPruning = true;
        this.pruneTimeout = null;

        try {
            const db = getDatabase();

            // Get total size
            const result = db.prepare('SELECT SUM(size) as total FROM image_cache').get() as { total: number };
            let currentSize = result?.total || 0;

            if (currentSize <= this.maxCacheSize) {
                this.isPruning = false;
                return;
            }

            logger.info(`Pruning cache: Current ${Math.round(currentSize / 1024 / 1024)}MB > Limit ${Math.round(this.maxCacheSize / 1024 / 1024)}MB`);

            // Find oldest files to delete
            // Delete in chunks
            const rows = db.prepare('SELECT url, hash, size FROM image_cache ORDER BY cached_at ASC LIMIT 50').all() as { url: string, hash: string, size: number }[];

            if (rows.length === 0) {
                this.isPruning = false;
                return;
            }

            const deletePromises = rows.map(async (row) => {
                if (currentSize <= this.maxCacheSize) return; // Optimization: stop if we dip under (approx)

                const filePath = path.join(this.cacheDir, row.hash);
                try {
                    await fs.promises.unlink(filePath);
                } catch (e) {
                    // Ignore
                }

                db.prepare('DELETE FROM image_cache WHERE url = ?').run(row.url);
                currentSize -= row.size;
            });

            await Promise.all(deletePromises);

            // Recurse if still over limit (but yield to event loop via simple timeout)
            if (currentSize > this.maxCacheSize) {
                setTimeout(() => {
                    this.isPruning = false;
                    this.prune();
                }, 100);
                return;
            }

        } catch (e) {
            console.error('[Cache] Prune failed:', e);
        } finally {
            this.isPruning = false;
        }
    }

    private pendingRequests: Map<string, Promise<string>> = new Map();

    async saveToCache(url: string, headers: Record<string, string>, mangaId: string, chapterId: string, isPrefetch: boolean = false): Promise<string | null> {
        if (!this.initialized) this.init();

        // For prefetch: check if over cache limit and stop if so (unless user enabled ignore limit)
        if (isPrefetch) {
            const currentSize = await this.getCacheSize();
            if (currentSize >= this.maxCacheSize) {
                // Check if user wants to ignore cache limit for prefetch
                // Use statically imported store
                const ignoreCacheLimitForPrefetch = store.get('ignoreCacheLimitForPrefetch', false);

                if (!ignoreCacheLimitForPrefetch) {
                    logger.verbose('Prefetch skipped - cache limit reached');
                    return null; // Signal to caller that prefetch should stop
                }
                logger.verbose('Cache limit reached but ignoreCacheLimitForPrefetch is enabled - continuing');
                // else: ignore the limit and continue with prefetch
            }
        }

        // Check if there's already a pending request for this URL
        if (this.pendingRequests.has(url)) {
            try {
                return await this.pendingRequests.get(url)!;
            } catch (e) {
                // If the pending request failed, we'll try again below
                this.pendingRequests.delete(url);
            }
        }

        const requestPromise = (async () => {
            const hash = fastHash(url);
            const filePath = path.join(this.cacheDir, hash);
            const db = getDatabase();

            // 1. Check if already cached
            if (fs.existsSync(filePath)) {
                try {
                    // Update registry to link this image to this chapter (if not already)
                    // and update timestamp
                    db.prepare(`
                        INSERT INTO image_cache (url, hash, manga_id, chapter_id, size, cached_at)
                        VALUES (@url, @hash, @manga_id, @chapter_id, @size, strftime('%s', 'now'))
                        ON CONFLICT(url) DO UPDATE SET
                        cached_at = strftime('%s', 'now')
                    `).run({
                        url: url,
                        hash: hash,
                        manga_id: mangaId,
                        chapter_id: chapterId,
                        size: fs.statSync(filePath).size
                    });
                } catch (e) { console.error('Cache DB update failed', e); }
                return filePath;
            }

            // 2. Download - use proxyFetch for prefetch, net.fetch for regular
            try {
                const response = isPrefetch
                    ? await proxyFetch(url, headers)
                    : await net.fetch(url, { headers });
                if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);

                const buffer = await response.arrayBuffer();
                const data = new Uint8Array(buffer);

                await fs.promises.writeFile(filePath, data);

                // 3. Register in DB
                db.prepare(`
                    INSERT OR REPLACE INTO image_cache (url, hash, manga_id, chapter_id, size, cached_at)
                    VALUES (@url, @hash, @manga_id, @chapter_id, @size, strftime('%s', 'now'))
                `).run({
                    url: url,
                    hash: hash,
                    manga_id: mangaId,
                    chapter_id: chapterId,
                    size: data.length
                });

                // 4. Prune Check - only for non-prefetch saves
                if (!isPrefetch) {
                    this.schedulePrune();
                }

                return filePath;
            } catch (error) {
                console.error('Failed to cache image:', url, error);
                throw error;
            }
        })();

        this.pendingRequests.set(url, requestPromise);

        try {
            const result = await requestPromise;
            return result;
        } finally {
            this.pendingRequests.delete(url);
        }
    }

    async clearCache(mangaId?: string) {
        const db = getDatabase();

        if (mangaId) {
            // Delete specific manga images
            const rows = db.prepare('SELECT hash, chapter_id FROM image_cache WHERE manga_id = ?').all(mangaId) as { hash: string, chapter_id: string }[];
            const deletionPromises = rows.map(async (row) => {
                // Determine path based on type
                let filePath: string;
                if (row.chapter_id === 'COVER') {
                    // Covers might have .jpg extension or not, check both or metadata?
                    // saveCover saves as .jpg usually.
                    // Simplest is to try deleting likely paths.
                    const jpgPath = path.join(this.coverCacheDir, `${row.hash}.jpg`);
                    const rawPath = path.join(this.coverCacheDir, row.hash);
                    const metaPath = path.join(this.coverCacheDir, `${row.hash}.meta`);

                    try { await fs.promises.unlink(jpgPath); } catch (e) { }
                    try { await fs.promises.unlink(rawPath); } catch (e) { }
                    try { await fs.promises.unlink(metaPath); } catch (e) { }
                    return;
                } else {
                    filePath = path.join(this.cacheDir, row.hash);
                }

                try {
                    await fs.promises.unlink(filePath);
                } catch (e) {
                    // Ignore if file already gone
                }
            });
            await Promise.all(deletionPromises);
            db.prepare('DELETE FROM image_cache WHERE manga_id = ?').run(mangaId);
        } else {
            // Clear Images
            if (fs.existsSync(this.cacheDir)) {
                try {
                    await fs.promises.rm(this.cacheDir, { recursive: true, force: true });
                    await fs.promises.mkdir(this.cacheDir, { recursive: true });
                } catch (e) {
                    console.error('Failed to clear cache dir:', e);
                }
            }

            // Clear Covers
            if (fs.existsSync(this.coverCacheDir)) {
                try {
                    await fs.promises.rm(this.coverCacheDir, { recursive: true, force: true });
                    await fs.promises.mkdir(this.coverCacheDir, { recursive: true });
                } catch (e) {
                    console.error('Failed to clear cover cache dir:', e);
                }
            }

            db.prepare('DELETE FROM image_cache').run();
            // Also clear chapter page URL cache
            try {
                db.prepare('DELETE FROM chapter_pages').run();
            } catch (e) {
                // Table might not exist in older databases
            }
        }
    }
}

export const imageCache = new ImageCache();
