/**
 * MCP Bridge & Tool Discovery for Regular Gravity
 * Reads tool definitions from ~/.gemini/antigravity/mcp/<serverName> and standard locations.
 * Generates structured Markdown tool bundles when AI requests [CMD: mcp-list server="..."]
 */

(function() {
    function getMcpServerTools(serverName) {
        if (typeof window.require === 'undefined') return null;
        const fs = window.require('fs');
        const path = window.require('path');
        const os = window.require('os');

        if (!fs || !path || !os) return null;

        const home = os.homedir();
        const candidateDirs = [
            path.join(home, '.gemini', 'antigravity', 'mcp', serverName),
            path.join(home, '.gemini', 'config', 'mcp', serverName),
            path.join(home, '.gemini', 'mcp', serverName),
            path.join(home, '.gemini', 'antigravity-ide', 'mcp', serverName)
        ];

        let targetDir = null;
        for (const dir of candidateDirs) {
            if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
                targetDir = dir;
                break;
            }
        }

        if (!targetDir) {
            return null;
        }

        const files = fs.readdirSync(targetDir);
        const tools = [];

        files.forEach(file => {
            if (file.endsWith('.json')) {
                try {
                    const raw = JSON.parse(fs.readFileSync(path.join(targetDir, file), 'utf-8'));
                    if (raw && raw.name) {
                        tools.push(raw);
                    }
                } catch(e) {}
            }
        });

        return tools;
    }

    function generateMcpToolsMarkdown(serverName) {
        const tools = getMcpServerTools(serverName);
        if (!tools || tools.length === 0) {
            return `# MCP Tools for "${serverName}"\n\nNo pre-indexed tool schemas found for server "${serverName}". Please verify that this server is running and configured correctly.`;
        }

        let md = `# MCP Tool Directory: [Server: "${serverName}"]\n`;
        md += `Total available tools: ${tools.length}\n\n`;
        md += `## Instructions:\n`;
        md += `To execute any of these tools, output:\n`;
        md += `[CMD: mcp-call server="${serverName}" tool="<tool_name>" args='{"<param_name>": <param_value>}']\n\n`;
        md += `--------------------------------------------------------------------------------\n\n`;

        tools.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        tools.forEach((t, i) => {
            md += `### ${i + 1}. \`${t.name}\`\n`;
            if (t.description) {
                md += `**Description**: ${t.description.trim()}\n`;
            }
            if (t.parameters && t.parameters.properties) {
                const required = Array.isArray(t.parameters.required) ? t.parameters.required : [];
                const props = t.parameters.properties;
                const propEntries = Object.entries(props);
                if (propEntries.length > 0) {
                    md += `**Parameters**:\n`;
                    propEntries.forEach(([propName, propDef]) => {
                        const isReq = required.includes(propName) ? ' *(required)*' : ' *(optional)*';
                        const typeStr = propDef.type ? `\`${propDef.type}\`` : '`any`';
                        const descStr = propDef.description ? ` - ${propDef.description}` : '';
                        md += `  - \`${propName}\` (${typeStr}${isReq})${descStr}\n`;
                    });
                } else {
                    md += `**Parameters**: None (empty object \`{}\`)\n`;
                }
            } else {
                md += `**Parameters**: None (empty object \`{}\`)\n`;
            }
            md += `\n`;
        });

        return md;
    }

    async function executeMcpList(serverName) {
        if (!serverName) {
            if (typeof window.showUserScreenToast === 'function') {
                window.showUserScreenToast('MCP server name required', 2500, true);
            }
            return;
        }

        const mdContent = generateMcpToolsMarkdown(serverName);
        const subDir = (typeof window.getSendingMdSubDir === 'function') ? window.getSendingMdSubDir() : 'gravity_vault/SendingMD';
        const baseFileName = path ? path.join(subDir, `_mcp_tools_${serverName}.md`) : `_mcp_tools_${serverName}.md`;

        const payload = await window.prepareFilePayload(baseFileName, mdContent);

        if (typeof window.refreshTree === 'function') {
            window.refreshTree();
        }

        window.requestedFilesQueue = [{
            absolutePath: payload.absolutePath,
            relativePath: payload.relativePath,
            status: 'PENDING'
        }];

        try {
            if (typeof window.injectGuestDropInterceptor === 'function') {
                window.injectGuestDropInterceptor();
            }
        } catch(e) {}

        const cleanupDragDrop = () => {
            if (window.activeDragDropCleanup === cleanupDragDrop) {
                window.activeDragDropCleanup = null;
                window.activeDragDropContinue = null;
            }
            window.dragDropMode = false;
            window.requestedFilesQueue = [];
            if (typeof window.updateDragDropQueueUI === 'function') {
                window.updateDragDropQueueUI();
            }
        };

        window.activeDragDropCleanup = cleanupDragDrop;
        window.activeDragDropContinue = async () => {};
        window.dragDropMode = true;

        if (typeof window.updateDragDropQueueUI === 'function') {
            window.updateDragDropQueueUI();
        }

        if (typeof ChatUI !== 'undefined' && typeof ChatUI.appendBubble === 'function') {
            ChatUI.appendBubble('system', `[MCP] Tool directory for "${serverName}" generated. Drag and drop into AI chat.`);
        }
        if (typeof window.showUserScreenToast === 'function') {
            window.showUserScreenToast(`MCP Tools for "${serverName}" ready in Drag & Drop Sheet`, 3500);
        }
    }

    window.getMcpServerTools = getMcpServerTools;
    window.generateMcpToolsMarkdown = generateMcpToolsMarkdown;
    window.executeMcpList = executeMcpList;
})();
