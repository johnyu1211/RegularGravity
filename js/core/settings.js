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
            window.autoSend = settings.hasOwnProperty('autoSend') ? !!settings.autoSend : true;
            window.autoDragging = false;
            window.autoRefreshSession = !!settings.autoRefreshSession;
            window.refreshTurnCount = parseInt(settings.refreshTurnCount) || 35;
            window.sendFormat = ['pdf', 'jpeg', 'jpg'].includes(settings.sendFormat) ? settings.sendFormat : 'md';
            window.autoGemini = settings.hasOwnProperty('autoGemini') ? !!settings.autoGemini : true;
            window.preferFullWrite = settings.hasOwnProperty('preferFullWrite') ? !!settings.preferFullWrite : false;
            window.useEmote = settings.hasOwnProperty('useEmote') ? !!settings.useEmote : true;
            window.auto_delete_SendingMD = settings.hasOwnProperty('auto_delete_SendingMD') ? !!settings.auto_delete_SendingMD : (settings.hasOwnProperty('autoDeleteSendingMD') ? !!settings.autoDeleteSendingMD : true);
            window.customEmotes = (settings.customEmotes && typeof settings.customEmotes === 'object') ? settings.customEmotes : {};
            const homeBtn = document.getElementById('taskbar-home-btn');
            if (homeBtn) homeBtn.style.display = window.autoGemini ? 'none' : 'flex';
            if (typeof window.updateSendModeButtonUI === 'function') window.updateSendModeButtonUI();
            return;
        }
    } catch(e) {}
    window.useEmote = true;
    window.auto_delete_SendingMD = true;
    window.customEmotes = {};
    window.preferFullWrite = false;
    window.hideUIOverlay = true;
    window.debugMode = false;
    window.dragDropMode = true;
    window.autoSend = true;
    window.autoDragging = false;
    window.sessionTurnCount = 0;
    window.autoRefreshSession = false;
    window.refreshTurnCount = 35;
    window.sendFormat = 'md';
    window.autoGemini = true;
    const homeBtn = document.getElementById('taskbar-home-btn');
    if (homeBtn) homeBtn.style.display = 'none';
    if (typeof window.updateSendModeButtonUI === 'function') window.updateSendModeButtonUI();
};
