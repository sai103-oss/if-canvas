// State Lists
let nodes = [];
let edges = [];
let signals = [];
let texts = [];
let nodeIdCounter = 0;
let edgeIdCounter = 0;
let textIdCounter = 0;

// History State
let stateHistory = [];
let isRestoring = false;
let preSimStateStr = null;
let isSimulationPaused = false;
let hasSimulationStarted = false;

// Tutorial State
let tutorialStep = 1;
const tutorialData = [
    { text: "세상의 모든 것은 서로 연결되어 영향을 주고 받습니다. <br>가장 단순한 생태계인 '늑대와 양'의 관계를 통해 그 원리를 살펴봅시다.", highlight: null },
    { text: "노드의 위쪽 화살표(▲)는 <b>양(+)의 관계</b>를 의미합니다.<br>한쪽이 늘어나면 연결된 다른 쪽의 값도 함께 늘어납니다.", highlight: 'pos' },
    { text: "노드의 아래쪽 화살표(▼)는 <b>음(-)의 관계</b>를 의미합니다.<br>한쪽이 늘어나면 연결된 다른 쪽의 값은 줄어듭니다.", highlight: 'neg' },
    { text: "이제 여러분만의 세상을 만들어보세요!", highlight: null }
];

// Modes & Interaction
let currentMode = 'idle'; // idle, pan, linking_pos, linking_neg, deleting
let zoom = 1.0;
let panX = 0, panY = 0;
let simulationSpeed = 1.0;

// Dragging Entities
let isDraggingNode = false; let draggedNode = null;
let isDraggingLink = false; let linkSourceNode = null;
let isDraggingText = false; let draggedText = null;
let isResizingNode = false; let resizingNode = null;
let isDraggingEdgeCurve = false; let draggedEdge = null; let edgeDragMoveSq = 0;
let isPanning = false;

// Touch & Pinch state
const activePointers = new Map();
let initialPinchDistance = null;
let initialPinchZoom = null;
let pinchCenterX = 0, pinchCenterY = 0;
let pinchCenterWorkspaceX = 0, pinchCenterWorkspaceY = 0;

let interactionStartX = 0, interactionStartY = 0;
let elementStartX = 0, elementStartY = 0;
let elementStartW = 0, elementStartH = 0;
let isErasing = false;

// DOM
const workspace = document.getElementById('workspace');
const canvasContainer = document.getElementById('canvas-container');
const nodeContainer = document.getElementById('node-container');
const edgeCanvas = document.getElementById('edge-canvas');
const textContainer = document.getElementById('text-container');
const tempEdge = document.getElementById('temp-edge');

const speedSlider = document.getElementById('speed-slider');
const zoomLevelText = document.getElementById('zoom-level');
const nodeTemplate = document.getElementById('node-template');
const textTemplate = document.getElementById('text-template');

// Constants
let BASE_NODE_RADIUS = 60;
const SIGNAL_SPEED = 2.5; 
const SIGNAL_SIZE_PX = 24;
const VALUE_CHANGE_AMOUNT = 0.1;

let spawnOffset = 0;

const PRESET_COLORS = [
    '#f44336', '#ff9800', '#ffeb3b',
    '#4caf50', '#00bcd4', '#3498db',
    '#9c27b0', '#e91e63', '#9e9e9e'
];

