
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

    // Check if at project root
    const isAtProjectRoot = window.projectRoot && basePath === window.projectRoot;

    if (basePath !== 'DRIVES') {
        if (!isAtProjectRoot) {
            sortedFiles.unshift({ name: '../', isDir: true, isParentEntry: true });
        }
    }
    
    // 백그라운드 렌더링
    await renderLevel(basePath, sortedFiles, tempContainer, 0, searchQuery);
    
    // 렌더 완료 후 동기적으로 노드 일괄 스왑 (깜빡임 완전 차단)
    fileTree.innerHTML = '';
    while (tempContainer.firstChild) {
        fileTree.appendChild(tempContainer.firstChild);
    }
    
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
        if (!isParentEntry) {
            item.setAttribute('draggable', 'true');
            item.ondragstart = (e) => {
                if (typeof window.setCoverLifted === 'function') {
                    window.setCoverLifted(true);
                }
                if (isDir) {
                    e.dataTransfer.setData('text/plain', fullPath);
                    console.log("[TreeDrag] Folder HTML5 dragstart:", fullPath);
                } else {
                    e.preventDefault();
                    console.log("[TreeDrag] File native dragstart initiated for:", fullPath);
                    const { ipcRenderer } = require('electron');
                    ipcRenderer.send('ondragstart', fullPath);
                }
            };
        }
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
            copyPathBtn.title = isDir ? `Copy relative path (directory)` : `Copy relative path`;
            copyPathBtn.onclick = async (e) => {
                e.stopPropagation();
                const pathModule = require('path');
                const root = window.projectRoot || process.cwd();
                const relPath = pathModule.relative(root, fullPath).replace(/\\/g, '/') + (isDir ? ' (directory)' : '');
                await navigator.clipboard.writeText(relPath);
                
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
    } else if (allActive.length > 0) {
        allActive.forEach(el => el.classList.remove('active-tree-hover'));
    }
});
