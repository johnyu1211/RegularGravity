import os
import re

path_html = r'f:\VOXELVERSE\InnerProject\VaporTool\index.html'
path_css = r'f:\VOXELVERSE\InnerProject\VaporTool\style.css'
path_js = r'f:\VOXELVERSE\InnerProject\VaporTool\renderer.js'

# 1. Update HTML: Stop Button SVG
with open(path_html, 'r', encoding='utf-8') as f:
    html = f.read()

svg_stop = '<svg width="12" height="12" viewBox="0 0 24 24" fill="#fff" style="display:block;"><rect x="4" y="4" width="16" height="16" /></svg>'
# Targeted replace for the stop button content
html = re.sub(r'(<button id="stop-ai-btn".*?>)(.*?)(</button>)', r'\1' + svg_stop + r'\3', html)

with open(path_html, 'w', encoding='utf-8') as f:
    f.write(html)

# 2. Update CSS: Button States & Colors
with open(path_css, 'r', encoding='utf-8') as f:
    css = f.read()

btn_styles = """
/* Command Center Aesthetics */
#send-to-local {
    background: #007bff !important;
    color: #fff !important;
    border: none;
    border-radius: 4px;
    padding: 8px 15px;
    font-weight: bold;
    cursor: pointer;
    transition: background 0.2s;
}
#send-to-local:hover {
    background: #00e5ff !important;
}
#send-to-local:disabled {
    background: #222 !important;
    color: #555 !important;
    cursor: not-allowed;
}
#stop-ai-btn {
    background: #aa0000 !important;
    border-radius: 4px;
    border: none;
    padding: 8px 12px;
    cursor: pointer;
    display: none; /* Managed by JS */
    align-items: center;
    justify-content: center;
}
#stop-ai-btn:hover {
    background: #ff0000 !important;
}
"""
if "/* Command Center Aesthetics */" not in css:
    css += btn_styles

# Purge any old neon shadows if they exist
css = css.replace("box-shadow: 0 0 10px rgba(0, 255, 149, 0.3);", "box-shadow: none;")

with open(path_css, 'w', encoding='utf-8') as f:
    f.write(css)

# 3. Update JS: Sync disabled states
with open(path_js, 'r', encoding='utf-8') as f:
    js = f.read()

# Ensure we disable the send button during thinking
if "if (stopBtn) stopBtn.style.display = 'flex';" in js:
    js = js.replace("if (stopBtn) stopBtn.style.display = 'flex';", 
                    "if (stopBtn) stopBtn.style.display = 'flex'; if (sendBtn) sendBtn.disabled = true; if (sendBtn) sendBtn.style.opacity = '0.5';")

# Re-enable when stopped/finished
if "if (stopBtn) stopBtn.style.display = 'none';" in js:
    js = js.replace("if (stopBtn) stopBtn.style.display = 'none';", 
                    "if (stopBtn) stopBtn.style.display = 'none'; if (sendBtn) sendBtn.disabled = false; if (sendBtn) sendBtn.style.opacity = '1';")

with open(path_js, 'w', encoding='utf-8') as f:
    f.write(js)

print("Success: Command center overhaul complete. New SVG, Active Colors, and State Sync enabled.")
