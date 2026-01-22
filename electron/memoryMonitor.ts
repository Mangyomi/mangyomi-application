interface MemorySample {
    timestamp: number;
    heapUsed: number;
    heapTotal: number;
    rss: number;
    external: number;
}

interface MemoryStats {
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

const MAX_SAMPLES = 60;
const SAMPLE_INTERVAL_MS = 5000;

let samples: MemorySample[] = [];
let monitoringInterval: NodeJS.Timeout | null = null;

function takeSample(): MemorySample {
    const mem = process.memoryUsage();
    return {
        timestamp: Date.now(),
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        rss: mem.rss,
        external: mem.external,
    };
}

function calculateTrend(): 'stable' | 'growing' | 'shrinking' {
    if (samples.length < 10) return 'stable';

    const recentSamples = samples.slice(-10);
    const oldSamples = samples.slice(-20, -10);

    if (oldSamples.length < 5) return 'stable';

    const recentAvg = recentSamples.reduce((sum, s) => sum + s.heapUsed, 0) / recentSamples.length;
    const oldAvg = oldSamples.reduce((sum, s) => sum + s.heapUsed, 0) / oldSamples.length;

    const changePercent = ((recentAvg - oldAvg) / oldAvg) * 100;

    if (changePercent > 10) return 'growing';
    if (changePercent < -10) return 'shrinking';
    return 'stable';
}

function detectLeakWarning(): boolean {
    if (samples.length < 20) return false;

    let consecutiveGrowth = 0;
    let startHeap = 0;

    for (let i = 1; i < samples.length; i++) {
        if (samples[i].heapUsed > samples[i - 1].heapUsed) {
            if (consecutiveGrowth === 0) startHeap = samples[i - 1].heapUsed;
            consecutiveGrowth++;
        } else {
            consecutiveGrowth = 0;
        }

        // Only warn if we have sustained growth AND significant total increase (> 5MB)
        if (consecutiveGrowth >= 15) {
            const totalGrowth = samples[i].heapUsed - startHeap;
            if (totalGrowth > 5 * 1024 * 1024) {
                return true;
            }
        }
    }

    return false;
}

export function startMonitoring(): void {
    if (monitoringInterval) return;

    samples.push(takeSample());

    monitoringInterval = setInterval(() => {
        samples.push(takeSample());
        if (samples.length > MAX_SAMPLES) {
            samples.shift();
        }
    }, SAMPLE_INTERVAL_MS);
}

export function stopMonitoring(): void {
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
        monitoringInterval = null;
    }
}

export function getMemoryStats(): MemoryStats {
    const current = takeSample();

    return {
        current: {
            heapUsed: current.heapUsed,
            heapTotal: current.heapTotal,
            rss: current.rss,
            external: current.external,
        },
        history: [...samples],
        trend: calculateTrend(),
        leakWarning: detectLeakWarning(),
    };
}

export function clearHistory(): void {
    samples = [];
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
