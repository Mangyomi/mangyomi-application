export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'verbose';

const LOG_LEVELS: Record<LogLevel, number> = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
    verbose: 4
};

const COLORS = {
    error: 'color: #ff4444; font-weight: bold',
    warn: 'color: #ffaa00; font-weight: bold',
    info: 'color: #00aaff; font-weight: bold',
    debug: 'color: #aa00ff; font-weight: bold',
    verbose: 'color: #888888',
};

class Logger {
    private context: string;

    constructor(context: string = 'App') {
        this.context = context;
    }

    private async getCurrentLogLevel(): Promise<LogLevel> {
        try {
            if (typeof window !== 'undefined' && window.electronAPI?.settings) {
                const level = await window.electronAPI.settings.get('logLevel');
                return (level as LogLevel) || 'info';
            }
        } catch (e) {
            // Fallback if settings not available
        }
        return 'info';
    }

    private shouldLog(level: LogLevel, currentLevel: LogLevel): boolean {
        return LOG_LEVELS[level] <= LOG_LEVELS[currentLevel];
    }

    private formatMessage(level: LogLevel, message: string): string {
        const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
        return `${timestamp} [${this.context}] ${level.toUpperCase()}: ${message}`;
    }

    private async log(level: LogLevel, message: string, ...args: any[]): Promise<void> {
        const currentLevel = await this.getCurrentLogLevel();
        if (!this.shouldLog(level, currentLevel)) return;

        const style = COLORS[level];
        const formattedMessage = this.formatMessage(level, message);

        switch (level) {
            case 'error':
                console.error(`%c${formattedMessage}`, style, ...args);
                break;
            case 'warn':
                console.warn(`%c${formattedMessage}`, style, ...args);
                break;
            default:
                console.log(`%c${formattedMessage}`, style, ...args);
        }
    }

    error(message: string, ...args: any[]): void {
        this.log('error', message, ...args);
    }

    warn(message: string, ...args: any[]): void {
        this.log('warn', message, ...args);
    }

    info(message: string, ...args: any[]): void {
        this.log('info', message, ...args);
    }

    debug(message: string, ...args: any[]): void {
        this.log('debug', message, ...args);
    }

    verbose(message: string, ...args: any[]): void {
        this.log('verbose', message, ...args);
    }
}

// Create and export logger factory
export function createLogger(context: string): Logger {
    return new Logger(context);
}

// Export default logger
export const logger = new Logger('Renderer');
