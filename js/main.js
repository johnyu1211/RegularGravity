const { app, BrowserWindow, BrowserView, ipcMain, shell, Menu, MenuItem, session, webContents } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
let watcher = null;
let currentLogsPath = null;
let currentKnowledgePath = null;
let watcherDebounceTimer = null;
function setupFileWatcher(projectPath) {
    if (watcher) {
        try { watcher.close(); } catch(e) {}
        watcher = null;
    }
    if (!projectPath || projectPath === 'DRIVES' || !fs.existsSync(projectPath)) return;
    try {
        watcher = fs.watch(projectPath, { recursive: true }, (eventType, filename) => {
            if (filename) {
                const fn = filename.toLowerCase();
                if (fn.includes('node_modules') || fn.includes('.git') || fn.includes('gravity_vault') || fn.includes('sendingmd') || fn.startsWith('_project_')) {
                    return;
                }
            }
            clearTimeout(watcherDebounceTimer);
            watcherDebounceTimer = setTimeout(() => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('refresh-explorer');
                }
            }, 300);
        });
    } catch(err) {
        console.error("setupFileWatcher error:", err);
    }
}
const getProjectHash = () => {
    return crypto.createHash('md5').update(process.cwd()).digest('hex');
};
const getVaultPath = (sub) => {
    const p = path.join(app.getPath('userData'), 'vault', getProjectHash(), sub);
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    return p;
};
const getGlobalVaultPath = () => {
    const p = path.join(app.getPath('userData'), 'config');
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    return p;
};
// Common date format function (Local Time)
const getLocalDate = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
ipcMain.handle('vault-init', async () => {
    currentKnowledgePath = getVaultPath('knowledge');
    currentLogsPath = getVaultPath('logs');
    const gp = getGlobalVaultPath();
    setupFileWatcher(process.cwd());
    
    // Generate today's log file path
    const activeLogPath = path.join(currentLogsPath, `${getLocalDate()}.md`);
    
    return { 
        hash: getProjectHash(), 
        activeLogPath, 
        appPath: app.getAppPath(),
        paths: { knowledge: currentKnowledgePath, logs: currentLogsPath, global: gp } 
    };
});
ipcMain.on('vault-log', (event, { logPath, role, text }) => {
    // Stub: Local AI logging disabled
});
ipcMain.handle('vault-read-global', async (event, fileName) => {
    const p = path.join(getGlobalVaultPath(), fileName);
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8');
    return null;
});
ipcMain.on('vault-update-global', (event, { fileName, content }) => {
    const p = path.join(getGlobalVaultPath(), fileName);
    fs.writeFileSync(p, content);
});
ipcMain.on('vault-update-priority', (event, { content }) => {
    // Stub: 로컬 AI 우선순위 학습 비활성화
});
ipcMain.handle('vault-read-knowledge', async (event, fileName) => {
    const p = path.join(getVaultPath('knowledge'), fileName);
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8');
    return null;
});
ipcMain.handle('vault-read-log', async (event, fileName) => {
    const p = path.join(getVaultPath('logs'), fileName);
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8');
    return null;
});
ipcMain.on('vault-reset-session', (event, { logPath }) => {
    // Stub: 로컬 AI 세션 초기화 비활성화
});
ipcMain.handle('vault-get-tree', async (event, projectPath) => {
    const root = projectPath ? path.resolve(projectPath) : process.cwd();
    const ignore = ['node_modules', '.git', 'gravity_vault', 'dist', 'build', 'lib', 'scratch', 'out', '.vs', '.idea', 'SendingMD'];

    function buildHierarchicalTree(dir, depth = 0) {
        if (depth > 12) return [];
        let items = [];
        try {
            items = fs.readdirSync(dir);
        } catch (e) {
            return [];
        }

        const filtered = items.filter(item => !ignore.includes(item) && !item.startsWith('_project_'));
        filtered.sort((a, b) => {
            const pathA = path.join(dir, a);
            const pathB = path.join(dir, b);
            try {
                const isDirA = fs.statSync(pathA).isDirectory();
                const isDirB = fs.statSync(pathB).isDirectory();
                if (isDirA !== isDirB) return isDirA ? -1 : 1;
            } catch(e) {}
            return a.localeCompare(b);
        });

        const lines = [];
        filtered.forEach(item => {
            const fullPath = path.join(dir, item);
            try {
                const stats = fs.statSync(fullPath);
                const indent = "  ".repeat(depth);
                if (stats.isDirectory()) {
                    lines.push(`${indent}${item}/`);
                    const subLines = buildHierarchicalTree(fullPath, depth + 1);
                    if (subLines && subLines.length > 0) {
                        lines.push(...subLines);
                    }
                } else if (stats.isFile()) {
                    lines.push(`${indent}${item}`);
                }
            } catch (err) {}
        });

        return lines;
    }

    const rootName = path.basename(root) || 'root';
    const treeLines = buildHierarchicalTree(root, 1);
    if (!treeLines || treeLines.length === 0) {
        return `[Project Root: . (${rootName})]\n  [Empty folder]`;
    }
    return `[Project Root: . (${rootName}) - All command paths must be relative to this root]\n${treeLines.join('\n')}`;
});
ipcMain.handle('vault-search', async (event, { query }) => {
    if (!query || query.length < 2) return "";
    const vaultPath = path.join(process.cwd(), 'gravity_vault', getProjectHash());
    const results = [];
    const keywords = query.split(/\s+/).filter(k => k.length > 1);
    
    const searchInDir = (dir) => {
        if (!fs.existsSync(dir)) return;
        fs.readdirSync(dir).forEach(file => {
            const filePath = path.join(dir, file);
            if (fs.statSync(filePath).isDirectory()) {
                searchInDir(filePath);
            } else if (file.endsWith('.md')) {
                const content = fs.readFileSync(filePath, 'utf-8');
                const lines = content.split('\n');
                lines.forEach((line, i) => {
                    if (keywords.some(k => line.toLowerCase().includes(k.toLowerCase()))) {
                        // Get context (1 line before, 1 after)
                        const context = lines.slice(Math.max(0, i-1), i+2).join('\n');
                        results.push(`[File: ${file}]\n${context}`);
                    }
                });
            }
        });
    };
    
    searchInDir(vaultPath);
    // Limit results to top 5 unique-ish snippets to save tokens
    return results.slice(0, 5).join('\n---\n');
});
// [New] Read and return actual file content for given file list
ipcMain.handle('read-project-files', async (event, fileNames) => {
    const root = process.cwd();
    const results = [];
    for (const name of fileNames) {
        const fullPath = path.join(root, name);
        try {
            if (fs.existsSync(fullPath)) {
                const content = fs.readFileSync(fullPath, 'utf-8');
                results.push(`\n\n===== FILE: ${name} =====\n${content}`);
            } else {
                results.push(`\n\n===== FILE: ${name} =====\n[File not found]`);
            }
        } catch(e) {
            results.push(`\n\n===== FILE: ${name} =====\n[Error reading file: ${e.message}]`);
        }
    }
    return results.join('');
});
ipcMain.on('send-to-ollama-silent', (event, { model, prompt, tag }) => {
    const postData = JSON.stringify({ model, prompt, stream: false });
    const options = { hostname: '127.0.0.1', port: 11434, path: '/api/generate', method: 'POST' };
    const req = http.request(options, (res) => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => {
            try {
                const json = JSON.parse(data);
                event.reply(tag || 'ollama-distill-res', { text: json.response });
            } catch(e) {}
        });
    });
    req.on('error', (err) => { console.error('Ollama Silent Error:', err); });
    req.write(postData);
    req.end();
});
ipcMain.handle('vault-snapshot', async (event, message) => {
    const timestamp = Date.now();
    const snapPath = path.join(getVaultPath('snapshots'), timestamp.toString());
    fs.mkdirSync(snapPath, { recursive: true });
    
    // Copy Knowledge & Logs
    const kSource = getVaultPath('knowledge'), lSource = getVaultPath('logs');
    const copyDir = (src, dest) => {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        fs.readdirSync(src).forEach(f => fs.copyFileSync(path.join(src, f), path.join(dest, f)));
    };
    copyDir(kSource, path.join(snapPath, 'knowledge'));
    copyDir(lSource, path.join(snapPath, 'logs'));
    
    // Write commit message
    fs.writeFileSync(path.join(snapPath, 'commit.txt'), `[${new Date().toLocaleString()}] ${message || 'Auto Snapshot'}`);
    return { timestamp, path: snapPath };
});
let mainWindow;
let dockedHwnd = null;
let moverProcess = null;
function startDockMover() {
    if (moverProcess && !moverProcess.killed) return;
    const scriptPath = path.join(__dirname, 'ui/dock_mover.ps1');
    moverProcess = spawn('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', scriptPath
    ]);
}
function stopDockMover() {
    if (moverProcess) {
        try {
            moverProcess.stdin.write("exit\n");
            moverProcess.kill();
        } catch(e) {}
        moverProcess = null;
    }
}
function setWindowOwner(hwnd, ownerHwnd) {
    if (!hwnd) return;
    const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class W { [DllImport(\\"user32.dll\\", EntryPoint = \\"SetWindowLongPtrW\\")] public static extern IntPtr SetWindowLongPtr64(IntPtr h, int idx, IntPtr val); [DllImport(\\"user32.dll\\", EntryPoint = \\"SetWindowLongW\\")] public static extern IntPtr SetWindowLong32(IntPtr h, int idx, IntPtr val); [DllImport(\\"user32.dll\\")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags); }'; if ([IntPtr]::Size -eq 8) { [W]::SetWindowLongPtr64([IntPtr][int64]${hwnd}, -8, [IntPtr][int64]${ownerHwnd}) } else { [W]::SetWindowLong32([IntPtr][int64]${hwnd}, -8, [IntPtr][int64]${ownerHwnd}) }; [W]::SetWindowPos([IntPtr][int64]${hwnd}, [IntPtr]0, 0, 0, 0, 0, 39)"`;
    spawn('cmd.exe', ['/c', cmd]);
}
function restoreDockedWindowSystemState(hwnd) {
    if (!hwnd) return;
    const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; [ComImport, Guid(\\"56fdf344-fd6d-11d0-958a-006097c9a090\\"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] public interface ITaskbarList { void HrInit(); void AddTab(IntPtr h); void DeleteTab(IntPtr h); } [ComImport, Guid(\\"56fdf342-fd6d-11d0-958a-006097c9a090\\")] public class TaskbarList {} public class Win32 { [DllImport(\\"user32.dll\\", EntryPoint = \\"SetWindowLongPtrW\\")] public static extern IntPtr SetWindowLongPtr64(IntPtr h, int idx, IntPtr val); [DllImport(\\"user32.dll\\", EntryPoint = \\"SetWindowLongW\\")] public static extern IntPtr SetWindowLong32(IntPtr h, int idx, IntPtr val); [DllImport(\\"user32.dll\\")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags); } public class T { public static void Restore(IntPtr h) { if (IntPtr.Size == 8) { Win32.SetWindowLongPtr64(h, -8, IntPtr.Zero); } else { Win32.SetWindowLong32(h, -8, IntPtr.Zero); } Win32.SetWindowPos(h, IntPtr.Zero, 0, 0, 0, 0, 39); try { var tbl = (ITaskbarList)new TaskbarList(); tbl.HrInit(); tbl.AddTab(h); } catch {} } }'; [T]::Restore([IntPtr][int64]${hwnd})"`;
    spawn('cmd.exe', ['/c', cmd]);
}
ipcMain.on('register-docked-hwnd', (event, hwnd) => {
    if (dockedHwnd && !hwnd) {
        // Restore owner of the previously docked window to independent (0) and restore its taskbar icon
        restoreDockedWindowSystemState(dockedHwnd);
        stopDockMover();
    }
    dockedHwnd = hwnd;
});
ipcMain.handle('get-our-hwnd', async () => {
    if (!mainWindow) return '0';
    const buf = mainWindow.getNativeWindowHandle();
    return process.arch === 'x64' ? buf.readBigInt64LE().toString() : buf.readInt32LE().toString();
});
function setWindowState(hwnd, state) {
    if (!hwnd) return;
    const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class W { [DllImport(\\"user32.dll\\")] public static extern bool ShowWindow(IntPtr h, int m); }'; [W]::ShowWindow([IntPtr][int64]${hwnd}, ${state})"`;
    spawn('cmd.exe', ['/c', cmd]);
}
ipcMain.on('move-docked-window', (event, bounds) => {
    if (dockedHwnd) {
        startDockMover();
        if (moverProcess && moverProcess.stdin && moverProcess.stdin.writable) {
            moverProcess.stdin.write(`${dockedHwnd},${bounds.x},${bounds.y},${bounds.w},${bounds.h}\n`);
        }
    }
});
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        backgroundColor: '#141416',
        frame: false,
        icon: path.join(app.getAppPath(), 'assets', 'icon.png'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webviewTag: true
        }
    });
 
    mainWindow.maximize();
 
    // Sync docked window minimize, restore, move, and resize
    mainWindow.on('minimize', () => {
        if (dockedHwnd) setWindowState(dockedHwnd, 6); // SW_MINIMIZE = 6
    });
    mainWindow.on('restore', () => {
        if (dockedHwnd) setWindowState(dockedHwnd, 9); // SW_RESTORE = 9
    });
    mainWindow.on('close', () => {
        if (dockedHwnd) {
            restoreDockedWindowSystemState(dockedHwnd);
        }
        stopDockMover();
    });
 
    // Remove default top menu
    Menu.setApplicationMenu(null);
 
    // Shortcut controls (Ctrl+Shift+I/F12 DevTools, Ctrl+R/F5 Reload)
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if ((input.control && input.shift && input.key.toLowerCase() === 'i') || input.key === 'F12') {
            mainWindow.webContents.toggleDevTools();
            event.preventDefault();
        }
        if ((input.control && input.key.toLowerCase() === 'r') || input.key === 'F5') {
            mainWindow.webContents.send('trigger-app-reload');
            event.preventDefault();
        }
    });
 
    mainWindow.loadFile(path.join(app.getAppPath(), 'index.html'));
}
ipcMain.on('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
});
ipcMain.on('window-maximize', () => {
    if (mainWindow) {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    }
});
ipcMain.on('window-close', () => {
    if (mainWindow) mainWindow.close();
});
// --- PROJECT PICKER & RECENT PROJECTS ---
const { dialog } = require('electron');
const RECENT_PROJECTS_FILE = path.join(app.getPath('userData'), 'recent_projects.json');
function loadRecentProjects() {
    try {
        if (fs.existsSync(RECENT_PROJECTS_FILE)) {
            const data = JSON.parse(fs.readFileSync(RECENT_PROJECTS_FILE, 'utf-8'));
            if (Array.isArray(data)) {
                return data.filter(p => p && p !== '__CLEAR__' && fs.existsSync(p));
            }
        }
    } catch(e) {}
    return [];
}
function saveRecentProjects(list) {
    try { fs.writeFileSync(RECENT_PROJECTS_FILE, JSON.stringify(list), 'utf-8'); } catch(e) {}
}
let lastPickedParentDir = null;
ipcMain.handle('select-folder-dialog', async (event, customDefaultPath) => {
    let options = { properties: ['openDirectory'] };
    if (customDefaultPath && fs.existsSync(customDefaultPath)) {
        options.defaultPath = customDefaultPath;
    } else if (lastPickedParentDir && fs.existsSync(lastPickedParentDir)) {
        options.defaultPath = lastPickedParentDir;
    }

    const result = await dialog.showOpenDialog(mainWindow, options);
    if (result.canceled || !result.filePaths.length) return null;
    const selected = result.filePaths[0];

    try {
        lastPickedParentDir = path.dirname(selected);
    } catch(e) {}

    let recents = loadRecentProjects().filter(p => p !== selected);
    recents.unshift(selected);
    if (recents.length > 10) recents = recents.slice(0, 10);
    saveRecentProjects(recents);
    return selected;
});
ipcMain.handle('get-recent-projects', async () => loadRecentProjects());
ipcMain.handle('clear-recent-projects', async () => {
    saveRecentProjects([]);
    return true;
});
ipcMain.handle('remove-recent-project', async (event, folderPath) => {
    let recents = loadRecentProjects().filter(p => p !== folderPath);
    saveRecentProjects(recents);
    return recents;
});
ipcMain.on('clear-recent-projects', () => {
    saveRecentProjects([]);
});
ipcMain.on('save-recent-project', (event, folderPath) => {
    if (folderPath === '__CLEAR__') {
        saveRecentProjects([]);
        return;
    }
    let recents = loadRecentProjects().filter(p => p !== folderPath);
    recents.unshift(folderPath);
    if (recents.length > 10) recents = recents.slice(0, 10);
    saveRecentProjects(recents);
    setupFileWatcher(folderPath);
});
ipcMain.handle('get-directory-content', async (event, dirPath) => {
    try {
        const targetPath = dirPath || process.cwd();
        const files = fs.readdirSync(targetPath, { withFileTypes: true });
        const ignoreList = ['gravity_vault', 'SendingMD', 'node_modules', '.git'];
        return files
            .filter(file => !ignoreList.includes(file.name) && !file.name.startsWith('_project_'))
            .map(file => ({
                name: file.name,
                isDir: file.isDirectory()
            }));
    } catch (err) {
        console.error('Dir Read Error:', err);
        return [];
    }
});
ipcMain.on('reveal-in-explorer', (event, p) => {
    if (!p) return;
    const resolvedPath = path.resolve(p);
    try {
        if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) {
            shell.openPath(resolvedPath);
        } else {
            shell.showItemInFolder(resolvedPath);
        }
    } catch (e) {
        shell.showItemInFolder(resolvedPath);
    }
});
ipcMain.on('open-file-os', async (event, p) => {
    if (!p) return;
    try {
        const resolvedPath = path.resolve(p);
        const normalizedPath = path.normalize(resolvedPath);
        if (fs.existsSync(normalizedPath)) {
            const err = await shell.openPath(normalizedPath);
            if (err) {
                console.warn("openPath returned error, using openExternal fallback:", err);
                const fileUrl = require('url').pathToFileURL(normalizedPath).href;
                await shell.openExternal(fileUrl);
            }
        }
    } catch (e) {
        console.error("open-file-os error:", e);
    }
});
ipcMain.on('relaunch-app', () => {
    app.relaunch();
    app.exit(0);
});
ipcMain.handle('get-content-bounds', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win ? win.getContentBounds() : { x: 0, y: 0, width: 0, height: 0 };
});
ipcMain.handle('is-window-focused', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win ? win.isFocused() : false;
});
ipcMain.handle('get-cursor-position', () => {
    const { screen } = require('electron');
    return screen.getCursorScreenPoint();
});
ipcMain.handle('convert-markdown-to-pdf', async (event, { mdPath, pdfPath, htmlContent }) => {
    try {
        const pdfWin = new BrowserWindow({
            show: false,
            webPreferences: { nodeIntegration: false, contextIsolation: true }
        });
        const styledHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; line-height: 1.6; padding: 32px; color: #1e293b; background: #fff; }
                    pre { background: #0f172a; color: #f8fafc; padding: 14px; border-radius: 8px; font-family: monospace; font-size: 11px; white-space: pre-wrap; word-break: break-all; }
                    code { font-family: monospace; background: #f1f5f9; color: #0f172a; padding: 2px 5px; border-radius: 4px; font-size: 11px; }
                    pre code { background: transparent; color: inherit; padding: 0; }
                    h1, h2, h3 { color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
                    blockquote { border-left: 4px solid #3b82f6; margin-left: 0; padding-left: 12px; color: #64748b; }
                </style>
            </head>
            <body>${htmlContent || ''}</body>
            </html>
        `;
        await pdfWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(styledHtml));
        const pdfBuffer = await pdfWin.webContents.printToPDF({
            marginsType: 1,
            printBackground: true,
            pageSize: 'A4'
        });
        fs.writeFileSync(pdfPath, pdfBuffer);
        pdfWin.destroy();
        return true;
    } catch (err) {
        console.error("PDF generation failed:", err);
        return false;
    }
});
ipcMain.on('ondragstart', (event, filePath) => {
    console.log("[MainDrag] Received ondragstart for:", filePath);
    const { nativeImage } = require('electron');
    const resolvedPath = path.resolve(filePath);
    console.log("[MainDrag] Resolved path:", resolvedPath);
    
    const iconPath = path.join(app.getAppPath(), 'assets', 'icon.png');
    const dragIcon = nativeImage.createFromPath(iconPath);
    console.log("[MainDrag] Physical drag icon loaded?", !dragIcon.isEmpty());
    
    try {
        event.sender.startDrag({
            file: resolvedPath,
            icon: dragIcon
        });
        console.log("[MainDrag] startDrag successfully executed");
    } catch (err) {
        console.error("[MainDrag] Error in startDrag:", err);
    }
});// 3. TERMINAL ENGINE (UTF-8 SILVER BULLET - MULTI-TAB SESSION ISOLATED)
const terminalProcesses = {};
ipcMain.on('execute-cmd', (event, arg) => {
    let tabId = 'sub-1';
    let command = '';
    let cwd = process.cwd();
 
    if (typeof arg === 'string') {
        command = arg;
    } else if (arg && typeof arg === 'object') {
        tabId = arg.tabId || 'sub-1';
        command = arg.command || '';
        cwd = arg.cwd || process.cwd();
    }
 
    // Validate directory path (Filter out virtual DRIVES)
    const fs = require('fs');
    let safeCwd = process.cwd();
    try {
        if (cwd && cwd !== 'DRIVES' && fs.existsSync(cwd) && fs.statSync(cwd).isDirectory()) {
            safeCwd = cwd;
        }
    } catch (e) {
        safeCwd = process.cwd();
    }
 
    if (!terminalProcesses[tabId]) {
        try {
            terminalProcesses[tabId] = spawn('powershell.exe', ['-NoExit', '-Command', '-'], {
                cwd: safeCwd,
                env: {
                    ...process.env,
                    PYTHONIOENCODING: 'utf-8',
                    PYTHONUNBUFFERED: '1',
                    FORCE_COLOR: '1',
                    LANG: 'en_US.UTF-8'
                }
            });
            
            terminalProcesses[tabId].on('error', (err) => {
                if (event.sender && !event.sender.isDestroyed()) {
                    event.sender.send('cmd-output', { tabId, data: `[Shell Error] ${err.message}\r\n` });
                }
            });

            // Force UTF-8 Encoding & Unbuffered stream preferences
            terminalProcesses[tabId].stdin.write("[Console]::InputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8\r\n");
            terminalProcesses[tabId].stdin.write("$OutputEncoding = [System.Text.Encoding]::UTF8\r\n");
            terminalProcesses[tabId].stdin.write("$ProgressPreference = 'SilentlyContinue'\r\n");
            terminalProcesses[tabId].stdin.write("$env:PYTHONUNBUFFERED = '1'\r\n");
            
            if (safeCwd) {
                terminalProcesses[tabId].stdin.write(`Set-Location -LiteralPath "${safeCwd.replace(/"/g, '""')}"\r\n`);
            }

            terminalProcesses[tabId].stdout.on('data', (data) => {
                if (event.sender && !event.sender.isDestroyed()) {
                    event.sender.send('cmd-output', { tabId, data: data.toString('utf8') });
                }
            });
            terminalProcesses[tabId].stderr.on('data', (data) => {
                if (event.sender && !event.sender.isDestroyed()) {
                    event.sender.send('cmd-output', { tabId, data: data.toString('utf8') });
                }
            });
        } catch (spawnErr) {
            if (event.sender && !event.sender.isDestroyed()) {
                event.sender.send('cmd-output', { tabId, data: `[Shell Spawn Error] ${spawnErr.message}\r\n` });
            }
        }
    }
    
    if (terminalProcesses[tabId] && terminalProcesses[tabId].stdin) {
        try {
            terminalProcesses[tabId].stdin.write(command + "\r\n");
        } catch (writeErr) {
            event.reply('cmd-output', { tabId, data: `[Shell Write Error] ${writeErr.message}\r\n` });
        }
    }
});

