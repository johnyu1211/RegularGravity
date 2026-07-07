if (typeof ipcRenderer === 'undefined') { var { ipcRenderer } = require('electron'); }
window.generating = false;

const ChatUI = {
    appendBubble(role, text, isThinking = false, sourceIcon = null) {
        const chatLog = document.getElementById('local-chat-messages'); if (!chatLog) return;
        const box = document.createElement('div'); box.className = `chat-bubble ${role}`; box.dataset.role = role;
        
        // Safe hide for system logs if debug mode is off
        if (!window.debugMode) {
            if (role === 'system') box.style.display = 'none';
            if (typeof text === 'string') {
                const cleanText = text.trim();
                if (cleanText.startsWith('[SYSTEM]') || cleanText.startsWith('[ERROR]') || cleanText.startsWith('[EXECUTED]')) {
                    box.style.display = 'none';
                }
            }
        }
        const content = document.createElement('div'); content.className = 'bubble-content';
        content.dataset.rawText = text;
        
        box.appendChild(content);
        if (sourceIcon) { const badge = document.createElement('div'); badge.className = 'source-badge'; badge.innerHTML = `<img src="${sourceIcon}" title="Source: Web AI">`; box.appendChild(badge); }
        chatLog.appendChild(box); chatLog.scrollTop = chatLog.scrollHeight;
        
        if (role === 'ai') {
            if (typeof window.typewriterHTML === 'function') {
                window.typewriterHTML(content, text, () => {
                    if (typeof hljs !== 'undefined') box.querySelectorAll('pre code').forEach((el) => hljs.highlightElement(el));
                    chatLog.scrollTop = chatLog.scrollHeight;
                });
            } else {
                const formatted = typeof window.formatChatText === 'function' ? window.formatChatText(text) : text;
                if (typeof marked !== 'undefined') content.innerHTML = marked.parse(formatted).trim(); else content.innerText = formatted.trim();
                if (typeof hljs !== 'undefined') box.querySelectorAll('pre code').forEach((el) => hljs.highlightElement(el));
            }
        } else {
            const formatted = typeof window.formatChatText === 'function' ? window.formatChatText(text) : text;
            if (typeof marked !== 'undefined') content.innerHTML = marked.parse(formatted).trim(); else content.innerText = formatted.trim();
            if (typeof hljs !== 'undefined') box.querySelectorAll('pre code').forEach((el) => hljs.highlightElement(el));
        }
        return box;
    },
    delete(box) { box.remove(); },
    edit(box) {
        if (box.querySelector('.edit-textarea')) return;
        const content = box.querySelector('.bubble-content'), originalText = box.dataset.role === 'user' ? content.innerText : content.innerHTML;
        const area = document.createElement('textarea'); area.className = 'edit-textarea';
        area.style = `width:100%; min-height:${content.offsetHeight}px; background:rgba(0,0,0,0.2); border:1px solid #444; border-radius:4px; color:inherit; font:inherit; outline:none; resize:vertical; padding:8px; box-sizing:border-box; margin-top:5px;`;
        area.value = originalText;
        const save = () => {
            if (box.dataset.role === 'user') content.innerText = area.value; else content.innerHTML = area.value;
            area.remove(); content.style.display = 'block'; 
            if (typeof hljs !== 'undefined') box.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el));
        };
        area.oninput = () => { area.style.height = 'auto'; area.style.height = area.scrollHeight + 'px'; };
        content.style.display = 'none'; box.appendChild(area); area.focus(); area.style.height = area.scrollHeight + 'px';
        area.onblur = save; area.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); } };
    },
    regenerate(box) {
        let pBox = (box.dataset.role === 'user') ? box : box.previousElementSibling;
        while (pBox && !pBox.classList.contains('user')) pBox = pBox.previousElementSibling;
        if (!pBox) return;
        const txt = pBox.querySelector('.bubble-content').innerText;
        let targetBubble;
        if (box.dataset.role === 'user') {
            targetBubble = box.nextElementSibling;
            while (targetBubble && !targetBubble.classList.contains('ai')) targetBubble = targetBubble.nextElementSibling;
            if (!targetBubble) targetBubble = ChatUI.appendBubble('ai', '...');
        } else { targetBubble = box; }
        const content = targetBubble.querySelector('.bubble-content');
        if (content) content.innerHTML = '<div class="thinking-dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>';
        handleSend(txt, true, false, null, targetBubble);
    },
    async restoreHistory() {
        window.isRestoring = true;
        const logContent = await ipcRenderer.invoke('vault-read-log', `${new Date().toISOString().split('T')[0]}.md`);
        if (!logContent) { window.isRestoring = false; return; }
        const chatLog = document.getElementById('local-chat-messages'); if (!chatLog) return;
        chatLog.innerHTML = '';
        logContent.split(/### \[.*?\] /).forEach(entry => {
            if (!entry.trim()) return;
            const role = entry.startsWith('USER') ? 'user' : (entry.startsWith('AI') ? 'ai' : null);
            if (role) this.appendBubble(role, entry.replace(/^(USER|AI)\n/, '').trim());
        });
        hljs.highlightAll(); setTimeout(() => { chatLog.scrollTop = chatLog.scrollHeight; window.isRestoring = false; }, 300);
    }
};

