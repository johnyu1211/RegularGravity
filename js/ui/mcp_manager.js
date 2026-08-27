/**
 * MCP Server Manager (Model Context Protocol)
 * Supports both SSE (URL/Port) and stdio (Command line) server configurations.
 * Saves to Settings.json (Claude Desktop & Standard MCP compatible).
 */

(function() {
    function getSettingsPath() {
        const path = require('path');
        const root = window.appRootPath || (typeof process !== 'undefined' ? process.cwd() : '.');
        return path.join(root, 'Settings.json');
    }

    function loadMcpServers() {
        const fs = require('fs');
        try {
            const p = getSettingsPath();
            if (fs.existsSync(p)) {
                const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
                return data.mcpServers || {};
            }
        } catch(e) {
            console.error("[MCP] Failed to load:", e);
        }
        return {};
    }

    function saveMcpServers(servers) {
        const fs = require('fs');
        try {
            const p = getSettingsPath();
            let data = {};
            if (fs.existsSync(p)) {
                try { data = JSON.parse(fs.readFileSync(p, 'utf-8')); } catch(e) {}
            }
            data.mcpServers = servers;
            fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
            window.mcpServers = servers;
            return true;
        } catch(e) {
            console.error("[MCP] Failed to save:", e);
            if (typeof window.showUserScreenToast === 'function') {
                window.showUserScreenToast(`Save error: ${e.message}`, 3000, true);
            }
            return false;
        }
    }

    let currentEditingKey = null;
    let currentView = 'list'; // 'list' | 'form' | 'json'

    function renderServerCards() {
        const listEl = document.getElementById('mcp-cards-container');
        const emptyEl = document.getElementById('mcp-empty-state');
        if (!listEl) return;

        const servers = loadMcpServers();
        const keys = Object.keys(servers);

        if (keys.length === 0) {
            listEl.style.display = 'none';
            if (emptyEl) emptyEl.style.display = 'flex';
            return;
        }

        if (emptyEl) emptyEl.style.display = 'none';
        listEl.style.display = 'flex';
        listEl.innerHTML = '';

        keys.forEach(key => {
            const server = servers[key] || {};
            const isDisabled = server.disabled === true;
            const isSSE = !!server.url;
            const targetInfo = isSSE ? server.url : `${server.command || ''} ${(server.args || []).join(' ')}`.trim();

            const card = document.createElement('div');
            card.className = 'mcp-card';
            card.style = `
                background: rgba(255, 255, 255, 0.03);
                border: 1px solid ${isDisabled ? 'var(--border-color)' : 'rgba(70, 140, 246, 0.35)'};
                border-radius: 10px;
                padding: 12px 14px;
                display: flex;
                flex-direction: column;
                gap: 8px;
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            `;

            card.onmouseenter = () => {
                card.style.background = 'rgba(255, 255, 255, 0.05)';
            };
            card.onmouseleave = () => {
                card.style.background = 'rgba(255, 255, 255, 0.03)';
            };

            card.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: ${isDisabled ? '#666' : '#22c55e'}; box-shadow: ${isDisabled ? 'none' : '0 0 6px rgba(34, 197, 94, 0.5)'};"></span>
                        <span style="font-size: 13px; font-weight: 700; color: ${isDisabled ? 'var(--text-muted)' : '#fff'}; letter-spacing: 0.3px;">${key}</span>
                        ${isSSE 
                            ? '<span style="font-size: 10px; font-weight: 700; padding: 2px 7px; background: rgba(59, 130, 246, 0.15); color: #60a5fa; border-radius: 4px; border: 1px solid rgba(59, 130, 246, 0.3);">SSE / Port</span>' 
                            : '<span style="font-size: 10px; font-weight: 700; padding: 2px 7px; background: rgba(168, 85, 247, 0.15); color: #c084fc; border-radius: 4px; border: 1px solid rgba(168, 85, 247, 0.3);">stdio</span>'}
                        ${isDisabled ? '<span style="font-size: 10px; padding: 1px 6px; background: rgba(255,255,255,0.06); border-radius: 4px; color: var(--text-muted);">Disabled</span>' : ''}
                    </div>

                    <div style="display: flex; align-items: center; gap: 8px;">
                        <!-- Switch Toggle using app native switch-toggle -->
                        <label class="switch-toggle" style="transform: scale(0.85); margin: 0;" title="${isDisabled ? 'Enable server' : 'Disable server'}">
                            <input type="checkbox" class="mcp-card-toggle" data-key="${key}" ${isDisabled ? '' : 'checked'}>
                            <span class="slider-toggle"></span>
                        </label>
                        <!-- Edit Button -->
                        <button class="mcp-card-edit-btn" data-key="${key}" title="Edit Server" style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 4px; border-radius: 4px; display: flex; align-items: center; justify-content: center; transition: all 0.15s;" onmouseenter="this.style.color='#fff'; this.style.background='rgba(255,255,255,0.1)';" onmouseleave="this.style.color='var(--text-muted)'; this.style.background='transparent';">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <!-- Delete Button -->
                        <button class="mcp-card-del-btn" data-key="${key}" title="Delete Server" style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 4px; border-radius: 4px; display: flex; align-items: center; justify-content: center; transition: all 0.15s;" onmouseenter="this.style.color='#ef4444'; this.style.background='rgba(239,68,68,0.15)';" onmouseleave="this.style.color='var(--text-muted)'; this.style.background='transparent';">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                </div>

                <!-- URL or Command preview -->
                <div style="background: rgba(0, 0, 0, 0.35); padding: 7px 10px; border-radius: 6px; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: ${isDisabled ? 'var(--text-muted)' : '#cbd5e1'}; overflow-x: auto; white-space: nowrap;">
                    <span style="color: ${isSSE ? '#60a5fa' : '#c084fc'}; user-select: none;">${isSSE ? 'URL: ' : '$ '}</span>${targetInfo || '(not specified)'}
                </div>
            `;

            // Toggle active state
            const toggleCb = card.querySelector('.mcp-card-toggle');
            if (toggleCb) {
                toggleCb.onchange = (e) => {
                    const all = loadMcpServers();
                    if (all[key]) {
                        all[key].disabled = !e.target.checked;
                        saveMcpServers(all);
                        renderServerCards();
                    }
                };
            }

            // Edit
            const editBtn = card.querySelector('.mcp-card-edit-btn');
            if (editBtn) {
                editBtn.onclick = () => openRegisterForm(key);
            }

            // Delete
            const delBtn = card.querySelector('.mcp-card-del-btn');
            if (delBtn) {
                delBtn.onclick = () => {
                    if (confirm(`Remove MCP server "${key}"?`)) {
                        const all = loadMcpServers();
                        delete all[key];
                        saveMcpServers(all);
                        renderServerCards();
                        if (typeof window.showUserScreenToast === 'function') {
                            window.showUserScreenToast(`Removed "${key}"`, 2000);
                        }
                    }
                };
            }

            listEl.appendChild(card);
        });
    }

    function switchView(viewName) {
        currentView = viewName;
        const listView = document.getElementById('mcp-view-list');
        const formView = document.getElementById('mcp-view-form');
        const jsonView = document.getElementById('mcp-view-json');
        const listTabBtn = document.getElementById('mcp-tab-list-btn');
        const jsonTabBtn = document.getElementById('mcp-tab-json-btn');
        const addTopBtn = document.getElementById('mcp-open-add-btn');
        const titleText = document.getElementById('mcp-modal-main-title');
        const backBtn = document.getElementById('mcp-form-back-btn');

        if (listView) listView.style.display = (viewName === 'list') ? 'flex' : 'none';
        if (formView) formView.style.display = (viewName === 'form') ? 'flex' : 'none';
        if (jsonView) jsonView.style.display = (viewName === 'json') ? 'flex' : 'none';

        if (backBtn) backBtn.style.display = (viewName === 'form') ? 'flex' : 'none';

        if (titleText) {
            if (viewName === 'form') {
                titleText.innerText = currentEditingKey ? `Edit: ${currentEditingKey}` : 'Register Server';
            } else if (viewName === 'json') {
                titleText.innerText = 'MCP Config (JSON)';
            } else {
                titleText.innerText = 'MCP Servers';
            }
        }

        if (listTabBtn) {
            listTabBtn.style.color = (viewName === 'list' || viewName === 'form') ? '#fff' : 'var(--text-muted)';
            listTabBtn.style.background = (viewName === 'list' || viewName === 'form') ? 'rgba(255,255,255,0.1)' : 'transparent';
        }
        if (jsonTabBtn) {
            jsonTabBtn.style.color = (viewName === 'json') ? '#fff' : 'var(--text-muted)';
            jsonTabBtn.style.background = (viewName === 'json') ? 'rgba(255,255,255,0.1)' : 'transparent';
        }
        if (addTopBtn) {
            addTopBtn.style.display = (viewName === 'list') ? 'inline-flex' : 'none';
        }

        if (viewName === 'list') {
            renderServerCards();
        } else if (viewName === 'json') {
            const ta = document.getElementById('mcp-raw-json-textarea');
            if (ta) {
                const servers = loadMcpServers();
                ta.value = JSON.stringify({ mcpServers: servers }, null, 2);
                validateJson();
            }
        }
    }

    function updateFormTypeFields() {
        const isSSE = document.getElementById('mcp-type-sse')?.checked;
        const sseSection = document.getElementById('mcp-form-sse-section');
        const stdioSection = document.getElementById('mcp-form-stdio-section');

        if (sseSection) sseSection.style.display = isSSE ? 'flex' : 'none';
        if (stdioSection) stdioSection.style.display = isSSE ? 'none' : 'flex';
    }

    function openRegisterForm(editingKey = null) {
        currentEditingKey = editingKey;
        const nameInput = document.getElementById('mcp-form-name');
        const sseRadio = document.getElementById('mcp-type-sse');
        const stdioRadio = document.getElementById('mcp-type-stdio');
        const urlInput = document.getElementById('mcp-form-url');
        const cmdInput = document.getElementById('mcp-form-command');
        const argsInput = document.getElementById('mcp-form-args');
        const envInput = document.getElementById('mcp-form-env');

        if (editingKey) {
            const servers = loadMcpServers();
            const server = servers[editingKey] || {};
            if (nameInput) { nameInput.value = editingKey; nameInput.disabled = true; }

            const isSSE = !!server.url;
            if (sseRadio) sseRadio.checked = isSSE;
            if (stdioRadio) stdioRadio.checked = !isSSE;

            if (urlInput) urlInput.value = server.url || '';
            if (cmdInput) cmdInput.value = server.command || '';
            if (argsInput) argsInput.value = (server.args || []).join(' ');
            if (envInput) {
                const lines = Object.entries(server.env || {}).map(([k, v]) => `${k}=${v}`);
                envInput.value = lines.join('\n');
            }
        } else {
            if (nameInput) { nameInput.value = ''; nameInput.disabled = false; }
            if (sseRadio) sseRadio.checked = true; // Default to SSE/Port
            if (stdioRadio) stdioRadio.checked = false;
            if (urlInput) urlInput.value = 'http://localhost:8000/sse';
            if (cmdInput) cmdInput.value = '';
            if (argsInput) argsInput.value = '';
            if (envInput) envInput.value = '';
        }

        updateFormTypeFields();
        switchView('form');
        setTimeout(() => {
            if (!editingKey && nameInput) nameInput.focus();
            else if (urlInput && document.getElementById('mcp-type-sse')?.checked) urlInput.focus();
        }, 100);
    }

    function saveRegisterForm() {
        const nameInput = document.getElementById('mcp-form-name');
        const isSSE = document.getElementById('mcp-type-sse')?.checked;
        const urlInput = document.getElementById('mcp-form-url');
        const cmdInput = document.getElementById('mcp-form-command');
        const argsInput = document.getElementById('mcp-form-args');
        const envInput = document.getElementById('mcp-form-env');

        const name = (nameInput?.value || '').trim();
        if (!name) {
            if (typeof window.showUserScreenToast === 'function') {
                window.showUserScreenToast('Please enter a server name.', 2500, true);
            }
            if (nameInput) nameInput.focus();
            return;
        }

        const servers = loadMcpServers();

        if (isSSE) {
            const url = (urlInput?.value || '').trim();
            if (!url) {
                if (typeof window.showUserScreenToast === 'function') {
                    window.showUserScreenToast('Please enter a server URL (e.g. http://localhost:8000/sse).', 3000, true);
                }
                if (urlInput) urlInput.focus();
                return;
            }
            servers[name] = {
                url: url
            };
        } else {
            const command = (cmdInput?.value || '').trim();
            if (!command) {
                if (typeof window.showUserScreenToast === 'function') {
                    window.showUserScreenToast('Please enter an executable command (e.g. uvx, npx, python).', 3000, true);
                }
                if (cmdInput) cmdInput.focus();
                return;
            }
            const rawArgs = (argsInput?.value || '').trim();
            const args = rawArgs ? rawArgs.match(/(?:[^\s"]+|"[^"]*")+/g).map(s => s.replace(/^"|"$/g, '')) : [];

            const env = {};
            const rawEnv = (envInput?.value || '').trim();
            if (rawEnv) {
                rawEnv.split('\n').forEach(line => {
                    const trimmed = line.trim();
                    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
                        const idx = trimmed.indexOf('=');
                        const k = trimmed.slice(0, idx).trim();
                        const v = trimmed.slice(idx + 1).trim();
                        if (k) env[k] = v;
                    }
                });
            }

            servers[name] = {
                command: command,
                args: args,
                ...(Object.keys(env).length > 0 ? { env: env } : {})
            };
        }

        saveMcpServers(servers);
        if (typeof window.showUserScreenToast === 'function') {
            window.showUserScreenToast(`MCP server "${name}" saved!`, 2000);
        }
        switchView('list');
    }

    function validateJson() {
        const ta = document.getElementById('mcp-raw-json-textarea');
        const statusEl = document.getElementById('mcp-json-status');
        if (!ta || !statusEl) return true;

        const val = ta.value.trim();
        if (!val) {
            statusEl.innerHTML = '';
            return true;
        }

        try {
            const parsed = JSON.parse(val);
            if (typeof parsed !== 'object' || parsed === null) throw new Error("Must be an object");
            statusEl.innerHTML = '<span style="color: #22c55e;">✔ Valid</span>';
            return true;
        } catch(e) {
            statusEl.innerHTML = `<span style="color: #ef4444;" title="${e.message}">✖ Invalid</span>`;
            return false;
        }
    }

    function saveJsonAndClose() {
        const ta = document.getElementById('mcp-raw-json-textarea');
        if (!ta) return;

        if (!validateJson()) {
            if (typeof window.showUserScreenToast === 'function') {
                window.showUserScreenToast('Cannot save: Invalid JSON syntax', 3000, true);
            }
            return;
        }

        try {
            const val = ta.value.trim();
            const parsed = val ? JSON.parse(val) : {};
            const servers = parsed.mcpServers ? parsed.mcpServers : parsed;
            if (saveMcpServers(servers)) {
                if (typeof window.showUserScreenToast === 'function') {
                    window.showUserScreenToast('MCP configuration saved', 2000);
                }
                switchView('list');
            }
        } catch(e) {
            if (typeof window.showUserScreenToast === 'function') {
                window.showUserScreenToast(`Save error: ${e.message}`, 3000, true);
            }
        }
    }

    function openMcpManager() {
        const modal = document.getElementById('mcp-manager-modal');
        if (!modal) return;
        modal.style.display = 'flex';
        switchView('list');
    }

    function closeMcpManager() {
        const modal = document.getElementById('mcp-manager-modal');
        if (!modal) return;
        modal.style.display = 'none';
    }

    // Expose globals
    window.openMcpManager = openMcpManager;
    window.closeMcpManager = closeMcpManager;
    window.loadMcpServers = loadMcpServers;
    window.saveMcpServers = saveMcpServers;

    function initMcpUI() {
        const mcpBtn = document.getElementById('win-mcp-btn');
        if (mcpBtn) mcpBtn.onclick = () => openMcpManager();

        const closeX = document.getElementById('close-mcp-modal-x');
        const closeBtn = document.getElementById('close-mcp-modal-btn');
        if (closeX) closeX.onclick = () => closeMcpManager();
        if (closeBtn) closeBtn.onclick = () => closeMcpManager();

        const backBtn = document.getElementById('mcp-form-back-btn');
        if (backBtn) backBtn.onclick = () => switchView('list');

        const listTabBtn = document.getElementById('mcp-tab-list-btn');
        const jsonTabBtn = document.getElementById('mcp-tab-json-btn');
        if (listTabBtn) listTabBtn.onclick = () => switchView('list');
        if (jsonTabBtn) jsonTabBtn.onclick = () => switchView('json');

        const addTopBtn = document.getElementById('mcp-open-add-btn');
        if (addTopBtn) addTopBtn.onclick = () => openRegisterForm();

        const emptyAddBtn = document.getElementById('mcp-empty-add-btn');
        if (emptyAddBtn) emptyAddBtn.onclick = () => openRegisterForm();

        const formCancelBtn = document.getElementById('mcp-form-cancel-btn');
        const formSaveBtn = document.getElementById('mcp-form-save-btn');
        if (formCancelBtn) formCancelBtn.onclick = () => switchView('list');
        if (formSaveBtn) formSaveBtn.onclick = () => saveRegisterForm();

        const typeSse = document.getElementById('mcp-type-sse');
        const typeStdio = document.getElementById('mcp-type-stdio');
        if (typeSse) typeSse.onchange = () => updateFormTypeFields();
        if (typeStdio) typeStdio.onchange = () => updateFormTypeFields();

        const jsonSaveBtn = document.getElementById('mcp-json-save-btn');
        const formatBtn = document.getElementById('mcp-format-btn');
        const ta = document.getElementById('mcp-raw-json-textarea');
        if (jsonSaveBtn) jsonSaveBtn.onclick = () => saveJsonAndClose();
        if (formatBtn && ta) {
            formatBtn.onclick = () => {
                try {
                    const p = JSON.parse(ta.value);
                    ta.value = JSON.stringify(p, null, 2);
                    validateJson();
                } catch(e) {}
            };
        }
        if (ta) {
            ta.oninput = () => validateJson();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMcpUI);
    } else {
        initMcpUI();
    }
})();
