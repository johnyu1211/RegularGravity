if (typeof ipcRenderer === 'undefined') { var { ipcRenderer } = require('electron'); }
window.terminalCount = 0;
window.activeSubTabId = null;
window.terminalSessions = {};

function updateTerminalPrompt() {
    const pathEl = document.getElementById('terminal-prompt-path');
    const prefixEl = document.getElementById('terminal-prompt-prefix');
    if (prefixEl && (!window.activeSubTabId || !window.terminalSessions[window.activeSubTabId]?.loading)) {
        prefixEl.innerText = '> ';
    }
    if (!pathEl) return;
    
    let p = process.cwd();
    if (window.activeSubTabId && window.terminalSessions[window.activeSubTabId] && window.terminalSessions[window.activeSubTabId].cwd) {
        p = window.terminalSessions[window.activeSubTabId].cwd;
    }
    if (!p || p === 'DRIVES') {
        pathEl.innerText = '';
        return;
    }
    pathEl.innerText = p;
}

function setupHorizontalScroll(el) {
    if (!el) return;
    el.addEventListener('wheel', (e) => { if (e.deltaY !== 0) { e.preventDefault(); el.scrollLeft += e.deltaY; } });
}

function ensureTabVisible(id) {
    const c = document.getElementById('terminal-sub-tabs'), t = document.getElementById(`tab-${id}`);
    if (!c || !t) return;
    setTimeout(() => {
        const cr = c.getBoundingClientRect(), tr = t.getBoundingClientRect();
        if (tr.right > cr.right) c.scrollLeft += (tr.right - cr.right) + 15;
        else if (tr.left < cr.left) c.scrollLeft -= (cr.left - tr.left) + 15;
    }, 20);
}

function updateSubTerminalTitle(id, cmdStr = '') {
    const tabEl = document.getElementById(`tab-${id}`);
    if (!tabEl) return;
    const num = id.replace('sub-', '');
    let label = `powershell ${num}`;
    if (cmdStr) {
        const firstWord = cmdStr.trim().split(/\s+/)[0];
        if (firstWord) {
            label = `${firstWord} (${num})`;
        }
    }
    tabEl.innerHTML = `${label} <span class="sub-close">
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    </span>`;
    tabEl.onclick = (e) => {
        if (e.target.classList.contains('sub-close')) closeSubTerminal(id);
        else switchSubTerminal(id);
    };
}

function addSubTerminal(isInitial = false) {
    window.terminalCount++; const id = `sub-${window.terminalCount}`; 
    const initialCwd = window.currentPath || window.projectRoot || window.currentProjectPath || process.cwd();
    window.terminalSessions[id] = { logs: [], cwd: initialCwd, loading: true, history: [], historyIndex: -1 };
    const tab = document.createElement('div'); tab.className = `sub-tab ${isInitial ? 'active' : ''}`; tab.id = `tab-${id}`;
    tab.innerHTML = `powershell ${window.terminalCount} <span class="sub-close">
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    </span>`;
    
    tab.onclick = (e) => { if (e.target.classList.contains('sub-close')) closeSubTerminal(id); else switchSubTerminal(id); };
    document.getElementById('terminal-sub-tabs')?.appendChild(tab); switchSubTerminal(id);
    
    ipcRenderer.send('execute-cmd', { tabId: id, command: '', cwd: window.terminalSessions[id].cwd });

    setTimeout(() => {
        if (window.terminalSessions[id] && window.terminalSessions[id].loading) {
            window.terminalSessions[id].loading = false;
            if (window.activeSubTabId === id) switchSubTerminal(id);
        }
    }, 1000);
}

