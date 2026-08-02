if (typeof ipcRenderer === 'undefined') { var { ipcRenderer } = require('electron'); }

window.totalFilesCount = 0;
window.readFilesSet = new Set();
window.currentBatchFileCount = 0;
window.currentPath = process.cwd();
window.currentSplitHeight = 0;
window.pendingSplitHeight = 120;
window.requestedFilesQueue = [];

// Hook ipcRenderer.send to capture currentlyDraggedFilePath on dragstart
const originalSend = ipcRenderer.send.bind(ipcRenderer);
ipcRenderer.send = function(channel, ...args) {
    if (channel === 'ondragstart') {
        window.currentlyDraggedFilePath = args[0];
        console.log("[HostDrag] Captured currentlyDraggedFilePath:", window.currentlyDraggedFilePath);
    }
    return originalSend(channel, ...args);
};
