const fs = require('fs');
const logPath = require('path').join(process.cwd(), 'renderer.log');
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

function writeToLogFile(type, args) {
    try {
        const msg = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
        require('fs').appendFileSync(logPath, `[${new Date().toISOString()}] [${type}] ${msg}\n`, 'utf-8');
    } catch(e) {}
}

const isUploadRelated = (args) => {
    try {
        const msg = args.map(arg => {
            if (!arg) return "";
            if (typeof arg === 'object') {
                if (arg instanceof Error) return arg.stack || arg.message;
                try { return JSON.stringify(arg); } catch(e) { return "[Object]"; }
            }
            return String(arg);
        }).join(' ').toLowerCase();
        
        const patterns = [
            'upload', 'drop', 'drag', 'file', 'inject', 'payload', 
            'progress', 'sent', 'prepared', 'comple', 'auto', 'click'
        ];
        return patterns.some(p => msg.includes(p));
    } catch(e) {
        return false;
    }
};

console.log = function(...args) {
    if (isUploadRelated(args)) {
        originalConsoleLog.apply(console, args);
    }
    writeToLogFile('LOG', args);
};
console.error = function(...args) {
    const msgStr = args.map(arg => typeof arg === 'object' ? (arg instanceof Error ? arg.message : JSON.stringify(arg)) : String(arg)).join(' ');
    if (msgStr.includes('GUEST_VIEW_MANAGER_CALL') || msgStr.includes('Failed to inject guest interceptor')) return;
    originalConsoleError.apply(console, args);
    writeToLogFile('ERROR', args);
};
console.warn = function(...args) {
    if (isUploadRelated(args)) {
        originalConsoleWarn.apply(console, args);
    }
    writeToLogFile('WARN', args);
};
if (typeof ipcRenderer === 'undefined') { var { ipcRenderer } = require('electron'); }

window.totalFilesCount = 0;
window.readFilesSet = new Set();
window.currentBatchFileCount = 0;
window.currentPath = process.cwd();
window.currentSplitHeight = 0;
window.pendingSplitHeight = 120;
window.requestedFilesQueue = [];

// Hook ipcRenderer.send to capture currentlyDraggedFilePath on dragstart
const originalSend = ipcRenderer.send.bind(ipcRenderer);
ipcRenderer.send = function(channel, ...args) {
    if (channel === 'ondragstart') {
        window.currentlyDraggedFilePath = args[0];
        console.log("[HostDrag] Captured currentlyDraggedFilePath:", window.currentlyDraggedFilePath);
    }
    return originalSend(channel, ...args);
};

// Hook readFilesSet.add
const originalAdd = window.readFilesSet.add.bind(window.readFilesSet);
window.readFilesSet.add = function(filePath) {
    const result = originalAdd(filePath);
    if (typeof window.markFileAsCompleted === 'function') {
        window.markFileAsCompleted(filePath);
    }
    return result;
};