function killTerminalProcess(tabId) {
    if (tabId && terminalProcesses[tabId]) {
        try {
            const proc = terminalProcesses[tabId];
            if (proc.stdin && proc.stdin.writable) {
                try { proc.stdin.write("exit\r\n"); } catch(e) {}
            }
            if (proc.pid) {
                spawn('taskkill', ['/F', '/T', '/PID', proc.pid.toString()]);
            } else {
                proc.kill('SIGKILL');
            }
        } catch (e) {}
        delete terminalProcesses[tabId];
    }
}

ipcMain.on('close-terminal-tab', (event, tabId) => {
    killTerminalProcess(tabId);
});

function killAllTerminalProcesses() {
    Object.keys(terminalProcesses).forEach(tabId => {
        killTerminalProcess(tabId);
    });
    stopDockMover();
}

app.on('before-quit', () => {
    killAllTerminalProcesses();
});
app.on('will-quit', () => {
    killAllTerminalProcesses();
});
// 4. BROWSER VIEW SYNC (Temporarily Disabled per user request - transitioning to <webview>)
let agentBrowserView = null;
ipcMain.on('toggle-agent-view', (event, visible) => {
    // if (!mainWindow) return;
    // if (!agentBrowserView) {
    //     if (!visible) return;
    //     agentBrowserView = new BrowserView();
    //     agentBrowserView.setBackgroundColor('#000');
    //     mainWindow.setBrowserView(agentBrowserView);
    // }
    // if (!visible) {
    //     agentBrowserView.setBounds({ x: -9999, y: -9999, width: 0, height: 0 });
    // }
});
ipcMain.on('load-agent-url', (event, url) => {
    // if (!agentBrowserView) {
    //     agentBrowserView = new BrowserView();
    //     agentBrowserView.setBackgroundColor('#000');
    // }
    // mainWindow.setBrowserView(agentBrowserView);
    // agentBrowserView.webContents.loadURL(url);
});
let currentAgentSelectors = { input: '', send: '' };
ipcMain.on('set-agent-selectors', (event, sels) => {
    currentAgentSelectors = sels;
});
ipcMain.on('ask-web-ai', (event, promptText) => {
    if (!agentBrowserView) {
        event.reply('web-ai-response', "[SYSTEM ERROR] BrowserView is offline.");
        return;
    }
    const { input, send } = currentAgentSelectors;
    if (!input || !send) {
        event.reply('web-ai-response', "[SYSTEM ERROR] No DOM selectors registered for this agent.");
        return;
    }
 
    const script = `
        (async () => {
            try {
                const inputEl = document.querySelector('${input}');
                const sendBtn = document.querySelector('${send}');
                if (!inputEl) return "[SYSTEM ERROR] Input element ('${input}') not found.";
                
                // 1. Focus the element
                inputEl.focus();
                
                // 2. Use insertText command (Mimics real user typing/pasting)
                // This is the most reliable way to trigger React/Vue/ProseMirror state updates
                const textToInject = ${JSON.stringify(promptText)};
                
                // Clear existing content if necessary (optional, but safer for a clean prompt)
                if (inputEl.tagName === 'TEXTAREA' || inputEl.tagName === 'INPUT') {
                    inputEl.value = '';
                } else {
                    inputEl.innerText = '';
                }
                
                document.execCommand('insertText', false, textToInject);
                
                // 3. Dispatch events just in case
                inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                inputEl.dispatchEvent(new Event('change', { bubbles: true }));
                
                // 4. Click the send button after a short delay
                if (sendBtn) {
                    setTimeout(() => {
                        sendBtn.click();
                        // Trigger a mouse click event too for stubborn buttons
                        sendBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                    }, 300);
                    return "SUCCESS: Message injected and send triggered!";
                } else {
                    return "[SYSTEM ERROR] Send button ('${send}') not found.";
                }
            } catch(e) {
                return "[SYSTEM ERROR] Script Exception: " + e.message;
            }
        })();
    `;
    
    agentBrowserView.webContents.executeJavaScript(script).then(result => {
        // NOTE: This currently returns immediately after clicking send.
        // Waiting for the AI's response text will require a more complex observer.
        event.reply('web-ai-response', result);
    }).catch(err => {
        event.reply('web-ai-response', "[SYSTEM ERROR] " + err.message);
    });
});
ipcMain.handle('cdp-native-file-drop', async (event, { webContentsId, files, x, y }) => {
    try {
        const targetWc = webContents.fromId(webContentsId);
        if (!targetWc) {
            throw new Error(`WebContents not found for ID: ${webContentsId}`);
        }

        const dbg = targetWc.debugger;
        if (!dbg.isAttached()) {
            try {
                dbg.attach('1.3');
            } catch(e) {
                console.warn("[CDP] Attach warning:", e.message);
            }
        }

        const fileList = Array.isArray(files) ? files : [files];

        // 1. Try DOM.setFileInputFiles (Playwright / Puppeteer native upload method)
        try {
            await dbg.sendCommand('DOM.enable');
            const doc = await dbg.sendCommand('DOM.getDocument', {});
            if (doc && doc.root && doc.root.nodeId) {
                const inputNode = await dbg.sendCommand('DOM.querySelector', {
                    nodeId: doc.root.nodeId,
                    selector: 'input[type="file"]'
                });

                if (inputNode && inputNode.nodeId && inputNode.nodeId > 0) {
                    console.log("[CDP] Found input[type=file], injecting via DOM.setFileInputFiles:", fileList);
                    await dbg.sendCommand('DOM.setFileInputFiles', {
                        files: fileList,
                        nodeId: inputNode.nodeId
                    });
                    return { success: true, method: 'setFileInputFiles' };
                }
            }
        } catch(domErr) {
            console.warn("[CDP DOM.setFileInputFiles]", domErr.message);
        }

        // 2. Fallback: Input.dispatchDragEvent (OS-level drag drop)
        const targetX = (typeof x === 'number' && Number.isFinite(x) && x > 0) ? Math.round(x) : 300;
        const targetY = (typeof y === 'number' && Number.isFinite(y) && y > 0) ? Math.round(y) : 500;

        const dataPayload = {
            items: [],
            files: fileList,
            dragOperationsMask: 1
        };

        // 1. dragEnter (Enter target zone)
        await dbg.sendCommand('Input.dispatchDragEvent', {
            type: 'dragEnter',
            x: targetX,
            y: targetY,
            data: dataPayload,
            modifiers: 0
        });

        await new Promise(r => setTimeout(r, 200));

        // 2. dragOver (Hover and dwell on target zone to activate dropzone)
        await dbg.sendCommand('Input.dispatchDragEvent', {
            type: 'dragOver',
            x: targetX,
            y: targetY,
            data: dataPayload,
            modifiers: 0
        });

        await new Promise(r => setTimeout(r, 300));

        // 3. drop (Release file payload)
        await dbg.sendCommand('Input.dispatchDragEvent', {
            type: 'drop',
            x: targetX,
            y: targetY,
            data: dataPayload,
            modifiers: 0
        });

        await new Promise(r => setTimeout(r, 250));

        return { success: true, method: 'dispatchDragEvent' };
    } catch (err) {
        console.error("[CDP Drop Error]", err);
        return { success: false, error: err.message };
    }
});

