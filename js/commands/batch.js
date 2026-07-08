async function executeWriteFileBatch(writeCmds) {
    try {
        window.lastInjectedBubble = null;
        window.lastReceivedMirrorText = "";

        const fs = require('fs');
        const path = require('path');

        let feedbackContent = "";
        writeCmds.forEach(fileObj => {
            const filePath = fileObj.path;
            const targetPath = path.resolve(window.currentPath, filePath);
            
            try {
                const parentDir = path.dirname(targetPath);
                if (!fs.existsSync(parentDir)) {
                    fs.mkdirSync(parentDir, { recursive: true });
                }
                fs.writeFileSync(targetPath, fileObj.code, 'utf-8');
                const syntaxError = verifySyntax(filePath, targetPath);
                if (syntaxError) {
                    feedbackContent += `[FILE WRITE SUCCESS BUT SYNTAX ERROR DETECTED: ${filePath} - ${syntaxError}]\n`;
                    ChatUI.appendBubble('system', `[WARNING] Syntax error in ${filePath}: ${syntaxError}`);
                } else {
                    feedbackContent += `[FILE WRITE SUCCESS: ${filePath}]\n`;
                    ChatUI.appendBubble('system', `[SUCCESS] Wrote ${filePath} content.`);
                }
            } catch (err) {
                feedbackContent += `[FILE WRITE ERROR: ${filePath} - ${err.message}]\n`;
                ChatUI.appendBubble('system', `[ERROR] Failed to write ${filePath}: ${err.message}`);
            }
        });

        if (typeof window.loadDirectory === 'function' && window.currentPath) {
            window.loadDirectory(window.currentPath);
        }

        if (typeof window.openFileInEditor === 'function' && window.currentEditingPath) {
            const hasModifiedOpen = writeCmds.some(f => path.resolve(window.currentPath, f.path) === path.resolve(window.currentEditingPath));
            if (hasModifiedOpen) window.openFileInEditor(window.currentEditingPath);
        }

        const finalMessage = `${feedbackContent}\nProceed to verify the changes.`;
        
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
    } catch (err) {
        ChatUI.appendBubble('system', `[ERROR] Write batch processing failed: ${err.message}`);
    }
}

function searchProjectFiles(query) {
    const fs = require('fs');
    const path = require('path');
    const results = [];
    const rootPath = window.currentPath;

    function searchDir(dirPath) {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            const relPath = path.relative(rootPath, fullPath);
            
            if (entry.isDirectory()) {
                if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'out') {
                    continue;
                }
                searchDir(fullPath);
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (['.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.zip', '.tar', '.gz', '.db', '.sqlite', '.log'].includes(ext)) {
                    continue;
                }
                
                try {
                    const content = fs.readFileSync(fullPath, 'utf-8');
                    const lines = content.replace(/\r/g, '').split('\n');
                    lines.forEach((line, index) => {
                        if (line.toLowerCase().includes(query.toLowerCase())) {
                            results.push({
                                path: relPath,
                                lineNum: index + 1,
                                content: line.trim()
                            });
                        }
                    });
                } catch (e) {
                    // Ignore
                }
            }
        }
    }
    
    try {
        searchDir(rootPath);
    } catch (e) {
        console.error("Search failed:", e);
    }
    
    return results;
}

function searchFileContent(filePath, query) {
    const fs = require('fs');
    const path = require('path');
    const results = [];
    const targetPath = path.resolve(window.currentPath, filePath);
    
    try {
        if (!fs.existsSync(targetPath)) {
            return null;
        }
        const content = fs.readFileSync(targetPath, 'utf-8');
        const lines = content.replace(/\r/g, '').split('\n');
        lines.forEach((line, index) => {
            if (line.toLowerCase().includes(query.toLowerCase())) {
                results.push({
                    lineNum: index + 1,
                    content: line.trim()
                });
            }
        });
        return results;
    } catch (e) {
        return null;
    }
}

