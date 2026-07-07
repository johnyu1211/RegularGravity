// --- Poor man's Gravity ULTIMATE RENDERER ENGINE (STABLE v31 - COLLABORATION EDITION) ---
const fs = require('fs');
if (typeof ipcRenderer === 'undefined') { var { ipcRenderer } = require('electron'); }

window.reloadAgentSettings = function() {
    const _path = require('path');
    const _fs = require('fs');
    const p = _path.join(window.currentPath || process.cwd(), 'Settings.json');
    try {
        if (_fs.existsSync(p)) {
            const settings = JSON.parse(_fs.readFileSync(p, 'utf-8'));
            window.autoContinueOnRead = !!settings.autoContinueOnRead;
            window.hideUIOverlay = !!settings.hideUIOverlay;
            return;
        }
    } catch(e) {}
    window.autoContinueOnRead = false;
    window.hideUIOverlay = false;
};

function extractHtmlOutline(htmlContent) {
    let processed = htmlContent.replace(/<!--[\s\S]*?-->/g, '');
    processed = processed.replace(/<script([\s\S]*?)>([\s\S]*?)<\/script>/gi, '<script$1>// [SCRIPT BODY COLLAPSED]</script>');
    processed = processed.replace(/<style([\s\S]*?)>([\s\S]*?)<\/style>/gi, '<style$1>/* [STYLE BODY COLLAPSED] */</style>');
    
    const lines = processed.replace(/\r/g, '').split('\n');
    const outlineLines = [];
    for (let line of lines) {
        let trimmed = line.trim();
        if (!trimmed) continue;
        let lineOut = line;
        const textMatch = line.match(/>([^<]{30,})</);
        if (textMatch) {
            const longText = textMatch[1];
            lineOut = line.replace(longText, ` ... [TEXT COLLAPSED (${longText.length} chars)] ... `);
        }
        outlineLines.push(lineOut);
    }
    return outlineLines.join('\n');
}

function extractCodeOutline(content, ext) {
    const foldLangs = ['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json', 'c', 'cpp', 'java', 'go', 'rs', 'py', 'php', 'swift'];
    if (!foldLangs.includes(ext)) {
        return content;
    }
    if (ext === 'html') {
        return extractHtmlOutline(content);
    }
    const lines = content.replace(/\r/g, '').split('\n');
    let outlineLines = [];
    let skipDepth = 0;
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        
        let openBraces = 0;
        let closeBraces = 0;
        for (let char of line) {
            if (char === '{') openBraces++;
            if (char === '}') closeBraces++;
        }
        let net = openBraces - closeBraces;
        
        if (skipDepth > 0) {
            skipDepth += net;
            if (skipDepth <= 0) {
                skipDepth = 0;
                let indent = line.match(/^\s*/)[0];
                outlineLines.push(`${indent}}`);
            }
            continue;
        }
        
        if (net > 0) {
            outlineLines.push(line + " // [BODY COLLAPSED]");
            skipDepth = net;
        } else {
            outlineLines.push(line);
        }
    }
    return outlineLines.join('\n');
}

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
    const header = document.getElementById('editor-header-title');
    if (header) header.innerText = 'FILE VIEWER';
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

