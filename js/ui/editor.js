window.getSafeHljsLang = function(ext) {
    if (typeof hljs === 'undefined') return 'plaintext';
    let target = ext;
    if (ext === 'bat' || ext === 'cmd') target = 'dos';
    if (ext === 'js' || ext === 'cjs' || ext === 'mjs') target = 'javascript';
    if (ext === 'ts' || ext === 'cts' || ext === 'mts') target = 'typescript';
    if (ext === 'py' || ext === 'pyw') target = 'python';
    if (ext === 'sh' || ext === 'bash' || ext === 'zsh') target = 'bash';
    if (ext === 'ps1') target = 'powershell';

    if (hljs.getLanguage(target)) return target;
    if (hljs.getLanguage(ext)) return ext;
    if (ext === 'bat' || ext === 'cmd') {
        if (hljs.getLanguage('bash')) return 'bash';
    }
    return 'plaintext';
};

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
        let targetLineNum = 1;
        if (editArea) {
            targetLineNum = Math.max(1, Math.floor(editArea.scrollTop / 19.5) + 1);
        }

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
        
        window._lastSaveTimestamp = Date.now();
        fs.writeFileSync(window.currentEditingPath, newContent, 'utf-8');
        window.isEditingMode = false;
        editorContent.classList.remove('editor-editing-active');

        if (editWrapper) editWrapper.style.display = 'none';

        if (typeof ChatUI !== 'undefined' && typeof ChatUI.appendBubble === 'function') {
            const pathModule = require('path');
            ChatUI.appendBubble('system', `[SUCCESS] Saved ${pathModule.basename(window.currentEditingPath)} successfully.`);
        }
        
        window.openFileInEditor(window.currentEditingPath, targetLineNum);
    } catch (e) {
        alert("Failed to save file: " + e.message);
    }
};