async function executeSearchBatch(searchCmds) {
    try {
        window.lastInjectedBubble = null;
        window.lastReceivedMirrorText = "";

        let searchPayload = "";
        searchCmds.forEach(cmdObj => {
            if (cmdObj.type === 'all') {
                const results = searchProjectFiles(cmdObj.query);
                searchPayload += `[SEARCH RESULTS FOR "${cmdObj.query}" IN ALL FILES]:\n`;
                if (results.length === 0) {
                    searchPayload += `No matches found.\n\n`;
                } else {
                    const groups = {};
                    results.forEach(r => {
                        if (!groups[r.path]) groups[r.path] = [];
                        groups[r.path].push(r);
                    });
                    
                    const filePaths = Object.keys(groups);
                    if (filePaths.length > 3 || results.length > 15) {
                        searchPayload += `Found matches in ${filePaths.length} files. Showing file summary list:\n`;
                        filePaths.forEach(p => {
                            searchPayload += `- ${p} (${groups[p].length} matches)\n`;
                        });
                        searchPayload += `\nUse [CMD: search-file "파일명" "${cmdObj.query}"] or [CMD: read-file] on the target files to inspect matching lines.\n`;
                    } else {
                        results.forEach(r => {
                            searchPayload += `${r.path}:${r.lineNum}: ${r.content}\n`;
                        });
                    }
                    searchPayload += `\n`;
                }
            } else if (cmdObj.type === 'file') {
                const results = searchFileContent(cmdObj.path, cmdObj.query);
                if (results === null) {
                    searchPayload += `[SEARCH ERROR: File "${cmdObj.path}" not found]\n\n`;
                } else {
                    searchPayload += `[SEARCH RESULTS FOR "${cmdObj.query}" IN FILE "${cmdObj.path}"]:\n`;
                    if (results.length === 0) {
                        searchPayload += `No matches found.\n\n`;
                    } else {
                        results.slice(0, 100).forEach(r => {
                            searchPayload += `Line ${r.lineNum}: ${r.content}\n`;
                        });
                        if (results.length > 100) {
                            searchPayload += `... and ${results.length - 100} more matches.\n`;
                        }
                        searchPayload += `\n`;
                    }
                }
            }
        });

        const finalMessage = `${searchPayload}Proceed to analyze the search results.`;
        
        await injectWebPayload(finalMessage, 0);
        
        window.currentBatchFileCount = 0;
        const response = await runExperimentalEngine('/marktag', finalMessage, null);
        if (!window.autoContinueOnRead) {
            document.getElementById('tab-local-agent')?.click();
        }
        if (response) {
            detectAndAskCommand(response);
        }
    } catch (err) {
        ChatUI.appendBubble('system', `[ERROR] Search batch processing failed: ${err.message}`);
    }
}

async function executeEditFileBatch(editCmds) {
    try {
        window.lastInjectedBubble = null;
        window.lastReceivedMirrorText = "";

        const fs = require('fs');
        const path = require('path');

        let feedbackContent = "";
        editCmds.forEach(fileObj => {
            const filePath = fileObj.path;
            const targetPath = path.resolve(window.currentPath, filePath);
            
            try {
                if (!fs.existsSync(targetPath)) {
                    feedbackContent += `[FILE EDIT ERROR: ${filePath} - File not found]\n`;
                    ChatUI.appendBubble('system', `[ERROR] Failed to edit ${filePath}: File not found`);
                    return;
                }
                
                let originalContent = fs.readFileSync(targetPath, 'utf-8');
                const isCRLF = originalContent.includes('\r\n');
                
                let content = originalContent.replace(/\r/g, '');
                let searchStr = fileObj.search.replace(/\r/g, '');
                let replaceStr = fileObj.replace.replace(/\r/g, '');
                
                if (!searchStr) {
                    feedbackContent += `[FILE EDIT ERROR: ${filePath} - Empty SEARCH block]\n`;
                    ChatUI.appendBubble('system', `[ERROR] Failed to edit ${filePath}: Empty SEARCH block`);
                    return;
                }

                let idx = content.indexOf(searchStr);
                let matchedLength = searchStr.length;
                
                if (idx === -1) {
                    const normSearch = searchStr.replace(/\s+/g, '');
                    const normContent = content.replace(/\s+/g, '');
                    const normIdx = normContent.indexOf(normSearch);
                    
                    if (normIdx !== -1) {
                        let cNormIdx = 0;
                        let startIdx = -1;
                        let endIdx = -1;
                        
                        for (let j = 0; j < content.length; j++) {
                            const char = content[j];
                            if (/\s/.test(char)) continue;
                            
                            if (cNormIdx === normIdx) {
                                startIdx = j;
                            }
                            if (cNormIdx === normIdx + normSearch.length - 1) {
                                endIdx = j + 1;
                                break;
                            }
                            cNormIdx++;
                        }
                        
                        if (startIdx !== -1 && startIdx < endIdx) {
                            idx = startIdx;
                            matchedLength = endIdx - startIdx;
                        }
                    }
                }

                if (idx === -1) {
                    const fuzzyRange = findFuzzyMatchIndexRange(content, searchStr);
                    if (fuzzyRange) {
                        idx = fuzzyRange.start;
                        matchedLength = fuzzyRange.end - fuzzyRange.start;
                    }
                }

                if (idx === -1) {
                    feedbackContent += `[FILE EDIT ERROR: ${filePath} - SEARCH block not found in file]\n`;
                    ChatUI.appendBubble('system', `[ERROR] Failed to edit ${filePath}: SEARCH block not found in file`);
                    return;
                }

                const before = content.substring(0, idx);
                const after = content.substring(idx + matchedLength);
                let newContent = before + replaceStr + after;
                
                if (isCRLF) {
                    newContent = newContent.replace(/\n/g, '\r\n');
                }
                
                fs.writeFileSync(targetPath, newContent, 'utf-8');
                const syntaxError = verifySyntax(filePath, targetPath);
                if (syntaxError) {
                    feedbackContent += `[FILE EDIT SUCCESS BUT SYNTAX ERROR DETECTED: ${filePath} - ${syntaxError}]\n`;
                    ChatUI.appendBubble('system', `[WARNING] Syntax error in ${filePath}: ${syntaxError}`);
                } else {
                    feedbackContent += `[FILE EDIT SUCCESS: ${filePath}]\n`;
                    ChatUI.appendBubble('system', `[SUCCESS] Edited ${filePath} successfully.`);
                }
            } catch (err) {
                feedbackContent += `[FILE EDIT ERROR: ${filePath} - ${err.message}]\n`;
                ChatUI.appendBubble('system', `[ERROR] Failed to edit ${filePath}: ${err.message}`);
            }
        });

        if (typeof window.openFileInEditor === 'function' && window.currentEditingPath) {
            const hasModifiedOpen = editCmds.some(f => path.resolve(window.currentPath, f.path) === path.resolve(window.currentEditingPath));
            if (hasModifiedOpen) window.openFileInEditor(window.currentEditingPath);
        }

        const finalMessage = `${feedbackContent}\nProceed to verify the changes.`;
        
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
    } catch (err) {
        ChatUI.appendBubble('system', `[ERROR] Edit batch processing failed: ${err.message}`);
    }
}

