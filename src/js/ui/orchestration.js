// SECTION 6: WEB AGENT ORCHESTRATION & SHELL EXECUTION
// =========================================================================
window.triggerSessionReset = async () => {
    const { execSync } = require('child_process');
    
    if (typeof ChatUI !== 'undefined' && typeof ChatUI.appendBubble === 'function') {
        ChatUI.appendBubble('system', '[SYSTEM] Preparing session reset. Generating carryover context...');
    }
    
    let gitStatus = "";
    try {
        gitStatus = execSync('git status -s', { cwd: window.projectRoot || window.currentPath || process.cwd() }).toString().trim();
    } catch (e) {
        gitStatus = "Git not initialized or not found";
    }
    
    let treeStr = "";
    try {
        const getFlatDirectoryTree = (dirPath) => {
            let results = [];
            try {
                const list = fs.readdirSync(dirPath);
                list.forEach(file => {
                    const fullPath = path.join(dirPath, file);
                    if (file === 'node_modules' || file === '.git' || file === '.gemini') return;
                    const stat = fs.statSync(fullPath);
                    if (stat && stat.isDirectory()) {
                        results = results.concat(getFlatDirectoryTree(fullPath));
                    } else {
                        results.push(fullPath);
                    }
                });
            } catch (e) {}
            return results;
        };
        const files = getFlatDirectoryTree(window.projectRoot || window.currentPath || process.cwd());
        const relativeFiles = files.map(f => path.relative(window.projectRoot || window.currentPath || process.cwd(), f));
        treeStr = relativeFiles.map(rf => `- ${rf.replace(/\\/g, '/')}`).join('\n');
    } catch(e) {
        treeStr = "Error reading directory structure";
    }
    
    const carryOverPrompt = `[SYSTEM REBOOTED]
현재 세션의 대화 내역이 한도를 초과하여 초기 세션으로 안전하게 재부팅되었습니다.
이전 작업 진행 상황을 인계하니, 규칙과 도구 규격을 준수하여 계속해서 다음 작업을 진행하십시오.

1. 수정 및 추가된 로컬 파일 목록 (Git Status):
\`\`\`
${gitStatus || "No modified files"}
\`\`\`

2. 현재 프로젝트 전체 폴더/파일 구조:
${treeStr}

${window.getSystemRulesPrompt()}

이전 세션의 목표를 확인하고 다음 변경 또는 작업을 지시해주십시오.`;

    window.carryOverPrompt = carryOverPrompt;
    window.sessionBriefed = false; // Reset session briefing state
    window.sessionTurnCount = 0;
    
    const webview = document.getElementById('active-agent-webview');
    if (webview) {
        webview.loadURL('https://gemini.google.com/app');
    }
};


