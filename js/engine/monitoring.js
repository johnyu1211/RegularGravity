async function showManualInputUI(statusBub) {
    return new Promise((resolve) => {
        const content = statusBub.querySelector('.bubble-content');
        if (!content) return resolve(null);
        
        content.innerHTML = `
            <div style="font-size:12px; margin-bottom:8px; color:#ffa500; font-weight:bold;">[MANUAL OVERRIDE]</div>
            <div style="font-size:11px; color:#aaa; margin-bottom:8px;">Copy the response (Ctrl+C) from the webview on the right to fetch it <b>automatically</b>.<br>Or paste it directly below.</div>
            <textarea class="manual-input-area" placeholder="Paste the web AI response here..." style="width:100%; height:150px; background:#000; color:#ccc; border:1px solid #333; padding:10px; font-size:13px; outline:none; resize:none; border-radius:6px; font-family:inherit;"></textarea>
            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:8px;">
                <button class="manual-cancel-btn" style="background:#222; color:#aaa; border:1px solid #333; padding:5px 15px; border-radius:4px; font-weight:bold; cursor:pointer;">Cancel</button>
                <button class="manual-save-btn" style="background:#fff; color:#000; border:none; padding:5px 15px; border-radius:4px; font-weight:bold; cursor:pointer;">Save Response</button>
            </div>
        `;

        const area = content.querySelector('.manual-input-area'), saveBtn = content.querySelector('.manual-save-btn'), cancelBtn = content.querySelector('.manual-cancel-btn');
        let clipboardInterval = null;

        const cleanup = () => {
            if (clipboardInterval) clearInterval(clipboardInterval);
            const toast = document.getElementById('injection-toast'); if (toast) toast.style.display = 'none';
            const webBarCont = document.getElementById('web-extract-progress-container'); if (webBarCont) webBarCont.style.display = 'none';
        };

        saveBtn.onclick = () => {
            const val = area.value.trim(); if (!val) { alert("Please enter content."); return; }
            saveBtn.innerText = "Saving..."; saveBtn.disabled = true; cleanup(); resolve(val);
        };
        cancelBtn.onclick = () => { cleanup(); resolve(""); };

        document.getElementById('tab-browser-hub')?.click();

        const toast = document.getElementById('injection-toast');
        const projLbl = document.getElementById('project-pct-label');
        const injLbl = document.getElementById('inject-pct-label');
        const projBar = document.getElementById('toast-project-progress-bar');
        const injBar = document.getElementById('toast-inject-progress-bar');
        const webBar = document.getElementById('web-extract-progress-bar');

        if (toast) {
            toast.style.display = 'flex';
            if (projLbl) projLbl.innerHTML = `Manual Injection: <span style="color:var(--primary); font-weight:bold;">Copy Mode Active</span>`;
            if (injLbl) injLbl.innerHTML = `Waiting for manual copy (8s)...`;
            if (projBar) projBar.style.width = '100%';
            if (injBar) injBar.style.width = '0%';
        }
        if (webBar) { webBar.style.width = '100%'; webBar.style.background = 'var(--primary)'; webBar.style.transition = 'width 0.5s linear'; }

        const { clipboard } = require('electron'); const initialClipboard = clipboard.readText(); let timeoutTicks = 0; 
        clipboardInterval = setInterval(() => {
            timeoutTicks++; const currentClipboard = clipboard.readText();
            if (webBar) webBar.style.width = `${Math.max(0, 100 - (timeoutTicks / 16) * 100)}%`;
            if (currentClipboard && currentClipboard !== initialClipboard) {
                area.value = currentClipboard; cleanup();
                setTimeout(() => { document.getElementById('tab-local-agent')?.click(); saveBtn.click(); }, 300);
            } else if (timeoutTicks >= 16) { cleanup(); document.getElementById('tab-local-agent')?.click(); }
        }, 500); 
    });
}

