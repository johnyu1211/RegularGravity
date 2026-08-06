if (typeof ipcRenderer === 'undefined') { var { ipcRenderer } = require('electron'); }
window.projectRoot = null;

window.selectProject = async (folderPath) => {
    if (!folderPath) return;
    
    if (typeof window.showDirectoryPicker === 'function' && (!window.process || window.process.platform === 'browser')) {
        window.webDirectoryHandles = window.webDirectoryHandles || {};
        if (window.webDirectoryHandles[folderPath]) {
            window.activeWebDirHandle = window.webDirectoryHandles[folderPath];
            if (typeof window.cacheWebDirectory === 'function') {
                await window.cacheWebDirectory(window.activeWebDirHandle, folderPath);
            }
        } else if (!window.activeWebDirHandle || window.activeWebDirHandle.name !== folderPath) {
            try {
                if (typeof window.showUserScreenToast === 'function') {
                    window.showUserScreenToast(`Grant access for "${folderPath}"`, 3000, true);
                }
                const dirHandle = await window.showDirectoryPicker();
                if (dirHandle) {
                    window.webDirectoryHandles[dirHandle.name] = dirHandle;
                    window.activeWebDirHandle = dirHandle;
                    folderPath = dirHandle.name;
                    if (typeof window.cacheWebDirectory === 'function') {
                        await window.cacheWebDirectory(dirHandle, folderPath);
                    }
                }
            } catch(e) {
                console.log("Web project selection cancelled:", e);
                return;
            }
        }
    }
    
    const path = require('path');
    try {
        const files = fs.readdirSync(folderPath);
        files.forEach(file => {
            if (file.startsWith('_project_rules_') && file.endsWith('.md')) {
                fs.unlinkSync(path.join(folderPath, file));
            }
        });
    } catch(e) {}

    window.sessionTurnCount = 0;
    window.projectRoot = folderPath;
    window.currentPath = folderPath;
    
    // Sync all terminal sessions cwd to selected project folder
    if (window.terminalSessions) {
        Object.keys(window.terminalSessions).forEach(tId => {
            if (window.terminalSessions[tId]) {
                window.terminalSessions[tId].cwd = folderPath;
            }
        });
        if (typeof updateTerminalPrompt === 'function') {
            updateTerminalPrompt();
        }
    }

    ipcRenderer.send('save-recent-project', folderPath);
    window.reloadAgentSettings();

    const modal = document.getElementById('project-picker-modal');
    if (modal) modal.style.display = 'none';

    await window.loadDirectory(folderPath);

    const localTab = document.getElementById('tab-local-agent');
    if (localTab) {
        localTab.click();
        const chatIn = document.getElementById('local-agent-input');
        if (chatIn) chatIn.focus();
    }

    // Reset briefing state and trigger boot briefing for the new project
    window.sessionBriefed = false;
    window.briefingInProgress = false;
    if (typeof setupBoot === 'function') {
        setupBoot().catch(err => console.error("Failed setupBoot on selectProject:", err));
    }
};

