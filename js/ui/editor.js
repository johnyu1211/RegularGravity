window.updateStatusBar = (filePath, lineCount, language) => {
    const modeEl = document.getElementById('status-bar-mode');
    const pathEl = document.getElementById('status-bar-path');
    const sizeEl = document.getElementById('status-bar-size');
    const langEl = document.getElementById('status-bar-language');
    const linesEl = document.getElementById('status-bar-lines');
    const div1 = document.getElementById('status-bar-divider-1');
    const posEl = document.getElementById('status-bar-position');

    if (filePath) {
        const pathModule = require('path');
        const root = window.projectRoot || '';
        const relPath = pathModule.relative(root, filePath).replace(/\\/g, '/');
        if (pathEl) {
            pathEl.innerText = relPath;
            pathEl.title = filePath;
        }

        try {
            const fs = require('fs');
            const stats = fs.statSync(filePath);
            const sizeKB = (stats.size / 1024).toFixed(1);
            if (sizeEl) {
                sizeEl.innerText = `${sizeKB} KB`;
                sizeEl.style.display = '';
            }
            if (div1) div1.style.display = '';
        } catch (e) {
            if (sizeEl) sizeEl.style.display = 'none';
            if (div1) div1.style.display = 'none';
        }

        if (langEl) langEl.innerText = language || 'PLAIN TEXT';
        if (linesEl) linesEl.innerText = `${lineCount} lines`;
        if (posEl) posEl.innerText = `Ln 1, Col 1`;
        if (modeEl) {
            modeEl.innerText = 'VIEWING';
            modeEl.style.color = '#3b82f6';
        }
    } else {
        if (pathEl) pathEl.innerText = 'No File Open';
        if (sizeEl) sizeEl.style.display = 'none';
        if (div1) div1.style.display = 'none';
        if (langEl) langEl.innerText = 'PLAIN TEXT';
        if (linesEl) linesEl.innerText = '-- lines';
        if (posEl) posEl.innerText = 'Ln --, Col --';
        if (modeEl) {
            modeEl.innerText = 'READY';
            modeEl.style.color = '#10b981';
        }
    }
};

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

window.isEditingMode = false;

window.saveCurrentEditorFile = function() {
    if (!window.currentEditingPath) return;
    const editorContent = document.getElementById('editor-content');
    if (!editorContent) return;

    try {
        const fs = require('fs');
        const editArea = document.getElementById('editor-raw-textarea');
        const editWrapper = document.getElementById('editor-raw-wrapper');
        let newContent = '';
        let savedScroll = editArea ? editArea.scrollTop : 0;

        if (editWrapper && editWrapper.style.display !== 'none' && editArea) {
            newContent = editArea.value;
        } else {
            const codeLines = editorContent.querySelectorAll('.line-code-text');
            if (codeLines.length > 0) {
                newContent = Array.from(codeLines).map(el => el.innerText).join('\n');
            }
        }

        window.editorHistory.push(fs.readFileSync(window.currentEditingPath, 'utf-8'));
        window.historyIndex = window.editorHistory.length - 1;
        
        fs.writeFileSync(window.currentEditingPath, newContent, 'utf-8');
        window.isEditingMode = false;
        editorContent.classList.remove('editor-editing-active');

        if (editWrapper) editWrapper.style.display = 'none';

        if (typeof ChatUI !== 'undefined' && typeof ChatUI.appendBubble === 'function') {
            const pathModule = require('path');
            ChatUI.appendBubble('system', `[SUCCESS] Saved ${pathModule.basename(window.currentEditingPath)} successfully.`);
        }
        
        window.openFileInEditor(window.currentEditingPath, savedScroll);
    } catch (e) {
        alert("Failed to save file: " + e.message);
    }
};

