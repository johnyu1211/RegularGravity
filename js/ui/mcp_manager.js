/**
 * MCP Server Manager (Model Context Protocol)
 * Supports both SSE (URL/Port) and stdio (Command line) server configurations.
 * Saves to Settings.json (Claude Desktop & Standard MCP compatible).
 * Supports automatic 1-click import from Antigravity (~/.gemini/config/mcp_config.json).
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

    function importFromAntigravity() {
        const fs = require('fs');
        const path = require('path');
        const os = require('os');

        const home = os.homedir();
        const candidatePaths = [
            path.join(home, '.gemini', 'config', 'mcp_config.json'),
            path.join(home, '.gemini', 'antigravity-ide', 'mcp_config.json'),
            path.join(home, '.gemini', 'antigravity', 'mcp_config.json'),
            path.join(home, '.gemini', 'antigravity-backup', 'mcp_config.json'),
            path.join(process.env.APPDATA || '', 'Claude', 'claude_desktop_config.json'),
            path.join(home, '.cursor', 'mcp.json')
        ];

        let foundServers = null;

        for (const p of candidatePaths) {
            if (fs.existsSync(p)) {
                try {
                    const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
                    const s = raw.mcpServers || raw;
                    if (s && typeof s === 'object' && Object.keys(s).length > 0) {
                        foundServers = s;
                        break;
                    }
                } catch(e) {}
            }
        }

        if (!foundServers || Object.keys(foundServers).length === 0) {
            if (typeof window.showUserScreenToast === 'function') {
                window.showUserScreenToast('No Antigravity MCP configuration found.', 3000, true);
            }
            return;
        }

        const currentServers = loadMcpServers();
        let importedCount = 0;

        Object.keys(foundServers).forEach(key => {
            const entry = foundServers[key];
            if (entry && typeof entry === 'object') {
                const normalized = { ...entry };
                if (normalized.serverUrl && !normalized.url) {
                    normalized.url = normalized.serverUrl;
                    delete normalized.serverUrl;
                }
                currentServers[key] = normalized;
                importedCount++;
            }
        });

        saveMcpServers(currentServers);
        renderServerCards();

        if (typeof window.showUserScreenToast === 'function') {
            window.showUserScreenToast(`Imported ${importedCount} MCP servers from Antigravity!`, 2500);
        }
    }

    let currentEditingKey = null;
    let currentView = 'list'; // 'list' | 'form' | 'json'
    let currentFormType = 'sse'; // 'sse' | 'stdio'

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
                border: 1px solid var(--border-color);
                border-radius: 8px;
                padding: 10px 14px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                transition: all 0.2s ease;
            `;

            card.onmouseenter = () => {
                card.style.background = 'rgba(255, 255, 255, 0.06)';
            };
            card.onmouseleave = () => {
                card.style.background = 'rgba(255, 255, 255, 0.03)';
            };

            card.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 13px; font-weight: 700; color: ${isDisabled ? 'var(--text-muted)' : '#fff'}; letter-spacing: 0.2px;">${key}</span>
                        <span style="font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 4px; background: rgba(255, 255, 255, 0.08); color: var(--text-muted);">${isSSE ? 'SSE' : 'stdio'}</span>
                        ${isDisabled ? '<span style="font-size: 10px; color: var(--text-muted);">(Disabled)</span>' : ''}
                    </div>
                    <div style="font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${targetInfo || '(not specified)'}
                    </div>
                </div>

                <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                    <!-- Switch Toggle -->
                    <label class="switch-toggle" style="transform: scale(0.8); margin: 0;" title="${isDisabled ? 'Enable server' : 'Disable server'}">
                        <input type="checkbox" class="mcp-card-toggle" data-key="${key}" ${isDisabled ? '' : 'checked'}>
                        <span class="slider-toggle"></span>
                    </label>
                    <!-- Edit Button -->
                    <button class="mcp-card-edit-btn" data-key="${key}" title="Edit Server" style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 4px; border-radius: 4px; display: flex; align-items: center; justify-content: center; transition: color 0.2s;" onmouseenter="this.style.color='#fff';" onmouseleave="this.style.color='var(--text-muted)';">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>
                    <!-- Delete Button -->
                    <button class="mcp-card-del-btn" data-key="${key}" title="Delete Server" style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 4px; border-radius: 4px; display: flex; align-items: center; justify-content: center; transition: color 0.2s;" onmouseenter="this.style.color='#ef4444';" onmouseleave="this.style.color='var(--text-muted)';">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
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

        // Footer buttons
        const bringAntigravityBtn = document.getElementById('mcp-bring-antigravity-btn');
        const closeBtn = document.getElementById('close-mcp-modal-btn');
        const formCancelBtn = document.getElementById('mcp-form-cancel-btn');
        const formSaveBtn = document.getElementById('mcp-form-save-btn');
        const jsonSaveBtn = document.getElementById('mcp-json-save-btn');

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

        // Unified footer control based on view
        if (bringAntigravityBtn) bringAntigravityBtn.style.display = (viewName === 'list') ? 'inline-block' : 'none';
        if (closeBtn) closeBtn.style.display = (viewName === 'list' || viewName === 'json') ? 'inline-block' : 'none';
        if (formCancelBtn) formCancelBtn.style.display = (viewName === 'form') ? 'inline-block' : 'none';
        if (formSaveBtn) formSaveBtn.style.display = (viewName === 'form') ? 'inline-block' : 'none';
        if (jsonSaveBtn) jsonSaveBtn.style.display = (viewName === 'json') ? 'inline-block' : 'none';

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

    function setFormType(type) {
        currentFormType = type;
        const btnSse = document.getElementById('mcp-type-btn-sse');
        const btnStdio = document.getElementById('mcp-type-btn-stdio');
        const sseSection = document.getElementById('mcp-form-sse-section');
        const stdioSection = document.getElementById('mcp-form-stdio-section');

        if (type === 'sse') {
            if (btnSse) {
                btnSse.style.background = 'rgba(255, 255, 255, 0.12)';
                btnSse.style.color = '#fff';
            }
            if (btnStdio) {
                btnStdio.style.background = 'transparent';
                btnStdio.style.color = 'var(--text-muted)';
            }
            if (sseSection) sseSection.style.display = 'flex';
            if (stdioSection) stdioSection.style.display = 'none';
        } else {
            if (btnSse) {
                btnSse.style.background = 'transparent';
                btnSse.style.color = 'var(--text-muted)';
            }
            if (btnStdio) {
                btnStdio.style.background = 'rgba(255, 255, 255, 0.12)';
                btnStdio.style.color = '#fff';
            }
            if (sseSection) sseSection.style.display = 'none';
            if (stdioSection) stdioSection.style.display = 'flex';
        }
    }

    function openRegisterForm(editingKey = null) {
        currentEditingKey = editingKey;
        const nameInput = document.getElementById('mcp-form-name');
        const urlInput = document.getElementById('mcp-form-url');
        const cmdInput = document.getElementById('mcp-form-command');
        const argsInput = document.getElementById('mcp-form-args');
        const envInput = document.getElementById('mcp-form-env');

        if (editingKey) {
            const servers = loadMcpServers();
            const server = servers[editingKey] || {};
            if (nameInput) { nameInput.value = editingKey; nameInput.disabled = true; }

            const isSSE = !!server.url;
            setFormType(isSSE ? 'sse' : 'stdio');

            if (urlInput) urlInput.value = server.url || '';
            if (cmdInput) cmdInput.value = server.command || '';
            if (argsInput) argsInput.value = (server.args || []).join(' ');
            if (envInput) {
                const lines = Object.entries(server.env || {}).map(([k, v]) => `${k}=${v}`);
                envInput.value = lines.join('\n');
            }
        } else {
            if (nameInput) { nameInput.value = ''; nameInput.disabled = false; }
            setFormType('sse');
            if (urlInput) urlInput.value = 'http://localhost:8000/sse';
            if (cmdInput) cmdInput.value = '';
            if (argsInput) argsInput.value = '';
            if (envInput) envInput.value = '';
        }

        switchView('form');
        setTimeout(() => {
            if (!editingKey && nameInput) nameInput.focus();
            else if (urlInput && currentFormType === 'sse') urlInput.focus();
        }, 100);
    }

    function saveRegisterForm() {
        const nameInput = document.getElementById('mcp-form-name');
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

        if (currentFormType === 'sse') {
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
    window.importFromAntigravity = importFromAntigravity;

    function initMcpUI() {
        const mcpBtn = document.getElementById('win-mcp-btn');
        if (mcpBtn) mcpBtn.onclick = () => openMcpManager();

        const closeX = document.getElementById('close-mcp-modal-x');
        const closeBtn = document.getElementById('close-mcp-modal-btn');
        if (closeX) closeX.onclick = () => closeMcpManager();
        if (closeBtn) closeBtn.onclick = () => closeMcpManager();

        const bringAntigravityBtn = document.getElementById('mcp-bring-antigravity-btn');
        if (bringAntigravityBtn) bringAntigravityBtn.onclick = () => importFromAntigravity();

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

        const btnSse = document.getElementById('mcp-type-btn-sse');
        const btnStdio = document.getElementById('mcp-type-btn-stdio');
        if (btnSse) btnSse.onclick = () => setFormType('sse');
        if (btnStdio) btnStdio.onclick = () => setFormType('stdio');

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