window.markFileAsCompleted = function(filePath) {
    const path = require('path');
    const normalizedTarget = path.resolve(window.currentPath || process.cwd(), filePath).replace(/\//g, '\\').toLowerCase();
    const item = window.requestedFilesQueue.find(x => x.absolutePath.replace(/\//g, '\\').toLowerCase() === normalizedTarget);
    if (item) {
        item.status = 'COMPLETED';
        if (typeof window.updateDragDropQueueUI === 'function') {
            window.updateDragDropQueueUI();
        }
    }
};

window.addFileToRequestedQueue = function(filePath) {
    window.dragDropAbortMessage = null;
    window.autoDraggingTempDisabled = false;
    const path = require('path');
    const gravityRoot = window.appRootPath || process.cwd();
    const isSendingMd = filePath.startsWith('SendingMD') || filePath.includes('/SendingMD/') || filePath.includes('\\SendingMD\\');
    const baseDir = isSendingMd ? gravityRoot : (window.currentPath || process.cwd());
    const absolutePath = path.resolve(baseDir, filePath);
    const normalizedPath = absolutePath.replace(/\//g, '\\').toLowerCase();
    const relativePath = path.relative(window.currentPath || process.cwd(), absolutePath);
    
    if (!window.requestedFilesQueue.some(x => x.absolutePath.replace(/\//g, '\\').toLowerCase() === normalizedPath)) {
        let isCompleted = false;
        for (let readPath of window.readFilesSet) {
            if (path.resolve(window.currentPath || process.cwd(), readPath).replace(/\//g, '\\').toLowerCase() === normalizedPath) {
                isCompleted = true;
                break;
            }
        }
        window.requestedFilesQueue.push({
            absolutePath,
            relativePath,
            status: isCompleted ? 'COMPLETED' : 'PENDING'
        });
        if (typeof window.updateDragDropQueueUI === 'function') {
            window.updateDragDropQueueUI();
        }
    }
};

window.triggerGuestSend = function() {
    window.isHostSending = true;
    setTimeout(() => { window.isHostSending = false; }, 2000);
    const wv = document.getElementById('active-agent-webview');
    if (!wv) return;
    
    const clickScript = `
        (async () => {
            const findInput = () => {
                const inKeywords = ["prompt", "chat", "message", "write", "ask", "question"];
                const isVisible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
                const mainCandidates = Array.from(document.querySelectorAll('textarea, div[contenteditable="true"], [role="textbox"]')).filter(el => isVisible(el));
                for (let el of mainCandidates) {
                    const text = (el.placeholder || el.getAttribute('aria-label') || el.title || el.innerText || '').toLowerCase();
                    if (inKeywords.some(k => text.includes(k))) return el;
                }
                if (mainCandidates.length > 0) return mainCandidates[0];
                return null;
            };

            const input = findInput();
            if (!input) return false;

            for (let i = 0; i < 3; i++) {
                input.focus();
                if (document.activeElement === input) break;
                await new Promise(r => setTimeout(r, 50));
            }
            
            const dispatchEnter = (el) => {
                const createEvent = (type) => {
                    const ev = new KeyboardEvent(type, { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter' });
                    Object.defineProperty(ev, 'keyCode', { get: () => 13 });
                    Object.defineProperty(ev, 'which', { get: () => 13 });
                    Object.defineProperty(ev, 'charCode', { get: () => 13 });
                    return ev;
                };
                el.dispatchEvent(createEvent('keydown'));
                el.dispatchEvent(createEvent('keypress'));
                el.dispatchEvent(createEvent('keyup'));
            };

            dispatchEnter(input);
            await new Promise(r => setTimeout(r, 400));
            dispatchEnter(input);
            await new Promise(r => setTimeout(r, 400));
            dispatchEnter(input);
            return true;
        })()
    `;
    
    wv.executeJavaScript(clickScript).then(async (focused) => {
        if (focused) {
            console.log("[HostSend] Guest focused, starting native sendInputEvent Enter keypresses...");
            await new Promise(r => setTimeout(r, 100));
            wv.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
            wv.sendInputEvent({ type: 'char', keyCode: 'Enter' });
            wv.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
            
            await new Promise(r => setTimeout(r, 300));
            wv.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
            wv.sendInputEvent({ type: 'char', keyCode: 'Enter' });
            wv.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
            
            await new Promise(r => setTimeout(r, 300));
            wv.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
            wv.sendInputEvent({ type: 'char', keyCode: 'Enter' });
            wv.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
        }
    }).catch(err => console.error("Failed to trigger guest send:", err));
};

window.injectGuestDropInterceptor = function() {
    const wv = document.getElementById('active-agent-webview');
    if (!wv) return;
    wv.executeJavaScript(`
        (() => {
            try {
                if (window.guestDropListener) {
                    try {
                        window.removeEventListener('dragover', window.guestDragoverListener, true);
                    } catch(e){}
                    try {
                        window.removeEventListener('drop', window.guestDropListener, true);
                    } catch(e){}
                }
                if (window.guestKeydownListener) {
                    try {
                        window.removeEventListener('keydown', window.guestKeydownListener, true);
                    } catch(e){}
                }
                if (window.guestClickListener) {
                    try {
                        window.removeEventListener('click', window.guestClickListener, true);
                    } catch(e){}
                }
                
                window.guestDragoverListener = (e) => {
                    try {
                        const isFiles = e.dataTransfer && e.dataTransfer.types && (
                            (typeof e.dataTransfer.types.includes === 'function' && e.dataTransfer.types.includes('Files')) ||
                            (typeof e.dataTransfer.types.contains === 'function' && e.dataTransfer.types.contains('Files')) ||
                            Array.from(e.dataTransfer.types).includes('Files')
                        );
                        if (!isFiles) {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'copy';
                        }
                    } catch(err){}
                };
                
                window.guestDropListener = (e) => {
                    try {
                        if (window.isSyntheticDropInProgress || e.isSynthetic) return;
                        const isFiles = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0;
                        const textData = e.dataTransfer && typeof e.dataTransfer.getData === 'function' ? e.dataTransfer.getData('text/plain') : '';
                        if (textData && !isFiles) {
                            e.preventDefault();
                            console.log('[GUEST_HTML5_DROP]:' + textData);
                        } else if (isFiles) {
                            for (let i = 0; i < e.dataTransfer.files.length; i++) {
                                console.log('[GUEST_FILE_DROP]:' + e.dataTransfer.files[i].name);
                            }
                        }
                    } catch(err){}
                };
                
                const findInput = () => {
                    try {
                        const isVisible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
                        const candidates = Array.from(document.querySelectorAll('textarea, div[contenteditable="true"], [role="textbox"]')).filter(isVisible);
                        if (document.activeElement && candidates.includes(document.activeElement)) {
                            return document.activeElement;
                        }
                        return candidates[0] || null;
                    } catch(err){
                        return null;
                    }
                };

                const getInputText = (el) => {
                    try {
                        if (!el) return "";
                        if (el.tagName.toLowerCase() === 'textarea' || el.tagName.toLowerCase() === 'input') {
                            return el.value;
                        }
                        return el.innerText || el.textContent || "";
                    } catch(err){
                        return "";
                    }
                };

                window.lastLoggedUserMessage = "";
                window.lastLoggedTime = 0;
                const logUserMessage = (text) => {
                    try {
                        if (!text) return;
                        const now = Date.now();
                        if (text === window.lastLoggedUserMessage && (now - window.lastLoggedTime) < 1500) {
                            return;
                        }
                        window.lastLoggedUserMessage = text;
                        window.lastLoggedTime = now;
                        console.log('[GUEST_USER_MESSAGE]:' + text);
                    } catch(err){}
                };

                window.guestKeydownListener = (e) => {
                    try {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            const inputEl = findInput();
                            const text = getInputText(inputEl).trim();
                            
                            // Verify if the input is actually submitted and cleared!
                            setTimeout(() => {
                                try {
                                    const verifiedEl = findInput();
                                    const verifiedText = getInputText(verifiedEl).trim();
                                    if (text) {
                                        if (!verifiedText || !verifiedText.includes(text)) {
                                            logUserMessage(text);
                                        }
                                    } else {
                                        // If text is empty, check if there is an attachment/image preview in the DOM
                                        const hasAttachment = !!document.querySelector('img, ms-attachment-preview, [class*="attachment"], [class*="chip"]');
                                        if (hasAttachment) {
                                            logUserMessage("[File Attachment]");
                                        }
                                    }
                                } catch(inner){}
                            }, 350);
                        }
                    } catch(err){}
                };

                window.guestClickListener = (e) => {
                    try {
                        const btn = e.target.closest('button');
                        if (btn) {
                            const label = (btn.getAttribute('aria-label') || btn.title || btn.innerText || '').toLowerCase();
                            const isSend = label.includes('send') || label.includes('보내기') || label.includes('전송') || label.includes('submit') || btn.querySelector('svg') || btn.innerHTML.includes('arrow') || btn.innerHTML.includes('send');
                            if (isSend) {
                                const inputEl = findInput();
                                const text = getInputText(inputEl).trim();
                                
                                setTimeout(() => {
                                    try {
                                        const verifiedEl = findInput();
                                        const verifiedText = getInputText(verifiedEl).trim();
                                        if (text) {
                                            if (!verifiedText || !verifiedText.includes(text)) {
                                                logUserMessage(text);
                                            }
                                        } else {
                                            // If text is empty, check if there is an attachment/image preview in the DOM
                                            const hasAttachment = !!document.querySelector('img, ms-attachment-preview, [class*="attachment"], [class*="chip"]');
                                            if (hasAttachment) {
                                                logUserMessage("[File Attachment]");
                                            }
                                        }
                                    } catch(inner){}
                                }, 350);
                            }
                        }
                    } catch(err){}
                };
                
                window.addEventListener('dragover', window.guestDragoverListener, true);
                window.addEventListener('drop', window.guestDropListener, true);
                window.addEventListener('keydown', window.guestKeydownListener, true);
                window.addEventListener('click', window.guestClickListener, true);
                console.log('[GuestInterceptor] Successfully registered drop and message listeners.');
            } catch (err) {
                console.error("[GuestInterceptor] Init error inside guest:", err);
            }
        })();
    `).catch(err => console.error("Failed to inject guest drop interceptor:", err));
};

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
    if (closeBtn && containerEl) {
        closeBtn.onclick = () => {
            containerEl.style.display = 'none';
            if (typeof syncBrowserView === 'function') syncBrowserView();
            window.toggleBackdropBlur(false);
            window.dragDropMode = false;
            if (typeof window.setCoverLifted === 'function') {
                window.setCoverLifted(false);
            }
        };
    }
    
    listEl.innerHTML = '';
    
    if (countEl) countEl.innerText = window.requestedFilesQueue.filter(item => item.status === 'PENDING').length;
    
    if (window.requestedFilesQueue.length === 0) {
        listEl.innerHTML = `<div style="font-size: 11px; color: var(--text-dark); text-align: center; margin-top: 50px; font-family: 'DM Sans', sans-serif;">No requested files</div>`;
        return;
    }
    
    window.requestedFilesQueue.forEach(item => {
        const itemEl = document.createElement('div');
        itemEl.className = 'queue-item';
        itemEl.draggable = item.status === 'PENDING';
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
        
        if (!isCompleted) {
            itemEl.onmouseenter = () => {
                itemEl.style.background = 'var(--surface-high)';
                itemEl.style.borderColor = 'rgba(255, 255, 255, 0.15)';
            };
            itemEl.onmouseleave = () => {
                itemEl.style.background = 'var(--surface-color)';
                itemEl.style.borderColor = 'var(--border-color)';
            };
            itemEl.ondragstart = (e) => {
                e.preventDefault();
                ipcRenderer.send('ondragstart', item.absolutePath);
            };
            itemEl.onclick = () => {
                if (typeof window.openFileInEditor === 'function' && item.absolutePath) {
                    window.openFileInEditor(item.absolutePath);
                }
            };
        }
        
        itemEl.innerHTML = `
            <span class="queue-file-name" style="font-size: 12px; color: ${isCompleted ? 'var(--text-muted)' : 'var(--text-main)'}; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; padding: 2px 4px; ${isCompleted ? 'text-decoration: line-through;' : ''}" title="${item.relativePath}">${item.relativePath.split(/[\\/]/).pop()}</span>
        `;
        
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

window.showCommandExecutionPanel = function(title, text, onContinue, onCancel) {
    const container = document.getElementById('command-execution-container');
    const titleEl = document.getElementById('command-execution-title');
    const textEl = document.getElementById('command-execution-text');
    const continueBtn = document.getElementById('command-execute-continue');
    const cancelBtn = document.getElementById('command-execute-cancel');
    const closeBtn = document.getElementById('close-command-execution');

    if (!container || !textEl || !continueBtn || !cancelBtn) return;

    if (titleEl) titleEl.innerText = title;
    textEl.innerText = text;

    container.style.display = 'flex';
    
    const vLC = document.getElementById('inspector-local-chat');
    const vBH = document.getElementById('inspector-browser-hub');
    if (vLC) {
        vLC.style.height = `calc(100% - 44px - 180px)`;
        vLC.style.zIndex = '100';
    }
    if (vBH) {
        vBH.style.position = 'absolute';
        vBH.style.top = '0';
        vBH.style.height = '100%';
        vBH.style.width = '100%';
        vBH.style.zIndex = '150';
        vBH.style.opacity = '1';
        vBH.style.pointerEvents = 'auto';
    }
    window.toggleBackdropBlur(true);
    if (typeof window.setCoverLifted === 'function') {
        window.setCoverLifted(true);
    }

    const hidePanel = () => {
        container.style.display = 'none';
        window.toggleBackdropBlur(false);
        if (typeof window.setCoverLifted === 'function') {
            window.setCoverLifted(false);
        }
        if (vLC) {
            vLC.style.height = '100%';
        }
    };

    window.activeCommandCleanup = hidePanel;

    continueBtn.onclick = () => {
        hidePanel();
        if (typeof onContinue === 'function') onContinue();
    };

    cancelBtn.onclick = () => {
        hidePanel();
        if (typeof onCancel === 'function') onCancel();
    };

    if (closeBtn) {
        closeBtn.onclick = () => {
            hidePanel();
            if (typeof onCancel === 'function') onCancel();
        };
    }
};

window.dragDropAttemptCounts = {};
window.autoClickingQueue = false;
window.autoClickPendingQueueItems = async function() {
    // Auto dragging disabled per user request. Queue UI popup remains visible for manual file drag/attachment.
    return;
};

window.updateSplitLayoutHeight = function(newHeight) {
    if (newHeight < 40 || newHeight > 500) return;
    window.pendingSplitHeight = newHeight;
    window.currentSplitHeight = newHeight;
    const vLC = document.getElementById('inspector-local-chat');
    if (vLC && (window.activeSubTabId === 'local' || !window.activeSubTabId || vLC.style.zIndex === '150')) {
        vLC.style.height = `calc(100% - 44px - ${newHeight}px)`;
    }
};

window.reloadAgentSettings = function() {
    const _path = require('path');
    const _fs = require('fs');
    const gravityRoot = window.appRootPath || process.cwd();
    const p = _path.join(gravityRoot, 'Settings.json');
    try {
        if (_fs.existsSync(p)) {
            const settings = JSON.parse(_fs.readFileSync(p, 'utf-8'));
            window.autoContinueOnRead = true;
            window.hideUIOverlay = settings.hasOwnProperty('hideUIOverlay') ? !!settings.hideUIOverlay : true;
            window.debugMode = !!settings.debugMode;
            window.dragDropMode = true;
            window.autoDragging = false;
            window.autoRefreshSession = !!settings.autoRefreshSession;
            window.refreshTurnCount = parseInt(settings.refreshTurnCount) || 35;
            window.sendFormat = settings.sendFormat === 'pdf' ? 'pdf' : 'md';
            window.autoGemini = !!settings.autoGemini;
            const homeBtn = document.getElementById('taskbar-home-btn');
            if (homeBtn) homeBtn.style.display = window.autoGemini ? 'none' : 'flex';
            return;
        }
    } catch(e) {}
    window.autoContinueOnRead = true;
    window.hideUIOverlay = true;
    window.debugMode = false;
    window.dragDropMode = true;
    window.autoDragging = false;
    window.sessionTurnCount = 0;
    window.autoRefreshSession = false;
    window.refreshTurnCount = 35;
    window.sendFormat = 'md';
    window.autoGemini = true;
    const homeBtn = document.getElementById('taskbar-home-btn');
    if (homeBtn) homeBtn.style.display = 'none';
};

window.getSendingMdTimeTag = function() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
};

window.getSendingMdFolderTag = function() {
    try {
        const cur = window.currentPath || window.projectRoot || process.cwd();
        const name = path.basename(cur) || 'Project';
        return name.replace(/[^a-zA-Z0-9_\-]/g, '_');
    } catch(e) {
        return 'Project';
    }
};

window.makeSendingMdTreeName = function() {
    const ext = window.sendFormat === 'pdf' ? 'pdf' : 'md';
    return path.join('SendingMD', `${window.getSendingMdFolderTag()}_${window.getSendingMdTimeTag()}.${ext}`);
};

window.makeSendingMdRulesName = function() {
    const ext = window.sendFormat === 'pdf' ? 'pdf' : 'md';
    return path.join('SendingMD', `FollowThisORDER_${window.getSendingMdTimeTag()}.${ext}`);
};

window.makeSendingMdBundleName = function(filePaths = []) {
    const ext = window.sendFormat === 'pdf' ? 'pdf' : 'md';
    const timeTag = window.getSendingMdTimeTag();
    if (!filePaths || filePaths.length === 0) {
        return path.join('SendingMD', `Files_bundle_${timeTag}.${ext}`);
    }
    const names = filePaths.map(f => {
        const b = path.basename(f);
        return b.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    });

    if (names.length <= 3) {
        return path.join('SendingMD', `Files_${names.join('_')}_${timeTag}.${ext}`);
    } else {
        const first3 = names.slice(0, 3).join('_');
        const remaining = names.length - 3;
        return path.join('SendingMD', `Files_${first3}_${remaining}more_${timeTag}.${ext}`);
    }
};

window.prepareFilePayload = async function(baseFileName, mdContent) {
    const fs = require('fs');
    const path = require('path');
    const gravityRoot = window.appRootPath || process.cwd();
    const sendingMdDir = path.join(gravityRoot, 'SendingMD');
    if (!fs.existsSync(sendingMdDir)) fs.mkdirSync(sendingMdDir, { recursive: true });

    const mdPath = path.join(gravityRoot, baseFileName);
    fs.writeFileSync(mdPath, mdContent, 'utf-8');

    if (window.sendFormat === 'pdf') {
        const pdfFileName = baseFileName.replace(/\.md$/, '.pdf');
        const pdfPath = path.join(gravityRoot, pdfFileName);
        const htmlContent = typeof marked !== 'undefined' ? marked.parse(mdContent) : `<pre>${mdContent.replace(/</g, '&lt;')}</pre>`;
        const success = await ipcRenderer.invoke('convert-markdown-to-pdf', {
            mdPath: mdPath,
            pdfPath: pdfPath,
            htmlContent: htmlContent
        });
        if (success && fs.existsSync(pdfPath)) {
            return { relativePath: pdfFileName, absolutePath: pdfPath };
        }
    }
    return { relativePath: baseFileName, absolutePath: mdPath };
};

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

setTimeout(() => {
    const dockEl = document.getElementById('agent-view-dock');
    if (dockEl) {
        new ResizeObserver(() => {
            syncBrowserView();
        }).observe(dockEl);
    }
}, 500);

window.getSystemRulesPrompt = function(forceFull = false) {
    const fullRules = `
[SYSTEM RULES]
1. SEARCH: Never guess names/roles. Use [CMD: search-keyword "query"] or [CMD: list-dir "path"] first. If search fails 2-3x, ask user. Request multiple files in one turn: [REQUEST: read-file "path1"] [REQUEST: read-file "path2"].
2. FILE OPS: Always read-file before editing. Never request read-file in the same turn as write/edit. After write/edit, wait for system feedback, and only request read-file/verify in the next turn to check correctness.
   - Edit: [CMD: edit-file "path"] followed by [SEARCH] old_code [REPLACE] new_code [END] (Exact match).
   - Write: [CMD: write-file "path"] followed by \`\`\`lang\ncode\n\`\`\`.
   - Delete/CreateDir/Move: [CMD: delete-file "path"], [CMD: create-dir "path"], [CMD: move-file "src" "dest"].
3. RUN CMD: [CMD: run-command "command"] (build, test, shell).
4. RESET: Use [CMD: reset-session] if lagging.
5. WAIT: Explain current state, do not plan, wait for user.
6. TROUBLESHOOT: If [FILE DATA ERROR] (e.g. prefix "SendingMD/"), strip prefix & request root path: [FILE DATA ERROR: SendingMD/file.js] -> [REQUEST: read-file "file.js"].`;

    if (forceFull) {
        return fullRules;
    }
    return "\n[REMINDER] Follow SystemRules.md. Use [CMD: search-keyword] first. Never guess. If not found after search, ask user with tried keywords. Always read-file before editing, and read-file/verify again after editing/writing. Output ONLY commands, NO explanations.";
};

function detectAndAskCommand(text) {
    if (!text) return;
    

    // Clean up temporary md files from previous turns deterministically on new response
    try {
        const fs = require('fs');
        const path = require('path');
        const dir = window.projectRoot || window.currentPath;
        if (dir && fs.existsSync(dir)) {
            // Clean up root leftovers
            const files = fs.readdirSync(dir);
            files.forEach(file => {
                if ((file.startsWith('_project_rules_') || file.startsWith('_project_read_bundle_')) && file.endsWith('.md')) {
                    try { fs.unlinkSync(path.join(dir, file)); } catch(e) {}
                }
            });
            // Clean up SendingMD folder
            const gravityRoot = window.appRootPath || process.cwd();
            const sendingMdDir = path.join(gravityRoot, 'SendingMD');
            if (fs.existsSync(sendingMdDir)) {
                const subfiles = fs.readdirSync(sendingMdDir);
                subfiles.forEach(file => {
                    if ((file.startsWith('_project_rules_') || file.startsWith('_project_read_bundle_')) && file.endsWith('.md')) {
                        try { fs.unlinkSync(path.join(sendingMdDir, file)); } catch(e) {}
                    }
                });
            }
            if (typeof window.refreshTree === 'function') {
                window.refreshTree();
            }
        }
    } catch(e) {}

    // Reset requested files queue for the new AI response/turn
    window.requestedFilesQueue = [];

    let isBriefing = false;
    if (window.isBriefingResponsePending) {
        window.isBriefingResponsePending = false;
        isBriefing = true;
        console.log("[BriefingShield] Activated: Ignoring any non-read commands during briefing response.");
    }

    const cmdRegex = /\[(CMD|REQUEST):\s*([^\]]+)\]/gi;
    let match;
    const foundCmds = [];
    while ((match = cmdRegex.exec(text)) !== null) {
        const cleanCmd = match[2].trim();
        if (cleanCmd) {
            if (cleanCmd === '...' || cleanCmd.includes('...')) continue;
            if (cleanCmd.includes('경로') || cleanCmd.includes('path') || cleanCmd.includes('요청')) continue;
            foundCmds.push(cleanCmd);
        }
    }

    if (foundCmds.length === 0) {
        const lines = text.split('\n');
        for (let line of lines) {
            let trimmed = line.trim().replace(/^[`\s]+|[`\s]+$/g, '');
            if (/^(read-file|write-file|edit-file|edit-file-range|read-file-full|read-file-range|delete-file|run-command|list-dir|search-keyword|move-file|reset-session)\b/i.test(trimmed)) {
                foundCmds.push(trimmed);
            }
        }
    }

    if (foundCmds.length === 0) {
        if (window.autoContinueOnRead) {
            const toast = document.getElementById('injection-toast');
            if (toast) toast.style.display = 'none';
            document.getElementById('tab-local-agent')?.click();
        }
        if (typeof window.updateDragDropQueueUI === 'function') {
            window.updateDragDropQueueUI();
        }
        return;
    }

    const readCmds = [];
    const writeCmds = [];
    const editCmds = [];
    const deleteCmds = [];
    const createDirCmds = [];
    const runCommandCmds = [];
    const searchKeywordCmds = [];
    const moveFileCmds = [];
    const listDirCmds = [];
    const searchCmds = [];
    const otherCmds = [];
    let hasResetSession = false;

    foundCmds.forEach(rawCmd => {
        let cmd = rawCmd.replace(/\\"/g, '"')
                        .replace(/\\'/g, "'")
                        .replace(/&quot;/gi, '"')
                        .replace(/&apos;/gi, "'")
                        .replace(/[“”]/g, '"')
                        .replace(/[‘’]/g, "'")
                        .trim();

        if (isBriefing) {
            const isRead = cmd.startsWith('read-file') || cmd.startsWith('read-file-full') || cmd.startsWith('read-file-range');
            if (!isRead) {
                console.log(`[BriefingShield] Ignored briefing command: ${cmd}`);
                return;
            }
        }

        if (cmd.startsWith('search-file') || cmd.startsWith('search-all')) {
            return;
        }

        const fileMatch = cmd.match(/^read-file\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))$/i);
        const fileFullMatch = cmd.match(/^read-file-full\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))$/i);
        const rangeMatch = cmd.match(/^read-file-range\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))\s+(\d+)-(\d+)$/i);
        const writeMatch = cmd.match(/^write-file\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))$/i);
        const editRangeMatch = cmd.match(/^edit-file-range\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))\s+(\d+)-(\d+)$/i);
        const editMatch = cmd.match(/^edit-file\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))$/i);
        const deleteMatch = cmd.match(/^delete-file\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))$/i);
        const createDirMatch = cmd.match(/^create-dir\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))$/i);
        const runCommandMatch = cmd.match(/^run-command\s+(.*)$/i);
        const searchKeywordMatch = cmd.match(/^search-keyword\s+(.*)$/i);
        const moveFileMatch = cmd.match(/^move-file\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))$/i);
        const listDirMatch = cmd.match(/^list-dir\s+(.*)$/i);
        const resetSessionMatch = cmd.match(/^reset-session$/i);

        const fs = require('fs');
        const path = require('path');

        const getParsedPath = (m) => m ? (m[1] || m[2] || m[3]) : '';

        const resolvePathAndExists = (rawPath) => {
            let fp = rawPath.trim();
            let tp = path.resolve(window.currentPath || process.cwd(), fp);
            let ex = fs.existsSync(tp);
            if (!ex) {
                const prefixRegex = /^SendingMD[\\/]/i;
                if (prefixRegex.test(fp)) {
                    const stripped = fp.replace(prefixRegex, '');
                    const strippedTp = path.resolve(window.currentPath || process.cwd(), stripped);
                    if (fs.existsSync(strippedTp)) {
                        console.log(`[PathSanitizer] Stripped 'SendingMD/' prefix: ${fp} -> ${stripped}`);
                        fp = stripped;
                        tp = strippedTp;
                        ex = true;
                    }
                }
            }
            let isDir = false;
            if (ex) {
                try { isDir = fs.statSync(tp).isDirectory(); } catch(e) {}
            }
            return { path: fp, exists: ex, isDirectory: isDir };
        };

        if (rangeMatch) {
            const pathStr = getParsedPath(rangeMatch);
            const res = resolvePathAndExists(pathStr);
            readCmds.push({ path: res.path, full: false, range: true, start: parseInt(rangeMatch[4]), end: parseInt(rangeMatch[5]), exists: res.exists, isDirectory: res.isDirectory });
        } else if (fileFullMatch) {
            const pathStr = getParsedPath(fileFullMatch);
            const res = resolvePathAndExists(pathStr);
            readCmds.push({ path: res.path, full: true, exists: res.exists, isDirectory: res.isDirectory });
        } else if (fileMatch) {
            const pathStr = getParsedPath(fileMatch);
            const res = resolvePathAndExists(pathStr);
            readCmds.push({ path: res.path, full: false, exists: res.exists, isDirectory: res.isDirectory });
        } else if (writeMatch) {
            const findCmdIdx = (fullText, targetCmd) => {
                let idx = fullText.indexOf(targetCmd);
                if (idx !== -1) return idx;
                const sanitized = targetCmd.replace(/"/g, '\\"');
                idx = fullText.indexOf(sanitized);
                if (idx !== -1) return idx;
                const baseCmd = targetCmd.split(/\s+/)[0];
                return fullText.indexOf(baseCmd);
            };

            const filePath = getParsedPath(writeMatch).trim();
            const cmdIdx = findCmdIdx(text, rawCmd);
            let codeVal = "";
            let hasCodeBlock = false;
            if (cmdIdx !== -1) {
                const subText = text.substring(cmdIdx);
                const codeBlockMatch = subText.match(/```[a-zA-Z]*\n([\s\S]*?)\n```/);
                if (codeBlockMatch) {
                    codeVal = codeBlockMatch[1];
                    hasCodeBlock = true;
                }
            }
            if (hasCodeBlock) {
                writeCmds.push({ path: filePath, code: codeVal });
            }
        } else if (editRangeMatch) {
            const findCmdIdx = (fullText, targetCmd) => {
                let idx = fullText.indexOf(targetCmd);
                if (idx !== -1) return idx;
                const sanitized = targetCmd.replace(/"/g, '\\"');
                idx = fullText.indexOf(sanitized);
                if (idx !== -1) return idx;
                const baseCmd = targetCmd.split(/\s+/)[0];
                return fullText.indexOf(baseCmd);
            };

            const filePath = getParsedPath(editRangeMatch).trim();
            const startLine = parseInt(editRangeMatch[4]);
            const endLine = parseInt(editRangeMatch[5]);
            const cmdIdx = findCmdIdx(text, rawCmd);
            let codeVal = "";
            let hasCodeBlock = false;
            if (cmdIdx !== -1) {
                const subText = text.substring(cmdIdx);
                const codeBlockMatch = subText.match(/```[a-zA-Z]*\n([\s\S]*?)\n```/);
                if (codeBlockMatch) {
                    codeVal = codeBlockMatch[1];
                    hasCodeBlock = true;
                }
            }
            if (hasCodeBlock) {
                editCmds.push({ type: 'range', path: filePath, start: startLine, end: endLine, code: codeVal });
            }
        } else if (editMatch) {
            const findCmdIdx = (fullText, targetCmd) => {
                let idx = fullText.indexOf(targetCmd);
                if (idx !== -1) return idx;
                const sanitized = targetCmd.replace(/"/g, '\\"');
                idx = fullText.indexOf(sanitized);
                if (idx !== -1) return idx;
                const baseCmd = targetCmd.split(/\s+/)[0];
                return fullText.indexOf(baseCmd);
            };

            const filePath = getParsedPath(editMatch).trim();
            const cmdIdx = findCmdIdx(text, rawCmd);
            if (cmdIdx !== -1) {
                const subText = text.substring(cmdIdx);
                const parsedBlocks = window.parseSearchReplaceBlocks(subText, filePath);
                if (parsedBlocks.length > 0) {
                    parsedBlocks.forEach(block => {
                        if (block.hasDivider) {
                            editCmds.push({ type: 'block', path: filePath, search: block.search, replace: block.replace });
                        } else if (block.search && block.replace) {
                            editCmds.push({ type: 'block', path: filePath, search: block.search, replace: block.replace });
                        }
                    });
                } else {
                    const sMarker = "<<<<<<<";
                    const rMarker = ">>>>>>>";
                    const sIdx = subText.indexOf(sMarker);
                    const rIdx = subText.indexOf(rMarker);
                    if (sIdx !== -1 && rIdx !== -1 && sIdx < rIdx) {
                        const rawBlock = subText.substring(sIdx + sMarker.length, rIdx).trim();
                        try {
                            const targetPath = path.resolve(window.currentPath || process.cwd(), filePath);
                            if (fs.existsSync(targetPath)) {
                                const fileContent = fs.readFileSync(targetPath, 'utf-8').replace(/\r/g, '');
                                const fileContentNorm = fileContent.replace(/\s+/g, '');
                                
                                const lines = rawBlock.split(/\r?\n/);
                                for (let k = lines.length - 1; k >= 1; k--) {
                                    const searchCand = lines.slice(0, k).join('\n').trim();
                                    const replaceCand = lines.slice(k).join('\n').trim();
                                    
                                    const searchCandNorm = searchCand.replace(/\s+/g, '');
                                    if (searchCandNorm && fileContentNorm.includes(searchCandNorm)) {
                                        editCmds.push({ type: 'block', path: filePath, search: searchCand, replace: replaceCand });
                                        break;
                                    }
                                }
                            }
                        } catch (err) {
                            console.error("Resilient parser error:", err);
                        }
                    }
                }
            }
        } else if (deleteMatch) {
            const filePath = getParsedPath(deleteMatch).trim();
            deleteCmds.push({ path: filePath });
        } else if (createDirMatch) {
            const dirPath = getParsedPath(createDirMatch).trim();
            createDirCmds.push({ path: dirPath });
        } else if (runCommandMatch) {
            let cmdStr = runCommandMatch[1].trim();
            if ((cmdStr.startsWith('"') && cmdStr.endsWith('"')) || (cmdStr.startsWith("'") && cmdStr.endsWith("'"))) {
                cmdStr = cmdStr.slice(1, -1);
            }
            runCommandCmds.push({ command: cmdStr });
        } else if (searchKeywordMatch) {
            let pattern = searchKeywordMatch[1].trim();
            if ((pattern.startsWith('"') && pattern.endsWith('"')) || (pattern.startsWith("'") && pattern.endsWith("'"))) {
                pattern = pattern.slice(1, -1);
            }
            searchKeywordCmds.push({ pattern: pattern });
        } else if (moveFileMatch) {
            const srcPath = (moveFileMatch[1] || moveFileMatch[2] || moveFileMatch[3]).trim();
            const destPath = (moveFileMatch[4] || moveFileMatch[5] || moveFileMatch[6]).trim();
            moveFileCmds.push({ src: srcPath, dest: destPath });
        } else if (listDirMatch) {
            const dirPath = (listDirMatch[1] || '.').trim().replace(/^["']|["']$/g, '');
            listDirCmds.push({ path: dirPath });
        } else if (resetSessionMatch) {
            hasResetSession = true;
        } else {
            otherCmds.push(cmd);
        }
    });

    const hasWriteFile = (writeCmds.length > 0);
    const hasEditFile = (editCmds.length > 0);
    const hasDeleteFile = (deleteCmds.length > 0);
    const hasCreateDir = (createDirCmds.length > 0);
    const hasRunCommand = (runCommandCmds.length > 0);
    const hasSearchKeyword = (searchKeywordCmds.length > 0);
    const hasMoveFile = (moveFileCmds.length > 0);
    const hasListDir = (listDirCmds.length > 0);
    const hasAnyAction = hasWriteFile || hasEditFile || hasDeleteFile || hasCreateDir || hasRunCommand || hasSearchKeyword || hasMoveFile || hasListDir;

    if (hasAnyAction) {
        readCmds.length = 0;
    }

    // Combined files bundling logic for Drag & Drop
    const filesToBundle = readCmds.filter(f => f.exists !== false && !f.isDirectory);
    if (filesToBundle.length > 0) {
        const path = require('path');
        let mergedContent = "# Requested Files Bundle\n\n";
        filesToBundle.forEach(f => {
            const absPath = path.resolve(window.currentPath || process.cwd(), f.path);
            let fileContent = "";
            try {
                if (f.range) {
                    const rawContent = fs.readFileSync(absPath, 'utf-8');
                    const lines = rawContent.split(/\r?\n/);
                    fileContent = lines.slice(f.start - 1, f.end).join('\n');
                } else {
                    fileContent = fs.readFileSync(absPath, 'utf-8');
                }
            } catch(e) {
                fileContent = "[ERROR READING FILE: " + e.message + "]";
            }
            const ext = f.path.split('.').pop().toLowerCase();
            mergedContent += "## [FILE DATA: " + f.path + "]\n```" + ext + "\n" + fileContent + "\n```\n\n";
        });
        
        const baseFileName = window.makeSendingMdBundleName(readCmds.map(f => f.path));
        window.prepareFilePayload(baseFileName, mergedContent).then(payload => {
            if (typeof window.addFileToRequestedQueue === 'function') {
                window.addFileToRequestedQueue(payload.relativePath);
            }
        }).catch(e => {
            console.error("Failed to prepare read bundle file:", e);
        });
    }
    
    if (window.dragDropMode) {
        const missingFiles = readCmds.filter(f => f.exists === false && !f.isDirectory);
        missingFiles.forEach(f => {
            if (typeof window.addFileToRequestedQueue === 'function') {
                window.addFileToRequestedQueue(f.path);
            }
        });
    }

    const hasReadFile = (readCmds.length > 0);

    if (hasResetSession) {
        const box = typeof ChatUI !== 'undefined' ? ChatUI.appendBubble('system', '') : null;
        if (box) {
            const content = box.querySelector('.bubble-content');
            if (content) {
                content.innerHTML = `
                    <div style="background: var(--surface-low); padding: 12px 14px; border-radius: 8px; border: 1px solid var(--border-color); font-family: 'DM Sans', monospace; font-size: 12px; color: var(--text-main); margin-bottom: 12px; line-height: 1.5; word-break: break-all; box-shadow: inset 0 2px 4px rgba(0,0,0,0.15); margin-top: 4px;">
                        <div style="font-weight: bold; color: #eab308; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                            <span>⚠️ RESET SESSION CONFIRMATION</span>
                        </div>
                        <span>Allow Web AI to reset current chat session?</span>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="cmd-run-btn" style="flex: 1; background: #eab308; color: black; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 700; font-size: 11.5px; letter-spacing: 0.04em; font-family: 'DM Sans', sans-serif;">ALLOW RESET</button>
                        <button class="cmd-cancel-btn" style="flex: 1; background: rgba(255, 255, 255, 0.04); color: var(--text-muted); border: 1px solid var(--border-color); padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 11.5px; letter-spacing: 0.04em; font-family: 'DM Sans', sans-serif;">CANCEL</button>
                    </div>
                `;
                content.querySelector('.cmd-run-btn').onclick = () => {
                    box.remove();
                    if (typeof window.triggerSessionReset === 'function') window.triggerSessionReset();
                };
                content.querySelector('.cmd-cancel-btn').onclick = () => {
                    box.remove();
                };
            }
        } else {
            if (typeof window.triggerSessionReset === 'function') window.triggerSessionReset();
        }
        return;
    }

    if (hasAnyAction) {
        orchestrateCommands(writeCmds, editCmds, deleteCmds, moveFileCmds, listDirCmds, createDirCmds, runCommandCmds, searchKeywordCmds);
        return;
    }

    if (hasReadFile) {
        const fileNamesList = readCmds.map(f => {
            const p = f.path.split(/[\\/]/);
            return p[p.length - 1];
        }).join(', ');

        const displayCmd = readCmds.map(f => {
            if (f.range) return "read-file-range \"" + f.path + "\" " + f.start + "-" + f.end;
            return (f.full ? 'read-file-full' : 'read-file') + " \"" + f.path + "\"";
        }).join(', ');

        const runRead = async () => {
            const injectContainer = document.getElementById('toast-inject-container');
            const projLbl = document.getElementById('project-pct-label');
            const projBar = document.getElementById('toast-project-progress-bar');
            try {
                const fs = require('fs');
                const path = require('path');
                
                let combinedPayload = "";

                if (window.dragDropMode) {
                    const existingFiles = readCmds.filter(f => f.exists !== false && !f.isDirectory);
                    const directoryFiles = readCmds.filter(f => f.exists !== false && f.isDirectory);
                    const missingFiles = readCmds.filter(f => f.exists === false);
                    let parts = [];
                    if (existingFiles.length > 0) {
                        existingFiles.forEach(f => window.readFilesSet.add(f.path));
                        parts.push("I have uploaded the requested file contents: " + fileNamesList + " as attachments.");
                    }
                    if (directoryFiles.length > 0) {
                        const getFlatDirectoryTree = (dirPath) => {
                            let results = [];
                            try {
                                const list = fs.readdirSync(dirPath);
                                list.forEach(file => {
                                    const fullPath = path.join(dirPath, file);
                                    const stat = fs.statSync(fullPath);
                                    if (stat && stat.isDirectory()) {
                                        results = results.concat(getFlatDirectoryTree(fullPath));
                                    } else {
                                        results.push(fullPath);
                                    }
                                });
                            } catch (e) {}
                            return results;
                        };
                        directoryFiles.forEach(dir => {
                            const absDir = path.resolve(window.currentPath || process.cwd(), dir.path);
                            const files = getFlatDirectoryTree(absDir);
                            const relativeFiles = files.map(f => path.relative(window.currentPath || process.cwd(), f));
                            const fileListStr = files.length > 0 
                                ? relativeFiles.map(rf => "- " + rf.replace(/\\/g, '/')).join('\n') 
                                : "(Directory is empty)";
                            parts.push("[DIRECTORY LIST: " + dir.path + "]\n" + fileListStr + "\n");
                        });
                    }
                    if (missingFiles.length > 0) {
                        missingFiles.forEach(f => {
                            parts.push("[FILE DATA ERROR: " + f.path + " not found on the local machine (does not exist)]");
                        });
                    }
                    combinedPayload = parts.join('\n') + "\nProceed to analyze the files.";
                } else {
                    for (let i = 0; i < readCmds.length; i++) {
                        const fileObj = readCmds[i];
                        const filePath = fileObj.path;
                        
                        let fileContentPayload = "";
                        let targetPath = fileObj.overridePath || path.resolve(window.currentPath, filePath);
                        
                        // Resolve targetPath to the actually dropped file path if present in readFilesSet
                        const targetBase = path.basename(filePath).toLowerCase();
                        for (let p of window.readFilesSet) {
                            if (path.basename(p).toLowerCase() === targetBase) {
                                targetPath = p;
                                break;
                            }
                        }

                        if (fs.existsSync(targetPath)) {
                            const rawContent = fs.readFileSync(targetPath, 'utf-8');
                            const allLines = rawContent.replace(/\r/g, '').split('\n');
                            
                            if (fileObj.range) {
                                let startIdx = Math.max(0, fileObj.start - 1);
                                let endIdx = Math.min(allLines.length, fileObj.end);
                                let isTruncated = false;
                                
                                if (endIdx - startIdx > 2000) {
                                    endIdx = startIdx + 2000;
                                    isTruncated = true;
                                }
                                
                                let slicedContent = allLines.slice(startIdx, endIdx).join('\n');
                                if (isTruncated) {
                                    const nextStart = endIdx + 1;
                                    const nextEnd = nextStart + 1999;
                                    slicedContent += "\n// ... [TRUNCATED: Max 2000 lines limit per turn reached. If you need to read the next part, please output [CMD: read-file-range \"" + filePath + "\" " + nextStart + "-" + nextEnd + "]]";
                                }
                                fileContentPayload = "[FILE DATA (LINE RANGE " + fileObj.start + "-" + (fileObj.start + (endIdx - startIdx) - 1) + "): " + filePath + "]\n```\n" + slicedContent + "\n```\n\n";
                            } else if (fileObj.full) {
                                let endIdx = allLines.length;
                                let isTruncated = false;
                                
                                if (endIdx > 2000) {
                                    endIdx = 2000;
                                    isTruncated = true;
                                }
                                
                                let slicedContent = allLines.slice(0, endIdx).join('\n');
                                if (isTruncated) {
                                    slicedContent += "\n// ... [TRUNCATED: Max 2000 lines limit per turn reached. If you need to read the next part, please output [CMD: read-file-range \"" + filePath + "\" 2001-4000]]";
                                }
                                fileContentPayload = "[FILE DATA (" + (isTruncated ? 'PARTIAL CONTENT' : 'FULL CONTENT') + "): " + filePath + "]\n```\n" + slicedContent + "\n```\n\n";
                            } else {
                                const ext = filePath.split('.').pop().toLowerCase();
                                const fileContent = extractCodeOutline(rawContent, ext);
                                fileContentPayload = "[FILE DATA (OUTLINE ONLY): " + filePath + "]\n```\n" + fileContent + "\n```\n\n";
                            }
                        } else {
                            fileContentPayload = "[FILE DATA ERROR: " + filePath + " not found on the local machine]\n\n";
                        }

                        combinedPayload += fileContentPayload;
                        
                        if (typeof window.showInputLoading === 'function') {
                            window.showInputLoading("Reading files... (" + (i + 1) + "/" + readCmds.length + ")");
                        }
                        if (projLbl) projLbl.innerHTML = "Reading files: <span style=\"color: var(--primary); font-weight: bold;\">" + (i + 1) + "/" + readCmds.length + "</span>";
                        if (projBar) projBar.style.width = Math.floor(((i + 1) / readCmds.length) * 100) + "%";
                        ChatUI.appendBubble('system', "[SYSTEM] Prepared " + filePath + " context (" + (i + 1) + "/" + readCmds.length + ").");
                        
                        await new Promise(r => setTimeout(r, 200));
                    }

                    const finalPrompt = "Proceed to analyze the files above.";
                    combinedPayload += finalPrompt;
                }

                if (typeof window.updateSendProgress === 'function') {
                    window.updateSendProgress(window.readFilesSet.size, window.totalFilesCount);
                }

                if (injectContainer) injectContainer.style.display = 'flex';
                
                const enginePromise = runExperimentalEngine('/marktag', combinedPayload, null);
                ChatUI.appendBubble('system', "[SYSTEM] Sent all prepared " + readCmds.length + " files to Web AI.");
                await new Promise(r => setTimeout(r, 800));
                await injectWebPayload(combinedPayload, readCmds.length, readCmds.length, false, window.autoDragging && !window.autoDraggingTempDisabled);

                const response = await enginePromise;
                if (response) {
                    if (typeof window.finalizeAiBubble === 'function') {
                        window.finalizeAiBubble(response);
                    }
                    detectAndAskCommand(response);
                }
            } catch (err) {
                ChatUI.appendBubble('system', "[ERROR] Failed to read files batch: " + err.message);
            } finally {
                if (typeof window.hideInputLoading === 'function') {
                    window.hideInputLoading();
                }
                if (!window.autoContinueOnRead) {
                    document.getElementById('tab-local-agent')?.click();
                }
            }
        };

        if (window.autoContinueOnRead && !window.dragDropMode) {
            runRead();
        } else {
            const dropZone = document.getElementById('local-drop-zone');
            if (dropZone) dropZone.style.display = 'none';

            const localInput = document.getElementById('local-agent-input');
            const sendBtn = document.getElementById('send-to-local');
            const inputContainer = document.getElementById('local-input-container');

            if (localInput && inputContainer) {
                const vLC = document.getElementById('inspector-local-chat');
                const vBH = document.getElementById('inspector-browser-hub');
                if (vLC) {
                    vLC.style.height = "100%";
                    vLC.style.zIndex = '100';
                }
                
                if (vBH) {
                    vBH.style.position = 'absolute';
                    vBH.style.top = '0';
                    vBH.style.height = '100%';
                    vBH.style.width = '100%';
                    vBH.style.zIndex = '150';
                    vBH.style.opacity = '1';
                    vBH.style.pointerEvents = 'auto';
                }

                let fileBox = null;
                if (typeof ChatUI !== 'undefined' && typeof ChatUI.appendBubble === 'function') {
                    fileBox = ChatUI.appendBubble('system', '');
                    const fileBoxContent = fileBox.querySelector('.bubble-content');
                    if (fileBoxContent) {
                        fileBoxContent.innerHTML = "<div>Requested: <strong style=\"color: var(--primary); font-weight: bold;\">" + fileNamesList + "</strong></div>";
                    }
                }

                const cleanupDragDrop = () => {
                    if (fileBox) fileBox.remove();
                    window.activeDragDropCleanup = null;
                    window.activeDragDropContinue = null;
                    
                    if (vLC) {
                        vLC.style.height = "100%";
                        vLC.style.zIndex = '100';
                    }
                    if (vBH) {
                        vBH.style.position = 'absolute';
                        vBH.style.top = '0';
                        vBH.style.height = '100%';
                        vBH.style.width = '100%';
                        vBH.style.zIndex = '150';
                        vBH.style.opacity = '1';
                        vBH.style.pointerEvents = 'auto';
                    }
                };

                window.activeDragDropCleanup = cleanupDragDrop;
                window.activeDragDropContinue = async () => {
                    await runRead();
                };
                window.activeDragDropContinue.isReal = true;

                if (typeof window.injectGuestDropInterceptor === 'function') {
                    window.injectGuestDropInterceptor();
                }
            }
        }
    }
    
    if (otherCmds.length > 0) {
        let accumulatedOtherFeedback = "";
        let currentIndex = 0;
        
        const runNextOtherCommand = () => {
            if (currentIndex >= otherCmds.length) {
                if (accumulatedOtherFeedback.trim()) {
                    submitConsolidatedFeedback(accumulatedOtherFeedback);
                }
                return;
            }
            
            const cleanCmd = otherCmds[currentIndex];
            const box = ChatUI.appendBubble('system', '');
            const content = box.querySelector('.bubble-content');
            const themeColor = "#468CF6"; 
            const glowShadow = "none";
            
            content.innerHTML = `
                <div style="background: var(--surface-low); padding: 12px 14px; border-radius: 8px; border: 1px solid var(--border-color); font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--text-main); margin-bottom: 12px; line-height: 1.5; word-break: break-all; box-shadow: inset 0 2px 4px rgba(0,0,0,0.15); margin-top: 4px;">
                    <span style="color: var(--text-muted); font-weight: bold; margin-right: 6px;">$</span>${cleanCmd}
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="cmd-run-btn" style="flex: 1; background: linear-gradient(135deg, ${themeColor}, ${themeColor}dd); color: white; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 700; font-size: 11.5px; letter-spacing: 0.04em; font-family: 'DM Sans', 'Outfit', sans-serif; transition: all 0.2s; box-shadow: none;">CONTINUE</button>
                    <button class="cmd-cancel-btn" style="flex: 1; background: rgba(255, 255, 255, 0.04); color: var(--text-muted); border: 1px solid var(--border-color); padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 11.5px; letter-spacing: 0.04em; font-family: 'DM Sans', 'Outfit', sans-serif; transition: all 0.2s;">CANCEL</button>
                </div>
            `;
            
            const runBtn = content.querySelector('.cmd-run-btn');
            const cancelBtn = content.querySelector('.cmd-cancel-btn');
            if (runBtn) {
                runBtn.onmouseenter = () => { runBtn.style.filter = "brightness(1.15)"; runBtn.style.boxShadow = "none"; };
                runBtn.onmouseleave = () => { runBtn.style.filter = "none"; runBtn.style.boxShadow = "none"; };
            }
            if (cancelBtn) {
                cancelBtn.onmouseenter = () => { cancelBtn.style.background = "rgba(255, 255, 255, 0.08)"; cancelBtn.style.color = "var(--text-main)"; cancelBtn.style.borderColor = "rgba(255,255,255,0.15)"; };
                cancelBtn.onmouseleave = () => { cancelBtn.style.background = "rgba(255, 255, 255, 0.04)"; cancelBtn.style.color = "var(--text-muted)"; cancelBtn.style.borderColor = "var(--border-color)"; };
            }
            
            const onContinue = async () => {
                box.remove();
                if (window.activeCommandCleanup) window.activeCommandCleanup();
                
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
                        if (minBtn) minBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
                        if (typeof syncBrowserView === 'function') syncBrowserView();
                    }
                }
                
                ChatUI.appendBubble('system-info', `Executed: ${cleanCmd}`);
                accumulatedOtherFeedback += `[SYSTEM] Command \`${cleanCmd}\` executed on the local machine.\n\n`;
                
                currentIndex++;
                setTimeout(runNextOtherCommand, 100);
            };
            
            const onCancel = () => {
                box.remove();
                if (window.activeCommandCleanup) window.activeCommandCleanup();
                accumulatedOtherFeedback += `[SYSTEM] Command \`${cleanCmd}\` execution cancelled by user.\n\n`;
                
                currentIndex++;
                setTimeout(runNextOtherCommand, 100);
            };
            
            content.querySelector('.cmd-run-btn').onclick = onContinue;
            content.querySelector('.cmd-cancel-btn').onclick = onCancel;
            
            if (typeof window.showCommandExecutionPanel === 'function') {
                window.showCommandExecutionPanel(
                    "Pending Command",
                    cleanCmd,
                    onContinue,
                    onCancel
                );
            }
        };
        
        runNextOtherCommand();
    }
}

