const fs = require('fs');
if (typeof ipcRenderer === 'undefined') { var { ipcRenderer } = require('electron'); }

window.totalFilesCount = 0;
window.readFilesSet = new Set();
window.currentBatchFileCount = 0;
window.currentPath = process.cwd();
window.currentSplitHeight = 0;
window.pendingSplitHeight = 220;
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
    const path = require('path');
    const absolutePath = path.resolve(window.currentPath || process.cwd(), filePath);
    const normalizedPath = absolutePath.replace(/\//g, '\\').toLowerCase();
    const relativePath = path.relative(window.currentPath || process.cwd(), absolutePath);
    const fs = require('fs');
    if (fs.existsSync(absolutePath)) {
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
                const inKeywords = ["prompt", "chat", "message", "write", "ask", "질문", "메시지"];
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

            input.focus();
            
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
            if (window.guestDropListener) {
                window.removeEventListener('dragover', window.guestDragoverListener, true);
                window.removeEventListener('drop', window.guestDropListener, true);
            }
            if (window.guestKeydownListener) {
                window.removeEventListener('keydown', window.guestKeydownListener, true);
            }
            if (window.guestClickListener) {
                window.removeEventListener('click', window.guestClickListener, true);
            }
            
            window.guestDragoverListener = (e) => {
                const isFiles = e.dataTransfer.types.includes('Files');
                if (!isFiles) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                }
            };
            
            window.guestDropListener = (e) => {
                const isFiles = e.dataTransfer.files && e.dataTransfer.files.length > 0;
                const textData = e.dataTransfer.getData('text/plain');
                if (textData && !isFiles) {
                    e.preventDefault();
                    console.log('[GUEST_HTML5_DROP]:' + textData);
                } else if (isFiles) {
                    for (let i = 0; i < e.dataTransfer.files.length; i++) {
                        console.log('[GUEST_FILE_DROP]:' + e.dataTransfer.files[i].name);
                    }
                }
            };
            
            const findInput = () => {
                const isVisible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
                const candidates = Array.from(document.querySelectorAll('textarea, div[contenteditable="true"], [role="textbox"]')).filter(isVisible);
                if (document.activeElement && candidates.includes(document.activeElement)) {
                    return document.activeElement;
                }
                return candidates[0] || null;
            };

            const getInputText = (el) => {
                if (!el) return "";
                if (el.tagName.toLowerCase() === 'textarea' || el.tagName.toLowerCase() === 'input') {
                    return el.value;
                }
                return el.innerText || el.textContent || "";
            };

            window.lastLoggedUserMessage = "";
            window.lastLoggedTime = 0;
            const logUserMessage = (text) => {
                if (!text) return;
                const now = Date.now();
                if (text === window.lastLoggedUserMessage && (now - window.lastLoggedTime) < 1500) {
                    return;
                }
                window.lastLoggedUserMessage = text;
                window.lastLoggedTime = now;
                console.log('[GUEST_USER_MESSAGE]:' + text);
            };

            window.guestKeydownListener = (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    const inputEl = findInput();
                    const text = getInputText(inputEl).trim();
                    if (!text) return;
                    
                    // Verify if the input is actually submitted and cleared!
                    setTimeout(() => {
                        const verifiedEl = findInput();
                        const verifiedText = getInputText(verifiedEl).trim();
                        if (!verifiedText || !verifiedText.includes(text)) {
                            logUserMessage(text);
                        }
                    }, 350);
                }
            };

            window.guestClickListener = (e) => {
                const btn = e.target.closest('button');
                if (btn) {
                    const label = (btn.getAttribute('aria-label') || btn.title || btn.innerText || '').toLowerCase();
                    const isSend = label.includes('send') || label.includes('보내기') || label.includes('전송') || label.includes('submit') || btn.querySelector('svg') || btn.innerHTML.includes('arrow') || btn.innerHTML.includes('send');
                    if (isSend) {
                        const inputEl = findInput();
                        const text = getInputText(inputEl).trim();
                        if (!text) return;
                        
                        setTimeout(() => {
                            const verifiedEl = findInput();
                            const verifiedText = getInputText(verifiedEl).trim();
                            if (!verifiedText || !verifiedText.includes(text)) {
                                logUserMessage(text);
                            }
                        }, 350);
                    }
                }
            };
            
            window.addEventListener('dragover', window.guestDragoverListener, true);
            window.addEventListener('drop', window.guestDropListener, true);
            window.addEventListener('keydown', window.guestKeydownListener, true);
            window.addEventListener('click', window.guestClickListener, true);
            console.log('[GuestInterceptor] Successfully registered drop and message listeners.');
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
    if (!listEl) return;
    
    // Toggle container display based on dragDropMode and presence of items in the queue
    const hasItems = window.requestedFilesQueue.length > 0;
    if (containerEl) {
        if (window.dragDropMode && hasItems) {
            containerEl.style.display = 'flex';
            window.toggleBackdropBlur(true);
        } else {
            containerEl.style.display = 'none';
            window.toggleBackdropBlur(false);
        }
    }
    
    const closeBtn = document.getElementById('close-drag-drop-queue');
    if (closeBtn && containerEl) {
        closeBtn.onclick = () => {
            containerEl.style.display = 'none';
            window.toggleBackdropBlur(false);
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
        
        itemEl.style = `
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
            itemEl.onclick = async () => {
                const isFocused = await ipcRenderer.invoke('is-window-focused');
                if (!isFocused) {
                    console.log("[DragSim] Aborted drag simulation because window is in the background.");
                    return;
                }
                const pathModule = require('path');
                try {
                    const filePath = item.absolutePath;
                    window.currentlyDraggedFilePath = filePath;
                    const filename = pathModule.basename(filePath);
                    
                    const wv = document.getElementById('active-agent-webview');
                    if (!wv) return;
                    
                    // 1. Get window content bounds relative to screen X/Y
                    const bounds = await ipcRenderer.invoke('get-content-bounds');
                    
                    // 2. Get click item element screen position
                    const rect = itemEl.getBoundingClientRect();
                    const startX = Math.round(bounds.x + rect.left + rect.width / 2);
                    const startY = Math.round(bounds.y + rect.top + rect.height / 2);
                    
                    // 3. Get webview screen position (middle lower area, where Gemini input lies)
                    const wvRect = wv.getBoundingClientRect();
                    const endX = Math.round(bounds.x + wvRect.left + wvRect.width / 2);
                    const endY = Math.round(bounds.y + wvRect.top + wvRect.height - 110);
                    
                    ChatUI.appendBubble('system', `[SYSTEM] Dragging and dropping ${filename}...`);
                    
                    // 4. Run C# drag_sim.exe to drag file from startX, startY to endX, endY!
                    const { execFile } = require('child_process');
                    const exePath = pathModule.join(process.cwd(), 'js', 'drag_sim.exe');
                    
                    execFile(exePath, [startX.toString(), startY.toString(), endX.toString(), endY.toString()], (err) => {
                        if (err) {
                            console.error("Drag simulation failed:", err);
                        }
                    });
                } catch (err) {
                    console.error("Failed to execute drag simulation on click:", err);
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

window.autoClickingQueue = false;
window.autoClickPendingQueueItems = async function() {
    if (window.autoClickingQueue) return;
    window.autoClickingQueue = true;
    
    try {
        let pendingItems = window.requestedFilesQueue.filter(item => item.status === 'PENDING');
        while (pendingItems.length > 0) {
            const item = pendingItems[0];
            const listEl = document.getElementById('drag-drop-queue-list');
            if (!listEl) break;
            
            const itemEls = listEl.querySelectorAll('.queue-item');
            let targetEl = null;
            for (const el of itemEls) {
                if (el.getAttribute('data-filepath') === item.absolutePath) {
                    targetEl = el;
                    break;
                }
            }
            
            if (targetEl && targetEl.onclick) {
                const isFocused = await ipcRenderer.invoke('is-window-focused');
                if (!isFocused) {
                    console.log("[AutoClick] Window is not focused. Postponing click.");
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    pendingItems = window.requestedFilesQueue.filter(item => item.status === 'PENDING');
                    continue;
                }
                console.log("[AutoClick] Clicking queue item:", item.relativePath);
                await targetEl.onclick();
                // Wait for C# drag simulation to fully complete
                await new Promise(resolve => setTimeout(resolve, 1400));
            } else {
                break;
            }
            
            pendingItems = window.requestedFilesQueue.filter(item => item.status === 'PENDING');
        }
    } catch (err) {
        console.error("[AutoClick] Error in queue auto-clicker:", err);
    } finally {
        window.autoClickingQueue = false;
    }
};

window.updateSplitLayoutHeight = function(newHeight) {
    if (newHeight < 40 || newHeight > 500) return;
    window.pendingSplitHeight = newHeight;
    if (window.sessionBriefed || window.briefingInProgress) {
        window.currentSplitHeight = newHeight;
        const vLC = document.getElementById('inspector-local-chat');
        if (vLC && (window.activeSubTabId === 'local' || !window.activeSubTabId || vLC.style.zIndex === '150')) {
            vLC.style.height = `calc(100% - 44px - ${newHeight}px)`;
        }
    }
};

window.reloadAgentSettings = function() {
    const _path = require('path');
    const _fs = require('fs');
    const p = _path.join(window.currentPath || process.cwd(), 'Settings.json');
    try {
        if (_fs.existsSync(p)) {
            const settings = JSON.parse(_fs.readFileSync(p, 'utf-8'));
            window.autoContinueOnRead = true;
            window.hideUIOverlay = settings.hasOwnProperty('hideUIOverlay') ? !!settings.hideUIOverlay : true;
            window.debugMode = !!settings.debugMode;
            window.dragDropMode = settings.hasOwnProperty('dragDropMode') ? !!settings.dragDropMode : true;
            return;
        }
    } catch(e) {}
    window.autoContinueOnRead = true;
    window.hideUIOverlay = true;
    window.debugMode = false;
    window.dragDropMode = true;
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
        const badge = document.getElementById('active-project-badge'); if (badge) badge.innerText = p === 'DRIVES' ? 'PC' : p.split(/[\\\/]/).pop().toUpperCase() || 'PORMSG';
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

window.getSystemRulesPrompt = function() {
    if (window.dragDropMode) {
        return `
[SYSTEM RULES]
1. 탐색 단계: 전체 파악 전 설명 일절 금지, 다음 탐색용 요구 사항만 단답형 제출.
2. 요구 규격 (Drag & Drop Mode 활성 상태):
   - 중요: 모든 파일 파악/요구는 유저에게 파일 드래그앤드롭을 정중히 요청하고, 문장 끝에 반드시 다음 태그를 포함하십시오:
     * [REQUEST: read-file "경로"] (파일의 개요/아웃라인(함수/클래스명, JSON 키 목록 등)만 축소 파악)
     * [REQUEST: read-file-full "경로"] (파일의 실제 전체 본문 코드 및 구체적인 설정값 파악)
     * [REQUEST: read-file-range "경로" 시작줄-끝줄] (파일 본문의 특정 줄 범위 분석, 최대 2000줄 제한)
3. 탐색 강제: 유저 질문/요청 시 짐작 금지. 관련 파일 목록을 유저에게 드롭해달라고 요청([REQUEST: read-file...])하여 확인한 뒤 답변하십시오. 본문 로직 확인 전에 모른다/없다 선언 절대 금지.
4. 문구 제한: 단답형으로 요청 직후 태그만 표시. 사족 절대 금지.
5. 대기 완료: 파악 완료 시 계획수립 금지, 현재 구조만 설명 후 대기(Wait for user instructions).`;
    } else {
        return `
[SYSTEM RULES]
1. 탐색 단계: 전체 파악 전 설명 일절 금지, 다음 탐색용 [CMD: ...] 명령어만 단답형 제출.
2. 명령 규격:
   - [CMD: read-file "경로"] (파일의 개요/아웃라인(함수/클래스명, JSON 키 목록 등)만 축소 파악)
   - [CMD: read-file-full "경로"] (파일의 실제 전체 본문 코드 및 구체적인 설정값 파악)
   - [CMD: read-file-range "경로" 시작줄-끝줄] (파일 본문의 특정 줄 범위 분석, 최대 2000줄 제한)
   - [CMD: search-file "경로" "검색어"] (파일 내 검색)
   - [CMD: search-all "검색어"] (전역 검색)
3. 탐색 강제: 유저 질문/요청 시 짐작 금지. 관련 핵심 키워드로 [CMD: search-all "검색어"]를 최우선 실행하여 위치를 파악한 뒤, 대상 소스 본문을 [CMD: read-file...]로 직접 읽고 검증하여 답변하십시오. 본문 로직 확인 전에 모른다/없다 선언 절대 금지.
4. 문구 제한: 명령어 제출 시 '코드를 읽어보는게 정확하겠습니다' 등 사족 절대 금지. 오직 '읽어보겠습니다.' 등 짧은 단답 직후 명령어만 표시.
5. 대기 완료: 파악 완료 시 계획수립 금지, 현재 구조만 설명 후 대기(Wait for user instructions).`;
    }
};

function detectAndAskCommand(text) {
    if (!text) return;

    const cmdRegex = /\[(CMD|REQUEST):\s*([^\]]+)\]/gi;
    let match;
    const foundCmds = [];
    while ((match = cmdRegex.exec(text)) !== null) {
        const type = match[1].toUpperCase();
        const cleanCmd = match[2].trim();
        if (cleanCmd) {
            if (cleanCmd === '...' || cleanCmd.includes('...')) continue;
            if (cleanCmd.includes('경로') || cleanCmd.includes('path') || cleanCmd.includes('요청')) continue;
            
            // Filter REQUEST: read-file if dragDropMode is OFF
            if (type === 'REQUEST' && !window.dragDropMode) continue;
            foundCmds.push(cleanCmd);
        }
    }

    if (foundCmds.length === 0) {
        if (window.autoContinueOnRead) {
            const toast = document.getElementById('injection-toast');
            if (toast) toast.style.display = 'none';
            document.getElementById('tab-local-agent')?.click();
        }
        return;
    }

    const readCmds = [];
    const writeCmds = [];
    const searchCmds = [];
    const otherCmds = [];

    foundCmds.forEach(rawCmd => {
        let cmd = rawCmd.replace(/\\"/g, '"')
                        .replace(/\\'/g, "'")
                        .replace(/&quot;/gi, '"')
                        .replace(/&apos;/gi, "'")
                        .replace(/[“”]/g, '"')
                        .replace(/[‘’]/g, "'")
                        .trim();

        if (cmd.startsWith('search-file') || cmd.startsWith('search-all')) {
            // Ignore legacy search commands completely to prevent main thread freezing
            return;
        }

        const fileMatch = cmd.match(/^read-file\s+["']?([^"'\s]+)["']?$/i);
        const fileFullMatch = cmd.match(/^read-file-full\s+["']?([^"'\s]+)["']?$/i);
        const rangeMatch = cmd.match(/^read-file-range\s+["']?([^"']+)["']?\s+(\d+)-(\d+)$/i);
        const writeMatch = cmd.match(/^write-file\s+["']?([^"'\s]+)["']?$/i);

        const fs = require('fs');
        const path = require('path');

        if (rangeMatch) {
            const filePath = rangeMatch[1].trim();
            const targetPath = path.resolve(window.currentPath || process.cwd(), filePath);
            if (fs.existsSync(targetPath)) {
                readCmds.push({ path: filePath, full: false, range: true, start: parseInt(rangeMatch[2]), end: parseInt(rangeMatch[3]) });
                if (typeof window.addFileToRequestedQueue === 'function') window.addFileToRequestedQueue(filePath);
            }
        } else if (fileFullMatch) {
            const filePath = fileFullMatch[1].trim();
            const targetPath = path.resolve(window.currentPath || process.cwd(), filePath);
            if (fs.existsSync(targetPath)) {
                readCmds.push({ path: filePath, full: true });
                if (typeof window.addFileToRequestedQueue === 'function') window.addFileToRequestedQueue(filePath);
            }
        } else if (fileMatch) {
            const filePath = fileMatch[1].trim();
            const targetPath = path.resolve(window.currentPath || process.cwd(), filePath);
            if (fs.existsSync(targetPath)) {
                readCmds.push({ path: filePath, full: false });
                if (typeof window.addFileToRequestedQueue === 'function') window.addFileToRequestedQueue(filePath);
            }
        } else if (writeMatch) {
            const filePath = writeMatch[1].trim();
            const cmdIdx = text.indexOf(rawCmd);
            let codeVal = "";
            if (cmdIdx !== -1) {
                const subText = text.substring(cmdIdx);
                const codeBlockMatch = subText.match(/```[a-zA-Z]*\n([\s\S]*?)\n```/);
                if (codeBlockMatch) codeVal = codeBlockMatch[1];
            }
            writeCmds.push({ path: filePath, code: codeVal });
        } else {
            otherCmds.push(cmd);
        }
    });

    const hasReadFile = (readCmds.length > 0);
    const hasWriteFile = (writeCmds.length > 0);

    if (!hasReadFile && !hasWriteFile && window.autoContinueOnRead) {
        const toast = document.getElementById('injection-toast');
        if (toast) toast.style.display = 'none';
        document.getElementById('tab-local-agent')?.click();
    }

    if (hasReadFile) {
        const displayCmd = readCmds.map(f => {
            if (f.range) return `read-file-range "${f.path}" ${f.start}-${f.end}`;
            return `${f.full ? 'read-file-full' : 'read-file'} "${f.path}"`;
        }).join(', ');
        
        const runRead = async (customCmds) => {
            const activeCmds = customCmds || readCmds;
            const chatOverlay = document.getElementById('local-chat-overlay');
            const progressBox = document.getElementById('overlay-progress-box');
            const projBtn = document.getElementById('btn-send-project-info');
            
            const toast = document.getElementById('injection-toast');
            const projLbl = document.getElementById('project-pct-label');
            const projBar = document.getElementById('toast-project-progress-bar');
            const injectContainer = document.getElementById('toast-inject-container');
            
            if (!window.autoContinueOnRead && chatOverlay && progressBox && projBtn) {
                chatOverlay.style.display = 'flex';
                projBtn.style.display = 'none';
                progressBox.style.display = 'flex';
            }
            
            if (toast) {
                toast.style.display = window.hideUIOverlay ? 'none' : 'flex';
                if (injectContainer) injectContainer.style.display = 'none';
                if (projLbl) projLbl.innerHTML = `Reading files: <span style="color: var(--primary); font-weight: bold;">0/${activeCmds.length}</span>`;
                if (projBar) projBar.style.width = "0%";
            }

            window.currentBatchFileCount = activeCmds.length;

            try {
                const fs = require('fs');
                const path = require('path');
                
                let combinedPayload = "";

                if (window.dragDropMode) {
                    const fileNames = activeCmds.map(f => {
                        const parts = f.path.split(/[\\/]/);
                        return parts[parts.length - 1];
                    }).join(', ');
                    
                    activeCmds.forEach(f => window.readFilesSet.add(f.path));
                    combinedPayload = `I have uploaded the requested file contents: ${fileNames} as attachments. Proceed to analyze them.`;
                } else {
                    for (let i = 0; i < activeCmds.length; i++) {
                        const fileObj = activeCmds[i];
                        const filePath = fileObj.path;
                        window.readFilesSet.add(filePath);
                        
                        let fileContentPayload = "";
                        const targetPath = fileObj.overridePath || path.resolve(window.currentPath, filePath);
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
                                    slicedContent += `\n// ... [TRUNCATED: Max 2000 lines limit per turn reached. If you need to read the next part, please output [CMD: read-file-range "${filePath}" ${nextStart}-${nextEnd}]]`;
                                }
                                fileContentPayload = `[FILE DATA (LINE RANGE ${fileObj.start}-${fileObj.start + (endIdx - startIdx) - 1}): ${filePath}]\n\`\`\`\n${slicedContent}\n\`\`\`\n\n`;
                            } else if (fileObj.full) {
                                let endIdx = allLines.length;
                                let isTruncated = false;
                                
                                if (endIdx > 2000) {
                                    endIdx = 2000;
                                    isTruncated = true;
                                }
                                
                                let slicedContent = allLines.slice(0, endIdx).join('\n');
                                if (isTruncated) {
                                    slicedContent += `\n// ... [TRUNCATED: Max 2000 lines limit per turn reached. If you need to read the next part, please output [CMD: read-file-range "${filePath}" 2001-4000]]`;
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

                        combinedPayload += fileContentPayload;
                        
                        if (typeof window.showInputLoading === 'function') {
                            window.showInputLoading(`Reading files... (${i + 1}/${activeCmds.length})`);
                        }
                        if (projLbl) projLbl.innerHTML = `Reading files: <span style="color: var(--primary); font-weight: bold;">${i + 1}/${activeCmds.length}</span>`;
                        if (projBar) projBar.style.width = `${Math.floor(((i + 1) / activeCmds.length) * 100)}%`;
                        ChatUI.appendBubble('system', `[SYSTEM] Prepared ${filePath} context (${i + 1}/${activeCmds.length}).`);
                        
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
                ChatUI.appendBubble('system', `[SYSTEM] Sent all prepared ${activeCmds.length} files to Web AI.`);
                await injectWebPayload(combinedPayload, activeCmds.length, activeCmds.length, false, true);

                const response = await enginePromise;
                if (response) {
                    if (typeof window.finalizeAiBubble === 'function') {
                        window.finalizeAiBubble(response);
                    }
                    detectAndAskCommand(response);
                }
            } catch (err) {
                ChatUI.appendBubble('system', `[ERROR] Failed to read files batch: ${err.message}`);
            } finally {
                if (typeof window.hideInputLoading === 'function') {
                    window.hideInputLoading();
                }
                if (!window.autoContinueOnRead) {
                    document.getElementById('tab-local-agent')?.click();
                }
                if (!window.autoContinueOnRead && chatOverlay && progressBox && projBtn) {
                    chatOverlay.style.display = 'none';
                    progressBox.style.display = 'none';
                    projBtn.style.display = 'flex';
                }
                const dropZone = document.getElementById('local-drop-zone');
                if (dropZone) dropZone.style.display = 'none';
            }
        };

        if (window.autoContinueOnRead && !window.dragDropMode) {
            runRead();
        } else {
            if (window.dragDropMode) {
                const dropZone = document.getElementById('local-drop-zone');
                if (dropZone) dropZone.style.display = 'none';

                const localInput = document.getElementById('local-agent-input');
                const sendBtn = document.getElementById('send-to-local');
                const inputContainer = document.getElementById('local-input-container');

                if (localInput && inputContainer) {
                    const vLC = document.getElementById('inspector-local-chat');
                    const vBH = document.getElementById('inspector-browser-hub');
                    if (vLC) {
                        vLC.style.height = `calc(100% - 44px - ${window.currentSplitHeight}px)`;
                        vLC.style.zIndex = '150';
                    }
                    
                    if (vBH) {
                        vBH.style.position = 'absolute';
                        vBH.style.top = '0';
                        vBH.style.height = 'calc(100% - 44px)';
                        vBH.style.width = '100%';
                        vBH.style.zIndex = '100';
                        vBH.style.opacity = '1';
                        vBH.style.pointerEvents = 'auto';
                    }

                    const wrapper = inputContainer.firstElementChild;
                    if (wrapper) wrapper.style.display = 'none';

                    inputContainer.dataset.originalHeight = inputContainer.style.height || '';
                    inputContainer.dataset.originalPadding = inputContainer.style.padding || '';
                    inputContainer.dataset.originalBackground = inputContainer.style.background || '';
                    inputContainer.dataset.originalDisplay = inputContainer.style.display || '';
                    inputContainer.dataset.originalAlignItems = inputContainer.style.alignItems || '';
                    inputContainer.dataset.originalJustifyContent = inputContainer.style.justifyContent || '';

                    inputContainer.style.height = '30px';
                    inputContainer.style.padding = '0';
                    inputContainer.style.display = 'flex';
                    inputContainer.style.alignItems = 'center';
                    inputContainer.style.justifyContent = 'center';
                    inputContainer.style.background = 'var(--surface-low)';

                    const fileNames = readCmds.map(f => {
                        const parts = f.path.split(/[\\/]/);
                        return parts[parts.length - 1];
                    }).join(', ');

                    let fileBox = null;
                    if (typeof ChatUI !== 'undefined' && typeof ChatUI.appendBubble === 'function') {
                        fileBox = ChatUI.appendBubble('system', '');
                        const fileBoxContent = fileBox.querySelector('.bubble-content');
                        if (fileBoxContent) {
                            fileBoxContent.innerHTML = `
                                <div style="background: var(--surface-low); padding: 10px 14px; border-radius: 8px; border: 1px solid var(--border-color); font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: var(--text-main); display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                                    <span>Requested: <strong style="color: var(--primary);">${fileNames}</strong></span>
                                </div>
                            `;
                        }
                    }

                    if (!document.getElementById('bounce-arrow-style')) {
                        const styleNode = document.createElement('style');
                        styleNode.id = 'bounce-arrow-style';
                        styleNode.innerHTML = `
                            @keyframes bounce-arrow {
                                0%, 100% { transform: translateY(0); }
                                50% { transform: translateY(5px); }
                            }
                        `;
                        document.head.appendChild(styleNode);
                    }

                    const arrowIndicator = document.createElement('div');
                    arrowIndicator.id = 'drag-drop-arrow-indicator';
                    arrowIndicator.style.cssText = "font-size: 20px; color: var(--primary); font-weight: bold; animation: bounce-arrow 1s infinite; text-align: center; line-height: 1; pointer-events: none;";
                    arrowIndicator.innerText = "↓";

                    const cleanupDragDrop = () => {
                        arrowIndicator.remove();
                        if (fileBox) fileBox.remove();
                        window.activeDragDropCleanup = null;
                        window.activeDragDropContinue = null;
                        
                        if (wrapper) wrapper.style.display = '';
                        
                        inputContainer.style.height = inputContainer.dataset.originalHeight || '';
                        inputContainer.style.padding = inputContainer.dataset.originalPadding || '';
                        inputContainer.style.background = inputContainer.dataset.originalBackground || '';
                        inputContainer.style.display = inputContainer.dataset.originalDisplay || '';
                        inputContainer.style.alignItems = inputContainer.dataset.originalAlignItems || '';
                        inputContainer.style.justifyContent = inputContainer.dataset.originalJustifyContent || '';
                        
                        if (vLC) {
                            vLC.style.height = `calc(100% - 44px - ${window.currentSplitHeight}px)`;
                            vLC.style.zIndex = '150';
                        }
                        if (vBH) {
                            vBH.style.position = 'absolute';
                            vBH.style.top = '0';
                            vBH.style.height = 'calc(100% - 44px)';
                            vBH.style.width = '100%';
                            vBH.style.zIndex = '100';
                            vBH.style.opacity = '1';
                            vBH.style.pointerEvents = 'auto';
                        }
                    };

                    window.activeDragDropCleanup = cleanupDragDrop;
                    window.activeDragDropContinue = async () => {
                        await runRead();
                    };

                    if (typeof window.injectGuestDropInterceptor === 'function') {
                        window.injectGuestDropInterceptor();
                    }

                    inputContainer.appendChild(arrowIndicator);
                }
            } else {
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
                
                content.querySelector('.cmd-run-btn').onclick = async () => {
                    box.remove();
                    const dropZone = document.getElementById('local-drop-zone');
                    if (dropZone) dropZone.style.display = 'none';
                    await runRead();
                };
                content.querySelector('.cmd-cancel-btn').onclick = () => {
                    box.remove();
                    const dropZone = document.getElementById('local-drop-zone');
                    if (dropZone) dropZone.style.display = 'none';
                };
            }
        }
    }

    if (hasWriteFile) {
        const displayCmd = writeCmds.map(f => `write-file "${f.path}"`).join(', ');
        
        const runWrite = async () => {
            await executeWriteFileBatch(writeCmds);
        };

        if (window.autoContinueOnRead) {
            runWrite();
        } else {
            const box = ChatUI.appendBubble('system', '');
            const content = box.querySelector('.bubble-content');
            const themeColor = "#468CF6"; 
            const glowShadow = "rgba(70, 140, 246, 0.15)";

            content.innerHTML = `
                <div style="background: var(--surface-low); padding: 12px 14px; border-radius: 8px; border: 1px solid var(--border-color); font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--text-main); margin-bottom: 12px; line-height: 1.5; word-break: break-all; box-shadow: inset 0 2px 4px rgba(0,0,0,0.15); margin-top: 4px;">
                    <span style="color: var(--primary); font-weight: bold; margin-right: 6px;">✏️</span>${displayCmd}
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="cmd-run-btn" style="flex: 1; background: linear-gradient(135deg, ${themeColor}, ${themeColor}dd); color: white; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 700; font-size: 11.5px; letter-spacing: 0.04em; font-family: 'DM Sans', 'Outfit', sans-serif; transition: all 0.2s; box-shadow: 0 2px 6px ${glowShadow};">CONTINUE</button>
                    <button class="cmd-cancel-btn" style="flex: 1; background: rgba(255, 255, 255, 0.04); color: var(--text-muted); border: 1px solid var(--border-color); padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 11.5px; letter-spacing: 0.04em; font-family: 'DM Sans', 'Outfit', sans-serif; transition: all 0.2s;">CANCEL</button>
                </div>
            `;

            content.querySelector('.cmd-run-btn').onclick = async () => {
                box.remove();
                await runWrite();
            };
            content.querySelector('.cmd-cancel-btn').onclick = () => box.remove();
        }
    }



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
            
            ChatUI.appendBubble('system-info', `Executed: ${cleanCmd}`);
            const payload = `[SYSTEM] Command \`${cleanCmd}\` executed on the local machine. Proceed with the next step.${window.getSystemRulesPrompt()}`;
            
            try {
                const enginePromise = runExperimentalEngine('/marktag', payload, null);
                await injectWebPayload(payload);
                const response = await enginePromise;
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

async function setupBoot() {
    const grid = document.getElementById('agent-hub-grid'), addA = document.getElementById('add-agent-app-card');
    if (!grid || !addA) return;

    window.launchWebAgent = async (appData, isSilentBoot = false) => {
        window.sessionBriefed = false;
        window.briefingInProgress = false;
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
            `);
        });

        if (!isSilentBoot) {
            wv.addEventListener('did-finish-load', async () => {
                if (window.sessionBriefed || window.briefingInProgress) return;
                window.briefingInProgress = true;
                
                const projectTree = await ipcRenderer.invoke('vault-get-tree');
                if (projectTree) {
                    setTimeout(async () => {
                        try {
                            await injectWebPayload("dont think simply answer me 'A'"); await runExperimentalEngine('/marktag', "dont think simply answer me 'A'", null);
                            ChatUI.appendBubble('system', '[SYSTEM] INITIALIZATION COMPLETE.');
                            
                            const startPrompt = window.dragDropMode 
                                ? `이 지침을 숙지했다면 분석을 위해 처음 읽을 핵심 파일(예: package.json, index.html 등 진입점 파일)을 유저에게 드롭해달라고 요청하며 [REQUEST: read-file "실제파일경로"] 형태로 즉시 단답형 답변하십시오. ("파일명"이라는 임시 단어를 그대로 출력하지 마십시오.)` 
                                : `이 지침을 숙지했다면 분석을 위해 처음 읽을 핵심 파일을 [CMD: read-file "실제파일경로"] 형태로 즉시 답변하십시오.`;

                            const briefPayload = `현재 프로젝트 폴더에는 다음 파일들이 있습니다:
${projectTree}
${window.getSystemRulesPrompt()}
${startPrompt}`.trim();

                            window.currentBatchFileCount = -1;
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

        window.formatChatText = (text) => {
            if (!text) return "";
            return text.replace(/\[CMD:\s*([^\]]+)\]/gi, (match, cmdContent) => {
                return `<span class="chat-cmd-badge">CMD: ${cmdContent}</span>`;
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
                    } else {
                        const match = window.requestedFilesQueue.find(x => x.relativePath.split(/[\\/]/).pop().toLowerCase() === droppedName);
                        if (match) {
                            filePath = match.absolutePath;
                        }
                    }
                }
                
                if (filePath) {
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
                        
                        const pendingItems = window.requestedFilesQueue.filter(item => item.status === 'PENDING');
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
                        
                        window.markFileAsCompleted(filePath);
                        if (typeof ChatUI !== 'undefined' && ChatUI.appendBubble) {
                            const chatLog = document.getElementById('local-chat-messages');
                            let lastUserBubble = null;
                            const baseName = pathModule.basename(filePath);
                            
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
                        
                        const stillPending = window.requestedFilesQueue.filter(item => item.status === 'PENDING');
                        if (stillPending.length === 0) {
                            if (window.activeDragDropCleanup) window.activeDragDropCleanup();
                            setTimeout(() => {
                                if (typeof window.triggerGuestSend === 'function') {
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
                                
                                window.requestedFilesQueue = [];
                                if (typeof window.updateDragDropQueueUI === 'function') {
                                    window.updateDragDropQueueUI();
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
                if (userMsg && typeof ChatUI !== 'undefined' && typeof ChatUI.appendBubble === 'function') {
                    ChatUI.appendBubble('user', userMsg);
                    
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

    const addTermBtn = document.getElementById('add-terminal');
    if (addTermBtn) addTermBtn.onclick = () => addSubTerminal();
    window.loadDirectory(window.currentPath);
}

function setupUI() {
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
            if (!_treeCollapsed) {
                window.expandedPaths && window.expandedPaths.clear();
                _treeCollapsed = true;
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
    const cancelReg = document.getElementById('cancel-reg');
    if (cancelReg) cancelReg.onclick = () => { if (mo) mo.style.display = 'none'; };
    const confirmReg = document.getElementById('confirm-reg');
    if (confirmReg) {
        confirmReg.onclick = async () => {
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
                if (idx > -1) apps[idx] = { url: u, input: inSel, send: btnSel, response: resSel };
                delete mo.dataset.editingUrl;
            } else {
                apps.push({ url: u, input: inSel, send: btnSel, response: resSel });
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

    const openDiscoveryBtn = document.getElementById('open-discovery-settings');
    if (openDiscoveryBtn) {
        openDiscoveryBtn.onclick = async () => {
            const saved = (await ipcRenderer.invoke('vault-read-global', 'discovery_keywords.txt')) || defaultKeywords;
            if (dsInput) dsInput.value = saved;
            if (dsModal) dsModal.style.display = 'flex';
        };
    }
    const closeDiscoveryBtn = document.getElementById('close-discovery-settings');
    if (closeDiscoveryBtn) closeDiscoveryBtn.onclick = () => { if (dsModal) dsModal.style.display = 'none'; };
    const saveDiscoveryBtn = document.getElementById('save-discovery-settings');
    if (saveDiscoveryBtn) {
        saveDiscoveryBtn.onclick = () => {
            if (dsInput) {
                ipcRenderer.send('vault-update-global', { fileName: 'discovery_keywords.txt', content: dsInput.value.trim() });
            }
            if (dsModal) dsModal.style.display = 'none';
        };
    }

    const tLA = document.getElementById('tab-local-agent'), tBH = document.getElementById('tab-browser-hub');
    const vLC = document.getElementById('inspector-local-chat'), vBH = document.getElementById('inspector-browser-hub');
    const swi = (m) => {
        if (m === 'local') {
            vLC.style.opacity = '1';
            vLC.style.pointerEvents = 'auto';
            vLC.style.zIndex = '150';
            vLC.style.height = `calc(100% - 44px - ${window.currentSplitHeight}px)`;
            
            vBH.style.position = 'absolute';
            vBH.style.top = '0';
            vBH.style.height = 'calc(100% - 44px)';
            vBH.style.width = '100%';
            vBH.style.zIndex = '100';
            vBH.style.opacity = '1';
            vBH.style.pointerEvents = 'auto';
        } else {
            vLC.style.opacity = '0';
            vLC.style.pointerEvents = 'none';
            vLC.style.zIndex = '100';
            vLC.style.height = 'calc(100% - 44px)';
            
            vBH.style.position = '';
            vBH.style.top = '';
            vBH.style.height = 'calc(100% - 44px)';
            vBH.style.width = '100%';
            vBH.style.zIndex = '150';
            vBH.style.opacity = '1';
            vBH.style.pointerEvents = 'auto';
        }
        tLA.classList.toggle('active-tab', (m === 'local')); tBH.classList.toggle('active-tab', (m !== 'local'));
        if (m === 'local') {
            const chatLog = document.getElementById('local-chat-messages');
            if (chatLog) chatLog.scrollTop = chatLog.scrollHeight;
            if (document.hasFocus()) { const ci = document.getElementById('local-agent-input'); if (ci) setTimeout(() => ci.focus(), 100); }
        }
    };
    window.swi = swi;
    if (tLA) tLA.onclick = () => swi('local'); if (tBH) tBH.onclick = () => swi('browser');

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
            box-shadow: 0 4px 12px rgba(70, 140, 246, 0.2);
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        `;
        projBtn.onmouseenter = () => { projBtn.style.filter = 'brightness(1.1)'; projBtn.style.boxShadow = '0 4px 14px rgba(70, 140, 246, 0.3)'; };
        projBtn.onmouseleave = () => { projBtn.style.filter = 'none'; projBtn.style.boxShadow = '0 4px 12px rgba(70, 140, 246, 0.2)'; };

        projBtn.onclick = async () => {
            if (window.sessionBriefed || window.briefingInProgress) return;
            window.briefingInProgress = true;
            if (typeof window.updateSplitLayoutHeight === 'function') {
                window.updateSplitLayoutHeight(window.pendingSplitHeight || 220);
            }
            projBtn.style.display = 'none';
            
            const tree = await ipcRenderer.invoke('vault-get-tree', window.currentPath);
            window.totalFilesCount = tree.split('\n').filter(line => line.startsWith('- ')).length;
            window.readFilesSet.clear();
            window.userMessageCount = 0;
            
            const startPrompt = window.dragDropMode 
                ? `이 지침을 숙지했다면 분석을 위해 처음 읽을 핵심 파일(예: package.json, index.html 등 진입점 파일)을 유저에게 드롭해달라고 요청하며 [REQUEST: read-file "실제파일경로"] 형태로 즉시 단답형 답변하십시오. ("파일명"이라는 임시 단어를 그대로 출력하지 마십시오.)` 
                : `이 지침을 숙지했다면 분석을 위해 처음 읽을 핵심 파일을 [CMD: read-file "실제파일경로"] 형태로 즉시 답변하십시오.`;
            
            const webPayload = `현재 프로젝트 폴더에는 다음 파일들이 있습니다:
${tree}
${window.getSystemRulesPrompt()}
${startPrompt}`.trim();
            
            window.currentBatchFileCount = -1;
            const enginePromise = runExperimentalEngine('/marktag', webPayload, null);
            try {
                await injectWebPayload(webPayload, -1);
            } catch (err) {
                console.error("Failed to inject project info payload:", err);
            }
            
            chatOverlay.style.display = 'none';
            projBtn.style.display = 'flex';
            
            if (chatIn) chatIn.focus();
            
            try {
                const response = await enginePromise;
                if (response) {
                    if (!window.autoContinueOnRead) {
                        if (typeof window.finalizeAiBubble === 'function') {
                            window.finalizeAiBubble(response);
                        }
                    }
                    detectAndAskCommand(response);
                }
            } catch (err) {
                console.error("Failed to run experimental engine:", err);
            } finally {
                window.sessionBriefed = true;
                window.briefingInProgress = false;
                window.currentBatchFileCount = 0;
                if (!window.autoContinueOnRead) document.getElementById('tab-local-agent')?.click();
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
                    
                    const pendingItems = window.requestedFilesQueue.filter(item => item.status === 'PENDING');
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
                    
                    const stillPending = window.requestedFilesQueue.filter(item => item.status === 'PENDING');
                    if (stillPending.length === 0) {
                        if (window.activeDragDropCleanup) window.activeDragDropCleanup();
                        setTimeout(() => {
                            if (typeof window.triggerGuestSend === 'function') {
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
                            
                            window.requestedFilesQueue = [];
                            if (typeof window.updateDragDropQueueUI === 'function') {
                                window.updateDragDropQueueUI();
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
        const res = await ipcRenderer.invoke('vault-init'); this.activeLogPath = res.activeLogPath;
        console.log("[Vault] Log System Initialized:", this.activeLogPath);
    },
    log(role, text) { if (this.activeLogPath) ipcRenderer.send('vault-log', { logPath: this.activeLogPath, role, text }); }
};

async function migrateToVault() {
    const appsStr = localStorage.getItem('pormsg_agent_apps') || localStorage.getItem('vapor_agent_apps');
    if (appsStr && appsStr !== '[]') { const currentRegistry = await ipcRenderer.invoke('vault-read-global', 'registry.json'); if (!currentRegistry) ipcRenderer.send('vault-update-global', { fileName: 'registry.json', content: appsStr }); }
    const kwStr = localStorage.getItem('pormsg_discovery_keywords') || localStorage.getItem('vapor_discovery_keywords');
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
            if (typeof window.swi === 'function') window.swi('local');
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
