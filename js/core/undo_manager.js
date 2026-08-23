/**
 * UndoManager - Manages multi-level rollback (up to 10 steps) for AI file operations
 */
(function() {
    const fs = (typeof require !== 'undefined') ? require('fs') : null;
    const path = (typeof require !== 'undefined') ? require('path') : null;

    class GravityUndoManager {
        constructor() {
            this.maxHistory = 10;
            this.undoStack = []; // Array of Transactions
            this.currentTransaction = null;
        }

        // Start a new transaction batch for an AI execution turn
        beginTransaction(description = 'AI File Operations') {
            this.currentTransaction = {
                id: Date.now(),
                timestamp: new Date(),
                description,
                actions: [] // Array of { action, targetPath, beforeContent, beforeExists, fromPath, toPath }
            };
        }

        // Record the pre-execution state of a target file before AI modifies/deletes/creates it
        recordPreState(targetPath, actionType) {
            if (!this.currentTransaction || !fs || !path) return;
            try {
                const normPath = path.resolve(targetPath);
                // Avoid duplicate recording of the same file within the same transaction
                if (this.currentTransaction.actions.some(a => a.targetPath === normPath)) {
                    return;
                }

                const exists = fs.existsSync(normPath);
                let beforeContent = null;
                if (exists) {
                    try {
                        const stat = fs.statSync(normPath);
                        if (stat.isFile()) {
                            beforeContent = fs.readFileSync(normPath, 'utf8');
                        }
                    } catch(e) {}
                }

                this.currentTransaction.actions.push({
                    action: actionType, // 'write', 'edit', 'delete'
                    targetPath: normPath,
                    beforeExists: exists,
                    beforeContent: beforeContent
                });
            } catch(err) {
                console.error("[UndoManager] Error recording pre-state:", err);
            }
        }

        // Record a move operation before execution
        recordPreMove(fromPath, toPath) {
            if (!this.currentTransaction || !fs || !path) return;
            try {
                const normFrom = path.resolve(fromPath);
                const normTo = path.resolve(toPath);
                this.currentTransaction.actions.push({
                    action: 'move',
                    fromPath: normFrom,
                    toPath: normTo,
                    beforeExists: fs.existsSync(normFrom)
                });
            } catch(err) {
                console.error("[UndoManager] Error recording pre-move:", err);
            }
        }

        // Commit current transaction to undo stack
        commitTransaction() {
            if (!this.currentTransaction || this.currentTransaction.actions.length === 0) {
                this.currentTransaction = null;
                return;
            }

            this.undoStack.push(this.currentTransaction);
            if (this.undoStack.length > this.maxHistory) {
                this.undoStack.shift(); // Keep maximum 10 items
            }
            this.currentTransaction = null;
            this.updateButtonUI();
        }

        // Cancel/Discard current recording without saving
        discardTransaction() {
            this.currentTransaction = null;
        }

        // Perform Undo: rollback the most recent AI transaction
        undo() {
            if (this.undoStack.length === 0 || !fs || !path) {
                if (typeof window.showUserScreenToast === 'function') {
                    window.showUserScreenToast("No AI changes to undo", 2000, false);
                }
                return false;
            }

            const transaction = this.undoStack.pop();
            const revertedFiles = [];

            try {
                // Rollback actions in reverse order
                for (let i = transaction.actions.length - 1; i >= 0; i--) {
                    const item = transaction.actions[i];
                    if (item.action === 'move') {
                        if (fs.existsSync(item.toPath)) {
                            const parentDir = path.dirname(item.fromPath);
                            if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
                            fs.renameSync(item.toPath, item.fromPath);
                            revertedFiles.push(path.basename(item.fromPath));
                        }
                    } else if (item.beforeExists) {
                        // File existed before -> Restore previous content
                        if (item.beforeContent !== null) {
                            const parentDir = path.dirname(item.targetPath);
                            if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
                            fs.writeFileSync(item.targetPath, item.beforeContent, 'utf8');
                            revertedFiles.push(path.basename(item.targetPath));
                        }
                    } else {
                        // File did not exist before -> Delete the newly created file
                        if (fs.existsSync(item.targetPath)) {
                            fs.unlinkSync(item.targetPath);
                            revertedFiles.push(path.basename(item.targetPath) + ' (deleted)');
                        }
                    }

                    // If active editor is currently viewing this file, reload editor content
                    if (window.currentEditingFile && path.resolve(window.currentEditingFile) === item.targetPath) {
                        if (typeof window.loadFileIntoEditor === 'function') {
                            window.loadFileIntoEditor(item.targetPath);
                        }
                    }
                }

                // Refresh tree view
                if (typeof window.refreshTree === 'function') {
                    window.refreshTree();
                }

                this.updateButtonUI();

                const summaryText = revertedFiles.length > 0 ? revertedFiles.join(', ') : 'files';
                if (typeof window.showUserScreenToast === 'function') {
                    window.showUserScreenToast(`↩ Reverted AI changes: ${summaryText}`, 3500, true);
                }
                if (typeof ChatUI !== 'undefined' && typeof ChatUI.appendBubble === 'function') {
                    ChatUI.appendBubble('system', `[SYSTEM] ↩ Reverted AI changes for: ${summaryText}`);
                }
                return true;
            } catch(err) {
                console.error("[UndoManager] Error during undo:", err);
                if (typeof window.showUserScreenToast === 'function') {
                    window.showUserScreenToast(`Undo failed: ${err.message}`, 3500, false);
                }
                this.updateButtonUI();
                return false;
            }
        }

        // Update the Taskbar UNDO button state and badge
        updateButtonUI() {
            const undoBtn = document.getElementById('taskbar-undo-btn');
            const badge = document.getElementById('taskbar-undo-count-badge');
            if (!undoBtn) return;

            const count = this.undoStack.length;
            if (count > 0) {
                undoBtn.disabled = false;
                undoBtn.style.opacity = '1';
                undoBtn.style.cursor = 'pointer';
                undoBtn.style.background = '';
                undoBtn.style.color = '';
                undoBtn.style.borderColor = '';
                undoBtn.title = `Undo Last AI Changes (${count} available in history)`;
                if (badge) {
                    badge.innerText = count.toString();
                    badge.style.display = 'inline-block';
                }
            } else {
                undoBtn.disabled = true;
                undoBtn.style.opacity = '0.35';
                undoBtn.style.cursor = 'not-allowed';
                undoBtn.style.background = '';
                undoBtn.style.color = '';
                undoBtn.style.borderColor = '';
                undoBtn.title = 'No AI changes to undo';
                if (badge) {
                    badge.innerText = '0';
                    badge.style.display = 'none';
                }
            }
        }
    }

    window.UndoManager = new GravityUndoManager();
})();
