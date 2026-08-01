window.showCommandExecutionPanel = function(title, text, onContinue, onCancel) {
    const container = document.getElementById('command-execution-container');
    const titleEl = document.getElementById('command-execution-title');
    const textEl = document.getElementById('command-execution-text');
    const continueBtn = document.getElementById('command-execute-continue');
    const cancelBtn = document.getElementById('command-execute-cancel');
    const closeBtn = document.getElementById('close-command-execution');

    if (!container || !textEl || !continueBtn || !cancelBtn) return;

    if (titleEl) titleEl.innerText = title;
    textEl.innerText = text;

    container.style.display = 'flex';
    
    const vLC = document.getElementById('inspector-local-chat');
    const vBH = document.getElementById('inspector-browser-hub');
    if (vLC) {
        vLC.style.height = `calc(100% - 44px - 180px)`;
        vLC.style.zIndex = '100';
    }
    if (vBH) {
        vBH.style.position = 'absolute';
        vBH.style.top = '0';
        vBH.style.height = '100%';
        vBH.style.width = '100%';
        vBH.style.zIndex = '150';
        vBH.style.opacity = '1';
        vBH.style.pointerEvents = 'auto';
    }
    window.toggleBackdropBlur(true);
    if (typeof window.setCoverLifted === 'function') {
        window.setCoverLifted(true);
    }

    const hidePanel = () => {
        container.style.display = 'none';
        window.toggleBackdropBlur(false);
        if (typeof window.setCoverLifted === 'function') {
            window.setCoverLifted(false);
        }
        if (vLC) {
            vLC.style.height = '100%';
        }
    };

    window.activeCommandCleanup = hidePanel;

    continueBtn.onclick = () => {
        hidePanel();
        if (typeof onContinue === 'function') onContinue();
    };

    cancelBtn.onclick = () => {
        hidePanel();
        if (typeof onCancel === 'function') onCancel();
    };

    if (closeBtn) {
        closeBtn.onclick = () => {
            hidePanel();
            if (typeof onCancel === 'function') onCancel();
        };
    }
};

window.dragDropAttemptCounts = {};
window.autoClickingQueue = false;
window.autoClickPendingQueueItems = async function() {
    // Auto dragging disabled per user request. Queue UI popup remains visible for manual file drag/attachment.
    return;
};
