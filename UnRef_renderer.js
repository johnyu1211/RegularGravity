// --- Poor man's Gravity ULTIMATE RENDERER ENGINE (STABLE v31 - COLLABORATION EDITION) ---
const fs = require('fs');
if (typeof ipcRenderer === 'undefined') { var { ipcRenderer } = require('electron'); }

// --- [전역 히스토리 스택 & Undo/Redo 엔진] ---
window.editorHistory = window.editorHistory || [];
window.historyIndex = window.editorHistory.length > 0 ? window.editorHistory.length - 1 : -1;

window.performUndo = function() {
    if (window.historyIndex > 0) {
        window.historyIndex--;
        const content = window.editorHistory[window.historyIndex];
        fs.writeFileSync(window.currentEditingPath, content);
        window.openFileInEditor(window.currentEditingPath);
        console.log("[System] Undo performed.");
    }
};

window.performRedo = function() {
    if (window.historyIndex < window.editorHistory.length - 1) {
        window.historyIndex++;
        const content = window.editorHistory[window.historyIndex];
        fs.writeFileSync(window.currentEditingPath, content);
        window.openFileInEditor(window.currentEditingPath);
        console.log("[System] Redo performed.");
    }
};

window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) window.performRedo();
        else window.performUndo();
    }
});

// --- [박스 단위 패치 엔진 (Box-Level Patch)] ---
window.pasteToBlock = async (syncId, event) => {
    event.preventDefault();
    event.stopPropagation();
    
    try {
        const text = await navigator.clipboard.readText();
        if (!text) { alert("클립보드가 비어있습니다."); return; }
        
        const filePath = window.currentEditingPath;
        const detailEl = document.getElementById('editor-' + syncId);
        if (!detailEl) { alert("박스를 찾을 수 없습니다."); return; }

        const footerEl = detailEl.parentElement.querySelector('.pormsg-footer');
        const startLine = parseInt(detailEl.dataset.start);
        const endLine = footerEl ? parseInt(footerEl.dataset.end) : startLine;
        
        const fileContent = fs.readFileSync(filePath, 'utf-8').replace(/\r/g, '');
        let lines = fileContent.split('\n');
        
        window.editorHistory.push(fileContent);
        window.historyIndex = window.editorHistory.length - 1;
        
        const newLines = text.split('\n');
        lines.splice(startLine, (endLine - startLine + 1), ...newLines);
        
        fs.writeFileSync(filePath, lines.join('\n'));
        window.openFileInEditor(filePath);
        
    } catch (err) {
        console.error("Paste failed:", err);
        alert("박스 패치 중 오류 발생: " + err.message);
    }
};

ipcRenderer.on('soft-reload-workspace', () => {
    if (window.currentPath && typeof window.loadDirectory === 'function') window.loadDirectory(window.currentPath);
    const header = document.querySelector('#editor-container .section-header h3');
    if (header) header.innerText = 'PORMSG VIEW';
    const editorContent = document.getElementById('editor-content');
    if (editorContent) {
        editorContent.innerHTML = `<div style="display:flex; justify-content:center; align-items:center; height:100%; color:#444; font-family:'JetBrains Mono', monospace; flex-direction:column; gap:10px;"><div style="font-size: 24px;">🔄</div><div>Workspace Soft Reloaded</div><div style="font-size: 11px; color: #333;">AI session preserved</div></div>`;
    }
});

let terminalCount = 0; let activeSubTabId = null; const terminalSessions = {};
let webRequestId = 0; window.currentPath = process.cwd();
setTimeout(updateTerminalPrompt, 100);

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

window.fetchDirContent = async (p) => await ipcRenderer.invoke('get-directory-content', p);
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

