window.fetchDirContent = async (p) => {
    if (window.activeWebDirHandle && (!window.process || window.process.platform === 'browser')) {
        try {
            const files = [];
            let currentHandle = window.activeWebDirHandle;
            const rootName = window.activeWebDirHandle.name;
            if (p && p !== rootName && p !== 'DRIVES') {
                const relative = p.replace(new RegExp('^' + rootName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[/\\\\]?'), '');
                const parts = relative.split(/[\\/]/).filter(Boolean);
                for (const part of parts) {
                    currentHandle = await currentHandle.getDirectoryHandle(part);
                }
            }
            for await (const entry of currentHandle.values()) {
                files.push({
                    name: entry.name,
                    isDir: entry.kind === 'directory'
                });
            }
            return files;
        } catch(e) {
            console.warn("Web directory fetch fallback:", e);
        }
    }
    return await ipcRenderer.invoke('get-directory-content', p);
};

function formatPathDisplay(pathStr) {
    if (pathStr === 'DRIVES') return 'THIS PC';
    if (!pathStr) return '';
    const parts = pathStr.split(/[\\/]/).filter(Boolean);
    if (parts.length > 2) {
        const lastTwo = parts.slice(-2);
        return `... \\ ${lastTwo[0]} \\ ${lastTwo[1]}`;
    }
    return pathStr;
}

let _loadDirSeq = 0;
window.loadDirectory = async (p) => {
    const seq = ++_loadDirSeq;
    try {
        window.currentPath = p; 
        if (p && p !== 'DRIVES') {
            if (!window.projectRoot) {
                window.projectRoot = p;
            }
            if (window.terminalSessions) {
                Object.keys(window.terminalSessions).forEach(tId => {
                    if (window.terminalSessions[tId]) {
                        window.terminalSessions[tId].cwd = p;
                        ipcRenderer.send('execute-cmd', { tabId: tId, command: `cd "${p}"`, cwd: p });
                    }
                });
            }
        }
        if (typeof updateTerminalPrompt === 'function') updateTerminalPrompt();
        const pathDisp = document.getElementById('path-display');
        if (pathDisp) pathDisp.innerHTML = `<span class="path-segment">${formatPathDisplay(p)}</span>`;
        const badge = document.getElementById('active-project-badge'); if (badge) badge.innerText = p === 'DRIVES' ? 'PC' : p.split(/[\\\/]/).pop().toUpperCase() || 'GRAVITY';
        const f = await window.fetchDirContent(p === 'DRIVES' ? '' : p);
        if (seq !== _loadDirSeq) return; 
        if (f == null) return;           
        if (window.renderTree) window.renderTree(p, f);
        
        const copyBtn = document.getElementById('path-copy-btn');
        const container = document.getElementById('path-display-container');
        if (container && copyBtn && !window.hasPathCopyBind) {
            container.onclick = async (e) => {
                e.stopPropagation();
                if (window.currentPath && window.currentPath !== 'DRIVES') {
                    await navigator.clipboard.writeText(window.currentPath);
                    const pathDisplay = document.getElementById('path-display');
                    if (pathDisplay) {
                        const originalHTML = pathDisplay.innerHTML;
                        pathDisplay.innerHTML = `<span style="color: #10b981; font-weight: 600;">Copied!</span>`;
                        copyBtn.style.opacity = '1';
                        copyBtn.style.color = '#10b981';
                        const originalSvg = copyBtn.innerHTML;
                        copyBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                        
                        setTimeout(() => {
                            pathDisplay.innerHTML = originalHTML;
                            copyBtn.innerHTML = originalSvg;
                            copyBtn.style.color = '';
                            copyBtn.style.opacity = '';
                        }, 1000);
                    }
                }
            };
            window.hasPathCopyBind = true;
        }
        const revealBtn = document.getElementById('reveal-btn');
        if (revealBtn && !window.hasRevealBind) {
            revealBtn.onclick = (e) => {
                e.stopPropagation();
                if (window.currentPath && window.currentPath !== 'DRIVES') {
                    const { ipcRenderer } = require('electron');
                    ipcRenderer.send('reveal-in-explorer', window.currentPath);
                }
            };
            window.hasRevealBind = true;
        }

        const fileSearchInput = document.getElementById('file-search');
        if (fileSearchInput && !window.hasFileSearchBind) {
            fileSearchInput.oninput = (e) => {
                const query = e.target.value.trim();
                const cur = window.currentPath || process.cwd();
                if (typeof window.fetchDirContent === 'function' && typeof window.renderTree === 'function') {
                    window.fetchDirContent(cur === 'DRIVES' ? '' : cur).then(files => {
                        if (files) window.renderTree(cur, files, query);
                    });
                }
            };
            window.hasFileSearchBind = true;
        }
    } catch (e) { }
};

if (!window.hasEditorSearchBind) {
    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
            const searchInput = document.getElementById('editor-search-input');
            if (searchInput && searchInput.offsetParent !== null) { e.preventDefault(); searchInput.focus(); searchInput.select(); }
        }
    });
    window.hasEditorSearchBind = true;
}

const syncBrowserView = (() => {
    let syncPending = false;
    return () => {
        if (syncPending) return; syncPending = true;
        requestAnimationFrame(() => {
            try {
                const dock = document.getElementById('agent-view-dock'), hub = document.getElementById('inspector-browser-hub');
                if (dock && hub && hub.style.display === 'flex' && document.getElementById('agent-hub-webview')?.style.display === 'flex') {
                    const rect = dock.getBoundingClientRect();
                    ipcRenderer.send('sync-agent-view-bounds', { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) });
                }
            } catch (e) { }
            syncPending = false;
        });
    };
})();
window.syncBrowserView = syncBrowserView;

setTimeout(() => {
    const dockEl = document.getElementById('agent-view-dock');
    if (dockEl) {
        new ResizeObserver(() => {
            syncBrowserView();
        }).observe(dockEl);
    }
}, 500);
