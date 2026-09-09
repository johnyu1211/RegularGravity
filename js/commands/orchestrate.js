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
            if (window.justRunCommands === true) {
                isDeleteApproved = true;
                startWriteEditOrchestration();
                return;
            }

            const displayDelete = deleteCmds.map(c => c.path).join(', ');
            const box = ChatUI.appendBubble('system', '');
            if (box) box.style.display = 'block';
            const content = box ? box.querySelector('.bubble-content') : null;
            const themeColor = "#ef4444"; 
            const glowShadow = "none";

            const onContinue = (checkpointName = '') => {
                if (box) box.remove();
                if (window.activeCommandCleanup) window.activeCommandCleanup();
                isDeleteApproved = true;
                startWriteEditOrchestration(checkpointName);
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
                    <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 4px;">
                        <label style="font-size: 10.5px; font-weight: 700; color: #9aa0a6; font-family: 'DM Sans', sans-serif; letter-spacing: 0.03em;">
                            Previous State Label :
                        </label>
                        <input type="text" class="cmd-checkpoint-input" placeholder="Save state name before applying changes below (Optional)" style="width: 100%; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); color: #fff; font-size: 11px; padding: 6px 10px; border-radius: 6px; outline: none; box-sizing: border-box; font-family: 'DM Sans', sans-serif;">
                    </div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="cmd-run-btn" style="flex: 1; background: linear-gradient(135deg, ${themeColor}, ${themeColor}dd); color: white; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 700; font-size: 11.5px; letter-spacing: 0.04em; font-family: 'DM Sans', sans-serif; transition: all 0.2s; box-shadow: none;">ALLOW</button>
                    <button class="cmd-cancel-btn" style="flex: 1; background: rgba(255, 255, 255, 0.04); color: var(--text-muted); border: 1px solid var(--border-color); padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 11.5px; letter-spacing: 0.04em; font-family: 'DM Sans', sans-serif; transition: all 0.2s;">DENY</button>
                </div>
                `;
                const runBtn = content.querySelector('.cmd-run-btn');
                if (runBtn) {
                    runBtn.onclick = () => {
                        const cpIn = content.querySelector('.cmd-checkpoint-input');
                        onContinue(cpIn ? cpIn.value.trim() : '');
                    };
                }
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

    const startWriteEditOrchestration = (inheritedCheckpointName = '') => {
        if (writeCmds.length > 0 || editCmds.length > 0 || createDirCmds.length > 0 || moveCmds.length > 0 || searchKeywordCmds.length > 0) {
            if (window.justRunCommands === true) {
                isWriteEditApproved = true;
                runDiskModifications(inheritedCheckpointName);
                return;
            }

            // If only search commands are requested (pure read/search, no modifications), execute immediately without asking modal confirmation
            const hasActualModifications = (writeCmds.length > 0 || editCmds.length > 0 || createDirCmds.length > 0 || moveCmds.length > 0);
            if (!hasActualModifications && searchKeywordCmds.length > 0) {
                isWriteEditApproved = true;
                runDiskModifications(inheritedCheckpointName);
                return;
            }

            const displayModify = [
                ...writeCmds.map(c => `[NEW] ${c.path}`),
                ...editCmds.map(c => `[MODIFY] ${c.path}`),
                ...createDirCmds.map(c => `[MKDIR] ${c.path}`),
                ...moveCmds.map(c => `[MOVE] ${c.src} → ${c.dest}`),
                ...searchKeywordCmds.map(c => `[SEARCH] ${c.pattern || c.keyword || ''}`)
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
                    <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 4px;">
                        <label style="font-size: 10.5px; font-weight: 700; color: #9aa0a6; font-family: 'DM Sans', sans-serif; letter-spacing: 0.03em;">
                            Previous State Label :
                        </label>
                        <input type="text" class="cmd-checkpoint-input" value="${inheritedCheckpointName || ''}" placeholder="Save state name before applying changes below (Optional)" style="width: 100%; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); color: #fff; font-size: 11px; padding: 6px 10px; border-radius: 6px; outline: none; box-sizing: border-box; font-family: 'DM Sans', sans-serif;">
                    </div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="cmd-run-btn" style="flex: 1; background: linear-gradient(135deg, ${themeColor}, ${themeColor}dd); color: white; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 700; font-size: 11.5px; letter-spacing: 0.04em; font-family: 'DM Sans', sans-serif; transition: all 0.2s; box-shadow: none;">ALLOW</button>
                    <button class="cmd-cancel-btn" style="flex: 1; background: rgba(255, 255, 255, 0.04); color: var(--text-muted); border: 1px solid var(--border-color); padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 11.5px; letter-spacing: 0.04em; font-family: 'DM Sans', sans-serif; transition: all 0.2s;">DENY</button>
                </div>
            `;

            const onContinue = (checkpointName = '') => {
                box.remove();
                if (window.activeCommandCleanup) window.activeCommandCleanup();
                isWriteEditApproved = true;
                runDiskModifications(checkpointName || inheritedCheckpointName);
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

            const runBtn = content.querySelector('.cmd-run-btn');
            if (runBtn) {
                runBtn.onclick = () => {
                    const cpIn = content.querySelector('.cmd-checkpoint-input');
                    onContinue(cpIn ? cpIn.value.trim() : '');
                };
            }
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
            runDiskModifications(inheritedCheckpointName);
        }
    };

    const runDiskModifications = async (checkpointName = '') => {
        const fs = require('fs');
        const path = require('path');

        if (window.UndoManager) {
            window.UndoManager.beginTransaction(checkpointName || "AI File Changes");
            
            if (deleteCmds.length > 0 && isDeleteApproved) {
                deleteCmds.forEach(c => {
                    const targetPath = path.resolve(window.currentPath || process.cwd(), c.path);
                    window.UndoManager.recordPreState(targetPath, 'delete');
                });
            }
            if (writeCmds.length > 0 && isWriteEditApproved) {
                writeCmds.forEach(c => {
                    const targetPath = path.resolve(window.currentPath || process.cwd(), c.path);
                    window.UndoManager.recordPreState(targetPath, 'write');
                });
            }
            if (editCmds.length > 0 && isWriteEditApproved) {
                editCmds.forEach(c => {
                    const targetPath = path.resolve(window.currentPath || process.cwd(), c.path);
                    window.UndoManager.recordPreState(targetPath, 'edit');
                });
            }
            if (moveCmds.length > 0 && isWriteEditApproved) {
                moveCmds.forEach(c => {
                    const srcPath = path.resolve(window.currentPath || process.cwd(), c.src);
                    const destPath = path.resolve(window.currentPath || process.cwd(), c.dest);
                    window.UndoManager.recordPreMove(srcPath, destPath);
                });
            }
        }

        if (deleteCmds.length > 0 && isDeleteApproved) {
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

        if (window.UndoManager) {
            window.UndoManager.commitTransaction();
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

                        window.dragDropMode = true;
                        if (!window.activeDragDropContinue) {
                            window.activeDragDropContinue = async () => {};
                        }
                        const cleanup = () => {
                            if (window.activeDragDropCleanup === cleanup) {
                                window.activeDragDropCleanup = null;
                                window.activeDragDropContinue = null;
                            }
                            window.dragDropMode = false;
                            window.requestedFilesQueue = [];
                            if (typeof window.updateDragDropQueueUI === 'function') {
                                window.updateDragDropQueueUI();
                            }
                        };
                        window.activeDragDropCleanup = cleanup;

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
            const escapeHtml = (str) => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

            for (const c of searchKeywordCmds) {
                const searchPattern = c.pattern || c.keyword || '';
                if (!searchPattern) continue;

                const results = [];
                const supportedExts = [
                    '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
                    '.json', '.html', '.htm', '.css', '.scss', '.sass', '.less',
                    '.md', '.txt', '.py', '.java', '.c', '.cpp', '.h', '.hpp',
                    '.cs', '.go', '.rs', '.vue', '.svelte', '.yaml', '.yml',
                    '.xml', '.sql', '.sh', '.bat', '.ps1', '.toml', '.ini', '.env'
                ];
                const ignoredDirs = new Set([
                    'node_modules', '.git', 'gravity_vault', 'dist', 'out',
                    'build', '.next', '.nuxt', '.vscode', '.idea', '.gemini', 'tmp'
                ]);

                const walk = (dir) => {
                    let list = [];
                    try { list = fs.readdirSync(dir); } catch(e) { return; }
                    for (const file of list) {
                        if (file.startsWith('.') && file !== '.env') continue;
                        if (ignoredDirs.has(file)) continue;
                        const fullPath = path.join(dir, file);
                        try {
                            const stat = fs.statSync(fullPath);
                            if (stat && stat.isDirectory()) {
                                walk(fullPath);
                            } else if (stat && stat.isFile()) {
                                const ext = path.extname(file).toLowerCase();
                                if (supportedExts.includes(ext)) {
                                    const content = fs.readFileSync(fullPath, 'utf-8');
                                    const lines = content.replace(/\r/g, '').split('\n');
                                    lines.forEach((line, idx) => {
                                        if (line.toLowerCase().includes(searchPattern.toLowerCase())) {
                                            const rel = path.relative(window.currentPath || process.cwd(), fullPath);
                                            results.push({ file: rel, fullPath: fullPath, line: idx + 1, text: line.trim() });
                                        }
                                    });
                                }
                            }
                        } catch(e) {}
                        if (results.length >= 200) break;
                    }
                };

                try {
                    walk(window.currentPath || process.cwd());

                    // Group results by file
                    const fileGroups = {};
                    results.forEach(r => {
                        if (!fileGroups[r.file]) fileGroups[r.file] = [];
                        fileGroups[r.file].push(r);
                    });
                    const matchedFiles = Object.keys(fileGroups);

                    const d = new Date();
                    const pad = (n) => String(n).padStart(2, '0');
                    const timeStr = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

                    // Build markdown payload for SendingMD
                    let mdContent = `# Search Results: "${searchPattern}" (${timeStr})\n\n`;
                    mdContent += `Total Matches: ${results.length} across ${matchedFiles.length} file(s)\n\n`;

                    if (results.length === 0) {
                        mdContent += `No matches found for "${searchPattern}" in the project workspace.\n\n`;
                    } else {
                        mdContent += `## Summary by File:\n`;
                        matchedFiles.forEach(f => {
                            mdContent += `- \`${f}\` (${fileGroups[f].length} match${fileGroups[f].length > 1 ? 'es' : ''})\n`;
                        });
                        mdContent += `\n## Matching Lines:\n`;
                        matchedFiles.forEach(f => {
                            mdContent += `### \`${f}\` (${fileGroups[f].length} match${fileGroups[f].length > 1 ? 'es' : ''})\n`;
                            fileGroups[f].forEach(m => {
                                const sanitizedLine = m.text.replace(/`/g, "'");
                                mdContent += `- Line ${m.line}: \`${sanitizedLine}\`\n`;
                            });
                            mdContent += `\n`;
                        });
                        mdContent += `[SYSTEM] Proceed to inspect or analyze the search matches above.\n`;
                    }

                    // Prepare file payload in gravity_vault/SendingMD/
                    const baseFileName = (typeof window.makeSendingMdSearchName === 'function')
                        ? window.makeSendingMdSearchName(searchPattern)
                        : path.join('gravity_vault', 'SendingMD', `Search_${searchPattern.replace(/[^\w]/g, '_').slice(0, 15)}_${Date.now()}.md`);

                    const payload = await window.prepareFilePayload(baseFileName, mdContent);

                    // Register to Drag & Drop Queue
                    window.dragDropMode = true;
                    if (!window.activeDragDropContinue) {
                        window.activeDragDropContinue = async () => {};
                    }
                    const cleanup = () => {
                        if (window.activeDragDropCleanup === cleanup) {
                            window.activeDragDropCleanup = null;
                            window.activeDragDropContinue = null;
                        }
                        window.dragDropMode = false;
                        window.requestedFilesQueue = [];
                        if (typeof window.updateDragDropQueueUI === 'function') {
                            window.updateDragDropQueueUI();
                        }
                    };
                    window.activeDragDropCleanup = cleanup;

                    if (typeof window.refreshTree === 'function') window.refreshTree();

                    if (typeof window.addFileToRequestedQueue === 'function') {
                        window.addFileToRequestedQueue(payload.relativePath);
                    }

                    if (typeof window.updateDragDropQueueUI === 'function') {
                        window.updateDragDropQueueUI();
                    }

                    accumulatedFeedback += `[SEARCH RESULTS FILE CREATED: ${payload.relativePath}]\n${mdContent}\n\n`;

                    // Render rich UI Card in ChatUI so the user can immediately see where matches occurred!
                    const box = ChatUI.appendBubble('system', '');
                    if (box) {
                        box.style.display = 'block';
                        const content = box.querySelector('.bubble-content');
                        if (content) {
                            if (results.length === 0) {
                                content.innerHTML = `
                                    <div style="background: var(--surface-low); padding: 12px 14px; border-radius: 8px; border: 1px solid var(--border-color); font-family: 'DM Sans', sans-serif; font-size: 12px; color: var(--text-main); margin-top: 4px;">
                                        <div style="display: flex; align-items: center; gap: 8px; font-weight: bold; color: #f59e0b; margin-bottom: 4px;">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                                            <span>SEARCH RESULTS: "${escapeHtml(searchPattern)}"</span>
                                        </div>
                                        <span style="color: var(--text-muted); font-size: 11.5px;">No matches found in the project.</span>
                                    </div>
                                `;
                            } else {
                                const filesCardsHtml = matchedFiles.map(f => {
                                    const items = fileGroups[f];
                                    const linesPreview = items.slice(0, 15).map(m => `
                                        <div style="display: flex; gap: 8px; margin-bottom: 3px; line-height: 1.35;">
                                            <span style="color: #eab308; min-width: 42px; flex-shrink: 0; user-select: none;">L${m.line}:</span>
                                            <span style="color: #e2e8f0; white-space: pre-wrap; word-break: break-all;">${escapeHtml(m.text)}</span>
                                        </div>
                                    `).join('');
                                    const moreNotice = items.length > 15 ? `<div style="color: var(--text-muted); font-size: 10px; margin-top: 4px;">... and ${items.length - 15} more matches in this file</div>` : '';

                                    return `
                                        <details style="background: rgba(0,0,0,0.22); border-radius: 6px; overflow: hidden; border: 1px solid rgba(255,255,255,0.06); margin-bottom: 6px;" open>
                                            <summary style="padding: 6px 10px; cursor: pointer; font-family: 'JetBrains Mono', monospace; font-size: 11.5px; font-weight: 600; color: #60a5fa; display: flex; align-items: center; justify-content: space-between; user-select: none; background: rgba(255,255,255,0.02);">
                                                <span style="display: flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                                                    ${escapeHtml(f)}
                                                </span>
                                                <span style="font-size: 10.5px; color: #94a3b8; font-weight: 500; background: rgba(255,255,255,0.05); padding: 1px 6px; border-radius: 4px; flex-shrink: 0; margin-left: 8px;">
                                                    ${items.length} match${items.length > 1 ? 'es' : ''}
                                                </span>
                                            </summary>
                                            <div style="padding: 8px 10px; background: rgba(0,0,0,0.18); border-top: 1px solid rgba(255,255,255,0.04); font-family: 'JetBrains Mono', monospace; font-size: 11px;">
                                                ${linesPreview}
                                                ${moreNotice}
                                            </div>
                                        </details>
                                    `;
                                }).join('');

                                content.innerHTML = `
                                    <div style="background: var(--surface-low); padding: 12px 14px; border-radius: 8px; border: 1px solid var(--border-color); font-family: 'DM Sans', sans-serif; font-size: 12px; color: var(--text-main); margin-top: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
                                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 8px;">
                                            <div style="display: flex; align-items: center; gap: 8px; font-weight: 700; color: #38bdf8;">
                                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                                                <span>SEARCH RESULTS: "${escapeHtml(searchPattern)}"</span>
                                            </div>
                                            <span style="font-size: 11px; color: #38bdf8; background: rgba(56,189,248,0.12); padding: 2px 8px; border-radius: 4px; font-weight: 600;">
                                                ${results.length} matches in ${matchedFiles.length} file${matchedFiles.length > 1 ? 's' : ''}
                                            </span>
                                        </div>
                                        <div style="max-height: 260px; overflow-y: auto; padding-right: 4px;">
                                            ${filesCardsHtml}
                                        </div>
                                        <div style="display: flex; align-items: center; gap: 8px; margin-top: 10px; font-size: 11px; color: #10b981; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.08);">
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                            <span>Payload ready: <strong style="color: #34d399; font-family: 'JetBrains Mono', monospace; font-size: 11px;">${escapeHtml(payload.relativePath)}</strong> (Available in Drag &amp; Drop Queue)</span>
                                        </div>
                                    </div>
                                `;
                            }
                        }
                    }

                    if (typeof window.showUserScreenToast === 'function') {
                        window.showUserScreenToast(`Search: "${searchPattern}" (${results.length} matches) - Payload in Queue`, 3500, results.length > 0);
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
            if (window.justRunCommands === true) {
                for (const c of runCommandCmds) {
                    ChatUI.appendBubble('system', `[SYSTEM] Dispatched to internal terminal: ${c.command}\n`);
                    if (typeof window.executeCommandInTerminal === 'function') {
                        window.executeCommandInTerminal(c.command);
                    }
                    if (typeof window.showUserScreenToast === 'function') {
                        window.showUserScreenToast(`Executed in Terminal: "${c.command}"`, 3500, true);
                    }
                    accumulatedFeedback += `[COMMAND DISPATCHED TO INTERNAL TERMINAL]: "${c.command}"\n(The command has been launched in the interactive terminal window.)\n\n`;
                }
                submitConsolidatedFeedback(accumulatedFeedback);
                return;
            }

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
                
                for (const c of runCommandCmds) {
                    ChatUI.appendBubble('system', `[SYSTEM] Dispatched to internal terminal: ${c.command}\n`);
                    
                    if (typeof window.executeCommandInTerminal === 'function') {
                        window.executeCommandInTerminal(c.command);
                    }
                    
                    if (typeof window.showUserScreenToast === 'function') {
                        window.showUserScreenToast(`Executed in Terminal: "${c.command}"`, 3500, true);
                    }
                    accumulatedFeedback += `[COMMAND DISPATCHED TO INTERNAL TERMINAL]: "${c.command}"\n(The command has been launched in the interactive terminal window.)\n\n`;
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
