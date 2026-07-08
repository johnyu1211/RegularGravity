if (typeof ipcRenderer === 'undefined') { var { ipcRenderer } = require('electron'); }
window.projectRoot = null;

window.selectProject = async (folderPath) => {
    if (!folderPath) return;
    window.projectRoot = folderPath;
    window.currentPath = folderPath;
    ipcRenderer.send('save-recent-project', folderPath);
    window.reloadAgentSettings();
    if (typeof window.writeProjectRulesFile === 'function') {
        window.writeProjectRulesFile(folderPath);
    }

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

window.writeProjectRulesFile = function(folderPath) {
    const fs = require('fs');
    const path = require('path');
    const targetPath = path.join(folderPath, '.pormsg_rules.md');
    
    const dragDropRules = `
[SYSTEM RULES (Drag & Drop Mode)]
1. 탐색 단계: 전체 파악 전 설명 일절 금지, 다음 탐색용 요구 사항만 단답형 제출.
2. 요구 규격 (Drag & Drop Mode 활성 상태):
   - 중요: 모든 파일 파악/요구는 유저에게 파일 드래그앤드롭을 정중히 요청하고, 문장 끝에 반드시 다음 태그를 포함하십시오:
     * [REQUEST: read-file "경로"] (파일의 개요/아웃라인(함수/클래스명, JSON 키 목록 등)만 축소 파악)
     * [REQUEST: read-file-full "경로"] (파일의 실제 전체 본문 코드 및 구체적인 설정값 파악)
     * [REQUEST: read-file-range "경로" 시작줄-끝줄] (파일 본문의 특정 줄 범위 분석, 최대 2000줄 제한)
3. 파일 수정 규격:
   - 코드 생성/수정/작성이 필요할 때, 반드시 다음 형식으로 명령어와 코드를 명시하여 응답하십시오 (유저가 승인하면 파일에 반영됩니다):
     [CMD: write-file "경로"]
     \`\`\`언어
     전체 코드 본문
     \`\`\`
     [CMD: edit-file-range "경로" 시작줄-끝줄]
     \`\`\`언어
     대체될 범위 코드 본문
     \`\`\`
4. 탐색 강제: 유저 질문/요청 시 짐작 금지. 관련 파일 목록을 유저에게 드롭해달라고 요청([REQUEST: read-file...])하여 확인한 뒤 답변하십시오. 본문 로직 확인 전에 모른다/없다 선언 절대 금지.
5. 문구 제한: 단답형으로 요청 직후 태그만 표시. 사족 절대 금지.
6. 대기 완료: 파악 완료 시 계획수립 금지, 현재 구조만 설명 후 대기(Wait for user instructions).
`;

    const cmdRules = `
[SYSTEM RULES (CMD Mode)]
1. 탐색 단계: 전체 파악 전 설명 일절 금지, 다음 탐색용 [CMD: ...] 명령어만 단답형 제출.
2. 명령 규격:
   - [CMD: read-file "경로"] (파일의 개요/아웃라인(함수/클래스명, JSON 키 목록 등)만 축소 파악)
   - [CMD: read-file-full "경로"] (파일의 실제 전체 본문 코드 및 구체적인 설정값 파악)
   - [CMD: read-file-range "경로" 시작줄-끝줄] (파일 본문의 특정 줄 범위 분석, 최대 2000줄 제한)
   - [CMD: search-file "경로" "검색어"] (파일 내 검색)
   - [CMD: search-all "검색어"] (전역 검색)
3. 파일 수정 규격:
   - 코드 생성/수정/작성이 필요할 때, 반드시 다음 형식으로 명령어와 코드를 명시하여 응답하십시오 (유저가 승인하면 파일에 반영됩니다):
     [CMD: write-file "경로"]
     \`\`\`언어
     전체 코드 본문
     \`\`\`
     [CMD: edit-file-range "경로" 시작줄-끝줄]
     \`\`\`언어
     대체될 범위 코드 본문
     \`\`\`
4. 탐색 강제: 유저 질문/요청 시 짐작 금지. 관련 핵심 키워드로 [CMD: search-all "검색어"]를 최우선 실행하여 위치를 파악한 뒤, 대상 소스 본문을 [CMD: read-file...]로 직접 읽고 검증하여 답변하십시오. 본문 로직 확인 전에 모른다/없다 선언 절대 금지.
5. 문구 제한: 명령어 제출 시 '코드를 읽어보는게 정확하겠습니다' 등 사족 절대 금지. 오직 '읽어보겠습니다.' 등 짧은 단답 직후 명령어만 표시.
6. 대기 완료: 파악 완료 시 계획수립 금지, 현재 구조만 설명 후 대기(Wait for user instructions).
`;

    const finalRules = `# PoorMan's Gravity - Developer Agent Rules

이 파일은 이 프로젝트 폴더 내에서 AI 에이전트가 코드를 분석하고 수정할 때 반드시 준수해야 하는 실시간 가이드라인 규칙 파일입니다.
에이전트는 이 규칙을 항시 최우선 지침으로 인지해야 합니다.

${dragDropRules}

${cmdRules}
`;

    try {
        fs.writeFileSync(targetPath, finalRules, 'utf-8');
        console.log("[RulesFile] Wrote .pormsg_rules.md to project root:", targetPath);
    } catch(e) {
        console.error("[RulesFile] Failed to write rules file:", e);
    }
};
