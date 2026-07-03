import os

path_js = r'f:\VOXELVERSE\InnerProject\VaporTool\renderer.js'
path_css = r'f:\VOXELVERSE\InnerProject\VaporTool\style.css'

# 1. Update JS
with open(path_js, 'r', encoding='utf-8') as f:
    js = f.read()

# Replace green with cyan
js = js.replace('#00ff95', '#00e5ff')

# Add badge update logic inside DOMContentLoaded block
if "const badge = document.getElementById('active-project-badge');" not in js:
    update_block = """
    // Update active project badge
    const badge = document.getElementById('active-project-badge');
    if (badge) {
        const folder = process.cwd().split(require('path').sep).pop().toUpperCase();
        badge.innerText = folder || 'ROOT';
    }
    """
    if "updateOllamaModels();" in js:
        js = js.replace("updateOllamaModels();", "updateOllamaModels();" + update_block)

with open(path_js, 'w', encoding='utf-8') as f:
    f.write(js)

# 2. Update CSS
with open(path_css, 'r', encoding='utf-8') as f:
    css = f.read()

css = css.replace('#00ff95', '#00e5ff')
# Ensure no lingering green buttons
css = css.replace('background: #00ff95;', 'background: #00e5ff;')

with open(path_css, 'w', encoding='utf-8') as f:
    f.write(css)

print("Success: Colors unified to Electric Cyan and Badge logic active.")
