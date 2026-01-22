import { BrowserWindow, session, net } from 'electron';
import path from 'path';
import fs from 'fs';
import type { ExtensionManifest } from '../types';
import { createLogger } from '../../utils/logger';

const log = createLogger('Sandbox');

interface SandboxedExtension {
    id: string;
    manifest: ExtensionManifest;
    window: BrowserWindow;
    ready: boolean;
    lastUsedTime: number;
}

// Metadata for lazy loading (no BrowserWindow yet)
interface ExtensionMetadata {
    id: string;
    manifest: ExtensionManifest;
    extensionPath: string;
}

const sandboxedExtensions: Map<string, SandboxedExtension> = new Map();
const extensionMetadata: Map<string, ExtensionMetadata> = new Map();

// Extensions the user is actively browsing (kept alive)
const activeExtensions: Set<string> = new Set();

// Idle timeout for sandbox cleanup (5 minutes)
const SANDBOX_IDLE_TIMEOUT = 5 * 60 * 1000;
let cleanupInterval: NodeJS.Timeout | null = null;

// Module-level lock for Cloudflare requests to prevent duplicates across all sandboxes
const activeCloudflareRequests: Map<string, number> = new Map(); // URL -> timestamp

// Pending browser fetch requests (URL -> resolve callback)
const pendingBrowserFetches: Map<string, { resolve: (result: any) => void; reject: (error: any) => void }> = new Map();

let sandboxIdCounter = 0;

// Pending sandbox creations (to prevent parallel creation race conditions)
const pendingSandboxCreations: Map<string, Promise<SandboxedExtension>> = new Map();

// Callbacks for streaming pages (progressive loading)
const streamingPagesCallbacks: Map<string, (data: { pages: string[], done: boolean, total?: number }) => void> = new Map();

// Cancellation tokens for streaming (extensionId -> cancelled flag)
const streamingCancelled: Map<string, boolean> = new Map();

// Register a callback for streaming pages from an extension
export function registerStreamingPagesCallback(extensionId: string, callback: (data: { pages: string[], done: boolean, total?: number }) => void) {
    streamingCancelled.set(extensionId, false); // Reset cancellation when starting new stream
    streamingPagesCallbacks.set(extensionId, callback);

    // Also reset the flag in the sandbox
    const sandbox = sandboxedExtensions.get(extensionId);
    if (sandbox?.window && !sandbox.window.isDestroyed()) {
        sandbox.window.webContents.executeJavaScript(`window.__STREAMING_CANCELLED__ = false;`).catch(() => { });
    }
}

// Unregister callback and mark as cancelled
export function unregisterStreamingPagesCallback(extensionId: string) {
    streamingPagesCallbacks.delete(extensionId);
    streamingCancelled.set(extensionId, true);

    // Notify the sandbox that streaming is cancelled
    const sandbox = sandboxedExtensions.get(extensionId);
    if (sandbox?.window && !sandbox.window.isDestroyed()) {
        sandbox.window.webContents.executeJavaScript(`window.__STREAMING_CANCELLED__ = true;`).catch(() => { });
    }
}

// Check if streaming is cancelled for an extension
export function isStreamingCancelled(extensionId: string): boolean {
    return streamingCancelled.get(extensionId) ?? false;
}

// Get or create a shared session for all extensions
function getSharedExtensionSession() {
    return session.fromPartition('persist:extensions');
}

