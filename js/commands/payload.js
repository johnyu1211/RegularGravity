async function injectWebPayload(webPayload, fileCount = 0, currentFileIndex = 0, isAppend = false, clickSend = true) {
    const savedKeywords = (await ipcRenderer.invoke('vault-read-global', 'discovery_keywords.txt')) || 'message, ask, prompt, type, question, conversation, input, chat, command, send, help you today, search, write, say';
    const inKeywords = savedKeywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k);

    return new Promise((resolve, reject) => {
        const wv = document.getElementById('active-agent-webview'); if (!wv) return reject("Webview not found");
        const cleanPayload = webPayload.trim();
        const base64Payload = Buffer.from(cleanPayload, 'utf-8').toString('base64');
        const totalLines = cleanPayload.split('\n').length; // 전체 라인수 산출

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
                    const readCount = window.readFilesSet.size;
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
                    const readCount = window.readFilesSet.size;
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
        }

        // 2단계: 웹뷰 콘솔 리스너 장착 (진행률 실시간 고속 수신용)
        const onConsole = (e) => {
            if (e.message.startsWith('[INJECT_PCT]:')) {
                const parts = e.message.split(':')[1].split(',');
                const pct = parseInt(parts[0]);
                const curLines = parseInt(parts[1] || '0');
                const totLines = parseInt(parts[2] || '0');
                
                if (projLbl && projBar) {
                    if (fileCount === -1) {
                        const readCount = window.readFilesSet.size;
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
            }
        };
        wv.addEventListener('console-message', onConsole);

        const cleanup = () => {
            wv.removeEventListener('console-message', onConsole);
            if (toast && !window.autoContinueOnRead) toast.style.display = 'none';
        };

        // 3단계: 단 1회의 executeJavaScript 호출로 웹뷰 내부 비동기 타이핑 실행 (IPC 병목 100% 제거)
        const injectionScript = `
            (async () => {
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
                
                if (!${isAppend}) {
                    if (inputEl.tagName === 'TEXTAREA' || inputEl.tagName === 'INPUT') {
                        inputEl.value = '';
                    } else {
                        inputEl.innerText = '';
                    }
                } else {
                    if (inputEl.tagName === 'TEXTAREA' || inputEl.tagName === 'INPUT') {
                        inputEl.selectionStart = inputEl.selectionEnd = inputEl.value.length;
                    } else {
                        const range = document.createRange();
                        range.selectNodeContents(inputEl);
                        range.collapse(false);
                        const selection = window.getSelection();
                        if (selection) {
                            selection.removeAllRanges();
                            selection.addRange(range);
                        }
                    }
                }
                
                // Base64 디코딩 (안전성 100%)
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
                
                // 100ms 포커스 대기
                await new Promise(r => setTimeout(r, 100));
                
                // 메시지 라인 분할 및 30라인 단위의 고속 청크 쪼개기 (React 버퍼 오버헤드 차단)
                const lines = decodedPayload.split('\\n');
                const chunkSize = 30;
                const chunks = [];
                for (let idx = 0; idx < lines.length; idx += chunkSize) {
                    chunks.push(lines.slice(idx, idx + chunkSize).join('\\n') + (idx + chunkSize < lines.length ? '\\n' : ''));
                }

                let currentLine = 0;
                for (let idx = 0; idx < chunks.length; idx++) {
                    const chunk = chunks[idx];
                    document.execCommand('insertText', false, chunk);
                    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    const chunkLines = chunk.split('\\n').length - 1;
                    currentLine += chunkLines;
                    const pct = Math.floor(((idx + 1) / chunks.length) * 100);
                    console.log("[INJECT_PCT]:" + pct + "," + currentLine + ",${totalLines}");
                    
                    // 15ms 미세 딜레이를 주어 브라우저가 버퍼를 렌더링하고 렌더러가 실시간 게이지를 갱신할 틈을 줌
                    await new Promise(r => setTimeout(r, 15));
                }
                
                if (!${clickSend}) {
                    return "SUCCESS";
                }

                // 주입 후 짧은 텀을 주고 엔터 전송 및 전송 버튼 강제 클릭 시도
                await new Promise(r => setTimeout(r, 150));
                
                const findSendBtn = () => {
                    const btns = Array.from(document.querySelectorAll('button, div[role="button"], span[role="button"]'));
                    for (let el of btns) {
                        const label = (el.getAttribute('aria-label') || el.title || el.innerText || '').toLowerCase();
                        if (label.includes('전송') || label.includes('send') || label.includes('submit')) return el;
                    }
                    // 날개 비행기 SVG 아이콘을 품은 버튼 후보 탐색
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
                if (sendBtn) {
                    sendBtn.click();
                } else {
                    const enterDown = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13 });
                    inputEl.dispatchEvent(enterDown);
                    const enterPress = new KeyboardEvent('keypress', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13 });
                    inputEl.dispatchEvent(enterPress);
                    const enterUp = new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13 });
                    inputEl.dispatchEvent(enterUp);
                }
                
                // 발송 성공 검증부 (입력창 텍스트가 완전히 비워지거나 정지 버튼이 생길 때까지 최대 3.5초 폴링 대기)
                let isDispatched = false;
                for (let i = 0; i < 35; i++) {
                    const currentVal = (inputEl.tagName === 'TEXTAREA' || inputEl.tagName === 'INPUT') ? inputEl.value : inputEl.innerText;
                    const hasStopBtn = Array.from(document.querySelectorAll('button, div[role="button"]')).some(el => {
                        const lbl = (el.getAttribute('aria-label') || el.title || el.innerText || '').toLowerCase();
                        return lbl.includes('중단') || lbl.includes('stop') || lbl.includes('cancel');
                    });
                    if (!currentVal.trim() || hasStopBtn) {
                        isDispatched = true;
                        break;
                    }
                    if (i === 10 || i === 20) {
                        if (sendBtn) sendBtn.click();
                    }
                    await new Promise(r => setTimeout(r, 100));
                }
                if (!isDispatched) return "SEND_TIMEOUT";
                
                return "SUCCESS";
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

            if (clickSend) {
                // 전송 처리 확인 대기 및 종료
                await new Promise(r => setTimeout(r, 1500));
            }
            cleanup();
            resolve(true);
        }).catch(err => {
            cleanup();
            reject(err);
        });
    });
}
