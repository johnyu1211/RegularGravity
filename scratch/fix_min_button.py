import os
import re

path_html = r'f:\VOXELVERSE\InnerProject\VaporTool\index.html'
path_js = r'f:\VOXELVERSE\InnerProject\VaporTool\renderer.js'
path_css = r'f:\VOXELVERSE\InnerProject\VaporTool\style.css'

# 1. Update HTML: Robustly inject the buttons
with open(path_html, 'r', encoding='utf-8') as f:
    html = f.read()

btn_markup = '<div style="display:flex; gap:15px; margin-left:auto; margin-right:15px;"><span id="term-min" title="Minimize" style="cursor:pointer; font-size:16px; color:#555; hover:color:#fff;">_</span><span id="term-max" title="Maximize" style="cursor:pointer; font-size:12px; color:#555; hover:color:#fff;">□</span></div>'

if 'term-min' not in html:
    # Look for the span that says TERMINAL and append after it or within header
    html = re.sub(r'(<div class="terminal-header".*?>)(.*?)(</div>)', r'\1\2' + btn_markup + r'\3', html, flags=re.DOTALL)

with open(path_html, 'w', encoding='utf-8') as f:
    f.write(html)

# 2. Update JS: Solve the inline-style conflict
with open(path_js, 'r', encoding='utf-8') as f:
    js = f.read()

# Define the absolute toggle logic that clears resizer's interference
fixed_toggle_logic = """
    // --- Absolute Terminal Toggle ---
    const tBody = document.getElementById('terminal-lower');
    const tMin = document.getElementById('term-min');
    const tMax = document.getElementById('term-max');
    if (tMin && tBody) {
        tMin.onclick = (e) => {
            e.stopPropagation();
            tBody.style.height = ''; 
            tBody.classList.remove('term-maximized');
            tBody.classList.toggle('term-minimized');
        };
    }
    if (tMax && tBody) {
        tMax.onclick = (e) => {
            e.stopPropagation();
            tBody.style.height = ''; 
            tBody.classList.remove('term-minimized');
            tBody.classList.toggle('term-maximized');
        };
    }
"""

# Purge any old, broken terminal logic and inject new
js = re.sub(r'// Terminal Control Injection.*?if \(termMaxBtn && terminalApp\) \{.*?\}', '', js, flags=re.DOTALL)
js = re.sub(r'const tP = document.getElementById\(\'terminal-lower\'\).*?if \(tMax && tP\).*?}', '', js, flags=re.DOTALL)

# Inject after setupResizers(); call in DOMContentLoaded or at end of setupFilesAndTerm
if 'setupFilesAndTerm();' in js:
    js = js.replace('setupFilesAndTerm();', 'setupFilesAndTerm();' + fixed_toggle_logic)

with open(path_js, 'w', encoding='utf-8') as f:
    f.write(js)

print("Success: Terminal toggles fixed with inline-style override logic.")