window.loadDirectory = async (p) => {
    try {
        window.currentPath = p; 
        updateTerminalPrompt();
        document.getElementById('path-display').innerHTML = `<span class="path-segment">${formatPathDisplay(p)}</span>`;
        const badge = document.getElementById('active-project-badge'); if (badge) badge.innerText = p === 'DRIVES' ? 'PC' : p.split(/[\\/]/).pop().toUpperCase() || 'PORMSG';
        const f = await window.fetchDirContent(p === 'DRIVES' ? '' : p);
        if (window.renderTree) window.renderTree(p, f);
        
        // 경로 복사 클릭 리스너 설정
        const copyBtn = document.getElementById('path-copy-btn');
        const container = document.getElementById('path-display-container');
        if (container && copyBtn && !window.hasPathCopyBind) {
            container.onclick = async (e) => {
                e.stopPropagation();
                if (window.currentPath && window.currentPath !== 'DRIVES') {
                    await navigator.clipboard.writeText(window.currentPath);
                    const originalSvg = copyBtn.innerHTML;
                    copyBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                    copyBtn.style.color = '#10b981';
                    setTimeout(() => {
                        copyBtn.innerHTML = originalSvg;
                        copyBtn.style.color = '';
                    }, 1000);
                }
            };
            window.hasPathCopyBind = true;
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

window.openFileInEditor = (filePath) => {
    window.currentEditingPath = filePath;
    const path = require('path');
    const editorContent = document.getElementById('editor-content');
    if (!editorContent) return;

    try {
        const ext = path.extname(filePath).toLowerCase().substring(1);
        const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'];
        
        const header = document.querySelector('#editor-container .section-header');
        if (header) {
            header.style.display = 'flex'; header.style.alignItems = 'center';
            header.innerHTML = `
                <h3 style="margin:0;">PORMSG VIEW - ${path.basename(filePath)}</h3>
                <div style="margin-left: auto; display: flex; gap: 8px; padding-right: 15px; align-items:center;">
                    <div id="editor-search-box" style="display:flex; align-items:center; background:#0a0a0a; border:1px solid #333; border-radius:4px; padding:2px 8px; margin-right: 10px; transition: 0.2s;">
                        <span style="font-size:10px; color:#555; margin-right:6px;">🔍</span>
                        <input type="text" id="editor-search-input" placeholder="Search (Ctrl+F)" style="background:transparent; border:none; color:#ccc; font-size:11px; width:120px; outline:none; font-family:'JetBrains Mono', monospace;">
                        <span id="editor-search-result" style="font-size:10px; color:#888; margin-left:8px; min-width:15px; text-align:right;"></span>
                    </div>

                    <button id="btn-collapse-all" style="background:#111; color:#aaa; border:1px solid #333; padding:5px 12px; border-radius:4px; font-size:11px; cursor:pointer; transition:0.2s;">Collapse All</button>
                    <button id="btn-expand-all" style="background:#0078d4; color:#fff; border:1px solid #005a9e; padding:5px 12px; border-radius:4px; font-size:11px; cursor:pointer; font-weight:bold; transition:0.2s;">Expand All</button>
                </div>
            `;
            

            document.getElementById('btn-collapse-all').onclick = () => { editorContent.querySelectorAll('.editor-detail').forEach(d => { d.open = false; const mini = document.getElementById(d.getAttribute('data-mini-id')); if (mini) mini.open = false; }); };
            document.getElementById('btn-expand-all').onclick = () => { editorContent.querySelectorAll('.editor-detail').forEach(d => { d.open = true; const mini = document.getElementById(d.getAttribute('data-mini-id')); if (mini) mini.open = true; }); };
        }

        if (imageExts.includes(ext)) {
            const base64 = fs.readFileSync(filePath).toString('base64');
            const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
            editorContent.innerHTML = `<div id="editor-scroll-container" style="position: absolute; inset: 0; display:flex; justify-content:center; align-items:flex-start; overflow:auto; padding:20px; box-sizing:border-box; background:#050505;"><img src="data:${mime};base64,${base64}" style="max-width:100%; object-fit:contain; box-shadow: 0 4px 20px rgba(0,0,0,0.5);"></div>`;
        } else {
            const content = fs.readFileSync(filePath, 'utf-8').replace(/\r/g, '');
            if (typeof hljs !== 'undefined') {
                const linesRaw = content.split('\n');
                const lines = hljs.highlight(content, { language: ext, ignoreIllegals: true }).value.split('\n');
                
                let finalHTML = ''; let minimapHTML = ''; let blockStack = []; let blockCounter = 0; 

                for (let i = 0; i < linesRaw.length; i++) {
                    let line = linesRaw[i]; let htmlLine = lines[i]; let lineNum = i + 1;
                    let lineNumHTML = `<span class="line-num">${lineNum}</span>`;
                    
                    let pureText = line.trim(); let spaces = (line.match(/^\s*/) || [''])[0].length; 
                    let mmColor = (pureText.includes('function') || pureText.includes('class') || pureText.includes('=>')) ? '#0078d4' : '#333';
                    if (pureText.startsWith('//')) mmColor = '#1e4620'; 
                    let mmLine = pureText.length > 0 ? `<div style="height:2px; margin-bottom:1px; margin-left:${Math.min(spaces, 25)}px; width:${Math.min(pureText.length, 35)}px; background:${mmColor}; border-radius:1px;"></div>` : `<div style="height:2px; margin-bottom:1px;"></div>`;
                    
                    let net = 0; for (let j = 0; j < line.length; j++) { if (line[j] === '{') net++; if (line[j] === '}') net--; }
                    if (net === 0 && blockStack.length === 0 && line.trim() === '') continue;

                    if (net > 0) {
                        let titleName = line.replace(/[{}]/g, '').trim() || "Block";
                        let syncId = `mini-block-${blockCounter++}`;
                        blockStack.push({ title: titleName, id: syncId, start: i });

                        finalHTML += `<div class="pormsg-block"><details open class="editor-detail" data-mini-id="${syncId}" id="editor-${syncId}" data-start="${i}"><summary class="pormsg-header">${lineNumHTML}<span class="caret">▶</span><div style="flex:1; min-width:0; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; margin-right:10px;">${htmlLine}</div></summary><div class="pormsg-body" id="body-${syncId}">`;
                        minimapHTML += `<details open id="${syncId}" class="mini-detail"><summary class="mini-summary">${mmLine}</summary><div class="mini-body">`;
                    } else if (net < 0 && blockStack.length > 0) {
                        let popped = blockStack.pop();
                        let lineCount = i - popped.start + 1;
                        
                        finalHTML += `</div></details><div class="pormsg-footer" data-end="${i}">${lineNumHTML}<div style="display:flex; align-items:center; flex:1; min-width:0; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; margin-right:10px;">${htmlLine} <span class="footer-tag" style="margin-left: 8px;">// ${popped.title}</span> <span style="color:#0078d4; font-size:10px; font-weight:bold; margin-left:8px; background:rgba(0,120,212,0.1); border: 1px solid rgba(0,120,212,0.3); padding:1px 6px; border-radius:10px;">${lineCount} lines</span></div><div class="go-top-btn" onclick="const el = document.getElementById('editor-${popped.id}'); if(el){ document.getElementById('editor-scroll-container').scrollTo({top: el.offsetTop - 20, behavior: 'smooth'}); } event.stopPropagation();" title="Go to block start">↑ Top</div></div></div>`;
                        minimapHTML += `</div></details><div class="mini-footer">${mmLine}</div>`;
                    } else {
                        finalHTML += `<div class="pormsg-line">${lineNumHTML} <span style="white-space:pre;">${htmlLine || ' '}</span></div>`;
                        minimapHTML += mmLine;
                    }
                }

                editorContent.innerHTML = `
                    <style>
                        .line-num { position: sticky; left: 0; z-index: 2; display: inline-block; width: 30px; min-width: 30px; text-align: right; color: #555; user-select: none; margin-right: 12px; font-size: 11px; font-family: 'JetBrains Mono', monospace; border-right: 1px solid #333; padding-right: 8px; flex-shrink: 0; transition: color 0.1s; background: transparent; }
                        .pormsg-line .line-num { background: #000; } .pormsg-line:hover .line-num { background: #141414; }
                        .pormsg-body .pormsg-line .line-num { background: #070707; } .pormsg-body .pormsg-line:hover .line-num { background: #1b1b1b; }
                        
                        .pormsg-block { margin: 6px 0; border: 1px solid #2a2a2a; border-radius: 7px; background: #070707; transition: border-color 0.15s; display: block; max-width: 100%; overflow: hidden; }
                        .pormsg-body .pormsg-block { margin: 2px 0 2px 12px; }
                        .pormsg-block:hover { border-color: #fff; } .pormsg-block:has(.pormsg-block:hover) { border-color: #2a2a2a; }
                        
                        .pormsg-header { cursor: pointer; padding: 4px 10px 4px 0; background: #111; display: flex; align-items: center; list-style: none; border-radius: 6px 6px 0 0; transition: background 0.1s; max-width: 100%; box-sizing: border-box; }
                        .pormsg-header::-webkit-details-marker { display: none; } .pormsg-header:hover { background: #1a1a1a; } .pormsg-header:hover .line-num { color: #888; }
                        
                        .box-paste-btn { font-size: 10px; font-weight: bold; color: #888; background: #222; border: 1px solid #333; border-radius: 4px; padding: 2px 8px; cursor: pointer; transition: all 0.2s; opacity: 0; display: flex; align-items: center; flex-shrink: 0; }
                        .pormsg-header:hover .box-paste-btn { opacity: 1; } .box-paste-btn:hover { background: #0078d4; color: #fff; border-color: #0078d4; }
                        
                        .caret { color: #0078d4; font-size: 10px; margin-right: 8px; transition: 0.2s; flex-shrink: 0; } details[open] > .pormsg-header .caret { transform: rotate(90deg); }
                        
                        .pormsg-body { padding: 0; border-top: 1px solid #222; overflow-x: auto; overflow-y: hidden; width: 100%; box-sizing: border-box; }
                        .pormsg-body::-webkit-scrollbar { height: 6px; } .pormsg-body::-webkit-scrollbar-track { background: transparent; }
                        .pormsg-body::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; } .pormsg-body::-webkit-scrollbar-thumb:hover { background: #555; }
                        
                        .pormsg-footer { padding: 4px 10px 4px 0; background: #111; border-top: 1px solid #2a2a2a; border-radius: 0 0 6px 6px; display: flex; align-items: center; transition: background 0.1s; max-width: 100%; box-sizing: border-box; }
                        .pormsg-footer:hover { background: #1a1a1a; } .pormsg-footer:hover .line-num { color: #888; } .footer-tag { color: #666; font-size: 10px; font-style: italic; white-space: nowrap; }
                        
                        .go-top-btn { font-size: 10px; font-weight: bold; color: #555; background: #0a0a0a; border: 1px solid #222; border-radius: 4px; padding: 2px 8px; cursor: pointer; transition: all 0.2s; opacity: 0; flex-shrink: 0; }
                        .pormsg-footer:hover .go-top-btn { opacity: 1; } .go-top-btn:hover { background: #0078d4; color: #fff; border-color: #0078d4; }
                        
                        .pormsg-line { padding: 0 10px 0 0; line-height: 1.5; position: relative; z-index: 1; display: flex; align-items: center; transition: background 0.1s; border-radius: 2px; width: max-content; min-width: 100%; box-sizing: border-box; }
                        .pormsg-line:hover { background: rgba(255, 255, 255, 0.08); } .pormsg-line:hover .line-num { color: #888; }
                        
                        .search-highlight { background: rgba(212, 160, 23, 0.2) !important; border-radius: 2px; } .search-highlight .line-num { color: #d4a017 !important; font-weight: bold; }
                        
                        #minimap-thumb:hover { background: rgba(255, 255, 255, 0.15) !important; border-color: rgba(255, 255, 255, 0.4) !important; }
                        .mini-detail, .mini-body, .mini-footer { margin: 0; padding: 0; outline: none; } .mini-summary { list-style: none; margin: 0; padding: 0; display: block; } .mini-summary::-webkit-details-marker { display: none; }
                    </style>
                    <div style="display: flex; position: absolute; inset: 0; background: #000; overflow: hidden;">
                        <div id="editor-scroll-container" style="flex: 1; overflow-y: auto; overflow-x: hidden; padding: 10px; position: relative;">
                            <pre style="margin:0; padding:0; width:100%; max-width:100%; overflow-x:auto;">
                                <code class="hljs" style="font-family:'JetBrains Mono', monospace; font-size:13px; background:transparent; display:block; width:100%; padding:0; margin:0;">
                                    ${finalHTML}
                                </code>
                            </pre>
                        </div>
                        <div id="minimap-container" style="width: 70px; min-width: 70px; background: #050505; border-left: 1px solid #1a1a1a; position: relative; user-select: none;">
                            <div id="minimap-track" style="position: absolute; left: 0; right: 0; top: 10px; pointer-events: none; transition: transform 0.1s ease-out;">${minimapHTML}</div>
                            <div id="minimap-thumb" style="position: absolute; top: 0; right: 0; width: 100%; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-right: none; cursor: grab; border-radius: 4px 0 0 4px; transition: background 0.2s, border-color 0.2s;"></div>
                        </div>
                    </div>`;

                const scrollCont = document.getElementById('editor-scroll-container'), miniThumb = document.getElementById('minimap-thumb');
                const miniCont = document.getElementById('minimap-container'), miniTrack = document.getElementById('minimap-track');
                const searchInput = document.getElementById('editor-search-input'), searchResult = document.getElementById('editor-search-result');
                let searchTimer;

                if (searchInput && scrollCont) {
                    searchInput.addEventListener('focus', () => { document.getElementById('editor-search-box').style.borderColor = '#0078d4'; });
                    searchInput.addEventListener('blur', () => { document.getElementById('editor-search-box').style.borderColor = '#333'; });
                    searchInput.addEventListener('input', () => {
                        clearTimeout(searchTimer);
                        searchTimer = setTimeout(() => {
                            const query = searchInput.value.toLowerCase();
                            const elements = editorContent.querySelectorAll('.pormsg-line, .pormsg-header, .pormsg-footer');
                            elements.forEach(el => el.classList.remove('search-highlight'));
                            if (!query.trim()) { searchResult.innerText = ''; return; }
                            let matchCount = 0, firstMatch = null;
                            elements.forEach(el => {
                                if (el.textContent.toLowerCase().includes(query)) {
                                    el.classList.add('search-highlight'); matchCount++;
                                    if (!firstMatch) firstMatch = el;
                                    let parent = el.closest('details');
                                    while (parent) {
                                        if (!parent.open) {
                                            parent.open = true;
                                            const miniId = parent.getAttribute('data-mini-id');
                                            if (miniId) { const mini = document.getElementById(miniId); if (mini) mini.open = true; }
                                        }
                                        parent = parent.parentElement.closest('details');
                                    }
                                }
                            });
                            searchResult.innerText = matchCount > 0 ? matchCount : '0';
                            if (firstMatch) { scrollCont.scrollTo({ top: firstMatch.offsetTop - 40, behavior: 'smooth' }); setTimeout(updateThumb, 50); }
                        }, 250);
                    });
                }

                if (scrollCont && miniThumb && miniCont) {
                    editorContent.querySelectorAll('.editor-detail').forEach(d => {
                        d.addEventListener('toggle', () => {
                            const mini = document.getElementById(d.getAttribute('data-mini-id'));
                            if (mini) mini.open = d.open; setTimeout(updateThumb, 30);
                        });
                    });
                    const updateThumb = () => {
                        const sh = scrollCont.scrollHeight, ch = scrollCont.clientHeight;
                        if (sh <= ch) { miniThumb.style.display = 'none'; miniTrack.style.transform = `translateY(0px)`; return; }
                        miniThumb.style.display = 'block';
                        const thumbHeight = Math.max((ch / sh) * miniCont.clientHeight, 20); 
                        miniThumb.style.height = thumbHeight + 'px';
                        const scrollRatio = scrollCont.scrollTop / (sh - ch);
                        miniThumb.style.top = (scrollRatio * (miniCont.clientHeight - thumbHeight)) + 'px';
                        if (miniTrack.scrollHeight > miniCont.clientHeight) {
                            miniTrack.style.transform = `translateY(-${scrollRatio * (miniTrack.scrollHeight - miniCont.clientHeight + 20)}px)`;
                        } else { miniTrack.style.transform = `translateY(0px)`; }
                    };
                    scrollCont.addEventListener('scroll', updateThumb); window.addEventListener('resize', updateThumb); setTimeout(updateThumb, 50);

                    let isDragging = false;
                    miniThumb.onmousedown = (e) => { isDragging = true; miniThumb.style.cursor = 'grabbing'; e.preventDefault(); };
                    document.onmouseup = () => { isDragging = false; miniThumb.style.cursor = 'grab'; };
                    document.onmousemove = (e) => {
                        if (!isDragging) return;
                        const rect = miniCont.getBoundingClientRect();
                        const thumbHeight = miniThumb.offsetHeight, thumbMax = rect.height - thumbHeight;
                        const targetTop = Math.max(0, Math.min(e.clientY - rect.top - (thumbHeight / 2), thumbMax));
                        scrollCont.scrollTop = (targetTop / thumbMax) * (scrollCont.scrollHeight - scrollCont.clientHeight);
                    };
                    miniCont.onmousedown = (e) => {
                        if (e.target === miniThumb) return;
                        const rect = miniCont.getBoundingClientRect();
                        scrollCont.scrollTop = (e.clientY - rect.top) / rect.height * scrollCont.scrollHeight - scrollCont.clientHeight / 2;
                        updateThumb();
                    };
                }
            }
        }
    } catch (err) {
        editorContent.innerHTML = `<div style="position: absolute; inset: 0; overflow:auto; background:#000; color:#f44; padding:20px; font-family:'JetBrains Mono', monospace;">Failed to open file:<br>${err.message}</div>`;
    }
};

function updateTerminalPrompt() {
    const prefixEl = document.getElementById('terminal-prompt-prefix');
    if (!prefixEl) return;
    const p = window.currentPath || '';
    if (!p || p === 'DRIVES') {
        prefixEl.innerText = '> ';
        return;
    }
    const parts = p.split(/[\\/]/).filter(Boolean);
    if (parts.length === 0) {
        prefixEl.innerText = '> ';
    } else {
        const last = parts[parts.length - 1];
        prefixEl.innerText = `.../${last} > `;
    }
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
    terminalCount++; const id = `sub-${terminalCount}`; terminalSessions[id] = { logs: [] };
    const tab = document.createElement('div'); tab.className = `sub-tab ${isInitial ? 'active' : ''}`; tab.id = `tab-${id}`;
    tab.innerHTML = `powershell ${terminalCount} <span class="sub-close">
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    </span>`;
    
    tab.onclick = (e) => { if (e.target.classList.contains('sub-close')) closeSubTerminal(id); else switchSubTerminal(id); };
    document.getElementById('terminal-sub-tabs')?.appendChild(tab); switchSubTerminal(id);
}
function switchSubTerminal(id) {
    document.querySelectorAll('.sub-tab').forEach(t => { t.classList.remove('active'); });
    const at = document.getElementById(`tab-${id}`); if (at) { at.classList.add('active'); ensureTabVisible(id); }
    activeSubTabId = id; const lw = document.getElementById('terminal-logs-wrapper'), ti = document.getElementById('terminal-main-input');
    if (!lw) return; lw.innerHTML = '';
    (terminalSessions[id].logs || []).forEach(log => {
        const line = document.createElement('div'); line.innerText = log.text; line.style.color = log.type === 'cmd' ? '#ccc' : '#888';
        line.style.marginBottom = '8px'; line.style.whiteSpace = 'pre-wrap'; lw.appendChild(line);
    });
    if (ti) ti.focus(); const surface = document.getElementById('terminal-content'); if (surface) surface.scrollTop = surface.scrollHeight;
}

function closeSubTerminal(id) {
    const tabs = document.querySelectorAll('.sub-tab');
    if (tabs.length <= 1) {
        terminalSessions[id].logs = [];
        switchSubTerminal(id);
        
        // 마지막 탭 닫기 클릭 시 팝오버 창도 함께 닫아줌
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
    delete terminalSessions[id];
    const tabEl = document.getElementById(`tab-${id}`);
    if (tabEl) tabEl.remove();
    if (activeSubTabId === id) {
        const remainingTabs = document.querySelectorAll('.sub-tab');
        if (remainingTabs.length > 0) {
            const nextId = remainingTabs[0].id.replace('tab-', '');
            switchSubTerminal(nextId);
        }
    }
}

function showConfirm(msg, onOk) {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-confirm-modal');
        const msgEl = document.getElementById('confirm-message');
        const okBtn = document.getElementById('confirm-ok');
        const cancelBtn = document.getElementById('confirm-cancel');
        const closeBtn = document.getElementById('close-confirm');

        if (!modal || !msgEl) return resolve(false);
        msgEl.innerText = msg; modal.style.display = 'flex'; if (cancelBtn) cancelBtn.style.display = 'inline-block';
        const hide = () => { modal.style.display = 'none'; };
        okBtn.onclick = () => { hide(); if (onOk) onOk(); resolve(true); };
        cancelBtn.onclick = () => { hide(); resolve(false); };
        closeBtn.onclick = () => { hide(); resolve(false); };
        modal.onclick = (e) => { if (e.target === modal) { hide(); resolve(false); } };
    });
}

function showAlert(msg, onOk) {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-confirm-modal');
        const msgEl = document.getElementById('confirm-message');
        const okBtn = document.getElementById('confirm-ok');
        const cancelBtn = document.getElementById('confirm-cancel');
        const closeBtn = document.getElementById('close-confirm');

        if (!modal || !msgEl) return resolve(true);
        msgEl.innerText = msg; modal.style.display = 'flex'; if (cancelBtn) cancelBtn.style.display = 'inline-block';
        const hide = () => { modal.style.display = 'none'; };
        okBtn.onclick = () => { hide(); if (onOk) onOk(); resolve(true); };
        cancelBtn.onclick = () => { hide(); resolve(false); };
        closeBtn.onclick = () => { hide(); resolve(false); }; 
        modal.onclick = (e) => { if (e.target === modal) { hide(); resolve(false); } };
    });
}

