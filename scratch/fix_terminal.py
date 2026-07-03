import os
import re

path_html = r'f:\VOXELVERSE\InnerProject\VaporTool\index.html'
path_js = r'f:\VOXELVERSE\InnerProject\VaporTool\renderer.js'
path_css = r'f:\VOXELVERSE\InnerProject\VaporTool\style.css'

# 1. Update HTML: Add Terminal Buttons
with open(path_html, 'r', encoding='utf-8') as f:
    html = f.read()

btn_html = '<div style="display:flex; gap:12px; margin-right:10px;"><span id="term-min" style="cursor:pointer; font-size:14px; opacity:0.6; hover:opacity:1;">_</span><span id="term-max" style="cursor:pointer; font-size:12px; opacity:0.6; hover:opacity:1;">□</span></div>'
if 'TERMINAL' in html and 'term-min' not in html:
    html = html.replace('TERMINAL</span>', 'TERMINAL</span>' + btn_html)

with open(path_html, 'w', encoding='utf-8') as f:
    f.write(html)

# 2. Update CSS: Animation & States
with open(path_css, 'r', encoding='utf-8') as f:
    css = f.read()

terminal_styles = """
/* Terminal Control States */
#terminal-lower {
    transition: height 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.term-minimized {
    height: 35px !important;
    overflow: hidden;
}
.term-maximized {
    height: 85vh !important;
}
"""
if "/* Terminal Control States */" not in css:
    css += terminal_styles

with open(path_css, 'w', encoding='utf-8') as f:
    f.write(css)

# 3. Update JS: Logic injection
with open(path_js, 'r', encoding='utf-8') as f:
    js = f.read()

term_logic = """
    // Terminal Control Injection
    const terminal = document.getElementById('terminal-lower');
    const termMin = document.getElementById('term-min');
    const termMax = document.getElementById('term-max');
    if (termMin && terminal) {
        termMin.onclick = () => {
            terminal.classList.toggle('term-minimized');
            terminal.classList.remove('term-maximized');
        };
    }
    if (termMax && terminal) {
        termMax.onclick = () => {
            terminal.classList.toggle('term-maximized');
            terminal.classList.remove('term-minimized');
        };
    }
"""
if "// Terminal Control Injection" not in js:
    # Inject into DOMContentLoaded
    marker = "setupUniversalResizers();"
    js = js.replace(marker, marker + term_logic)

with open(path_js, 'w', encoding='utf-8') as f:
    f.write(js)

print("Success: Final functional polish applied. Terminal toggles active.")
