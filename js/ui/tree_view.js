if (typeof ipcRenderer === 'undefined') { var { ipcRenderer } = require('electron'); }

// Tree View Rendering for Poor man's Gravity
// Pure logic for directory tree

function sortFiles(files) {
    if (!Array.isArray(files)) return [];
    return [...files].sort((a, b) => {
        // Folders first
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        // Then alphabetical
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
}

function getFileIcon(name) {
    const fileName = name.toLowerCase();
    const ext = name.split('.').pop().toLowerCase();

    // Special exact filename matches
    if (fileName === '.gitignore' || fileName === '.gitattributes') {
        return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><line x1="2" y1="12" x2="8" y2="12"></line><line x1="16" y1="12" x2="22" y2="12"></line></svg>`;
    }
    if (fileName === 'package.json' || fileName === 'package-lock.json') {
        return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#cb3837" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 9.4L7.55 4.24a1.8 1.8 0 0 0-1.8 0L2.1 6.35a1.8 1.8 0 0 0-.9 1.56v8.32a1.8 1.8 0 0 0 .9 1.56l3.65 2.11a1.8 1.8 0 0 0 1.8 0l8.95-5.16a1.8 1.8 0 0 0 .9-1.56V10.96a1.8 1.8 0 0 0-.9-1.56z"></path><polyline points="2.1 6.35 12 12.01 21.9 6.35"></polyline><line x1="12" y1="12.01" x2="12" y2="22.5"></line></svg>`;
    }
    if (fileName.startsWith('.env')) {
        return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#eab308" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M7 14h4M7 10h10"></path></svg>`;
    }

    switch (ext) {
        // JavaScript
        case 'js': case 'cjs': case 'mjs':
            return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><text x="12" y="17" font-family="'JetBrains Mono', 'Consolas', monospace" font-weight="900" font-size="15" fill="#f59e0b" text-anchor="middle" letter-spacing="-0.5px">JS</text></svg>`;
        
        // TypeScript
        case 'ts': case 'mts': case 'cts':
            return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><text x="12" y="17" font-family="'JetBrains Mono', 'Consolas', monospace" font-weight="900" font-size="15" fill="#3b82f6" text-anchor="middle" letter-spacing="-0.5px">TS</text></svg>`;
        
        // React JSX / TSX
        case 'jsx': case 'tsx':
            return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(30 12 12)"></ellipse><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(150 12 12)"></ellipse><circle cx="12" cy="12" r="1.8" fill="#06b6d4"></circle></svg>`;
        
        // HTML
        case 'html': case 'htm':
            return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 17 20 12 15 7"></polyline><polyline points="9 7 4 12 9 17"></polyline></svg>`;
        
        // CSS / SCSS / LESS
        case 'css': case 'scss': case 'sass': case 'less':
            return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="9" x2="19" y2="9"></line><line x1="5" y1="15" x2="19" y2="15"></line><line x1="10" y1="4" x2="8" y2="20"></line><line x1="16" y1="4" x2="14" y2="20"></line></svg>`;
        
        // Python
        case 'py': case 'pyw': case 'ipynb':
            return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a4.5 4.5 0 0 0-4.5 4.5V10h9V7.5A4.5 4.5 0 0 0 12 3z"></path><path d="M12 21a4.5 4.5 0 0 0 4.5-4.5V14h-9v2.5A4.5 4.5 0 0 0 12 21z"></path><circle cx="9.5" cy="6" r="1" fill="#3b82f6"></circle><circle cx="14.5" cy="18" r="1" fill="#3b82f6"></circle></svg>`;
        
        // JSON / YAML / TOML
        case 'json': case 'jsonc': case 'yaml': case 'yml': case 'toml':
            return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a3e635" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4H7a2 2 0 0 0-2 2v2a2 2 0 0 1-2 2 2 2 0 0 1 2 2v2a2 2 0 0 0 2 2h1"></path><path d="M16 4h1a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2 2 2 0 0 0-2 2v2a2 2 0 0 1-2 2h-1"></path></svg>`;
        
        // Markdown
        case 'md': case 'markdown':
            return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M7 14V10l2.5 2.5L12 10v4M17 10v4M15 12l2 2 2-2"></path></svg>`;

        // Shell / Bash / Batch / PowerShell
        case 'sh': case 'bash': case 'zsh': case 'bat': case 'cmd': case 'ps1':
            return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 16 10 11 4 6"></polyline><line x1="12" y1="18" x2="19" y2="18"></line></svg>`;

        // C / C++ / Rust / Go / Java / C#
        case 'c': case 'cpp': case 'cc': case 'h': case 'hpp': case 'cs':
            return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 3 3 7.5 3 16.5 12 21 21 16.5 21 7.5 12 3"></polygon><polyline points="3 7.5 12 12 21 7.5"></polyline><line x1="12" y1="12" x2="12" y2="21"></line></svg>`;
        
        case 'rs':
            return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"></circle><path d="M9 9h3a2 2 0 0 1 0 4H9v3"></path><path d="M12 13l3 3"></path></svg>`;

        case 'go':
            return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00add8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="12" rx="8.5" ry="5.5"></ellipse><circle cx="9" cy="11" r="1.2" fill="#00add8"></circle><circle cx="15" cy="11" r="1.2" fill="#00add8"></circle></svg>`;

        case 'java': case 'kt': case 'kts':
            return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a3.5 3.5 0 0 1 0 7h-1"></path><path d="M3 8h14v8a3.5 3.5 0 0 1-3.5 3.5H6.5A3.5 3.5 0 0 1 3 16V8z"></path><line x1="6.5" y1="2" x2="6.5" y2="5"></line><line x1="10" y1="2" x2="10" y2="5"></line><line x1="13.5" y1="2" x2="13.5" y2="5"></line></svg>`;

        case 'php':
            return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="12" rx="9" ry="5.5"></ellipse><path d="M7.5 9.5v5M12 9.5v5M16.5 9.5v5"></path></svg>`;

        // Images
        case 'png': case 'jpg': case 'jpeg': case 'gif': case 'svg': case 'webp': case 'bmp': case 'ico':
            return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`;

        // Audio & Video
        case 'mp3': case 'wav': case 'ogg': case 'flac': case 'mp4': case 'webm': case 'mkv': case 'avi': case 'mov':
            return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c084fc" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`;

        // Archives / Zip
        case 'zip': case 'rar': case '7z': case 'tar': case 'gz':
            return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>`;

        // Default document icon
        default:
            return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`;
    }
}



async function renderTree(basePath, rootFiles, searchQuery = '') {
    const fileTree = document.getElementById('file-tree');
    if (!fileTree) return;
    
    // Save scroll position
    const savedScrollPos = fileTree.scrollTop;
    
    // Double buffering: Render asynchronously to temp container offscreen to avoid flickering
    const tempContainer = document.createElement('div');
    
    let sortedFiles = sortFiles(rootFiles);

    // Normalize paths for exact comparison against the original projectRoot
    const normBase = (basePath && basePath !== 'DRIVES') ? basePath.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase() : 'DRIVES';
    const normRoot = (window.projectRoot && window.projectRoot !== 'DRIVES') ? window.projectRoot.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase() : '';

    // Hide ../ at Select Folder root (./), show ../ ONLY when inside subfolders!
    const isAtRoot = (normBase === 'DRIVES') || (!normRoot) || (normBase === normRoot);

    if (!isAtRoot) {
        sortedFiles.unshift({ name: '../', isDir: true, isParentEntry: true });
    }
    
    // 백그라운드 렌더링
    await renderLevel(basePath, sortedFiles, tempContainer, 0, searchQuery);
    
    // 렌더 완료 후 동기적으로 노드 일괄 스왑
    fileTree.innerHTML = '';

    const isManual = window._isManualTreeRefresh === true;
    window._isManualTreeRefresh = false;

    const nodes = Array.from(tempContainer.children);
    nodes.forEach((node, index) => {
        if (isManual) {
            node.classList.add('cascade-appear');
            node.style.animationDelay = `${Math.min(index * 35, 600)}ms`;
        }
        fileTree.appendChild(node);
    });
    
    // Restore scroll position
    fileTree.scrollTop = savedScrollPos;
}

async function dirContainsMatch(dirPath, query) {
    if (!query) return false;
    try {
        const files = await window.fetchDirContent(dirPath);
        if (!Array.isArray(files)) return false;
        const q = query.toLowerCase();
        for (const file of files) {
            if (!file || !file.name || file.name.toLowerCase().startsWith('_project')) continue;
            if (file.name.toLowerCase().includes(q)) return true;
            if (file.isDir && !file.isParentEntry) {
                const sep = (dirPath.endsWith('\\') || dirPath.endsWith('/')) ? '' : '\\';
                const subPath = dirPath + sep + file.name;
                const match = await dirContainsMatch(subPath, query);
                if (match) return true;
            }
        }
    } catch(e) {}
    return false;
}

async function renderLevel(parentPath, files, container, level, searchQuery = '') {
    if (!Array.isArray(files)) return;
    
    // Ensure this level is also sorted (for expanded subdirectories)
    const sorted = level > 0 ? sortFiles(files) : files; // root level already sorted in renderTree

    for (const file of sorted) {
        if (!file) continue;
        
        const name = file.name;
        if (name && name.toLowerCase().startsWith('_project')) {
            continue;
        }
        const isDir = file.isDir;
        const isParentEntry = file.isParentEntry === true;

        // Correct Path Joining for Windows
        let fullPath = '';
        if (parentPath === 'DRIVES') {
            fullPath = name;
        } else {
            const pPath = parentPath || '';
            const base = pPath.endsWith('\\') ? pPath : pPath + '\\';
            fullPath = base + name;
        }

        if (searchQuery && searchQuery.trim() !== '' && !isParentEntry) {
            const q = searchQuery.trim().toLowerCase();
            const selfMatch = name.toLowerCase().includes(q);
            if (isDir) {
                const childMatch = await dirContainsMatch(fullPath, searchQuery.trim());
                if (!selfMatch && !childMatch) {
                    continue;
                }
                if (childMatch) {
                    window.expandedPaths.add(fullPath);
                }
            } else {
                if (!selfMatch) {
                    continue;
                }
            }
        }
        
        const isExpanded = window.expandedPaths.has(fullPath);
        
        const node = document.createElement('div');
        node.className = `tree-node ${isDir ? 'dir-node' : 'file-node'}`;
        
        const item = document.createElement('div');
        item.className = `file-item ${isDir && !isParentEntry ? 'directory' : 'file'} ${window.currentFilePath === fullPath ? 'active' : ''}`;
        item.dataset.path = fullPath;
        item.style.setProperty('--level', level);
        
        const arrowSpan = document.createElement('span');
        arrowSpan.className = 'tree-arrow' + (isExpanded ? ' expanded' : '');
        // No arrow for ../ (Parent Entry)
        if (isDir && !isParentEntry) {
            arrowSpan.innerHTML = `<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
        } else {
            arrowSpan.innerHTML = '';
        }
        
        const iconSpan = document.createElement('span');
        iconSpan.className = 'file-icon';
        if (isDir) {
            // Expanded/Collapsed Folder SVGs with premium gray-scale colors
            iconSpan.innerHTML = isExpanded 
                ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`
                : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#71717a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
        } else {
            iconSpan.innerHTML = getFileIcon(name);
        }


        const nameSpan = document.createElement('span');
        nameSpan.className = 'file-name';
        if (searchQuery && !isParentEntry) {
            const regex = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
            nameSpan.innerHTML = name.replace(regex, '<mark>$1</mark>');
        } else {
            nameSpan.textContent = name;
        }

        item.appendChild(arrowSpan);
        item.appendChild(iconSpan);
        item.appendChild(nameSpan);

        // Copy Path Button - Skip for ../
        if (!isParentEntry) {
            const copyPathBtn = document.createElement('span');
            copyPathBtn.className = 'copy-path-btn';
            copyPathBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
            copyPathBtn.title = isDir ? `Copy absolute path (directory)` : `Copy absolute path`;
            copyPathBtn.onclick = async (e) => {
                e.stopPropagation();
                await navigator.clipboard.writeText(fullPath);
                
                const originalIcon = copyPathBtn.innerHTML;
                copyPathBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                setTimeout(() => {
                    copyPathBtn.innerHTML = originalIcon;
                }, 1000);
            };
            item.appendChild(copyPathBtn);
        }

        // Sub-folder Fold/Unfold Toggle Button (>< / <>) - Skip for ../
        if (isDir && !isParentEntry) {
            const folderFoldBtn = document.createElement('span');
            folderFoldBtn.className = 'folder-fold-btn';
            
            const sep = fullPath.includes('/') ? '/' : '\\';
            const folderPrefix = fullPath.endsWith(sep) ? fullPath : fullPath + sep;
            const hasExpandedSub = window.expandedPaths && Array.from(window.expandedPaths).some(p => p === fullPath || p.startsWith(folderPrefix));

            folderFoldBtn.innerHTML = hasExpandedSub
                ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 4 12 9 7 4"></polyline><polyline points="7 20 12 15 17 20"></polyline></svg>`
                : `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 9 12 4 17 9"></polyline><polyline points="7 15 12 20 17 15"></polyline></svg>`;
            folderFoldBtn.title = hasExpandedSub ? 'Collapse sub-folders' : 'Expand sub-folders';
            folderFoldBtn.onclick = (e) => {
                window.toggleFolderSubTree(fullPath, e);
            };
            item.appendChild(folderFoldBtn);
        }

        // Drill-down Button (→) - Skip for ../
        if (isDir && !isParentEntry) {
            const drillBtn = document.createElement('span');
            drillBtn.className = 'jump-folder-btn';
            // Override folder margin-left to stack next to copy-path-btn
            drillBtn.style.marginLeft = '2px';
            drillBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>`; 
            drillBtn.title = `Navigate into this folder`;
            drillBtn.onclick = (e) => {
                e.stopPropagation();
                window.loadDirectory(fullPath); 
            };
            item.appendChild(drillBtn);
        }

        item.onclick = async (e) => {
            e.stopPropagation();
            
            if (isParentEntry) {
                // Real Parent Navigation
                if (parentPath === 'DRIVES') return;
                const path = require('path');
                const up = path.dirname(parentPath);
                window.loadDirectory(up === parentPath ? 'DRIVES' : up);
                return;
            }

            // Selection Highlight
            document.querySelectorAll('.file-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');

            if (isDir) {
                await toggleFolderNode(node, fullPath, level, searchQuery);
            } else {
                window.currentFilePath = fullPath; // 파일 선택은 별도 변수
                if (window.openFileInEditor) {
                    window.openFileInEditor(fullPath);
                }
            }
        };


        // Drag and Drop Item Move Implementation
        if (!isParentEntry) {
            item.draggable = true;
            item.addEventListener('dragstart', (e) => {
                e.stopPropagation();
                const fileUri = 'file:///' + fullPath.replace(/\\/g, '/');
                e.dataTransfer.setData('text/plain', fullPath);
                e.dataTransfer.setData('text/uri-list', fileUri);
                e.dataTransfer.effectAllowed = 'copyMove';
                window._draggingTreePath = fullPath;
                window._lastDraggedTreePath = fullPath;
                item.style.opacity = '0.4';

                if (typeof window.setCoverLifted === 'function') {
                    window.setCoverLifted(true);
                }
            });
            item.addEventListener('dragend', () => {
                window._draggingTreePath = null;
                item.style.opacity = '1';
                document.querySelectorAll('.file-item').forEach(el => el.classList.remove('tree-drag-over'));
            });
        }

        // Allow drop on both folders and files (dropping on a file moves to its parent folder)
        const targetDir = isDir ? fullPath : require('path').dirname(fullPath);

        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            if (isDir) {
                item.classList.add('tree-drag-over');
            }
        });

        item.addEventListener('dragleave', (e) => {
            e.stopPropagation();
            if (!item.contains(e.relatedTarget)) {
                item.classList.remove('tree-drag-over');
            }
        });

        item.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            item.classList.remove('tree-drag-over');

            const pathModule = require('path');
            const fs = require('fs');

            let srcPath = window._draggingTreePath || window._lastDraggedTreePath;
            if (!srcPath && e.dataTransfer) {
                try { srcPath = e.dataTransfer.getData('text/plain'); } catch(err){}
                if (!srcPath && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    srcPath = e.dataTransfer.files[0].path;
                }
            }
            window._draggingTreePath = null;
            window._lastDraggedTreePath = null;

            if (!srcPath) return;

            const absSrc = pathModule.resolve(srcPath);
            const absDstDir = pathModule.resolve(targetDir);

            if (absSrc === absDstDir) return;

            if (absDstDir.startsWith(absSrc + pathModule.sep)) {
                alert("Cannot move a folder into its own subfolder.");
                return;
            }

            const fileName = pathModule.basename(absSrc);
            const targetDestPath = pathModule.join(absDstDir, fileName);

            if (absSrc === targetDestPath) return;

            const doMoveItem = () => {
                try {
                    try {
                        fs.renameSync(absSrc, targetDestPath);
                    } catch (renameErr) {
                        const stat = fs.statSync(absSrc);
                        if (stat.isDirectory()) {
                            fs.cpSync(absSrc, targetDestPath, { recursive: true });
                            fs.rmSync(absSrc, { recursive: true, force: true });
                        } else {
                            fs.copyFileSync(absSrc, targetDestPath);
                            fs.unlinkSync(absSrc);
                        }
                    }
                    if (typeof window.refreshTreeAll === 'function') {
                        window.refreshTreeAll();
                    } else if (typeof window.loadDirectory === 'function') {
                        window.loadDirectory(window.currentPath || process.cwd());
                    }
                    if (typeof window.showUserScreenToast === 'function') {
                        window.showUserScreenToast(`Moved ${fileName}`, 2500);
                    }
                } catch (err) {
                    alert("Failed to move item: " + err.message);
                }
            };

            if (fs.existsSync(targetDestPath)) {
                window.showCustomConfirm(
                    "Overwrite Item",
                    `Item <strong style="color:#f4f4f5">${fileName}</strong> already exists in target folder. Do you want to overwrite it?`,
                    doMoveItem,
                    { showIcon: false, confirmText: 'Overwrite', confirmBg: 'var(--primary, #468CF6)' }
                );
            } else {
                doMoveItem();
            }
        });

        item.oncontextmenu = (e) => {
            if (isParentEntry) return;
            if (typeof window.showFolderContextMenu === 'function') {
                window.showFolderContextMenu(e, fullPath, isDir);
            }
        };

        node.appendChild(item);

        if (isDir && isExpanded && !isParentEntry) {
            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'tree-children';
            node.appendChild(childrenContainer);
            const subFiles = await window.fetchDirContent(fullPath);
            await renderLevel(fullPath, subFiles, childrenContainer, level + 1, searchQuery);
        }
        container.appendChild(node);
    }
}

async function toggleFolderNode(node, fullPath, level, searchQuery) {
    const isExpanded = window.expandedPaths.has(fullPath);
    const item = node.querySelector('.file-item');
    const arrowSpan = item ? item.querySelector('.tree-arrow') : null;
    const iconSpan = item ? item.querySelector('.file-icon') : null;
    const foldBtn = item ? item.querySelector('.folder-fold-btn') : null;
    
    let childrenContainer = node.querySelector(':scope > .tree-children');

    if (isExpanded) {
        window.expandedPaths.delete(fullPath);
        if (childrenContainer) childrenContainer.remove();
        if (arrowSpan) arrowSpan.classList.remove('expanded');
        if (iconSpan) {
            iconSpan.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#71717a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
        }
        if (foldBtn) {
            foldBtn.title = 'Expand sub-folders';
            foldBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 9 12 4 17 9"></polyline><polyline points="7 15 12 20 17 15"></polyline></svg>`;
        }
    } else {
        window.expandedPaths.add(fullPath);
        if (arrowSpan) arrowSpan.classList.add('expanded');
        if (iconSpan) {
            iconSpan.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
        }
        if (foldBtn) {
            foldBtn.title = 'Collapse sub-folders';
            foldBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 4 12 9 7 4"></polyline><polyline points="7 20 12 15 17 20"></polyline></svg>`;
        }

        if (!childrenContainer) {
            childrenContainer = document.createElement('div');
            childrenContainer.className = 'tree-children';
            node.appendChild(childrenContainer);
            const subFiles = await window.fetchDirContent(fullPath);
            await renderLevel(fullPath, subFiles, childrenContainer, level + 1, searchQuery);
        }
    }
}

window.renderTree = renderTree;
window.expandedPaths = new Set();

window.toggleFolderSubTree = async (folderPath, event) => {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    if (!window.expandedPaths) window.expandedPaths = new Set();
    
    const sep = folderPath.includes('/') ? '/' : '\\';
    const folderPrefix = folderPath.endsWith(sep) ? folderPath : folderPath + sep;

    const subExpanded = Array.from(window.expandedPaths).filter(p => p === folderPath || p.startsWith(folderPrefix));

    if (subExpanded.length > 0) {
        subExpanded.forEach(p => window.expandedPaths.delete(p));
        document.querySelectorAll('.file-item.directory').forEach(item => {
            const p = item.dataset.path;
            if (p && (p === folderPath || p.startsWith(folderPrefix))) {
                const node = item.closest('.tree-node');
                if (node) {
                    const children = node.querySelector(':scope > .tree-children');
                    if (children) children.remove();
                    const arrow = item.querySelector('.tree-arrow');
                    if (arrow) arrow.classList.remove('expanded');
                    const icon = item.querySelector('.file-icon');
                    if (icon) icon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#71717a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
                }
            }
        });
    } else {
        window.expandedPaths.add(folderPath);
        async function collectSubDirs(dirPath) {
            try {
                const files = await window.fetchDirContent(dirPath);
                if (!Array.isArray(files)) return;
                for (const f of files) {
                    if (f && f.isDir && !f.isParentEntry && !f.name.toLowerCase().startsWith('_project')) {
                        const childPath = dirPath.endsWith(sep) ? dirPath + f.name : dirPath + sep + f.name;
                        window.expandedPaths.add(childPath);
                        await collectSubDirs(childPath);
                    }
                }
            } catch (err) {
                console.error("Failed collecting subdirs:", err);
            }
        }
        await collectSubDirs(folderPath);
        if (window.loadDirectory) window.loadDirectory(window.currentPath || process.cwd());
    }
};

// Tree hierarchy line active hover tracking (deepest folder container only)
let lastHoveredChildren = null;
document.addEventListener('mouseover', (e) => {
    const targetChildren = e.target ? e.target.closest('.tree-children') : null;
    if (targetChildren === lastHoveredChildren) return;
    lastHoveredChildren = targetChildren;

    const allActive = document.querySelectorAll('.tree-children.active-tree-hover');
    if (targetChildren) {
        allActive.forEach(el => {
            if (el !== targetChildren) el.classList.remove('active-tree-hover');
        });
        targetChildren.classList.add('active-tree-hover');
    } else {
        allActive.forEach(el => el.classList.remove('active-tree-hover'));
    }
});

window.showCustomPrompt = function(title, placeholder, callback) {
    const old = document.getElementById('custom-input-prompt-modal');
    if (old) old.remove();

    const modal = document.createElement('div');
    modal.id = 'custom-input-prompt-modal';
    modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.65); backdrop-filter:blur(6px); z-index:999999; display:flex; align-items:center; justify-content:center; font-family:"DM Sans", sans-serif;';
    
    modal.innerHTML = `
        <div style="background: var(--surface-color, #121216); border: 1px solid var(--border-color, rgba(255,255,255,0.12)); border-radius: 12px; padding: 20px; width: 340px; box-shadow: 0 16px 40px rgba(0,0,0,0.6); display: flex; flex-direction: column; gap: 14px;">
            <div style="font-size: 13.5px; font-weight: 700; color: #ffffff;">${title}</div>
            <input type="text" id="custom-prompt-input" placeholder="${placeholder}" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); color: #fff; padding: 9px 12px; border-radius: 6px; font-size: 12.5px; outline: none; width: 100%; box-sizing: border-box;">
            <div style="display: flex; justify-content: flex-end; gap: 8px;">
                <button id="btn-prompt-cancel" style="background: rgba(255,255,255,0.08); border: none; color: #a1a1aa; padding: 6px 14px; border-radius: 6px; font-size: 12px; cursor: pointer;">Cancel</button>
                <button id="btn-prompt-ok" style="background: #38bdf8; border: none; color: #000; font-weight: 700; padding: 6px 16px; border-radius: 6px; font-size: 12px; cursor: pointer;">OK</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    const inputEl = modal.querySelector('#custom-prompt-input');
    if (inputEl) inputEl.focus();

    const closeModal = () => modal.remove();

    const submit = () => {
        const val = inputEl ? inputEl.value.trim() : '';
        closeModal();
        if (val && typeof callback === 'function') callback(val);
    };

    modal.querySelector('#btn-prompt-ok').onclick = submit;
    modal.querySelector('#btn-prompt-cancel').onclick = closeModal;
    inputEl.onkeydown = (e) => {
        if (e.key === 'Enter') submit();
        if (e.key === 'Escape') closeModal();
    };
};

window.showCustomConfirm = function(title, message, onConfirm, options = {}) {
    const oldModal = document.getElementById('custom-confirm-modal');
    if (oldModal) oldModal.remove();

    const opt = typeof options === 'object' ? options : { showIcon: options === true };
    const showIcon = opt.showIcon === true;
    const confirmText = opt.confirmText || 'OK';
    const confirmBg = opt.confirmBg || 'var(--primary, #468CF6)';

    const modal = document.createElement('div');
    modal.id = 'custom-confirm-modal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0, 0, 0, 0.65); backdrop-filter: blur(4px);
        display: flex; justify-content: center; align-items: center;
        z-index: 100000;
    `;

    const iconHtml = showIcon ? `
        <div style="width: 32px; height: 32px; border-radius: 50%; background: rgba(239, 68, 68, 0.15); display: flex; align-items: center; justify-content: center; color: #ef4444; flex-shrink: 0;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </div>
    ` : '';

    modal.innerHTML = `
        <div style="background: #18181b; border: 1px solid #3f3f46; border-radius: 10px; width: 340px; padding: 20px; box-shadow: 0 16px 36px rgba(0,0,0,0.5); color: #f4f4f5; font-family: sans-serif; animation: modal-pop 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
                ${iconHtml}
                <div style="font-weight: 600; font-size: 15px; color: #f4f4f5;">${title}</div>
            </div>
            <div style="font-size: 13px; color: #a1a1aa; line-height: 1.5; margin-bottom: 20px; word-break: break-all;">
                ${message}
            </div>
            <div style="display: flex; justify-content: flex-end; gap: 8px;">
                <button id="btn-confirm-cancel" style="background: #27272a; border: 1px solid #3f3f46; color: #a1a1aa; padding: 7px 14px; border-radius: 6px; font-size: 12px; cursor: pointer; transition: background 0.15s;">Cancel</button>
                <button id="btn-confirm-ok" style="background: ${confirmBg}; border: none; color: #ffffff; padding: 7px 16px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; transition: opacity 0.15s;">${confirmText}</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();

    modal.querySelector('#btn-confirm-cancel').onclick = closeModal;
    modal.querySelector('#btn-confirm-ok').onclick = () => {
        closeModal();
        if (typeof onConfirm === 'function') onConfirm();
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            closeModal();
            document.removeEventListener('keydown', handleKeyDown);
            if (typeof onConfirm === 'function') onConfirm();
        }
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', handleKeyDown);
        }
    };
    document.addEventListener('keydown', handleKeyDown);
};

window.showInlineTreeInput = function(parentDir, isFolder = false, targetNode = null) {
    const fileTree = document.getElementById('file-tree');
    if (!fileTree) return;

    const oldInline = document.querySelector('.tree-inline-input-wrapper');
    if (oldInline) oldInline.remove();

    let targetLevel = 0;
    if (targetNode) {
        const item = targetNode.querySelector('.file-item');
        if (item && item.style.getPropertyValue('--level')) {
            targetLevel = parseInt(item.style.getPropertyValue('--level') || '0', 10);
            if (item.classList.contains('directory')) {
                targetLevel += 1;
            }
        }
    }

    if (targetNode) {
        const item = targetNode.querySelector('.file-item');
        const isDirItem = item && item.classList.contains('directory');
        if (isDirItem) {
            const subContainer = targetNode.querySelector(':scope > .tree-children');
            if (subContainer) {
                insertInline(subContainer, targetLevel);
                return;
            } else {
                if (item) item.click();
                setTimeout(() => {
                    const newSub = targetNode.querySelector(':scope > .tree-children');
                    insertInline(newSub || fileTree, targetLevel);
                }, 180);
                return;
            }
        } else {
            const parentChildrenContainer = targetNode.closest('.tree-children');
            insertInline(parentChildrenContainer || fileTree, targetLevel);
            return;
        }
    }
    insertInline(fileTree, 0);

    function insertInline(container, lvl = 0) {
        if (!container) container = fileTree;
        const wrapper = document.createElement('div');
        wrapper.className = 'tree-node tree-inline-input-wrapper';
        
        const item = document.createElement('div');
        item.className = 'file-item inline-creating';
        item.style.setProperty('--level', lvl);

        const iconSpan = document.createElement('span');
        iconSpan.className = 'file-icon';
        iconSpan.style.marginLeft = `${lvl * 12 + 16}px`;
        iconSpan.innerHTML = isFolder
            ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`
            : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'tree-inline-input';
        input.placeholder = isFolder ? 'folder name' : 'filename.txt';
        input.style.cssText = `
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid var(--primary, #468CF6);
            color: #ffffff;
            font-size: 12px;
            padding: 3px 8px;
            border-radius: 4px;
            outline: none;
            width: 140px;
            font-family: inherit;
            margin-left: 6px;
        `;

        item.appendChild(iconSpan);
        item.appendChild(input);
        wrapper.appendChild(item);

        if (container.firstChild) {
            container.insertBefore(wrapper, container.firstChild);
        } else {
            container.appendChild(wrapper);
        }

        input.focus();

        let isSubmitted = false;

        const cleanup = () => {
            if (wrapper && wrapper.parentNode) wrapper.remove();
        };

        const submit = () => {
            if (isSubmitted) return;
            isSubmitted = true;
            const name = input.value.trim();
            cleanup();
            if (!name) return;

            const pathModule = require('path');
            const fs = require('fs');
            const newPath = pathModule.join(parentDir, name);

            try {
                if (isFolder) {
                    fs.mkdirSync(newPath, { recursive: true });
                    if (typeof window.showUserScreenToast === 'function') {
                        window.showUserScreenToast(`Created folder: ${name}`, 2500, true);
                    }
                } else {
                    fs.writeFileSync(newPath, '', 'utf-8');
                    if (typeof window.showUserScreenToast === 'function') {
                        window.showUserScreenToast(`Created file: ${name}`, 2500, true);
                    }
                }
                if (typeof window.refreshTreeAll === 'function') {
                    window.refreshTreeAll();
                } else if (typeof window.loadDirectory === 'function') {
                    window.loadDirectory(window.currentPath || process.cwd());
                }
                if (!isFolder && window.openFileInEditor) {
                    window.openFileInEditor(newPath);
                }
            } catch (err) {
                alert(`Failed to create ${isFolder ? 'folder' : 'file'}: ` + err.message);
            }
        };

        input.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.stopPropagation();
                submit();
            }
            if (e.key === 'Escape') {
                e.stopPropagation();
                cleanup();
            }
        };

        input.onblur = () => {
            setTimeout(submit, 180);
        };
    }
};

