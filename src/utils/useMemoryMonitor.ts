import { useState, useEffect, useCallback, useRef } from 'react';

interface MemorySample {
    timestamp: number;
    heapUsed: number;
    heapTotal: number;
    rss: number;
    external: number;
}

interface MainProcessMemoryStats {
    current: {
        heapUsed: number;
        heapTotal: number;
        rss: number;
        external: number;
    };
    history: MemorySample[];
    trend: 'stable' | 'growing' | 'shrinking';
    leakWarning: boolean;
}

interface RendererMemoryStats {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
}

export interface CombinedMemoryStats {
    main: MainProcessMemoryStats | null;
    renderer: RendererMemoryStats | null;
    lastUpdated: number;
}

export function formatBytes(bytes: number): string {
    if (bytes >= 1024 * 1024 * 1024) {
        return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
    }
    if (bytes >= 1024 * 1024) {
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    }
    return `${Math.round(bytes / 1024)} KB`;
}

export function useMemoryMonitor(enabled: boolean, intervalMs: number = 5000) {
    const [stats, setStats] = useState<CombinedMemoryStats>({
        main: null,
        renderer: null,
        lastUpdated: 0,
    });
    const [isMonitoring, setIsMonitoring] = useState(false);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    const getRendererMemory = useCallback((): RendererMemoryStats | null => {
        const perf = performance as any;
        if (perf.memory) {
            return {
                usedJSHeapSize: perf.memory.usedJSHeapSize,
                totalJSHeapSize: perf.memory.totalJSHeapSize,
                jsHeapSizeLimit: perf.memory.jsHeapSizeLimit,
            };
        }
        return null;
    }, []);

    const fetchStats = useCallback(async () => {
        try {
            const mainStats = await window.electronAPI.app.getMemoryStats();
            const rendererStats = getRendererMemory();

            setStats({
                main: mainStats,
                renderer: rendererStats,
                lastUpdated: Date.now(),
            });
        } catch (error) {
            console.error('Failed to fetch memory stats:', error);
        }
    }, [getRendererMemory]);

    useEffect(() => {
        if (enabled && !isMonitoring) {
            window.electronAPI.app.startMemoryMonitoring();
            setIsMonitoring(true);
            fetchStats();

            intervalRef.current = setInterval(fetchStats, intervalMs);
        } else if (!enabled && isMonitoring) {
            window.electronAPI.app.stopMemoryMonitoring();
            setIsMonitoring(false);

            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        }

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [enabled, isMonitoring, fetchStats, intervalMs]);

    return { stats, isMonitoring, refresh: fetchStats };
}
