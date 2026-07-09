// Drill-Down interactive Force-Directed Graph View for Poor man's Gravity IDE
// Pure vanilla JS HTML5 canvas physics layout

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

    // Physics parameters
    const kRepulsion = 1500;
    const kAttraction = 0.05;
    const springLength = 70;
    const kGravity = 0.02;
    const damping = 0.85;

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
        }
    });

    // Build breadcrumbs path indicator in header
    function updateBreadcrumbs(dir) {
        if (!breadcrumbs) return;
        breadcrumbs.innerHTML = '';
        
        const relative = path.relative(projectRoot, dir);
        const parts = relative ? relative.split(path.sep) : [];
        
        // Add project root segment
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
            const currentPathVal = accumulated; // closure capture

            // Separator
            const sep = document.createElement('span');
            sep.textContent = ' > ';
            sep.style.margin = '0 2px';
            sep.style.color = '#555';
            breadcrumbs.appendChild(sep);

            // Path segment
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

    // Build Graph for the targeted directory
    function buildGraph(dir) {
        nodes = [];
        links = [];
        
        // Keep zoom/pan centered
        zoom = 1.0;
        panX = 0;
        panY = 0;

        updateBreadcrumbs(dir);

        // 1. Create central node for the current folder
        const folderName = path.basename(dir) || dir;
        const centralNode = {
            id: dir,
            name: folderName,
            fullPath: dir,
            isDir: true,
            isCentral: true,
            isParent: false,
            x: canvas.width / 2,
            y: canvas.height / 2,
            vx: 0,
            vy: 0,
            radius: 22
        };
        nodes.push(centralNode);

        // 2. Add special parent node (../) if we are not at the root
        const isRoot = (dir === projectRoot);
        let parentNode = null;
        if (!isRoot) {
            const parentDir = path.dirname(dir);
            parentNode = {
                id: 'PARENT_NODE',
                name: '.. (Up)',
                fullPath: parentDir,
                isDir: true,
                isCentral: false,
                isParent: true,
                x: canvas.width / 2,
                y: canvas.height / 2 - 120, // positioned slightly above center initially
                vx: 0,
                vy: 0,
                radius: 16
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

            // Distribute children in a circle around the center
            const angleStep = (Math.PI * 2) / (children.length || 1);
            children.forEach((child, index) => {
                const angle = index * angleStep;
                const distance = 80 + Math.random() * 40;
                const childNode = {
                    id: child.fullPath,
                    name: child.name,
                    fullPath: child.fullPath,
                    isDir: child.isDir,
                    isCentral: false,
                    isParent: false,
                    x: canvas.width / 2 + Math.cos(angle) * distance,
                    y: canvas.height / 2 + Math.sin(angle) * distance,
                    vx: 0,
                    vy: 0,
                    radius: child.isDir ? 14 : 9
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
        const width = canvas.width;
        const height = canvas.height;

        // 1. Repulsion force between all node pairs
        for (let i = 0; i < nodes.length; i++) {
            const u = nodes[i];
            for (let j = i + 1; j < nodes.length; j++) {
                const v = nodes[j];
                const dx = v.x - u.x;
                const dy = v.y - u.y;
                const distSq = dx * dx + dy * dy + 0.01;
                const dist = Math.sqrt(distSq);
                
                const minDistance = u.radius + v.radius + 35;
                if (dist < minDistance * 3) {
                    const force = kRepulsion / distSq;
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
            }
        }

        // 2. Attraction force (spring links)
        for (const link of links) {
            const u = link.source;
            const v = link.target;
            const dx = v.x - u.x;
            const dy = v.y - u.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
            
            // Parent links are slightly longer/stronger to differentiate
            const currentSpringLength = link.isParentLink ? springLength * 1.5 : springLength;
            const force = (dist - currentSpringLength) * kAttraction;
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

            node.vx += (centerX - node.x) * kGravity;
            node.vy += (centerY - node.y) * kGravity;

            node.x += node.vx;
            node.y += node.vy;

            node.vx *= damping;
            node.vy *= damping;
        }
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

        // Draw background grid lines (panning-aware)
        drawGrid(ctx);

        // Draw Links/Edges
        ctx.lineWidth = 1.2;
        for (const link of links) {
            const isHighlighted = hoveredNode && (link.source === hoveredNode || link.target === hoveredNode);
            if (link.isParentLink) {
                ctx.strokeStyle = isHighlighted ? 'rgba(163, 230, 53, 0.65)' : 'rgba(255, 255, 255, 0.03)';
                ctx.setLineDash([4, 4]); // parent link is dashed
            } else {
                ctx.strokeStyle = isHighlighted ? 'rgba(70, 140, 246, 0.65)' : 'rgba(255, 255, 255, 0.06)';
                ctx.setLineDash([]);
            }
            ctx.beginPath();
            ctx.moveTo(link.source.x, link.source.y);
            ctx.lineTo(link.target.x, link.target.y);
            ctx.stroke();
        }
        ctx.setLineDash([]); // Restore line dash

        // Draw Nodes
        for (const node of nodes) {
            const isHovered = node === hoveredNode;
            
            // Outer glow ring
            if (isHovered) {
                ctx.beginPath();
                ctx.arc(node.x, node.y, node.radius + 5, 0, Math.PI * 2);
                ctx.fillStyle = node.isParent 
                    ? 'rgba(163, 230, 53, 0.2)' 
                    : (node.isDir ? 'rgba(70, 140, 246, 0.25)' : 'rgba(255, 255, 255, 0.15)');
                ctx.fill();
            }

            // Core circle
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
            
            if (node.isParent) {
                ctx.fillStyle = '#65a30d'; // Parent folder: green
            } else if (node.isCentral) {
                ctx.fillStyle = '#1e3a8a'; // Current central folder: dark blue
            } else if (node.isDir) {
                ctx.fillStyle = '#468CF6'; // Sub folder: cool primary blue
            } else {
                ctx.fillStyle = '#3f3f46'; // File: charcoal gray
            }
            ctx.fill();

            // Node border/stroke
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = node.isParent 
                ? '#a3e635' 
                : (node.isCentral ? '#60a5fa' : (node.isDir ? '#93c5fd' : '#71717a'));
            ctx.stroke();

            // Label positioning
            ctx.fillStyle = isHovered ? '#fff' : 'rgba(255, 255, 255, 0.85)';
            ctx.font = node.isCentral ? 'bold 11.5px "Outfit", sans-serif' : '10px "Outfit", sans-serif';
            ctx.textAlign = 'center';
            
            let label = node.name;
            if (node.isCentral) label = `📂 ${node.name}`;
            else if (node.isDir && !node.isParent) label = `📁 ${node.name}`;
            else if (node.isParent) label = `↩️ ${node.name}`;
            
            ctx.fillText(label, node.x, node.y + node.radius + 15);
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
        const mouseX = clientX - rect.left;
        const mouseY = clientY - rect.top;

        const worldX = (mouseX - canvas.width / 2 - panX) / zoom + canvas.width / 2;
        const worldY = (mouseY - canvas.height / 2 - panY) / zoom + canvas.height / 2;

        return { x: worldX, y: worldY, rawX: mouseX, rawY: mouseY };
    }

    // Interaction Handlers
    canvas.onmousedown = (e) => {
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
        } else {
            isPanning = true;
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
                    tooltip.style.display = 'block';
                    tooltip.textContent = hoveredNode.isParent 
                        ? `Parent folder: ${hoveredNode.fullPath}` 
                        : (hoveredNode.isDir ? `Folder: ${hoveredNode.name}` : `File: ${hoveredNode.name}`);
                    tooltip.style.left = `${mouse.rawX + 15}px`;
                    tooltip.style.top = `${mouse.rawY + 15}px`;
                } else {
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
    });

    canvas.onclick = (e) => {
        // Prevent click events when dragging/panning
        if (e.movementX !== 0 || e.movementY !== 0) return;

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
            if (clickedNode.isCentral) {
                // Clicked central directory node: do nothing
                return;
            }

            if (clickedNode.isDir) {
                // Folder node clicked: drill down or up!
                currentGraphPath = clickedNode.fullPath;
                buildGraph(currentGraphPath);
                tooltip.style.display = 'none';
                hoveredNode = null;
            } else {
                // File node clicked: open in editor and close modal
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
    };
})();
