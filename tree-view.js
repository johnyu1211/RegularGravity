
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
        case 'js': case 'jsx': case 'ts': case 'tsx': return '📜';
        case 'json': return '📦';
        case 'html': case 'htm': return '🌐';
        case 'css': return '🎨';
        case 'py': return '🐍';
        case 'md': return '📝';
        
        // Images
        case 'png': case 'jpg': case 'jpeg': case 'gif': case 'svg': 
        case 'webp': case 'bmp': case 'ico': return '🖼️';
        
        // Video
        case 'mp4': case 'mov': case 'avi': case 'mkv': case 'wmv': return '🎬';
        
        // Audio
        case 'mp3': case 'wav': case 'flac': case 'ogg': case 'm4a': return '🔊';
        
        // Archives
        case 'zip': case 'rar': case '7z': case 'tar': case 'gz': return '📚';
        
        // Executables / Scripts
        case 'exe': case 'msi': return '📀';
        case 'bat': case 'sh': case 'ps1': return '⚙️';
        
        // Documents
        case 'pdf': return '📕';
        case 'txt': return '📄';
        
        default: return '📄';
    }
}



async function renderTree(basePath, rootFiles, searchQuery = '') {
    const fileTree = document.getElementById('file-tree');
    if (!fileTree) return;
    
    // Save scroll position
    const savedScrollPos = fileTree.scrollTop;
    
    fileTree.innerHTML = '';
    
    let sortedFiles = sortFiles(rootFiles);

    // Prepend ../ if not at the root
    if (basePath !== 'DRIVES') {
        sortedFiles.unshift({ name: '../', isDir: true, isParentEntry: true });
    }
    
    await renderLevel(basePath, sortedFiles, fileTree, 0, searchQuery);
    
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
            const base = parentPath.endsWith('\\') ? parentPath : parentPath + '\\';
            fullPath = base + name;
        }
        
        const isExpanded = window.expandedPaths.has(fullPath);
        
        const node = document.createElement('div');
        node.className = `tree-node ${isDir ? 'dir-node' : 'file-node'}`;
        
        const item = document.createElement('div');
        item.className = `file-item ${isDir && !isParentEntry ? 'directory' : 'file'} ${window.currentPath === fullPath ? 'active' : ''}`;
        item.dataset.path = fullPath;
        item.style.setProperty('--level', level); 
        
        const arrowSpan = document.createElement('span');
        arrowSpan.className = 'tree-arrow';
        // No arrow for ../ (Parent Entry)
        arrowSpan.textContent = (isDir && !isParentEntry) ? (isExpanded ? '▼' : '▶') : '';
        
        const iconSpan = document.createElement('span');
        iconSpan.className = 'file-icon';
        if (isDir) {
            iconSpan.textContent = isExpanded ? '📂' : '📁';
        } else {
            iconSpan.textContent = getFileIcon(name);
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
            drillBtn.innerHTML = '→'; 
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

            // Selection Highlight Only
            document.querySelectorAll('.file-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');

            if (isDir) {
                if (isExpanded) window.expandedPaths.delete(fullPath);
                else window.expandedPaths.add(fullPath);
                window.loadDirectory(window.currentPath);
            } else {
                window.currentPath = fullPath;
                // [수정된 부분] 파일 클릭 시 에디터에 렌더링 함수 호출
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