window.toggleEditorEditMode = function() {
    if (!window.currentEditingPath) return;
    const editorContent = document.getElementById('editor-content');
    const btnEdit = document.getElementById('btn-editor-edit');
    if (!editorContent) return;

    if (!window.isEditingMode) {
        window.isEditingMode = true;
        
        const fs = require('fs');
        let rawContent = '';
        try { rawContent = fs.readFileSync(window.currentEditingPath, 'utf-8').replace(/\r/g, ''); } catch(e) {}

        let currentLineNum = 1;
        const scrollContainer = document.getElementById('editor-scroll-container');
        if (scrollContainer) {
            const lineSpans = editorContent.querySelectorAll('.line-num');
            for (const span of lineSpans) {
                const el = span.closest('.rg-line, .rg-header, .rg-footer') || span;
                if (el.offsetTop >= scrollContainer.scrollTop) {
                    currentLineNum = parseInt(span.textContent, 10) || 1;
                    break;
                }
            }
        }

        let editWrapper = document.getElementById('editor-raw-wrapper');
        let editArea = document.getElementById('editor-raw-textarea');
        let gutter = document.getElementById('editor-raw-gutter');

        if (!editWrapper) {
            editWrapper = document.createElement('div');
            editWrapper.id = 'editor-raw-wrapper';
            editWrapper.style = `
                position: absolute; top: 0; left: 0; right: 70px; bottom: 0;
                display: flex; background: var(--bg-color); z-index: 1000; overflow: hidden; box-sizing: border-box;
            `;

            gutter = document.createElement('div');
            gutter.id = 'editor-raw-gutter';
            gutter.style = `
                width: 44px; min-width: 44px; background: var(--surface-lowest); color: #555;
                text-align: right; padding: 16px 8px 16px 0; font-family: 'JetBrains Mono', monospace;
                font-size: 12.5px; line-height: 1.6; user-select: none; border-right: 1px solid var(--border-color);
                overflow: hidden; box-sizing: border-box; flex-shrink: 0;
            `;

            const editContainer = document.createElement('div');
            editContainer.id = 'editor-raw-container';
            editContainer.style = `position: relative; flex: 1; height: 100%; overflow: hidden; background: var(--bg-color);`;

            const rawPre = document.createElement('pre');
            rawPre.id = 'editor-raw-pre';
            rawPre.style = `position: absolute; inset: 0; margin: 0; padding: 16px 20px; font-family: 'JetBrains Mono', monospace; font-size: 12.5px; line-height: 20px; tab-size: 4; white-space: pre; overflow: hidden; pointer-events: none; box-sizing: border-box; background: transparent;`;

            const rawCode = document.createElement('code');
            rawCode.id = 'editor-raw-code';
            rawCode.className = 'hljs';
            rawCode.style = `background: transparent; padding: 0; margin: 0; font-family: inherit; font-size: inherit; line-height: 20px; white-space: pre; display: block;`;
            rawPre.appendChild(rawCode);

            editArea = document.createElement('textarea');
            editArea.id = 'editor-raw-textarea';
            editArea.spellCheck = false;
            editArea.setAttribute('spellcheck', 'false');
            editArea.setAttribute('autocorrect', 'off');
            editArea.setAttribute('autocapitalize', 'off');
            editArea.style = `
                position: absolute; inset: 0; width: 100%; height: 100%; background: transparent; color: transparent; caret-color: #ffffff;
                font-family: 'JetBrains Mono', monospace; font-size: 12.5px; line-height: 20px;
                padding: 16px 20px; border: none; outline: none; resize: none; box-sizing: border-box;
                tab-size: 4; white-space: pre; overflow: auto;
            `;

            editContainer.appendChild(rawPre);
            editContainer.appendChild(editArea);

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

            const addIndentGuides = (htmlString) => {
                const lines = htmlString.split('\n');
                let lastIndentCount = 0;
                
                const lineIndents = lines.map(line => {
                    const textOnly = line.replace(/<[^>]*>/g, '');
                    if (textOnly.trim() === '') return -1;
                    let count = 0;
                    for (let char of textOnly) {
                        if (char === ' ') count++;
                        else if (char === '\t') count += 4;
                        else break;
                    }
                    return count;
                });

                return lines.map((line, idx) => {
                    let spaceCount = lineIndents[idx];
                    if (spaceCount === -1) {
                        let nextIndent = 0;
                        for (let j = idx + 1; j < lineIndents.length; j++) {
                            if (lineIndents[j] !== -1) { nextIndent = lineIndents[j]; break; }
                        }
                        spaceCount = Math.min(lastIndentCount, nextIndent);
                    } else {
                        lastIndentCount = spaceCount;
                    }

                    let rawMatch = line.match(/^([ \t]+)/);
                    let rest = rawMatch ? line.substring(rawMatch[1].length) : line;
                    
                    let step = 4;
                    let guidesHTML = '';
                    let count = 0;
                    if (spaceCount > 0) {
                        while (count < spaceCount) {
                            let width = Math.min(step, spaceCount - count);
                            guidesHTML += `<span class="indent-guide-line" style="display:inline-block; width:${width}ch; border-right: 1px solid rgba(255, 255, 255, 0.12); margin-right: 4px; box-sizing: border-box; height: 20px; line-height: 20px; vertical-align: top; user-select: none; transition: border-color 0.15s ease, background-color 0.15s ease;"></span>`;
                            count += width;
                        }
                    }
                    return `<div class="raw-code-line" style="display: block; position: relative; width: max-content; min-width: 100%; height: 20px; line-height: 20px; margin: 0; padding: 0; box-sizing: border-box; transition: background 0.1s;">${guidesHTML}${rest}</div>`;
                }).join('');
            };

            const updateRawHighlight = () => {
                const codeEl = document.getElementById('editor-raw-code');
                const preEl = document.getElementById('editor-raw-pre');
                if (!codeEl || !preEl) return;
                
                let ext = path.extname(window.currentEditingPath || '').toLowerCase().substring(1);
                let lang = window.getSafeHljsLang(ext);
                let val = editArea.value;
                if (val.endsWith('\n')) val += ' ';
                
                let highlighted = '';
                if (typeof hljs !== 'undefined') {
                    highlighted = hljs.highlight(val, { language: lang, ignoreIllegals: true }).value;
                } else {
                    highlighted = val.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                }
                
                codeEl.innerHTML = addIndentGuides(highlighted);
                preEl.scrollTop = editArea.scrollTop;
                preEl.scrollLeft = editArea.scrollLeft;
            };
            window.updateRawHighlight = updateRawHighlight;

            let activeScopeSpans = [];
            const updateActiveScope = (activeLineIdx) => {
                activeScopeSpans.forEach(span => span.classList.remove('active-scope-guide'));
                activeScopeSpans = [];

                const codeEl = document.getElementById('editor-raw-code');
                if (!codeEl) return;

                const lineEls = codeEl.querySelectorAll('.raw-code-line');
                if (activeLineIdx < 0 || activeLineIdx >= lineEls.length) return;

                const indents = [];
                lineEls.forEach(lineEl => {
                    const guideSpans = lineEl.querySelectorAll('.indent-guide-line');
                    indents.push(guideSpans.length * 4);
                });

                const currentIndent = indents[activeLineIdx];
                if (currentIndent <= 0) return;

                let scopeIndent = currentIndent;

                let startIdx = activeLineIdx;
                while (startIdx > 0 && indents[startIdx] >= scopeIndent) {
                    startIdx--;
                }

                let endIdx = activeLineIdx;
                while (endIdx < lineEls.length - 1 && indents[endIdx] >= scopeIndent) {
                    endIdx++;
                }

                const guideColIndex = (scopeIndent / 4) - 1;
                if (guideColIndex < 0) return;

                for (let i = startIdx; i <= endIdx; i++) {
                    const spans = lineEls[i].querySelectorAll('.indent-guide-line');
                    if (spans[guideColIndex]) {
                        spans[guideColIndex].classList.add('active-scope-guide');
                        activeScopeSpans.push(spans[guideColIndex]);
                    }
                }
            };

            let currentActiveLineEl = null;
            let lastScopeLineIdx = -999;
            let mouseMoveRaf = null;

            editArea.onmousemove = (e) => {
                const clientY = e.clientY;
                const scrollTop = editArea.scrollTop;
                if (mouseMoveRaf) return;
                
                mouseMoveRaf = requestAnimationFrame(() => {
                    mouseMoveRaf = null;
                    const rect = editArea.getBoundingClientRect();
                    const offsetY = clientY - rect.top + scrollTop - 16;
                    const lineIndex = Math.floor(offsetY / 20);
                    
                    if (lineIndex === lastScopeLineIdx) return;
                    lastScopeLineIdx = lineIndex;

                    const codeEl = document.getElementById('editor-raw-code');
                    if (!codeEl) return;
                    
                    const lines = codeEl.querySelectorAll('.raw-code-line');
                    if (lineIndex >= 0 && lineIndex < lines.length) {
                        const targetLine = lines[lineIndex];
                        if (targetLine !== currentActiveLineEl) {
                            if (currentActiveLineEl) currentActiveLineEl.classList.remove('active-hover-line');
                            targetLine.classList.add('active-hover-line');
                            currentActiveLineEl = targetLine;
                        }
                        updateActiveScope(lineIndex);
                    } else if (currentActiveLineEl) {
                        currentActiveLineEl.classList.remove('active-hover-line');
                        currentActiveLineEl = null;
                        updateActiveScope(-1);
                    }
                });
            };

            editArea.onmouseleave = () => {
                if (mouseMoveRaf) {
                    cancelAnimationFrame(mouseMoveRaf);
                    mouseMoveRaf = null;
                }
                lastScopeLineIdx = -999;
                if (currentActiveLineEl) {
                    currentActiveLineEl.classList.remove('active-hover-line');
                    currentActiveLineEl = null;
                    updateActiveScope(-1);
                }
            };

            editArea.oninput = () => {
                updateGutter();
                updateRawHighlight();
            };
            editArea.onscroll = () => {
                gutter.scrollTop = editArea.scrollTop;
                const preEl = document.getElementById('editor-raw-pre');
                if (preEl) {
                    preEl.scrollTop = editArea.scrollTop;
                    preEl.scrollLeft = editArea.scrollLeft;
                }
                if (typeof window.updateMinimapThumb === 'function') {
                    window.updateMinimapThumb();
                }
            };

            editArea.onkeydown = (e) => {
                if (e.key === 'Tab') {
                    e.preventDefault();
                    const start = editArea.selectionStart;
                    const end = editArea.selectionEnd;
                    editArea.value = editArea.value.substring(0, start) + '    ' + editArea.value.substring(end);
                    editArea.selectionStart = editArea.selectionEnd = start + 4;
                    updateGutter();
                    updateRawHighlight();
                }
            };

            editWrapper.appendChild(gutter);
            editWrapper.appendChild(editContainer);
            editorContent.style.position = 'relative';
            editorContent.appendChild(editWrapper);
        }

        editArea.value = rawContent;
        if (typeof window.updateRawHighlight === 'function') window.updateRawHighlight();
        editWrapper.style.display = 'flex';

        // Render line numbers in gutter
        const lineCount = (rawContent.match(/\n/g) || []).length + 1;
        let html = '';
        for (let i = 1; i <= lineCount; i++) {
            html += `<div>${i}</div>`;
        }
        gutter.innerHTML = html;

        const applyEditScroll = () => {
            const target = Math.max(0, (currentLineNum - 1) * 19.5);
            editArea.scrollTop = target;
            gutter.scrollTop = target;
        };
        applyEditScroll();

        setTimeout(() => {
            editArea.focus({ preventScroll: true });
            applyEditScroll();
        }, 20);

        if (btnEdit) {
            btnEdit.style.color = 'var(--text-muted)';
            btnEdit.style.background = 'transparent';
            btnEdit.style.borderColor = 'transparent';
            btnEdit.style.boxShadow = 'none';
            btnEdit.title = 'Edit Mode (Click to Save & Return 📖)';
            btnEdit.innerHTML = '<svg id="editor-edit-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>';
        }

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
            background: rgba(10, 10, 12, 0.75);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            z-index: 100000;
            align-items: center;
            justify-content: center;
            font-family: 'DM Sans', sans-serif;
        `;
        modal.innerHTML = `
            <div style="background: var(--surface-color); padding: 24px; width: 680px; max-width: 92vw; border: 1px solid var(--border-color); border-radius: 16px; display: flex; flex-direction: column; gap: 16px; box-shadow: 0 32px 80px rgba(0,0,0,0.75); box-sizing: border-box; animation: scaleIn 0.2s ease-out;">
                <div style="font-size: 13px; font-weight: 700; color: #fff; border-bottom: 1px solid var(--border-color); padding-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center;">
                        <span id="block-edit-title" style="letter-spacing: 0.03em; font-family: 'DM Sans', sans-serif;">EDIT CODE BLOCK</span>
                    </div>
                    <span id="close-block-edit-modal" style="cursor: pointer; color: var(--text-muted); font-size: 20px; line-height: 1; transition: color 0.15s;" onmouseenter="this.style.color='#fff'" onmouseleave="this.style.color='var(--text-muted)'">&times;</span>
                </div>
                <div id="block-edit-editor-container" style="position: relative; width: 100%; height: 280px; background: var(--bg-color); border-radius: 10px; overflow: hidden; box-sizing: border-box;">
                    <pre id="block-edit-pre" style="position: absolute; inset: 0; margin: 0; padding: 14px; font-family: 'JetBrains Mono', monospace; font-size: 12.5px; line-height: 1.6; tab-size: 4; white-space: pre; overflow: hidden; pointer-events: none; box-sizing: border-box; background: transparent;"><code id="block-edit-code" class="hljs" style="background: transparent; padding: 0; margin: 0; font-family: inherit; font-size: inherit; line-height: inherit; white-space: pre; display: block;"></code></pre>
                    <textarea id="block-edit-textarea" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off" style="position: absolute; inset: 0; width: 100%; height: 100%; background: transparent; color: transparent; caret-color: #ffffff; font-family: 'JetBrains Mono', monospace; font-size: 12.5px; line-height: 1.6; padding: 14px; border: none; outline: none; resize: none; box-sizing: border-box; tab-size: 4; white-space: pre; overflow: auto;"></textarea>
                </div>
                <div style="display: flex; gap: 10px; align-items: center; justify-content: space-between; padding-top: 4px;">
                    <span style="font-size: 11px; color: var(--text-dark); font-family: 'JetBrains Mono', monospace;">Ctrl+S to save changes</span>
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <button id="cancel-block-edit" style="background: var(--surface-high); border: none; color: var(--text-muted); padding: 8px 18px; border-radius: 8px; font-size: 11.5px; font-weight: 700; cursor: pointer; transition: all 0.15s;" onmouseenter="this.style.background='var(--surface-highest)'; this.style.color='#fff';" onmouseleave="this.style.background='var(--surface-high)'; this.style.color='var(--text-muted)';">Cancel</button>
                        <button id="save-block-edit" style="background: var(--primary); color: #fff; border: none; padding: 8px 22px; border-radius: 8px; font-size: 11.5px; font-weight: 700; cursor: pointer; transition: all 0.15s; box-shadow: 0 4px 12px var(--primary-glow);" onmouseenter="this.style.background='var(--primary-light)';" onmouseleave="this.style.background='var(--primary)';">Save Block Changes</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const textarea = modal.querySelector('#block-edit-textarea');
        const updateModalHighlight = () => {
            const codeEl = modal.querySelector('#block-edit-code');
            const preEl = modal.querySelector('#block-edit-pre');
            if (!codeEl || !preEl || !textarea) return;
            
            let ext = path.extname(window.currentEditingPath || '').toLowerCase().substring(1);
            let lang = window.getSafeHljsLang(ext);
            
            let val = textarea.value;
            if (val.endsWith('\n')) val += ' ';
            
            if (typeof hljs !== 'undefined') {
                codeEl.innerHTML = hljs.highlight(val, { language: lang, ignoreIllegals: true }).value;
            } else {
                codeEl.textContent = val;
            }
            preEl.scrollTop = textarea.scrollTop;
            preEl.scrollLeft = textarea.scrollLeft;
        };
        modal.updateModalHighlight = updateModalHighlight;

        textarea.oninput = () => {
            updateModalHighlight();
        };
        textarea.onscroll = () => {
            const preEl = modal.querySelector('#block-edit-pre');
            if (preEl) {
                preEl.scrollTop = textarea.scrollTop;
                preEl.scrollLeft = textarea.scrollLeft;
            }
        };

        textarea.onkeydown = (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                textarea.value = textarea.value.substring(0, start) + '    ' + textarea.value.substring(end);
                textarea.selectionStart = textarea.selectionEnd = start + 4;
                updateModalHighlight();
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
    if (modal.updateModalHighlight) modal.updateModalHighlight();
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
                    if (window._lastSaveTimestamp && (Date.now() - window._lastSaveTimestamp) < 1500) {
                        return;
                    }
                    clearTimeout(watchDebounceTimer);
                    watchDebounceTimer = setTimeout(() => {
                        if (!window.isEditingMode && window.currentEditingPath === filePath) {
                            console.log("[FileWatcher] Real-time updating file viewer for:", filePath);
                            const scrollCont = document.getElementById('editor-scroll-container');
                            let currentLineNum = 1;
                            if (scrollCont) {
                                const lineSpans = document.querySelectorAll('#editor-content .line-num');
                                for (const span of lineSpans) {
                                    const el = span.closest('.rg-line, .rg-header, .rg-footer') || span;
                                    if (el.offsetTop >= scrollCont.scrollTop) {
                                        currentLineNum = parseInt(span.textContent, 10) || 1;
                                        break;
                                    }
                                }
                            }
                            window.openFileInEditor(filePath, currentLineNum);
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
    if (btnEdit) {
        btnEdit.style.color = 'var(--text-muted)';
        btnEdit.style.background = 'transparent';
        btnEdit.style.borderColor = 'transparent';
        btnEdit.style.boxShadow = 'none';
        btnEdit.title = 'View Mode (Click for Code Edit Mode </ >)';
        btnEdit.innerHTML = '<svg id="editor-edit-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>';
        btnEdit.onclick = () => window.toggleEditorEditMode();
    }

    const fs = require('fs');
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
        if (titleEl) titleEl.innerText = path.basename(filePath);

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

        const headerActions = document.getElementById('editor-header-actions');
        if (headerActions) headerActions.style.display = 'none';

        if (ext === 'pdf') {
            const fileUrl = `file:///${filePath.replace(/\\/g, '/')}`;
            editorContent.innerHTML = `<div id="editor-scroll-container" style="position: absolute; inset: 0; background:#0c0c0e;"><iframe src="${fileUrl}" style="width:100%; height:100%; border:none;"></iframe></div>`;
            return;
        }

        const videoExts = ['mp4', 'webm', 'ogv', 'mov', 'mkv'];
        if (videoExts.includes(ext)) {
            const fileUrl = `file:///${filePath.replace(/\\/g, '/')}`;
            editorContent.innerHTML = `
                <div id="editor-scroll-container" style="position: absolute; inset: 0; display:flex; flex-direction:column; justify-content:center; align-items:center; background:#040406; padding: 24px; box-sizing:border-box;">
                    <div style="max-width: 90%; max-height: 85%; border-radius: 12px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.8); border: 1px solid rgba(255,255,255,0.08); background: #000;">
                        <video src="${fileUrl}" controls autoplay style="max-width: 100%; max-height: 75vh; display: block; outline: none;"></video>
                    </div>
                </div>
            `;
            return;
        }

        const audioExts = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'];
        if (audioExts.includes(ext)) {
            const fileUrl = `file:///${filePath.replace(/\\/g, '/')}`;
            editorContent.innerHTML = `
                <div id="editor-scroll-container" style="position: absolute; inset: 0; display:flex; justify-content:center; align-items:center; background:var(--bg-color); font-family:'DM Sans', 'Outfit', sans-serif; padding:20px; box-sizing:border-box;">
                    <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.07); border-radius: 16px; padding: 36px 44px; display: flex; flex-direction: column; align-items: center; text-align: center; width: 380px; box-shadow: 0 20px 50px rgba(0,0,0,0.4);">
                        <div style="width: 54px; height: 54px; border-radius: 14px; background: rgba(56, 189, 248, 0.1); display: flex; align-items: center; justify-content: center; color: #38bdf8; margin-bottom: 16px;">
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
                        </div>
                        <div style="font-size: 15px; font-weight: 700; color: #ffffff; margin-bottom: 4px; word-break: break-all;">${path.basename(filePath)}</div>
                        <div style="font-size: 11.5px; color: var(--text-muted); margin-bottom: 20px;">Audio Media Player</div>
                        <audio src="${fileUrl}" controls style="width: 100%; outline: none; border-radius: 8px; filter: invert(0.9) hue-rotate(180deg);"></audio>
                    </div>
                </div>
            `;
            return;
        }

        const binaryExts = ['exe', 'dll', 'bin', 'zip', 'rar', 'tar', 'gz', '7z', 'avi', 'iso', 'so', 'dylib', 'class', 'jar', 'war', 'db', 'sqlite'];
        if (binaryExts.includes(ext)) {
            editorContent.innerHTML = `
                <div style="position: absolute; inset: 0; display:flex; justify-content:center; align-items:center; background:var(--bg-color); font-family:'DM Sans', 'Outfit', sans-serif; box-sizing:border-box; padding:20px;">
                    <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.07); border-radius: 16px; padding: 36px 44px; display: flex; flex-direction: column; align-items: center; text-align: center; max-width: 360px; box-shadow: 0 20px 50px rgba(0,0,0,0.4);">
                        <div style="width: 48px; height: 48px; border-radius: 12px; background: rgba(245, 158, 11, 0.1); border: none; display: flex; align-items: center; justify-content: center; color: #f59e0b; margin-bottom: 16px;">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="12" y1="9" x2="12.01" y2="9"></line></svg>
                        </div>
                        <div style="font-size: 15px; font-weight: 700; color: #ffffff; margin-bottom: 8px; letter-spacing: 0.2px;">Binary File Detected</div>
                        <div style="font-size: 12px; color: var(--text-muted); line-height: 1.6; margin-bottom: 22px;">This file is in binary format and cannot be displayed as plain text in the editor.</div>
                        <button onclick="const ipc = require('electron').ipcRenderer; ipc.send('reveal-in-explorer', '${filePath.replace(/\\/g, '\\\\')}');" 
                                style="background: rgba(255, 255, 255, 0.08); border: none; color: #ffffff; padding: 9px 18px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: all 0.2s ease;"
                                onmouseover="this.style.background='rgba(255, 255, 255, 0.15)';"
                                onmouseout="this.style.background='rgba(255, 255, 255, 0.08)';">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                            Reveal in Windows Explorer
                        </button>
                    </div>
                </div>
            `;
            return;
        }

        if (imageExts.includes(ext)) {
            const base64 = fs.readFileSync(filePath).toString('base64');
            const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
            
            editorContent.innerHTML = `
                <div id="image-viewer-wrapper" style="position: absolute; inset: 0; background: #050505; display: flex; flex-direction: column; overflow: hidden; user-select: none;">
                    <!-- Floating Control Toolbar -->
                    <div style="position: absolute; top: 16px; right: 20px; z-index: 50; display: flex; align-items: center; gap: 6px; background: rgba(18, 18, 22, 0.85); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.12); padding: 5px 10px; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.5);">
                        <button id="img-zoom-out" style="background: rgba(255,255,255,0.06); border: none; color: #fff; width: 26px; height: 26px; border-radius: 5px; cursor: pointer; font-size: 14px; font-weight: bold; display: flex; align-items: center; justify-content: center; transition: background 0.15s;" title="Zoom Out (-)" onmouseenter="this.style.background='rgba(255,255,255,0.15)'" onmouseleave="this.style.background='rgba(255,255,255,0.06)'">-</button>
                        <span id="img-zoom-level" style="font-size: 11.5px; font-weight: 700; color: #e2e8f0; font-family: 'DM Sans', sans-serif; min-width: 44px; text-align: center;">100%</span>
                        <button id="img-zoom-in" style="background: rgba(255,255,255,0.06); border: none; color: #fff; width: 26px; height: 26px; border-radius: 5px; cursor: pointer; font-size: 14px; font-weight: bold; display: flex; align-items: center; justify-content: center; transition: background 0.15s;" title="Zoom In (+)" onmouseenter="this.style.background='rgba(255,255,255,0.15)'" onmouseleave="this.style.background='rgba(255,255,255,0.06)'">+</button>
                        <div style="width: 1px; height: 16px; background: rgba(255,255,255,0.15); margin: 0 2px;"></div>
                        <button id="img-zoom-reset" style="background: rgba(255,255,255,0.06); border: none; color: var(--text-muted); padding: 4px 10px; border-radius: 5px; cursor: pointer; font-size: 11px; font-weight: 600; font-family: 'DM Sans', sans-serif; transition: all 0.15s;" title="Reset Zoom (100%)" onmouseenter="this.style.color='#fff'; this.style.background='rgba(255,255,255,0.15)'" onmouseleave="this.style.color='var(--text-muted)'; this.style.background='rgba(255,255,255,0.06)'">100%</button>
                    </div>

                    <!-- Image Pan/Zoom Container -->
                    <div id="image-zoom-container" style="flex: 1; position: relative; overflow: hidden; display: flex; justify-content: center; align-items: center; cursor: grab;">
                        <img id="image-target-el" src="data:${mime};base64,${base64}" style="max-width: 90%; max-height: 90%; object-fit: contain; transform-origin: center center; transition: transform 0.05s ease-out; box-shadow: 0 8px 32px rgba(0,0,0,0.6); pointer-events: auto;">
                    </div>
                </div>
            `;

            setTimeout(() => {
                const container = document.getElementById('image-zoom-container');
                const img = document.getElementById('image-target-el');
                const zoomInBtn = document.getElementById('img-zoom-in');
                const zoomOutBtn = document.getElementById('img-zoom-out');
                const zoomResetBtn = document.getElementById('img-zoom-reset');
                const zoomLevelLbl = document.getElementById('img-zoom-level');

                if (!container || !img) return;

                let scale = 1;
                let translateX = 0;
                let translateY = 0;
                let isDragging = false;
                let startX = 0;
                let startY = 0;

                const updateTransform = (animate = false) => {
                    img.style.transition = animate ? 'transform 0.2s ease-out' : 'none';
                    img.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
                    if (zoomLevelLbl) zoomLevelLbl.innerText = `${Math.round(scale * 100)}%`;
                };

                const setZoom = (newScale, animate = true) => {
                    scale = Math.min(Math.max(0.1, newScale), 5);
                    if (scale === 1) {
                        translateX = 0;
                        translateY = 0;
                    }
                    updateTransform(animate);
                };

                container.addEventListener('wheel', (e) => {
                    e.preventDefault();
                    const delta = e.deltaY < 0 ? 1.15 : 0.85;
                    setZoom(scale * delta, false);
                }, { passive: false });

                let dragButton = 0;

                const stopDrag = () => {
                    if (isDragging) {
                        isDragging = false;
                        if (container) container.style.cursor = 'grab';
                    }
                };

                const startDrag = (e) => {
                    // Left click (0) or Middle Wheel click (1)
                    if (e.button !== 0 && e.button !== 1) return;
                    e.preventDefault();
                    dragButton = e.button;
                    isDragging = true;
                    startX = e.clientX - translateX;
                    startY = e.clientY - translateY;
                    container.style.cursor = 'grabbing';
                };

                container.addEventListener('mousedown', startDrag);
                img.addEventListener('mousedown', startDrag);

                window.addEventListener('mousemove', (e) => {
                    if (!isDragging) return;
                    if (e.buttons === 0) {
                        stopDrag();
                        return;
                    }
                    if (dragButton === 0 && !(e.buttons & 1)) {
                        stopDrag();
                        return;
                    }
                    if (dragButton === 1 && !(e.buttons & 4)) {
                        stopDrag();
                        return;
                    }
                    translateX = e.clientX - startX;
                    translateY = e.clientY - startY;
                    updateTransform(false);
                });

                window.addEventListener('mouseup', stopDrag);
                window.addEventListener('pointerup', stopDrag);
                window.addEventListener('mouseleave', stopDrag);
                window.addEventListener('blur', stopDrag);

                container.addEventListener('dblclick', () => {
                    if (scale !== 1) {
                        setZoom(1, true);
                    } else {
                        setZoom(2, true);
                    }
                });

                if (zoomInBtn) zoomInBtn.onclick = () => setZoom(scale * 1.25, true);
                if (zoomOutBtn) zoomOutBtn.onclick = () => setZoom(scale * 0.8, true);
                if (zoomResetBtn) zoomResetBtn.onclick = () => setZoom(1, true);
            }, 50);
            return;
        } else {
            if (headerActions) headerActions.style.display = 'flex';
            const content = fs.readFileSync(filePath, 'utf-8').replace(/\r/g, '');
            if (typeof hljs !== 'undefined') {
                const linesRaw = content.split('\n');
                let lang = window.getSafeHljsLang(ext);
                if (typeof window.updateStatusBar === 'function') {
                    window.updateStatusBar(filePath, linesRaw.length, (ext || 'txt').toUpperCase());
                }
                const foldLangs = ['js', 'jsx', 'ts', 'tsx', 'javascript', 'typescript', 'html', 'css', 'json', 'c', 'cpp', 'java', 'go', 'rs', 'py', 'python', 'php', 'swift'];
                const shouldFold = foldLangs.includes(ext) || foldLangs.includes(lang);
                const lines = hljs.highlight(content, { language: lang, ignoreIllegals: true }).value.split('\n');
                const maxLineDigits = String(linesRaw.length).length;
                const gutterWidth = Math.max(38, maxLineDigits * 9 + 18);
                
                let finalHTML = ''; let minimapHTML = ''; let blockStack = []; let blockCounter = 0; 

                for (let i = 0; i < linesRaw.length; i++) {
                    let line = linesRaw[i]; let htmlLine = lines[i]; let lineNum = i + 1;
                    let lineNumHTML = `<span class="line-num">${lineNum}</span>`;
                    
                    let pureText = line.trim(); let spaces = (line.match(/^\s*/) || [''])[0].length; 
                    let mmColor = '#94a3b8';
                    
                    if (pureText.startsWith('//') || pureText.startsWith('/*') || pureText.startsWith('*') || pureText.startsWith('#') || pureText.startsWith('<!--')) {
                        mmColor = '#475569';
                    } else if (pureText.startsWith('</')) {
                        mmColor = '#475569';
                    } else if (pureText.startsWith('<div') || pureText.startsWith('<main') || pureText.startsWith('<aside') || pureText.startsWith('<section') || pureText.startsWith('<header') || pureText.startsWith('<button')) {
                        mmColor = '#3b82f6';
                    } else if (pureText.startsWith('<')) {
                        mmColor = '#38bdf8';
                    } else if (/\b(const|let|var|function|class|return|if|else|import|export|from|async|await|def|public|private)\b/.test(pureText)) {
                        mmColor = '#3b82f6';
                    } else if (pureText.includes('=>') || pureText.includes('{') || pureText.includes('}')) {
                        mmColor = '#f59e0b';
                    } else if (/^["'`](.*)["'`]$/.test(pureText) || pureText.includes('="') || pureText.includes("='")) {
                        mmColor = '#a855f7';
                    }

                    let mmLineWidth = Math.min(pureText.length * 0.8, 45);
                    let mmLine = pureText.length > 0 ? `<div style="height:2px; margin-bottom:1px; margin-left:${Math.min(spaces, 20)}px; width:${Math.max(6, mmLineWidth)}px; background:${mmColor}; border-radius:1px; opacity: 0.85;"></div>` : `<div style="height:2px; margin-bottom:1px;"></div>`;
                    
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
                        
                        finalHTML += `</div></details><div class="rg-footer" data-end="${i}">${lineNumHTML}<div style="display:flex; align-items:center; flex:1; min-width:0; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; margin-right:10px;"><span class="line-code-text" style="white-space:pre; outline:none;" spellcheck="false">${htmlLine}</span> <span class="footer-tag" style="margin-left: 8px;">// ${safeTitle}</span> <span style="color:var(--text-muted); font-size:10px; font-weight:bold; margin-left:8px; background:var(--surface-low); border: none; padding:1px 6px; border-radius:10px;">${lineCount} lines</span></div><div class="go-top-btn" onclick="const el = document.getElementById('editor-${popped.id}'); if(el){ document.getElementById('editor-scroll-container').scrollTo({top: el.offsetTop - 20, behavior: 'smooth'}); } event.stopPropagation();" title="Go to block start"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg></div></div></div>`;
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
                        .line-num { position: sticky; left: 0; z-index: 2; display: inline-flex; align-items: center; justify-content: flex-end; width: ${gutterWidth}px; min-width: ${gutterWidth}px; text-align: right; color: #555; user-select: none; margin-right: 12px; font-size: 11px; font-family: 'JetBrains Mono', monospace; border-right: 1px solid #333; padding-right: 8px; flex-shrink: 0; transition: color 0.1s; background: transparent; box-sizing: border-box; align-self: stretch; }
                        .rg-line .line-num { background: var(--bg-color); } .rg-line:hover .line-num { background: var(--surface-color); }
                        .rg-body .rg-line .line-num { background: var(--surface-lowest); } .rg-body .rg-line:hover .line-num { background: var(--surface-high); }
                        
                        .rg-block { margin: 6px 4px; border: 1px solid var(--border-color); border-radius: 7px; background: var(--surface-lowest); transition: border-color 0.15s; display: block; max-width: calc(100% - 8px); overflow: hidden; box-shadow: none !important; }
                        .rg-body .rg-block { margin: 2px 0 2px 12px; }
                        .rg-block:hover { border-color: #ffffff; box-shadow: none !important; } .rg-block:has(.rg-block:hover) { border-color: var(--border-color) !important; }
                        
                        details:not([open]) > .rg-header { border-radius: 6px !important; box-shadow: none !important; }
                        details:not([open]), details[open] { box-shadow: none !important; }
                        .rg-header { cursor: pointer; padding: 0 10px 0 0; background: var(--surface-color); display: flex; align-items: stretch; list-style: none; border-radius: 6px 6px 0 0; transition: background 0.1s; max-width: 100%; box-sizing: border-box; min-height: 24px; box-shadow: none !important; }
                        .rg-header .line-num { padding-top: 3px; padding-bottom: 3px; }
                        .rg-header .line-code-text { display: inline-flex; align-items: center; padding-top: 3px; padding-bottom: 3px; }
                        .rg-header::-webkit-details-marker { display: none; } .rg-header:hover { background: var(--surface-high); box-shadow: none !important; } .rg-header:hover .line-num { color: #aaa; }
                        
                        .box-paste-btn { font-size: 10px; font-weight: bold; color: var(--text-muted); background: transparent; border: 1px solid transparent; border-radius: 4px; padding: 2px 8px; cursor: pointer; transition: all 0.2s; opacity: 0; display: flex; align-items: center; flex-shrink: 0; align-self: center; }
                        .rg-header:hover .box-paste-btn { opacity: 1; } .box-paste-btn:hover { background: transparent !important; color: #ffffff !important; border-color: transparent !important; }
                        
                        .box-edit-btn { font-size: 10px; font-weight: bold; color: var(--text-muted); background: transparent; border: 1px solid transparent; border-radius: 4px; padding: 4px; cursor: pointer; transition: all 0.2s; opacity: 0; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-right: 4px; align-self: center; }
                        .rg-header:hover .box-edit-btn { opacity: 1; } .box-edit-btn:hover { background: transparent !important; color: #ffffff !important; border-color: transparent !important; }
                        
                        .box-copy-btn { font-size: 10px; font-weight: bold; color: var(--text-muted); background: transparent; border: 1px solid transparent; border-radius: 4px; padding: 4px; cursor: pointer; transition: all 0.2s; opacity: 0; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-right: 6px; align-self: center; }
                        .rg-header:hover .box-copy-btn { opacity: 1; } .box-copy-btn:hover { background: transparent !important; color: #ffffff !important; border-color: transparent !important; }
                        
                        .box-fold-btn { font-size: 10px; font-weight: bold; color: var(--text-muted); background: transparent; border: 1px solid transparent; border-radius: 4px; padding: 4px; cursor: pointer; transition: all 0.2s; opacity: 0; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-right: 4px; align-self: center; }
                        .rg-header:hover .box-fold-btn { opacity: 1; } .box-fold-btn:hover { background: transparent !important; color: #ffffff !important; border-color: transparent !important; }
                        
                        .caret { display: inline-block; color: var(--text-muted); font-size: 10px; margin-left: 8px; transition: transform 0.2s ease; flex-shrink: 0; align-self: center; } details[open] > .rg-header .caret { transform: rotate(90deg); }
                        
                        .rg-body { padding: 0; border-top: none; overflow-x: auto; overflow-y: hidden; width: 100%; box-sizing: border-box; }
                        .rg-body::-webkit-scrollbar { height: 6px; } .rg-body::-webkit-scrollbar-track { background: transparent; }
                        .rg-body::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; } .rg-body::-webkit-scrollbar-thumb:hover { background: #555; }
                        
                        .rg-footer { padding: 0 10px 0 0; background: var(--surface-color); border-top: none; border-radius: 0 0 6px 6px; display: flex; align-items: stretch; transition: background 0.1s; max-width: 100%; box-sizing: border-box; min-height: 24px; }
                        .rg-footer .line-num { padding-top: 3px; padding-bottom: 3px; }
                        .rg-footer .footer-tag { display: inline-flex; align-items: center; padding-top: 3px; padding-bottom: 3px; }
                        .rg-footer:hover { background: var(--surface-high); } .rg-footer:hover .line-num { color: #aaa; } .footer-tag { color: #888; font-size: 10px; font-style: italic; white-space: nowrap; }
                        
                        .go-top-btn { font-size: 10px; font-weight: bold; color: var(--text-muted); background: transparent; border: 1px solid transparent; border-radius: 4px; padding: 4px; cursor: pointer; transition: all 0.2s; opacity: 0; display: flex; align-items: center; justify-content: center; flex-shrink: 0; align-self: center; }
                        .rg-footer:hover .go-top-btn { opacity: 1; } .go-top-btn:hover { background: transparent !important; color: #ffffff !important; border-color: transparent !important; }
                        
                        .rg-line { padding: 0 10px 0 0; margin: 0; border-radius: 4px; line-height: 1.5; position: relative; z-index: 1; display: flex; align-items: stretch; transition: background 0.1s; width: 100%; box-sizing: border-box; min-height: 24px; }
                        .rg-line .line-num { padding-top: 3px; padding-bottom: 3px; }
                        .rg-line .line-code-text { display: inline-flex; align-items: center; padding-top: 3px; padding-bottom: 3px; }
                        .rg-line:hover { background: rgba(255, 255, 255, 0.08); border-radius: 4px; } .rg-line:hover .line-num { color: #aaa; }
                        
                        .search-highlight { background: rgba(212, 160, 23, 0.2) !important; border-radius: 2px; } .search-highlight .line-num { color: #d4a017 !important; font-weight: bold; }
                        .search-highlight-active { background: rgba(212, 160, 23, 0.6) !important; outline: 1px solid #d4a017; border-radius: 2px; } .search-highlight-active .line-num { color: #fff !important; background: #d4a017 !important; font-weight: bold; }
                        
                        #minimap-thumb:hover { background: rgba(255, 255, 255, 0.15) !important; border-color: rgba(255, 255, 255, 0.4) !important; }
                        .mini-detail, .mini-body, .mini-footer { margin: 0; padding: 0; outline: none; } .mini-summary { list-style: none; margin: 0; padding: 0; display: block; } .mini-summary::-webkit-details-marker { display: none; }
                    </style>
                    <div style="display: flex; position: absolute; inset: 0; background: var(--bg-color); overflow: hidden;">
                        <div id="editor-scroll-container" style="flex: 1; overflow-y: auto; overflow-x: hidden; padding: 14px 18px; box-sizing: border-box; position: relative;">
                            <pre style="margin:0; padding:0; width:100%; max-width:100%; overflow-x:auto;"><code class="hljs" style="font-family:'JetBrains Mono', monospace; font-size:13px; background:transparent; display:block; width:100%; padding:0; margin:0;">${finalHTML}</code></pre>
                        </div>
                        <div id="minimap-container" style="width: 70px; min-width: 70px; background: var(--surface-lowest); border-left: 1px solid var(--border-color); position: relative; user-select: none;">
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
 
                    const btnPrev = document.getElementById('btn-search-prev');
                    const btnNext = document.getElementById('btn-search-next');

                    const gotoNextMatch = () => {
                        if (matchedElements.length > 0) {
                            currentMatchIndex = (currentMatchIndex + 1) % matchedElements.length;
                            scrollToCurrentMatch();
                        }
                    };

                    const gotoPrevMatch = () => {
                        if (matchedElements.length > 0) {
                            currentMatchIndex = (currentMatchIndex - 1 + matchedElements.length) % matchedElements.length;
                            scrollToCurrentMatch();
                        }
                    };

                    if (btnNext) btnNext.onclick = (e) => { e.preventDefault(); gotoNextMatch(); };
                    if (btnPrev) btnPrev.onclick = (e) => { e.preventDefault(); gotoPrevMatch(); };

                    searchInput.onkeydown = (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            if (e.shiftKey) {
                                gotoPrevMatch();
                            } else {
                                gotoNextMatch();
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
                        const isEdit = window.isEditingMode;
                        const targetCont = isEdit ? document.getElementById('editor-raw-textarea') : scrollCont;
                        if (!targetCont) return;

                        const sh = targetCont.scrollHeight, ch = targetCont.clientHeight;
                        miniThumb.style.display = 'block';
                        
                        if (sh <= ch) {
                            miniThumb.style.height = miniCont.clientHeight + 'px';
                            miniThumb.style.top = '0px';
                            miniThumb.style.opacity = '0.25';
                            if (miniTrack) miniTrack.style.transform = `translateY(0px)`;
                            return;
                        }
                        
                        miniThumb.style.opacity = '';
                        const thumbHeight = Math.max((ch / sh) * miniCont.clientHeight, 20); 
                        miniThumb.style.height = thumbHeight + 'px';
                        const maxScroll = sh - ch;
                        const scrollRatio = maxScroll > 0 ? targetCont.scrollTop / maxScroll : 0;
                        miniThumb.style.top = (scrollRatio * (miniCont.clientHeight - thumbHeight)) + 'px';
                        if (miniTrack && miniTrack.scrollHeight > miniCont.clientHeight) {
                            miniTrack.style.transform = `translateY(-${scrollRatio * (miniTrack.scrollHeight - miniCont.clientHeight + 20)}px)`;
                        } else if (miniTrack) { miniTrack.style.transform = `translateY(0px)`; }
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
                        const ratio = thumbMax > 0 ? targetTop / thumbMax : 0;
                        if (window.isEditingMode) {
                            const editArea = document.getElementById('editor-raw-textarea');
                            if (editArea) editArea.scrollTop = ratio * (editArea.scrollHeight - editArea.clientHeight);
                        } else {
                            scrollCont.scrollTop = ratio * (scrollCont.scrollHeight - scrollCont.clientHeight);
                        }
                    };
                    miniCont.onmousedown = (e) => {
                        if (e.target === miniThumb) return;
                        const rect = miniCont.getBoundingClientRect();
                        const ratio = rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0;
                        if (window.isEditingMode) {
                            const editArea = document.getElementById('editor-raw-textarea');
                            if (editArea) editArea.scrollTop = ratio * editArea.scrollHeight - editArea.clientHeight / 2;
                        } else {
                            scrollCont.scrollTop = ratio * scrollCont.scrollHeight - scrollCont.clientHeight / 2;
                        }
                        updateThumb();
                    };
                if (targetScrollTop !== null && scrollCont) {
                    const applyScroll = () => {
                        if (typeof targetScrollTop === 'number') {
                            const lineSpans = editorContent.querySelectorAll('.line-num');
                            let targetEl = null;
                            for (const span of lineSpans) {
                                const num = parseInt(span.textContent, 10);
                                if (num >= targetScrollTop) {
                                    targetEl = span.closest('.rg-line, .rg-header, .rg-footer') || span;
                                    break;
                                }
                            }
                            if (targetEl) {
                                scrollCont.scrollTop = Math.max(0, targetEl.offsetTop - 10);
                            }
                        }
                        if (typeof updateThumb === 'function') updateThumb();
                    };
                    applyScroll();
                    requestAnimationFrame(applyScroll);
                    setTimeout(applyScroll, 40);
                    setTimeout(applyScroll, 120);
                }
            }
        }
    }
    } catch (err) {
        editorContent.innerHTML = `<div style="position: absolute; inset: 0; overflow:auto; background:#000; color:#f44; padding:20px; font-family:'JetBrains Mono', monospace;">Failed to open file:<br>${err.message}</div>`;
    }
};
