if (typeof ipcRenderer === 'undefined') { var { ipcRenderer } = require('electron'); }
window.projectRoot = null;

window.selectProject = async (folderPath) => {
    if (!folderPath) return;
    
    // Clean up any remaining _project_rules_ files in the target directory
    const fs = require('fs');
    const path = require('path');
    try {
        const files = fs.readdirSync(folderPath);
        files.forEach(file => {
            if (file.startsWith('_project_rules_') && file.endsWith('.md')) {
                fs.unlinkSync(path.join(folderPath, file));
            }
        });
    } catch(e) {}

    window.sessionTurnCount = 0;
    try {
        const rulesText = window.getSystemRulesPrompt();
        fs.writeFileSync(path.join(folderPath, 'SystemRules.md'), rulesText, 'utf-8');
        console.log("[ProjectInfo] Successfully wrote SystemRules.md to workspace root.");
    } catch(e) {
        console.error("[ProjectInfo] Failed to write SystemRules.md:", e);
    }

    window.projectRoot = folderPath;
    window.currentPath = folderPath;
    ipcRenderer.send('save-recent-project', folderPath);
    window.reloadAgentSettings();

    const modal = document.getElementById('project-picker-modal');
    if (modal) modal.style.display = 'none';

    await window.loadDirectory(folderPath);

    const localTab = document.getElementById('tab-local-agent');
    if (localTab) {
        localTab.click();
        const chatIn = document.getElementById('local-agent-input');
        if (chatIn) chatIn.focus();
    }
};

async function openProjectModal() {
    window.openProjectModal = openProjectModal; // self export
    const modal = document.getElementById('project-picker-modal');
    if (!modal) return;
    modal.style.display = 'flex';

    const recents = await ipcRenderer.invoke('get-recent-projects');
    const list = document.getElementById('recent-projects-list');
    if (!list) return;

    if (!recents || recents.length === 0) {
        list.innerHTML = `<div style="font-size:12px; color:#777; padding:10px 0; font-family:'JetBrains Mono',monospace; text-align:center;">No recent projects</div>`;
    } else {
        list.innerHTML = recents.map((p, i) => {
            const name = p.split(/[\\/]/).pop() || p;
            const short = p.length > 48 ? '...' + p.slice(-45) : p;
            
            return `<div data-path="${p}" class="recent-project-item" onclick="window.selectProject(this.getAttribute('data-path'))" 
                style="display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:8px; cursor:pointer; border:1px solid transparent; transition:all 0.15s; background:transparent;"
                onmouseover="this.style.background='#1a1a1f'; this.style.borderColor='#333';"
                onmouseout="this.style.background='transparent'; this.style.borderColor='transparent';">
                <div style="min-width:0;">
                    <div style="font-size:13px; font-weight:600; color:#ddd; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${name}</div>
                    <div style="font-size:10px; color:#777; font-family:'JetBrains Mono',monospace; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:2px;">${short}</div>
                </div>
            </div>`;
        }).join('');
    }

    const browseBtn = document.getElementById('picker-browse-btn');
    if (browseBtn) {
        browseBtn.onclick = async () => {
            const selected = await ipcRenderer.invoke('select-folder-dialog');
            if (selected) window.selectProject(selected);
        };
    }
}

function bindDragAndDrop() {
    const hub = document.getElementById('inspector-browser-hub');
    if (hub) {
        hub.ondragover = (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        };
        hub.ondrop = async (e) => {
            e.preventDefault();
            
            let filePath = '';
            const internalPath = e.dataTransfer.getData('text/plain');
            if (internalPath) {
                filePath = internalPath;
            } 
            else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const fs = require('fs');
                const path = require('path');
                const file = e.dataTransfer.files[0];
                const absolutePath = file.path;
                if (window.currentPath) {
                    filePath = path.relative(window.currentPath, absolutePath);
                } else {
                    filePath = path.basename(absolutePath);
                }
            }

            if (!filePath) return;

            try {
                const fs = require('fs');
                const path = require('path');
                const targetPath = path.resolve(window.currentPath || process.cwd(), filePath);
                
                if (fs.existsSync(targetPath)) {
                    const chatOverlay = document.getElementById('local-chat-overlay');
                    const progressBox = document.getElementById('overlay-progress-box');
                    const projBtn = document.getElementById('btn-send-project-info');
                    if (chatOverlay && progressBox && projBtn) {
                        chatOverlay.style.display = 'flex';
                        projBtn.style.display = 'none';
                        progressBox.style.display = 'flex';
                    }

                    window.readFilesSet.add(filePath);
                    if (typeof window.updateSendProgress === 'function') {
                        window.updateSendProgress(window.readFilesSet.size, window.totalFilesCount);
                    }

                    const rawContent = fs.readFileSync(targetPath, 'utf-8');
                    const ext = filePath.split('.').pop().toLowerCase();
                    const fileContent = extractCodeOutline(rawContent, ext);
                    const finalMessage = `[FILE DATA (OUTLINE ONLY): ${filePath}]\n\`\`\`\n${fileContent}\n\`\`\`\n\nProceed to analyze this file.`;

                    ChatUI.appendBubble('system', `[SYSTEM] Drag & Drop: Injecting ${filePath} content outline to Web AI...`);

                    await injectWebPayload(finalMessage, 1);
                    const response = await runExperimentalEngine('/marktag', finalMessage, null);
                    
                    if (chatOverlay && progressBox && projBtn) {
                        chatOverlay.style.display = 'none';
                        progressBox.style.display = 'none';
                        projBtn.style.display = 'flex';
                    }
                } else {
                    ChatUI.appendBubble('system', `[ERROR] Drag & Drop failed: File not found: ${filePath}`);
                }
            } catch (err) {
                ChatUI.appendBubble('system', `[ERROR] Drag & Drop failed: ${err.message}`);
            }
        };
    }
}