const extractScript = `(function(){
    const selectors = [
        'model-response .markdown', 
        'message-content .markdown-prose', 
        '[data-testid="message-content"]', 
        '.response-content'
    ];
    
    let targetNode = null;
    for (let sel of selectors) {
        const nodes = document.querySelectorAll(sel);
        if (nodes.length > 0) {
            targetNode = nodes[nodes.length - 1]; // 가장 최신 응답
            break;
        }
    }
    
    if (!targetNode) return "[EXTRACT_FAIL]"; // 못 찾으면 에러 플래그 반환
    
    const clone = targetNode.cloneNode(true);
    clone.querySelectorAll('script, style, button, a[role="link"], [role="button"], .carousel, .suggestions-container, [aria-label*="추천"], .code-block-header, .code-header, [class*="code-header"]').forEach(el => el.remove());
    
    // HTML to Markdown 재귀 파서
    const toMarkdown = (node) => {
        if (node.nodeType === 3) {
            return node.nodeValue;
        }
        if (node.nodeType !== 1) {
            return "";
        }
        
        const tag = node.tagName.toLowerCase();
        let childrenMarkdown = "";
        node.childNodes.forEach(child => {
            childrenMarkdown += toMarkdown(child);
        });
        
        switch (tag) {
            case 'h1': return "\\n# " + childrenMarkdown.trim() + "\\n";
            case 'h2': return "\\n## " + childrenMarkdown.trim() + "\\n";
            case 'h3': return "\\n### " + childrenMarkdown.trim() + "\\n";
            case 'h4': return "\\n#### " + childrenMarkdown.trim() + "\\n";
            case 'p': return "\\n" + childrenMarkdown.trim() + "\\n";
            case 'br': return "\\n";
            case 'strong':
            case 'b': return "**" + childrenMarkdown.trim() + "**";
            case 'em':
            case 'i': return "*" + childrenMarkdown.trim() + "*";
            case 'code': {
                const text = node.textContent || "";
                const parentTag = (node.parentNode && node.parentNode.tagName) ? node.parentNode.tagName.toLowerCase() : "";
                const parentClassList = (node.parentNode && node.parentNode.classList) ? node.parentNode.classList : null;
                const isBlock = parentTag === 'pre' || 
                                parentTag === 'code-block' ||
                                (parentClassList && parentClassList.contains('code-block')) ||
                                (parentClassList && parentClassList.contains('code-code')) ||
                                text.trim().includes('\\n');
                return isBlock ? "\\n\`\`\`\\n" + childrenMarkdown.trim() + "\\n\`\`\`\\n" : "\`" + childrenMarkdown.trim() + "\`";
            }
            case 'pre':
            case 'code-block': return "\\n" + childrenMarkdown.trim() + "\\n";
            case 'li': {
                const parentTag = (node.parentNode && node.parentNode.tagName) ? node.parentNode.tagName.toLowerCase() : "";
                const isOrdered = parentTag === 'ol';
                if (isOrdered) {
                    const siblings = Array.from(node.parentNode.children || []);
                    const idx = siblings.indexOf(node) + 1;
                    return "\\n" + idx + ". " + childrenMarkdown.trim();
                }
                return "\\n- " + childrenMarkdown.trim();
            }
            case 'ul': return "\\n" + childrenMarkdown + "\\n";
            case 'ol': return "\\n" + childrenMarkdown + "\\n";
            case 'blockquote': return "\\n> " + childrenMarkdown.trim().split("\\n").join("\\n> ") + "\\n";
            default: return childrenMarkdown;
        }
    };
    
    return toMarkdown(clone).replace(/\\n{3,}/g, "\\n\\n").trim();
})()`;

