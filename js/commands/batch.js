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
                feedbackContent += `[FILE WRITE SUCCESS: ${filePath}]\n`;
                ChatUI.appendBubble('system', `[SUCCESS] Wrote ${filePath} content.`);
            } catch (err) {
                feedbackContent += `[FILE WRITE ERROR: ${filePath} - ${err.message}]\n`;
                ChatUI.appendBubble('system', `[ERROR] Failed to write ${filePath}: ${err.message}`);
            }
        });

        if (typeof window.loadDirectory === 'function' && window.currentPath) {
            window.loadDirectory(window.currentPath);
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
                
                feedbackContent += `[FILE EDIT SUCCESS: ${filePath}]\n`;
                ChatUI.appendBubble('system', `[SUCCESS] Edited ${filePath} successfully.`);
            } catch (err) {
                feedbackContent += `[FILE EDIT ERROR: ${filePath} - ${err.message}]\n`;
                ChatUI.appendBubble('system', `[ERROR] Failed to edit ${filePath}: ${err.message}`);
            }
        });

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
                
                feedbackContent += `[FILE EDIT SUCCESS: ${filePath} range ${startLine}-${endLine}]\n`;
                ChatUI.appendBubble('system', `[SUCCESS] Edited ${filePath} successfully.`);
            } catch (err) {
                feedbackContent += `[FILE EDIT ERROR: ${filePath} - ${err.message}]\n`;
                ChatUI.appendBubble('system', `[ERROR] Failed to edit ${filePath}: ${err.message}`);
            }
        });

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