async function openProjectModal(newItemPath = null, isRefresh = false) {
    window.openProjectModal = openProjectModal; // self export
    const modal = document.getElementById('project-picker-modal');
    if (!modal) return;
    modal.style.display = 'flex';

    const isBrowser = (!window.process || window.process.platform === 'browser');
    const recents = await ipcRenderer.invoke('get-recent-projects');
    const list = document.getElementById('recent-projects-list');
    const recentsSection = list ? list.parentElement : null;
    const addRecentBtn = document.getElementById('picker-add-recent-btn');
    const refreshBtn = document.getElementById('picker-refresh-btn');
    const browseBtn = document.getElementById('picker-browse-btn');
    const footerBtns = browseBtn ? browseBtn.parentElement : null;

    if (isBrowser) {
        if (recentsSection) recentsSection.style.display = 'none';
        if (addRecentBtn) addRecentBtn.style.display = 'none';
        if (refreshBtn) refreshBtn.style.display = 'none';
        if (footerBtns) {
            footerBtns.style.justifyContent = 'center';
            footerBtns.style.padding = '36px 28px 44px';
        }
        if (browseBtn) {
            browseBtn.style.padding = '14px 42px';
            browseBtn.style.fontSize = '15px';
            browseBtn.style.width = '100%';
            browseBtn.style.maxWidth = '300px';
            browseBtn.style.boxShadow = '0 8px 24px rgba(70, 140, 246, 0.35)';
        }
    } else {
        if (recentsSection) recentsSection.style.display = 'block';
        if (addRecentBtn) addRecentBtn.style.display = 'inline-block';
        if (refreshBtn) refreshBtn.style.display = 'inline-block';
        if (footerBtns) {
            footerBtns.style.justifyContent = 'flex-end';
            footerBtns.style.padding = '16px 28px 24px';
        }
        if (browseBtn) {
            browseBtn.style.padding = '10px 22px';
            browseBtn.style.fontSize = '13px';
            browseBtn.style.width = 'auto';
            browseBtn.style.boxShadow = 'none';
        }
    }

    if (list) {
        if (!recents || recents.length === 0) {
            list.innerHTML = `<div style="font-size:12px; color:#777; padding:10px 0; font-family:'JetBrains Mono',monospace; text-align:center;">No recent projects</div>`;
        } else {
            list.innerHTML = recents.map((p, i) => {
                const name = p.split(/[\\/]/).pop() || p;
                const short = p.length > 48 ? '...' + p.slice(-45) : p;
                const isNew = newItemPath && (p === newItemPath || (typeof p === 'string' && p.toLowerCase() === newItemPath.toLowerCase()));
                const animClass = isRefresh ? 'recent-item-stagger' : (isNew ? 'recent-item-new' : '');
                const delayStyle = isRefresh ? `style="animation-delay: ${i * 0.04}s;"` : '';

                return `<div data-path="${p}" class="recent-project-item ${animClass}" ${delayStyle} onclick="window.selectProject(this.getAttribute('data-path'))">
                    <div style="min-width:0;">
                        <div class="recent-project-title" style="font-size:13px; font-weight:600; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; transition: color 0.2s;">${name}</div>
                        <div class="recent-project-path" style="font-size:10.5px; color:var(--text-muted); font-family:'JetBrains Mono',monospace; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:3px; transition: color 0.2s;">${short}</div>
                    </div>
                </div>`;
            }).join('');
        }
    }

    if (addRecentBtn) {
        addRecentBtn.onclick = async () => {
            if (typeof window.showDirectoryPicker === 'function' && (!window.process || window.process.platform === 'browser')) {
                try {
                    const dirHandle = await window.showDirectoryPicker();
                    if (dirHandle) {
                        window.webFileCache = {};
                        window.activeWebDirHandle = dirHandle;
                        window.webDirectoryHandles = window.webDirectoryHandles || {};
                        window.webDirectoryHandles[dirHandle.name] = dirHandle;
                        if (typeof window.cacheWebDirectory === 'function') {
                            await window.cacheWebDirectory(dirHandle, dirHandle.name);
                        }
                        let recents = [];
                        try { recents = JSON.parse(localStorage.getItem('recent_projects') || '[]'); } catch(e) {}
                        if (!Array.isArray(recents)) recents = [];
                        recents = recents.filter(p => p !== dirHandle.name);
                        recents.unshift(dirHandle.name);
                        if (recents.length > 10) recents = recents.slice(0, 10);
                        localStorage.setItem('recent_projects', JSON.stringify(recents));

                        if (typeof openProjectModal === 'function') {
                            await openProjectModal(dirHandle.name, true);
                        }
                    }
                } catch(e) {
                    console.log("Directory picker canceled:", e);
                }
                return;
            }
            let parentDir = null;
            if (window._lastAddRecentPath) {
                try {
                    const path = require('path');
                    parentDir = path.dirname(window._lastAddRecentPath);
                } catch(e) {}
            }
            const selected = await ipcRenderer.invoke('select-folder-dialog', parentDir);
            if (selected) {
                window._lastAddRecentPath = selected;
                ipcRenderer.send('save-recent-project', selected);
                try {
                    const fs = require('fs');
                    const path = require('path');
                    const appData = process.env.APPDATA || (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Roaming') : '');
                    if (appData) {
                        const file = path.join(appData, 'regular-gravity', 'recent_projects.json');
                        let recents = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : [];
                        if (!Array.isArray(recents)) recents = [];
                        recents = recents.filter(p => p !== selected);
                        recents.unshift(selected);
                        if (recents.length > 10) recents = recents.slice(0, 10);
                        fs.writeFileSync(file, JSON.stringify(recents), 'utf-8');
                    }
                } catch(e) {}

                if (typeof openProjectModal === 'function') {
                    await openProjectModal(selected);
                }
            }
        };
    }

    if (browseBtn) {
        browseBtn.onclick = async () => {
            if (typeof window.showDirectoryPicker === 'function' && (!window.process || window.process.platform === 'browser')) {
                try {
                    const dirHandle = await window.showDirectoryPicker();
                    if (dirHandle) {
                        window.webFileCache = {};
                        window.activeWebDirHandle = dirHandle;
                        if (typeof window.showUserScreenToast === 'function') {
                            window.showUserScreenToast(`Loading folder "${dirHandle.name}"...`, 3000, true);
                        }
                        if (typeof window.cacheWebDirectory === 'function') {
                            await window.cacheWebDirectory(dirHandle, dirHandle.name);
                        }
                        window.selectProject(dirHandle.name);
                    }
                } catch(e) {
                    console.log("Directory picker canceled:", e);
                }
                return;
            }
            const selected = await ipcRenderer.invoke('select-folder-dialog');
            if (selected) window.selectProject(selected);
        };
    }

    if (refreshBtn) {
        // Maintain cooling state on refresh button
        if (window._isPickerRefreshCooling) {
            refreshBtn.style.opacity = '0.35';
            refreshBtn.style.cursor = 'not-allowed';
            refreshBtn.style.pointerEvents = 'none';
        } else {
            refreshBtn.style.opacity = '1';
            refreshBtn.style.cursor = 'pointer';
            refreshBtn.style.pointerEvents = 'auto';
        }

        refreshBtn.onclick = async () => {
            if (window._isPickerRefreshCooling) return;
            window._isPickerRefreshCooling = true;

            refreshBtn.style.opacity = '0.35';
            refreshBtn.style.cursor = 'not-allowed';
            refreshBtn.style.pointerEvents = 'none';

            const icon = document.getElementById('picker-refresh-icon');
            if (icon) icon.style.transform = 'rotate(360deg)';
            
            // 1. Staggered fade out of existing items from top to bottom
            const items = document.querySelectorAll('.recent-project-item');
            if (items.length > 0) {
                items.forEach((item, index) => {
                    item.style.transition = `all 0.15s ease ${index * 0.03}s`;
                    item.style.opacity = '0';
                    item.style.transform = 'translateX(25px)';
                });
                await new Promise(r => setTimeout(r, items.length * 30 + 150));
            }

            // 2. Re-render list with staggered slide-in from top to bottom
            await openProjectModal(null, true);
            setTimeout(() => { if (icon) icon.style.transform = 'none'; }, 300);

            // 3. Reset 0.8-second cooldown
            setTimeout(() => {
                window._isPickerRefreshCooling = false;
                const rBtn = document.getElementById('picker-refresh-btn');
                if (rBtn) {
                    rBtn.style.opacity = '1';
                    rBtn.style.cursor = 'pointer';
                    rBtn.style.pointerEvents = 'auto';
                }
            }, 800);
        };
    }

    const noticeBtn = document.getElementById('picker-notice-btn');
    if (noticeBtn) {
        noticeBtn.onclick = () => {
            if (typeof window.showNoticeModal === 'function') {
                window.showNoticeModal(true);
            }
        };
    }

    const eBtn = document.getElementById('picker-e-btn');
    const secretTrigger = document.getElementById('secret-emote-trigger');
    const mainView = document.getElementById('picker-main-container');
    const emoteView = document.getElementById('picker-emote-container');
    const emoteBackBtn = document.getElementById('picker-emote-back-btn');

    const openEmoteView = () => {
        if (mainView && emoteView) {
            mainView.style.display = 'none';
            emoteView.style.display = 'flex';

            if (typeof window.reloadAgentSettings === 'function') window.reloadAgentSettings();

            const chkEmote = document.getElementById('chk-use-emote-setting');
            if (chkEmote) chkEmote.checked = window.useEmote !== false;

            const defaultKeys = ['def', 'joy', 'trust', 'antici', 'awe', 'sad', 'angr', 'fear', 'disgust', 'surpr'];
            const defaultGrid = document.getElementById('default-emote-urls-grid');
            if (defaultGrid) {
                const customMap = window.customEmotes || {};
                defaultGrid.innerHTML = defaultKeys.map(k => {
                    const currentUrl = customMap[k] || '';
                    const previewSrc = currentUrl || `js/e/${k}.png`;
                    return `
                        <div style="background:var(--surface-high, #252529); border:none; border-radius:8px; padding:8px 10px; display:flex; align-items:center; gap:8px;">
                            <img src="${previewSrc}" style="width:24px; height:24px; object-fit:contain; flex-shrink:0; background:rgba(0,0,0,0.2); border-radius:4px; padding:2px; cursor:pointer;" title="Click to play preview" onclick="const url=this.parentNode.querySelector('.def-emote-url-input')?.value.trim(); window.triggerCenterEmote(url||'js/e/${k}.png');" onerror="this.src='js/e/${k}.png';">
                            <span style="font-size:10.5px; font-weight:700; color:var(--text-main); width:45px; flex-shrink:0; font-family:'Outfit',sans-serif; cursor:pointer; -webkit-user-select:none; user-select:none; transition:color 0.2s;" title="Click to play preview" onmouseenter="this.style.color='#468CF6';" onmouseleave="this.style.color='var(--text-main)';" onclick="const url=this.parentNode.querySelector('.def-emote-url-input')?.value.trim(); window.triggerCenterEmote(url||'js/e/${k}.png');">${k}</span>
                            <input class="def-emote-url-input" data-key="${k}" type="text" value="${currentUrl.replace(/"/g, '&quot;')}" placeholder="Default PNG" style="flex:1; min-width:0; background:var(--surface-low, #18181b); border:none; color:#eee; font-size:10px; padding:4px 7px; border-radius:5px; outline:none;">
                        </div>
                    `;
                }).join('');
            }

            const extraList = document.getElementById('extra-custom-emotes-list');
            if (extraList) {
                const customMap = window.customEmotes || {};
                const extraKeys = Object.keys(customMap).filter(k => !defaultKeys.includes(k));
                
                const renderExtraRow = (keyVal = '', urlVal = '') => {
                    const row = document.createElement('div');
                    row.className = 'extra-emote-row';
                    row.style.cssText = 'display:flex; align-items:center; gap:8px; background:transparent; border:none; padding:4px 0;';
                    row.innerHTML = `
                        <input class="extra-emote-key" type="text" value="${keyVal.replace(/"/g, '&quot;')}" placeholder="Key (e.g. happiness)" style="width:105px; flex-shrink:0; background:var(--surface-low, #18181b); border:none; color:#eee; font-size:10.5px; padding:4px 7px; border-radius:5px; outline:none; font-weight:600;">
                        <input class="extra-emote-url" type="text" value="${urlVal.replace(/"/g, '&quot;')}" placeholder="Image URL (https://...)" style="flex:1; min-width:0; background:var(--surface-low, #18181b); border:none; color:#eee; font-size:10.5px; padding:4px 7px; border-radius:5px; outline:none;">
                        <button type="button" class="play-extra-emote-btn" style="background:rgba(255,255,255,0.06); border:none; color:var(--text-muted, #aaa); cursor:pointer; font-size:10px; font-weight:700; padding:3px 8px; border-radius:5px; flex-shrink:0; transition:all 0.2s;" onmouseenter="this.style.color='#fff'; this.style.background='rgba(255,255,255,0.12)';" onmouseleave="this.style.color='var(--text-muted, #aaa)'; this.style.background='rgba(255,255,255,0.06)';" title="Test play emote animation">▶ Play</button>
                        <button type="button" class="del-extra-emote-btn" style="background:transparent; border:none; color:#ef4444; cursor:pointer; font-size:13px; font-weight:bold; padding:2px 6px;">✕</button>
                    `;
                    row.querySelector('.play-extra-emote-btn').onclick = () => {
                        const url = row.querySelector('.extra-emote-url')?.value.trim();
                        if (url && typeof window.triggerCenterEmote === 'function') {
                            window.triggerCenterEmote(url);
                        }
                    };
                    row.querySelector('.del-extra-emote-btn').onclick = () => row.remove();
                    return row;
                };

                extraList.innerHTML = '';
                extraKeys.forEach(k => {
                    extraList.appendChild(renderExtraRow(k, customMap[k]));
                });

                const addBtn = document.getElementById('btn-add-custom-emote-item');
                if (addBtn) {
                    addBtn.onclick = () => {
                        extraList.appendChild(renderExtraRow('', ''));
                    };
                }
            }

            const saveBtn = document.getElementById('btn-save-emote-settings');
            if (saveBtn) {
                saveBtn.onclick = () => {
                    const newCustomMap = {};

                    document.querySelectorAll('.def-emote-url-input').forEach(inp => {
                        const k = inp.dataset.key;
                        const val = inp.value.trim();
                        if (k && val) newCustomMap[k] = val;
                    });

                    document.querySelectorAll('.extra-emote-row').forEach(row => {
                        const keyInp = row.querySelector('.extra-emote-key');
                        const urlInp = row.querySelector('.extra-emote-url');
                        if (keyInp && urlInp) {
                            const k = keyInp.value.trim().toLowerCase();
                            const val = urlInp.value.trim();
                            if (k && val) newCustomMap[k] = val;
                        }
                    });

                    const useEmoteVal = !!document.getElementById('chk-use-emote-setting')?.checked;
                    window.useEmote = useEmoteVal;
                    window.customEmotes = newCustomMap;

                    try {
                        const _path = require('path');
                        const _fs = require('fs');
                        const gravityRoot = window.appRootPath || process.cwd();
                        const settingsFile = _path.join(gravityRoot, 'Settings.json');
                        let currentSettings = {};
                        if (_fs.existsSync(settingsFile)) {
                            try { currentSettings = JSON.parse(_fs.readFileSync(settingsFile, 'utf-8')); } catch(e) {}
                        }
                        currentSettings.useEmote = useEmoteVal;
                        currentSettings.customEmotes = newCustomMap;
                        _fs.writeFileSync(settingsFile, JSON.stringify(currentSettings, null, 2), 'utf-8');
                    } catch(e) { console.error("Failed to save emote settings:", e); }

                    if (typeof window.showUserScreenToast === 'function') {
                        window.showUserScreenToast("Emote Settings Saved!", 2500, true);
                    }
                };
            }
        }
    };

    if (secretTrigger) secretTrigger.onclick = openEmoteView;
    if (eBtn) eBtn.onclick = openEmoteView;

    if (emoteBackBtn && mainView && emoteView) {
        emoteBackBtn.onclick = () => {
            emoteView.style.display = 'none';
            mainView.style.display = 'block';
        };
    }
}

// ====== PROJECT PICKER RIGHT CLICK CONTEXT MENU (Clear List / Remove Item) ======
document.addEventListener('contextmenu', (e) => {
    const pickerModal = document.getElementById('project-picker-modal');
    if (!pickerModal || pickerModal.style.display === 'none') return;
    
    if (pickerModal.contains(e.target)) {
        e.preventDefault();
        e.stopPropagation();
        
        const oldMenu = document.getElementById('picker-context-menu');
        if (oldMenu) oldMenu.remove();

        const projectItem = e.target.closest('.recent-project-item');
        const targetPath = projectItem ? projectItem.getAttribute('data-path') : null;

        const menu = document.createElement('div');
        menu.id = 'picker-context-menu';
        menu.style.cssText = `
            position: fixed;
            left: ${Math.min(window.innerWidth - 180, e.clientX)}px;
            top: ${Math.min(window.innerHeight - 120, e.clientY)}px;
            z-index: 100000;
            background: #252529;
            border: none;
            border-radius: 8px;
            padding: 4px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.6);
            font-family: 'Outfit', sans-serif;
            min-width: 160px;
        `;

        let menuHTML = '';
        if (targetPath) {
            menuHTML += `
                <div id="btn-remove-single-recent" style="padding: 7px 12px; font-size: 12.5px; font-weight: 600; color: #f87171; cursor: pointer; border-radius: 6px; display: flex; align-items: center; gap: 8px; transition: background 0.15s;" onmouseenter="this.style.background='rgba(248, 113, 113, 0.12)'" onmouseleave="this.style.background='transparent'">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    <span>Remove from list</span>
                </div>
                <div style="height: 1px; background: rgba(255, 255, 255, 0.08); margin: 4px 0;"></div>
            `;
        }

        menuHTML += `
            <div id="btn-clear-recent-list" style="padding: 7px 12px; font-size: 12.5px; font-weight: 600; color: #ef4444; cursor: pointer; border-radius: 6px; display: flex; align-items: center; gap: 8px; transition: background 0.15s;" onmouseenter="this.style.background='rgba(239, 68, 68, 0.12)'" onmouseleave="this.style.background='transparent'">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                <span>Clear List</span>
            </div>
        `;

        menu.innerHTML = menuHTML;
        document.body.appendChild(menu);

        const closePickerMenu = () => { if (menu.parentNode) menu.remove(); };
        setTimeout(() => { document.addEventListener('click', closePickerMenu, { once: true }); }, 10);

        const removeSingleBtn = menu.querySelector('#btn-remove-single-recent');
        if (removeSingleBtn && targetPath) {
            removeSingleBtn.onclick = async (ev) => {
                ev.stopPropagation();
                closePickerMenu();
                
                if (projectItem) {
                    projectItem.classList.add('recent-item-removing');
                    await new Promise(r => setTimeout(r, 240));
                }

                try {
                    let recents = JSON.parse(localStorage.getItem('recent_projects') || '[]');
                    recents = recents.filter(p => p !== targetPath);
                    localStorage.setItem('recent_projects', JSON.stringify(recents));
                } catch(e) {}

                try {
                    const fs = require('fs');
                    const path = require('path');
                    const appData = process.env.APPDATA || (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Roaming') : '');
                    if (appData) {
                        const file = path.join(appData, 'regular-gravity', 'recent_projects.json');
                        if (fs.existsSync(file)) {
                            let recents = JSON.parse(fs.readFileSync(file, 'utf-8'));
                            if (Array.isArray(recents)) {
                                recents = recents.filter(p => p !== targetPath);
                                fs.writeFileSync(file, JSON.stringify(recents), 'utf-8');
                            }
                        }
                    }
                } catch(e) {}

                try {
                    await ipcRenderer.invoke('remove-recent-project', targetPath);
                } catch(err) {}

                if (typeof openProjectModal === 'function') {
                    await openProjectModal(null, true);
                }
            };
        }

        const clearListBtn = menu.querySelector('#btn-clear-recent-list');
        if (clearListBtn) {
            clearListBtn.onclick = async (ev) => {
                ev.stopPropagation();
                closePickerMenu();
                
                const items = document.querySelectorAll('.recent-project-item');
                items.forEach(el => el.classList.add('recent-item-removing'));
                if (items.length > 0) {
                    await new Promise(r => setTimeout(r, 240));
                }

                try { localStorage.setItem('recent_projects', JSON.stringify([])); } catch(e) {}

                try {
                    const fs = require('fs');
                    const path = require('path');
                    const appData = process.env.APPDATA || (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Roaming') : '');
                    if (appData) {
                        const file = path.join(appData, 'regular-gravity', 'recent_projects.json');
                        if (fs.existsSync(file)) {
                            fs.writeFileSync(file, '[]', 'utf-8');
                        }
                    }
                } catch(e) {}

                try {
                    await ipcRenderer.invoke('clear-recent-projects');
                } catch (err) {}

                if (typeof openProjectModal === 'function') {
                    await openProjectModal(null, true);
                }
            };
        }
    }
});

function bindDragAndDrop() {
    // 1. Global folder drop handler on window
    window.addEventListener('dragover', (e) => {
        if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        }
    });

    window.addEventListener('drop', async (e) => {
        let absolutePath = '';
        
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            absolutePath = e.dataTransfer.files[0].path;
        } else {
            const internalPath = e.dataTransfer.getData('text/plain');
            if (internalPath) absolutePath = internalPath;
        }

        if (!absolutePath) return;

        try {
            const fs = require('fs');
            const path = require('path');
            const targetPath = path.resolve(absolutePath);

            if (fs.existsSync(targetPath)) {
                const stats = fs.statSync(targetPath);
                if (stats.isDirectory()) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log("[GlobalDrop] Directory dropped. Loading project:", targetPath);
                    window.selectProject(targetPath);
                }
            }
        } catch (err) {
            console.error("[GlobalDrop] Error handling folder drop:", err);
        }
    });

    // 2. File outline drop handler on hub
    const hub = document.getElementById('inspector-browser-hub');
    if (hub) {
        hub.ondragover = (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        };
        hub.ondrop = async (e) => {
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0 && window.dragDropMode) {
                e.preventDefault();
                e.stopPropagation();
                const { showAlert } = require('./ui/dialogs.js');
                if (typeof showAlert === 'function') {
                    showAlert("⚠️ 파일 업로드는 우측 브라우저 AI 챗 영역에 직접 드롭하셔야 합니다.");
                } else {
                    alert("⚠️ 파일 업로드는 우측 브라우저 AI 챗 영역에 직접 드롭하셔야 합니다.");
                }
                return;
            }
            let filePath = '';
            let absolutePath = '';
            const internalPath = e.dataTransfer.getData('text/plain');
            if (internalPath) {
                filePath = internalPath;
                absolutePath = internalPath;
            } 
            else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const file = e.dataTransfer.files[0];
                absolutePath = file.path;
                const path = require('path');
                if (window.currentPath) {
                    filePath = path.relative(window.currentPath, absolutePath);
                } else {
                    filePath = path.basename(absolutePath);
                }
            }

            if (!absolutePath) return;

            try {
                const fs = require('fs');
                const path = require('path');
                const targetPath = path.resolve(window.currentPath || process.cwd(), absolutePath);
                
                if (fs.existsSync(targetPath)) {
                    const stats = fs.statSync(targetPath);
                    if (stats.isDirectory()) {
                        // Handled globally
                        return;
                    }

                    e.preventDefault();
                    e.stopPropagation();

                    const chatOverlay = document.getElementById('local-chat-overlay');
                    const progressBox = document.getElementById('overlay-progress-box');
                    const projBtn = document.getElementById('btn-send-project-info');
                    if (chatOverlay && progressBox && projBtn) {
                        chatOverlay.style.display = 'flex';
                        projBtn.style.display = 'none';
                        progressBox.style.display = 'flex';
                    }

                    window.readFilesSet.add(filePath);
                    if (typeof window.updateSendProgress === 'function') {
                        window.updateSendProgress(window.readFilesSet.size, window.totalFilesCount);
                    }

                    const rawContent = fs.readFileSync(targetPath, 'utf-8');
                    const ext = filePath.split('.').pop().toLowerCase();
                    ChatUI.appendBubble('system', `[SYSTEM] Drag & Drop: Injecting ${filePath} to Web AI...`);

                    setTimeout(() => {
                        if (chatOverlay && progressBox && projBtn) {
                            chatOverlay.style.display = 'none';
                            progressBox.style.display = 'none';
                            projBtn.style.display = 'flex';
                        }
                    }, 500);
                } else {
                    ChatUI.appendBubble('system', `[ERROR] Drag & Drop failed: File not found: ${filePath}`);
                }
            } catch (err) {
                ChatUI.appendBubble('system', `[ERROR] Drag & Drop failed: ${err.message}`);
            }
        };
    }
}

