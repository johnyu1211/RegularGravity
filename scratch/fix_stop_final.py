import os
import re

path_html = r'f:\VOXELVERSE\InnerProject\VaporTool\index.html'
path_css = r'f:\VOXELVERSE\InnerProject\VaporTool\style.css'

# 1. Update HTML: Pure SVG 16px
with open(path_html, 'r', encoding='utf-8') as f:
    html = f.read()

svg_data = '<svg width="16" height="16" viewBox="0 0 24 24" fill="#fff" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="16" height="16" /></svg>'
# Replace content of the stop button
html = re.sub(r'(<button id="stop-ai-btn".*?>)(.*?)(</button>)', r'\1' + svg_data + r'\3', html)

with open(path_html, 'w', encoding='utf-8') as f:
    f.write(html)

# 2. Update CSS: Dark Gray Theme (No Red)
with open(path_css, 'r', encoding='utf-8') as f:
    css = f.read()

# Replace all instances of stop button red with dark gray
css = css.replace('#aa0000 !important', '#222 !important')
css = css.replace('#ff0000 !important', '#333 !important')

# Refine the stop button CSS block
stop_btn_css = """
#stop-ai-btn {
    background: #222 !important;
    border: 1px solid #444 !important;
    border-radius: 4px;
    padding: 8px 12px;
    cursor: pointer;
    display: none;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
}
#stop-ai-btn:hover {
    background: #333 !important;
}
"""
if "#stop-ai-btn {" in css:
    css = re.sub(r'#stop-ai-btn \{.*?\}', stop_btn_css, css, flags=re.DOTALL)
else:
    css += stop_btn_css

with open(path_css, 'w', encoding='utf-8') as f:
    f.write(css)

print("Success: Stop button updated to 16px white square SVG on dark gray background.")
