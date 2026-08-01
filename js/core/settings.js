window.updateSplitLayoutHeight = function(newHeight) {
    if (newHeight < 40 || newHeight > 500) return;
    window.pendingSplitHeight = newHeight;
    window.currentSplitHeight = newHeight;
    const vLC = document.getElementById('inspector-local-chat');
    if (vLC && (window.activeSubTabId === 'local' || !window.activeSubTabId || vLC.style.zIndex === '150')) {
        vLC.style.height = `calc(100% - 44px - ${newHeight}px)`;
    }
};

window.reloadAgentSettings = function() {
    const _path = require('path');
    const _fs = require('fs');
    const gravityRoot = window.appRootPath || process.cwd();
    const p = _path.join(gravityRoot, 'Settings.json');
    try {
        if (_fs.existsSync(p)) {
            const settings = JSON.parse(_fs.readFileSync(p, 'utf-8'));
            window.hideUIOverlay = settings.hasOwnProperty('hideUIOverlay') ? !!settings.hideUIOverlay : true;
            window.debugMode = !!settings.debugMode;
            window.dragDropMode = true;
            window.autoDragging = false;
            window.autoRefreshSession = !!settings.autoRefreshSession;
            window.refreshTurnCount = parseInt(settings.refreshTurnCount) || 35;
            window.sendFormat = settings.sendFormat === 'pdf' ? 'pdf' : 'md';
            window.autoGemini = !!settings.autoGemini;
            window.preferFullWrite = settings.hasOwnProperty('preferFullWrite') ? !!settings.preferFullWrite : true;
            const homeBtn = document.getElementById('taskbar-home-btn');
            if (homeBtn) homeBtn.style.display = window.autoGemini ? 'none' : 'flex';
            return;
        }
    } catch(e) {}
    window.preferFullWrite = true;
    window.hideUIOverlay = true;
    window.debugMode = false;
    window.dragDropMode = true;
    window.autoDragging = false;
    window.sessionTurnCount = 0;
    window.autoRefreshSession = false;
    window.refreshTurnCount = 35;
    window.sendFormat = 'md';
    window.autoGemini = true;
    const homeBtn = document.getElementById('taskbar-home-btn');
    if (homeBtn) homeBtn.style.display = 'none';
};
