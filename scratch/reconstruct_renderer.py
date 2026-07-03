# --- RECONSTRUCTION SCRIPT FOR RENDERER.JS ---
import os

path_js = r'f:\VOXELVERSE\InnerProject\VaporTool\renderer.js'

full_code = """// --- VaporTool Consolidated Renderer Engine (STABLE v3) ---
if (typeof ipcRenderer === 'undefined') {
    var { ipcRenderer } = require('electron');
}

// Global Sync Engine
let syncPending = false;
const syncBrowserView = () => {
    if (syncPending) return;
    syncPending = true;
    requestAnimationFrame(() => {
        try {
            const dockElem = document.getElementById('agent-view-dock');
            const viewBrowser = document.getElementById('inspector-browser-hub');
            if (dockElem && viewBrowser && viewBrowser.style.display === 'flex') {
                const rect = dockElem.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    ipcRenderer.send('sync-agent-view-bounds', {
                        x: Math.floor(rect.left), 
                        y: Math.floor(rect.top), 
                        width: Math.floor(rect.width), 
                        height: Math.floor(rect.height)
                    });
                }
            }
        } catch (e) {
            console.error('Sync Error:', e);
        }
        syncPending = false;
    });
};

// Markdown Configuration
if (window.marked && window.hljs) {
    marked.setOptions({
        highlight: (code, lang) => {
            const language = hljs.getLanguage(lang) ? lang : 'plaintext';
            return hljs.highlight(code, { language }).value;
        },
        langPrefix: 'hljs language-'
    });
}

// 1. Global Services
function updateOllamaModels() {
    const modelSelect = document.getElementById('ollama-model-select');
    if (!modelSelect) return;
    fetch('http://localhost:11434/api/tags')
        .then(res => res.json())
        .then(data => {
            if (data.models && data.models.length > 0) {
                modelSelect.innerHTML = '';
                data.models.forEach(m => {
                    const opt = document.createElement('option');
                    opt.value = m.name;
                    opt.textContent = m.name;
                    modelSelect.appendChild(opt);
                });
            } else {
                modelSelect.innerHTML = '<option value="gemma2:2b">gemma2:2b (Default)</option>';
            }
        }).catch(() => {
            modelSelect.innerHTML = '<option value="gemma2:2b">Ollama Offline</option>';
        });
}

function addCopyButtons() {
    document.querySelectorAll('pre code').forEach((codeBlock) => {
        const parent = codeBlock.parentNode;
        if (parent.querySelector('.copy-code-btn')) return;
        const button = document.createElement('button');
        button.className = 'copy-code-btn';
        button.innerText = 'Copy';
        button.style = 'position:absolute; top:5px; right:5px; font-size:10px; background:#111; border:1px solid #333; color:#fff; cursor:pointer; padding:2px 6px; border-radius:4px; font-family:inherit;';
        button.onclick = (e) => {
            e.preventDefault();
            navigator.clipboard.writeText(codeBlock.innerText);
            button.innerText = 'Copied!';
            setTimeout(() => { button.innerText = 'Copy'; }, 2000);
        };
        parent.style.position = 'relative';
        parent.appendChild(button);
    });
}

// 2. UI Engines
function setupUniversalResizers() {
    const leftSidebar = document.getElementById('sidebar-left');
    const rightInspector = document.getElementById('inspector-right');
    const terminalPanel = document.getElementById('terminal-lower');
    const resizerLeft = document.getElementById('resizer-left');
    const resizerRight = document.getElementById('resizer-inspector');
    const resizerTerminal = document.getElementById('resizer-terminal');

    const setupVResizer = (resizer, target, side) => {
        if (!resizer || !target) return;
        resizer.onmousedown = (e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startWidth = target.offsetWidth;
            const onMouseMove = (moveE) => {
                const diff = (side === 'left') ? (moveE.clientX - startX) : (startX - moveE.clientX);
                const newWidth = Math.max(150, Math.min(window.innerWidth * 0.8, startWidth + diff));
                target.style.width = newWidth + 'px';
                syncBrowserView();
            };
            const onMouseUp = () => {
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
            };
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        };
    };

    if (resizerTerminal && terminalPanel) {
        resizerTerminal.onmousedown = (e) => {
            e.preventDefault();
            const startY = e.clientY;
            const startHeight = terminalPanel.offsetHeight;
            const onMouseMove = (moveE) => {
                const diff = startY - moveE.clientY;
                const newHeight = Math.max(40, Math.min(window.innerHeight * 0.8, startHeight + diff));
                terminalPanel.style.height = newHeight + 'px';
            };
            const onMouseUp = () => {
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
            };
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        };
    }

    setupVResizer(resizerLeft, leftSidebar, 'left');
    setupVResizer(resizerRight, rightInspector, 'right');
}

const fireGeneration = async (prompt, targetBubble) => {
    const stopBtn = document.getElementById('stop-ai-btn');
    const sendBtn = document.getElementById('send-to-local');
    if (stopBtn) stopBtn.style.display = 'flex';
    if (sendBtn) { sendBtn.disabled = true; sendBtn.style.opacity = '0.5'; }
    
    targetBubble.classList.add('thinking');
    targetBubble.innerHTML = `
        <div class="bubble-actions">
             <span class="bubble-action-btn edit-btn">✏️</span> <span class="bubble-action-btn retry-btn">🔄</span>
        </div>
        <div class="msg-content">
            <span class="thinking-dot">.</span><span class="thinking-dot">.</span><span class="thinking-dot">.</span>
            <span class="thinking-timer">[0.0s]</span>
        </div>
    `;

    let elapsed = 0;
    const timerInterval = setInterval(() => {
        elapsed += 0.1;
        const timerObj = targetBubble.querySelector('.thinking-timer');
        if (timerObj) timerObj.innerText = `[${elapsed.toFixed(1)}s]`;
    }, 100);

    const abortController = new AbortController();
    if (stopBtn) stopBtn.onclick = () => abortController.abort();

    const modelSelect = document.getElementById('ollama-model-select');
    const model = modelSelect ? modelSelect.value : 'gemma2:2b';

    try {
        const response = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, prompt: prompt, stream: false }),
            signal: abortController.signal
        });
        if (!response.ok) throw new Error(`Ollama Error: ${response.status}`);
        const data = await response.json();
        clearInterval(timerInterval);
        
        targetBubble.classList.remove('thinking');
        const newContentText = data.response;
        targetBubble.innerHTML = `
            <div class="bubble-actions">
                <span class="bubble-action-btn edit-btn">✏️</span> <span class="bubble-action-btn retry-btn">🔄</span>
            </div>
            <div class="msg-content" data-raw="${newContentText.replace(/"/g, '&quot;')}">
                ${marked.parse(newContentText)}
                <div style="font-size:9px; color:#333; margin-top:5px; text-align:right;">Elapsed: ${elapsed.toFixed(1)}s</div>
            </div>
        `;
        bindBubbleActions(targetBubble, prompt, 'ai');
        addCopyButtons();
        saveChatToStorage();
    } catch (e) {
        clearInterval(timerInterval);
        const content = targetBubble.querySelector('.msg-content');
        if (content) content.innerText = e.name === 'AbortError' ? 'Generation Stopped.' : 'Error: ' + e.message;
    } finally {
        if (stopBtn) stopBtn.style.display = 'none';
        if (sendBtn) { sendBtn.disabled = false; sendBtn.style.opacity = '1'; }
    }
};

const saveChatToStorage = () => {
    const chatMessages = document.getElementById('local-chat-messages');
    if (!chatMessages) return;
    const msgs = Array.from(chatMessages.querySelectorAll('.msg-bubble')).map(b => ({
        role: b.classList.contains('user-bubble') ? 'user' : 'ai',
        text: b.querySelector('.msg-content').getAttribute('data-raw') || b.querySelector('.msg-content').innerText
    }));
    localStorage.setItem('vapor_chat_history', JSON.stringify(msgs));
};

const bindBubbleActions = (bubble, text, role) => {
    const content = bubble.querySelector('.msg-content');
    const actions = bubble.querySelector('.bubble-actions');
    if (!actions) return;

    const editBtn = actions.querySelector('.edit-btn');
    if (editBtn) {
        editBtn.onclick = () => {
            const editArea = document.createElement('textarea');
            editArea.value = content.getAttribute('data-raw') || text;
            editArea.className = 'bubble-inline-edit';
            editArea.style = 'width:100%; min-height:100px; background:#000; color:#fff; border:1px solid #333; padding:10px; font-family:inherit; font-size:11px; line-height:1.6;';
            content.innerHTML = '';
            content.appendChild(editArea);
            editArea.focus();
            editArea.onblur = () => {
                const newText = editArea.value;
                content.setAttribute('data-raw', newText);
                content.innerHTML = marked.parse(newText);
                saveChatToStorage();
                addCopyButtons();
            };
        };
    }

    const retryBtn = actions.querySelector('.retry-btn');
    if (retryBtn) {
        retryBtn.onclick = () => {
            let prompt = "";
            if (role === 'ai') {
                const prevUser = bubble.previousElementSibling;
                if (prevUser && prevUser.classList.contains('user-bubble')) {
                    prompt = prevUser.querySelector('.msg-content').getAttribute('data-raw');
                    fireGeneration(prompt, bubble);
                }
            } else {
                prompt = content.getAttribute('data-raw');
                const nextAi = bubble.nextElementSibling;
                if (nextAi && nextAi.classList.contains('ai-bubble')) {
                    fireGeneration(prompt, nextAi);
                }
            }
        };
    }
};

const appendBubble = (role, text) => {
    const chatMessages = document.getElementById('local-chat-messages');
    if (!chatMessages) return;
    const bubble = document.createElement('div');
    bubble.className = `msg-bubble ${role === 'user' ? 'user-bubble' : 'ai-bubble'}`;
    
    const actions = document.createElement('div');
    actions.className = 'bubble-actions';
    actions.innerHTML = '<span class="bubble-action-btn edit-btn">✏️</span> <span class="bubble-action-btn retry-btn">🔄</span>';
    bubble.appendChild(actions);

    const content = document.createElement('div');
    content.className = 'msg-content';
    content.setAttribute('data-raw', text);
    content.innerHTML = marked.parse(text);
    bubble.appendChild(content);

    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    bindBubbleActions(bubble, text, role);
    return bubble;
};

// 3. Tab & Hub Engines
function setupInspectorTabs() {
    const tabLocal = document.getElementById('tab-local-agent');
    const tabBrowser = document.getElementById('tab-browser-hub');
    const viewLocal = document.getElementById('inspector-local-chat');
    const viewBrowser = document.getElementById('inspector-browser-hub');
    const dockElem = document.getElementById('agent-view-dock');

    if (!tabLocal || !tabBrowser || !viewLocal || !viewBrowser) return;

    if (dockElem) new ResizeObserver(syncBrowserView).observe(dockElem);
    window.addEventListener('resize', syncBrowserView);

    const switchTab = (mode) => {
        const isLocal = mode === 'local';
        viewLocal.style.display = isLocal ? 'flex' : 'none';
        viewBrowser.style.display = isLocal ? 'none' : 'flex';
        tabLocal.classList.toggle('active-tab', isLocal);
        tabBrowser.classList.toggle('active-tab', !isLocal);
        ipcRenderer.send('toggle-agent-view', !isLocal);
        if (!isLocal) {
            setTimeout(syncBrowserView, 60);
        }
    };

    tabLocal.onclick = () => switchTab('local');
    tabBrowser.onclick = () => switchTab('browser');
}

function setupWebAgentHub() {
    const grid = document.getElementById('agent-grid');
    const addBtn = document.getElementById('add-agent-app');
    const modal = document.getElementById('app-reg-modal');
    const urlInput = document.getElementById('reg-app-url');
    if (!grid || !addBtn) return;

    const saveApps = () => {
        const apps = Array.from(document.querySelectorAll('.agent-app:not(.add-app)')).map(a => a.dataset.url);
        localStorage.setItem('vapor_agent_apps', JSON.stringify(apps));
    };

    const loadApps = () => {
        const saved = localStorage.getItem('vapor_agent_apps');
        if (saved) {
            try {
                JSON.parse(saved).forEach(u => createUI(u, false));
            } catch (e) { console.error('Failed to load apps:', e); }
        }
    };

    const createUI = (url, save = true) => {
        try {
            const domain = new URL(url).hostname;
            const card = document.createElement('div');
            card.className = 'agent-app';
            card.dataset.url = url;
            card.innerHTML = `<div class=\"icon-wrapper\" style=\"width:70px; height:70px; border:1px solid #222; border-radius:18px; background-image:url('https://www.google.com/s2/favicons?domain=${domain}&sz=64'); background-size:32px; background-repeat:no-repeat; background-position:center;\"></div><div style=\"margin-top:10px; font-size:10px; color:#aaa; text-align:center;\">${domain.split('.')[0].toUpperCase()}</div>`;
            card.onclick = () => {
                const webviewView = document.getElementById('agent-hub-webview');
                const home = document.getElementById('agent-hub-home');
                if (home && webviewView) {
                    home.style.display = 'none';
                    webviewView.style.display = 'flex';
                    ipcRenderer.send('toggle-agent-view', true);
                    ipcRenderer.send('load-agent-url', url);
                }
            };
            grid.insertBefore(card, addBtn);
            if (save) saveApps();
        } catch (e) { console.error('Invalid URL:', url); }
    };

    addBtn.onclick = () => { if (modal) { modal.classList.remove('hidden'); modal.style.display = 'flex'; } };
    const cancelBtn = document.getElementById('cancel-reg');
    if (cancelBtn) cancelBtn.onclick = () => { if (modal) { modal.classList.add('hidden'); modal.style.display = 'none'; } };
    
    const confirmBtn = document.getElementById('confirm-reg');
    if (confirmBtn) confirmBtn.onclick = () => {
        if (urlInput && urlInput.value.trim()) {
            let url = urlInput.value.trim();
            if (!url.startsWith('http')) url = 'https://' + url;
            createUI(url);
            modal.classList.add('hidden');
            modal.style.display = 'none';
            urlInput.value = '';
        }
    };
    loadApps();
}

function setupLocalChat() {
    const chatInput = document.getElementById('local-agent-input');
    const sendBtn = document.getElementById('send-to-local');
    const chatMessages = document.getElementById('local-chat-messages');

    if (!chatInput || !sendBtn || !chatMessages) return;

    const handleSend = async () => {
        const text = chatInput.value.trim();
        if (!text) return;
        appendBubble('user', text);
        chatInput.value = '';
        const aiBubble = appendBubble('ai', 'Thinking...');
        fireGeneration(text, aiBubble);
    };

    sendBtn.onclick = handleSend;
    chatInput.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    };

    const saved = localStorage.getItem('vapor_chat_history');
    if (saved) {
        try {
            chatMessages.innerHTML = '';
            JSON.parse(saved).forEach(m => appendBubble(m.role, m.text));
        } catch (e) { console.error('Failed to load chat history:', e); }
    }

    const clearBtn = document.getElementById('clear-local-chat');
    if (clearBtn) {
        clearBtn.onclick = () => {
            if (confirm('Clear history?')) {
                chatMessages.innerHTML = '';
                localStorage.setItem('vapor_chat_history', '[]');
            }
        };
    }
}

// 4. Global Orchestrator
document.addEventListener('DOMContentLoaded', () => {
    // UI Setup
    setupUniversalResizers();
    
    // Expansion Toggle with Sync Loop
    const handle = document.getElementById('inspector-expand-handle');
    if (handle) {
        handle.onclick = () => {
            document.body.classList.toggle('inspector-full');
            const icon = document.getElementById('expand-icon');
            if (icon) icon.innerText = document.body.classList.contains('inspector-full') ? '▶' : '◀';
            
            const syncLoop = setInterval(syncBrowserView, 16); 
            setTimeout(() => clearInterval(syncLoop), 500); 
        };
    }

    // Badge Setup
    const badge = document.getElementById('active-project-badge');
    if (badge) {
        try {
            const folder = process.cwd().split(require('path').sep).pop().toUpperCase();
            badge.innerText = folder || 'ROOT';
        } catch(e) {}
    }

    // Tab & Agency
    setupInspectorTabs();
    setupWebAgentHub();
    
    // Chat & Ollama
    updateOllamaModels();
    setupLocalChat();

    // Initial State
    ipcRenderer.send('toggle-agent-view', false);
});
\"\"\"

with open(path_js, 'w', encoding='utf-8') as f:
    f.write(full_code)

print("Success: renderer.js fully reconstructed and sanitized.")