let usageCrawlerWv = null;

window.fetchGeminiUsagePercent = function() {
    try {
        console.log('[GeminiUsage] Starting usage percent crawl via background webview...');
        const activeWv = document.getElementById('active-agent-webview');
        const partition = activeWv ? activeWv.partition : 'persist:agent_hub';
        const userAgent = activeWv ? activeWv.useragent : undefined;

        if (!usageCrawlerWv) {
            usageCrawlerWv = document.createElement('webview');
            usageCrawlerWv.id = 'gemini-usage-crawler-webview';
            usageCrawlerWv.style.cssText = 'position:absolute; width:1px; height:1px; opacity:0; pointer-events:none; left:-9999px;';
            if (partition) usageCrawlerWv.partition = partition;
            if (userAgent) usageCrawlerWv.useragent = userAgent;
            document.body.appendChild(usageCrawlerWv);
        }

        const onDomReady = () => {
            usageCrawlerWv.removeEventListener('dom-ready', onDomReady);
            console.log('[GeminiUsage] Usage page DOM ready, waiting 2.5s for SPA rendering...');
            setTimeout(() => {
                usageCrawlerWv.executeJavaScript(`
                    (() => {
                        try {
                            const candidates = Array.from(document.querySelectorAll('.gds-emphasized-body-l, [class*="gds-emphasized-body-l"], div, span, p'));
                            
                            // 1. Priority: Find element containing % symbol and extract number
                            for (const el of candidates) {
                                const txt = (el.innerText || el.textContent || '').trim();
                                const m = txt.match(/(\\d{1,3})\\s*%/);
                                if (m && m[1]) {
                                    return { success: true, text: m[1] + '%', raw: txt, source: 'percent_match' };
                                }
                            }
                            
                            // 2. Priority: Find .gds-emphasized-body-l element and extract pure number
                            const empEls = Array.from(document.querySelectorAll('.gds-emphasized-body-l, [class*="gds-emphasized-body-l"]'));
                            for (const el of empEls) {
                                const txt = (el.innerText || el.textContent || '').trim();
                                const m = txt.match(/(\\d+)/);
                                if (m && m[1]) {
                                    return { success: true, text: m[1] + '%', raw: txt, source: 'emphasized_number' };
                                }
                            }

                            const bodyText = document.body ? document.body.innerText : '';
                            const m = bodyText.match(/(\\d{1,3})\\s*%/);
                            if (m) {
                                return { success: true, text: m[1] + '%', raw: bodyText.slice(0, 100), source: 'body_regex' };
                            }
                            return { success: false, raw: bodyText.slice(0, 300) };
                        } catch(e) {
                            return { success: false, error: e.message };
                        }
                    })()
                `).then(res => {
                    console.log('[GeminiUsage] Crawl Result:', res);
                    const el1 = document.getElementById('gemini-usage-percent-text');
                    const el2 = document.getElementById('taskbar-usage-value');
                    if (res && res.success && res.text) {
                        const usedVal = parseInt(res.text, 10);
                        const remainingVal = isNaN(usedVal) ? res.text : (Math.max(0, Math.min(100, 100 - usedVal)) + '%');
                        if (el1) el1.innerText = remainingVal;
                        if (el2) el2.innerText = remainingVal;
                    } else {
                        console.warn('[GeminiUsage] Could not find percent value in rendered page.', res);
                        if (el1) el1.innerText = '--%';
                        if (el2) el2.innerText = '--%';
                    }
                }).catch(err => console.error('[GeminiUsage] Script execution error:', err));
            }, 2500);
        };

        usageCrawlerWv.addEventListener('dom-ready', onDomReady);
        usageCrawlerWv.src = 'https://gemini.google.com/usage?t=' + Date.now();
    } catch(err) {
        console.error('[GeminiUsage] Error starting crawler:', err);
    }
};

window.scheduleNextGeminiUsageFetch = function() {
    const minSec = 42;
    const maxSec = 67;
    const randomSec = Math.floor(minSec + Math.random() * (maxSec - minSec + 1));
    console.log(`[GeminiUsage] Next auto-refresh scheduled in ${randomSec}s`);
    setTimeout(() => {
        if (typeof window.fetchGeminiUsagePercent === 'function') {
            window.fetchGeminiUsagePercent();
        }
        window.scheduleNextGeminiUsageFetch();
    }, randomSec * 1000);
};

// Initialize random auto-refresh timer loop (starts 5s after boot)
setTimeout(() => {
    if (typeof window.scheduleNextGeminiUsageFetch === 'function') {
        window.scheduleNextGeminiUsageFetch();
    }
}, 5000);