// Initialize
function init() {
    document.getElementById('add-node-btn').addEventListener('click', () => {
        setMode('idle');
        const pt = getWorkspaceCoords({clientX: window.innerWidth/2, clientY: window.innerHeight/2});
        createNode(pt.x + spawnOffset, pt.y + spawnOffset);
        spawnOffset = (spawnOffset + 25) % 150;
        saveState();
    });
    document.getElementById('add-text-btn').addEventListener('click', () => {
        setMode('idle');
        const pt = getWorkspaceCoords({clientX: window.innerWidth/2, clientY: window.innerHeight/2});
        createText(pt.x + spawnOffset, pt.y + spawnOffset);
        spawnOffset = (spawnOffset + 25) % 150;
        saveState();
    });

    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', (e) => setMode(e.currentTarget.dataset.mode));
    });

    document.getElementById('clear-btn').addEventListener('click', () => { 
        clearAll(true); 
        saveState(); 
        const startBtn = document.getElementById('start-overlay-btn');
        if (startBtn) startBtn.style.display = 'none';
    });
    document.getElementById('undo-btn').addEventListener('click', undo);

    document.getElementById('zoom-in-btn').addEventListener('click', () => setZoom(zoom + 0.1));
    document.getElementById('zoom-out-btn').addEventListener('click', () => setZoom(zoom - 0.1));
    document.getElementById('zoom-reset-btn').addEventListener('click', () => { panX = 0; panY = 0; setZoom(1); });
    
    canvasContainer.addEventListener('wheel', (e) => {
        e.preventDefault();
        setZoom(zoom - e.deltaY * 0.002, e.clientX, e.clientY);
    }, {passive: false});

    speedSlider.addEventListener('input', (e) => { simulationSpeed = parseFloat(e.target.value); });

    const pauseBtn = document.getElementById('sim-pause-btn');
    const playBtn = document.getElementById('sim-play-btn');
    const resetBtn = document.getElementById('sim-reset-btn');
    
    pauseBtn.addEventListener('click', () => {
        isSimulationPaused = true;
        pauseBtn.style.display = 'none';
        playBtn.style.display = 'inline-block';
        resetBtn.style.display = 'inline-block';
    });
    
    playBtn.addEventListener('click', () => {
        isSimulationPaused = false;
        playBtn.style.display = 'none';
        resetBtn.style.display = 'none';
        pauseBtn.style.display = 'inline-block';
    });
    
    resetBtn.addEventListener('click', () => {
        if (preSimStateStr) {
            isRestoring = true;
            loadState(JSON.parse(preSimStateStr));
            isRestoring = false;
        }
        signals.forEach(s => s.el.remove());
        signals = [];
        hasSimulationStarted = false;
    });

    window.addEventListener('pointerdown', onGlobalMouseDown);
    window.addEventListener('pointermove', onGlobalMouseMove);
    window.addEventListener('pointerup', onGlobalMouseUp);
    window.addEventListener('pointercancel', onGlobalMouseUp);

    window.addEventListener('contextmenu', (e) => {
        if (e.target.tagName.toLowerCase() !== 'input' && e.target.tagName.toLowerCase() !== 'textarea') {
            e.preventDefault();
        }
    });

    requestAnimationFrame(simulationLoop);
    
    // 초기화면 셋팅 (늑대 & 양)
    // 모바일/태블릿 대응: 화면이 작으면 노드 간격을 좁히고 위치를 더 위로 올림
    const isMobile = window.innerWidth < 600;
    const isTablet = window.innerWidth >= 600 && window.innerWidth < 1024;
    const cx = window.innerWidth / 2;
    // 더욱 위로(상단 15% 지점) 이동하여 버튼들과 겹침을 최소화
    const cy = (isMobile || isTablet) ? window.innerHeight * 0.15 : window.innerHeight * 0.25;
    const gap = isMobile ? 85 : (isTablet ? 110 : 150);
    
    let n1 = createNode(cx - gap, cy, "늑대"); n1.value = 0.8; n1.color = "#f44336";
    let n2 = createNode(cx + gap, cy, "양"); n2.value = 0.5; n2.color = "#4caf50";
    
    [n1,n2].forEach(n => { n.colorPicker.style.backgroundColor = n.color; updateNodeVisuals(n); });
    
    // 늑대 -> 양 (음의 선)
    createEdge(n1, n2, 'negative');
    // 양 -> 늑대 (양의 선)
    createEdge(n2, n1, 'positive');

    setMode('idle');
    saveState();

    // 시작하기 버튼 이벤트
    const startBtn = document.getElementById('start-overlay-btn');
    const tutorialOverlay = document.getElementById('tutorial-overlay');
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            clearAll(true);
            saveState();
            tutorialOverlay.style.opacity = '0';
            setTimeout(() => tutorialOverlay.style.display = 'none', 500);
        });
    }

    // 튜토리얼 버튼 이벤트들
    const nextBtn = document.getElementById('tutorial-next-btn');
    const prevBtn = document.getElementById('tutorial-prev-btn');
    const stepNum = document.getElementById('tutorial-step-num');
    const tutorialText = document.getElementById('tutorial-text');
    const startArea = document.getElementById('start-area');
    const indicator = document.getElementById('tutorial-indicator');

    function updateTutorialUI() {
        stepNum.innerText = tutorialStep;
        tutorialText.innerHTML = tutorialData[tutorialStep - 1].text;

        // 버튼 가시성
        prevBtn.style.display = tutorialStep === 1 ? 'none' : 'inline-block';
        nextBtn.style.display = tutorialStep === tutorialData.length ? 'none' : 'inline-block';
        startArea.style.display = tutorialStep === tutorialData.length ? 'flex' : 'none';

        // 하이라이트 초기화
        indicator.style.display = 'none';
        document.querySelectorAll('.highlight-node-part').forEach(el => el.classList.remove('highlight-node-part'));

        if (tutorialStep === 2) {
            const targetNode = nodes.find(n => n.nameInput.value === "양");
            if (targetNode) {
                const upBtn = targetNode.el.querySelector('.up');
                upBtn.classList.add('highlight-node-part');
                const rect = upBtn.getBoundingClientRect();
                indicator.style.display = 'block';
                indicator.style.left = (rect.left + rect.width/2 - 20) + 'px';
                indicator.style.top = (rect.top + rect.height/2 - 20) + 'px';
            }
        } else if (tutorialStep === 3) {
            const targetNode = nodes.find(n => n.nameInput.value === "늑대");
            if (targetNode) {
                const downBtn = targetNode.el.querySelector('.down');
                downBtn.classList.add('highlight-node-part');
                const rect = downBtn.getBoundingClientRect();
                indicator.style.display = 'block';
                indicator.style.left = (rect.left + rect.width/2 - 20) + 'px';
                indicator.style.top = (rect.top + rect.height/2 - 20) + 'px';
            }
        }
    }

    nextBtn.addEventListener('click', () => {
        if (tutorialStep < tutorialData.length) {
            tutorialStep++;
            updateTutorialUI();
        }
    });

    prevBtn.addEventListener('click', () => {
        if (tutorialStep > 1) {
            tutorialStep--;
            updateTutorialUI();
        }
    });

    updateTutorialUI();
}

