window.getSystemRulesPrompt = function(forceFull = false) {
    const isBrowserMode = !!(
        window.isWebMode || 
        (typeof window.require === 'undefined') || 
        (typeof window.process !== 'undefined' && window.process && window.process.platform === 'browser') ||
        (typeof window.process === 'undefined')
    );
    const isEmoteEnabled = (window.useEmote !== false) && !isBrowserMode;

    const editRule = (window.preferFullWrite !== false) ? 
        `   - File Modification (Full Replacement): To modify or update any file, MUST output the FULL complete updated code using [CMD: write-file "path"] followed by \`\`\`lang\nfull_code\n\`\`\`. Do NOT use partial edit-file snippets.
   - Modularization: Files up to 100-500 lines are fine. Before a file grows too large (500+ lines), proactively refactor and split code into separate modular files and folders.` :
        `   - File Modification (Chunk / Snippet Edit): To edit or patch existing code, place [CMD: edit-file "path"] directly above the diff code block:
     [CMD: edit-file "path"]
     \`\`\`lang
     <<<<<<< SEARCH
     exact_existing_code_to_find
     =======
     new_replacement_code
     >>>>>>>
     \`\`\`
     (OR using [SEARCH] ... [REPLACE] ... [END] format).
   - New Files or Full Replacement: Use [CMD: write-file "path"] followed by \`\`\`lang\nfull_code\n\`\`\`.`;

    // Dynamically retrieve active MCP servers from Settings.json or window.loadMcpServers()
    let mcpRule = '';
    try {
        let servers = {};
        if (typeof window.loadMcpServers === 'function') {
            servers = window.loadMcpServers();
        } else if (typeof window.require !== 'undefined') {
            const fs = window.require('fs');
            const path = window.require('path');
            const root = window.appRootPath || (typeof process !== 'undefined' ? process.cwd() : '.');
            const p = path.join(root, 'Settings.json');
            if (fs.existsSync(p)) {
                const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
                servers = data.mcpServers || {};
            }
        }

        const activeKeys = Object.keys(servers).filter(k => servers[k] && servers[k].disabled !== true);
        if (activeKeys.length > 0) {
            const serverListStr = activeKeys.map(k => {
                const s = servers[k];
                const type = s.url ? `SSE: ${s.url}` : `stdio: ${s.command || ''}`;
                return `   - "${k}" (${type})`;
            }).join('\n');

            mcpRule = `\n7. MCP TOOLS (Model Context Protocol):
   Active MCP server(s) configured in this workspace:
${serverListStr}
   To execute a tool provided by any active MCP server, output:
   [CMD: mcp-call server="server_name" tool="tool_name" args='{"key": "value"}']`;
        }
    } catch(e) {}

    const emoteRuleNumber = mcpRule ? '8' : '7';
    const emoteRule = isEmoteEnabled ? 
        `\n${emoteRuleNumber}. EMOTE RESPONSE RULE (MANDATORY): You MUST end your final response explanation with an emote tag (e.g. emote:trust, emote:joy, emote:def, emote:sad, emote:angr, emote:fear, emote:disgust, emote:surpr, emote:antici, emote:awe). NEVER omit the emote tag!` : ``;

    const emoteReminder = isEmoteEnabled ? 
        ` End response explanation text with an emote tag (e.g. emote:trust, emote:joy, emote:def). NEVER omit emote tag!` : ``;

    const fullRules = `
[SYSTEM RULES]
1. SEARCH: Never guess names/roles. Use [CMD: search-keyword "query"] or [CMD: list-dir "path"] first. Read multiple files in one turn: [CMD: read-file "path1"] [CMD: read-file "path2"].
2. FILE OPS: Always read-file before editing. Use [CMD: read-file "path"] directly to read files. Never read and write/edit in the same turn. After write/edit, wait for system feedback, and only request read-file/verify in the next turn to check correctness.
${editRule}
   - Delete/CreateDir/Move: [CMD: delete-file "path"] (files & folders), [CMD: delete-dir "path"], [CMD: create-dir "path"], [CMD: move-file "src" "dest"].
   - Sequential Output: When outputting or generating multiple files sequentially across turns, state the progress status below the code block (\`\`\`) at the end of your explanation text: Current: "path/fileA.ext", Next: "path/fileB.ext" (1/12).
   - Relative Paths: All file paths in commands MUST be relative to current project root. NEVER prefix paths with the root folder name itself (e.g. use "js/main.js", NOT "ProjectRoot/js/main.js").
3. RUN CMD: [CMD: run-command "command"] (build, test, shell).
4. RESET: Use [CMD: reset-session] if lagging.
5. WAIT: Explain current state, do not plan, wait for user.
6. LEAN CODE: Prefer minimal, simple implementation (YAGNI). Avoid over-engineering, redundant wrappers, or unused features. Maintain strict error handling and security.${mcpRule}${emoteRule}`;

    if (forceFull) {
        return fullRules;
    }
    return (window.preferFullWrite !== false) ?
        `\n[REMINDER] Follow SystemRules.md. ALWAYS use [CMD: write-file] with FULL updated file content for file modifications. Output ONLY commands.${emoteReminder}` :
        `\n[REMINDER] Follow SystemRules.md. ALWAYS put command tags (e.g. [CMD: edit-file "path"] or [CMD: write-file "path"]) ABOVE the code block. For edit-file, use <<<<<<< SEARCH ... ======= ... >>>>>>> blocks.${emoteReminder}`;
};
