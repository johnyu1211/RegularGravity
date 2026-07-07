
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
    const ext = name.split('.').pop().toLowerCase();
    switch (ext) {
        case 'js': case 'jsx': case 'ts': case 'tsx': 
        case 'html': case 'htm': case 'css': case 'py':
            return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8da2fb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
        
        case 'json': case 'zip': case 'rar': case '7z': case 'tar': case 'gz':
            return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a0a0b0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>`;
        
        case 'png': case 'jpg': case 'jpeg': case 'gif': case 'svg': 
        case 'webp': case 'bmp': case 'ico':
            return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`;
        
        default:
            return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;
    }
}



async function renderTree(basePath, rootFiles, searchQuery = '') {
    const fileTree = document.getElementById('file-tree');
    if (!fileTree) return;
    
    // Save scroll position
    const savedScrollPos = fileTree.scrollTop;
    
    // 더블 버퍼링: 오프스크린 임시 엘리먼트에 먼저 비동기 렌더링 진행하여 깜빡임 제거
    const tempContainer = document.createElement('div');
    
    let sortedFiles = sortFiles(rootFiles);

    // 최상위(project root) 여부 판단
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

async function renderLevel(parentPath, files, container, level, searchQuery = '') {
    if (!Array.isArray(files)) return;
    
    // Ensure this level is also sorted (for expanded subdirectories)
    const sorted = level > 0 ? sortFiles(files) : files; // root level already sorted in renderTree

    for (const file of sorted) {
        if (!file) continue;
        
        const name = file.name;
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
        
        const isExpanded = window.expandedPaths.has(fullPath);
        
        const node = document.createElement('div');
        node.className = `tree-node ${isDir ? 'dir-node' : 'file-node'}`;
        
        const item = document.createElement('div');
        item.className = `file-item ${isDir && !isParentEntry ? 'directory' : 'file'} ${window.currentFilePath === fullPath ? 'active' : ''}`;
        item.dataset.path = fullPath;
        if (!isDir) {
            item.draggable = true;
            item.ondragstart = (e) => {
                e.preventDefault();
                const { ipcRenderer } = require('electron');
                ipcRenderer.send('ondragstart', fullPath);
            };
        }
        item.style.setProperty('--level', level);
        
        const arrowSpan = document.createElement('span');
        arrowSpan.className = 'tree-arrow';
        // No arrow for ../ (Parent Entry)
        if (isDir && !isParentEntry) {
            arrowSpan.innerHTML = isExpanded 
                ? `<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="transform: rotate(90deg); transition: transform 0.2s;"><polyline points="9 18 15 12 9 6"></polyline></svg>`
                : `<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.2s;"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
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

        // Drill-down Button (→) - Skip for ../
        if (isDir && !isParentEntry) {
            const drillBtn = document.createElement('span');
            drillBtn.className = 'jump-folder-btn';
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
                if (isExpanded) window.expandedPaths.delete(fullPath);
                else window.expandedPaths.add(fullPath);
                // parentPath = 현재 보고있는 디렉토리. window.currentPath 대신 사용해야 파일 선택 후에도 안전
                window.loadDirectory(window.currentPath || parentPath);
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

window.renderTree = renderTree;
window.expandedPaths = new Set();