// History & Undo
function getStateString() {
    return JSON.stringify({
        nodes: nodes.map(n => ({ id: n.id, x: n.x, y: n.y, width: n.width, height: n.height, value: n.value, name: n.nameInput.value, color: n.color, fontSize: n.fontSize })),
        edges: edges.map(e => ({ id: e.id, source: e.source.id, target: e.target.id, type: e.type, bend: e.bend })),
        texts: texts.map(t => ({ id: t.id, x: t.x, y: t.y, content: t.textarea.value, fontSize: t.fontSize }))
    });
}

function saveState() {
    if (isRestoring) return;
    stateHistory.push(getStateString());
    if (stateHistory.length > 50) stateHistory.shift();
    if (signals.length === 0) {
        hasSimulationStarted = false;
    }
}

function undo() {
    if (stateHistory.length <= 1) return;
    stateHistory.pop(); // remove current state
    const prevStateStr = stateHistory[stateHistory.length - 1];
    isRestoring = true;
    loadState(JSON.parse(prevStateStr));
    isRestoring = false;
}

function loadState(state) {
    clearAll(false);
    
    let maxNId = 0, maxTId = 0, maxEId = 0;
    const nodeMap = {};
    
    state.nodes.forEach(nDef => {
        let n = createNode(nDef.x, nDef.y, nDef.name, false);
        n.id = nDef.id; n.el.id = n.id;
        n.value = nDef.value; n.color = nDef.color;
        n.width = nDef.width || 120; n.height = nDef.height || 120;
        n.fontSize = nDef.fontSize || 14;
        n.nameInput.style.fontSize = n.fontSize + 'px';
        n.colorPicker.style.backgroundColor = n.color;
        n.el.style.width = n.width + 'px'; n.el.style.height = n.height + 'px';
        updateNodeVisuals(n);
        nodeMap[n.id] = n;
        maxNId = Math.max(maxNId, parseInt(n.id.split('_')[1]));
    });
    nodeIdCounter = maxNId + 1;

    state.edges.forEach(eDef => {
        if(nodeMap[eDef.source] && nodeMap[eDef.target]) {
            let e = createEdge(nodeMap[eDef.source], nodeMap[eDef.target], eDef.type, false);
            e.bend = eDef.bend !== undefined ? eDef.bend : 0.2;
            maxEId = Math.max(maxEId, parseInt(e.id.split('_')[1]));
        }
    });
    edgeIdCounter = maxEId + 1;

    state.texts.forEach(tDef => {
        let t = createText(tDef.x, tDef.y, tDef.content, false);
        t.id = tDef.id; t.el.id = t.id;
        t.fontSize = tDef.fontSize || 16;
        t.textarea.style.fontSize = t.fontSize + 'px';
        maxTId = Math.max(maxTId, parseInt(t.id.split('_')[1]));
    });
    textIdCounter = maxTId + 1;

    drawEdges();
}

// Transforms
function applyTransform() {
    workspace.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
}
function setZoom(z, mouseX = window.innerWidth/2, mouseY = window.innerHeight/2) {
    const rect = canvasContainer.getBoundingClientRect();
    const relX = mouseX - rect.left;
    const relY = mouseY - rect.top;
    const wsX = (relX - panX) / zoom;
    const wsY = (relY - panY) / zoom;
    zoom = Math.max(0.2, Math.min(4, z));
    panX = relX - wsX * zoom;
    panY = relY - wsY * zoom;
    zoomLevelText.innerText = Math.round(zoom * 100) + '%';
    applyTransform();
}
function getWorkspaceCoords(e) {
    const rect = canvasContainer.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;
    return { x: (relX - panX) / zoom, y: (relY - panY) / zoom };
}

