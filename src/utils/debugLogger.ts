interface LogEntry {
    timestamp: string;
    level: 'log' | 'info' | 'warn' | 'error';
    message: string;
}

interface NetworkEntry {
    timestamp: string;
    method: string;
    url: string;
    status?: number;
    duration?: number;
    error?: string;
}

const MAX_LOG_ENTRIES = 500;
const MAX_NETWORK_ENTRIES = 200;

class DebugLogger {
    private logs: LogEntry[] = [];
    private networkActivity: NetworkEntry[] = [];
    private originalConsole: Pick<Console, 'log' | 'info' | 'warn' | 'error'>;
    private originalFetch: typeof fetch;

    constructor() {
        this.originalConsole = {
            log: console.log.bind(console),
            info: console.info.bind(console),
            warn: console.warn.bind(console),
            error: console.error.bind(console),
        };
        this.originalFetch = window.fetch.bind(window);
        this.interceptConsole();
        this.interceptFetch();
    }

    private interceptConsole() {
        const levels: Array<'log' | 'info' | 'warn' | 'error'> = ['log', 'info', 'warn', 'error'];

        levels.forEach(level => {
            console[level] = (...args: any[]) => {
                this.addLog(level, args);
                this.originalConsole[level](...args);
            };
        });
    }

    private interceptFetch() {
        window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
            const method = init?.method || 'GET';
            const startTime = Date.now();

            const entry: NetworkEntry = {
                timestamp: new Date().toISOString(),
                method,
                url: url.substring(0, 200), // Truncate long URLs
            };

            try {
                const response = await this.originalFetch(input, init);
                entry.status = response.status;
                entry.duration = Date.now() - startTime;
                this.addNetworkEntry(entry);
                return response;
            } catch (error) {
                entry.error = error instanceof Error ? error.message : 'Unknown error';
                entry.duration = Date.now() - startTime;
                this.addNetworkEntry(entry);
                throw error;
            }
        };
    }

    private addLog(level: LogEntry['level'], args: any[]) {
        const message = args
            .map(arg => {
                if (typeof arg === 'object') {
                    try {
                        return JSON.stringify(arg, null, 2).substring(0, 500);
                    } catch {
                        return String(arg);
                    }
                }
                return String(arg);
            })
            .join(' ')
            .substring(0, 1000);

        this.logs.push({
            timestamp: new Date().toISOString(),
            level,
            message,
        });

        if (this.logs.length > MAX_LOG_ENTRIES) {
            this.logs.shift();
        }
    }

    private addNetworkEntry(entry: NetworkEntry) {
        this.networkActivity.push(entry);
        if (this.networkActivity.length > MAX_NETWORK_ENTRIES) {
            this.networkActivity.shift();
        }
    }

    getLogs(): LogEntry[] {
        return [...this.logs];
    }

    getNetworkActivity(): NetworkEntry[] {
        return [...this.networkActivity];
    }

    getFormattedLogs(): string {
        if (this.logs.length === 0) return 'No console logs captured.';

        return this.logs
            .map(log => `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}`)
            .join('\n');
    }

    getFormattedNetwork(): string {
        if (this.networkActivity.length === 0) return 'No network activity captured.';

        return this.networkActivity
            .map(net => {
                const status = net.status ? `${net.status}` : 'FAILED';
                const duration = net.duration ? `${net.duration}ms` : '?';
                const error = net.error ? ` - Error: ${net.error}` : '';
                return `[${net.timestamp}] ${net.method} ${net.url} → ${status} (${duration})${error}`;
            })
            .join('\n');
    }

    clear() {
        this.logs = [];
        this.networkActivity = [];
    }
}

export const debugLogger = new DebugLogger();