async function executeEditFileRangeBatch(editCmds) {
    try {
        window.lastInjectedBubble = null;
        window.lastReceivedMirrorText = "";

        const fs = require('fs');
        const path = require('path');

        let feedbackContent = "";
        editCmds.forEach(fileObj => {
            const filePath = fileObj.path;
            const targetPath = path.resolve(window.currentPath, filePath);
            
            try {
                if (!fs.existsSync(targetPath)) {
                    feedbackContent += `[FILE EDIT ERROR: ${filePath} - File not found]\n`;
                    ChatUI.appendBubble('system', `[ERROR] Failed to edit ${filePath}: File not found`);
                    return;
                }
                
                const content = fs.readFileSync(targetPath, 'utf-8');
                const isCRLF = content.includes('\r\n');
                const lines = content.replace(/\r/g, '').split('\n');
                
                const startLine = Math.max(1, fileObj.start);
                const endLine = Math.min(lines.length, fileObj.end);
                
                const newLines = fileObj.code.replace(/\r/g, '').split('\n');
                lines.splice(startLine - 1, endLine - startLine + 1, ...newLines);
                
                const joined = lines.join(isCRLF ? '\r\n' : '\n');
                fs.writeFileSync(targetPath, joined, 'utf-8');
                const syntaxError = verifySyntax(filePath, targetPath);
                if (syntaxError) {
                    feedbackContent += `[FILE EDIT SUCCESS BUT SYNTAX ERROR DETECTED: ${filePath} - ${syntaxError}]\n`;
                    ChatUI.appendBubble('system', `[WARNING] Syntax error in ${filePath}: ${syntaxError}`);
                } else {
                    feedbackContent += `[FILE EDIT SUCCESS: ${filePath} range ${startLine}-${endLine}]\n`;
                    ChatUI.appendBubble('system', `[SUCCESS] Edited ${filePath} successfully.`);
                }
            } catch (err) {
                feedbackContent += `[FILE EDIT ERROR: ${filePath} - ${err.message}]\n`;
                ChatUI.appendBubble('system', `[ERROR] Failed to edit ${filePath}: ${err.message}`);
            }
        });

        if (typeof window.openFileInEditor === 'function' && window.currentEditingPath) {
            const hasModifiedOpen = editCmds.some(f => path.resolve(window.currentPath, f.path) === path.resolve(window.currentEditingPath));
            if (hasModifiedOpen) window.openFileInEditor(window.currentEditingPath);
        }

        const finalMessage = `${feedbackContent}\nProceed to verify the changes.`;
        
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
    } catch (err) {
        ChatUI.appendBubble('system', `[ERROR] Edit batch processing failed: ${err.message}`);
    }
}