// ====== EXPLICIT EMOTE PARSER & TRIGGER ======
window.parseAndTriggerEmote = function(text, shouldTrigger = true) {
    if (typeof text !== 'string' || window.useEmote === false || !text.trim()) return text;
    
    const defaultEmotes = ['def', 'joy', 'sad', 'angr', 'fear', 'disgust', 'surpr', 'trust', 'antici', 'awe'];
    const customMap = window.customEmotes || {};
    const extraCustomKeys = Object.keys(customMap);
    const allEmoteKeys = Array.from(new Set([...defaultEmotes, ...extraCustomKeys]));
    
    let detectedEmote = null;

    // Stage 1: Explicit emote tag with flexible separators (: _ - = space or brackets)
    const stage1Match = text.match(/(?:<|\[|\(|\b)?emote\s*[:=\-_]?\s*([a-zA-Z0-9_-]+)(?:>|\]|\)|\b)?/i);
    if (stage1Match && stage1Match[1]) {
        const candidate = stage1Match[1].toLowerCase();
        if (allEmoteKeys.includes(candidate)) {
            detectedEmote = candidate;
            text = text.replace(/(?:<|\[|\(|\b)?emote\s*[:=\-_]?\s*[a-zA-Z0-9_-]+(?:>|\]|\)|\b)?/gi, '').trim();
        }
    }

    // Stage 2: Explicit emotion keyword search in brackets or tags (e.g. [trust], <joy>, [love])
    if (!detectedEmote) {
        for (const emo of allEmoteKeys) {
            const regex = new RegExp(`(?:<|\\[|\\()${emo}(?:>|\\]|\\))`, 'i');
            if (regex.test(text)) {
                detectedEmote = emo;
                text = text.replace(regex, '').trim();
                break;
            }
        }
    }

    // Trigger ONLY if an explicit emote tag was detected and not recently triggered (debounce 4s)
    if (shouldTrigger && detectedEmote && typeof window.triggerCenterEmote === 'function') {
        const now = Date.now();
        if (!window.lastEmoteTriggerTime || (now - window.lastEmoteTriggerTime > 4000) || window.lastEmoteTriggerTag !== detectedEmote) {
            window.lastEmoteTriggerTime = now;
            window.lastEmoteTriggerTag = detectedEmote;
            
            let emoteSrc = customMap[detectedEmote] || `js/e/${detectedEmote}.png`;
            window.triggerCenterEmote(emoteSrc);
        }
    }

    return text;
};

