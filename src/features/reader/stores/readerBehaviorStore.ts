import { create } from 'zustand';

// EWMA smoothing factor (higher = more responsive to changes)
const EWMA_ALPHA = 0.3;

// Buffer sizing based on velocity (conservative to avoid rate limits)
const BUFFER_THRESHOLDS = [
    { maxVelocity: 2, bufferSize: 1 },   // Slow reader: 1 chapter ahead
    { maxVelocity: 5, bufferSize: 2 },   // Normal reader: 2 chapters
    { maxVelocity: 15, bufferSize: 3 },  // Fast reader: 3 chapters
    { maxVelocity: Infinity, bufferSize: 4 } // Speed scrolling: max 4
];

// Minimum time between page changes to count as valid (avoid skip detection)
const MIN_PAGE_DURATION_MS = 500;

interface ReadingSession {
    sourceId: string;
    mangaId: string;
    chapterId: string;
    startTime: number;
    pagesViewed: number;
    completed: boolean;
}

interface ReaderBehaviorState {
    // Reading velocity tracking
    readingVelocity: number;           // pages/min (EWMA smoothed)
    lastPageIndex: number | null;
    lastPageChangeTime: number | null;

    // Direction tracking
    forwardCount: number;
    backwardCount: number;

    // Current session
    currentSession: ReadingSession | null;

    // Actions
    recordPageView: (pageIndex: number) => void;
    calculateAdaptiveBuffer: () => number;
    getNavigationDirection: () => 'forward' | 'backward' | 'mixed';
    startSession: (sourceId: string, mangaId: string, chapterId: string) => void;
    endSession: (completed: boolean) => void;
    reset: () => void;
}

export const useReaderBehaviorStore = create<ReaderBehaviorState>((set, get) => ({
    readingVelocity: 5, // Default: 5 pages/min (normal reader)
    lastPageIndex: null,
    lastPageChangeTime: null,
    forwardCount: 0,
    backwardCount: 0,
    currentSession: null,

    recordPageView: (pageIndex: number) => {
        const state = get();
        const now = Date.now();

        // Update session page count
        if (state.currentSession) {
            set({
                currentSession: {
                    ...state.currentSession,
                    pagesViewed: state.currentSession.pagesViewed + 1
                }
            });
        }

        // Skip velocity calculation on first page
        if (state.lastPageIndex === null || state.lastPageChangeTime === null) {
            set({ lastPageIndex: pageIndex, lastPageChangeTime: now });
            return;
        }

        const timeDeltaMs = now - state.lastPageChangeTime;
        const pageDelta = pageIndex - state.lastPageIndex;

        // Track direction
        if (pageDelta > 0) {
            set({ forwardCount: state.forwardCount + 1 });
        } else if (pageDelta < 0) {
            set({ backwardCount: state.backwardCount + 1 });
        }

        // Update velocity if valid page change (not too fast = skipping)
        if (timeDeltaMs >= MIN_PAGE_DURATION_MS && pageDelta !== 0) {
            // Calculate instant velocity: pages per minute
            const instantVelocity = Math.abs(pageDelta) / (timeDeltaMs / 60000);

            // EWMA smoothing
            const newVelocity = EWMA_ALPHA * instantVelocity + (1 - EWMA_ALPHA) * state.readingVelocity;

            set({
                readingVelocity: newVelocity,
                lastPageIndex: pageIndex,
                lastPageChangeTime: now
            });
        } else {
            set({ lastPageIndex: pageIndex, lastPageChangeTime: now });
        }
    },

    calculateAdaptiveBuffer: () => {
        const { readingVelocity } = get();

        for (const threshold of BUFFER_THRESHOLDS) {
            if (readingVelocity <= threshold.maxVelocity) {
                return threshold.bufferSize;
            }
        }

        return BUFFER_THRESHOLDS[BUFFER_THRESHOLDS.length - 1].bufferSize;
    },

    getNavigationDirection: () => {
        const { forwardCount, backwardCount } = get();
        const total = forwardCount + backwardCount;

        if (total < 3) return 'mixed'; // Not enough data

        const forwardRatio = forwardCount / total;
        if (forwardRatio >= 0.8) return 'forward';
        if (forwardRatio <= 0.2) return 'backward';
        return 'mixed';
    },

    startSession: (sourceId: string, mangaId: string, chapterId: string) => {
        set({
            currentSession: {
                sourceId,
                mangaId,
                chapterId,
                startTime: Date.now(),
                pagesViewed: 0,
                completed: false
            },
            forwardCount: 0,
            backwardCount: 0,
            lastPageIndex: null,
            lastPageChangeTime: null
        });
    },

    endSession: (completed: boolean) => {
        const state = get();
        if (!state.currentSession) return;

        const session = {
            ...state.currentSession,
            completed
        };

        // Flush to database
        const readingTimeSeconds = Math.floor((Date.now() - session.startTime) / 1000);
        const todayMidnight = Math.floor(Date.now() / 86400000) * 86400;

        window.electronAPI?.db?.recordReadingStats?.({
            sessionDate: todayMidnight,
            sourceId: session.sourceId,
            mangaId: session.mangaId,
            chapterId: session.chapterId,
            pagesViewed: session.pagesViewed,
            readingTimeSeconds,
            chaptersCompleted: completed ? 1 : 0,
            avgVelocity: state.readingVelocity,
            forwardNavigations: state.forwardCount,
            backwardNavigations: state.backwardCount,
            startedAt: Math.floor(session.startTime / 1000),
            endedAt: Math.floor(Date.now() / 1000)
        }).catch((e: any) => console.warn('[ReaderBehavior] Failed to record stats:', e));

        set({ currentSession: null });
    },

    reset: () => {
        set({
            readingVelocity: 5,
            lastPageIndex: null,
            lastPageChangeTime: null,
            forwardCount: 0,
            backwardCount: 0,
            currentSession: null
        });
    }
}));
