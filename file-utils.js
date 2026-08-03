// File System Utilities for VaporTool
if (typeof ipcRenderer === 'undefined') {
    var { ipcRenderer } = require('electron');
}
if (typeof path === 'undefined') {
    var path = require('path');
}

async function fetchDirContent(dirPath) {
    try {
        return await ipcRenderer.invoke('get-directory-content', dirPath);
    } catch (err) {
        console.error("Failed to fetch dir:", err);
        return [];
    }
}

async function loadDirectory(targetPath, silent = false) {
    if (targetPath !== 'DRIVES') {
        const fs = require('fs');
        if (!fs.existsSync(targetPath)) {
            if (typeof window.showUserScreenToast === 'function' && !silent) {
                window.showUserScreenToast(`Directory no longer exists: "${targetPath}"`, 4000, false);
            }
            if (typeof window.openProjectModal === 'function') {
                window.openProjectModal();
            }
            return;
        }
    }
    window.currentPath = targetPath;
    if (targetPath === 'DRIVES') {
        if (window.loadDrives) await window.loadDrives();
    } else {
        window.projectRoot = targetPath;
        if (window.terminalSessions) {
            Object.keys(window.terminalSessions).forEach(tId => {
                if (window.terminalSessions[tId]) {
                    window.terminalSessions[tId].cwd = targetPath;
                    ipcRenderer.send('execute-cmd', { tabId: tId, command: `cd "${targetPath}"`, cwd: targetPath });
                }
            });
        }
        const files = await window.fetchDirContent(targetPath);
        window.allFiles = files;
        if (window.renderTree) await window.renderTree(targetPath, files);
        if (window.renderFolderMap) await window.renderFolderMap(targetPath, files);
    }
    if (window.updatePathDisplay) window.updatePathDisplay();
}

window.fetchDirContent = fetchDirContent;
window.loadDirectory = loadDirectory;
