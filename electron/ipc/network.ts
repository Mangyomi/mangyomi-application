/**
 * Network IPC Handlers (proxy validation)
 */
import { ipcMain } from 'electron';

interface ProxyConfig {
    type: 'http' | 'socks4' | 'socks5';
    ip: string;
    port: number;
    username?: string;
    password?: string;
}

interface ValidationResult {
    valid: boolean;
    latency?: number;
    error?: string;
}

export function setupNetworkHandlers() {
    // Validate a proxy by making a request through it
    ipcMain.handle('proxy:validate', async (_, proxy: ProxyConfig, skipValidation?: boolean): Promise<ValidationResult> => {
        // Allow skipping validation for proxies that don't work with test endpoints
        if (skipValidation) {
            return { valid: true, latency: 0 };
        }

        const startTime = Date.now();
        const testUrl = 'https://httpbin.org/get';

        try {
            // Build proxy URL with optional auth
            let proxyUrl: string;
            if (proxy.username && proxy.password) {
                proxyUrl = `${proxy.type}://${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@${proxy.ip}:${proxy.port}`;
            } else {
                proxyUrl = `${proxy.type}://${proxy.ip}:${proxy.port}`;
            }

            // Create a session with the proxy
            const { session } = await import('electron');
            const testSession = session.fromPartition(`proxy-test-${Date.now()}`);

            // Set proxy for this session
            await testSession.setProxy({
                proxyRules: proxyUrl,
                proxyBypassRules: ''
            });

            // Make a test request with timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

            try {
                const response = await testSession.fetch(testUrl, {
                    method: 'HEAD',
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (response.ok) {
                    return {
                        valid: true,
                        latency: Date.now() - startTime
                    };
                } else if (response.status === 407) {
                    return {
                        valid: false,
                        error: 'Proxy requires authentication (add username/password)'
                    };
                } else {
                    return {
                        valid: false,
                        error: `HTTP ${response.status}: ${response.statusText}`
                    };
                }
            } catch (fetchError: any) {
                clearTimeout(timeoutId);
                if (fetchError.name === 'AbortError') {
                    return {
                        valid: false,
                        error: 'Connection timed out (15s)'
                    };
                }
                throw fetchError;
            } finally {
                // Clean up the test session
                await testSession.clearCache();
            }
        } catch (error: any) {
            console.error('[Proxy Validation] Error:', error);
            let errorMsg = error.message || 'Connection failed';

            // Provide friendlier error messages
            if (errorMsg.includes('ERR_EMPTY_RESPONSE')) {
                errorMsg = 'Proxy not responding (dead or blocked)';
            } else if (errorMsg.includes('ERR_NETWORK_CHANGED')) {
                errorMsg = 'Network changed during validation (try again)';
            } else if (errorMsg.includes('ERR_PROXY_CONNECTION_FAILED')) {
                errorMsg = 'Could not connect to proxy';
            }

            return {
                valid: false,
                error: errorMsg
            };
        }
    });
}
