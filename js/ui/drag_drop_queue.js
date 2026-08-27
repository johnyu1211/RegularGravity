window.toggleBackdropBlur = function(show) {
    const vLC = document.getElementById('inspector-local-chat');
    if (vLC) {
        if (show) {
            vLC.classList.add('modal-backdrop-blur');
        } else {
            vLC.classList.remove('modal-backdrop-blur');
        }
    }
};

window.updateDragDropQueueUI = function() {
    const containerEl = document.getElementById('drag-drop-queue-container');
    const listEl = document.getElementById('drag-drop-queue-list');
    const countEl = document.getElementById('requested-files-count');
    if (!listEl) {
        console.error('[updateDragDropQueueUI] listEl not found!');
        return;
    }
    
    const warningEl = document.getElementById('drag-drop-queue-warning');
    if (warningEl) {
        if (window.dragDropAbortMessage) {
            warningEl.innerHTML = window.dragDropAbortMessage;
            warningEl.style.color = '#ff4444';
            warningEl.style.display = 'flex';
        } else {
            warningEl.innerHTML = ``;
            warningEl.style.display = 'none';
        }
    }
    
    // Toggle container display based on dragDropMode and presence of items in the queue
    const hasItems = window.requestedFilesQueue && window.requestedFilesQueue.length > 0;
    if (containerEl) {
        if (window.dragDropMode && hasItems) {
            containerEl.style.display = 'flex';
            if (typeof syncBrowserView === 'function') syncBrowserView();

            window.toggleBackdropBlur(true);
            if (typeof window.setCoverLifted === 'function') {
                window.setCoverLifted(true);
            }
        } else {
            containerEl.style.display = 'none';
            if (typeof syncBrowserView === 'function') syncBrowserView();

            window.toggleBackdropBlur(false);
            if (typeof window.setCoverLifted === 'function') {
                window.setCoverLifted(false);
            }
        }
    }
    
    const closeBtn = document.getElementById('close-drag-drop-queue');
    const bottomCloseBtn = document.getElementById('btn-close-drag-drop-queue-bottom');

    const handleCloseQueue = () => {
        containerEl.style.display = 'none';
        if (typeof syncBrowserView === 'function') syncBrowserView();
        window.toggleBackdropBlur(false);
        window.dragDropMode = false;
        window.requestedFilesQueue = [];
        if (typeof window.setCoverLifted === 'function') {
            window.setCoverLifted(false);
        }
        if (typeof window.activeDragDropCleanup === 'function') {
            window.activeDragDropCleanup();
        }
    };

    if (closeBtn && containerEl) closeBtn.onclick = handleCloseQueue;
    if (bottomCloseBtn && containerEl) bottomCloseBtn.onclick = handleCloseQueue;
    
    listEl.innerHTML = '';
    
    if (countEl) countEl.innerText = window.requestedFilesQueue.filter(item => item.status === 'PENDING').length;
    
    if (window.requestedFilesQueue.length === 0) {
        listEl.innerHTML = `<div style="font-size: 11px; color: var(--text-dark); text-align: center; margin-top: 50px; font-family: 'DM Sans', sans-serif;">No requested files</div>`;
        return;
    }
    
    const isBrowserMode = !window.process || window.process.platform === 'browser';
    const titleEl = document.getElementById('drag-drop-queue-title-text');
    const descEl = document.getElementById('drag-drop-queue-desc-text');
    if (isBrowserMode) {
        if (titleEl) titleEl.innerText = 'COPY PAYLOAD HELPER';
        if (descEl) descEl.innerHTML = 'Click <strong>[Copy]</strong> ➔ Paste (Ctrl+V) into AI Chat ➔ Press Enter.';
    } else {
        if (titleEl) titleEl.innerText = 'REQUIRED FILES';
        if (descEl) descEl.innerHTML = 'Files requested by AI. <strong>Drag &amp; drop items</strong> into the Web AI input field.';
    }

    window.requestedFilesQueue.forEach(item => {
        const itemEl = document.createElement('div');
        itemEl.className = 'queue-item';
        itemEl.draggable = item.status === 'PENDING' && !isBrowserMode;
        itemEl.setAttribute('data-filepath', item.absolutePath);
        
        const isCompleted = item.status === 'COMPLETED';
        
        itemEl.style.cssText = `
            display: flex;
            align-items: center;
            padding: 8px 12px;
            background: ${isCompleted ? 'rgba(255, 255, 255, 0.02)' : 'var(--surface-color)'};
            border: 1px solid ${isCompleted ? 'rgba(255, 255, 255, 0.05)' : 'var(--border-color)'};
            border-radius: 6px;
            cursor: ${isCompleted ? 'default' : 'pointer'};
            user-select: none;
            transition: all 0.2s;
            opacity: ${isCompleted ? '0.35' : '1'};
        `;
        
        itemEl.onmouseenter = () => {
            itemEl.style.background = 'var(--surface-high)';
            itemEl.style.borderColor = 'rgba(255, 255, 255, 0.15)';
        };
        itemEl.onmouseleave = () => {
            itemEl.style.background = isCompleted ? 'rgba(255, 255, 255, 0.02)' : 'var(--surface-color)';
            itemEl.style.borderColor = isCompleted ? 'rgba(255, 255, 255, 0.05)' : 'var(--border-color)';
        };
        itemEl.ondragstart = (e) => {
            if (!isBrowserMode) {
                e.preventDefault();
                ipcRenderer.send('ondragstart', item.absolutePath);
            }
        };
        
        const fileName = item.relativePath.split(/[\\/]/).pop();
        itemEl.innerHTML = `
            <span class="queue-file-name" style="font-size: 12px; color: ${isCompleted ? 'var(--text-muted)' : 'var(--text-main)'}; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; padding: 2px 4px; ${isCompleted ? 'text-decoration: line-through;' : ''}" title="${item.relativePath}">${fileName}</span>
        `;

        if (isBrowserMode) {
            const btnContainer = document.createElement('div');
            btnContainer.style.cssText = 'display:flex; align-items:center; gap:6px; margin-left:8px; flex-shrink:0;';

            const copyBtn = document.createElement('button');
            copyBtn.innerHTML = 'Copy';
            copyBtn.style.cssText = 'background:var(--primary); border:none; color:#fff; font-size:11px; padding:4px 14px; border-radius:5px; cursor:pointer; font-weight:700; transition:all 0.2s;';
            
            const doCopyAction = (e) => {
                if (e) e.stopPropagation();
                try {
                    const fs = require('fs');
                    const text = fs.readFileSync(item.absolutePath, 'utf-8');
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(text);
                    }
                    const chatInputEl = document.getElementById('local-agent-input');
                    if (chatInputEl) {
                        chatInputEl.value = text;
                        chatInputEl.focus();
                    }
                    if (typeof window.showUserScreenToast === 'function') {
                        window.showUserScreenToast(`Copied "${fileName}"! Paste (Ctrl+V) into AI chat.`, 2500, true);
                    }
                    handleCloseQueue();
                } catch(err) {}
            };

            copyBtn.onclick = doCopyAction;
            itemEl.onclick = doCopyAction;

            btnContainer.appendChild(copyBtn);
            itemEl.appendChild(btnContainer);
        } else {
            const btnContainer = document.createElement('div');
            btnContainer.style.cssText = 'display:flex; align-items:center; gap:6px; margin-left:8px; flex-shrink:0;';

            const dropBtn = document.createElement('button');
            dropBtn.innerHTML = 'Drop to AI';
            dropBtn.style.cssText = 'background: linear-gradient(135deg, #468CF6, #3b82f6); border: none; color: #fff; font-size: 11px; padding: 4px 12px; border-radius: 5px; cursor: pointer; font-weight: 700; transition: all 0.2s; font-family: "DM Sans", sans-serif;';
            
            const doDropAction = async (e) => {
                if (e) e.stopPropagation();
                dropBtn.innerText = 'Dropping...';
                dropBtn.style.opacity = '0.7';
                await window.performCdpDrop([item.absolutePath], () => {
                    item.status = 'COMPLETED';
                    const remainingPending = window.requestedFilesQueue.filter(f => f.status === 'PENDING');
                    if (remainingPending.length === 0) {
                        setTimeout(() => handleCloseQueue(), 400);
                    } else {
                        window.updateDragDropQueueUI();
                    }
                });
            };

            dropBtn.onclick = doDropAction;
            btnContainer.appendChild(dropBtn);
            itemEl.appendChild(btnContainer);

            itemEl.onclick = (e) => {
                e.stopPropagation();
                if (typeof window.openFileInEditor === 'function' && item.absolutePath) {
                    window.openFileInEditor(item.absolutePath);
                }
            };
        }
        
        listEl.appendChild(itemEl);
    });

    
    if (window.dragDropMode && window.requestedFilesQueue.filter(item => item.status === 'PENDING').length > 0) {
        if (!window.autoClickingQueue) {
            setTimeout(() => {
                window.autoClickPendingQueueItems();
            }, 600);
        }
    }
};