async function executeDeleteFileBatch(deleteCmds) {
    try {
        window.lastInjectedBubble = null;
        window.lastReceivedMirrorText = "";

        const fs = require('fs');
        const path = require('path');

        let feedbackContent = "";
        deleteCmds.forEach(fileObj => {
            const filePath = fileObj.path;
            const targetPath = path.resolve(window.currentPath, filePath);
            
            try {
                if (!fs.existsSync(targetPath)) {
                    feedbackContent += `[FILE DELETE SUCCESS: ${filePath} - File already gone]\n`;
                    ChatUI.appendBubble('system', `[SUCCESS] Deleted ${filePath} (Already gone).`);
                    return;
                }
                
                const stat = fs.statSync(targetPath);
                if (stat.isDirectory()) {
                    fs.rmSync(targetPath, { recursive: true, force: true });
                } else {
                    fs.unlinkSync(targetPath);
                }
                
                feedbackContent += `[FILE DELETE SUCCESS: ${filePath}]\n`;
                ChatUI.appendBubble('system', `[SUCCESS] Deleted ${filePath} successfully.`);
            } catch (err) {
                feedbackContent += `[FILE DELETE ERROR: ${filePath} - ${err.message}]\n`;
                ChatUI.appendBubble('system', `[ERROR] Failed to delete ${filePath}: ${err.message}`);
            }
        });

        if (typeof window.openFileInEditor === 'function' && window.currentEditingPath) {
            const hasModifiedOpen = deleteCmds.some(f => path.resolve(window.currentPath, f.path) === path.resolve(window.currentEditingPath));
            if (hasModifiedOpen) window.openFileInEditor(window.currentEditingPath);
        }

        if (typeof window.refreshTree === 'function') {
            window.refreshTree();
        }

        const finalMessage = `${feedbackContent}\nProceed to verify the changes.`;
        
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
    } catch (err) {
        ChatUI.appendBubble('system', `[ERROR] Delete batch processing failed: ${err.message}`);
    }
}

function findFuzzyMatchIndexRange(content, searchStr) {
    const contentLines = content.split('\n');
    const searchLines = searchStr.split('\n').map(l => l.trim()).filter(l => l !== '');
    
    if (searchLines.length === 0) return null;
    
    const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9ㄱ-ㅎㅏ-ㅣ가-힣]/g, '');
    const normSearchLines = searchLines.map(normalize);
    const normContentLines = contentLines.map(l => normalize(l));
    
    let bestStart = -1;
    let bestEnd = -1;
    let bestScore = 0;
    
    const windowSize = searchLines.length;
    
    for (let i = 0; i <= contentLines.length - 1; i++) {
        let score = 0;
        let matchedCount = 0;
        
        for (let j = 0; j < windowSize; j++) {
            if (i + j >= contentLines.length) break;
            
            const sNorm = normSearchLines[j];
            const cNorm = normContentLines[i + j];
            
            if (sNorm === "" || cNorm === "") {
                if (sNorm === cNorm) score += 0.5;
                continue;
            }
            
            if (sNorm === cNorm || cNorm.includes(sNorm) || sNorm.includes(cNorm)) {
                score += 1.0;
                matchedCount++;
            } else {
                let common = 0;
                for (let char of sNorm) {
                    if (cNorm.includes(char)) common++;
                }
                const sim = common / Math.max(sNorm.length, cNorm.length);
                if (sim >= 0.6) {
                    score += sim;
                    matchedCount++;
                }
            }
        }
        
        if (score > bestScore && matchedCount >= Math.ceil(searchLines.length * 0.5)) {
            bestScore = score;
            bestStart = i;
            bestEnd = Math.min(contentLines.length - 1, i + windowSize - 1);
        }
    }
    
    if (bestStart !== -1) {
        let startCharIdx = 0;
        for (let i = 0; i < bestStart; i++) {
            startCharIdx += contentLines[i].length + 1;
        }
        
        let endCharIdx = 0;
        for (let i = 0; i <= bestEnd; i++) {
            endCharIdx += contentLines[i].length + 1;
        }
        if (endCharIdx > 0 && content.endsWith('\n') && endCharIdx >= content.length) {
            endCharIdx = content.length;
        } else if (endCharIdx > 0) {
            endCharIdx -= 1;
        }
        
        return { start: startCharIdx, end: endCharIdx };
    }
    
    return null;
}




function verifySyntax(filePath, targetPath) {
    const fs = require('fs');
    const path = require('path');
    const ext = path.extname(filePath).toLowerCase();
    
    if (ext === '.js') {
        const { execSync } = require('child_process');
        try {
            execSync(`node -c "${targetPath}"`, { stdio: 'pipe' });
            return null;
        } catch (err) {
            return err.stderr.toString().trim() || err.message;
        }
    } else if (ext === '.json') {
        try {
            const content = fs.readFileSync(targetPath, 'utf-8');
            JSON.parse(content);
            return null;
        } catch (err) {
            return err.message;
        }
    }
    return null;
}