window.showFolderContextMenu = function(e, targetPath = null, isDir = true) {
    e.preventDefault();
    e.stopPropagation();

    const oldMenu = document.getElementById('folder-context-menu');
    if (oldMenu) oldMenu.remove();

    const pathModule = require('path');
    const fs = require('fs');
    const activePath = window.currentPath || window.projectRoot || process.cwd();

    const menu = document.createElement('div');
    menu.id = 'folder-context-menu';
    menu.className = 'shortcut-context-menu';
    menu.style.position = 'fixed';
    menu.style.left = `${Math.min(window.innerWidth - 180, Math.max(10, e.clientX))}px`;
    menu.style.top = `${Math.min(window.innerHeight - 250, Math.max(10, e.clientY))}px`;
    menu.style.zIndex = '99999';

    let menuHTML = '';

    if (targetPath) {
        const hubHome = document.getElementById('agent-hub-home');
        const hubWebview = document.getElementById('agent-hub-webview');
        const activeWv = document.getElementById('active-agent-webview');
        const wvSrc = activeWv ? (activeWv.src || activeWv.getAttribute('src') || '') : '';
        
        const isAiSessionActive = !!(
            activeWv && wvSrc && wvSrc.startsWith('http') &&
            hubWebview && hubWebview.style.display !== 'none' &&
            (!hubHome || hubHome.style.display === 'none')
        );

        const toAiStyle = isAiSessionActive 
            ? 'color: var(--primary, #468CF6); font-weight: 600; cursor: pointer;' 
            : 'color: var(--text-muted); opacity: 0.45; cursor: not-allowed;';

        menuHTML += `
            <div class="menu-item menu-action-to-ai" style="${toAiStyle}" title="${isAiSessionActive ? 'Add file to AI Queue' : 'Requires an active AI Chat session'}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                <span>To AI</span>
            </div>
            <div class="menu-item menu-action-open">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                <span>${isDir ? 'Open Folder in PC' : 'Open File in PC'}</span>
            </div>
            <div style="height: 1px; background: var(--border-color); margin: 4px 0;"></div>
        `;
    }

    menuHTML += `
        <div class="menu-item menu-action-new-file">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 1-2 2v16a2 2 0 0 1 2 2h12a2 2 0 0 1 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>
            <span>New File</span>
        </div>
        <div class="menu-item menu-action-new-folder">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><line x1="12" y1="11" x2="12" y2="17"></line><line x1="9" y1="14" x2="15" y2="14"></line></svg>
            <span>New Folder</span>
        </div>
        <div class="menu-item menu-action-refresh">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20 20"></path></svg>
            <span>Refresh</span>
        </div>
        ${!isDir ? `
        <div class="menu-item menu-action-reveal">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
            <span>Reveal in Explorer</span>
        </div>
        ` : ''}
    `;

    if (targetPath) {
        menuHTML += `
            <div style="height: 1px; background: var(--border-color); margin: 4px 0;"></div>
            <div class="menu-item menu-action-delete danger">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                <span>Delete</span>
            </div>
        `;
    }

    menu.innerHTML = menuHTML;
    document.body.appendChild(menu);

    let closeMenu = () => { if (menu && menu.parentNode) menu.remove(); };

    const refreshTreeAll = (targetDir) => {
        if (typeof window.refreshTree === 'function') window.refreshTree();
        if (typeof window.loadDirectory === 'function') {
            window.loadDirectory(targetDir || window.currentPath || process.cwd());
        }
    };

    const findTargetNode = () => {
        if (!targetPath) return null;
        const items = document.querySelectorAll('.file-item');
        for (const item of items) {
            if (item.dataset && item.dataset.path === targetPath) {
                return item.closest('.tree-node');
            }
        }
        return null;
    };

    const btnOpen = menu.querySelector('.menu-action-open');
    if (btnOpen) {
        btnOpen.onclick = (ev) => {
            ev.stopPropagation(); closeMenu();
            if (targetPath) {
                try {
                    const ipc = (typeof ipcRenderer !== 'undefined') ? ipcRenderer : require('electron').ipcRenderer;
                    ipc.send('open-file-os', targetPath);
                } catch(e) {
                    console.error("Failed to trigger open-file-os:", e);
                }
            }
        };
    }

    const btnToAi = menu.querySelector('.menu-action-to-ai');
    if (btnToAi) {
        btnToAi.onclick = (ev) => {
            ev.stopPropagation(); closeMenu();
            if (!targetPath) return;

            const hubHome = document.getElementById('agent-hub-home');
            const hubWebview = document.getElementById('agent-hub-webview');
            const activeWv = document.getElementById('active-agent-webview');
            const wvSrc = activeWv ? (activeWv.src || activeWv.getAttribute('src') || '') : '';
            
            const isAiSessionActive = !!(
                activeWv && wvSrc && wvSrc.startsWith('http') &&
                hubWebview && hubWebview.style.display !== 'none' &&
                (!hubHome || hubHome.style.display === 'none')
            );

            if (!isAiSessionActive) {
                if (typeof window.showUserScreenToast === 'function') {
                    window.showUserScreenToast(`Connect to AI session first to use 'To AI'`, 3000, false);
                }
                return;
            }

            const pathModule = require('path');
            const relPath = window.currentPath ? pathModule.relative(window.currentPath, targetPath) : pathModule.basename(targetPath);

            if (!window.requestedFilesQueue) window.requestedFilesQueue = [];
            
            const existing = window.requestedFilesQueue.find(item => item.absolutePath === targetPath);
            if (!existing) {
                window.requestedFilesQueue.push({
                    absolutePath: targetPath,
                    relativePath: relPath || pathModule.basename(targetPath),
                    status: 'PENDING'
                });
            } else {
                existing.status = 'PENDING';
            }

            window.dragDropMode = true;
            if (typeof window.updateDragDropQueueUI === 'function') {
                window.updateDragDropQueueUI();
            }

            if (typeof window.showUserScreenToast === 'function') {
                window.showUserScreenToast(`Added to AI Queue: ${pathModule.basename(targetPath)}`, 2000, true);
            }
        };
    }



    const btnNewFile = menu.querySelector('.menu-action-new-file');
    if (btnNewFile) {
        btnNewFile.onclick = (ev) => {
            ev.stopPropagation(); closeMenu();
            const parentDir = isDir && targetPath ? targetPath : (targetPath ? pathModule.dirname(targetPath) : activePath);
            window.showInlineTreeInput(parentDir, false, findTargetNode());
        };
    }

    const btnNewFolder = menu.querySelector('.menu-action-new-folder');
    if (btnNewFolder) {
        btnNewFolder.onclick = (ev) => {
            ev.stopPropagation(); closeMenu();
            const parentDir = isDir && targetPath ? targetPath : (targetPath ? pathModule.dirname(targetPath) : activePath);
            window.showInlineTreeInput(parentDir, true, findTargetNode());
        };
    }

    const btnRefresh = menu.querySelector('.menu-action-refresh');
    if (btnRefresh) {
        btnRefresh.onclick = (ev) => {
            ev.stopPropagation(); closeMenu();
            window._isManualTreeRefresh = true;
            refreshTreeAll();
        };
    }

    const btnReveal = menu.querySelector('.menu-action-reveal');
    if (btnReveal) {
        btnReveal.onclick = (ev) => {
            ev.stopPropagation(); closeMenu();
            if (window.isWebMode || (window.process && window.process.platform === 'browser') || typeof window.require === 'undefined') {
                if (typeof window.showUserScreenToast === 'function') {
                    window.showUserScreenToast("In Web Browser mode, files are managed inside the web app.", 3500, true);
                }
            } else if (typeof ipcRenderer !== 'undefined' && ipcRenderer.send) {
                ipcRenderer.send('reveal-in-explorer', targetPath || activePath);
            }
        };
    }

    const btnDelete = menu.querySelector('.menu-action-delete');
    if (btnDelete) {
        btnDelete.onclick = (ev) => {
            ev.stopPropagation(); closeMenu();
            const itemName = pathModule.basename(targetPath);
            window.showCustomConfirm(
                "Delete Item",
                `Are you sure you want to delete <strong style="color:#f4f4f5">${itemName}</strong>? This action cannot be undone.`,
                () => {
                    try {
                        const stat = fs.statSync(targetPath);
                        if (stat.isDirectory()) {
                            fs.rmSync(targetPath, { recursive: true, force: true });
                        } else {
                            fs.unlinkSync(targetPath);
                        }
                        refreshTreeAll();
                        if (typeof window.showUserScreenToast === 'function') {
                            window.showUserScreenToast(`Deleted ${itemName}`, 2500);
                        }
                    } catch(err) {
                        alert("Failed to delete: " + err.message);
                    }
                },
                { showIcon: true, confirmText: 'Delete', confirmBg: '#ef4444' }
            );
        };
    }

    closeMenu = () => {
        if (menu && menu.parentNode) menu.remove();
        document.removeEventListener('mousedown', onOuterClick, true);
        document.removeEventListener('contextmenu', onOuterClick, true);
        document.removeEventListener('scroll', onOuterClick, true);
        document.removeEventListener('keydown', onKeyDown, true);
        window.removeEventListener('blur', closeMenu);
    };

    const onOuterClick = (ev) => {
        if (menu && !menu.contains(ev.target)) {
            closeMenu();
        }
    };

    const onKeyDown = (ev) => {
        if (ev.key === 'Escape') {
            closeMenu();
        }
    };

    requestAnimationFrame(() => {
        document.addEventListener('mousedown', onOuterClick, true);
        document.addEventListener('contextmenu', onOuterClick, true);
        document.addEventListener('scroll', onOuterClick, true);
        document.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('blur', closeMenu);
    });
};