window.performCdpDrop = async function(filePaths = [], onComplete = null) {
    if (!filePaths || filePaths.length === 0) return false;
    const wv = document.getElementById('active-agent-webview');
    if (!wv) {
        if (typeof window.showUserScreenToast === 'function') {
            window.showUserScreenToast('No active Web AI window found', 2500, true);
        }
        return false;
    }

    if (typeof window.showUserScreenToast === 'function') {
        window.showUserScreenToast('Injecting file to AI chat...', 1500);
    }

    try {
        const findInputCoordsScript = `
            (() => {
                const inKeywords = ["prompt", "chat", "message", "write", "ask", "question", "reply", "enter", "talk"];
                const isVisible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
                const inputs = Array.from(document.querySelectorAll('textarea, div[contenteditable="true"], [role="textbox"], .ProseMirror, [contenteditable="plaintext-only"]')).filter(el => isVisible(el));
                
                let target = null;
                for (let el of inputs) {
                    const text = (el.placeholder || el.getAttribute('aria-label') || el.title || el.getAttribute('data-placeholder') || el.innerText || '').toLowerCase();
                    if (inKeywords.some(k => text.includes(k))) {
                        target = el;
                        break;
                    }
                }
                if (!target && inputs.length > 0) target = inputs[inputs.length - 1];
                
                if (!target) {
                    const dropContainers = Array.from(document.querySelectorAll('form, [data-testid*="chat"], main')).filter(el => isVisible(el));
                    if (dropContainers.length > 0) target = dropContainers[dropContainers.length - 1];
                }

                if (target) {
                    try { target.focus(); } catch(e){}
                    const rect = target.getBoundingClientRect();
                    return {
                        found: true,
                        x: Math.round(rect.left + rect.width / 2),
                        y: Math.round(rect.top + rect.height / 2)
                    };
                }
                return {
                    found: false,
                    x: Math.round(window.innerWidth / 2),
                    y: Math.round(window.innerHeight - 100)
                };
            })()
        `;

        const coords = await wv.executeJavaScript(findInputCoordsScript);
        const wcId = wv.getWebContentsId();

        const res = await ipcRenderer.invoke('cdp-native-file-drop', {
            webContentsId: wcId,
            files: filePaths,
            x: coords.x,
            y: coords.y
        });

        if (res && res.success) {
            try {
                await wv.executeJavaScript(`
                    (() => {
                        const fi = document.querySelector('input[type="file"]');
                        if (fi) {
                            fi.dispatchEvent(new Event('change', { bubbles: true }));
                            fi.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    })()
                `);
            } catch(e){}

            if (typeof window.showUserScreenToast === 'function') {
                window.showUserScreenToast(`Successfully injected ${filePaths.length} file(s) into AI!`, 2500);
            }
            if (typeof onComplete === 'function') onComplete();
            return true;
        } else {
            throw new Error(res?.error || 'CDP drop failed');
        }
    } catch(err) {
        console.error("[CDP Drop Execution Error]", err);
        if (typeof window.showUserScreenToast === 'function') {
            window.showUserScreenToast(`Auto-drop failed: ${err.message}`, 3000, true);
        }
        return false;
    }
};
