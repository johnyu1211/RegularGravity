import os
import re

path_main = r'f:\VOXELVERSE\InnerProject\VaporTool\main.js'
path_js = r'f:\VOXELVERSE\InnerProject\VaporTool\renderer.js'

# 1. Fix main.js: Require mandatory modules at top
with open(path_main, 'r', encoding='utf-8') as f:
    main_code = f.read()

# Add if missing, but be precise
if "require('path')" not in main_code:
    main_code = "const path = require('path');\n" + main_code
if "require('fs')" not in main_code:
    main_code = "const fs = require('fs');\n" + main_code

with open(path_main, 'w', encoding='utf-8') as f:
    f.write(main_code)

# 2. Fix renderer.js: Explorer UI logic
with open(path_js, 'r', encoding='utf-8') as f:
    js = f.read()

# Sharp, clear explorer item logic
enhanced_item_logic = """
        files.forEach(f => {
            const item = document.createElement('div');
            item.className = 'explorer-item';
            item.style = 'padding:8px 12px; font-size:11px; color:#aaa; cursor:pointer; display:flex; align-items:center; gap:10px; border-bottom: 1px solid #111; transition: all 0.1s;';
            const icon = f.isDir ? '📁' : '📄';
            item.innerHTML = `<span style="font-size:13px; opacity:0.8;">${icon}</span> <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${f.name}</span>`;
            item.onmouseover = () => { item.style.background = '#1a1a1a'; item.style.color = '#fff'; };
            item.onmouseout = () => { item.style.background = 'transparent'; item.style.color = '#aaa'; };
            exp.appendChild(item);
        });
"""

if "files.forEach(f => {" in js:
    # Target the exact loop block and replace it
    pattern = r'files\.forEach\(f => \{.*?\}\);'
    js = re.sub(pattern, enhanced_item_logic.strip() + ");", js, flags=re.DOTALL)

with open(path_js, 'w', encoding='utf-8') as f:
    f.write(js)

print("Success: Explorer core modules and UI aesthetics are now solid.")
