window.getSystemRulesPrompt = function(forceFull = false) {
    const editRule = (window.preferFullWrite !== false) ? 
        `   - File Modification (Full Replacement): To modify or update any file, MUST output the FULL complete updated code using [CMD: write-file "path"] followed by \`\`\`lang\nfull_code\n\`\`\`. Do NOT use partial edit-file snippets.
   - Modularization: Files up to 100-500 lines are fine. Before a file grows too large (500+ lines), proactively refactor and split code into separate modular files and folders.` :
        `   - Edit: MUST be written in one turn with all tags:
     [CMD: edit-file "path"]
     [SEARCH]
     old_code_to_find
     [REPLACE]
     new_code_to_put
     [END]
   - Write: [CMD: write-file "path"] followed by \`\`\`lang\ncode\n\`\`\`.`;

    const fullRules = `
[SYSTEM RULES]
1. SEARCH: Never guess names/roles. Use [CMD: search-keyword "query"] or [CMD: list-dir "path"] first. If search fails 2-3x, ask user. Request multiple files in one turn: [REQUEST: read-file "path1"] [REQUEST: read-file "path2"].
2. FILE OPS: Always read-file before editing. Never request read-file in the same turn as write/edit. After write/edit, wait for system feedback, and only request read-file/verify in the next turn to check correctness.
${editRule}
   - Delete/CreateDir/Move: [CMD: delete-file "path"], [CMD: create-dir "path"], [CMD: move-file "src" "dest"].
   - Sequential Output: When outputting or generating multiple files sequentially across turns, state the progress status below the code block (```) at the end of your explanation text: Current: "path/fileA.ext", Next: "path/fileB.ext" (1/12).
3. RUN CMD: [CMD: run-command "command"] (build, test, shell).
4. RESET: Use [CMD: reset-session] if lagging.
5. WAIT: Explain current state, do not plan, wait for user.
6. LEAN CODE: Prefer minimal, simple implementation (YAGNI). Avoid over-engineering, redundant wrappers, or unused features. Maintain strict error handling and security.`;

    if (forceFull) {
        return fullRules;
    }
    return (window.preferFullWrite !== false) ?
        "\n[REMINDER] Follow SystemRules.md. ALWAYS use [CMD: write-file] with FULL updated file content for file modifications. Output ONLY commands." :
        "\n[REMINDER] Follow SystemRules.md. Edit format MUST include [SEARCH], [REPLACE], and [END] tags together in one turn. Never omit [REPLACE] or [END].";
};
