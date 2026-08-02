document.addEventListener('DOMContentLoaded', async () => {
    try {
        if (typeof migrateToVault === 'function') await migrateToVault();
    } catch (e) {
        console.error("migrateToVault failed:", e);
    }
    
    const selectBox = document.getElementById('terminal-sub-tabs');
    if (selectBox && typeof setupHorizontalScroll === 'function') setupHorizontalScroll(selectBox);
    
    try {
        if (typeof addSubTerminal === 'function') addSubTerminal(true);
    } catch (e) {
        console.error("addSubTerminal failed:", e);
    }

    try {
        if (typeof GravityVault !== 'undefined' && GravityVault.init) await GravityVault.init();
    } catch (e) {
        console.error("GravityVault init failed:", e);
    }

    try {
        if (typeof setupBoot === 'function') await setupBoot();
    } catch (e) {
        console.error("setupBoot failed:", e);
    }

    try {
        if (typeof setupUI === 'function') setupUI();
    } catch (e) {
        console.error("setupUI failed:", e);
    }
    
    if (typeof openProjectModal === 'function') {
        openProjectModal();
    }
    
    if (typeof bindDragAndDrop === 'function') {
        bindDragAndDrop();
    }
    
    if (typeof ChatUI !== 'undefined' && typeof ChatUI.restoreHistory === 'function') {
        await ChatUI.restoreHistory();
    }
    
    const chatIn = document.getElementById('local-agent-input');
    if (chatIn) {
        setTimeout(() => {
            if (typeof window.swi === 'function') window.swi('browser');
            chatIn.focus();
            chatIn.click();
        }, 300);
    }
    
    if (typeof ipcRenderer !== 'undefined') {
        ipcRenderer.on('trigger-app-reload', () => {
            location.reload();
        });
        
        ipcRenderer.on('refresh-explorer', () => { 
            if (typeof window.loadDirectory === 'function') window.loadDirectory(window.currentPath); 
        });
    }
});

window.setCoverLifted = function(lifted) {
    // No-op: Bottom BROWSER area is permanently exposed on local tab.
};
