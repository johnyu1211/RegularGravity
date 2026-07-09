// Force-Directed Graph View for Poor man's Gravity IDE
// Fully interactive vanilla canvas physics visualization

(function() {
    const fs = require('fs');
    const path = require('path');

    let nodes = [];
    let links = [];
    let isSimulationRunning = false;
    let animationId = null;

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
    const kRepulsion = 1600;
    const kAttraction = 0.04;
    const springLength = 65;
    const kGravity = 0.015;
    const damping = 0.85;

    const modal = document.getElementById('graph-view-modal');
    const canvas = document.getElementById('graph-canvas');
    const container = document.getElementById('graph-canvas-container');
    const tooltip = document.getElementById('graph-tooltip');
    const closeBtn = document.getElementById('close-graph-view');
    const openBtn = document.getElementById('graph-view-btn');

    if (!modal || !canvas || !openBtn) return;

    // Open Modal
    openBtn.onclick = () => {
        if (!window.currentPath) {
            alert("Please select a project folder first!");
            return;
        }
        modal.style.display = 'flex';
        resizeCanvas();
        buildGraph();
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

    // Build Graph from Project files
    function buildGraph() {
        nodes = [];
        links = [];
        zoom = 1.0;
        panX = 0;
        panY = 0;

        const projectRoot = window.currentPath;
        const fileList = [];
        
        // Helper to recursively collect files (capped to avoid performance issues on massive projects)
        const cap = 200;
        let count = 0;

        function traverse(dir) {
            if (count > cap) return;
            try {
                const files = fs.readdirSync(dir);
                for (const file of files) {
                    if (count > cap) break;
                    if (file.startsWith('.') || file === 'node_modules' || file.startsWith('_project_rules')) {
                        continue;
                    }
                    const fullPath = path.join(dir, file);
                    let isDir = false;
                    try {
                        isDir = fs.statSync(fullPath).isDirectory();
                    } catch(e) { continue; }

                    fileList.push({
                        name: file,
                        fullPath: fullPath,
                        parentPath: dir,
                        isDir: isDir
                    });
                    count++;

                    if (isDir) {
                        traverse(fullPath);
                    }
                }
            } catch(e) {
                console.error("Graph build traversal error:", e);
            }
        }

        // Add root node
        const rootName = path.basename(projectRoot) || projectRoot;
        const rootNode = {
            id: projectRoot,
            name: rootName,
            fullPath: projectRoot,
            isDir: true,
            isRoot: true,
            x: canvas.width / 2,
            y: canvas.height / 2,
            vx: 0,
            vy: 0,
            radius: 20
        };
        nodes.push(rootNode);

        traverse(projectRoot);

        // Map path string to node object for link creation
        const nodeMap = {};
        nodeMap[projectRoot] = rootNode;

        // Create remaining nodes
        for (const file of fileList) {
            const node = {
                id: file.fullPath,
                name: file.name,
                fullPath: file.fullPath,
                isDir: file.isDir,
                isRoot: false,
                x: canvas.width / 2 + (Math.random() - 0.5) * 150,
                y: canvas.height / 2 + (Math.random() - 0.5) * 150,
                vx: 0,
                vy: 0,
                radius: file.isDir ? 14 : 9
            };
            nodes.push(node);
            nodeMap[file.fullPath] = node;
        }

        // Create links
        for (const file of fileList) {
            const childNode = nodeMap[file.fullPath];
            const parentNode = nodeMap[file.parentPath];
            if (childNode && parentNode) {
                links.push({
                    source: parentNode,
                    target: childNode
                });
            }
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
                
                // Active radius-dependent repulsion
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
            const force = (dist - springLength) * kAttraction;
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
            ctx.strokeStyle = isHighlighted ? 'rgba(70, 140, 246, 0.65)' : 'rgba(255, 255, 255, 0.06)';
            ctx.beginPath();
            ctx.moveTo(link.source.x, link.source.y);
            ctx.lineTo(link.target.x, link.target.y);
            ctx.stroke();
        }

        // Draw Nodes
        for (const node of nodes) {
            const isHovered = node === hoveredNode;
            
            // Outer glow ring
            if (isHovered) {
                ctx.beginPath();
                ctx.arc(node.x, node.y, node.radius + 5, 0, Math.PI * 2);
                ctx.fillStyle = node.isDir ? 'rgba(70, 140, 246, 0.25)' : 'rgba(255, 255, 255, 0.15)';
                ctx.fill();
            }

            // Core circle
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
            
            if (node.isRoot) {
                ctx.fillStyle = '#65a30d'; // Root node: distinct green
            } else if (node.isDir) {
                ctx.fillStyle = '#468CF6'; // Dir: cool primary blue
            } else {
                ctx.fillStyle = '#3f3f46'; // File: charcoal gray
            }
            ctx.fill();

            // Node border/stroke
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = node.isRoot ? '#a3e635' : (node.isDir ? '#93c5fd' : '#71717a');
            ctx.stroke();

            // Draw text labels for directory/root nodes directly, files only when hovered or zoomed close
            if (node.isDir || node.isRoot || isHovered || zoom > 1.3) {
                ctx.fillStyle = isHovered ? '#fff' : 'rgba(255, 255, 255, 0.85)';
                ctx.font = node.isRoot ? 'bold 12px "Outfit", sans-serif' : '10px "Outfit", sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(node.name, node.x, node.y + node.radius + 15);
            }
        }

        ctx.restore();
    }

    function drawGrid(ctx) {
        const gridSpacing = 40;
        
        // Calculate viewport bounds to cover only visible area
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

        // Apply inverse scaling & translation
        const worldX = (mouseX - canvas.width / 2 - panX) / zoom + canvas.width / 2;
        const worldY = (mouseY - canvas.height / 2 - panY) / zoom + canvas.height / 2;

        return { x: worldX, y: worldY, rawX: mouseX, rawY: mouseY };
    }

    // Interaction Handlers
    canvas.onmousedown = (e) => {
        const mouse = screenToWorld(e.clientX, e.clientY);
        
        // Find clicked node
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
            // Drag node
            draggedNode = clickedNode;
            draggedNode.isDragging = true;
            draggedNode.vx = 0;
            draggedNode.vy = 0;
        } else {
            // Pan viewport
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
            // Find hovered node
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
                    // Show Tooltip
                    tooltip.style.display = 'block';
                    tooltip.textContent = hoveredNode.isDir ? `📁 ${hoveredNode.name}` : `📄 ${hoveredNode.name}`;
                    tooltip.style.left = `${mouse.rawX + 15}px`;
                    tooltip.style.top = `${mouse.rawY + 15}px`;
                } else {
                    tooltip.style.display = 'none';
                }
            } else if (hoveredNode) {
                // Update Tooltip position
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
        // Prevent trigger click on drag end
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

        if (clickedNode && !clickedNode.isDir) {
            // File node clicked: open in editor and close modal
            window.currentFilePath = clickedNode.fullPath;
            if (window.openFileInEditor) {
                window.openFileInEditor(clickedNode.fullPath);
            }
            // Highlight in tree view
            document.querySelectorAll('.file-item').forEach(el => {
                if (el.dataset.path === clickedNode.fullPath) {
                    el.classList.add('active');
                } else {
                    el.classList.remove('active');
                }
            });
            closeModal();
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

        // Adjust pan to zoom relative to mouse cursor
        const mouseAfterZoom = screenToWorld(e.clientX, e.clientY);
        panX += (mouseAfterZoom.x - mouseBeforeZoom.x) * zoom;
        panY += (mouseAfterZoom.y - mouseBeforeZoom.y) * zoom;
    };
})();
