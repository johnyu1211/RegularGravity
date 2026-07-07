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

function addSubTerminal(isInitial = false) {
    window.terminalCount++; const id = `sub-${window.terminalCount}`; 
    window.terminalSessions[id] = { logs: [], cwd: window.currentPath || process.cwd(), loading: true };
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
    document.querySelectorAll('.sub-tab').forEach(t => { t.classList.remove('active'); });
    const at = document.getElementById(`tab-${id}`); if (at) { at.classList.add('active'); ensureTabVisible(id); }
    window.activeSubTabId = id; const lw = document.getElementById('terminal-logs-wrapper'), ti = document.getElementById('terminal-main-input');
    if (!lw) return; lw.innerHTML = '';
    (window.terminalSessions[id].logs || []).forEach(log => {
        const line = document.createElement('div'); line.innerText = log.text; line.style.color = log.type === 'cmd' ? '#ccc' : '#888';
        line.style.marginBottom = '8px'; line.style.whiteSpace = 'pre-wrap'; lw.appendChild(line);
    });
    
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
    const tabs = document.querySelectorAll('.sub-tab');
    if (tabs.length <= 1) {
        window.terminalSessions[id].logs = [];
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
