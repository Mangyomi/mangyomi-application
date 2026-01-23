import { useState, useEffect, useRef } from 'react';

interface CloudflareImageProps {
    src: string;           // Proxied URL (manga-image://) for first attempt
    originalSrc?: string;  // Original URL (https://) for webview fallback
    alt: string;
    className?: string;
    onError?: () => void;
    onLoad?: () => void;
    placeholder?: React.ReactNode;  // Fallback content to show on error
}

/**
 * CloudflareImage - A component that handles Cloudflare-protected images.
 * 
 * Strategy:
 * 1. First, try to load the image via proxied src (cache or proxy)
 * 2. If that fails (403), fall back to a webview with originalSrc
 *    which can execute JavaScript to solve Cloudflare challenges
 * 3. If all fails, show placeholder or alt text
 */
export function CloudflareImage({ src, originalSrc, alt, className, onError, onLoad, placeholder }: CloudflareImageProps) {
    const [mode, setMode] = useState<'img' | 'webview' | 'error'>('img');
    const [webviewLoaded, setWebviewLoaded] = useState(false);
    const webviewRef = useRef<HTMLElement | null>(null);

    // Debug: Log what URLs we receive
    console.log(`[CloudflareImage] Mounting with src: ${src?.substring(0, 80)}...`);
    console.log(`[CloudflareImage] originalSrc: ${originalSrc?.substring(0, 80)}...`);

    // Handle img load error - switch to webview mode if originalSrc provided
    const handleImgError = () => {
        if (originalSrc) {
            console.log('[CloudflareImage] Image FAILED, switching to webview:', originalSrc);
            setMode('webview');
        } else {
            console.log('[CloudflareImage] Image FAILED, no originalSrc - going to error mode');
            setMode('error');
            onError?.();
        }
    };

    const handleImgLoad = () => {
        console.log('[CloudflareImage] Image LOADED successfully:', src?.substring(0, 60));
        onLoad?.();
    };

    // Handle webview events
    useEffect(() => {
        if (mode !== 'webview' || !webviewRef.current) return;

        const webview = webviewRef.current as any;

        const handleWebviewLoad = () => {
            console.log('[CloudflareImage] Webview loaded:', originalSrc);

            // Inject CSS to make the image fill the viewport
            try {
                webview.insertCSS(`
                    * { margin: 0; padding: 0; }
                    html, body { 
                        width: 100%; 
                        height: 100%; 
                        overflow: hidden;
                        background: transparent;
                    }
                    img { 
                        width: 100%; 
                        height: 100%; 
                        object-fit: cover;
                        display: block;
                    }
                `);
            } catch (e) {
                console.log('[CloudflareImage] Could not inject CSS:', e);
            }

            setWebviewLoaded(true);
            onLoad?.();
        };

        const handleWebviewError = (e: Event) => {
            console.error('[CloudflareImage] Webview error:', e);
            setMode('error');
            onError?.();
        };

        webview.addEventListener('did-finish-load', handleWebviewLoad);
        webview.addEventListener('did-fail-load', handleWebviewError);

        return () => {
            webview.removeEventListener('did-finish-load', handleWebviewLoad);
            webview.removeEventListener('did-fail-load', handleWebviewError);
        };
    }, [mode, originalSrc, onLoad, onError]);

    // Trigger onError when entering error mode
    useEffect(() => {
        if (mode === 'error') {
            onError?.();
        }
    }, [mode, onError]);

    if (mode === 'img') {
        return (
            <img
                src={src}
                alt={alt}
                className={className}
                onError={handleImgError}
                onLoad={handleImgLoad}
                loading="lazy"
            />
        );
    }

    if (mode === 'webview' && originalSrc) {
        return (
            <webview
                ref={webviewRef as any}
                src={originalSrc}
                partition="persist:extensions"
                className={className}
                style={{
                    width: '100%',
                    height: '100%',
                    opacity: webviewLoaded ? 1 : 0,
                    transition: 'opacity 0.3s ease',
                    pointerEvents: 'none', // Prevent interaction
                    border: 'none',
                }}
                // @ts-ignore - webview attributes
                webpreferences="javascript=yes"
            />
        );
    }

    // Error state - show placeholder or alt text
    if (placeholder) {
        return <>{placeholder}</>;
    }

    // Default placeholder with alt text
    return (
        <div
            className={className}
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--color-surface, #1a1a1a)',
                color: 'var(--text-secondary, #888)',
                fontSize: '0.85em',
                textAlign: 'center',
                padding: '12px',
                width: '100%',
                height: '100%',
            }}
        >
            {alt}
        </div>
    );
}

export default CloudflareImage;