function setMode(mode) {
    currentMode = mode;
    document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.mode-btn[data-mode="${mode}"]`);
    if(activeBtn) activeBtn.classList.add('active');
    
    document.body.className = `mode-${mode}`;
    
    if (linkSourceNode) {
        linkSourceNode.el.classList.remove('linking');
        linkSourceNode = null;
    }
}
function toggleMode(mode) { setMode(currentMode === mode ? 'idle' : mode); }

// Global Mouse flow
function onGlobalMouseDown(e) {
    activePointers.set(e.pointerId, e);

    if (!e.target.closest('.palette-container')) {
        document.querySelectorAll('.custom-palette.show').forEach(p => p.classList.remove('show'));
    }

    if (e.target.closest('#toolbar') === null) {
        const isEmptyBackground = !e.target.closest('.node') && !e.target.closest('.text-label') && 
                                  !e.target.classList.contains('edge') && !e.target.classList.contains('edge-control');
        
        if (currentMode === 'deleting') {
            isErasing = true;
            eraseAtPoint(e.clientX, e.clientY);
        } else if (activePointers.size <= 1) {
            // PC버전(마우스)에서만 1-포인터 화면 이동 허용 (스마트폰/태블릿 1손가락 이동 금지)
            if (e.pointerType === 'mouse' && isEmptyBackground) {
                isPanning = true;
                interactionStartX = e.clientX; interactionStartY = e.clientY;
                elementStartX = panX; elementStartY = panY;
                document.body.classList.add('is-dragging-global');
            }
        }
    }
}

function onGlobalMouseMove(e) {
    if (activePointers.has(e.pointerId)) {
        activePointers.set(e.pointerId, e);
    }

    if (activePointers.size === 2) {
        const ptrs = Array.from(activePointers.values());
        const dx = ptrs[0].clientX - ptrs[1].clientX;
        const dy = ptrs[0].clientY - ptrs[1].clientY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        const midX = (ptrs[0].clientX + ptrs[1].clientX) / 2;
        const midY = (ptrs[0].clientY + ptrs[1].clientY) / 2;

        if (initialPinchDistance === null) {
            initialPinchDistance = dist;
            initialPinchZoom = zoom;
            pinchCenterX = midX;
            pinchCenterY = midY;
            
            const rect = canvasContainer.getBoundingClientRect();
            pinchCenterWorkspaceX = ((midX - rect.left) - panX) / zoom;
            pinchCenterWorkspaceY = ((midY - rect.top) - panY) / zoom;
            
            isPanning = false; // pinch starts, stop single finger panning
        } else {
            const scale = dist / initialPinchDistance;
            zoom = Math.max(0.2, Math.min(4, initialPinchZoom * scale));
            
            const rect = canvasContainer.getBoundingClientRect();
            const relMidX = midX - rect.left;
            const relMidY = midY - rect.top;
            
            panX = relMidX - pinchCenterWorkspaceX * zoom;
            panY = relMidY - pinchCenterWorkspaceY * zoom;
            
            zoomLevelText.innerText = Math.round(zoom * 100) + '%';
            applyTransform();
        }
        return;
    }

    if (isErasing && currentMode === 'deleting') eraseAtPoint(e.clientX, e.clientY);
    
    if (isPanning) {
        panX = elementStartX + (e.clientX - interactionStartX);
        panY = elementStartY + (e.clientY - interactionStartY);
        applyTransform();
    }
    
    if (isDraggingNode && draggedNode) {
        const coords = getWorkspaceCoords(e);
        draggedNode.x = elementStartX + (coords.x - interactionStartX);
        draggedNode.y = elementStartY + (coords.y - interactionStartY);
        draggedNode.el.style.left = `${draggedNode.x}px`;
        draggedNode.el.style.top = `${draggedNode.y}px`;
        drawEdges();
    }

    if (isDraggingText && draggedText) {
        const coords = getWorkspaceCoords(e);
        draggedText.x = elementStartX + (coords.x - interactionStartX);
        draggedText.y = elementStartY + (coords.y - interactionStartY);
        draggedText.el.style.left = `${draggedText.x}px`;
        draggedText.el.style.top = `${draggedText.y}px`;
    }

    if (isResizingNode && resizingNode) {
        const coords = getWorkspaceCoords(e);
        const dx = coords.x - interactionStartX;
        const dy = coords.y - interactionStartY;
        const sizeDelta = Math.max(dx, dy) * 2;
        const newSize = Math.max(60, elementStartW + sizeDelta);
        resizingNode.width = newSize; resizingNode.height = newSize;
        resizingNode.el.style.width = newSize + 'px';
        resizingNode.el.style.height = newSize + 'px';
        drawEdges();
    }

    if (isDraggingLink && linkSourceNode) {
        const coords = getWorkspaceCoords(e);
        tempEdge.setAttribute('d', `M ${linkSourceNode.x} ${linkSourceNode.y} L ${coords.x} ${coords.y}`);
        tempEdge.style.display = 'block';
    }

    if (isDraggingEdgeCurve && draggedEdge) {
        const distClientX = e.clientX - window.interactionStartClientX;
        const distClientY = e.clientY - window.interactionStartClientY;
        edgeDragMoveSq = distClientX*distClientX + distClientY*distClientY;

        const coords = getWorkspaceCoords(e);
        const dx = coords.x - interactionStartX;
        const dy = coords.y - interactionStartY;
        
        const sx = draggedEdge.source.x; const sy = draggedEdge.source.y;
        const tx = draggedEdge.target.x; const ty = draggedEdge.target.y;
        const lineDx = tx - sx; const lineDy = ty - sy;
        const lenSq = lineDx*lineDx + lineDy*lineDy;
        
        if (lenSq > 0) {
            const dot = dx * (-lineDy) + dy * lineDx;
            draggedEdge.bend = draggedEdge.initialBend + (dot / lenSq) * 2;
        }
        drawEdges();
    }
}

function onGlobalMouseUp(e) {
    activePointers.delete(e.pointerId);
    if (activePointers.size !== 2) {
        initialPinchDistance = null;
        initialPinchZoom = null;
    }

    document.body.classList.remove('is-dragging-global');
    let stateChanged = false;

    if (isPanning) isPanning = false;
    if (isErasing) { isErasing = false; stateChanged = true; } 

    if (isDraggingNode) { isDraggingNode = false; draggedNode = null; stateChanged = true; }
    if (isDraggingText) { isDraggingText = false; draggedText = null; stateChanged = true; }
    if (isResizingNode) { isResizingNode = false; resizingNode = null; stateChanged = true; }
    
    if (isDraggingEdgeCurve) {
        if (edgeDragMoveSq < 20 && currentMode === 'idle') {
            draggedEdge.type = draggedEdge.type === 'positive' ? 'negative' : 'positive';
            draggedEdge.path.setAttribute('class', `edge ${draggedEdge.type}`);
            draggedEdge.controlPoint.setAttribute('class', `edge-control ${draggedEdge.type}`);
        }
        isDraggingEdgeCurve = false; draggedEdge = null; stateChanged = true;
    }

    if (isDraggingLink) {
        tempEdge.style.display = 'none';
        const targetNodeEl = e.target.closest('.node');
        if (targetNodeEl) {
            const tgtId = targetNodeEl.id;
            const targetNode = nodes.find(n => n.id === tgtId);
            if (targetNode && targetNode !== linkSourceNode) {
                const type = currentMode === 'linking_neg' ? 'negative' : 'positive';
                createEdge(linkSourceNode, targetNode, type);
                stateChanged = true;
            }
        }
        isDraggingLink = false; linkSourceNode = null;
    }

    if(stateChanged) saveState();
}

function eraseAtPoint(x, y) {
    const els = document.elementsFromPoint(x, y);
    let erased = false;
    els.forEach(el => {
        if (el.closest('.node')) {
            const n = nodes.find(nd => nd.id === el.closest('.node').id);
            if (n) { deleteNode(n); erased = true; }
        }
        if (el.closest('.text-label')) {
            const t = texts.find(tx => tx.id === el.closest('.text-label').id);
            if (t) { deleteText(t); erased = true; }
        }
        if ((el.classList.contains('edge') && el.id !== 'temp-edge') || el.classList.contains('edge-control')) {
            const e = edges.find(ed => ed.path === el || ed.controlPoint === el);
            if (e) { deleteEdge(e); erased = true; }
        }
    });
}

// Nodes
function createNode(x, y, name="새 노드", triggerSave=true) {
    const id = `node_${nodeIdCounter++}`;
    const clone = nodeTemplate.content.cloneNode(true);
    const el = clone.querySelector('.node');
    el.id = id; el.style.left = `${x}px`; el.style.top = `${y}px`;
    
    const input = el.querySelector('.node-name');
    input.value = name;
    
    const nodeData = {
        id, el, x, y, width: 120, height: 120,
        value: 0.5, color: '#3498db', fontSize: 20,
        nameInput: input, fillEl: el.querySelector('.node-fill'),
        colorPicker: el.querySelector('.color-picker-override'),
        palette: el.querySelector('.custom-palette'),
        valSlider: el.querySelector('.node-val-slider')
    };

    input.style.fontSize = '20px';

    PRESET_COLORS.forEach(c => {
        const swatch = document.createElement('div');
        swatch.className = 'palette-swatch';
        swatch.style.backgroundColor = c;
        swatch.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            nodeData.color = c;
            nodeData.colorPicker.style.backgroundColor = c;
            updateNodeVisuals(nodeData);
            saveState();
            nodeData.palette.classList.remove('show');
        });
        nodeData.palette.appendChild(swatch);
    });

    nodes.push(nodeData);
    nodeContainer.appendChild(el);
    
    updateNodeVisuals(nodeData);
    setupNodeEvents(nodeData);
    if(triggerSave) saveState();
    return nodeData;
}

function updateNodeVisuals(node) {
    node.value = Math.max(0, Math.min(1, node.value));
    node.fillEl.style.height = `${node.value * 100}%`;
    node.fillEl.style.background = `linear-gradient(180deg, ${node.color} 0%, rgba(30,30,40,0) 200%)`;
    node.el.style.setProperty('--node-scale', 1);
    if (node.valSlider) node.valSlider.value = node.value;
}

function setupNodeEvents(node) {
    node.el.addEventListener('pointerdown', (e) => {
        if (currentMode === 'deleting') { deleteNode(node); saveState(); return; }
        
        if (currentMode.startsWith('linking')) {
            e.preventDefault();
            if (!linkSourceNode) { linkSourceNode = node; node.el.classList.add('linking'); } 
            else {
                if (linkSourceNode !== node) createEdge(linkSourceNode, node, currentMode === 'linking_neg' ? 'negative' : 'positive');
                linkSourceNode.el.classList.remove('linking'); linkSourceNode = null; setMode('idle'); saveState();
            }
            return;
        }

        if (['input','button'].includes(e.target.tagName.toLowerCase()) || 
            e.target.closest('.color-picker-override') || 
            e.target.closest('.custom-palette') || 
            e.target.classList.contains('node-resize-handle')) return;
        
        isDraggingNode = true; draggedNode = node;
        elementStartX = node.x; elementStartY = node.y;
        const coords = getWorkspaceCoords(e);
        interactionStartX = coords.x; interactionStartY = coords.y;
        nodeContainer.appendChild(node.el); 
        document.body.classList.add('is-dragging-global');
    });
    
    node.el.querySelector('.node-resize-handle').addEventListener('pointerdown', (e) => {
        if(currentMode !== 'idle') return;
        e.stopPropagation();
        isResizingNode = true; resizingNode = node;
        elementStartW = node.width; elementStartH = node.height;
        const coords = getWorkspaceCoords(e);
        interactionStartX = coords.x; interactionStartY = coords.y;
    });

    node.el.querySelector('.up').addEventListener('click', (e) => { e.stopPropagation(); triggerSignalInitial(node, 1); });
    node.el.querySelector('.down').addEventListener('click', (e) => { e.stopPropagation(); triggerSignalInitial(node, -1); });
    
    node.el.querySelector('.inc-node').addEventListener('pointerdown', (e) => {
        e.stopPropagation(); node.fontSize += 2; node.nameInput.style.fontSize = node.fontSize + 'px'; saveState();
    });
    node.el.querySelector('.dec-node').addEventListener('pointerdown', (e) => {
        e.stopPropagation(); node.fontSize = Math.max(10, node.fontSize - 2); node.nameInput.style.fontSize = node.fontSize + 'px'; saveState();
    });

    node.nameInput.addEventListener('pointerdown', e => e.stopPropagation());
    node.nameInput.addEventListener('blur', () => saveState());

    node.colorPicker.addEventListener('pointerdown', e => {
        e.stopPropagation();
        document.querySelectorAll('.custom-palette.show').forEach(p => {
            if (p !== node.palette) p.classList.remove('show');
        });
        node.palette.classList.toggle('show');
    });
    node.palette.addEventListener('pointerdown', e => e.stopPropagation());

    node.valSlider.addEventListener('input', (e) => {
        node.value = parseFloat(e.target.value);
        updateNodeVisuals(node);
        drawEdges();
    });
    node.valSlider.addEventListener('change', () => saveState());
    node.valSlider.addEventListener('pointerdown', e => e.stopPropagation());
}

// Texts
function createText(x, y, content="", triggerSave=true) {
    const id = `text_${textIdCounter++}`;
    const clone = textTemplate.content.cloneNode(true);
    const el = clone.querySelector('.text-label');
    el.id = id; el.style.left = `${x}px`; el.style.top = `${y}px`;
    
    const textarea = el.querySelector('textarea');
    textarea.value = content;
    
    const textData = { id, el, x, y, textarea, fontSize: 16 };
    texts.push(textData);
    textContainer.appendChild(el);
    
    if(!content) textarea.focus();

    el.querySelector('.inc').addEventListener('pointerdown', (e) => {
        e.stopPropagation(); textData.fontSize += 4; textarea.style.fontSize = textData.fontSize + 'px'; saveState();
    });
    el.querySelector('.dec').addEventListener('pointerdown', (e) => {
        e.stopPropagation(); textData.fontSize = Math.max(10, textData.fontSize - 4); textarea.style.fontSize = textData.fontSize + 'px'; saveState();
    });

    el.addEventListener('pointerdown', (e) => {
        if(currentMode === 'deleting') { deleteText(textData); saveState(); return; }
        if(currentMode !== 'idle') return;
        if (e.target.tagName.toLowerCase() === 'button') return;
        
        if (e.target === textarea) {
            const rect = textarea.getBoundingClientRect();
            // 우측 하단 28x28 픽셀 이내 클릭 시(리사이즈 영역) 드래그 방지
            if (e.clientX > rect.right - 28 && e.clientY > rect.bottom - 28) return;
        }

        e.stopPropagation();
        isDraggingText = true; draggedText = textData;
        elementStartX = textData.x; elementStartY = textData.y;
        const coords = getWorkspaceCoords(e);
        interactionStartX = coords.x; interactionStartY = coords.y;
        document.body.classList.add('is-dragging-global');
    });

    textarea.addEventListener('blur', () => saveState());
    textarea.addEventListener('input', function() {
        this.style.height = 'auto'; this.style.height = (this.scrollHeight) + 'px';
        saveState();
    });

    if(triggerSave) saveState();
    return textData;
}

// Edges
function createEdge(source, target, type, triggerSave=true) {
    const existingCount = edges.filter(e => e.source === source && e.target === target).length;
    let baseBend = 0.2;
    if (existingCount > 0) {
        const sign = existingCount % 2 === 1 ? -1 : 1;
        baseBend = sign * (0.2 + 0.3 * Math.floor((existingCount+1)/2));
    }

    const id = `edge_${edgeIdCounter++}`;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('id', id); path.setAttribute('class', `edge ${type}`);
    edgeCanvas.insertBefore(path, tempEdge);
    
    const controlPoint = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    controlPoint.setAttribute('class', `edge-control ${type}`);
    controlPoint.setAttribute('r', '7'); 
    edgeCanvas.appendChild(controlPoint);
    
    const edgeData = { id, source, target, type, path, controlPoint, bend: baseBend };
    edges.push(edgeData);
    
    controlPoint.addEventListener('pointerdown', (e) => {
        if (currentMode === 'deleting') { deleteEdge(edgeData); saveState(); }
        else if (currentMode === 'idle') {
            e.stopPropagation();
            isDraggingEdgeCurve = true; draggedEdge = edgeData; edgeDragMoveSq = 0;
            const coords = getWorkspaceCoords(e);
            interactionStartX = coords.x; interactionStartY = coords.y;
            window.interactionStartClientX = e.clientX; window.interactionStartClientY = e.clientY;
            draggedEdge.initialBend = draggedEdge.bend;
            document.body.classList.add('is-dragging-global');
        }
    });

    path.addEventListener('pointerdown', (e) => {
        if (currentMode === 'deleting') { deleteEdge(edgeData); saveState(); }
    });
    
    drawEdges();
    if(triggerSave) saveState();
    return edgeData;
}

function drawEdges() {
    edges.forEach(edge => {
        const sx = edge.source.x; const sy = edge.source.y;
        const tx = edge.target.x; const ty = edge.target.y;
        
        const dx = tx - sx; const dy = ty - sy;
        const cx = sx + dx/2 - dy * edge.bend; 
        const cy = sy + dy/2 + dx * edge.bend;
        
        const srcRad = (edge.source.width / 2);
        const tgtRad = (edge.target.width / 2);

        const angleStart = Math.atan2(cy - sy, cx - sx);
        const angleEnd = Math.atan2(ty - cy, tx - cx);
        
        const finalSx = sx + Math.cos(angleStart) * srcRad; const finalSy = sy + Math.sin(angleStart) * srcRad;
        const finalTx = tx - Math.cos(angleEnd) * tgtRad; const finalTy = ty - Math.sin(angleEnd) * tgtRad;

        const d = `M ${finalSx} ${finalSy} Q ${cx} ${cy} ${finalTx} ${finalTy}`;
        edge.path.setAttribute('d', d);
        edge.pathCurveAmount = {cx, cy};
        edge.geometry = { sx: finalSx, sy: finalSy, tx: finalTx, ty: finalTy }; 
        
        const midCurveX = 0.25 * finalSx + 0.5 * cx + 0.25 * finalTx;
        const midCurveY = 0.25 * finalSy + 0.5 * cy + 0.25 * finalTy;
        edge.controlPoint.setAttribute('cx', midCurveX);
        edge.controlPoint.setAttribute('cy', midCurveY);
    });
}

function triggerSignalInitial(node, changeDir) {
    node.value += changeDir * VALUE_CHANGE_AMOUNT;
    if (node.value > 1) node.value = 1;
    if (node.value < 0) node.value = 0;
    updateNodeVisuals(node); drawEdges(); emitSignalsFrom(node, changeDir);
}

function triggerSignalArrived(node, val) {
    node.value += val * VALUE_CHANGE_AMOUNT;
    if (node.value > 1) node.value = 1;
    if (node.value < 0) node.value = 0;
    
    updateNodeVisuals(node); drawEdges(); 
    
    node.el.classList.add('flash');
    setTimeout(() => node.el.classList.remove('flash'), 300);

    const floatTxt = document.createElement('div');
    floatTxt.className = `floating-text ${val > 0 ? 'pos' : 'neg'}`;
    floatTxt.innerText = val > 0 ? '▲' : '▼';
    
    const scale =  1;
    floatTxt.style.left = `${node.x}px`;
    floatTxt.style.top = `${node.y - (node.width/2) * scale - 10}px`;
    textContainer.appendChild(floatTxt);
    setTimeout(() => floatTxt.remove(), 1000);

    emitSignalsFrom(node, val);
}

function emitSignalsFrom(node, val) {
    if (!hasSimulationStarted) {
        preSimStateStr = getStateString();
        hasSimulationStarted = true;
    }
    edges.filter(e => e.source === node).forEach(edge => {
        const el = document.createElement('div');
        const isPositive = val > 0;
        el.className = `signal ${isPositive ? 'positive' : 'negative'}`;
        el.style.width = `${SIGNAL_SIZE_PX}px`; el.style.height = `${SIGNAL_SIZE_PX}px`;
        el.innerText = isPositive ? '+' : '−';
        
        textContainer.appendChild(el);
        signals.push({ 
            el, edge, val: val, progress: 0, 
            isNegativeEdge: edge.type === 'negative', 
            hasFlipped: false 
        });
    });
}

function deleteNode(node) {
    node.el.remove(); nodes = nodes.filter(n => n !== node);
    edges.filter(e => e.source === node || e.target === node).forEach(deleteEdge);
}
function deleteText(text) { text.el.remove(); texts = texts.filter(t => t !== text); }
function deleteEdge(edge) {
    edge.path.remove();
    if(edge.controlPoint) edge.controlPoint.remove();
    edges = edges.filter(e => e !== edge);
    signals.filter(s => s.edge === edge).forEach(s => { s.el.remove(); signals = signals.filter(sig => sig !== s); });
}
function clearAll(triggerSave=true) {
    nodes.forEach(n => n.el.remove());
    edges.forEach(e => { e.path.remove(); if(e.controlPoint) e.controlPoint.remove(); });
    signals.forEach(s => s.el.remove());
    texts.forEach(t => t.el.remove());
    nodes = []; edges = []; signals = []; texts = [];
    setMode('idle');
    if(triggerSave) saveState();
}

function simulationLoop() {
    if (!isSimulationPaused) {
        for (let i = signals.length - 1; i >= 0; i--) {
            const s = signals[i]; const edge = s.edge; const geo = edge.geometry;
            if(!geo) continue;

            const dist = Math.sqrt(Math.pow(geo.tx - geo.sx, 2) + Math.pow(geo.ty - geo.sy, 2));
            const pathLength = dist * 1.1; 
            const speed = SIGNAL_SPEED * simulationSpeed;
            const progressIncrement = speed / Math.max(pathLength, 1);
            
            s.progress += progressIncrement;

            // 중간 지점에서 부호 반전 (음의 선일 경우)
            if (s.isNegativeEdge && !s.hasFlipped && s.progress >= 0.5) {
                s.val *= -1;
                s.hasFlipped = true;
                const isPos = s.val > 0;
                s.el.className = `signal ${isPos ? 'positive' : 'negative'}`;
                s.el.innerText = isPos ? '+' : '−';
                // 시각적 강조 피드백 (반전될 때 살짝 커짐)
                s.el.style.transform = 'translate(-50%, -50%) scale(1.5)';
                setTimeout(() => { if(s.el) s.el.style.transform = 'translate(-50%, -50%) scale(1)'; }, 200);
            }

            if (s.progress >= 1) {
                triggerSignalArrived(edge.target, s.val > 0 ? 1 : -1);
                s.el.remove(); signals.splice(i, 1);
            } else {
                const t = s.progress; const omt = 1 - t;
                const x = omt*omt*geo.sx + 2*omt*t*edge.pathCurveAmount.cx + t*t*geo.tx;
                const y = omt*omt*geo.sy + 2*omt*t*edge.pathCurveAmount.cy + t*t*geo.ty;
                s.el.style.left = `${x}px`; s.el.style.top = `${y}px`;
            }
        }
    }
    requestAnimationFrame(simulationLoop);
}

function setupSvg() {
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const mPos = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    mPos.setAttribute('id', 'arrow-pos'); mPos.setAttribute('viewBox', '0 0 10 10');
    mPos.setAttribute('refX', '7'); mPos.setAttribute('refY', '5');
    mPos.setAttribute('markerWidth', '5'); mPos.setAttribute('markerHeight', '5');
    mPos.setAttribute('orient', 'auto-start-reverse');
    const p1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p1.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z'); p1.setAttribute('fill', '#4caf50');
    mPos.appendChild(p1);
    
    const mNeg = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    mNeg.setAttribute('id', 'arrow-neg'); mNeg.setAttribute('viewBox', '0 0 10 10');
    mNeg.setAttribute('refX', '7'); mNeg.setAttribute('refY', '5');
    mNeg.setAttribute('markerWidth', '5'); mNeg.setAttribute('markerHeight', '5');
    mNeg.setAttribute('orient', 'auto-start-reverse');
    const p2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p2.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z'); p2.setAttribute('fill', '#f44336');
    mNeg.appendChild(p2);
    
    defs.appendChild(mPos); defs.appendChild(mNeg);
    edgeCanvas.appendChild(defs);
}

setupSvg();
init();
