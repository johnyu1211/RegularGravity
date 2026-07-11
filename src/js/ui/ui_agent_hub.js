// SECTION 7: USER INTERFACE INITIALIZATION & COMPONENT BUILDERS
// =========================================================================
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
                    }, 200);
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
            `);
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
                if (window.dragDropMode) return;
                if (window.sessionBriefed || window.briefingInProgress) return;
                window.briefingInProgress = true;
                
                if (typeof window.getLatestWebAiText === 'function') {
                    window.lastProcessedAiResponse = await window.getLatestWebAiText();
                    console.log("[Boot] Initialized lastProcessedAiResponse:", window.lastProcessedAiResponse);
                }
                
                const projectTree = await ipcRenderer.invoke('vault-get-tree');
                if (projectTree) {
                    setTimeout(async () => {
                        try {
                            await injectWebPayload("dont think simply answer me 'A'"); await runExperimentalEngine('/marktag', "dont think simply answer me 'A'", null);
                            ChatUI.appendBubble('system', '[SYSTEM] INITIALIZATION COMPLETE.');
                            
                            const isEmpty = !projectTree || projectTree.trim() === '' || !projectTree.includes('- ');
                            let startPrompt = "";
                            let mapContent = "";
                            
                            if (window.autoUpdateMap && window.projectRoot && typeof window.checkProjectMapExists === 'function' && !window.checkProjectMapExists()) {
                                const projectName = path.basename(window.projectRoot);
                                startPrompt = `이 지침을 숙지했다면, 분석 시작 전 프로젝트를 기록하기 위해 먼저 프로젝트 지도(Map)를 생성해야 합니다. 다른 사족 없이 [CMD: write-file "${projectName}_Map.md"] 와 아래 마크다운 템플릿 구조를 활용하여 즉시 지도를 작성하십시오:
# Project Map: ${projectName}