window.toggleEditorEditMode = function() {
    if (!window.currentEditingPath) return;
    const editorContent = document.getElementById('editor-content');
    const btnEdit = document.getElementById('btn-editor-edit');
    const btnCancel = document.getElementById('btn-editor-cancel');
    if (!editorContent) return;

    if (!window.isEditingMode) {
        window.isEditingMode = true;
        
        const fs = require('fs');
        let rawContent = '';
        try { rawContent = fs.readFileSync(window.currentEditingPath, 'utf-8').replace(/\r/g, ''); } catch(e) {}

        const scrollContainer = document.getElementById('editor-scroll-container');
        const currentScroll = scrollContainer ? scrollContainer.scrollTop : 0;

        let editWrapper = document.getElementById('editor-raw-wrapper');
        let editArea = document.getElementById('editor-raw-textarea');
        let gutter = document.getElementById('editor-raw-gutter');

        if (!editWrapper) {
            editWrapper = document.createElement('div');
            editWrapper.id = 'editor-raw-wrapper';
            editWrapper.style = `
                position: absolute; top: 0; left: 0; right: 0; bottom: 0;
                width: 100%; height: 100%; display: flex; background: #050507;
                z-index: 1000; overflow: hidden; box-sizing: border-box;
            `;

            gutter = document.createElement('div');
            gutter.id = 'editor-raw-gutter';
            gutter.style = `
                width: 44px; min-width: 44px; background: #08080c; color: #555;
                text-align: right; padding: 16px 8px 16px 0; font-family: 'JetBrains Mono', monospace;
                font-size: 12.5px; line-height: 1.6; user-select: none; border-right: 1px solid #1c1c22;
                overflow: hidden; box-sizing: border-box; flex-shrink: 0;
            `;

            editArea = document.createElement('textarea');
            editArea.id = 'editor-raw-textarea';
            editArea.style = `
                flex: 1; height: 100%; background: transparent; color: #e4e4e7;
                font-family: 'JetBrains Mono', 'Consolas', monospace; font-size: 12.5px; line-height: 1.6;
                padding: 16px 20px; border: none; outline: none; resize: none; box-sizing: border-box;
                tab-size: 4; white-space: pre; overflow: auto;
            `;

            let lastLineCount = 0;
            const updateGutter = () => {
                const lineCount = (editArea.value.match(/\n/g) || []).length + 1;
                if (lineCount !== lastLineCount) {
                    lastLineCount = lineCount;
                    let html = '';
                    for (let i = 1; i <= lineCount; i++) {
                        html += `<div>${i}</div>`;
                    }
                    gutter.innerHTML = html;
                }
                gutter.scrollTop = editArea.scrollTop;
            };

            editArea.oninput = updateGutter;
            editArea.onscroll = () => {
                gutter.scrollTop = editArea.scrollTop;
            };

            editArea.onkeydown = (e) => {
                if (e.key === 'Tab') {
                    e.preventDefault();
                    const start = editArea.selectionStart;
                    const end = editArea.selectionEnd;
                    editArea.value = editArea.value.substring(0, start) + '    ' + editArea.value.substring(end);
                    editArea.selectionStart = editArea.selectionEnd = start + 4;
                    updateGutter();
                }
            };

            editWrapper.appendChild(gutter);
            editWrapper.appendChild(editArea);
            editorContent.style.position = 'relative';
            editorContent.appendChild(editWrapper);
        }

        editArea.value = rawContent;
        editWrapper.style.display = 'flex';

        // Render line numbers in gutter
        const lineCount = (rawContent.match(/\n/g) || []).length + 1;
        let html = '';
        for (let i = 1; i <= lineCount; i++) {
            html += `<div>${i}</div>`;
        }
        gutter.innerHTML = html;

        editArea.scrollTop = currentScroll;
        gutter.scrollTop = currentScroll;

        setTimeout(() => {
            editArea.focus({ preventScroll: true });
            editArea.scrollTop = currentScroll;
            gutter.scrollTop = currentScroll;
        }, 20);

        if (btnEdit) {
            btnEdit.style.background = 'var(--primary)';
            btnEdit.title = 'Edit Mode (Click to Save & Return 👁️)';
            btnEdit.innerHTML = '<svg id="editor-edit-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>';
        }
        if (btnCancel) btnCancel.style.display = 'flex';

        const modeEl = document.getElementById('status-bar-mode');
        if (modeEl) {
            modeEl.innerText = 'EDITING (FULL EDITOR)';
            modeEl.style.color = '#f59e0b';
        }
    } else {
        window.saveCurrentEditorFile();
    }
};