function setupUI() {
    const tL = document.getElementById('terminal-lower'), tI = document.getElementById('terminal-main-input'), tS = document.getElementById('terminal-content');
    setupHorizontalScroll(document.querySelector('.terminal-tabs')); setupHorizontalScroll(document.getElementById('terminal-sub-tabs'));
    if (tS && tI) tS.onmouseup = () => { if (!window.getSelection().toString()) tI.focus(); };
    if (tI) {
        tI.onkeydown = (e) => {
            if (e.key === 'Enter') {
                const cmd = tI.value.trim(); if (!cmd) return;
                terminalSessions[activeSubTabId].logs.push({ type: 'cmd', text: `> ${cmd}` }); switchSubTerminal(activeSubTabId);
                ipcRenderer.send('execute-cmd', cmd); tI.value = '';
            }
        };
    }
    ipcRenderer.removeAllListeners('cmd-output');
    ipcRenderer.on('cmd-output', (e, data) => {
        if (activeSubTabId && terminalSessions[activeSubTabId]) {
            terminalSessions[activeSubTabId].logs.push({ type: 'out', text: data }); switchSubTerminal(activeSubTabId);
        }
    });

    document.getElementById('minimize-terminal').onclick = () => {
        const im = tL.offsetHeight <= 40; tL.style.height = im ? '350px' : '35px';
        document.getElementById('minimize-terminal').innerText = im ? '▼' : '▲'; syncBrowserView();
    };

    const vd = (r, t, s) => {
        if (!r || !t) return;
        r.onmousedown = (e) => {
            const sx = e.clientX, sw = t.offsetWidth;
            const mv = (m) => { const df = (s === 'l') ? (m.clientX - sx) : (sx - m.clientX); t.style.width = Math.max(150, Math.min(window.innerWidth * 0.8, sw + df)) + 'px'; syncBrowserView(); };
            const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
            window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
        };
    };
    vd(document.getElementById('resizer-left'), document.getElementById('sidebar-left'), 'l'); vd(document.getElementById('resizer-inspector'), document.getElementById('inspector-right'), 'r');
    const rT = document.getElementById('resizer-terminal');
    if (rT && tL) {
        rT.onmousedown = (e) => {
            const sy = e.clientY, sh = tL.offsetHeight;
            const mv = (m) => { tL.style.height = Math.max(40, Math.min(window.innerHeight * 0.8, sh + (sy - m.clientY))) + 'px'; syncBrowserView(); };
            const up = () => { window.removeEventListener('mouseup', up); window.removeEventListener('mousemove', mv); };
            window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
        };
    }

    const addA = document.getElementById('add-agent-app-card'), mo = document.getElementById('app-reg-modal');
    if (addA && mo) addA.onclick = () => { mo.style.display = 'flex'; document.getElementById('reg-app-url')?.focus(); };
    document.getElementById('cancel-reg').onclick = () => { mo.style.display = 'none'; };
    document.getElementById('confirm-reg').onclick = async () => {
        let u = document.getElementById('reg-app-url').value.trim(); if (!u) return;
        if (!u.startsWith('http')) u = 'https://' + u;
        let inSel = document.getElementById('reg-input-selector')?.value.trim() || '';
        let btnSel = document.getElementById('reg-send-selector')?.value.trim() || '';
        let resSel = document.getElementById('reg-response-selector')?.value.trim() || '';
        
        const s = await ipcRenderer.invoke('vault-read-global', 'registry.json');
        const apps = s ? JSON.parse(s) : [];
        const editingUrl = mo.dataset.editingUrl;

        if (editingUrl) {
            const idx = apps.findIndex(a => (typeof a === 'string' ? a : a.url) === editingUrl);
            if (idx > -1) apps[idx] = { url: u, input: inSel, send: btnSel, response: resSel };
            delete mo.dataset.editingUrl;
        } else {
            apps.push({ url: u, input: inSel, send: btnSel, response: resSel });
        }
        ipcRenderer.send('vault-update-global', { fileName: 'registry.json', content: JSON.stringify(apps) });
        location.reload();
    };

    const urlIn = document.getElementById('agent-url-input'); if (urlIn) {
        urlIn.onkeydown = (e) => {
            if (e.key === 'Enter') {
                let u = urlIn.value.trim(); if (!u) return;
                if (!u.startsWith('http')) u = 'https://' + u;
                const wv = document.getElementById('active-agent-webview');
                if (wv) wv.src = u;
            }
        };
    }
    document.getElementById('refresh-agent').onclick = () => { const u = urlIn.value.trim(); if (u) { const wv = document.getElementById('active-agent-webview'); if (wv) wv.reload(); } };

    const settingsBtn = document.getElementById('agent-settings-btn');
    const settingsMenu = document.getElementById('agent-settings-menu');
    if (settingsBtn && settingsMenu) {
        settingsBtn.onmouseover = () => settingsBtn.style.background = '#222';
        settingsBtn.onmouseout = () => settingsBtn.style.background = 'transparent';
        
        settingsBtn.onclick = (e) => { e.stopPropagation(); settingsMenu.style.display = settingsMenu.style.display === 'none' ? 'flex' : 'none'; };
        document.addEventListener('click', () => { settingsMenu.style.display = 'none'; });

        document.querySelectorAll('.settings-menu-item').forEach(item => {
            item.onmouseenter = () => item.style.background = item.id === 'menu-factory-reset' ? 'rgba(255,0,0,0.15)' : '#1a1a1a';
            item.onmouseleave = () => item.style.background = item.id === 'menu-factory-reset' ? 'rgba(255,0,0,0.05)' : 'transparent';
        });

        const switchAgentBtn = document.getElementById('menu-switch-agent');
        if (switchAgentBtn) { switchAgentBtn.onclick = () => { document.getElementById('agent-hub-webview').style.display = 'none'; document.getElementById('agent-hub-home').style.display = 'flex'; }; }

        const devAgentBtn = document.getElementById('menu-debug-agent');
        if (devAgentBtn) { devAgentBtn.onclick = () => { const wv = document.getElementById('active-agent-webview'); if (wv) wv.openDevTools(); }; }

        const resetBtn = document.getElementById('menu-factory-reset');
        if (resetBtn) {
            resetBtn.onclick = async () => {
                const confirmed = await showConfirm("정말 완전 초기화를 진행하시겠습니까?\n등록된 모든 에이전트와 설정이 삭제되며 제미나이 기본 상태로 돌아갑니다.");
                if (confirmed) { ipcRenderer.send('vault-update-global', { fileName: 'registry.json', content: '[]' }); location.reload(); }
            };
        }
    }

    const dsModal = document.getElementById('discovery-settings-modal');
    const dsInput = document.getElementById('discovery-keywords-input');
    const defaultKeywords = 'message, ask, prompt, type, question, conversation, input, chat, command, send, help you today, search, write, say';

    document.getElementById('open-discovery-settings').onclick = async () => {
        const saved = (await ipcRenderer.invoke('vault-read-global', 'discovery_keywords.txt')) || defaultKeywords;
        dsInput.value = saved; dsModal.style.display = 'flex';
    };
    document.getElementById('close-discovery-settings').onclick = () => { dsModal.style.display = 'none'; };
    document.getElementById('save-discovery-settings').onclick = () => {
        ipcRenderer.send('vault-update-global', { fileName: 'discovery_keywords.txt', content: dsInput.value.trim() });
        dsModal.style.display = 'none';
    };

    const tLA = document.getElementById('tab-local-agent'), tBH = document.getElementById('tab-browser-hub');
    const vLC = document.getElementById('inspector-local-chat'), vBH = document.getElementById('inspector-browser-hub');
    const swi = (m) => {
        vLC.style.display = (m === 'local') ? 'flex' : 'none'; vBH.style.display = (m !== 'local') ? 'flex' : 'none';
        tLA.classList.toggle('active-tab', (m === 'local')); tBH.classList.toggle('active-tab', (m !== 'local'));
        if (m === 'local' && document.hasFocus()) { const ci = document.getElementById('local-agent-input'); if (ci) setTimeout(() => ci.focus(), 100); }
    };
    if (tLA) tLA.onclick = () => swi('local'); if (tBH) tBH.onclick = () => swi('browser');

    document.getElementById('save-local-chat').onclick = () => { ChatUI.appendBubble('system', '[SYSTEM] Chat snapshot save requested.'); };
    document.getElementById('clear-local-chat').onclick = () => { 
        showConfirm("Initialize both chat history file and screen? (Irrecoverable)", () => {
            generating = false; 
            const sendBtn = document.getElementById('send-to-local'); if (sendBtn) sendBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;
            ipcRenderer.send('vault-reset-session', { logPath: GravityVault.activeLogPath }); 
            document.getElementById('local-chat-messages').innerHTML = ''; if (window.chatLog) window.chatLog = []; 
            const overlay = document.getElementById('web-process-overlay'); if (overlay) { overlay.style.display = 'none'; overlay.style.pointerEvents = 'none'; }
            const chatIn = document.getElementById('local-agent-input'); if (chatIn) { setTimeout(() => { chatIn.focus(); chatIn.click(); }, 50); }
        });
    };

    const chatIn = document.getElementById('local-agent-input');
    const localControls = chatIn ? chatIn.parentElement : null;
    
// [🛠️ 수정: 프로젝트 정보 전송 버튼 (입력창 윗단에 정갈하게 배치)]
    if (localControls && !document.getElementById('btn-send-project-info')) {
        const projBtn = document.createElement('button');
        projBtn.id = 'btn-send-project-info';
        projBtn.innerHTML = '📁 Send Project Info to Browser';

        // absolute 대신 안전한 블록형 구조로 교정
        projBtn.style = `
            width: 100%;
            height: 40px;
            margin-bottom: 12px;
            background: var(--primary);
            color: #fff;
            border: none;
            border-radius: 8px;
            font-family: 'DM Sans', 'Outfit', sans-serif;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            letter-spacing: -0.01em;
            box-shadow: 0 4px 12px rgba(70, 140, 246, 0.2);
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        `;
        projBtn.onmouseenter = () => { projBtn.style.filter = 'brightness(1.1)'; projBtn.style.boxShadow = '0 4px 14px rgba(70, 140, 246, 0.3)'; };
        projBtn.onmouseleave = () => { projBtn.style.filter = 'none'; projBtn.style.boxShadow = '0 4px 12px rgba(70, 140, 246, 0.2)'; };

        projBtn.onclick = async () => {
            projBtn.innerText = "Sending Project Context...";
            document.getElementById('tab-browser-hub')?.click();
            
            const tree = await ipcRenderer.invoke('vault-get-tree', window.currentPath);
            
            // AI에게 전달하는 트리 내부의 [FILE] 개수를 카운트하여 분모 설정 (동기식 정확성 확보)
            const fileMatches = tree.match(/\[FILE\]/g);
            window.totalFilesCount = fileMatches ? fileMatches.length : 0;
            window.readFilesSet.clear();
            
            // 불필요한 설정 다 빼고 목적만 전달하는 심플한 프롬프트
            const webPayload = `현재 프로젝트 폴더에는 다음 파일들이 있습니다:
${tree}

여기서 작업을 시작하기 위해 특정 파일을 탐색하거나 읽어야 할 것 같으면, 다음 명령어를 사용해 주세요:
- 파일 전체 읽기: [CMD: read-file "파일명"]
- 시스템 명령어: [CMD: 명령어]

이 메시지를 확인했다면, 작업을 파악하기 위해 필요한 첫 번째 명령어를 다음 답변에 바로 입력해 주세요.${CRITICAL_RULE_SUFFIX}`.trim();
            
            // 응답 캡처 엔진 먼저 작동 후 주입 실행 (타이밍 꼬임 해결)
            const enginePromise = runExperimentalEngine('/marktag', webPayload, null);
            await injectWebPayload(webPayload);
            
            // 버튼 숨김
            projBtn.style.display = 'none';
            if (chatIn) chatIn.focus();
            
            // 응답 캡처 대기 완료 후 로컬 복귀
            const response = await enginePromise;
            document.getElementById('tab-local-agent')?.click();
            if (response) {
                ChatUI.appendBubble('ai', response, false, getWebIcon(document.getElementById('active-agent-webview')));
                detectAndAskCommand(response);
            }
        };

        // 입력창(chatIn) 바로 위에 깔끔하게 삽입
        localControls.insertBefore(projBtn, chatIn);
    }

    

    const updateAgentBadge = () => {
        const wv = document.getElementById('active-agent-webview'), badge = document.getElementById('active-project-badge');
        const headerIcon = document.getElementById('active-agent-icon');

        if (wv && wv.src && !wv.src.startsWith('about:blank')) {
            try {
                const d = new URL(wv.src).hostname; const name = d.split('.')[0].toUpperCase();
                const icon = `https://www.google.com/s2/favicons?domain=${d}&sz=64`;
                if (badge) badge.innerText = `PORMSG · ${name}`; if (headerIcon) headerIcon.src = icon;
                if (chatIn) { chatIn.placeholder = `Ask ${name}...`; }
            } catch(e) {}
        } else {
            if (badge) badge.innerText = `PORMSG`; if (headerIcon) headerIcon.src = 'png.png'; if (chatIn) chatIn.placeholder = `Ask AI...`;
        }
    };

    window.updateAgentBadge = updateAgentBadge;
    const sendBtn = document.getElementById('send-to-local');
    
    const handleSend = async (overridePrompt = null, isRegen = false, isAuto = false, sourceIcon = null, targetBubble = null) => {
        if (generating) { ipcRenderer.send('stop-ollama'); generating = false; sendBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`; return; }

        const promptText = (typeof overridePrompt === 'string') ? overridePrompt : chatIn.value.trim();
        if (!promptText) return;

        if (promptText === '/help') {
            chatIn.value = '';
            ChatUI.appendBubble('ai', `
**PormsG Command List**
- \`/marktag [msg]\`: Precision Markdown tag extraction (Recommended)
- \`/spatialMutation [msg]\`: Extract changes by monitoring specific area
- \`/mutation [msg]\`: Extract changes by monitoring full DOM
- \`/spatial [msg]\`: Extract using spatial analysis
- \`/test [msg]\`: Inject basic input (manual verification)
- \`/help\`: Show this help message
            `);
            return;
        }

        const experimentalCmds = ['/marktag', '/mutation', '/spatial', '/spatialMutation', '/test'];
        let matchedCmd = null, msg = "";

        for (const c of experimentalCmds) {
            if (promptText === c || promptText.startsWith(c + ' ')) { matchedCmd = c; msg = promptText.substring(c.length).trim(); break; }
        }

        if (matchedCmd) {
            const isTest = (matchedCmd === '/test'); const cmd = matchedCmd; const displayCmd = msg ? `${cmd} ${msg}` : cmd;
            ChatUI.appendBubble('user', displayCmd); /* GravityVault.log('user', displayCmd); */ chatIn.value = '';
            document.getElementById('tab-browser-hub').click();

            try {
                if (isTest) { await injectWebPayload(msg); } 
                else {
                    const statusBub = ChatUI.appendBubble('ai', `[SYSTEM] ${cmd} entering wait mode...`);
                    const enginePromise = runExperimentalEngine(cmd, msg, statusBub);
                    await new Promise(r => setTimeout(r, 300));
                    await injectWebPayload(msg);
                    const response = await enginePromise;
                    if (statusBub) statusBub.remove();
                    document.getElementById('tab-local-agent').click();

                    if (response) { ChatUI.appendBubble('ai', response, false, getWebIcon(document.getElementById('active-agent-webview'))); /* GravityVault.log('ai', response); */ detectAndAskCommand(response); } 
                    else {
                        const failBub = ChatUI.appendBubble('ai', `[SYSTEM] ${cmd} automatic extraction failed.`);
                        const content = failBub.querySelector('.bubble-content');
                        if (content) {
                            content.innerHTML = `
                                <div style="margin-bottom:12px; color:#aaa;">⚠️ ${cmd} automatic extraction failed.</div>
                                <div style="display:flex; justify-content:center; padding:5px 0;">
                                    <button class="manual-fetch-trigger-btn" style="background:#222; border:1px solid #333; color:#aaa; padding:8px 20px; border-radius:4px; font-size:11px; font-weight:600; cursor:pointer; transition:all 0.2s;">Manual Fetch</button>
                                </div>
                            `;
                            const btn = content.querySelector('.manual-fetch-trigger-btn');
                            btn.onmouseenter = () => { btn.style.background = '#333'; btn.style.color = '#fff'; btn.style.borderColor = '#444'; };
                            btn.onmouseleave = () => { btn.style.background = '#222'; btn.style.color = '#aaa'; btn.style.borderColor = '#333'; };
                            btn.onclick = async () => { const result = await showManualInputUI(failBub); if (result) { failBub.remove(); ChatUI.appendBubble('ai', result, false, getWebIcon(document.getElementById('active-agent-webview'))); } };
                        }
                    }
                }
            } catch (e) { ChatUI.appendBubble('ai', `[ERROR] Injection failed: ${e.message}`); }
            return;
        }

        if (true) {
            if (typeof overridePrompt !== 'string') { ChatUI.appendBubble('user', promptText); /* GravityVault.log('user', promptText); */ chatIn.value = ''; }
            const overlay = document.getElementById('web-process-overlay'), progBar = document.getElementById('web-process-bar');
            const steps = { scan: document.getElementById('step-scan'), analyze: document.getElementById('step-analyze'), brief: document.getElementById('step-brief'), extract: document.getElementById('step-extract') };
            const updateProcess = (stepId, percent) => {
                overlay.style.display = 'block'; overlay.style.pointerEvents = 'auto'; progBar.style.width = percent + '%';
                Object.values(steps).forEach(s => s?.classList.remove('active')); if (steps[stepId]) steps[stepId].classList.add('active');
            };

            try {
                let projectTree = "";
                if (!window.sessionBriefed) { updateProcess('scan', 10); projectTree = await ipcRenderer.invoke('vault-get-tree'); }
                updateProcess('brief', 50);

                const treeSection = (!window.sessionBriefed && projectTree) ? `\n[PROJECT FILE LIST]\n${projectTree}\n` : "";
                const instructionSection = (!window.sessionBriefed) ? `\n[SYSTEM INSTRUCTION]\nThe directory listing above shows the current root of the project. If you need to explore subdirectories or read the content of specific files to answer my request, please let me know. For example: "Please list the contents of the 'src' folder" or "Show me the code in 'main.js'". I will provide the requested details in the next turn.\n` : "";
                const webPayload = `[USER REQUEST]\n${promptText}\n${treeSection}${instructionSection}`.trim();

                window.sessionBriefed = true;

                // 1. 브라우저 탭 유지 — 응답 완료 전까지 전환 금지
                document.getElementById('tab-browser-hub')?.click();

                // 2. injectWebPayload 전송
                await new Promise(r => setTimeout(r, 500));
                await injectWebPayload(webPayload);

                updateProcess('extract', 90);

                // 3. 응답 완료까지 await
                const response = await runExperimentalEngine('/marktag', promptText, null);
                progBar.style.width = '100%'; await new Promise(r => setTimeout(r, 500));
                overlay.style.display = 'none'; overlay.style.pointerEvents = 'none';

                // 4. 응답 완료 후 로컬 탭으로 복귀
                document.getElementById('tab-local-agent')?.click();
                if (response) {
                    ChatUI.appendBubble('ai', response, false, getWebIcon(document.getElementById('active-agent-webview')));
                    detectAndAskCommand(response);
                } else {
                    ChatUI.appendBubble('ai', '[SYSTEM] WebAI response extraction failed.');
                }
            } catch (e) { 
                overlay.style.display = 'none'; 
                ChatUI.appendBubble('ai', `[ERROR] WebAI Mode failed: ${e.message}`);
            }
            return;
        }
    };

    const pMo = document.getElementById('persona-modal'), pBtn = document.getElementById('open-persona-settings');
    if (pBtn && pMo) {
        pBtn.onclick = async () => {
            pMo.style.display = 'flex';
            const traits = await ipcRenderer.invoke('vault-read-global', 'traits.md');
            if (traits) {
                const lines = traits.split('\n');
                document.getElementById('ps-name').value = lines[0]?.replace('NAME: ', '') || '';
                document.getElementById('ps-personality').value = lines[1]?.replace('PERSONALITY: ', '') || '';
                document.getElementById('ps-info').value = lines[2]?.replace('INFO: ', '') || '';
                document.getElementById('ps-speech').value = lines[3]?.replace('SPEECH: ', '') || '';
            }
        };
        document.getElementById('cancel-persona').onclick = () => pMo.style.display = 'none';
        document.getElementById('save-persona').onclick = () => {
            const content = `NAME: ${document.getElementById('ps-name').value}\nPERSONALITY: ${document.getElementById('ps-personality').value}\nINFO: ${document.getElementById('ps-info').value}\nSPEECH: ${document.getElementById('ps-speech').value}`;
            ipcRenderer.send('vault-update-global', { fileName: 'traits.md', content });
            pMo.style.display = 'none'; GravityVault.init();
        };
    }
    updateAgentBadge();
}

