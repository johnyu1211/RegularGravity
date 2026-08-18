async function orchestrateCommands(writeCmds, editCmds, deleteCmds, moveCmds, listDirCmds, createDirCmds, runCommandCmds, searchKeywordCmds) {
    let accumulatedFeedback = "";
    let isDeleteApproved = true;
    let isWriteEditApproved = true;

    const submitConsolidatedFeedback = async (feedback) => {
        if (!feedback.trim()) return;
        console.log("[Orchestrate] Command feedback collected (suppressed from Web AI injection):", feedback);
        window.currentBatchFileCount = 0;
        document.getElementById('tab-local-agent')?.click();
    };

    const startDeleteOrchestration = () => {
        if (deleteCmds.length > 0) {
            const displayDelete = deleteCmds.map(c => c.path).join(', ');
            const box = ChatUI.appendBubble('system', '');
            if (box) box.style.display = 'block';
            const content = box ? box.querySelector('.bubble-content') : null;
            const themeColor = "#ef4444"; 
            const glowShadow = "none";

            const onContinue = () => {
                if (box) box.remove();
                if (window.activeCommandCleanup) window.activeCommandCleanup();
                isDeleteApproved = true;
                startWriteEditOrchestration();
            };

            const onCancel = () => {
                if (box) box.remove();
                if (window.activeCommandCleanup) window.activeCommandCleanup();
                isDeleteApproved = false;
                deleteCmds.forEach(c => {
                    accumulatedFeedback += `[FILE DELETE ERROR: ${c.path} - User denied permission]\n`;
                    ChatUI.appendBubble('system', `[ERROR] Deletion of ${c.path} denied by user.`);
                });
                startWriteEditOrchestration();
            };

            if (content) {
                content.innerHTML = `
                <div style="background: var(--surface-low); padding: 12px 14px; border-radius: 8px; border: 1px solid var(--border-color); font-family: 'DM Sans', monospace; font-size: 12px; color: var(--text-main); margin-bottom: 12px; line-height: 1.5; word-break: break-all; box-shadow: inset 0 2px 4px rgba(0,0,0,0.15); margin-top: 4px;">
                    <div style="font-weight: bold; color: #ff4444; margin-bottom: 6px; display: flex; align-items: center; gap: 8px;">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>
                        <span>DELETE CONFIRMATION</span>
                    </div>
                    <span>Allow Web AI to delete: <strong style="color: var(--text-main); font-size: 11px; background: rgba(0,0,0,0.2); padding: 2px 6px; border-radius: 4px;">${displayDelete}</strong>?</span>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="cmd-run-btn" style="flex: 1; background: linear-gradient(135deg, ${themeColor}, ${themeColor}dd); color: white; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 700; font-size: 11.5px; letter-spacing: 0.04em; font-family: 'DM Sans', sans-serif; transition: all 0.2s; box-shadow: none;">ALLOW</button>
                    <button class="cmd-cancel-btn" style="flex: 1; background: rgba(255, 255, 255, 0.04); color: var(--text-muted); border: 1px solid var(--border-color); padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 11.5px; letter-spacing: 0.04em; font-family: 'DM Sans', sans-serif; transition: all 0.2s;">DENY</button>
                </div>
                `;
                const runBtn = content.querySelector('.cmd-run-btn');
                if (runBtn) runBtn.onclick = onContinue;
                const cancelBtn = content.querySelector('.cmd-cancel-btn');
                if (cancelBtn) cancelBtn.onclick = onCancel;
            }

            if (typeof window.showCommandExecutionPanel === 'function') {
                window.showCommandExecutionPanel(
                    "Delete Confirmation",
                    `Allow Web AI to delete: ${displayDelete}?`,
                    onContinue,
                    onCancel
                );
            }
        } else {
            startWriteEditOrchestration();
        }
    };

    const startWriteEditOrchestration = () => {
        if (writeCmds.length > 0 || editCmds.length > 0 || createDirCmds.length > 0 || moveCmds.length > 0 || searchKeywordCmds.length > 0) {
            const displayModify = [
                ...writeCmds.map(c => `[NEW] ${c.path}`),
                ...editCmds.map(c => `[MODIFY] ${c.path}`),
                ...createDirCmds.map(c => `[MKDIR] ${c.path}`),
                ...moveCmds.map(c => `[MOVE] ${c.src} → ${c.dest}`),
                ...searchKeywordCmds.map(c => `[SEARCH] ${c.keyword}`)
            ].join(', ');

            const box = ChatUI.appendBubble('system', '');
            const content = box.querySelector('.bubble-content');
            const themeColor = "#3b82f6";
            const glowShadow = "none";

            content.innerHTML = `
                <div style="background: var(--surface-low); padding: 12px 14px; border-radius: 8px; border: 1px solid var(--border-color); font-family: 'DM Sans', monospace; font-size: 12px; color: var(--text-main); margin-bottom: 12px; line-height: 1.5; word-break: break-all; box-shadow: inset 0 2px 4px rgba(0,0,0,0.15); margin-top: 4px;">
                    <div style="font-weight: bold; color: #3b82f6; margin-bottom: 6px; display: flex; align-items: center; gap: 8px;">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>
                        <span>ACTION / FILE CONFIRMATION</span>
                    </div>
                    <span>Allow Web AI to execute: <strong style="color: var(--text-main); font-size: 11px; background: rgba(0,0,0,0.2); padding: 2px 6px; border-radius: 4px;">${displayModify}</strong>?</span>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="cmd-run-btn" style="flex: 1; background: linear-gradient(135deg, ${themeColor}, ${themeColor}dd); color: white; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 700; font-size: 11.5px; letter-spacing: 0.04em; font-family: 'DM Sans', sans-serif; transition: all 0.2s; box-shadow: none;">ALLOW</button>
                    <button class="cmd-cancel-btn" style="flex: 1; background: rgba(255, 255, 255, 0.04); color: var(--text-muted); border: 1px solid var(--border-color); padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 11.5px; letter-spacing: 0.04em; font-family: 'DM Sans', sans-serif; transition: all 0.2s;">DENY</button>
                </div>
            `;

            const onContinue = () => {
                box.remove();
                if (window.activeCommandCleanup) window.activeCommandCleanup();
                isWriteEditApproved = true;
                runDiskModifications();
            };

            const onCancel = () => {
                box.remove();
                if (window.activeCommandCleanup) window.activeCommandCleanup();
                isWriteEditApproved = false;
                const writePaths = writeCmds.map(c => c.path).join(', ');
                const editPaths = editCmds.map(c => c.path).join(', ');
                if (writePaths) {
                    accumulatedFeedback += `[FILE WRITE DENIED BY USER: ${writePaths}]\n`;
                    ChatUI.appendBubble('system', `[DENIED] Blocked writing to: ${writePaths}`);
                }
                if (editPaths) {
                    accumulatedFeedback += `[FILE EDIT DENIED BY USER: ${editPaths}]\n`;
                    ChatUI.appendBubble('system', `[DENIED] Blocked editing: ${editPaths}`);
                }
                runDiskModifications();
            };

            content.querySelector('.cmd-run-btn').onclick = onContinue;
            content.querySelector('.cmd-cancel-btn').onclick = onCancel;

            if (typeof window.showCommandExecutionPanel === 'function') {
                window.showCommandExecutionPanel(
                    "Action / File Confirmation",
                    `Allow Web AI to execute: ${displayModify}?`,
                    onContinue,
                    onCancel
                );
            }
        } else {
            runDiskModifications();
        }
    };

    const runDiskModifications = async () => {
        if (deleteCmds.length > 0 && isDeleteApproved) {
            const fs = require('fs');
            const path = require('path');
            for (const c of deleteCmds) {
                try {
                    const targetPath = path.resolve(window.currentPath || process.cwd(), c.path);
                    const rootPath = path.resolve(window.currentPath || process.cwd());
                    if (targetPath === rootPath || targetPath === window.projectRoot || targetPath === process.cwd()) {
                        console.warn("[DeleteGuard] Blocked attempt to delete root project directory!");
                        accumulatedFeedback += `[DELETE BLOCKED: Cannot delete root project directory]\n`;
                        ChatUI.appendBubble('system', `[WARN] Blocked deletion of root project directory.`);
                        continue;
                    }
                    if (fs.existsSync(targetPath)) {
                        const stat = fs.statSync(targetPath);
                        const isDir = stat.isDirectory();
                        if (isDir) {
                            fs.rmSync(targetPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
                            if (window.expandedPaths && typeof window.expandedPaths.delete === 'function') {
                                window.expandedPaths.delete(targetPath);
                            }
                        } else {
                            fs.unlinkSync(targetPath);
                        }
                        accumulatedFeedback += `[${isDir ? 'DIR' : 'FILE'} DELETE SUCCESS: ${c.path}]\n`;
                        ChatUI.appendBubble('system', `[SUCCESS] Deleted ${isDir ? 'folder' : 'file'}: ${c.path}`);
                        if (typeof window.showUserScreenToast === 'function') {
                            window.showUserScreenToast(`Deleted: "${c.path}"`, 3500);
                        }
                    } else {
                        accumulatedFeedback += `[DELETE SUCCESS: ${c.path} (Already gone)]\n`;
                        ChatUI.appendBubble('system', `[SUCCESS] Deleted ${c.path} (Already gone)`);
                        if (typeof window.showUserScreenToast === 'function') {
                            window.showUserScreenToast(`Already gone: "${c.path}"`, 3500, true);
                        }
                    }
                } catch (err) {
                    accumulatedFeedback += `[DELETE ERROR: ${c.path} - ${err.message}]\n`;
                    ChatUI.appendBubble('system', `[ERROR] Failed to delete ${c.path}: ${err.message}`);
                }
            }
            if (typeof window.refreshTree === 'function') window.refreshTree();
        }

        if (createDirCmds.length > 0 && isWriteEditApproved) {
            const fs = require('fs');
            const path = require('path');
            for (const c of createDirCmds) {
                try {
                    const targetPath = path.resolve(window.currentPath || process.cwd(), c.path);
                    if (!fs.existsSync(targetPath)) {
                        fs.mkdirSync(targetPath, { recursive: true });
                    }
                    if (window.activeWebDirHandle && typeof window.createDirectoryInWebDirectory === 'function') {
                        await window.createDirectoryInWebDirectory(c.path);
                    }
                    accumulatedFeedback += `[DIRECTORY CREATED: ${c.path}]\n`;
                    ChatUI.appendBubble('system', `[SUCCESS] Created directory: ${c.path}`);
                    if (typeof window.showUserScreenToast === 'function') {
                        window.showUserScreenToast(`Directory created: "${c.path}"`, 3500);
                    }
                } catch(err) {
                    accumulatedFeedback += `[DIRECTORY CREATE ERROR: ${c.path} - ${err.message}]\n`;
                    ChatUI.appendBubble('system', `[ERROR] Failed to create directory ${c.path}: ${err.message}`);
                }
            }
        }

        if (isWriteEditApproved) {
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

            const modifiedFilesList = [];
            writeCmds.forEach(c => modifiedFilesList.push(c.path));
            editCmds.forEach(c => {
                if (!modifiedFilesList.includes(c.path)) {
                    modifiedFilesList.push(c.path);
                }
            });
            if (modifiedFilesList.length > 0) {
                accumulatedFeedback += `\n[SYSTEM] Please use the \`read-file\` or \`read-file-range\` command to inspect the modified files and verify your edits: ${modifiedFilesList.join(', ')}\n`;
                const fileCount = modifiedFilesList.length;
                const currFile = modifiedFilesList[0];
                const nextFile = fileCount > 1 ? modifiedFilesList[1] : null;
                const toastMsg = nextFile 
                    ? `Updated (1/${fileCount}): "${currFile}" → Next: "${nextFile}"` 
                    : `Updated: "${currFile}"`;
                if (typeof window.showUserScreenToast === 'function') {
                    window.showUserScreenToast(toastMsg, 3500);
                }
            }
        }

        if (moveCmds.length > 0 && isWriteEditApproved) {
            const fs = require('fs');
            const path = require('path');
            for (const c of moveCmds) {
                try {
                    const srcPath = path.resolve(window.currentPath || process.cwd(), c.src);
                    const destPath = path.resolve(window.currentPath || process.cwd(), c.dest);
                    if (fs.existsSync(srcPath)) {
                        const parentDir = path.dirname(destPath);
                        if (!fs.existsSync(parentDir)) {
                            fs.mkdirSync(parentDir, { recursive: true });
                        }
                        fs.renameSync(srcPath, destPath);
                        accumulatedFeedback += `[FILE MOVE SUCCESS: ${c.src} to ${c.dest}]\n`;
                        ChatUI.appendBubble('system', `[SUCCESS] Moved ${c.src} to ${c.dest}`);
                        if (typeof window.showUserScreenToast === 'function') {
                            window.showUserScreenToast(`Moved "${c.src}" → "${c.dest}"`, 3500);
                        }
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

        if (typeof window.loadDirectory === 'function' && window.currentPath) {
            window.loadDirectory(window.currentPath);
        }

        if (listDirCmds.length > 0 && isWriteEditApproved) {
            const fs = require('fs');
            const path = require('path');
            for (const c of listDirCmds) {
                try {
                    const targetPath = path.resolve(window.currentPath || process.cwd(), c.path);
                    if (fs.existsSync(targetPath)) {
                        let rawTree = (typeof ipcRenderer !== 'undefined' && ipcRenderer.invoke) ? await ipcRenderer.invoke('vault-get-tree', targetPath) : '';
                        let treeText = typeof rawTree === 'string' ? rawTree : (rawTree && typeof rawTree === 'object' && typeof rawTree.tree === 'string' ? rawTree.tree : '');

                        if ((!treeText || !treeText.trim()) && window.activeWebDirHandle) {
                            const rootName = window.activeWebDirHandle.name || 'Project';
                            const fileKeys = Object.keys(window.webFileCache || {}).filter(k => 
                                !k.startsWith('.') && 
                                !k.includes('node_modules') && 
                                !k.includes('SendingMD') && 
                                !k.includes('FollowThisORDER') && 
                                !k.includes('Files_') && 
                                !k.includes('ListDir_')
                            );
                            treeText = typeof window.generateBrowserTreeString === 'function'
                                ? window.generateBrowserTreeString(fileKeys, rootName)
                                : `${rootName}/\n` + fileKeys.slice(0, 100).map(f => `  ├── ${f}`).join('\n');
                        }

                        if (!treeText || !treeText.trim()) {
                            try {
                                const files = fs.readdirSync(targetPath);
                                treeText = files.map(f => `- ${f}`).join('\n') || "(Directory is empty)";
                            } catch(e) {
                                treeText = "(Directory is empty)";
                            }
                        }

                        const d = new Date();
                        const pad = (n) => String(n).padStart(2, '0');
                        const timeStr = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

                        const mdContent = `# Command Result: list-dir "${c.path}" (${timeStr})\n\n[PROJECT TREE: ${c.path}]\n${treeText}\n\n[SYSTEM] Please acknowledge receipt of the updated directory listing for "${c.path}".`;

                        const baseFileName = typeof window.makeSendingMdListDirName === 'function'
                            ? window.makeSendingMdListDirName(c.path)
                            : path.join('gravity_vault', 'SendingMD', `ListDir_${window.getSendingMdTimeTag ? window.getSendingMdTimeTag() : Date.now()}.md`);

                        const payload = await window.prepareFilePayload(baseFileName, mdContent);

                        if (typeof window.refreshTree === 'function') window.refreshTree();

                        if (typeof window.addFileToRequestedQueue === 'function') {
                            window.addFileToRequestedQueue(payload.relativePath);
                        }

                        accumulatedFeedback += `[PROJECT TREE FILE CREATED: ${payload.relativePath}]\n${mdContent}\n\n`;
                        ChatUI.appendBubble('system', `[SUCCESS] Listed directory: ${c.path} (Saved: ${payload.relativePath})`);
                        if (typeof window.showUserScreenToast === 'function') {
                            window.showUserScreenToast(`Directory tree generated for "${c.path}"`, 3500);
                        }

                        if (typeof window.updateDragDropQueueUI === 'function') {
                            window.updateDragDropQueueUI();
                        }
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

        if (searchKeywordCmds.length > 0 && isWriteEditApproved) {
            const fs = require('fs');
            const path = require('path');
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
                                            const rel = path.relative(window.currentPath || process.cwd(), fullPath);
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
                    walk(window.currentPath || process.cwd());
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
                    if (typeof window.showUserScreenToast === 'function') {
                        window.showUserScreenToast(`Search completed: "${c.pattern}" (${results.length} matches)`, 3500);
                    }
                } catch(e) {
                    accumulatedFeedback += `[SEARCH ERROR: ${e.message}]\n`;
                    ChatUI.appendBubble('system', `[ERROR] Search failed: ${e.message}`);
                }
            }
        }

        startCommandOrchestration();
    };

    const startCommandOrchestration = () => {
        if (runCommandCmds.length > 0) {
            const displayCmd = runCommandCmds.map(c => `run-command "${c.command}"`).join(', ');
            const box = ChatUI.appendBubble('system', '');
            const content = box.querySelector('.bubble-content');
            const themeColor = "#ef4444"; 
            const glowShadow = "none";

            content.innerHTML = `
                <div style="background: var(--surface-low); padding: 12px 14px; border-radius: 8px; border: 1px solid var(--border-color); font-family: 'DM Sans', monospace; font-size: 12px; color: var(--text-main); margin-bottom: 12px; line-height: 1.5; word-break: break-all; box-shadow: inset 0 2px 4px rgba(0,0,0,0.15); margin-top: 4px;">
                    <div style="font-weight: bold; color: #ff4444; margin-bottom: 6px; display: flex; align-items: center; gap: 8px;">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>
                        <span>SECURITY WARNING</span>
                    </div>
                    <span>Allow Web AI to execute: <strong style="color: var(--text-main); font-size: 11px; background: rgba(0,0,0,0.2); padding: 2px 6px; border-radius: 4px;">${displayCmd}</strong>?</span>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="cmd-run-btn" style="flex: 1; background: linear-gradient(135deg, ${themeColor}, ${themeColor}dd); color: white; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 700; font-size: 11.5px; letter-spacing: 0.04em; font-family: 'DM Sans', sans-serif; transition: all 0.2s; box-shadow: none;">ALLOW</button>
                    <button class="cmd-cancel-btn" style="flex: 1; background: rgba(255, 255, 255, 0.04); color: var(--text-muted); border: 1px solid var(--border-color); padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 11.5px; letter-spacing: 0.04em; font-family: 'DM Sans', sans-serif; transition: all 0.2s;">DENY</button>
                </div>
            `;

            const onContinue = async () => {
                box.remove();
                if (window.activeCommandCleanup) window.activeCommandCleanup();
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
                        exec(c.command, { cwd: window.currentPath || process.cwd(), timeout: 45000 }, async (err, stdout, stderr) => {
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
                            if (typeof window.showUserScreenToast === 'function') {
                                const toastText = err ? `Command failed: "${c.command}"` : `Command executed: "${c.command}"`;
                                window.showUserScreenToast(toastText, 3500, !err);
                            }
                            accumulatedFeedback += `[COMMAND EXECUTION RESULT FOR "${c.command}"]: \n${output}\n\n`;
                            resolve();
                        });
                    });
                }
                await submitConsolidatedFeedback(accumulatedFeedback);
            };

            const onCancel = () => {
                box.remove();
                if (window.activeCommandCleanup) window.activeCommandCleanup();
                accumulatedFeedback += `[COMMAND EXECUTION CANCELLED BY USER]\n`;
                submitConsolidatedFeedback(accumulatedFeedback);
            };

            content.querySelector('.cmd-run-btn').onclick = onContinue;
            content.querySelector('.cmd-cancel-btn').onclick = onCancel;

            if (typeof window.showCommandExecutionPanel === 'function') {
                window.showCommandExecutionPanel(
                    "Security Warning",
                    `Allow Web AI to execute: ${displayCmd}?`,
                    onContinue,
                    onCancel
                );
            }
        } else {
            submitConsolidatedFeedback(accumulatedFeedback);
        }
    };

    startDeleteOrchestration();
}

async function submitConsolidatedFeedback(feedback) {
    if (!feedback.trim()) return;
    console.log("[Orchestrate] Command feedback collected (suppressed from Web AI injection):", feedback);
    window.currentBatchFileCount = 0;
    document.getElementById('tab-local-agent')?.click();
}

window.orchestrateCommands = orchestrateCommands;
window.submitConsolidatedFeedback = submitConsolidatedFeedback;
