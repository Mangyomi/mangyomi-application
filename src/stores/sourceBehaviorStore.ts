import { create } from 'zustand';

// Default rate limits
const DEFAULT_INITIAL_RATE = 2.0;  // req/sec
const DEFAULT_MAX_RATE = 10.0;     // req/sec

// AIMD parameters
const ADDITIVE_INCREASE = 0.1;     // Add 0.1 req/sec on success
const MULTIPLICATIVE_DECREASE_429 = 0.5;   // Halve on rate limit
const MULTIPLICATIVE_DECREASE_403 = 0.3;   // 70% cut on block
const MULTIPLICATIVE_DECREASE_4XX = 0.7;   // 30% cut on client error
const MULTIPLICATIVE_DECREASE_5XX = 0.7;   // 30% cut on server error
const MULTIPLICATIVE_DECREASE_TIMEOUT = 0.9; // 10% cut on timeout

// Backoff timing
const BASE_BACKOFF_MS = 5000;
const MAX_BACKOFF_MULTIPLIER = 64;

interface SourceBehavior {
    sourceId: string;

    // Rate limiting state
    currentRequestRate: number;
    maxObservedRate: number;
    initialRate: number;
    maxRate: number;

    // Failure tracking
    consecutiveFailures: number;
    totalRequests: number;
    failedRequests: number;
    lastRateLimitTime: number | null;

    // Timing intelligence
    avgResponseTimeMs: number;

    // Backoff state
    backoffUntil: number | null;
    backoffMultiplier: number;
}

interface SourceBehaviorState {
    sources: Map<string, SourceBehavior>;
    initialized: boolean;

    // Actions
    initialize: () => Promise<void>;
    getOrCreateBehavior: (sourceId: string, manifest?: { rateLimit?: { initialRate?: number; maxRate?: number } }) => SourceBehavior;
    recordSuccess: (sourceId: string, responseTimeMs: number) => void;
    recordFailure: (sourceId: string, statusCode: number) => void;
    shouldThrottle: (sourceId: string) => boolean;
    getRequestDelay: (sourceId: string) => number;
    getConsecutiveFailures: (sourceId: string) => number;
}

// Helper to create default behavior
function createDefaultBehavior(sourceId: string, initialRate = DEFAULT_INITIAL_RATE, maxRate = DEFAULT_MAX_RATE): SourceBehavior {
    return {
        sourceId,
        currentRequestRate: initialRate,
        maxObservedRate: initialRate,
        initialRate,
        maxRate,
        consecutiveFailures: 0,
        totalRequests: 0,
        failedRequests: 0,
        lastRateLimitTime: null,
        avgResponseTimeMs: 500,
        backoffUntil: null,
        backoffMultiplier: 1
    };
}