const bindSidebarLeftContextMenu = () => {
    const targets = ['sidebar-left', 'file-tree', 'explorer-tree'];
    targets.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('contextmenu', (e) => {
                if (e.target.closest('.file-item')) return;
                if (typeof window.showFolderContextMenu === 'function') {
                    window.showFolderContextMenu(e, null, true);
                }
            });

            el.addEventListener('dragenter', (e) => {
                e.preventDefault();
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
            });

            el.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
            });

            el.addEventListener('drop', (e) => {
                if (e.target.closest('.file-item')) return;
                e.preventDefault();
                e.stopPropagation();

                const pathModule = require('path');
                const fs = require('fs');

                let srcPath = window._draggingTreePath || window._lastDraggedTreePath;
                if (!srcPath && e.dataTransfer) {
                    try { srcPath = e.dataTransfer.getData('text/plain'); } catch(err){}
                    if (!srcPath && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                        srcPath = e.dataTransfer.files[0].path;
                    }
                }
                window._draggingTreePath = null;
                window._lastDraggedTreePath = null;

                if (!srcPath) return;

                const curr = window.currentPath || window.projectRoot || process.cwd();
                const projRoot = window.projectRoot || curr;

                const normCurr = pathModule.resolve(curr).toLowerCase();
                const normRoot = pathModule.resolve(projRoot).toLowerCase();

                let targetDir = curr;
                if (normCurr !== normRoot) {
                    targetDir = pathModule.dirname(curr);
                }

                const absSrc = pathModule.resolve(srcPath);
                const absDstDir = pathModule.resolve(targetDir);

                if (absSrc === absDstDir) return;

                if (absDstDir.startsWith(absSrc + pathModule.sep)) {
                    alert("Cannot move a folder into its own subfolder.");
                    return;
                }

                const fileName = pathModule.basename(absSrc);
                const targetDestPath = pathModule.join(absDstDir, fileName);

                if (absSrc === targetDestPath) return;

                const doMoveToOuter = () => {
                    try {
                        try {
                            fs.renameSync(absSrc, targetDestPath);
                        } catch (renameErr) {
                            const stat = fs.statSync(absSrc);
                            if (stat.isDirectory()) {
                                fs.cpSync(absSrc, targetDestPath, { recursive: true });
                                fs.rmSync(absSrc, { recursive: true, force: true });
                            } else {
                                fs.copyFileSync(absSrc, targetDestPath);
                                fs.unlinkSync(absSrc);
                            }
                        }

                        if (typeof window.refreshTreeAll === 'function') {
                            window.refreshTreeAll();
                        } else if (typeof window.loadDirectory === 'function') {
                            window.loadDirectory(window.currentPath || process.cwd());
                        }
                        if (typeof window.showUserScreenToast === 'function') {
                            window.showUserScreenToast(`Moved ${fileName} to outer directory`, 2500);
                        }
                    } catch (err) {
                        console.error("[SidebarDrop] Move error:", err);
                        alert("Failed to move item to outer directory: " + err.message);
                    }
                };

                if (fs.existsSync(targetDestPath)) {
                    window.showCustomConfirm(
                        "Overwrite Item",
                        `Item <strong style="color:#f4f4f5">${fileName}</strong> already exists in outer folder. Do you want to overwrite it?`,
                        doMoveToOuter,
                        { showIcon: false, confirmText: 'Overwrite', confirmBg: 'var(--primary, #468CF6)' }
                    );
                } else {
                    doMoveToOuter();
                }
            });
        }
    });
};

