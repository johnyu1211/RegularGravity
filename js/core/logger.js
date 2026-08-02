const logPath = require('path').join(process.cwd(), 'renderer.log');
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

function writeToLogFile(type, args) {
    try {
        const msg = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
        require('fs').appendFileSync(logPath, `[${new Date().toISOString()}] [${type}] ${msg}\n`, 'utf-8');
    } catch(e) {}
}

const isUploadRelated = (args) => {
    try {
        const msg = args.map(arg => {
            if (!arg) return "";
            if (typeof arg === 'object') {
                if (arg instanceof Error) return arg.stack || arg.message;
                try { return JSON.stringify(arg); } catch(e) { return "[Object]"; }
            }
            return String(arg);
        }).join(' ').toLowerCase();
        
        const patterns = [
            'upload', 'drop', 'drag', 'file', 'inject', 'payload', 
            'progress', 'sent', 'prepared', 'comple', 'auto', 'click'
        ];
        return patterns.some(p => msg.includes(p));
    } catch(e) {
        return false;
    }
};

console.log = function(...args) {
    if (isUploadRelated(args)) {
        originalConsoleLog.apply(console, args);
    }
    writeToLogFile('LOG', args);
};
console.error = function(...args) {
    const msgStr = args.map(arg => typeof arg === 'object' ? (arg instanceof Error ? arg.message : JSON.stringify(arg)) : String(arg)).join(' ');
    if (msgStr.includes('GUEST_VIEW_MANAGER_CALL') || msgStr.includes('Failed to inject guest interceptor')) return;
    originalConsoleError.apply(console, args);
    writeToLogFile('ERROR', args);
};
console.warn = function(...args) {
    if (isUploadRelated(args)) {
        originalConsoleWarn.apply(console, args);
    }
    writeToLogFile('WARN', args);
};
