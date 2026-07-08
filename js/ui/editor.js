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

window.openFileInEditor = (filePath) => {
    window.currentEditingPath = filePath;
    const path = require('path');
    const editorContent = document.getElementById('editor-content');
    if (!editorContent) return;

    try {
        const ext = path.extname(filePath).toLowerCase().substring(1);
        const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'];
        
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
                        editorCollapseIcon.classList.remove('rotate-left');
                    }
                }
                setTimeout(() => { if (typeof window.updateMinimapThumb === 'function') window.updateMinimapThumb(); }, 80);
            };
            window._editorCollapsed = true;
            toggleCollapseBtn.title = 'Expand All';
            if (editorCollapseIcon) {
                editorCollapseIcon.innerHTML = `<polyline points="17 4 12 9 7 4"></polyline><polyline points="7 20 12 15 17 20"></polyline>`;
                editorCollapseIcon.classList.remove('rotate-left');
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
                        
                        .caret { display: inline-block; color: #0078d4; font-size: 10px; margin-right: 8px; transition: transform 0.2s ease; flex-shrink: 0; } details[open] > .pormsg-header .caret { transform: rotate(90deg); }
                        
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
                    searchInput.value = '';
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
