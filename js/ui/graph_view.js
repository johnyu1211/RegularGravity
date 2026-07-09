// Drill-Down interactive Force-Directed Graph View for Poor man's Gravity IDE
// Pure vanilla JS HTML5 canvas physics layout with alpha cooling

(function() {
    const fs = require('fs');
    const path = require('path');

    let nodes = [];
    let links = [];
    let isSimulationRunning = false;
    let animationId = null;

    // Drill down path tracking
    let currentGraphPath = '';
    let projectRoot = '';

    // Viewport transform
    let zoom = 1.0;
    let panX = 0;
    let panY = 0;

    // Interaction state
    let hoveredNode = null;
    let draggedNode = null;
    let isPanning = false;
    let startDragX = 0;
    let startDragY = 0;
    let lastMouseX = 0;
    let lastMouseY = 0;

    // Click tracking to prevent jitter issues
    let mouseDownX = 0;
    let mouseDownY = 0;

    // Physics parameters - Optimized with alpha cooling to prevent shaking
    let alpha = 1.0;
    const alphaDecay = 0.98; // Cools down over ~150 frames
    const kRepulsion = 7500;
    const kAttraction = 0.055;
    const springLength = 120;
    const kGravity = 0.01;
    const damping = 0.72; // Higher damping absorbs kinetic energy faster

    const modal = document.getElementById('graph-view-modal');
    const canvas = document.getElementById('graph-canvas');
    const container = document.getElementById('graph-canvas-container');
    const tooltip = document.getElementById('graph-tooltip');
    const closeBtn = document.getElementById('close-graph-view');
    const openBtn = document.getElementById('graph-view-btn');
    const breadcrumbs = document.getElementById('graph-breadcrumbs');

    if (!modal || !canvas || !openBtn) return;

    // Open Modal
    openBtn.onclick = () => {
        if (!window.currentPath) {
            alert("Please select a project folder first!");
            return;
        }
        projectRoot = window.currentPath;
        currentGraphPath = window.currentPath;
        
        modal.style.display = 'flex';
        resizeCanvas();
        buildGraph(currentGraphPath);
        startSimulation();

        setTimeout(() => {
            resizeCanvas();
            buildGraph(currentGraphPath);
            alpha = 1.0; // Reset heat
        }, 280);
    };

    // Close Modal
    const closeModal = () => {
        modal.style.display = 'none';
        stopSimulation();
    };
    closeBtn.onclick = closeModal;
    modal.onclick = (e) => {
        if (e.target === modal) closeModal();
    };

    function resizeCanvas() {
        const rect = container.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
    }
    window.addEventListener('resize', () => {
        if (modal.style.display === 'flex') {
            resizeCanvas();
            alpha = 1.0; // Wake up simulation on resize
        }
    });

    // Truncate name helper for inside circles
    function getDisplayName(name, isParent) {
        if (isParent) return '.. (Up)';
        
        const maxLen = 12;
        if (name.length <= maxLen) return name;
        
        const extIdx = name.lastIndexOf('.');
        if (extIdx !== -1 && (name.length - extIdx) <= 5) {
            const ext = name.substring(extIdx);
            const base = name.substring(0, extIdx);
            return base.substring(0, maxLen - ext.length - 3) + '...' + ext;
        }
        return name.substring(0, maxLen - 3) + '...';
    }

    // Build breadcrumbs path indicator in header
    function updateBreadcrumbs(dir) {
        if (!breadcrumbs) return;
        breadcrumbs.innerHTML = '';
        
        const relative = path.relative(projectRoot, dir);
        const parts = relative ? relative.split(path.sep) : [];
        
        const rootSpan = document.createElement('span');
        rootSpan.textContent = path.basename(projectRoot) || projectRoot;
        rootSpan.style.cursor = 'pointer';
        rootSpan.style.color = 'var(--primary)';
        rootSpan.style.fontWeight = 'bold';
        rootSpan.onclick = () => {
            currentGraphPath = projectRoot;
            buildGraph(currentGraphPath);
        };
        breadcrumbs.appendChild(rootSpan);

        let accumulated = projectRoot;
        for (const part of parts) {
            if (!part) continue;
            accumulated = path.join(accumulated, part);
            const currentPathVal = accumulated;

            const sep = document.createElement('span');
            sep.textContent = ' > ';
            sep.style.margin = '0 2px';
            sep.style.color = '#555';
            breadcrumbs.appendChild(sep);

            const span = document.createElement('span');
            span.textContent = part;
            span.style.cursor = 'pointer';
            span.style.transition = 'color 0.2s';
            span.onmouseenter = () => span.style.color = '#fff';
            span.onmouseleave = () => span.style.color = 'var(--text-muted)';
            span.onclick = () => {
                currentGraphPath = currentPathVal;
                buildGraph(currentGraphPath);
            };
            breadcrumbs.appendChild(span);
        }
    }

    // Calculate node radius based on text width to fit text inside the circle
    function calculateRadius(text, isCentral, isDir) {
        const tempCtx = canvas.getContext('2d');
        tempCtx.font = isCentral ? 'bold 11px "Outfit", sans-serif' : '9px "Outfit", sans-serif';
        const width = tempCtx.measureText(text).width;
        if (isDir) {
            // Folders need more vertical space to fit folder icon above text
            return Math.max(isCentral ? 32 : 28, width / 2 + 12);
        }
        return Math.max(20, width / 2 + 10);
    }

    // Build Graph for the targeted directory
    function buildGraph(dir) {
        nodes = [];
        links = [];
        
        zoom = 1.0;
        panX = 0;
        panY = 0;
        alpha = 1.0; // Reset heat/energy

        updateBreadcrumbs(dir);

        // 1. Create central node for the current folder
        const folderName = path.basename(dir) || dir;
        const centralDispName = getDisplayName(folderName, false);
        const centralNode = {
            id: dir,
            name: folderName,
            displayName: centralDispName,
            fullPath: dir,
            isDir: true,
            isCentral: true,
            isParent: false,
            x: canvas.width / 2,
            y: canvas.height / 2,
            vx: 0,
            vy: 0,
            radius: calculateRadius(centralDispName, true, true)
        };
        nodes.push(centralNode);

        // 2. Add special parent node (../) if we are not at the root
        const isRoot = (dir === projectRoot);
        let parentNode = null;
        if (!isRoot) {
            const parentDir = path.dirname(dir);
            const parentDispName = getDisplayName(parentDir, true);
            parentNode = {
                id: 'PARENT_NODE',
                name: '.. (Up)',
                displayName: parentDispName,
                fullPath: parentDir,
                isDir: true,
                isCentral: false,
                isParent: true,
                x: canvas.width / 2,
                y: canvas.height / 2 - 165,
                vx: 0,
                vy: 0,
                radius: calculateRadius(parentDispName, false, true)
            };
            nodes.push(parentNode);
            links.push({
                source: centralNode,
                target: parentNode,
                isParentLink: true
            });
        }

        // 3. Read current folder contents
        try {
            const items = fs.readdirSync(dir);
            const children = [];

            for (const item of items) {
                if (item.startsWith('.') || item === 'node_modules' || item.startsWith('_project_rules')) {
                    continue;
                }
                const fullPath = path.join(dir, item);
                let isDir = false;
                try {
                    isDir = fs.statSync(fullPath).isDirectory();
                } catch(e) { continue; }

                children.push({ name: item, fullPath: fullPath, isDir: isDir });
            }

            const angleStep = (Math.PI * 2) / (children.length || 1);
            children.forEach((child, index) => {
                const angle = index * angleStep;
                const distance = 150 + Math.random() * 50;
                const nodeDispName = getDisplayName(child.name, false);
                const childNode = {
                    id: child.fullPath,
                    name: child.name,
                    displayName: nodeDispName,
                    fullPath: child.fullPath,
                    isDir: child.isDir,
                    isCentral: false,
                    isParent: false,
                    x: canvas.width / 2 + Math.cos(angle) * distance,
                    y: canvas.height / 2 + Math.sin(angle) * distance,
                    vx: 0,
                    vy: 0,
                    radius: calculateRadius(nodeDispName, false, child.isDir)
                };
                nodes.push(childNode);
                links.push({
                    source: centralNode,
                    target: childNode,
                    isParentLink: false
                });
            });

        } catch (err) {
            console.error("Failed to build drill-down graph:", err);
        }
    }

    // Force Simulation Loops
    function startSimulation() {
        isSimulationRunning = true;
        tick();
    }

    function stopSimulation() {
        isSimulationRunning = false;
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
    }

    function tick() {
        if (!isSimulationRunning) return;
        updatePhysics();
        draw();
        animationId = requestAnimationFrame(tick);
    }

    function updatePhysics() {
        // Stop simulation when cooled down to prevent vibration/CPU drain
        if (alpha < 0.008) {
            for (const node of nodes) {
                node.vx = 0;
                node.vy = 0;
            }
            return;
        }

        const width = canvas.width;
        const height = canvas.height;

        // 1. Repulsion force between all node pairs
        for (let i = 0; i < nodes.length; i++) {
            const u = nodes[i];
            for (let j = i + 1; j < nodes.length; j++) {
                const v = nodes[j];
                const dx = v.x - u.x;
                const dy = v.y - u.y;
                const distSq = dx * dx + dy * dy + 300;
                const dist = Math.sqrt(distSq);
                
                const minDistance = u.radius + v.radius + 65;
                if (dist < minDistance * 3) {
                    const force = (kRepulsion / distSq) * alpha;
                    const fx = (dx / dist) * force;
                    const fy = (dy / dist) * force;
                    
                    if (!u.isDragging) {
                        u.vx -= fx;
                        u.vy -= fy;
                    }
                    if (!v.isDragging) {
                        v.vx += fx;
                        v.vy += fy;
                    }
                }

                // Smooth overlap correction
                if (dist < minDistance) {
                    const overlapForce = (minDistance - dist) * 0.18 * alpha;
                    const ox = (dx / dist) * overlapForce;
                    const oy = (dy / dist) * overlapForce;
                    if (!u.isDragging) {
                        u.vx -= ox;
                        u.vy -= oy;
                    }
                    if (!v.isDragging) {
                        v.vx += ox;
                        v.vy += oy;
                    }
                }
            }
        }

        // 2. Attraction force (spring links)
        for (const link of links) {
            const u = link.source;
            const v = link.target;
            const dx = v.x - u.x;
            const dy = v.y - u.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
            
            const currentSpringLength = link.isParentLink ? springLength * 1.6 : springLength;
            const force = (dist - currentSpringLength) * kAttraction * alpha;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;

            if (!u.isDragging) {
                u.vx += fx;
                u.vy += fy;
            }
            if (!v.isDragging) {
                v.vx -= fx;
                v.vy -= fy;
            }
        }

        // 3. Gravity/Center force & Update positions
        const centerX = width / 2;
        const centerY = height / 2;
        for (const node of nodes) {
            if (node.isDragging) continue;

            node.vx += (centerX - node.x) * kGravity * alpha;
            node.vy += (centerY - node.y) * kGravity * alpha;

            node.x += node.vx;
            node.y += node.vy;

            node.vx *= damping;
            node.vy *= damping;
        }

        // Cooling decay
        alpha *= alphaDecay;
    }

    // Helper to draw vector folder icon above text inside folder nodes
    function drawFolderIcon(ctx, cx, cy, w, h, strokeColor, fillColor) {
        ctx.save();
        ctx.beginPath();
        const x = cx - w / 2;
        const y = cy - h / 2;
        const r = 2; // rounded corner radius
        
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w * 0.4, y);
        ctx.lineTo(x + w * 0.5, y + 3);
        ctx.lineTo(x + w - r, y + 3);
        ctx.quadraticCurveTo(x + w, y + 3, x + w, y + 3 + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();

        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = strokeColor;
        ctx.stroke();
        ctx.restore();
    }

    // Render Canvas
    function draw() {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        // Apply Pan & Zoom
        ctx.translate(canvas.width / 2 + panX, canvas.height / 2 + panY);
        ctx.scale(zoom, zoom);
        ctx.translate(-canvas.width / 2, -canvas.height / 2);

        drawGrid(ctx);

        // Draw Links/Edges
        ctx.lineWidth = 1.2;
        for (const link of links) {
            const isHighlighted = hoveredNode && (link.source === hoveredNode || link.target === hoveredNode);
            if (link.isParentLink) {
                ctx.strokeStyle = isHighlighted ? 'rgba(163, 230, 53, 0.65)' : 'rgba(255, 255, 255, 0.03)';
                ctx.setLineDash([4, 4]);
            } else {
                ctx.strokeStyle = isHighlighted ? 'rgba(70, 140, 246, 0.65)' : 'rgba(255, 255, 255, 0.06)';
                ctx.setLineDash([]);
            }
            ctx.beginPath();
            ctx.moveTo(link.source.x, link.source.y);
            ctx.lineTo(link.target.x, link.target.y);
            ctx.stroke();
        }
        ctx.setLineDash([]);

        // Draw Nodes
        for (const node of nodes) {
            const isHovered = node === hoveredNode;
            
            // Outer glow ring
            if (isHovered) {
                ctx.beginPath();
                ctx.arc(node.x, node.y, node.radius + 6, 0, Math.PI * 2);
                ctx.fillStyle = node.isParent 
                    ? 'rgba(163, 230, 53, 0.2)' 
                    : (node.isDir ? 'rgba(70, 140, 246, 0.25)' : 'rgba(255, 255, 255, 0.12)');
                ctx.fill();
            }

            // Core circle
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
            
            let strokeColor = '';
            let fillColor = '';

            if (node.isParent) {
                fillColor = isHovered ? '#84cc16' : '#65a30d';
                strokeColor = '#a3e635';
            } else if (node.isCentral) {
                fillColor = isHovered ? '#2563eb' : '#1e3a8a';
                strokeColor = '#60a5fa';
            } else if (node.isDir) {
                fillColor = isHovered ? '#60a5fa' : '#468CF6';
                strokeColor = '#93c5fd';
            } else {
                fillColor = isHovered ? '#3f3f46' : '#27272a';
                strokeColor = '#52525b';
            }

            ctx.fillStyle = fillColor;
            ctx.fill();

            // Node border/stroke
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = strokeColor;
            ctx.stroke();

            // Draw content inside the circle node
            if (node.isDir) {
                // Vector folder icon at the top of the folder circle node
                const iconStroke = isHovered ? '#fff' : strokeColor;
                const iconFill = node.isParent 
                    ? 'rgba(163, 230, 53, 0.2)' 
                    : (node.isCentral ? 'rgba(96, 165, 250, 0.15)' : 'rgba(147, 197, 253, 0.12)');
                
                // Draw folder icon 7px above center
                drawFolderIcon(ctx, node.x, node.y - 7, 16, 12, iconStroke, iconFill);
                
                // Draw text label below the icon (8px below center)
                ctx.fillStyle = isHovered ? '#fff' : 'rgba(255, 255, 255, 0.85)';
                ctx.font = node.isCentral ? 'bold 10.5px "Outfit", sans-serif' : '9px "Outfit", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(node.displayName, node.x, node.y + 8);
            } else {
                // File node: name centered exactly in the middle (no icon)
                ctx.fillStyle = isHovered ? '#fff' : 'rgba(255, 255, 255, 0.85)';
                ctx.font = '9px "Outfit", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(node.displayName, node.x, node.y);
            }
        }

        ctx.restore();
    }

    function drawGrid(ctx) {
        const gridSpacing = 40;
        
        const left = (-panX - canvas.width / 2) / zoom + canvas.width / 2;
        const right = (-panX + canvas.width / 2) / zoom + canvas.width / 2;
        const top = (-panY - canvas.height / 2) / zoom + canvas.height / 2;
        const bottom = (-panY + canvas.height / 2) / zoom + canvas.height / 2;

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
        ctx.lineWidth = 1;

        const startX = Math.floor(left / gridSpacing) * gridSpacing;
        const startY = Math.floor(top / gridSpacing) * gridSpacing;

        ctx.beginPath();
        for (let x = startX; x < right; x += gridSpacing) {
            ctx.moveTo(x, top);
            ctx.lineTo(x, bottom);
        }
        for (let y = startY; y < bottom; y += gridSpacing) {
            ctx.moveTo(left, y);
            ctx.lineTo(right, y);
        }
        ctx.stroke();
    }

    // Coordinates conversion (screen to canvas world coordinates)
    function screenToWorld(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        
        const mouseX = (clientX - rect.left) * (canvas.width / (rect.width || 1));
        const mouseY = (clientY - rect.top) * (canvas.height / (rect.height || 1));

        const worldX = (mouseX - canvas.width / 2 - panX) / zoom + canvas.width / 2;
        const worldY = (mouseY - canvas.height / 2 - panY) / zoom + canvas.height / 2;

        return { x: worldX, y: worldY, rawX: mouseX, rawY: mouseY };
    }

    // Interaction Handlers
    canvas.onmousedown = (e) => {
        mouseDownX = e.clientX;
        mouseDownY = e.clientY;

        const mouse = screenToWorld(e.clientX, e.clientY);
        
        let clickedNode = null;
        for (let i = nodes.length - 1; i >= 0; i--) {
            const node = nodes[i];
            const dx = mouse.x - node.x;
            const dy = mouse.y - node.y;
            if (dx * dx + dy * dy < node.radius * node.radius) {
                clickedNode = node;
                break;
            }
        }

        if (clickedNode) {
            draggedNode = clickedNode;
            draggedNode.isDragging = true;
            draggedNode.vx = 0;
            draggedNode.vy = 0;
            alpha = 1.0; // Heat up simulation on node drag
        } else {
            isPanning = true;
            canvas.style.cursor = 'grabbing';
            startDragX = e.clientX - panX;
            startDragY = e.clientY - panY;
        }
    };

    canvas.onmousemove = (e) => {
        const mouse = screenToWorld(e.clientX, e.clientY);
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;

        if (draggedNode) {
            draggedNode.x = mouse.x;
            draggedNode.y = mouse.y;
            alpha = 1.0; // Keep simulation active while dragging
        } else if (isPanning) {
            panX = e.clientX - startDragX;
            panY = e.clientY - startDragY;
        } else {
            let currentHovered = null;
            for (let i = nodes.length - 1; i >= 0; i--) {
                const node = nodes[i];
                const dx = mouse.x - node.x;
                const dy = mouse.y - node.y;
                if (dx * dx + dy * dy < node.radius * node.radius) {
                    currentHovered = node;
                    break;
                }
            }

            if (currentHovered !== hoveredNode) {
                hoveredNode = currentHovered;
                if (hoveredNode) {
                    canvas.style.cursor = 'pointer';
                    tooltip.style.display = 'block';
                    tooltip.textContent = hoveredNode.isParent 
                        ? `Parent folder: ${hoveredNode.fullPath}` 
                        : (hoveredNode.isDir ? `Folder: ${hoveredNode.name}` : `File: ${hoveredNode.name}`);
                    tooltip.style.left = `${mouse.rawX + 15}px`;
                    tooltip.style.top = `${mouse.rawY + 15}px`;
                } else {
                    canvas.style.cursor = 'default';
                    tooltip.style.display = 'none';
                }
            } else if (hoveredNode) {
                tooltip.style.left = `${mouse.rawX + 15}px`;
                tooltip.style.top = `${mouse.rawY + 15}px`;
            }
        }
    };

    window.addEventListener('mouseup', () => {
        if (draggedNode) {
            draggedNode.isDragging = false;
            draggedNode = null;
        }
        isPanning = false;
        if (hoveredNode) {
            canvas.style.cursor = 'pointer';
        } else {
            canvas.style.cursor = 'default';
        }
    });

    canvas.onclick = (e) => {
        const dx = e.clientX - mouseDownX;
        const dy = e.clientY - mouseDownY;
        const moveDist = Math.sqrt(dx * dx + dy * dy);
        if (moveDist > 6) return;

        const mouse = screenToWorld(e.clientX, e.clientY);
        
        let clickedNode = null;
        for (let i = nodes.length - 1; i >= 0; i--) {
            const node = nodes[i];
            const dx = mouse.x - node.x;
            const dy = mouse.y - node.y;
            if (dx * dx + dy * dy < node.radius * node.radius) {
                clickedNode = node;
                break;
            }
        }

        if (clickedNode) {
            if (clickedNode.isCentral) return;

            if (clickedNode.isDir) {
                // Open Folder
                currentGraphPath = clickedNode.fullPath;
                buildGraph(currentGraphPath);
                tooltip.style.display = 'none';
                hoveredNode = null;
                canvas.style.cursor = 'default';
            } else {
                // Open File
                window.currentFilePath = clickedNode.fullPath;
                if (window.openFileInEditor) {
                    window.openFileInEditor(clickedNode.fullPath);
                }
                
                document.querySelectorAll('.file-item').forEach(el => {
                    if (el.dataset.path === clickedNode.fullPath) {
                        el.classList.add('active');
                    } else {
                        el.classList.remove('active');
                    }
                });
                closeModal();
            }
        }
    };

    // Zoom on wheel scroll
    canvas.onwheel = (e) => {
        e.preventDefault();
        
        const zoomIntensity = 0.08;
        const mouseBeforeZoom = screenToWorld(e.clientX, e.clientY);

        if (e.deltaY < 0) {
            zoom = Math.min(zoom * (1 + zoomIntensity), 4.0);
        } else {
            zoom = Math.max(zoom * (1 - zoomIntensity), 0.35);
        }

        const mouseAfterZoom = screenToWorld(e.clientX, e.clientY);
        panX += (mouseAfterZoom.x - mouseBeforeZoom.x) * zoom;
        panY += (mouseAfterZoom.y - mouseBeforeZoom.y) * zoom;
        alpha = 1.0; // Wake up simulation on zoom
    };
})();