## Directory & File Layout
\`\`\`
[여기에 전체 폴더/파일 계통 트리 다이어그램 작성]
\`\`\`

## Module Responsibilities
[여기에 탐색된 핵심 파일들의 주요 역할 및 책임 작성]

## Custom Rules & Constraints
- [이 프로젝트 작업 시 준수해야 할 개발 규칙, 제약 사항 및 특이점 작성]`;
                            } else {
                                startPrompt = isEmpty
                                    ? `이 폴더는 완전히 비어있는 새 프로젝트입니다. 지침을 숙지했다면 유저에게 어떤 프로젝트를 만들지 간단히 물어보십시오. (파일 요청 금지, 사족 금지)`
                                    : window.dragDropMode 
                                        ? `이 지침을 숙지했다면 분석을 위해 처음 읽을 핵심 파일(예: package.json, index.html 등 진입점 파일)을 유저에게 드롭해달라고 요청하며 [REQUEST: read-file "실제파일경로"] 형태로 즉시 단답형 답변하십시오. ("파일명"이라는 임시 단어를 그대로 출력하지 마십시오.)` 
                                        : `이 지침을 숙지했다면 분석을 위해 처음 읽을 핵심 파일을 [CMD: read-file "실제파일경로"] 형태로 즉시 답변하십시오.`;
                                        
                                if (window.autoUpdateMap && window.projectRoot && typeof window.checkProjectMapExists === 'function' && window.checkProjectMapExists()) {
                                    const projectName = path.basename(window.projectRoot);
                                    const mapPath = path.join(process.cwd(), `${projectName}_Map.md`);
                                    try {
                                        mapContent = `\n\n[EXISTING PROJECT MAP]\n${fs.readFileSync(mapPath, 'utf-8')}`;
                                    } catch(e) {}
                                }
                            }

                            const briefPayload = isEmpty
                                ? `${window.getSystemRulesPrompt()}\n\n${startPrompt}${mapContent}`.trim()
                                : `현재 프로젝트 폴더에는 다음 파일들이 있습니다:\n${projectTree}\n${window.getSystemRulesPrompt()}\n${startPrompt}${mapContent}`.trim();

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

        wv.addEventListener('ipc-message', (event) => {
            const channel = event.channel;
            const args = event.args || [];
            
            if (channel === 'rollback-completed-item') {
                const absPath = args[0];
                console.log("[Host] Direct rollback received from guest for:", absPath);
                const item = window.requestedFilesQueue.find(x => x.absolutePath === absPath);
                if (item) {
                    item.status = 'PENDING';
                }
                window.dragDropMode = true;
                if (typeof window.updateDragDropQueueUI === 'function') {
                    window.updateDragDropQueueUI();
                }
            }
            
            if (channel === 'confirm-completed-item') {
                const absPath = args[0];
                console.log("[Host] Direct confirm received from guest for:", absPath);
                window.markFileAsCompleted(absPath);
                
                const stillPending = window.requestedFilesQueue.filter(item => item.status === 'PENDING' || item.status === 'UPLOADING');
                if (stillPending.length === 0) {
                    if (window.activeDragDropCleanup) window.activeDragDropCleanup();
                    
                    if (typeof window.activeDragDropContinue === 'function') {
                        const continueFunc = window.activeDragDropContinue;
                        window.activeDragDropContinue = null;
                        continueFunc().catch(err => {
                            console.error("Error executing activeDragDropContinue:", err);
                        });
                    }
                    
                    window.requestedFilesQueue = [];
                    window.processedDropFiles = new Set();
                    if (typeof window.updateDragDropQueueUI === 'function') {
                        window.updateDragDropQueueUI();
                    }
                }
            }
        });

        let lastReceivedMirrorText = "";
        wv.addEventListener('console-message', (e) => {
            // Forward all other guest logs for debugging
            if (!e.message.startsWith('[GUEST_HTML5_DROP]:') && 
                !e.message.startsWith('[GUEST_FILE_DROP]:') && 
                !e.message.startsWith('[GUEST_USER_MESSAGE]:') && 
                !e.message.startsWith('[BACKGROUND_AI_RESP]:') &&
                !e.message.startsWith('[GUEST_INPUT_HEIGHT]:') &&
                !e.message.startsWith('[INJECT_PCT]:')) {
                console.log('[GUEST_CONSOLE]: ' + e.message);
            }

            if (e.message.startsWith('[GUEST_HTML5_DROP]:') || e.message.startsWith('[GUEST_FILE_DROP]:')) {
                let filePath = "";
                if (e.message.startsWith('[GUEST_HTML5_DROP]:')) {
                    filePath = e.message.substring(19);
                } else {
                    const filename = e.message.substring(18);
                    const droppedName = filename.toLowerCase();
                    if (window.currentlyDraggedFilePath && path.basename(window.currentlyDraggedFilePath).toLowerCase() === droppedName) {
                        filePath = window.currentlyDraggedFilePath;
                    } else {
                        const match = window.requestedFilesQueue.find(x => x.relativePath.split(/[\\/]/).pop().toLowerCase() === droppedName);
                        if (match) {
                            filePath = match.absolutePath;
                        }
                    }
                }
                
                if (filePath) {
                    if (!window.processedDropFiles) window.processedDropFiles = new Set();
                    if (window.processedDropFiles.has(filePath.toLowerCase())) {
                        console.log("[HostDrop] Ignored duplicate drop event for:", filePath);
                        return;
                    }
                    window.processedDropFiles.add(filePath.toLowerCase());
                    
                    console.log("[HostDrop] Intercepted drop for path:", filePath);
                    
                    const isImage = /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(filePath);
                    if (isImage) {
                        if (typeof ChatUI !== 'undefined' && ChatUI.appendBubble) {
                            ChatUI.appendBubble('user', `Attached image: ${path.basename(filePath)}`);
                        }
                        return;
                    }
                    
                    if (window.dragDropMode && window.activeDragDropContinue) {
                        const droppedName = path.basename(filePath).toLowerCase();
                        
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
                        
                        const targetItem = window.requestedFilesQueue.find(x => x.absolutePath.replace(/\//g, '\\').toLowerCase() === filePath.replace(/\//g, '\\').toLowerCase());
                        if (targetItem && targetItem.status !== 'COMPLETED') {
                            targetItem.status = 'UPLOADING';
                            if (typeof window.updateDragDropQueueUI === 'function') {
                                window.updateDragDropQueueUI();
                            }
                        }
                        
                        if (typeof ChatUI !== 'undefined' && ChatUI.appendBubble) {
                            const chatLog = document.getElementById('local-chat-messages');
                            let lastUserBubble = null;
                            let baseName = path.basename(filePath);
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
                    } else {
                        try {
                            const contentBuffer = fs.readFileSync(filePath);
                            const filename = path.basename(filePath);
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
                if (!isNaN(h)) {
                    window.lastKnownInputHeight = h;
                    if (typeof window.updateSplitLayoutHeight === 'function') {
                        window.updateSplitLayoutHeight(h);
                    }
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


