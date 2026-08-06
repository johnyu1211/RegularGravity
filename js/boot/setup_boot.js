async function setupBoot() {
    const grid = document.getElementById('agent-hub-grid'), addA = document.getElementById('add-agent-app-card');
    if (!grid || !addA) return;

    const geminiUsageBtn = document.getElementById('taskbar-gemini-usage-btn');
    if (geminiUsageBtn) {
        geminiUsageBtn.onclick = () => {
            if (typeof window.fetchGeminiUsagePercent === 'function') window.fetchGeminiUsagePercent();
        };
    }

    const manualCmdBtn = document.getElementById('taskbar-manual-cmd-input-btn');
    const manualCmdContainer = document.getElementById('manual-cmd-input-container');
    const manualCmdTextarea = document.getElementById('manual-cmd-textarea');
    const closeManualCmd = document.getElementById('close-manual-cmd-container');
    const cancelManualCmd = document.getElementById('cancel-manual-cmd');
    const runManualCmd = document.getElementById('run-manual-cmd');

    const getLatestAiMsgText = async () => {
        const aiBubbles = Array.from(document.querySelectorAll('.chat-bubble.ai, .chat-bubble[data-role="ai"], .chat-message-ai'));
        if (aiBubbles.length > 0) {
            for (let i = aiBubbles.length - 1; i >= 0; i--) {
                const contentEl = aiBubbles[i].querySelector('.bubble-content') || aiBubbles[i];
                if (contentEl) {
                    const txt = contentEl.dataset.rawText || contentEl.innerText || contentEl.textContent || '';
                    if (txt.includes('[CMD:') || txt.includes('[REQUEST:') || txt.includes('```') || /\b(create-dir|mkdir|write-file|read-file|edit-file|delete-file|run-command)\b/i.test(txt)) {
                        return txt.trim();
                    }
                }
            }
            const lastBubble = aiBubbles[aiBubbles.length - 1];
            const contentEl = lastBubble.querySelector('.bubble-content') || lastBubble;
            if (contentEl) {
                const txt = contentEl.dataset.rawText || contentEl.innerText || contentEl.textContent || '';
                if (txt.trim()) return txt.trim();
            }
        }
        const wv = document.getElementById('active-agent-webview');
        if (wv && typeof wv.executeJavaScript === 'function') {
            try {
                const wvText = await wv.executeJavaScript(`
                    (() => {
                        try {
                            const rawElems = Array.from(document.querySelectorAll('message-content, model-response, [data-message-author-role="assistant"], .assistant-message, .model-response-text, [data-test-id="model-response"]'));
                            const topElems = rawElems.filter(el => !rawElems.some(other => other !== el && other.contains(el)));
                            
                            const cmdMatched = topElems.filter(el => {
                                try {
                                    const t = el.innerText || el.textContent || '';
                                    return t.includes('[CMD:') || t.includes('[REQUEST:') || t.includes('\`\`\`') || /\\b(create-dir|mkdir|write-file|read-file|edit-file|delete-file|run-command)\\b/i.test(t);
                                } catch(e) { return false; }
                            });
                            if (cmdMatched.length > 0) {
                                const lastMatched = cmdMatched[cmdMatched.length - 1];
                                const text = (lastMatched.innerText || lastMatched.textContent || '').trim();
                                if (text) return text;
                            }

                            if (topElems.length > 0) {
                                const lastEl = topElems[topElems.length - 1];
                                const text = (lastEl.innerText || lastEl.textContent || '').trim();
                                if (text) return text;
                            }
                            return '';
                        } catch(e) { return ''; }
                    })()
                `);
                if (wvText && wvText.trim()) return wvText.trim();
            } catch(e) {}
        }
        return '';
    };

    if (manualCmdBtn && manualCmdContainer) {
        manualCmdBtn.onclick = async () => {
            if (manualCmdContainer.style.display === 'flex') {
                hideManualCmdPanel();
                return;
            }
            const ta = document.getElementById('manual-cmd-textarea');
            let latestText = await getLatestAiMsgText();
            if ((!latestText || !latestText.trim()) && navigator.clipboard && navigator.clipboard.readText) {
                try {
                    const clipText = await navigator.clipboard.readText();
                    if (clipText && clipText.trim() && (clipText.includes('[CMD:') || clipText.includes('write-file') || clipText.includes('read-file') || clipText.includes('```'))) {
                        latestText = clipText.trim();
                    }
                } catch(e) {}
            }
            if (latestText && ta) {
                ta.value = latestText;
            }
            manualCmdContainer.style.display = 'flex';
            if (typeof syncBrowserView === 'function') syncBrowserView();
            setTimeout(() => {
                if (ta) {
                    ta.focus();
                    ta.setSelectionRange(0, 0);
                }
            }, 50);
        };
    }

    const hideManualCmdPanel = () => {
        if (manualCmdContainer) {
            manualCmdContainer.style.display = 'none';
            if (typeof syncBrowserView === 'function') syncBrowserView();
        }
    };

    if (closeManualCmd) closeManualCmd.onclick = hideManualCmdPanel;
    if (cancelManualCmd) cancelManualCmd.onclick = hideManualCmdPanel;

    if (runManualCmd) {
        runManualCmd.onclick = async () => {
            const ta = document.getElementById('manual-cmd-textarea');
            let rawText = ta ? ta.value.trim() : '';

            if (!rawText && navigator.clipboard && navigator.clipboard.readText) {
                try {
                    const clipText = await navigator.clipboard.readText();
                    if (clipText && clipText.trim()) {
                        rawText = clipText.trim();
                        if (ta) ta.value = rawText;
                    }
                } catch(e) {}
            }

            if (!rawText) return;
            hideManualCmdPanel();
            if (ta) ta.value = '';

            // Normalize escaped newlines and quotes if text was copied as encoded JSON
            if (rawText.includes('\\n')) {
                rawText = rawText.replace(/\\n/g, '\n').replace(/\\"/g, '"');
            }

            window.dragDropMode = true;

            if (typeof ChatUI !== 'undefined' && typeof ChatUI.appendBubble === 'function') {
                ChatUI.appendBubble('system', `[SYSTEM] Processing manual CMD input:\n"${rawText.slice(0, 120)}${rawText.length > 120 ? '...' : ''}"`);
            }
            
            const detectFn = (typeof detectAndAskCommand === 'function') ? detectAndAskCommand : window.detectAndAskCommand;
            if (typeof detectFn === 'function') {
                detectFn(rawText);
            } else {
                if (typeof ChatUI !== 'undefined' && typeof ChatUI.appendBubble === 'function') {
                    ChatUI.appendBubble('system', '[ERROR] detectAndAskCommand function unavailable.');
                }
            }
        };
    }

    const reCmdBtn = document.getElementById('taskbar-recmd-btn');
    if (reCmdBtn) {
        reCmdBtn.onclick = async () => {
            reCmdBtn.style.opacity = '0.5';
            reCmdBtn.style.pointerEvents = 'none';
            try {
                let lastAiText = null;

                // 1. Try fetching text from local chat UI bubbles (latest AI response)
                const aiBubbles = Array.from(document.querySelectorAll('.chat-bubble.ai, .chat-bubble[data-role="ai"]'));
                if (aiBubbles.length > 0) {
                    const lastBubble = aiBubbles[aiBubbles.length - 1];
                    const contentEl = lastBubble.querySelector('.bubble-content');
                    if (contentEl) {
                        lastAiText = contentEl.dataset.rawText || contentEl.innerText || contentEl.textContent;
                    }
                }

                // 2. If not found in local UI, attempt reading latest AI response from Webview DOM
                if (!lastAiText || !lastAiText.trim()) {
                    const wv = document.getElementById('active-agent-webview');
                    if (wv && typeof wv.executeJavaScript === 'function') {
                        try {
                            lastAiText = await wv.executeJavaScript(`
                                (() => {
                                     try {
                                         const rawElems = Array.from(document.querySelectorAll('message-content, model-response, [data-message-author-role="assistant"], .assistant-message, .model-response-text, [data-test-id="model-response"]'));
                                         const topElems = rawElems.filter(el => !rawElems.some(other => other !== el && other.contains(el)));
                                         
                                         const cmdMatched = topElems.filter(el => {
                                             try {
                                                 const t = el.innerText || el.textContent || '';
                                                 return t.includes('[CMD:') || t.includes('[REQUEST:') || t.includes('\`\`\`');
                                             } catch(e) { return false; }
                                         });
                                         if (cmdMatched.length > 0) {
                                             const lastMatched = cmdMatched[cmdMatched.length - 1];
                                             const text = (lastMatched.innerText || lastMatched.textContent || '').trim();
                                             if (text) return text;
                                         }

                                         if (topElems.length > 0) {
                                             const lastEl = topElems[topElems.length - 1];
                                             const text = (lastEl.innerText || lastEl.textContent || '').trim();
                                             if (text) return text;
                                         }
                                         return '';
                                     } catch(e) { return ''; }
                                })()
                            `);
                        } catch(wvErr) {
                            console.warn("[RE-CMD] Webview executeJavaScript caught safely:", wvErr);
                            lastAiText = '';
                        }
                    }
                }

                if (lastAiText && lastAiText.trim()) {
                    window.dragDropMode = true;
                    if (typeof ChatUI !== 'undefined' && typeof ChatUI.appendBubble === 'function') {
                        ChatUI.appendBubble('system', '[SYSTEM] RE-CMD: Re-parsing latest AI message for local commands...');
                    }
                    if (typeof detectAndAskCommand === 'function') {
                        detectAndAskCommand(lastAiText);
                    } else {
                        if (typeof ChatUI !== 'undefined' && typeof ChatUI.appendBubble === 'function') {
                            ChatUI.appendBubble('system', '[ERROR] RE-CMD: detectAndAskCommand function unavailable.');
                        }
                    }
                } else {
                    if (typeof ChatUI !== 'undefined' && typeof ChatUI.appendBubble === 'function') {
                        ChatUI.appendBubble('system', '[WARN] RE-CMD: No recent AI message found to re-read.');
                    }
                }
            } catch(e) {
                if (typeof ChatUI !== 'undefined' && typeof ChatUI.appendBubble === 'function') {
                    ChatUI.appendBubble('system', `[ERROR] RE-CMD: ${e.message}`);
                }
            } finally {
                reCmdBtn.style.opacity = '1';
                reCmdBtn.style.pointerEvents = 'auto';
            }
        };
    }

    const rulesBtn = document.getElementById('taskbar-manual-rules-btn');
    if (rulesBtn) {
        rulesBtn.onclick = async () => {
            if (typeof window.getSystemRulesPrompt !== 'function') return;
            rulesBtn.style.opacity = '0.5';
            rulesBtn.style.pointerEvents = 'none';
            try {
                const rulesFileName = window.makeSendingMdRulesName();
                const rulesContent = `${window.getSystemRulesPrompt(true)}\n\n[SYSTEM] Please acknowledge that you understand and will strictly follow these system rules.`;
                
                const payload = await window.prepareFilePayload(rulesFileName, rulesContent);

                if (typeof window.refreshTree === 'function') window.refreshTree();

                window.requestedFilesQueue = [{
                    absolutePath: payload.absolutePath,
                    relativePath: payload.relativePath,
                    status: 'PENDING'
                }];

                try {
                    if (typeof window.injectGuestDropInterceptor === 'function') {
                        window.injectGuestDropInterceptor();
                    }
                } catch(e) {}

                const rulesSendCleanup = () => {
                    if (window.activeDragDropCleanup === rulesSendCleanup) {
                        window.activeDragDropCleanup = null;
                        window.activeDragDropContinue = null;
                    }
                    window.dragDropMode = false;
                    window.requestedFilesQueue = [];
                    if (typeof window.updateDragDropQueueUI === 'function') {
                        window.updateDragDropQueueUI();
                    }
                };

                window.activeDragDropCleanup = rulesSendCleanup;
                window.activeDragDropContinue = async () => {};
                window.dragDropMode = true;

                if (typeof window.updateDragDropQueueUI === 'function') {
                    window.updateDragDropQueueUI();
                }

                ChatUI.appendBubble('system', '[SYSTEM] System rules queued for sending. Drop the file into the AI chat.');
            } catch(e) {
                ChatUI.appendBubble('system', `[ERROR] Failed to prepare system rules: ${e.message}`);
            } finally {
                rulesBtn.style.opacity = '1';
                rulesBtn.style.pointerEvents = 'auto';
            }
        };
    }

    window.updateSendingMdCountBadge = function() {
        try {
            const fs = require('fs');
            const path = require('path');
            const gravityRoot = window.appRootPath || process.cwd();
            const sendingMdDir = path.join(gravityRoot, 'SendingMD');
            let count = 0;
            if (fs.existsSync(sendingMdDir)) {
                const subfiles = fs.readdirSync(sendingMdDir);
                count = subfiles.filter(f => !f.startsWith('.')).length;
            }
            const badge = document.getElementById('taskbar-sendmd-count-badge');
            if (badge) {
                if (count > 0) {
                    badge.innerText = count;
                    badge.style.display = 'inline';
                } else {
                    badge.innerText = '';
                    badge.style.display = 'none';
                }
            }
        } catch(e) {}
    };

    window.updateSendingMdCountBadge();
    setInterval(() => {
        if (typeof window.updateSendingMdCountBadge === 'function') window.updateSendingMdCountBadge();
    }, 2000);

    const emptySendMdBtn = document.getElementById('taskbar-empty-sendmd-btn');
    if (emptySendMdBtn && (!window.process || window.process.platform === 'browser')) {
        emptySendMdBtn.style.display = 'none';
    }
    if (emptySendMdBtn) {
        emptySendMdBtn.onclick = () => {
            try {
                const fs = require('fs');
                const path = require('path');
                const gravityRoot = window.appRootPath || process.cwd();
                const sendingMdDir = path.join(gravityRoot, 'SendingMD');
                let count = 0;
                if (fs.existsSync(sendingMdDir)) {
                    const subfiles = fs.readdirSync(sendingMdDir);
                    for (const file of subfiles) {
                        try {
                            fs.unlinkSync(path.join(sendingMdDir, file));
                            count++;
                        } catch(e) {}
                    }
                }
                if (typeof window.refreshTree === 'function') window.refreshTree();
                if (typeof window.updateSendingMdCountBadge === 'function') window.updateSendingMdCountBadge();
                ChatUI.appendBubble('system', `[SYSTEM] Cleaned ${count} temporary file(s) from SendingMD folder.`);
            } catch(e) {
                ChatUI.appendBubble('system', `[ERROR] Failed to empty SendingMD folder: ${e.message}`);
            }
        };
    }

    const treeBtn = document.getElementById('taskbar-manual-tree-btn');
    if (treeBtn) {
        treeBtn.onclick = async () => {
            treeBtn.style.opacity = '0.5';
            treeBtn.style.pointerEvents = 'none';
            try {
                let rawTree = await ipcRenderer.invoke('vault-get-tree', window.currentPath || window.projectRoot || '.');
                let projectTree = typeof rawTree === 'string' ? rawTree : (rawTree && typeof rawTree === 'object' && typeof rawTree.tree === 'string' ? rawTree.tree : '');

                if ((!projectTree || !projectTree.trim()) && window.activeWebDirHandle) {
                    const rootName = window.activeWebDirHandle.name || 'Project';
                    const fileKeys = Object.keys(window.webFileCache || {}).filter(k => !k.startsWith('.') && !k.includes('node_modules'));
                    projectTree = `${rootName}/\n` + (fileKeys.length > 0 ? fileKeys.slice(0, 100).map(f => `  ├── ${f}`).join('\n') : '  [Folder loaded]');
                }

                const treeFileName = window.makeSendingMdTreeName();
                const treeContent = `The current project folder contains the following files:\n${projectTree || '(empty)'}\n\n${window.getSystemRulesPrompt(true)}\n\n[SYSTEM] Please acknowledge receipt of the updated project tree.`;
                
                const payload = await window.prepareFilePayload(treeFileName, treeContent);

                if (typeof window.refreshTree === 'function') window.refreshTree();

                window.requestedFilesQueue = [{
                    absolutePath: payload.absolutePath,
                    relativePath: payload.relativePath,
                    status: 'PENDING'
                }];

                if (typeof window.injectGuestDropInterceptor === 'function') {
                    window.injectGuestDropInterceptor();
                }

                const treeSendCleanup = () => {
                    if (window.activeDragDropCleanup === treeSendCleanup) {
                        window.activeDragDropCleanup = null;
                        window.activeDragDropContinue = null;
                    }
                    window.dragDropMode = false;
                    window.requestedFilesQueue = [];
                    if (typeof window.updateDragDropQueueUI === 'function') {
                        window.updateDragDropQueueUI();
                    }
                };

                window.activeDragDropCleanup = treeSendCleanup;
                window.activeDragDropContinue = async () => {};
                window.dragDropMode = true;

                if (typeof window.updateDragDropQueueUI === 'function') {
                    window.updateDragDropQueueUI();
                }

                ChatUI.appendBubble('system', '[SYSTEM] Project Tree queued for sending. Drop the file into the AI chat.');
            } catch(e) {
                ChatUI.appendBubble('system', `[ERROR] Failed to prepare project tree: ${e.message}`);
            } finally {
                treeBtn.style.opacity = '1';
                treeBtn.style.pointerEvents = 'auto';
            }
        };
    }

    grid.querySelectorAll('.agent-app:not(#add-agent-app-card)').forEach(el => el.remove());

    const showBrowserConfirm = (targetUrl) => {
        return new Promise((resolve) => {
            const modal = document.getElementById('browser-confirm-modal');
            const okBtn = document.getElementById('browser-confirm-ok');
            const cancelBtn = document.getElementById('browser-confirm-cancel');
            const closeBtn = document.getElementById('browser-confirm-close');
            if (!modal || !okBtn || !cancelBtn) return resolve('continue');

            const geminiIcon = document.getElementById('browser-confirm-gemini-icon');
            const faviconImg = document.getElementById('browser-confirm-favicon');
            if (geminiIcon) {
                geminiIcon.style.display = 'flex';
                if (faviconImg) {
                    let domain = 'gemini.google.com';
                    const wv = document.getElementById('active-agent-webview');
                    const urlInput = document.getElementById('agent-url-input');
                    const rawUrl = targetUrl || window.currentActiveAgentUrl || (wv && wv.src && !wv.src.startsWith('about:blank') ? wv.src : '') || urlInput?.value;
                    if (rawUrl) {
                        try {
                            const fullUrl = rawUrl.startsWith('http') ? rawUrl : 'https://' + rawUrl;
                            domain = new URL(fullUrl).hostname;
                        } catch(e) {}
                    }
                    faviconImg.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
                }
            }

            modal.style.display = 'flex';
            setTimeout(() => {
                const sheet = modal.querySelector('div[style*="border-top"]');
                if (sheet) sheet.style.transform = 'translateY(0)';
            }, 10);

            const hideModal = () => {
                const sheet = modal.querySelector('div[style*="border-top"]');
                if (sheet) sheet.style.transform = 'translateY(100%)';
                setTimeout(() => { modal.style.display = 'none'; }, 300);
            };

            okBtn.onclick = () => {
                hideModal();
                resolve('send');
            };
            cancelBtn.onclick = () => {
                hideModal();
                resolve('continue');
            };
            if (closeBtn) {
                closeBtn.onclick = () => {
                    hideModal();
                    resolve('abort');
                };
            }
        });
    };

    window.setTaskbarActionsVisible = function(visible) {
        document.querySelectorAll('.taskbar-action-btn').forEach(btn => {
            btn.style.display = visible ? 'flex' : 'none';
        });
    };

    window.launchWebAgent = async (appData, isSilentBoot = false) => {
        window.sessionBriefed = false;
        window.briefingInProgress = false;
        let u = typeof appData === 'string' ? appData : appData.url;
        window.currentActiveAgentUrl = u;
        let inSel = typeof appData === 'object' ? appData.input : ''; let btnSel = typeof appData === 'object' ? appData.send : ''; let resSel = typeof appData === 'object' ? appData.response : '';

        let confirmResult = 'continue';
        if (!isSilentBoot) {
            confirmResult = await showBrowserConfirm(u);
            if (confirmResult === 'abort') return;
            window.skipRulesGeneration = (confirmResult !== 'send');
        }

        const existingWv = document.getElementById('active-agent-webview');
        if (existingWv && existingWv.src === u) {
            if (!isSilentBoot) {
                document.getElementById('agent-hub-home').style.display = 'none';
                document.getElementById('agent-hub-webview').style.display = 'flex';
                if (typeof window.setInspectorBorderState === 'function') window.setInspectorBorderState(true);
                window.setTaskbarActionsVisible(true);

                if (confirmResult === 'send' || confirmResult === true) {
                    setTimeout(() => {
                        const projBtn = document.getElementById('btn-send-project-info');
                        if (projBtn) projBtn.click();
                    }, 600);
                }
                
                const webToggle = document.getElementById('web-ai-mode-toggle'); if (webToggle) webToggle.checked = true;
                document.getElementById('tab-local-agent')?.click();
                setTimeout(() => document.getElementById('local-agent-input')?.focus(), 100);
            }
            return;
        }

        if (!isSilentBoot) {
            document.getElementById('agent-hub-home').style.display = 'none';
            document.getElementById('agent-hub-webview').style.display = 'flex';
            if (typeof window.setInspectorBorderState === 'function') window.setInspectorBorderState(true);
            window.setTaskbarActionsVisible(true);
        }
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
            if (!window.dragDropMode) {
                setTimeout(() => document.getElementById('local-agent-input')?.focus(), 100);
            }
        }

        const isBrowserMode = (!window.process || window.process.platform === 'browser');
        const dock = document.getElementById('agent-view-dock'); dock.innerHTML = '';
        const wv = isBrowserMode ? document.createElement('iframe') : document.createElement('webview');
        wv.id = 'active-agent-webview'; wv.src = u;
        if (!isBrowserMode) {
            wv.useragent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
            wv.setAttribute('allowpopups', '');
            wv.addEventListener('contextmenu', () => wv.openDevTools());
        } else {
            wv.setAttribute('allow', 'clipboard-read; clipboard-write');
        }
        wv.style = "width:100%; height:100%; border:none;";
        
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
            if (typeof window.injectGuestDropInterceptor === 'function') {
                window.injectGuestDropInterceptor();
            }
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
            `).catch(() => {});
            if (typeof window.injectGuestDropInterceptor === 'function') {
                window.injectGuestDropInterceptor();
            }
            wv.executeJavaScript(`
                (() => {
                    const styleId = 'gravity-guest-style';
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
                    }, 1000);
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
            `).catch(() => {});
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
                                if (typeof detectAndAskCommand === 'function') detectAndAskCommand(response);
                            }
                        } catch (e) {
                            console.error(e);
                            window.hideInputLoading();
                        }
                    }, 5000);
                    return;
                }
                if (window.sessionBriefed || window.briefingInProgress || window.skipRulesGeneration) return;
                window.briefingInProgress = true;
                
                const projectTree = await ipcRenderer.invoke('vault-get-tree', window.currentPath || window.projectRoot);
                if (projectTree) {
                    setTimeout(async () => {
                        try {
                            const pLines = (projectTree || '').split('\n').map(l => l.trim()).filter(Boolean);
                            const isEmpty = !projectTree || pLines.length <= 1 || projectTree.includes('[Empty folder]') || projectTree.includes('[WARNING: No files');
                            const startPrompt = isEmpty
                                ? `This folder is a completely empty new project. If you understand these instructions, ask the user what project to create.`
                                : window.dragDropMode 
                                    ? `If you understand these instructions, ask the user to drop the key entry file for analysis using [CMD: read-file "actual/file/path"]. Do not request non-existent files.` 
                                    : `If you understand these instructions, request key entry files for analysis immediately using [CMD: read-file "actual/file/path"]. Do not request non-existent files.`;

                            const briefPayload = isEmpty
                                ? `${window.getSystemRulesPrompt(true)}\n\n${startPrompt}`.trim()
                                : `The current project folder contains the following files:\n${projectTree}\n${window.getSystemRulesPrompt(true)}\n${startPrompt}`.trim();
                             console.log("[BriefingPayload] Generated payload:\n", briefPayload);

                            window.currentBatchFileCount = -1;
                            
                            if (!window.dragDropMode) {
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
                                    if (typeof detectAndAskCommand === 'function') detectAndAskCommand(briefResponse);
                                }
                                window.currentBatchFileCount = 0;
                            } else {
                                // Disabled creating _project_rules_ file
                                window.requestedFilesQueue = [];
                                if (typeof window.injectGuestDropInterceptor === 'function') {
                                    window.injectGuestDropInterceptor();
                                }

                                const cleanupDragDrop = () => {
                                    if (window.activeDragDropCleanup === cleanupDragDrop) {
                                        window.activeDragDropCleanup = null;
                                        window.activeDragDropContinue = null;
                                    }
                                    const vLC = document.getElementById('inspector-local-chat');
                                    const vBH = document.getElementById('inspector-browser-hub');
                                    const arrowIndicator = document.getElementById('drag-drop-arrow-indicator');
                                    if (arrowIndicator) arrowIndicator.remove();
                                    
                                    const inputContainer = document.getElementById('local-input-container');
                                    if (inputContainer) {
                                        inputContainer.style.background = '';
                                        inputContainer.style.display = 'none';
                                        inputContainer.style.height = '';
                                    }
                                    if (vLC) {
                                        vLC.style.height = "100%";
                                        vLC.style.zIndex = '100';
                                    }
                                    if (vBH) {
                                        vBH.style.position = 'absolute';
                                        vBH.style.top = '0';
                                        vBH.style.height = '100%';
                                        vBH.style.width = '100%';
                                        vBH.style.zIndex = '150';
                                        vBH.style.opacity = '1';
                                        vBH.style.pointerEvents = 'auto';
                                    }

                                };

                                window.activeDragDropCleanup = cleanupDragDrop;
                                window.activeDragDropContinue = async () => {};

                                window.sessionBriefed = true;
                                window.briefingInProgress = false;
                                window.currentBatchFileCount = 0;
                                window.isBriefingResponsePending = true;

                                window.hideInputLoading();

                                setTimeout(() => {
                                    if (typeof window.updateDragDropQueueUI === 'function') {
                                        window.updateDragDropQueueUI();
                                    }
                                }, 600);
                            }
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

        let lastReceivedMirrorText = "";
        wv.addEventListener('console-message', (e) => {
            if (!e.message.startsWith('[GUEST_HTML5_DROP]:') && 
                !e.message.startsWith('[GUEST_FILE_DROP]:') && 
                !e.message.startsWith('[GUEST_USER_MESSAGE]:') && 
                !e.message.startsWith('[BACKGROUND_AI_RESP]:') &&
                !e.message.startsWith('[GUEST_INPUT_HEIGHT]:') &&
                !e.message.startsWith('[INJECT_PCT]:')) {
            }

            if (e.message.startsWith('[GUEST_HTML5_DROP]:') || e.message.startsWith('[GUEST_FILE_DROP]:')) {
                let filePath = "";
                if (e.message.startsWith('[GUEST_HTML5_DROP]:')) {
                    filePath = e.message.substring(19);
                } else {
                    const filename = e.message.substring(18);
                    const droppedName = filename.toLowerCase();
                    const pathModule = require('path');
                    if (window.currentlyDraggedFilePath && pathModule.basename(window.currentlyDraggedFilePath).toLowerCase() === droppedName) {
                        filePath = window.currentlyDraggedFilePath;
                        window.currentlyDraggedFilePath = null;
                    } else {
                        const match = window.requestedFilesQueue.find(x => x.relativePath.split(/[\\/]/).pop().toLowerCase() === droppedName);
                        if (match) {
                            filePath = match.absolutePath;
                        }
                    }
                }
                
                if (filePath) {
                    const now = Date.now();
                    if (window.lastHandledDropPath === filePath && (now - (window.lastHandledDropTime || 0)) < 1500) {
                        console.log("[HostDrop] Ignored duplicate drop event for:", filePath);
                        return;
                    }
                    window.lastHandledDropPath = filePath;
                    window.lastHandledDropTime = now;
                    
                    console.log("[HostDrop] Intercepted drop for path:", filePath);
                    
                    const isImage = /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(filePath);
                    if (isImage) {
                        if (typeof ChatUI !== 'undefined' && ChatUI.appendBubble) {
                            const pathModule = require('path');
                            ChatUI.appendBubble('user', `Attached image: ${pathModule.basename(filePath)}`);
                        }
                        return;
                    }
                    
                    if (window.dragDropMode && window.activeDragDropContinue) {
                        const pathModule = require('path');
                        const droppedName = pathModule.basename(filePath).toLowerCase();
                        
                        const pendingItems = window.requestedFilesQueue.filter(item => item.status === 'PENDING' || item.status === 'UPLOADING');
                        const requestedNames = pendingItems.map(item => item.relativePath.split(/[\\/]/).pop().toLowerCase());
                        
                        if (requestedNames.length > 0 && !requestedNames.includes(droppedName)) {
                            const { showAlert } = require('./ui/dialogs.js');
                            if (typeof showAlert === 'function') {
                                showAlert(`Not a requested file.\nRequested files: ${requestedNames.join(', ')}`);
                            } else {
                                alert(`Not a requested file.\nRequested files: ${requestedNames.join(', ')}`);
                            }
                            return;
                        }
                        
                        window.markFileAsCompleted(filePath);
                        if (typeof ChatUI !== 'undefined' && ChatUI.appendBubble) {
                            const chatLog = document.getElementById('local-chat-messages');
                            let lastUserBubble = null;
                            let baseName = pathModule.basename(filePath);
                            if (baseName.startsWith('Files_') || baseName.startsWith('_project_read_bundle_')) {
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
                        
                        const stillPending = window.requestedFilesQueue.filter(item => item.status === 'PENDING' || item.status === 'UPLOADING');
                        if (stillPending.length === 0) {
                            if (window.activeDragDropCleanup) window.activeDragDropCleanup();
                            const filesToClean = [...window.requestedFilesQueue];
                            setTimeout(async () => {
                                const continueFunc = window.activeDragDropContinue;
                                
                                window.requestedFilesQueue = [];
                                if (typeof window.updateDragDropQueueUI === 'function') {
                                    window.updateDragDropQueueUI();
                                }

                                if (continueFunc && continueFunc.isReal) {
                                    continueFunc();
                                } else {
                                    if (window.pendingUserMessageText) {
                                        const userMsg = window.pendingUserMessageText;
                                        window.pendingUserMessageText = null;
                                        try {
                                            await injectWebPayload(userMsg, 0, 0, false, window.autoDragging && !window.autoDraggingTempDisabled);
                                        } catch(e) {}
                                    }
                                    
                                    if (window.autoDragging && !window.autoDraggingTempDisabled && typeof window.triggerGuestSend === 'function') {
                                        window.triggerGuestSend();
                                    }

                                    if (typeof runExperimentalEngine === 'function') {
                                        runExperimentalEngine('/marktag', "", null).then(response => {
                                            if (response) {
                                                if (typeof window.finalizeAiBubble === 'function') {
                                                    window.finalizeAiBubble(response);
                                                }
                                                if (typeof detectAndAskCommand === 'function') {
                                                    detectAndAskCommand(response);
                                                }
                                            }
                                        }).catch(err => console.error("Error in response monitoring:", err));
                                    }
                                }
                            }, 500);
                        }
                    } else {
                        const fs = require('fs');
                        const pathModule = require('path');
                        try {
                            const cleanPath = filePath.replace(/["'\]\s]+$/, '').replace(/^["'\[\s]+/, '').trim();
                            const contentBuffer = fs.readFileSync(cleanPath);
                            const filename = pathModule.basename(cleanPath);
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
                                    try {
                                        window.isSyntheticDropInProgress = true;
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
                                        const dragEnterEvt = new DragEvent('dragenter', options);
                                        const dragOverEvt = new DragEvent('dragover', options);
                                        const dropEvt = new DragEvent('drop', options);
                                        dragEnterEvt.isSynthetic = true;
                                        dragOverEvt.isSynthetic = true;
                                        dropEvt.isSynthetic = true;

                                        target.dispatchEvent(dragEnterEvt);
                                        target.dispatchEvent(dragOverEvt);
                                        target.dispatchEvent(dropEvt);
                                        
                                        console.log("[GuestDrop] Dispatched drop event for file:", name);
                                    } catch(err) {
                                        console.error("[GuestDrop] Error in synthetic drop:", err);
                                    } finally {
                                        setTimeout(() => { window.isSyntheticDropInProgress = false; }, 1000);
                                    }
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
                if (!isNaN(h) && typeof window.updateSplitLayoutHeight === 'function') {
                    window.updateSplitLayoutHeight(h);
                }
                return;
            }

            if (e.message.startsWith('[BACKGROUND_AI_RESP]:')) {
                const encoded = e.message.substring(21);
                try {
                    const decodedText = decodeURIComponent(escape(atob(encoded)));
                    if (decodedText) {
                        if (window.activeAiResponding && typeof window.updateAiStreamBubble === 'function') {
                            window.updateAiStreamBubble(decodedText);
                        } else if (typeof window.finalizeAiBubble === 'function') {
                            window.finalizeAiBubble(decodedText);
                        }
                    }
                } catch(err) {
                    console.error("[BACKGROUND_AI_RESP] Decode failed:", err);
                }
                return;
            }
        });

        dock.appendChild(wv); if (window.updateAgentBadge) window.updateAgentBadge();
        window.currentAgentSelectors = { input: inSel, send: btnSel, response: resSel };

        if (!isSilentBoot && (confirmResult === 'send' || confirmResult === true)) {
            setTimeout(() => {
                const projBtn = document.getElementById('btn-send-project-info');
                if (projBtn) projBtn.click();
            }, 1000);
        }
    };

    const create = (appData) => {
        let u = typeof appData === 'string' ? appData : appData.url; const d = new URL(u).hostname;
        let displayTitle = (typeof appData === 'object' && appData.title && appData.title.trim()) ? appData.title.trim() : d.split('.')[0];
        const c = document.createElement('div'); c.className = 'agent-app'; c.style.position = 'relative';
        c.innerHTML = `<div class=\"icon-wrapper\"><img src=\"https://www.google.com/s2/favicons?domain=${d}&sz=64\"></div><div class=\"agent-name\">${displayTitle}</div>`;
        c.onclick = () => window.launchWebAgent(appData, false);

        let hoverTimer;
        c.onmouseenter = () => {
            hoverTimer = setTimeout(() => {
                if (c.querySelector('.agent-del-btn')) return;
                const delBtn = document.createElement('div'); delBtn.className = 'agent-del-btn'; delBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
                delBtn.style = `position: absolute; top: -8px; right: -8px; width: 22px; height: 22px; background: rgba(255, 59, 48, 0.9); color: white; border-radius: 50%; display: flex; justify-content: center; align-items: center; cursor: pointer; z-index: 100; box-shadow: none;`;
                delBtn.onclick = async (e) => {
                    e.stopPropagation();
                    const s = await ipcRenderer.invoke('vault-read-global', 'registry.json');
                    const apps = s ? JSON.parse(s) : []; const idx = apps.findIndex(a => (typeof a === 'string' ? a : a.url) === u);
                    if (idx > -1) apps.splice(idx, 1); ipcRenderer.send('vault-update-global', { fileName: 'registry.json', content: JSON.stringify(apps) }); c.remove();
                };
                c.appendChild(delBtn);

                const editBtn = document.createElement('div'); editBtn.className = 'agent-edit-btn'; editBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
                editBtn.style = `position: absolute; top: -8px; left: -8px; width: 22px; height: 22px; background: #0078d4; color: white; border-radius: 50%; display: flex; justify-content: center; align-items: center; cursor: pointer; z-index: 100; box-shadow: none;`;
                editBtn.onclick = (e) => {
                    e.stopPropagation(); const mo = document.getElementById('app-reg-modal');
                    const tIn = document.getElementById('reg-app-title'); if (tIn) tIn.value = (typeof appData === 'object' && appData.title) ? appData.title : '';
                    document.getElementById('reg-app-url').value = u;
                    mo.dataset.editingUrl = u; mo.style.display = 'flex'; (tIn || document.getElementById('reg-app-url')).focus();
                };
                c.appendChild(editBtn);
            }, 500);
        };
        c.onmouseleave = () => { clearTimeout(hoverTimer); c.querySelector('.agent-del-btn')?.remove(); c.querySelector('.agent-edit-btn')?.remove(); };
        grid.insertBefore(c, addA);
    };
    window.addAppCardToDiscovery = create;

    const s = await ipcRenderer.invoke('vault-read-global', 'registry.json'); 
    let apps = []; if (s) { try { apps = JSON.parse(s); } catch(e) { } }

    let geminiApp = apps.find(a => (a.url || a).includes('gemini.google.com'));
    if (!geminiApp) {
        geminiApp = { url: 'https://gemini.google.com/app', input: 'rich-textarea, div[contenteditable="true"], textarea', send: 'button[aria-label*="Send"], button[aria-label*="보내기"]', response: '' };
        apps.unshift(geminiApp); ipcRenderer.send('vault-update-global', { fileName: 'registry.json', content: JSON.stringify(apps) });
    }
    apps.forEach(appData => create(appData)); if (geminiApp) window.launchWebAgent(geminiApp, !window.autoGemini);

    const minTermBtn = document.getElementById('minimize-terminal');
    if (minTermBtn) {
        minTermBtn.onclick = () => {
            const popover = document.getElementById('terminal-popover');
            if (popover) popover.style.display = 'none';
            const toggleBtn = document.getElementById('terminal-toggle-btn');
            if (toggleBtn) {
                toggleBtn.style.color = '';
                toggleBtn.style.background = '';
            }
        };
    }

    const addTermBtn = document.getElementById('add-terminal');
    if (addTermBtn) addTermBtn.onclick = () => addSubTerminal();
    if (typeof window.loadDirectory === 'function' && window.currentPath) {
        window.loadDirectory(window.currentPath);
    }
}

window.setupBoot = setupBoot;