export const useSourceBehaviorStore = create<SourceBehaviorState>((set, get) => ({
    sources: new Map(),
    initialized: false,

    // Load persisted behaviors from database on startup
    initialize: async () => {
        if (get().initialized) return;

        try {
            const savedBehaviors = await window.electronAPI?.db?.getAllSourceBehaviors?.();
            if (savedBehaviors && savedBehaviors.length > 0) {
                const sources = new Map<string, SourceBehavior>();
                for (const row of savedBehaviors) {
                    // Convert DB row to SourceBehavior (snake_case to camelCase)
                    sources.set(row.source_id, {
                        sourceId: row.source_id,
                        currentRequestRate: row.current_request_rate,
                        maxObservedRate: row.max_observed_rate,
                        initialRate: row.initial_rate,
                        maxRate: row.max_rate,
                        consecutiveFailures: row.consecutive_failures,
                        totalRequests: row.total_requests,
                        failedRequests: row.failed_requests,
                        lastRateLimitTime: row.last_rate_limit_time,
                        avgResponseTimeMs: row.avg_response_time_ms,
                        backoffUntil: row.backoff_until,
                        backoffMultiplier: row.backoff_multiplier
                    });
                }
                window.electronAPI?.app?.log?.('info', 'SourceBehavior', `Loaded ${sources.size} saved source behaviors`);
                set({ sources, initialized: true });
            } else {
                window.electronAPI?.app?.log?.('info', 'SourceBehavior', 'No saved source behaviors found, starting fresh');
                set({ initialized: true });
            }
        } catch (e) {
            window.electronAPI?.app?.log?.('warn', 'SourceBehavior', `Failed to load from DB: ${e}`);
            set({ initialized: true });
        }
    },

    getOrCreateBehavior: (sourceId: string, manifest?) => {
        const state = get();
        let behavior = state.sources.get(sourceId);

        if (!behavior) {
            // Check manifest for declared rate limits
            const initialRate = manifest?.rateLimit?.initialRate ?? DEFAULT_INITIAL_RATE;
            const maxRate = manifest?.rateLimit?.maxRate ?? DEFAULT_MAX_RATE;

            behavior = createDefaultBehavior(sourceId, initialRate, maxRate);
            const newSources = new Map(state.sources);
            newSources.set(sourceId, behavior);
            set({ sources: newSources });
        }

        return behavior;
    },

    recordSuccess: (sourceId: string, responseTimeMs: number) => {
        const state = get();
        const behavior = state.sources.get(sourceId);
        if (!behavior) return;

        const newBehavior = { ...behavior };
        const oldRate = newBehavior.currentRequestRate;

        // Additive increase (capped at maxRate)
        newBehavior.currentRequestRate = Math.min(
            newBehavior.currentRequestRate + ADDITIVE_INCREASE,
            newBehavior.maxRate
        );

        // Reset backoff on success
        const wasInBackoff = newBehavior.consecutiveFailures > 0;
        newBehavior.consecutiveFailures = 0;
        newBehavior.backoffMultiplier = 1;
        newBehavior.backoffUntil = null;

        // Update max observed rate
        if (newBehavior.currentRequestRate > newBehavior.maxObservedRate) {
            newBehavior.maxObservedRate = newBehavior.currentRequestRate;
        }

        // EWMA for response time
        const oldAvgTime = newBehavior.avgResponseTimeMs;
        newBehavior.avgResponseTimeMs = 0.3 * responseTimeMs + 0.7 * newBehavior.avgResponseTimeMs;
        newBehavior.totalRequests++;

        // DEBUG logging for adaptive mode learning (sent to main process for terminal output)
        const rateChange = newBehavior.currentRequestRate - oldRate;
        const logMessage = `SUCCESS: rate ${oldRate.toFixed(2)} → ${newBehavior.currentRequestRate.toFixed(2)} req/s (+${rateChange.toFixed(2)}), ` +
            `responseTime ${responseTimeMs}ms (avg: ${oldAvgTime.toFixed(0)} → ${newBehavior.avgResponseTimeMs.toFixed(0)}ms)` +
            `${wasInBackoff ? ', BACKOFF RESET' : ''}`;
        window.electronAPI?.app?.log?.('debug', `Adaptive:${sourceId}`, logMessage);

        const newSources = new Map(state.sources);
        newSources.set(sourceId, newBehavior);
        set({ sources: newSources });

        // Persist to DB (fire-and-forget)
        window.electronAPI?.db?.updateSourceBehavior?.(newBehavior)
            .catch((e: any) => console.warn('[SourceBehavior] Failed to persist:', e));
    },

    recordFailure: (sourceId: string, statusCode: number) => {
        const state = get();
        const behavior = state.sources.get(sourceId);
        if (!behavior) return;

        const newBehavior = { ...behavior };
        const oldRate = newBehavior.currentRequestRate;
        let failureType = '';
        let backoffMs = 0;

        if (statusCode === 429) {
            // Explicit rate limit - aggressive backoff
            newBehavior.currentRequestRate *= MULTIPLICATIVE_DECREASE_429;
            newBehavior.backoffMultiplier = Math.min(newBehavior.backoffMultiplier * 2, MAX_BACKOFF_MULTIPLIER);
            backoffMs = BASE_BACKOFF_MS * newBehavior.backoffMultiplier;
            newBehavior.backoffUntil = Date.now() + backoffMs;
            newBehavior.lastRateLimitTime = Date.now();
            failureType = 'RATE_LIMIT_429';
            console.warn(`[RateLimit] ${sourceId}: 429 rate limit, backing off ${newBehavior.backoffMultiplier * 5}s`);
        } else if (statusCode === 403) {
            // Forbidden - likely Cloudflare block or IP ban
            newBehavior.currentRequestRate *= MULTIPLICATIVE_DECREASE_403;
            backoffMs = 30000;
            newBehavior.backoffUntil = Date.now() + backoffMs;
            failureType = 'BLOCKED_403';
            console.warn(`[RateLimit] ${sourceId}: 403 blocked, major backoff`);
        } else if (statusCode >= 400 && statusCode < 500) {
            // Other 4xx client errors
            newBehavior.currentRequestRate *= MULTIPLICATIVE_DECREASE_4XX;
            backoffMs = 2000;
            newBehavior.backoffUntil = Date.now() + backoffMs;
            failureType = `CLIENT_ERROR_${statusCode}`;
        } else if (statusCode === 503 || statusCode === 502) {
            // Server overload
            newBehavior.currentRequestRate *= MULTIPLICATIVE_DECREASE_5XX;
            backoffMs = 5000;
            newBehavior.backoffUntil = Date.now() + backoffMs;
            failureType = `SERVER_OVERLOAD_${statusCode}`;
        } else if (statusCode === -1 || statusCode === 0) {
            // Timeout/network error - gentle backoff
            newBehavior.currentRequestRate *= MULTIPLICATIVE_DECREASE_TIMEOUT;
            failureType = 'TIMEOUT_NETWORK';
        } else {
            failureType = `UNKNOWN_${statusCode}`;
        }

        // Ensure rate doesn't go below minimum
        newBehavior.currentRequestRate = Math.max(newBehavior.currentRequestRate, 0.1);

        newBehavior.consecutiveFailures++;
        newBehavior.failedRequests++;
        newBehavior.totalRequests++;

        // DEBUG logging for adaptive mode learning (sent to main process for terminal output)
        const rateDecrease = oldRate - newBehavior.currentRequestRate;
        const decreasePercent = ((rateDecrease / oldRate) * 100).toFixed(1);
        const logMessage = `FAILURE (${failureType}): rate ${oldRate.toFixed(2)} → ${newBehavior.currentRequestRate.toFixed(2)} req/s (-${decreasePercent}%), ` +
            `consecutiveFailures: ${newBehavior.consecutiveFailures}, ` +
            `backoff: ${backoffMs > 0 ? (backoffMs / 1000).toFixed(1) + 's' : 'none'}`;
        window.electronAPI?.app?.log?.('debug', `Adaptive:${sourceId}`, logMessage);

        const newSources = new Map(state.sources);
        newSources.set(sourceId, newBehavior);
        set({ sources: newSources });

        // Persist to DB (fire-and-forget)
        window.electronAPI?.db?.updateSourceBehavior?.(newBehavior)
            .catch((e: any) => console.warn('[SourceBehavior] Failed to persist:', e));
    },

    shouldThrottle: (sourceId: string) => {
        const behavior = get().sources.get(sourceId);
        if (!behavior) return false;

        // Check if in backoff period
        if (behavior.backoffUntil && Date.now() < behavior.backoffUntil) {
            return true;
        }

        return false;
    },

    getRequestDelay: (sourceId: string) => {
        const behavior = get().sources.get(sourceId);
        if (!behavior) return 500; // Default delay

        // Check if in backoff period
        if (behavior.backoffUntil && Date.now() < behavior.backoffUntil) {
            return behavior.backoffUntil - Date.now();
        }

        // Calculate delay from rate limit (1000ms / rate = delay between requests)
        const minDelay = 1000 / behavior.currentRequestRate;

        // Add jitter to avoid thundering herd (±20%)
        const jitter = minDelay * 0.2 * (Math.random() - 0.5);

        return Math.max(50, minDelay + jitter);
    },

    getConsecutiveFailures: (sourceId: string) => {
        const behavior = get().sources.get(sourceId);
        return behavior?.consecutiveFailures ?? 0;
    }
}));
