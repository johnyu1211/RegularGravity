import os
import re

path_main = r'f:\VOXELVERSE\InnerProject\VaporTool\main.js'
path_js = r'f:\VOXELVERSE\InnerProject\VaporTool\renderer.js'

# 1. Rigid reconstruction of main.js IPC components
with open(path_main, 'r', encoding='utf-8') as f:
    main_code = f.read()

ipc_logic = """
// --- EXPLORER & TERMINAL IPC CHANNELS ---
const fs = require('fs');
const path = require('path');

ipcMain.on('get-files', (event) => {
    try {
        const root = process.cwd();
        const files = fs.readdirSync(root).map(f => {
            const fullPath = path.join(root, f);
            const isDir = fs.lstatSync(fullPath).isDirectory();
            return { name: f, isDir: isDir };
        });
        event.reply('files-data', files);
    } catch (e) {
        console.error('EXPLORER ERROR:', e);
    }
});

ipcMain.on('execute-cmd', (event, cmd) => {
    const { exec } = require('child_process');
    exec(cmd, { cwd: process.cwd() }, (error, stdout, stderr) => {
        event.reply('cmd-output', stdout || stderr || (error ? error.message : "Execution Complete."));
    });
});
"""

# If the channels are missing, append them safely
if "ipcMain.on('get-files'" not in main_code:
    main_code += "\n" + ipc_logic

with open(path_main, 'w', encoding='utf-8') as f:
    f.write(main_code)

# 2. Ensure renderer.js triggers the call on start
with open(path_js, 'r', encoding='utf-8') as f:
    js = f.read()

if "ipcRenderer.send('get-files');" not in js:
    # Inject before the final toggle-agent-view call in DOMContentLoaded
    js = js.replace("ipcRenderer.send('toggle-agent-view', false);", "ipcRenderer.send('get-files');\n    ipcRenderer.send('toggle-agent-view', false);")

with open(path_js, 'w', encoding='utf-8') as f:
    f.write(js)

print("Success: Explorer and Terminal IPC links are now physically present in main.js.")