let _loadDirSeq = 0;
window.loadDirectory = async (p) => {
    const seq = ++_loadDirSeq;
    try {
        window.currentPath = p; 
        updateTerminalPrompt();
        document.getElementById('path-display').innerHTML = `<span class="path-segment">${formatPathDisplay(p)}</span>`;
        const badge = document.getElementById('active-project-badge'); if (badge) badge.innerText = p === 'DRIVES' ? 'PC' : p.split(/[\\\/]/).pop().toUpperCase() || 'PORMSG';
        const f = await window.fetchDirContent(p === 'DRIVES' ? '' : p);
        if (seq !== _loadDirSeq) return; // stale 응답 무시
        if (f == null) return;           // null/undefined면 트리 유지
        if (window.renderTree) window.renderTree(p, f);
        
        // 경로 복사 클릭 리스너 설정
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
        
        // 파일명만 업데이트, 버튼/검색은 HTML에서 항상 존재
        const titleEl = document.getElementById('editor-header-title');
        if (titleEl) titleEl.innerText = `FILE VIEWER - ${path.basename(filePath)}`;

        const toggleCollapseBtn = document.getElementById('btn-editor-toggle-collapse');

        if (toggleCollapseBtn) {
            const editorCollapseIcon = document.getElementById('editor-collapse-icon');
            toggleCollapseBtn.onclick = () => {
                if (!window._editorCollapsed) {
                    editorContent.querySelectorAll('.editor-detail').forEach(d => {
                        d.open = false;
                        const mini = document.getElementById(d.getAttribute('data-mini-id'));
                        if (mini) mini.open = false;
                    });
                    window._editorCollapsed = true;
                    toggleCollapseBtn.title = 'Expand All';
                    if (editorCollapseIcon) {
                        editorCollapseIcon.innerHTML = `<polyline points="7 9 12 4 17 9"></polyline><polyline points="7 15 12 20 17 15"></polyline>`;
                        editorCollapseIcon.classList.add('rotate-left');
                    }
                } else {
                    editorContent.querySelectorAll('.editor-detail').forEach(d => {
                        d.open = true;
                        const mini = document.getElementById(d.getAttribute('data-mini-id'));
                        if (mini) mini.open = true;
                    });
                    window._editorCollapsed = false;
                    toggleCollapseBtn.title = 'Collapse All';
                    if (editorCollapseIcon) {
                        editorCollapseIcon.innerHTML = `<polyline points="17 4 12 9 7 4"></polyline><polyline points="7 20 12 15 17 20"></polyline>`;
                        editorCollapseIcon.classList.add('rotate-left');
                    }
                }
                setTimeout(() => { if (typeof window.updateMinimapThumb === 'function') window.updateMinimapThumb(); }, 80);
            };
            // Reset to default (collapsed) when a new file opens
            window._editorCollapsed = true;
            toggleCollapseBtn.title = 'Expand All';
            if (editorCollapseIcon) {
                editorCollapseIcon.innerHTML = `<polyline points="17 4 12 9 7 4"></polyline><polyline points="7 20 12 15 17 20"></polyline>`;
                editorCollapseIcon.classList.add('rotate-left');
            }
            setTimeout(() => { if (typeof window.updateMinimapThumb === 'function') window.updateMinimapThumb(); }, 120);
        }



        const binaryExts = ['exe', 'dll', 'bin', 'zip', 'rar', 'tar', 'gz', '7z', 'pdf', 'mp3', 'mp4', 'wav', 'avi', 'mov', 'iso', 'so', 'dylib', 'class', 'jar', 'war', 'db', 'sqlite'];
        if (binaryExts.includes(ext)) {
            editorContent.innerHTML = `
                <div style="position: absolute; inset: 0; display:flex; flex-direction:column; justify-content:center; align-items:center; background:#0c0c0e; color:var(--text-muted); font-family:'DM Sans', sans-serif; gap: 12px; box-sizing:border-box; padding:20px;">
                    <div style="font-size: 24px;">⚠️</div>
                    <div style="font-size: 14px; font-weight: 600; color: #eee;">Binary File Detected</div>
                    <div style="font-size: 11.5px; color: var(--text-dark); text-align:center; max-width: 300px; line-height: 1.5; margin-bottom: 8px;">This file is binary and cannot be viewed as text in the editor.</div>
                    <button onclick="const ipc = require('electron').ipcRenderer; ipc.send('reveal-in-explorer', '${filePath.replace(/\\/g, '\\\\')}');" style="background:var(--surface-high); border: 1px solid var(--border-color); color:#fff; padding:6px 12px; border-radius:6px; font-size:11.5px; font-weight:600; cursor:pointer; transition:background 0.2s;">Open in File Explorer</button>
                </div>
            `;
            return;
        }

        if (imageExts.includes(ext)) {
            const base64 = fs.readFileSync(filePath).toString('base64');
            const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
            editorContent.innerHTML = `<div id="editor-scroll-container" style="position: absolute; inset: 0; display:flex; justify-content:center; align-items:flex-start; overflow:auto; padding:20px; box-sizing:border-box; background:#050505;"><img src="data:${mime};base64,${base64}" style="max-width:100%; object-fit:contain; box-shadow: 0 4px 20px rgba(0,0,0,0.5);"></div>`;
        } else {
            const content = fs.readFileSync(filePath, 'utf-8').replace(/\r/g, '');
            if (typeof hljs !== 'undefined') {
                const linesRaw = content.split('\n');
                let lang = ext;
                if (!hljs.getLanguage(lang)) {
                    lang = (ext === 'bat' || ext === 'cmd') ? 'dos' : 'plaintext';
                }
                const foldLangs = ['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json', 'c', 'cpp', 'java', 'go', 'rs', 'py', 'php', 'swift'];
                const shouldFold = foldLangs.includes(lang);
                const lines = hljs.highlight(content, { language: lang, ignoreIllegals: true }).value.split('\n');
                
                let finalHTML = ''; let minimapHTML = ''; let blockStack = []; let blockCounter = 0; 

                for (let i = 0; i < linesRaw.length; i++) {
                    let line = linesRaw[i]; let htmlLine = lines[i]; let lineNum = i + 1;
                    let lineNumHTML = `<span class="line-num">${lineNum}</span>`;
                    
                    let pureText = line.trim(); let spaces = (line.match(/^\s*/) || [''])[0].length; 
                    let mmColor = (pureText.includes('function') || pureText.includes('class') || pureText.includes('=>')) ? '#0078d4' : '#333';
                    if (pureText.startsWith('//')) mmColor = '#1e4620'; 
                    let mmLine = pureText.length > 0 ? `<div style="height:2px; margin-bottom:1px; margin-left:${Math.min(spaces, 25)}px; width:${Math.min(pureText.length, 35)}px; background:${mmColor}; border-radius:1px;"></div>` : `<div style="height:2px; margin-bottom:1px;"></div>`;
                    
                    let net = 0; 
                    if (shouldFold) {
                        for (let j = 0; j < line.length; j++) { if (line[j] === '{') net++; if (line[j] === '}') net--; }
                    }
                    if (shouldFold && net === 0 && blockStack.length === 0 && line.trim() === '') continue;

                    if (net > 0) {
                        let titleName = line.replace(/[{}]/g, '').trim() || "Block";
                        let syncId = `mini-block-${blockCounter++}`;
                        blockStack.push({ title: titleName, id: syncId, start: i });

                        finalHTML += `<div class="pormsg-block"><details class="editor-detail" data-mini-id="${syncId}" id="editor-${syncId}" data-start="${i}"><summary class="pormsg-header">${lineNumHTML}<span class="caret">▶</span><div style="flex:1; min-width:0; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; margin-right:10px;">${htmlLine}</div></summary><div class="pormsg-body" id="body-${syncId}">`;
                        minimapHTML += `<details id="${syncId}" class="mini-detail"><summary class="mini-summary">${mmLine}</summary><div class="mini-body">`;
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

                while (blockStack.length > 0) {
                    blockStack.pop();
                    finalHTML += `</div></details></div>`;
                    minimapHTML += `</div></details>`;
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
                            <pre style="margin:0; padding:0; width:100%; max-width:100%; overflow-x:auto;"><code class="hljs" style="font-family:'JetBrains Mono', monospace; font-size:13px; background:transparent; display:block; width:100%; padding:0; margin:0;">${finalHTML}</code></pre>
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
                    searchInput.onfocus = () => { document.getElementById('editor-search-box').style.borderColor = 'var(--primary)'; };
                    searchInput.onblur = () => { document.getElementById('editor-search-box').style.borderColor = 'var(--border-color)'; };
                    searchInput.value = ''; // 새 파일 열면 검색 초기화
                    if (searchResult) searchResult.innerText = '';
                    searchInput.oninput = () => {
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
                    };
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
                        miniThumb.style.display = 'block';
                        
                        if (sh <= ch) {
                            miniThumb.style.height = miniCont.clientHeight + 'px';
                            miniThumb.style.top = '0px';
                            miniThumb.style.opacity = '0.25';
                            miniTrack.style.transform = `translateY(0px)`;
                            return;
                        }
                        
                        miniThumb.style.opacity = '';
                        const thumbHeight = Math.max((ch / sh) * miniCont.clientHeight, 20); 
                        miniThumb.style.height = thumbHeight + 'px';
                        const scrollRatio = scrollCont.scrollTop / (sh - ch);
                        miniThumb.style.top = (scrollRatio * (miniCont.clientHeight - thumbHeight)) + 'px';
                        if (miniTrack.scrollHeight > miniCont.clientHeight) {
                            miniTrack.style.transform = `translateY(-${scrollRatio * (miniTrack.scrollHeight - miniCont.clientHeight + 20)}px)`;
                        } else { miniTrack.style.transform = `translateY(0px)`; }
                    };
                    window.updateMinimapThumb = updateThumb;
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
    const pathEl = document.getElementById('terminal-prompt-path');
    const prefixEl = document.getElementById('terminal-prompt-prefix');
    if (prefixEl && (!activeSubTabId || !terminalSessions[activeSubTabId]?.loading)) {
        prefixEl.innerText = '> ';
    }
    if (!pathEl) return;
    
    let p = process.cwd();
    if (activeSubTabId && terminalSessions[activeSubTabId] && terminalSessions[activeSubTabId].cwd) {
        p = terminalSessions[activeSubTabId].cwd;
    }
    if (!p || p === 'DRIVES') {
        pathEl.innerText = '';
        return;
    }
    pathEl.innerText = p; // 한줄 전체 폴더경로 표시
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
    terminalCount++; const id = `sub-${terminalCount}`; 
    terminalSessions[id] = { logs: [], cwd: window.currentPath || process.cwd(), loading: true };
    const tab = document.createElement('div'); tab.className = `sub-tab ${isInitial ? 'active' : ''}`; tab.id = `tab-${id}`;
    tab.innerHTML = `powershell ${terminalCount} <span class="sub-close">
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    </span>`;
    
    tab.onclick = (e) => { if (e.target.classList.contains('sub-close')) closeSubTerminal(id); else switchSubTerminal(id); };
    document.getElementById('terminal-sub-tabs')?.appendChild(tab); switchSubTerminal(id);
    
    // 백엔드 프로세스 선제적 기동(Pre-spawn) 자극
    ipcRenderer.send('execute-cmd', { tabId: id, command: '', cwd: terminalSessions[id].cwd });

    // 1초 후 강제 로딩 해제 (출력이 안 들어오더라도 입력 가능하도록)
    setTimeout(() => {
        if (terminalSessions[id] && terminalSessions[id].loading) {
            terminalSessions[id].loading = false;
            if (activeSubTabId === id) switchSubTerminal(id);
        }
    }, 1000);
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
    
    const prefixEl = document.getElementById('terminal-prompt-prefix');
    if (ti) {
        if (terminalSessions[id].loading) {
            ti.disabled = true;
            ti.placeholder = 'powershell 기동 중...';
            if (prefixEl) prefixEl.innerHTML = '<div class="terminal-loading-spinner"></div>';
        } else {
            ti.disabled = false;
            ti.placeholder = '';
            if (prefixEl) prefixEl.innerHTML = '> ';
            setTimeout(() => { if (activeSubTabId === id) ti.focus(); }, 100);
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
    // Agent Settings 초기화 및 바인딩 (Settings.json 기반)
    const _path = require('path');
    function getSettingsPath() {
        return _path.join(window.currentPath || process.cwd(), 'Settings.json');
    }
    function loadSettings() {
        try {
            const p = getSettingsPath();
            if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
        } catch(e) {}
        return {};
    }
    function saveSettings(data) {
        try { fs.writeFileSync(getSettingsPath(), JSON.stringify(data, null, 2), 'utf-8'); } catch(e) {}
    }

    window.reloadAgentSettings();

    const localSettingsBtn = document.getElementById('btn-local-settings');
    const localSettingsModal = document.getElementById('local-settings-modal');
    const closeLocalSettings = document.getElementById('close-local-settings');
    const saveLocalSettings = document.getElementById('save-local-settings');
    const chkAutoRead = document.getElementById('chk-auto-read');
    const chkHideOverlay = document.getElementById('chk-hide-overlay');

    if (localSettingsBtn && localSettingsModal) {
        localSettingsBtn.onclick = () => {
            window.reloadAgentSettings(); // 열릴 때 설정 다시 로드
            if (chkAutoRead) chkAutoRead.checked = window.autoContinueOnRead;
            if (chkHideOverlay) chkHideOverlay.checked = window.hideUIOverlay;
            localSettingsModal.style.display = 'flex';
        };
    }
    if (closeLocalSettings && localSettingsModal) {
        closeLocalSettings.onclick = () => {
            localSettingsModal.style.display = 'none';
        };
    }
    if (saveLocalSettings && localSettingsModal) {
        saveLocalSettings.onclick = () => {
            if (chkAutoRead || chkHideOverlay) {
                const current = loadSettings();
                if (chkAutoRead) current.autoContinueOnRead = chkAutoRead.checked;
                if (chkHideOverlay) current.hideUIOverlay = chkHideOverlay.checked;
                saveSettings(current);
                window.reloadAgentSettings(); // 저장 후 즉시 전역변수 최신화
            }
            localSettingsModal.style.display = 'none';
        };
    }

    const tL = document.getElementById('terminal-lower'), tI = document.getElementById('terminal-main-input'), tS = document.getElementById('terminal-content');
    setupHorizontalScroll(document.querySelector('.terminal-tabs')); setupHorizontalScroll(document.getElementById('terminal-sub-tabs'));
    if (tS && tI) tS.onmouseup = () => { if (!window.getSelection().toString()) tI.focus(); };
    if (tI) {
        tI.onkeydown = (e) => {
            if (e.key === 'Enter') {
                const cmd = tI.value.trim(); if (!cmd) return;
                terminalSessions[activeSubTabId].logs.push({ type: 'cmd', text: `> ${cmd}` }); 
                switchSubTerminal(activeSubTabId);
                
                // cd 명령어 실시간 가로채서 세션 cwd 갱신 (탐색기와 별개 작동)
                if (cmd.toLowerCase().startsWith('cd ')) {
                    let targetDir = cmd.substring(3).trim().replace(/['"]/g, '');
                    const pathModule = require('path');
                    try {
                        const curCwd = terminalSessions[activeSubTabId].cwd || window.currentPath || process.cwd();
                        let newPath = '';
                        if (pathModule.isAbsolute(targetDir)) {
                            newPath = targetDir;
                        } else {
                            newPath = pathModule.resolve(curCwd, targetDir);
                        }
                        if (fs.existsSync(newPath) && fs.statSync(newPath).isDirectory()) {
                            terminalSessions[activeSubTabId].cwd = newPath;
                            updateTerminalPrompt();
                        }
                    } catch (err) {
                        console.error(err);
                    }
                }
                
                ipcRenderer.send('execute-cmd', { 
                    tabId: activeSubTabId, 
                    command: cmd, 
                    cwd: terminalSessions[activeSubTabId].cwd || window.currentPath || process.cwd() 
                }); 
                tI.value = '';
            }
        };
    }
    ipcRenderer.removeAllListeners('cmd-output');
    ipcRenderer.on('cmd-output', (e, arg) => {
        let tId = activeSubTabId;
        let txt = '';
        if (typeof arg === 'string') {
            txt = arg;
        } else if (arg && typeof arg === 'object') {
            tId = arg.tabId || activeSubTabId;
            txt = arg.data || '';
        }
        if (tId && terminalSessions[tId]) {
            terminalSessions[tId].logs.push({ type: 'out', text: txt }); 
            if (terminalSessions[tId].loading) {
                terminalSessions[tId].loading = false;
            }
            if (tId === activeSubTabId) {
                switchSubTerminal(activeSubTabId);
            }
        }
    });

    const minTermBtn = document.getElementById('minimize-terminal');
    if (minTermBtn) {
        minTermBtn.onclick = () => {
            const im = tL.offsetHeight <= 40; tL.style.height = im ? '350px' : '35px';
            minTermBtn.innerText = im ? '▼' : '▲'; syncBrowserView();
        };
    }

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

    // --- 프로젝트 폴더 선택 버튼 ---
    const selectProjectBtn = document.getElementById('select-project-btn');
    if (selectProjectBtn) {
        selectProjectBtn.onclick = () => {
            if (window.openProjectModal) window.openProjectModal();
        };
    }

    // --- 폴더 접기/펼치기 토글 버튼 ---
    const collapseToggleBtn = document.getElementById('collapse-all-btn');
    const collapseIcon = document.getElementById('collapse-all-icon');
    const SVG_COLLAPSE = `<polyline points="7 4 12 9 17 4"></polyline><polyline points="7 20 12 15 17 20"></polyline>`;
    const SVG_EXPAND   = `<polyline points="7 9 12 4 17 9"></polyline><polyline points="7 15 12 20 17 15"></polyline>`;
    let _treeCollapsed = false;

    if (collapseToggleBtn) {
        collapseToggleBtn.onclick = () => {
            if (!_treeCollapsed) {
                // 모두 접기
                window.expandedPaths && window.expandedPaths.clear();
                _treeCollapsed = true;
                collapseToggleBtn.title = 'Expand All';
                if (collapseIcon) {
                    collapseIcon.innerHTML = SVG_EXPAND;
                    collapseIcon.classList.add('rotate-left');
                }
            } else {
                // 모두 펼치기: 현재 트리의 모든 폴더를 expanded에 추가
                document.querySelectorAll('.dir-node .file-item').forEach(el => {
                    const p = el.dataset.path;
                    if (p && window.expandedPaths) window.expandedPaths.add(p);
                });
                _treeCollapsed = false;
                collapseToggleBtn.title = 'Collapse All';
                if (collapseIcon) {
                    collapseIcon.innerHTML = SVG_COLLAPSE;
                    collapseIcon.classList.remove('rotate-left');
                }
            }
            if (window.loadDirectory) window.loadDirectory(window.currentPath || process.cwd());
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
        if (m === 'local') {
            const chatLog = document.getElementById('local-chat-messages');
            if (chatLog) chatLog.scrollTop = chatLog.scrollHeight;
            if (document.hasFocus()) { const ci = document.getElementById('local-agent-input'); if (ci) setTimeout(() => ci.focus(), 100); }
        }
    };
    if (tLA) tLA.onclick = () => swi('local'); if (tBH) tBH.onclick = () => swi('browser');

    // 로컬 챗 실시간 검색 제어기 바인딩
    const searchBtn = document.getElementById('btn-local-search');
    const searchContainer = document.getElementById('local-chat-search-container');
    const searchInput = document.getElementById('local-chat-search-input');
    const searchCount = document.getElementById('local-chat-search-count');
    const closeSearch = document.getElementById('close-local-search');
    const chatMessages = document.getElementById('local-chat-messages');

    function clearSearch() {
        if (searchInput) searchInput.value = '';
        if (searchCount) searchCount.innerText = '0 found';
        if (chatMessages) {
            const bubbles = chatMessages.querySelectorAll('.chat-bubble');
            bubbles.forEach(b => { b.style.display = 'flex'; });
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }

    function performSearch() {
        const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
        if (!chatMessages) return;
        const bubbles = chatMessages.querySelectorAll('.chat-bubble');
        let found = 0;

        bubbles.forEach(b => {
            const content = b.querySelector('.bubble-content');
            if (!content) return;
            const text = content.innerText.toLowerCase();
            if (!query || text.includes(query)) {
                b.style.display = 'flex';
                if (query) found++;
            } else {
                b.style.display = 'none';
            }
        });

        if (searchCount) {
            searchCount.innerText = query ? `${found} found` : '0 found';
        }
    }

    if (searchBtn && searchContainer && searchInput) {
        searchBtn.onclick = () => {
            const isHidden = searchContainer.style.display === 'none';
            searchContainer.style.display = isHidden ? 'flex' : 'none';
            if (isHidden) {
                searchInput.focus();
                performSearch();
            } else {
                clearSearch();
            }
        };
    }

    if (closeSearch) {
        closeSearch.onclick = () => {
            if (searchContainer) searchContainer.style.display = 'none';
            clearSearch();
        };
    }

    if (searchInput) {
        searchInput.oninput = performSearch;
        searchInput.onkeydown = (e) => {
            if (e.key === 'Escape') {
                if (searchContainer) searchContainer.style.display = 'none';
                clearSearch();
            }
        };
    }

    const saveBtn = document.getElementById('save-local-chat');
    if (saveBtn) {
        saveBtn.onclick = () => { ChatUI.appendBubble('system', '[SYSTEM] Chat snapshot save requested.'); };
    }
    const clearBtn = document.getElementById('clear-local-chat');
    if (clearBtn) {
        clearBtn.onclick = () => { 
            showConfirm("Initialize both chat history file and screen? (Irrecoverable)", () => {
                generating = false; 
                const sendBtn = document.getElementById('send-to-local'); if (sendBtn) sendBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;
                ipcRenderer.send('vault-reset-session', { logPath: GravityVault.activeLogPath }); 
                document.getElementById('local-chat-messages').innerHTML = ''; if (window.chatLog) window.chatLog = []; 
                const overlay = document.getElementById('web-process-overlay'); if (overlay) { overlay.style.display = 'none'; overlay.style.pointerEvents = 'none'; }
                const chatIn = document.getElementById('local-agent-input'); if (chatIn) { setTimeout(() => { chatIn.focus(); chatIn.click(); }, 50); }
            });
        };
    }

    window.updateSendProgress = (current, total) => {
        const textEl = document.getElementById('overlay-progress-text');
        const barEl = document.getElementById('overlay-progress-bar');
        if (textEl && barEl) {
            const pct = total > 0 ? Math.round((current / total) * 100) : 0;
            textEl.innerText = `${current} / ${total} Files processed (${pct}%)`;
            barEl.style.width = `${pct}%`;
        }
    };

    const chatIn = document.getElementById('local-agent-input');
    if (chatIn) {
        chatIn.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const sendBtn = document.getElementById('send-to-local');
                if (sendBtn) sendBtn.click();
            }
        };
    }
    const chatOverlay = document.getElementById('local-chat-overlay');
    
    if (chatOverlay && !document.getElementById('btn-send-project-info')) {
        const projBtn = document.createElement('button');
        projBtn.id = 'btn-send-project-info';
        projBtn.innerHTML = 'Send Project Info to Browser';

        projBtn.style = `
            width: 80%;
            max-width: 280px;
            height: 42px;
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
            font-size: 12.5px;
            letter-spacing: -0.01em;
            box-shadow: 0 4px 12px rgba(70, 140, 246, 0.2);
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        `;
        projBtn.onmouseenter = () => { projBtn.style.filter = 'brightness(1.1)'; projBtn.style.boxShadow = '0 4px 14px rgba(70, 140, 246, 0.3)'; };
        projBtn.onmouseleave = () => { projBtn.style.filter = 'none'; projBtn.style.boxShadow = '0 4px 12px rgba(70, 140, 246, 0.2)'; };

        projBtn.onclick = async () => {
            projBtn.style.display = 'none';
            document.getElementById('tab-browser-hub')?.click();
            
            const tree = await ipcRenderer.invoke('vault-get-tree', window.currentPath);
            const fileMatches = tree.match(/\[FILE\]/g);
            window.totalFilesCount = fileMatches ? fileMatches.length : 0;
            window.readFilesSet.clear();
            
            const webPayload = `현재 프로젝트 폴더에는 다음 파일들이 있습니다:\n${tree}\n\n[SYSTEM INSTRUCTION]\n1. 프로젝트 파악을 위해 코드를 분석하십시오. 모든 파일을 다 읽으려 하지 말고, package.json이나 핵심 엔트리 포인트(예: main.js, index.html 등)의 아키텍처를 파악하십시오.\n2. 분석할 첫 번째 핵심 소스코드를 읽으려면 반드시 다음 형식의 대괄호 명령어를 본문 답변에 정확히 써서 요청하십시오. 자연어로만 말하면 시스템이 감지하지 못합니다:\n- [CMD: read-file "파일명"]\n3. 만약 한 번에 여러 소스 파일을 동시에 읽어 분석하고 싶다면, [CMD: read-file "파일명1"] [CMD: read-file "파일명2"] 형태로 여러 개의 명령어를 나열하여 요청하십시오. 시스템이 병합하여 1턴 만에 전송해 줄 것입니다.\n\n이 지침을 숙지했다면 분석을 위해 처음 읽을 핵심 파일을 [CMD: read-file "파일명"] 형태로 즉시 답변하십시오.${CRITICAL_RULE_SUFFIX}`.trim();
            
            const enginePromise = runExperimentalEngine('/marktag', webPayload, null);
            await injectWebPayload(webPayload);
            
            // Hide overlay when execution done
            chatOverlay.style.display = 'none';
            projBtn.style.display = 'flex';
            
            if (chatIn) chatIn.focus();
            
            const response = await enginePromise;
            if (!window.autoContinueOnRead) document.getElementById('tab-local-agent')?.click();
            if (response) {
                ChatUI.appendBubble('ai', response, false, getWebIcon(document.getElementById('active-agent-webview')));
                detectAndAskCommand(response);
            }
        };

        chatOverlay.appendChild(projBtn);
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
    if (sendBtn) {
        sendBtn.onclick = () => handleSend();
    }
    
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
                    if (!window.autoContinueOnRead) document.getElementById('tab-local-agent').click();

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
                const webPayload = promptText.trim();
                window.sessionBriefed = true;

                // 1. 브라우저 탭 강제 전환 제거 (로컬 탭 고정 대화 실현)
                // if (!window.autoContinueOnRead) {
                //     document.getElementById('tab-browser-hub')?.click();
                // }

                // 2. injectWebPayload 전송 (fileCount=0 으로 유저 챗 모드 표시)
                await new Promise(r => setTimeout(r, 500));
                await injectWebPayload(webPayload, 0);

                updateProcess('extract', 90);

                // 3. 응답 완료까지 await
                const response = await runExperimentalEngine('/marktag', promptText, null);
                progBar.style.width = '100%'; await new Promise(r => setTimeout(r, 500));
                overlay.style.display = 'none'; overlay.style.pointerEvents = 'none';

                // 4. 응답 완료 후 로컬 탭 복귀 (이동하지 않았으므로 스키마 클릭 제거)
                if (response) {
                    // 백그라운드 미러링이 단독 1회 추가하므로 여기서는 수동 추가 및 명령 파싱을 생략
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
        // bubble-tools (regenerate, edit, delete) removed for clean visual flow
        const content = document.createElement('div'); content.className = 'bubble-content';
        if (typeof marked !== 'undefined') content.innerHTML = marked.parse(text).trim(); else content.innerText = text.trim();
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
        wv.addEventListener('dom-ready', () => {
            wv.executeJavaScript(`
                window.addEventListener('keydown', (e) => {
                    const key = e.key.toLowerCase();
                    if ((e.controlKey && key === 'r') || e.key === 'F5') {
                        e.preventDefault();
                        location.reload();
                    }
                }, true);
            `);
            wv.executeJavaScript(`
                (() => {
                    let lastSentText = "";
                    let stableTimer = null;
                    const checkAndSend = () => {
                        const bubbles = document.querySelectorAll('message-content, div.message-content, .markdown, .message, div[data-message-author-role="assistant"]');
                        if (bubbles.length === 0) return;
                        let lastAiBubble = null;
                        for (let i = bubbles.length - 1; i >= 0; i--) {
                            const b = bubbles[i];
                            const text = (b.innerText || b.textContent || "").trim();
                            if (text && !b.closest('rich-textarea, div[contenteditable="true"], textarea')) {
                                lastAiBubble = b;
                                break;
                            }
                        }
                        if (!lastAiBubble) return;
                        const currentText = (lastAiBubble.innerText || lastAiBubble.textContent || "").trim();
                        if (!currentText || currentText === lastSentText) return;
                        clearTimeout(stableTimer);
                        stableTimer = setTimeout(() => {
                            lastSentText = currentText;
                            const encoded = btoa(unescape(encodeURIComponent(currentText)));
                            console.log("[BACKGROUND_AI_RESP]:" + encoded);
                        }, 1200);
                    };
                    const observer = new MutationObserver(() => { checkAndSend(); });
                    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
                })();
            `);
        });

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

        let lastReceivedMirrorText = "";
        wv.addEventListener('console-message', (e) => {
            if (e.message.startsWith('[BACKGROUND_AI_RESP]:')) {
                try {
                    const base64Data = e.message.split('[BACKGROUND_AI_RESP]:')[1];
                    const decodedText = decodeURIComponent(escape(atob(base64Data))).trim();
                    if (!decodedText) return;
                    if (decodedText === lastReceivedMirrorText) return;
                    const chatHistory = document.getElementById('chat-history');
                    if (chatHistory) {
                        const existingBubbles = Array.from(chatHistory.querySelectorAll('.bubble.ai .bubble-content'));
                        const isDuplicate = existingBubbles.some(bubble => bubble.innerText.trim() === decodedText);
                        if (isDuplicate) {
                            lastReceivedMirrorText = decodedText;
                            return;
                        }
                    }
                    lastReceivedMirrorText = decodedText;
                    ChatUI.appendBubble('ai', decodedText, false, getWebIcon(wv));
                    detectAndAskCommand(decodedText);
                } catch (err) {
                    console.error("[ERROR] Background mirror parsing error:", err);
                }
            }
        });

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
1. 아직 전체 프로젝트가 파악되지 않았다면, 읽은 파일에 대해 설명하지 말고 빠르게 다음 탐색할 [CMD: ...] 명령어만 단답형으로 제출하십시오.
2. 파일의 구조나 함수 목록만 파악할 때는 [CMD: read-file "파일명"] 을 사용하십시오.
3. 세부 로직을 정밀 분석/수정할 때는 [CMD: read-file-full "파일명"] 을 사용하십시오. (단, 한 턴에 최대 200줄 제한으로 잘려서 전송됩니다.)
4. 특정 라인 범위(최대 200줄 한도)만 지정해서 읽고 싶다면 [CMD: read-file-range "파일명" 시작줄-끝줄] (예: [CMD: read-file-range "main.js" 1-200] 또는 [CMD: read-file-range "main.js" 201-400]) 을 적극적으로 사용하십시오.
5. 파일 탐색 및 파악이 최종적으로 완료되었다면 자의적인 향후 작업 계획 수립이나 임의의 대안 작성을 일절 중단하십시오. 오직 파악된 현재 프로젝트 구조 및 핵심 기능에 대해서만 간결히 설명한 후, 유저의 구체적인 지시(Wait for user instructions)를 대기하십시오.`;

async function injectWebPayload(webPayload, fileCount = 0, currentFileIndex = 0, isAppend = false, clickSend = true) {
    const savedKeywords = (await ipcRenderer.invoke('vault-read-global', 'discovery_keywords.txt')) || 'message, ask, prompt, type, question, conversation, input, chat, command, send, help you today, search, write, say';
    const inKeywords = savedKeywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k);

    return new Promise((resolve, reject) => {
        const wv = document.getElementById('active-agent-webview'); if (!wv) return reject("Webview not found");
        const cleanPayload = webPayload.trim();
        const base64Payload = Buffer.from(cleanPayload, 'utf-8').toString('base64');
        const totalLines = cleanPayload.split('\n').length; // 전체 라인수 산출

        // 1단계: 토스트 UI 켜기 및 진행바를 테마색으로 설정
        const toast = document.getElementById('injection-toast');
        const projLbl = document.getElementById('project-pct-label');
        const projBar = document.getElementById('toast-project-progress-bar');
        const injLbl = document.getElementById('inject-pct-label');
        const injBar = document.getElementById('toast-inject-progress-bar');
        
        if (toast) {
            toast.style.display = window.hideUIOverlay ? 'none' : 'flex';
            toast.style.background = 'transparent';
            toast.style.border = 'none';
            
            const injectContainer = document.getElementById('toast-inject-container');
            if (injectContainer) {
                if (fileCount === -1 || fileCount > 0) {
                    injectContainer.style.display = 'flex';
                } else {
                    injectContainer.style.display = 'none';
                }
            }
            
            if (projLbl) {
                if (fileCount === -1) {
                    const readCount = window.readFilesSet.size;
                    const projectPct = window.totalFilesCount ? Math.min(100, Math.floor((readCount / window.totalFilesCount) * 100)) : 0;
                    projLbl.innerHTML = `Project Context: <span style="color: var(--primary); font-weight: bold;">${projectPct}% (${readCount}/${window.totalFilesCount})</span>`;
                } else if (fileCount === 0) {
                    projLbl.innerHTML = `System Status: <span style="color: var(--primary); font-weight: bold;">Sending message...</span>`;
                } else {
                    projLbl.innerHTML = `Reading files: <span style="color: var(--primary); font-weight: bold;">${currentFileIndex}/${fileCount}</span>`;
                }
            }
            if (projBar) {
                if (fileCount === -1) {
                    const readCount = window.readFilesSet.size;
                    const projectPct = window.totalFilesCount ? Math.min(100, Math.floor((readCount / window.totalFilesCount) * 100)) : 0;
                    projBar.style.width = `${projectPct}%`;
                } else if (fileCount === 0) {
                    projBar.style.width = "100%";
                } else {
                    const filePct = Math.floor((currentFileIndex / fileCount) * 100);
                    projBar.style.width = `${filePct}%`;
                }
            }
            
            if (injLbl) injLbl.innerHTML = `Injecting: <span style="color: var(--primary); font-weight: bold;">0% (0/${totalLines})</span>`;
            if (injBar) injBar.style.width = "0%";
        }

        // 2단계: 웹뷰 콘솔 리스너 장착 (진행률 실시간 고속 수신용)
        const onConsole = (e) => {
            if (e.message.startsWith('[INJECT_PCT]:')) {
                const parts = e.message.split(':')[1].split(',');
                const pct = parseInt(parts[0]);
                const curLines = parseInt(parts[1] || '0');
                const totLines = parseInt(parts[2] || '0');
                
                if (projLbl && projBar) {
                    if (fileCount === -1) {
                        const readCount = window.readFilesSet.size;
                        const projectPct = window.totalFilesCount ? Math.min(100, Math.floor((readCount / window.totalFilesCount) * 100)) : 0;
                        projLbl.innerHTML = `Project Context: <span style="color: var(--primary); font-weight: bold;">${projectPct}% (${readCount}/${window.totalFilesCount})</span> (Injecting ${pct}%)`;
                        projBar.style.width = `${projectPct}%`;
                    } else if (fileCount === 0) {
                        projLbl.innerHTML = `System Status: <span style="color: var(--primary); font-weight: bold;">Sending message...</span>`;
                        projBar.style.width = "100%";
                    } else {
                        projLbl.innerHTML = `Reading files: <span style="color: var(--primary); font-weight: bold;">${currentFileIndex}/${fileCount}</span>`;
                        const filePct = Math.floor((currentFileIndex / fileCount) * 100);
                        projBar.style.width = `${filePct}%`;
                    }
                }
                
                if (injLbl && injBar) {
                    if (pct === 100) {
                        injLbl.innerHTML = `Injecting: <span style="color: var(--primary); font-weight: bold;">100% (${totLines}/${totLines})</span>`;
                        injBar.style.width = "100%";
                    } else {
                        injLbl.innerHTML = `Injecting: <span style="color: var(--primary); font-weight: bold;">${pct}% (${curLines}/${totLines})</span>`;
                        injBar.style.width = `${pct}%`;
                    }
                }
            }
        };
        wv.addEventListener('console-message', onConsole);

        const cleanup = () => {
            wv.removeEventListener('console-message', onConsole);
            if (toast && !window.autoContinueOnRead) toast.style.display = 'none';
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
                
                if (!${isAppend}) {
                    if (inputEl.tagName === 'TEXTAREA' || inputEl.tagName === 'INPUT') {
                        inputEl.value = '';
                    } else {
                        inputEl.innerText = '';
                    }
                } else {
                    if (inputEl.tagName === 'TEXTAREA' || inputEl.tagName === 'INPUT') {
                        inputEl.selectionStart = inputEl.selectionEnd = inputEl.value.length;
                    } else {
                        const range = document.createRange();
                        range.selectNodeContents(inputEl);
                        range.collapse(false);
                        const selection = window.getSelection();
                        if (selection) {
                            selection.removeAllRanges();
                            selection.addRange(range);
                        }
                    }
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
                
                // 메시지 라인 분할 및 30라인 단위의 고속 청크 쪼개기 (React 버퍼 오버헤드 차단)
                const lines = decodedPayload.split('\\n');
                const chunkSize = 30;
                const chunks = [];
                for (let idx = 0; idx < lines.length; idx += chunkSize) {
                    chunks.push(lines.slice(idx, idx + chunkSize).join('\\n') + (idx + chunkSize < lines.length ? '\\n' : ''));
                }

                let currentLine = 0;
                for (let idx = 0; idx < chunks.length; idx++) {
                    const chunk = chunks[idx];
                    document.execCommand('insertText', false, chunk);
                    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    const chunkLines = chunk.split('\\n').length - 1;
                    currentLine += chunkLines;
                    const pct = Math.floor(((idx + 1) / chunks.length) * 100);
                    console.log("[INJECT_PCT]:" + pct + "," + currentLine + ",${totalLines}");
                    
                    // 15ms 미세 딜레이를 주어 브라우저가 버퍼를 렌더링하고 렌더러가 실시간 게이지를 갱신할 틈을 줌
                    await new Promise(r => setTimeout(r, 15));
                }
                
                if (!${clickSend}) {
                    return "SUCCESS";
                }

                // 주입 후 짧은 텀을 주고 엔터 전송 및 전송 버튼 강제 클릭 시도
                await new Promise(r => setTimeout(r, 150));
                
                const findSendBtn = () => {
                    const btns = Array.from(document.querySelectorAll('button, div[role="button"], span[role="button"]'));
                    for (let el of btns) {
                        const label = (el.getAttribute('aria-label') || el.title || el.innerText || '').toLowerCase();
                        if (label.includes('전송') || label.includes('send') || label.includes('submit')) return el;
                    }
                    // 날개 비행기 SVG 아이콘을 품은 버튼 후보 탐색
                    const svgBtns = Array.from(document.querySelectorAll('button'));
                    for (let el of svgBtns) {
                        if (el.querySelector('svg')) {
                            const html = el.innerHTML.toLowerCase();
                            if (html.includes('send') || html.includes('paper-plane') || html.includes('arrow') || html.includes('submit')) return el;
                        }
                    }
                    return null;
                };

                const sendBtn = findSendBtn();
                if (sendBtn) {
                    sendBtn.click();
                } else {
                    const enterDown = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13 });
                    inputEl.dispatchEvent(enterDown);
                    const enterPress = new KeyboardEvent('keypress', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13 });
                    inputEl.dispatchEvent(enterPress);
                    const enterUp = new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13 });
                    inputEl.dispatchEvent(enterUp);
                }
                
                // 발송 성공 검증부 (입력창 텍스트가 완전히 비워지거나 정지 버튼이 생길 때까지 최대 3.5초 폴링 대기)
                let isDispatched = false;
                for (let i = 0; i < 35; i++) {
                    const currentVal = (inputEl.tagName === 'TEXTAREA' || inputEl.tagName === 'INPUT') ? inputEl.value : inputEl.innerText;
                    const hasStopBtn = Array.from(document.querySelectorAll('button, div[role="button"]')).some(el => {
                        const lbl = (el.getAttribute('aria-label') || el.title || el.innerText || '').toLowerCase();
                        return lbl.includes('중단') || lbl.includes('stop') || lbl.includes('cancel');
                    });
                    if (!currentVal.trim() || hasStopBtn) {
                        isDispatched = true;
                        break;
                    }
                    if (i === 10 || i === 20) {
                        if (sendBtn) sendBtn.click();
                    }
                    await new Promise(r => setTimeout(r, 100));
                }
                if (!isDispatched) return "SEND_TIMEOUT";
                
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

            if (injLbl) injLbl.innerHTML = `Injecting: <span style="color: var(--primary); font-weight: bold;">100% (${totalLines}/${totalLines})</span>`;
            if (injBar) injBar.style.width = "100%";

            if (clickSend) {
                // 전송 처리 확인 대기 및 종료
                await new Promise(r => setTimeout(r, 1500));
            }
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

    if (foundCmds.length === 0) {
        if (window.autoContinueOnRead) {
            // 더 이상 명령어 없음 = 최종 완료 → 토스트 닫고 로컬 복귀
            const toast = document.getElementById('injection-toast');
            if (toast) toast.style.display = 'none';
            document.getElementById('tab-local-agent')?.click();
        }
        return;
    }

    // 1. read-file 명령어 추출 및 분리
    const readCmds = [];
    const otherCmds = [];

    foundCmds.forEach(cmd => {
        const fileMatch = cmd.match(/^read-file\s+["']?([^"']+)["']?$/i);
        const fileFullMatch = cmd.match(/^read-file-full\s+["']?([^"']+)["']?$/i);
        const rangeMatch = cmd.match(/^read-file-range\s+["']?([^"']+)["']?\s+(\d+)-(\d+)$/i);
        if (rangeMatch) {
            const filePath = rangeMatch[1].trim();
            readCmds.push({ path: filePath, full: false, range: true, start: parseInt(rangeMatch[2]), end: parseInt(rangeMatch[3]) });
        } else if (fileFullMatch) {
            const filePath = fileFullMatch[1].trim();
            readCmds.push({ path: filePath, full: true });
        } else if (fileMatch) {
            const filePath = fileMatch[1].trim();
            readCmds.push({ path: filePath, full: false });
        } else {
            otherCmds.push(cmd);
        }
    });

    const hasReadFile = (readCmds.length > 0);

    // autoContinueOnRead 켜져있고 read-file 없으면 복귀
    if (!hasReadFile && window.autoContinueOnRead) {
        const toast = document.getElementById('injection-toast');
        if (toast) toast.style.display = 'none';
        document.getElementById('tab-local-agent')?.click();
    }

    // 2. 파일 읽기 명령어 병합 제안 생성
    if (hasReadFile) {
        const displayCmd = readCmds.map(f => {
            if (f.range) return `read-file-range "${f.path}" ${f.start}-${f.end}`;
            return `${f.full ? 'read-file-full' : 'read-file'} "${f.path}"`;
        }).join(', ');
        
        const box = ChatUI.appendBubble('system', '');
        const content = box.querySelector('.bubble-content');
        const themeColor = "#468CF6"; 
        const glowShadow = "rgba(70, 140, 246, 0.15)";

        content.innerHTML = `
            <div style="background: var(--surface-low); padding: 12px 14px; border-radius: 8px; border: 1px solid var(--border-color); font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--text-main); margin-bottom: 12px; line-height: 1.5; word-break: break-all; box-shadow: inset 0 2px 4px rgba(0,0,0,0.15); margin-top: 4px;">
                <span style="color: var(--text-muted); font-weight: bold; margin-right: 6px;">📄</span>${displayCmd}
            </div>
            <div style="display: flex; gap: 8px;">
                <button class="cmd-run-btn" style="flex: 1; background: linear-gradient(135deg, ${themeColor}, ${themeColor}dd); color: white; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 700; font-size: 11.5px; letter-spacing: 0.04em; font-family: 'DM Sans', 'Outfit', sans-serif; transition: all 0.2s; box-shadow: 0 2px 6px ${glowShadow};">CONTINUE</button>
                <button class="cmd-cancel-btn" style="flex: 1; background: rgba(255, 255, 255, 0.04); color: var(--text-muted); border: 1px solid var(--border-color); padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 11.5px; letter-spacing: 0.04em; font-family: 'DM Sans', 'Outfit', sans-serif; transition: all 0.2s;">CANCEL</button>
            </div>
        `;

        const runBtn = content.querySelector('.cmd-run-btn');
        const cancelBtn = content.querySelector('.cmd-cancel-btn');
        if (runBtn) {
            runBtn.onmouseenter = () => { runBtn.style.filter = "brightness(1.15)"; runBtn.style.boxShadow = "0 4px 12px rgba(70, 140, 246, 0.3)"; };
            runBtn.onmouseleave = () => { runBtn.style.filter = "none"; runBtn.style.boxShadow = `0 2px 6px ${glowShadow}`; };
        }
        if (cancelBtn) {
            cancelBtn.onmouseenter = () => { cancelBtn.style.background = "rgba(255, 255, 255, 0.08)"; cancelBtn.style.color = "var(--text-main)"; cancelBtn.style.borderColor = "rgba(255,255,255,0.15)"; };
            cancelBtn.onmouseleave = () => { cancelBtn.style.background = "rgba(255, 255, 255, 0.04)"; cancelBtn.style.color = "var(--text-muted)"; cancelBtn.style.borderColor = "var(--border-color)"; };
        }

        if (window.autoContinueOnRead) {
            setTimeout(() => {
                const btn = content.querySelector('.cmd-run-btn');
                if (btn) {
                    ChatUI.appendBubble('system', `[SYSTEM] Auto-continuing batch read for ${readCmds.length} files...`);
                    btn.click();
                }
            }, 800);
        }

        content.querySelector('.cmd-run-btn').onclick = async () => {
            box.remove();
            
            try {
                const fs = require('fs');
                const path = require('path');

                // auto-continue 아닐 때만 chatOverlay 수동 표시
                const chatOverlay = document.getElementById('local-chat-overlay');
                const progressBox = document.getElementById('overlay-progress-box');
                const projBtn = document.getElementById('btn-send-project-info');
                if (!window.autoContinueOnRead && chatOverlay && progressBox && projBtn) {
                    chatOverlay.style.display = 'flex';
                    projBtn.style.display = 'none';
                    progressBox.style.display = 'flex';
                }

                window.currentBatchFileCount = readCmds.length;

                if (!window.autoContinueOnRead) document.getElementById('tab-browser-hub')?.click();

                // 파일 개별적으로 주입하고, 마지막 파일에서만 전송을 진행하도록 구현
                for (let i = 0; i < readCmds.length; i++) {
                    const fileObj = readCmds[i];
                    const filePath = fileObj.path;
                    window.readFilesSet.add(filePath);
                    
                    let fileContentPayload = "";
                    const targetPath = path.resolve(window.currentPath, filePath);
                    if (fs.existsSync(targetPath)) {
                        const rawContent = fs.readFileSync(targetPath, 'utf-8');
                        const allLines = rawContent.replace(/\r/g, '').split('\n');
                        
                        if (fileObj.range) {
                            let startIdx = Math.max(0, fileObj.start - 1);
                            let endIdx = Math.min(allLines.length, fileObj.end);
                            let isTruncated = false;
                            
                            if (endIdx - startIdx > 200) {
                                endIdx = startIdx + 200;
                                isTruncated = true;
                            }
                            
                            let slicedContent = allLines.slice(startIdx, endIdx).join('\n');
                            if (isTruncated) {
                                const nextStart = endIdx + 1;
                                const nextEnd = nextStart + 199;
                                slicedContent += `\n// ... [TRUNCATED: Max 200 lines limit per turn reached. If you need to read the next part, please output [CMD: read-file-range "${filePath}" ${nextStart}-${nextEnd}]]`;
                            }
                            fileContentPayload = `[FILE DATA (LINE RANGE ${fileObj.start}-${fileObj.start + (endIdx - startIdx) - 1}): ${filePath}]\n\`\`\`\n${slicedContent}\n\`\`\`\n\n`;
                        } else if (fileObj.full) {
                            let endIdx = allLines.length;
                            let isTruncated = false;
                            
                            if (endIdx > 200) {
                                endIdx = 200;
                                isTruncated = true;
                            }
                            
                            let slicedContent = allLines.slice(0, endIdx).join('\n');
                            if (isTruncated) {
                                slicedContent += `\n// ... [TRUNCATED: Max 200 lines limit per turn reached. If you need to read the next part, please output [CMD: read-file-range "${filePath}" 201-400]]`;
                            }
                            fileContentPayload = `[FILE DATA (${isTruncated ? 'PARTIAL CONTENT' : 'FULL CONTENT'}): ${filePath}]\n\`\`\`\n${slicedContent}\n\`\`\`\n\n`;
                        } else {
                            const ext = filePath.split('.').pop().toLowerCase();
                            const fileContent = extractCodeOutline(rawContent, ext);
                            fileContentPayload = `[FILE DATA (OUTLINE ONLY): ${filePath}]\n\`\`\`\n${fileContent}\n\`\`\`\n\n`;
                        }
                    } else {
                        fileContentPayload = `[FILE DATA ERROR: ${filePath} not found on the local machine]\n\n`;
                    }

                    const isLastFile = (i === readCmds.length - 1);
                    if (isLastFile) {
                        fileContentPayload += "Proceed to analyze the files above.";
                    }

                    // 개별 파일 주입 (마지막 파일에서만 전송을 진행)
                    await injectWebPayload(fileContentPayload, readCmds.length, i + 1, (i > 0), isLastFile);
                    ChatUI.appendBubble('system', `[SYSTEM] (${i + 1}/${readCmds.length}) Sent ${filePath} to Web AI.`);
                    
                    if (typeof window.updateSendProgress === 'function') {
                        window.updateSendProgress(window.readFilesSet.size, window.totalFilesCount);
                    }
                }

                // 묶음의 마지막 파일 전송 클릭 후 감시 엔진 시작
                const finalDummyMessage = "Proceed to analyze the files above.";
                const response = await runExperimentalEngine('/marktag', finalDummyMessage, null);
                if (!window.autoContinueOnRead) {
                    document.getElementById('tab-local-agent')?.click();
                }

                // auto-continue 아닐 때만 chatOverlay 숨기기
                if (!window.autoContinueOnRead && chatOverlay && progressBox && projBtn) {
                    chatOverlay.style.display = 'none';
                    progressBox.style.display = 'none';
                    projBtn.style.display = 'flex';
                }

                if (response) {
                    // 백그라운드 미러링이 단독 1회 추가하므로 여기서는 수동 추가 및 명령 파싱을 생략
                }
            } catch (err) {
                ChatUI.appendBubble('system', `[ERROR] Failed to read files batch: ${err.message}`);
            }
        };

        content.querySelector('.cmd-cancel-btn').onclick = () => box.remove();
    }

    // 3. 파일 읽기 외의 일반 명령어들 제안 생성
    otherCmds.forEach(cleanCmd => {
        const box = ChatUI.appendBubble('system', '');
        const content = box.querySelector('.bubble-content');
        const themeColor = "#468CF6"; 
        const glowShadow = "rgba(70, 140, 246, 0.15)";

        content.innerHTML = `
            <div style="background: var(--surface-low); padding: 12px 14px; border-radius: 8px; border: 1px solid var(--border-color); font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--text-main); margin-bottom: 12px; line-height: 1.5; word-break: break-all; box-shadow: inset 0 2px 4px rgba(0,0,0,0.15); margin-top: 4px;">
                <span style="color: var(--text-muted); font-weight: bold; margin-right: 6px;">$</span>${cleanCmd}
            </div>
            <div style="display: flex; gap: 8px;">
                <button class="cmd-run-btn" style="flex: 1; background: linear-gradient(135deg, ${themeColor}, ${themeColor}dd); color: white; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 700; font-size: 11.5px; letter-spacing: 0.04em; font-family: 'DM Sans', 'Outfit', sans-serif; transition: all 0.2s; box-shadow: 0 2px 6px ${glowShadow};">CONTINUE</button>
                <button class="cmd-cancel-btn" style="flex: 1; background: rgba(255, 255, 255, 0.04); color: var(--text-muted); border: 1px solid var(--border-color); padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 11.5px; letter-spacing: 0.04em; font-family: 'DM Sans', 'Outfit', sans-serif; transition: all 0.2s;">CANCEL</button>
            </div>
        `;

        const runBtn = content.querySelector('.cmd-run-btn');
        const cancelBtn = content.querySelector('.cmd-cancel-btn');
        if (runBtn) {
            runBtn.onmouseenter = () => { runBtn.style.filter = "brightness(1.15)"; runBtn.style.boxShadow = "0 4px 12px rgba(70, 140, 246, 0.3)"; };
            runBtn.onmouseleave = () => { runBtn.style.filter = "none"; runBtn.style.boxShadow = `0 2px 6px ${glowShadow}`; };
        }
        if (cancelBtn) {
            cancelBtn.onmouseenter = () => { cancelBtn.style.background = "rgba(255, 255, 255, 0.08)"; cancelBtn.style.color = "var(--text-main)"; cancelBtn.style.borderColor = "rgba(255,255,255,0.15)"; };
            cancelBtn.onmouseleave = () => { cancelBtn.style.background = "rgba(255, 255, 255, 0.04)"; cancelBtn.style.color = "var(--text-muted)"; cancelBtn.style.borderColor = "var(--border-color)"; };
        }

        content.querySelector('.cmd-run-btn').onclick = async () => {
            box.remove();
            
            if (window.activeSubTabId && window.terminalSessions[window.activeSubTabId]) {
                window.terminalSessions[window.activeSubTabId].logs.push({ type: 'cmd', text: `> ${cleanCmd}` });
                window.switchSubTerminal(window.activeSubTabId);
                
                if (cleanCmd.toLowerCase().startsWith('cd ')) {
                    let targetDir = cleanCmd.substring(3).trim().replace(/['"]/g, '');
                    const pathModule = require('path');
                    try {
                        const curCwd = window.terminalSessions[window.activeSubTabId].cwd || window.currentPath || process.cwd();
                        let newPath = '';
                        if (pathModule.isAbsolute(targetDir)) {
                            newPath = targetDir;
                        } else {
                            newPath = pathModule.resolve(curCwd, targetDir);
                        }
                        if (fs.existsSync(newPath) && fs.statSync(newPath).isDirectory()) {
                            window.terminalSessions[window.activeSubTabId].cwd = newPath;
                            if (typeof updateTerminalPrompt === 'function') updateTerminalPrompt();
                        }
                    } catch (err) {
                        console.error(err);
                    }
                }

                ipcRenderer.send('execute-cmd', { 
                    tabId: window.activeSubTabId, 
                    command: cleanCmd, 
                    cwd: window.terminalSessions[window.activeSubTabId].cwd || window.currentPath || process.cwd() 
                });
                
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
            
            try {
                const enginePromise = runExperimentalEngine('/marktag', payload, null);
                await injectWebPayload(payload);
                const response = await enginePromise;
                if (!window.autoContinueOnRead) {
                    document.getElementById('tab-local-agent')?.click();
                }
                if (response) {
                    ChatUI.appendBubble('ai', response, false, getWebIcon(document.getElementById('active-agent-webview')));
                    detectAndAskCommand(response);
                }
            } catch (e) {
                ChatUI.appendBubble('ai', `[ERROR] Command failed: ${e.message}`);
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

        const toast = document.getElementById('injection-toast');
        const projLbl = document.getElementById('project-pct-label');
        const injLbl = document.getElementById('inject-pct-label');
        const projBar = document.getElementById('toast-project-progress-bar');
        const injBar = document.getElementById('toast-inject-progress-bar');
        const webBar = document.getElementById('web-extract-progress-bar');

        if (toast) {
            toast.style.display = 'flex';
            if (projLbl) projLbl.innerHTML = `Manual Injection: <span style="color:var(--primary); font-weight:bold;">Copy Mode Active</span>`;
            if (injLbl) injLbl.innerHTML = `Waiting for manual copy (8s)...`;
            if (projBar) projBar.style.width = '100%';
            if (injBar) injBar.style.width = '0%';
        }
        if (webBar) { webBar.style.width = '100%'; webBar.style.background = 'var(--primary)'; webBar.style.transition = 'width 0.5s linear'; }

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
        const toast = document.getElementById('injection-toast');
        const projLbl = document.getElementById('project-pct-label');
        const injLbl = document.getElementById('inject-pct-label');
        const projBar = document.getElementById('toast-project-progress-bar');
        const injBar = document.getElementById('toast-inject-progress-bar');

        if (toast) {
            toast.style.display = 'flex';
            if (projLbl) projLbl.innerHTML = `⚠️ <span style="color:var(--primary); font-weight:bold;">No Agent Selected</span>`;
            if (injLbl) injLbl.innerHTML = `Please select an AI agent from the Browser tab first.`;
            if (projBar) projBar.style.width = '0%';
            if (injBar) injBar.style.width = '0%';
            
            setTimeout(() => { 
                toast.style.display = 'none'; 
            }, 4000);
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
        const toast = document.getElementById('injection-toast');
        const injLbl = document.getElementById('inject-pct-label');
        const injBar = document.getElementById('toast-inject-progress-bar');
        
        if (toast && !manualAbort) {
            toast.style.display = window.hideUIOverlay ? 'none' : 'flex';
            if (injLbl) {
                let prefix = "System Status";
                if (text.includes('typing') || text.includes('responding') || text.includes('complete')) {
                    prefix = "AI Status";
                }
                injLbl.innerHTML = `${prefix}: <span style="color: var(--primary); font-weight: bold;">${text}</span>`;
            }
            if (injBar) {
                if (text.includes('complete') || text.includes('Fetching')) {
                    injBar.style.width = '100%';
                    injBar.style.background = 'var(--primary)';
                } else if (text.includes('typing')) {
                    const charCount = parseInt(text.match(/\d+/) || '0');
                    const simulatedProgress = Math.min(90, 30 + Math.floor(charCount / 20));
                    injBar.style.width = `${simulatedProgress}%`;
                    injBar.style.background = 'var(--primary)';
                } else {
                    injBar.style.width = '15%';
                    injBar.style.background = '#333';
                }
            }
        }

        if (webBar) {
            const p = isStableMode ? progress : stableN;
            if (p > 0) { webBar.style.width = `${Math.max(0, 100 - (p / 8) * 100)}%`; webBar.style.background = 'var(--primary)'; } 
            else if (p < 0) { webBar.style.width = `${Math.max(0, 100 - ((p + currentExtension) / (currentExtension + 8)) * 100)}%`; webBar.style.background = 'var(--primary)'; } 
            else { webBar.style.width = '100%'; webBar.style.background = 'var(--primary)'; }
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

    const hideGlobalUI = () => {
        if (!window.autoContinueOnRead) {
            const toast = document.getElementById('injection-toast');
            if (toast) toast.style.display = 'none';
        }
        if (webBarCont) webBarCont.style.display = 'none';
    };
    // [🛠️ 보완: 대기 시작 시점의 기존 텍스트 및 노드 개수 저장]
    const initialText = cleanGarbage(await wv.executeJavaScript(extractScript).catch(() => ""));
    const getNodeCountScript = `(() => {
        const selectors = ['model-response .markdown', 'message-content .markdown-prose', '[data-testid="message-content"]', '.response-content'];
        for (let sel of selectors) {
            const nodes = document.querySelectorAll(sel);
            if (nodes.length > 0) return nodes.length;
        }
        return 0;
    })()`;
    const initialNodeCount = await wv.executeJavaScript(getNodeCountScript).catch(() => 0);
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

        // [🛠️ 보완: 이전 답변 내용 및 대화 턴(노드 개수) 검증 필터링]
        const currentNodeCount = await wv.executeJavaScript(getNodeCountScript).catch(() => 0);
        if (currentNodeCount <= initialNodeCount && delta === initialText) {
            delta = ""; // 아직 새 노드가 생성되지 않았고 텍스트가 이전 답변과 동일함
        } else if (currentNodeCount > initialNodeCount) {
            // 새 노드가 생성된 상태이므로 자유롭게 답변 수집
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

            // 텍스트 변화가 2번(약 2초) 이상 멈췄다면 선택지가 떴든 말든 강제로 완료 처리
            if (stableCount >= 2) {
                updateUI("Generation complete! Fetching...", 100); 
                hideGlobalUI(); 
                return cleanGarbage(delta);
            } else {
                updateUI(`AI is typing... (${delta.length} chars)`, 50, false);
            }
        } else {
            updateUI("Waiting for AI to start...", 0, false);
            if (i >= 15) {
                hideGlobalUI();
                ChatUI.appendBubble('system', '[SYSTEM] Web AI response start timeout (15s). Releasing lock.');
                return null;
            }
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


// ====== PROJECT PICKER MODAL LOGIC ======
window.projectRoot = null;

async function openProjectModal() {
    const modal = document.getElementById('project-picker-modal');
    if (!modal) return;
    modal.style.display = 'flex';

  // 최근 프로젝트 로드
    const recents = await ipcRenderer.invoke('get-recent-projects');
    const list = document.getElementById('recent-projects-list');
    if (!list) return;

    if (!recents || recents.length === 0) {
        list.innerHTML = `<div style="font-size:12px; color:#777; padding:10px 0; font-family:'JetBrains Mono',monospace; text-align:center;">No recent projects</div>`;
    } else {
        list.innerHTML = recents.map((p, i) => {
            const name = p.split(/[\\/]/).pop() || p;
            const short = p.length > 48 ? '...' + p.slice(-45) : p;
            
            // ▼ onclick 부분을 this.getAttribute('data-path') 로 깔끔하게 변경했습니다.
            return `<div data-path="${p}" class="recent-project-item" onclick="window.selectProject(this.getAttribute('data-path'))" 
                style="display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:8px; cursor:pointer; border:1px solid transparent; transition:all 0.15s; background:transparent;"
                onmouseover="this.style.background='#1a1a1f'; this.style.borderColor='#333';"
                onmouseout="this.style.background='transparent'; this.style.borderColor='transparent';">
                <div style="min-width:0;">
                    <div style="font-size:13px; font-weight:600; color:#ddd; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${name}</div>
                    <div style="font-size:10px; color:#777; font-family:'JetBrains Mono',monospace; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:2px;">${short}</div>
                </div>
            </div>`;
        }).join('');
    }

    // Browse 버튼
    const browseBtn = document.getElementById('picker-browse-btn');
    if (browseBtn) {
        browseBtn.onclick = async () => {
            const selected = await ipcRenderer.invoke('select-folder-dialog');
            if (selected) window.selectProject(selected);
        };
    }

    // 브라우저 탭 영역 드래그 앤 드롭 파일 첨부 연동
    const hub = document.getElementById('inspector-browser-hub');
    if (hub) {
        hub.ondragover = (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        };
        hub.ondrop = async (e) => {
            e.preventDefault();
            
            let filePath = '';
            
            // 1. 내부 드래그 (Tree View 파일 드래그)
            const internalPath = e.dataTransfer.getData('text/plain');
            if (internalPath) {
                filePath = internalPath;
            } 
            // 2. 외부 드래그 (탐색기 파일 드래그)
            else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const fs = require('fs');
                const path = require('path');
                const file = e.dataTransfer.files[0];
                const absolutePath = file.path;
                if (window.currentPath) {
                    filePath = path.relative(window.currentPath, absolutePath);
                } else {
                    filePath = path.basename(absolutePath);
                }
            }

            if (!filePath) return;

            try {
                const fs = require('fs');
                const path = require('path');
                const targetPath = path.resolve(window.currentPath || process.cwd(), filePath);
                
                if (fs.existsSync(targetPath)) {
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
                    const fileContent = extractCodeOutline(rawContent, ext);
                    const finalMessage = `[FILE DATA (OUTLINE ONLY): ${filePath}]\n\`\`\`\n${fileContent}\n\`\`\`\n\nProceed to analyze this file.`;

                    ChatUI.appendBubble('system', `[SYSTEM] Drag & Drop: Injecting ${filePath} content outline to Web AI...`);

                    // 1단계: 주입 완료 후 발송 처리
                    await injectWebPayload(finalMessage, 1);
                    
                    // 2단계: 주입 완결 직후 감시 엔진 구동
                    const response = await runExperimentalEngine('/marktag', finalMessage, null);
                    
                    if (chatOverlay && progressBox && projBtn) {
                        chatOverlay.style.display = 'none';
                        progressBox.style.display = 'none';
                        projBtn.style.display = 'flex';
                    }

                    if (response) {
                        // 백그라운드 미러링이 단독 1회 추가하므로 여기서는 수동 추가 및 명령 파싱을 생략
                    }
                } else {
                    ChatUI.appendBubble('system', `[ERROR] Drag & Drop failed: File not found: ${filePath}`);
                }
            } catch (err) {
                ChatUI.appendBubble('system', `[ERROR] Drag & Drop parse failed: ${err.message}`);
            }
        };
    }
}

window.selectProject = async (folderPath) => {
    if (!folderPath) return;
    window.projectRoot = folderPath;
    window.currentPath = folderPath;
    ipcRenderer.send('save-recent-project', folderPath);
    window.reloadAgentSettings();

    // 모달 닫기
    const modal = document.getElementById('project-picker-modal');
    if (modal) modal.style.display = 'none';

    // 파일 트리 로드
    await window.loadDirectory(folderPath);

};

window.openProjectModal = openProjectModal;
// ====== END PROJECT PICKER MODAL LOGIC ======

document.addEventListener('DOMContentLoaded', async () => {

    await migrateToVault(); 
    setupUI(); 
    addSubTerminal(true);

    // 시작 시 프로젝트 선택 모달 표시
    openProjectModal();
    
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

    ipcRenderer.on('trigger-app-reload', () => {
        const browserTab = document.getElementById('inspector-browser-hub');
        const wv = document.getElementById('active-agent-webview');
        if (browserTab && browserTab.style.display === 'flex' && wv) {
            wv.reload();
            ChatUI.appendBubble('system', '[SYSTEM] Browser Webview refreshed.');
        } else {
            location.reload();
        }
    });

    // 20x20 좌측 상단 비상 탈출 터치존 이벤트 결합
    const bailoutZone = document.getElementById('toast-bailout-zone');
    if (bailoutZone) {
        bailoutZone.onclick = (e) => {
            e.stopPropagation();
            const toast = document.getElementById('injection-toast');
            if (toast) toast.style.display = 'none';
            const chatOverlay = document.getElementById('local-chat-overlay');
            if (chatOverlay) chatOverlay.style.display = 'none';
            ChatUI.appendBubble('system', '[SYSTEM] Emergency bailout: Force closed loading overlays.');
        };
    }

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
            
            const parent = popoverWin.parentElement;
            const parentWidth = parent ? parent.clientWidth : window.innerWidth;
            const parentHeight = parent ? parent.clientHeight : window.innerHeight;
            const maxWidth = parentWidth - 30; // left 15px + margin 15px
            const maxHeight = parentHeight - 73; // bottom 58px + margin 15px
            
            const mv = (m) => {
                if (dir === 'r' || dir === 'tr') {
                    const nw = sw + (m.clientX - sx);
                    popoverWin.style.width = `${Math.max(350, Math.min(maxWidth, nw))}px`;
                }
                if (dir === 't' || dir === 'tr') {
                    const nh = sh - (m.clientY - sy);
                    popoverWin.style.height = `${Math.max(200, Math.min(maxHeight, nh))}px`;
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
