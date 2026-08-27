/**
 * Clean & Minimal MCP Server Manager
 * Synchronizes MCP servers in Settings.json (Claude Desktop compatible)
 */

(function() {
    const TEMPLATES = {
        sqlite: {
            command: "uvx",
            args: ["mcp-server-sqlite", "--db-path", "data.db"]
        },
        fetch: {
            command: "uvx",
            args: ["mcp-server-fetch"]
        },
        filesystem: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem", "./"]
        },
        github: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
            env: {
                GITHUB_PERSONAL_ACCESS_TOKEN: "YOUR_TOKEN"
            }
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

    function validateJson() {
        const ta = document.getElementById('mcp-raw-json-textarea');
        const statusEl = document.getElementById('mcp-json-status');
        if (!ta || !statusEl) return true;

        const val = ta.value.trim();
        if (!val) {
            statusEl.innerHTML = '<span style="color: var(--text-muted);">Empty</span>';
            return true;
        }

        try {
            const parsed = JSON.parse(val);
            if (typeof parsed !== 'object' || parsed === null) throw new Error("Must be an object");
            statusEl.innerHTML = '<span style="color: #22c55e;">✔ Valid</span>';
            return true;
        } catch(e) {
            statusEl.innerHTML = `<span style="color: #ef4444;" title="${e.message}">✖ Syntax Error</span>`;
            return false;
        }
    }

    function openMcpManager() {
        const modal = document.getElementById('mcp-manager-modal');
        const ta = document.getElementById('mcp-raw-json-textarea');
        if (!modal) return;

        const servers = loadMcpServers();
        if (ta) {
            ta.value = JSON.stringify({ mcpServers: servers }, null, 2);
        }
        validateJson();
        modal.style.display = 'flex';
    }

    function closeMcpManager() {
        const modal = document.getElementById('mcp-manager-modal');
        if (!modal) return;
        modal.style.display = 'none';
    }

    function saveAndClose() {
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
                closeMcpManager();
            }
        } catch(e) {
            if (typeof window.showUserScreenToast === 'function') {
                window.showUserScreenToast(`Save error: ${e.message}`, 3000, true);
            }
        }
    }

    function insertTemplate(key) {
        const tpl = TEMPLATES[key];
        if (!tpl) return;
        const ta = document.getElementById('mcp-raw-json-textarea');
        if (!ta) return;

        let obj = { mcpServers: {} };
        try {
            const parsed = JSON.parse(ta.value.trim() || '{}');
            if (parsed.mcpServers && typeof parsed.mcpServers === 'object') {
                obj = parsed;
            } else if (typeof parsed === 'object') {
                obj = { mcpServers: parsed };
            }
        } catch(e) {}

        let name = key;
        let c = 1;
        while (obj.mcpServers[name]) {
            c++;
            name = `${key}_${c}`;
        }
        obj.mcpServers[name] = tpl;
        ta.value = JSON.stringify(obj, null, 2);
        validateJson();
        if (typeof window.showUserScreenToast === 'function') {
            window.showUserScreenToast(`Inserted "${name}" template`, 1800);
        }
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

        const saveBtn = document.getElementById('save-mcp-modal-btn');
        if (saveBtn) saveBtn.onclick = () => saveAndClose();

        const formatBtn = document.getElementById('mcp-format-btn');
        const ta = document.getElementById('mcp-raw-json-textarea');
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

        document.querySelectorAll('.mcp-quick-tpl-btn').forEach(btn => {
            btn.onclick = () => insertTemplate(btn.dataset.tpl);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMcpUI);
    } else {
        initMcpUI();
    }
})();