function switchSubTerminal(id) {
    if (!id) id = window.activeSubTabId || 'sub-1';
    document.querySelectorAll('.sub-tab').forEach(t => { t.classList.remove('active'); });
    const at = document.getElementById(`tab-${id}`); if (at) { at.classList.add('active'); ensureTabVisible(id); }
    window.activeSubTabId = id; const lw = document.getElementById('terminal-logs-wrapper'), ti = document.getElementById('terminal-main-input');
    if (!lw) return; lw.innerHTML = '';

    if (!window.terminalSessions) window.terminalSessions = {};
    if (!window.terminalSessions[id]) {
        window.terminalSessions[id] = { logs: [], cwd: window.currentPath || process.cwd(), loading: false, history: [], historyIndex: -1 };
    }
    const logs = window.terminalSessions[id].logs || [];
    let currentBlock = null;
    let currentOutputContainer = null;

    for (let i = 0; i < logs.length; i++) {
        const log = logs[i];
        if (!log) continue;
        const rawText = (log.text != null) ? String(log.text) : '';
        const textContent = rawText.replace(/^(\r?\n)+/, '').replace(/(\r?\n){3,}/g, '\n\n');
        if (!textContent.trim() && log.type === 'out') continue;

        if (log.type === 'cmd') {
            currentBlock = document.createElement('div');
            currentBlock.className = 'terminal-cmd-block';

            // Aggregate all 'out' logs that belong to this command until the next 'cmd'
            let cmdOutput = '';
            for (let j = i + 1; j < logs.length; j++) {
                if (logs[j].type === 'cmd') break;
                if (logs[j].type === 'out') {
                    cmdOutput += logs[j].text;
                }
            }
            cmdOutput = cmdOutput.replace(/^(\r?\n)+/, '').replace(/(\r?\n)+$/, '');

            const row = document.createElement('div');
            row.className = 'terminal-cmd-row';

            const cmdText = document.createElement('span');
            cmdText.className = 'terminal-cmd-text';
            cmdText.innerText = textContent;

            const copyBtn = document.createElement('button');
            copyBtn.className = 'terminal-copy-result-btn';
            copyBtn.innerHTML = `
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg><span>Copy Result</span>
            `;

            copyBtn.onmousedown = (e) => {
                e.stopPropagation();
            };

            copyBtn.onclick = (e) => {
                e.stopPropagation();
                e.preventDefault();
                const textToCopy = cmdOutput.trim() || '(No output)';
                navigator.clipboard.writeText(textToCopy).then(() => {
                    copyBtn.classList.add('copied');
                    copyBtn.innerHTML = `
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg><span>Copied!</span>
                    `;
                    if (typeof window.showUserScreenToast === 'function') {
                        window.showUserScreenToast('Command result copied to clipboard', 2500, true);
                    }
                    setTimeout(() => {
                        copyBtn.classList.remove('copied');
                        copyBtn.innerHTML = `
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg><span>Copy Result</span>
                        `;
                    }, 1500);
                }).catch(err => {
                    console.error('Clipboard copy failed:', err);
                });
            };

            row.appendChild(cmdText);
            row.appendChild(copyBtn);
            currentBlock.appendChild(row);

            currentOutputContainer = document.createElement('div');
            currentOutputContainer.className = 'terminal-cmd-output';
            currentBlock.appendChild(currentOutputContainer);

            lw.appendChild(currentBlock);
        } else {
            const line = document.createElement('div');
            line.className = 'terminal-out-line';
            line.innerText = textContent;

            if (currentOutputContainer) {
                currentOutputContainer.appendChild(line);
            } else {
                lw.appendChild(line);
            }
        }
    }
    
    const prefixEl = document.getElementById('terminal-prompt-prefix');
    if (ti) {
        if (window.terminalSessions[id].loading) {
            ti.disabled = true;
            ti.placeholder = 'powershell 기동 중...';
            if (prefixEl) prefixEl.innerHTML = '<div class="terminal-loading-spinner"></div>';
        } else {
            ti.disabled = false;
            ti.placeholder = '';
            if (prefixEl) prefixEl.innerHTML = '> ';
            setTimeout(() => { if (window.activeSubTabId === id) ti.focus(); }, 100);
        }
    }
    
    if (typeof updateTerminalPrompt === 'function') {
        updateTerminalPrompt();
    }
    
    const surface = document.getElementById('terminal-content'); if (surface) surface.scrollTop = surface.scrollHeight;
}