window.cancelEditorEdit = function() {
    window.isEditingMode = false;
    const editorContent = document.getElementById('editor-content');
    if (editorContent) editorContent.classList.remove('editor-editing-active');
    const editWrapper = document.getElementById('editor-raw-wrapper');
    const editArea = document.getElementById('editor-raw-textarea');
    let savedScroll = editArea ? editArea.scrollTop : 0;
    if (editWrapper) editWrapper.style.display = 'none';
    if (window.currentEditingPath) {
        window.openFileInEditor(window.currentEditingPath, savedScroll);
    }
};

window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (window.isEditingMode) {
            window.saveCurrentEditorFile();
        } else if (window.currentEditingPath) {
            window.toggleEditorEditMode();
        }
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        window.toggleEditorEditMode();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) window.performRedo();
    }
});

window.copyBlockContent = async (syncId, event) => {
    event.preventDefault();
    event.stopPropagation();
    try {
        const bodyEl = document.getElementById('body-' + syncId);
        if (!bodyEl) return;
        const text = bodyEl.innerText;
        await navigator.clipboard.writeText(text);
        
        const btn = event.currentTarget;
        const originalHTML = btn.innerHTML;
        btn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        setTimeout(() => { btn.innerHTML = originalHTML; }, 1000);
    } catch (err) {
        console.error("Copy failed:", err);
    }
};