// Browser-based fetch that can handle Cloudflare JavaScript challenges
async function browserFetch(url: string, allowedDomains: string[]): Promise<{ ok: boolean; status: number; text: string }> {
    // Validate URL against allowed domains
    try {
        const parsedUrl = new URL(url);
        const hostname = parsedUrl.hostname;
        let allowed = false;
        for (const pattern of allowedDomains) {
            if (pattern.startsWith('*.')) {
                const suffix = pattern.slice(1);
                if (hostname.endsWith(suffix) || hostname === pattern.slice(2)) {
                    allowed = true;
                    break;
                }
            } else if (hostname === pattern) {
                allowed = true;
                break;
            }
        }
        if (!allowed) {
            return { ok: false, status: 403, text: 'Domain not allowed: ' + hostname };
        }
    } catch (e) {
        return { ok: false, status: 400, text: 'Invalid URL: ' + url };
    }

    return new Promise((resolve) => {
        const fetchWindow = new BrowserWindow({
            show: false,
            width: 800,
            height: 600,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                session: getSharedExtensionSession(),
                // Disable hardware acceleration to prevent GPU errors
                offscreen: false,
                disableHtmlFullscreenWindowResize: true,
            },
        });

        let resolved = false;
        let checkCount = 0;
        let cloudflareChallenge = false; // Track if Cloudflare challenge is active
        const maxChecks = 90; // 90 seconds max wait (Cloudflare can take time)

        const cleanup = () => {
            if (!fetchWindow.isDestroyed()) {
                fetchWindow.close();
            }
        };

        const checkPage = async () => {
            if (resolved || fetchWindow.isDestroyed()) return;

            checkCount++;
            if (checkCount > maxChecks) {
                resolved = true;
                cleanup();
                resolve({ ok: false, status: 408, text: 'Timeout waiting for page to load' });
                return;
            }

            try {
                const title = fetchWindow.webContents.getTitle();

                // Check if still on Cloudflare challenge
                if (title.includes('Just a moment') || title.includes('Checking') || title.includes('Verify')) {
                    cloudflareChallenge = true;
                    // Show the window so user can solve the challenge
                    if (!fetchWindow.isVisible()) {
                        fetchWindow.setSize(600, 700);
                        fetchWindow.center();
                        fetchWindow.show();
                        fetchWindow.setTitle('Solve Cloudflare Challenge');
                    }
                    setTimeout(checkPage, 1000);
                    return;
                }

                // Cloudflare solved or not present
                cloudflareChallenge = false;

                // If window was shown, hide it now
                if (fetchWindow.isVisible()) {
                    fetchWindow.hide();
                }

                // Page loaded successfully, extract content
                // For JSON responses, the browser wraps content in <pre> tags, so we extract the text
                // For HTML pages, we need the full HTML to be able to parse it
                const content = await fetchWindow.webContents.executeJavaScript(`
                    (function() {
                        // Try to get raw text content (works for JSON responses displayed as text)
                        const preElement = document.querySelector('pre');
                        if (preElement && document.body.children.length === 1) {
                            // This is likely a JSON response, return the text content
                            return preElement.textContent || preElement.innerText;
                        }
                        // For normal HTML pages, return the full HTML
                        return document.documentElement.outerHTML || document.body?.innerHTML || '';
                    })()
                `);

                resolved = true;
                cleanup();
                resolve({ ok: true, status: 200, text: content });
            } catch (e) {
                console.error('[BrowserFetch] Error checking page:', e);
                setTimeout(checkPage, 1000);
            }
        };

        fetchWindow.webContents.on('did-finish-load', () => {
            setTimeout(checkPage, 500); // Give page a moment to execute JS
        });

        // Also start checking periodically in case did-finish-load doesn't fire
        setTimeout(checkPage, 2000);

        fetchWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
            // Only fail if the MAIN FRAME failed to load (ignore 3rd party script failures)
            if (!isMainFrame) {
                console.log(`[BrowserFetch] Ignoring subresource failure: ${validatedURL} (${errorDescription})`);
                return;
            }
            // Don't fail if Cloudflare challenge is being solved - Cloudflare causes redirects
            if (cloudflareChallenge) {
                return;
            }
            if (!resolved) {
                resolved = true;
                cleanup();
                resolve({ ok: false, status: errorCode, text: errorDescription });
            }
        });

        fetchWindow.loadURL(url).catch((err) => {
            if (!resolved && !cloudflareChallenge) {
                resolved = true;
                cleanup();
                resolve({ ok: false, status: 500, text: err.message });
            }
        });
    });
}