const handleSend = async (overridePrompt = null, isRegen = false, isAuto = false, sourceIcon = null, targetBubble = null) => {
    const sendBtn = document.getElementById('send-to-local');
    if (window.generating) { 
        ipcRenderer.send('stop-ollama'); 
        window.generating = false; 
        if (sendBtn) sendBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`; 
        return; 
    }

    const chatIn = document.getElementById('local-agent-input');
    const promptText = (typeof overridePrompt === 'string') ? overridePrompt : (chatIn ? chatIn.value.trim() : '');
    if (!promptText) return;

    if (promptText === '/help') {
        if (chatIn) chatIn.value = '';
        ChatUI.appendBubble('ai', `
**PormsG Command List**
- \`/marktag [msg]\`: Precision Markdown tag extraction (Recommended)
- \`/spatialMutation [msg]\`: Extract changes by monitoring specific area
- \`/mutation [msg]\`: Extract changes by monitoring full DOM
- \`/spatial [msg]\`: Extract using spatial analysis
- \`/test [msg]\`: Inject basic input (manual verification)
- \`/help\`: Show this help message
        `);
        return;
    }

    const experimentalCmds = ['/marktag', '/mutation', '/spatial', '/spatialMutation', '/test'];
    let matchedCmd = null, msg = "";

    for (const c of experimentalCmds) {
        if (promptText === c || promptText.startsWith(c + ' ')) { matchedCmd = c; msg = promptText.substring(c.length).trim(); break; }
    }

    if (matchedCmd) {
        const isTest = (matchedCmd === '/test'); const cmd = matchedCmd; const displayCmd = msg ? `${cmd} ${msg}` : cmd;
        ChatUI.appendBubble('user', displayCmd); if (chatIn) chatIn.value = '';
        try {
            if (isTest) { await injectWebPayload(msg); } 
            else {
                const statusBub = ChatUI.appendBubble('ai', `[SYSTEM] ${cmd} entering wait mode...`);
                window.currentBatchFileCount = 0;
                const enginePromise = runExperimentalEngine(cmd, msg, statusBub);
                await new Promise(r => setTimeout(r, 300));
                await injectWebPayload(msg);
                const response = await enginePromise;
                if (statusBub) statusBub.remove();

                if (response) { ChatUI.appendBubble('ai', response, false, getWebIcon(document.getElementById('active-agent-webview'))); detectAndAskCommand(response); } 
                else {
                    const failBub = ChatUI.appendBubble('ai', `[SYSTEM] ${cmd} automatic extraction failed.`);
                    const content = failBub.querySelector('.bubble-content');
                    if (content) {
                        content.innerHTML = `
                            <div style="margin-bottom:12px; color:#aaa;">⚠️ ${cmd} automatic extraction failed.</div>
                            <div style="display:flex; justify-content:center; padding:5px 0;">
                                <button class="manual-fetch-trigger-btn" style="background:#222; border:1px solid #333; color:#aaa; padding:8px 20px; border-radius:4px; font-size:11px; font-weight:600; cursor:pointer; transition:all 0.2s;">Manual Fetch</button>
                            </div>
                        `;
                        const btn = content.querySelector('.manual-fetch-trigger-btn');
                        btn.onmouseenter = () => { btn.style.background = '#333'; btn.style.color = '#fff'; btn.style.borderColor = '#444'; };
                        btn.onmouseleave = () => { btn.style.background = '#222'; btn.style.color = '#aaa'; btn.style.borderColor = '#333'; };
                        btn.onclick = async () => { const result = await showManualInputUI(failBub); if (result) { failBub.remove(); ChatUI.appendBubble('ai', result, false, getWebIcon(document.getElementById('active-agent-webview'))); } };
                    }
                }
            }
        } catch (e) { ChatUI.appendBubble('ai', `[ERROR] Injection failed: ${e.message}`); }
        return;
    }

    if (true) {
        if (typeof overridePrompt !== 'string') { ChatUI.appendBubble('user', promptText); if (chatIn) chatIn.value = ''; }
        const overlay = document.getElementById('web-process-overlay'), progBar = document.getElementById('web-process-bar');
        const steps = { scan: document.getElementById('step-scan'), analyze: document.getElementById('step-analyze'), brief: document.getElementById('step-brief'), extract: document.getElementById('step-extract') };
        const updateProcess = (stepId, percent) => {
            overlay.style.display = 'block'; overlay.style.pointerEvents = 'auto'; progBar.style.width = percent + '%';
            Object.values(steps).forEach(s => s?.classList.remove('active')); if (steps[stepId]) steps[stepId].classList.add('active');
        };

        try {
            window.userMessageCount = (window.userMessageCount || 0) + 1;
            let webPayload = promptText.trim();
            
            if (window.userMessageCount % 5 === 0) {
                const systemRulePrompt = `

[SYSTEM INSTRUCTION / REMINDER]
1. 프로젝트 파악을 위해 코드를 분석하십시오. 모든 파일을 다 읽으려 하지 말고, package.json이나 핵심 엔트리 포인트(예: main.js, index.html 등)의 아키텍처를 파악하십시오.
2. 분석할 첫 번째 핵심 소스코드를 읽으려면 반드시 다음 형식의 대괄호 명령어를 본문 답변에 정확히 써서 요청하십시오. 자연어로만 말하면 시스템이 감지하지 못합니다:
- [CMD: read-file "파일명"]
3. 만약 한 번에 여러 소스 파일을 동시에 읽어 분석하고 싶다면, [CMD: read-file "파일명1"] [CMD: read-file "파일명2"] 형태로 여러 개의 명령어를 나열하여 요청하십시오. 시스템이 병합하여 1턴 만에 전송해 줄 것입니다.

[CRITICAL RULE]
1. 아직 전체 프로젝트가 파악되지 않았다면, 읽은 파일에 대해 설명하지 말고 빠르게 다음 탐색할 [CMD: ...] 명령어만 단답형으로 제출하십시오.
2. 파일의 구조나 함수 목록만 파악할 때는 [CMD: read-file "파일명"] 을 사용하십시오.
3. 세부 로직을 정밀 분석/수정할 때는 [CMD: read-file-full "파일명"] 을 사용하십시오. (단, 한 턴에 최대 200줄 제한으로 잘려서 전송됩니다.)
4. 특정 라인 범위(최대 200줄 한도)만 지정해서 읽고 싶다면 [CMD: read-file-range "파일명" 시작줄-끝줄] (예: [CMD: read-file-range "main.js" 1-200] 또는 [CMD: read-file-range "main.js" 201-400]) 을 적극적으로 사용하십시오.
5. 특정 함수나 텍스트를 파일 내에서 검색하여 라인 번호를 찾으려면 [CMD: search-file "파일명" "검색어"] 를 사용하십시오. (예: [CMD: search-file "main.js" "createWindow"])
6. 프로젝트 전역에서 특정 함수나 텍스트를 검색하려면 [CMD: search-all "검색어"] 를 사용하십시오. (예: [CMD: search-all "setupUI"])
7. 유저가 구체적인 오류 해결이나 개발 작업을 요청했을 경우, 관련 코드의 위치나 세부 사항을 짐작하여 대안을 작성하지 마십시오. 반드시 search-all 이나 search-file 명령어로 관련 로직이 위치한 라인을 검색하고, 해당 영역의 코드 본문을 read-file-range 명령어로 필요한 만큼(200줄씩) 확실하게 읽어서 분석한 뒤 작업을 진행하십시오.
8. 파일 탐색 및 파악이 최종적으로 완료되었다면 자의적인 향후 작업 계획 수립이나 임의의 대안 작성을 일절 중단하십시오. 오직 파악된 현재 프로젝트 구조 및 핵심 기능에 대해서만 간결히 설명한 후, 유저의 구체적인 지시(Wait for user instructions)를 대기하십시오.
9. 유저가 특정 기능, 구성 요소, 변수, 또는 로직에 대해 물어봤을 경우, 프로젝트 트리 전체를 샅샅이 훑어보고 관련이 있을 법한 모든 파일 경로를 먼저 찾아내십시오. 경로를 발견했다면 반드시 [CMD: read-file "파일명"] 또는 [CMD: read-file-full "파일명"] 명령어로 본문 내용을 완전히 읽어서 분석한 뒤에 답변을 작성하십시오. 절대로 본문 코드를 읽지 않은 채 짐작하여 답변하거나 "없다", "모른다"고 답하며 대답을 회피하지 마십시오.`;
                webPayload += systemRulePrompt;
            }
            window.sessionBriefed = true;

            const enginePromise = runExperimentalEngine('/marktag', webPayload, null);
            await new Promise(r => setTimeout(r, 300));
            await injectWebPayload(webPayload, 0);

            updateProcess('extract', 90);

            const response = await enginePromise;
            progBar.style.width = '100%'; await new Promise(r => setTimeout(r, 500));
            overlay.style.display = 'none'; overlay.style.pointerEvents = 'none';

            if (response) {
                // Background mirror will append bubble
                if (typeof window.finalizeAiBubble === 'function') {
                    window.finalizeAiBubble(response);
                }
                if (typeof detectAndAskCommand === 'function') {
                    detectAndAskCommand(response);
                }
            } else {
                ChatUI.appendBubble('ai', '[SYSTEM] WebAI response extraction failed.');
            }
        } catch (e) { 
            overlay.style.display = 'none'; 
            ChatUI.appendBubble('ai', `[ERROR] WebAI Mode failed: ${e.message}`);
        } finally {
            if (typeof window.hideInputLoading === 'function') {
                window.hideInputLoading();
            }
        }
        return;
    }
};

function getWebIcon(wv) { try { return `https://www.google.com/s2/favicons?domain=${new URL(wv.src).hostname}&sz=64`; } catch { return null; } }
