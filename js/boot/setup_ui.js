window.showNoticeModal = function(force = false) {
    const noticeModal = document.getElementById('first-launch-notice-modal');
    const closeBtn = document.getElementById('close-first-launch-notice');
    const closeX = document.getElementById('close-first-launch-notice-x');
    if (!noticeModal) return;
    if (force || !localStorage.getItem('rg_notice_seen')) {
        noticeModal.style.display = 'flex';
        const hide = () => {
            noticeModal.style.display = 'none';
            localStorage.setItem('rg_notice_seen', 'true');
        };
        if (closeBtn) closeBtn.onclick = hide;
        if (closeX) closeX.onclick = hide;
    }
};

function setupUI() {
    // Check first launch notice (only pops up if not seen yet)
    setTimeout(() => {
        window.showNoticeModal(false);
    }, 300);

    // 1. Setup Click-to-copy for .chat-cmd-badge
    document.addEventListener('click', (e) => {
        const homeBtn = e.target.closest('#taskbar-home-btn');
        if (homeBtn) {
            console.log('[GlobalHomeBtn] Clicked - returning to grid');
            e.preventDefault();
            e.stopPropagation();
            const webviewEl = document.getElementById('agent-hub-webview');
            const homeEl = document.getElementById('agent-hub-home');
            if (webviewEl) webviewEl.style.display = 'none';
            if (homeEl) homeEl.style.display = 'flex';
            const _rb3 = document.getElementById('taskbar-manual-rules-btn'); if (_rb3) _rb3.style.display = 'none';
            const _tb3 = document.getElementById('taskbar-manual-tree-btn'); if (_tb3) _tb3.style.display = 'none';
            const _rc3 = document.getElementById('taskbar-recmd-btn'); if (_rc3) _rc3.style.display = 'none';
            if (typeof syncBrowserView === 'function') syncBrowserView();
            return;
        }

        const badge = e.target.closest('.chat-cmd-badge');
        if (badge) {
            let cmdText = badge.innerText.trim();
            if (cmdText.startsWith('>_ ')) {
                cmdText = cmdText.substring(3).trim();
            }
            const match = cmdText.match(/^run-command\s+["'](.+)["']$/i);
            const toCopy = match ? match[1] : cmdText;
            navigator.clipboard.writeText(toCopy).then(() => {
                badge.setAttribute('data-tooltip', 'Copied!');
                setTimeout(() => {
                    badge.removeAttribute('data-tooltip');
                }, 1000);
            }).catch(err => {
                console.error("Clipboard copy failed:", err);
            });
        }
    });

    // 2. Setup Terminal Toggle Button Click Handler
    const toggleBtn = document.getElementById('terminal-toggle-btn');
    const popover = document.getElementById('terminal-popover');
    
    // GitHub remote browser opener setup
    const gitToggleBtn = document.getElementById('git-toggle-btn');
    const gitPopover = document.getElementById('git-popover');
    const gitWebview = document.getElementById('git-webview');
    const geminiUsageToggleBtn = document.getElementById('gemini-usage-toggle-btn');
    
    // Multi-Window Dynamic Popover System
    let globalPopoverZIndex = 1000;

    const isPopoverFrontmost = (popover) => {
        if (!popover || popover.style.display === 'none') return false;
        let maxZ = -1;
        document.querySelectorAll('.web-popover-window, #terminal-popover').forEach(p => {
            if (p.style.display !== 'none' && p !== popover) {
                const z = parseInt(p.style.zIndex || '1000', 10);
                if (z > maxZ) maxZ = z;
            }
        });
        const currentZ = parseInt(popover.style.zIndex || '1000', 10);
        return currentZ > maxZ;
    };

    const updateTaskbarButtonStyles = () => {
        // 1. GitHub Button
        const gitP = document.getElementById('web-popover-github');
        const gitBtn = document.getElementById('git-toggle-btn');
        if (gitBtn) {
            if (!gitP) {
                gitBtn.style.background = 'transparent';
                gitBtn.style.borderColor = 'transparent';
                gitBtn.style.color = 'rgba(255, 255, 255, 0.45)';
                gitBtn.style.boxShadow = 'none';
                gitBtn.style.borderRadius = '50%';
            } else if (gitP.style.display !== 'none' && isPopoverFrontmost(gitP)) {
                gitBtn.style.background = 'var(--primary)';
                gitBtn.style.borderColor = 'transparent';
                gitBtn.style.color = '#ffffff';
                gitBtn.style.boxShadow = '0 4px 15px rgba(0,0,0,0.5)';
                gitBtn.style.borderRadius = '8px';
            } else {
                gitBtn.style.background = 'rgba(255, 255, 255, 0.18)';
                gitBtn.style.borderColor = 'transparent';
                gitBtn.style.color = '#ffffff';
                gitBtn.style.boxShadow = 'none';
                gitBtn.style.borderRadius = '8px';
            }
        }

        // 2. Terminal Button
        const termP = document.getElementById('terminal-popover');
        const termBtn = document.getElementById('terminal-toggle-btn');
        if (termBtn) {
            const isTermOpen = termP && termP.style.display !== 'none';
            const isTermFrontmost = isTermOpen && isPopoverFrontmost(termP);

            if (isTermFrontmost) {
                window.hasTerminalBeenOpened = true;
                termBtn.style.background = 'var(--primary)';
                termBtn.style.borderColor = 'transparent';
                termBtn.style.color = '#ffffff';
                termBtn.style.boxShadow = '0 4px 15px rgba(0,0,0,0.5)';
                termBtn.style.borderRadius = '8px';
            } else if (isTermOpen || window.hasTerminalBeenOpened) {
                termBtn.style.background = 'rgba(255, 255, 255, 0.18)';
                termBtn.style.borderColor = 'transparent';
                termBtn.style.color = '#ffffff';
                termBtn.style.boxShadow = 'none';
                termBtn.style.borderRadius = '8px';
            } else {
                termBtn.style.background = 'transparent';
                termBtn.style.borderColor = 'transparent';
                termBtn.style.color = 'rgba(255, 255, 255, 0.45)';
                termBtn.style.boxShadow = 'none';
                termBtn.style.borderRadius = '50%';
            }
        }

        // Dynamic Editor Content Bottom-Left Corner Radius (0px when Terminal is Open, 12px when Closed)
        const editorContent = document.getElementById('editor-content');
        if (editorContent) {
            const isTermOpen = termP && termP.style.display !== 'none';
            if (isTermOpen) {
                editorContent.style.borderBottomLeftRadius = '0px';
                editorContent.style.borderBottom = 'none';
            } else {
                editorContent.style.borderBottomLeftRadius = '12px';
                editorContent.style.borderBottom = '1px solid var(--border-color)';
            }
        }

        // 3. Gemini Usage Badge
        const gemP = document.getElementById('web-popover-gemini-usage');
        const gemBtn = document.getElementById('gemini-usage-toggle-btn');
        if (gemBtn) {
            if (!gemP) {
                gemBtn.style.borderColor = 'transparent';
                gemBtn.style.background = 'transparent';
                gemBtn.style.borderRadius = '4px';
            } else if (gemP.style.display !== 'none' && isPopoverFrontmost(gemP)) {
                gemBtn.style.borderColor = 'transparent';
                gemBtn.style.background = 'var(--primary)';
                gemBtn.style.borderRadius = '8px';
            } else {
                gemBtn.style.borderColor = 'transparent';
                gemBtn.style.background = 'rgba(255, 255, 255, 0.18)';
                gemBtn.style.borderRadius = '8px';
            }
        }

        // 4. Custom Shortcut Pills inside status bar
        document.querySelectorAll('.status-shortcut-pill[data-shortcut-key]').forEach(pill => {
            const key = pill.getAttribute('data-shortcut-key');
            if (!key) return;
            const pop = document.getElementById(`web-popover-${key}`);
            if (!pop) {
                pill.style.background = 'transparent';
                pill.style.borderColor = 'transparent';
                pill.style.boxShadow = 'none';
                pill.style.borderRadius = '50%';
            } else if (pop.style.display !== 'none' && isPopoverFrontmost(pop)) {
                pill.style.background = 'var(--primary)';
                pill.style.borderColor = 'transparent';
                pill.style.boxShadow = '0 4px 15px rgba(0,0,0,0.5)';
                pill.style.borderRadius = '8px';
            } else {
                pill.style.background = 'rgba(255, 255, 255, 0.18)';
                pill.style.borderColor = 'transparent';
                pill.style.boxShadow = 'none';
                pill.style.borderRadius = '8px';
            }
        });
    };

    const bringPopoverToFront = (activePopover) => {
        if (!activePopover) return;
        globalPopoverZIndex++;
        activePopover.style.zIndex = globalPopoverZIndex.toString();
        updateTaskbarButtonStyles();
    };

    const setupWebPopoverResizing = (popover, isRightAligned) => {
        const lResizer = popover.querySelector('.web-popover-resizer-l');
        const rResizer = popover.querySelector('.web-popover-resizer-r');
        const tResizer = popover.querySelector('.web-popover-resizer-t');
        const tlResizer = popover.querySelector('.web-popover-resizer-tl');
        const trResizer = popover.querySelector('.web-popover-resizer-tr');
        
        let startWidth, startHeight, startX, startY, startLeft, startRight;

        const disableWebviews = (disabled) => {
            document.querySelectorAll('webview').forEach(wv => {
                wv.style.pointerEvents = disabled ? 'none' : 'auto';
            });
            document.body.style.userSelect = disabled ? 'none' : '';
        };
        
        const onMouseMoveL = (e) => {
            if (e.buttons === 0) { onMouseUp(); return; }
            if (isRightAligned) {
                const newWidth = Math.max(300, startWidth + (startX - e.clientX));
                popover.style.width = `${newWidth}px`;
            } else {
                const deltaX = startX - e.clientX;
                const newWidth = Math.max(300, startWidth + deltaX);
                popover.style.width = `${newWidth}px`;
                popover.style.left = `${startLeft - deltaX}px`;
            }
        };

        const onMouseMoveR = (e) => {
            if (e.buttons === 0) { onMouseUp(); return; }
            if (isRightAligned) {
                const deltaX = e.clientX - startX;
                const newWidth = Math.max(300, startWidth + deltaX);
                popover.style.width = `${newWidth}px`;
                popover.style.right = `${startRight - deltaX}px`;
            } else {
                const newWidth = Math.max(300, startWidth + (e.clientX - startX));
                popover.style.width = `${newWidth}px`;
            }
        };
        
        const onMouseMoveT = (e) => {
            if (e.buttons === 0) { onMouseUp(); return; }
            const newHeight = Math.max(200, startHeight - (e.clientY - startY));
            popover.style.height = `${newHeight}px`;
        };
        
        const onMouseMoveTL = (e) => {
            if (e.buttons === 0) { onMouseUp(); return; }
            const deltaX = startX - e.clientX;
            const newWidth = Math.max(300, startWidth + deltaX);
            const newHeight = Math.max(200, startHeight - (e.clientY - startY));
            popover.style.height = `${newHeight}px`;
            
            if (isRightAligned) {
                popover.style.width = `${newWidth}px`;
            } else {
                popover.style.width = `${newWidth}px`;
                popover.style.left = `${startLeft - deltaX}px`;
            }
        };

        const onMouseMoveTR = (e) => {
            if (e.buttons === 0) { onMouseUp(); return; }
            const newHeight = Math.max(200, startHeight - (e.clientY - startY));
            popover.style.height = `${newHeight}px`;
            
            if (isRightAligned) {
                const deltaX = e.clientX - startX;
                const newWidth = Math.max(300, startWidth + deltaX);
                popover.style.width = `${newWidth}px`;
                popover.style.right = `${startRight - deltaX}px`;
            } else {
                const newWidth = Math.max(300, startWidth + (e.clientX - startX));
                popover.style.width = `${newWidth}px`;
            }
        };
        
        const onMouseUp = () => {
            disableWebviews(false);
            document.removeEventListener('mousemove', onMouseMoveL);
            document.removeEventListener('mousemove', onMouseMoveR);
            document.removeEventListener('mousemove', onMouseMoveT);
            document.removeEventListener('mousemove', onMouseMoveTL);
            document.removeEventListener('mousemove', onMouseMoveTR);
            document.removeEventListener('mouseup', onMouseUp);
            window.removeEventListener('mouseup', onMouseUp);
            window.removeEventListener('blur', onMouseUp);
        };
        
        const startResize = (e, fn) => {
            e.preventDefault();
            e.stopPropagation();
            disableWebviews(true);
            startX = e.clientX;
            startY = e.clientY;
            startWidth = parseInt(document.defaultView.getComputedStyle(popover).width, 10);
            startHeight = parseInt(document.defaultView.getComputedStyle(popover).height, 10);
            startLeft = popover.offsetLeft;
            const parentRect = document.getElementById('editor-container').getBoundingClientRect();
            startRight = parentRect.right - popover.getBoundingClientRect().right;

            document.addEventListener('mousemove', fn);
            document.addEventListener('mouseup', onMouseUp);
            window.addEventListener('mouseup', onMouseUp);
            window.addEventListener('blur', onMouseUp);
        };

        if (lResizer) lResizer.addEventListener('mousedown', (e) => startResize(e, onMouseMoveL));
        if (rResizer) rResizer.addEventListener('mousedown', (e) => startResize(e, onMouseMoveR));
        if (tResizer) tResizer.addEventListener('mousedown', (e) => startResize(e, onMouseMoveT));
        if (tlResizer) tlResizer.addEventListener('mousedown', (e) => startResize(e, onMouseMoveTL));
        if (trResizer) trResizer.addEventListener('mousedown', (e) => startResize(e, onMouseMoveTR));
    };

    const createWebPopover = (key, url, title, buttonEl, isRightAligned) => {
        let popover = document.getElementById(`web-popover-${key}`);
        if (popover) {
            const isHidden = popover.style.display === 'none';
            const isFrontmost = isPopoverFrontmost(popover);

            if (isHidden) {
                popover.style.display = 'flex';
                bringPopoverToFront(popover);
            } else if (!isFrontmost) {
                bringPopoverToFront(popover);
            } else {
                popover.style.display = 'none';
                updateTaskbarButtonStyles();
            }
            return;
        }

        popover = document.createElement('div');
        popover.id = `web-popover-${key}`;
        popover.className = 'web-popover-window';
        
        popover.addEventListener('mousedown', () => bringPopoverToFront(popover), true);
        popover.addEventListener('pointerdown', () => bringPopoverToFront(popover), true);
        popover.addEventListener('click', () => bringPopoverToFront(popover), true);
        
        popover.style.position = 'absolute';

        if (key === 'github') {
            popover.style.top = '0px';
            popover.style.left = '0px';
            popover.style.right = '0px';
            popover.style.bottom = '44px';
            popover.style.width = '100%';
            popover.style.height = 'calc(100% - 44px)';
            popover.style.maxHeight = '100%';
            popover.style.borderRadius = '0px';
        } else if (key.startsWith('html-preview-')) {
            const squareSize = Math.max(480, Math.min(window.innerWidth * 0.7, window.innerHeight * 0.7, 640));
            popover.style.width = `${squareSize}px`;
            popover.style.height = `${squareSize}px`;
            popover.style.maxHeight = '90vh';
            popover.style.maxWidth = '90vw';
            popover.style.borderRadius = '14px';
            popover.style.top = '50%';
            popover.style.left = '50%';
            popover.style.transform = 'translate(-50%, -50%)';
            popover.style.right = 'auto';
            popover.style.bottom = 'auto';
        } else {
            const defaultWidth = isRightAligned ? 600 : 410;
            const defaultHeight = isRightAligned ? 450 : 730;
            popover.style.width = `${defaultWidth}px`;
            popover.style.height = `${defaultHeight}px`;
            popover.style.maxHeight = 'calc(100% - 60px)';
            popover.style.borderRadius = '12px';
            popover.style.bottom = '50px';

            const rect = buttonEl ? buttonEl.getBoundingClientRect() : { left: 100, right: 100 };
            const parentEl = document.getElementById('editor-container') || document.body;
            const parentRect = parentEl.getBoundingClientRect();
            
            if (isRightAligned) {
                const rightOffset = parentRect.right - rect.right;
                popover.style.right = `${rightOffset}px`;
                popover.style.left = 'auto';
            } else {
                const leftOffset = rect.left - parentRect.left;
                popover.style.left = `${leftOffset}px`;
                popover.style.right = 'auto';
            }
        }
        popover.style.display = 'flex';
        popover.style.flexDirection = 'column';
        popover.style.background = 'rgba(20, 20, 22, 0.85)';
        popover.style.backdropFilter = 'blur(24px)';
        popover.style.webkitBackdropFilter = 'blur(24px)';
        popover.style.borderLeft = '1px solid var(--border-color)';
        popover.style.borderRight = '1px solid var(--border-color)';
        popover.style.borderTop = 'none';
        popover.style.borderBottom = 'none';
        popover.style.boxShadow = 'none';
        popover.style.zIndex = '1000';
        popover.style.overflow = 'hidden';
        popover.style.fontFamily = "'DM Sans', sans-serif";

        popover.innerHTML = `
            <div class="git-view-header" style="height:44px; min-height:44px; border-bottom: none; display:flex; align-items:center; justify-content:space-between; padding:0 12px; background: #14151c; user-select: none; cursor: move;">
                <div style="display:flex; align-items:center; gap:10px; flex: 1; overflow: hidden; margin-right: 12px;">
                    <!-- WebView Top Back Control -->
                    <span class="git-wv-top-back" style="cursor:pointer; color:var(--text-muted); display:flex; align-items:center; flex-shrink:0; opacity: 0.35;" title="Back">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                    </span>
                    <!-- WebView Top Forward Control -->
                    <span class="git-wv-top-forward" style="cursor:pointer; color:var(--text-muted); display:flex; align-items:center; flex-shrink:0; opacity: 0.35;" title="Forward">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                    </span>
                    <!-- WebView Reload Control -->
                    <span class="git-wv-reload" style="cursor:pointer; color:var(--text-muted); display:flex; align-items:center; flex-shrink: 0;" title="Reload">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20 20"></path></svg>
                    </span>
                    <!-- URL Address Field -->
                    <div class="git-url-display-container" style="display:flex; align-items:center; gap:6px; flex: 1; max-width: 420px; background: rgba(255,255,255,0.06); padding: 4px 10px; border-radius: 6px; border: 1px solid var(--border-color); overflow: hidden;">
                        <input class="git-url-input-field" type="text" value="${url}" style="font-size: 10px; color: var(--text-main); font-family: 'JetBrains Mono', monospace; background: transparent; border: none; outline: none; flex: 1; min-width: 0;" placeholder="Enter URL or search...">
                        <span class="git-url-copy-btn" style="cursor: pointer; display: inline-flex; align-items: center; justify-content: center; color: var(--text-muted); flex-shrink: 0;" title="Copy URL to clipboard">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
                        </span>
                    </div>
                    <!-- DevTools Control (Wrench Icon) -->
                    <span class="git-wv-devtools" style="cursor: pointer; color: var(--text-muted); display: flex; align-items: center; justify-content: center; flex-shrink: 0; opacity: 0.8; transition: color 0.2s, opacity 0.2s;" title="Toggle DevTools">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;">
                            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
                        </svg>
                    </span>
                </div>
                <div style="display:flex; align-items:center; gap:10px;">
                    <span class="git-wv-minimize" style="cursor:pointer; color:var(--text-muted); display:flex; align-items:center;" title="Minimize Window">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    </span>
                    <span class="git-wv-close" style="cursor:pointer; color:var(--text-muted); display:flex; align-items:center;" title="Close Window">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </span>
                </div>
            </div>
            <div style="flex: 1; position: relative; background: #0d1117;">
                ${(!window.process || window.process.platform === 'browser')
                    ? `<iframe class="web-webview-el" src="${url}" style="width: 100%; height: 100%; border: none;" allow="clipboard-read; clipboard-write"></iframe>`
                    : `<webview class="web-webview-el" src="${url}" useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" style="width: 100%; height: 100%; border: none;" allowpopups></webview>`
                }
            </div>
            <!-- Bottom Taskbar Navigation Footer (Mobile Style) -->
            <div class="web-popover-bottom-bar" style="height: 38px; min-height: 38px; border-top: none; display: flex; align-items: center; justify-content: space-between; padding: 0 68px; background: #060608; user-select: none; z-index: 10;">
                <span class="web-bottom-back-btn" style="cursor: pointer; color: var(--text-muted); display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 50%; transition: all 0.15s ease; opacity: 0.35;" title="Back">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="16,4 6,12 16,20"></polygon></svg>
                </span>
                <span class="web-bottom-forward-btn" style="cursor: pointer; color: var(--text-muted); display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 50%; transition: all 0.15s ease; opacity: 0.35;" title="Forward">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="8,4 18,12 8,20"></polygon></svg>
                </span>
            </div>
            <!-- Resizers -->
            <div class="web-popover-resizer-l"></div>
            <div class="web-popover-resizer-r"></div>
            <div class="web-popover-resizer-t"></div>
            <div class="web-popover-resizer-tl"></div>
            <div class="web-popover-resizer-tr"></div>
        `;

        document.getElementById('editor-container').appendChild(popover);

        const headerEl = popover.querySelector('.git-view-header');
        if (headerEl) {
            headerEl.onmousedown = (e) => {
                if (e.target.closest('.git-url-display-container, .git-wv-reload, .git-wv-minimize, .git-wv-close, input')) {
                    return;
                }
                e.preventDefault();
                bringPopoverToFront(popover);
                
                const startX = e.clientX;
                const startY = e.clientY;
                const startLeft = popover.offsetLeft;
                const startTop = popover.offsetTop;

                document.querySelectorAll('webview').forEach(wv => wv.style.pointerEvents = 'none');
                document.body.style.userSelect = 'none';

                const onHeaderMove = (m) => {
                    if (m.buttons === 0) { onHeaderUp(); return; }
                    const deltaX = m.clientX - startX;
                    const deltaY = m.clientY - startY;
                    popover.style.left = `${startLeft + deltaX}px`;
                    popover.style.top = `${startTop + deltaY}px`;
                    popover.style.right = 'auto';
                    popover.style.bottom = 'auto';
                };

                const onHeaderUp = () => {
                    document.querySelectorAll('webview').forEach(wv => wv.style.pointerEvents = 'auto');
                    document.body.style.userSelect = '';
                    window.removeEventListener('mousemove', onHeaderMove);
                    window.removeEventListener('mouseup', onHeaderUp);
                    window.removeEventListener('blur', onHeaderUp);
                };

                window.addEventListener('mousemove', onHeaderMove);
                window.addEventListener('mouseup', onHeaderUp);
                window.addEventListener('blur', onHeaderUp);
            };
        }

        const webview = popover.querySelector('.web-webview-el');
        const urlInput = popover.querySelector('.git-url-input-field');
        const copyBtn = popover.querySelector('.git-url-copy-btn');
        const reloadBtn = popover.querySelector('.git-wv-reload');
        const minimizeBtn = popover.querySelector('.git-wv-minimize');
        const closeBtn = popover.querySelector('.git-wv-close');
        const bottomBackBtn = popover.querySelector('.web-bottom-back-btn');
        const bottomForwardBtn = popover.querySelector('.web-bottom-forward-btn');

        if (webview) {
            webview.addEventListener('focus', () => bringPopoverToFront(popover));
            webview.addEventListener('mousedown', () => bringPopoverToFront(popover));
            webview.addEventListener('dom-ready', () => {
                bringPopoverToFront(popover);
                try {
                    webview.insertCSS(`
                        ::-webkit-scrollbar { width: 6px !important; height: 6px !important; }
                        ::-webkit-scrollbar-track { background: transparent !important; }
                        ::-webkit-scrollbar-thumb { background: rgba(120, 120, 140, 0.4) !important; border-radius: 3px !important; }
                        ::-webkit-scrollbar-thumb:hover { background: rgba(160, 160, 180, 0.6) !important; }
                        ::-webkit-scrollbar-corner { background: transparent !important; }
                    `);
                } catch(e) {}
            });
        }

        const topBackBtn = popover.querySelector('.git-wv-top-back');
        if (topBackBtn) {
            topBackBtn.onclick = (e) => { e.stopPropagation(); if (webview.canGoBack()) webview.goBack(); };
        }
        const topForwardBtn = popover.querySelector('.git-wv-top-forward');
        if (topForwardBtn) {
            topForwardBtn.onclick = (e) => { e.stopPropagation(); if (webview.canGoForward()) webview.goForward(); };
        }

        bottomBackBtn.onclick = (e) => { e.stopPropagation(); if (webview.canGoBack()) webview.goBack(); };
        bottomForwardBtn.onclick = (e) => { e.stopPropagation(); if (webview.canGoForward()) webview.goForward(); };
        reloadBtn.onclick = (e) => { e.stopPropagation(); webview.reload(); };
        
        const devToolsBtn = popover.querySelector('.git-wv-devtools');
        if (devToolsBtn) {
            devToolsBtn.onclick = (e) => {
                e.stopPropagation();
                if (webview) {
                    if (typeof webview.isDevToolsOpened === 'function' && webview.isDevToolsOpened()) {
                        webview.closeDevTools();
                    } else {
                        webview.openDevTools({ mode: 'detach' });
                    }
                }
            };
        }

        minimizeBtn.onclick = (e) => {
            e.stopPropagation();
            popover.style.display = 'none';
            updateTaskbarButtonStyles();
        };
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            popover.remove();
            updateTaskbarButtonStyles();
        };

        const updateUrl = () => {
            const currentUrl = webview.getURL();
            if (currentUrl && currentUrl !== 'about:blank') {
                if (document.activeElement !== urlInput) {
                    urlInput.value = currentUrl;
                }
            }
            if (webview.canGoBack()) {
                bottomBackBtn.style.color = '#ffffff';
                bottomBackBtn.style.opacity = '1';
                if (topBackBtn) { topBackBtn.style.color = '#ffffff'; topBackBtn.style.opacity = '1'; }
            } else {
                bottomBackBtn.style.color = 'var(--text-muted)';
                bottomBackBtn.style.opacity = '0.35';
                if (topBackBtn) { topBackBtn.style.color = 'var(--text-muted)'; topBackBtn.style.opacity = '0.35'; }
            }
            if (webview.canGoForward()) {
                bottomForwardBtn.style.color = '#ffffff';
                bottomForwardBtn.style.opacity = '1';
                if (topForwardBtn) { topForwardBtn.style.color = '#ffffff'; topForwardBtn.style.opacity = '1'; }
            } else {
                bottomForwardBtn.style.color = 'var(--text-muted)';
                bottomForwardBtn.style.opacity = '0.35';
                if (topForwardBtn) { topForwardBtn.style.color = 'var(--text-muted)'; topForwardBtn.style.opacity = '0.35'; }
            }
        };
        webview.addEventListener('did-navigate', updateUrl);
        webview.addEventListener('did-navigate-in-page', updateUrl);

        urlInput.onclick = (e) => { e.stopPropagation(); };
        urlInput.onmousedown = (e) => { e.stopPropagation(); };
        urlInput.onkeydown = (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
                let val = urlInput.value.trim();
                if (!val) return;
                if (!/^https?:\/\//i.test(val)) {
                    if (val.includes('.') || val.includes(':')) {
                        val = 'https://' + val;
                    } else {
                        val = 'https://www.google.com/search?q=' + encodeURIComponent(val);
                    }
                }
                urlInput.value = val;
                webview.src = val;
                urlInput.blur();
            }
        };

        copyBtn.onclick = (e) => {
            e.stopPropagation();
            const currentUrl = webview.getURL() || urlInput.value;
            if (currentUrl && currentUrl !== 'about:blank') {
                try {
                    const { clipboard } = require('electron');
                    clipboard.writeText(currentUrl);
                } catch (err) {
                    navigator.clipboard.writeText(currentUrl);
                }
                copyBtn.style.color = '#10b981';
                copyBtn.title = 'Copied!';
                setTimeout(() => {
                    copyBtn.style.color = 'var(--text-muted)';
                    copyBtn.title = 'Copy URL to clipboard';
                }, 1000);
            }
        };

        popover.addEventListener('mousedown', () => {
            bringPopoverToFront(popover);
        });

        bringPopoverToFront(popover);
        if (key === 'github') {
            if (gitToggleBtn) {
                gitToggleBtn.style.color = '#fff';
                gitToggleBtn.style.background = 'var(--primary)';
            }
        } else if (key === 'gemini-usage') {
            if (geminiUsageToggleBtn) {
                geminiUsageToggleBtn.style.borderColor = 'rgba(255,255,255,0.2)';
            }
        } else {
            if (buttonEl) {
                buttonEl.style.background = 'var(--primary)';
                buttonEl.style.borderColor = 'var(--primary)';
            }
        }

        setupWebPopoverResizing(popover, isRightAligned);
    };

    window.createWebPopover = createWebPopover;
    window.openHtmlMiniBrowser = (filePath) => {
        const pathModule = require('path');
        const filename = pathModule.basename(filePath);
        const fileUrl = 'file:///' + filePath.replace(/\\/g, '/');
        let anchorBtn = document.getElementById('status-bar-shortcuts') || document.body;
        const popoverKey = 'html-preview-' + Date.now();
        createWebPopover(popoverKey, fileUrl, `HTML: ${filename}`, anchorBtn, false);
    };

    if (gitToggleBtn) {
        gitToggleBtn.onclick = (e) => {
            e.stopPropagation();
            createWebPopover('github', 'https://github.com', 'GitHub', gitToggleBtn, true);
        };
    }

    if (geminiUsageToggleBtn) {
        geminiUsageToggleBtn.onclick = (e) => {
            e.stopPropagation();
            const geminiUrl = 'https://gemini.google.com/usage';
            createWebPopover('gemini-usage', geminiUrl, 'Gemini Usage', geminiUsageToggleBtn, true);
        };
    }
    if (toggleBtn && popover) {
        popover.addEventListener('mousedown', () => bringPopoverToFront(popover));
        toggleBtn.onclick = (e) => {
            e.stopPropagation();
            const isHidden = popover.style.display === 'none' || !popover.style.display;
            const isFrontmost = isPopoverFrontmost(popover);

            if (isHidden) {
                window.hasTerminalBeenOpened = true;
                popover.style.display = 'flex';
                bringPopoverToFront(popover);
                
                if (window.terminalCount === 0) {
                    addSubTerminal(true);
                } else if (window.activeSubTabId) {
                    switchSubTerminal(window.activeSubTabId);
                }
                updateTaskbarButtonStyles();
                window.dispatchEvent(new Event('resize'));
            } else if (!isFrontmost) {
                bringPopoverToFront(popover);
            } else {
                popover.style.display = 'none';
                updateTaskbarButtonStyles();
                window.dispatchEvent(new Event('resize'));
            }
        };
        
        popover.onclick = (e) => { e.stopPropagation(); };
    }

    // Shortcuts Bar Logic
    const shortcutsList = document.getElementById('status-bar-shortcuts-list');
    const shortcutAddModal = document.getElementById('add-shortcut-modal');
    const shortcutCloseBtn = document.getElementById('close-shortcut-modal-btn');
    const shortcutCloseXBtn = document.getElementById('close-shortcut-modal-x');
    const shortcutSaveBtn = document.getElementById('save-shortcut-btn');
    const shortcutTitleInput = document.getElementById('shortcut-title-input');
    const shortcutUrlInput = document.getElementById('shortcut-url-input');
    const shortcutModalTitle = document.getElementById('shortcut-modal-title');
    
    let editingShortcutIndex = null;

    const loadShortcuts = () => {
        let list = [];
        try {
            const raw = localStorage.getItem('gravity-shortcuts');
            if (raw) {
                list = JSON.parse(raw);
                if (!list.some(item => item.title === 'Instagram Reels')) {
                    list.push({ title: 'Instagram Reels', url: 'https://www.instagram.com/reels/' });
                    localStorage.setItem('gravity-shortcuts', JSON.stringify(list));
                }
            } else {
                list = [
                    { title: 'GitHub', url: 'https://github.com' },
                    { title: 'Gemini', url: 'https://gemini.google.com' },
                    { title: 'YouTube', url: 'https://youtube.com' },
                    { title: 'Instagram Reels', url: 'https://www.instagram.com/reels/' }
                ];
                localStorage.setItem('gravity-shortcuts', JSON.stringify(list));
            }
        } catch (e) {
            console.error("Failed to load shortcuts:", e);
        }
        return list;
    };
    
    const saveShortcuts = (list) => {
        try {
            localStorage.setItem('gravity-shortcuts', JSON.stringify(list));
        } catch (e) {
            console.error("Failed to save shortcuts:", e);
        }
    };
    
    const renderShortcuts = () => {
        if (!shortcutsList) return;
        shortcutsList.innerHTML = '';
        const list = loadShortcuts();
        
        list.forEach((item, index) => {
            const pill = document.createElement('div');
            pill.className = 'status-shortcut-pill';
            pill.setAttribute('data-shortcut-key', `shortcut-${index}`);
            pill.title = `${item.title}\n\nLeft click: Open\nRight click: Delete`;
            
            let domain = 'github.com';
            try {
                domain = new URL(item.url).hostname;
            } catch(e){}
            
            pill.innerHTML = `
                <img src="https://www.google.com/s2/favicons?domain=${domain}&sz=32" style="width: 16px; height: 16px; border-radius: 2px;" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'16\\' height=\\'16\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'%23888\\' stroke-width=\\'2.5\\' stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\'><circle cx=\\'12\\' cy=\\'12\\' r=\\'10\\'></circle><line x1=\\'2\\' y1=\\'12\\' x2=\\'22\\' y2=\\'12\\'></line><path d=\\'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z\\'></path></svg>';">
            `;
            
            pill.onclick = (e) => {
                e.stopPropagation();
                createWebPopover(`shortcut-${index}`, item.url, item.title, pill, false);
            };
            
            pill.setAttribute('draggable', 'true');
            pill.setAttribute('data-shortcut-index', String(index));
            
            pill.ondragstart = (e) => {
                pill.classList.add('dragging-pill');
                pill.style.opacity = '0.4';
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(index));
                window._draggedPillElement = pill;
            };
            
            pill.ondragend = () => {
                pill.style.opacity = '1';
                pill.classList.remove('dragging-pill');
                window._draggedPillElement = null;

                const allPills = Array.from(shortcutsList.querySelectorAll('.status-shortcut-pill'));
                const originalList = loadShortcuts();
                const newList = [];
                
                allPills.forEach(p => {
                    const origIdx = parseInt(p.getAttribute('data-shortcut-index'), 10);
                    if (!isNaN(origIdx) && originalList[origIdx]) {
                        newList.push(originalList[origIdx]);
                    }
                });

                if (newList.length === originalList.length) {
                    saveShortcuts(newList);
                }
                renderShortcuts();
            };
            
            pill.ondragover = (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';

                const draggingPill = window._draggedPillElement || shortcutsList.querySelector('.dragging-pill');
                if (!draggingPill || draggingPill === pill) return;

                const rect = pill.getBoundingClientRect();
                const relX = e.clientX - rect.left;

                if (relX < rect.width / 2) {
                    shortcutsList.insertBefore(draggingPill, pill);
                } else {
                    shortcutsList.insertBefore(draggingPill, pill.nextSibling);
                }
            };

            pill.ondrop = (e) => {
                e.preventDefault();
            };

            pill.oncontextmenu = (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const oldMenu = document.getElementById('shortcut-context-menu');
                if (oldMenu) oldMenu.remove();

                const key = `shortcut-${index}`;
                const pop = document.getElementById(`web-popover-${key}`);
                const isOpened = pop && pop.style.display !== 'none';

                const menu = document.createElement('div');
                menu.id = 'shortcut-context-menu';
                menu.className = 'shortcut-context-menu';
                
                const pillRect = pill.getBoundingClientRect();
                menu.style.position = 'fixed';
                menu.style.left = `${Math.max(10, Math.min(window.innerWidth - 160, pillRect.left))}px`;
                menu.style.bottom = `${window.innerHeight - pillRect.top + 6}px`;
                menu.style.zIndex = '99999';

                menu.innerHTML = `
                    <div class="menu-item menu-action-toggle">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            ${isOpened ? '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>' : '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line>'}
                        </svg>
                        <span>${isOpened ? 'Close' : 'Open'}</span>
                    </div>
                    <div class="menu-item menu-action-edit">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        <span>Edit</span>
                    </div>
                    <div class="menu-item menu-action-delete danger">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        <span>Delete</span>
                    </div>
                `;

                document.body.appendChild(menu);

                menu.querySelector('.menu-action-toggle').onclick = (ev) => {
                    ev.stopPropagation();
                    menu.remove();
                    if (isOpened) {
                        pop.style.display = 'none';
                        updateTaskbarButtonStyles();
                    } else {
                        pill.click();
                    }
                };

                menu.querySelector('.menu-action-edit').onclick = (ev) => {
                    ev.stopPropagation();
                    menu.remove();
                    editingShortcutIndex = index;
                    if (shortcutModalTitle) shortcutModalTitle.innerText = 'EDIT SHORTCUT';
                    if (shortcutTitleInput) shortcutTitleInput.value = item.title;
                    if (shortcutUrlInput) shortcutUrlInput.value = item.url;
                    if (shortcutAddModal) shortcutAddModal.style.display = 'flex';
                    if (shortcutTitleInput) shortcutTitleInput.focus();
                };

                menu.querySelector('.menu-action-delete').onclick = (ev) => {
                    ev.stopPropagation();
                    menu.remove();
                    const deleteAction = () => {
                        const currentList = loadShortcuts();
                        const newList = currentList.filter((_, idx) => idx !== index);
                        saveShortcuts(newList);
                        const popupEl = document.getElementById(`web-popover-shortcut-${index}`);
                        if (popupEl) popupEl.remove();
                        renderShortcuts();
                    };

                    if (typeof showConfirm === 'function') {
                        showConfirm(`Delete shortcut "${item.title}"?`, deleteAction);
                    } else {
                        if (confirm(`Delete shortcut "${item.title}"?`)) {
                            deleteAction();
                        }
                    }
                };

                const closeHandler = (ev) => {
                    if (!menu.contains(ev.target)) {
                        menu.remove();
                        document.removeEventListener('pointerdown', closeHandler);
                    }
                };
                setTimeout(() => {
                    document.addEventListener('pointerdown', closeHandler);
                }, 10);
            };
            
            shortcutsList.appendChild(pill);
        });
        
        const addBtn = document.createElement('div');
        addBtn.id = 'add-shortcut-trigger-btn';
        addBtn.style.display = 'inline-flex';
        addBtn.style.alignItems = 'center';
        addBtn.style.justifyContent = 'center';
        addBtn.style.width = '34px';
        addBtn.style.height = '34px';
        addBtn.style.borderRadius = '50%';
        addBtn.style.background = 'transparent';
        addBtn.style.border = '1px solid transparent';
        addBtn.style.cursor = 'pointer';
        addBtn.style.transition = 'all 0.2s';
        addBtn.style.color = 'var(--text-muted)';
        addBtn.style.opacity = '0.7';
        addBtn.style.flexShrink = '0';
        addBtn.title = 'Register Internet Shortcut';
        addBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
        
        addBtn.onmouseenter = () => {
            addBtn.style.background = 'rgba(255,255,255,0.08)';
            addBtn.style.color = '#fff';
            addBtn.style.borderColor = 'rgba(255,255,255,0.15)';
            addBtn.style.opacity = '1';
        };
        addBtn.onmouseleave = () => {
            addBtn.style.background = 'transparent';
            addBtn.style.color = 'var(--text-muted)';
            addBtn.style.borderColor = 'transparent';
            addBtn.style.opacity = '0.7';
        };
        
        addBtn.onclick = (e) => {
            e.stopPropagation();
            editingShortcutIndex = null;
            if (shortcutModalTitle) shortcutModalTitle.innerText = 'REGISTER SHORTCUT';
            if (shortcutAddModal) {
                if (shortcutTitleInput) shortcutTitleInput.value = '';
                if (shortcutUrlInput) shortcutUrlInput.value = 'https://';
                shortcutAddModal.style.display = 'flex';
                if (shortcutTitleInput) shortcutTitleInput.focus();
            }
        };
        
        shortcutsList.appendChild(addBtn);
        updateTaskbarButtonStyles();
    };
    
    const closeShortcutModal = (e) => {
        if (e) e.stopPropagation();
        if (shortcutAddModal) shortcutAddModal.style.display = 'none';
        editingShortcutIndex = null;
    };
    
    if (shortcutCloseBtn) shortcutCloseBtn.onclick = closeShortcutModal;
    if (shortcutCloseXBtn) shortcutCloseXBtn.onclick = closeShortcutModal;
    
    if (shortcutSaveBtn && shortcutAddModal) {
        shortcutSaveBtn.onclick = (e) => {
            e.stopPropagation();
            const title = shortcutTitleInput ? shortcutTitleInput.value.trim() : '';
            let url = shortcutUrlInput ? shortcutUrlInput.value.trim() : '';
            
            if (!title) {
                alert('Please enter a title!');
                return;
            }
            if (!url || url === 'https://' || url === 'http://') {
                alert('Please enter a valid URL!');
                return;
            }
            
            if (!/^https?:\/\//i.test(url)) {
                url = 'https://' + url;
            }
            
            const list = loadShortcuts();
            if (editingShortcutIndex !== null && list[editingShortcutIndex]) {
                list[editingShortcutIndex] = { title, url };
            } else {
                list.push({ title, url });
            }
            saveShortcuts(list);
            shortcutAddModal.style.display = 'none';
            editingShortcutIndex = null;
            renderShortcuts();
        };
    }
    
    renderShortcuts();

    // 3. Setup Popover Resizers
    const setupPopoverResizers = () => {
        const lResizer = popover ? popover.querySelector('.popover-resizer-l') : null;
        const tResizer = popover ? popover.querySelector('.popover-resizer-t') : null;
        const tlResizer = popover ? popover.querySelector('.popover-resizer-tl') : null;
        if (!popover) return;
        
        let startWidth, startHeight, startX, startY;
        
        const onMouseMoveL = (e) => {
            const newWidth = Math.max(300, startWidth - (e.clientX - startX));
            popover.style.width = `${newWidth}px`;
        };
        
        const onMouseMoveT = (e) => {
            const newHeight = Math.max(200, startHeight - (e.clientY - startY));
            popover.style.height = `${newHeight}px`;
        };
        
        const onMouseMoveTL = (e) => {
            const newWidth = Math.max(300, startWidth - (e.clientX - startX));
            const newHeight = Math.max(200, startHeight - (e.clientY - startY));
            popover.style.width = `${newWidth}px`;
            popover.style.height = `${newHeight}px`;
        };
        
        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMoveL);
            document.removeEventListener('mousemove', onMouseMoveT);
            document.removeEventListener('mousemove', onMouseMoveTL);
            document.removeEventListener('mouseup', onMouseUp);
        };
        
        if (lResizer) {
            lResizer.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                startX = e.clientX;
                startWidth = parseInt(document.defaultView.getComputedStyle(popover).width, 10);
                document.addEventListener('mousemove', onMouseMoveL);
                document.addEventListener('mouseup', onMouseUp);
            });
        }
        
        if (tResizer) {
            tResizer.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                startY = e.clientY;
                startHeight = parseInt(document.defaultView.getComputedStyle(popover).height, 10);
                document.addEventListener('mousemove', onMouseMoveT);
                document.addEventListener('mouseup', onMouseUp);
            });
        }
        
        if (tlResizer) {
            tlResizer.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                startX = e.clientX;
                startY = e.clientY;
                startWidth = parseInt(document.defaultView.getComputedStyle(popover).width, 10);
                startHeight = parseInt(document.defaultView.getComputedStyle(popover).height, 10);
                document.addEventListener('mousemove', onMouseMoveTL);
                document.addEventListener('mouseup', onMouseUp);
            });
        }
    };
    if (popover) setupPopoverResizers();

    const _path = require('path');
    const _fs = require('fs');
    function getSettingsPath() {
        const gravityRoot = window.appRootPath || process.cwd();
        return _path.join(gravityRoot, 'Settings.json');
    }
    function loadSettings() {
        try {
            const p = getSettingsPath();
            if (_fs.existsSync(p)) return JSON.parse(_fs.readFileSync(p, 'utf-8'));
        } catch(e) {}
        return {};
    }
    function saveSettings(data) {
        try { _fs.writeFileSync(getSettingsPath(), JSON.stringify(data, null, 2), 'utf-8'); } catch(e) {}
    }

    if (typeof window.reloadAgentSettings === 'function') window.reloadAgentSettings();

    const clearQueueBtn = document.getElementById('clear-queue-btn');
    if (clearQueueBtn) {
        clearQueueBtn.onclick = () => {
            window.requestedFilesQueue = [];
            if (typeof window.updateDragDropQueueUI === 'function') {
                window.updateDragDropQueueUI();
            }
        };
    }
    if (typeof window.updateDragDropQueueUI === 'function') {
        window.updateDragDropQueueUI();
    }

    const localSettingsBtn = document.getElementById('btn-local-settings');
    const localSettingsModal = document.getElementById('local-settings-modal');
    const closeLocalSettings = document.getElementById('close-local-settings');

    if (localSettingsBtn && localSettingsModal) {
        localSettingsBtn.onclick = () => {
            if (typeof window.reloadAgentSettings === 'function') window.reloadAgentSettings(); 
            
            const contentEl = document.getElementById('local-settings-content');
            if (contentEl) {
                contentEl.style.justifyContent = 'flex-start';
                contentEl.style.alignItems = 'stretch';
                contentEl.innerHTML = `
                    <div style="display:flex; flex-direction:column; gap:14px; width:100%; font-family:'DM Sans',sans-serif;">
                        <!-- Debug Mode -->
                        <div style="display:flex; justify-content:space-between; align-items:center; width:100%; box-sizing:border-box;">
                            <span style="font-weight:600; color:#eee; font-size:11.5px;">Debug Mode</span>
                            <label class="switch-toggle">
                                <input type="checkbox" id="chk-debug-mode" ${window.debugMode ? 'checked' : ''}>
                                <span class="slider-toggle"></span>
                            </label>
                        </div>
                        <!-- Auto Refresh Session -->
                        <div style="display:flex; justify-content:space-between; align-items:center; width:100%; box-sizing:border-box;">
                            <span style="font-weight:600; color:#eee; font-size:11.5px;">Auto Refresh Session</span>
                            <label class="switch-toggle">
                                <input type="checkbox" id="chk-auto-refresh-session" ${window.autoRefreshSession ? 'checked' : ''}>
                                <span class="slider-toggle"></span>
                            </label>
                        </div>
                        <!-- Refresh Turn Count -->
                        <div id="refresh-turn-container" style="display:${window.autoRefreshSession ? 'flex' : 'none'}; justify-content:space-between; align-items:center; width:100%; box-sizing:border-box;">
                            <span style="font-weight:600; color:#eee; font-size:11.5px;">Refresh Turn Trigger</span>
                            <input type="number" id="txt-refresh-turn-count" value="${window.refreshTurnCount}" style="width:50px; background:var(--surface-low); border:1px solid var(--border-color); color:#fff; font-size:11px; padding:2px 6px; border-radius:4px; text-align:center; outline:none;">
                        </div>
                        <!-- Sending File Format -->
                        <div style="display:flex; justify-content:space-between; align-items:center; width:100%; box-sizing:border-box;">
                            <span style="font-weight:600; color:#eee; font-size:11.5px;">Sending File Format</span>
                            <select id="chk-send-format" style="background:var(--surface-low); border:1px solid var(--border-color); color:#fff; font-size:11px; padding:3px 6px; border-radius:4px; outline:none;">
                                <option value="md" ${(!window.sendFormat || window.sendFormat === 'md') ? 'selected' : ''}>MD (.md)</option>
                                <option value="pdf" ${window.sendFormat === 'pdf' ? 'selected' : ''}>PDF (.pdf)</option>
                                <option value="jpeg" ${(window.sendFormat === 'jpeg' || window.sendFormat === 'jpg') ? 'selected' : ''}>JPEG (.jpeg)</option>
                            </select>
                        </div>
                        <!-- Auto Gemini -->
                        <div style="display:flex; justify-content:space-between; align-items:center; width:100%; box-sizing:border-box;">
                            <span style="font-weight:600; color:#eee; font-size:11.5px;">Auto Gemini</span>
                            <label class="switch-toggle">
                                <input type="checkbox" id="chk-auto-gemini" ${window.autoGemini ? 'checked' : ''}>
                                <span class="slider-toggle"></span>
                            </label>
                        </div>
                        <!-- Prefer Full File Replace -->
                        <div style="display:flex; justify-content:space-between; align-items:center; width:100%; box-sizing:border-box;">
                            <span style="font-weight:600; color:#eee; font-size:11.5px;" title="Force AI to output full updated file (write-file) instead of snippet edits">Full File Overwrite (write-file)</span>
                            <label class="switch-toggle">
                                <input type="checkbox" id="chk-prefer-full-write" ${window.preferFullWrite !== false ? 'checked' : ''}>
                                <span class="slider-toggle"></span>
                            </label>
                        </div>
                        <!-- Use Emote -->
                        <div style="display:flex; justify-content:space-between; align-items:center; width:100%; box-sizing:border-box;">
                            <span style="font-weight:600; color:#eee; font-size:11.5px;" title="Allow AI to output emotional emotes and trigger center screen animation">Use Emote</span>
                            <label class="switch-toggle">
                                <input type="checkbox" id="chk-use-emote" ${window.useEmote !== false ? 'checked' : ''}>
                                <span class="slider-toggle"></span>
                            </label>
                        </div>
                    </div>
                `;
                
                const chkDebug = document.getElementById('chk-debug-mode');
                const chkAutoRefresh = document.getElementById('chk-auto-refresh-session');
                const txtRefreshCount = document.getElementById('txt-refresh-turn-count');
                const containerRefresh = document.getElementById('refresh-turn-container');
                const chkAutoGemini = document.getElementById('chk-auto-gemini');
                const chkPreferFullWrite = document.getElementById('chk-prefer-full-write');
                const chkUseEmote = document.getElementById('chk-use-emote');
                
                const selSendFormat = document.getElementById('chk-send-format');

                if (chkAutoRefresh && containerRefresh) {
                    chkAutoRefresh.onchange = () => {
                        containerRefresh.style.display = chkAutoRefresh.checked ? 'flex' : 'none';
                        updateAndSave();
                    };
                }
                
                const updateAndSave = () => {
                    const settingsData = {
                        hideUIOverlay: window.hideUIOverlay,
                        debugMode: !!chkDebug.checked,
                        dragDropMode: true,
                        autoDragging: false,
                        autoRefreshSession: !!chkAutoRefresh.checked,
                        refreshTurnCount: parseInt(txtRefreshCount.value) || 35,
                        sendFormat: selSendFormat ? selSendFormat.value : 'md',
                        autoGemini: chkAutoGemini ? !!chkAutoGemini.checked : false,
                        preferFullWrite: chkPreferFullWrite ? !!chkPreferFullWrite.checked : true,
                        useEmote: chkUseEmote ? !!chkUseEmote.checked : false
                    };
                    saveSettings(settingsData);
                    if (typeof window.reloadAgentSettings === 'function') window.reloadAgentSettings();
                };
                
                if (txtRefreshCount) txtRefreshCount.onchange = updateAndSave;
                if (chkDebug) chkDebug.onchange = updateAndSave;
                if (chkAutoGemini) chkAutoGemini.onchange = updateAndSave;
                if (chkPreferFullWrite) chkPreferFullWrite.onchange = updateAndSave;
                if (chkUseEmote) chkUseEmote.onchange = updateAndSave;
                if (selSendFormat) selSendFormat.onchange = updateAndSave;
            }
            
            localSettingsModal.style.display = 'flex';
        };
    }
    if (closeLocalSettings && localSettingsModal) {
        closeLocalSettings.onclick = () => {
            localSettingsModal.style.display = 'none';
        };
    }

    const tL = document.getElementById('terminal-lower'), tI = document.getElementById('terminal-main-input'), tS = document.getElementById('terminal-content');
    if (typeof setupHorizontalScroll === 'function') {
        setupHorizontalScroll(document.querySelector('.terminal-tabs'));
        setupHorizontalScroll(document.getElementById('terminal-sub-tabs'));
    }
    if (tS && tI) {
        tS.onmouseup = () => {
            const selectedText = window.getSelection().toString();
            if (!selectedText) {
                tI.focus();
            }
        };

        const termPopoverEl = document.getElementById('terminal-popover');
        if (termPopoverEl && !termPopoverEl.dataset.hasCopyBind) {
            termPopoverEl.dataset.hasCopyBind = 'true';
            termPopoverEl.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
                    const selectedText = window.getSelection().toString();
                    if (selectedText) {
                        navigator.clipboard.writeText(selectedText);
                    }
                }
            });
        }
    }
    if (!window.tabState) {
        window.tabState = { active: false, prefix: '', pathDirPart: '', matches: [], index: 0, searchDir: '' };
    }

    if (tI) {
        tI.onkeydown = (e) => {
            if (e.key !== 'Tab') {
                window.tabState.active = false;
            }

            if (e.key === 'Tab') {
                e.preventDefault();
                const pathModule = require('path');
                const fsModule = require('fs');

                const curSession = window.terminalSessions[window.activeSubTabId];
                const curCwd = curSession ? (curSession.cwd || window.currentPath || process.cwd()) : process.cwd();

                // If already cycling matches on consecutive Tab presses
                if (window.tabState.active && window.tabState.matches.length > 0) {
                    window.tabState.index = (window.tabState.index + 1) % window.tabState.matches.length;
                    const match = window.tabState.matches[window.tabState.index];
                    const fullPath = pathModule.join(window.tabState.searchDir, match);
                    let isDir = false;
                    try { isDir = fsModule.existsSync(fullPath) && fsModule.statSync(fullPath).isDirectory(); } catch(err) {}
                    const completedToken = window.tabState.pathDirPart + match + (isDir ? '\\' : '');
                    tI.value = window.tabState.prefix + completedToken;
                    setTimeout(() => tI.setSelectionRange(tI.value.length, tI.value.length), 0);
                    return;
                }

                // Initial Tab press: parse input and find matches
                const val = tI.value;
                const lastSpaceIndex = val.lastIndexOf(' ');
                const prefix = lastSpaceIndex >= 0 ? val.substring(0, lastSpaceIndex + 1) : '';
                const targetToken = lastSpaceIndex >= 0 ? val.substring(lastSpaceIndex + 1) : val;
                const isCdCmd = prefix.trim().toLowerCase() === 'cd';

                try {
                    let searchDir = curCwd;
                    let filePrefix = targetToken;

                    const lastSep = Math.max(targetToken.lastIndexOf('/'), targetToken.lastIndexOf('\\'));
                    let pathDirPart = '';
                    if (lastSep >= 0) {
                        pathDirPart = targetToken.substring(0, lastSep + 1);
                        filePrefix = targetToken.substring(lastSep + 1);
                        if (pathModule.isAbsolute(pathDirPart)) {
                            searchDir = pathDirPart;
                        } else {
                            searchDir = pathModule.resolve(curCwd, pathDirPart);
                        }
                    }

                    if (fsModule.existsSync(searchDir) && fsModule.statSync(searchDir).isDirectory()) {
                        const files = fsModule.readdirSync(searchDir);
                        let matches = files.filter(f => f.toLowerCase().startsWith(filePrefix.toLowerCase()));

                        // If 'cd' command, prioritize directories
                        if (isCdCmd) {
                            const dirMatches = matches.filter(f => {
                                try { return fsModule.statSync(pathModule.join(searchDir, f)).isDirectory(); } catch(err) { return false; }
                            });
                            if (dirMatches.length > 0) {
                                matches = dirMatches;
                            }
                        }

                        if (matches.length > 0) {
                            window.tabState = {
                                active: true,
                                prefix,
                                pathDirPart,
                                matches,
                                index: 0,
                                searchDir
                            };

                            const firstMatch = matches[0];
                            const fullPath = pathModule.join(searchDir, firstMatch);
                            let isDir = false;
                            try { isDir = fsModule.existsSync(fullPath) && fsModule.statSync(fullPath).isDirectory(); } catch(err) {}
                            const completedToken = pathDirPart + firstMatch + (isDir ? '\\' : '');
                            tI.value = prefix + completedToken;
                            setTimeout(() => tI.setSelectionRange(tI.value.length, tI.value.length), 0);
                        }
                    }
                } catch (err) {
                    console.error("Tab completion error:", err);
                }
                return;
            }

            if (e.key === 'ArrowUp') {
                e.preventDefault();
                const session = window.terminalSessions[window.activeSubTabId];
                if (session && session.history && session.history.length > 0) {
                    if (session.historyIndex < session.history.length - 1) {
                        session.historyIndex++;
                    }
                    const targetCmd = session.history[session.history.length - 1 - session.historyIndex];
                    if (targetCmd !== undefined) {
                        tI.value = targetCmd;
                        setTimeout(() => tI.setSelectionRange(tI.value.length, tI.value.length), 0);
                    }
                }
                return;
            }

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                const session = window.terminalSessions[window.activeSubTabId];
                if (session && session.history && session.history.length > 0) {
                    if (session.historyIndex > 0) {
                        session.historyIndex--;
                        const targetCmd = session.history[session.history.length - 1 - session.historyIndex];
                        if (targetCmd !== undefined) {
                            tI.value = targetCmd;
                            setTimeout(() => tI.setSelectionRange(tI.value.length, tI.value.length), 0);
                        }
                    } else if (session.historyIndex === 0) {
                        session.historyIndex = -1;
                        tI.value = '';
                    }
                }
                return;
            }

            if (e.key === 'Enter') {
                const cmd = tI.value.trim(); if (!cmd) return;
                const session = window.terminalSessions[window.activeSubTabId];
                if (session) {
                    if (!session.history) session.history = [];
                    if (session.history[session.history.length - 1] !== cmd) {
                        session.history.push(cmd);
                    }
                    session.historyIndex = -1;
                    session.logs.push({ type: 'cmd', text: `> ${cmd}` });
                }
                if (typeof updateSubTerminalTitle === 'function') updateSubTerminalTitle(window.activeSubTabId, cmd);
                if (typeof switchSubTerminal === 'function') switchSubTerminal(window.activeSubTabId);
                
                if (cmd.toLowerCase().startsWith('cd ')) {
                    let targetDir = cmd.substring(3).trim().replace(/['"]/g, '');
                    const pathModule = require('path');
                    const fsModule = require('fs');
                    try {
                        const curCwd = window.terminalSessions[window.activeSubTabId].cwd || window.currentPath || process.cwd();
                        let newPath = '';
                        if (pathModule.isAbsolute(targetDir)) {
                            newPath = targetDir;
                        } else {
                            newPath = pathModule.resolve(curCwd, targetDir);
                        }
                        if (fsModule.existsSync(newPath) && fsModule.statSync(newPath).isDirectory()) {
                            window.terminalSessions[window.activeSubTabId].cwd = newPath;
                            if (typeof updateTerminalPrompt === 'function') updateTerminalPrompt();
                        }
                    } catch (err) {
                        console.error(err);
                    }
                }
                
                ipcRenderer.send('execute-cmd', { 
                    tabId: window.activeSubTabId, 
                    command: cmd, 
                    cwd: window.terminalSessions[window.activeSubTabId].cwd || window.currentPath || process.cwd() 
                }); 
                tI.value = '';
            }
        };
    }
    ipcRenderer.removeAllListeners('cmd-output');
    ipcRenderer.on('cmd-output', (e, arg) => {
        let tId = window.activeSubTabId;
        let txt = '';
        if (typeof arg === 'string') {
            txt = arg;
        } else if (arg && typeof arg === 'object') {
            tId = arg.tabId || window.activeSubTabId;
            txt = arg.data || '';
        }
        if (tId && window.terminalSessions[tId]) {
            let cleanTxt = txt.replace(/(\r?\n){3,}/g, '\n\n');
            if (cleanTxt.trim().length > 0 || cleanTxt === '\n') {
                window.terminalSessions[tId].logs.push({ type: 'out', text: cleanTxt }); 
            }
            if (window.terminalSessions[tId].loading) {
                window.terminalSessions[tId].loading = false;
            }
            if (tId === window.activeSubTabId && typeof switchSubTerminal === 'function') {
                switchSubTerminal(window.activeSubTabId);
            }
        }
    });

    const minTermBtn = document.getElementById('minimize-terminal');
    if (minTermBtn) {
        minTermBtn.onclick = () => {
            const im = tL.offsetHeight <= 40; tL.style.height = im ? '350px' : '35px';
            minTermBtn.innerHTML = im ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>' : '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>'; syncBrowserView();
        };
    }

    const vd = (r, t, s) => {
        if (!r || !t) return;
        r.onmousedown = (e) => {
            const sx = e.clientX, sw = t.offsetWidth;
            const mv = (m) => { const df = (s === 'l') ? (m.clientX - sx) : (sx - m.clientX); t.style.width = Math.max(150, Math.min(window.innerWidth * 0.8, sw + df)) + 'px'; if (typeof syncBrowserView === 'function') syncBrowserView(); };
            const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
            window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
        };
    };
    vd(document.getElementById('resizer-left'), document.getElementById('sidebar-left'), 'l'); vd(document.getElementById('resizer-inspector'), document.getElementById('inspector-right'), 'r');
    
    const rTop = document.getElementById('resizer-terminal-top');
    const termPopoverWindow = document.getElementById('terminal-popover');
    if (rTop && termPopoverWindow) {
        rTop.onmousedown = (e) => {
            e.preventDefault();
            const sy = e.clientY, sh = termPopoverWindow.offsetHeight;
            termPopoverWindow.style.transition = 'none';
            document.querySelectorAll('webview').forEach(wv => wv.style.pointerEvents = 'none');
            document.body.style.userSelect = 'none';
            
            const mv = (m) => {
                if (m.buttons === 0) { up(); return; }
                const df = sy - m.clientY;
                const newH = Math.max(80, Math.min(window.innerHeight * 0.85, sh + df));
                termPopoverWindow.style.height = `${newH}px`;
                window.dispatchEvent(new Event('resize'));
            };
            
            const up = () => {
                termPopoverWindow.style.transition = 'height 0.2s cubic-bezier(0.16, 1, 0.3, 1)';
                document.querySelectorAll('webview').forEach(wv => wv.style.pointerEvents = 'auto');
                document.body.style.userSelect = '';
                window.removeEventListener('mousemove', mv);
                window.removeEventListener('mouseup', up);
                window.removeEventListener('blur', up);
                window.dispatchEvent(new Event('resize'));
            };
            
            window.addEventListener('mousemove', mv);
            window.addEventListener('mouseup', up);
            window.addEventListener('blur', up);
        };
    }

    const rT = document.getElementById('resizer-terminal');
    if (rT && tL) {
        rT.onmousedown = (e) => {
            const sy = e.clientY, sh = tL.offsetHeight;
            const mv = (m) => { tL.style.height = Math.max(40, Math.min(window.innerHeight * 0.8, sh + (sy - m.clientY))) + 'px'; if (typeof syncBrowserView === 'function') syncBrowserView(); };
            const up = () => { window.removeEventListener('mouseup', up); window.removeEventListener('mousemove', mv); };
            window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
        };
    }

    const selectProjectBtn = document.getElementById('select-project-btn');
    if (selectProjectBtn) {
        selectProjectBtn.onclick = () => {
            if (window.openProjectModal) window.openProjectModal();
        };
    }

    const collapseToggleBtn = document.getElementById('collapse-all-btn');
    const collapseIcon = document.getElementById('collapse-all-icon');
    const SVG_COLLAPSE = `<polyline points="7 4 12 9 17 4"></polyline><polyline points="7 20 12 15 17 20"></polyline>`;
    const SVG_EXPAND   = `<polyline points="7 9 12 4 17 9"></polyline><polyline points="7 15 12 20 17 15"></polyline>`;

    if (collapseToggleBtn) {
        collapseToggleBtn.onclick = () => {
            const hasExpanded = window.expandedPaths && window.expandedPaths.size > 0;
            if (hasExpanded) {
                window.expandedPaths.clear();
                collapseToggleBtn.title = 'Expand All';
                if (collapseIcon) {
                    collapseIcon.innerHTML = SVG_EXPAND;
                    collapseIcon.classList.add('rotate-left');
                }
            } else {
                document.querySelectorAll('.dir-node .file-item').forEach(el => {
                    const p = el.dataset.path;
                    if (p && window.expandedPaths) window.expandedPaths.add(p);
                });
                collapseToggleBtn.title = 'Collapse All';
                if (collapseIcon) {
                    collapseIcon.innerHTML = SVG_COLLAPSE;
                    collapseIcon.classList.remove('rotate-left');
                }
            }
            if (window.loadDirectory) window.loadDirectory(window.currentPath || process.cwd());
        };
    }

    const addA = document.getElementById('add-agent-app-card'), mo = document.getElementById('app-reg-modal');
    if (addA && mo) addA.onclick = () => {
        const tIn = document.getElementById('reg-app-title'); if (tIn) tIn.value = '';
        const uIn = document.getElementById('reg-app-url'); if (uIn) uIn.value = '';
        delete mo.dataset.editingUrl;
        mo.style.display = 'flex';
        (tIn || uIn)?.focus();
    };
    const cancelReg = document.getElementById('cancel-reg');
    if (cancelReg) cancelReg.onclick = () => { if (mo) mo.style.display = 'none'; };
    const confirmReg = document.getElementById('confirm-reg');
    if (confirmReg) {
        confirmReg.onclick = async () => {
            let title = document.getElementById('reg-app-title')?.value.trim() || '';
            let u = document.getElementById('reg-app-url').value.trim(); if (!u) return;
            if (!u.startsWith('http')) u = 'https://' + u;
            
            const s = await ipcRenderer.invoke('vault-read-global', 'registry.json');
            const apps = s ? JSON.parse(s) : [];
            const editingUrl = mo ? mo.dataset.editingUrl : '';

            if (mo && editingUrl) {
                const idx = apps.findIndex(a => (typeof a === 'string' ? a : a.url) === editingUrl);
                if (idx > -1) apps[idx] = { title, url: u };
                delete mo.dataset.editingUrl;
            } else {
                apps.push({ title, url: u });
                if (typeof window.addAppCardToDiscovery === 'function') {
                    window.addAppCardToDiscovery({ title, url: u });
                }
            }
            ipcRenderer.send('vault-update-global', { fileName: 'registry.json', content: JSON.stringify(apps) });

            const tIn = document.getElementById('reg-app-title');
            const uIn = document.getElementById('reg-app-url');
            if (tIn) tIn.value = '';
            if (uIn) uIn.value = '';
            if (mo) mo.style.display = 'none';
        };
    }

    const urlIn = document.getElementById('agent-url-input'); if (urlIn) {
        urlIn.onkeydown = (e) => {
            if (e.key === 'Enter') {
                let u = urlIn.value.trim(); if (!u) return;
                if (!u.startsWith('http')) u = 'https://' + u;
                const wv = document.getElementById('active-agent-webview');
                if (wv) wv.src = u;
            }
        };
    }
    const backAgentBtn = document.getElementById('back-agent');
    if (backAgentBtn) {
        backAgentBtn.onclick = () => {
            const wv = document.getElementById('active-agent-webview');
            if (wv && typeof wv.goBack === 'function' && wv.canGoBack()) {
                wv.goBack();
            }
        };
    }
    const forwardAgentBtn = document.getElementById('forward-agent');
    if (forwardAgentBtn) {
        forwardAgentBtn.onclick = () => {
            const wv = document.getElementById('active-agent-webview');
            if (wv && typeof wv.goForward === 'function' && wv.canGoForward()) {
                wv.goForward();
            }
        };
    }

    const refreshAgentBtn = document.getElementById('refresh-agent');
    if (refreshAgentBtn) {
        refreshAgentBtn.onclick = () => { const u = urlIn ? urlIn.value.trim() : ''; if (u) { const wv = document.getElementById('active-agent-webview'); if (wv) wv.reload(); } };
    }

    const debugAgentBtn = document.getElementById('debug-agent');
    if (debugAgentBtn) {
        debugAgentBtn.onclick = () => {
            const wv = document.getElementById('active-agent-webview');
            if (wv) wv.openDevTools();
        };
    }

    const settingsBtn = document.getElementById('agent-settings-btn');
    const settingsMenu = document.getElementById('agent-settings-menu');
    if (settingsBtn && settingsMenu) {
        settingsBtn.onmouseover = () => settingsBtn.style.background = '#222';
        settingsBtn.onmouseout = () => settingsBtn.style.background = 'transparent';
        
        settingsBtn.onclick = (e) => { e.stopPropagation(); settingsMenu.style.display = settingsMenu.style.display === 'none' ? 'flex' : 'none'; };
        document.addEventListener('click', () => { settingsMenu.style.display = 'none'; });

        document.querySelectorAll('.settings-menu-item').forEach(item => {
            item.onmouseenter = () => item.style.background = item.id === 'menu-factory-reset' ? 'rgba(255,0,0,0.15)' : '#1a1a1a';
            item.onmouseleave = () => item.style.background = item.id === 'menu-factory-reset' ? 'rgba(255,0,0,0.05)' : 'transparent';
        });

        window.setInspectorBorderState = (isWebviewActive) => {
            const inspector = document.getElementById('inspector-right');
            if (inspector) {
                inspector.style.borderLeft = isWebviewActive ? 'none' : '1px solid var(--border-color)';
            }
        };

        const switchAgentBtn = document.getElementById('menu-switch-agent');
        if (switchAgentBtn) { switchAgentBtn.onclick = () => { document.getElementById('agent-hub-webview').style.display = 'none'; document.getElementById('agent-hub-home').style.display = 'flex'; if (typeof window.setInspectorBorderState === 'function') window.setInspectorBorderState(false); if (typeof window.setTaskbarActionsVisible === 'function') window.setTaskbarActionsVisible(false); }; }

        const taskbarHomeBtn = document.getElementById('taskbar-home-btn');
        if (taskbarHomeBtn) {
            taskbarHomeBtn.addEventListener('click', (e) => {
                console.log('[HomeBtn] Clicked - returning to grid');
                e.preventDefault();
                e.stopPropagation();
                document.getElementById('agent-hub-webview').style.display = 'none';
                document.getElementById('agent-hub-home').style.display = 'flex';
                if (typeof window.setInspectorBorderState === 'function') window.setInspectorBorderState(false);
                if (typeof window.setTaskbarActionsVisible === 'function') window.setTaskbarActionsVisible(false);
                if (typeof syncBrowserView === 'function') syncBrowserView();
            });
        }

        const devAgentBtn = document.getElementById('menu-debug-agent');
        if (devAgentBtn) { devAgentBtn.onclick = () => { const wv = document.getElementById('active-agent-webview'); if (wv) wv.openDevTools(); }; }

        const resetBtn = document.getElementById('menu-factory-reset');
        if (resetBtn) {
            resetBtn.onclick = async () => {
                const confirmed = typeof showConfirm === 'function' ? await showConfirm("Are you sure you want to perform a factory reset?\nAll registered agents and settings will be deleted.") : confirm("Factory reset?");
                if (confirmed) { ipcRenderer.send('vault-update-global', { fileName: 'registry.json', content: '[]' }); location.reload(); }
            };
        }
    }

    const dsModal = document.getElementById('discovery-settings-modal');
    const openDiscoveryBtn = document.getElementById('open-discovery-settings');
    if (openDiscoveryBtn) {
        openDiscoveryBtn.onclick = async () => {
            const currentSettings = loadSettings();
            const selSendFormat = document.getElementById('settings-send-format');
            if (selSendFormat) selSendFormat.value = currentSettings.sendFormat || 'md';
            const selAutoGemini = document.getElementById('settings-auto-gemini');
            const warnEl = document.getElementById('auto-gemini-off-warning');
            if (selAutoGemini) {
                selAutoGemini.value = currentSettings.autoGemini ? 'true' : 'false';
                if (warnEl) warnEl.style.display = (selAutoGemini.value === 'false') ? 'block' : 'none';
                selAutoGemini.onchange = () => {
                    if (warnEl) warnEl.style.display = (selAutoGemini.value === 'false') ? 'block' : 'none';
                };
            }
            const selPreferFullWrite = document.getElementById('settings-prefer-full-write');
            if (selPreferFullWrite) selPreferFullWrite.value = currentSettings.preferFullWrite !== false ? 'true' : 'false';
            const selUseEmote = document.getElementById('settings-use-emote');
            if (selUseEmote) selUseEmote.value = currentSettings.useEmote ? 'true' : 'false';

            if (dsModal) dsModal.style.display = 'flex';
        };
    }
    const closeDiscoveryBtn = document.getElementById('close-discovery-settings');
    if (closeDiscoveryBtn) closeDiscoveryBtn.onclick = () => { if (dsModal) dsModal.style.display = 'none'; };
    const saveDiscoveryBtn = document.getElementById('save-discovery-settings');
    if (saveDiscoveryBtn) {
        saveDiscoveryBtn.onclick = () => {
            const selSendFormat = document.getElementById('settings-send-format');
            const selAutoGemini = document.getElementById('settings-auto-gemini');
            const selPreferFullWrite = document.getElementById('settings-prefer-full-write');
            const selUseEmote = document.getElementById('settings-use-emote');
            const settingsData = loadSettings();
            window.dragDropMode = true;
            settingsData.dragDropMode = true;
            window.autoDragging = false;
            settingsData.autoDragging = false;
            if (selSendFormat) {
                window.sendFormat = selSendFormat.value;
                settingsData.sendFormat = selSendFormat.value;
            }
            if (selAutoGemini) {
                window.autoGemini = (selAutoGemini.value === 'true');
                settingsData.autoGemini = window.autoGemini;
            }
            if (selPreferFullWrite) {
                window.preferFullWrite = (selPreferFullWrite.value === 'true');
                settingsData.preferFullWrite = window.preferFullWrite;
            }
            if (selUseEmote) {
                window.useEmote = (selUseEmote.value === 'true');
                settingsData.useEmote = window.useEmote;
            }
            saveSettings(settingsData);
            if (typeof window.reloadAgentSettings === 'function') window.reloadAgentSettings();
            
            if (typeof window.updateDragDropQueueUI === 'function') {
                window.updateDragDropQueueUI();
            }
            
            if (dsModal) dsModal.style.display = 'none';
        };
    }

    const tLA = document.getElementById('tab-local-agent'), tBH = document.getElementById('tab-browser-hub');
    const vLC = document.getElementById('inspector-local-chat'), vBH = document.getElementById('inspector-browser-hub');
    const swi = (m) => {
        if (vLC) {
            vLC.style.opacity = '0';
            vLC.style.pointerEvents = 'none';
            vLC.style.zIndex = '100';
            vLC.style.height = '100%';
            vLC.style.position = 'absolute';
            vLC.style.top = '0';
            vLC.style.bottom = '';
            vLC.style.left = '0';
            vLC.style.width = '100%';
        }
        if (vBH) {
            vBH.style.position = 'absolute';
            vBH.style.top = '0';
            vBH.style.bottom = '';
            vBH.style.left = '0';
            vBH.style.width = '100%';
            vBH.style.height = '100%';
            vBH.style.zIndex = '150';
            vBH.style.opacity = '1';
            vBH.style.pointerEvents = 'auto';
        }
        if (tLA) tLA.classList.toggle('active-tab', false);
        if (tBH) tBH.classList.toggle('active-tab', true);

        const chatLog = document.getElementById('local-chat-messages');
        if (chatLog) chatLog.scrollTop = chatLog.scrollHeight;
        if (typeof syncBrowserView === 'function') syncBrowserView();
    };
    window.swi = swi;
    if (tLA) tLA.onclick = () => swi('local'); if (tBH) tBH.onclick = () => swi('browser');
    
    setTimeout(() => swi('browser'), 50);

    const searchBtn = document.getElementById('btn-local-search');
    const searchContainer = document.getElementById('local-chat-search-container');
    const searchInput = document.getElementById('local-chat-search-input');
    const searchCount = document.getElementById('local-chat-search-count');
    const closeSearch = document.getElementById('close-local-search');
    const chatMessages = document.getElementById('local-chat-messages');

    function clearSearch() {
        if (searchInput) searchInput.value = '';
        if (searchCount) searchCount.innerText = '0 found';
        if (chatMessages) {
            const bubbles = chatMessages.querySelectorAll('.chat-bubble');
            bubbles.forEach(b => { b.style.display = 'flex'; });
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }

    function performSearch() {
        const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
        if (!chatMessages) return;
        const bubbles = chatMessages.querySelectorAll('.chat-bubble');
        let found = 0;

        bubbles.forEach(b => {
            const content = b.querySelector('.bubble-content');
            if (!content) return;
            const text = content.innerText.toLowerCase();
            if (!query || text.includes(query)) {
                b.style.display = 'flex';
                if (query) found++;
            } else {
                b.style.display = 'none';
            }
        });

        if (searchCount) {
            searchCount.innerText = query ? `${found} found` : '0 found';
        }
    }

    if (searchBtn && searchContainer && searchInput) {
        searchBtn.onclick = () => {
            const isHidden = searchContainer.style.display === 'none';
            searchContainer.style.display = isHidden ? 'flex' : 'none';
            if (isHidden) {
                searchInput.focus();
                performSearch();
            } else {
                clearSearch();
            }
        };
    }

    if (closeSearch) {
        closeSearch.onclick = () => {
            if (searchContainer) searchContainer.style.display = 'none';
            clearSearch();
        };
    }

    if (searchInput) {
        searchInput.oninput = performSearch;
        searchInput.onkeydown = (e) => {
            if (e.key === 'Escape') {
                if (searchContainer) searchContainer.style.display = 'none';
                clearSearch();
            }
        };
    }

    const saveBtn = document.getElementById('save-local-chat');
    if (saveBtn) {
        saveBtn.onclick = () => { ChatUI.appendBubble('system', '[SYSTEM] Chat snapshot save requested.'); };
    }
    const clearBtn = document.getElementById('clear-local-chat');
    if (clearBtn) {
        clearBtn.onclick = () => { 
            const doReset = () => {
                window.generating = false; 
                const sendBtn = document.getElementById('send-to-local'); if (sendBtn) sendBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;
                ipcRenderer.send('vault-reset-session', { logPath: GravityVault.activeLogPath }); 
                document.getElementById('local-chat-messages').innerHTML = ''; if (window.chatLog) window.chatLog = []; 
                const overlay = document.getElementById('web-process-overlay'); if (overlay) { overlay.style.display = 'none'; overlay.style.pointerEvents = 'none'; }
                const chatIn = document.getElementById('local-agent-input'); if (chatIn) { setTimeout(() => { chatIn.focus(); chatIn.click(); }, 50); }
            };
            if (typeof showConfirm === 'function') {
                showConfirm("Initialize both chat history file and screen? (Irrecoverable)", doReset);
            } else if (confirm("Initialize both chat history file and screen?")) {
                doReset();
            }
        };
    }

    window.updateSendProgress = (current, total) => {
        const textEl = document.getElementById('overlay-progress-text');
        const barEl = document.getElementById('overlay-progress-bar');
        if (textEl && barEl) {
            const pct = total > 0 ? Math.round((current / total) * 100) : 0;
            textEl.innerText = `${current} / ${total} Files processed (${pct}%)`;
            barEl.style.width = `${pct}%`;
        }
    };

    const chatIn = document.getElementById('local-agent-input');
    if (chatIn) {
        chatIn.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const sendBtn = document.getElementById('send-to-local');
                if (sendBtn) sendBtn.click();
            }
        };
    }
    const chatOverlay = document.getElementById('local-chat-overlay');
    
    if (chatOverlay && !document.getElementById('btn-send-project-info')) {
        const projBtn = document.createElement('button');
        projBtn.id = 'btn-send-project-info';
        projBtn.innerHTML = 'Send Project Info to Browser';

        projBtn.style = `
            width: 80%;
            max-width: 280px;
            height: 42px;
            background: var(--primary);
            color: #fff;
            border: none;
            border-radius: 8px;
            font-family: 'DM Sans', 'Outfit', sans-serif;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12.5px;
            letter-spacing: -0.01em;
            box-shadow: none;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        `;
        projBtn.onmouseenter = () => { projBtn.style.filter = 'brightness(1.1)'; projBtn.style.boxShadow = 'none'; };
        projBtn.onmouseleave = () => { projBtn.style.filter = 'none'; projBtn.style.boxShadow = 'none'; };

        projBtn.onclick = async () => {
            if (window.sessionBriefed || window.briefingInProgress) return;
            window.briefingInProgress = true;
            if (typeof window.updateSplitLayoutHeight === 'function') {
                window.updateSplitLayoutHeight(window.pendingSplitHeight || 220);
            }
            projBtn.style.display = 'none';
            
            const fs = require('fs');
            const path = require('path');
            
            let tree = await ipcRenderer.invoke('vault-get-tree', window.currentPath);
            if ((!tree || !tree.trim()) && window.activeWebDirHandle) {
                const rootName = window.activeWebDirHandle.name || 'Project';
                const fileKeys = Object.keys(window.webFileCache || {}).filter(k => !k.startsWith('.') && !k.includes('node_modules'));
                tree = `${rootName}/\n` + (fileKeys.length > 0 ? fileKeys.slice(0, 100).map(f => `  ├── ${f}`).join('\n') : '  [Folder loaded]');
            }
            const treeLines = (tree || '').split('\n').map(l => l.trim()).filter(Boolean);
            window.totalFilesCount = treeLines.filter(l => !l.endsWith('/')).length;
            window.readFilesSet.clear();
            window.userMessageCount = 0;
            
            const isEmpty = !tree || treeLines.length <= 1 || tree.includes('[Empty folder]') || tree.includes('[WARNING: No files');
            const startPrompt = isEmpty
                ? `This folder is a completely empty new project. If you understand these instructions, ask the user what project to create.`
                : `If you understand these instructions, read key entry files for analysis in one line using [CMD: read-file "path1"] [CMD: read-file "path2"].`;

            const webPayload = isEmpty
                ? `${window.getSystemRulesPrompt(true)}\n\n${startPrompt}`.trim()
                : `The current project folder contains the following files:\n${tree}\n\n${window.getSystemRulesPrompt(true)}\n\n${startPrompt}`.trim();
            
            if (!window.process || window.process.platform === 'browser') {
                try {
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        await navigator.clipboard.writeText(webPayload);
                    }
                } catch(e) {}
                const chatInputEl = document.getElementById('local-agent-input');
                if (chatInputEl) {
                    chatInputEl.value = webPayload;
                    chatInputEl.focus();
                }
                if (typeof window.showUserScreenToast === 'function') {
                    window.showUserScreenToast('Copied Project Info & Rules to Clipboard!', 3500, true);
                }
                if (typeof ChatUI !== 'undefined' && typeof ChatUI.appendBubble === 'function') {
                    ChatUI.appendBubble('system', '[SYSTEM] Copied Project Info & Rules to Clipboard! Paste (Ctrl+V) into your AI chat.');
                }
            }

            if (!window.dragDropMode) {
                window.requestedFilesQueue = [];
                window.activeDragDropCleanup = null;
                window.activeDragDropContinue = async () => {};

                chatOverlay.style.display = 'none';
                if (chatIn) chatIn.focus();

                window.sessionBriefed = true;
                window.briefingInProgress = false;
                window.currentBatchFileCount = -1;
                window.isBriefingResponsePending = true;

                if (typeof window.updateSplitLayoutHeight === 'function') {
                    window.updateSplitLayoutHeight(window.pendingSplitHeight || 220);
                }

                console.log("[ProjectInfoPayload] Sending payload:\n", webPayload);
                const briefPromise = runExperimentalEngine('/marktag', webPayload, null);
                await injectWebPayload(webPayload, -1);
                const briefResponse = await Promise.race([
                    briefPromise,
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Briefing timeout')), 120000))
                ]).catch(() => null);
                window.currentBatchFileCount = 0;
                if (briefResponse && typeof detectAndAskCommand === 'function') {
                    detectAndAskCommand(briefResponse);
                }
            } else {
                const baseFileName = window.makeSendingMdRulesName();
                const payload = await window.prepareFilePayload(baseFileName, webPayload);

                if (typeof window.refreshTree === 'function') {
                    window.refreshTree();
                }

                window.requestedFilesQueue = [{
                    absolutePath: payload.absolutePath,
                    relativePath: payload.relativePath,
                    status: 'PENDING'
                }];

                if (typeof window.injectGuestDropInterceptor === 'function') {
                    window.injectGuestDropInterceptor();
                }

                const cleanupDragDrop = () => {
                    if (window.activeDragDropCleanup === cleanupDragDrop) {
                        window.activeDragDropCleanup = null;
                        window.activeDragDropContinue = null;
                    }

                    const vLC = document.getElementById('inspector-local-chat');
                    const vBH = document.getElementById('inspector-browser-hub');
                    const arrowIndicator = document.getElementById('drag-drop-arrow-indicator');
                    if (arrowIndicator) arrowIndicator.remove();
                    
                    const inputContainer = document.getElementById('local-input-container');
                    if (inputContainer) {
                        inputContainer.style.background = '';
                        inputContainer.style.display = 'none';
                        inputContainer.style.height = '';
                    }
                    
                    if (vLC) {
                        vLC.style.height = "100%";
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
                };

                window.activeDragDropCleanup = cleanupDragDrop;
                window.activeDragDropContinue = async () => {};
                
                chatOverlay.style.display = 'none';
                projBtn.style.display = 'flex';
                
                window.sessionBriefed = true;
                window.briefingInProgress = false;
                window.currentBatchFileCount = 0;
                window.isBriefingResponsePending = true;

                setTimeout(() => {
                    if (typeof window.updateDragDropQueueUI === 'function') {
                        window.updateDragDropQueueUI();
                    }
                }, 600);
            }
        };

        chatOverlay.appendChild(projBtn);
    }

    const updateAgentBadge = () => {
        const wv = document.getElementById('active-agent-webview'), badge = document.getElementById('active-project-badge');
        const headerIcon = document.getElementById('active-agent-icon');
        const confirmFavicon = document.getElementById('browser-confirm-favicon');

        if (wv && wv.src && !wv.src.startsWith('about:blank')) {
            try {
                const d = new URL(wv.src).hostname; const name = d.split('.')[0].toUpperCase();
                const icon = `https://www.google.com/s2/favicons?domain=${d}&sz=64`;
                const lgIcon = `https://www.google.com/s2/favicons?domain=${d}&sz=128`;
                if (badge) badge.innerText = `GRAVITY · ${name}`;
                if (headerIcon) headerIcon.src = icon;
                if (confirmFavicon) confirmFavicon.src = lgIcon;
                if (chatIn) { chatIn.placeholder = `Ask ${name}...`; }
            } catch(e) {}
        } else {
            if (badge) badge.innerText = `GRAVITY`; if (headerIcon) headerIcon.src = 'png.png'; if (chatIn) chatIn.placeholder = `Ask AI...`;
        }
    };

    window.updateAgentBadge = updateAgentBadge;
    const sendBtn = document.getElementById('send-to-local');
    if (sendBtn) {
        sendBtn.onclick = () => {
            if (typeof handleSend === 'function') handleSend();
        };
    }
    
    const pMo = document.getElementById('persona-modal'), pBtn = document.getElementById('open-persona-settings');
    if (pBtn && pMo) {
        pBtn.onclick = async () => {
            pMo.style.display = 'flex';
            const traits = await ipcRenderer.invoke('vault-read-global', 'traits.md');
            if (traits) {
                const lines = traits.split('\n');
                document.getElementById('ps-name').value = lines[0]?.replace('NAME: ', '') || '';
                document.getElementById('ps-personality').value = lines[1]?.replace('PERSONALITY: ', '') || '';
                document.getElementById('ps-info').value = lines[2]?.replace('INFO: ', '') || '';
                document.getElementById('ps-speech').value = lines[3]?.replace('SPEECH: ', '') || '';
            }
        };
        const cancelPersonaBtn = document.getElementById('cancel-persona');
        if (cancelPersonaBtn) cancelPersonaBtn.onclick = () => { if (pMo) pMo.style.display = 'none'; };
        const savePersonaBtn = document.getElementById('save-persona');
        if (savePersonaBtn) {
            savePersonaBtn.onclick = () => {
                const nameEl = document.getElementById('ps-name');
                const personalityEl = document.getElementById('ps-personality');
                const infoEl = document.getElementById('ps-info');
                const speechEl = document.getElementById('ps-speech');
                const content = `NAME: ${nameEl ? nameEl.value : ''}\nPERSONALITY: ${personalityEl ? personalityEl.value : ''}\nINFO: ${infoEl ? infoEl.value : ''}\nSPEECH: ${speechEl ? speechEl.value : ''}`;
                ipcRenderer.send('vault-update-global', { fileName: 'traits.md', content });
                if (pMo) pMo.style.display = 'none';
                if (typeof GravityVault !== 'undefined' && GravityVault.init) GravityVault.init();
            };
        }
    }
    const bailoutZone = document.getElementById('toast-bailout-zone');
    if (bailoutZone) {
        bailoutZone.onclick = (e) => {
            e.stopPropagation();
            const toast = document.getElementById('injection-toast');
            if (toast) toast.style.display = 'none';
            const chatOverlay = document.getElementById('local-chat-overlay');
            if (chatOverlay) chatOverlay.style.display = 'none';
            const progressBox = document.getElementById('overlay-progress-box');
            if (progressBox) progressBox.style.display = 'none';
            const projBtn = document.getElementById('btn-send-project-info');
            if (projBtn) projBtn.style.display = 'flex';
            ChatUI.appendBubble('system', '[SYSTEM] Emergency bailout: Force closed loading overlays.');
        };
    }
    const bindInspectorDrop = (targetEl) => {
        if (!targetEl) return;
        targetEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        });
        
        targetEl.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            let targetFilePath = e.dataTransfer.getData('text/plain');
            if (!targetFilePath && e.dataTransfer.files && e.dataTransfer.files[0]) {
                targetFilePath = e.dataTransfer.files[0].path;
            }
            if (!targetFilePath) {
                targetFilePath = window._draggingTreePath || window._lastDraggedTreePath;
            }
            
            if (!targetFilePath) return;
            console.log("[InspectorDrop] HTML5 Dropped item onto right inspector panel:", targetFilePath);
                
                if (window.dragDropMode && window.activeDragDropContinue) {
                    const pathModule = require('path');
                    const droppedName = pathModule.basename(targetFilePath).toLowerCase();
                    
                    const pendingItems = window.requestedFilesQueue.filter(item => item.status === 'PENDING' || item.status === 'UPLOADING');
                    const requestedNames = pendingItems.map(item => item.relativePath.split(/[\\/]/).pop().toLowerCase());
                    
                    if (requestedNames.length > 0 && !requestedNames.includes(droppedName)) {
                        const { showAlert } = require('./ui/dialogs.js');
                        if (typeof showAlert === 'function') {
                            showAlert(`Not a requested file.\nRequested file name: ${requestedNames.join(', ')}`);
                        } else {
                            alert(`Not a requested file.\nRequested file name: ${requestedNames.join(', ')}`);
                        }
                        return;
                    }
                    
                    window.readFilesSet.add(targetFilePath);
                    
                    const stillPending = window.requestedFilesQueue.filter(item => item.status === 'PENDING' || item.status === 'UPLOADING');
                    if (stillPending.length === 0) {
                        if (window.activeDragDropCleanup) window.activeDragDropCleanup();
                        setTimeout(() => {
                            const continueFunc = window.activeDragDropContinue;
                            window.requestedFilesQueue = [];
                            if (typeof window.updateDragDropQueueUI === 'function') {
                                window.updateDragDropQueueUI();
                            }
                            if (continueFunc && continueFunc.isReal) {
                                continueFunc();
                            } else {
                                if (window.autoDragging && !window.autoDraggingTempDisabled && typeof window.triggerGuestSend === 'function') {
                                    window.triggerGuestSend();
                                }
                            }
                        }, 500);
                    }
                } else {
                    const fsModule = require('fs');
                    const pathModule = require('path');
                    try {
                        if (!fsModule.existsSync(targetFilePath)) return;
                        const stats = fsModule.statSync(targetFilePath);
                        
                        if (stats.isDirectory()) {
                            console.log("[InspectorDrop] Dropped directory path:", targetFilePath);
                            const localChatInput = document.getElementById('chat-input-textarea') || document.getElementById('local-chat-input');
                            if (localChatInput) {
                                localChatInput.value = localChatInput.value ? `${localChatInput.value}\n[Folder: ${targetFilePath}]` : `[Folder: ${targetFilePath}]`;
                                localChatInput.focus();
                            }
                            return;
                        }

                        const contentBuffer = fsModule.readFileSync(targetFilePath);
                        const filename = pathModule.basename(targetFilePath);
                        const base64Content = contentBuffer.toString('base64');
                        const ext = filename.split('.').pop().toLowerCase();
                        const mimeMap = {
                            'js': 'text/javascript', 'json': 'application/json',
                            'html': 'text/html', 'css': 'text/css',
                            'txt': 'text/plain', 'md': 'text/markdown',
                            'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
                            'gif': 'image/gif', 'pdf': 'application/pdf', 'zip': 'application/zip'
                        };
                        const mimeType = mimeMap[ext] || 'application/octet-stream';
                        const wv = document.getElementById('active-agent-webview');
                        if (wv) {
                            wv.executeJavaScript(`
                                (() => {
                                    const b64 = "${base64Content}";
                                    const name = "${filename}";
                                    const mime = "${mimeType}";
                                    const binary = atob(b64);
                                    const array = new Uint8Array(binary.length);
                                    for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
                                    const blob = new Blob([array], { type: mime });
                                    const file = new File([blob], name, { type: mime });
                                    const dt = new DataTransfer();
                                    dt.items.add(file);
                                    
                                    let targets = Array.from(document.querySelectorAll('textarea, [contenteditable="true"], [role="textbox"], input[type="file"], .input-area, form, body'));
                                    const options = { bubbles: true, cancelable: true, dataTransfer: dt };
                                    
                                    targets.forEach(target => {
                                        try {
                                            target.dispatchEvent(new DragEvent('dragenter', options));
                                            target.dispatchEvent(new DragEvent('dragover', options));
                                            target.dispatchEvent(new DragEvent('drop', options));
                                        } catch(e){}
                                    });
                                })();
                            `).catch(e => console.log("Webview drop execute failed:", e));
                        }
                    } catch (err) {
                        console.log("Inspector drop process error:", err);
                    }
                }
        });
    };

    ['agent-view-dock', 'inspector-right', 'inspector-local-chat', 'local-chat-messages'].forEach(id => {
        bindInspectorDrop(document.getElementById(id));
    });


    updateTaskbarButtonStyles();
    updateAgentBadge();
}

window.setupUI = setupUI;
