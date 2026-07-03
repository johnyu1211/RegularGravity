import os
import re

path_js = r'f:\VOXELVERSE\InnerProject\VaporTool\renderer.js'

with open(path_js, 'r', encoding='utf-8') as f:
    js = f.read()

# 1. Completely rewrite the syncBrowserView block to be AT THE TOP scope
# First, remove any existing definitions to avoid duplicates
js = re.sub(r'const syncBrowserView = \(\) => \{.*?\};', '', js, flags=re.DOTALL)
js = re.sub(r'let syncPending = false;', '', js)

# 2. Define the STABLE Global Version
stable_sync = """
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
"""

# Inject after ipcRenderer declaration
if 'if (typeof ipcRenderer === \'undefined\') {' in js:
    search_pattern = r'if \(typeof ipcRenderer === \'undefined\'\) \{.*?\}'
    js = re.sub(search_pattern, lambda m: m.group(0) + "\n" + stable_sync, js, flags=re.DOTALL)

# 3. Fix the expansion handle again to ensure it calls the now-global function
expansion_sync = """
        const syncLoop = setInterval(syncBrowserView, 16); 
        setTimeout(() => clearInterval(syncLoop), 500); 
"""
# Ensure handle.onclick uses the global syncBrowserView
if "handle.onclick = () => {" in js:
    # Remove any existing loop injections to avoid multiple intervals
    js = re.sub(r'const syncLoop = setInterval.*?;.*?setTimeout.*?;', '', js, flags=re.DOTALL)
    js = js.replace("handle.onclick = () => {", "handle.onclick = () => {\n" + expansion_sync)

with open(path_js, 'w', encoding='utf-8') as f:
    f.write(js)

print("Success: Scope error resolved. syncBrowserView is now globally accessible.")
