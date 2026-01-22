/**
 * @fileoverview Library Export IPC Handler
 * Exports library manga covers as a high-resolution PNG grid image.
 */

import { ipcMain, dialog, BrowserWindow, net, shell } from 'electron';
import { getDatabase } from '../database';
import { getAllExtensions } from '../extensions/loader';
import { imageCache } from '../cache/imageCache';
import * as fs from 'fs';
import * as path from 'path';

// Grid configuration
const COVER_WIDTH = 300;
const COVER_HEIGHT = 450; // 2:3 aspect ratio
const COLUMNS = 20;
const GAP = 10;
const PADDING = 40;
const TITLE_HEIGHT = 50; // Increased for full titles

interface ExportProgress {
    current: number;
    total: number;
    status: string;
}

interface LibraryManga {
    id: string;
    title: string;
    cover_url: string;
    source_id: string;
}

/**
 * Fetch image as base64 data URL
 * Priority: 1) Cached cover, 2) Local file, 3) Remote URL
 */
async function fetchImageAsDataUrl(url: string): Promise<string | null> {
    if (!url) return null;

    try {
        // First check if we have a cached cover
        const cachedPath = imageCache.getCachedCoverPath(url);
        if (cachedPath && fs.existsSync(cachedPath)) {
            const buffer = fs.readFileSync(cachedPath);
            const ext = path.extname(cachedPath).toLowerCase();
            const mimeType = ext === '.webp' ? 'image/webp' : ext === '.png' ? 'image/png' : 'image/jpeg';
            return `data:${mimeType};base64,${buffer.toString('base64')}`;
        }

        // Handle file:// URLs
        if (url.startsWith('file://')) {
            const filePath = url.replace('file://', '');
            if (fs.existsSync(filePath)) {
                const buffer = fs.readFileSync(filePath);
                const ext = path.extname(filePath).toLowerCase();
                const mimeType = ext === '.webp' ? 'image/webp' : ext === '.png' ? 'image/png' : 'image/jpeg';
                return `data:${mimeType};base64,${buffer.toString('base64')}`;
            }
            return null;
        }

        // Fetch remote URLs (fallback)
        const response = await net.fetch(url);
        if (!response.ok) return null;

        const buffer = Buffer.from(await response.arrayBuffer());
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        return `data:${contentType};base64,${buffer.toString('base64')}`;
    } catch (e) {
        console.error(`[Export] Failed to fetch image: ${url}`, e);
        return null;
    }
}

/**
 * Generate library export image using OffscreenCanvas in renderer
 */
