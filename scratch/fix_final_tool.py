import os
import re

path_html = r'f:\VOXELVERSE\InnerProject\VaporTool\index.html'
path_js = r'f:\VOXELVERSE\InnerProject\VaporTool\renderer.js'
path_css = r'f:\VOXELVERSE\InnerProject\VaporTool\style.css'

# 1. Fix HTML: Stop button initial state
with open(path_html, 'r', encoding='utf-8') as f:
    html = f.read()
# Ensure stop button hidden by default
html = re.sub(r'id="stop-ai-btn" style=".*?"', 'id="stop-ai-btn" style="display:none !important;"', html)
with open(path_html, 'w', encoding='utf-8') as f:
    f.write(html)

# 2. Fix CSS: Badge hover feedback
with open(path_css, 'r', encoding='utf-8') as f:
    css = f.read()
badge_style = """
#active-project-badge { cursor: pointer; transition: opacity 0.2s; }
#active-project-badge:hover { opacity: 0.7; text-decoration: underline; }
"""
if '#active-project-badge' not in css:
    css += badge_style
with open(path_css, 'w', encoding='utf-8') as f:
    f.write(css)

# 3. Fix JS: Interactive Registry and Explorer Refresh
with open(path_js, 'r', encoding='utf-8') as f:
    js = f.read()

# Replace the badge assignment to add onclick refresh
js = re.sub(r'badge\.innerText = (.*?);', r'badge.innerText = \1; badge.onclick = () => { ipcRenderer.send("get-files"); };', js)

# Ensure the app starts with a fresh file list
if "ipcRenderer.send('get-files');" not in js:
     js = js.replace("setupHub();", "setupHub();\n    ipcRenderer.send('get-files');")

with open(path_js, 'w', encoding='utf-8') as f:
    f.write(js)

print("Success: UI elements are now interactive and state-aware.")