const ChatUI = {
    appendBubble(role, text, isThinking = false, sourceIcon = null) {
        const chatLog = document.getElementById('local-chat-messages'); if (!chatLog) return;
        const box = document.createElement('div'); box.className = `chat-bubble ${role}`; box.dataset.role = role;
        const tools = document.createElement('div'); tools.className = 'bubble-tools';
        const btn = (icon, title, cl, fn) => { const b = document.createElement('div'); b.className = `tool-btn ${cl}`; b.innerHTML = icon; b.title = title; b.onclick = (e) => { e.stopPropagation(); fn(box); }; return b; };
        tools.appendChild(btn('🔄', 'Regenerate', 'regen', (b) => this.regenerate(b))); tools.appendChild(btn('✏️', 'Edit', 'edit', (b) => this.edit(b))); tools.appendChild(btn('🗑️', 'Delete', 'delete', (b) => this.delete(b)));
        box.appendChild(tools);
        const content = document.createElement('div'); content.className = 'bubble-content';
        if (typeof marked !== 'undefined') content.innerHTML = marked.parse(text); else content.innerText = text;
        box.appendChild(content);
        if (sourceIcon) { const badge = document.createElement('div'); badge.className = 'source-badge'; badge.innerHTML = `<img src="${sourceIcon}" title="Source: Web AI">`; box.appendChild(badge); }
        chatLog.appendChild(box); chatLog.scrollTop = chatLog.scrollHeight;
        if (typeof hljs !== 'undefined') box.querySelectorAll('pre code').forEach((el) => hljs.highlightElement(el));
        return box;
    },
    delete(box) { box.remove(); },
    edit(box) {
        if (box.querySelector('.edit-textarea')) return;
        const content = box.querySelector('.bubble-content'), originalText = box.dataset.role === 'user' ? content.innerText : content.innerHTML;
        const area = document.createElement('textarea'); area.className = 'edit-textarea';
        area.style = `width:100%; min-height:${content.offsetHeight}px; background:rgba(0,0,0,0.2); border:1px solid #444; border-radius:4px; color:inherit; font:inherit; outline:none; resize:vertical; padding:8px; box-sizing:border-box; margin-top:5px;`;
        area.value = originalText;
        const save = () => {
            if (box.dataset.role === 'user') content.innerText = area.value; else content.innerHTML = area.value;
            area.remove(); content.style.display = 'block'; 
            if (typeof hljs !== 'undefined') box.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el));
        };
        area.oninput = () => { area.style.height = 'auto'; area.style.height = area.scrollHeight + 'px'; };
        content.style.display = 'none'; box.appendChild(area); area.focus(); area.style.height = area.scrollHeight + 'px';
        area.onblur = save; area.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); } };
    },
    regenerate(box) {
        let pBox = (box.dataset.role === 'user') ? box : box.previousElementSibling;
        while (pBox && !pBox.classList.contains('user')) pBox = pBox.previousElementSibling;
        if (!pBox) return;
        const txt = pBox.querySelector('.bubble-content').innerText;
        let targetBubble;
        if (box.dataset.role === 'user') {
            targetBubble = box.nextElementSibling;
            while (targetBubble && !targetBubble.classList.contains('ai')) targetBubble = targetBubble.nextElementSibling;
            if (!targetBubble) targetBubble = ChatUI.appendBubble('ai', '...');
        } else { targetBubble = box; }
        const content = targetBubble.querySelector('.bubble-content');
        if (content) content.innerHTML = '<div class="thinking-dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>';
        handleSend(txt, true, false, null, targetBubble);
    },
    async restoreHistory() {
        window.isRestoring = true;
        const logContent = await ipcRenderer.invoke('vault-read-log', `${new Date().toISOString().split('T')[0]}.md`);
        if (!logContent) { window.isRestoring = false; return; }
        const chatLog = document.getElementById('local-chat-messages'); if (!chatLog) return;
        chatLog.innerHTML = '';
        logContent.split(/### \[.*?\] /).forEach(entry => {
            if (!entry.trim()) return;
            const role = entry.startsWith('USER') ? 'user' : (entry.startsWith('AI') ? 'ai' : null);
            if (role) this.appendBubble(role, entry.replace(/^(USER|AI)\n/, '').trim());
        });
        hljs.highlightAll(); setTimeout(() => { chatLog.scrollTop = chatLog.scrollHeight; window.isRestoring = false; }, 300);
    }
};

