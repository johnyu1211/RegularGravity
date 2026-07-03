import os

path = r'f:\VOXELVERSE\InnerProject\VaporTool\renderer.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

resizer_function = """
function setupUniversalResizers() {
    const leftSidebar = document.getElementById('sidebar-left');
    const rightInspector = document.getElementById('inspector-right');
    const terminalPanel = document.getElementById('terminal-lower');
    
    const resizerLeft = document.getElementById('resizer-left');
    const resizerRight = document.getElementById('resizer-inspector');
    const resizerTerminal = document.getElementById('resizer-terminal');

    const setupVResizer = (resizer, target, side) => {
        if (!resizer || !target) return;
        resizer.onmousedown = (e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startWidth = target.offsetWidth;
            const onMouseMove = (moveE) => {
                const diff = (side === 'left') ? (moveE.clientX - startX) : (startX - moveE.clientX);
                const newWidth = Math.max(150, Math.min(window.innerWidth * 0.7, startWidth + diff));
                target.style.width = newWidth + 'px';
            };
            const onMouseUp = () => {
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
            };
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        };
    };

    if (resizerTerminal && terminalPanel) {
        resizerTerminal.onmousedown = (e) => {
            e.preventDefault();
            const startY = e.clientY;
            const startHeight = terminalPanel.offsetHeight;
            const onMouseMove = (moveE) => {
                const diff = startY - moveE.clientY;
                const newHeight = Math.max(40, Math.min(window.innerHeight * 0.8, startHeight + diff));
                terminalPanel.style.height = newHeight + 'px';
            };
            const onMouseUp = () => {
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
            };
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        };
    }

    setupVResizer(resizerLeft, leftSidebar, 'left');
    setupVResizer(resizerRight, rightInspector, 'right');
}
"""

if 'function setupUniversalResizers() {' not in content:
    content = content.replace('// --- VaporTool Consolidated Renderer Logic', resizer_function + '\n// --- VaporTool Consolidated Renderer Logic')

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Success: setupUniversalResizers added back to renderer.js")
