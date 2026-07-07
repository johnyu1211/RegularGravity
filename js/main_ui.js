const fs = require('fs');
if (typeof ipcRenderer === 'undefined') { var { ipcRenderer } = require('electron'); }

window.totalFilesCount = 0;
window.readFilesSet = new Set();
window.currentBatchFileCount = 0;
window.currentPath = process.cwd();

window.reloadAgentSettings = function() {
    const _path = require('path');
    const _fs = require('fs');
    const p = _path.join(window.currentPath || process.cwd(), 'Settings.json');
    try {
        if (_fs.existsSync(p)) {
            const settings = JSON.parse(_fs.readFileSync(p, 'utf-8'));
            window.autoContinueOnRead = !!settings.autoContinueOnRead;
            window.hideUIOverlay = !!settings.hideUIOverlay;
            return;
        }
    } catch(e) {}
    window.autoContinueOnRead = false;
    window.hideUIOverlay = false;
};

window.fetchDirContent = async (p) => await ipcRenderer.invoke('get-directory-content', p);

function formatPathDisplay(pathStr) {
    if (pathStr === 'DRIVES') return 'THIS PC';
    if (!pathStr) return '';
    const parts = pathStr.split(/[\\/]/).filter(Boolean);
    if (parts.length > 2) {
        const lastTwo = parts.slice(-2);
        return `... \\ ${lastTwo[0]} \\ ${lastTwo[1]}`;
    }
    return pathStr;
}

let _loadDirSeq = 0;
window.loadDirectory = async (p) => {
    const seq = ++_loadDirSeq;
    try {
        window.currentPath = p; 
        updateTerminalPrompt();
        document.getElementById('path-display').innerHTML = `<span class="path-segment">${formatPathDisplay(p)}</span>`;
        const badge = document.getElementById('active-project-badge'); if (badge) badge.innerText = p === 'DRIVES' ? 'PC' : p.split(/[\\\/]/).pop().toUpperCase() || 'PORMSG';
        const f = await window.fetchDirContent(p === 'DRIVES' ? '' : p);
        if (seq !== _loadDirSeq) return; 
        if (f == null) return;           
        if (window.renderTree) window.renderTree(p, f);
        
        const copyBtn = document.getElementById('path-copy-btn');
        const container = document.getElementById('path-display-container');
        if (container && copyBtn && !window.hasPathCopyBind) {
            container.onclick = async (e) => {
                e.stopPropagation();
                if (window.currentPath && window.currentPath !== 'DRIVES') {
                    await navigator.clipboard.writeText(window.currentPath);
                    const pathDisplay = document.getElementById('path-display');
                    if (pathDisplay) {
                        const originalHTML = pathDisplay.innerHTML;
                        pathDisplay.innerHTML = `<span style="color: #10b981; font-weight: 600;">Copied!</span>`;
                        copyBtn.style.opacity = '1';
                        copyBtn.style.color = '#10b981';
                        const originalSvg = copyBtn.innerHTML;
                        copyBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                        
                        setTimeout(() => {
                            pathDisplay.innerHTML = originalHTML;
                            copyBtn.innerHTML = originalSvg;
                            copyBtn.style.color = '';
                            copyBtn.style.opacity = '';
                        }, 1000);
                    }
                }
            };
            window.hasPathCopyBind = true;
        }
        const revealBtn = document.getElementById('reveal-btn');
        if (revealBtn && !window.hasRevealBind) {
            revealBtn.onclick = (e) => {
                e.stopPropagation();
                if (window.currentPath && window.currentPath !== 'DRIVES') {
                    const { ipcRenderer } = require('electron');
                    ipcRenderer.send('reveal-in-explorer', window.currentPath);
                }
            };
            window.hasRevealBind = true;
        }
    } catch (e) { }
};

if (!window.hasEditorSearchBind) {
    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
            const searchInput = document.getElementById('editor-search-input');
            if (searchInput && searchInput.offsetParent !== null) { e.preventDefault(); searchInput.focus(); searchInput.select(); }
        }
    });
    window.hasEditorSearchBind = true;
}

const syncBrowserView = (() => {
    let syncPending = false;
    return () => {
        if (syncPending) return; syncPending = true;
        requestAnimationFrame(() => {
            try {
                const dock = document.getElementById('agent-view-dock'), hub = document.getElementById('inspector-browser-hub');
                if (dock && hub && hub.style.display === 'flex' && document.getElementById('agent-hub-webview')?.style.display === 'flex') {
                    const rect = dock.getBoundingClientRect();
                    ipcRenderer.send('sync-agent-view-bounds', { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) });
                }
            } catch (e) { }
            syncPending = false;
        });
    };
})();

const CRITICAL_RULE_SUFFIX = `

[CRITICAL RULE]
1. 아직 전체 프로젝트가 파악되지 않았다면, 읽은 파일에 대해 설명하지 말고 빠르게 다음 탐색할 [CMD: ...] 명령어만 단답형으로 제출하십시오.
2. 파일의 구조나 함수 목록만 파악할 때(코드 아웃라인/개요 정보만 전송)는 [CMD: read-file "파일명"] 을 사용하십시오.
3. 세부 로직을 정밀 분석/수정할 때는 [CMD: read-file-full "파일명"] 을 사용하십시오. (단, 한 턴에 최대 200줄 제한으로 잘려서 전송됩니다.)
4. 특정 라인 범위(최대 200줄 한도)만 지정해서 읽고 싶다면 [CMD: read-file-range "파일명" 시작줄-끝줄] (예: [CMD: read-file-range "main.js" 1-200] 또는 [CMD: read-file-range "main.js" 201-400]) 을 적극적으로 사용하십시오.
5. 특정 함수나 텍스트를 파일 내에서 검색하여 라인 번호를 찾으려면 [CMD: search-file "파일명" "검색어"] 를 사용하십시오. (예: [CMD: search-file "main.js" "createWindow"])
6. 프로젝트 전역에서 특정 함수나 텍스트를 검색하려면 [CMD: search-all "검색어"] 를 사용하십시오. (예: [CMD: search-all "setupUI"])
7. 유저가 구체적인 오류 해결이나 개발 작업을 요청했을 경우, 관련 코드의 위치나 세부 사항을 짐작하여 대안을 작성하지 마십시오. 반드시 search-all 이나 search-file 명령어로 관련 로직이 위치한 라인을 검색하고, 해당 영역의 코드 본문을 read-file-range 명령어로 필요한 만큼(200줄씩) 확실하게 읽어서 분석한 뒤 작업을 진행하십시오.
8. 파일 탐색 및 파악이 최종적으로 완료되었다면 자의적인 향후 작업 계획 수립이나 임의의 대안 작성을 일절 중단하십시오. 오직 파악된 현재 프로젝트 구조 및 핵심 기능에 대해서만 간결히 설명한 후, 유저의 구체적인 지시(Wait for user instructions)를 대기하십시오.`;

