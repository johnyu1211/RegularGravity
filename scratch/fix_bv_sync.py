import os
import re

path_js = r'f:\VOXELVERSE\InnerProject\VaporTool\renderer.js'

with open(path_js, 'r', encoding='utf-8') as f:
    js = f.read()

# Define the ultra-smooth sync logic
sync_engine = """
    let syncPending = false;
    const syncBrowserView = () => {
        if (syncPending) return;
        syncPending = true;
        requestAnimationFrame(() => {
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
            syncPending = false;
        });
    };
"""

# 1. Replace the existing syncBrowserView function (if any) or add it
if 'const syncBrowserView = () => {' in js:
    js = re.sub(r'const syncBrowserView = \(\) => \{.*?\};', sync_engine.strip(), js, flags=re.DOTALL)
else:
    # If for some reason it's missing, add it before setupInspectorTabs
    js = js.replace('function setupInspectorTabs() {', sync_engine + '\nfunction setupInspectorTabs() {')

# 2. Add an intensive sync loop to the expansion toggle
expansion_logic = """
        const syncLoop = setInterval(syncBrowserView, 16); 
        setTimeout(() => clearInterval(syncLoop), 500); // 500ms intensive sync for animation
"""
if "handle.onclick = () => {" in js:
    # Use re to find handles' onclick listener and inject the loop
    js = re.sub(r'handle\.onclick = \(\) => \{', 'handle.onclick = () => {' + expansion_logic, js)

with open(path_js, 'w', encoding='utf-8') as f:
    f.write(js)

print("Success: BrowserView sync logic is now 60fps frame-aware.")
