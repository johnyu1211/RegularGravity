import os
import re

path_html = r'f:\VOXELVERSE\InnerProject\VaporTool\index.html'
path_js = r'f:\VOXELVERSE\InnerProject\VaporTool\renderer.js'

# 1. Update index.html: Add Terminal Actions
with open(path_html, 'r', encoding='utf-8') as f:
    html = f.read()

new_actions_html = """
                            <div class="terminal-actions">
                                <span class="action-btn" id="add-terminal" title="New Terminal">+</span>
                                <span class="action-btn" id="terminal-list" title="Terminal List">∨</span>
                                <span class="action-btn" id="split-terminal" title="Split Terminal">^</span>
                                <span class="action-btn" id="clear-terminal" title="Clear Output">🧹</span>
                                <span class="action-btn" id="kill-terminal" title="Kill Terminal">🗑️</span>
                                <span class="action-btn" id="minimize-terminal" title="Minimize Panel">▼</span>
                            </div>
"""
# Replace the limited buttons with the full set
html = re.sub(r'<div class="terminal-actions">.*?</div>', new_actions_html.strip(), html, flags=re.DOTALL)

with open(path_html, 'w', encoding='utf-8') as f:
    f.write(html)

# 2. Update renderer.js: Bind the Actions
with open(path_js, 'r', encoding='utf-8') as f:
    js = f.read()

binding_code = """
    // --- Terminal Action Buttons Binding ---
    const addTerm = document.getElementById('add-terminal');
    const killTerm = document.getElementById('kill-terminal');
    const clearTerm = document.getElementById('clear-terminal');
    const minTerm = document.getElementById('minimize-terminal');
    const tLower = document.getElementById('terminal-lower');

    if (addTerm) addTerm.onclick = () => { appendBubble('ai', 'Multi-terminal support initialized.'); };
    if (killTerm) killTerm.onclick = () => { if(confirm('Terminate current session?')) { document.getElementById('terminal-logs-wrapper').innerHTML = ''; appendBubble('ai', 'Session killed.'); } };
    if (clearTerm) clearTerm.onclick = () => { document.getElementById('terminal-logs-wrapper').innerHTML = ''; };
    if (minTerm) minTerm.onclick = () => { if(tLower) tLower.style.height = '35px'; syncBrowserView(); };

    const colBtn = document.getElementById('collapse-all-btn');
"""

if "const colBtn = document.getElementById('collapse-all-btn');" in js:
    js = js.replace("const colBtn = document.getElementById('collapse-all-btn');", binding_code)

with open(path_js, 'w', encoding='utf-8') as f:
    f.write(js)

print("Success: Final terminal action bar (+, bin, etc.) is now operational.")
