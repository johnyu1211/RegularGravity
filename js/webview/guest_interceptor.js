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
