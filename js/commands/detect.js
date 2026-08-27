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
                if ((file.startsWith('_project_rules_') || file.startsWith('_project_read_bundle_') || file.startsWith('FollowThisORDER_') || file.startsWith('Files_') || file.startsWith('ListDir_')) && file.endsWith('.md')) {
                    try { fs.unlinkSync(path.join(dir, file)); } catch(e) {}
                }
            });
        }
        
        // Clean up all temporary files in SendingMD folder once AI has responded
        const gravityRoot = window.appRootPath || process.cwd();
        const subDir = (typeof window.getSendingMdSubDir === 'function') ? window.getSendingMdSubDir() : path.join('gravity_vault', 'SendingMD');
        const sendingMdDir = path.join(gravityRoot, subDir);
        if (fs.existsSync(sendingMdDir)) {
            const subfiles = fs.readdirSync(sendingMdDir);
            let cleanedCount = 0;
            subfiles.forEach(file => {
                if (!file.startsWith('.')) {
                    try {
                        fs.unlinkSync(path.join(sendingMdDir, file));
                        cleanedCount++;
                    } catch(e) {}
                }
            });
            if (cleanedCount > 0) {
                console.log(`[AutoCleanSendingMD] Cleaned ${cleanedCount} temporary file(s) from SendingMD on AI response.`);
                if (typeof window.updateSendingMdCountBadge === 'function') window.updateSendingMdCountBadge();
            }
        }
        if (typeof window.refreshTree === 'function') {
            window.refreshTree();
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

    const cmdRegex = /\[(CMD|REQUEST|COMMAND|EXEC):\s*([^\]\r\n]+)\]?/gi;
    let match;
    const foundCmds = [];
    while ((match = cmdRegex.exec(text)) !== null) {
        let cleanCmd = match[2].trim();
        if (cleanCmd) {
            if (cleanCmd.endsWith(']')) cleanCmd = cleanCmd.slice(0, -1).trim();
            if (cleanCmd === '...' || cleanCmd.includes('...')) continue;
            if (cleanCmd.includes('경로') || cleanCmd.includes('path') || cleanCmd.includes('요청')) continue;
            foundCmds.push(cleanCmd);
        }
    }

    if (foundCmds.length === 0) {
        const lines = text.split(/\r?\n/);
        for (let line of lines) {
            let trimmed = line.trim().replace(/^[`\s]+|[`\s]+$/g, '');
            // Strip leading comment markers like //, /*, <!--, #
            trimmed = trimmed.replace(/^(?:\/\/|\/\*+|<!--+|#)\s*/, '').replace(/(?:\*+\/|-->)$/, '').trim();
            if (/^(read-file|write-file|edit-file|edit-file-range|read-file-full|read-file-range|delete-file|delete-dir|delete-folder|delete-directory|remove-file|remove-dir|remove-folder|rmdir|create-dir|create-folder|create-directory|mkdir|run-command|list-dir|search-keyword|move-file|reset-session|mcp-call)\b/i.test(trimmed)) {
                foundCmds.push(trimmed);
            }
        }
    }

    // Check if code block starts with a comment-style command
    if (foundCmds.length === 0 && text.includes('```')) {
        const blockCommentCmdMatch = text.match(/```[a-zA-Z]*\r?\n\s*(?:\/\/|\/\*+|<!--+|#)\s*(?:\[?(?:CMD|REQUEST|COMMAND|EXEC):\s*)?(read-file|write-file|edit-file|delete-file|delete-dir|delete-folder|delete-directory|remove-file|remove-dir|remove-folder|rmdir|create-dir|create-folder|create-directory|mkdir|run-command|list-dir|search-keyword|move-file|mcp-call)\s+(?:"([^"]+)"|'([^']+)'|([^\s\r\n\]]+))/i);
        if (blockCommentCmdMatch) {
            const action = blockCommentCmdMatch[1].toLowerCase();
            const p = (blockCommentCmdMatch[2] || blockCommentCmdMatch[3] || blockCommentCmdMatch[4] || '').trim();
            if (p) {
                foundCmds.push(`${action} "${p}"`);
            }
        }
    }

    // Auto-Repair Code Block Command: If no [CMD:] tag was found, but a code block (```) exists
    if (foundCmds.length === 0 && text.includes('```')) {
        let inferredPath = null;
        
        const lines = text.split(/\r?\n/);
        const langRegex = /^(html|htm|javascript|js|typescript|ts|jsx|tsx|css|scss|sass|less|python|py|bash|sh|zsh|powershell|ps1|batch|bat|cmd|shell|json|json5|xml|markdown|md|cpp|c\+\+|c|cs|csharp|java|kotlin|kt|swift|objc|sql|mysql|postgres|sqlite|php|ruby|rb|rust|rs|go|golang|yaml|yml|toml|ini|text|txt|vue|svelte|docker|dockerfile|graphql|dart|elixir|erlang|haskell|scala|assembly|asm|r|matlab|cmake|make|makefile|nginx|env)$/i;

        for (let i = 0; i < lines.length; i++) {
            const trimmedLine = lines[i].trim();
            if (trimmedLine.startsWith('```')) {
                for (let j = i - 1; j >= 0; j--) {
                    const lineStr = lines[j].trim();
                    if (!lineStr) continue;

                    const cleanLabel = lineStr.replace(/[`\s\*\#\:\-\_]/g, '');

                    const isLangLabel = langRegex.test(lineStr) || langRegex.test(cleanLabel) || lineStr.startsWith('```');
                    const isGenericLabel = !lineStr.includes('.') && !lineStr.includes('[') && !lineStr.includes('write-file') && !lineStr.includes('read-file') && cleanLabel.length < 25;

                    if (isLangLabel || isGenericLabel) {
                        continue;
                    }

                    const tagMatch = lineStr.match(/\[(CMD|REQUEST|COMMAND|EXEC):\s*([^\]\r\n]+)\]?/i);
                    if (tagMatch) {
                        let cleanCmd = tagMatch[2].trim();
                        if (cleanCmd.endsWith(']')) cleanCmd = cleanCmd.slice(0, -1).trim();
                        if (cleanCmd && !cleanCmd.includes('...')) {
                            foundCmds.push(cleanCmd);
                        }
                        break;
                    }

                    const cmdFormatMatch = lineStr.match(/^[`\s]*(read-file|write-file|edit-file|delete-file|delete-dir|delete-folder|delete-directory|remove-file|remove-dir|remove-folder|rmdir|create-dir|create-folder|create-directory|mkdir|run-command|list-dir|search-keyword|move-file|mcp-call)\b\s*(.*)/i);
                    if (cmdFormatMatch) {
                        foundCmds.push(lineStr.replace(/^[`\s]+|[`\s]+$/g, ''));
                        break;
                    }

                    const pathMatch = lineStr.match(/(?:\d+\.\s*|###\s*|##\s*|#\s*|\*\*\s*|File:\s*|Current:\s*"|Next:\s*")?`?([a-zA-Z0-9_\-\.\/]+\.(?:js|css|html|json|md|py|java|c|cpp|h|ts|jsx|tsx))`?/i);
                    if (pathMatch) {
                        inferredPath = pathMatch[1].trim();
                        break;
                    }

                }
            }
            if (foundCmds.length > 0 || inferredPath) break;
        }

        // Strategy 1: Check for Current: "path/file.ext" or Next: "path/file.ext" line
        if (foundCmds.length === 0 && !inferredPath) {
            const currentMatch = text.match(/Current:\s*"([^"]+\.[a-zA-Z0-9]+)"/i) || text.match(/Next:\s*"([^"]+\.[a-zA-Z0-9]+)"/i);
            if (currentMatch) {
                inferredPath = currentMatch[1].trim();
            }
        }

        // Strategy 2: Check for filename heading/title line above code block
        if (foundCmds.length === 0 && !inferredPath) {
            const headingMatch = text.match(/(?:^|\n)(?:\d+\.\s*|###\s*|##\s*|#\s*|\*\*\s*|File:\s*)?`?([a-zA-Z0-9_\-\.\/]+\.(?:js|css|html|json|md|py|java|c|cpp|h|ts|jsx|tsx))`?\s*(?:\n|\r\n)\s*```/i);
            if (headingMatch) {
                inferredPath = headingMatch[1].trim();
            }
        }

        // Strategy 3: Check for first comment line inside code block (e.g. // js/main.js, /* style.css */, <!-- index.html -->)
        if (foundCmds.length === 0 && !inferredPath) {
            const commentMatch = text.match(/```[a-zA-Z]*\r?\n\s*(?:\/\/|\/\*|<!--)\s*`?([a-zA-Z0-9_\-\.\/]+\.[a-zA-Z0-9]+)`?/i);
            if (commentMatch) {
                inferredPath = commentMatch[1].trim();
            }
        }

        // Strategy 4: Check for numbered list of files in explanation text below
        if (foundCmds.length === 0 && !inferredPath) {
            const listMatch = text.match(/\d+\.\s*`([a-zA-Z0-9_\-\.\/]+\.[a-zA-Z0-9]+)`/i);
            if (listMatch) {
                inferredPath = listMatch[1].trim();
            }
        }

        if (foundCmds.length === 0 && inferredPath) {
            const hasDiffOrChunk = text.includes('<<<<<<<') || text.includes('[SEARCH]') || text.includes('=======') || /^[+-]\s/m.test(text);
            const inferredAction = hasDiffOrChunk ? 'edit-file' : 'write-file';
            console.log(`[AutoRepairCMD] Inferred missing [CMD: ${inferredAction} "${inferredPath}"] command for code block!`);
            foundCmds.push(`${inferredAction} "${inferredPath}"`);
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
        const deleteMatch = cmd.match(/^(?:delete-file|delete-dir|delete-folder|delete-directory|remove-file|remove-dir|remove-folder|rmdir)\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))$/i);
        const createDirMatch = cmd.match(/^(?:create-dir|create-folder|create-directory|mkdir)\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))$/i);
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
                const prefixRegex = /^(?:gravity_vault[\\/])?SendingMD[\\/]/i;
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
                } else {
                    const lines = subText.split('\n');
                    if (lines.length > 1) {
                        codeVal = lines.slice(1).join('\n').trim();
                        if (codeVal) hasCodeBlock = true;
                    }
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
            const subText = (cmdIdx !== -1) ? text.substring(cmdIdx) : text;
            let parsedBlocks = window.parseSearchReplaceBlocks(subText, filePath);
            if (parsedBlocks.length === 0 && subText !== text) {
                parsedBlocks = window.parseSearchReplaceBlocks(text, filePath);
            }
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
        } else if (deleteMatch) {
            const filePath = getParsedPath(deleteMatch).trim().replace(/[\\/]+$/, '');
            deleteCmds.push({ path: filePath });
        } else if (createDirMatch) {
            const dirPath = getParsedPath(createDirMatch).trim().replace(/[\\/]+$/, '');
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
            listDirCmds.push({ path: res.path, isDirectory: true, exists: res.exists });
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
    const hasListDir = (listDirCmds.length > 0);
    const hasModifyingAction = hasWriteFile || hasEditFile || hasDeleteFile || hasCreateDir || hasRunCommand || hasSearchKeyword || hasMoveFile;

    // Handle pure tree / directory info requests with Treesending bottom sheet
    const isPureTreeRequest = (hasListDir || (readCmds.length > 0 && readCmds.every(f => f.isDirectory || f.path === '.' || f.path === './' || f.path === '.\\' || !f.path))) && !hasModifyingAction;

    if (isPureTreeRequest) {
        const path = require('path');
        const rawTargetDir = listDirCmds[0]?.path || readCmds[0]?.path || '.';
        const targetDir = (rawTargetDir && rawTargetDir !== '.' && rawTargetDir !== './' && rawTargetDir !== '.\\')
            ? path.resolve(window.currentPath || window.projectRoot || process.cwd(), rawTargetDir)
            : (window.currentPath || window.projectRoot || process.cwd());
        (async () => {
            const confirmResult = (typeof window.showBrowserConfirm === 'function')
                ? await window.showBrowserConfirm(null, "PROJECT TRANSFER", "AI is requesting current project folder information. Send project tree structure?")
                : 'send';

            if (confirmResult === 'send' || confirmResult === true) {
                if (typeof window.executeTreeSend === 'function') {
                    await window.executeTreeSend(targetDir);
                }
            } else {
                if (typeof ChatUI !== 'undefined' && typeof ChatUI.appendBubble === 'function') {
                    ChatUI.appendBubble('system', '[SYSTEM] Project tree transmission skipped by user.');
                }
            }
        })();
        return;
    }

    const hasAnyAction = hasModifyingAction;

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
    }
    
    // Missing files handling is done inside runRead with clear user error notification

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
        if (typeof ChatUI !== 'undefined' && typeof ChatUI.appendBubble === 'function') {
            ChatUI.appendBubble('system', `[SYSTEM] Processing read-file request for: ${readCmds.map(f => f.path).join(', ')}`);
        }
        const fileNamesList = readCmds.map(f => {
            const p = f.path.split(/[\\/]/);
            return p[p.length - 1];
        }).join(', ');

        const displayCmd = readCmds.map(f => {
            if (f.range) return "read-file-range \"" + f.path + "\" " + f.start + "-" + f.end;
            return (f.full ? 'read-file-full' : 'read-file') + " \"" + f.path + "\"";
        }).join(', ');

        const runRead = async () => {
            try {
                const fs = require('fs');
                const path = require('path');

                // Check for non-existent requested files
                const missingCmds = readCmds.filter(f => f.exists === false);
                const existingCmds = readCmds.filter(f => f.exists !== false);

                if (missingCmds.length > 0) {
                    const missingList = missingCmds.map(f => `"${f.path}"`).join(', ');
                    const errText = `There's no such file: ${missingList}`;
                    if (typeof ChatUI !== 'undefined' && typeof ChatUI.appendBubble === 'function') {
                        ChatUI.appendBubble('system', `[ERROR] ${errText}`);
                    }
                    if (typeof window.showUserScreenToast === 'function') {
                        window.showUserScreenToast(errText, 4000, false);
                    }
                }

                if (existingCmds.length === 0) {
                    // All requested files do not exist! Stop here without opening drag & drop queue window.
                    return;
                }

                let combinedPayload = "";

                for (let i = 0; i < existingCmds.length; i++) {
                    const fileObj = existingCmds[i];
                    const filePath = fileObj.path;
                    
                    let fileContentPayload = "";
                    let targetPath = fileObj.overridePath || path.resolve(window.currentPath || process.cwd(), filePath);
                    
                    const targetBase = path.basename(filePath).toLowerCase();
                    for (let p of window.readFilesSet) {
                        if (path.basename(p).toLowerCase() === targetBase) {
                            targetPath = p;
                            break;
                        }
                    }

                    if (fs.existsSync(targetPath)) {
                        if (fileObj.isDirectory || fs.statSync(targetPath).isDirectory()) {
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
                        fileContentPayload = "[FILE DATA ERROR: " + filePath + " not found on local machine]\n\n";
                    }

                    combinedPayload += fileContentPayload;
                }

                const finalPrompt = "Proceed to analyze the files above.";
                combinedPayload += finalPrompt;

                // Save to SendingMD file payload with modern file names
                const targetFilePaths = existingCmds.map(c => typeof c === 'string' ? c : (c.path || c.target || c.filePath || 'file.md'));
                const baseFileName = typeof window.makeSendingMdBundleName === 'function'
                    ? window.makeSendingMdBundleName(targetFilePaths)
                    : path.join('gravity_vault', 'SendingMD', `Files_${targetFilePaths.slice(0, 3).map(f => path.basename(f)).join('_')}_${Date.now()}.${window.getSendingMdExt ? window.getSendingMdExt() : 'md'}`);

                const payload = await window.prepareFilePayload(baseFileName, combinedPayload);

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

                ChatUI.appendBubble('system', `[SUCCESS] Prepared file package in Drag & Drop Queue: ${payload.relativePath}`);
                if (typeof window.showUserScreenToast === 'function') {
                    window.showUserScreenToast(`Prepared ${readCmds.length} file(s) in Drag & Drop queue`, 3500);
                }

                if (typeof window.updateDragDropQueueUI === 'function') {
                    window.updateDragDropQueueUI();
                }
            } catch (err) {
                ChatUI.appendBubble('system', "[ERROR] Failed to prepare files: " + err.message);
            } finally {
                if (typeof window.hideInputLoading === 'function') {
                    window.hideInputLoading();
                }
            }
        };

        // Auto-execute read-file without asking confirmation modal
        runRead();
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
