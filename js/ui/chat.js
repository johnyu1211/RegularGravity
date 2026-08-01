if (typeof ipcRenderer === 'undefined') { var { ipcRenderer } = require('electron'); }
window.generating = false;

window.showUserScreenToast = function(message, duration = 4000) {
    try {
        let toast = document.getElementById('app-user-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'app-user-toast';
            toast.style.cssText = `
                position: fixed;
                bottom: 24px;
                right: 24px;
                background: #18181b;
                color: #22c55e;
                border: 1px solid rgba(34, 197, 94, 0.4);
                border-radius: 8px;
                padding: 10px 18px;
                font-family: 'DM Sans', sans-serif;
                font-size: 13px;
                font-weight: 600;
                display: flex;
                align-items: center;
                gap: 10px;
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
                backdrop-filter: blur(8px);
                z-index: 999999;
                transition: opacity 0.3s ease, transform 0.3s ease;
                opacity: 0;
                transform: translateY(12px);
                pointer-events: none;
            `;
            document.body.appendChild(toast);
        }
        toast.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>${message}</span>
        `;
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';

        if (window._userToastTimeout) clearTimeout(window._userToastTimeout);
        window._userToastTimeout = setTimeout(() => {
            if (toast) {
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(12px)';
            }
        }, duration);
    } catch(e) {
        console.error("Toast error:", e);
    }
};

window.makeCodeBlocksCollapsible = (container) => {
    container.querySelectorAll('pre').forEach(pre => {
        if (pre.parentElement.tagName.toLowerCase() === 'details' && pre.parentElement.classList.contains('chat-code-details')) return;

        const codeEl = pre.querySelector('code');
        let lang = 'code';
        if (codeEl) {
            const match = Array.from(codeEl.classList).find(c => c.startsWith('language-'));
            if (match) lang = match.replace('language-', '').toUpperCase();
        }

        const details = document.createElement('details');
        details.className = 'chat-code-details';
        details.style = 'margin: 6px 0; border: 1px solid #2a2a2a; border-radius: 6px; background: #070707; overflow: hidden;';
        
        const summary = document.createElement('summary');
        summary.className = 'chat-code-summary';
        summary.style = 'cursor: pointer; padding: 6px 12px; background: #111; font-size: 11.5px; font-weight: 600; color: #aaa; font-family: "DM Sans", sans-serif; display: flex; align-items: center; justify-content: space-between; user-select: none; border-bottom: 1px solid transparent;';
        
        summary.innerHTML = `<span style="display: flex; align-items: center; gap: 6px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg> Code Block (${lang})</span><span class="chat-code-caret" style="display: flex; align-items: center; transition: transform 0.2s ease;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg></span>`;
        
        details.ontoggle = () => {
            const caret = summary.querySelector('.chat-code-caret');
            if (caret) caret.style.transform = details.open ? 'rotate(90deg)' : 'none';
            summary.style.borderBottomColor = details.open ? '#2a2a2a' : 'transparent';
        };

        pre.parentNode.insertBefore(details, pre);
        details.appendChild(summary);
        details.appendChild(pre);

        pre.style.margin = '0';
        pre.style.borderRadius = '0';
        pre.style.border = 'none';
    });
};

const ChatUI = {
    appendBubble(role, text, isThinking = false, sourceIcon = null) {
        const chatLog = document.getElementById('local-chat-messages'); if (!chatLog) return;
        const box = document.createElement('div'); box.className = `chat-bubble ${role}`; box.dataset.role = role;
        
        // Completely hide system messages from chat UI display if debug mode is off
        if (!window.debugMode) {
            if (role === 'system' || role === 'system-info') {
                box.style.display = 'none';
            }
        }
        const content = document.createElement('div'); content.className = 'bubble-content';
        content.dataset.rawText = text;
        
        box.appendChild(content);
        if (sourceIcon) { const badge = document.createElement('div'); badge.className = 'source-badge'; badge.innerHTML = `<img src="${sourceIcon}" title="Source: Web AI">`; box.appendChild(badge); }
        chatLog.appendChild(box); chatLog.scrollTop = chatLog.scrollHeight;
        
        let customHtml = null;
        if (role === 'system' && typeof text === 'string') {
            const wroteMatch = text.match(/^\[SUCCESS\] Wrote\s+(.+?)(?:\s+content\.|\s+successfully\.)?$/i);
            const editedMatch = text.match(/^\[SUCCESS\] (?:Edited|Block updated in|Saved)\s+(.+?)(?:\s+successfully\.|\s+range.+)?$/i);
            const deleteMatch = text.match(/^\[SUCCESS\] Deleted\s+(.+?)(?:\s+successfully\.|\s+\(Already gone\))?$/i);
            const generalSuccessMatch = text.match(/^\[SUCCESS\]\s+(.+)/i);
            const errorMatch = text.match(/^\[ERROR\]\s+(.+)/i);
            
            if (wroteMatch) {
                const filePath = wroteMatch[1].trim();
                customHtml = `
                    <div style="display: flex; align-items: center; gap: 12px; font-family: 'DM Sans', sans-serif; width: 100%;">
                        <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.25); width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #10b981; font-weight: bold; font-size: 11px; flex-shrink: 0; box-shadow: none;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
                        <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
                            <span style="font-size: 10px; font-weight: 700; color: #10b981; letter-spacing: 0.08em; text-transform: uppercase; flex-shrink: 0;">File Created:</span>
                            <span style="font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${filePath}">${filePath}</span>
                        </div>
                    </div>
                `;
            } else if (editedMatch) {
                const filePath = editedMatch[1].trim();
                customHtml = `
                    <div style="display: flex; align-items: center; gap: 12px; font-family: 'DM Sans', sans-serif; width: 100%;">
                        <div style="background: rgba(70, 140, 246, 0.1); border: 1px solid rgba(70, 140, 246, 0.25); width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #468CF6; font-weight: bold; font-size: 11px; flex-shrink: 0; box-shadow: none;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></div>
                        <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
                            <span style="font-size: 10px; font-weight: 700; color: #468CF6; letter-spacing: 0.08em; text-transform: uppercase; flex-shrink: 0;">File Modified:</span>
                            <span style="font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${filePath}">${filePath}</span>
                        </div>
                    </div>
                `;
            } else if (deleteMatch) {
                const filePath = deleteMatch[1].trim();
                customHtml = `
                    <div style="display: flex; align-items: center; gap: 12px; font-family: 'DM Sans', sans-serif; width: 100%;">
                        <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.25); width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #ef4444; font-weight: bold; font-size: 11px; flex-shrink: 0; box-shadow: none;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></div>
                        <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
                            <span style="font-size: 10px; font-weight: 700; color: #ef4444; letter-spacing: 0.08em; text-transform: uppercase; flex-shrink: 0;">File Deleted:</span>
                            <span style="font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${filePath}">${filePath}</span>
                        </div>
                    </div>
                `;
            } else if (generalSuccessMatch) {
                const infoText = generalSuccessMatch[1].trim();
                customHtml = `
                    <div style="display: flex; align-items: center; gap: 12px; font-family: 'DM Sans', sans-serif; width: 100%;">
                        <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.25); width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #10b981; font-weight: bold; font-size: 11px; flex-shrink: 0; box-shadow: none;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
                        <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
                            <span style="font-size: 10px; font-weight: 700; color: #10b981; letter-spacing: 0.08em; text-transform: uppercase; flex-shrink: 0;">Success:</span>
                            <span style="font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${infoText}">${infoText}</span>
                        </div>
                    </div>
                `;
            } else if (errorMatch) {
                const details = errorMatch[1].trim();
                customHtml = `
                    <div style="display: flex; align-items: center; gap: 12px; font-family: 'DM Sans', sans-serif; width: 100%;">
                        <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.25); width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #ef4444; font-weight: bold; font-size: 11px; flex-shrink: 0; box-shadow: none;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></div>
                        <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
                            <span style="font-size: 10px; font-weight: 700; color: #ef4444; letter-spacing: 0.08em; text-transform: uppercase; flex-shrink: 0;">Operation Failed:</span>
                            <span style="font-size: 11.5px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${details}">${details}</span>
                        </div>
                    </div>
                `;
            }
        }
        
        if (customHtml) {
            content.innerHTML = customHtml;
        } else if (role === 'ai') {
            if (typeof window.typewriterHTML === 'function') {
                window.typewriterHTML(content, text, () => {
                    if (typeof hljs !== 'undefined') box.querySelectorAll('pre code').forEach((el) => hljs.highlightElement(el));
                    if (typeof window.makeCodeBlocksCollapsible === 'function') window.makeCodeBlocksCollapsible(content);
                    chatLog.scrollTop = chatLog.scrollHeight;
                    if (typeof window.toggleManualSendButtons === 'function') {
                        const queue = document.getElementById('drag-drop-queue-container');
                        const show = !((queue && queue.style.display !== 'none') || !window.sessionBriefed);
                        window.toggleManualSendButtons(show);
                    }
                });
            } else {
                const formatted = typeof window.formatChatText === 'function' ? window.formatChatText(text) : text;
                if (typeof marked !== 'undefined') content.innerHTML = marked.parse(formatted).trim(); else content.innerText = formatted.trim();
                if (typeof hljs !== 'undefined') box.querySelectorAll('pre code').forEach((el) => hljs.highlightElement(el));
                if (typeof window.makeCodeBlocksCollapsible === 'function') window.makeCodeBlocksCollapsible(content);
                if (typeof window.toggleManualSendButtons === 'function') {
                    const queue = document.getElementById('drag-drop-queue-container');
                    const show = !((queue && queue.style.display !== 'none') || !window.sessionBriefed);
                    window.toggleManualSendButtons(show);
                }
            }
        } else {
            window.tempCards = [];
            const formatted = typeof window.formatChatText === 'function' ? window.formatChatText(text) : text;
            if (typeof marked !== 'undefined') {
                const html = marked.parse(formatted).trim();
                content.innerHTML = typeof window.unpackChatPlaceholders === 'function' ? window.unpackChatPlaceholders(html) : html;
            } else {
                content.innerText = formatted.trim();
            }
            if (typeof hljs !== 'undefined') box.querySelectorAll('pre code').forEach((el) => hljs.highlightElement(el));
            if (typeof window.makeCodeBlocksCollapsible === 'function') window.makeCodeBlocksCollapsible(content);
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
    if (typeof window.toggleManualSendButtons === 'function') window.toggleManualSendButtons(false);
    const sendBtn = document.getElementById('send-to-local');
    const chatIn = document.getElementById('local-agent-input');

    if (window.generating) { 
        ipcRenderer.send('stop-ollama'); 
        window.generating = false; 
        if (sendBtn) sendBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`; 
        return; 
    }

    const promptText = (typeof overridePrompt === 'string') ? overridePrompt : (chatIn ? chatIn.value.trim() : '');
    if (!promptText) return;

    if (promptText === '/help') {
        if (chatIn) chatIn.value = '';
        ChatUI.appendBubble('ai', `
**REGULAR GRAVITy Command List**
- \`/marktag [msg]\`: Precision Markdown tag extraction (Recommended)
- \`/spatialMutation [msg]\`: Extract changes by monitoring specific area
- \`/mutation [msg]\`: Extract changes by monitoring full DOM
- \`/spatial [msg]\`: Extract using spatial analysis
- \`/test [msg]\`: Inject basic input (manual verification)
- \`/help\`: Show this help message
        `);
        return;
    }

    const setUIState = (generating) => {
        window.generating = generating;
        if (chatIn) {
            chatIn.disabled = generating;
            if (generating) {
                chatIn.placeholder = "AI is thinking...";
            } else {
                chatIn.placeholder = "Type a message...";
            }
        }
        if (sendBtn) {
            if (generating) {
                sendBtn.style.opacity = '0.4';
                sendBtn.style.pointerEvents = 'none';
            } else {
                sendBtn.style.opacity = '1';
                sendBtn.style.pointerEvents = 'auto';
            }
        }
    };

    setUIState(true);

    try {
        const experimentalCmds = ['/marktag', '/mutation', '/spatial', '/spatialMutation', '/test'];
        let matchedCmd = null, msg = "";

        for (const c of experimentalCmds) {
            if (promptText === c || promptText.startsWith(c + ' ')) { matchedCmd = c; msg = promptText.substring(c.length).trim(); break; }
        }

        if (matchedCmd) {
            const isTest = (matchedCmd === '/test'); const cmd = matchedCmd; const displayCmd = msg ? `${cmd} ${msg}` : cmd;
            if (cmd !== '/marktag') {
                ChatUI.appendBubble('user', displayCmd); if (chatIn) chatIn.value = '';
            }
            try {
                if (isTest) { await injectWebPayload(msg); } 
                else {
                    const statusBub = (cmd !== '/marktag') ? ChatUI.appendBubble('ai', `[SYSTEM] ${cmd} entering wait mode...`) : null;
                    window.currentBatchFileCount = 0;
                    await injectWebPayload(msg);
                    const enginePromise = runExperimentalEngine(cmd, msg, statusBub);
                    const response = await enginePromise;
                    if (statusBub) statusBub.remove();

                    if (response) { 
                        if (cmd !== '/marktag') {
                            ChatUI.appendBubble('ai', response, false, getWebIcon(document.getElementById('active-agent-webview'))); 
                        }
                        detectAndAskCommand(response); 
                    } 
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
            console.log("[HostChat] handleSend triggered. promptText length:", promptText.length);
            if (typeof overridePrompt !== 'string') { ChatUI.appendBubble('user', promptText); if (chatIn) chatIn.value = ''; }
            const overlay = document.getElementById('web-process-overlay'), progBar = document.getElementById('web-process-bar');
            const steps = { scan: document.getElementById('step-scan'), analyze: document.getElementById('step-analyze'), brief: document.getElementById('step-brief'), extract: document.getElementById('step-extract') };
            const updateProcess = (stepId, percent) => {
                overlay.style.display = 'block'; overlay.style.pointerEvents = 'auto'; progBar.style.width = percent + '%';
                Object.values(steps).forEach(s => s?.classList.remove('active')); if (steps[stepId]) steps[stepId].classList.add('active');
            };

            try {
                if (typeof window.sessionTurnCount === 'undefined') window.sessionTurnCount = 0;
                window.sessionTurnCount++;
                
                let webPayload = promptText.trim();
                
                // Check if 10-turn reminder is needed (starting from turn 10)
                if (window.sessionTurnCount > 0 && window.sessionTurnCount % 10 === 0) {
                    const fs = require('fs');
                    const path = require('path');
                    const tempFileName = `_project_rules_reminder_${Date.now()}.md`;
                    const tempPath = path.join(window.projectRoot || window.currentPath, tempFileName);
                    try {
                        const rulesText = typeof window.getSystemRulesPrompt === 'function' ? window.getSystemRulesPrompt(true) : '';
                        fs.writeFileSync(tempPath, rulesText, 'utf-8');
                        
                        window.requestedFilesQueue = [{
                            relativePath: tempFileName,
                            absolutePath: tempPath,
                            status: 'PENDING'
                        }];
                        
                        if (typeof window.updateDragDropQueueUI === 'function') {
                            window.updateDragDropQueueUI();
                        }
                        
                        window.pendingUserMessageText = webPayload;
                        
                        if (window.autoDragging) {
                            if (typeof window.autoClickPendingQueueItems === 'function') {
                                window.autoClickPendingQueueItems();
                            }
                        }
                        return; // Halt sending, wait for rules drop
                    } catch(e) {
                        console.error("Failed to create temporary rules reminder file:", e);
                    }
                }

                const systemRulePrompt = typeof window.getSystemRulesPrompt === 'function' ? window.getSystemRulesPrompt() : '';
                webPayload += systemRulePrompt;
                window.sessionBriefed = true;

                console.log("[HostChat] Calling injectWebPayload with total payload length:", webPayload.length);
                await injectWebPayload(webPayload, 0);
                const enginePromise = runExperimentalEngine('/marktag', webPayload, null);

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
                    if (typeof window.toggleManualSendButtons === 'function') {
                        window.toggleManualSendButtons(true);
                    }
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
    } finally {
        setUIState(false);
    }
};

function getWebIcon(wv) { try { return `https://www.google.com/s2/favicons?domain=${new URL(wv.src).hostname}&sz=64`; } catch { return null; } }
