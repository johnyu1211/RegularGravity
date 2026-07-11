// SECTION 3: WEBVIEW INTERACTION & GUEST INJECTION
// =========================================================================
window.triggerGuestSend = function() {
    window.isHostSending = true;
    setTimeout(() => { window.isHostSending = false; }, 2000);
    const wv = document.getElementById('active-agent-webview');
    if (!wv) return;
    
    wv.focus();
    
    const expectedCount = window.requestedFilesQueue ? window.requestedFilesQueue.length : 0;
    const inKeywordsJson = JSON.stringify(window.chatKeywords || [
        "prompt", "chat", "message", "write", "ask", "질문", "메시지", "물어보기", "물어보세요",
        "type", "conversation", "input", "command", "send", "say", "help you today", "도와드릴까요",
        "무엇을", "enter", "text", "입력", "쓰기"
    ]);
    
    const clickScript = `
        (async () => {
            const findInput = () => {
                const inKeywords = ${inKeywordsJson};
                const isVisible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
                const mainCandidates = Array.from(document.querySelectorAll('textarea, div[contenteditable="true"], [role="textbox"]')).filter(el => isVisible(el));
                
                // 1. Keyword search (placeholder, aria-label, title, innerText)
                for (let el of mainCandidates) {
                    const placeholder = (el.placeholder || el.getAttribute('placeholder') || '').toLowerCase();
                    const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
                    const title = (el.title || '').toLowerCase();
                    const text = (el.innerText || '').toLowerCase();
                    
                    const combined = placeholder + ' ' + ariaLabel + ' ' + title + ' ' + text;
                    if (inKeywords.some(k => combined.includes(k))) return el;
                }
                
                // 2. Fallback to bottom-most input (since chat bars are always at the bottom)
                if (mainCandidates.length > 0) {
                    let best = mainCandidates[0];
                    let maxBottom = -1;
                    for (let el of mainCandidates) {
                        const rect = el.getBoundingClientRect();
                        if (rect.bottom > maxBottom) {
                            maxBottom = rect.bottom;
                            best = el;
                        }
                    }
                    return best;
                }
                return null;
            };

            const input = findInput();
            if (!input) return false;

            const waitForUpload = async (expected) => {
                return new Promise((resolve) => {
                    let attempts = 0;
                    const inputContainer = input.closest('form, [class*="input"], [class*="container"]') || input.parentElement || document;
                    const interval = setInterval(() => {
                        attempts++;
                        const previews = inputContainer.querySelectorAll('ms-attachment-preview');
                        const hasPreviewsAppeared = previews.length >= expected || attempts > 15;
                        const isUploading = !!inputContainer.querySelector('ms-attachment-preview mat-progress-bar, ms-attachment-preview [role="progressbar"], ms-attachment-preview [class*="progress"], ms-attachment-preview [class*="spinner"], ms-attachment-preview .loading, ms-attachment-preview .uploading');
                        
                        if (hasPreviewsAppeared && !isUploading) {
                            clearInterval(interval);
                            resolve(true);
                        }
                        if (attempts > 300) { 
                            clearInterval(interval);
                            resolve(false);
                        }
                    }, 100);
                });
            };

            await waitForUpload(${expectedCount});

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
    if (!listEl) return;
    
    const warningEl = document.getElementById('drag-drop-queue-warning');
    if (warningEl) {
        if (window.dragDropAbortMessage) {
            warningEl.innerHTML = window.dragDropAbortMessage;
            warningEl.style.color = '#ff4444';
        } else {
            warningEl.innerHTML = `⚠️ 자동 업로드 진행 중에는 마우스를 움직이지 마세요.`;
            warningEl.style.color = `var(--error)`;
        }
    }
    
    // Toggle container display based on dragDropMode and presence of items in the queue
    const hasItems = window.requestedFilesQueue.length > 0;
    if (containerEl) {
        if (window.dragDropMode && hasItems) {
            containerEl.style.display = 'flex';
            window.toggleBackdropBlur(true);
            if (typeof window.setCoverLifted === 'function') {
                window.setCoverLifted(true);
            }
        } else {
            containerEl.style.display = 'none';
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
        itemEl.setAttribute('draggable', 'true'); // Always draggable as requested
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
                if (!window.autoClickingQueue) {
                    e.preventDefault(); // Prevent default HTML5 element drag to avoid file attachment failure
                    console.log("[DragDrop] Manual drag initiated for:", item.absolutePath);
                    ipcRenderer.send('ondragstart', item.absolutePath);
                } else {
                    e.preventDefault(); // Block Electron native drag when simulation is active
                }
            };
            itemEl.onclick = async () => {
                const isFocused = await ipcRenderer.invoke('is-window-focused');
                if (!isFocused) {
                    console.log("[DragSim] Aborted drag simulation: window is in the background.");
                    return;
                }
                
                try {
                    const filePath = item.absolutePath;
                    window.currentlyDraggedFilePath = filePath;
                    const filename = path.basename(filePath);
                    
                    const wv = document.getElementById('active-agent-webview');
                    if (!wv) return;
                    
                    itemEl.scrollIntoView({ block: 'center', inline: 'nearest' });
                    await new Promise(r => setTimeout(r, 60)); // Settle scroll quickly in 60ms
                    
                    const bounds = await ipcRenderer.invoke('get-content-bounds');
                    if (!bounds || bounds.width === 0 || bounds.height === 0) {
                        console.log("[DragSim] Aborted: Invalid window bounds.");
                        return;
                    }
                    
                    const rect = itemEl.getBoundingClientRect();
                    if (rect.width === 0 || rect.height === 0) {
                        console.log("[DragSim] Aborted: Element is hidden.");
                        return;
                    }
                    
                    const wvRect = wv.getBoundingClientRect();
                    if (wvRect.width === 0 || wvRect.height === 0) {
                        console.log("[DragSim] Aborted: Webview is hidden.");
                        return;
                    }
                    
                    // Coordinates calculation
                    const startX = Math.round(bounds.x + rect.left + rect.width / 2);
                    const startY = Math.round(bounds.y + rect.top + rect.height / 2 - 4);
                    const endX = Math.round(bounds.x + wvRect.left + wvRect.width / 2);
                    const endY = Math.round(bounds.y + wvRect.top + wvRect.height - 90);
                    
                    // Fetch original physical mouse cursor position
                    let returnX = startX;
                    let returnY = startY;
                    try {
                        const cursor = await ipcRenderer.invoke('get-cursor-position');
                        if (cursor) {
                            returnX = Math.round(cursor.x);
                            returnY = Math.round(cursor.y);
                        }
                    } catch (e) {
                        console.error("Failed to get cursor coordinates:", e);
                    }
                    
                    console.log("[DragSim] Launching C# drag_sim.exe:", { startX, startY, endX, endY, returnX, returnY });
                    ChatUI.appendBubble('system', `[SYSTEM] Dragging and dropping ${filename}...`);
                    
                    // Explicitly lift cover before drag sim starts to keep workspace exposed
                    if (typeof window.setCoverLifted === 'function') {
                        window.setCoverLifted(true);
                    }
                    
                    const { execFile } = require('child_process');
                    const exePath = path.join(process.cwd(), 'src', 'js', 'drag_sim.exe');
                    
                    execFile(exePath, [
                        startX.toString(), 
                        startY.toString(), 
                        endX.toString(), 
                        endY.toString(), 
                        returnX.toString(), 
                        returnY.toString()
                    ], (err) => {
                        if (err) {
                            console.error("[DragSim] Run failed:", err);
                        }
                        
                        // Safely re-lower cover 1000ms after the C# simulator process fully terminates
                        setTimeout(() => {
                            if (typeof window.setCoverLifted === 'function') {
                                window.setCoverLifted(false);
                            }
                        }, 1000);
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

window.dragDropAttemptCounts = {};
window.autoClickingQueue = false;
window.autoClickPendingQueueItems = async function() {
    if (window.autoClickingQueue) return;
    if (window.autoClickSuspended) return;
    if (!window.autoDragging) {
        console.log("[AutoClick] Auto-dragging is disabled. Skipping auto-clicks.");
        return;
    }
    const modal = document.getElementById('local-settings-modal');
    if (modal && modal.style.display === 'flex') {
        console.log("[AutoClick] Paused: Settings modal is open.");
        return;
    }
    
    // Check if any item is already UPLOADING
    const uploading = window.requestedFilesQueue.find(item => item.status === 'UPLOADING');
    if (uploading) {
        console.log("[AutoClick] Upload already in progress for:", uploading.relativePath);
        return;
    }
    
    // Find the first PENDING item
    const pendingItems = window.requestedFilesQueue.filter(item => item.status === 'PENDING');
    if (pendingItems.length === 0) return;
    
    const item = pendingItems[0];
    const listEl = document.getElementById('drag-drop-queue-list');
    if (!listEl) return;
    
    const itemEls = listEl.querySelectorAll('.queue-item');
    let targetEl = null;
    for (const el of itemEls) {
        if (el.getAttribute('data-filepath') === item.absolutePath) {
            targetEl = el;
            break;
        }
    }
    
    if (targetEl && targetEl.onclick) {
        window.autoClickingQueue = true;
        try {
            const isFocused = await ipcRenderer.invoke('is-window-focused');
            if (!isFocused) {
                console.log("[AutoClick] Window is not focused. Postponing click.");
                await new Promise(resolve => setTimeout(resolve, 1000));
                window.autoClickingQueue = false;
                if (typeof window.updateDragDropQueueUI === 'function') {
                    window.updateDragDropQueueUI();
                }
                return;
            }
            
            const key = item.absolutePath;
            window.dragDropAttemptCounts[key] = (window.dragDropAttemptCounts[key] || 0) + 1;
            
            const warningEl = document.getElementById('drag-drop-queue-warning');
            if (warningEl) {
                warningEl.innerHTML = `⏳ 자동 업로드 진행 중 (${item.relativePath} 시도 ${window.dragDropAttemptCounts[key]}/3)...`;
            }
            
            if (window.dragDropAttemptCounts[key] > 3) {
                console.log(`[AutoClick] Aborted: Item "${item.relativePath}" failed 3 consecutive upload attempts.`);
                window.autoClickSuspended = true;
                window.dragDropAbortMessage = `❌ 실패 3회 초과로 자동 드래그 중단: ${item.relativePath} (클릭하여 수동 진행)`;
                
                window.autoClickingQueue = false;
                if (typeof window.updateDragDropQueueUI === 'function') {
                    window.updateDragDropQueueUI();
                }
                return;
            }
            
            item.status = 'UPLOADING';
            
            const currentKey = key;
            setTimeout(() => {
                const checkItem = window.requestedFilesQueue.find(x => x.absolutePath === currentKey);
                if (checkItem && checkItem.status === 'UPLOADING') {
                    console.log(`[AutoClick] Timeout reached for ${checkItem.relativePath}. Resetting to PENDING.`);
                    checkItem.status = 'PENDING';
                    if (typeof window.updateDragDropQueueUI === 'function') {
                        window.updateDragDropQueueUI();
                    }
                }
            }, 1600); // 1600ms backup timeout is enough for optimized sim, enabling fast retries
 
            console.log("[AutoClick] Clicking queue item:", item.relativePath);
            await targetEl.onclick();
            
            // Wait for drag simulation to fully complete before updating UI and releasing lock
            await new Promise(resolve => setTimeout(resolve, 600)); // 600ms settle time is enough for optimized sim
        } catch (err) {
            console.error("[AutoClick] Error in queue auto-clicker:", err);
        } finally {
            window.autoClickingQueue = false;
            if (typeof window.updateDragDropQueueUI === 'function') {
                window.updateDragDropQueueUI();
            }
        }
    }
};

// =========================================================================