let generating = false; let timerInt = null;

const GravityVault = {
    activeLogPath: null, 
    async init() {
        const res = await ipcRenderer.invoke('vault-init'); this.activeLogPath = res.activeLogPath;
        console.log("[Vault] Log System Initialized:", this.activeLogPath);
    },
    log(role, text) { if (this.activeLogPath) ipcRenderer.send('vault-log', { logPath: this.activeLogPath, role, text }); }
};

async function setupBoot() {
    const grid = document.getElementById('agent-hub-grid'), addA = document.getElementById('add-agent-app-card');
    if (!grid || !addA) return;

    window.launchWebAgent = async (appData, isSilentBoot = false) => {
        let u = typeof appData === 'string' ? appData : appData.url;
        let inSel = typeof appData === 'object' ? appData.input : ''; let btnSel = typeof appData === 'object' ? appData.send : ''; let resSel = typeof appData === 'object' ? appData.response : '';

        if (!isSilentBoot) {
            const confirmed = await showAlert("현재 프로젝트 폴더의 정보를 해당 AI에게 발송합니다.");
            if (!confirmed) return;
        }

        document.getElementById('agent-hub-home').style.display = 'none'; document.getElementById('agent-hub-webview').style.display = 'flex';
        const urlInput = document.getElementById('agent-url-input');
        if (urlInput) urlInput.value = u;

        try {
            const d = new URL(u).hostname; const iconSrc = `https://www.google.com/s2/favicons?domain=${d}&sz=64`; const agentName = d.split('.')[0].toUpperCase();
            const tabIcon = document.getElementById('current-agent-tab-icon'), tabName = document.getElementById('current-agent-tab-name');
            if (tabIcon) tabIcon.src = iconSrc; if (tabName) tabName.innerText = agentName;
        } catch(e) {}

        if (!isSilentBoot) {
            const webToggle = document.getElementById('web-ai-mode-toggle'); if (webToggle) webToggle.checked = true;
            document.getElementById('tab-local-agent')?.click();
            setTimeout(() => document.getElementById('local-agent-input')?.focus(), 100);
        }

        const dock = document.getElementById('agent-view-dock'); dock.innerHTML = '';
        const wv = document.createElement('webview'); wv.id = 'active-agent-webview'; wv.src = u;
        wv.useragent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
        wv.style = "width:100%; height:100%; border:none;"; wv.setAttribute('allowpopups', '');
        wv.addEventListener('contextmenu', () => wv.openDevTools());

        if (!isSilentBoot) {
            wv.addEventListener('did-finish-load', async () => {
                const projectTree = await ipcRenderer.invoke('vault-get-tree');
                if (projectTree) {
                    setTimeout(async () => {
                        try {
                            await injectWebPayload("dont think simply answer me 'A'"); await runExperimentalEngine('/marktag', "dont think simply answer me 'A'", null);
                            ChatUI.appendBubble('system', '[SYSTEM] INITIALIZATION COMPLETE.');
                            const briefPayload = `[SYSTEM INITIALIZATION - PROJECT MAPPED]\nYou are now connected to the project workspace. \n\n### CAPABILITIES\nYou can interact with this local machine by including specific command tags in your response.\n- **Read File**: Use \`[CMD: type "filename"]\`\n- **List Files**: Use \`[CMD: dir]\`\n- **Run Tasks**: \`[CMD: command]\`\n\n### DIRECTORY STRUCTURE:\n${projectTree}`.trim();
                            await injectWebPayload(briefPayload);
                            const briefResponse = await Promise.race([
                                runExperimentalEngine('/marktag', "If you need to explore subdirectories or read specific files, please ask.", null),
                                new Promise((_, reject) => setTimeout(() => reject(new Error('Briefing response timeout')), 120000))
                            ]);
                            window.sessionBriefed = true; document.getElementById('tab-local-agent').click();
                            if (briefResponse) { ChatUI.appendBubble('ai', briefResponse, false, getWebIcon(wv)); /* GravityVault.log('ai', briefResponse); */ detectAndAskCommand(briefResponse); }
                        } catch (err) { window.sessionBriefed = true; document.getElementById('tab-local-agent').click(); ChatUI.appendBubble('system', '[ERROR] INITIALIZATION FAILED.'); }
                    }, 2500);
                }
            }, { once: true });
        }

        dock.appendChild(wv); if (window.updateAgentBadge) window.updateAgentBadge();
        window.currentAgentSelectors = { input: inSel, send: btnSel, response: resSel };
    };

    const create = (appData) => {
        let u = typeof appData === 'string' ? appData : appData.url; const d = new URL(u).hostname;
        const c = document.createElement('div'); c.className = 'agent-app'; c.style.position = 'relative';
        c.innerHTML = `<div class=\"icon-wrapper\"><img src=\"https://www.google.com/s2/favicons?domain=${d}&sz=64\"></div><div class=\"agent-name\">${d.split('.')[0]}</div>`;
        c.onclick = () => window.launchWebAgent(appData, false);

        let hoverTimer;
        c.onmouseenter = () => {
            hoverTimer = setTimeout(() => {
                if (c.querySelector('.agent-del-btn')) return;
                const delBtn = document.createElement('div'); delBtn.className = 'agent-del-btn'; delBtn.innerHTML = '×';
                delBtn.style = `position: absolute; top: -8px; right: -8px; width: 22px; height: 22px; background: rgba(255, 59, 48, 0.9); color: white; border-radius: 50%; display: flex; justify-content: center; align-items: center; cursor: pointer; font-size: 16px; font-weight: bold; line-height: 1; padding-bottom: 2px; z-index: 100; box-shadow: 0 4px 12px rgba(255, 59, 48, 0.4);`;
                delBtn.onclick = async (e) => {
                    e.stopPropagation();
                    const s = await ipcRenderer.invoke('vault-read-global', 'registry.json');
                    const apps = s ? JSON.parse(s) : []; const idx = apps.findIndex(a => (typeof a === 'string' ? a : a.url) === u);
                    if (idx > -1) apps.splice(idx, 1); ipcRenderer.send('vault-update-global', { fileName: 'registry.json', content: JSON.stringify(apps) }); c.remove();
                };
                c.appendChild(delBtn);

                const editBtn = document.createElement('div'); editBtn.className = 'agent-edit-btn'; editBtn.innerHTML = '✏️';
                editBtn.style = `position: absolute; top: -8px; left: -8px; width: 22px; height: 22px; background: #0078d4; color: white; border-radius: 50%; display: flex; justify-content: center; align-items: center; cursor: pointer; font-size: 11px; z-index: 100; box-shadow: 0 4px 12px rgba(0, 120, 212, 0.4);`;
                editBtn.onclick = (e) => {
                    e.stopPropagation(); const mo = document.getElementById('app-reg-modal');
                    document.getElementById('reg-app-url').value = u; document.getElementById('reg-input-selector').value = appData.input || ''; document.getElementById('reg-send-selector').value = appData.send || ''; document.getElementById('reg-response-selector').value = appData.response || '';
                    mo.dataset.editingUrl = u; mo.style.display = 'flex'; document.getElementById('reg-app-url').focus();
                };
                c.appendChild(editBtn);
            }, 500);
        };
        c.onmouseleave = () => { clearTimeout(hoverTimer); c.querySelector('.agent-del-btn')?.remove(); c.querySelector('.agent-edit-btn')?.remove(); };
        grid.insertBefore(c, addA);
    };

    const s = await ipcRenderer.invoke('vault-read-global', 'registry.json'); 
    let apps = []; if (s) { try { apps = JSON.parse(s); } catch(e) { } }

    let geminiApp = apps.find(a => (a.url || a).includes('gemini.google.com'));
    if (!geminiApp) {
        geminiApp = { url: 'https://gemini.google.com/app', input: 'rich-textarea, div[contenteditable="true"], textarea', send: 'button[aria-label*="Send"], button[aria-label*="보내기"]', response: '' };
        apps.unshift(geminiApp); ipcRenderer.send('vault-update-global', { fileName: 'registry.json', content: JSON.stringify(apps) });
    }
    apps.forEach(appData => create(appData)); if (geminiApp) window.launchWebAgent(geminiApp, true);

    document.getElementById('add-terminal').onclick = () => addSubTerminal();
    window.loadDirectory(window.currentPath);
}

