import { useState, useEffect, useRef } from 'react';
import './CaptchaModal.css';

interface CaptchaModalProps {
    url: string;
    onSolved: () => void;
    onClose: () => void;
}

function CaptchaModal({ url, onSolved, onClose }: CaptchaModalProps) {
    const [loading, setLoading] = useState(true);
    const webviewRef = useRef<HTMLWebViewElement>(null);

    useEffect(() => {
        const webview = webviewRef.current;
        if (!webview) return;

        const handleLoadStart = () => setLoading(true);
        const handleLoadStop = () => {
            setLoading(false);
            // Check if we're past the captcha (URL changed or content looks normal)
            const currentUrl = (webview as any).getURL?.();
            if (currentUrl && !currentUrl.includes('challenge') && !currentUrl.includes('captcha')) {
                // Give it a moment then consider it solved
                setTimeout(() => {
                    onSolved();
                }, 1000);
            }
        };

        webview.addEventListener('did-start-loading', handleLoadStart);
        webview.addEventListener('did-stop-loading', handleLoadStop);

        return () => {
            webview.removeEventListener('did-start-loading', handleLoadStart);
            webview.removeEventListener('did-stop-loading', handleLoadStop);
        };
    }, [onSolved]);

    return (
        <div className="captcha-modal-overlay">
            <div className="captcha-modal">
                <div className="captcha-header">
                    <h3>Please solve the captcha</h3>
                    <button className="btn btn-ghost btn-icon" onClick={onClose}>
                        ✕
                    </button>
                </div>
                <div className="captcha-content">
                    {loading && (
                        <div className="captcha-loading">
                            <div className="spinner"></div>
                            <p>Loading...</p>
                        </div>
                    )}
                    <webview
                        ref={webviewRef as any}
                        src={url}
                        style={{ width: '100%', height: '500px' }}
                        // @ts-ignore - webview attributes
                        allowpopups="true"
                        useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                    />
                </div>
                <div className="captcha-footer">
                    <p className="captcha-hint">
                        Solve the captcha above, then click "Done" when the page loads normally
                    </p>
                    <button className="btn btn-primary" onClick={onSolved}>
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}

export default CaptchaModal;
