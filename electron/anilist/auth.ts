/**
 * AniList OAuth2 Authentication Handler
 * Handles OAuth flow for authenticating with AniList
 */

import { BrowserWindow, session } from 'electron';
import { anilistAPI } from './api';

// AniList OAuth URLs
const ANILIST_AUTH_URL = 'https://anilist.co/api/v2/oauth/authorize';
const ANILIST_TOKEN_URL = 'https://anilist.co/api/v2/oauth/token';

// Mangyomi's registered AniList Client ID
const CLIENT_ID = '33893';

interface TokenData {
    access_token: string;
    token_type: string;
    expires_in: number;
    obtained_at: number;
}

let tokenData: TokenData | null = null;
let clientId: string = '';

/**
 * Set the AniList client ID
 */
export function setClientId(id: string): void {
    clientId = id;
}

/**
 * Get stored token data
 */
export function getTokenData(): TokenData | null {
    return tokenData;
}

/**
 * Set token data and configure API
 */
export function setTokenData(data: TokenData | null): void {
    tokenData = data;
    anilistAPI.setAccessToken(data?.access_token || null);
}

/**
 * Check if the token is expired
 */
export function isTokenExpired(): boolean {
    if (!tokenData) return true;
    const expiresAt = tokenData.obtained_at + (tokenData.expires_in * 1000);
    return Date.now() >= expiresAt;
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
    return tokenData !== null && !isTokenExpired();
}

/**
 * Open OAuth window for user authentication
 * Uses implicit grant flow for desktop apps
 */
export function openAuthWindow(mainWindow: BrowserWindow): Promise<string> {
    return new Promise((resolve, reject) => {
        // Create auth window
        const authWindow = new BrowserWindow({
            width: 500,
            height: 700,
            parent: mainWindow,
            modal: true,
            show: true,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
            },
        });

        // Build authorization URL (using implicit grant)
        const authUrl = new URL(ANILIST_AUTH_URL);
        authUrl.searchParams.set('client_id', CLIENT_ID);
        authUrl.searchParams.set('response_type', 'token');

        authWindow.loadURL(authUrl.toString());

        // Handle the redirect with access token in URL fragment
        authWindow.webContents.on('will-redirect', (_event, url) => {
            handleCallback(url, authWindow, resolve, reject);
        });

        authWindow.webContents.on('will-navigate', (_event, url) => {
            handleCallback(url, authWindow, resolve, reject);
        });

        // Handle window close
        authWindow.on('closed', () => {
            reject(new Error('Authentication window was closed'));
        });
    });
}

/**
 * Handle OAuth callback URL
 */
function handleCallback(
    url: string,
    authWindow: BrowserWindow,
    resolve: (token: string) => void,
    reject: (error: Error) => void
): void {
    // AniList redirects to anilist.co/api/v2/oauth/pin with fragment containing token
    // or to the redirect URL specified during app registration
    try {
        const urlObj = new URL(url);

        // Check if this is the callback with token in fragment
        // The token comes in the URL fragment after #
        if (url.includes('#access_token=') || url.includes('access_token=')) {
            // Parse fragment parameters
            const fragment = url.includes('#') ? url.split('#')[1] : urlObj.search.slice(1);
            const params = new URLSearchParams(fragment);

            const accessToken = params.get('access_token');
            const tokenType = params.get('token_type');
            const expiresIn = params.get('expires_in');

            if (accessToken) {
                // Store token data
                const data: TokenData = {
                    access_token: accessToken,
                    token_type: tokenType || 'Bearer',
                    expires_in: parseInt(expiresIn || '31536000', 10), // Default 1 year
                    obtained_at: Date.now(),
                };

                setTokenData(data);
                authWindow.close();
                resolve(accessToken);
                return;
            }
        }

        // Check for errors
        if (url.includes('error=')) {
            const fragment = url.split('#')[1] || url.split('?')[1] || '';
            const params = new URLSearchParams(fragment);
            const error = params.get('error_description') || params.get('error') || 'Unknown error';
            authWindow.close();
            reject(new Error(`AniList auth error: ${error}`));
        }
    } catch (err) {
        // URL parsing error, ignore and continue
    }
}

/**
 * Logout - clear stored tokens
 */
export function logout(): void {
    tokenData = null;
    anilistAPI.setAccessToken(null);

    // Clear AniList cookies
    session.defaultSession.cookies.remove('https://anilist.co', 'auth_token');
}

/**
 * Serialize token data for storage
 */
export function serializeTokenData(): string | null {
    if (!tokenData) return null;
    return JSON.stringify(tokenData);
}

/**
 * Deserialize and restore token data
 */
export function deserializeTokenData(data: string): void {
    try {
        const parsed = JSON.parse(data) as TokenData;
        setTokenData(parsed);
    } catch {
        // Invalid data, ignore
    }
}