ipcMain.on('sync-agent-view-bounds', (event, bounds) => {
    if (agentBrowserView) agentBrowserView.setBounds(bounds);
});
ipcMain.on('show-context-menu', (event, params) => {
    console.log("[DEBUG] Main Process: show-context-menu received", params);
    const menu = new Menu();
    
    if (params.isEditable) {
        menu.append(new MenuItem({ label: 'Undo', role: 'undo' }));
        menu.append(new MenuItem({ label: 'Redo', role: 'redo' }));
        menu.append(new MenuItem({ type: 'separator' }));
        menu.append(new MenuItem({ label: 'Cut', role: 'cut' }));
        menu.append(new MenuItem({ label: 'Copy', role: 'copy' }));
        menu.append(new MenuItem({ label: 'Paste', role: 'paste' }));
        menu.append(new MenuItem({ label: 'Delete', role: 'delete' }));
        menu.append(new MenuItem({ type: 'separator' }));
        menu.append(new MenuItem({ label: 'Select All', role: 'selectAll' }));
    } else {
        menu.append(new MenuItem({ label: 'Copy', role: 'copy', enabled: params.hasSelection }));
        menu.append(new MenuItem({ label: 'Select All', role: 'selectAll' }));
    }
 
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
        menu.popup({ window: win });
    } else {
        menu.popup();
    }
});
app.commandLine.appendSwitch('lang', 'en-US');

app.whenReady().then(() => {
    session.defaultSession.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36");
    
    // Rewrite User-Agent and Accept-Language on network level for English locale
    session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
        const url = details.url;
        let ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
        if (url.includes("accounts.google.com")) {
            ua = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
        }
        details.requestHeaders['User-Agent'] = ua;
        details.requestHeaders['Accept-Language'] = 'en-US,en;q=0.9';
        callback({ cancel: false, requestHeaders: details.requestHeaders });
    });
    
    createWindow();
});
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});