window.toggleSubBlocks = (syncId, event) => {
    event.preventDefault();
    event.stopPropagation();
    const detailEl = document.getElementById('editor-' + syncId);
    if (!detailEl) return;
    
    const subDetails = Array.from(detailEl.querySelectorAll('.editor-detail'));
    if (subDetails.length === 0) {
        detailEl.open = !detailEl.open;
        const parentMini = document.getElementById(syncId);
        if (parentMini) parentMini.open = detailEl.open;
        if (typeof window.updateMinimapThumb === 'function') window.updateMinimapThumb();
        return;
    }

    const allClosed = subDetails.every(d => !d.open);
    const nextState = allClosed;

    detailEl.open = true;
    const parentMini = document.getElementById(syncId);
    if (parentMini) parentMini.open = true;

    subDetails.forEach(d => {
        d.open = nextState;
        const miniId = d.getAttribute('data-mini-id');
        if (miniId) { const mini = document.getElementById(miniId); if (mini) mini.open = nextState; }
    });

    const btn = event.currentTarget;
    if (btn) {
        btn.title = nextState ? 'Collapse sub-blocks' : 'Expand sub-blocks';
        btn.innerHTML = nextState 
            ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><polyline points="17 4 12 9 7 4"></polyline><polyline points="7 20 12 15 17 20"></polyline></svg>`
            : `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><polyline points="7 9 12 4 17 9"></polyline><polyline points="7 15 12 20 17 15"></polyline></svg>`;
    }

    if (typeof window.updateMinimapThumb === 'function') window.updateMinimapThumb();
};

window.editBlockContent = (syncId, event) => {
    event.preventDefault();
    event.stopPropagation();
    
    const filePath = window.currentEditingPath;
    const detailEl = document.getElementById('editor-' + syncId);
    if (!detailEl) return;

    const footerEl = detailEl.parentElement.querySelector('.rg-footer');
    const startLine = parseInt(detailEl.dataset.start);
    const endLine = footerEl ? parseInt(footerEl.dataset.end) : startLine;
    
    const fs = require('fs');
    let fileContent = '';
    try {
        fileContent = fs.readFileSync(filePath, 'utf-8').replace(/\r/g, '');
    } catch(e) { return; }
    
    let lines = fileContent.split('\n');
    let blockLines = lines.slice(startLine, endLine + 1);
    let blockText = blockLines.join('\n');

    let modal = document.getElementById('block-edit-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'block-edit-modal';
        modal.style = `
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.85);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            z-index: 100000;
            align-items: center;
            justify-content: center;
            font-family: 'DM Sans', sans-serif;
        `;
        modal.innerHTML = `
            <div style="background: var(--surface-color); padding: 22px; width: 640px; max-width: 92vw; border: 1px solid var(--border-color); border-radius: 14px; display: flex; flex-direction: column; gap: 14px; box-shadow: 0 25px 60px rgba(0,0,0,0.7);">
                <div style="font-size: 13px; font-weight: 700; color: #fff; border-bottom: 1px solid var(--border-color); padding-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        <span id="block-edit-title">EDIT CODE BLOCK</span>
                    </div>
                    <span id="close-block-edit-modal" style="cursor: pointer; color: var(--text-muted); font-size: 18px; line-height: 1;">&times;</span>
                </div>
                <textarea id="block-edit-textarea" style="width: 100%; height: 260px; background: #0b0c0e; border: 1px solid var(--border-color); color: #e4e4e7; font-size: 11.5px; padding: 12px; outline: none; resize: vertical; border-radius: 8px; font-family: 'JetBrains Mono', monospace; line-height: 1.5; box-sizing: border-box; tab-size: 4; white-space: pre;"></textarea>
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button id="cancel-block-edit" style="background: transparent; border: 1px solid var(--border-color); color: var(--text-muted); padding: 8px 16px; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer;">Cancel</button>
                    <button id="save-block-edit" style="background: var(--primary); color: #fff; border: none; padding: 8px 20px; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer;">Save Block Changes</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const textarea = modal.querySelector('#block-edit-textarea');
        textarea.onkeydown = (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                textarea.value = textarea.value.substring(0, start) + '    ' + textarea.value.substring(end);
                textarea.selectionStart = textarea.selectionEnd = start + 4;
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                modal.querySelector('#save-block-edit').click();
            }
        };

        const hideModal = () => { modal.style.display = 'none'; };
        modal.querySelector('#close-block-edit-modal').onclick = hideModal;
        modal.querySelector('#cancel-block-edit').onclick = hideModal;
    }

    const titleEl = modal.querySelector('#block-edit-title');
    if (titleEl) titleEl.innerText = `EDIT CODE BLOCK (Lines ${startLine + 1} - ${endLine + 1})`;

    const textarea = modal.querySelector('#block-edit-textarea');
    textarea.value = blockText;
    modal.style.display = 'flex';
    setTimeout(() => textarea.focus(), 30);

    const saveBtn = modal.querySelector('#save-block-edit');
    saveBtn.onclick = () => {
        try {
            const updatedBlockText = textarea.value;
            const updatedLines = updatedBlockText.split('\n');
            
            const currentFileContent = fs.readFileSync(filePath, 'utf-8').replace(/\r/g, '');
            let currentLines = currentFileContent.split('\n');
            
            window.editorHistory.push(currentFileContent);
            window.historyIndex = window.editorHistory.length - 1;

            currentLines.splice(startLine, (endLine - startLine + 1), ...updatedLines);
            
            fs.writeFileSync(filePath, currentLines.join('\n'), 'utf-8');
            modal.style.display = 'none';

            if (typeof ChatUI !== 'undefined' && typeof ChatUI.appendBubble === 'function') {
                const pathModule = require('path');
                ChatUI.appendBubble('system', `[SUCCESS] Block updated in ${pathModule.basename(filePath)} (Lines ${startLine + 1} - ${endLine + 1})`);
            }
            
            window.openFileInEditor(filePath);
        } catch(err) {
            alert("Failed to save block: " + err.message);
        }
    };
};

