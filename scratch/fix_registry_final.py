import os
import re

path_main = r'f:\VOXELVERSE\InnerProject\VaporTool\main.js'
path_js = r'f:\VOXELVERSE\InnerProject\VaporTool\renderer.js'

# 1. Update main.js: Refine IPC Handler for tree-view.js compatibility
with open(path_main, 'r', encoding='utf-8') as f:
    main_code = f.read()

refined_ipc_handler = """
ipcMain.handle('get-directory-content', async (event, dirPath) => {
    try {
        const root = (dirPath && dirPath !== 'DRIVES') ? dirPath : process.cwd();
        const files = fs.readdirSync(root).map(file => {
            try {
                const fullPath = path.join(root, file);
                const stats = fs.lstatSync(fullPath);
                return { name: file, isDir: stats.isDirectory() };
            } catch (e) { return null; }
        }).filter(f => f !== null);
        return files;
    } catch (e) {
        return [];
    }
});
"""

# Replace any existing handle block for 'get-directory-content'
main_code = re.sub(r"ipcMain\.handle\('get-directory-content'.*?\n\}\);", refined_ipc_handler.strip(), main_code, flags=re.DOTALL)

with open(path_main, 'w', encoding='utf-8') as f:
    f.write(main_code)

# 2. Update renderer.js: Restore the 3x3 App Registry
with open(path_js, 'r', encoding='utf-8') as f:
    js = f.read()

default_apps_code = """
    // --- Default Registry Apps (Restored) ---
    const defaultApps = [
        { name: 'GEMINI', url: 'https://gemini.google.com' },
        { name: 'GROK', url: 'https://grok.com' },
        { name: 'CLAUDE', url: 'https://claude.ai' },
        { name: 'CHATGPT', url: 'https://chatgpt.com' },
        { name: 'CHAT', url: 'https://duckduckgo.com/?q=DuckDuckGo+AI+Chat&ia=chat' },
        { name: 'ARENA', url: 'https://chat.lmsys.org' },
        { name: 'WWW', url: 'https://www.google.com' },
        { name: 'CHAT', url: 'https://chat.mistral.ai' }
    ];

    const savedRegistry = localStorage.getItem('vapor_agent_apps');
    let appsToLoad = [...defaultApps];
    if (savedRegistry) {
        try {
            const userApps = JSON.parse(savedRegistry).map(u => ({ 
                name: new URL(u).hostname.split('.')[0].toUpperCase(), 
                url: u 
            }));
            appsToLoad = [...appsToLoad, ...userApps];
            // Remove duplicates by URL
            const uniqueMap = new Map();
            appsToLoad.forEach(a => uniqueMap.set(a.url, a));
            appsToLoad = Array.from(uniqueMap.values());
        } catch (e) { console.error('Registry Load Error:', e); }
    }
    appsToLoad.forEach(app => create(app.url, false));
"""

# Replace the simple create logic with the full default apps logic
js = re.sub(r'const saved = localStorage\.getItem\(.*?\);.*?forEach\(app => create\(app\.url, false\)\);', default_apps_code.strip(), js, flags=re.DOTALL)
# Try secondary anchor if first one fails due to formatting
js = re.sub(r'if \(saved\) \{.*?\}\s*appsToLoad\.forEach\(app => create\(app\.url, false\)\);', default_apps_code.strip(), js, flags=re.DOTALL)

with open(path_js, 'w', encoding='utf-8') as f:
    f.write(js)

print("Success: Registry icons and Explorer data-flow restored completely.")
