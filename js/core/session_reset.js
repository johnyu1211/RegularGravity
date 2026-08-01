window.triggerSessionReset = async () => {
    const fs = require('fs');
    const path = require('path');
    const { execSync } = require('child_process');
    
    if (typeof ChatUI !== 'undefined' && typeof ChatUI.appendBubble === 'function') {
        ChatUI.appendBubble('system', '[SYSTEM] Preparing session reset. Generating carryover context...');
    }
    
    let gitStatus = "";
    try {
        gitStatus = execSync('git status -s', { cwd: window.currentPath || process.cwd() }).toString().trim();
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
        const files = getFlatDirectoryTree(window.currentPath || process.cwd());
        const relativeFiles = files.map(f => path.relative(window.currentPath || process.cwd(), f));
        treeStr = relativeFiles.map(rf => `- ${rf.replace(/\\/g, '/')}`).join('\n');
    } catch(e) {
        treeStr = "Error reading directory structure";
    }
    
    const carryOverPrompt = `[SYSTEM REBOOTED]
Current session chat history exceeded limits and was safely rebooted.
Handing over previous progress. Please follow rules and tools to continue.

1. Modified and added local file list (Git Status):
\`\`\`
${gitStatus || "No modified files"}
\`\`\`

2. Current project folder/file structure:
${treeStr}

${window.getSystemRulesPrompt(true)}

Check previous session goals and specify next changes or tasks.`;

    window.carryOverPrompt = carryOverPrompt;
    window.sessionBriefed = false; // Reset session briefing state
    window.sessionTurnCount = 0;
    
    const webview = document.getElementById('active-agent-webview');
    if (webview) {
        webview.reload();
    }
};