async function generateLibraryImage(
    manga: LibraryManga[],
    mainWindow: BrowserWindow,
    onProgress: (progress: ExportProgress) => void
): Promise<Buffer | null> {
    const total = manga.length;
    if (total === 0) return null;

    const rows = Math.ceil(total / COLUMNS);
    const width = PADDING * 2 + COLUMNS * COVER_WIDTH + (COLUMNS - 1) * GAP;
    const height = PADDING * 2 + rows * (COVER_HEIGHT + TITLE_HEIGHT + GAP);

    // Prepare manga data with cover images
    const mangaData: Array<{ title: string; coverDataUrl: string | null }> = [];

    for (let i = 0; i < manga.length; i++) {
        onProgress({ current: i + 1, total, status: `Loading cover ${i + 1}/${total}...` });
        const coverDataUrl = await fetchImageAsDataUrl(manga[i].cover_url);
        mangaData.push({
            title: manga[i].title,
            coverDataUrl
        });
    }

    onProgress({ current: total, total, status: 'Rendering image...' });

    // Load app icon for branding - try multiple possible paths
    const possibleIconPaths = [
        path.join(__dirname, '..', '..', 'build', 'icon.png'),  // Development
        path.join(__dirname, '..', '..', 'public', 'icon.png'), // Vite public folder
        path.join(__dirname, '..', '..', 'dist', 'icon.png'),   // Built dist
        path.join(__dirname, '..', 'build', 'icon.png'),        // Alternative dev
        path.join(__dirname, '..', 'public', 'icon.png'),       // Alternative public
        path.join(process.resourcesPath || '', 'icon.png'),     // Packaged app resources
    ];

    let iconDataUrl: string | null = null;
    for (const iconPath of possibleIconPaths) {
        if (fs.existsSync(iconPath)) {
            console.log(`[Export] Found icon at: ${iconPath}`);
            const iconBuffer = fs.readFileSync(iconPath);
            iconDataUrl = `data:image/png;base64,${iconBuffer.toString('base64')}`;
            break;
        }
    }
    if (!iconDataUrl) {
        console.log(`[Export] Icon not found in any path, tried: ${possibleIconPaths.join(', ')}`);
    }

    // Send to renderer for canvas compositing
    const result = await mainWindow.webContents.executeJavaScript(`
        (async () => {
            const manga = ${JSON.stringify(mangaData)};
            const iconDataUrl = ${JSON.stringify(iconDataUrl)};
            const COVER_WIDTH = ${COVER_WIDTH};
            const COVER_HEIGHT = ${COVER_HEIGHT};
            const COLUMNS = ${COLUMNS};
            const GAP = ${GAP};
            const PADDING = ${PADDING};
            const TITLE_HEIGHT = ${TITLE_HEIGHT};
            const HEADER_HEIGHT = 80;
            const width = ${width};
            const height = ${height} + HEADER_HEIGHT;

            const canvas = new OffscreenCanvas(width, height);
            const ctx = canvas.getContext('2d');

            // Background gradient (rich purple to dark blue)
            const gradient = ctx.createLinearGradient(0, 0, width, height);
            gradient.addColorStop(0, '#0f0c29');
            gradient.addColorStop(0.5, '#302b63');
            gradient.addColorStop(1, '#24243e');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, width, height);

            // Header section
            ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.fillRect(0, 0, width, HEADER_HEIGHT);
            
            // Draw icon if available
            let textOffsetX = PADDING;
            if (iconDataUrl) {
                try {
                    const iconImg = new Image();
                    await new Promise((resolve, reject) => {
                        iconImg.onload = resolve;
                        iconImg.onerror = reject;
                        iconImg.src = iconDataUrl;
                    });
                    const iconSize = 48;
                    ctx.drawImage(iconImg, PADDING, (HEADER_HEIGHT - iconSize) / 2, iconSize, iconSize);
                    textOffsetX = PADDING + iconSize + 12;
                } catch (e) {}
            }
            
            // Header title with Mangyomi branding
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText('Mangyomi Library', textOffsetX, 45);
            
            // Subtitle with count and date
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.fillText(manga.length + ' titles • Exported ' + new Date().toLocaleDateString(), textOffsetX, 65);
            
            // Branding in header right side
            ctx.textAlign = 'right';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.fillText('mangyomi.github.io', width - PADDING, 50);
            ctx.textAlign = 'left';
            
            // Draw manga covers
            for (let i = 0; i < manga.length; i++) {
                const col = i % COLUMNS;
                const row = Math.floor(i / COLUMNS);
                const x = PADDING + col * (COVER_WIDTH + GAP);
                const y = HEADER_HEIGHT + PADDING + row * (COVER_HEIGHT + TITLE_HEIGHT + GAP);

                // Draw shadow
                ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                ctx.shadowBlur = 15;
                ctx.shadowOffsetX = 5;
                ctx.shadowOffsetY = 5;

                // Draw cover placeholder with gradient
                const placeholderGrad = ctx.createLinearGradient(x, y, x + COVER_WIDTH, y + COVER_HEIGHT);
                placeholderGrad.addColorStop(0, '#3a3a5c');
                placeholderGrad.addColorStop(1, '#2d2d44');
                ctx.fillStyle = placeholderGrad;
                ctx.beginPath();
                ctx.roundRect(x, y, COVER_WIDTH, COVER_HEIGHT, 12);
                ctx.fill();

                // Reset shadow for image
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;

                // Draw cover image if available
                if (manga[i].coverDataUrl) {
                    try {
                        const img = new Image();
                        await new Promise((resolve, reject) => {
                            img.onload = resolve;
                            img.onerror = reject;
                            img.src = manga[i].coverDataUrl;
                        });
                        
                        ctx.save();
                        ctx.beginPath();
                        ctx.roundRect(x, y, COVER_WIDTH, COVER_HEIGHT, 12);
                        ctx.clip();
                        ctx.drawImage(img, x, y, COVER_WIDTH, COVER_HEIGHT);
                        ctx.restore();

                        // Add subtle border
                        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.roundRect(x, y, COVER_WIDTH, COVER_HEIGHT, 12);
                        ctx.stroke();
                    } catch (e) {}
                }

                // Draw title (full title, wrapping if needed)
                ctx.fillStyle = '#ffffff';
                ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
                ctx.textAlign = 'center';
                
                // Word wrap title
                const maxWidth = COVER_WIDTH - 10;
                const title = manga[i].title;
                const words = title.split(' ');
                let lines = [];
                let currentLine = '';
                
                for (const word of words) {
                    const testLine = currentLine ? currentLine + ' ' + word : word;
                    const metrics = ctx.measureText(testLine);
                    if (metrics.width > maxWidth && currentLine) {
                        lines.push(currentLine);
                        currentLine = word;
                    } else {
                        currentLine = testLine;
                    }
                }
                if (currentLine) lines.push(currentLine);
                
                // Only show first 2 lines
                const displayLines = lines.slice(0, 2);
                if (lines.length > 2) {
                    displayLines[1] = displayLines[1].substring(0, displayLines[1].length - 3) + '...';
                }
                
                displayLines.forEach((line, idx) => {
                    ctx.fillText(line, x + COVER_WIDTH / 2, y + COVER_HEIGHT + 15 + idx * 16);
                });
            }

            // Convert to blob and then base64
            const blob = await canvas.convertToBlob({ type: 'image/png', quality: 1 });
            const reader = new FileReader();
            return new Promise(resolve => {
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(blob);
            });
        })()
    `);

    if (!result) return null;

    // Convert data URL to buffer
    const base64Data = result.replace(/^data:image\/png;base64,/, '');
    return Buffer.from(base64Data, 'base64');
}

