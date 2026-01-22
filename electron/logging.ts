interface LogEntry {
    timestamp: string;
    level: string;
    message: string;
}

const MAX_MAIN_LOGS = 500;
const mainProcessLogs: LogEntry[] = [];

const originalConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
};

function captureLog(level: string, args: any[]) {
    const message = args
        .map(arg => {
            if (arg instanceof Error) {
                return `${arg.message}\n${arg.stack}`;
            }
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

    mainProcessLogs.push({ timestamp: new Date().toISOString(), level, message });
    if (mainProcessLogs.length > MAX_MAIN_LOGS) {
        mainProcessLogs.shift();
    }
}

export function setupLogging() {
    console.log = (...args) => { captureLog('LOG', args); originalConsole.log(...args); };
    console.info = (...args) => { captureLog('INFO', args); originalConsole.info(...args); };
    console.warn = (...args) => { captureLog('WARN', args); originalConsole.warn(...args); };
    console.error = (...args) => { captureLog('ERROR', args); originalConsole.error(...args); };
}

export function getFormattedMainLogs(): string {
    if (mainProcessLogs.length === 0) return 'No main process logs captured.';
    return mainProcessLogs
        .map(log => `[${log.timestamp}] [${log.level}] ${log.message}`)
        .join('\n');
}