function detectAndAskCommand(text) {
    if (!text) return;

    const cmdRegex = /\[CMD:\s*([^\]]+)\]/gi;
    let match;
    const foundCmds = [];
    while ((match = cmdRegex.exec(text)) !== null) {
        const cleanCmd = match[1].trim();
        if (cleanCmd) foundCmds.push(cleanCmd);
    }

    if (foundCmds.length === 0) {
        if (window.autoContinueOnRead) {
            const toast = document.getElementById('injection-toast');
            if (toast) toast.style.display = 'none';
            document.getElementById('tab-local-agent')?.click();
        }
        return;
    }

    const readCmds = [];
    const writeCmds = [];
    const searchCmds = [];
    const otherCmds = [];

    foundCmds.forEach(rawCmd => {
        let cmd = rawCmd.replace(/\\"/g, '"')
                        .replace(/\\'/g, "'")
                        .replace(/&quot;/gi, '"')
                        .replace(/&apos;/gi, "'")
                        .replace(/[“”]/g, '"')
                        .replace(/[‘’]/g, "'")
                        .trim();

        const fileMatch = cmd.match(/^read-file\s+["']?([^"'\s]+)["']?$/i);
        const fileFullMatch = cmd.match(/^read-file-full\s+["']?([^"'\s]+)["']?$/i);
        const rangeMatch = cmd.match(/^read-file-range\s+["']?([^"']+)["']?\s+(\d+)-(\d+)$/i);
        const writeMatch = cmd.match(/^write-file\s+["']?([^"'\s]+)["']?$/i);
        const searchFileMatch = cmd.match(/^search-file\s+["']?([^"'\s]+)["']?\s+["']?([^"']+)["']?$/i);
        const searchAllMatch = cmd.match(/^search-all\s+["']?([^"']+)["']?$/i);

        if (rangeMatch) {
            const filePath = rangeMatch[1].trim();
            readCmds.push({ path: filePath, full: false, range: true, start: parseInt(rangeMatch[2]), end: parseInt(rangeMatch[3]) });
        } else if (fileFullMatch) {
            const filePath = fileFullMatch[1].trim();
            readCmds.push({ path: filePath, full: true });
        } else if (fileMatch) {
            const filePath = fileMatch[1].trim();
            readCmds.push({ path: filePath, full: false });
        } else if (writeMatch) {
            const filePath = writeMatch[1].trim();
            const cmdIdx = text.indexOf(rawCmd);
            let codeVal = "";
            if (cmdIdx !== -1) {
                const subText = text.substring(cmdIdx);
                const codeBlockMatch = subText.match(/```[a-zA-Z]*\n([\s\S]*?)\n```/);
                if (codeBlockMatch) codeVal = codeBlockMatch[1];
            }
            writeCmds.push({ path: filePath, code: codeVal });
        } else if (searchFileMatch) {
            searchCmds.push({ type: 'file', path: searchFileMatch[1].trim(), query: searchFileMatch[2].trim() });
        } else if (searchAllMatch) {
            searchCmds.push({ type: 'all', query: searchAllMatch[1].trim() });
        } else {
            otherCmds.push(cmd);
        }
    });

    const hasReadFile = (readCmds.length > 0);
    const hasWriteFile = (writeCmds.length > 0);
    const hasSearchFile = (searchCmds.length > 0);

    if (!hasReadFile && !hasWriteFile && !hasSearchFile && window.autoContinueOnRead) {
        const toast = document.getElementById('injection-toast');
        if (toast) toast.style.display = 'none';
        document.getElementById('tab-local-agent')?.click();
    }

    if (hasReadFile) {
        const displayCmd = readCmds.map(f => {
            if (f.range) return `read-file-range "${f.path}" ${f.start}-${f.end}`;
            return `${f.full ? 'read-file-full' : 'read-file'} "${f.path}"`;
        }).join(', ');
        
        const box = ChatUI.appendBubble('system', '');
        const content = box.querySelector('.bubble-content');
        const themeColor = "#468CF6"; 
        const glowShadow = "rgba(70, 140, 246, 0.15)";

        content.innerHTML = `
            <div style="background: var(--surface-low); padding: 12px 14px; border-radius: 8px; border: 1px solid var(--border-color); font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--text-main); margin-bottom: 12px; line-height: 1.5; word-break: break-all; box-shadow: inset 0 2px 4px rgba(0,0,0,0.15); margin-top: 4px;">
                <span style="color: var(--text-muted); font-weight: bold; margin-right: 6px;">📄</span>${displayCmd}
            </div>
            <div style="display: flex; gap: 8px;">
                <button class="cmd-run-btn" style="flex: 1; background: linear-gradient(135deg, ${themeColor}, ${themeColor}dd); color: white; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 700; font-size: 11.5px; letter-spacing: 0.04em; font-family: 'DM Sans', 'Outfit', sans-serif; transition: all 0.2s; box-shadow: 0 2px 6px ${glowShadow};">CONTINUE</button>
                <button class="cmd-cancel-btn" style="flex: 1; background: rgba(255, 255, 255, 0.04); color: var(--text-muted); border: 1px solid var(--border-color); padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 11.5px; letter-spacing: 0.04em; font-family: 'DM Sans', 'Outfit', sans-serif; transition: all 0.2s;">CANCEL</button>
            </div>
        `;

        const runBtn = content.querySelector('.cmd-run-btn');
        const cancelBtn = content.querySelector('.cmd-cancel-btn');
        if (runBtn) {
            runBtn.onmouseenter = () => { runBtn.style.filter = "brightness(1.15)"; runBtn.style.boxShadow = "0 4px 12px rgba(70, 140, 246, 0.3)"; };
            runBtn.onmouseleave = () => { runBtn.style.filter = "none"; runBtn.style.boxShadow = `0 2px 6px ${glowShadow}`; };
        }
        if (cancelBtn) {
            cancelBtn.onmouseenter = () => { cancelBtn.style.background = "rgba(255, 255, 255, 0.08)"; cancelBtn.style.color = "var(--text-main)"; cancelBtn.style.borderColor = "rgba(255,255,255,0.15)"; };
            cancelBtn.onmouseleave = () => { cancelBtn.style.background = "rgba(255, 255, 255, 0.04)"; cancelBtn.style.color = "var(--text-muted)"; cancelBtn.style.borderColor = "var(--border-color)"; };
        }

        if (window.autoContinueOnRead) {
            setTimeout(() => {
                const btn = content.querySelector('.cmd-run-btn');
                if (btn) {
                    ChatUI.appendBubble('system', `[SYSTEM] Auto-continuing batch read for ${readCmds.length} files...`);
                    btn.click();
                }
            }, 800);
        }

        content.querySelector('.cmd-run-btn').onclick = async () => {
            box.remove();
            
            const chatOverlay = document.getElementById('local-chat-overlay');
            const progressBox = document.getElementById('overlay-progress-box');
            const projBtn = document.getElementById('btn-send-project-info');
            if (!window.autoContinueOnRead && chatOverlay && progressBox && projBtn) {
                chatOverlay.style.display = 'flex';
                projBtn.style.display = 'none';
                progressBox.style.display = 'flex';
            }

            window.currentBatchFileCount = readCmds.length;

            if (!window.autoContinueOnRead) document.getElementById('tab-browser-hub')?.click();

            try {
                const fs = require('fs');
                const path = require('path');
                
                let combinedPayload = "";

                for (let i = 0; i < readCmds.length; i++) {
                    const fileObj = readCmds[i];
                    const filePath = fileObj.path;
                    window.readFilesSet.add(filePath);
                    
                    let fileContentPayload = "";
                    const targetPath = path.resolve(window.currentPath, filePath);
                    if (fs.existsSync(targetPath)) {
                        const rawContent = fs.readFileSync(targetPath, 'utf-8');
                        const allLines = rawContent.replace(/\r/g, '').split('\n');
                        
                        if (fileObj.range) {
                            let startIdx = Math.max(0, fileObj.start - 1);
                            let endIdx = Math.min(allLines.length, fileObj.end);
                            let isTruncated = false;
                            
                            if (endIdx - startIdx > 200) {
                                endIdx = startIdx + 200;
                                isTruncated = true;
                            }
                            
                            let slicedContent = allLines.slice(startIdx, endIdx).join('\n');
                            if (isTruncated) {
                                const nextStart = endIdx + 1;
                                const nextEnd = nextStart + 199;
                                slicedContent += `\n// ... [TRUNCATED: Max 200 lines limit per turn reached. If you need to read the next part, please output [CMD: read-file-range "${filePath}" ${nextStart}-${nextEnd}]]`;
                            }
                            fileContentPayload = `[FILE DATA (LINE RANGE ${fileObj.start}-${fileObj.start + (endIdx - startIdx) - 1}): ${filePath}]\n\`\`\`\n${slicedContent}\n\`\`\`\n\n`;
                        } else if (fileObj.full) {
                            let endIdx = allLines.length;
                            let isTruncated = false;
                            
                            if (endIdx > 200) {
                                endIdx = 200;
                                isTruncated = true;
                            }
                            
                            let slicedContent = allLines.slice(0, endIdx).join('\n');
                            if (isTruncated) {
                                slicedContent += `\n// ... [TRUNCATED: Max 200 lines limit per turn reached. If you need to read the next part, please output [CMD: read-file-range "${filePath}" 201-400]]`;
                            }
                            fileContentPayload = `[FILE DATA (${isTruncated ? 'PARTIAL CONTENT' : 'FULL CONTENT'}): ${filePath}]\n\`\`\`\n${slicedContent}\n\`\`\`\n\n`;
                        } else {
                            const ext = filePath.split('.').pop().toLowerCase();
                            const fileContent = extractCodeOutline(rawContent, ext);
                            fileContentPayload = `[FILE DATA (OUTLINE ONLY): ${filePath}]\n\`\`\`\n${fileContent}\n\`\`\`\n\n`;
                        }
                    } else {
                        fileContentPayload = `[FILE DATA ERROR: ${filePath} not found on the local machine]\n\n`;
                    }

                    combinedPayload += fileContentPayload;
                    ChatUI.appendBubble('system', `[SYSTEM] Prepared ${filePath} context.`);
                }

                combinedPayload += "Proceed to analyze the files above.";

                if (typeof window.updateSendProgress === 'function') {
                    window.updateSendProgress(window.readFilesSet.size, window.totalFilesCount);
                }

                await injectWebPayload(combinedPayload, readCmds.length, readCmds.length, false, true);
                ChatUI.appendBubble('system', `[SYSTEM] Sent all prepared ${readCmds.length} files to Web AI.`);

                const response = await runExperimentalEngine('/marktag', combinedPayload, null);

                if (response) {
                    // Handled by mirror
                }
            } catch (err) {
                ChatUI.appendBubble('system', `[ERROR] Failed to read files batch: ${err.message}`);
            } finally {
                if (!window.autoContinueOnRead) {
                    document.getElementById('tab-local-agent')?.click();
                }

                if (!window.autoContinueOnRead && chatOverlay && progressBox && projBtn) {
                    chatOverlay.style.display = 'none';
                    progressBox.style.display = 'none';
                    projBtn.style.display = 'flex';
                }
            }
        };

        content.querySelector('.cmd-cancel-btn').onclick = () => box.remove();
    }

    if (hasWriteFile) {
        const displayCmd = writeCmds.map(f => `write-file "${f.path}"`).join(', ');
        const box = ChatUI.appendBubble('system', '');
        const content = box.querySelector('.bubble-content');
        const themeColor = "#468CF6"; 
        const glowShadow = "rgba(70, 140, 246, 0.15)";

        content.innerHTML = `
            <div style="background: var(--surface-low); padding: 12px 14px; border-radius: 8px; border: 1px solid var(--border-color); font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--text-main); margin-bottom: 12px; line-height: 1.5; word-break: break-all; box-shadow: inset 0 2px 4px rgba(0,0,0,0.15); margin-top: 4px;">
                <span style="color: var(--primary); font-weight: bold; margin-right: 6px;">✏️</span>${displayCmd}
            </div>
            <div style="display: flex; gap: 8px;">
                <button class="cmd-run-btn" style="flex: 1; background: linear-gradient(135deg, ${themeColor}, ${themeColor}dd); color: white; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 700; font-size: 11.5px; letter-spacing: 0.04em; font-family: 'DM Sans', 'Outfit', sans-serif; transition: all 0.2s; box-shadow: 0 2px 6px ${glowShadow};">CONTINUE</button>
                <button class="cmd-cancel-btn" style="flex: 1; background: rgba(255, 255, 255, 0.04); color: var(--text-muted); border: 1px solid var(--border-color); padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 11.5px; letter-spacing: 0.04em; font-family: 'DM Sans', 'Outfit', sans-serif; transition: all 0.2s;">CANCEL</button>
            </div>
        `;

        const runBtn = content.querySelector('.cmd-run-btn');
        const cancelBtn = content.querySelector('.cmd-cancel-btn');
        if (runBtn) {
            runBtn.onmouseenter = () => { runBtn.style.filter = "brightness(1.15)"; runBtn.style.boxShadow = "0 4px 12px rgba(70, 140, 246, 0.3)"; };
            runBtn.onmouseleave = () => { runBtn.style.filter = "none"; runBtn.style.boxShadow = `0 2px 6px ${glowShadow}`; };
        }
        if (cancelBtn) {
            cancelBtn.onmouseenter = () => { cancelBtn.style.background = "rgba(255, 255, 255, 0.08)"; cancelBtn.style.color = "var(--text-main)"; cancelBtn.style.borderColor = "rgba(255,255,255,0.15)"; };
            cancelBtn.onmouseleave = () => { cancelBtn.style.background = "rgba(255, 255, 255, 0.04)"; cancelBtn.style.color = "var(--text-muted)"; cancelBtn.style.borderColor = "var(--border-color)"; };
        }

        if (window.autoContinueOnRead) {
            setTimeout(() => {
                const btn = content.querySelector('.cmd-run-btn');
                if (btn) {
                    ChatUI.appendBubble('system', `[SYSTEM] Auto-continuing batch write for ${writeCmds.length} files...`);
                    btn.click();
                }
            }, 800);
        }

        content.querySelector('.cmd-run-btn').onclick = async () => {
            box.remove();
            await executeWriteFileBatch(writeCmds);
        };

        content.querySelector('.cmd-cancel-btn').onclick = () => box.remove();
    }

    if (hasSearchFile) {
        const displayCmd = searchCmds.map(s => {
            if (s.type === 'file') return `search-file "${s.path}" "${s.query}"`;
            return `search-all "${s.query}"`;
        }).join(', ');
        const box = ChatUI.appendBubble('system', '');
        const content = box.querySelector('.bubble-content');
        const themeColor = "#468CF6"; 
        const glowShadow = "rgba(70, 140, 246, 0.15)";

        content.innerHTML = `
            <div style="background: var(--surface-low); padding: 12px 14px; border-radius: 8px; border: 1px solid var(--border-color); font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--text-main); margin-bottom: 12px; line-height: 1.5; word-break: break-all; box-shadow: inset 0 2px 4px rgba(0,0,0,0.15); margin-top: 4px;">
                <span style="color: var(--primary); font-weight: bold; margin-right: 6px;">🔍</span>${displayCmd}
            </div>
            <div style="display: flex; gap: 8px;">
                <button class="cmd-run-btn" style="flex: 1; background: linear-gradient(135deg, ${themeColor}, ${themeColor}dd); color: white; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 700; font-size: 11.5px; letter-spacing: 0.04em; font-family: 'DM Sans', 'Outfit', sans-serif; transition: all 0.2s; box-shadow: 0 2px 6px ${glowShadow};">CONTINUE</button>
                <button class="cmd-cancel-btn" style="flex: 1; background: rgba(255, 255, 255, 0.04); color: var(--text-muted); border: 1px solid var(--border-color); padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 11.5px; letter-spacing: 0.04em; font-family: 'DM Sans', 'Outfit', sans-serif; transition: all 0.2s;">CANCEL</button>
            </div>
        `;

        const runBtn = content.querySelector('.cmd-run-btn');
        const cancelBtn = content.querySelector('.cmd-cancel-btn');
        if (runBtn) {
            runBtn.onmouseenter = () => { runBtn.style.filter = "brightness(1.15)"; runBtn.style.boxShadow = "0 4px 12px rgba(70, 140, 246, 0.3)"; };
            runBtn.onmouseleave = () => { runBtn.style.filter = "none"; runBtn.style.boxShadow = `0 2px 6px ${glowShadow}`; };
        }
        if (cancelBtn) {
            cancelBtn.onmouseenter = () => { cancelBtn.style.background = "rgba(255, 255, 255, 0.08)"; cancelBtn.style.color = "var(--text-main)"; cancelBtn.style.borderColor = "rgba(255,255,255,0.15)"; };
            cancelBtn.onmouseleave = () => { cancelBtn.style.background = "rgba(255, 255, 255, 0.04)"; cancelBtn.style.color = "var(--text-muted)"; cancelBtn.style.borderColor = "var(--border-color)"; };
        }

        if (window.autoContinueOnRead) {
            setTimeout(() => {
                const btn = content.querySelector('.cmd-run-btn');
                if (btn) {
                    ChatUI.appendBubble('system', `[SYSTEM] Auto-continuing search...`);
                    btn.click();
                }
            }, 800);
        }

        content.querySelector('.cmd-run-btn').onclick = async () => {
            box.remove();
            await executeSearchBatch(searchCmds);
        };

        content.querySelector('.cmd-cancel-btn').onclick = () => box.remove();
    }

    otherCmds.forEach(cleanCmd => {
        const box = ChatUI.appendBubble('system', '');
        const content = box.querySelector('.bubble-content');
        const themeColor = "#468CF6"; 
        const glowShadow = "rgba(70, 140, 246, 0.15)";

        content.innerHTML = `
            <div style="background: var(--surface-low); padding: 12px 14px; border-radius: 8px; border: 1px solid var(--border-color); font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--text-main); margin-bottom: 12px; line-height: 1.5; word-break: break-all; box-shadow: inset 0 2px 4px rgba(0,0,0,0.15); margin-top: 4px;">
                <span style="color: var(--text-muted); font-weight: bold; margin-right: 6px;">$</span>${cleanCmd}
            </div>
            <div style="display: flex; gap: 8px;">
                <button class="cmd-run-btn" style="flex: 1; background: linear-gradient(135deg, ${themeColor}, ${themeColor}dd); color: white; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 700; font-size: 11.5px; letter-spacing: 0.04em; font-family: 'DM Sans', 'Outfit', sans-serif; transition: all 0.2s; box-shadow: 0 2px 6px ${glowShadow};">CONTINUE</button>
                <button class="cmd-cancel-btn" style="flex: 1; background: rgba(255, 255, 255, 0.04); color: var(--text-muted); border: 1px solid var(--border-color); padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 11.5px; letter-spacing: 0.04em; font-family: 'DM Sans', 'Outfit', sans-serif; transition: all 0.2s;">CANCEL</button>
            </div>
        `;

        const runBtn = content.querySelector('.cmd-run-btn');
        const cancelBtn = content.querySelector('.cmd-cancel-btn');
        if (runBtn) {
            runBtn.onmouseenter = () => { runBtn.style.filter = "brightness(1.15)"; runBtn.style.boxShadow = "0 4px 12px rgba(70, 140, 246, 0.3)"; };
            runBtn.onmouseleave = () => { runBtn.style.filter = "none"; runBtn.style.boxShadow = `0 2px 6px ${glowShadow}`; };
        }
        if (cancelBtn) {
            cancelBtn.onmouseenter = () => { cancelBtn.style.background = "rgba(255, 255, 255, 0.08)"; cancelBtn.style.color = "var(--text-main)"; cancelBtn.style.borderColor = "rgba(255,255,255,0.15)"; };
            cancelBtn.onmouseleave = () => { cancelBtn.style.background = "rgba(255, 255, 255, 0.04)"; cancelBtn.style.color = "var(--text-muted)"; cancelBtn.style.borderColor = "var(--border-color)"; };
        }

        content.querySelector('.cmd-run-btn').onclick = async () => {
            box.remove();
            
            if (window.activeSubTabId && window.terminalSessions[window.activeSubTabId]) {
                window.terminalSessions[window.activeSubTabId].logs.push({ type: 'cmd', text: `> ${cleanCmd}` });
                window.switchSubTerminal(window.activeSubTabId);
                
                if (cleanCmd.toLowerCase().startsWith('cd ')) {
                    let targetDir = cleanCmd.substring(3).trim().replace(/['"]/g, '');
                    const pathModule = require('path');
                    try {
                        const curCwd = window.terminalSessions[window.activeSubTabId].cwd || window.currentPath || process.cwd();
                        let newPath = '';
                        if (pathModule.isAbsolute(targetDir)) {
                            newPath = targetDir;
                        } else {
                            newPath = pathModule.resolve(curCwd, targetDir);
                        }
                        if (fs.existsSync(newPath) && fs.statSync(newPath).isDirectory()) {
                            window.terminalSessions[window.activeSubTabId].cwd = newPath;
                            if (typeof updateTerminalPrompt === 'function') updateTerminalPrompt();
                        }
                    } catch (err) {
                        console.error(err);
                    }
                }

                ipcRenderer.send('execute-cmd', { 
                    tabId: window.activeSubTabId, 
                    command: cleanCmd, 
                    cwd: window.terminalSessions[window.activeSubTabId].cwd || window.currentPath || process.cwd() 
                });
                
                const tL = document.getElementById('terminal-lower');
                if (tL && tL.offsetHeight <= 40) {
                    tL.style.height = '350px';
                    const minBtn = document.getElementById('minimize-terminal'); 
                    if (minBtn) minBtn.innerText = '▼';
                    if (typeof syncBrowserView === 'function') syncBrowserView();
                }
            }
            
            ChatUI.appendBubble('system', `[EXECUTED] ${cleanCmd}`);
            document.getElementById('tab-browser-hub')?.click();
            const payload = `[SYSTEM] Command \`${cleanCmd}\` executed on the local machine. Proceed with the next step.${CRITICAL_RULE_SUFFIX}`;
            
            try {
                const enginePromise = runExperimentalEngine('/marktag', payload, null);
                await injectWebPayload(payload);
                const response = await enginePromise;
                if (!window.autoContinueOnRead) {
                    document.getElementById('tab-local-agent')?.click();
                }
                if (response) {
                    ChatUI.appendBubble('ai', response, false, getWebIcon(document.getElementById('active-agent-webview')));
                    detectAndAskCommand(response);
                }
            } catch (e) {
                ChatUI.appendBubble('ai', `[ERROR] Command failed: ${e.message}`);
            }
        };

        content.querySelector('.cmd-cancel-btn').onclick = () => box.remove();
    });
}

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
        wv.addEventListener('dom-ready', () => {
            wv.executeJavaScript(`
                window.addEventListener('keydown', (e) => {
                    const key = e.key.toLowerCase();
                    if ((e.controlKey && key === 'r') || e.key === 'F5') {
                        e.preventDefault();
                        location.reload();
                    }
                }, true);
            `);
            wv.executeJavaScript(`
                (() => {
                    let lastSentText = "";
                    let stableTimer = null;
                    const checkAndSend = () => {
                        const bubbles = document.querySelectorAll('message-content, div.message-content, .markdown, .message, div[data-message-author-role="assistant"]');
                        if (bubbles.length === 0) return;
                        let lastAiBubble = null;
                        for (let i = bubbles.length - 1; i >= 0; i--) {
                            const b = bubbles[i];
                            const text = (b.innerText || b.textContent || "").trim();
                            if (text && !b.closest('rich-textarea, div[contenteditable="true"], textarea')) {
                                lastAiBubble = b;
                                break;
                            }
                        }
                        if (!lastAiBubble) return;
                        const currentText = (lastAiBubble.innerText || lastAiBubble.textContent || "").trim();
                        if (!currentText || currentText === lastSentText) return;
                        clearTimeout(stableTimer);
                        stableTimer = setTimeout(() => {
                            lastSentText = currentText;
                            const encoded = btoa(unescape(encodeURIComponent(currentText)));
                            console.log("[BACKGROUND_AI_RESP]:" + encoded);
                        }, 1200);
                    };
                    const observer = new MutationObserver(() => { checkAndSend(); });
                    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
                })();
            `);
        });

        if (!isSilentBoot) {
            wv.addEventListener('did-finish-load', async () => {
                if (window.sessionBriefed || window.briefingInProgress) return;
                window.briefingInProgress = true;
                
                const projectTree = await ipcRenderer.invoke('vault-get-tree');
                if (projectTree) {
                    setTimeout(async () => {
                        try {
                            await injectWebPayload("dont think simply answer me 'A'"); await runExperimentalEngine('/marktag', "dont think simply answer me 'A'", null);
                            ChatUI.appendBubble('system', '[SYSTEM] INITIALIZATION COMPLETE.');
                            
                            const briefPayload = `현재 프로젝트 폴더에는 다음 파일들이 있습니다:
${projectTree}

[SYSTEM INSTRUCTION]
1. 프로젝트 파악을 위해 코드를 분석하십시오. 모든 파일을 다 읽으려 하지 말고, package.json이나 핵심 엔트리 포인트(예: main.js, index.html 등)의 아키텍처를 파악하십시오.
2. 분석할 첫 번째 핵심 소스코드를 읽으려면 반드시 다음 형식의 대괄호 명령어를 본문 답변에 정확히 써서 요청하십시오. 자연어로만 말하면 시스템이 감지하지 못합니다:
- [CMD: read-file "파일명"]
3. 만약 한 번에 여러 소스 파일을 동시에 읽어 분석하고 싶다면, [CMD: read-file "파일명1"] [CMD: read-file "파일명2"] 형태로 여러 개의 명령어를 나열하여 요청하십시오. 시스템이 병합하여 1턴 만에 전송해 줄 것입니다.

이 지침을 숙지했다면 분석을 위해 처음 읽을 핵심 파일을 [CMD: read-file "파일명"] 형태로 즉시 답변하십시오.

[CRITICAL RULE]
1. 아직 전체 프로젝트가 파악되지 않았다면, 읽은 파일에 대해 설명하지 말고 빠르게 다음 탐색할 [CMD: ...] 명령어만 단답형으로 제출하십시오.
2. 파일의 구조나 함수 목록만 파악할 때는 [CMD: read-file "파일명"] 을 사용하십시오.
3. 세부 로직을 정밀 분석/수정할 때는 [CMD: read-file-full "파일명"] 을 사용하십시오. (단, 한 턴에 최대 200줄 제한으로 잘려서 전송됩니다.)
4. 특정 라인 범위(최대 200줄 한도)만 지정해서 읽고 싶다면 [CMD: read-file-range "파일명" 시작줄-끝줄] (예: [CMD: read-file-range "main.js" 1-200] 또는 [CMD: read-file-range "main.js" 201-400]) 을 적극적으로 사용하십시오.
5. 파일 탐색 및 파악이 최종적으로 완료되었다면 자의적인 향후 작업 계획 수립이나 임의의 대안 작성을 일절 중단하십시오. 오직 파악된 현재 프로젝트 구조 및 핵심 기능에 대해서만 간결히 설명한 후, 유저의 구체적인 지시(Wait for user instructions)를 대기하십시오.`.trim();

                            window.currentBatchFileCount = -1;
                            const briefPromise = runExperimentalEngine('/marktag', briefPayload, null);
                            await injectWebPayload(briefPayload, -1);
                            
                            const briefResponse = await Promise.race([
                                briefPromise,
                                new Promise((_, reject) => setTimeout(() => reject(new Error('Briefing response timeout')), 120000))
                            ]);
                            window.sessionBriefed = true;
                            window.briefingInProgress = false;
                            const chatOverlay = document.getElementById('local-chat-overlay');
                            if (chatOverlay) chatOverlay.style.display = 'none';
                            document.getElementById('tab-local-agent').click();
                            if (briefResponse) { ChatUI.appendBubble('ai', briefResponse, false, getWebIcon(wv)); detectAndAskCommand(briefResponse); }
                        } catch (err) {
                            window.sessionBriefed = true;
                            window.briefingInProgress = false;
                            const chatOverlay = document.getElementById('local-chat-overlay');
                            if (chatOverlay) chatOverlay.style.display = 'none';
                            document.getElementById('tab-local-agent').click();
                            ChatUI.appendBubble('system', '[ERROR] INITIALIZATION FAILED.');
                        }
                    }, 2500);
                }
            }, { once: true });
        }

        let lastReceivedMirrorText = "";
        wv.addEventListener('console-message', (e) => {
            if (e.message.startsWith('[BACKGROUND_AI_RESP]:')) {
                try {
                    const base64Data = e.message.split('[BACKGROUND_AI_RESP]:')[1];
                    const decodedText = decodeURIComponent(escape(atob(base64Data))).trim();
                    if (!decodedText) return;
                    if (decodedText === lastReceivedMirrorText) return;
                    
                    const chatLog = document.getElementById('local-chat-messages');
                    if (chatLog) {
                        const existingBubbles = Array.from(chatLog.querySelectorAll('.chat-bubble.ai .bubble-content'));
                        const isDuplicate = existingBubbles.some(bubble => bubble.innerText.trim() === decodedText);
                        if (isDuplicate) {
                            lastReceivedMirrorText = decodedText;
                            return;
                        }
                        
                        if (existingBubbles.length > 0) {
                            const lastBubble = existingBubbles[existingBubbles.length - 1];
                            const lastText = lastBubble.innerText.trim();
                            if (lastText && decodedText.startsWith(lastText)) {
                                lastBubble.innerHTML = typeof marked !== 'undefined' ? marked.parse(decodedText).trim() : decodedText.trim();
                                if (typeof hljs !== 'undefined') {
                                    lastBubble.parentElement.querySelectorAll('pre code').forEach((el) => hljs.highlightElement(el));
                                }
                                lastReceivedMirrorText = decodedText;
                                detectAndAskCommand(decodedText);
                                return;
                            }
                        }
                    }
                    
                    lastReceivedMirrorText = decodedText;
                    ChatUI.appendBubble('ai', decodedText, false, getWebIcon(wv));
                    detectAndAskCommand(decodedText);
                } catch (err) {
                    console.error("[ERROR] Background mirror parsing error:", err);
                }
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

function setupUI() {
    const _path = require('path');
    function getSettingsPath() {
        return _path.join(window.currentPath || process.cwd(), 'Settings.json');
    }
    function loadSettings() {
        try {
            const p = getSettingsPath();
            if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
        } catch(e) {}
        return {};
    }
    function saveSettings(data) {
        try { fs.writeFileSync(getSettingsPath(), JSON.stringify(data, null, 2), 'utf-8'); } catch(e) {}
    }

    window.reloadAgentSettings();

    const localSettingsBtn = document.getElementById('btn-local-settings');
    const localSettingsModal = document.getElementById('local-settings-modal');
    const closeLocalSettings = document.getElementById('close-local-settings');
    const saveLocalSettings = document.getElementById('save-local-settings');
    const chkAutoRead = document.getElementById('chk-auto-read');
    const chkHideOverlay = document.getElementById('chk-hide-overlay');

    if (localSettingsBtn && localSettingsModal) {
        localSettingsBtn.onclick = () => {
            window.reloadAgentSettings(); 
            if (chkAutoRead) chkAutoRead.checked = window.autoContinueOnRead;
            if (chkHideOverlay) chkHideOverlay.checked = window.hideUIOverlay;
            localSettingsModal.style.display = 'flex';
        };
    }
    if (closeLocalSettings && localSettingsModal) {
        closeLocalSettings.onclick = () => {
            localSettingsModal.style.display = 'none';
        };
    }
    if (saveLocalSettings && localSettingsModal) {
        saveLocalSettings.onclick = () => {
            if (chkAutoRead || chkHideOverlay) {
                const current = loadSettings();
                if (chkAutoRead) current.autoContinueOnRead = chkAutoRead.checked;
                if (chkHideOverlay) current.hideUIOverlay = chkHideOverlay.checked;
                saveSettings(current);
                window.reloadAgentSettings(); 
            }
            localSettingsModal.style.display = 'none';
        };
    }

    const tL = document.getElementById('terminal-lower'), tI = document.getElementById('terminal-main-input'), tS = document.getElementById('terminal-content');
    setupHorizontalScroll(document.querySelector('.terminal-tabs')); setupHorizontalScroll(document.getElementById('terminal-sub-tabs'));
    if (tS && tI) tS.onmouseup = () => { if (!window.getSelection().toString()) tI.focus(); };
    if (tI) {
        tI.onkeydown = (e) => {
            if (e.key === 'Enter') {
                const cmd = tI.value.trim(); if (!cmd) return;
                window.terminalSessions[window.activeSubTabId].logs.push({ type: 'cmd', text: `> ${cmd}` }); 
                switchSubTerminal(window.activeSubTabId);
                
                if (cmd.toLowerCase().startsWith('cd ')) {
                    let targetDir = cmd.substring(3).trim().replace(/['"]/g, '');
                    const pathModule = require('path');
                    try {
                        const curCwd = window.terminalSessions[window.activeSubTabId].cwd || window.currentPath || process.cwd();
                        let newPath = '';
                        if (pathModule.isAbsolute(targetDir)) {
                            newPath = targetDir;
                        } else {
                            newPath = pathModule.resolve(curCwd, targetDir);
                        }
                        if (fs.existsSync(newPath) && fs.statSync(newPath).isDirectory()) {
                            window.terminalSessions[window.activeSubTabId].cwd = newPath;
                            updateTerminalPrompt();
                        }
                    } catch (err) {
                        console.error(err);
                    }
                }
                
                ipcRenderer.send('execute-cmd', { 
                    tabId: window.activeSubTabId, 
                    command: cmd, 
                    cwd: window.terminalSessions[window.activeSubTabId].cwd || window.currentPath || process.cwd() 
                }); 
                tI.value = '';
            }
        };
    }
    ipcRenderer.removeAllListeners('cmd-output');
    ipcRenderer.on('cmd-output', (e, arg) => {
        let tId = window.activeSubTabId;
        let txt = '';
        if (typeof arg === 'string') {
            txt = arg;
        } else if (arg && typeof arg === 'object') {
            tId = arg.tabId || window.activeSubTabId;
            txt = arg.data || '';
        }
        if (tId && window.terminalSessions[tId]) {
            window.terminalSessions[tId].logs.push({ type: 'out', text: txt }); 
            if (window.terminalSessions[tId].loading) {
                window.terminalSessions[tId].loading = false;
            }
            if (tId === window.activeSubTabId) {
                switchSubTerminal(window.activeSubTabId);
            }
        }
    });

    const minTermBtn = document.getElementById('minimize-terminal');
    if (minTermBtn) {
        minTermBtn.onclick = () => {
            const im = tL.offsetHeight <= 40; tL.style.height = im ? '350px' : '35px';
            minTermBtn.innerText = im ? '▼' : '▲'; syncBrowserView();
        };
    }

    const vd = (r, t, s) => {
        if (!r || !t) return;
        r.onmousedown = (e) => {
            const sx = e.clientX, sw = t.offsetWidth;
            const mv = (m) => { const df = (s === 'l') ? (m.clientX - sx) : (sx - m.clientX); t.style.width = Math.max(150, Math.min(window.innerWidth * 0.8, sw + df)) + 'px'; syncBrowserView(); };
            const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
            window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
        };
    };
    vd(document.getElementById('resizer-left'), document.getElementById('sidebar-left'), 'l'); vd(document.getElementById('resizer-inspector'), document.getElementById('inspector-right'), 'r');
    const rT = document.getElementById('resizer-terminal');
    if (rT && tL) {
        rT.onmousedown = (e) => {
            const sy = e.clientY, sh = tL.offsetHeight;
            const mv = (m) => { tL.style.height = Math.max(40, Math.min(window.innerHeight * 0.8, sh + (sy - m.clientY))) + 'px'; syncBrowserView(); };
            const up = () => { window.removeEventListener('mouseup', up); window.removeEventListener('mousemove', mv); };
            window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
        };
    }

    const selectProjectBtn = document.getElementById('select-project-btn');
    if (selectProjectBtn) {
        selectProjectBtn.onclick = () => {
            if (window.openProjectModal) window.openProjectModal();
        };
    }

    const collapseToggleBtn = document.getElementById('collapse-all-btn');
    const collapseIcon = document.getElementById('collapse-all-icon');
    const SVG_COLLAPSE = `<polyline points="7 4 12 9 17 4"></polyline><polyline points="7 20 12 15 17 20"></polyline>`;
    const SVG_EXPAND   = `<polyline points="7 9 12 4 17 9"></polyline><polyline points="7 15 12 20 17 15"></polyline>`;
    let _treeCollapsed = false;

    if (collapseToggleBtn) {
        collapseToggleBtn.onclick = () => {
            if (!_treeCollapsed) {
                window.expandedPaths && window.expandedPaths.clear();
                _treeCollapsed = true;
                collapseToggleBtn.title = 'Expand All';
                if (collapseIcon) {
                    collapseIcon.innerHTML = SVG_EXPAND;
                    collapseIcon.classList.add('rotate-left');
                }
            } else {
                document.querySelectorAll('.dir-node .file-item').forEach(el => {
                    const p = el.dataset.path;
                    if (p && window.expandedPaths) window.expandedPaths.add(p);
                });
                _treeCollapsed = false;
                collapseToggleBtn.title = 'Collapse All';
                if (collapseIcon) {
                    collapseIcon.innerHTML = SVG_COLLAPSE;
                    collapseIcon.classList.remove('rotate-left');
                }
            }
            if (window.loadDirectory) window.loadDirectory(window.currentPath || process.cwd());
        };
    }

    const addA = document.getElementById('add-agent-app-card'), mo = document.getElementById('app-reg-modal');
    if (addA && mo) addA.onclick = () => { mo.style.display = 'flex'; document.getElementById('reg-app-url')?.focus(); };
    const cancelReg = document.getElementById('cancel-reg');
    if (cancelReg) cancelReg.onclick = () => { if (mo) mo.style.display = 'none'; };
    const confirmReg = document.getElementById('confirm-reg');
    if (confirmReg) {
        confirmReg.onclick = async () => {
            let u = document.getElementById('reg-app-url').value.trim(); if (!u) return;
            if (!u.startsWith('http')) u = 'https://' + u;
            let inSel = document.getElementById('reg-input-selector')?.value.trim() || '';
            let btnSel = document.getElementById('reg-send-selector')?.value.trim() || '';
            let resSel = document.getElementById('reg-response-selector')?.value.trim() || '';
            
            const s = await ipcRenderer.invoke('vault-read-global', 'registry.json');
            const apps = s ? JSON.parse(s) : [];
            const editingUrl = mo ? mo.dataset.editingUrl : '';

            if (mo && editingUrl) {
                const idx = apps.findIndex(a => (typeof a === 'string' ? a : a.url) === editingUrl);
                if (idx > -1) apps[idx] = { url: u, input: inSel, send: btnSel, response: resSel };
                delete mo.dataset.editingUrl;
            } else {
                apps.push({ url: u, input: inSel, send: btnSel, response: resSel });
            }
            ipcRenderer.send('vault-update-global', { fileName: 'registry.json', content: JSON.stringify(apps) });
            location.reload();
        };
    }

    const urlIn = document.getElementById('agent-url-input'); if (urlIn) {
        urlIn.onkeydown = (e) => {
            if (e.key === 'Enter') {
                let u = urlIn.value.trim(); if (!u) return;
                if (!u.startsWith('http')) u = 'https://' + u;
                const wv = document.getElementById('active-agent-webview');
                if (wv) wv.src = u;
            }
        };
    }
    const refreshAgentBtn = document.getElementById('refresh-agent');
    if (refreshAgentBtn) {
        refreshAgentBtn.onclick = () => { const u = urlIn ? urlIn.value.trim() : ''; if (u) { const wv = document.getElementById('active-agent-webview'); if (wv) wv.reload(); } };
    }

    const settingsBtn = document.getElementById('agent-settings-btn');
    const settingsMenu = document.getElementById('agent-settings-menu');
    if (settingsBtn && settingsMenu) {
        settingsBtn.onmouseover = () => settingsBtn.style.background = '#222';
        settingsBtn.onmouseout = () => settingsBtn.style.background = 'transparent';
        
        settingsBtn.onclick = (e) => { e.stopPropagation(); settingsMenu.style.display = settingsMenu.style.display === 'none' ? 'flex' : 'none'; };
        document.addEventListener('click', () => { settingsMenu.style.display = 'none'; });

        document.querySelectorAll('.settings-menu-item').forEach(item => {
            item.onmouseenter = () => item.style.background = item.id === 'menu-factory-reset' ? 'rgba(255,0,0,0.15)' : '#1a1a1a';
            item.onmouseleave = () => item.style.background = item.id === 'menu-factory-reset' ? 'rgba(255,0,0,0.05)' : 'transparent';
        });

        const switchAgentBtn = document.getElementById('menu-switch-agent');
        if (switchAgentBtn) { switchAgentBtn.onclick = () => { document.getElementById('agent-hub-webview').style.display = 'none'; document.getElementById('agent-hub-home').style.display = 'flex'; }; }

        const devAgentBtn = document.getElementById('menu-debug-agent');
        if (devAgentBtn) { devAgentBtn.onclick = () => { const wv = document.getElementById('active-agent-webview'); if (wv) wv.openDevTools(); }; }

        const resetBtn = document.getElementById('menu-factory-reset');
        if (resetBtn) {
            resetBtn.onclick = async () => {
                const confirmed = await showConfirm("정말 완전 초기화를 진행하시겠습니까?\n등록된 모든 에이전트와 설정이 삭제되며 제미나이 기본 상태로 돌아갑니다.");
                if (confirmed) { ipcRenderer.send('vault-update-global', { fileName: 'registry.json', content: '[]' }); location.reload(); }
            };
        }
    }

    const dsModal = document.getElementById('discovery-settings-modal');
    const dsInput = document.getElementById('discovery-keywords-input');
    const defaultKeywords = 'message, ask, prompt, type, question, conversation, input, chat, command, send, help you today, search, write, say';

    const openDiscoveryBtn = document.getElementById('open-discovery-settings');
    if (openDiscoveryBtn) {
        openDiscoveryBtn.onclick = async () => {
            const saved = (await ipcRenderer.invoke('vault-read-global', 'discovery_keywords.txt')) || defaultKeywords;
            if (dsInput) dsInput.value = saved;
            if (dsModal) dsModal.style.display = 'flex';
        };
    }
    const closeDiscoveryBtn = document.getElementById('close-discovery-settings');
    if (closeDiscoveryBtn) closeDiscoveryBtn.onclick = () => { if (dsModal) dsModal.style.display = 'none'; };
    const saveDiscoveryBtn = document.getElementById('save-discovery-settings');
    if (saveDiscoveryBtn) {
        saveDiscoveryBtn.onclick = () => {
            if (dsInput) {
                ipcRenderer.send('vault-update-global', { fileName: 'discovery_keywords.txt', content: dsInput.value.trim() });
            }
            if (dsModal) dsModal.style.display = 'none';
        };
    }

    const tLA = document.getElementById('tab-local-agent'), tBH = document.getElementById('tab-browser-hub');
    const vLC = document.getElementById('inspector-local-chat'), vBH = document.getElementById('inspector-browser-hub');
    const swi = (m) => {
        vLC.style.display = (m === 'local') ? 'flex' : 'none'; vBH.style.display = (m !== 'local') ? 'flex' : 'none';
        tLA.classList.toggle('active-tab', (m === 'local')); tBH.classList.toggle('active-tab', (m !== 'local'));
        if (m === 'local') {
            const chatLog = document.getElementById('local-chat-messages');
            if (chatLog) chatLog.scrollTop = chatLog.scrollHeight;
            if (document.hasFocus()) { const ci = document.getElementById('local-agent-input'); if (ci) setTimeout(() => ci.focus(), 100); }
        }
    };
    if (tLA) tLA.onclick = () => swi('local'); if (tBH) tBH.onclick = () => swi('browser');

    const searchBtn = document.getElementById('btn-local-search');
    const searchContainer = document.getElementById('local-chat-search-container');
    const searchInput = document.getElementById('local-chat-search-input');
    const searchCount = document.getElementById('local-chat-search-count');
    const closeSearch = document.getElementById('close-local-search');
    const chatMessages = document.getElementById('local-chat-messages');

    function clearSearch() {
        if (searchInput) searchInput.value = '';
        if (searchCount) searchCount.innerText = '0 found';
        if (chatMessages) {
            const bubbles = chatMessages.querySelectorAll('.chat-bubble');
            bubbles.forEach(b => { b.style.display = 'flex'; });
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }

    function performSearch() {
        const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
        if (!chatMessages) return;
        const bubbles = chatMessages.querySelectorAll('.chat-bubble');
        let found = 0;

        bubbles.forEach(b => {
            const content = b.querySelector('.bubble-content');
            if (!content) return;
            const text = content.innerText.toLowerCase();
            if (!query || text.includes(query)) {
                b.style.display = 'flex';
                if (query) found++;
            } else {
                b.style.display = 'none';
            }
        });

        if (searchCount) {
            searchCount.innerText = query ? `${found} found` : '0 found';
        }
    }

    if (searchBtn && searchContainer && searchInput) {
        searchBtn.onclick = () => {
            const isHidden = searchContainer.style.display === 'none';
            searchContainer.style.display = isHidden ? 'flex' : 'none';
            if (isHidden) {
                searchInput.focus();
                performSearch();
            } else {
                clearSearch();
            }
        };
    }

    if (closeSearch) {
        closeSearch.onclick = () => {
            if (searchContainer) searchContainer.style.display = 'none';
            clearSearch();
        };
    }

    if (searchInput) {
        searchInput.oninput = performSearch;
        searchInput.onkeydown = (e) => {
            if (e.key === 'Escape') {
                if (searchContainer) searchContainer.style.display = 'none';
                clearSearch();
            }
        };
    }

    const saveBtn = document.getElementById('save-local-chat');
    if (saveBtn) {
        saveBtn.onclick = () => { ChatUI.appendBubble('system', '[SYSTEM] Chat snapshot save requested.'); };
    }
    const clearBtn = document.getElementById('clear-local-chat');
    if (clearBtn) {
        clearBtn.onclick = () => { 
            showConfirm("Initialize both chat history file and screen? (Irrecoverable)", () => {
                window.generating = false; 
                const sendBtn = document.getElementById('send-to-local'); if (sendBtn) sendBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;
                ipcRenderer.send('vault-reset-session', { logPath: GravityVault.activeLogPath }); 
                document.getElementById('local-chat-messages').innerHTML = ''; if (window.chatLog) window.chatLog = []; 
                const overlay = document.getElementById('web-process-overlay'); if (overlay) { overlay.style.display = 'none'; overlay.style.pointerEvents = 'none'; }
                const chatIn = document.getElementById('local-agent-input'); if (chatIn) { setTimeout(() => { chatIn.focus(); chatIn.click(); }, 50); }
            });
        };
    }

    window.updateSendProgress = (current, total) => {
        const textEl = document.getElementById('overlay-progress-text');
        const barEl = document.getElementById('overlay-progress-bar');
        if (textEl && barEl) {
            const pct = total > 0 ? Math.round((current / total) * 100) : 0;
            textEl.innerText = `${current} / ${total} Files processed (${pct}%)`;
            barEl.style.width = `${pct}%`;
        }
    };

    const chatIn = document.getElementById('local-agent-input');
    if (chatIn) {
        chatIn.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const sendBtn = document.getElementById('send-to-local');
                if (sendBtn) sendBtn.click();
            }
        };
    }
    const chatOverlay = document.getElementById('local-chat-overlay');
    
    if (chatOverlay && !document.getElementById('btn-send-project-info')) {
        const projBtn = document.createElement('button');
        projBtn.id = 'btn-send-project-info';
        projBtn.innerHTML = 'Send Project Info to Browser';

        projBtn.style = `
            width: 80%;
            max-width: 280px;
            height: 42px;
            background: var(--primary);
            color: #fff;
            border: none;
            border-radius: 8px;
            font-family: 'DM Sans', 'Outfit', sans-serif;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12.5px;
            letter-spacing: -0.01em;
            box-shadow: 0 4px 12px rgba(70, 140, 246, 0.2);
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        `;
        projBtn.onmouseenter = () => { projBtn.style.filter = 'brightness(1.1)'; projBtn.style.boxShadow = '0 4px 14px rgba(70, 140, 246, 0.3)'; };
        projBtn.onmouseleave = () => { projBtn.style.filter = 'none'; projBtn.style.boxShadow = '0 4px 12px rgba(70, 140, 246, 0.2)'; };

        projBtn.onclick = async () => {
            if (window.sessionBriefed || window.briefingInProgress) return;
            window.briefingInProgress = true;
            projBtn.style.display = 'none';
            document.getElementById('tab-browser-hub')?.click();
            
            const tree = await ipcRenderer.invoke('vault-get-tree', window.currentPath);
            const fileMatches = tree.match(/\[FILE\]/g);
            window.totalFilesCount = fileMatches ? fileMatches.length : 0;
            window.readFilesSet.clear();
            window.userMessageCount = 0;
            
            const webPayload = `현재 프로젝트 폴더에는 다음 파일들이 있습니다:
${tree}

[SYSTEM INSTRUCTION]
1. 프로젝트 파악을 위해 코드를 분석하십시오. 모든 파일을 다 읽으려 하지 말고, package.json이나 핵심 엔트리 포인트(예: main.js, index.html 등)의 아키텍처를 파악하십시오.
2. 분석할 첫 번째 핵심 소스코드를 읽으려면 반드시 다음 형식의 대괄호 명령어를 본문 답변에 정확히 써서 요청하십시오. 자연어로만 말하면 시스템이 감지하지 못합니다:
- [CMD: read-file "파일명"]
3. 만약 한 번에 여러 소스 파일을 동시에 읽어 분석하고 싶다면, [CMD: read-file "파일명1"] [CMD: read-file "파일명2"] 형태로 여러 개의 명령어를 나열하여 요청하십시오. 시스템이 병합하여 1턴 만에 전송해 줄 것입니다.

이 지침을 숙지했다면 분석을 위해 처음 읽을 핵심 파일을 [CMD: read-file "파일명"] 형태로 즉시 답변하십시오.

[CRITICAL RULE]
1. 아직 전체 프로젝트가 파악되지 않았다면, 읽은 파일에 대해 설명하지 말고 빠르게 다음 탐색할 [CMD: ...] 명령어만 단답형으로 제출하십시오.
2. 파일의 구조나 함수 목록만 파악할 때는 [CMD: read-file "파일명"] 을 사용하십시오.
3. 세부 로직을 정밀 분석/수정할 때는 [CMD: read-file-full "파일명"] 을 사용하십시오. (단, 한 턴에 최대 200줄 제한으로 잘려서 전송됩니다.)
4. 특정 라인 범위(최대 200줄 한도)만 지정해서 읽고 싶다면 [CMD: read-file-range "파일명" 시작줄-끝줄] (예: [CMD: read-file-range "main.js" 1-200] 또는 [CMD: read-file-range "main.js" 201-400]) 을 적극적으로 사용하십시오.
5. 파일 탐색 및 파악이 최종적으로 완료되었다면 자의적인 향후 작업 계획 수립이나 임의의 대안 작성을 일절 중단하십시오. 오직 파악된 현재 프로젝트 구조 및 핵심 기능에 대해서만 간결히 설명한 후, 유저의 구체적인 지시(Wait for user instructions)를 대기하십시오.`.trim();
            
            window.currentBatchFileCount = -1;
            const enginePromise = runExperimentalEngine('/marktag', webPayload, null);
            try {
                await injectWebPayload(webPayload, -1);
            } catch (err) {
                console.error("Failed to inject project info payload:", err);
            }
            
            chatOverlay.style.display = 'none';
            projBtn.style.display = 'flex';
            
            if (chatIn) chatIn.focus();
            
            try {
                const response = await enginePromise;
                if (response) {
                    ChatUI.appendBubble('ai', response, false, getWebIcon(document.getElementById('active-agent-webview')));
                    detectAndAskCommand(response);
                }
            } catch (err) {
                console.error("Failed to run experimental engine:", err);
            } finally {
                window.sessionBriefed = true;
                window.briefingInProgress = false;
                if (!window.autoContinueOnRead) document.getElementById('tab-local-agent')?.click();
            }
        };

        chatOverlay.appendChild(projBtn);
    }

    const updateAgentBadge = () => {
        const wv = document.getElementById('active-agent-webview'), badge = document.getElementById('active-project-badge');
        const headerIcon = document.getElementById('active-agent-icon');

        if (wv && wv.src && !wv.src.startsWith('about:blank')) {
            try {
                const d = new URL(wv.src).hostname; const name = d.split('.')[0].toUpperCase();
                const icon = `https://www.google.com/s2/favicons?domain=${d}&sz=64`;
                if (badge) badge.innerText = `PORMSG · ${name}`; if (headerIcon) headerIcon.src = icon;
                if (chatIn) { chatIn.placeholder = `Ask ${name}...`; }
            } catch(e) {}
        } else {
            if (badge) badge.innerText = `PORMSG`; if (headerIcon) headerIcon.src = 'png.png'; if (chatIn) chatIn.placeholder = `Ask AI...`;
        }
    };

    window.updateAgentBadge = updateAgentBadge;
    const sendBtn = document.getElementById('send-to-local');
    if (sendBtn) {
        sendBtn.onclick = () => handleSend();
    }
    
    const pMo = document.getElementById('persona-modal'), pBtn = document.getElementById('open-persona-settings');
    if (pBtn && pMo) {
        pBtn.onclick = async () => {
            pMo.style.display = 'flex';
            const traits = await ipcRenderer.invoke('vault-read-global', 'traits.md');
            if (traits) {
                const lines = traits.split('\n');
                document.getElementById('ps-name').value = lines[0]?.replace('NAME: ', '') || '';
                document.getElementById('ps-personality').value = lines[1]?.replace('PERSONALITY: ', '') || '';
                document.getElementById('ps-info').value = lines[2]?.replace('INFO: ', '') || '';
                document.getElementById('ps-speech').value = lines[3]?.replace('SPEECH: ', '') || '';
            }
        };
        const cancelPersonaBtn = document.getElementById('cancel-persona');
        if (cancelPersonaBtn) cancelPersonaBtn.onclick = () => { if (pMo) pMo.style.display = 'none'; };
        const savePersonaBtn = document.getElementById('save-persona');
        if (savePersonaBtn) {
            savePersonaBtn.onclick = () => {
                const nameEl = document.getElementById('ps-name');
                const personalityEl = document.getElementById('ps-personality');
                const infoEl = document.getElementById('ps-info');
                const speechEl = document.getElementById('ps-speech');
                const content = `NAME: ${nameEl ? nameEl.value : ''}\nPERSONALITY: ${personalityEl ? personalityEl.value : ''}\nINFO: ${infoEl ? infoEl.value : ''}\nSPEECH: ${speechEl ? speechEl.value : ''}`;
                ipcRenderer.send('vault-update-global', { fileName: 'traits.md', content });
                if (pMo) pMo.style.display = 'none';
                GravityVault.init();
            };
        }
    }
    const bailoutZone = document.getElementById('toast-bailout-zone');
    if (bailoutZone) {
        bailoutZone.onclick = (e) => {
            e.stopPropagation();
            const toast = document.getElementById('injection-toast');
            if (toast) toast.style.display = 'none';
            const chatOverlay = document.getElementById('local-chat-overlay');
            if (chatOverlay) chatOverlay.style.display = 'none';
            const progressBox = document.getElementById('overlay-progress-box');
            if (progressBox) progressBox.style.display = 'none';
            const projBtn = document.getElementById('btn-send-project-info');
            if (projBtn) projBtn.style.display = 'flex';
            ChatUI.appendBubble('system', '[SYSTEM] Emergency bailout: Force closed loading overlays.');
        };
    }
    updateAgentBadge();
}

const GravityVault = {
    activeLogPath: null, 
    async init() {
        const res = await ipcRenderer.invoke('vault-init'); this.activeLogPath = res.activeLogPath;
        console.log("[Vault] Log System Initialized:", this.activeLogPath);
    },
    log(role, text) { if (this.activeLogPath) ipcRenderer.send('vault-log', { logPath: this.activeLogPath, role, text }); }
};

async function migrateToVault() {
    const appsStr = localStorage.getItem('pormsg_agent_apps') || localStorage.getItem('vapor_agent_apps');
    if (appsStr && appsStr !== '[]') { const currentRegistry = await ipcRenderer.invoke('vault-read-global', 'registry.json'); if (!currentRegistry) ipcRenderer.send('vault-update-global', { fileName: 'registry.json', content: appsStr }); }
    const kwStr = localStorage.getItem('pormsg_discovery_keywords') || localStorage.getItem('vapor_discovery_keywords');
    if (kwStr) { const currentKw = await ipcRenderer.invoke('vault-read-global', 'discovery_keywords.txt'); if (!currentKw) ipcRenderer.send('vault-update-global', { fileName: 'discovery_keywords.txt', content: kwStr }); }
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await migrateToVault();
    } catch (e) {
        console.error("migrateToVault failed:", e);
    }
    
    const selectBox = document.getElementById('terminal-sub-tabs');
    if (selectBox) setupHorizontalScroll(selectBox);
    
    try {
        addSubTerminal(true);
    } catch (e) {
        console.error("addSubTerminal failed:", e);
    }

    try {
        await GravityVault.init();
    } catch (e) {
        console.error("GravityVault init failed:", e);
    }

    try {
        await setupBoot();
    } catch (e) {
        console.error("setupBoot failed:", e);
    }

    try {
        setupUI();
    } catch (e) {
        console.error("setupUI failed:", e);
    }
    
    if (typeof openProjectModal === 'function') {
        openProjectModal();
    }
    document.getElementById('tab-browser-hub')?.click();
    
    if (typeof bindDragAndDrop === 'function') {
        bindDragAndDrop();
    }
    
    if (typeof ChatUI !== 'undefined' && typeof ChatUI.restoreHistory === 'function') {
        await ChatUI.restoreHistory();
    }
    
    const chatIn = document.getElementById('local-agent-input');
    if (chatIn) {
        setTimeout(() => {
            chatIn.focus();
            chatIn.click();
        }, 300);
    }
    
    ipcRenderer.on('trigger-app-reload', () => {
        location.reload();
    });
    
    ipcRenderer.on('refresh-explorer', () => { 
        window.loadDirectory(window.currentPath); 
    });
});
