const { app, BrowserWindow, BrowserView, ipcMain, shell, Menu, MenuItem } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');

let watcher = null;
let currentLogsPath = null;
let currentKnowledgePath = null;

function setupFileWatcher(projectPath) {
    if (watcher) {
        try { watcher.close(); } catch(e) {}
    }
    if (!fs.existsSync(projectPath)) return;
    try {
        watcher = fs.watch(projectPath, { recursive: true }, (eventType, filename) => {
            if (filename && !filename.includes('node_modules') && !filename.includes('.git') && !filename.includes('gravity_vault') && !filename.startsWith('_project_')) {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('refresh-explorer');
                }
            }
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

// 공통 날짜 포맷 함수 (Local Time)
const getLocalDate = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

ipcMain.handle('vault-init', async () => {
    currentKnowledgePath = getVaultPath('knowledge');
    currentLogsPath = getVaultPath('logs');
    const gp = getGlobalVaultPath();
    setupFileWatcher(process.cwd());
    
    // 오늘 날짜의 전체 로그 파일 경로 생성
    const activeLogPath = path.join(currentLogsPath, `${getLocalDate()}.md`);
    
    return { 
        hash: getProjectHash(), 
        activeLogPath, 
        paths: { knowledge: currentKnowledgePath, logs: currentLogsPath, global: gp } 
    };
});

ipcMain.on('vault-log', (event, { logPath, role, text }) => {
    // Stub: 로컬 AI 로깅 비활성화
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
    const root = projectPath || process.cwd();
    const ignore = ['node_modules', '.git', 'gravity_vault', 'dist', 'build', 'lib', 'scratch', 'out', '.vs', '.idea'];
    const results = [];

    function traverse(dir, depth = 0) {
        if (depth > 10) return; // 최대 10단계 제한
        let items = [];
        try {
            items = fs.readdirSync(dir);
        } catch (e) {
            return;
        }
        items.forEach(item => {
            if (ignore.includes(item) || item.startsWith('_project_')) return;
            const fullPath = path.join(dir, item);
            try {
                const stats = fs.statSync(fullPath);
                const relativePath = path.relative(root, fullPath).replace(/\\/g, '/');
                if (stats.isDirectory()) {
                    results.push(relativePath + '/');
                    traverse(fullPath, depth + 1);
                } else if (stats.isFile()) {
                    results.push(relativePath);
                }
            } catch (err) {
                // skip
            }
        });
    }

    traverse(root);
    if (results.length === 0) {
        return "[WARNING: No files or directories found in target root path]";
    }
    return results.map(p => `- ${p}`).join('\n');
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

// [신규] 파일 목록을 받아서 실제 코드 내용을 읽어 반환
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
let dockedOriginalStyle = null;
let moverProcess = null;

function startDockMover() {
    if (moverProcess && !moverProcess.killed) return;
    const scriptPath = path.join(__dirname, 'js/ui/dock_mover.ps1');
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
    const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class W { [DllImport(\\"user32.dll\\", EntryPoint = \\"SetWindowLongPtrW\\")] public static extern IntPtr SetWindowLongPtr64(IntPtr h, int idx, IntPtr val); [DllImport(\\"user32.dll\\", EntryPoint = \\"SetWindowLongW\\")] public static extern IntPtr SetWindowLong32(IntPtr h, int idx, IntPtr val); }'; if ([IntPtr]::Size -eq 8) { [W]::SetWindowLongPtr64([IntPtr][int64]${hwnd}, -8, [IntPtr][int64]${ownerHwnd}) } else { [W]::SetWindowLong32([IntPtr][int64]${hwnd}, -8, [IntPtr][int64]${ownerHwnd}) }"`;
    spawn('cmd.exe', ['/c', cmd]);
}

function restoreWindowStyle(hwnd, style) {
    if (!hwnd || !style) return;
    const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class W { [DllImport(\\"user32.dll\\", EntryPoint = \\"SetWindowLongPtrW\\")] public static extern IntPtr SetWindowLongPtr64(IntPtr h, int idx, IntPtr val); [DllImport(\\"user32.dll\\", EntryPoint = \\"SetWindowLongW\\")] public static extern IntPtr SetWindowLong32(IntPtr h, int idx, IntPtr val); [DllImport(\\"user32.dll\\")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags); }'; if ([IntPtr]::Size -eq 8) { [W]::SetWindowLongPtr64([IntPtr][int64]${hwnd}, -16, [IntPtr][int64]${style}) } else { [W]::SetWindowLong32([IntPtr][int64]${hwnd}, -16, [IntPtr][int64]${style}) }; [W]::SetWindowPos([IntPtr][int64]${hwnd}, [IntPtr]0, 0, 0, 0, 0, 39)"`;
    spawn('cmd.exe', ['/c', cmd]);
}

ipcMain.on('register-docked-hwnd', (event, hwnd) => {
    if (dockedHwnd && !hwnd) {
        // Restore owner of the previously docked window to independent (0)
        setWindowOwner(dockedHwnd, 0);
        
        // Restore original window style
        if (dockedOriginalStyle) {
            restoreWindowStyle(dockedHwnd, dockedOriginalStyle);
        }
        
        stopDockMover();
        dockedOriginalStyle = null;
    }
    dockedHwnd = hwnd;
});

ipcMain.on('register-docked-original-style', (event, style) => {
    dockedOriginalStyle = style;
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
        backgroundColor: '#0c0c0e',
        frame: false,
        icon: path.join(__dirname, 'png.png'),
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

    let moveTimeout = null;
    const syncDockedPosition = () => {
        if (dockedHwnd && mainWindow) {
            mainWindow.webContents.send('parent-window-moved-or-resized');
        }
    };
    mainWindow.on('move', () => {
        clearTimeout(moveTimeout);
        moveTimeout = setTimeout(syncDockedPosition, 150);
    });
    mainWindow.on('resize', () => {
        clearTimeout(moveTimeout);
        moveTimeout = setTimeout(syncDockedPosition, 150);
    });

    // 기본 상단 메뉴 제거
    Menu.setApplicationMenu(null);

    // 단축키 제어 (Ctrl+Shift+I/F12 개발자도구, Ctrl+R/F5 새로고침 작동)
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

    mainWindow.loadFile('index.html');
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
        if (fs.existsSync(RECENT_PROJECTS_FILE)) return JSON.parse(fs.readFileSync(RECENT_PROJECTS_FILE, 'utf-8'));
    } catch(e) {}
    return [];
}
function saveRecentProjects(list) {
    try { fs.writeFileSync(RECENT_PROJECTS_FILE, JSON.stringify(list), 'utf-8'); } catch(e) {}
}

ipcMain.handle('select-folder-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    if (result.canceled || !result.filePaths.length) return null;
    const selected = result.filePaths[0];
    // 최근 프로젝트 저장 (중복 제거, 최대 10개)
    let recents = loadRecentProjects().filter(p => p !== selected);
    recents.unshift(selected);
    if (recents.length > 10) recents = recents.slice(0, 10);
    saveRecentProjects(recents);
    return selected;
});

ipcMain.handle('get-recent-projects', async () => loadRecentProjects());

ipcMain.on('save-recent-project', (event, folderPath) => {
    let recents = loadRecentProjects().filter(p => p !== folderPath);
    recents.unshift(folderPath);
    if (recents.length > 10) recents = recents.slice(0, 10);
    saveRecentProjects(recents);
});


ipcMain.handle('get-directory-content', async (event, dirPath) => {
    try {
        const targetPath = dirPath || process.cwd();
        const files = fs.readdirSync(targetPath, { withFileTypes: true });
        return files.map(file => ({
            name: file.name,
            isDir: file.isDirectory()
        }));
    } catch (err) {
        console.error('Dir Read Error:', err);
        return [];
    }
});

ipcMain.on('reveal-in-explorer', (event, p) => {
    if (p) shell.showItemInFolder(path.resolve(p));
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

ipcMain.on('ondragstart', (event, filePath) => {
    console.log("[MainDrag] Received ondragstart for:", filePath);
    const { nativeImage } = require('electron');
    const resolvedPath = path.resolve(filePath);
    console.log("[MainDrag] Resolved path:", resolvedPath);
    
    const iconPath = path.join(__dirname, 'png.png');
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

    // 디렉토리 경로 검증 (가상경로 DRIVES 거르기)
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
                env: { ...process.env, PYTHONIOENCODING: 'utf-8', LANG: 'ko_KR.UTF-8' }
            });
            
            terminalProcesses[tabId].on('error', (err) => {
                event.reply('cmd-output', { tabId, data: `[Shell Error] ${err.message}\r\n` });
            });

            // Force UTF-8 Encoding
            terminalProcesses[tabId].stdin.write("[Console]::InputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8\r\n");
            terminalProcesses[tabId].stdin.write("$OutputEncoding = [System.Text.Encoding]::UTF8\r\n");
            
            // cd 명령어를 통해 실제 powershell의 디렉토리가 변경될 수 있으므로, 최초 cwd에 맞게 동기화
            if (safeCwd) {
                terminalProcesses[tabId].stdin.write(`cd "${safeCwd.replace(/"/g, '""')}"\r\n`);
            }

            terminalProcesses[tabId].stdout.on('data', (data) => {
                event.reply('cmd-output', { tabId, data: data.toString() });
            });
            terminalProcesses[tabId].stderr.on('data', (data) => {
                event.reply('cmd-output', { tabId, data: data.toString() });
            });
        } catch (spawnErr) {
            event.reply('cmd-output', { tabId, data: `[Spawn Fail] ${spawnErr.message}\r\n` });
        }
    }
    
    if (terminalProcesses[tabId] && terminalProcesses[tabId].stdin) {
        try {
            terminalProcesses[tabId].stdin.write(`${command}\r\n`);
        } catch (writeErr) {
            event.reply('cmd-output', { tabId, data: `[Write Fail] ${writeErr.message}\r\n` });
        }
    }
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

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
