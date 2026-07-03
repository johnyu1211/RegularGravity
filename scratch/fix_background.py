import os

path = r'f:\VOXELVERSE\InnerProject\VaporTool\style.css'
with open(path, 'r', encoding='utf-8') as f:
    css = f.read()

# Remove all problematic hover background changes
# We will explicitly reset the hover state to match the normal state
stability_fix = """
/* Reset any unstable hover background changes */
.msg-bubble:hover, .ai-bubble:hover, .user-bubble:hover {
    background: transparent !important; /* This matches the normal bubble background logic often used with parent styles */
    border-color: #222 !important;
    box-shadow: none !important;
}

/* Ensure AI bubbles keep their dark identity even on hover */
.ai-bubble {
    background: rgba(255,255,255,0.02) !important;
}
.ai-bubble:hover {
    background: rgba(255,255,255,0.02) !important;
}
"""

if '/* Reset any unstable hover background changes */' not in css:
    css += stability_fix

with open(path, 'w', encoding='utf-8') as f:
    f.write(css)

print("Success: Bubble backgrounds are now locked and stable on hover.")