const cleanGarbage = (t) => {
    if (!t) return "";
    let cleaned = t;

    // [🛠️ 강화: JS 코드 패턴 제거 (Gemini 페이지 가비지)]
    cleaned = cleaned.replace(/\(function\(\)\{[\s\S]*?\}\.call\(this\);/gi, "");
    cleaned = cleaned.replace(/this\.gbar_\s*=\s*this\.gbar_[\s\S]*?\}/gi, '');
    cleaned = cleaned.replace(/'use strict';[\s\S]{0,500}/gi, '');
    cleaned = cleaned.replace(/WIZ_global_data[\s\S]*?;/gi, '');
    cleaned = cleaned.replace(/google\.\w+[\s\S]{0,200}\{[\s\S]{0,500}\}/gi, '');

    const footers = [
        /Gemini는 AI이며 인물 등에 관한 정보 제공 시 실수를 할 수 있습니다.*/gi,
        /개인 정보 보호 및 Gemini새 창에서 열기/gi,
        /Gemini의 응답/gi,
        /Gemini may display inaccurate info.*/gi,
        /Your privacy and Gemini Apps/gi,
        /새 창에서 열기/gi
    ];
    footers.forEach(regex => { cleaned = cleaned.replace(regex, ""); });

    cleaned = cleaned.replace(/^[ \t\W]*(Thinking|Thought|Analyzing|Searching|Working|\[SYSTEM\]|Processing|Reasoning).*?(\n|$)/gim, "");
    cleaned = cleaned.replace(/[(\[]\s*(Thinking|Thought|Analyzing|Reasoning).*?\s*[)\]]/gi, "");
    cleaned = cleaned.replace(/^\s*(Thinking|Thought|Analyzing|Reasoning)(\.\.\.|\.)*\s*/gi, "");
    cleaned = cleaned.split("\n").filter(line => { const l = line.trim().toLowerCase(); return !(l === "thinking" || l === "thought" || l === "reasoning" || l.startsWith("thought for")); }).join("\n");
    
    return cleaned.trim();
};

