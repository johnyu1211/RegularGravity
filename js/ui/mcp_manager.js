/**
 * MCP Server Manager (Model Context Protocol)
 * Manages MCP servers configuration in Settings.json (Claude Desktop compatible format)
 */

(function() {
    const PRESETS = {
        sqlite: {
            name: "sqlite",
            command: "uvx",
            args: ["mcp-server-sqlite", "--db-path", "data.db"],
            env: {},
            description: "SQLite Database query and schema inspection"
        },
        fetch: {
            name: "fetch",
            command: "uvx",
            args: ["mcp-server-fetch"],
            env: {},
            description: "Web content fetching and markdown conversion"
        },
        filesystem: {
            name: "filesystem",
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem", "./"],
            env: {},
            description: "Local filesystem access for reading and writing files"
        },
        github: {
            name: "github",
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
            env: { "GITHUB_PERSONAL_ACCESS_TOKEN": "YOUR_TOKEN" },
            description: "GitHub API integration (Issues, PRs, Repos)"
        },
        memory: {
            name: "memory",
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-memory"],
            env: {},
            description: "Knowledge graph based persistent memory"
        }
    };

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
            console.error("[MCP] Failed to load MCP servers:", e);
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
            updateMcpTitlebarBadge();
            return true;
        } catch(e) {
            console.error("[MCP] Failed to save MCP servers:", e);
            if (typeof window.showUserScreenToast === 'function') {
                window.showUserScreenToast(`Failed to save MCP config: ${e.message}`, 3500, true);
            }
            return false;
        }
    }

    function updateMcpTitlebarBadge() {
        const servers = loadMcpServers();
        const badge = document.getElementById('titlebar-mcp-count');
        if (!badge) return;
        const total = Object.keys(servers).length;
        const active = Object.values(servers).filter(s => s && s.disabled !== true).length;
        
        if (total > 0) {
            badge.style.display = 'inline-flex';
            badge.innerText = active > 0 ? `${active}` : '0';
            badge.title = `${active}/${total} MCP Servers active`;
            if (active > 0) {
                badge.style.background = 'rgba(70, 140, 246, 0.2)';
                badge.style.color = '#468CF6';
            } else {
                badge.style.background = 'rgba(255, 255, 255, 0.08)';
                badge.style.color = 'var(--text-muted)';
            }
        } else {
            badge.style.display = 'none';
        }
    }

    let currentEditingKey = null;
    let currentView = 'list'; // 'list' | 'form' | 'json'

    function renderMcpListView() {
        const listEl = document.getElementById('mcp-servers-list');
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
            const cmdStr = `${server.command || ''} ${(server.args || []).join(' ')}`.trim();
            const envKeys = server.env ? Object.keys(server.env) : [];

            const card = document.createElement('div');
            card.className = 'mcp-server-card';
            card.style = `
                background: var(--surface-low, rgba(255,255,255,0.03));
                border: 1px solid ${isDisabled ? 'var(--border-color)' : 'rgba(70, 140, 246, 0.3)'};
                border-radius: 10px;
                padding: 14px 16px;
                display: flex;
                flex-direction: column;
                gap: 10px;
                transition: all 0.2s ease;
            `;

            card.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${isDisabled ? '#666' : '#22c55e'}; box-shadow: ${isDisabled ? 'none' : '0 0 8px rgba(34, 197, 94, 0.5)'};"></span>
                        <span style="font-size: 13px; font-weight: 700; color: ${isDisabled ? 'var(--text-muted)' : '#fff'}; letter-spacing: 0.3px;">${key}</span>
                        ${isDisabled ? '<span style="font-size: 10px; padding: 2px 6px; background: rgba(255,255,255,0.06); border-radius: 4px; color: var(--text-muted);">Disabled</span>' : '<span style="font-size: 10px; padding: 2px 6px; background: rgba(70,140,246,0.15); border-radius: 4px; color: #468CF6;">Active</span>'}
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <!-- Toggle Switch -->
                        <label class="mcp-toggle-switch" style="position: relative; display: inline-block; width: 34px; height: 18px; margin-right: 4px;">
                            <input type="checkbox" class="mcp-server-toggle-cb" data-key="${key}" ${isDisabled ? '' : 'checked'} style="opacity: 0; width: 0; height: 0;">
                            <span class="mcp-slider" style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: ${isDisabled ? '#3a3a40' : '#468CF6'}; transition: 0.2s; border-radius: 18px;"></span>
                        </label>
                        <!-- Edit Button -->
                        <button class="mcp-card-btn mcp-edit-btn" data-key="${key}" title="Edit Server" style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 5px; border-radius: 4px; display: flex; align-items: center; justify-content: center; transition: all 0.2s;">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <!-- Delete Button -->
                        <button class="mcp-card-btn mcp-delete-btn" data-key="${key}" title="Delete Server" style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 5px; border-radius: 4px; display: flex; align-items: center; justify-content: center; transition: all 0.2s;">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                </div>

                <!-- Command line preview -->
                <div style="background: rgba(0,0,0,0.3); padding: 6px 10px; border-radius: 6px; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: ${isDisabled ? '#666' : '#cbd5e1'}; overflow-x: auto; white-space: nowrap;">
                    <span style="color: #468CF6; user-select: none;">$ </span>${cmdStr || '(no command specified)'}
                </div>

                ${envKeys.length > 0 ? `
                    <div style="display: flex; flex-wrap: wrap; gap: 4px; align-items: center;">
                        <span style="font-size: 10px; color: var(--text-muted);">ENV:</span>
                        ${envKeys.map(k => `<span style="font-size: 9.5px; padding: 1px 6px; background: rgba(255,255,255,0.05); border-radius: 4px; font-family: 'JetBrains Mono', monospace; color: #a5b4fc;">${k}</span>`).join('')}
                    </div>
                ` : ''}
            `;

            // Bind toggle switch
            const toggleCb = card.querySelector('.mcp-server-toggle-cb');
            if (toggleCb) {
                toggleCb.onchange = (e) => {
                    const k = e.target.dataset.key;
                    const all = loadMcpServers();
                    if (all[k]) {
                        all[k].disabled = !e.target.checked;
                        saveMcpServers(all);
                        renderMcpListView();
                        if (typeof window.showUserScreenToast === 'function') {
                            window.showUserScreenToast(`MCP "${k}" ${e.target.checked ? 'enabled' : 'disabled'}`, 2000);
                        }
                    }
                };
            }

            // Bind edit button
            const editBtn = card.querySelector('.mcp-edit-btn');
            if (editBtn) {
                editBtn.onclick = () => openMcpForm(key);
            }

            // Bind delete button
            const deleteBtn = card.querySelector('.mcp-delete-btn');
            if (deleteBtn) {
                deleteBtn.onclick = async () => {
                    const confirmed = typeof showConfirm === 'function' 
                        ? await showConfirm(`Are you sure you want to remove MCP server "${key}"?`)
                        : confirm(`Delete MCP server "${key}"?`);
                    if (confirmed) {
                        const all = loadMcpServers();
                        delete all[key];
                        saveMcpServers(all);
                        renderMcpListView();
                        if (typeof window.showUserScreenToast === 'function') {
                            window.showUserScreenToast(`Removed MCP server "${key}"`, 2500);
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
        const tabList = document.getElementById('mcp-tab-list');
        const tabJson = document.getElementById('mcp-tab-json');
        const addBtn = document.getElementById('mcp-top-add-btn');

        if (listView) listView.style.display = (viewName === 'list') ? 'flex' : 'none';
        if (formView) formView.style.display = (viewName === 'form') ? 'flex' : 'none';
        if (jsonView) jsonView.style.display = (viewName === 'json') ? 'flex' : 'none';

        if (tabList) {
            tabList.style.color = (viewName === 'list') ? '#fff' : 'var(--text-muted)';
            tabList.style.borderBottom = (viewName === 'list') ? '2px solid var(--primary, #468CF6)' : '2px solid transparent';
        }
        if (tabJson) {
            tabJson.style.color = (viewName === 'json') ? '#fff' : 'var(--text-muted)';
            tabJson.style.borderBottom = (viewName === 'json') ? '2px solid var(--primary, #468CF6)' : '2px solid transparent';
        }
        if (addBtn) {
            addBtn.style.display = (viewName === 'list') ? 'inline-flex' : 'none';
        }

        if (viewName === 'list') {
            renderMcpListView();
        } else if (viewName === 'json') {
            const ta = document.getElementById('mcp-raw-json-textarea');
            if (ta) {
                const servers = loadMcpServers();
                ta.value = JSON.stringify({ mcpServers: servers }, null, 2);
                validateJsonView();
            }
        }
    }

    function openMcpForm(editingKey = null) {
        currentEditingKey = editingKey;
        const formTitle = document.getElementById('mcp-form-title');
        const nameInput = document.getElementById('mcp-form-name');
        const cmdInput = document.getElementById('mcp-form-command');
        const argsInput = document.getElementById('mcp-form-args');
        const envInput = document.getElementById('mcp-form-env');
        const disabledInput = document.getElementById('mcp-form-disabled');

        if (editingKey) {
            const servers = loadMcpServers();
            const server = servers[editingKey] || {};
            if (formTitle) formTitle.innerText = `EDIT MCP SERVER: ${editingKey}`;
            if (nameInput) { nameInput.value = editingKey; nameInput.disabled = true; }
            if (cmdInput) cmdInput.value = server.command || '';
            if (argsInput) argsInput.value = (server.args || []).join(' ');
            if (envInput) {
                const lines = Object.entries(server.env || {}).map(([k, v]) => `${k}=${v}`);
                envInput.value = lines.join('\n');
            }
            if (disabledInput) disabledInput.checked = server.disabled === true;
        } else {
            if (formTitle) formTitle.innerText = 'ADD NEW MCP SERVER';
            if (nameInput) { nameInput.value = ''; nameInput.disabled = false; }
            if (cmdInput) cmdInput.value = '';
            if (argsInput) argsInput.value = '';
            if (envInput) envInput.value = '';
            if (disabledInput) disabledInput.checked = false;
        }

        switchView('form');
        setTimeout(() => {
            if (editingKey) {
                if (cmdInput) cmdInput.focus();
            } else {
                if (nameInput) nameInput.focus();
            }
        }, 100);
    }

    function saveMcpForm() {
        const nameInput = document.getElementById('mcp-form-name');
        const cmdInput = document.getElementById('mcp-form-command');
        const argsInput = document.getElementById('mcp-form-args');
        const envInput = document.getElementById('mcp-form-env');
        const disabledInput = document.getElementById('mcp-form-disabled');

        const name = (nameInput?.value || '').trim();
        const command = (cmdInput?.value || '').trim();

        if (!name) {
            if (typeof window.showUserScreenToast === 'function') {
                window.showUserScreenToast('Please enter a server name.', 3000, true);
            } else {
                alert('Please enter a server name.');
            }
            if (nameInput) nameInput.focus();
            return;
        }

        if (!command) {
            if (typeof window.showUserScreenToast === 'function') {
                window.showUserScreenToast('Please enter an executable command (e.g. uvx, npx, python).', 3000, true);
            } else {
                alert('Please enter an executable command.');
            }
            if (cmdInput) cmdInput.focus();
            return;
        }

        // Parse args
        const rawArgs = (argsInput?.value || '').trim();
        const args = rawArgs ? rawArgs.match(/(?:[^\s"]+|"[^"]*")+/g).map(s => s.replace(/^"|"$/g, '')) : [];

        // Parse env
        const rawEnv = (envInput?.value || '').trim();
        const env = {};
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

        const servers = loadMcpServers();
        servers[name] = {
            command: command,
            args: args,
            ...(Object.keys(env).length > 0 ? { env: env } : {}),
            ...(disabledInput?.checked ? { disabled: true } : {})
        };

        saveMcpServers(servers);
        if (typeof window.showUserScreenToast === 'function') {
            window.showUserScreenToast(`MCP Server "${name}" saved!`, 2500);
        }
        switchView('list');
    }

    function addPreset(presetKey) {
        const preset = PRESETS[presetKey];
        if (!preset) return;
        const servers = loadMcpServers();
        let targetName = preset.name;
        let counter = 1;
        while (servers[targetName]) {
            counter++;
            targetName = `${preset.name}_${counter}`;
        }

        servers[targetName] = {
            command: preset.command,
            args: [...preset.args],
            ...(Object.keys(preset.env || {}).length > 0 ? { env: { ...preset.env } } : {})
        };

        saveMcpServers(servers);
        renderMcpListView();
        if (typeof window.showUserScreenToast === 'function') {
            window.showUserScreenToast(`Added "${targetName}" preset!`, 2500);
        }
    }

    function validateJsonView() {
        const ta = document.getElementById('mcp-raw-json-textarea');
        const statusEl = document.getElementById('mcp-json-status');
        if (!ta || !statusEl) return true;

        try {
            const parsed = JSON.parse(ta.value);
            if (typeof parsed !== 'object' || parsed === null) throw new Error("Root must be an object");
            statusEl.innerHTML = '<span style="color: #22c55e;">✔ Valid JSON format</span>';
            return true;
        } catch(e) {
            statusEl.innerHTML = `<span style="color: #ef4444;">✖ JSON Syntax Error: ${e.message}</span>`;
            return false;
        }
    }

    function saveJsonView() {
        const ta = document.getElementById('mcp-raw-json-textarea');
        if (!ta) return;
        if (!validateJsonView()) {
            if (typeof window.showUserScreenToast === 'function') {
                window.showUserScreenToast('Cannot save: Invalid JSON syntax.', 3000, true);
            }
            return;
        }

        try {
            const parsed = JSON.parse(ta.value);
            const servers = parsed.mcpServers || parsed;
            saveMcpServers(servers);
            if (typeof window.showUserScreenToast === 'function') {
                window.showUserScreenToast('MCP configuration saved successfully!', 2500);
            }
            switchView('list');
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
    window.updateMcpTitlebarBadge = updateMcpTitlebarBadge;

    // Initialization on DOMContentLoaded
    function initMcpManagerUI() {
        const mcpBtn = document.getElementById('win-mcp-btn');
        if (mcpBtn) {
            mcpBtn.onclick = () => openMcpManager();
        }

        const closeBtn = document.getElementById('close-mcp-modal-x');
        const footerCloseBtn = document.getElementById('close-mcp-modal-btn');
        if (closeBtn) closeBtn.onclick = () => closeMcpManager();
        if (footerCloseBtn) footerCloseBtn.onclick = () => closeMcpManager();

        const tabList = document.getElementById('mcp-tab-list');
        const tabJson = document.getElementById('mcp-tab-json');
        if (tabList) tabList.onclick = () => switchView('list');
        if (tabJson) tabJson.onclick = () => switchView('json');

        const topAddBtn = document.getElementById('mcp-top-add-btn');
        if (topAddBtn) topAddBtn.onclick = () => openMcpForm();

        const formCancelBtn = document.getElementById('mcp-form-cancel-btn');
        const formSaveBtn = document.getElementById('mcp-form-save-btn');
        if (formCancelBtn) formCancelBtn.onclick = () => switchView('list');
        if (formSaveBtn) formSaveBtn.onclick = () => saveMcpForm();

        const jsonSaveBtn = document.getElementById('mcp-json-save-btn');
        const jsonFormatBtn = document.getElementById('mcp-json-format-btn');
        const jsonTextarea = document.getElementById('mcp-raw-json-textarea');
        if (jsonSaveBtn) jsonSaveBtn.onclick = () => saveJsonView();
        if (jsonFormatBtn && jsonTextarea) {
            jsonFormatBtn.onclick = () => {
                try {
                    const parsed = JSON.parse(jsonTextarea.value);
                    jsonTextarea.value = JSON.stringify(parsed, null, 2);
                    validateJsonView();
                } catch(e) {}
            };
        }
        if (jsonTextarea) {
            jsonTextarea.oninput = () => validateJsonView();
        }

        // Preset buttons
        document.querySelectorAll('.mcp-preset-chip').forEach(chip => {
            chip.onclick = () => {
                const key = chip.dataset.preset;
                if (key) addPreset(key);
            };
        });

        // Search input
        const searchInput = document.getElementById('mcp-search-input');
        if (searchInput) {
            searchInput.oninput = () => {
                const q = searchInput.value.toLowerCase().trim();
                document.querySelectorAll('.mcp-server-card').forEach(card => {
                    const text = card.innerText.toLowerCase();
                    card.style.display = (!q || text.includes(q)) ? 'flex' : 'none';
                });
            };
        }

        updateMcpTitlebarBadge();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMcpManagerUI);
    } else {
        initMcpManagerUI();
    }
})();