window.totalFilesCount = 0;
window.readFilesSet = new Set();

const CRITICAL_RULE_SUFFIX = `

[CRITICAL RULE]
1. 아직 전체 프로젝트가 파악되지 않았다면, 읽은 파일에 대해 구구절절 설명하지 말고 그냥 다음 탐색할 [CMD: ...] 명령어만 단답형으로 제출하십시오.
2. 분석 및 계획 수립 단계로 넘어갈 때는 절대 [CMD: ...] 태그를 제안하지 마십시오. 탐색이 다 끝났다면 구체적인 작업 계획을 제시해 주세요.
3. 한 번의 답변에 오직 한 개의 [CMD: ...] 태그만 사용하십시오. 여러 파일을 보고 싶더라도 한 번에 하나씩만 요청해야 합니다.`;

async function injectWebPayload(webPayload) {
    const savedKeywords = (await ipcRenderer.invoke('vault-read-global', 'discovery_keywords.txt')) || 'message, ask, prompt, type, question, conversation, input, chat, command, send, help you today, search, write, say';
    const inKeywords = savedKeywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k);

    return new Promise((resolve, reject) => {
        const wv = document.getElementById('active-agent-webview'); if (!wv) return reject("Webview not found");
        const cleanPayload = webPayload.trim();
        const base64Payload = Buffer.from(cleanPayload, 'utf-8').toString('base64');
        const totalLines = cleanPayload.split('\n').length; // 전체 라인수 산출

        // 1단계: 토스트 UI 켜기 및 진행바를 초록색으로 설정
        const toast = document.getElementById('injection-toast'), toastText = document.getElementById('toast-text'), toastBar = document.getElementById('toast-progress-bar');
        if (toast && toastText && toastBar) {
            toast.style.display = 'block';
            toast.style.background = '#0a0a0a';
            toast.style.border = '1px solid #4caf50';
            
            const readCount = window.readFilesSet.size;
            const projectPct = window.totalFilesCount ? Math.min(100, Math.floor((readCount / window.totalFilesCount) * 100)) : 0;
            
            toastText.innerHTML = `
                <div style="font-size:11px; color:#aaa; font-weight:bold; margin-bottom:4px; font-family:sans-serif;">
                    프로젝트 파악률: <span style="color:#4caf50;">${projectPct}% (${readCount}/${window.totalFilesCount})</span>
                </div>
                <div style="font-size:12px; color:#eee; font-weight:bold; font-family:sans-serif;">
                    주입률: <span style="color:#4caf50;">0% [0/${totalLines}]</span>
                </div>
            `;
            
            toastBar.style.display = 'block';
            toastBar.style.width = "0%";
            toastBar.style.background = '#4caf50';
            toastBar.style.height = '4px';
        }

        // 2단계: 웹뷰 콘솔 리스너 장착 (진행률 실시간 고속 수신용)
        const onConsole = (e) => {
            if (e.message.startsWith('[INJECT_PCT]:')) {
                const parts = e.message.split(':')[1].split(',');
                const pct = parseInt(parts[0]);
                const curLines = parseInt(parts[1] || '0');
                const totLines = parseInt(parts[2] || '0');
                
                const readCount = window.readFilesSet.size;
                const projectPct = window.totalFilesCount ? Math.min(100, Math.floor((readCount / window.totalFilesCount) * 100)) : 0;
                
                if (toastText && toastBar) {
                    if (pct === 100) {
                        toastText.innerHTML = `
                            <div style="font-size:11px; color:#aaa; font-weight:bold; margin-bottom:4px; font-family:sans-serif;">
                                프로젝트 파악률: <span style="color:#4caf50;">${projectPct}% (${readCount}/${window.totalFilesCount})</span>
                            </div>
                            <div style="font-size:12px; color:#eee; font-weight:bold; font-family:sans-serif;">
                                주입률: <span style="color:#4caf50;">100% [${totLines}/${totLines}]</span>
                            </div>
                        `;
                        toastBar.style.width = "100%";
                    } else {
                        toastText.innerHTML = `
                            <div style="font-size:11px; color:#aaa; font-weight:bold; margin-bottom:4px; font-family:sans-serif;">
                                프로젝트 파악률: <span style="color:#4caf50;">${projectPct}% (${readCount}/${window.totalFilesCount})</span>
                            </div>
                            <div style="font-size:12px; color:#eee; font-weight:bold; font-family:sans-serif;">
                                주입률: <span style="color:#4caf50;">${pct}% [${curLines}/${totLines}]</span>
                            </div>
                        `;
                        toastBar.style.width = `${pct}%`;
                    }
                }
            }
        };
        wv.addEventListener('console-message', onConsole);

        const cleanup = () => {
            wv.removeEventListener('console-message', onConsole);
            if (toast) toast.style.display = 'none';
        };

        // 3단계: 단 1회의 executeJavaScript 호출로 웹뷰 내부 비동기 타이핑 실행 (IPC 병목 100% 제거)
        const injectionScript = `
            (async () => {
                const inKeywords = ${JSON.stringify(inKeywords)};
                const findInput = () => {
                    const isVisible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
                    const candidates = Array.from(document.querySelectorAll('textarea, input[type="text"], div[contenteditable="true"], [role="textbox"]')).filter(el => isVisible(el));
                    for (let el of candidates) {
                        const text = (el.placeholder || el.getAttribute('aria-label') || el.title || el.innerText || '').toLowerCase();
                        if (inKeywords.some(k => text.includes(k))) return el;
                    }
                    return candidates[0] || null;
                };
                
                const inputEl = findInput();
                if (!inputEl) return "INPUT_NOT_FOUND";
                
                inputEl.focus();
                
                if (inputEl.tagName === 'TEXTAREA' || inputEl.tagName === 'INPUT') {
                    inputEl.value = '';
                } else {
                    inputEl.innerText = '';
                }
                
                // Base64 디코딩 (안전성 100%)
                const decodedPayload = (() => {
                    try {
                        const bin = atob("${base64Payload}");
                        const bytes = new Uint8Array(bin.length);
                        for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
                        return new TextDecoder("utf-8").decode(bytes);
                    } catch (e) {
                        return "";
                    }
                })();
                
                if (!decodedPayload) return "DECODE_ERROR";
                
                // 100ms 포커스 대기
                await new Promise(r => setTimeout(r, 100));
                
                // 웹뷰 내부에서 루프를 동기/비동기 수행 (통신 지연이 없어 10배 이상 가속)
                const chunkSize = 2000;
                const totalLen = decodedPayload.length;
                for (let i = 0; i < totalLen; i += chunkSize) {
                    const chunk = decodedPayload.substring(i, i + chunkSize);
                    document.execCommand('insertText', false, chunk);
                    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                    
                    const pct = Math.floor((i / totalLen) * 100);
                    const curLines = decodedPayload.substring(0, i).split('\\n').length;
                    console.log("[INJECT_PCT]:" + pct + "," + curLines + ",${totalLines}");
                    await new Promise(r => setTimeout(r, 1));
                }
                inputEl.dispatchEvent(new Event('change', { bubbles: true }));
                console.log("[INJECT_PCT]:100,${totalLines},${totalLines}");
                
                // 주입 후 짧은 텀을 주고 엔터 전송
                await new Promise(r => setTimeout(r, 150));
                
                const enterDown = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13 });
                inputEl.dispatchEvent(enterDown);
                
                const enterPress = new KeyboardEvent('keypress', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13 });
                inputEl.dispatchEvent(enterPress);
                
                const enterUp = new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13 });
                inputEl.dispatchEvent(enterUp);
                
                return "SUCCESS";
            })()
        `;

        wv.focus();
        wv.executeJavaScript(injectionScript).then(async (status) => {
            if (status !== "SUCCESS") {
                if (toastText) toastText.innerText = "Error: " + status;
                setTimeout(cleanup, 3000);
                return reject("Input failed: " + status);
            }

            // 전송 처리 확인 대기 및 종료
            await new Promise(r => setTimeout(r, 1500));
            cleanup();
            resolve(true);
        }).catch(err => {
            cleanup();
            reject(err);
        });
    });
}
function detectAndAskCommand(text) {
    if (!text) return;

    // 모든 [CMD: ...] 추출
    const cmdRegex = /\[CMD:\s*([^\]]+)\]/gi;
    let match;
    const foundCmds = [];
    while ((match = cmdRegex.exec(text)) !== null) {
        const cleanCmd = match[1].trim();
        if (cleanCmd) foundCmds.push(cleanCmd);
    }

    if (foundCmds.length === 0) return;

    foundCmds.forEach(cleanCmd => {
        // read-file 인지 검사
        const isReadFile = /^read-file\s+"([^"]+)"$/i.test(cleanCmd);
        
        // [🛠️ 실존 파일 필터링: read-file 제안 시 파일이 실존하지 않으면 Proposed Bubble 생성을 통째로 무시]
        if (isReadFile) {
            const fileMatch = cleanCmd.match(/^read-file\s+"([^"]+)"$/i);
            if (fileMatch) {
                const filePath = fileMatch[1];
                const fs = require('fs');
                const path = require('path');
                const targetPath = path.resolve(window.currentPath, filePath);
                if (!fs.existsSync(targetPath)) {
                    return; // forEach 이므로 continue와 동치
                }
            }
        }

        const box = ChatUI.appendBubble('system', '');
        const content = box.querySelector('.bubble-content');
        
        const title = isReadFile ? "📄 FILE READ PROPOSED" : "⚡ COMMAND PROPOSED";
        const themeColor = isReadFile ? "#ffa500" : "#0078d4"; // 파일 읽기는 오렌지, 명령어는 블루

        content.innerHTML = `
            <div style="font-size:11px; color:${themeColor}; margin-bottom:8px; font-weight:900; display:flex; align-items:center; gap:6px;">
                <div style="width:3px; height:12px; background:${themeColor}; border-radius:10px;"></div>
                ${title}
            </div>
            <div style="background:#0a0a0a; padding:10px 12px; border-radius:4px; border:1px solid #2a2a2a; font-family:'JetBrains Mono',monospace; font-size:12px; color:#eee; margin-bottom:10px;">
                <span style="color:#555;">${isReadFile ? '📄' : '$'}</span> ${cleanCmd}
            </div>
            <div style="display:flex; gap:8px;">
                <button class="cmd-run-btn" style="flex:1; background:${themeColor}; color:white; border:none; padding:6px; border-radius:4px; cursor:pointer; font-weight:bold; font-size:11px;">RUN</button>
                <button class="cmd-cancel-btn" style="flex:1; background:#222; color:#aaa; border:1px solid #333; padding:6px; border-radius:4px; cursor:pointer; font-size:11px;">CANCEL</button>
            </div>
        `;

        content.querySelector('.cmd-run-btn').onclick = async () => {
            box.remove();
            
            if (isReadFile) {
                // read-file 처리
                const fileMatch = cleanCmd.match(/^read-file\s+"([^"]+)"$/i);
                if (fileMatch) {
                    const filePath = fileMatch[1];
                    try {
                        const fs = require('fs');
                        const path = require('path');
                        const targetPath = path.resolve(window.currentPath, filePath);
                        
                        if (fs.existsSync(targetPath)) {
                            // 읽은 파일셋에 기록
                            window.readFilesSet.add(filePath);
                            
                            const fileContent = fs.readFileSync(targetPath, 'utf-8');
                            const finalMessage = `[FILE DATA: ${filePath}]\n\`\`\`\n${fileContent}\n\`\`\`\n\n[SYSTEM] File contents provided above. Please analyze.${CRITICAL_RULE_SUFFIX}`;
                            
                            document.getElementById('tab-browser-hub')?.click();
                            
                            // 응답 캡처 엔진 먼저 대기
                            const enginePromise = runExperimentalEngine('/marktag', finalMessage, null);
                            await injectWebPayload(finalMessage);
                            ChatUI.appendBubble('system', `[SYSTEM] Sent ${filePath} content to Web AI.`);
                            
                            // 응답 완료 대기 후 로컬 복귀 및 처리
                            const response = await enginePromise;
                            document.getElementById('tab-local-agent')?.click();
                            if (response) {
                                ChatUI.appendBubble('ai', response, false, getWebIcon(document.getElementById('active-agent-webview')));
                                detectAndAskCommand(response);
                            }
                        } else {
                            ChatUI.appendBubble('system', `[ERROR] File not found: ${filePath}`);
                            document.getElementById('tab-browser-hub')?.click();
                            await injectWebPayload(`[SYSTEM ERROR] File not found: ${filePath}`);
                        }
                    } catch (err) {
                        ChatUI.appendBubble('system', `[ERROR] Failed to read ${filePath}: ${err.message}`);
                    }
                }
            } else {
                // 일반 커맨드 처리
                if (window.activeSubTabId && window.terminalSessions[window.activeSubTabId]) {
                    window.terminalSessions[window.activeSubTabId].logs.push({ type: 'cmd', text: `> ${cleanCmd}` });
                    window.switchSubTerminal(window.activeSubTabId);
                    ipcRenderer.send('execute-cmd', cleanCmd);
                    
                    const tL = document.getElementById('terminal-lower');
                    if (tL && tL.offsetHeight <= 40) {
                        tL.style.height = '350px';
                        const minBtn = document.getElementById('minimize-terminal'); 
                        if (minBtn) minBtn.innerText = '▼';
                        if (typeof syncBrowserView === 'function') syncBrowserView();
                    }
                }
                
                ChatUI.appendBubble('system', `[EXECUTED] ${cleanCmd}`);
                document.getElementById('tab-browser-hub')?.click();
                const payload = `[SYSTEM] Command \`${cleanCmd}\` executed on the local machine. Proceed with the next step.${CRITICAL_RULE_SUFFIX}`;
                
                // 응답 캡처 엔진 먼저 대기
                const enginePromise = runExperimentalEngine('/marktag', payload, null);
                await injectWebPayload(payload);
                
                // 응답 완료 대기 후 복귀
                const response = await enginePromise;
                document.getElementById('tab-local-agent')?.click();
                if (response) {
                    ChatUI.appendBubble('ai', response, false, getWebIcon(document.getElementById('active-agent-webview')));
                    detectAndAskCommand(response);
                }
            }
        };

        content.querySelector('.cmd-cancel-btn').onclick = () => box.remove();
    });
}
function getWebIcon(wv) { try { return `https://www.google.com/s2/favicons?domain=${new URL(wv.src).hostname}&sz=64`; } catch { return null; } }