// ====== TREE VIEW KEYBOARD ARROW NAVIGATION ======
let isTreeViewFocused = false;

document.addEventListener('mousedown', (e) => {
    const treeContainer = document.getElementById('file-tree') || document.querySelector('.file-tree') || document.getElementById('explorer-container');
    if (treeContainer && treeContainer.contains(e.target)) {
        isTreeViewFocused = true;
    } else {
        isTreeViewFocused = false;
    }
}, true);

document.addEventListener('mouseover', (e) => {
    const treeContainer = document.getElementById('file-tree') || document.querySelector('.file-tree') || document.getElementById('explorer-container');
    if (treeContainer && treeContainer.contains(e.target)) {
        window._isMouseOverTree = true;
    } else {
        window._isMouseOverTree = false;
    }
}, true);

function getVisibleFileItems() {
    const allItems = Array.from(document.querySelectorAll('.file-item'));
    return allItems.filter(item => {
        return item.offsetParent !== null && item.offsetHeight > 0;
    });
}

window.addEventListener('keydown', (e) => {
    const isTreeActive = isTreeViewFocused || window._isMouseOverTree;
    if (!isTreeActive) return;
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Enter') return;

    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
        return;
    }

    const visibleItems = getVisibleFileItems();
    if (visibleItems.length === 0) return;

    let currentIndex = visibleItems.findIndex(el => el.classList.contains('active'));

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        const nextIndex = currentIndex < 0 ? 0 : Math.min(visibleItems.length - 1, currentIndex + 1);
        const targetItem = visibleItems[nextIndex];
        if (targetItem) {
            targetItem.click();
            targetItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        const prevIndex = currentIndex < 0 ? 0 : Math.max(0, currentIndex - 1);
        const targetItem = visibleItems[prevIndex];
        if (targetItem) {
            targetItem.click();
            targetItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        if (currentIndex >= 0) {
            const currentItem = visibleItems[currentIndex];
            const isDir = currentItem.classList.contains('directory');
            const isExpanded = currentItem.querySelector('.tree-arrow')?.classList.contains('expanded');
            if (isDir && isExpanded) {
                currentItem.click();
            } else {
                const node = currentItem.closest('.tree-node');
                const parentNode = node ? node.parentElement.closest('.tree-node') : null;
                if (parentNode) {
                    const parentItem = parentNode.querySelector('.file-item');
                    if (parentItem) {
                        parentItem.click();
                        parentItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                    }
                }
            }
        }
    } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        if (currentIndex >= 0) {
            const currentItem = visibleItems[currentIndex];
            const isDir = currentItem.classList.contains('directory');
            const isExpanded = currentItem.querySelector('.tree-arrow')?.classList.contains('expanded');
            if (isDir && !isExpanded) {
                currentItem.click();
            }
        }
    } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (currentIndex >= 0) {
            const currentItem = visibleItems[currentIndex];
            currentItem.click();
        }
    }
}, true);

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindSidebarLeftContextMenu);
} else {
    bindSidebarLeftContextMenu();
}
