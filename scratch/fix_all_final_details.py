import os
import re

path_main = r'f:\VOXELVERSE\InnerProject\VaporTool\main.js'
path_js = r'f:\VOXELVERSE\InnerProject\VaporTool\renderer.js'

# 1. Update main.js
with open(path_main, 'r', encoding='utf-8') as f:
    main_code = f.read()

# Add shell to destructuring safely
if "const { shell }" not in main_code:
    main_code = main_code.replace("} = require('electron');", ", shell } = require('electron');")

ipc_reveal = """
ipcMain.on('reveal-in-explorer', (event, targetPath) => {
    const { shell } = require('electron');
    shell.openPath(targetPath || process.cwd());
});
"""
if "reveal-in-explorer" not in main_code:
    main_code += "\n" + ipc_reveal

with open(path_main, 'w', encoding='utf-8') as f:
    f.write(main_code)

# 2. Update renderer.js
with open(path_js, 'r', encoding='utf-8') as f:
    js = f.read()

# Add Hover Delete Button
del_btn_html = '<div class="del-btn" style="position:absolute; top:-5px; right:-5px; width:18px; height:18px; background:#f44; border-radius:50%; display:none; align-items:center; justify-content:center; color:#fff; font-size:12px; font-weight:bold; cursor:pointer; z-index:10;">&times;</div>'
js = js.replace("card.innerHTML = `", "card.innerHTML = `" + del_btn_html)

# Card logic for mouse events and deletion
card_logic_fix = """
            card.onmouseover = () => { const db = card.querySelector('.del-btn'); if(db) db.style.display = 'flex'; };
            card.onmouseout = () => { const db = card.querySelector('.del-btn'); if(db) db.style.display = 'none'; };
            const delBtn = card.querySelector('.del-btn');
            if(delBtn) delBtn.onclick = (e) => {
                e.stopPropagation();
                if (confirm('Delete this app?')) {
                    const savedStr = localStorage.getItem('vapor_agent_apps');
                    let appsList = [];
                    try { appsList = JSON.parse(savedStr || '[]'); } catch(ex) {}
                    const filteredList = appsList.filter(u => u !== url);
                    localStorage.setItem('vapor_agent_apps', JSON.stringify(filteredList));
                    card.remove();
                }
            };
            card.onclick = () => {
"""
js = js.replace("card.onclick = () => {", card_logic_fix)

# Bind Header Buttons
header_btns_binding = """
    // Explorer Header Bindings
    const cAllBtn = document.getElementById('collapse-all-btn');
    const revDirBtn = document.getElementById('reveal-btn');
    if (cAllBtn) cAllBtn.onclick = () => { if (window.expandedPaths) { window.expandedPaths.clear(); if (window.loadDirectory) window.loadDirectory(window.currentPath || process.cwd()); } };
    if (revDirBtn) revDirBtn.onclick = () => { ipcRenderer.send('reveal-in-explorer', window.currentPath || process.cwd()); };
"""
if "setupIDEModules();" in js:
    js = js.replace("setupIDEModules();", "setupIDEModules();\n" + header_btns_binding)
elif "// --- Absolute Terminal Toggle ---" in js:
    # Use another anchor for safer replacement
    js = js.replace("// --- Absolute Terminal Toggle ---", "// --- Absolute Terminal Toggle ---\n" + header_btns_binding)

with open(path_js, 'w', encoding='utf-8') as f:
    f.write(js)

print("Final Details Applied: Delete, Collapse, and Reveal are now active.")
