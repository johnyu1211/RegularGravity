if (typeof ipcRenderer === 'undefined') { var { ipcRenderer } = require('electron'); }

async function injectWebPayload(webPayload, fileCount = 0, currentFileIndex = 0, isAppend = false, clickSend = true) {
    const savedKeywords = (await ipcRenderer.invoke('vault-read-global', 'discovery_keywords.txt')) || 'message, ask, prompt, type, question, conversation, input, chat, command, send, help you today, search, write, say';
    const inKeywords = savedKeywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k);

    return new Promise((resolve, reject) => {
        const wv = document.getElementById('active-agent-webview'); if (!wv) return reject("Webview not found");
        const cleanPayload = webPayload.trim();

        // 1단계: 클립보드 백업 및 주입 데이터 복사 (줄바꿈/이스케이프 깨짐 완전 우회)
        const { clipboard } = require('electron');
        const oldClipboardText = clipboard.readText();
        clipboard.writeText(cleanPayload);

        // 2단계: 토스트 UI 켜기
        const toast = document.getElementById('injection-toast');
        if (toast) {
            toast.style.display = window.hideUIOverlay ? 'none' : 'flex';
        }

        // 3단계: 웹뷰 내부 입력 포커싱 및 초기화
        const focusScript = `
            (() => {
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
                } else {
                    setCursorToEnd(inputEl);
                }
                return "SUCCESS";
            })()
        `;

        wv.focus();
        wv.executeJavaScript(focusScript).then(async (status) => {
            if (status !== "SUCCESS") {
                clipboard.writeText(oldClipboardText);
                if (toast) toast.style.display = 'none';
                return reject("Input field not found: " + status);
            }

            // 4단계: 딜레이 후 클립보드 붙여넣기 (Paste) 실행 (가장 안전하고 빠름)
            await new Promise(r => setTimeout(r, 150));
            wv.focus();
            wv.paste();

            // 사용자의 원래 클립보드 내용 원상복구
            await new Promise(r => setTimeout(r, 100));
            clipboard.writeText(oldClipboardText);

            if (!clickSend) {
                if (toast) toast.style.display = 'none';
                return resolve(true);
            }

            // 5단계: 짧은 대기 후 전송 버튼 클릭
            await new Promise(r => setTimeout(r, 200));
            const clickScript = `
                (() => {
                    const findSendBtn = () => {
                        const btns = Array.from(document.querySelectorAll('button, div[role="button"], span[role="button"]'));
                        for (let el of btns) {
                            const label = (el.getAttribute('aria-label') || el.title || el.innerText || '').toLowerCase();
                            if (label.includes('전송') || label.includes('send') || label.includes('submit')) return el;
                        }
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
                    let clicked = false;
                    if (sendBtn) {
                        sendBtn.click();
                        clicked = true;
                    } else {
                        const input = document.querySelector('textarea, input[type="text"], div[contenteditable="true"]');
                        if (input) {
                            const enterEvt = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13 });
                            input.dispatchEvent(enterEvt);
                            clicked = true;
                        }
                    }
                    return clicked;
                })()
            `;

            await wv.executeJavaScript(clickScript).catch(() => false);

            // 6단계: 발송 완료 대기 (최대 3.5초 폴링)
            for (let i = 0; i < 35; i++) {
                const isCleared = await wv.executeJavaScript(`(() => { const i = document.querySelector('textarea, input[type="text"], [contenteditable="true"]'); return i ? (i.value === "" && i.innerText.trim() === "") : true; })()`).catch(() => false);
                const hasStopBtn = await wv.executeJavaScript(`(() => { return Array.from(document.querySelectorAll('button, div[role="button"]')).some(el => { const lbl = (el.getAttribute('aria-label') || el.title || el.innerText || '').toLowerCase(); return lbl.includes('중단') || lbl.includes('stop') || lbl.includes('cancel'); }); })()`).catch(() => false);
                if (isCleared || hasStopBtn) {
                    break;
                }
                await new Promise(r => setTimeout(r, 100));
            }

            if (toast) toast.style.display = 'none';
            resolve(true);
        }).catch(err => {
            clipboard.writeText(oldClipboardText);
            if (toast) toast.style.display = 'none';
            reject(err);
        });
    });
}
