import os

path_js = r'f:\VOXELVERSE\InnerProject\VaporTool\renderer.js'
path_css = r'f:\VOXELVERSE\InnerProject\VaporTool\style.css'

# 1. Update JS: Add Copy Code Button Logic
with open(path_js, 'r', encoding='utf-8') as f:
    js = f.read()

copy_logic = """
function addCopyButtons() {
    document.querySelectorAll('pre code').forEach((codeBlock) => {
        const parent = codeBlock.parentNode;
        if (parent.querySelector('.copy-code-btn')) return;
        const button = document.createElement('button');
        button.className = 'copy-code-btn';
        button.innerText = 'Copy';
        button.style = 'position:absolute; top:5px; right:5px; font-size:10px; background:#111; border:1px solid #333; color:#fff; cursor:pointer; padding:2px 6px; border-radius:4px; font-family:inherit;';
        button.onclick = (e) => {
            e.preventDefault();
            navigator.clipboard.writeText(codeBlock.innerText);
            button.innerText = 'Copied!';
            setTimeout(() => { button.innerText = 'Copy'; }, 2000);
        };
        parent.style.position = 'relative';
        parent.appendChild(button);
    });
}
"""

if 'function addCopyButtons()' not in js:
    js = copy_logic + "\n" + js

if 'saveChat();' in js:
    js = js.replace('saveChat();', 'saveChat(); addCopyButtons();')

with open(path_js, 'w', encoding='utf-8') as f:
    f.write(js)

# 2. Update CSS: Enable selection and Fix bullets
with open(path_css, 'r', encoding='utf-8') as f:
    css = f.read()

# Enable selection
selection_fix = """
/* Reset all selection blocking */
* { user-select: text !important; -webkit-user-select: text !important; }
.msg-bubble, .msg-content, .msg-content * { user-select: text !important; -webkit-user-select: text !important; cursor: auto; }
.app-container, .inspector-panel { user-select: none; } /* Only block outer layout */
"""
if '/* Reset all selection blocking */' not in css:
    css += selection_fix

# Fix the bullet unicode
css = css.replace("content: '\\u2022'", "content: '\\2022'")
css = css.replace("content: '\\\\u2022'", "content: '\\\\2022'")

with open(path_css, 'w', encoding='utf-8') as f:
    f.write(css)

print("Success: Interaction overhaul complete. Drag and Copy-button active.")
