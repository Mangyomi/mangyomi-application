import { store } from '../store';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'verbose';

const LOG_LEVELS: Record<LogLevel, number> = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
    verbose: 4
};

const COLORS = {
    error: '\x1b[31m',   // Red
    warn: '\x1b[33m',    // Yellow
    info: '\x1b[36m',    // Cyan
    debug: '\x1b[35m',   // Magenta
    verbose: '\x1b[90m', // Gray
    reset: '\x1b[0m'
};

class Logger {
    private context: string;

    constructor(context: string = 'App') {
        this.context = context;
    }

    private shouldLog(level: LogLevel): boolean {
        const currentLevel = store.get('logLevel', 'info') as LogLevel;
        return LOG_LEVELS[level] <= LOG_LEVELS[currentLevel];
    }

    private formatMessage(level: LogLevel, message: string, ...args: any[]): string {
        const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
        return `${timestamp} [${this.context}] ${level.toUpperCase()}: ${message}`;
    }

    private log(level: LogLevel, message: string, ...args: any[]): void {
        if (!this.shouldLog(level)) return;

        const color = COLORS[level];
        const reset = COLORS.reset;
        const formattedMessage = this.formatMessage(level, message, ...args);

        switch (level) {
            case 'error':
                console.error(`${color}${formattedMessage}${reset}`, ...args);
                break;
            case 'warn':
                console.warn(`${color}${formattedMessage}${reset}`, ...args);
                break;
            default:
                console.log(`${color}${formattedMessage}${reset}`, ...args);
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
export const logger = new Logger('Main');
