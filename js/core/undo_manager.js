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
            this.redoStack = []; // Array of Undone Transactions
            this.currentTransaction = null;
        }

        // Start a new transaction batch for an AI execution turn
        beginTransaction(description = 'AI File Operations') {
            this.currentTransaction = {
                id: Date.now(),
                timestamp: new Date(),
                description,
                actions: [] // Array of { action, targetPath, beforeContent, beforeExists, afterContent, afterExists, fromPath, toPath }
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
                    beforeContent: beforeContent,
                    afterExists: false,
                    afterContent: null
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
                    beforeExists: fs.existsSync(normFrom),
                    afterExists: false
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

            // Capture post-execution states for Redo capability
            if (fs) {
                for (const item of this.currentTransaction.actions) {
                    if (item.action === 'move') {
                        item.afterExists = fs.existsSync(item.toPath);
                    } else {
                        const exists = fs.existsSync(item.targetPath);
                        item.afterExists = exists;
                        item.afterContent = null;
                        if (exists) {
                            try {
                                const stat = fs.statSync(item.targetPath);
                                if (stat.isFile()) {
                                    item.afterContent = fs.readFileSync(item.targetPath, 'utf8');
                                }
                            } catch(e) {}
                        }
                    }
                }
            }

            this.undoStack.push(this.currentTransaction);
            if (this.undoStack.length > this.maxHistory) {
                this.undoStack.shift(); // Keep maximum 10 items
            }
            // Clear redo stack upon new AI file modifications
            this.redoStack = [];
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

                // Push undone transaction to redoStack
                this.redoStack.push(transaction);
                if (this.redoStack.length > this.maxHistory) {
                    this.redoStack.shift();
                }

                // Refresh tree view
                if (typeof window.refreshTree === 'function') {
                    window.refreshTree();
                }

                this.updateButtonUI();

                const summaryText = revertedFiles.length > 0 ? revertedFiles.join(', ') : 'files';
                const hasLabel = transaction.description && transaction.description !== 'AI File Changes' && transaction.description !== 'AI File Operations';
                const labelPrefix = hasLabel ? `[${transaction.description}] ` : '';

                if (typeof window.showUserScreenToast === 'function') {
                    window.showUserScreenToast(`↩ Reverted to ${labelPrefix}state: ${summaryText}`, 4000, true);
                }
                if (typeof ChatUI !== 'undefined' && typeof ChatUI.appendBubble === 'function') {
                    ChatUI.appendBubble('system', `[SYSTEM] ↩ Reverted to ${labelPrefix}state (${summaryText})`);
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

        // Perform Redo: re-apply the most recently undone transaction
        redo() {
            if (this.redoStack.length === 0 || !fs || !path) {
                if (typeof window.showUserScreenToast === 'function') {
                    window.showUserScreenToast("No undone AI changes to redo", 2000, false);
                }
                return false;
            }

            const transaction = this.redoStack.pop();
            const reappliedFiles = [];

            try {
                // Re-apply actions in normal forward order
                for (const item of transaction.actions) {
                    if (item.action === 'move') {
                        if (fs.existsSync(item.fromPath)) {
                            const parentDir = path.dirname(item.toPath);
                            if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
                            fs.renameSync(item.fromPath, item.toPath);
                            reappliedFiles.push(path.basename(item.toPath));
                        }
                    } else if (item.afterExists) {
                        // File existed after AI execution -> Re-write AI modified content
                        if (item.afterContent !== null) {
                            const parentDir = path.dirname(item.targetPath);
                            if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
                            fs.writeFileSync(item.targetPath, item.afterContent, 'utf8');
                            reappliedFiles.push(path.basename(item.targetPath));
                        }
                    } else {
                        // File was deleted by AI -> Delete it again
                        if (fs.existsSync(item.targetPath)) {
                            fs.unlinkSync(item.targetPath);
                            reappliedFiles.push(path.basename(item.targetPath) + ' (re-deleted)');
                        }
                    }

                    // If active editor is currently viewing this file, reload editor content
                    if (window.currentEditingFile && path.resolve(window.currentEditingFile) === item.targetPath) {
                        if (typeof window.loadFileIntoEditor === 'function') {
                            window.loadFileIntoEditor(item.targetPath);
                        }
                    }
                }

                // Push re-applied transaction back into undoStack
                this.undoStack.push(transaction);
                if (this.undoStack.length > this.maxHistory) {
                    this.undoStack.shift();
                }

                // Refresh tree view
                if (typeof window.refreshTree === 'function') {
                    window.refreshTree();
                }

                this.updateButtonUI();

                const summaryText = reappliedFiles.length > 0 ? reappliedFiles.join(', ') : 'files';
                const hasLabel = transaction.description && transaction.description !== 'AI File Changes' && transaction.description !== 'AI File Operations';
                const labelPrefix = hasLabel ? `[${transaction.description}] ` : '';

                if (typeof window.showUserScreenToast === 'function') {
                    window.showUserScreenToast(`↪ Redid ${labelPrefix}changes: ${summaryText}`, 4000, true);
                }
                if (typeof ChatUI !== 'undefined' && typeof ChatUI.appendBubble === 'function') {
                    ChatUI.appendBubble('system', `[SYSTEM] ↪ Redid ${labelPrefix}changes for: ${summaryText}`);
                }
                return true;
            } catch(err) {
                console.error("[UndoManager] Error during redo:", err);
                if (typeof window.showUserScreenToast === 'function') {
                    window.showUserScreenToast(`Redo failed: ${err.message}`, 3500, false);
                }
                this.updateButtonUI();
                return false;
            }
        }

        // Update the Taskbar UNDO & REDO button state and badge
        updateButtonUI() {
            // UNDO Button
            const undoBtn = document.getElementById('taskbar-undo-btn');
            const undoBadge = document.getElementById('taskbar-undo-count-badge');
            const undoText = undoBtn ? undoBtn.querySelector('.btn-text') : null;

            if (undoBtn) {
                const count = this.undoStack.length;
                if (count > 0) {
                    const topTrans = this.undoStack[this.undoStack.length - 1];
                    const hasLabel = topTrans && topTrans.description && topTrans.description !== 'AI File Changes' && topTrans.description !== 'AI File Operations';
                    const customLabel = hasLabel ? topTrans.description : 'UNDO';

                    undoBtn.disabled = false;
                    undoBtn.style.opacity = '1';
                    undoBtn.style.cursor = 'pointer';
                    undoBtn.style.background = '';
                    undoBtn.style.color = '';
                    undoBtn.style.borderColor = '';
                    undoBtn.title = `Undo to [${customLabel}] (${count}/${this.maxHistory} in history)`;
                    
                    if (undoText) {
                        undoText.innerText = customLabel.toUpperCase();
                        undoText.title = customLabel;
                    }

                    if (undoBadge) {
                        undoBadge.innerHTML = `<span class="undo-badge-short">${count}</span><span class="undo-badge-full">${count}/${this.maxHistory}</span>`;
                        undoBadge.style.display = 'inline-block';
                    }
                } else {
                    undoBtn.disabled = true;
                    undoBtn.style.opacity = '0.35';
                    undoBtn.style.cursor = 'not-allowed';
                    undoBtn.style.background = '';
                    undoBtn.style.color = '';
                    undoBtn.style.borderColor = '';
                    undoBtn.title = 'No AI changes to undo';
                    
                    if (undoText) {
                        undoText.innerText = 'UNDO';
                        undoText.title = '';
                    }

                    if (undoBadge) {
                        undoBadge.innerHTML = `<span class="undo-badge-short">0</span><span class="undo-badge-full">0/${this.maxHistory}</span>`;
                        undoBadge.style.display = 'none';
                    }
                }
            }

            // REDO Button
            const redoBtn = document.getElementById('taskbar-redo-btn');
            const redoBadge = document.getElementById('taskbar-redo-count-badge');
            const redoText = redoBtn ? redoBtn.querySelector('.btn-text') : null;

            if (redoBtn) {
                const count = this.redoStack.length;
                if (count > 0) {
                    const topRedo = this.redoStack[this.redoStack.length - 1];
                    const hasLabel = topRedo && topRedo.description && topRedo.description !== 'AI File Changes' && topRedo.description !== 'AI File Operations';
                    const customLabel = hasLabel ? topRedo.description : 'REDO';

                    redoBtn.disabled = false;
                    redoBtn.style.opacity = '1';
                    redoBtn.style.cursor = 'pointer';
                    redoBtn.style.background = '';
                    redoBtn.style.color = '';
                    redoBtn.style.borderColor = '';
                    redoBtn.title = `Redo [${customLabel}] (${count}/${this.maxHistory} in history)`;
                    
                    if (redoText) {
                        redoText.innerText = customLabel.toUpperCase();
                        redoText.title = customLabel;
                    }

                    if (redoBadge) {
                        redoBadge.innerHTML = `<span class="redo-badge-short">${count}</span><span class="redo-badge-full">${count}/${this.maxHistory}</span>`;
                        redoBadge.style.display = 'inline-block';
                    }
                } else {
                    redoBtn.disabled = true;
                    redoBtn.style.opacity = '0.35';
                    redoBtn.style.cursor = 'not-allowed';
                    redoBtn.style.background = '';
                    redoBtn.style.color = '';
                    redoBtn.style.borderColor = '';
                    redoBtn.title = 'No undone AI changes to redo';
                    
                    if (redoText) {
                        redoText.innerText = 'REDO';
                        redoText.title = '';
                    }

                    if (redoBadge) {
                        redoBadge.innerHTML = `<span class="redo-badge-short">0</span><span class="redo-badge-full">0/${this.maxHistory}</span>`;
                        redoBadge.style.display = 'none';
                    }
                }
            }
        }
    }

    window.UndoManager = new GravityUndoManager();
})();