async function setupBoot() {
    const grid = document.getElementById('agent-hub-grid'), addA = document.getElementById('add-agent-app-card');
    if (!grid || !addA) return;

    const geminiUsageBtn = document.getElementById('taskbar-gemini-usage-btn');
    if (geminiUsageBtn) {
        geminiUsageBtn.onclick = () => {
            window.fetchGeminiUsagePercent();
        };
    }

    const manualCmdBtn = document.getElementById('taskbar-manual-cmd-input-btn');
    const manualCmdContainer = document.getElementById('manual-cmd-input-container');
    const manualCmdTextarea = document.getElementById('manual-cmd-textarea');
    const closeManualCmd = document.getElementById('close-manual-cmd-container');
    const cancelManualCmd = document.getElementById('cancel-manual-cmd');
    const runManualCmd = document.getElementById('run-manual-cmd');

    if (manualCmdBtn && manualCmdContainer) {
        manualCmdBtn.onclick = async () => {
            if (manualCmdContainer.style.display === 'flex') {
                hideManualCmdPanel();
                return;
            }
            if (manualCmdTextarea) {
                try {
                    const clipText = await navigator.clipboard.readText();
                    if (clipText && (clipText.includes('[REQUEST:') || clipText.includes('[CMD:'))) {
                        manualCmdTextarea.value = clipText;
                    }
                } catch(e) {}
            }
            manualCmdContainer.style.display = 'flex';
            if (typeof syncBrowserView === 'function') syncBrowserView();
            setTimeout(() => manualCmdTextarea?.focus(), 50);
        };
    }

    const hideManualCmdPanel = () => {
        if (manualCmdContainer) {
            manualCmdContainer.style.display = 'none';
            if (typeof syncBrowserView === 'function') syncBrowserView();
        }
    };

    if (closeManualCmd) closeManualCmd.onclick = hideManualCmdPanel;
    if (cancelManualCmd) cancelManualCmd.onclick = hideManualCmdPanel;

    if (runManualCmd) {
        runManualCmd.onclick = () => {
            const rawText = manualCmdTextarea ? manualCmdTextarea.value.trim() : '';
            if (!rawText) return;
            hideManualCmdPanel();
            if (manualCmdTextarea) manualCmdTextarea.value = '';
            
            window.dragDropMode = true;
            window.activeDragDropCleanup = () => {
                window.dragDropMode = false;
                window.requestedFilesQueue = [];
                if (typeof window.updateDragDropQueueUI === 'function') {
                    window.updateDragDropQueueUI();
                }
            };
            window.activeDragDropContinue = async () => {
                if (typeof ChatUI !== 'undefined' && typeof ChatUI.appendBubble === 'function') {
                    ChatUI.appendBubble('system', '[SYSTEM] Manual CMD execution payload ready.');
                }
                if (typeof runExperimentalEngine === 'function') {
                    runExperimentalEngine('/marktag', "", null).then(response => {
                        if (response) {
                            if (typeof window.finalizeAiBubble === 'function') window.finalizeAiBubble(response);
                            if (typeof detectAndAskCommand === 'function') detectAndAskCommand(response);
                        }
                    }).catch(err => console.error(err));
                }
            };
            
            if (typeof ChatUI !== 'undefined' && typeof ChatUI.appendBubble === 'function') {
                ChatUI.appendBubble('system', '[SYSTEM] Manual CMD text submitted. Parsing commands...');
            }
            if (typeof detectAndAskCommand === 'function') {
                detectAndAskCommand(rawText);
            }
        };
    }

    const reCmdBtn = document.getElementById('taskbar-recmd-btn');
    if (reCmdBtn) {
        reCmdBtn.onclick = async () => {
            reCmdBtn.style.opacity = '0.5';
            reCmdBtn.style.pointerEvents = 'none';
            try {
                let lastAiText = null;

                // 1. Try fetching text from local chat UI bubbles (latest AI response)
                const aiBubbles = Array.from(document.querySelectorAll('.chat-bubble.ai, .chat-bubble[data-role="ai"]'));
                if (aiBubbles.length > 0) {
                    const lastBubble = aiBubbles[aiBubbles.length - 1];
                    const contentEl = lastBubble.querySelector('.bubble-content');
                    if (contentEl) {
                        lastAiText = contentEl.dataset.rawText || contentEl.innerText || contentEl.textContent;
                    }
                }

                // 2. If not found in local UI, attempt reading latest AI response from Webview DOM
                if (!lastAiText || !lastAiText.trim()) {
                    const wv = document.getElementById('active-agent-webview');
                    if (wv) {
                        lastAiText = await wv.executeJavaScript(`
                            (() => {
                                try {
                                    const aiElems = Array.from(document.querySelectorAll('[data-is-streaming="false"], .model-response-text, .assistant-message, [data-message-author-role="assistant"]'));
                                    if (aiElems.length > 0) {
                                        return aiElems[aiElems.length - 1].innerText || '';
                                    }
                                    const matchedElems = Array.from(document.querySelectorAll('div, section, article, p')).filter(el => el.innerText && (el.innerText.includes('[REQUEST:') || el.innerText.includes('[CMD:')));
                                    if (matchedElems.length > 0) {
                                        return matchedElems[matchedElems.length - 1].innerText || '';
                                    }
                                    return '';
                                } catch(e) { return ''; }
                            })()
                        `).catch(() => '');
                    }
                }

                if (lastAiText && lastAiText.trim()) {
                    window.dragDropMode = true;
                    if (typeof ChatUI !== 'undefined' && typeof ChatUI.appendBubble === 'function') {
                        ChatUI.appendBubble('system', '[SYSTEM] RE-CMD: Re-parsing latest AI message for local commands...');
                    }
                    if (typeof detectAndAskCommand === 'function') {
                        detectAndAskCommand(lastAiText);
                    } else {
                        if (typeof ChatUI !== 'undefined' && typeof ChatUI.appendBubble === 'function') {
                            ChatUI.appendBubble('system', '[ERROR] RE-CMD: detectAndAskCommand function unavailable.');
                        }
                    }
                } else {
                    if (typeof ChatUI !== 'undefined' && typeof ChatUI.appendBubble === 'function') {
                        ChatUI.appendBubble('system', '[WARN] RE-CMD: No recent AI message found to re-read.');
                    }
                }
            } catch(e) {
                if (typeof ChatUI !== 'undefined' && typeof ChatUI.appendBubble === 'function') {
                    ChatUI.appendBubble('system', `[ERROR] RE-CMD: ${e.message}`);
                }
            } finally {
                reCmdBtn.style.opacity = '1';
                reCmdBtn.style.pointerEvents = 'auto';
            }
        };
    }

    const rulesBtn = document.getElementById('taskbar-manual-rules-btn');
    if (rulesBtn) {
        rulesBtn.onclick = async () => {
            if (typeof window.getSystemRulesPrompt !== 'function') return;
            rulesBtn.style.opacity = '0.5';
            rulesBtn.style.pointerEvents = 'none';
            try {
                const rulesFileName = window.makeSendingMdRulesName();
                const rulesContent = `${window.getSystemRulesPrompt(true)}\n\n[SYSTEM] Please acknowledge that you understand and will strictly follow these system rules.`;
                
                const payload = await window.prepareFilePayload(rulesFileName, rulesContent);

                if (typeof window.refreshTree === 'function') window.refreshTree();

                window.requestedFilesQueue = [{
                    absolutePath: payload.absolutePath,
                    relativePath: payload.relativePath,
                    status: 'PENDING'
                }];

                if (typeof window.injectGuestDropInterceptor === 'function') {
                    window.injectGuestDropInterceptor();
                }

                const rulesSendCleanup = () => {
                    if (window.activeDragDropCleanup === rulesSendCleanup) {
                        window.activeDragDropCleanup = null;
                        window.activeDragDropContinue = null;
                    }
                    window.dragDropMode = false;
                    window.requestedFilesQueue = [];
                    if (typeof window.updateDragDropQueueUI === 'function') {
                        window.updateDragDropQueueUI();
                    }
                };

                window.activeDragDropCleanup = rulesSendCleanup;
                window.activeDragDropContinue = async () => {};
                window.dragDropMode = true;

                if (typeof window.updateDragDropQueueUI === 'function') {
                    window.updateDragDropQueueUI();
                }

                ChatUI.appendBubble('system', '[SYSTEM] System rules queued for sending. Drop the file into the AI chat.');
            } catch(e) {
                ChatUI.appendBubble('system', `[ERROR] Failed to prepare system rules: ${e.message}`);
            } finally {
                rulesBtn.style.opacity = '1';
                rulesBtn.style.pointerEvents = 'auto';
            }
        };
    }

    const emptySendMdBtn = document.getElementById('taskbar-empty-sendmd-btn');
    if (emptySendMdBtn) {
        emptySendMdBtn.onclick = () => {
            try {
                const gravityRoot = window.appRootPath || process.cwd();
                const sendingMdDir = path.join(gravityRoot, 'SendingMD');
                let count = 0;
                if (fs.existsSync(sendingMdDir)) {
                    const subfiles = fs.readdirSync(sendingMdDir);
                    for (const file of subfiles) {
                        try {
                            fs.unlinkSync(path.join(sendingMdDir, file));
                            count++;
                        } catch(e) {}
                    }
                }
                if (typeof window.refreshTree === 'function') window.refreshTree();
                ChatUI.appendBubble('system', `[SYSTEM] Cleaned ${count} temporary file(s) from SendingMD folder.`);
            } catch(e) {
                ChatUI.appendBubble('system', `[ERROR] Failed to empty SendingMD folder: ${e.message}`);
            }
        };
    }

    const treeBtn = document.getElementById('taskbar-manual-tree-btn');
    if (treeBtn) {
        treeBtn.onclick = async () => {
            treeBtn.style.opacity = '0.5';
            treeBtn.style.pointerEvents = 'none';
            try {
                const projectTree = await ipcRenderer.invoke('vault-get-tree', window.currentPath || window.projectRoot || process.cwd());
                const treeFileName = window.makeSendingMdTreeName();
                const treeContent = `The current project folder contains the following files:\n${projectTree || '(empty)'}\n\n${window.getSystemRulesPrompt(true)}\n\n[SYSTEM] Please acknowledge receipt of the updated project tree.`;
                
                const payload = await window.prepareFilePayload(treeFileName, treeContent);

                if (typeof window.refreshTree === 'function') window.refreshTree();

                window.requestedFilesQueue = [{
                    absolutePath: payload.absolutePath,
                    relativePath: payload.relativePath,
                    status: 'PENDING'
                }];

                if (typeof window.injectGuestDropInterceptor === 'function') {
                    window.injectGuestDropInterceptor();
                }

                const treeSendCleanup = () => {
                    if (window.activeDragDropCleanup === treeSendCleanup) {
                        window.activeDragDropCleanup = null;
                        window.activeDragDropContinue = null;
                    }
                    window.dragDropMode = false;
                    window.requestedFilesQueue = [];
                    if (typeof window.updateDragDropQueueUI === 'function') {
                        window.updateDragDropQueueUI();
                    }
                };

                window.activeDragDropCleanup = treeSendCleanup;
                window.activeDragDropContinue = async () => {};
                window.dragDropMode = true;

                if (typeof window.updateDragDropQueueUI === 'function') {
                    window.updateDragDropQueueUI();
                }

                ChatUI.appendBubble('system', '[SYSTEM] Project Tree queued for sending. Drop the file into the AI chat.');
            } catch(e) {
                ChatUI.appendBubble('system', `[ERROR] Failed to prepare project tree: ${e.message}`);
            } finally {
                treeBtn.style.opacity = '1';
                treeBtn.style.pointerEvents = 'auto';
            }
        };
    }


    grid.querySelectorAll('.agent-app:not(#add-agent-app-card)').forEach(el => el.remove());

    const showBrowserConfirm = () => {
        return new Promise((resolve) => {
            const modal = document.getElementById('browser-confirm-modal');
            const okBtn = document.getElementById('browser-confirm-ok');
            const cancelBtn = document.getElementById('browser-confirm-cancel');
            const closeBtn = document.getElementById('browser-confirm-close');
            if (!modal || !okBtn || !cancelBtn) return resolve('continue');

            modal.style.display = 'flex';
            setTimeout(() => {
                modal.firstElementChild.style.transform = 'translateY(0)';
            }, 10);

            const hideModal = () => {
                modal.firstElementChild.style.transform = 'translateY(100%)';
                setTimeout(() => { modal.style.display = 'none'; }, 300);
            };

            okBtn.onclick = () => {
                hideModal();
                resolve('send');
            };
            cancelBtn.onclick = () => {
                hideModal();
                resolve('continue');
            };
            if (closeBtn) {
                closeBtn.onclick = () => {
                    hideModal();
                    resolve('abort');
                };
            }
        });
    };

window.setTaskbarActionsVisible = function(visible) {
    document.querySelectorAll('.taskbar-action-btn').forEach(btn => {
        btn.style.display = visible ? 'flex' : 'none';
    });
};

    window.launchWebAgent = async (appData, isSilentBoot = false) => {
        window.sessionBriefed = false;
        window.briefingInProgress = false;
        let u = typeof appData === 'string' ? appData : appData.url;
        let inSel = typeof appData === 'object' ? appData.input : ''; let btnSel = typeof appData === 'object' ? appData.send : ''; let resSel = typeof appData === 'object' ? appData.response : '';

        let confirmResult = 'continue';
        if (!isSilentBoot) {
            confirmResult = await showBrowserConfirm();
            if (confirmResult === 'abort') return;
        }

        const existingWv = document.getElementById('active-agent-webview');
        if (existingWv && existingWv.src === u) {
            if (!isSilentBoot) {
                document.getElementById('agent-hub-home').style.display = 'none';
                document.getElementById('agent-hub-webview').style.display = 'flex';
                window.setTaskbarActionsVisible(true);

                if (confirmResult === 'send' || confirmResult === true) {
                    setTimeout(() => {
                        const projBtn = document.getElementById('btn-send-project-info');
                        if (projBtn) projBtn.click();
                    }, 600);
                }
                
                const webToggle = document.getElementById('web-ai-mode-toggle'); if (webToggle) webToggle.checked = true;
                document.getElementById('tab-local-agent')?.click();
                setTimeout(() => document.getElementById('local-agent-input')?.focus(), 100);
            }
            return;
        }

        if (!isSilentBoot) {
            document.getElementById('agent-hub-home').style.display = 'none';
            document.getElementById('agent-hub-webview').style.display = 'flex';
            window.setTaskbarActionsVisible(true);
        }
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
        
        wv.addEventListener('did-navigate', () => {
            if (typeof window.injectGuestDropInterceptor === 'function') {
                window.injectGuestDropInterceptor();
            }
        });
        wv.addEventListener('did-navigate-in-page', () => {
            if (typeof window.injectGuestDropInterceptor === 'function') {
                window.injectGuestDropInterceptor();
            }
        });
        wv.addEventListener('dom-ready', () => {
            if (typeof window.injectGuestDropInterceptor === 'function') {
                window.injectGuestDropInterceptor();
            }
            if (typeof window.fetchGeminiUsagePercent === 'function') {
                window.fetchGeminiUsagePercent();
            }
            const currentUrl = wv.getURL();
            if (!currentUrl || currentUrl === 'about:blank' || !currentUrl.startsWith('http')) {
                return;
            }
            wv.executeJavaScript(`
                window.addEventListener('keydown', (e) => {
                    const key = e.key.toLowerCase();
                    if ((e.controlKey && key === 'r') || e.key === 'F5') {
                        e.preventDefault();
                        location.reload();
                    }
                }, true);
            `).catch(() => {});
            if (typeof window.injectGuestDropInterceptor === 'function') {
                window.injectGuestDropInterceptor();
            }
            wv.executeJavaScript(`
                (() => {
                    const styleId = 'poormansgravity-guest-style';
                    let style = document.getElementById(styleId);
                    if (!style) {
                        style = document.createElement('style');
                        style.id = styleId;
                        style.textContent = \`
                            [class*="disclaimer"], [class*="legal"], [class*="bottom-text"], [class*="footer"], .disclaimer {
                                display: none !important;
                            }
                        \`;
                        document.head.appendChild(style);
                    }

                    const getInputAreaHeight = () => {
                        let input = document.querySelector('textarea, [contenteditable="true"]');
                        if (!input) return 220;
                        
                        let capsule = document.querySelector('.input-area, [class*="PromptTextarea"]');
                        if (!capsule) {
                            capsule = input;
                        }
                        
                        let container = input;
                        while (container && container !== document.body) {
                            const style = window.getComputedStyle(container);
                            const isBottomContainer = container.matches('.input-area-container, .input-area, [class*="composer"], [class*="input-container"], [class*="PromptTextarea"]') || 
                                                     (style.position === 'fixed' || style.position === 'absolute');
                            
                            if (isBottomContainer) {
                                const rect = container.getBoundingClientRect();
                                if (rect.width > window.innerWidth * 0.5) {
                                    break;
                                }
                            }
                            container = container.parentElement;
                        }
                        if (!container || container === document.body) {
                            container = input.parentElement;
                        }
                        
                        const capRect = capsule.getBoundingClientRect();
                        const bottomSpace = Math.max(0, window.innerHeight - capRect.bottom);
                        
                        // Symmetrize top padding to match bottom space + 2px offset!
                        container.style.paddingTop = (bottomSpace + 2) + 'px';
                        container.style.marginTop = '0px';
                        container.style.marginBottom = '0px';
                        
                        return Math.ceil(capRect.height + bottomSpace * 2) + 2;
                    };
                    
                    let lastHeight = 0;
                    const observer = new ResizeObserver(() => {
                        const h = getInputAreaHeight();
                        if (h !== lastHeight && h > 40 && h < 500) {
                            lastHeight = h;
                            console.log('[GUEST_INPUT_HEIGHT]:' + h);
                        }
                    });
                    
                    setInterval(() => {
                        let input = document.querySelector('textarea, [contenteditable="true"]');
                        if (input) {
                            let container = input;
                            while (container && container !== document.body) {
                                const style = window.getComputedStyle(container);
                                const isBottomContainer = container.matches('.input-area-container, .input-area, [class*="composer"], [class*="input-container"], [class*="PromptTextarea"]') || 
                                                         (style.position === 'fixed' || style.position === 'absolute');
                                
                                if (isBottomContainer) {
                                    const rect = container.getBoundingClientRect();
                                    if (rect.width > window.innerWidth * 0.5) {
                                        break;
                                    }
                                }
                                container = container.parentElement;
                            }
                            if (!container || container === document.body) {
                                container = input.parentElement;
                            }
                            if (container && container !== window.observedInputContainer) {
                                observer.disconnect();
                                observer.observe(container);
                                window.observedInputContainer = container;
                                
                                const h = getInputAreaHeight();
                                lastHeight = h;
                                console.log('[GUEST_INPUT_HEIGHT]:' + h);
                            }
                        }
                    }, 1000);
                })();
            `).catch(err => console.error("Failed to inject guest height observer:", err));
            
            const guestInterceptorScript = `
                (() => {
                    const inKeywords = ["message", "ask", "prompt", "type", "question", "conversation", "input", "chat", "command", "send", "help you today", "search", "write", "say"];
                    
                    const findInput = () => {
                        const isVisible = (el) => !!(el.offsetWidth || el.offsetHeight || (el.getClientRects && el.getClientRects().length));
                        const mainCandidates = Array.from(document.querySelectorAll('textarea, div[contenteditable="true"], [role="textbox"]')).filter(el => isVisible(el));
                        for (let el of mainCandidates) {
                            const text = (el.placeholder || el.getAttribute('aria-label') || el.title || el.innerText || '').toLowerCase();
                            if (inKeywords.some(k => text.includes(k))) return el;
                        }
                        if (mainCandidates.length > 0) return mainCandidates[0];
                        return null;
                    };
                    
                    const interceptAndPrepend = (input) => {
                        if (window.isHostSending) return;
                        
                        let textVal = "";
                        if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
                            textVal = input.value;
                        } else {
                            textVal = input.innerText;
                        }
                        
                        if (!textVal.trim()) return;
                        if (textVal.includes("[SYSTEM RULES]")) return;
                        
                        console.log("[HOST_GUEST_INTERCEPTOR] Prepending system prompt.");
                        
                        const systemPrompt = ${JSON.stringify(window.getSystemRulesPrompt())};
                        const fullText = systemPrompt + "\\n\\n[USER MESSAGE]\\n" + textVal;
                        
                        if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
                            const proto = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
                            const desc = Object.getOwnPropertyDescriptor(proto, 'value');
                            if (desc && desc.set) {
                                desc.set.call(input, fullText);
                            } else {
                                input.value = fullText;
                            }
                        } else {
                            const escapeHtml = (t) => {
                                return t
                                    .replace(/&/g, "&amp;")
                                    .replace(/</g, "&lt;")
                                    .replace(/>/g, "&gt;")
                                    .replace(/"/g, "&quot;")
                                    .replace(/'/g, "&#039;")
                                    .replace(/\n/g, "<br>");
                            };
                            input.innerHTML = escapeHtml(fullText);
                        }
                        
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                    };
                    
                    setInterval(() => {
                        const input = findInput();
                        if (!input) return;
                        
                        if (input.dataset.gravityHooked) return;
                        input.dataset.gravityHooked = "true";
                        
                        input.addEventListener('keydown', (e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                interceptAndPrepend(input);
                            }
                        }, { capture: true });
                        
                        const findSendBtn = () => {
                            const btns = Array.from(document.querySelectorAll('button, div[role="button"], svg'));
                            for (let btn of btns) {
                                const text = (btn.getAttribute('aria-label') || btn.title || btn.innerText || '').toLowerCase();
                                if (text.includes('send') || text.includes('전송') || text.includes('입력') || text.includes('submit')) {
                                    let cur = btn;
                                    while (cur && cur.tagName !== 'BUTTON' && cur.getAttribute('role') !== 'button') {
                                        cur = cur.parentElement;
                                    }
                                    return cur || btn;
                                }
                            }
                            return null;
                        };
                        
                        const sendBtn = findSendBtn();
                        if (sendBtn) {
                            sendBtn.addEventListener('click', (e) => {
                                interceptAndPrepend(input);
                            }, { capture: true });
                            sendBtn.addEventListener('mousedown', (e) => {
                                interceptAndPrepend(input);
                            }, { capture: true });
                        }
                    }, 1000);
                })();
            `;
            wv.executeJavaScript(guestInterceptorScript).catch(err => console.error("Failed to inject guest interceptor:", err));

            wv.executeJavaScript(`
                (() => {
                    let lastSentText = "";
                    let stableTimer = null;
                    
                    const toMarkdown = (node) => {
                        if (node.nodeType === 3) return node.nodeValue;
                        if (node.nodeType !== 1) return "";
                        const tag = node.tagName.toLowerCase();
                        let html = "";
                        node.childNodes.forEach(c => { html += toMarkdown(c); });
                        switch(tag) {
                            case 'h1': return "\\n# " + html.trim() + "\\n";
                            case 'h2': return "\\n## " + html.trim() + "\\n";
                            case 'h3': return "\\n### " + html.trim() + "\\n";
                            case 'h4': return "\\n#### " + html.trim() + "\\n";
                            case 'p': return "\\n" + html.trim() + "\\n";
                            case 'br': return "\\n";
                            case 'strong':
                            case 'b': return "**" + html.trim() + "**";
                            case 'em':
                            case 'i': return "*" + html.trim() + "*";
                            case 'code': {
                                const text = node.textContent || "";
                                const parentTag = (node.parentNode && node.parentNode.tagName) ? node.parentNode.tagName.toLowerCase() : "";
                                const parentClassList = (node.parentNode && node.parentNode.classList) ? node.parentNode.classList : null;
                                const isBlock = parentTag === 'pre' || parentTag === 'code-block' || (parentClassList && parentClassList.contains('code-block')) || text.includes('\\n');
                                return isBlock ? "\\n\`\`\`\\n" + html.trim() + "\\n\`\`\`\\n" : "\`" + html.trim() + "\`";
                            }
                            case 'pre':
                            case 'code-block': return "\\n" + html.trim() + "\\n";
                            case 'li': {
                                const parentTag = (node.parentNode && node.parentNode.tagName) ? node.parentNode.tagName.toLowerCase() : "";
                                if (parentTag === 'ol') {
                                    const siblings = Array.from(node.parentNode.children || []);
                                    const idx = siblings.indexOf(node) + 1;
                                    return "\\n" + idx + ". " + html.trim();
                                }
                                return "\\n- " + html.trim();
                            }
                            case 'ul':
                            case 'ol': return "\\n" + html + "\\n";
                            default: return html;
                        }
                    };

                    const checkAndSend = () => {
                        const selectors = [
                            'message-content',
                            'model-response',
                            'model-response .markdown', 
                            'message-content .markdown-prose', 
                            '[data-testid="message-content"]', 
                            '.response-content'
                        ];
                        let lastAiBubble = null;
                        for (let sel of selectors) {
                            const nodes = document.querySelectorAll(sel);
                            if (nodes.length > 0) {
                                lastAiBubble = nodes[nodes.length - 1];
                                break;
                            }
                        }
                        if (!lastAiBubble) return;
                        
                        const clone = lastAiBubble.cloneNode(true);
                        clone.querySelectorAll('script, style, button, a[role="link"], [role="button"], .carousel, .suggestions-container, [aria-label*="추천"], .code-block-header, .code-header, [class*="code-header"]').forEach(el => el.remove());
                        
                        const currentText = toMarkdown(clone).replace(/\\n{3,}/g, "\\n\\n").trim();
                        if (!currentText || currentText === lastSentText) return;
                        
                        if (!stableTimer) {
                            lastSentText = currentText;
                            const encoded = btoa(unescape(encodeURIComponent(currentText)));
                            console.log("[BACKGROUND_AI_RESP]:" + encoded);
                            
                            stableTimer = setTimeout(() => {
                                stableTimer = null;
                                checkAndSend();
                            }, 150);
                        }
                    };
                    const observer = new MutationObserver(() => { checkAndSend(); });
                    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
                })();
            `).catch(() => {});
        });

        if (!isSilentBoot) {
            wv.addEventListener('did-finish-load', async () => {
                if (window.carryOverPrompt) {
                    const carry = window.carryOverPrompt;
                    window.carryOverPrompt = null;
                    window.sessionBriefed = true;
                    window.briefingInProgress = false;
                    
                    setTimeout(async () => {
                        try {
                            window.showInputLoading();
                            ChatUI.appendBubble('system', '[SYSTEM] Fresh session started. Injecting carryover context...');
                            
                            window.currentBatchFileCount = -1;
                            const promptPromise = runExperimentalEngine('/marktag', carry, null);
                            await injectWebPayload(carry, -1);
                            
                            const response = await Promise.race([
                                promptPromise,
                                new Promise((_, reject) => setTimeout(() => reject(new Error('Response timeout')), 120000))
                            ]);
                            window.hideInputLoading();
                            document.getElementById('tab-local-agent')?.click();
                            if (response) {
                                if (typeof window.finalizeAiBubble === 'function') {
                                    window.finalizeAiBubble(response);
                                }
                                detectAndAskCommand(response);
                            }
                        } catch (e) {
                            console.error(e);
                            window.hideInputLoading();
                        }
                    }, 5000);
                    return;
                }
                if (window.sessionBriefed || window.briefingInProgress) return;
                window.briefingInProgress = true;
                
                const projectTree = await ipcRenderer.invoke('vault-get-tree', window.currentPath || window.projectRoot);
                if (projectTree) {
                    setTimeout(async () => {
                        try {
                            await injectWebPayload("dont think simply answer me 'A'", -1); await runExperimentalEngine('/marktag', "dont think simply answer me 'A'", null);
                            ChatUI.appendBubble('system', '[SYSTEM] INITIALIZATION COMPLETE.');
                            
                            const isEmpty = !projectTree || projectTree.trim() === '' || !projectTree.includes('- ');
                            const startPrompt = isEmpty
                                ? `This folder is a completely empty new project. If you understand these instructions, ask the user what project to create.`
                                : window.dragDropMode 
                                    ? `If you understand these instructions, ask the user to drop the key entry file for analysis using [REQUEST: read-file "actual/file/path"]. Do not request non-existent files.` 
                                    : `If you understand these instructions, request key entry files for analysis immediately using [CMD: read-file "actual/file/path"]. Do not request non-existent files.`;

                            const briefPayload = isEmpty
                                ? `${window.getSystemRulesPrompt(true)}\n\n${startPrompt}`.trim()
                                : `The current project folder contains the following files:\n${projectTree}\n${window.getSystemRulesPrompt(true)}\n${startPrompt}`.trim();
                             console.log("[BriefingPayload] Generated payload:\n", briefPayload);

                            window.currentBatchFileCount = -1;
                            
                            if (!window.dragDropMode) {
                                const briefPromise = runExperimentalEngine('/marktag', briefPayload, null);
                                await injectWebPayload(briefPayload, -1);
                                
                                const briefResponse = await Promise.race([
                                    briefPromise,
                                    new Promise((_, reject) => setTimeout(() => reject(new Error('Briefing response timeout')), 120000))
                                ]);
                                window.sessionBriefed = true;
                                window.briefingInProgress = false;
                                window.hideInputLoading();
                                document.getElementById('tab-local-agent').click();
                                if (briefResponse) {
                                    if (!window.autoContinueOnRead) {
                                        if (typeof window.finalizeAiBubble === 'function') {
                                            window.finalizeAiBubble(briefResponse);
                                        }
                                    }
                                    detectAndAskCommand(briefResponse);
                                }
                                window.currentBatchFileCount = 0;
                            } else {
                                const fs = require('fs');
                                const path = require('path');
                                const randSuffix = Math.floor(100000 + Math.random() * 900000);
                                 const gravityRoot = window.appRootPath || process.cwd();
                                 const sendingMdDir = path.join(gravityRoot, 'SendingMD');
                                 if (!fs.existsSync(sendingMdDir)) fs.mkdirSync(sendingMdDir, { recursive: true });
                                 window.tempRulesFileName = path.join('SendingMD', `_project_rules_${randSuffix}.md`);
                                 const tempRulesPath = path.join(gravityRoot, window.tempRulesFileName);
                                 try {
                                     fs.writeFileSync(tempRulesPath, briefPayload, 'utf-8');
                                      console.log("[BriefingPayload] (DragDrop) Saved rules file:", tempRulesPath, "\nContent:\n", briefPayload);
                                    if (typeof window.refreshTree === 'function') {
                                        window.refreshTree();
                                    }
                                } catch (err) {
                                    console.error("Failed to write temporary rules file during boot:", err);
                                }

                                window.requestedFilesQueue = [{
                                    absolutePath: tempRulesPath,
                                    relativePath: window.tempRulesFileName,
                                    status: 'PENDING'
                                }];

                                if (typeof window.injectGuestDropInterceptor === 'function') {
                                    window.injectGuestDropInterceptor();
                                }

                                const cleanupDragDrop = () => {
                                    if (window.activeDragDropCleanup === cleanupDragDrop) {
                                        window.activeDragDropCleanup = null;
                                        window.activeDragDropContinue = null;
                                    }
                                    const vLC = document.getElementById('inspector-local-chat');
                                    const vBH = document.getElementById('inspector-browser-hub');
                                    const arrowIndicator = document.getElementById('drag-drop-arrow-indicator');
                                    if (arrowIndicator) arrowIndicator.remove();
                                    
                                    const inputContainer = document.getElementById('local-input-container');
                                    if (inputContainer) {
                                        inputContainer.style.background = '';
                                        inputContainer.style.display = 'none';
                                        inputContainer.style.height = '';
                                    }
                                    if (vLC) {
                                        vLC.style.height = "100%";
                                        vLC.style.zIndex = '100';
                                    }
                                    if (vBH) {
                                        vBH.style.position = 'absolute';
                                        vBH.style.top = '0';
                                        vBH.style.height = '100%';
                                        vBH.style.width = '100%';
                                        vBH.style.zIndex = '150';
                                        vBH.style.opacity = '1';
                                        vBH.style.pointerEvents = 'auto';
                                    }

                                };

                                window.activeDragDropCleanup = cleanupDragDrop;
                                window.activeDragDropContinue = async () => {};

                                window.sessionBriefed = true;
                                window.briefingInProgress = false;
                                window.currentBatchFileCount = 0;
                                window.isBriefingResponsePending = true;

                                window.hideInputLoading();

                                setTimeout(() => {
                                    if (typeof window.updateDragDropQueueUI === 'function') {
                                        window.updateDragDropQueueUI();
                                    }
                                }, 600);
                            }
                        } catch (err) {
                            window.sessionBriefed = true;
                            window.briefingInProgress = false;
                            window.hideInputLoading();
                            document.getElementById('tab-local-agent').click();
                            ChatUI.appendBubble('system', '[ERROR] INITIALIZATION FAILED.');
                            window.currentBatchFileCount = 0;
                        }
                    }, 2500);
                }
            }, { once: true });
        }

        window.showInputLoading = (text = "Processing...") => {
            // Completely disabled overlay display during thinking/typing to keep chat screen clean and fully visible
            const overlay = document.getElementById('local-chat-overlay');
            if (overlay) overlay.style.display = 'none';
        };
        window.hideInputLoading = () => {
            const overlay = document.getElementById('local-chat-overlay');
            if (overlay) {
                overlay.style.display = 'none';
                overlay.innerHTML = '';
            }
        };

        window.parseSearchReplaceBlocks = (text, filePath = null) => {
            if (!text) return [];
            const blocks = [];
            
            // 1. Standard format parser: <<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE
            const sRegex = /(?:<<<<<<<|< < < < < < <)/g;
            const mRegex = /(?:=======|= = = = = = =)/g;
            const rRegex = /(?:>>>>>>>|> > > > > > >|REPLACE)/gi;
            
            let pos = 0;
            while (true) {
                sRegex.lastIndex = pos;
                const sMatch = sRegex.exec(text);
                if (!sMatch) break;
                const sIdx = sMatch.index;
                const sLen = sMatch[0].length;
                
                rRegex.lastIndex = sIdx + sLen;
                const rMatch = rRegex.exec(text);
                if (!rMatch) {
                    pos = sIdx + sLen;
                    continue;
                }
                const rIdx = rMatch.index;
                const rLen = rMatch[0].length;
                
                sRegex.lastIndex = sIdx + sLen;
                const nextSMatch = sRegex.exec(text);
                if (nextSMatch && nextSMatch.index < rIdx) {
                    pos = nextSMatch.index;
                    continue;
                }
                
                let rawBlock = text.substring(sIdx + sLen, rIdx).trim();
                if (rawBlock.toUpperCase().startsWith("SEARCH")) {
                    rawBlock = rawBlock.substring(6).trim();
                }
                
                let searchVal = "";
                let replaceVal = "";
                let hasDivider = false;
                
                mRegex.lastIndex = sIdx + sLen;
                const mMatch = mRegex.exec(text);
                if (mMatch && mMatch.index < rIdx) {
                    const mIdx = mMatch.index;
                    const mLen = mMatch[0].length;
                    
                    searchVal = text.substring(sIdx + sLen, mIdx).trim();
                    if (searchVal.toUpperCase().startsWith("SEARCH")) {
                        searchVal = searchVal.substring(6).trim();
                    }
                    
                    replaceVal = text.substring(mIdx + mLen, rIdx).trim();
                    if (replaceVal.toUpperCase().startsWith("REPLACE")) {
                        replaceVal = replaceVal.substring(7).trim();
                    }
                    hasDivider = true;
                } else {
                    let fuzzySplitSuccess = false;
                    if (filePath) {
                        try {
                            const fs = require('fs');
                            const path = require('path');
                            const targetPath = path.resolve(window.currentPath || process.cwd(), filePath);
                            if (fs.existsSync(targetPath)) {
                                const fileContent = fs.readFileSync(targetPath, 'utf-8').replace(/\r/g, '');
                                const fileLines = fileContent.split('\n').map(l => l.trim().toLowerCase().replace(/[^a-z0-9ㄱ-ㅎㅏ-ㅣ가-힣]/g, ''));
                                
                                const blockLines = rawBlock.split('\n');
                                let splitIdx = blockLines.length;
                                
                                for (let i = 0; i < blockLines.length; i++) {
                                    const line = blockLines[i].trim();
                                    if (line === "") continue;
                                    
                                    const lineNorm = line.toLowerCase().replace(/[^a-z0-9ㄱ-ㅎㅏ-ㅣ가-힣]/g, '');
                                    const hasMatch = fileLines.some(fl => {
                                        if (fl === "" && lineNorm === "") return true;
                                        if (fl.includes(lineNorm) || lineNorm.includes(fl)) return true;
                                        if (fl.length > 5 && lineNorm.length > 5) {
                                            let common = 0;
                                            for (let c of lineNorm) {
                                                if (fl.includes(c)) common++;
                                            }
                                            if (common / Math.max(fl.length, lineNorm.length) >= 0.7) return true;
                                        }
                                        return false;
                                    });
                                    
                                    if (!hasMatch) {
                                        splitIdx = i;
                                        break;
                                    }
                                }
                                
                                searchVal = blockLines.slice(0, splitIdx).join('\n').trim();
                                replaceVal = blockLines.slice(splitIdx).join('\n').trim();
                                fuzzySplitSuccess = true;
                            }
                        } catch (err) {
                            console.error("parseSearchReplaceBlocks resilient fallback error:", err);
                        }
                    }
                    
                    if (!fuzzySplitSuccess) {
                        searchVal = rawBlock;
                        replaceVal = "";
                    }
                }
                
                const stripFences = (str) => {
                    return str.trim()
                              .replace(/^```[a-zA-Z]*\r?\n/, '')
                              .replace(/\r?\n```$/, '')
                              .replace(/```$/, '')
                              .trim();
                };
                
                blocks.push({
                    fullMatch: text.substring(sIdx, rIdx + rLen),
                    search: stripFences(searchVal),
                    replace: stripFences(replaceVal),
                    hasDivider: hasDivider,
                    rawBlock: stripFences(rawBlock)
                });
                
                pos = rIdx + rLen;
            }
            
            // 2. Simple bracket format parser: [SEARCH] ... [REPLACE] ... [END]
            const sMarkerSimple = /\[SEARCH\]/gi;
            const mMarkerSimple = /\[REPLACE\]/gi;
            const rMarkerSimple = /\[END\]/gi;
            
            let posSimple = 0;
            while (true) {
                sMarkerSimple.lastIndex = posSimple;
                const sMatch = sMarkerSimple.exec(text);
                if (!sMatch) break;
                const sIdx = sMatch.index;
                const sLen = sMatch[0].length;
                
                mMarkerSimple.lastIndex = sIdx + sLen;
                const mMatch = mMarkerSimple.exec(text);
                if (!mMatch) {
                    posSimple = sIdx + sLen;
                    continue;
                }
                const mIdx = mMatch.index;
                const mLen = mMatch[0].length;
                
                rMarkerSimple.lastIndex = mIdx + mLen;
                let rMatch = rMarkerSimple.exec(text);
                let rIdx, rLen;
                if (rMatch) {
                    rIdx = rMatch.index;
                    rLen = rMatch[0].length;
                } else {
                    const nextCmd = text.indexOf("[CMD:", mIdx + mLen);
                    const nextSearch = text.indexOf("[SEARCH]", mIdx + mLen);
                    let endPos = text.length;
                    if (nextCmd !== -1 && nextSearch !== -1) {
                        endPos = Math.min(nextCmd, nextSearch);
                    } else if (nextCmd !== -1) {
                        endPos = nextCmd;
                    } else if (nextSearch !== -1) {
                        endPos = nextSearch;
                    }
                    rIdx = endPos;
                    rLen = 0;
                }
                
                sMarkerSimple.lastIndex = sIdx + sLen;
                const nextSMatch = sMarkerSimple.exec(text);
                if (nextSMatch && nextSMatch.index < mIdx) {
                    posSimple = nextSMatch.index;
                    continue;
                }
                
                const searchVal = text.substring(sIdx + sLen, mIdx).trim();
                const replaceVal = text.substring(mIdx + mLen, rIdx).trim();
                
                const stripFences = (str) => {
                    return str.trim()
                              .replace(/^```[a-zA-Z]*\r?\n/, '')
                              .replace(/\r?\n```$/, '')
                              .replace(/```$/, '')
                              .trim();
                };
                
                blocks.push({
                    fullMatch: text.substring(sIdx, rIdx + rLen),
                    search: stripFences(searchVal),
                    replace: stripFences(replaceVal),
                    hasDivider: true,
                    rawBlock: stripFences(searchVal + "\n" + replaceVal)
                });
                
                posSimple = rIdx + rLen;
            }
            
            blocks.sort((a, b) => text.indexOf(a.fullMatch) - text.indexOf(b.fullMatch));
            
            return blocks;
        };

        window.formatChatText = (text) => {
            if (!text) return "";
            
            const escapeHtml = (str) => {
                return str.replace(/&/g, '&amp;')
                          .replace(/</g, '&lt;')
                          .replace(/>/g, '&gt;');
            };

            let formatted = text;
            const editMatch = text.match(/\[CMD:\s*edit-file\s+["']?([^"'\s\]]+)["']?\]/i);
            const filePath = editMatch ? editMatch[1].trim() : null;
            
            const parsedBlocks = window.parseSearchReplaceBlocks(text, filePath);
            parsedBlocks.forEach(block => {
                const cardHtml = `<div class="search-replace-block" style="border: 1px solid var(--border-color); background: #0c0c0e; border-radius: 6px; overflow: hidden; margin: 12px 0; font-family: 'DM Sans', sans-serif;">
    <div style="padding: 6px 12px; background: rgba(239, 68, 68, 0.08); border-bottom: 1px solid rgba(239, 68, 68, 0.15); display: flex; align-items: center; justify-content: space-between;">
        <span style="font-size: 10px; font-weight: 700; color: #ef4444; letter-spacing: 0.08em; text-transform: uppercase;">Original (Search)</span>
    </div>
    <pre style="margin: 0; padding: 12px; background: #09090b !important; border: none !important; border-radius: 0 !important; color: #f87171 !important; font-family: 'JetBrains Mono', monospace; font-size: 12.5px; overflow-x: auto; white-space: pre-wrap; word-break: break-all;">${escapeHtml(block.search)}</pre>
    <div style="padding: 6px 12px; background: rgba(16, 185, 129, 0.08); border-top: 1px solid rgba(16, 185, 129, 0.15); border-bottom: 1px solid rgba(16, 185, 129, 0.15); display: flex; align-items: center; justify-content: space-between;">
        <span style="font-size: 10px; font-weight: 700; color: #10b981; letter-spacing: 0.08em; text-transform: uppercase;">Replacement (Replace)</span>
    </div>
    <pre style="margin: 0; padding: 12px; background: #09090b !important; border: none !important; border-radius: 0 !important; color: #34d399 !important; font-family: 'JetBrains Mono', monospace; font-size: 12.5px; overflow-x: auto; white-space: pre-wrap; word-break: break-all;">${escapeHtml(block.replace)}</pre>
</div>`;
                formatted = formatted.replace(block.fullMatch, () => cardHtml);
            });

            return formatted.replace(/\[CMD:\s*([^\]]+)\]/gi, (match, cmdContent) => {
                return `<span class="chat-cmd-badge">&gt;_ ${cmdContent}</span>`;
            });
        };

        window.typewriterHTML = (element, markdownText, callback) => {
            if (!element) return;
            if (element.typewriterInterval) clearInterval(element.typewriterInterval);
            
            const formatted = window.formatChatText(markdownText);
            const totalLength = formatted.length;
            let currentLength = 0;
            const stepSize = Math.max(2, Math.ceil(totalLength / 35)); // Fast 35-step animation
            
            element.typewriterInterval = setInterval(() => {
                currentLength += stepSize;
                if (currentLength >= totalLength) {
                    clearInterval(element.typewriterInterval);
                    element.innerHTML = typeof marked !== 'undefined' ? marked.parse(formatted).trim() : formatted.trim();
                    if (callback) callback();
                } else {
                    const sliced = formatted.substring(0, currentLength);
                    element.innerHTML = typeof marked !== 'undefined' ? marked.parse(sliced).trim() : sliced.trim();
                }
            }, 12);
        };

        window.updateAiStreamBubble = (text) => {
            if (!text) return;
            const chatLog = document.getElementById('local-chat-messages');
            if (!chatLog) return;
            
            if (window.currentBatchFileCount === -1 && window.autoContinueOnRead) return;

            if (!window.isNewResponse && window.lastActiveAiBubble) {
                const contentEl = window.lastActiveAiBubble.querySelector('.bubble-content');
                if (contentEl) {
                    if (contentEl.typewriterInterval) {
                        clearInterval(contentEl.typewriterInterval);
                        contentEl.typewriterInterval = null;
                    }
                    contentEl.dataset.rawText = text;
                    const formatted = typeof window.formatChatText === 'function' ? window.formatChatText(text) : text;
                    contentEl.innerHTML = typeof marked !== 'undefined' ? marked.parse(formatted).trim() : formatted.trim();
                    if (typeof hljs !== 'undefined') {
                        window.lastActiveAiBubble.querySelectorAll('pre code').forEach((el) => hljs.highlightElement(el));
                    }
                    chatLog.scrollTop = chatLog.scrollHeight;
                    return;
                }
            }
            
            window.isNewResponse = false;
            const webviewEl = document.getElementById('active-agent-webview');
            const getWebIcon = (w) => { try { return `https://www.google.com/s2/favicons?domain=${new URL(w.src).hostname}&sz=64`; } catch { return null; } };
            window.lastActiveAiBubble = ChatUI.appendBubble('ai', text, false, getWebIcon(webviewEl));
        };

        window.finalizeAiBubble = (response) => {
            if (!response) return;
            const chatLog = document.getElementById('local-chat-messages');
            const targetBubble = window.lastActiveAiBubble;
            if (targetBubble && targetBubble.parentNode === chatLog) {
                const contentEl = targetBubble.querySelector('.bubble-content');
                if (contentEl) {
                    window.activeAiResponding = false; // Turn off stream overwrites
                    
                    if (contentEl.typewriterInterval) {
                        clearInterval(contentEl.typewriterInterval);
                        contentEl.typewriterInterval = null;
                    }
                    
                    contentEl.dataset.rawText = response;
                    const formatted = typeof window.formatChatText === 'function' ? window.formatChatText(response) : response;
                    contentEl.innerHTML = typeof marked !== 'undefined' ? marked.parse(formatted).trim() : formatted.trim();
                    
                    if (targetBubble && typeof hljs !== 'undefined') {
                        targetBubble.querySelectorAll('pre code').forEach((el) => hljs.highlightElement(el));
                    }
                    if (chatLog) chatLog.scrollTop = chatLog.scrollHeight;
                    return;
                }
            }
            const wv = document.getElementById('active-agent-webview');
            const getWebIcon = (w) => { try { return `https://www.google.com/s2/favicons?domain=${new URL(w.src).hostname}&sz=64`; } catch { return null; } };
            window.lastActiveAiBubble = ChatUI.appendBubble('ai', response, false, getWebIcon(wv));
        };

        let lastReceivedMirrorText = "";
        wv.addEventListener('console-message', (e) => {
            // Forward all other guest logs for debugging
            if (!e.message.startsWith('[GUEST_HTML5_DROP]:') && 
                !e.message.startsWith('[GUEST_FILE_DROP]:') && 
                !e.message.startsWith('[GUEST_USER_MESSAGE]:') && 
                !e.message.startsWith('[BACKGROUND_AI_RESP]:') &&
                !e.message.startsWith('[GUEST_INPUT_HEIGHT]:') &&
                !e.message.startsWith('[INJECT_PCT]:')) {
                // console.log('[GUEST_CONSOLE]: ' + e.message);
            }

            if (e.message.startsWith('[GUEST_HTML5_DROP]:') || e.message.startsWith('[GUEST_FILE_DROP]:')) {
                let filePath = "";
                if (e.message.startsWith('[GUEST_HTML5_DROP]:')) {
                    filePath = e.message.substring(19);
                } else {
                    const filename = e.message.substring(18);
                    const droppedName = filename.toLowerCase();
                    const pathModule = require('path');
                    if (window.currentlyDraggedFilePath && pathModule.basename(window.currentlyDraggedFilePath).toLowerCase() === droppedName) {
                        filePath = window.currentlyDraggedFilePath;
                        window.currentlyDraggedFilePath = null;
                    } else {
                        const match = window.requestedFilesQueue.find(x => x.relativePath.split(/[\\/]/).pop().toLowerCase() === droppedName);
                        if (match) {
                            filePath = match.absolutePath;
                        }
                    }
                }
                
                if (filePath) {
                    const now = Date.now();
                    if (window.lastHandledDropPath === filePath && (now - (window.lastHandledDropTime || 0)) < 1500) {
                        console.log("[HostDrop] Ignored duplicate drop event for:", filePath);
                        return;
                    }
                    window.lastHandledDropPath = filePath;
                    window.lastHandledDropTime = now;
                    
                    console.log("[HostDrop] Intercepted drop for path:", filePath);
                    
                    const isImage = /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(filePath);
                    if (isImage) {
                        if (typeof ChatUI !== 'undefined' && ChatUI.appendBubble) {
                            const pathModule = require('path');
                            ChatUI.appendBubble('user', `Attached image: ${pathModule.basename(filePath)}`);
                        }
                        return;
                    }
                    
                    if (window.dragDropMode && window.activeDragDropContinue) {
                        const pathModule = require('path');
                        const droppedName = pathModule.basename(filePath).toLowerCase();
                        
                        const pendingItems = window.requestedFilesQueue.filter(item => item.status === 'PENDING' || item.status === 'UPLOADING');
                        const requestedNames = pendingItems.map(item => item.relativePath.split(/[\\/]/).pop().toLowerCase());
                        
                        if (requestedNames.length > 0 && !requestedNames.includes(droppedName)) {
                            const { showAlert } = require('./ui/dialogs.js');
                            if (typeof showAlert === 'function') {
                                showAlert(`Not a requested file.\nRequested files: ${requestedNames.join(', ')}`);
                            } else {
                                alert(`Not a requested file.\nRequested files: ${requestedNames.join(', ')}`);
                            }
                            return;
                        }
                        
                        window.markFileAsCompleted(filePath);
                        if (typeof ChatUI !== 'undefined' && ChatUI.appendBubble) {
                            const chatLog = document.getElementById('local-chat-messages');
                            let lastUserBubble = null;
                            let baseName = pathModule.basename(filePath);
                            if (baseName.startsWith('_project_read_bundle_')) {
                                baseName = 'Requested Files';
                            } else if (baseName.startsWith('_project_rules_')) {
                                baseName = 'System Rules';
                            }
                            
                            if (chatLog) {
                                const bubbles = Array.from(chatLog.querySelectorAll('.chat-bubble'));
                                if (bubbles.length > 0) {
                                    let lastAiIdx = -1;
                                    let lastUserIdx = -1;
                                    for (let i = 0; i < bubbles.length; i++) {
                                        const b = bubbles[i];
                                        if (b.classList.contains('ai')) {
                                            lastAiIdx = i;
                                        } else if (b.classList.contains('user')) {
                                            const contentEl = b.querySelector('.bubble-content');
                                            if (contentEl && contentEl.dataset.rawText && contentEl.dataset.rawText.startsWith('Attached:')) {
                                                lastUserIdx = i;
                                            }
                                        }
                                    }
                                    if (lastUserIdx !== -1 && lastUserIdx > lastAiIdx) {
                                        lastUserBubble = bubbles[lastUserIdx];
                                    }
                                }
                            }
                            
                            if (lastUserBubble) {
                                const contentEl = lastUserBubble.querySelector('.bubble-content');
                                const oldText = contentEl.dataset.rawText;
                                let newText = oldText + ' | ' + baseName;
                                contentEl.dataset.rawText = newText;
                                const formatted = typeof window.formatChatText === 'function' ? window.formatChatText(newText) : newText;
                                if (typeof marked !== 'undefined') {
                                    contentEl.innerHTML = marked.parse(formatted).trim();
                                } else {
                                    contentEl.innerText = formatted.trim();
                                }
                                if (typeof hljs !== 'undefined') {
                                    lastUserBubble.querySelectorAll('pre code').forEach((el) => hljs.highlightElement(el));
                                }
                                chatLog.scrollTop = chatLog.scrollHeight;
                            } else {
                                ChatUI.appendBubble('user', `Attached: ${baseName}`);
                            }
                        }
                        
                        const stillPending = window.requestedFilesQueue.filter(item => item.status === 'PENDING' || item.status === 'UPLOADING');
                        if (stillPending.length === 0) {
                            if (window.activeDragDropCleanup) window.activeDragDropCleanup();
                            const filesToClean = [...window.requestedFilesQueue];
                            setTimeout(async () => {
                                const continueFunc = window.activeDragDropContinue;
                                
                                // Clean up UI immediately for instant responsive feedback
                                window.requestedFilesQueue = [];
                                if (typeof window.updateDragDropQueueUI === 'function') {
                                    window.updateDragDropQueueUI();
                                }

                                if (continueFunc && continueFunc.isReal) {
                                    // Trigger runRead asynchronously in background
                                    continueFunc();
                                } else {
                                    // Inject pending user message if there is one blocked by rules reminder
                                    if (window.pendingUserMessageText) {
                                        const userMsg = window.pendingUserMessageText;
                                        window.pendingUserMessageText = null;
                                        try {
                                            await injectWebPayload(userMsg, 0, 0, false, window.autoDragging && !window.autoDraggingTempDisabled);
                                        } catch(e) {}
                                    }
                                    
                                    if (window.autoDragging && !window.autoDraggingTempDisabled && typeof window.triggerGuestSend === 'function') {
                                        window.triggerGuestSend();
                                    }

                                    if (typeof runExperimentalEngine === 'function') {
                                        runExperimentalEngine('/marktag', "", null).then(response => {
                                            if (response) {
                                                if (typeof window.finalizeAiBubble === 'function') {
                                                    window.finalizeAiBubble(response);
                                                }
                                                if (typeof detectAndAskCommand === 'function') {
                                                    detectAndAskCommand(response);
                                                }
                                            }
                                        }).catch(err => console.error("Error in response monitoring:", err));
                                    }
                                }
                            }, 500);
                        }
                    } else {
                        const fs = require('fs');
                        const pathModule = require('path');
                        try {
                            const contentBuffer = fs.readFileSync(filePath);
                            const filename = pathModule.basename(filePath);
                            const base64Content = contentBuffer.toString('base64');
                            
                            const ext = filename.split('.').pop().toLowerCase();
                            const mimeMap = {
                                'js': 'text/javascript', 'json': 'application/json',
                                'html': 'text/html', 'css': 'text/css',
                                'txt': 'text/plain', 'md': 'text/markdown',
                                'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
                                'gif': 'image/gif', 'pdf': 'application/pdf', 'zip': 'application/zip'
                            };
                            const mimeType = mimeMap[ext] || 'application/octet-stream';
                            
                            wv.executeJavaScript(`
                                (() => {
                                    try {
                                        window.isSyntheticDropInProgress = true;
                                        const b64 = "${base64Content}";
                                        const name = "${filename}";
                                        const mime = "${mimeType}";
                                        
                                        const binary = atob(b64);
                                        const array = new Uint8Array(binary.length);
                                        for (let i = 0; i < binary.length; i++) {
                                            array[i] = binary.charCodeAt(i);
                                        }
                                        const blob = new Blob([array], { type: mime });
                                        const file = new File([blob], name, { type: mime });
                                        
                                        const dt = new DataTransfer();
                                        dt.items.add(file);
                                        
                                        let target = document.querySelector('textarea, [contenteditable="true"]') || document.body;
                                        
                                        const options = { bubbles: true, cancelable: true, dataTransfer: dt };
                                        const dragEnterEvt = new DragEvent('dragenter', options);
                                        const dragOverEvt = new DragEvent('dragover', options);
                                        const dropEvt = new DragEvent('drop', options);
                                        dragEnterEvt.isSynthetic = true;
                                        dragOverEvt.isSynthetic = true;
                                        dropEvt.isSynthetic = true;

                                        target.dispatchEvent(dragEnterEvt);
                                        target.dispatchEvent(dragOverEvt);
                                        target.dispatchEvent(dropEvt);
                                        
                                        console.log("[GuestDrop] Dispatched drop event for file:", name);
                                    } catch(err) {
                                        console.error("[GuestDrop] Error in synthetic drop:", err);
                                    } finally {
                                        setTimeout(() => { window.isSyntheticDropInProgress = false; }, 1000);
                                    }
                                })();
                            `).catch(err => console.error("Failed to execute drop injection script:", err));
                        } catch (err) {
                            console.error("Failed to process drop upload:", err);
                        }
                    }
                }
                return;
            }
            if (e.message.startsWith('[GUEST_USER_MESSAGE]:')) {
                if (window.isHostSending) {
                    console.log("[HostConsole] Ignored GUEST_USER_MESSAGE due to isHostSending flag.");
                    return;
                }
                const userMsg = e.message.substring(21).trim();
                const isHostPayload = userMsg.startsWith('[FILE EDIT SUCCESS:') ||
                                      userMsg.startsWith('[FILE EDIT ERROR:') ||
                                      userMsg.startsWith('[FILE CREATED:') ||
                                      userMsg.startsWith('[FILE DELETED:') ||
                                      userMsg.startsWith('[FILE DATA') ||
                                      userMsg.startsWith('[PROJECT BRIEFING]') ||
                                      userMsg.includes('I have uploaded the requested') ||
                                      userMsg.includes('Proceed to analyze') ||
                                      userMsg.includes('Proceed to verify');
                if (isHostPayload) {
                    console.log("[HostConsole] Ignored host-injected payload:", userMsg);
                    return;
                }
                
                let cleanUserMsg = userMsg;
                if (cleanUserMsg.includes('[USER MESSAGE]')) {
                    const idx = cleanUserMsg.indexOf('[USER MESSAGE]');
                    cleanUserMsg = cleanUserMsg.substring(idx + 14).trim();
                } else {
                    const idxRules = cleanUserMsg.indexOf('[SYSTEM RULES]');
                    if (idxRules !== -1) {
                        cleanUserMsg = cleanUserMsg.substring(0, idxRules).trim();
                    }
                    const idxReminder = cleanUserMsg.indexOf('[REMINDER]');
                    if (idxReminder !== -1) {
                        cleanUserMsg = cleanUserMsg.substring(0, idxReminder).trim();
                    }
                }

                if (cleanUserMsg && typeof ChatUI !== 'undefined' && typeof ChatUI.appendBubble === 'function') {
                    if (cleanUserMsg !== "[File Attachment]") {
                        ChatUI.appendBubble('user', cleanUserMsg);
                    }
                    
                    if (typeof runExperimentalEngine === 'function') {
                        setTimeout(() => {
                            runExperimentalEngine('/marktag', "", null).then(response => {
                                if (response) {
                                    if (typeof window.finalizeAiBubble === 'function') {
                                        window.finalizeAiBubble(response);
                                    }
                                    if (typeof detectAndAskCommand === 'function') {
                                        detectAndAskCommand(response);
                                    }
                                }
                            }).catch(err => console.error("Error in manual response monitoring:", err));
                        }, 50);
                    }
                }
                return;
            }
            if (e.message.startsWith('[GUEST_INPUT_HEIGHT]:')) {
                const h = parseInt(e.message.substring(21), 10);
                if (!isNaN(h) && typeof window.updateSplitLayoutHeight === 'function') {
                    window.updateSplitLayoutHeight(h);
                }
                return;
            }

            if (e.message.startsWith('[BACKGROUND_AI_RESP]:')) {
                // Redirected to direct in-process polling updates via updateAiStreamBubble in monitoring.js to eliminate Electron console latency.
                return;
            }
        });

    dock.appendChild(wv); if (window.updateAgentBadge) window.updateAgentBadge();
    window.currentAgentSelectors = { input: inSel, send: btnSel, response: resSel };

    if (!isSilentBoot && (confirmResult === 'send' || confirmResult === true)) {
        setTimeout(() => {
            const projBtn = document.getElementById('btn-send-project-info');
            if (projBtn) projBtn.click();
        }, 1000);
    }
};

    const create = (appData) => {
        let u = typeof appData === 'string' ? appData : appData.url; const d = new URL(u).hostname;
        let displayTitle = (typeof appData === 'object' && appData.title && appData.title.trim()) ? appData.title.trim() : d.split('.')[0];
        const c = document.createElement('div'); c.className = 'agent-app'; c.style.position = 'relative';
        c.innerHTML = `<div class=\"icon-wrapper\"><img src=\"https://www.google.com/s2/favicons?domain=${d}&sz=64\"></div><div class=\"agent-name\">${displayTitle}</div>`;
        c.onclick = () => window.launchWebAgent(appData, false);

        let hoverTimer;
        c.onmouseenter = () => {
            hoverTimer = setTimeout(() => {
                if (c.querySelector('.agent-del-btn')) return;
                const delBtn = document.createElement('div'); delBtn.className = 'agent-del-btn'; delBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
                delBtn.style = `position: absolute; top: -8px; right: -8px; width: 22px; height: 22px; background: rgba(255, 59, 48, 0.9); color: white; border-radius: 50%; display: flex; justify-content: center; align-items: center; cursor: pointer; z-index: 100; box-shadow: none;`;
                delBtn.onclick = async (e) => {
                    e.stopPropagation();
                    const s = await ipcRenderer.invoke('vault-read-global', 'registry.json');
                    const apps = s ? JSON.parse(s) : []; const idx = apps.findIndex(a => (typeof a === 'string' ? a : a.url) === u);
                    if (idx > -1) apps.splice(idx, 1); ipcRenderer.send('vault-update-global', { fileName: 'registry.json', content: JSON.stringify(apps) }); c.remove();
                };
                c.appendChild(delBtn);

                const editBtn = document.createElement('div'); editBtn.className = 'agent-edit-btn'; editBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
                editBtn.style = `position: absolute; top: -8px; left: -8px; width: 22px; height: 22px; background: #0078d4; color: white; border-radius: 50%; display: flex; justify-content: center; align-items: center; cursor: pointer; z-index: 100; box-shadow: none;`;
                editBtn.onclick = (e) => {
                    e.stopPropagation(); const mo = document.getElementById('app-reg-modal');
                    const tIn = document.getElementById('reg-app-title'); if (tIn) tIn.value = (typeof appData === 'object' && appData.title) ? appData.title : '';
                    document.getElementById('reg-app-url').value = u; document.getElementById('reg-input-selector').value = appData.input || ''; document.getElementById('reg-send-selector').value = appData.send || ''; document.getElementById('reg-response-selector').value = appData.response || '';
                    mo.dataset.editingUrl = u; mo.style.display = 'flex'; (tIn || document.getElementById('reg-app-url')).focus();
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
    apps.forEach(appData => create(appData)); if (geminiApp) window.launchWebAgent(geminiApp, !window.autoGemini);

    const minTermBtn = document.getElementById('minimize-terminal');
    if (minTermBtn) {
        minTermBtn.onclick = () => {
            const popover = document.getElementById('terminal-popover');
            if (popover) popover.style.display = 'none';
            const toggleBtn = document.getElementById('terminal-toggle-btn');
            if (toggleBtn) {
                toggleBtn.style.color = '';
                toggleBtn.style.background = '';
            }
        };
    }

    const addTermBtn = document.getElementById('add-terminal');
    if (addTermBtn) addTermBtn.onclick = () => addSubTerminal();
    window.loadDirectory(window.currentPath);
}

window.showNoticeModal = function(force = false) {
    const noticeModal = document.getElementById('first-launch-notice-modal');
    const closeBtn = document.getElementById('close-first-launch-notice');
    const closeX = document.getElementById('close-first-launch-notice-x');
    if (!noticeModal) return;
    if (force || !localStorage.getItem('rg_notice_seen')) {
        noticeModal.style.display = 'flex';
        const hide = () => {
            noticeModal.style.display = 'none';
            localStorage.setItem('rg_notice_seen', 'true');
        };
        if (closeBtn) closeBtn.onclick = hide;
        if (closeX) closeX.onclick = hide;
    }
};

function setupUI() {
    // Check first launch notice (only pops up if not seen yet)
    setTimeout(() => {
        window.showNoticeModal(false);
    }, 300);

    // 1. Setup Click-to-copy for .chat-cmd-badge
    document.addEventListener('click', (e) => {
        const homeBtn = e.target.closest('#taskbar-home-btn');
        if (homeBtn) {
            console.log('[GlobalHomeBtn] Clicked - returning to grid');
            e.preventDefault();
            e.stopPropagation();
            const webviewEl = document.getElementById('agent-hub-webview');
            const homeEl = document.getElementById('agent-hub-home');
            if (webviewEl) webviewEl.style.display = 'none';
            if (homeEl) homeEl.style.display = 'flex';
            const _rb3 = document.getElementById('taskbar-manual-rules-btn'); if (_rb3) _rb3.style.display = 'none';
            const _tb3 = document.getElementById('taskbar-manual-tree-btn'); if (_tb3) _tb3.style.display = 'none';
            const _rc3 = document.getElementById('taskbar-recmd-btn'); if (_rc3) _rc3.style.display = 'none';
            if (typeof syncBrowserView === 'function') syncBrowserView();
            return;
        }

        const badge = e.target.closest('.chat-cmd-badge');
        if (badge) {
            let cmdText = badge.innerText.trim();
            if (cmdText.startsWith('>_ ')) {
                cmdText = cmdText.substring(3).trim();
            }
            const match = cmdText.match(/^run-command\s+["'](.+)["']$/i);
            const toCopy = match ? match[1] : cmdText;
            navigator.clipboard.writeText(toCopy).then(() => {
                badge.setAttribute('data-tooltip', 'Copied!');
                setTimeout(() => {
                    badge.removeAttribute('data-tooltip');
                }, 1000);
            }).catch(err => {
                console.error("Clipboard copy failed:", err);
            });
        }
    });

    // 2. Setup Terminal Toggle Button Click Handler
    const toggleBtn = document.getElementById('terminal-toggle-btn');
    const popover = document.getElementById('terminal-popover');
    
    // GitHub remote browser opener setup
    const gitToggleBtn = document.getElementById('git-toggle-btn');
    const gitPopover = document.getElementById('git-popover');
    const gitWebview = document.getElementById('git-webview');
    const geminiUsageToggleBtn = document.getElementById('gemini-usage-toggle-btn');
    
    // Multi-Window Dynamic Popover System
    const bringPopoverToFront = (activePopover) => {
        document.querySelectorAll('.web-popover-window').forEach(p => {
            p.style.zIndex = '1000';
        });
        activePopover.style.zIndex = '1005';
    };

    const setupWebPopoverResizing = (popover, isRightAligned) => {
        const lResizer = popover.querySelector('.web-popover-resizer-l');
        const rResizer = popover.querySelector('.web-popover-resizer-r');
        const tResizer = popover.querySelector('.web-popover-resizer-t');
        const tlResizer = popover.querySelector('.web-popover-resizer-tl');
        const trResizer = popover.querySelector('.web-popover-resizer-tr');
        
        let startWidth, startHeight, startX, startY, startLeft, startRight;
        
        const onMouseMoveL = (e) => {
            if (isRightAligned) {
                const newWidth = Math.max(300, startWidth + (startX - e.clientX));
                popover.style.width = `${newWidth}px`;
            } else {
                const deltaX = startX - e.clientX;
                const newWidth = Math.max(300, startWidth + deltaX);
                popover.style.width = `${newWidth}px`;
                popover.style.left = `${startLeft - deltaX}px`;
            }
        };

        const onMouseMoveR = (e) => {
            if (isRightAligned) {
                const deltaX = e.clientX - startX;
                const newWidth = Math.max(300, startWidth + deltaX);
                popover.style.width = `${newWidth}px`;
                popover.style.right = `${startRight - deltaX}px`;
            } else {
                const newWidth = Math.max(300, startWidth + (e.clientX - startX));
                popover.style.width = `${newWidth}px`;
            }
        };
        
        const onMouseMoveT = (e) => {
            const newHeight = Math.max(200, startHeight - (e.clientY - startY));
            popover.style.height = `${newHeight}px`;
        };
        
        const onMouseMoveTL = (e) => {
            const deltaX = startX - e.clientX;
            const newWidth = Math.max(300, startWidth + deltaX);
            const newHeight = Math.max(200, startHeight - (e.clientY - startY));
            popover.style.height = `${newHeight}px`;
            
            if (isRightAligned) {
                popover.style.width = `${newWidth}px`;
            } else {
                popover.style.width = `${newWidth}px`;
                popover.style.left = `${startLeft - deltaX}px`;
            }
        };

        const onMouseMoveTR = (e) => {
            const newHeight = Math.max(200, startHeight - (e.clientY - startY));
            popover.style.height = `${newHeight}px`;
            
            if (isRightAligned) {
                const deltaX = e.clientX - startX;
                const newWidth = Math.max(300, startWidth + deltaX);
                popover.style.width = `${newWidth}px`;
                popover.style.right = `${startRight - deltaX}px`;
            } else {
                const newWidth = Math.max(300, startWidth + (e.clientX - startX));
                popover.style.width = `${newWidth}px`;
            }
        };
        
        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMoveL);
            document.removeEventListener('mousemove', onMouseMoveR);
            document.removeEventListener('mousemove', onMouseMoveT);
            document.removeEventListener('mousemove', onMouseMoveTL);
            document.removeEventListener('mousemove', onMouseMoveTR);
            document.removeEventListener('mouseup', onMouseUp);
        };
        
        if (lResizer) {
            lResizer.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                startX = e.clientX;
                startWidth = parseInt(document.defaultView.getComputedStyle(popover).width, 10);
                startLeft = parseInt(popover.style.left || '0', 10);
                document.addEventListener('mousemove', onMouseMoveL);
                document.addEventListener('mouseup', onMouseUp);
            });
        }

        if (rResizer) {
            rResizer.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                startX = e.clientX;
                startWidth = parseInt(document.defaultView.getComputedStyle(popover).width, 10);
                startRight = parseInt(popover.style.right || '0', 10);
                document.addEventListener('mousemove', onMouseMoveR);
                document.addEventListener('mouseup', onMouseUp);
            });
        }
        
        if (tResizer) {
            tResizer.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                startY = e.clientY;
                startHeight = parseInt(document.defaultView.getComputedStyle(popover).height, 10);
                document.addEventListener('mousemove', onMouseMoveT);
                document.addEventListener('mouseup', onMouseUp);
            });
        }
        
        if (tlResizer) {
            tlResizer.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                startX = e.clientX;
                startY = e.clientY;
                startWidth = parseInt(document.defaultView.getComputedStyle(popover).width, 10);
                startHeight = parseInt(document.defaultView.getComputedStyle(popover).height, 10);
                startLeft = parseInt(popover.style.left || '0', 10);
                document.addEventListener('mousemove', onMouseMoveTL);
                document.addEventListener('mouseup', onMouseUp);
            });
        }

        if (trResizer) {
            trResizer.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                startX = e.clientX;
                startY = e.clientY;
                startWidth = parseInt(document.defaultView.getComputedStyle(popover).width, 10);
                startHeight = parseInt(document.defaultView.getComputedStyle(popover).height, 10);
                startRight = parseInt(popover.style.right || '0', 10);
                document.addEventListener('mousemove', onMouseMoveTR);
                document.addEventListener('mouseup', onMouseUp);
            });
        }
    };

    const createWebPopover = (key, url, title, buttonEl, isRightAligned) => {
        let popover = document.getElementById(`web-popover-${key}`);
        if (popover) {
            const isHidden = popover.style.display === 'none';
            // Close terminal popover
            const termPopover = document.getElementById('terminal-popover');
            if (termPopover) {
                termPopover.style.display = 'none';
                const tBtn = document.getElementById('terminal-toggle-btn');
                if (tBtn) {
                    tBtn.style.color = '';
                    tBtn.style.background = '';
                }
            }
            if (isHidden) {
                popover.style.display = 'flex';
                bringPopoverToFront(popover);
                if (key === 'github') {
                    if (gitToggleBtn) {
                        gitToggleBtn.style.color = '#fff';
                        gitToggleBtn.style.background = 'var(--primary)';
                    }
                } else if (key === 'gemini-usage') {
                    if (geminiUsageToggleBtn) {
                        geminiUsageToggleBtn.style.borderColor = 'rgba(255,255,255,0.2)';
                    }
                } else {
                    if (buttonEl) {
                        buttonEl.style.background = 'var(--primary)';
                        buttonEl.style.borderColor = 'var(--primary)';
                    }
                }
            } else {
                popover.style.display = 'none';
                if (key === 'github') {
                    if (gitToggleBtn) {
                        gitToggleBtn.style.color = '';
                        gitToggleBtn.style.background = '';
                    }
                } else if (key === 'gemini-usage') {
                    if (geminiUsageToggleBtn) {
                        geminiUsageToggleBtn.style.background = '';
                        geminiUsageToggleBtn.style.borderColor = '';
                    }
                } else {
                    if (buttonEl) {
                        buttonEl.style.background = '';
                        buttonEl.style.borderColor = '';
                    }
                }
            }
            return;
        }

        // Close terminal popover
        const termPopover = document.getElementById('terminal-popover');
        if (termPopover) {
            termPopover.style.display = 'none';
            const tBtn = document.getElementById('terminal-toggle-btn');
            if (tBtn) {
                tBtn.style.color = '';
                tBtn.style.background = '';
            }
        }

        popover = document.createElement('div');
        popover.id = `web-popover-${key}`;
        popover.className = 'web-popover-window';
        
        popover.style.position = 'absolute';
        const defaultWidth = isRightAligned ? 600 : 410;
        const defaultHeight = isRightAligned ? 450 : 730;
        popover.style.width = `${defaultWidth}px`;
        popover.style.height = `${defaultHeight}px`;
        popover.style.maxHeight = 'calc(100% - 60px)';
        popover.style.display = 'flex';
        popover.style.flexDirection = 'column';
        popover.style.background = 'rgba(12, 12, 14, 0.85)';
        popover.style.backdropFilter = 'blur(24px)';
        popover.style.webkitBackdropFilter = 'blur(24px)';
        popover.style.border = '1px solid var(--border-color)';
        popover.style.borderRadius = '12px';
        popover.style.boxShadow = '0 12px 40px rgba(0,0,0,0.75)';
        popover.style.zIndex = '1000';
        popover.style.overflow = 'hidden';
        popover.style.fontFamily = "'DM Sans', sans-serif";

        const rect = buttonEl.getBoundingClientRect();
        const parentRect = document.getElementById('editor-container').getBoundingClientRect();
        
        popover.style.bottom = '50px';
        if (isRightAligned) {
            const rightOffset = parentRect.right - rect.right;
            popover.style.right = `${rightOffset}px`;
            popover.style.left = 'auto';
        } else {
            const leftOffset = rect.left - parentRect.left;
            popover.style.left = `${leftOffset}px`;
            popover.style.right = 'auto';
        }

        popover.innerHTML = `
            <div class="git-view-header" style="height:44px; min-height:44px; border-bottom: 1px solid var(--border-color); display:flex; align-items:center; justify-content:space-between; padding:0 12px; background: #000; user-select: none;">
                <div style="display:flex; align-items:center; gap:12px; flex: 1; overflow: hidden; margin-right: 12px;">
                    <!-- WebView Navigation Controls -->
                    <div style="display:flex; align-items:center; gap:10px; flex-shrink: 0; margin-right: 4px;">
                        <span class="git-wv-back" style="cursor:pointer; color:var(--text-muted); display:flex; align-items:center;" title="Back">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                        </span>
                        <span class="git-wv-forward" style="cursor:pointer; color:var(--text-muted); display:flex; align-items:center;" title="Forward">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                        </span>
                        <span class="git-wv-reload" style="cursor:pointer; color:var(--text-muted); display:flex; align-items:center;" title="Reload">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20 20"></path></svg>
                        </span>
                    </div>
                    <div class="git-url-display-container" style="display:flex; align-items:center; gap:6px; flex: 1; max-width: 380px; background: rgba(255,255,255,0.06); padding: 3px 8px; border-radius: 4px; border: 1px solid var(--border-color); cursor: pointer; overflow: hidden;" title="Click to copy URL">
                        <span class="git-url-display-text" style="font-size: 10px; color: var(--text-muted); font-family: 'JetBrains Mono', monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;">${url}</span>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-muted); flex-shrink: 0;"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:10px;">
                    <span class="git-wv-minimize" style="cursor:pointer; color:var(--text-muted); display:flex; align-items:center;" title="Minimize Window">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    </span>
                    <span class="git-wv-close" style="cursor:pointer; color:var(--text-muted); display:flex; align-items:center;" title="Close Window">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </span>
                </div>
            </div>
            <div style="flex: 1; position: relative; background: #0d1117;">
                <webview class="web-webview-el" src="${url}" useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" style="width: 100%; height: 100%; border: none;" allowpopups></webview>
            </div>
            <!-- Resizers -->
            <div class="web-popover-resizer-l"></div>
            <div class="web-popover-resizer-r"></div>
            <div class="web-popover-resizer-t"></div>
            <div class="web-popover-resizer-tl"></div>
            <div class="web-popover-resizer-tr"></div>
        `;

        document.getElementById('editor-container').appendChild(popover);

        const webview = popover.querySelector('.web-webview-el');
        const urlText = popover.querySelector('.git-url-display-text');
        const urlContainer = popover.querySelector('.git-url-display-container');
        const backBtn = popover.querySelector('.git-wv-back');
        const forwardBtn = popover.querySelector('.git-wv-forward');
        const reloadBtn = popover.querySelector('.git-wv-reload');
        const minimizeBtn = popover.querySelector('.git-wv-minimize');
        const closeBtn = popover.querySelector('.git-wv-close');

        backBtn.onclick = (e) => { e.stopPropagation(); if (webview.canGoBack()) webview.goBack(); };
        forwardBtn.onclick = (e) => { e.stopPropagation(); if (webview.canGoForward()) webview.goForward(); };
        reloadBtn.onclick = (e) => { e.stopPropagation(); webview.reload(); };
        minimizeBtn.onclick = (e) => {
            e.stopPropagation();
            popover.style.display = 'none';
            if (key === 'github') {
                if (gitToggleBtn) {
                    gitToggleBtn.style.color = '';
                    gitToggleBtn.style.background = '';
                }
            } else if (key === 'gemini-usage') {
                if (geminiUsageToggleBtn) {
                    geminiUsageToggleBtn.style.background = '';
                    geminiUsageToggleBtn.style.borderColor = '';
                }
            } else {
                if (buttonEl) {
                    buttonEl.style.background = '';
                    buttonEl.style.borderColor = '';
                }
            }
        };
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            popover.remove();
            if (key === 'github') {
                if (gitToggleBtn) {
                    gitToggleBtn.style.color = '';
                    gitToggleBtn.style.background = '';
                }
            } else if (key === 'gemini-usage') {
                if (geminiUsageToggleBtn) {
                    geminiUsageToggleBtn.style.background = '';
                    geminiUsageToggleBtn.style.borderColor = '';
                }
            } else {
                if (buttonEl) {
                    buttonEl.style.background = '';
                    buttonEl.style.borderColor = '';
                }
            }
        };

        const updateUrl = () => {
            const currentUrl = webview.getURL();
            if (currentUrl && currentUrl !== 'about:blank') {
                urlText.innerText = currentUrl;
            }
        };
        webview.addEventListener('did-navigate', updateUrl);
        webview.addEventListener('did-navigate-in-page', updateUrl);

        urlContainer.onclick = (e) => {
            e.stopPropagation();
            const currentUrl = webview.getURL();
            if (currentUrl && currentUrl !== 'about:blank') {
                const { clipboard } = require('electron');
                clipboard.writeText(currentUrl);
                const originalText = urlText.innerText;
                urlText.innerText = 'COPIED!';
                urlText.style.color = '#10b981';
                setTimeout(() => {
                    urlText.innerText = originalText;
                    urlText.style.color = '';
                }, 1000);
            }
        };

        popover.addEventListener('mousedown', () => {
            bringPopoverToFront(popover);
        });

        bringPopoverToFront(popover);
        if (key === 'github') {
            if (gitToggleBtn) {
                gitToggleBtn.style.color = '#fff';
                gitToggleBtn.style.background = 'var(--primary)';
            }
        } else if (key === 'gemini-usage') {
            if (geminiUsageToggleBtn) {
                geminiUsageToggleBtn.style.borderColor = 'rgba(255,255,255,0.2)';
            }
        } else {
            if (buttonEl) {
                buttonEl.style.background = 'var(--primary)';
                buttonEl.style.borderColor = 'var(--primary)';
            }
        }

        setupWebPopoverResizing(popover, isRightAligned);
    };

    if (gitToggleBtn) {
        gitToggleBtn.onclick = (e) => {
            e.stopPropagation();
            createWebPopover('github', 'https://github.com', 'GitHub', gitToggleBtn, true);
        };
    }

    if (geminiUsageToggleBtn) {
        geminiUsageToggleBtn.onclick = (e) => {
            e.stopPropagation();
            const geminiUrl = 'https://gemini.google.com/usage';
            createWebPopover('gemini-usage', geminiUrl, 'Gemini Usage', geminiUsageToggleBtn, true);
        };
    }
    if (toggleBtn && popover) {
        toggleBtn.onclick = (e) => {
            e.stopPropagation();
            if (popover.style.display === 'none' || !popover.style.display) {
                popover.style.display = 'flex';
                toggleBtn.style.color = '#fff';
                toggleBtn.style.background = 'var(--primary)';
                toggleBtn.style.boxShadow = 'none';
                
                if (window.terminalCount === 0) {
                    addSubTerminal(true);
                } else if (window.activeSubTabId) {
                    switchSubTerminal(window.activeSubTabId);
                }
            } else {
                popover.style.display = 'none';
                toggleBtn.style.color = '';
                toggleBtn.style.background = '';
                toggleBtn.style.boxShadow = '';
            }
        };
        
        popover.onclick = (e) => { e.stopPropagation(); };
        
        document.addEventListener('click', () => {
            popover.style.display = 'none';
            toggleBtn.style.color = '';
            toggleBtn.style.background = '';
            toggleBtn.style.boxShadow = '';
            

        });
    }

    // Shortcuts Bar Logic
    const shortcutsList = document.getElementById('status-bar-shortcuts-list');
    const shortcutAddModal = document.getElementById('add-shortcut-modal');
    const shortcutCloseBtn = document.getElementById('close-shortcut-modal-btn');
    const shortcutSaveBtn = document.getElementById('save-shortcut-btn');
    const shortcutTitleInput = document.getElementById('shortcut-title-input');
    const shortcutUrlInput = document.getElementById('shortcut-url-input');
    
    const loadShortcuts = () => {
        let list = [];
        try {
            const raw = localStorage.getItem('poormansgravity-shortcuts');
            if (raw) {
                list = JSON.parse(raw);
                // Ensure Instagram Reels is appended if missing (automatic migration)
                if (!list.some(item => item.title === 'Instagram Reels')) {
                    list.push({ title: 'Instagram Reels', url: 'https://www.instagram.com/reels/' });
                    localStorage.setItem('poormansgravity-shortcuts', JSON.stringify(list));
                }
            } else {
                // Populate default shortcuts
                list = [
                    { title: 'GitHub', url: 'https://github.com' },
                    { title: 'Gemini', url: 'https://gemini.google.com' },
                    { title: 'YouTube', url: 'https://youtube.com' },
                    { title: 'Instagram Reels', url: 'https://www.instagram.com/reels/' }
                ];
                localStorage.setItem('poormansgravity-shortcuts', JSON.stringify(list));
            }
        } catch (e) {
            console.error("Shortcuts load failed", e);
        }
        return list;
    };
    
    const saveShortcuts = (list) => {
        localStorage.setItem('poormansgravity-shortcuts', JSON.stringify(list));
    };
    
    const renderShortcuts = () => {
        if (!shortcutsList) return;
        shortcutsList.innerHTML = '';
        const list = loadShortcuts();
        
        // Render each shortcut pill
        list.forEach((item, index) => {
            const pill = document.createElement('div');
            pill.className = 'status-shortcut-pill';
            pill.title = `${item.title}\n\nLeft click: Open\nRight click: Delete`;
            
            let domain = 'github.com';
            try {
                domain = new URL(item.url).hostname;
            } catch(e){}
            
            pill.innerHTML = `
                <img src="https://www.google.com/s2/favicons?domain=${domain}&sz=32" style="width: 16px; height: 16px; border-radius: 2px;" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'16\\' height=\\'16\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'%23888\\' stroke-width=\\'2.5\\' stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\'><circle cx=\\'12\\' cy=\\'12\\' r=\\'10\\'></circle><line x1=\\'2\\' y1=\\'12\\' x2=\\'22\\' y2=\\'12\\'></line><path d=\\'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z\\'></path></svg>';">
            `;
            
            // Left click: Open dedicated browser window
            pill.onclick = (e) => {
                e.stopPropagation();
                createWebPopover(`shortcut-${index}`, item.url, item.title, pill, false);
            };
            
            // Drag and drop properties
            pill.setAttribute('draggable', 'true');
            
            pill.ondragstart = (e) => {
                pill.style.opacity = '0.4';
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', index);
            };
            
            pill.ondragend = () => {
                pill.style.opacity = '1';
                document.querySelectorAll('.status-shortcut-pill').forEach(el => {
                    el.style.borderLeft = '';
                    el.style.borderRight = '';
                });
            };
            
            pill.ondragover = (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const rect = pill.getBoundingClientRect();
                const relX = e.clientX - rect.left;
                if (relX < rect.width / 2) {
                    pill.style.borderLeft = '2px solid var(--primary)';
                    pill.style.borderRight = '';
                } else {
                    pill.style.borderRight = '2px solid var(--primary)';
                    pill.style.borderLeft = '';
                }
            };
            
            pill.ondragleave = () => {
                pill.style.borderLeft = '';
                pill.style.borderRight = '';
            };
            
            pill.ondrop = (e) => {
                e.preventDefault();
                pill.style.borderLeft = '';
                pill.style.borderRight = '';
                
                const srcIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
                if (isNaN(srcIndex) || srcIndex === index) return;
                
                const rect = pill.getBoundingClientRect();
                const relX = e.clientX - rect.left;
                
                let destIndex = index;
                if (relX >= rect.width / 2) {
                    destIndex = index + 1;
                }
                
                const currentList = loadShortcuts();
                const [movedItem] = currentList.splice(srcIndex, 1);
                
                let targetPos = destIndex;
                if (srcIndex < destIndex) {
                    targetPos = destIndex - 1;
                }
                
                currentList.splice(targetPos, 0, movedItem);
                saveShortcuts(currentList);
                renderShortcuts();
            };

            // Right click: Delete shortcut (with custom themed modal)
            pill.oncontextmenu = (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                if (typeof showConfirm === 'function') {
                    showConfirm(`Delete shortcut "${item.title}"?`, () => {
                        const newList = list.filter((_, idx) => idx !== index);
                        saveShortcuts(newList);
                        
                        // Close if active popover window exists
                        const popupEl = document.getElementById(`web-popover-shortcut-${index}`);
                        if (popupEl) popupEl.remove();
                        
                        renderShortcuts();
                    });
                } else {
                    // Fallback to confirm
                    if (confirm(`Delete shortcut "${item.title}"?`)) {
                        const newList = list.filter((_, idx) => idx !== index);
                        saveShortcuts(newList);
                        const popupEl = document.getElementById(`web-popover-shortcut-${index}`);
                        if (popupEl) popupEl.remove();
                        renderShortcuts();
                    }
                }
            };
            
            shortcutsList.appendChild(pill);
        });
        
        // Append circular plus button at the end
        const addBtn = document.createElement('div');
        addBtn.id = 'add-shortcut-trigger-btn';
        addBtn.style.display = 'inline-flex';
        addBtn.style.alignItems = 'center';
        addBtn.style.justifyContent = 'center';
        addBtn.style.width = '34px';
        addBtn.style.height = '34px';
        addBtn.style.borderRadius = '50%';
        addBtn.style.background = 'rgba(22, 22, 28, 0.6)';
        addBtn.style.border = '1px solid var(--border-color)';
        addBtn.style.cursor = 'pointer';
        addBtn.style.transition = 'all 0.2s';
        addBtn.style.color = 'var(--text-muted)';
        addBtn.style.flexShrink = '0';
        addBtn.title = 'Register Internet Shortcut';
        addBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
        
        addBtn.onmouseenter = () => {
            addBtn.style.background = 'rgba(255,255,255,0.08)';
            addBtn.style.color = '#fff';
            addBtn.style.borderColor = 'rgba(255,255,255,0.15)';
        };
        addBtn.onmouseleave = () => {
            addBtn.style.background = 'rgba(22, 22, 28, 0.6)';
            addBtn.style.color = 'var(--text-muted)';
            addBtn.style.borderColor = 'var(--border-color)';
        };
        
        addBtn.onclick = (e) => {
            e.stopPropagation();
            if (shortcutAddModal) {
                if (shortcutTitleInput) shortcutTitleInput.value = '';
                if (shortcutUrlInput) shortcutUrlInput.value = 'https://';
                shortcutAddModal.style.display = 'flex';
                if (shortcutTitleInput) shortcutTitleInput.focus();
            }
        };
        
        shortcutsList.appendChild(addBtn);
    };
    
    // Modal handlers
    if (shortcutCloseBtn && shortcutAddModal) {
        shortcutCloseBtn.onclick = (e) => {
            e.stopPropagation();
            shortcutAddModal.style.display = 'none';
        };
    }
    
    if (shortcutSaveBtn && shortcutAddModal) {
        shortcutSaveBtn.onclick = (e) => {
            e.stopPropagation();
            const title = shortcutTitleInput ? shortcutTitleInput.value.trim() : '';
            let url = shortcutUrlInput ? shortcutUrlInput.value.trim() : '';
            
            if (!title) {
                alert('Please enter a title!');
                return;
            }
            if (!url || url === 'https://' || url === 'http://') {
                alert('Please enter a valid URL!');
                return;
            }
            
            // Auto prepend protocol if missing
            if (!/^https?:\/\//i.test(url)) {
                url = 'https://' + url;
            }
            
            const list = loadShortcuts();
            list.push({ title, url });
            saveShortcuts(list);
            shortcutAddModal.style.display = 'none';
            renderShortcuts();
        };
    }
    
    // Initial Render
    renderShortcuts();

    // 3. Setup Popover Resizers
    const setupPopoverResizers = () => {
        const lResizer = popover ? popover.querySelector('.popover-resizer-l') : null;
        const tResizer = popover ? popover.querySelector('.popover-resizer-t') : null;
        const tlResizer = popover ? popover.querySelector('.popover-resizer-tl') : null;
        if (!popover) return;
        
        let startWidth, startHeight, startX, startY;
        
        const onMouseMoveL = (e) => {
            const newWidth = Math.max(300, startWidth - (e.clientX - startX));
            popover.style.width = `${newWidth}px`;
        };
        
        const onMouseMoveT = (e) => {
            const newHeight = Math.max(200, startHeight - (e.clientY - startY));
            popover.style.height = `${newHeight}px`;
        };
        
        const onMouseMoveTL = (e) => {
            const newWidth = Math.max(300, startWidth - (e.clientX - startX));
            const newHeight = Math.max(200, startHeight - (e.clientY - startY));
            popover.style.width = `${newWidth}px`;
            popover.style.height = `${newHeight}px`;
        };
        
        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMoveL);
            document.removeEventListener('mousemove', onMouseMoveT);
            document.removeEventListener('mousemove', onMouseMoveTL);
            document.removeEventListener('mouseup', onMouseUp);
        };
        
        if (lResizer) {
            lResizer.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                startX = e.clientX;
                startWidth = parseInt(document.defaultView.getComputedStyle(popover).width, 10);
                document.addEventListener('mousemove', onMouseMoveL);
                document.addEventListener('mouseup', onMouseUp);
            });
        }
        
        if (tResizer) {
            tResizer.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                startY = e.clientY;
                startHeight = parseInt(document.defaultView.getComputedStyle(popover).height, 10);
                document.addEventListener('mousemove', onMouseMoveT);
                document.addEventListener('mouseup', onMouseUp);
            });
        }
        
        if (tlResizer) {
            tlResizer.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                startX = e.clientX;
                startY = e.clientY;
                startWidth = parseInt(document.defaultView.getComputedStyle(popover).width, 10);
                startHeight = parseInt(document.defaultView.getComputedStyle(popover).height, 10);
                document.addEventListener('mousemove', onMouseMoveTL);
                document.addEventListener('mouseup', onMouseUp);
            });
        }
    };
    if (popover) setupPopoverResizers();

    const _path = require('path');
    function getSettingsPath() {
        const gravityRoot = window.appRootPath || process.cwd();
        return _path.join(gravityRoot, 'Settings.json');
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

    const clearQueueBtn = document.getElementById('clear-queue-btn');
    if (clearQueueBtn) {
        clearQueueBtn.onclick = () => {
            window.requestedFilesQueue = [];
            if (typeof window.updateDragDropQueueUI === 'function') {
                window.updateDragDropQueueUI();
            }
        };
    }
    if (typeof window.updateDragDropQueueUI === 'function') {
        window.updateDragDropQueueUI();
    }

    const localSettingsBtn = document.getElementById('btn-local-settings');
    const localSettingsModal = document.getElementById('local-settings-modal');
    const closeLocalSettings = document.getElementById('close-local-settings');

    if (localSettingsBtn && localSettingsModal) {
        localSettingsBtn.onclick = () => {
            window.reloadAgentSettings(); 
            
            const contentEl = document.getElementById('local-settings-content');
            if (contentEl) {
                contentEl.style.justifyContent = 'flex-start';
                contentEl.style.alignItems = 'stretch';
                contentEl.innerHTML = `
                    <div style="display:flex; flex-direction:column; gap:14px; width:100%; font-family:'DM Sans',sans-serif;">
                        <!-- Debug Mode -->
                        <div style="display:flex; justify-content:space-between; align-items:center; width:100%; box-sizing:border-box;">
                            <span style="font-weight:600; color:#eee; font-size:11.5px;">Debug Mode</span>
                            <label class="switch-toggle">
                                <input type="checkbox" id="chk-debug-mode" ${window.debugMode ? 'checked' : ''}>
                                <span class="slider-toggle"></span>
                            </label>
                        </div>
                        <!-- Auto Refresh Session -->
                        <div style="display:flex; justify-content:space-between; align-items:center; width:100%; box-sizing:border-box;">
                            <span style="font-weight:600; color:#eee; font-size:11.5px;">Auto Refresh Session</span>
                            <label class="switch-toggle">
                                <input type="checkbox" id="chk-auto-refresh-session" ${window.autoRefreshSession ? 'checked' : ''}>
                                <span class="slider-toggle"></span>
                            </label>
                        </div>
                        <!-- Refresh Turn Count -->
                        <div id="refresh-turn-container" style="display:${window.autoRefreshSession ? 'flex' : 'none'}; justify-content:space-between; align-items:center; width:100%; box-sizing:border-box;">
                            <span style="font-weight:600; color:#eee; font-size:11.5px;">Refresh Turn Trigger</span>
                            <input type="number" id="txt-refresh-turn-count" value="${window.refreshTurnCount}" style="width:50px; background:var(--surface-low); border:1px solid var(--border-color); color:#fff; font-size:11px; padding:2px 6px; border-radius:4px; text-align:center; outline:none;">
                        </div>
                        <!-- Sending File Format -->
                        <div style="display:flex; justify-content:space-between; align-items:center; width:100%; box-sizing:border-box;">
                            <span style="font-weight:600; color:#eee; font-size:11.5px;">Sending File Format</span>
                            <select id="chk-send-format" style="background:var(--surface-low); border:1px solid var(--border-color); color:#fff; font-size:11px; padding:3px 6px; border-radius:4px; outline:none;">
                                <option value="md" ${window.sendFormat === 'pdf' ? '' : 'selected'}>MD (.md)</option>
                                <option value="pdf" ${window.sendFormat === 'pdf' ? 'selected' : ''}>PDF (.pdf)</option>
                            </select>
                        </div>
                        <!-- Auto Gemini -->
                        <div style="display:flex; justify-content:space-between; align-items:center; width:100%; box-sizing:border-box;">
                            <span style="font-weight:600; color:#eee; font-size:11.5px;">Auto Gemini</span>
                            <label class="switch-toggle">
                                <input type="checkbox" id="chk-auto-gemini" ${window.autoGemini ? 'checked' : ''}>
                                <span class="slider-toggle"></span>
                            </label>
                        </div>
                    </div>
                `;
                
                const chkDebug = document.getElementById('chk-debug-mode');
                const chkAutoRefresh = document.getElementById('chk-auto-refresh-session');
                const txtRefreshCount = document.getElementById('txt-refresh-turn-count');
                const containerRefresh = document.getElementById('refresh-turn-container');
                const chkAutoGemini = document.getElementById('chk-auto-gemini');
                
                const selSendFormat = document.getElementById('chk-send-format');

                if (chkAutoRefresh && containerRefresh) {
                    chkAutoRefresh.onchange = () => {
                        containerRefresh.style.display = chkAutoRefresh.checked ? 'flex' : 'none';
                        updateAndSave();
                    };
                }
                
                const updateAndSave = () => {
                    const settingsData = {
                        hideUIOverlay: window.hideUIOverlay,
                        debugMode: !!chkDebug.checked,
                        dragDropMode: true,
                        autoDragging: false,
                        autoRefreshSession: !!chkAutoRefresh.checked,
                        refreshTurnCount: parseInt(txtRefreshCount.value) || 35,
                        sendFormat: selSendFormat ? selSendFormat.value : 'md',
                        autoGemini: chkAutoGemini ? !!chkAutoGemini.checked : false
                    };
                    saveSettings(settingsData);
                    window.reloadAgentSettings();
                };
                
                if (txtRefreshCount) txtRefreshCount.onchange = updateAndSave;
                if (chkDebug) chkDebug.onchange = updateAndSave;
                if (chkAutoGemini) chkAutoGemini.onchange = updateAndSave;
                if (selSendFormat) selSendFormat.onchange = updateAndSave;
            }
            
            localSettingsModal.style.display = 'flex';
        };
    }
    if (closeLocalSettings && localSettingsModal) {
        closeLocalSettings.onclick = () => {
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
                window.terminalSessions[window.activeSubTabId].logs.push({ type: 'cmd', text: `> ${cmd}` }); 
                switchSubTerminal(window.activeSubTabId);
                
                if (cmd.toLowerCase().startsWith('cd ')) {
                    let targetDir = cmd.substring(3).trim().replace(/['"]/g, '');
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
                            updateTerminalPrompt();
                        }
                    } catch (err) {
                        console.error(err);
                    }
                }
                
                ipcRenderer.send('execute-cmd', { 
                    tabId: window.activeSubTabId, 
                    command: cmd, 
                    cwd: window.terminalSessions[window.activeSubTabId].cwd || window.currentPath || process.cwd() 
                }); 
                tI.value = '';
            }
        };
    }
    ipcRenderer.removeAllListeners('cmd-output');
    ipcRenderer.on('cmd-output', (e, arg) => {
        let tId = window.activeSubTabId;
        let txt = '';
        if (typeof arg === 'string') {
            txt = arg;
        } else if (arg && typeof arg === 'object') {
            tId = arg.tabId || window.activeSubTabId;
            txt = arg.data || '';
        }
        if (tId && window.terminalSessions[tId]) {
            window.terminalSessions[tId].logs.push({ type: 'out', text: txt }); 
            if (window.terminalSessions[tId].loading) {
                window.terminalSessions[tId].loading = false;
            }
            if (tId === window.activeSubTabId) {
                switchSubTerminal(window.activeSubTabId);
            }
        }
    });

    const minTermBtn = document.getElementById('minimize-terminal');
    if (minTermBtn) {
        minTermBtn.onclick = () => {
            const im = tL.offsetHeight <= 40; tL.style.height = im ? '350px' : '35px';
            minTermBtn.innerHTML = im ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>' : '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>'; syncBrowserView();
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

    const selectProjectBtn = document.getElementById('select-project-btn');
    if (selectProjectBtn) {
        selectProjectBtn.onclick = () => {
            if (window.openProjectModal) window.openProjectModal();
        };
    }

    const collapseToggleBtn = document.getElementById('collapse-all-btn');
    const collapseIcon = document.getElementById('collapse-all-icon');
    const SVG_COLLAPSE = `<polyline points="7 4 12 9 17 4"></polyline><polyline points="7 20 12 15 17 20"></polyline>`;
    const SVG_EXPAND   = `<polyline points="7 9 12 4 17 9"></polyline><polyline points="7 15 12 20 17 15"></polyline>`;
    let _treeCollapsed = false;

    if (collapseToggleBtn) {
        collapseToggleBtn.onclick = () => {
            const hasExpanded = window.expandedPaths && window.expandedPaths.size > 0;
            if (hasExpanded) {
                window.expandedPaths.clear();
                collapseToggleBtn.title = 'Expand All';
                if (collapseIcon) {
                    collapseIcon.innerHTML = SVG_EXPAND;
                    collapseIcon.classList.add('rotate-left');
                }
            } else {
                document.querySelectorAll('.dir-node .file-item').forEach(el => {
                    const p = el.dataset.path;
                    if (p && window.expandedPaths) window.expandedPaths.add(p);
                });
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
    if (addA && mo) addA.onclick = () => {
        const tIn = document.getElementById('reg-app-title'); if (tIn) tIn.value = '';
        const uIn = document.getElementById('reg-app-url'); if (uIn) uIn.value = '';
        delete mo.dataset.editingUrl;
        mo.style.display = 'flex';
        (tIn || uIn)?.focus();
    };
    const cancelReg = document.getElementById('cancel-reg');
    if (cancelReg) cancelReg.onclick = () => { if (mo) mo.style.display = 'none'; };
    const confirmReg = document.getElementById('confirm-reg');
    if (confirmReg) {
        confirmReg.onclick = async () => {
            let title = document.getElementById('reg-app-title')?.value.trim() || '';
            let u = document.getElementById('reg-app-url').value.trim(); if (!u) return;
            if (!u.startsWith('http')) u = 'https://' + u;
            let inSel = document.getElementById('reg-input-selector')?.value.trim() || '';
            let btnSel = document.getElementById('reg-send-selector')?.value.trim() || '';
            let resSel = document.getElementById('reg-response-selector')?.value.trim() || '';
            
            const s = await ipcRenderer.invoke('vault-read-global', 'registry.json');
            const apps = s ? JSON.parse(s) : [];
            const editingUrl = mo ? mo.dataset.editingUrl : '';

            if (mo && editingUrl) {
                const idx = apps.findIndex(a => (typeof a === 'string' ? a : a.url) === editingUrl);
                if (idx > -1) apps[idx] = { title, url: u, input: inSel, send: btnSel, response: resSel };
                delete mo.dataset.editingUrl;
            } else {
                apps.push({ title, url: u, input: inSel, send: btnSel, response: resSel });
            }
            ipcRenderer.send('vault-update-global', { fileName: 'registry.json', content: JSON.stringify(apps) });
            location.reload();
        };
    }

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
    const refreshAgentBtn = document.getElementById('refresh-agent');
    if (refreshAgentBtn) {
        refreshAgentBtn.onclick = () => { const u = urlIn ? urlIn.value.trim() : ''; if (u) { const wv = document.getElementById('active-agent-webview'); if (wv) wv.reload(); } };
    }

    const debugAgentBtn = document.getElementById('debug-agent');
    if (debugAgentBtn) {
        debugAgentBtn.onclick = () => {
            const wv = document.getElementById('active-agent-webview');
            if (wv) wv.openDevTools();
        };
    }

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
        if (switchAgentBtn) { switchAgentBtn.onclick = () => { document.getElementById('agent-hub-webview').style.display = 'none'; document.getElementById('agent-hub-home').style.display = 'flex'; if (typeof window.setTaskbarActionsVisible === 'function') window.setTaskbarActionsVisible(false); }; }

        const taskbarHomeBtn = document.getElementById('taskbar-home-btn');
        if (taskbarHomeBtn) {
            taskbarHomeBtn.addEventListener('click', (e) => {
                console.log('[HomeBtn] Clicked - returning to grid');
                e.preventDefault();
                e.stopPropagation();
                document.getElementById('agent-hub-webview').style.display = 'none';
                document.getElementById('agent-hub-home').style.display = 'flex';
                if (typeof window.setTaskbarActionsVisible === 'function') window.setTaskbarActionsVisible(false);
                if (typeof syncBrowserView === 'function') syncBrowserView();
            });
        }

        const devAgentBtn = document.getElementById('menu-debug-agent');
        if (devAgentBtn) { devAgentBtn.onclick = () => { const wv = document.getElementById('active-agent-webview'); if (wv) wv.openDevTools(); }; }

        const resetBtn = document.getElementById('menu-factory-reset');
        if (resetBtn) {
            resetBtn.onclick = async () => {
                const confirmed = await showConfirm("Are you sure you want to perform a factory reset?\nAll registered agents and settings will be deleted.");
                if (confirmed) { ipcRenderer.send('vault-update-global', { fileName: 'registry.json', content: '[]' }); location.reload(); }
            };
        }
    }

    const dsModal = document.getElementById('discovery-settings-modal');
    const openDiscoveryBtn = document.getElementById('open-discovery-settings');
    if (openDiscoveryBtn) {
        openDiscoveryBtn.onclick = async () => {
            // Load Settings.json for format option
            const currentSettings = loadSettings();
            const selSendFormat = document.getElementById('settings-send-format');
            if (selSendFormat) selSendFormat.value = currentSettings.sendFormat || 'md';
            const selAutoGemini = document.getElementById('settings-auto-gemini');
            if (selAutoGemini) selAutoGemini.value = currentSettings.autoGemini ? 'true' : 'false';

            if (dsModal) dsModal.style.display = 'flex';
        };
    }
    const closeDiscoveryBtn = document.getElementById('close-discovery-settings');
    if (closeDiscoveryBtn) closeDiscoveryBtn.onclick = () => { if (dsModal) dsModal.style.display = 'none'; };
    const saveDiscoveryBtn = document.getElementById('save-discovery-settings');
    if (saveDiscoveryBtn) {
        saveDiscoveryBtn.onclick = () => {
            const selSendFormat = document.getElementById('settings-send-format');
            const selAutoGemini = document.getElementById('settings-auto-gemini');
            const settingsData = loadSettings();
            window.dragDropMode = true;
            settingsData.dragDropMode = true;
            window.autoDragging = false;
            settingsData.autoDragging = false;
            if (selSendFormat) {
                window.sendFormat = selSendFormat.value;
                settingsData.sendFormat = selSendFormat.value;
            }
            if (selAutoGemini) {
                window.autoGemini = (selAutoGemini.value === 'true');
                settingsData.autoGemini = window.autoGemini;
            }
            saveSettings(settingsData);
            window.reloadAgentSettings();
            
            if (typeof window.updateDragDropQueueUI === 'function') {
                window.updateDragDropQueueUI();
            }
            
            if (dsModal) dsModal.style.display = 'none';
        };
    }

    const tLA = document.getElementById('tab-local-agent'), tBH = document.getElementById('tab-browser-hub');
    const vLC = document.getElementById('inspector-local-chat'), vBH = document.getElementById('inspector-browser-hub');
    const swi = (m) => {
        if (vLC) {
            vLC.style.opacity = '0';
            vLC.style.pointerEvents = 'none';
            vLC.style.zIndex = '100';
            vLC.style.height = '100%';
            vLC.style.position = 'absolute';
            vLC.style.top = '0';
            vLC.style.bottom = '';
            vLC.style.left = '0';
            vLC.style.width = '100%';
        }
        if (vBH) {
            vBH.style.position = 'absolute';
            vBH.style.top = '0';
            vBH.style.bottom = '';
            vBH.style.left = '0';
            vBH.style.width = '100%';
            vBH.style.height = '100%';
            vBH.style.zIndex = '150';
            vBH.style.opacity = '1';
            vBH.style.pointerEvents = 'auto';
        }
        if (tLA) tLA.classList.toggle('active-tab', false);
        if (tBH) tBH.classList.toggle('active-tab', true);

        const chatLog = document.getElementById('local-chat-messages');
        if (chatLog) chatLog.scrollTop = chatLog.scrollHeight;
        if (typeof syncBrowserView === 'function') syncBrowserView();
    };
    window.swi = swi;
    if (tLA) tLA.onclick = () => swi('local'); if (tBH) tBH.onclick = () => swi('browser');
    
    // Default to BROWSER tab on startup
    setTimeout(() => swi('browser'), 50);

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
                window.generating = false; 
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
            box-shadow: none;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        `;
        projBtn.onmouseenter = () => { projBtn.style.filter = 'brightness(1.1)'; projBtn.style.boxShadow = 'none'; };
        projBtn.onmouseleave = () => { projBtn.style.filter = 'none'; projBtn.style.boxShadow = 'none'; };

        projBtn.onclick = async () => {
            if (window.sessionBriefed || window.briefingInProgress) return;
            window.briefingInProgress = true;
            if (typeof window.updateSplitLayoutHeight === 'function') {
                window.updateSplitLayoutHeight(window.pendingSplitHeight || 220);
            }
            projBtn.style.display = 'none';
            
            const fs = require('fs');
            const path = require('path');
            
            const tree = await ipcRenderer.invoke('vault-get-tree', window.currentPath);
            window.totalFilesCount = tree.split('\n').filter(line => line.startsWith('- ')).length;
            window.readFilesSet.clear();
            window.userMessageCount = 0;
            
            const isEmpty = !tree || tree.trim() === '' || !tree.includes('- ');
            const startPrompt = isEmpty
                ? `This folder is a completely empty new project. If you understand these instructions, ask the user what project to create.`
                : `If you understand these instructions, list key entry files for analysis in one line using [REQUEST: read-file "path1"] [REQUEST: read-file "path2"].`;

            const webPayload = isEmpty
                ? `${window.getSystemRulesPrompt(true)}\n\n${startPrompt}`.trim()
                : `The current project folder contains the following files:\n${tree}\n\n${window.getSystemRulesPrompt(true)}\n\n${startPrompt}`.trim();
            
            if (!window.dragDropMode) {
                // DragDrop Mode is OFF: inject text directly without file attachment
                window.requestedFilesQueue = [];
                window.activeDragDropCleanup = null;
                window.activeDragDropContinue = async () => {};

                chatOverlay.style.display = 'none';
                if (chatIn) chatIn.focus();

                window.sessionBriefed = true;
                window.briefingInProgress = false;
                window.currentBatchFileCount = -1;
                window.isBriefingResponsePending = true;

                if (typeof window.updateSplitLayoutHeight === 'function') {
                    window.updateSplitLayoutHeight(window.pendingSplitHeight || 220);
                }

                console.log("[ProjectInfoPayload] Sending payload:\n", webPayload);
                const briefPromise = runExperimentalEngine('/marktag', webPayload, null);
                await injectWebPayload(webPayload, -1);
                const briefResponse = await Promise.race([
                    briefPromise,
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Briefing timeout')), 120000))
                ]).catch(() => null);
                window.currentBatchFileCount = 0;
                if (briefResponse && typeof detectAndAskCommand === 'function') {
                    detectAndAskCommand(briefResponse);
                }
            } else {
                const baseFileName = window.makeSendingMdRulesName();
                const payload = await window.prepareFilePayload(baseFileName, webPayload);

                if (typeof window.refreshTree === 'function') {
                    window.refreshTree();
                }

                window.requestedFilesQueue = [{
                    absolutePath: payload.absolutePath,
                    relativePath: payload.relativePath,
                    status: 'PENDING'
                }];

                if (typeof window.injectGuestDropInterceptor === 'function') {
                    window.injectGuestDropInterceptor();
                }

                const cleanupDragDrop = () => {
                    if (window.activeDragDropCleanup === cleanupDragDrop) {
                        window.activeDragDropCleanup = null;
                        window.activeDragDropContinue = null;
                    }

                    const vLC = document.getElementById('inspector-local-chat');
                    const vBH = document.getElementById('inspector-browser-hub');
                    const arrowIndicator = document.getElementById('drag-drop-arrow-indicator');
                    if (arrowIndicator) arrowIndicator.remove();
                    
                    const inputContainer = document.getElementById('local-input-container');
                    if (inputContainer) {
                        inputContainer.style.background = '';
                        inputContainer.style.display = 'none';
                        inputContainer.style.height = '';
                    }
                    
                    if (vLC) {
                        vLC.style.height = "100%";
                        vLC.style.zIndex = '100';
                    }
                    if (vBH) {
                        vBH.style.position = 'absolute';
                        vBH.style.top = '0';
                        vBH.style.height = '100%';
                        vBH.style.width = '100%';
                        vBH.style.zIndex = '150';
                        vBH.style.opacity = '1';
                        vBH.style.pointerEvents = 'auto';
                    }
                    
                    // Clean up temporary rules file after a 10 seconds delay (only if successfully uploaded)
                    
                };

                window.activeDragDropCleanup = cleanupDragDrop;
                window.activeDragDropContinue = async () => {};
                
                chatOverlay.style.display = 'none';
                projBtn.style.display = 'flex';
                
                if (chatIn) chatIn.focus();
                
                window.sessionBriefed = true;
                window.briefingInProgress = false;
                window.currentBatchFileCount = 0;
                window.isBriefingResponsePending = true;

                setTimeout(() => {
                    if (typeof window.updateDragDropQueueUI === 'function') {
                        window.updateDragDropQueueUI();
                    }
                }, 600);
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
                if (badge) badge.innerText = `GRAVITY · ${name}`; if (headerIcon) headerIcon.src = icon;
                if (chatIn) { chatIn.placeholder = `Ask ${name}...`; }
            } catch(e) {}
        } else {
            if (badge) badge.innerText = `GRAVITY`; if (headerIcon) headerIcon.src = 'png.png'; if (chatIn) chatIn.placeholder = `Ask AI...`;
        }
    };

    window.updateAgentBadge = updateAgentBadge;
    const sendBtn = document.getElementById('send-to-local');
    if (sendBtn) {
        sendBtn.onclick = () => handleSend();
    }
    
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
        const cancelPersonaBtn = document.getElementById('cancel-persona');
        if (cancelPersonaBtn) cancelPersonaBtn.onclick = () => { if (pMo) pMo.style.display = 'none'; };
        const savePersonaBtn = document.getElementById('save-persona');
        if (savePersonaBtn) {
            savePersonaBtn.onclick = () => {
                const nameEl = document.getElementById('ps-name');
                const personalityEl = document.getElementById('ps-personality');
                const infoEl = document.getElementById('ps-info');
                const speechEl = document.getElementById('ps-speech');
                const content = `NAME: ${nameEl ? nameEl.value : ''}\nPERSONALITY: ${personalityEl ? personalityEl.value : ''}\nINFO: ${infoEl ? infoEl.value : ''}\nSPEECH: ${speechEl ? speechEl.value : ''}`;
                ipcRenderer.send('vault-update-global', { fileName: 'traits.md', content });
                if (pMo) pMo.style.display = 'none';
                GravityVault.init();
            };
        }
    }
    const bailoutZone = document.getElementById('toast-bailout-zone');
    if (bailoutZone) {
        bailoutZone.onclick = (e) => {
            e.stopPropagation();
            const toast = document.getElementById('injection-toast');
            if (toast) toast.style.display = 'none';
            const chatOverlay = document.getElementById('local-chat-overlay');
            if (chatOverlay) chatOverlay.style.display = 'none';
            const progressBox = document.getElementById('overlay-progress-box');
            if (progressBox) progressBox.style.display = 'none';
            const projBtn = document.getElementById('btn-send-project-info');
            if (projBtn) projBtn.style.display = 'flex';
            ChatUI.appendBubble('system', '[SYSTEM] Emergency bailout: Force closed loading overlays.');
        };
    }
    const dock = document.getElementById('agent-view-dock');
    if (dock) {
        dock.addEventListener('dragover', (e) => {
            const isText = e.dataTransfer.types.includes('text/plain');
            const isFiles = e.dataTransfer.types.includes('Files');
            if (isText && !isFiles) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
            }
        });
        
        dock.addEventListener('drop', async (e) => {
            const isFiles = e.dataTransfer.files.length > 0;
            const filePath = e.dataTransfer.getData('text/plain');
            if (filePath && !isFiles) {
                e.preventDefault();
                console.log("[DockDrop] HTML5 Dropped internal sidebar file path:", filePath);
                
                if (window.dragDropMode && window.activeDragDropContinue) {
                    const pathModule = require('path');
                    const droppedName = pathModule.basename(filePath).toLowerCase();
                    
                    const pendingItems = window.requestedFilesQueue.filter(item => item.status === 'PENDING' || item.status === 'UPLOADING');
                    const requestedNames = pendingItems.map(item => item.relativePath.split(/[\\/]/).pop().toLowerCase());
                    
                    if (requestedNames.length > 0 && !requestedNames.includes(droppedName)) {
                        const { showAlert } = require('./ui/dialogs.js');
                        if (typeof showAlert === 'function') {
                            showAlert(`요구된 파일이 아닙니다.\n요구된 파일명: ${requestedNames.join(', ')}`);
                        } else {
                            alert(`요구된 파일이 아닙니다.\n요구된 파일명: ${requestedNames.join(', ')}`);
                        }
                        return;
                    }
                    
                    window.readFilesSet.add(filePath);
                    
                    const stillPending = window.requestedFilesQueue.filter(item => item.status === 'PENDING' || item.status === 'UPLOADING');
                    if (stillPending.length === 0) {
                        if (window.activeDragDropCleanup) window.activeDragDropCleanup();
                        setTimeout(() => {
                            const continueFunc = window.activeDragDropContinue;

                            // Clean up UI immediately for instant responsive feedback
                            window.requestedFilesQueue = [];
                            if (typeof window.updateDragDropQueueUI === 'function') {
                                window.updateDragDropQueueUI();
                            }

                            if (continueFunc && continueFunc.isReal) {
                                // Trigger runRead asynchronously in background
                                continueFunc();
                            } else {
                                if (window.autoDragging && !window.autoDraggingTempDisabled && typeof window.triggerGuestSend === 'function') {
                                    window.triggerGuestSend();
                                }

                                if (typeof runExperimentalEngine === 'function') {
                                    runExperimentalEngine('/marktag', "", null).then(response => {
                                        if (response) {
                                            if (typeof window.finalizeAiBubble === 'function') {
                                                window.finalizeAiBubble(response);
                                            }
                                            if (typeof detectAndAskCommand === 'function') {
                                                detectAndAskCommand(response);
                                            }
                                        }
                                    }).catch(err => console.error("Error in response monitoring:", err));
                                }
                            }
                        }, 500);
                    }
                } else {
                    const fs = require('fs');
                    const pathModule = require('path');
                    try {
                        const contentBuffer = fs.readFileSync(filePath);
                        const filename = pathModule.basename(filePath);
                        const base64Content = contentBuffer.toString('base64');
                        
                        const ext = filename.split('.').pop().toLowerCase();
                        const mimeMap = {
                            'js': 'text/javascript', 'json': 'application/json',
                            'html': 'text/html', 'css': 'text/css',
                            'txt': 'text/plain', 'md': 'text/markdown',
                            'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
                            'gif': 'image/gif', 'pdf': 'application/pdf', 'zip': 'application/zip'
                        };
                        const mimeType = mimeMap[ext] || 'application/octet-stream';
                        
                        const wv = document.getElementById('active-agent-webview');
                        if (wv) {
                            wv.executeJavaScript(`
                                (() => {
                                    const b64 = "${base64Content}";
                                    const name = "${filename}";
                                    const mime = "${mimeType}";
                                    
                                    const binary = atob(b64);
                                    const array = new Uint8Array(binary.length);
                                    for (let i = 0; i < binary.length; i++) {
                                        array[i] = binary.charCodeAt(i);
                                    }
                                    const blob = new Blob([array], { type: mime });
                                    const file = new File([blob], name, { type: mime });
                                    
                                    const dt = new DataTransfer();
                                    dt.items.add(file);
                                    
                                    let target = document.querySelector('textarea, [contenteditable="true"]') || document.body;
                                    
                                    const options = { bubbles: true, cancelable: true, dataTransfer: dt };
                                    target.dispatchEvent(new DragEvent('dragenter', options));
                                    target.dispatchEvent(new DragEvent('dragover', options));
                                    target.dispatchEvent(new DragEvent('drop', options));
                                    
                                    console.log("[GuestDrop] Dispatched drop event for file:", name);
                                })();
                            `).catch(err => console.error("Failed to execute drop injection script:", err));
                        }
                    } catch (err) {
                        console.error("Failed to process drop upload:", err);
                    }
                }
            }
        });
    }

    updateAgentBadge();
}

const GravityVault = {
    activeLogPath: null, 
    async init() {
        const res = await ipcRenderer.invoke('vault-init'); 
        this.activeLogPath = res.activeLogPath;
        window.appRootPath = res.appPath;
        console.log("[Vault] Log System Initialized:", this.activeLogPath, "appRootPath:", window.appRootPath);
    },
    log(role, text) { if (this.activeLogPath) ipcRenderer.send('vault-log', { logPath: this.activeLogPath, role, text }); }
};

async function migrateToVault() {
    const appsStr = localStorage.getItem('rg_agent_apps') || localStorage.getItem('pormsg_agent_apps') || localStorage.getItem('vapor_agent_apps');
    if (appsStr && appsStr !== '[]') { const currentRegistry = await ipcRenderer.invoke('vault-read-global', 'registry.json'); if (!currentRegistry) ipcRenderer.send('vault-update-global', { fileName: 'registry.json', content: appsStr }); }
    const kwStr = localStorage.getItem('rg_discovery_keywords') || localStorage.getItem('pormsg_discovery_keywords') || localStorage.getItem('vapor_discovery_keywords');
    if (kwStr) { const currentKw = await ipcRenderer.invoke('vault-read-global', 'discovery_keywords.txt'); if (!currentKw) ipcRenderer.send('vault-update-global', { fileName: 'discovery_keywords.txt', content: kwStr }); }
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await migrateToVault();
    } catch (e) {
        console.error("migrateToVault failed:", e);
    }
    
    const selectBox = document.getElementById('terminal-sub-tabs');
    if (selectBox) setupHorizontalScroll(selectBox);
    
    try {
        addSubTerminal(true);
    } catch (e) {
        console.error("addSubTerminal failed:", e);
    }

    try {
        await GravityVault.init();
    } catch (e) {
        console.error("GravityVault init failed:", e);
    }

    try {
        await setupBoot();
    } catch (e) {
        console.error("setupBoot failed:", e);
    }

    try {
        setupUI();
    } catch (e) {
        console.error("setupUI failed:", e);
    }
    
    if (typeof openProjectModal === 'function') {
        openProjectModal();
    }
    
    if (typeof bindDragAndDrop === 'function') {
        bindDragAndDrop();
    }
    
    if (typeof ChatUI !== 'undefined' && typeof ChatUI.restoreHistory === 'function') {
        await ChatUI.restoreHistory();
    }
    
    const chatIn = document.getElementById('local-agent-input');
    if (chatIn) {
        setTimeout(() => {
            if (typeof window.swi === 'function') window.swi('browser');
            chatIn.focus();
            chatIn.click();
        }, 300);
    }
    
    ipcRenderer.on('trigger-app-reload', () => {
        location.reload();
    });
    
    ipcRenderer.on('refresh-explorer', () => { 
        window.loadDirectory(window.currentPath); 
    });
});


window.triggerSessionReset = async () => {
    const fs = require('fs');
    const path = require('path');
    const { execSync } = require('child_process');
    
    if (typeof ChatUI !== 'undefined' && typeof ChatUI.appendBubble === 'function') {
        ChatUI.appendBubble('system', '[SYSTEM] Preparing session reset. Generating carryover context...');
    }
    
    let gitStatus = "";
    try {
        gitStatus = execSync('git status -s', { cwd: window.currentPath || process.cwd() }).toString().trim();
    } catch (e) {
        gitStatus = "Git not initialized or not found";
    }
    
    let treeStr = "";
    try {
        const getFlatDirectoryTree = (dirPath) => {
            let results = [];
            try {
                const list = fs.readdirSync(dirPath);
                list.forEach(file => {
                    const fullPath = path.join(dirPath, file);
                    if (file === 'node_modules' || file === '.git' || file === '.gemini') return;
                    const stat = fs.statSync(fullPath);
                    if (stat && stat.isDirectory()) {
                        results = results.concat(getFlatDirectoryTree(fullPath));
                    } else {
                        results.push(fullPath);
                    }
                });
            } catch (e) {}
            return results;
        };
        const files = getFlatDirectoryTree(window.currentPath || process.cwd());
        const relativeFiles = files.map(f => path.relative(window.currentPath || process.cwd(), f));
        treeStr = relativeFiles.map(rf => `- ${rf.replace(/\\/g, '/')}`).join('\n');
    } catch(e) {
        treeStr = "Error reading directory structure";
    }
    
    const carryOverPrompt = `[SYSTEM REBOOTED]
Current session chat history exceeded limits and was safely rebooted.
Handing over previous progress. Please follow rules and tools to continue.

1. Modified and added local file list (Git Status):
\`\`\`
${gitStatus || "No modified files"}
\`\`\`

2. Current project folder/file structure:
${treeStr}

${window.getSystemRulesPrompt(true)}

Check previous session goals and specify next changes or tasks.`;

    window.carryOverPrompt = carryOverPrompt;
    window.sessionBriefed = false; // Reset session briefing state
    window.sessionTurnCount = 0;
    
    const webview = document.getElementById('active-agent-webview');
    if (webview) {
        webview.reload();
    }
};


async function orchestrateCommands(writeCmds, editCmds, deleteCmds, moveCmds, listDirCmds, createDirCmds, runCommandCmds, searchKeywordCmds) {
    let accumulatedFeedback = "";
    let isDeleteApproved = true;
    let isWriteEditApproved = true;

    const submitConsolidatedFeedback = async (feedback) => {
        if (!feedback.trim()) return;
        const finalMessage = `${feedback}\nProceed to next step.${window.getSystemRulesPrompt(true)}`;
        await injectWebPayload(finalMessage, 0);
        window.currentBatchFileCount = 0;
        const response = await runExperimentalEngine('/marktag', finalMessage, null);
        if (!window.autoContinueOnRead) {
            document.getElementById('tab-local-agent')?.click();
        }
        if (response) {
            if (typeof window.finalizeAiBubble === 'function') {
                window.finalizeAiBubble(response);
            }
            detectAndAskCommand(response);
        }
    };

    const startDeleteOrchestration = () => {
        if (deleteCmds.length > 0) {
            const displayDelete = deleteCmds.map(c => c.path).join(', ');
            const box = ChatUI.appendBubble('system', '');
            const content = box.querySelector('.bubble-content');
            const themeColor = "#ef4444"; 
            const glowShadow = "none";

            content.innerHTML = `
                <div style="background: var(--surface-low); padding: 12px 14px; border-radius: 8px; border: 1px solid var(--border-color); font-family: 'DM Sans', monospace; font-size: 12px; color: var(--text-main); margin-bottom: 12px; line-height: 1.5; word-break: break-all; box-shadow: inset 0 2px 4px rgba(0,0,0,0.15); margin-top: 4px;">
                    <div style="font-weight: bold; color: #ff4444; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                        <span>⚠️ DELETE CONFIRMATION</span>
                    </div>
                    <span>Allow Web AI to delete: <strong style="color: var(--text-main); font-size: 11px; background: rgba(0,0,0,0.2); padding: 2px 6px; border-radius: 4px;">${displayDelete}</strong>?</span>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="cmd-run-btn" style="flex: 1; background: linear-gradient(135deg, ${themeColor}, ${themeColor}dd); color: white; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 700; font-size: 11.5px; letter-spacing: 0.04em; font-family: 'DM Sans', sans-serif; transition: all 0.2s; box-shadow: none;">ALLOW</button>
                    <button class="cmd-cancel-btn" style="flex: 1; background: rgba(255, 255, 255, 0.04); color: var(--text-muted); border: 1px solid var(--border-color); padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 11.5px; letter-spacing: 0.04em; font-family: 'DM Sans', sans-serif; transition: all 0.2s;">DENY</button>
                </div>
            `;

            const onContinue = () => {
                box.remove();
                if (window.activeCommandCleanup) window.activeCommandCleanup();
                isDeleteApproved = true;
                startWriteEditOrchestration();
            };

            const onCancel = () => {
                box.remove();
                if (window.activeCommandCleanup) window.activeCommandCleanup();
                isDeleteApproved = false;
                deleteCmds.forEach(c => {
                    accumulatedFeedback += `[FILE DELETE ERROR: ${c.path} - User denied permission]\n`;
                    ChatUI.appendBubble('system', `[ERROR] Deletion of ${c.path} denied by user.`);
                });
                startWriteEditOrchestration();
            };

            content.querySelector('.cmd-run-btn').onclick = onContinue;
            content.querySelector('.cmd-cancel-btn').onclick = onCancel;

            if (typeof window.showCommandExecutionPanel === 'function') {
                window.showCommandExecutionPanel(
                    "⚠️ Delete Confirmation",
                    `Allow Web AI to delete: ${displayDelete}?`,
                    onContinue,
                    onCancel
                );
            }
        } else {
            startWriteEditOrchestration();
        }
    };

    const startWriteEditOrchestration = () => {
        if (writeCmds.length > 0 || editCmds.length > 0) {
            const displayModify = [
                ...writeCmds.map(c => `[NEW] ${c.path}`),
                ...editCmds.map(c => `[MODIFY] ${c.path}`)
            ].join(', ');

            const box = ChatUI.appendBubble('system', '');
            const content = box.querySelector('.bubble-content');
            const themeColor = "#3b82f6";
            const glowShadow = "none";

            content.innerHTML = `
                <div style="background: var(--surface-low); padding: 12px 14px; border-radius: 8px; border: 1px solid var(--border-color); font-family: 'DM Sans', monospace; font-size: 12px; color: var(--text-main); margin-bottom: 12px; line-height: 1.5; word-break: break-all; box-shadow: inset 0 2px 4px rgba(0,0,0,0.15); margin-top: 4px;">
                    <div style="font-weight: bold; color: #3b82f6; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                        <span>⚠️ FILE MODIFICATION CONFIRMATION</span>
                    </div>
                    <span>Allow Web AI to write/edit: <strong style="color: var(--text-main); font-size: 11px; background: rgba(0,0,0,0.2); padding: 2px 6px; border-radius: 4px;">${displayModify}</strong>?</span>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="cmd-run-btn" style="flex: 1; background: linear-gradient(135deg, ${themeColor}, ${themeColor}dd); color: white; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 700; font-size: 11.5px; letter-spacing: 0.04em; font-family: 'DM Sans', sans-serif; transition: all 0.2s; box-shadow: none;">ALLOW</button>
                    <button class="cmd-cancel-btn" style="flex: 1; background: rgba(255, 255, 255, 0.04); color: var(--text-muted); border: 1px solid var(--border-color); padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 11.5px; letter-spacing: 0.04em; font-family: 'DM Sans', sans-serif; transition: all 0.2s;">DENY</button>
                </div>
            `;

            const onContinue = () => {
                box.remove();
                if (window.activeCommandCleanup) window.activeCommandCleanup();
                isWriteEditApproved = true;
                runDiskModifications();
            };

            const onCancel = () => {
                box.remove();
                if (window.activeCommandCleanup) window.activeCommandCleanup();
                isWriteEditApproved = false;
                const writePaths = writeCmds.map(c => c.path).join(', ');
                const editPaths = editCmds.map(c => c.path).join(', ');
                if (writePaths) {
                    accumulatedFeedback += `[FILE WRITE DENIED BY USER: ${writePaths}]\n`;
                    ChatUI.appendBubble('system', `[DENIED] Blocked writing to: ${writePaths}`);
                }
                if (editPaths) {
                    accumulatedFeedback += `[FILE EDIT DENIED BY USER: ${editPaths}]\n`;
                    ChatUI.appendBubble('system', `[DENIED] Blocked editing: ${editPaths}`);
                }
                runDiskModifications();
            };

            content.querySelector('.cmd-run-btn').onclick = onContinue;
            content.querySelector('.cmd-cancel-btn').onclick = onCancel;

            if (typeof window.showCommandExecutionPanel === 'function') {
                window.showCommandExecutionPanel(
                    "⚠️ File Modification Confirmation",
                    `Allow Web AI to write/edit: ${displayModify}?`,
                    onContinue,
                    onCancel
                );
            }
        } else {
            runDiskModifications();
        }
    };

    const runDiskModifications = async () => {
        if (createDirCmds.length > 0) {
            const fs = require('fs');
            const path = require('path');
            for (const c of createDirCmds) {
                try {
                    const targetPath = path.resolve(window.currentPath || process.cwd(), c.path);
                    if (!fs.existsSync(targetPath)) {
                        fs.mkdirSync(targetPath, { recursive: true });
                        accumulatedFeedback += `[DIRECTORY CREATED: ${c.path}]\n`;
                        ChatUI.appendBubble('system', `[SUCCESS] Created directory: ${c.path}`);
                    }
                } catch(err) {
                    accumulatedFeedback += `[DIRECTORY CREATE ERROR: ${c.path} - ${err.message}]\n`;
                    ChatUI.appendBubble('system', `[ERROR] Failed to create directory ${c.path}: ${err.message}`);
                }
            }
        }

        if (deleteCmds.length > 0 && isDeleteApproved) {
            const fs = require('fs');
            const path = require('path');
            for (const c of deleteCmds) {
                try {
                    const targetPath = path.resolve(window.currentPath || process.cwd(), c.path);
                    if (fs.existsSync(targetPath)) {
                        const stat = fs.statSync(targetPath);
                        if (stat.isDirectory()) {
                            fs.rmSync(targetPath, { recursive: true, force: true });
                        } else {
                            fs.unlinkSync(targetPath);
                        }
                        accumulatedFeedback += `[FILE DELETE SUCCESS: ${c.path}]\n`;
                        ChatUI.appendBubble('system', `[SUCCESS] Deleted ${c.path}`);
                    } else {
                        accumulatedFeedback += `[FILE DELETE SUCCESS: ${c.path} (Already gone)]\n`;
                        ChatUI.appendBubble('system', `[SUCCESS] Deleted ${c.path} (Already gone)`);
                    }
                } catch (err) {
                    accumulatedFeedback += `[FILE DELETE ERROR: ${c.path} - ${err.message}]\n`;
                    ChatUI.appendBubble('system', `[ERROR] Failed to delete ${c.path}: ${err.message}`);
                }
            }
        }

        if (isWriteEditApproved) {
            if (writeCmds.length > 0) {
                if (typeof executeWriteFileBatchSilent === 'function') {
                    const feedback = await executeWriteFileBatchSilent(writeCmds);
                    accumulatedFeedback += feedback;
                }
            }
            if (editCmds.length > 0) {
                const blockCmds = editCmds.filter(c => c.type === 'block');
                const rangeCmds = editCmds.filter(c => c.type === 'range');
                if (blockCmds.length > 0 && typeof executeEditFileBatchSilent === 'function') {
                    const feedback = await executeEditFileBatchSilent(blockCmds);
                    accumulatedFeedback += feedback;
                }
                if (rangeCmds.length > 0 && typeof executeEditFileRangeBatchSilent === 'function') {
                    const feedback = await executeEditFileRangeBatchSilent(rangeCmds);
                    accumulatedFeedback += feedback;
                }
            }

            const modifiedFilesList = [];
            writeCmds.forEach(c => modifiedFilesList.push(c.path));
            editCmds.forEach(c => {
                if (!modifiedFilesList.includes(c.path)) {
                    modifiedFilesList.push(c.path);
                }
            });
            if (modifiedFilesList.length > 0) {
                accumulatedFeedback += `\n[SYSTEM] Please use the \`read-file\` or \`read-file-range\` command to inspect the modified files and verify your edits: ${modifiedFilesList.join(', ')}\n`;
            }
        }

        if (moveCmds.length > 0) {
            const fs = require('fs');
            const path = require('path');
            for (const c of moveCmds) {
                try {
                    const srcPath = path.resolve(window.currentPath || process.cwd(), c.src);
                    const destPath = path.resolve(window.currentPath || process.cwd(), c.dest);
                    if (fs.existsSync(srcPath)) {
                        const parentDir = path.dirname(destPath);
                        if (!fs.existsSync(parentDir)) {
                            fs.mkdirSync(parentDir, { recursive: true });
                        }
                        fs.renameSync(srcPath, destPath);
                        accumulatedFeedback += `[FILE MOVE SUCCESS: ${c.src} to ${c.dest}]\n`;
                        ChatUI.appendBubble('system', `[SUCCESS] Moved ${c.src} to ${c.dest}`);
                    } else {
                        accumulatedFeedback += `[FILE MOVE ERROR: ${c.src} (File not found)]\n`;
                        ChatUI.appendBubble('system', `[ERROR] Failed to move ${c.src}: File not found`);
                    }
                } catch (err) {
                    accumulatedFeedback += `[FILE MOVE ERROR: ${c.src} - ${err.message}]\n`;
                    ChatUI.appendBubble('system', `[ERROR] Failed to move ${c.src}: ${err.message}`);
                }
            }
        }

        if (typeof window.loadDirectory === 'function' && window.currentPath) {
            window.loadDirectory(window.currentPath);
        }

        if (listDirCmds.length > 0) {
            const fs = require('fs');
            const path = require('path');
            for (const c of listDirCmds) {
                try {
                    const targetPath = path.resolve(window.currentPath || process.cwd(), c.path);
                    if (fs.existsSync(targetPath)) {
                        const files = fs.readdirSync(targetPath);
                        const listText = files.map(f => `- ${f}`).join('\n') || "(Directory is empty)";
                        accumulatedFeedback += `[DIRECTORY LIST FOR ${c.path}]:\n${listText}\n\n`;
                        ChatUI.appendBubble('system', `[SUCCESS] Listed directory: ${c.path}`);
                    } else {
                        accumulatedFeedback += `[DIRECTORY LIST ERROR: ${c.path} (Directory not found)]\n`;
                        ChatUI.appendBubble('system', `[ERROR] Failed to list directory ${c.path}: Directory not found`);
                    }
                } catch (err) {
                    accumulatedFeedback += `[DIRECTORY LIST ERROR: ${c.path} - ${err.message}]\n`;
                    ChatUI.appendBubble('system', `[ERROR] Failed to list directory ${c.path}: ${err.message}`);
                }
            }
        }

        if (searchKeywordCmds.length > 0) {
            const fs = require('fs');
            const path = require('path');
            for (const c of searchKeywordCmds) {
                const results = [];
                const walk = (dir) => {
                    const list = fs.readdirSync(dir);
                    for (const file of list) {
                        const fullPath = path.join(dir, file);
                        if (file === 'node_modules' || file === '.git' || file === '.gemini') continue;
                        try {
                            const stat = fs.statSync(fullPath);
                            if (stat && stat.isDirectory()) {
                                walk(fullPath);
                            } else {
                                const ext = path.extname(file).toLowerCase();
                                if (['.js', '.json', '.html', '.css', '.md', '.txt', '.cs', '.py', '.ts'].includes(ext)) {
                                    const content = fs.readFileSync(fullPath, 'utf-8');
                                    const lines = content.split('\n');
                                    lines.forEach((line, idx) => {
                                        if (line.toLowerCase().includes(c.pattern.toLowerCase())) {
                                            const rel = path.relative(window.currentPath || process.cwd(), fullPath);
                                            results.push({ file: rel, line: idx + 1, text: line.trim() });
                                        }
                                    });
                                }
                            }
                        } catch(e) {}
                        if (results.length > 50) break;
                    }
                };
                try {
                    walk(window.currentPath || process.cwd());
                    accumulatedFeedback += `[SEARCH RESULTS FOR "${c.pattern}"]: \n`;
                    if (results.length === 0) {
                        accumulatedFeedback += `No matches found.\n\n`;
                    } else {
                        results.forEach(r => {
                            accumulatedFeedback += `${r.file}:${r.line}: ${r.text}\n`;
                        });
                        accumulatedFeedback += `\n`;
                    }
                    ChatUI.appendBubble('system', `[SUCCESS] Searched keyword: ${c.pattern}`);
                } catch(e) {
                    accumulatedFeedback += `[SEARCH ERROR: ${e.message}]\n`;
                    ChatUI.appendBubble('system', `[ERROR] Search failed: ${e.message}`);
                }
            }
        }

        startCommandOrchestration();
    };

    const startCommandOrchestration = () => {
        if (runCommandCmds.length > 0) {
            const displayCmd = runCommandCmds.map(c => `run-command "${c.command}"`).join(', ');
            const box = ChatUI.appendBubble('system', '');
            const content = box.querySelector('.bubble-content');
            const themeColor = "#ef4444"; 
            const glowShadow = "none";

            content.innerHTML = `
                <div style="background: var(--surface-low); padding: 12px 14px; border-radius: 8px; border: 1px solid var(--border-color); font-family: 'DM Sans', monospace; font-size: 12px; color: var(--text-main); margin-bottom: 12px; line-height: 1.5; word-break: break-all; box-shadow: inset 0 2px 4px rgba(0,0,0,0.15); margin-top: 4px;">
                    <div style="font-weight: bold; color: #ff4444; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                        <span>⚠️ SECURITY WARNING</span>
                    </div>
                    <span>Allow Web AI to execute: <strong style="color: var(--text-main); font-size: 11px; background: rgba(0,0,0,0.2); padding: 2px 6px; border-radius: 4px;">${displayCmd}</strong>?</span>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="cmd-run-btn" style="flex: 1; background: linear-gradient(135deg, ${themeColor}, ${themeColor}dd); color: white; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 700; font-size: 11.5px; letter-spacing: 0.04em; font-family: 'DM Sans', sans-serif; transition: all 0.2s; box-shadow: none;">ALLOW</button>
                    <button class="cmd-cancel-btn" style="flex: 1; background: rgba(255, 255, 255, 0.04); color: var(--text-muted); border: 1px solid var(--border-color); padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 11.5px; letter-spacing: 0.04em; font-family: 'DM Sans', sans-serif; transition: all 0.2s;">DENY</button>
                </div>
            `;

            const onContinue = async () => {
                box.remove();
                if (window.activeCommandCleanup) window.activeCommandCleanup();
                const { exec } = require('child_process');
                for (const c of runCommandCmds) {
                    ChatUI.appendBubble('system', `[SYSTEM] Running command: ${c.command}...\n`);
                    let loaderBox = ChatUI.appendBubble('system', '');
                    const loaderContent = loaderBox.querySelector('.bubble-content');
                    if (loaderContent) {
                        loaderContent.innerHTML = `
                            <div style="display: flex; align-items: center; gap: 8px; font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: var(--text-muted);">
                                <div class="terminal-loading-spinner" style="width: 12px; height: 12px; border-width: 1.5px;"></div>
                                <span>Executing: ${c.command}</span>
                            </div>
                        `;
                    }
                    
                    await new Promise(resolve => {
                        exec(c.command, { cwd: window.currentPath || process.cwd(), timeout: 45000 }, async (err, stdout, stderr) => {
                            if (loaderBox) loaderBox.remove();
                            const output = (stdout + '\n' + stderr).trim() || "[No output]";
                            if (typeof ChatUI !== 'undefined' && typeof ChatUI.appendBubble === 'function') {
                                const resBox = ChatUI.appendBubble('system', '');
                                const resContent = resBox.querySelector('.bubble-content');
                                if (resContent) {
                                    resContent.innerHTML = `
                                        <div style="background: var(--surface-low); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); font-family: 'JetBrains Mono', monospace; font-size: 11.5px; line-height: 1.4;">
                                            <div style="display: flex; align-items: center; gap: 6px; font-weight: bold; color: ${err ? '#FF5252' : '#4CAF50'}; margin-bottom: 8px;">
                                                <span>${err ? '❌ Command Failed' : '✅ Command Succeeded'}</span>
                                                <span style="color: var(--text-muted); font-size: 10.5px; font-weight: normal;">(&quot;${c.command}&quot;)</span>
                                            </div>
                                            <pre style="margin: 0; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 6px; overflow-x: auto; color: var(--text-main); font-size: 11px; max-height: 200px; white-space: pre-wrap;">${output.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
                                        </div>
                                    `;
                                }
                            }
                            accumulatedFeedback += `[COMMAND EXECUTION RESULT FOR "${c.command}"]: \n${output}\n\n`;
                            resolve();
                        });
                    });
                }
                await submitConsolidatedFeedback(accumulatedFeedback);
            };

            const onCancel = () => {
                box.remove();
                if (window.activeCommandCleanup) window.activeCommandCleanup();
                accumulatedFeedback += `[COMMAND EXECUTION CANCELLED BY USER]\n`;
                submitConsolidatedFeedback(accumulatedFeedback);
            };

            content.querySelector('.cmd-run-btn').onclick = onContinue;
            content.querySelector('.cmd-cancel-btn').onclick = onCancel;

            if (typeof window.showCommandExecutionPanel === 'function') {
                window.showCommandExecutionPanel(
                    "⚠️ Security Warning",
                    `Allow Web AI to execute: ${displayCmd}?`,
                    onContinue,
                    onCancel
                );
            }
        } else {
            submitConsolidatedFeedback(accumulatedFeedback);
        }
    };

    startDeleteOrchestration();
}

async function submitConsolidatedFeedback(feedback) {
    if (!feedback.trim()) return;
    
    const finalMessage = `${feedback}\nProceed to next step.${window.getSystemRulesPrompt(true)}`;
    await injectWebPayload(finalMessage, 0);
    
    window.currentBatchFileCount = 0;
    const response = await runExperimentalEngine('/marktag', finalMessage, null);
    if (!window.autoContinueOnRead) {
        document.getElementById('tab-local-agent')?.click();
    }
    if (response) {
        if (typeof window.finalizeAiBubble === 'function') {
            window.finalizeAiBubble(response);
        }
        detectAndAskCommand(response);
    }
}

window.setCoverLifted = function(lifted) {
    // No-op: Bottom BROWSER area is permanently exposed on local tab.
};
