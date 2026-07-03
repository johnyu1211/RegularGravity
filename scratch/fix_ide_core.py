import os
import re

path_js = r'f:\VOXELVERSE\InnerProject\VaporTool\renderer.js'
path_main = r'f:\VOXELVERSE\InnerProject\VaporTool\main.js'

# 1. Update main.js
with open(path_main, 'r', encoding='utf-8') as f:
    main_code = f.read()

main_logic = """
// --- IDE Operations (CMD & FS) ---
const { exec } = require('child_process');
const fs = require('fs');

ipcMain.on('execute-cmd', (event, command) => {
    exec(command, { cwd: process.cwd() }, (error, stdout, stderr) => {
        const result = stdout || stderr || (error ? error.message : "Executed.");
        event.reply('cmd-output', result);
    });
});

ipcMain.on('get-files', (event) => {
    try {
        const files = fs.readdirSync(process.cwd()).map(file => {
            const fullPath = path.join(process.cwd(), file);
            return {
                name: file,
                isDir: fs.lstatSync(fullPath).isDirectory()
            };
        });
        event.reply('files-data', files);
    } catch (e) {
        console.error("FS Error:", e);
    }
});
"""

if "const { exec } = require('child_process');" not in main_code:
    main_code += "\n" + main_logic

with open(path_main, 'w', encoding='utf-8') as f:
    f.write(main_code)

# 2. Update renderer.js
with open(path_js, 'r', encoding='utf-8') as f:
    js = f.read()

# Unified UI Logic for Terminal & Explorer
ui_core_logic = """
    // --- Real IDE Interactions ---
    const termInput = document.getElementById('terminal-input');
    const termOutput = document.getElementById('terminal-output');
    if (termInput && termOutput) {
        termInput.onkeydown = (e) => {
            if (e.key === 'Enter') {
                const cmd = termInput.value.trim();
                if (!cmd) return;
                termOutput.innerText += '\\n$ ' + cmd + '\\n';
                ipcRenderer.send('execute-cmd', cmd);
                termInput.value = '';
                termOutput.scrollTop = termOutput.scrollHeight;
            }
        };
    }
    ipcRenderer.on('cmd-output', (event, output) => {
        if (termOutput) {
            termOutput.innerText += output + '\\n';
            termOutput.scrollTop = termOutput.scrollHeight;
        }
    });

    const explorerList = document.getElementById('explorer-list');
    const refreshExplorer = () => {
        ipcRenderer.send('get-files');
    };
    ipcRenderer.on('files-data', (event, files) => {
        if (!explorerList) return;
        explorerList.innerHTML = '';
        files.forEach(file => {
            const item = document.createElement('div');
            item.className = 'explorer-item';
            item.style = 'padding:6px 12px; font-size:11px; color:#999; cursor:pointer; display:flex; align-items:center; gap:8px; border-bottom: 1px solid #111;';
            item.innerHTML = `<span>${file.isDir ? '📁' : '📄'}</span> <span>${file.name}</span>`;
            item.onmouseover = () => item.style.backgroundColor = '#111';
            item.onmouseout = () => item.style.backgroundColor = 'transparent';
            explorerList.appendChild(item);
        });
    });
    refreshExplorer();

    // Terminal Toggles (Fixed Overdue)
    const terminal = document.getElementById('terminal-lower');
    const termMinBtn = document.getElementById('term-min');
    const termMaxBtn = document.getElementById('term-max');
    if (termMinBtn && terminal) {
        termMinBtn.onclick = () => {
            terminal.classList.toggle('term-minimized');
            terminal.classList.remove('term-maximized');
        };
    }
    if (termMaxBtn && terminal) {
        termMaxBtn.onclick = () => {
            terminal.classList.toggle('term-maximized');
            terminal.classList.remove('term-minimized');
        };
    }
"""

if "// --- Real IDE Interactions ---" not in js:
    js = js.replace("updateOllamaModels();", "updateOllamaModels();" + ui_core_logic)

with open(path_js, 'w', encoding='utf-8') as f:
    f.write(js)

print("Success: IDE Core (Terminal, Explorer, Toggles) fully integrated.")