function closeSubTerminal(id) {
    try {
        const { ipcRenderer } = require('electron');
        ipcRenderer.send('close-terminal-tab', id);
    } catch(e) {}

    const tabs = document.querySelectorAll('.sub-tab');
    if (tabs.length <= 1) {
        if (window.terminalSessions[id]) window.terminalSessions[id].logs = [];
        switchSubTerminal(id);
        
        const popoverWin = document.getElementById('terminal-popover');
        const popoverBtn = document.getElementById('terminal-toggle-btn');
        if (popoverWin) popoverWin.style.display = 'none';
        if (popoverBtn) {
            popoverBtn.style.color = '';
            popoverBtn.style.background = '';
            popoverBtn.style.boxShadow = '0 4px 15px rgba(0,0,0,0.5)';
        }
        return;
    }
    delete window.terminalSessions[id];
    const tabEl = document.getElementById(`tab-${id}`);
    if (tabEl) tabEl.remove();
    if (window.activeSubTabId === id) {
        const remainingTabs = document.querySelectorAll('.sub-tab');
        if (remainingTabs.length > 0) {
            const nextId = remainingTabs[0].id.replace('tab-', '');
            switchSubTerminal(nextId);
        }
    }
}

window.openTerminalPopover = function() {
    const popover = document.getElementById('terminal-popover');
    if (!popover) return;
    window.hasTerminalBeenOpened = true;
    popover.style.display = 'flex';
    if (typeof window.bringPopoverToFront === 'function') {
        window.bringPopoverToFront(popover);
    } else {
        popover.style.zIndex = '5000';
    }
    if (window.terminalCount === 0) {
        addSubTerminal(true);
    } else if (window.activeSubTabId) {
        switchSubTerminal(window.activeSubTabId);
    }
    if (typeof window.updateTaskbarButtonStyles === 'function') {
        window.updateTaskbarButtonStyles();
    }
    window.dispatchEvent(new Event('resize'));
};

window.executeCommandInTerminal = function(cmdStr) {
    if (!cmdStr || typeof cmdStr !== 'string') return;
    const cleanCmd = cmdStr.trim();
    if (!cleanCmd) return;

    if (typeof window.openTerminalPopover === 'function') {
        window.openTerminalPopover();
    }

    if (!window.activeSubTabId || !window.terminalSessions[window.activeSubTabId]) {
        addSubTerminal(true);
    }

    const tId = window.activeSubTabId || 'sub-1';
    const session = window.terminalSessions[tId];
    if (session) {
        session.history = session.history || [];
        session.history.push(cleanCmd);
        session.historyIndex = -1;
        session.logs = session.logs || [];
        session.logs.push({ type: 'cmd', text: `> ${cleanCmd}` });
    }

    if (typeof updateSubTerminalTitle === 'function') {
        updateSubTerminalTitle(tId, cleanCmd);
    }
    if (typeof switchSubTerminal === 'function') {
        switchSubTerminal(tId);
    }

    if (cleanCmd.toLowerCase().startsWith('cd ')) {
        let targetDir = cleanCmd.substring(3).trim().replace(/['"]/g, '');
        const pathModule = require('path');
        const fsModule = require('fs');
        try {
            const curCwd = session?.cwd || window.currentPath || process.cwd();
            let newPath = pathModule.isAbsolute(targetDir) ? targetDir : pathModule.resolve(curCwd, targetDir);
            if (fsModule.existsSync(newPath) && fsModule.statSync(newPath).isDirectory()) {
                if (session) session.cwd = newPath;
                if (typeof updateTerminalPrompt === 'function') updateTerminalPrompt();
            }
        } catch(err) {
            console.error(err);
        }
    }

    const activeCwd = session?.cwd || window.currentPath || window.projectRoot || process.cwd();
    ipcRenderer.send('execute-cmd', {
        tabId: tId,
        command: cleanCmd,
        cwd: activeCwd
    });

    const tI = document.getElementById('terminal-main-input');
    if (tI) {
        tI.value = '';
        setTimeout(() => { tI.focus(); }, 150);
    }
};

// ── Ctrl+C: interrupt active terminal process ─────────────────────────────
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'c') {
        const terminalPopover = document.getElementById('terminal-popover');
        if (!terminalPopover || terminalPopover.style.display === 'none') return;
        // Only fire if the terminal area is focused (not a text editor)
        const active = document.activeElement;
        const isInTerminal = terminalPopover.contains(active) || active === document.body;
        if (!isInTerminal) return;
        const tabId = window.activeSubTabId;
        if (!tabId) return;
        e.stopPropagation();
        try { ipcRenderer.send('interrupt-terminal', tabId); } catch(err) {}
        // Append visual feedback in the terminal log
        if (window.terminalSessions && window.terminalSessions[tabId]) {
            window.terminalSessions[tabId].logs.push({ type: 'out', text: '^C\n' });
            if (typeof switchSubTerminal === 'function') switchSubTerminal(tabId);
        }
    }
}, true);

