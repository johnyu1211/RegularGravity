function detectAndAskCommand(text) {
    if (!text) return;
    const fs = require('fs');
    const path = require('path');
    

    // Clean up temporary md files from previous turns deterministically on new response
    try {
        const fs = require('fs');
        const path = require('path');
        const dir = window.projectRoot || window.currentPath;
        if (dir && fs.existsSync(dir)) {
            // Clean up root leftovers
            const files = fs.readdirSync(dir);
            files.forEach(file => {
                if ((file.startsWith('_project_rules_') || file.startsWith('_project_read_bundle_')) && file.endsWith('.md')) {
                    try { fs.unlinkSync(path.join(dir, file)); } catch(e) {}
                }
            });
            // Clean up SendingMD folder
            const gravityRoot = window.appRootPath || process.cwd();
            const sendingMdDir = path.join(gravityRoot, 'SendingMD');
            if (fs.existsSync(sendingMdDir)) {
                const subfiles = fs.readdirSync(sendingMdDir);
                subfiles.forEach(file => {
                    if ((file.startsWith('_project_rules_') || file.startsWith('_project_read_bundle_')) && file.endsWith('.md')) {
                        try { fs.unlinkSync(path.join(sendingMdDir, file)); } catch(e) {}
                    }
                });
            }
            if (typeof window.refreshTree === 'function') {
                window.refreshTree();
            }
        }
    } catch(e) {}

    // Reset requested files queue for the new AI response/turn
    window.requestedFilesQueue = [];

    let isBriefing = false;
    if (window.isBriefingResponsePending) {
        window.isBriefingResponsePending = false;
        isBriefing = true;
        console.log("[BriefingShield] Activated: Ignoring any non-read commands during briefing response.");
    }

    const cmdRegex = /\[(CMD|REQUEST):\s*([^\]]+)\]/gi;
    let match;
    const foundCmds = [];
    while ((match = cmdRegex.exec(text)) !== null) {
        const cleanCmd = match[2].trim();
        if (cleanCmd) {
            if (cleanCmd === '...' || cleanCmd.includes('...')) continue;
            if (cleanCmd.includes('경로') || cleanCmd.includes('path') || cleanCmd.includes('요청')) continue;
            foundCmds.push(cleanCmd);
        }
    }

    if (foundCmds.length === 0) {
        const lines = text.split('\n');
        for (let line of lines) {
            let trimmed = line.trim().replace(/^[`\s]+|[`\s]+$/g, '');
            if (/^(read-file|write-file|edit-file|edit-file-range|read-file-full|read-file-range|delete-file|run-command|list-dir|search-keyword|move-file|reset-session)\b/i.test(trimmed)) {
                foundCmds.push(trimmed);
            }
        }
    }

    if (foundCmds.length === 0) {
        const toast = document.getElementById('injection-toast');
        if (toast) toast.style.display = 'none';
        document.getElementById('tab-local-agent')?.click();
        if (typeof window.updateDragDropQueueUI === 'function') {
            window.updateDragDropQueueUI();
        }
        return;
    }

    const readCmds = [];
    const writeCmds = [];
    const editCmds = [];
    const deleteCmds = [];
    const createDirCmds = [];
    const runCommandCmds = [];
    const searchKeywordCmds = [];
    const moveFileCmds = [];
    const listDirCmds = [];
    const otherCmds = [];
    let hasResetSession = false;

    foundCmds.forEach(cmd => {
        const rawCmd = cmd;
        if (isBriefing) {
            if (!cmd.startsWith('read-file') && !cmd.startsWith('list-dir') && !cmd.startsWith('search-keyword')) {
                console.log(`[BriefingShield] Blocked non-read command during briefing: ${cmd}`);
                return;
            }
        }

        const fileMatch = cmd.match(/^read-file\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))$/i);
        const fileFullMatch = cmd.match(/^read-file-full\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))$/i);
        const rangeMatch = cmd.match(/^read-file-range\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))\s+(\d+)-(\d+)$/i);
        const writeMatch = cmd.match(/^write-file\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))$/i);
        const editRangeMatch = cmd.match(/^edit-file-range\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))\s+(\d+)-(\d+)$/i);
        const editMatch = cmd.match(/^edit-file\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))$/i);
        const deleteMatch = cmd.match(/^delete-file\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))$/i);
        const createDirMatch = cmd.match(/^create-dir\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))$/i);
        const runCommandMatch = cmd.match(/^run-command\s+(.*)$/i);
        const searchKeywordMatch = cmd.match(/^search-keyword\s+(.*)$/i);
        const moveFileMatch = cmd.match(/^move-file\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))$/i);
        const listDirMatch = cmd.match(/^list-dir(?:\s+(.*))?$/i);
        const resetSessionMatch = cmd.match(/^reset-session$/i);

        const fs = require('fs');
        const path = require('path');

        const getParsedPath = (m) => m ? (m[1] || m[2] || m[3]) : '';

        const resolvePathAndExists = (rawPath) => {
            let fp = rawPath.trim();
            let tp = path.resolve(window.currentPath || process.cwd(), fp);
            let ex = fs.existsSync(tp);
            if (!ex) {
                const prefixRegex = /^SendingMD[\\/]/i;
                if (prefixRegex.test(fp)) {
                    const stripped = fp.replace(prefixRegex, '');
                    const strippedTp = path.resolve(window.currentPath || process.cwd(), stripped);
                    if (fs.existsSync(strippedTp)) {
                        console.log(`[PathSanitizer] Stripped 'SendingMD/' prefix: ${fp} -> ${stripped}`);
                        fp = stripped;
                        tp = strippedTp;
                        ex = true;
                    }
                }
            }
            let isDir = false;
            if (ex) {
                try { isDir = fs.statSync(tp).isDirectory(); } catch(e) {}
            }
            return { path: fp, exists: ex, isDirectory: isDir };
        };

        if (rangeMatch) {
            const pathStr = getParsedPath(rangeMatch);
            const res = resolvePathAndExists(pathStr);
            readCmds.push({ path: res.path, full: false, range: true, start: parseInt(rangeMatch[4]), end: parseInt(rangeMatch[5]), exists: res.exists, isDirectory: res.isDirectory });
        } else if (fileFullMatch) {
            const pathStr = getParsedPath(fileFullMatch);
            const res = resolvePathAndExists(pathStr);
            readCmds.push({ path: res.path, full: true, exists: res.exists, isDirectory: res.isDirectory });
        } else if (fileMatch) {
            const pathStr = getParsedPath(fileMatch);
            const res = resolvePathAndExists(pathStr);
            readCmds.push({ path: res.path, full: false, exists: res.exists, isDirectory: res.isDirectory });
        } else if (writeMatch) {
            const findCmdIdx = (fullText, targetCmd) => {
                let idx = fullText.indexOf(targetCmd);
                if (idx !== -1) return idx;
                const sanitized = targetCmd.replace(/"/g, '\\"');
                idx = fullText.indexOf(sanitized);
                if (idx !== -1) return idx;
                const baseCmd = targetCmd.split(/\s+/)[0];
                return fullText.indexOf(baseCmd);
            };

            const filePath = getParsedPath(writeMatch).trim();
            const cmdIdx = findCmdIdx(text, rawCmd);
            let codeVal = "";
            let hasCodeBlock = false;
            if (cmdIdx !== -1) {
                const subText = text.substring(cmdIdx);
                const codeBlockMatch = subText.match(/```[a-zA-Z]*\n([\s\S]*?)\n```/);
                if (codeBlockMatch) {
                    codeVal = codeBlockMatch[1];
                    hasCodeBlock = true;
                }
            }
            if (hasCodeBlock) {
                writeCmds.push({ path: filePath, code: codeVal });
            }
        } else if (editRangeMatch) {
            const findCmdIdx = (fullText, targetCmd) => {
                let idx = fullText.indexOf(targetCmd);
                if (idx !== -1) return idx;
                const sanitized = targetCmd.replace(/"/g, '\\"');
                idx = fullText.indexOf(sanitized);
                if (idx !== -1) return idx;
                const baseCmd = targetCmd.split(/\s+/)[0];
                return fullText.indexOf(baseCmd);
            };

            const filePath = getParsedPath(editRangeMatch).trim();
            const startLine = parseInt(editRangeMatch[4]);
            const endLine = parseInt(editRangeMatch[5]);
            const cmdIdx = findCmdIdx(text, rawCmd);
            let codeVal = "";
            let hasCodeBlock = false;
            if (cmdIdx !== -1) {
                const subText = text.substring(cmdIdx);
                const codeBlockMatch = subText.match(/```[a-zA-Z]*\n([\s\S]*?)\n```/);
                if (codeBlockMatch) {
                    codeVal = codeBlockMatch[1];
                    hasCodeBlock = true;
                }
            }
            if (hasCodeBlock) {
                editCmds.push({ type: 'range', path: filePath, start: startLine, end: endLine, code: codeVal });
            }
        } else if (editMatch) {
            const findCmdIdx = (fullText, targetCmd) => {
                let idx = fullText.indexOf(targetCmd);
                if (idx !== -1) return idx;
                const sanitized = targetCmd.replace(/"/g, '\\"');
                idx = fullText.indexOf(sanitized);
                if (idx !== -1) return idx;
                const baseCmd = targetCmd.split(/\s+/)[0];
                return fullText.indexOf(baseCmd);
            };

            const filePath = getParsedPath(editMatch).trim();
            const cmdIdx = findCmdIdx(text, rawCmd);
            if (cmdIdx !== -1) {
                const subText = text.substring(cmdIdx);
                const parsedBlocks = window.parseSearchReplaceBlocks(subText, filePath);
                if (parsedBlocks.length > 0) {
                    parsedBlocks.forEach(block => {
                        if (block.hasDivider) {
                            editCmds.push({ type: 'block', path: filePath, search: block.search, replace: block.replace });
                        } else if (block.search && block.replace) {
                            editCmds.push({ type: 'block', path: filePath, search: block.search, replace: block.replace });
                        }
                    });
                } else {
                    const sMarker = "<<<<<<<";
                    const rMarker = ">>>>>>>";
                    const sIdx = subText.indexOf(sMarker);
                    const rIdx = subText.indexOf(rMarker);
                    if (sIdx !== -1 && rIdx !== -1 && sIdx < rIdx) {
                        const rawBlock = subText.substring(sIdx + sMarker.length, rIdx).trim();
                        try {
                            const targetPath = path.resolve(window.currentPath || process.cwd(), filePath);
                            if (fs.existsSync(targetPath)) {
                                const fileContent = fs.readFileSync(targetPath, 'utf-8').replace(/\r/g, '');
                                const fileContentNorm = fileContent.replace(/\s+/g, '');
                                
                                const lines = rawBlock.split(/\r?\n/);
                                for (let k = lines.length - 1; k >= 1; k--) {
                                    const searchCand = lines.slice(0, k).join('\n').trim();
                                    const replaceCand = lines.slice(k).join('\n').trim();
                                    
                                    const searchCandNorm = searchCand.replace(/\s+/g, '');
                                    if (searchCandNorm && fileContentNorm.includes(searchCandNorm)) {
                                        editCmds.push({ type: 'block', path: filePath, search: searchCand, replace: replaceCand });
                                        break;
                                    }
                                }
                            }
                        } catch (err) {
                            console.error("Resilient parser error:", err);
                        }
                    }
                }
            }
        } else if (deleteMatch) {
            const filePath = getParsedPath(deleteMatch).trim();
            deleteCmds.push({ path: filePath });
        } else if (createDirMatch) {
            const dirPath = getParsedPath(createDirMatch).trim();
            createDirCmds.push({ path: dirPath });
        } else if (runCommandMatch) {
            let cmdStr = runCommandMatch[1].trim();
            if ((cmdStr.startsWith('"') && cmdStr.endsWith('"')) || (cmdStr.startsWith("'") && cmdStr.endsWith("'"))) {
                cmdStr = cmdStr.slice(1, -1);
            }
            runCommandCmds.push({ command: cmdStr });
        } else if (searchKeywordMatch) {
            let pattern = searchKeywordMatch[1].trim();
            if ((pattern.startsWith('"') && pattern.endsWith('"')) || (pattern.startsWith("'") && pattern.endsWith("'"))) {
                pattern = pattern.slice(1, -1);
            }
            searchKeywordCmds.push({ pattern: pattern });
        } else if (moveFileMatch) {
            const srcPath = (moveFileMatch[1] || moveFileMatch[2] || moveFileMatch[3]).trim();
            const destPath = (moveFileMatch[4] || moveFileMatch[5] || moveFileMatch[6]).trim();
            moveFileCmds.push({ src: srcPath, dest: destPath });
        } else if (listDirMatch) {
            const rawDir = listDirMatch[1] ? listDirMatch[1].trim().replace(/^["']|["']$/g, '') : '.';
            const dirPath = rawDir || '.';
            const res = resolvePathAndExists(dirPath);
            readCmds.push({ path: res.path, isDirectory: true, exists: res.exists });
        } else if (resetSessionMatch) {
            hasResetSession = true;
        } else {
            otherCmds.push(cmd);
        }
    });

    const hasWriteFile = (writeCmds.length > 0);
    const hasEditFile = (editCmds.length > 0);
    const hasDeleteFile = (deleteCmds.length > 0);
    const hasCreateDir = (createDirCmds.length > 0);
    const hasRunCommand = (runCommandCmds.length > 0);
    const hasSearchKeyword = (searchKeywordCmds.length > 0);
    const hasMoveFile = (moveFileCmds.length > 0);
    const hasAnyAction = hasWriteFile || hasEditFile || hasDeleteFile || hasCreateDir || hasRunCommand || hasSearchKeyword || hasMoveFile;

    if (hasAnyAction) {
        readCmds.length = 0;
    }

    // Combined files bundling logic for Drag & Drop
    const filesToBundle = readCmds.filter(f => f.exists !== false && !f.isDirectory);
    if (filesToBundle.length > 0) {
        const fs = require('fs');
        const path = require('path');
        let mergedContent = "# Requested Files Bundle\n\n";
        filesToBundle.forEach(f => {
            const absPath = path.resolve(window.currentPath || process.cwd(), f.path);
            let fileContent = "";
            try {
                if (f.range) {
                    const rawContent = fs.readFileSync(absPath, 'utf-8');
                    const lines = rawContent.split(/\r?\n/);
                    fileContent = lines.slice(f.start - 1, f.end).join('\n');
                } else {
                    fileContent = fs.readFileSync(absPath, 'utf-8');
                }
            } catch(e) {
                fileContent = "[ERROR READING FILE: " + e.message + "]";
            }
            const ext = f.path.split('.').pop().toLowerCase();
            mergedContent += "## [FILE DATA: " + f.path + "]\n```" + ext + "\n" + fileContent + "\n```\n\n";
        });
        
        const baseFileName = window.makeSendingMdBundleName(readCmds.map(f => f.path));
        window.prepareFilePayload(baseFileName, mergedContent).then(payload => {
            if (typeof window.addFileToRequestedQueue === 'function') {
                window.addFileToRequestedQueue(payload.relativePath);
            }
        }).catch(e => {
            console.error("Failed to prepare read bundle file:", e);
        });
    }
    
    if (window.dragDropMode) {
        const missingFiles = readCmds.filter(f => f.exists === false && !f.isDirectory);
        missingFiles.forEach(f => {
            if (typeof window.addFileToRequestedQueue === 'function') {
                window.addFileToRequestedQueue(f.path);
            }
        });
    }

    const hasReadFile = (readCmds.length > 0);

    if (hasResetSession) {
        const box = typeof ChatUI !== 'undefined' ? ChatUI.appendBubble('system', '') : null;
        if (box) {
            const content = box.querySelector('.bubble-content');
            if (content) {
                content.innerHTML = `
                    <div style="background: var(--surface-low); padding: 12px 14px; border-radius: 8px; border: 1px solid var(--border-color); font-family: 'DM Sans', monospace; font-size: 12px; color: var(--text-main); margin-bottom: 12px; line-height: 1.5; word-break: break-all; box-shadow: inset 0 2px 4px rgba(0,0,0,0.15); margin-top: 4px;">
                        <div style="font-weight: bold; color: #eab308; margin-bottom: 6px; display: flex; align-items: center; gap: 8px;">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>
                            <span>RESET SESSION CONFIRMATION</span>
                        </div>
                        <span>Allow Web AI to reset current chat session?</span>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="cmd-run-btn" style="flex: 1; background: #eab308; color: black; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 700; font-size: 11.5px; letter-spacing: 0.04em; font-family: 'DM Sans', sans-serif;">ALLOW RESET</button>
                        <button class="cmd-cancel-btn" style="flex: 1; background: rgba(255, 255, 255, 0.04); color: var(--text-muted); border: 1px solid var(--border-color); padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 11.5px; letter-spacing: 0.04em; font-family: 'DM Sans', sans-serif;">CANCEL</button>
                    </div>
                `;
                content.querySelector('.cmd-run-btn').onclick = () => {
                    box.remove();
                    if (typeof window.triggerSessionReset === 'function') window.triggerSessionReset();
                };
                content.querySelector('.cmd-cancel-btn').onclick = () => {
                    box.remove();
                };
            }
        } else {
            if (typeof window.triggerSessionReset === 'function') window.triggerSessionReset();
        }
        return;
    }

    if (hasAnyAction) {
        if (typeof window.orchestrateCommands === 'function') {
            window.orchestrateCommands(writeCmds, editCmds, deleteCmds, moveFileCmds, listDirCmds, createDirCmds, runCommandCmds, searchKeywordCmds);
        }
        return;
    }

    if (hasReadFile) {
        const fileNamesList = readCmds.map(f => {
            const p = f.path.split(/[\\/]/);
            return p[p.length - 1];
        }).join(', ');

        const displayCmd = readCmds.map(f => {
            if (f.range) return "read-file-range \"" + f.path + "\" " + f.start + "-" + f.end;
            return (f.full ? 'read-file-full' : 'read-file') + " \"" + f.path + "\"";
        }).join(', ');

        const runRead = async () => {
            const injectContainer = document.getElementById('toast-inject-container');
            const projLbl = document.getElementById('project-pct-label');
            const projBar = document.getElementById('toast-project-progress-bar');
            try {
                const fs = require('fs');
                const path = require('path');
                
                let combinedPayload = "";

                if (window.dragDropMode) {
                    const existingFiles = readCmds.filter(f => f.exists !== false && !f.isDirectory);
                    const directoryFiles = readCmds.filter(f => f.exists !== false && f.isDirectory);
                    const missingFiles = readCmds.filter(f => f.exists === false);
                    let parts = [];
                    if (existingFiles.length > 0) {
                        existingFiles.forEach(f => window.readFilesSet.add(f.path));
                        parts.push("I have uploaded the requested file contents: " + fileNamesList + " as attachments.");
                    }
                    if (directoryFiles.length > 0) {
                        const getFlatDirectoryTree = (dirPath) => {
                            let results = [];
                            try {
                                const list = fs.readdirSync(dirPath);
                                list.forEach(file => {
                                    const fullPath = path.join(dirPath, file);
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
                        directoryFiles.forEach(dir => {
                            const absDir = path.resolve(window.currentPath || process.cwd(), dir.path);
                            const files = getFlatDirectoryTree(absDir);
                            const relativeFiles = files.map(f => path.relative(window.currentPath || process.cwd(), f));
                            const fileListStr = files.length > 0 
                                ? relativeFiles.map(rf => "- " + rf.replace(/\\/g, '/')).join('\n') 
                                : "(Directory is empty)";
                            parts.push("[DIRECTORY LIST: " + dir.path + "]\n" + fileListStr + "\n");
                        });
                    }
                    if (missingFiles.length > 0) {
                        missingFiles.forEach(f => {
                            parts.push("[FILE DATA ERROR: " + f.path + " not found on the local machine (does not exist)]");
                        });
                    }
                    combinedPayload = parts.join('\n') + "\nProceed to analyze the files.";
                } else {
                    for (let i = 0; i < readCmds.length; i++) {
                        const fileObj = readCmds[i];
                        const filePath = fileObj.path;
                        
                        let fileContentPayload = "";
                        let targetPath = fileObj.overridePath || path.resolve(window.currentPath, filePath);
                        
                        // Resolve targetPath to the actually dropped file path if present in readFilesSet
                        const targetBase = path.basename(filePath).toLowerCase();
                        for (let p of window.readFilesSet) {
                            if (path.basename(p).toLowerCase() === targetBase) {
                                targetPath = p;
                                break;
                            }
                        }

                        if (fs.existsSync(targetPath)) {
                            if (fileObj.isDirectory || fs.statSync(targetPath).isDirectory()) {
                                let treeText = "";
                                if (typeof ipcRenderer !== 'undefined' && ipcRenderer.invoke) {
                                    treeText = await ipcRenderer.invoke('vault-get-tree', targetPath);
                                }
                                fileContentPayload = `[PROJECT TREE: ${filePath}]\n${treeText}\n\n`;
                            } else {
                                const rawContent = fs.readFileSync(targetPath, 'utf-8');
                                const allLines = rawContent.replace(/\r/g, '').split('\n');
                            
                            if (fileObj.range) {
                                let startIdx = Math.max(0, fileObj.start - 1);
                                let endIdx = Math.min(allLines.length, fileObj.end);
                                let isTruncated = false;
                                
                                if (endIdx - startIdx > 2000) {
                                    endIdx = startIdx + 2000;
                                    isTruncated = true;
                                }
                                
                                let slicedContent = allLines.slice(startIdx, endIdx).join('\n');
                                if (isTruncated) {
                                    const nextStart = endIdx + 1;
                                    const nextEnd = nextStart + 1999;
                                    slicedContent += "\n// ... [TRUNCATED: Max 2000 lines limit per turn reached. If you need to read the next part, please output [CMD: read-file-range \"" + filePath + "\" " + nextStart + "-" + nextEnd + "]]";
                                }
                                fileContentPayload = "[FILE DATA (LINE RANGE " + fileObj.start + "-" + (fileObj.start + (endIdx - startIdx) - 1) + "): " + filePath + "]\n```\n" + slicedContent + "\n```\n\n";
                            } else if (fileObj.full) {
                                let endIdx = allLines.length;
                                let isTruncated = false;
                                
                                if (endIdx > 2000) {
                                    endIdx = 2000;
                                    isTruncated = true;
                                }
                                
                                let slicedContent = allLines.slice(0, endIdx).join('\n');
                                if (isTruncated) {
                                    slicedContent += "\n// ... [TRUNCATED: Max 2000 lines limit per turn reached. If you need to read the next part, please output [CMD: read-file-range \"" + filePath + "\" 2001-4000]]";
                                }
                                fileContentPayload = "[FILE DATA (" + (isTruncated ? 'PARTIAL CONTENT' : 'FULL CONTENT') + "): " + filePath + "]\n```\n" + slicedContent + "\n```\n\n";
                            } else {
                                const fileContent = rawContent;
                                fileContentPayload = "[FILE DATA: " + filePath + "]\n```\n" + fileContent + "\n```\n\n";
                            }
                            }
                        } else {
                            fileContentPayload = "[FILE DATA ERROR: " + filePath + " not found on the local machine]\n\n";
                        }

                        combinedPayload += fileContentPayload;
                        
                        if (typeof window.showInputLoading === 'function') {
                            window.showInputLoading("Reading files... (" + (i + 1) + "/" + readCmds.length + ")");
                        }
                        if (projLbl) projLbl.innerHTML = "Reading files: <span style=\"color: var(--primary); font-weight: bold;\">" + (i + 1) + "/" + readCmds.length + "</span>";
                        if (projBar) projBar.style.width = Math.floor(((i + 1) / readCmds.length) * 100) + "%";
                        ChatUI.appendBubble('system', "[SYSTEM] Prepared " + filePath + " context (" + (i + 1) + "/" + readCmds.length + ").");
                        
                        await new Promise(r => setTimeout(r, 200));
                    }

                    const finalPrompt = "Proceed to analyze the files above.";
                    combinedPayload += finalPrompt;
                }

                if (typeof window.updateSendProgress === 'function') {
                    window.updateSendProgress(window.readFilesSet.size, window.totalFilesCount);
                }

                if (injectContainer) injectContainer.style.display = 'flex';
                
                const enginePromise = runExperimentalEngine('/marktag', combinedPayload, null);
                ChatUI.appendBubble('system', "[SYSTEM] Sent all prepared " + readCmds.length + " files to Web AI.");
                await new Promise(r => setTimeout(r, 800));
                await injectWebPayload(combinedPayload, readCmds.length, readCmds.length, false, window.autoDragging && !window.autoDraggingTempDisabled);

                const response = await enginePromise;
                if (response) {
                    if (typeof window.finalizeAiBubble === 'function') {
                        window.finalizeAiBubble(response);
                    }
                    detectAndAskCommand(response);
                }
            } catch (err) {
                ChatUI.appendBubble('system', "[ERROR] Failed to read files batch: " + err.message);
            } finally {
                if (typeof window.hideInputLoading === 'function') {
                    window.hideInputLoading();
                }
                document.getElementById('tab-local-agent')?.click();
            }
        };

        const dropZone = document.getElementById('local-drop-zone');
            if (dropZone) dropZone.style.display = 'none';

            const localInput = document.getElementById('local-agent-input');
            const sendBtn = document.getElementById('send-to-local');
            const inputContainer = document.getElementById('local-input-container');

            if (localInput && inputContainer) {
                const vLC = document.getElementById('inspector-local-chat');
                const vBH = document.getElementById('inspector-browser-hub');
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

                let fileBox = null;
                if (typeof ChatUI !== 'undefined' && typeof ChatUI.appendBubble === 'function') {
                    fileBox = ChatUI.appendBubble('system', '');
                    const fileBoxContent = fileBox ? fileBox.querySelector('.bubble-content') : null;
                    if (fileBoxContent) {
                        fileBoxContent.innerHTML = "<div>Requested: <strong style=\"color: var(--primary); font-weight: bold;\">" + fileNamesList + "</strong></div>";
                    }
                }

                const cleanupDragDrop = () => {
                    if (fileBox) fileBox.remove();
                    window.activeDragDropCleanup = null;
                    window.activeDragDropContinue = null;
                    
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
                window.activeDragDropContinue = async () => {
                    await runRead();
                };
                window.activeDragDropContinue.isReal = true;

                if (typeof window.injectGuestDropInterceptor === 'function') {
                    window.injectGuestDropInterceptor();
                }
            }
        }
    
    if (otherCmds.length > 0) {
        let accumulatedOtherFeedback = "";
        let currentIndex = 0;
        
        const runNextOtherCommand = () => {
            if (currentIndex >= otherCmds.length) {
                if (accumulatedOtherFeedback.trim()) {
                    if (typeof window.submitConsolidatedFeedback === 'function') {
                        window.submitConsolidatedFeedback(accumulatedOtherFeedback);
                    }
                }
                return;
            }
            
            const cleanCmd = otherCmds[currentIndex];
            
            const onContinue = async () => {
                if (window.activeCommandCleanup) window.activeCommandCleanup();
                
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
                        if (minBtn) minBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
                        if (typeof syncBrowserView === 'function') syncBrowserView();
                    }
                }
                
                accumulatedOtherFeedback += `[SYSTEM] Command \`${cleanCmd}\` executed on the local machine.\n\n`;
                
                currentIndex++;
                setTimeout(runNextOtherCommand, 100);
            };
            
            const onCancel = () => {
                if (window.activeCommandCleanup) window.activeCommandCleanup();
                accumulatedOtherFeedback += `[SYSTEM] Command \`${cleanCmd}\` execution cancelled by user.\n\n`;
                
                currentIndex++;
                setTimeout(runNextOtherCommand, 100);
            };
            
            if (typeof window.showCommandExecutionPanel === 'function') {
                window.showCommandExecutionPanel(
                    "Pending Command",
                    cleanCmd,
                    onContinue,
                    onCancel
                );
            } else {
                onContinue();
            }
        };
        
        runNextOtherCommand();
    }
}

window.detectAndAskCommand = detectAndAskCommand;