async function runExperimentalEngine(cmd, msg, statusBub) {
    window.isNewResponse = true;
    window.lastActiveAiBubble = null;
    let stableN = 0;
    let currentExtension = 0;

    const wv = document.getElementById('active-agent-webview');
    const webBarCont = document.getElementById('web-extract-progress-container');
    const webBar = document.getElementById('web-extract-progress-bar');
    
    if (!wv || !wv.src || wv.src.startsWith('about:blank')) {
        const toast = document.getElementById('injection-toast');
        const projLbl = document.getElementById('project-pct-label');
        const injLbl = document.getElementById('inject-pct-label');
        const projBar = document.getElementById('toast-project-progress-bar');
        const injBar = document.getElementById('toast-inject-progress-bar');

        if (toast) {
            toast.style.display = 'flex';
            if (projLbl) projLbl.innerHTML = `⚠️ <span style="color:var(--primary); font-weight:bold;">No Agent Selected</span>`;
            if (injLbl) injLbl.innerHTML = `Please select an AI agent from the Browser tab first.`;
            if (projBar) projBar.style.width = '0%';
            if (injBar) injBar.style.width = '0%';
            
            setTimeout(() => { 
                toast.style.display = 'none'; 
            }, 4000);
        }
        return null;
    }

    if (webBarCont) {
        webBarCont.style.display = 'block'; webBarCont.style.cursor = 'pointer'; 
        webBarCont.onclick = (e) => {
            const rect = webBarCont.getBoundingClientRect(); const clickPos = (e.clientX - rect.left) / rect.width; const reversedPos = 1 - clickPos;
            if (stableN >= 0) { stableN = Math.floor(reversedPos * 8); } else { const targetPos = Math.floor(reversedPos * (currentExtension + 8)); stableN = targetPos - currentExtension; }
            updateUI(stableN < 0 ? "Wait time adjusted (Extended)" : "Wait time adjusted", 0);
        };
    }
    if (webBar) { webBar.style.width = '0%'; webBar.style.background = '#0078d4'; }

    let manualAbort = false, resolveManual = null; const manualPromise = new Promise(res => { resolveManual = res; });

    if (statusBub) {
        const content = statusBub.querySelector('.bubble-content');
        if (content) {
            content.innerHTML = `<div class="status-text">[SYSTEM] AI working...</div><button class="manual-fetch-btn" style="margin-top:8px; padding:4px 10px; background:#222; border:1px solid #333; color:#aaa; border-radius:4px; font-size:11px; cursor:pointer; transition:0.2s;">Manual Fetch</button>`;
            content.querySelector('.manual-fetch-btn').onclick = async () => { manualAbort = true; const manualVal = await showManualInputUI(statusBub); if (resolveManual) resolveManual(manualVal); };
        }
    }

    const updateUI = (text, progress = 0, isStableMode = false) => {
        if (statusBub && !manualAbort) { const txtEl = statusBub.querySelector('.status-text'); if (txtEl) txtEl.innerText = `[SYSTEM] ${text}`; }
        const toast = document.getElementById('injection-toast');
        const injLbl = document.getElementById('inject-pct-label');
        const injBar = document.getElementById('toast-inject-progress-bar');
        
        if (toast && !manualAbort) {
            toast.style.display = window.hideUIOverlay ? 'none' : 'flex';
            if (injLbl) {
                let prefix = "System Status";
                if (text.includes('typing') || text.includes('responding') || text.includes('complete')) {
                    prefix = "AI Status";
                }
                injLbl.innerHTML = `${prefix}: <span style="color: var(--primary); font-weight: bold;">${text}</span>`;
            }
            if (injBar) {
                if (text.includes('complete') || text.includes('Fetching')) {
                    injBar.style.width = '100%';
                    injBar.style.background = 'var(--primary)';
                } else if (text.includes('typing')) {
                    const charCount = parseInt(text.match(/\d+/) || '0');
                    const simulatedProgress = Math.min(90, 30 + Math.floor(charCount / 20));
                    injBar.style.width = `${simulatedProgress}%`;
                    injBar.style.background = 'var(--primary)';
                } else {
                    injBar.style.width = '15%';
                    injBar.style.background = '#333';
                }
            }
        }

        if (webBar) {
            const p = isStableMode ? progress : stableN;
            if (p > 0) { webBar.style.width = `${Math.max(0, 100 - (p / 8) * 100)}%`; webBar.style.background = 'var(--primary)'; } 
            else if (p < 0) { webBar.style.width = `${Math.max(0, 100 - ((p + currentExtension) / (currentExtension + 8)) * 100)}%`; webBar.style.background = 'var(--primary)'; } 
            else { webBar.style.width = '100%'; webBar.style.background = 'var(--primary)'; }
        }
    };

    const hideGlobalUI = () => {
        if (!window.autoContinueOnRead) {
            const toast = document.getElementById('injection-toast');
            if (toast) toast.style.display = 'none';
        }
        if (webBarCont) webBarCont.style.display = 'none';
    };

    window.activeAiResponding = true;
    const initialText = cleanGarbage(await wv.executeJavaScript(extractScript).catch(() => ""));
    let isGenerating = false;
    let lastText = "";
    let stableCount = 0;

    for (let i = 0; i < 2400; i++) { // 최대 20분 대기 (2400 * 500ms)
        await new Promise(r => setTimeout(r, 500));
        if (manualAbort) { hideGlobalUI(); return await manualPromise; }

        let delta = await wv.executeJavaScript(extractScript).catch(() => "");
        
        if (delta === "[EXTRACT_FAIL]") {
            delta = ""; 
        } else {
            delta = cleanGarbage(delta);
        }

        if (delta === initialText) {
            delta = ""; 
        } else {
            if (initialText && delta.startsWith(initialText)) {
                delta = delta.substring(initialText.length).trim();
            }
        }

        if (!isGenerating && delta.length > 0) {
            isGenerating = true;
            updateUI("AI started responding...", 0, false);
        }

        if (isGenerating) {
            const isTextStopped = (delta === lastText);
            
            if (isTextStopped && delta.length > 0) {
                stableCount++; 
            } else {
                stableCount = 0;
            }
            lastText = delta;

            if (stableCount >= 4) {
                updateUI("Generation complete! Fetching...", 100); 
                
                const hasCmd = /\[CMD:\s*([^\]]+)\]/gi.test(delta);
                if (window.autoContinueOnRead && hasCmd) {
                    const webBarCont = document.getElementById('toast-web-progress-container');
                    if (webBarCont) webBarCont.style.display = 'none';
                } else {
                    hideGlobalUI(); 
                }
                
                window.activeAiResponding = false;
                return cleanGarbage(delta);
            } else {
                updateUI(`AI is typing... (${delta.length} chars)`, 50, false);
            }
        } else {
            updateUI("Waiting for AI to start...", 0, false);
            if (i >= 30) {
                hideGlobalUI();
                window.activeAiResponding = false;
                ChatUI.appendBubble('system', '[SYSTEM] Web AI response start timeout (15s). Releasing lock.');
                return null;
            }
        }
    }
    window.activeAiResponding = false;
    if (manualAbort) { hideGlobalUI(); return await manualPromise; } hideGlobalUI(); return null;
}