export async function createExtensionSandbox(
    extensionPath: string,
    manifest: ExtensionManifest
): Promise<SandboxedExtension> {
    const sandboxId = `sandbox-${manifest.id}-${sandboxIdCounter++}`;

    const sandboxWindow = new BrowserWindow({
        show: false,
        width: 1,
        height: 1,
        webPreferences: {
            sandbox: true,
            nodeIntegration: false,
            contextIsolation: false, // Need false to inject directly into window
            webSecurity: false, // Required for CORS/scraping external sites
            session: getSharedExtensionSession(), // Share session with main window for cookies
        },
    });


    // Set up message handlers for extension requests
    sandboxWindow.webContents.on('console-message', async (_event, level, message) => {
        // Forward regular console messages to main process for debugging
        if (!message.startsWith('__')) {
            const prefix = `[Sandbox:${manifest.id}]`;
            if (level === 0) console.log(prefix, message);
            else if (level === 1) console.info(prefix, message);
            else if (level === 2) console.warn(prefix, message);
            else console.error(prefix, message);
        }

        // Handle streaming pages from extension (progressive page loading)
        if (message.startsWith('__STREAMING_PAGES__:')) {
            const data = JSON.parse(message.replace('__STREAMING_PAGES__:', ''));
            console.log(`[SandboxRunner] Streaming pages received: ${data.pages?.length || 0} pages, done=${data.done}`);
            const callback = streamingPagesCallbacks.get(manifest.id);
            if (callback) {
                console.log(`[SandboxRunner] Calling registered callback for ${manifest.id}`);
                callback(data);
            } else {
                console.warn(`[SandboxRunner] No callback registered for ${manifest.id}`);
            }
            return;
        }

        // Handle browser fetch requests (for Cloudflare-protected sites)
        if (message.startsWith('__BROWSER_FETCH_REQUEST__:')) {
            const requestData = JSON.parse(message.replace('__BROWSER_FETCH_REQUEST__:', ''));
            const { requestId, url } = requestData;

            console.log('[SandboxRunner] Browser fetch request for:', url);

            try {
                const result = await browserFetch(url, allowedDomains);
                // Send result back to sandbox
                try {
                    await sandboxWindow.webContents.executeJavaScript(`
                        window.__BROWSER_FETCH_RESULTS__ = window.__BROWSER_FETCH_RESULTS__ || {};
                        window.__BROWSER_FETCH_RESULTS__[${JSON.stringify(requestId)}] = ${JSON.stringify(result)};
                    `);
                } catch (execErr) {
                    console.error('[SandboxRunner] Error sending result to sandbox:', execErr);
                    // Try with a smaller result if the full HTML is too large
                    await sandboxWindow.webContents.executeJavaScript(`
                        window.__BROWSER_FETCH_RESULTS__ = window.__BROWSER_FETCH_RESULTS__ || {};
                        window.__BROWSER_FETCH_RESULTS__[${JSON.stringify(requestId)}] = { ok: false, status: 500, text: 'Result too large to transfer' };
                    `);
                }
            } catch (e) {
                console.error('[SandboxRunner] browserFetch error:', e);
                sandboxWindow.webContents.executeJavaScript(`
                    window.__BROWSER_FETCH_RESULTS__ = window.__BROWSER_FETCH_RESULTS__ || {};
                    window.__BROWSER_FETCH_RESULTS__[${JSON.stringify(requestId)}] = { ok: false, status: 500, text: ${JSON.stringify((e as Error).message)} };
                `);
            }
            return;
        }

        // Handle server-side fetch requests (fast, uses Electron's net module)
        if (message.startsWith('__SERVER_FETCH_REQUEST__:')) {
            const requestData = JSON.parse(message.replace('__SERVER_FETCH_REQUEST__:', ''));
            const { requestId, url, options } = requestData;

            console.log('[SandboxRunner] Server fetch request for:', url);

            try {
                // Validate domain
                const parsedUrl = new URL(url);
                const hostname = parsedUrl.hostname;
                let allowed = false;
                for (const pattern of allowedDomains) {
                    if (pattern.startsWith('*.')) {
                        const suffix = pattern.slice(1);
                        if (hostname.endsWith(suffix) || hostname === pattern.slice(2)) {
                            allowed = true;
                            break;
                        }
                    } else if (hostname === pattern) {
                        allowed = true;
                        break;
                    }
                }
                if (!allowed) {
                    throw new Error('Domain not allowed: ' + hostname);
                }

                // Use shared extension session's fetch (has Cloudflare cookies)
                const extensionSession = getSharedExtensionSession();

                // Handle both calling conventions:
                // serverFetch(url, { headers: {...} }) or serverFetch(url, { 'Accept': '...', 'Referer': '...' })
                const customHeaders = options?.headers || options || {};

                // Get cookies from session to include in request (ensures CF cookies are used)
                const cookies = await extensionSession.cookies.get({ url });
                const cookieString = cookies.map((c: any) => `${c.name}=${c.value}`).join('; ');
                console.log(`[SandboxRunner] serverFetch cookies for ${url}: ${cookies.length} cookies, CF cookie present: ${cookies.some((c: any) => c.name.startsWith('cf_'))}`);

                const response = await extensionSession.fetch(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': customHeaders.Accept || customHeaders.accept || 'application/json',
                        'Accept-Language': 'en-US,en;q=0.9',
                        ...(cookieString ? { 'Cookie': cookieString } : {}),
                        ...customHeaders,
                    },
                });

                const text = await response.text();
                console.log(`[SandboxRunner] serverFetch response: ${response.status}, length: ${text.length}, starts with: ${text.substring(0, 50)}`);

                // Check for Cloudflare challenge in response
                const isCloudflareChallenge = (
                    response.status === 403 ||
                    response.status === 503 ||
                    text.includes('Just a moment') ||
                    text.includes('cf-browser-verification') ||
                    text.includes('_cf_chl_opt') ||
                    text.includes('challenge-platform')
                );

                if (isCloudflareChallenge) {
                    // Solve Cloudflare by loading a page that will trigger the challenge
                    // For API URLs like /api/manga/slug/chapters, load /manga/slug
                    const baseUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}`;
                    let solveUrl = baseUrl;

                    // Extract manga page URL from API path
                    const apiMatch = parsedUrl.pathname.match(/\/api\/manga\/([^\/]+)/);
                    if (apiMatch) {
                        solveUrl = `${baseUrl}/manga/${apiMatch[1]}`;
                    }

                    console.log('[SandboxRunner] Cloudflare detected on API, solving via:', solveUrl);

                    // This will show the CF challenge window if needed
                    await browserFetch(solveUrl, allowedDomains);

                    // Retry the API request with the now-valid session cookies
                    console.log('[SandboxRunner] Retrying API after CF solve:', url);

                    // Get fresh cookies after CF solve
                    const retryCookies = await extensionSession.cookies.get({ url });
                    const retryCookieString = retryCookies.map((c: any) => `${c.name}=${c.value}`).join('; ');
                    console.log(`[SandboxRunner] Retry cookies: ${retryCookies.length} cookies, CF cookie present: ${retryCookies.some((c: any) => c.name.startsWith('cf_'))}`);

                    const retryResponse = await extensionSession.fetch(url, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            'Accept': customHeaders.Accept || customHeaders.accept || 'application/json',
                            'Accept-Language': 'en-US,en;q=0.9',
                            ...(retryCookieString ? { 'Cookie': retryCookieString } : {}),
                            ...customHeaders,
                        },
                    });

                    const retryText = await retryResponse.text();
                    console.log(`[SandboxRunner] Retry response: ${retryResponse.status}, length: ${retryText.length}, starts with: ${retryText.substring(0, 50)}`);
                    const retryResult = { ok: retryResponse.ok, status: retryResponse.status, text: retryText };

                    await sandboxWindow.webContents.executeJavaScript(`
                        window.__SERVER_FETCH_RESULTS__ = window.__SERVER_FETCH_RESULTS__ || {};
                        window.__SERVER_FETCH_RESULTS__[${JSON.stringify(requestId)}] = ${JSON.stringify(retryResult)};
                    `);
                    return;
                }

                const result = { ok: response.ok, status: response.status, text };

                await sandboxWindow.webContents.executeJavaScript(`
                    window.__SERVER_FETCH_RESULTS__ = window.__SERVER_FETCH_RESULTS__ || {};
                    window.__SERVER_FETCH_RESULTS__[${JSON.stringify(requestId)}] = ${JSON.stringify(result)};
                `);
            } catch (e) {
                console.error('[SandboxRunner] serverFetch error:', e);
                await sandboxWindow.webContents.executeJavaScript(`
                    window.__SERVER_FETCH_RESULTS__ = window.__SERVER_FETCH_RESULTS__ || {};
                    window.__SERVER_FETCH_RESULTS__[${JSON.stringify(requestId)}] = { ok: false, status: 500, text: ${JSON.stringify((e as Error).message)} };
                `);
            }
            return;
        }

        // Handle Cloudflare solver requests (legacy, for manual solving)
        if (message.startsWith('__CLOUDFLARE_REQUEST__:')) {
            const url = message.replace('__CLOUDFLARE_REQUEST__:', '');

            // Prevent duplicate requests using module-level lock with 5s debounce
            const lastRequest = activeCloudflareRequests.get(url);
            const now = Date.now();
            if (lastRequest && (now - lastRequest) < 5000) {
                console.log('[SandboxRunner] Cloudflare request debounced (5s), ignoring:', url);
                return;
            }

            activeCloudflareRequests.set(url, now);
            console.log('[SandboxRunner] Cloudflare request received for:', url);

            try {
                // Get the main window
                const allWindows = BrowserWindow.getAllWindows();
                const mainWindow = allWindows.find(w => !w.isDestroyed() && w !== sandboxWindow && w.isVisible());

                if (!mainWindow) {
                    sandboxWindow.webContents.executeJavaScript(`
                        window.__CLOUDFLARE_RESULT__ = { success: false, message: 'Main window not found' };
                    `);
                    return;
                }

                // Open the solver window
                const solverWin = new BrowserWindow({
                    width: 600,
                    height: 700,
                    parent: mainWindow,
                    modal: true,
                    webPreferences: {
                        nodeIntegration: false,
                        contextIsolation: true,
                        session: getSharedExtensionSession() // Use same session as sandbox
                    },
                    autoHideMenuBar: true,
                    title: 'Solve Cloudflare Challenge'
                });

                let resolved = false;
                const checkInterval = setInterval(async () => {
                    if (solverWin.isDestroyed()) {
                        clearInterval(checkInterval);
                        if (!resolved) {
                            resolved = true;
                            sandboxWindow.webContents.executeJavaScript(`
                                window.__CLOUDFLARE_RESULT__ = { success: false, message: 'Window closed' };
                            `);
                        }
                        return;
                    }

                    try {
                        const title = solverWin.webContents.getTitle();
                        if (!title.includes('Just a moment') && !title.includes('moment')) {
                            const cookies = await solverWin.webContents.session.cookies.get({ url });
                            const cookieString = cookies.map((c: any) => `${c.name}=${c.value}`).join('; ');

                            if (!resolved) {
                                resolved = true;
                                clearInterval(checkInterval);

                                // Set cookies in sandbox session too
                                for (const cookie of cookies) {
                                    try {
                                        await sandboxWindow.webContents.session.cookies.set({
                                            url,
                                            name: cookie.name,
                                            value: cookie.value,
                                            domain: cookie.domain,
                                            path: cookie.path,
                                            secure: cookie.secure,
                                            httpOnly: cookie.httpOnly,
                                            expirationDate: cookie.expirationDate,
                                        });
                                    } catch (e) { /* ignore */ }
                                }

                                solverWin.close();
                                sandboxWindow.webContents.executeJavaScript(`
                                    window.__CLOUDFLARE_RESULT__ = { success: true, cookies: ${JSON.stringify(cookieString)} };
                                `);
                            }
                        }
                    } catch (e) {
                        console.error('[SandboxRunner] Check error:', e);
                    }
                }, 1000);

                // Timeout after 2 minutes
                setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        clearInterval(checkInterval);
                        if (!solverWin.isDestroyed()) solverWin.close();
                        sandboxWindow.webContents.executeJavaScript(`
                            window.__CLOUDFLARE_RESULT__ = { success: false, message: 'Timeout' };
                        `);
                    }
                }, 120000);

                solverWin.on('closed', () => {
                    if (!resolved) {
                        resolved = true;
                        clearInterval(checkInterval);
                        sandboxWindow.webContents.executeJavaScript(`
                            window.__CLOUDFLARE_RESULT__ = { success: false, message: 'Window closed by user' };
                        `);
                    }
                });

                solverWin.loadURL(url);
            } catch (e) {
                console.error('[SandboxRunner] Cloudflare solve error:', e);
                sandboxWindow.webContents.executeJavaScript(`
                    window.__CLOUDFLARE_RESULT__ = { success: false, message: ${JSON.stringify((e as Error).message)} };
                `);
            }
        }
    });

    const extensionCode = fs.readFileSync(
        path.join(extensionPath, 'index.js'),
        'utf-8'
    );

    const allowedDomains = extractAllowedDomains(manifest);

    // Use inline HTML with data URI for portability
    const sandboxHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-eval' 'unsafe-inline'; connect-src *; script-src 'self' 'unsafe-eval' 'unsafe-inline'; font-src *; img-src * data: blob:;">
    <title>Extension Sandbox</title>
</head>
<body></body>
</html>`;

    await sandboxWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(sandboxHtml)}`);

    // Inject safe APIs and block dangerous globals
    await sandboxWindow.webContents.executeJavaScript(`
        // Block dangerous globals first
        delete window.require;
        delete window.process;
        delete window.__dirname;
        delete window.__filename;
        delete window.Buffer;
        delete window.global;
        delete window.module;
        delete window.exports;
        
        // Store allowed domains for fetch verification
        window.__ALLOWED_DOMAINS__ = ${JSON.stringify(allowedDomains)};
        window.__EXTENSION_ID__ = ${JSON.stringify(manifest.id)};
        window.__BASE_URL__ = ${JSON.stringify(manifest.baseUrl)};
        
        // Create safe fetch that checks allowed domains
        const originalFetch = window.fetch.bind(window);
        
        function isDomainAllowed(url, allowedDomains) {
            try {
                const parsedUrl = new URL(url);
                const hostname = parsedUrl.hostname;
                for (const pattern of allowedDomains) {
                    if (pattern.startsWith('*.')) {
                        const suffix = pattern.slice(1);
                        if (hostname.endsWith(suffix) || hostname === pattern.slice(2)) {
                            return true;
                        }
                    } else if (hostname === pattern) {
                        return true;
                    }
                }
                return false;
            } catch {
                return false;
            }
        }
        
        
        window.fetch = async function(input, init) {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
            if (!isDomainAllowed(url, window.__ALLOWED_DOMAINS__)) {
                throw new Error('Fetch blocked: domain not in allowed list. URL: ' + url);
            }
            // Include credentials if they were set by Cloudflare session
            return originalFetch(input, { ...init, credentials: 'include' });
        };
        
        // Provide parseHTML function (browser-native DOMParser)
        window.parseHTML = function(html) {
            const parser = new DOMParser();
            return parser.parseFromString(html, 'text/html');
        };
        
        // Provide requestCloudflareSession function for bypassing Cloudflare
        // Uses console.log messaging to communicate with main process
        window.requestCloudflareSession = function(url) {
            return new Promise((resolve) => {
                // Clear any previous result
                window.__CLOUDFLARE_RESULT__ = null;
                
                // Send request via console.log (main process listens for this)
                console.log('__CLOUDFLARE_REQUEST__:' + url);
                
                // Poll for result
                const checkResult = setInterval(() => {
                    if (window.__CLOUDFLARE_RESULT__) {
                        clearInterval(checkResult);
                        resolve(window.__CLOUDFLARE_RESULT__);
                        window.__CLOUDFLARE_RESULT__ = null;
                    }
                }, 100);
                
                // Timeout after 3 minutes
                setTimeout(() => {
                    clearInterval(checkResult);
                    if (!window.__CLOUDFLARE_RESULT__) {
                        resolve({ success: false, message: 'Timeout waiting for Cloudflare solve' });
                    }
                }, 180000);
            });
        };
        
        // Provide browserFetch function for loading pages in a real browser context
        // This can bypass Cloudflare JavaScript challenges
        let __browserFetchCounter = 0;
        window.__BROWSER_FETCH_RESULTS__ = {};
        
        window.browserFetch = function(url) {
            return new Promise((resolve, reject) => {
                const requestId = 'req_' + (++__browserFetchCounter);
                
                // Send request via console.log (main process listens for this)
                console.log('__BROWSER_FETCH_REQUEST__:' + JSON.stringify({ requestId, url }));
                
                // Poll for result
                const checkResult = setInterval(() => {
                    if (window.__BROWSER_FETCH_RESULTS__[requestId]) {
                        clearInterval(checkResult);
                        const result = window.__BROWSER_FETCH_RESULTS__[requestId];
                        delete window.__BROWSER_FETCH_RESULTS__[requestId];
                        
                        // Create a Response-like object
                        resolve({
                            ok: result.ok,
                            status: result.status,
                            text: () => Promise.resolve(result.text),
                            json: () => Promise.resolve(JSON.parse(result.text)),
                        });
                    }
                }, 100);
                
                // Timeout after 35 seconds (browserFetch has 30s internal timeout)
                setTimeout(() => {
                    clearInterval(checkResult);
                    if (!window.__BROWSER_FETCH_RESULTS__[requestId]) {
                        reject(new Error('Timeout waiting for browserFetch response'));
                    }
                }, 35000);
            });
        };
        
        // Provide serverFetch function for fast API calls using main process net module
        // This avoids SSL fingerprinting issues that block sandbox fetch
        let __serverFetchCounter = 0;
        window.__SERVER_FETCH_RESULTS__ = {};
        
        window.serverFetch = function(url, options) {
            return new Promise((resolve, reject) => {
                const requestId = 'srv_' + (++__serverFetchCounter);
                
                // Send request via console.log (main process listens for this)
                console.log('__SERVER_FETCH_REQUEST__:' + JSON.stringify({ requestId, url, options }));
                
                // Poll for result
                const checkResult = setInterval(() => {
                    if (window.__SERVER_FETCH_RESULTS__[requestId]) {
                        clearInterval(checkResult);
                        const result = window.__SERVER_FETCH_RESULTS__[requestId];
                        delete window.__SERVER_FETCH_RESULTS__[requestId];
                        
                        // Create a Response-like object
                        resolve({
                            ok: result.ok,
                            status: result.status,
                            text: () => Promise.resolve(result.text),
                            json: () => Promise.resolve(JSON.parse(result.text)),
                        });
                    }
                }, 50); // Faster polling for quick API
                
                // Timeout after 15 seconds (should be fast)
                setTimeout(() => {
                    clearInterval(checkResult);
                    if (!window.__SERVER_FETCH_RESULTS__[requestId]) {
                        reject(new Error('Timeout waiting for serverFetch response'));
                    }
                }, 15000);
            });
        };
        
        // Provide sendStreamingPages function for progressive page loading
        // Extensions call this to send batches of page URLs as they're fetched
        window.__STREAMING_CANCELLED__ = false; // Cancellation flag
        
        window.sendStreamingPages = function(pages, done = false, total = null) {
            console.log('__STREAMING_PAGES__:' + JSON.stringify({ pages, done, total }));
        };
        
        // Check if streaming has been cancelled (extension should check between fetches)
        window.isStreamingCancelled = function() {
            return window.__STREAMING_CANCELLED__ === true;
        };
        
        true; // Return value to indicate success
    `);

    // Now load the extension code
    // Safe injection of extension code
    // We use JSON.stringify to safely pass the code string, avoiding issues with backticks/quotes
    // Then we use new Function to execute it with a mocked module/exports environment
    const codeString = JSON.stringify(extensionCode);

    try {
        await sandboxWindow.webContents.executeJavaScript(`
            (function() {
                try {
                    const source = ${codeString};
                    const exports = {};
                    const module = { exports: exports };
                    
                    // Create a function that wraps the extension code
                    // We allow 'require' but it will be undefined or throw if used, as per our block
                    // actually we can verify it's blocked by passing undefined
                    const extFn = new Function('module', 'exports', 'require', source);
                    
                    extFn(module, exports, undefined);
                    
                    window.__EXTENSION_EXPORTS__ = module.exports;
                    return { success: true };
                } catch (e) {
                    return { 
                        success: false, 
                        error: e.toString(), 
                        stack: e.stack 
                    };
                }
            })();
        `).then((result) => {
            if (!result.success) {
                console.error(`[Sandbox] Extension ${manifest.id} failed to load:`, result.error);
                throw new Error(`Extension script failed: ${result.error}`);
            }
        });
    } catch (err) {
        console.error(`[Sandbox] Fatal error loading extension ${manifest.id}:`, err);
        throw err;
    }

    const sandboxedExt: SandboxedExtension = {
        id: manifest.id,
        manifest,
        window: sandboxWindow,
        ready: true,
        lastUsedTime: Date.now(),
    };

    sandboxedExtensions.set(manifest.id, sandboxedExt);

    // Set up IPC handler for this sandbox to request Cloudflare solving
    sandboxWindow.webContents.ipc.handle('sandbox:requestCloudflareSession', async (_event, url: string) => {
        // This will open the modal and wait for the user to solve the challenge
        const { BrowserWindow: MainBrowserWindow } = require('electron');
        const mainWindow = MainBrowserWindow.getAllWindows().find((w: any) => w.title === 'Mangyomi' || !w.isDestroyed());

        if (!mainWindow) {
            return { success: false, message: 'Main window not found' };
        }

        return new Promise((resolve) => {
            const win = new BrowserWindow({
                width: 600,
                height: 700,
                parent: mainWindow,
                modal: true,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    session: mainWindow.webContents.session
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
                    const title = win.webContents.getTitle();
                    if (!title.includes('Just a moment') && !title.includes('moment')) {
                        const cookies = await win.webContents.session.cookies.get({ url });
                        const cookieString = cookies.map((c: any) => `${c.name}=${c.value}`).join('; ');

                        if (!resolved) {
                            resolved = true;
                            cleanup();
                            // Also set cookies in the sandbox window's session
                            for (const cookie of cookies) {
                                try {
                                    await sandboxWindow.webContents.session.cookies.set({
                                        url,
                                        name: cookie.name,
                                        value: cookie.value,
                                        domain: cookie.domain,
                                        path: cookie.path,
                                        secure: cookie.secure,
                                        httpOnly: cookie.httpOnly,
                                        expirationDate: cookie.expirationDate,
                                    });
                                } catch (e) {
                                    // Ignore cookie set errors
                                }
                            }
                            resolve({ success: true, cookies: cookieString });
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

    sandboxWindow.on('closed', () => {
        sandboxedExtensions.delete(manifest.id);
    });

    return sandboxedExt;
}

function extractAllowedDomains(manifest: ExtensionManifest): string[] {
    const domains: string[] = [];

    if (manifest.baseUrl) {
        try {
            const url = new URL(manifest.baseUrl);
            domains.push(url.hostname);
            domains.push(`*.${url.hostname}`);
        } catch {
            // Invalid URL, skip
        }
    }

    if ((manifest as any).permissions?.domains) {
        domains.push(...(manifest as any).permissions.domains);
    }

    return domains;
}

export async function executeInSandbox<T>(
    extensionId: string,
    functionName: string,
    args: any[]
): Promise<T> {
    // Lazy load: get existing sandbox or create on demand
    const sandbox = await getOrCreateSandbox(extensionId);

    // Update last used time
    sandbox.lastUsedTime = Date.now();

    // Special case: check if method exists
    if (functionName === '__hasMethod__') {
        const methodName = args[0];
        const hasMethod = await sandbox.window.webContents.executeJavaScript(`
            typeof window.__EXTENSION_EXPORTS__['${methodName}'] === 'function'
        `);
        return hasMethod as T;
    }

    const serializedArgs = JSON.stringify(args);

    const result = await sandbox.window.webContents.executeJavaScript(`
                    (async function () {
                        try {
                            const fn = window.__EXTENSION_EXPORTS__['${functionName}'];
                            if (typeof fn !== 'function') {
                                throw new Error('Function ${functionName} not found in extension');
                            }
                            const args = ${serializedArgs};
                            const result = await fn(...args);
                            return { success: true, data: result };
                        } catch (error) {
                            return { success: false, error: error.message, stack: error.stack };
                        }
                    })();
                `);

    if (!result.success) {
        const error = new Error(result.error);
        error.stack = result.stack;
        throw error;
    }

    return result.data as T;
}

export function getSandboxedExtension(id: string): SandboxedExtension | undefined {
    return sandboxedExtensions.get(id);
}

// Check if a sandbox is ready WITHOUT creating one (for passive operations)
export function isSandboxReady(id: string): boolean {
    const sandbox = sandboxedExtensions.get(id);
    return !!(sandbox && sandbox.ready);
}

export function destroySandbox(id: string): void {
    const sandbox = sandboxedExtensions.get(id);
    if (sandbox) {
        log.debug(`Destroying sandbox for ${id}`);
        sandbox.window.destroy();
        sandboxedExtensions.delete(id);
    }
}

export function destroyAllSandboxes(): void {
    log.info(`Destroying all ${sandboxedExtensions.size} sandboxes`);
    for (const [id, sandbox] of sandboxedExtensions) {
        sandbox.window.destroy();
    }
    sandboxedExtensions.clear();
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
    }
}

// Register extension metadata for lazy loading (called during loadExtensions)
export function registerExtensionMetadata(id: string, manifest: ExtensionManifest, extensionPath: string): void {
    extensionMetadata.set(id, { id, manifest, extensionPath });
    log.verbose(`Registered metadata for extension: ${id}`);
}

// Mark extension as actively in use (e.g., user browsing this source)
export function setActiveExtension(id: string): void {
    activeExtensions.add(id);
    log.debug(`Extension marked active: ${id}`);
}

// Unmark extension as actively in use
export function clearActiveExtension(id: string): void {
    activeExtensions.delete(id);
    log.debug(`Extension marked inactive: ${id}`);
}

// Get or create sandbox on demand
export async function getOrCreateSandbox(extensionId: string): Promise<SandboxedExtension> {
    // If sandbox already exists, update last used time and return
    const existing = sandboxedExtensions.get(extensionId);
    if (existing && existing.ready) {
        existing.lastUsedTime = Date.now();
        return existing;
    }

    // If sandbox is currently being created, wait for that promise (prevents race condition)
    const pending = pendingSandboxCreations.get(extensionId);
    if (pending) {
        // Many parallel calls may wait here - this is expected and not an error
        return pending;
    }

    // Get metadata for lazy creation
    const metadata = extensionMetadata.get(extensionId);
    if (!metadata) {
        throw new Error(`Extension ${extensionId} not found in metadata`);
    }

    log.info(`Creating sandbox on-demand for: ${extensionId}`);

    // Create promise and store it to prevent parallel creations
    const createPromise = createExtensionSandbox(metadata.extensionPath, metadata.manifest);
    pendingSandboxCreations.set(extensionId, createPromise);

    try {
        const sandbox = await createPromise;
        // Start cleanup interval if not running
        startCleanupInterval();
        return sandbox;
    } finally {
        // Remove from pending map when done (success or failure)
        pendingSandboxCreations.delete(extensionId);
    }
}

// Start periodic cleanup of idle sandboxes
function startCleanupInterval(): void {
    if (cleanupInterval) return;

    cleanupInterval = setInterval(() => {
        cleanupIdleSandboxes();
    }, 60 * 1000); // Check every minute

    log.verbose('Started sandbox cleanup interval');
}

// Clean up sandboxes that have been idle too long
function cleanupIdleSandboxes(): void {
    const now = Date.now();
    const toDestroy: string[] = [];

    for (const [id, sandbox] of sandboxedExtensions) {
        // Skip if actively streaming
        if (streamingPagesCallbacks.has(id)) {
            log.verbose(`Keeping sandbox ${id}: actively streaming`);
            continue;
        }

        // Skip if user is actively browsing this extension
        if (activeExtensions.has(id)) {
            log.verbose(`Keeping sandbox ${id}: user actively browsing`);
            continue;
        }

        // Check if idle timeout exceeded
        const idleTime = now - sandbox.lastUsedTime;
        if (idleTime > SANDBOX_IDLE_TIMEOUT) {
            toDestroy.push(id);
        }
    }

    for (const id of toDestroy) {
        log.info(`Destroying idle sandbox: ${id} (idle for ${Math.round((now - sandboxedExtensions.get(id)!.lastUsedTime) / 1000)}s)`);
        destroySandbox(id);
    }

    // Stop interval if no sandboxes left
    if (sandboxedExtensions.size === 0 && cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
        log.verbose('Stopped sandbox cleanup interval (no sandboxes)');
    }
}
