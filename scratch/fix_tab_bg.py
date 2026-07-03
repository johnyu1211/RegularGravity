import os
import re

path = r'f:\VOXELVERSE\InnerProject\VaporTool\style.css'
with open(path, 'r', encoding='utf-8') as f:
    css = f.read()

# Define the precise active style for tabs
active_tab_style = """
.active-tab {
    color: #fff !important;
    border-bottom: 2px solid #fff !important;
    background: rgba(255, 255, 255, 0.08) !important; /* Visual depth for active tab */
}
"""

if ".active-tab {" in css:
    # Use re.DOTALL to target and replace the old active-tab block
    css = re.sub(r'\.active-tab\s*\{.*?\}', active_tab_style.strip(), css, flags=re.DOTALL)
else:
    css += "\n" + active_tab_style

with open(path, 'w', encoding='utf-8') as f:
    f.write(css)

print("Success: Active tab now has a distinct background light.")
