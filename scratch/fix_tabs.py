import os
import re

path = r'f:\VOXELVERSE\InnerProject\VaporTool\style.css'
with open(path, 'r', encoding='utf-8') as f:
    css = f.read()

# Define the precise style block for tabs
tab_styles = """
/* Inspector Tab System */
.inspector-tab {
    color: #666; /* Dim inactive */
    font-weight: 500;
    transition: all 0.2s;
    cursor: pointer;
    padding: 10px 20px;
    border-bottom: 2px solid transparent;
}
.inspector-tab:hover {
    color: #bbb;
}
.active-tab {
    color: #fff !important; /* Bright active text */
    border-bottom: 2px solid #fff !important; /* Visual indicator line */
}
"""

if "/* Inspector Tab System */" in css:
    # Use re.DOTALL to replace the existing block if it exists
    css = re.sub(r'/\* Inspector Tab System \*/.*?(\n\n|$)', tab_styles + '\n', css, flags=re.DOTALL)
else:
    css += "\n" + tab_styles

with open(path, 'w', encoding='utf-8') as f:
    f.write(css)

print("Success: Inspector tabs now have a clear white-active state.")