async function showManualInputUI(statusBub) {
    return new Promise((resolve) => {
        const content = statusBub.querySelector('.bubble-content');
        if (!content) return resolve(null);
        
        content.innerHTML = `
            <div style="font-size:12px; margin-bottom:8px; color:#ffa500; font-weight:bold;">[MANUAL OVERRIDE]</div>
            <div style="font-size:11px; color:#aaa; margin-bottom:8px;">Copy the response (Ctrl+C) from the webview on the right to fetch it <b>automatically</b>.<br>Or paste it directly below.</div>
            <textarea class="manual-input-area" placeholder="Paste the web AI response here..." style="width:100%; height:150px; background:#000; color:#ccc; border:1px solid #333; padding:10px; font-size:13px; outline:none; resize:none; border-radius:6px; font-family:inherit;"></textarea>
            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:8px;">
                <button class="manual-cancel-btn" style="background:#222; color:#aaa; border:1px solid #333; padding:5px 15px; border-radius:4px; font-weight:bold; cursor:pointer;">Cancel</button>
                <button class="manual-save-btn" style="background:#fff; color:#000; border:none; padding:5px 15px; border-radius:4px; font-weight:bold; cursor:pointer;">Save Response</button>
            </div>
        `;

        const area = content.querySelector('.manual-input-area'), saveBtn = content.querySelector('.manual-save-btn'), cancelBtn = content.querySelector('.manual-cancel-btn');
        let clipboardInterval = null;

        const cleanup = () => {
            if (clipboardInterval) clearInterval(clipboardInterval);
            const toast = document.getElementById('injection-toast'); if (toast) toast.style.display = 'none';
            const webBarCont = document.getElementById('web-extract-progress-container'); if (webBarCont) webBarCont.style.display = 'none';
        };

        saveBtn.onclick = () => {
            const val = area.value.trim(); if (!val) { alert("Please enter content."); return; }
            saveBtn.innerText = "Saving..."; saveBtn.disabled = true; cleanup(); resolve(val);
        };
        cancelBtn.onclick = () => { cleanup(); resolve(""); };

        document.getElementById('tab-browser-hub')?.click();

        const toast = document.getElementById('injection-toast'), toastText = document.getElementById('toast-text'), toastBar = document.getElementById('toast-progress-bar'), webBar = document.getElementById('web-extract-progress-bar');
        if (toast) { toast.style.display = 'block'; if (toastText) toastText.innerText = "Waiting for manual copy (8s)..."; if (toastBar) toastBar.style.display = 'none'; }
        if (webBar) { webBar.style.width = '100%'; webBar.style.background = '#0078d4'; webBar.style.transition = 'width 0.5s linear'; }

        const { clipboard } = require('electron'); const initialClipboard = clipboard.readText(); let timeoutTicks = 0; 
        clipboardInterval = setInterval(() => {
            timeoutTicks++; const currentClipboard = clipboard.readText();
            if (webBar) webBar.style.width = `${Math.max(0, 100 - (timeoutTicks / 16) * 100)}%`;
            if (currentClipboard && currentClipboard !== initialClipboard) {
                area.value = currentClipboard; cleanup();
                setTimeout(() => { document.getElementById('tab-local-agent')?.click(); saveBtn.click(); }, 300);
            } else if (timeoutTicks >= 16) { cleanup(); document.getElementById('tab-local-agent')?.click(); }
        }, 500); 
    });
}

