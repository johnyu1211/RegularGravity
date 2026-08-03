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
                    const fs = require('fs');
                    const path = require('path');
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

    const triggerEmoteAfterRender = () => {
        if (window.useEmote !== false && typeof window.parseAndTriggerEmote === 'function') {
            window.parseAndTriggerEmote(response, true);
        }
    };

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

            // Trigger Emote Popup AFTER message rendering & syntax highlighting are 100% complete
            setTimeout(triggerEmoteAfterRender, 200);
            return;
        }
    }
    const wv = document.getElementById('active-agent-webview');
    const getWebIcon = (w) => { try { return `https://www.google.com/s2/favicons?domain=${new URL(w.src).hostname}&sz=64`; } catch { return null; } };
    window.lastActiveAiBubble = ChatUI.appendBubble('ai', response, false, getWebIcon(wv));
    
    // Trigger Emote Popup AFTER bubble creation & DOM append are 100% complete
    setTimeout(triggerEmoteAfterRender, 200);
};
