if (typeof ipcRenderer === 'undefined') { var { ipcRenderer } = require('electron'); }

async function injectWebPayload(webPayload, fileCount = 0, currentFileIndex = 0, isAppend = false, clickSend = true) {
    window.isHostSending = true;
    const savedKeywords = (await ipcRenderer.invoke('vault-read-global', 'discovery_keywords.txt')) || 'message, ask, prompt, type, question, conversation, input, chat, command, send, help you today, search, write, say';
    const inKeywords = savedKeywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k);

    return new Promise((resolve, reject) => {
        const wv = document.getElementById('active-agent-webview'); if (!wv) {
            window.isHostSending = false;
            return reject("Webview not found");
        }
        const cleanPayload = webPayload.trim();
        const base64Payload = Buffer.from(cleanPayload, 'utf-8').toString('base64');
        const totalLines = cleanPayload.split('\n').length; // 전체 라인수 산출

        if (fileCount !== 0 && fileCount !== -1) {
            if (typeof ChatUI !== 'undefined' && typeof ChatUI.appendBubble === 'function') {
                ChatUI.appendBubble('system-info', 'Sending Information to WebAI...');
            }
        }

        // 1단계: 토스트 UI 켜기 및 진행바를 테마색으로 설정
        const toast = document.getElementById('injection-toast');
        const projLbl = document.getElementById('project-pct-label');
        const projBar = document.getElementById('toast-project-progress-bar');
        const injLbl = document.getElementById('inject-pct-label');
        const injBar = document.getElementById('toast-inject-progress-bar');
        const injectContainer = document.getElementById('toast-inject-container');
        
        if (toast) {
            toast.style.display = window.hideUIOverlay ? 'none' : 'flex';
            toast.style.background = 'transparent';
            toast.style.border = 'none';
            
            if (injectContainer) {
                if (fileCount === -1 || fileCount > 0) {
                    injectContainer.style.display = 'flex';
                } else {
                    injectContainer.style.display = 'none';
                }
            }
            
            if (projLbl) {
                if (fileCount === -1) {
                    const readCount = window.readFilesSet ? window.readFilesSet.size : 0;
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
                    const readCount = window.readFilesSet ? window.readFilesSet.size : 0;
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
            
            if (typeof window.showInputLoading === 'function') {
                window.showInputLoading("Injecting...");
            }
        }

        // 2단계: 웹뷰 내부 단일 동기식 청크 주입 스크립트 실행 (중간 렌더러 스레드 양보가 없어 커서 튐/텍스트 깨짐 100% 차단)
        const onConsole = (e) => {
            if (e.message.startsWith('[INJECT_PCT]:')) {
                const parts = e.message.split(':')[1].split(',');
                const pct = parseInt(parts[0]);
                const curLines = parseInt(parts[1] || '0');
                const totLines = parseInt(parts[2] || '0');
                
                if (projLbl && projBar) {
                    if (fileCount === -1) {
                        const readCount = window.readFilesSet ? window.readFilesSet.size : 0;
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
                
                if (typeof window.showInputLoading === 'function') {
                    window.showInputLoading(`Injecting... (${pct}%)`);
                }
            }
        };
        wv.addEventListener('console-message', onConsole);

        const cleanup = () => {
            window.isHostSending = false;
            wv.executeJavaScript("window.isHostSending = false;").catch(() => {});
            wv.removeEventListener('console-message', onConsole);
            if (toast && !window.autoContinueOnRead) toast.style.display = 'none';
        };

        const injectionScript = `
            (() => {
                window.isHostSending = true;
                try {
                    const inKeywords = ${JSON.stringify(inKeywords)};
                    const findInput = () => {
                        const isVisible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
                        const mainCandidates = Array.from(document.querySelectorAll('textarea, div[contenteditable="true"], [role="textbox"]')).filter(el => isVisible(el));
                        for (let el of mainCandidates) {
                            const text = (el.placeholder || el.getAttribute('aria-label') || el.title || el.innerText || '').toLowerCase();
                            if (inKeywords.some(k => text.includes(k))) return el;
                        }
                        if (mainCandidates.length > 0) return mainCandidates[0];

                        const fallbackCandidates = Array.from(document.querySelectorAll('input[type="text"]')).filter(el => isVisible(el));
                        for (let el of fallbackCandidates) {
                            const text = (el.placeholder || el.getAttribute('aria-label') || el.title || el.innerText || '').toLowerCase();
                            if (inKeywords.some(k => text.includes(k))) return el;
                        }
                        return fallbackCandidates[0] || null;
                    };
                    
                    const inputEl = findInput();
                    if (!inputEl) {
                        console.log("[GuestInject] Error: input element not found!");
                        return "INPUT_NOT_FOUND";
                    }
                    console.log("[GuestInject] Found element: " + inputEl.tagName + ", class: " + inputEl.className + ", id: " + inputEl.id + ", placeholder: " + inputEl.placeholder);
                    
                    inputEl.focus();

                    const setCursorToEnd = (el) => {
                        el.focus();
                        if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
                            el.selectionStart = el.selectionEnd = el.value.length;
                        } else {
                            const getLastTextNode = (node) => {
                                if (node.nodeType === 3) return node;
                                for (let i = node.childNodes.length - 1; i >= 0; i--) {
                                    const child = node.childNodes[i];
                                    const textNode = getLastTextNode(child);
                                    if (textNode) return textNode;
                                }
                                return null;
                            };
                            const lastTextNode = getLastTextNode(el);
                            const range = document.createRange();
                            const selection = window.getSelection();
                            if (selection) {
                                if (lastTextNode) {
                                    range.setStart(lastTextNode, lastTextNode.length);
                                    range.setEnd(lastTextNode, lastTextNode.length);
                                } else {
                                    range.selectNodeContents(el);
                                    range.collapse(false);
                                }
                                selection.removeAllRanges();
                                selection.addRange(range);
                            }
                        }
                    };
                    
                    if (!${isAppend}) {
                        if (inputEl.tagName === 'TEXTAREA' || inputEl.tagName === 'INPUT') {
                            inputEl.value = '';
                        } else {
                            inputEl.innerText = '';
                        }
                    }
                    setCursorToEnd(inputEl);

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
                    
                    if (inputEl.tagName === 'TEXTAREA' || inputEl.tagName === 'INPUT') {
                        const proto = inputEl.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
                        const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
                        const newText = ${isAppend} ? inputEl.value + decodedPayload : decodedPayload;
                        setter.call(inputEl, newText);
                    } else {
                        const escapeHtml = (text) => {
                            return text
                                .replace(/&/g, "&amp;")
                                .replace(/</g, "&lt;")
                                .replace(/>/g, "&gt;")
                                .replace(/"/g, "&quot;")
                                .replace(/'/g, "&#039;")
                                .replace(/\n/g, "<br>");
                        };
                        const htmlText = escapeHtml(decodedPayload);
                        try {
                            console.log("[GuestInject] Executing insertHTML...");
                            document.execCommand('insertHTML', false, htmlText);
                            console.log("[GuestInject] execCommand complete. InnerText: " + inputEl.innerText.substring(0, 100));
                        } catch (cmdErr) {
                            console.log("[GuestInject] execCommand failed, falling back to innerText. Error: " + cmdErr.message);
                            inputEl.innerText = decodedPayload;
                        }
                    }
                    
                    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    return "SUCCESS";
                } catch (err) {
                    return "ERROR: " + err.message + "\\n" + err.stack;
                }
            })()
        `;

        wv.focus();
        wv.executeJavaScript(injectionScript).then(async (status) => {
            if (status !== "SUCCESS") {
                const toastLabel = document.getElementById('project-pct-label');
                if (toastLabel) toastLabel.innerText = "Error: " + status;
                setTimeout(cleanup, 3000);
                return reject("Input failed: " + status);
            }

            if (injLbl) injLbl.innerHTML = `Injecting: <span style="color: var(--primary); font-weight: bold;">100% (${totalLines}/${totalLines})</span>`;
            if (injBar) injBar.style.width = "100%";

            if (!clickSend) {
                if (toast) toast.style.display = 'none';
                return resolve(true);
            }

            // 3단계: 짧은 대기 후 전송 버튼 클릭
            await new Promise(r => setTimeout(r, 1200));
            const clickScript = `
                (async () => {
                    const findInput = () => {
                        const inKeywords = ${JSON.stringify(inKeywords)};
                        const isVisible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
                        const mainCandidates = Array.from(document.querySelectorAll('textarea, div[contenteditable="true"], [role="textbox"]')).filter(el => isVisible(el));
                        for (let el of mainCandidates) {
                            const text = (el.placeholder || el.getAttribute('aria-label') || el.title || el.innerText || '').toLowerCase();
                            if (inKeywords.some(k => text.includes(k))) return el;
                        }
                        if (mainCandidates.length > 0) return mainCandidates[0];

                        const fallbackCandidates = Array.from(document.querySelectorAll('input[type="text"]')).filter(el => isVisible(el));
                        for (let el of fallbackCandidates) {
                            const text = (el.placeholder || el.getAttribute('aria-label') || el.title || el.innerText || '').toLowerCase();
                            if (inKeywords.some(k => text.includes(k))) return el;
                        }
                        return fallbackCandidates[0] || null;
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

                    // Dispatch Enter 1
                    dispatchEnter(input);

                    // Wait 1000ms
                    await new Promise(r => setTimeout(r, 1000));

                    // Dispatch Enter 2
                    dispatchEnter(input);

                    return true;
                })()
            `;

            await wv.executeJavaScript(clickScript).catch(() => false);

            // 4단계: 발송 완료 대기 (최대 3.5초 폴링)
            for (let i = 0; i < 35; i++) {
                const isCleared = await wv.executeJavaScript(`(() => { const i = document.querySelector('textarea, input[type="text"], [contenteditable="true"]'); return i ? (i.value === "" && i.innerText.trim() === "") : true; })()`).catch(() => false);
                const hasStopBtn = await wv.executeJavaScript(`(() => { return Array.from(document.querySelectorAll('button, div[role="button"]')).some(el => { const lbl = (el.getAttribute('aria-label') || el.title || el.innerText || '').toLowerCase(); return lbl.includes('중단') || lbl.includes('stop') || lbl.includes('cancel'); }); })()`).catch(() => false);
                if (isCleared || hasStopBtn) {
                    break;
                }
                await new Promise(r => setTimeout(r, 100));
            }

            if (toast) toast.style.display = 'none';
            cleanup();
            resolve(true);
        }).catch(err => {
            cleanup();
            reject(err);
        });
    });
}
