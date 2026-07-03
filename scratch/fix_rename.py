import os

path = r'f:\VOXELVERSE\InnerProject\VaporTool\renderer.js'
with open(path, 'r', encoding='utf-8') as f:
    js = f.read()

# Target only the newly added block to avoid messing with other 'terminal' strings unrelated to variables
# We will use string replacement for the specific pattern we just added
js = js.replace("const terminal = document.getElementById('terminal-lower');", "const terminalApp = document.getElementById('terminal-lower');")
js = js.replace("if (termMinBtn && terminal)", "if (termMinBtn && terminalApp)")
js = js.replace("terminal.classList.toggle('term-minimized');", "terminalApp.classList.toggle('term-minimized');")
js = js.replace("terminal.classList.remove('term-maximized');", "terminalApp.classList.remove('term-maximized');")
js = js.replace("if (termMaxBtn && terminal)", "if (termMaxBtn && terminalApp)")
js = js.replace("terminal.classList.toggle('term-maximized');", "terminalApp.classList.toggle('term-maximized');")
js = js.replace("terminal.classList.remove('term-minimized');", "terminalApp.classList.remove('term-minimized');")

with open(path, 'w', encoding='utf-8') as f:
    f.write(js)

print("Success: Variable 'terminal' renamed to 'terminalApp' to fix SyntaxError.")
