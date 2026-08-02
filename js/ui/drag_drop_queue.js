window.toggleBackdropBlur = function(show) {
    const vLC = document.getElementById('inspector-local-chat');
    if (vLC) {
        if (show) {
            vLC.classList.add('modal-backdrop-blur');
        } else {
            vLC.classList.remove('modal-backdrop-blur');
        }
    }
};

window.updateDragDropQueueUI = function() {
    const containerEl = document.getElementById('drag-drop-queue-container');
    const listEl = document.getElementById('drag-drop-queue-list');
    const countEl = document.getElementById('requested-files-count');
    if (!listEl) {
        console.error('[updateDragDropQueueUI] listEl not found!');
        return;
    }
    
    const warningEl = document.getElementById('drag-drop-queue-warning');
    if (warningEl) {
        if (window.dragDropAbortMessage) {
            warningEl.innerHTML = window.dragDropAbortMessage;
            warningEl.style.color = '#ff4444';
            warningEl.style.display = 'flex';
        } else {
            warningEl.innerHTML = ``;
            warningEl.style.display = 'none';
        }
    }
    
    // Toggle container display based on dragDropMode and presence of items in the queue
    const hasItems = window.requestedFilesQueue && window.requestedFilesQueue.length > 0;
    if (containerEl) {
        if (window.dragDropMode && hasItems) {
            containerEl.style.display = 'flex';
            if (typeof syncBrowserView === 'function') syncBrowserView();

            window.toggleBackdropBlur(true);
            if (typeof window.setCoverLifted === 'function') {
                window.setCoverLifted(true);
            }
        } else {
            containerEl.style.display = 'none';
            if (typeof syncBrowserView === 'function') syncBrowserView();

            window.toggleBackdropBlur(false);
            if (typeof window.setCoverLifted === 'function') {
                window.setCoverLifted(false);
            }
        }
    }
    
    const closeBtn = document.getElementById('close-drag-drop-queue');
    const bottomCloseBtn = document.getElementById('btn-close-drag-drop-queue-bottom');

    const handleCloseQueue = () => {
        containerEl.style.display = 'none';
        if (typeof syncBrowserView === 'function') syncBrowserView();
        window.toggleBackdropBlur(false);
        window.dragDropMode = false;
        if (typeof window.setCoverLifted === 'function') {
            window.setCoverLifted(false);
        }
        if (typeof window.activeDragDropCleanup === 'function') {
            window.activeDragDropCleanup();
        }
    };

    if (closeBtn && containerEl) closeBtn.onclick = handleCloseQueue;
    if (bottomCloseBtn && containerEl) bottomCloseBtn.onclick = handleCloseQueue;
    
    listEl.innerHTML = '';
    
    if (countEl) countEl.innerText = window.requestedFilesQueue.filter(item => item.status === 'PENDING').length;
    
    if (window.requestedFilesQueue.length === 0) {
        listEl.innerHTML = `<div style="font-size: 11px; color: var(--text-dark); text-align: center; margin-top: 50px; font-family: 'DM Sans', sans-serif;">No requested files</div>`;
        return;
    }
    
    window.requestedFilesQueue.forEach(item => {
        const itemEl = document.createElement('div');
        itemEl.className = 'queue-item';
        itemEl.draggable = item.status === 'PENDING';
        itemEl.setAttribute('data-filepath', item.absolutePath);
        
        const isCompleted = item.status === 'COMPLETED';
        
        itemEl.style.cssText = `
            display: flex;
            align-items: center;
            padding: 8px 12px;
            background: ${isCompleted ? 'rgba(255, 255, 255, 0.02)' : 'var(--surface-color)'};
            border: 1px solid ${isCompleted ? 'rgba(255, 255, 255, 0.05)' : 'var(--border-color)'};
            border-radius: 6px;
            cursor: ${isCompleted ? 'default' : 'pointer'};
            user-select: none;
            transition: all 0.2s;
            opacity: ${isCompleted ? '0.35' : '1'};
        `;
        
        itemEl.onmouseenter = () => {
            itemEl.style.background = 'var(--surface-high)';
            itemEl.style.borderColor = 'rgba(255, 255, 255, 0.15)';
        };
        itemEl.onmouseleave = () => {
            itemEl.style.background = isCompleted ? 'rgba(255, 255, 255, 0.02)' : 'var(--surface-color)';
            itemEl.style.borderColor = isCompleted ? 'rgba(255, 255, 255, 0.05)' : 'var(--border-color)';
        };
        itemEl.ondragstart = (e) => {
            e.preventDefault();
            ipcRenderer.send('ondragstart', item.absolutePath);
        };
        itemEl.onclick = (e) => {
            e.stopPropagation();
            if (typeof window.openFileInEditor === 'function' && item.absolutePath) {
                window.openFileInEditor(item.absolutePath);
            }
        };
        
        itemEl.innerHTML = `
            <span class="queue-file-name" style="font-size: 12px; color: ${isCompleted ? 'var(--text-muted)' : 'var(--text-main)'}; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; padding: 2px 4px; ${isCompleted ? 'text-decoration: line-through;' : ''}" title="${item.relativePath}">${item.relativePath.split(/[\\/]/).pop()}</span>
        `;
        
        listEl.appendChild(itemEl);
    });
    
    if (window.dragDropMode && window.requestedFilesQueue.filter(item => item.status === 'PENDING').length > 0) {
        if (!window.autoClickingQueue) {
            setTimeout(() => {
                window.autoClickPendingQueueItems();
            }, 600);
        }
    }
};