async function orchestrateCommands(writeCmds, editCmds, deleteCmds, moveCmds, listDirCmds, createDirCmds, runCommandCmds, searchKeywordCmds) {
    let accumulatedFeedback = "";
    let isDeleteApproved = true;
    let isWriteEditApproved = true;

    // Silent Map Update Interceptor
    if (window.autoUpdateMap && window.projectRoot) {
        const projectName = path.basename(window.projectRoot);
        const mapName = `${projectName}_Map.md`;
        const mapIdx = writeCmds.findIndex(c => path.basename(c.path).toLowerCase() === mapName.toLowerCase());
        if (mapIdx !== -1) {
            const mapUpdateCmd = writeCmds[mapIdx];
            writeCmds.splice(mapIdx, 1);
            try {
                const targetPath = path.resolve(process.cwd(), mapUpdateCmd.path);
                fs.writeFileSync(targetPath, mapUpdateCmd.code, 'utf-8');
                console.log("[MapUpdate] Silently updated map:", targetPath);
                accumulatedFeedback += `[FILE WRITE SUCCESS: ${mapUpdateCmd.path}]\n`;
            } catch (err) {
                console.error("[MapUpdate] Failed to write map:", err);
                accumulatedFeedback += `[FILE WRITE ERROR: ${mapUpdateCmd.path} - ${err.message}]\n`;
            }
        }
    }

    const hasDelete = deleteCmds.length > 0;
    const hasModify = writeCmds.length > 0 || editCmds.length > 0;
    const hasRun = runCommandCmds.length > 0;
    const hasPrompt = hasDelete || hasModify || hasRun;

    const runAllApprovedActions = async () => {
        // 1. Create directories
        if (createDirCmds.length > 0) {
            for (const c of createDirCmds) {
                try {
                    const targetPath = path.resolve(window.projectRoot || window.currentPath || process.cwd(), c.path);
                    if (!fs.existsSync(targetPath)) {
                        fs.mkdirSync(targetPath, { recursive: true });
                        accumulatedFeedback += `[DIRECTORY CREATED: ${c.path}]\n`;
                        ChatUI.appendBubble('system', `[SUCCESS] Created directory: ${c.path}`);
                    }
                } catch(err) {
                    accumulatedFeedback += `[DIRECTORY CREATE ERROR: ${c.path} - ${err.message}]\n`;
                    ChatUI.appendBubble('system', `[ERROR] Failed to create directory ${c.path}: ${err.message}`);
                }
            }
        }

        // 2. Delete files/folders
        if (deleteCmds.length > 0) {
            for (const c of deleteCmds) {
                try {
                    const targetPath = path.resolve(window.projectRoot || window.currentPath || process.cwd(), c.path);
                    if (fs.existsSync(targetPath)) {
                        const stat = fs.statSync(targetPath);
                        if (stat.isDirectory()) {
                            fs.rmSync(targetPath, { recursive: true, force: true });
                        } else {
                            fs.unlinkSync(targetPath);
                        }
                        accumulatedFeedback += `[FILE DELETE SUCCESS: ${c.path}]\n`;
                        ChatUI.appendBubble('system', `[SUCCESS] Deleted ${c.path}`);
                    } else {
                        accumulatedFeedback += `[FILE DELETE SUCCESS: ${c.path} (Already gone)]\n`;
                        ChatUI.appendBubble('system', `[SUCCESS] Deleted ${c.path} (Already gone)`);
                    }
                } catch (err) {
                    accumulatedFeedback += `[FILE DELETE ERROR: ${c.path} - ${err.message}]\n`;
                    ChatUI.appendBubble('system', `[ERROR] Failed to delete ${c.path}: ${err.message}`);
                }
            }
        }

        // 3. Write and edit files
        if (writeCmds.length > 0) {
            if (typeof executeWriteFileBatchSilent === 'function') {
                const feedback = await executeWriteFileBatchSilent(writeCmds);
                accumulatedFeedback += feedback;
            }
        }
        if (editCmds.length > 0) {
            const blockCmds = editCmds.filter(c => c.type === 'block');
            const rangeCmds = editCmds.filter(c => c.type === 'range');
            if (blockCmds.length > 0 && typeof executeEditFileBatchSilent === 'function') {
                const feedback = await executeEditFileBatchSilent(blockCmds);
                accumulatedFeedback += feedback;
            }
            if (rangeCmds.length > 0 && typeof executeEditFileRangeBatchSilent === 'function') {
                const feedback = await executeEditFileRangeBatchSilent(rangeCmds);
                accumulatedFeedback += feedback;
            }
        }

        // 4. Move files
        if (moveCmds.length > 0) {
            for (const c of moveCmds) {
                try {
                    const realSrcPath = path.resolve(window.projectRoot || window.currentPath || process.cwd(), c.src);
                    const destPath = path.resolve(window.projectRoot || window.currentPath || process.cwd(), c.dest);
                    if (fs.existsSync(realSrcPath)) {
                        const parentDir = path.dirname(destPath);
                        if (!fs.existsSync(parentDir)) {
                            fs.mkdirSync(parentDir, { recursive: true });
                        }
                        fs.renameSync(realSrcPath, destPath);
                        accumulatedFeedback += `[FILE MOVE SUCCESS: ${c.src} to ${c.dest}]\n`;
                        ChatUI.appendBubble('system', `[SUCCESS] Moved ${c.src} to ${c.dest}`);
                    } else {
                        accumulatedFeedback += `[FILE MOVE ERROR: ${c.src} (File not found)]\n`;
                        ChatUI.appendBubble('system', `[ERROR] Failed to move ${c.src}: File not found`);
                    }
                } catch (err) {
                    accumulatedFeedback += `[FILE MOVE ERROR: ${c.src} - ${err.message}]\n`;
                    ChatUI.appendBubble('system', `[ERROR] Failed to move ${c.src}: ${err.message}`);
                }
            }
        }

        // Reload directory view
        if (typeof window.loadDirectory === 'function' && window.currentPath) {
            window.loadDirectory(window.currentPath);
        }

        // Update Project Map's file layout section dynamically to reflect disk changes
        if (window.autoUpdateMap && window.projectRoot && typeof window.generateOrUpdateProjectMap === 'function') {
            await window.generateOrUpdateProjectMap(window.projectRoot);
        }

        // 5. List directories
        if (listDirCmds.length > 0) {
            for (const c of listDirCmds) {
                try {
                    const targetPath = path.resolve(window.projectRoot || window.currentPath || process.cwd(), c.path);
                    if (fs.existsSync(targetPath)) {
                        const files = fs.readdirSync(targetPath);
                        const listText = files.map(f => `- ${f}`).join('\n') || "(Directory is empty)";
                        accumulatedFeedback += `[DIRECTORY LIST FOR ${c.path}]:\n${listText}\n\n`;
                        ChatUI.appendBubble('system', `[SUCCESS] Listed directory: ${c.path}`);
                    } else {
                        accumulatedFeedback += `[DIRECTORY LIST ERROR: ${c.path} (Directory not found)]\n`;
                        ChatUI.appendBubble('system', `[ERROR] Failed to list directory ${c.path}: Directory not found`);
                    }
                } catch (err) {
                    accumulatedFeedback += `[DIRECTORY LIST ERROR: ${c.path} - ${err.message}]\n`;
                    ChatUI.appendBubble('system', `[ERROR] Failed to list directory ${c.path}: ${err.message}`);
                }
            }
        }

        // 6. Search keywords
        if (searchKeywordCmds.length > 0) {
            for (const c of searchKeywordCmds) {
                const results = [];
                const walk = (dir) => {
                    const list = fs.readdirSync(dir);
                    for (const file of list) {
                        const fullPath = path.join(dir, file);
                        if (file === 'node_modules' || file === '.git' || file === '.gemini') continue;
                        try {
                            const stat = fs.statSync(fullPath);
                            if (stat && stat.isDirectory()) {
                                walk(fullPath);
                            } else {
                                const ext = path.extname(file).toLowerCase();
                                if (['.js', '.json', '.html', '.css', '.md', '.txt', '.cs', '.py', '.ts'].includes(ext)) {
                                    const content = fs.readFileSync(fullPath, 'utf-8');
                                    const lines = content.split('\n');
                                    lines.forEach((line, idx) => {
                                        if (line.toLowerCase().includes(c.pattern.toLowerCase())) {
                                            const rel = path.relative(window.projectRoot || window.currentPath || process.cwd(), fullPath);
                                            results.push({ file: rel, line: idx + 1, text: line.trim() });
                                        }
                                    });
                                }
                            }
                        } catch(e) {}
                        if (results.length > 50) break;
                    }
                };
                try {
                    walk(window.projectRoot || window.currentPath || process.cwd());
                    accumulatedFeedback += `[SEARCH RESULTS FOR "${c.pattern}"]: \n`;
                    if (results.length === 0) {
                        accumulatedFeedback += `No matches found.\n\n`;
                    } else {
                        results.forEach(r => {
                            accumulatedFeedback += `${r.file}:${r.line}: ${r.text}\n`;
                        });
                        accumulatedFeedback += `\n`;
                    }
                    ChatUI.appendBubble('system', `[SUCCESS] Searched keyword: ${c.pattern}`);
                } catch(e) {
                    accumulatedFeedback += `[SEARCH ERROR: ${e.message}]\n`;
                    ChatUI.appendBubble('system', `[ERROR] Search failed: ${e.message}`);
                }
            }
        }

        // 7. Run terminal commands
        if (runCommandCmds.length > 0) {
            const { exec } = require('child_process');
            for (const c of runCommandCmds) {
                ChatUI.appendBubble('system', `[SYSTEM] Running command: ${c.command}...\n`);
                let loaderBox = ChatUI.appendBubble('system', '');
                const loaderContent = loaderBox.querySelector('.bubble-content');
                if (loaderContent) {
                    loaderContent.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 8px; font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: var(--text-muted);">
                            <div class="terminal-loading-spinner" style="width: 12px; height: 12px; border-width: 1.5px;"></div>
                            <span>Executing: ${c.command}</span>
                        </div>
                    `;
                }
                
                await new Promise(resolve => {
                    exec(c.command, { cwd: window.projectRoot || window.currentPath || process.cwd(), timeout: 45000 }, async (err, stdout, stderr) => {
                        if (loaderBox) loaderBox.remove();
                        const output = (stdout + '\n' + stderr).trim() || "[No output]";
                        if (typeof ChatUI !== 'undefined' && typeof ChatUI.appendBubble === 'function') {
                            const resBox = ChatUI.appendBubble('system', '');
                            const resContent = resBox.querySelector('.bubble-content');
                            if (resContent) {
                                resContent.innerHTML = `
                                    <div style="background: var(--surface-low); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); font-family: 'JetBrains Mono', monospace; font-size: 11.5px; line-height: 1.4;">
                                        <div style="display: flex; align-items: center; gap: 6px; font-weight: bold; color: ${err ? '#FF5252' : '#4CAF50'}; margin-bottom: 8px;">
                                            <span>${err ? '❌ Command Failed' : '✅ Command Succeeded'}</span>
                                            <span style="color: var(--text-muted); font-size: 10.5px; font-weight: normal;">(&quot;${c.command}&quot;)</span>
                                        </div>
                                        <pre style="margin: 0; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 6px; overflow-x: auto; color: var(--text-main); font-size: 11px; max-height: 200px; white-space: pre-wrap;">${output.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
                                    </div>
                                `;
                            }
                        }
                        accumulatedFeedback += `[COMMAND EXECUTION RESULT FOR "${c.command}"]: \n${output}\n\n`;
                        resolve();
                    });
                });
            }
        }

        await submitConsolidatedFeedback(accumulatedFeedback);
    };

    if (hasPrompt) {
        const box = ChatUI.appendBubble('system', '');
        const content = box.querySelector('.bubble-content');
        
        content.innerHTML = `
            <div style="background: var(--surface-low); padding: 12px 14px; border-radius: 8px; border: 1px solid var(--border-color); font-family: 'DM Sans', monospace; font-size: 12px; color: var(--text-main); margin-bottom: 12px; line-height: 1.5; word-break: break-all; box-shadow: inset 0 2px 4px rgba(0,0,0,0.15); margin-top: 4px;">
                <div style="font-weight: bold; color: #ff9800; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                    <span>⚠️ PENDING ACTIONS CONFIRMATION</span>
                </div>
                
                ${deleteCmds.length > 0 ? `
                <div style="margin-bottom: 8px;">
                    <div style="color: #ef4444; font-weight: bold; font-size: 11px;">[DELETE]</div>
                    ${deleteCmds.map(c => `<div style="padding-left: 10px; color: var(--text-main); font-size: 11px;">- ${c.path}</div>`).join('')}
                </div>` : ''}
                
                ${(writeCmds.length > 0 || editCmds.length > 0) ? `
                <div style="margin-bottom: 8px;">
                    <div style="color: #3b82f6; font-weight: bold; font-size: 11px;">[MODIFY]</div>
                    ${writeCmds.map(c => `<div style="padding-left: 10px; color: var(--text-main); font-size: 11px;">- [NEW] ${c.path}</div>`).join('')}
                    ${editCmds.map(c => `<div style="padding-left: 10px; color: var(--text-main); font-size: 11px;">- [EDIT] ${c.path}</div>`).join('')}
                </div>` : ''}
                
                ${runCommandCmds.length > 0 ? `
                <div style="margin-bottom: 8px;">
                    <div style="color: #10b981; font-weight: bold; font-size: 11px;">[RUN COMMAND]</div>
                    ${runCommandCmds.map(c => `<div style="padding-left: 10px; color: var(--text-main); font-size: 11px;">- ${c.command}</div>`).join('')}
                </div>` : ''}
            </div>
            <div style="display: flex; gap: 8px;">
                <button class="cmd-run-btn" style="flex: 1; background: linear-gradient(135deg, #468CF6, #3b82f6); color: white; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 700; font-size: 11.5px; letter-spacing: 0.04em; font-family: 'DM Sans', sans-serif; transition: all 0.2s;">ALLOW ALL</button>
                <button class="cmd-cancel-btn" style="flex: 1; background: rgba(255, 255, 255, 0.04); color: var(--text-muted); border: 1px solid var(--border-color); padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 11.5px; letter-spacing: 0.04em; font-family: 'DM Sans', sans-serif; transition: all 0.2s;">DENY ALL</button>
            </div>
        `;

        const runBtn = content.querySelector('.cmd-run-btn');
        const cancelBtn = content.querySelector('.cmd-cancel-btn');
        if (runBtn) {
            runBtn.onmouseenter = () => { runBtn.style.filter = "brightness(1.1)"; };
            runBtn.onmouseleave = () => { runBtn.style.filter = "none"; };
        }
        if (cancelBtn) {
            cancelBtn.onmouseenter = () => { cancelBtn.style.background = "rgba(255, 255, 255, 0.08)"; cancelBtn.style.color = "var(--text-main)"; cancelBtn.style.borderColor = "rgba(255,255,255,0.15)"; };
            cancelBtn.onmouseleave = () => { cancelBtn.style.background = "rgba(255, 255, 255, 0.04)"; cancelBtn.style.color = "var(--text-muted)"; cancelBtn.style.borderColor = "var(--border-color)"; };
        }

        content.querySelector('.cmd-run-btn').onclick = () => {
            box.remove();
            runAllApprovedActions();
        };

        content.querySelector('.cmd-cancel-btn').onclick = () => {
            box.remove();
            
            // Build cancel feedback
            if (deleteCmds.length > 0) {
                deleteCmds.forEach(c => { accumulatedFeedback += `[FILE DELETE ERROR: ${c.path} - User denied permission]\n`; });
            }
            if (writeCmds.length > 0) {
                accumulatedFeedback += `[FILE WRITE DENIED BY USER: ${writeCmds.map(c => c.path).join(', ')}]\n`;
            }
            if (editCmds.length > 0) {
                accumulatedFeedback += `[FILE EDIT DENIED BY USER: ${editCmds.map(c => c.path).join(', ')}]\n`;
            }
            if (runCommandCmds.length > 0) {
                accumulatedFeedback += `[COMMAND EXECUTION CANCELLED BY USER]\n`;
            }
            
            submitConsolidatedFeedback(accumulatedFeedback);
        };
    } else {
        runAllApprovedActions();
    }
}

async function submitConsolidatedFeedback(feedback) {
    if (!feedback.trim()) return;
    
    let mapReminder = "";
    if (window.autoUpdateMap && window.projectRoot) {
        const projectName = path.basename(window.projectRoot);
        mapReminder = `\n\n[REMINDER] If your recent changes affected the directory tree, module responsibilities, or introduced new rules, please remember to update the project map using [CMD: write-file "${projectName}_Map.md"] with the updated content. If no updates are needed, continue with the task.`;
    }
    
    const finalMessage = `${feedback}\nProceed to next step.${window.getSystemRulesPrompt()}${mapReminder}`;
    await injectWebPayload(finalMessage, 0);
    
    window.currentBatchFileCount = 0;
    const response = await runExperimentalEngine('/marktag', finalMessage, null);
    if (!window.autoContinueOnRead) {
        document.getElementById('tab-local-agent')?.click();
    }
    if (response) {
        if (typeof window.finalizeAiBubble === 'function') {
            window.finalizeAiBubble(response);
        }
        detectAndAskCommand(response);
    }
}

window.setCoverLifted = function(lifted) {
    const vLC = document.getElementById('inspector-local-chat');
    if (!vLC) return;
    // Maintain a consistent height to prevent layout reflows and mouse coordinate mismatch during drag
    const h = window.currentSplitHeight || 130;
    vLC.style.height = `calc(100% - 44px - ${h}px)`;
};

window.detectAndAskCommand = detectAndAskCommand;
window.orchestrateCommands = orchestrateCommands;
window.setupBoot = setupBoot;
window.setupUI = setupUI;
window.GravityVault = GravityVault;
