import os
import re

path = r'f:\VOXELVERSE\InnerProject\VaporTool\style.css'
with open(path, 'r', encoding='utf-8') as f:
    css = f.read()

# Unified style to fix the bloated bubble issue
# Using class instead of & in comments to avoid any OS confusion
fit_styles = """
/* Bubble Spacing Correction */
.msg-content p, .msg-content h1, .msg-content h2, .msg-content h3, .msg-content ul, .msg-content ol {
    margin-bottom: 12px !important;
}
.msg-content > *:last-child {
    margin-bottom: 0 !important;
}
.msg-bubble {
    min-height: auto !important;
    height: auto !important;
    padding: 10px 14px !important;
}
.msg-content {
    display: block !important;
}
"""

if "/* Bubble Spacing Correction */" not in css:
    css += fit_styles

# Purge any old "Deep Spacing" remnants that might be interfering
css = re.sub(r'/\* Deep Spacing for Readability \*/.*?(\n\n|$)', '', css, flags=re.DOTALL)

with open(path, 'w', encoding='utf-8') as f:
    f.write(css)

print("Success: Bubble layout shrinking logic applied.")