async function runExperimentalEngine(cmd, msg, statusBub) {
    // [🛠️ 해결: 누락된 변수 선언 추가]
    let stableN = 0;
    let currentExtension = 0;

    const wv = document.getElementById('active-agent-webview');
    const webBarCont = document.getElementById('web-extract-progress-container');
    const webBar = document.getElementById('web-extract-progress-bar');
    
    if (!wv || !wv.src || wv.src.startsWith('about:blank')) {
        const toast = document.getElementById('injection-toast'), toastText = document.getElementById('toast-text'), toastBar = document.getElementById('toast-progress-bar');
        if (toast && toastText) {
            toastText.innerHTML = "<b>⚠️ No Agent Selected</b><br><span style='font-size:11px; color:#aaa;'>Please select an AI agent from the Browser tab first.</span>";
            toast.style.display = 'block'; toast.style.borderColor = "rgba(255, 165, 0, 0.5)"; if (toastBar) toastBar.style.display = 'none';
            setTimeout(() => { toast.style.display = 'none'; toast.style.borderColor = ""; if (toastBar) toastBar.style.display = 'block'; }, 4000);
        }
        return null;
    }

    if (webBarCont) {
        webBarCont.style.display = 'block'; webBarCont.style.cursor = 'pointer'; 
        webBarCont.onclick = (e) => {
            const rect = webBarCont.getBoundingClientRect(); const clickPos = (e.clientX - rect.left) / rect.width; const reversedPos = 1 - clickPos;
            if (stableN >= 0) { stableN = Math.floor(reversedPos * 8); } else { const targetPos = Math.floor(reversedPos * (currentExtension + 8)); stableN = targetPos - currentExtension; }
            updateUI(stableN < 0 ? "Wait time adjusted (Extended)" : "Wait time adjusted", 0);
        };
    }
    if (webBar) { webBar.style.width = '0%'; webBar.style.background = '#0078d4'; }

    let manualAbort = false, resolveManual = null; const manualPromise = new Promise(res => { resolveManual = res; });

    if (statusBub) {
        const content = statusBub.querySelector('.bubble-content');
        if (content) {
            content.innerHTML = `<div class="status-text">[SYSTEM] AI working...</div><button class="manual-fetch-btn" style="margin-top:8px; padding:4px 10px; background:#222; border:1px solid #333; color:#aaa; border-radius:4px; font-size:11px; cursor:pointer; transition:0.2s;">Manual Fetch</button>`;
            content.querySelector('.manual-fetch-btn').onclick = async () => { manualAbort = true; const manualVal = await showManualInputUI(statusBub); if (resolveManual) resolveManual(manualVal); };
        }
    }

    const updateUI = (text, progress = 0, isStableMode = false) => {
        if (statusBub && !manualAbort) { const txtEl = statusBub.querySelector('.status-text'); if (txtEl) txtEl.innerText = `[SYSTEM] ${text}`; }
        const toast = document.getElementById('injection-toast'), toastText = document.getElementById('toast-text'), toastBar = document.getElementById('toast-progress-bar'), toastBtn = document.getElementById('toast-reset-timer-btn');
        
        // ㅈ같은 토스트 팝업 백그라운드 강제 부활 차단
        /* if (toast && !manualAbort) {
            toast.style.display = 'block';
            if (toastText) toastText.innerHTML = `<b>Analyzing AI response</b><br><span style='font-size:11px; color:#aaa;'>${text}</span>`;
            if (toastBar) toastBar.style.display = 'none'; 
            if (toastBtn) {
                if (stableN !== 0 && stableN < 8) { toastBtn.style.display = 'block'; toastBtn.onclick = (e) => { e.stopPropagation(); currentExtension += 60; stableN -= 60; if (toastText) toastText.innerHTML = `<b>Wait Time Extended! (+60s)</b><br><span style='font-size:11px; color:#0078d4; font-weight:bold;'>Total stability window: ${currentExtension + 8}s</span>`; }; } 
                else { toastBtn.style.display = 'none'; }
            }
            if (stableN < 0 && toastText) { toastText.innerHTML = `<b>Monitoring Extension</b><br><span style='font-size:11px; color:#0078d4;'>Stable state detected. Waiting ${Math.abs(stableN) + 8}s more...</span>`; }
        } */

        if (webBar) {
            const p = isStableMode ? progress : stableN;
            if (p > 0) { webBar.style.width = `${Math.max(0, 100 - (p / 8) * 100)}%`; webBar.style.background = '#0078d4'; } 
            else if (p < 0) { webBar.style.width = `${Math.max(0, 100 - ((p + currentExtension) / (currentExtension + 8)) * 100)}%`; webBar.style.background = '#0078d4'; } 
            else { webBar.style.width = '100%'; webBar.style.background = '#ffa500'; }
        }
    };

    // 무익한 핑거프린트 돔 간섭 코드 제거
    const idleFingerprint = "";
    
    const extractScript = `(function(){
        const selectors = [
            'model-response .markdown', 
            'message-content .markdown-prose', 
            '[data-testid="message-content"]', 
            '.response-content'
        ];
        
        let targetNode = null;
        for (let sel of selectors) {
            const nodes = document.querySelectorAll(sel);
            if (nodes.length > 0) {
                targetNode = nodes[nodes.length - 1]; // 가장 최신 응답
                break;
            }
        }
        
        if (!targetNode) return "[EXTRACT_FAIL]"; // 못 찾으면 에러 플래그 반환
        
        const clone = targetNode.cloneNode(true);
        clone.querySelectorAll('script, style, button, a[role="link"], [role="button"], .carousel, .suggestions-container, [aria-label*="추천"]').forEach(el => el.remove());
        
        // HTML to Markdown 재귀 파서
        const toMarkdown = (node) => {
            if (node.nodeType === 3) {
                return node.nodeValue;
            }
            if (node.nodeType !== 1) {
                return "";
            }
            
            const tag = node.tagName.toLowerCase();
            let childrenMarkdown = "";
            node.childNodes.forEach(child => {
                childrenMarkdown += toMarkdown(child);
            });
            
            switch (tag) {
                case 'h1': return "\\n# " + childrenMarkdown.trim() + "\\n";
                case 'h2': return "\\n## " + childrenMarkdown.trim() + "\\n";
                case 'h3': return "\\n### " + childrenMarkdown.trim() + "\\n";
                case 'h4': return "\\n#### " + childrenMarkdown.trim() + "\\n";
                case 'p': return "\\n" + childrenMarkdown.trim() + "\\n";
                case 'br': return "\\n";
                case 'strong':
                case 'b': return "**" + childrenMarkdown.trim() + "**";
                case 'em':
                case 'i': return "*" + childrenMarkdown.trim() + "*";
                case 'code': {
                    const isBlock = node.parentNode && node.parentNode.tagName.toLowerCase() === 'pre';
                    return isBlock ? childrenMarkdown : "\`" + childrenMarkdown.trim() + "\`";
                }
                case 'pre': return "\\n\`\`\`\\n" + childrenMarkdown.trim() + "\\n\`\`\`\\n";
                case 'li': return "\\n- " + childrenMarkdown.trim();
                case 'ul': return "\\n" + childrenMarkdown + "\\n";
                case 'ol': return "\\n" + childrenMarkdown + "\\n";
                case 'blockquote': return "\\n> " + childrenMarkdown.trim().split("\\n").join("\\n> ") + "\\n";
                default: return childrenMarkdown;
            }
        };
        
        return toMarkdown(clone).replace(/\\n{3,}/g, "\\n\\n").trim();
    })()`;

    const cleanGarbage = (t) => {
        if (!t) return "";
        let cleaned = t;

        // [🛠️ 강화: JS 코드 패턴 제거 (Gemini 페이지 가비지)]
        cleaned = cleaned.replace(/\(function\(\)\{[\s\S]*?\}\.call\(this\);/gi, "");
        cleaned = cleaned.replace(/this\.gbar_\s*=\s*this\.gbar_[\s\S]*?\}/gi, '');
        cleaned = cleaned.replace(/'use strict';[\s\S]{0,500}/gi, '');
        cleaned = cleaned.replace(/WIZ_global_data[\s\S]*?;/gi, '');
        cleaned = cleaned.replace(/google\.\w+[\s\S]{0,200}\{[\s\S]{0,500}\}/gi, '');

        const footers = [
            /Gemini는 AI이며 인물 등에 관한 정보 제공 시 실수를 할 수 있습니다.*/gi,
            /개인 정보 보호 및 Gemini새 창에서 열기/gi,
            /Gemini의 응답/gi,
            /Gemini may display inaccurate info.*/gi,
            /Your privacy and Gemini Apps/gi,
            /새 창에서 열기/gi
        ];
        footers.forEach(regex => { cleaned = cleaned.replace(regex, ""); });

        cleaned = cleaned.replace(/^[ \t\W]*(Thinking|Thought|Analyzing|Searching|Working|\[SYSTEM\]|Processing|Reasoning).*?(\n|$)/gim, "");
        cleaned = cleaned.replace(/[(\[]\s*(Thinking|Thought|Analyzing|Reasoning).*?\s*[)\]]/gi, "");
        cleaned = cleaned.replace(/^\s*(Thinking|Thought|Analyzing|Reasoning)(\.\.\.|\.)*\s*/gi, "");
        cleaned = cleaned.split("\n").filter(line => { const l = line.trim().toLowerCase(); return !(l === "thinking" || l === "thought" || l === "reasoning" || l.startsWith("thought for")); }).join("\n");
        
        return cleaned.trim();
    };

    const hideGlobalUI = () => { document.getElementById('injection-toast')?.setAttribute('style', 'display:none'); if (webBarCont) webBarCont.style.display = 'none'; };
    // [🛠️ 보완: 대기 시작 시점의 기존 텍스트 저장]
    const initialText = cleanGarbage(await wv.executeJavaScript(extractScript).catch(() => ""));
    let isGenerating = false;
    let lastText = "";
    let stableCount = 0;

    for (let i = 0; i < 1200; i++) { // 루프 횟수 증가 — 최대 20분 대기
        await new Promise(r => setTimeout(r, 1000));
        if (manualAbort) { hideGlobalUI(); return await manualPromise; }

        let delta = await wv.executeJavaScript(extractScript).catch(() => "");
        
        if (delta === "[EXTRACT_FAIL]") {
            delta = ""; // DOM을 못 찾았을 때는 빈 문자열로 처리하여 대기
        } else {
            delta = cleanGarbage(delta);
        }

        // [🛠️ 보완: 이전 답변 내용 필터링 및 대기]
        if (delta === initialText) {
            delta = ""; // 아직 새 답변 작성을 시작하지 않은 상태
        } else {
            if (initialText && delta.startsWith(initialText)) {
                delta = delta.substring(initialText.length).trim();
            }
        }

        if (!isGenerating && delta.length > 0) {
            isGenerating = true;
            updateUI("AI started responding...", 0, false);
        }

        if (isGenerating) {
            // UI 지문 검사는 방해만 되므로 삭제하고 텍스트 변화량(stableCount)만 체크
            const isTextStopped = (delta === lastText);
            
            if (isTextStopped && delta.length > 0) {
                stableCount++; 
            } else {
                stableCount = 0;
            }
            lastText = delta;

            // 텍스트 변화가 5번(약 5초) 이상 멈췄다면 선택지가 떴든 말든 강제로 완료 처리
            if (stableCount >= 5) {
                updateUI("Generation complete! Fetching...", 100); 
                hideGlobalUI(); 
                return cleanGarbage(delta);
            } else {
                updateUI(`AI is typing... (${delta.length} chars)`, 50, false);
            }
        } else {
            updateUI("Waiting for AI to start...", 0, false);
        }
    }
    if (manualAbort) { hideGlobalUI(); return await manualPromise; } hideGlobalUI(); return null;
}

/* window.addEventListener('contextmenu', (e) => {
    e.preventDefault(); e.stopPropagation();
    const target = e.target;
    const isEditable = target.closest('input, textarea, [contenteditable="true"]');
    const hasSelection = window.getSelection().toString().length > 0;
    const isInputZone = target.closest('#local-agent-input, .manual-input-area, [id^="local-agent"], div[style*="background:#0a0a0a"]');
    ipcRenderer.send('show-context-menu', { isEditable: !!(isEditable || isInputZone), hasSelection: hasSelection });
}, { capture: true }); */

async function migrateToVault() {
    const appsStr = localStorage.getItem('pormsg_agent_apps') || localStorage.getItem('vapor_agent_apps');
    if (appsStr && appsStr !== '[]') { const currentRegistry = await ipcRenderer.invoke('vault-read-global', 'registry.json'); if (!currentRegistry) ipcRenderer.send('vault-update-global', { fileName: 'registry.json', content: appsStr }); }
    const kwStr = localStorage.getItem('pormsg_discovery_keywords') || localStorage.getItem('vapor_discovery_keywords');
    if (kwStr) { const currentKw = await ipcRenderer.invoke('vault-read-global', 'discovery_keywords.txt'); if (!currentKw) ipcRenderer.send('vault-update-global', { fileName: 'discovery_keywords.txt', content: kwStr }); }
}

document.addEventListener('DOMContentLoaded', async () => {
    await migrateToVault(); 
    setupUI(); 
    addSubTerminal(true); 
    
    // 1. 먼저 Browser 탭에서 시작 (초기화 및 컨텍스트 로딩을 시각적으로 보여줌)
    document.getElementById('tab-browser-hub')?.click();
    
    await setupBoot();
    
    // 2. 1초 뒤 로컬 탭으로 자동 이동 + 입력창 포커스
    setTimeout(() => {
        const localTab = document.getElementById('tab-local-agent');
        if (localTab) {
            localTab.click();
            const chatIn = document.getElementById('local-agent-input');
            if (chatIn) chatIn.focus();
        }
    }, 1000);

    // Terminal Popover Event Bindings
    const popoverBtn = document.getElementById('terminal-toggle-btn');
    const popoverWin = document.getElementById('terminal-popover');
    if (popoverBtn && popoverWin) {
        popoverBtn.onclick = (e) => {
            e.stopPropagation();
            const isHidden = popoverWin.style.display === 'none' || !popoverWin.style.display;
            popoverWin.style.display = isHidden ? 'flex' : 'none';
            popoverBtn.style.color = isHidden ? '#fff' : '';
            popoverBtn.style.background = isHidden ? 'var(--primary)' : '';
            popoverBtn.style.boxShadow = '';
            if (isHidden) {
                setTimeout(() => document.getElementById('terminal-main-input')?.focus(), 150);
            }
        };
        // Minimize/Close terminal inside popover action
        const minBtn = document.getElementById('minimize-terminal');
        if (minBtn) {
            minBtn.onclick = (e) => {
                e.stopPropagation();
                popoverWin.style.display = 'none';
                popoverBtn.style.color = '';
                popoverBtn.style.background = '';
                popoverBtn.style.boxShadow = '';
            };
        }
        
        // Resizing drag logic
        const rR = popoverWin.querySelector('.popover-resizer-r');
        const rT = popoverWin.querySelector('.popover-resizer-t');
        const rTR = popoverWin.querySelector('.popover-resizer-tr');
        
        const initResize = (e, dir) => {
            e.preventDefault(); e.stopPropagation();
            const sx = e.clientX, sy = e.clientY;
            const sw = popoverWin.offsetWidth, sh = popoverWin.offsetHeight;
            popoverWin.style.transition = 'none'; // 드래그 시 딜레이 제거
            
            const mv = (m) => {
                if (dir === 'r' || dir === 'tr') {
                    const nw = sw + (m.clientX - sx);
                    popoverWin.style.width = `${Math.max(350, Math.min(window.innerWidth * 0.9, nw))}px`;
                }
                if (dir === 't' || dir === 'tr') {
                    const nh = sh - (m.clientY - sy);
                    popoverWin.style.height = `${Math.max(200, Math.min(window.innerHeight * 0.8, nh))}px`;
                }
            };
            const up = () => {
                window.removeEventListener('mousemove', mv);
                window.removeEventListener('mouseup', up);
                popoverWin.style.transition = 'opacity 0.2s, transform 0.2s';
            };
            window.addEventListener('mousemove', mv);
            window.addEventListener('mouseup', up);
        };
        if (rR) rR.addEventListener('mousedown', (e) => initResize(e, 'r'));
        if (rT) rT.addEventListener('mousedown', (e) => initResize(e, 't'));
        if (rTR) rTR.addEventListener('mousedown', (e) => initResize(e, 'tr'));
    }

    GravityVault.init();
});
ipcRenderer.on('refresh-explorer', () => { window.loadDirectory(window.currentPath); });