export function registerExportHandlers() {
    ipcMain.handle('export-library-png', async (_event, options?: { includeNsfwSources?: boolean; includeNsfwTags?: boolean }) => {
        try {
            const mainWindow = BrowserWindow.getAllWindows()[0];
            if (!mainWindow) {
                return { success: false, error: 'No window available' };
            }

            const includeNsfwSources = options?.includeNsfwSources ?? false;
            const includeNsfwTags = options?.includeNsfwTags ?? false;

            // Get database and query library
            const db = getDatabase();
            const library = db.prepare(`
                SELECT id, title, cover_url, source_id 
                FROM manga 
                WHERE in_library = 1 
                ORDER BY title COLLATE NOCASE
            `).all() as LibraryManga[];

            if (!library || library.length === 0) {
                return { success: false, error: 'Library is empty' };
            }

            // Filter based on options
            let filteredLibrary = library;

            // Filter NSFW sources unless included
            if (!includeNsfwSources) {
                const extensions = getAllExtensions();
                const nsfwExtIds = new Set(
                    extensions.filter(ext => ext.nsfw).map(ext => ext.id)
                );
                filteredLibrary = filteredLibrary.filter(m => !nsfwExtIds.has(m.source_id));
            }

            // Filter NSFW-tagged manga unless included
            if (!includeNsfwTags) {
                // Get manga IDs that have NSFW tags
                const nsfwTaggedManga = db.prepare(`
                    SELECT DISTINCT mt.manga_id 
                    FROM manga_tag mt 
                    JOIN tag t ON t.id = mt.tag_id 
                    WHERE t.is_nsfw = 1
                `).all() as { manga_id: string }[];

                const nsfwTagMangaIds = new Set(nsfwTaggedManga.map(r => r.manga_id));
                filteredLibrary = filteredLibrary.filter(m => !nsfwTagMangaIds.has(m.id));
            }

            if (filteredLibrary.length === 0) {
                return { success: false, error: 'No manga to export (all filtered)' };
            }

            // Show save dialog
            const result = await dialog.showSaveDialog(mainWindow, {
                title: 'Export Library as PNG',
                defaultPath: `mangyomi-library-${new Date().toISOString().slice(0, 10)}.png`,
                filters: [{ name: 'PNG Image', extensions: ['png'] }]
            });

            if (result.canceled || !result.filePath) {
                return { success: false, error: 'Export cancelled' };
            }

            // Generate image with progress updates
            const imageBuffer = await generateLibraryImage(
                filteredLibrary,
                mainWindow,
                (progress) => {
                    mainWindow.webContents.send('export-progress', progress);
                }
            );

            if (!imageBuffer) {
                return { success: false, error: 'Failed to generate image' };
            }

            // Save to file
            fs.writeFileSync(result.filePath, imageBuffer);

            // Auto-open the image
            shell.openPath(result.filePath);

            return { success: true, path: result.filePath, count: filteredLibrary.length };
        } catch (error) {
            console.error('[Export] Error:', error);
            return { success: false, error: (error as Error).message };
        }
    });
}
