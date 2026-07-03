import os

path = r'f:\VOXELVERSE\InnerProject\VaporTool\renderer.js'
with open(path, 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

# Remove any previous broken expansion attempts
if '// Inspector Expand' in content:
    content = content.split('// Inspector Expand')[0]
elif 'document.addEventListener(\'DOMContentLoaded\'' in content:
    # If the above fails, try cutting at the last known stable line
    pass

new_block = """
// Inspector Expand/Collapse Logic (Full Width Support)
document.addEventListener('DOMContentLoaded', () => {
    const expandHandle = document.getElementById('inspector-expand-handle');
    const expandIcon = document.getElementById('expand-icon');
    let isExpanded = false;
    
    if (expandHandle && expandIcon) {
        expandHandle.onclick = () => {
            isExpanded = !isExpanded;
            document.body.classList.toggle('inspector-full', isExpanded);
            expandIcon.innerText = isExpanded ? '▶' : '◀';
        };
    }
});
"""

with open(path, 'w', encoding='utf-8') as f:
    f.write(content.strip() + "\n" + new_block)

print("Success: renderer.js cleaned and full expansion logic applied.")