// ====== CENTER EMOTE TRIGGER FUNCTION ======
window.triggerCenterEmote = function(src) {
    const overlay = document.getElementById('center-emote-overlay');
    const card = document.getElementById('center-emote-card');
    const img = document.getElementById('center-emote-img');
    const imgEye = document.getElementById('center-emote-img-eye');
    const imgBody = document.getElementById('center-emote-img-body');

    if (!overlay || !card || !img) return;

    const targetPanel = document.getElementById('inspector-right') || document.getElementById('agent-view-dock') || document.getElementById('active-agent-webview') || document.getElementById('inspector-local-chat');
    if (targetPanel) {
        const rect = targetPanel.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            overlay.style.top = `${rect.top}px`;
            overlay.style.left = `${rect.left}px`;
            overlay.style.width = `${rect.width}px`;
            overlay.style.height = `${rect.height}px`;
            overlay.style.bottom = 'auto';
            overlay.style.right = 'auto';
        }
    } else {
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
    }

    overlay.style.display = 'flex';
    card.style.transform = 'scale(0.4)';
    card.style.opacity = '0';

    img.className = '';
    img.style.clipPath = 'none';
    if (imgEye) { imgEye.className = ''; imgEye.style.clipPath = 'none'; }
    if (imgBody) { imgBody.className = ''; imgBody.style.clipPath = 'none'; }

    const isFear = src.includes('fear.png');
    const isTrust = src.includes('trust.png');
    const isAwe = src.includes('awe.png');
    const isAntici = src.includes('antici.png');

    if ((isFear || isTrust || isAwe || isAntici) && imgEye && imgBody) {
        if (isAntici) {
            img.src = src;
            img.style.display = 'block';
            img.style.clipPath = 'inset(45% 0 0 0)'; // Bottom face + mouth (STILL)

            imgBody.src = src;
            imgBody.style.display = 'block';
            imgBody.style.clipPath = 'inset(0 45% 45% 0)'; // Top-Left quadrant (LEFT EYE)

            imgEye.src = src;
            imgEye.style.display = 'block';
            imgEye.style.clipPath = 'inset(0 0 45% 45%)'; // Top-Right quadrant (RIGHT EYE)
        } else {
            img.style.display = 'none';
            imgEye.src = src;
            imgBody.src = src;
            imgEye.style.display = 'block';
            imgBody.style.display = 'block';

            if (isTrust) {
                imgEye.style.clipPath = 'inset(0 0 37.5% 0)';
                imgBody.style.clipPath = 'inset(62.5% 0 0 0)';
            } else {
                imgEye.style.clipPath = 'inset(0 0 33.33% 0)';
                imgBody.style.clipPath = 'inset(66.66% 0 0 0)';
            }
        }
    } else {
        img.src = src;
        img.style.display = 'block';
        img.style.clipPath = 'none';
        if (imgEye) imgEye.style.display = 'none';
        if (imgBody) imgBody.style.display = 'none';
    }

    requestAnimationFrame(() => {
        card.style.transform = 'scale(1)';
        card.style.opacity = '1';

        // Apply emotion animations
        if (src.includes('joy.png')) {
            img.classList.add('emote-anim-joy');
        } else if (src.includes('sad.png')) {
            img.classList.add('emote-anim-sad');
        } else if (src.includes('angr.png')) {
            img.classList.add('emote-anim-angr');
        } else if (src.includes('disgust.png')) {
            img.classList.add('emote-anim-disgust');
        } else if (src.includes('surpr.png')) {
            img.classList.add('emote-anim-surpr');
        } else if (isAntici && imgEye && imgBody) {
            imgEye.classList.add('emote-anim-antici-eye');
            imgBody.classList.add('emote-anim-antici-left-eye');
        } else if (isFear && imgEye) {
            imgEye.classList.add('emote-anim-fear');
        } else if (isTrust && imgEye && imgBody) {
            imgEye.classList.add('emote-anim-trust-eye');
            imgBody.classList.add('emote-anim-trust-mouth');
        } else if (isAwe && imgEye && imgBody) {
            imgEye.classList.add('emote-anim-awe-head');
            imgBody.classList.add('emote-anim-awe-mouth');
        }
    });

    clearTimeout(window._centerEmoteTimer);
    window._centerEmoteTimer = setTimeout(() => {
        card.style.transform = 'scale(0.7)';
        card.style.opacity = '0';
        setTimeout(() => {
            overlay.style.display = 'none';
            img.className = '';
            if (imgEye) imgEye.className = '';
            if (imgBody) imgBody.className = '';
        }, 220);
    }, 3800);
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindDragAndDrop);
} else {
    bindDragAndDrop();
}
