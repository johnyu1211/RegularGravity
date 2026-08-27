/**
 * MCP Client Execution Engine for Regular Gravity
 * Handles JSON-RPC 2.0 communication over Stdio and SSE/HTTP with registered MCP servers.
 */

(function() {
    const fs = (typeof window.require !== 'undefined') ? window.require('fs') : null;
    const path = (typeof window.require !== 'undefined') ? window.require('path') : null;
    const { spawn } = (typeof window.require !== 'undefined') ? window.require('child_process') : {};

    function getRegisteredServer(serverName) {
        let servers = {};
        if (typeof window.loadMcpServers === 'function') {
            servers = window.loadMcpServers();
        } else if (fs && path) {
            const root = window.appRootPath || (typeof process !== 'undefined' ? process.cwd() : '.');
            const p = path.join(root, 'Settings.json');
            if (fs.existsSync(p)) {
                try { servers = JSON.parse(fs.readFileSync(p, 'utf-8')).mcpServers || {}; } catch(e) {}
            }
        }
        return servers[serverName] || null;
    }

    /**
     * Executes an MCP tool via stdio transport
     */
    function callStdioTool(serverConfig, toolName, toolArgs = {}, timeoutMs = 25000) {
        return new Promise((resolve, reject) => {
            if (!spawn) {
                return reject(new Error("child_process.spawn is not available in this environment."));
            }

            const cmd = serverConfig.command;
            const args = serverConfig.args || [];
            const env = { ...process.env, ...(serverConfig.env || {}) };

            let proc;
            try {
                proc = spawn(cmd, args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
            } catch(err) {
                return reject(new Error(`Failed to spawn MCP process: ${err.message}`));
            }

            let stdoutBuffer = '';
            let isInitialized = false;
            let timer = null;

            const cleanup = () => {
                if (timer) clearTimeout(timer);
                if (proc && !proc.killed) {
                    try { proc.kill(); } catch(e) {}
                }
            };

            timer = setTimeout(() => {
                cleanup();
                reject(new Error(`MCP Tool call "${toolName}" timed out after ${timeoutMs / 1000}s`));
            }, timeoutMs);

            proc.on('error', (err) => {
                cleanup();
                reject(err);
            });

            proc.stdout.on('data', (data) => {
                stdoutBuffer += data.toString();
                const lines = stdoutBuffer.split('\n');
                stdoutBuffer = lines.pop(); // keep partial remainder

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;

                    try {
                        const msg = JSON.parse(trimmed);

                        // 1. Initialized handshake
                        if (msg.id === 1 && !isInitialized) {
                            isInitialized = true;
                            // Send initialized notification
                            proc.stdin.write(JSON.stringify({
                                jsonrpc: "2.0",
                                method: "notifications/initialized"
                            }) + '\n');

                            // Send actual tool call
                            proc.stdin.write(JSON.stringify({
                                jsonrpc: "2.0",
                                id: 2,
                                method: "tools/call",
                                params: {
                                    name: toolName,
                                    arguments: toolArgs || {}
                                }
                            }) + '\n');
                        }
                        // 2. Tool response
                        else if (msg.id === 2) {
                            cleanup();
                            if (msg.error) {
                                return resolve({
                                    success: false,
                                    error: msg.error.message || JSON.stringify(msg.error),
                                    raw: msg
                                });
                            }

                            const result = msg.result || {};
                            let textContent = '';
                            if (Array.isArray(result.content)) {
                                textContent = result.content.map(c => c.text || '').join('\n');
                            } else if (typeof result === 'string') {
                                textContent = result;
                            } else {
                                textContent = JSON.stringify(result, null, 2);
                            }

                            const isError = result.isError === true;
                            resolve({
                                success: !isError,
                                contentText: textContent,
                                result: result,
                                raw: msg
                            });
                        }
                    } catch(e) {
                        // ignore non-JSON logging output
                    }
                }
            });

            // Initiate JSON-RPC 2.0 handshake
            const initPayload = {
                jsonrpc: "2.0",
                id: 1,
                method: "initialize",
                params: {
                    protocolVersion: "2024-11-05",
                    capabilities: {},
                    clientInfo: { name: "RegularGravity", version: "1.0.0" }
                }
            };

            try {
                proc.stdin.write(JSON.stringify(initPayload) + '\n');
            } catch(e) {
                cleanup();
                reject(e);
            }
        });
    }

    /**
     * Executes an MCP tool via SSE/HTTP transport
     */
    async function callSseTool(serverConfig, toolName, toolArgs = {}) {
        const url = serverConfig.url;
        if (!url) throw new Error("Server URL not configured for SSE transport.");

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "tools/call",
                params: {
                    name: toolName,
                    arguments: toolArgs || {}
                }
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
        }

        const msg = await response.json();
        if (msg.error) {
            return {
                success: false,
                error: msg.error.message || JSON.stringify(msg.error),
                raw: msg
            };
        }

        const result = msg.result || {};
        let textContent = '';
        if (Array.isArray(result.content)) {
            textContent = result.content.map(c => c.text || '').join('\n');
        } else {
            textContent = JSON.stringify(result, null, 2);
        }

        return {
            success: !result.isError,
            contentText: textContent,
            result: result,
            raw: msg
        };
    }

    /**
     * Master tool caller
     */
    async function callMcpTool(serverName, toolName, toolArgs = {}) {
        const server = getRegisteredServer(serverName);
        if (!server) {
            throw new Error(`MCP server "${serverName}" is not registered in Settings.json.`);
        }
        if (server.disabled === true) {
            throw new Error(`MCP server "${serverName}" is currently disabled in Settings.`);
        }

        if (server.url) {
            return await callSseTool(server, toolName, toolArgs);
        } else if (server.command) {
            return await callStdioTool(server, toolName, toolArgs);
        } else {
            throw new Error(`Invalid configuration for MCP server "${serverName}". Missing command or url.`);
        }
    }

    /**
     * High-level execution flow with UI feedback and drag-drop bundling
     */
    async function executeMcpCall(serverName, toolName, toolArgs = {}) {
        if (typeof window.showUserScreenToast === 'function') {
            window.showUserScreenToast(`Executing ${serverName}.${toolName}()...`, 2000);
        }

        let res;
        try {
            res = await callMcpTool(serverName, toolName, toolArgs);
        } catch(err) {
            res = {
                success: false,
                error: err.message,
                contentText: `Error: ${err.message}`
            };
        }

        // Format result markdown
        const statusHeader = res.success ? "SUCCESS" : "ERROR / NOTICE";
        const cleanContent = res.contentText || res.error || "Execution completed with empty output.";

        let mdContent = `# MCP Execution Result: [${serverName}.${toolName}]\n\n`;
        mdContent += `**Status**: ${statusHeader}\n`;
        mdContent += `**Arguments**: \`${JSON.stringify(toolArgs)}\`\n\n`;
        mdContent += `## Output:\n\`\`\`json\n${cleanContent}\n\`\`\`\n`;

        // Append to ChatUI
        if (typeof ChatUI !== 'undefined' && typeof ChatUI.appendBubble === 'function') {
            ChatUI.appendBubble('system', `[MCP RESULT: ${serverName}.${toolName}]\n${cleanContent}`);
        }

        // Prepare file payload for Drag & Drop
        const baseFileName = `_mcp_result_${serverName}_${toolName}.md`;
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

        if (typeof window.showUserScreenToast === 'function') {
            window.showUserScreenToast(`MCP Result for "${toolName}" ready in Drag & Drop Sheet`, 3500);
        }

        return res;
    }

    window.callMcpTool = callMcpTool;
    window.executeMcpCall = executeMcpCall;
})();