// ── Tab right-click: rename ───────────────────────────────────────────────
function attachTabContextMenu(tabEl, id) {
    tabEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Remove existing context menu
        document.querySelectorAll('.terminal-tab-ctx-menu').forEach(m => m.remove());

        const menu = document.createElement('div');
        menu.className = 'terminal-tab-ctx-menu';
        menu.style.cssText = `
            position: fixed; z-index: 99999;
            left: ${e.clientX}px; top: ${e.clientY}px;
            background: #1e1e1e; border: 1px solid #3a3a3a;
            border-radius: 6px; padding: 4px 0;
            min-width: 120px; box-shadow: 0 4px 16px rgba(0,0,0,0.6);
            font-family: 'DM Sans', sans-serif; font-size: 12px;
        `;
        const renameItem = document.createElement('div');
        renameItem.textContent = '탭 이름 변경';
        renameItem.style.cssText = 'padding: 7px 14px; cursor: pointer; color: #ddd;';
        renameItem.onmouseenter = () => { renameItem.style.background = 'rgba(255,255,255,0.08)'; };
        renameItem.onmouseleave = () => { renameItem.style.background = ''; };
        renameItem.onclick = () => {
            menu.remove();
            startTabRename(tabEl, id);
        };
        menu.appendChild(renameItem);
        document.body.appendChild(menu);

        // Close on outside click
        const closeMenu = () => { menu.remove(); document.removeEventListener('click', closeMenu); };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    });
}

function startTabRename(tabEl, id) {
    // Extract current label (strip close button)
    const currentLabel = tabEl.childNodes[0]?.textContent?.trim() || `tab ${id}`;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentLabel;
    input.style.cssText = `
        background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.25);
        color: #fff; font-size: 11px; font-family: inherit;
        padding: 1px 4px; border-radius: 3px; outline: none;
        width: 80px; max-width: 120px;
    `;
    // Replace tab content temporarily
    const closeSpan = tabEl.querySelector('.sub-close');
    tabEl.innerHTML = '';
    tabEl.appendChild(input);
    if (closeSpan) tabEl.appendChild(closeSpan);
    input.focus();
    input.select();

    const commit = () => {
        const newName = input.value.trim() || currentLabel;
        // Rebuild tab label + close button
        const closeBtn = document.createElement('span');
        closeBtn.className = 'sub-close';
        closeBtn.innerHTML = `<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
        tabEl.innerHTML = newName + ' ';
        tabEl.appendChild(closeBtn);
        tabEl.onclick = (ev) => {
            if (ev.target.classList.contains('sub-close')) closeSubTerminal(id);
            else switchSubTerminal(id);
        };
        attachTabContextMenu(tabEl, id);
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { input.value = currentLabel; input.blur(); }
    });
}

// Patch addSubTerminal to attach context menu on new tabs
const _origAddSubTerminal = addSubTerminal;
window._patchedTabContextMenu = true;
// Observe new tabs being added and attach context menu
const _tabObserver = new MutationObserver((mutations) => {
    mutations.forEach(m => {
        m.addedNodes.forEach(node => {
            if (node.nodeType === 1 && node.classList?.contains('sub-tab')) {
                const id = node.id?.replace('tab-', '');
                if (id) attachTabContextMenu(node, id);
            }
        });
    });
});
const _tabsContainer = document.getElementById('terminal-sub-tabs');
if (_tabsContainer) {
    _tabObserver.observe(_tabsContainer, { childList: true });
    // Also attach to existing tabs
    _tabsContainer.querySelectorAll('.sub-tab').forEach(tab => {
        const id = tab.id?.replace('tab-', '');
        if (id) attachTabContextMenu(tab, id);
    });
}
