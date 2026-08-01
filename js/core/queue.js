// Hook readFilesSet.add
const originalAdd = window.readFilesSet.add.bind(window.readFilesSet);
window.readFilesSet.add = function(filePath) {
    const result = originalAdd(filePath);
    if (typeof window.markFileAsCompleted === 'function') {
        window.markFileAsCompleted(filePath);
    }
    return result;
};

window.markFileAsCompleted = function(filePath) {
    const path = require('path');
    const normalizedTarget = path.resolve(window.currentPath || process.cwd(), filePath).replace(/\//g, '\\').toLowerCase();
    const item = window.requestedFilesQueue.find(x => x.absolutePath.replace(/\//g, '\\').toLowerCase() === normalizedTarget);
    if (item) {
        item.status = 'COMPLETED';
        if (typeof window.updateDragDropQueueUI === 'function') {
            window.updateDragDropQueueUI();
        }
    }
};

window.addFileToRequestedQueue = function(filePath) {
    window.dragDropAbortMessage = null;
    window.autoDraggingTempDisabled = false;
    const path = require('path');
    const gravityRoot = window.appRootPath || process.cwd();
    const isSendingMd = filePath.startsWith('SendingMD') || filePath.includes('/SendingMD/') || filePath.includes('\\SendingMD\\');
    const baseDir = isSendingMd ? gravityRoot : (window.currentPath || process.cwd());
    const absolutePath = path.resolve(baseDir, filePath);
    const normalizedPath = absolutePath.replace(/\//g, '\\').toLowerCase();
    const relativePath = path.relative(window.currentPath || process.cwd(), absolutePath);
    
    if (!window.requestedFilesQueue.some(x => x.absolutePath.replace(/\//g, '\\').toLowerCase() === normalizedPath)) {
        let isCompleted = false;
        for (let readPath of window.readFilesSet) {
            if (path.resolve(window.currentPath || process.cwd(), readPath).replace(/\//g, '\\').toLowerCase() === normalizedPath) {
                isCompleted = true;
                break;
            }
        }
        window.requestedFilesQueue.push({
            absolutePath,
            relativePath,
            status: isCompleted ? 'COMPLETED' : 'PENDING'
        });
        if (typeof window.updateDragDropQueueUI === 'function') {
            window.updateDragDropQueueUI();
        }
    }
};