window.pasteToBlock = async (syncId, event) => {
    event.preventDefault();
    event.stopPropagation();
    
    try {
        const text = await navigator.clipboard.readText();
        if (!text) { alert("클립보드가 비어있습니다."); return; }
        
        const filePath = window.currentEditingPath;
        const detailEl = document.getElementById('editor-' + syncId);
        if (!detailEl) { alert("박스를 찾을 수 없습니다."); return; }

        const footerEl = detailEl.parentElement.querySelector('.rg-footer');
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

window.openFileInEditor = (filePath, targetScrollTop = null) => {
    if (window.activeFileWatcherPath !== filePath) {
        try {
            if (window.activeFileWatcher) window.activeFileWatcher.close();
        } catch(e){}
        window.activeFileWatcherPath = filePath;
        try {
            const fs = require('fs');
            let watchDebounceTimer = null;
            window.activeFileWatcher = fs.watch(filePath, (eventType) => {
                if (eventType === 'change') {
                    clearTimeout(watchDebounceTimer);
                    watchDebounceTimer = setTimeout(() => {
                        if (!window.isEditingMode && window.currentEditingPath === filePath) {
                            console.log("[FileWatcher] Real-time updating file viewer for:", filePath);
                            window.openFileInEditor(filePath);
                        }
                    }, 150);
                }
            });
        } catch(e) {}
    }

    window.currentEditingPath = filePath;
    window.isEditingMode = false;
    const editArea = document.getElementById('editor-raw-textarea');
    if (editArea) editArea.style.display = 'none';

    const btnEdit = document.getElementById('btn-editor-edit');
    const btnCancel = document.getElementById('btn-editor-cancel');
    if (btnEdit) {
        btnEdit.style.background = 'var(--surface-low)';
        btnEdit.title = 'View Mode (Click for Code Edit Mode </ >)';
        btnEdit.innerHTML = '<svg id="editor-edit-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
        btnEdit.onclick = () => window.toggleEditorEditMode();
    }
    if (btnCancel) {
        btnCancel.style.display = 'none';
        btnCancel.onclick = () => window.cancelEditorEdit();
    }

    const path = require('path');
    const editorContent = document.getElementById('editor-content');
    if (!editorContent) return;

    let savedBlockStates = {};
    if (window.currentEditingPath === filePath) {
        editorContent.querySelectorAll('.editor-detail').forEach(d => {
            const start = d.getAttribute('data-start');
            if (start !== null) {
                savedBlockStates[start] = d.open;
            }
        });
    }

    editorContent.classList.remove('editor-editing-active');

    try {
        const ext = path.extname(filePath).toLowerCase().substring(1);
        const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'];
        
        const titleEl = document.getElementById('editor-header-title');
        if (titleEl) titleEl.innerText = `FILE VIEWER - ${path.basename(filePath)}`;

        const toggleCollapseBtn = document.getElementById('btn-editor-toggle-collapse');

        if (toggleCollapseBtn) {
            const editorCollapseIcon = document.getElementById('editor-collapse-icon');
            toggleCollapseBtn.onclick = () => {
                const allDetails = Array.from(editorContent.querySelectorAll('.editor-detail'));
                if (allDetails.length === 0) return;
                const anyOpen = allDetails.some(d => d.open);
                const nextState = !anyOpen;

                allDetails.forEach(d => {
                    d.open = nextState;
                    const mini = document.getElementById(d.getAttribute('data-mini-id'));
                    if (mini) mini.open = nextState;
                });
                
                toggleCollapseBtn.title = nextState ? 'Collapse All' : 'Expand All';
                if (editorCollapseIcon) {
                    editorCollapseIcon.innerHTML = nextState 
                        ? `<polyline points="17 4 12 9 7 4"></polyline><polyline points="7 20 12 15 17 20"></polyline>`
                        : `<polyline points="7 9 12 4 17 9"></polyline><polyline points="7 15 12 20 17 15"></polyline>`;
                }
                setTimeout(() => { if (typeof window.updateMinimapThumb === 'function') window.updateMinimapThumb(); }, 80);
            };
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
                        if (lang === 'html') {
                            const tagRegex = /<(\/?[a-zA-Z0-9:-]+)([^>]*)>/g;
                            let match;
                            while ((match = tagRegex.exec(line)) !== null) {
                                const tagPart = match[1].toLowerCase();
                                const voidTags = ['br', 'hr', 'img', 'input', 'link', 'meta', 'base', 'col', 'embed', 'source', 'track', 'wbr'];
                                if (voidTags.includes(tagPart)) continue;
                                if (match[2].endsWith('/') || match[0].endsWith('/>')) continue;
                                if (tagPart.startsWith('/')) {
                                    net--;
                                } else {
                                    net++;
                                }
                            }
                        } else {
                            for (let j = 0; j < line.length; j++) { if (line[j] === '{') net++; if (line[j] === '}') net--; }
                        }
                    }
                    if (shouldFold && net === 0 && blockStack.length === 0 && line.trim() === '') continue;

                    if (net > 0) {
                        let titleName = (lang === 'html') ? line.trim() : line.replace(/[{}]/g, '').trim();
                        if (!titleName) titleName = "Block";
                        let syncId = `mini-block-${blockCounter++}`;
                        blockStack.push({ title: titleName, id: syncId, start: i });

                        let isBlockOpen = (savedBlockStates[i] !== undefined) ? savedBlockStates[i] : true;
                        let openAttr = isBlockOpen ? ' open' : '';

                        finalHTML += `<div class="rg-block"><details class="editor-detail"${openAttr} data-mini-id="${syncId}" id="editor-${syncId}" data-start="${i}"><summary class="rg-header">${lineNumHTML}<div style="flex:1; min-width:0; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; margin-right:10px;"><span class="line-code-text" style="white-space:pre; outline:none;" spellcheck="false">${htmlLine}</span></div><button class="box-edit-btn" onclick="window.editBlockContent('${syncId}', event)" title="Edit this block"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button><button class="box-copy-btn" onclick="window.copyBlockContent('${syncId}', event)" title="Copy block content"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button><button class="box-fold-btn" onclick="window.toggleSubBlocks('${syncId}', event)" title="Collapse/Expand sub-blocks"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><polyline points="17 4 12 9 7 4"></polyline><polyline points="7 20 12 15 17 20"></polyline></svg></button><span class="caret" style="color:var(--text-muted); display:inline-flex; align-items:center;"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;"><polyline points="9 18 15 12 9 6"></polyline></svg></span></summary><div class="rg-body" id="body-${syncId}">`;
                        minimapHTML += `<details id="${syncId}" class="mini-detail"${openAttr}><summary class="mini-summary">${mmLine}</summary><div class="mini-body">`;
                    } else if (net < 0 && blockStack.length > 0) {
                        let popped = blockStack.pop();
                        let lineCount = i - popped.start + 1;
                        let safeTitle = popped.title.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                        
                        finalHTML += `</div></details><div class="rg-footer" data-end="${i}">${lineNumHTML}<div style="display:flex; align-items:center; flex:1; min-width:0; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; margin-right:10px;"><span class="line-code-text" style="white-space:pre; outline:none;" spellcheck="false">${htmlLine}</span> <span class="footer-tag" style="margin-left: 8px;">// ${safeTitle}</span> <span style="color:var(--text-muted); font-size:10px; font-weight:bold; margin-left:8px; background:var(--surface-low); border: 1px solid var(--border-color); padding:1px 6px; border-radius:10px;">${lineCount} lines</span></div><div class="go-top-btn" onclick="const el = document.getElementById('editor-${popped.id}'); if(el){ document.getElementById('editor-scroll-container').scrollTo({top: el.offsetTop - 20, behavior: 'smooth'}); } event.stopPropagation();" title="Go to block start">↑ Top</div></div></div>`;
                        minimapHTML += `</div></details><div class="mini-footer">${mmLine}</div>`;
                    } else {
                        finalHTML += `<div class="rg-line">${lineNumHTML} <span class="line-code-text" style="white-space:pre; outline:none;" spellcheck="false">${htmlLine || ' '}</span></div>`;
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
                        .editor-editing-active .line-code-text { cursor: text; border-radius: 2px; transition: background 0.15s, outline 0.15s; }
                        .editor-editing-active .line-code-text:hover { background: rgba(255, 255, 255, 0.05); }
                        .editor-editing-active .line-code-text:focus { background: rgba(56, 189, 248, 0.1); outline: 1px dashed rgba(56, 189, 248, 0.5); }
                        .line-num { position: sticky; left: 0; z-index: 2; display: inline-block; width: 30px; min-width: 30px; text-align: right; color: #555; user-select: none; margin-right: 12px; font-size: 11px; font-family: 'JetBrains Mono', monospace; border-right: 1px solid #333; padding-right: 8px; flex-shrink: 0; transition: color 0.1s; background: transparent; }
                        .rg-line .line-num { background: #000; } .rg-line:hover .line-num { background: #141414; }
                        .rg-body .rg-line .line-num { background: #070707; } .rg-body .rg-line:hover .line-num { background: #1b1b1b; }
                        
                        .rg-block { margin: 6px 0; border: 1px solid #2a2a2a; border-radius: 7px; background: #070707; transition: border-color 0.15s; display: block; max-width: 100%; overflow: hidden; }
                        .rg-body .rg-block { margin: 2px 0 2px 12px; }
                        .rg-block:hover { border-color: #fff; } .rg-block:has(.rg-block:hover) { border-color: #2a2a2a; }
                        
                        .rg-header { cursor: pointer; padding: 4px 10px 4px 0; background: #111; display: flex; align-items: center; list-style: none; border-radius: 6px 6px 0 0; transition: background 0.1s; max-width: 100%; box-sizing: border-box; }
                        .rg-header::-webkit-details-marker { display: none; } .rg-header:hover { background: #1a1a1a; } .rg-header:hover .line-num { color: #888; }
                        
                        .box-paste-btn { font-size: 10px; font-weight: bold; color: #888; background: #222; border: 1px solid #333; border-radius: 4px; padding: 2px 8px; cursor: pointer; transition: all 0.2s; opacity: 0; display: flex; align-items: center; flex-shrink: 0; }
                        .rg-header:hover .box-paste-btn { opacity: 1; } .box-paste-btn:hover { background: #0078d4; color: #fff; border-color: #0078d4; }
                        
                        .box-edit-btn { font-size: 10px; font-weight: bold; color: #888; background: #222; border: 1px solid #333; border-radius: 4px; padding: 4px; cursor: pointer; transition: all 0.2s; opacity: 0; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-right: 4px; }
                        .rg-header:hover .box-edit-btn { opacity: 1; } .box-edit-btn:hover { background: #0078d4; color: #fff; border-color: #0078d4; }
                        
                        .box-copy-btn { font-size: 10px; font-weight: bold; color: #888; background: #222; border: 1px solid #333; border-radius: 4px; padding: 4px; cursor: pointer; transition: all 0.2s; opacity: 0; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-right: 6px; }
                        .rg-header:hover .box-copy-btn { opacity: 1; } .box-copy-btn:hover { background: #333; color: #fff; border-color: #555; }
                        
                        .box-fold-btn { font-size: 10px; font-weight: bold; color: #888; background: #222; border: 1px solid #333; border-radius: 4px; padding: 4px; cursor: pointer; transition: all 0.2s; opacity: 0; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-right: 4px; }
                        .rg-header:hover .box-fold-btn { opacity: 1; } .box-fold-btn:hover { background: #333; color: #fff; border-color: #555; }
                        
                        .caret { display: inline-block; color: var(--text-muted); font-size: 10px; margin-left: 8px; transition: transform 0.2s ease; flex-shrink: 0; } details[open] > .rg-header .caret { transform: rotate(90deg); }
                        
                        .rg-body { padding: 0; border-top: 1px solid #222; overflow-x: auto; overflow-y: hidden; width: 100%; box-sizing: border-box; }
                        .rg-body::-webkit-scrollbar { height: 6px; } .rg-body::-webkit-scrollbar-track { background: transparent; }
                        .rg-body::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; } .rg-body::-webkit-scrollbar-thumb:hover { background: #555; }
                        
                        .rg-footer { padding: 4px 10px 4px 0; background: #111; border-top: 1px solid #2a2a2a; border-radius: 0 0 6px 6px; display: flex; align-items: center; transition: background 0.1s; max-width: 100%; box-sizing: border-box; }
                        .rg-footer:hover { background: #1a1a1a; } .rg-footer:hover .line-num { color: #888; } .footer-tag { color: #666; font-size: 10px; font-style: italic; white-space: nowrap; }
                        
                        .go-top-btn { font-size: 10px; font-weight: bold; color: #555; background: #0a0a0a; border: 1px solid #222; border-radius: 4px; padding: 2px 8px; cursor: pointer; transition: all 0.2s; opacity: 0; flex-shrink: 0; }
                        .rg-footer:hover .go-top-btn { opacity: 1; } .go-top-btn:hover { background: #0078d4; color: #fff; border-color: #0078d4; }
                        
                        .rg-line { padding: 0 10px 0 0; line-height: 1.5; position: relative; z-index: 1; display: flex; align-items: center; transition: background 0.1s; border-radius: 2px; width: max-content; min-width: 100%; box-sizing: border-box; }
                        .rg-line:hover { background: rgba(255, 255, 255, 0.08); } .rg-line:hover .line-num { color: #888; }
                        
                        .search-highlight { background: rgba(212, 160, 23, 0.2) !important; border-radius: 2px; } .search-highlight .line-num { color: #d4a017 !important; font-weight: bold; }
                        .search-highlight-active { background: rgba(212, 160, 23, 0.6) !important; outline: 1px solid #d4a017; border-radius: 2px; } .search-highlight-active .line-num { color: #fff !important; background: #d4a017 !important; font-weight: bold; }
                        
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
                    
                    let matchedElements = [];
                    let currentMatchIndex = -1;
 
                    const scrollToCurrentMatch = () => {
                        if (currentMatchIndex >= 0 && currentMatchIndex < matchedElements.length) {
                            const el = matchedElements[currentMatchIndex];
                            
                            editorContent.querySelectorAll('.search-highlight-active').forEach(x => x.classList.remove('search-highlight-active'));
                            el.classList.add('search-highlight-active');
                            
                            scrollCont.scrollTo({ top: el.offsetTop - 40, behavior: 'smooth' });
                            searchResult.innerText = `${currentMatchIndex + 1}/${matchedElements.length}`;
                            setTimeout(updateThumb, 50);
                        }
                    };
 
                    searchInput.onkeydown = (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            if (matchedElements.length > 0) {
                                currentMatchIndex = (currentMatchIndex + 1) % matchedElements.length;
                                scrollToCurrentMatch();
                            }
                        }
                    };
 
                    searchInput.oninput = () => {
                        clearTimeout(searchTimer);
                        searchTimer = setTimeout(() => {
                            const query = searchInput.value.toLowerCase();
                            const elements = editorContent.querySelectorAll('.rg-line, .rg-header, .rg-footer');
                            
                            elements.forEach(el => {
                                el.classList.remove('search-highlight');
                                el.classList.remove('search-highlight-active');
                            });
                            matchedElements = [];
                            currentMatchIndex = -1;
                            
                            if (!query.trim()) { 
                                searchResult.innerText = ''; 
                                return; 
                            }
                            
                            elements.forEach(el => {
                                if (el.textContent.toLowerCase().includes(query)) {
                                    el.classList.add('search-highlight');
                                    matchedElements.push(el);
                                    
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
                            
                            if (matchedElements.length > 0) {
                                currentMatchIndex = 0;
                                scrollToCurrentMatch();
                            } else {
                                searchResult.innerText = '0/0';
                            }
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
                    let isMinimapRafPending = false;
                    const updateThumbThrottled = () => {
                        if (isMinimapRafPending) return;
                        isMinimapRafPending = true;
                        requestAnimationFrame(() => {
                            isMinimapRafPending = false;
                            updateThumb();
                        });
                    };
                    window.updateMinimapThumb = updateThumbThrottled;
                    scrollCont.addEventListener('scroll', updateThumbThrottled, { passive: true });
                    window.addEventListener('resize', updateThumbThrottled, { passive: true });
                    setTimeout(updateThumb, 50);

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
                if (targetScrollTop !== null && scrollCont) {
                    setTimeout(() => {
                        scrollCont.scrollTop = targetScrollTop;
                        if (typeof updateThumb === 'function') updateThumb();
                    }, 50);
                }
            }
        }
    }
    } catch (err) {
        editorContent.innerHTML = `<div style="position: absolute; inset: 0; overflow:auto; background:#000; color:#f44; padding:20px; font-family:'JetBrains Mono', monospace;">Failed to open file:<br>${err.message}</div>`;
    }
};
