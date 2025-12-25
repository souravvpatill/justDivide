/**
 * Just Divide - Kid Mode
 * FINAL RESPONSIVE FIX V2
 * - Strict Landscape (Side-by-Side) vs Portrait (Stacked) modes.
 * - Fixed button overlapping.
 * - Fixed queue tile spawning positions.
 * - Zero glitches.
 */

const CONFIG = {
    type: Phaser.AUTO,
    width: 1440,
    height: 1024,
    parent: 'game-container',
    backgroundColor: '#ffe0e5', // Pink BG to hide loading flashes
    scale: {
        mode: Phaser.Scale.RESIZE, // Necessary for full screen
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

const game = new Phaser.Game(CONFIG);

// --- VARIABLES ---
let gridState = Array(16).fill(null);
let tileQueue = [];
let keepSlot = null;
let score = 0;
let level = 1;
let trashCount = 10;
let bestScore = localStorage.getItem('justDivideBest') || 0;
let difficulty = 'MEDIUM';

// Hints
let hintsEnabled = false;
let hintGraphics;

// Undo History
let historyStack = [];

// UI Variables
let scoreText, levelText, trashText, bestText, timerText;
let upcomingGroup;
let isGameOver = false;
let isPaused = false;
let gameTime = 0;
let timerEvent;

// --- UI REFERENCE HOLDERS (For moving elements) ---
let ui = {
    bgImage: null, bgGraphics: null,
    title: null, timer: null,
    btnPauseBg: null, btnPauseTxt: null,
    btnHelpBg: null, btnHelpTxt: null,
    gridSlots: [],
    cat: null, badgeL: null, badgeR: null,
    panelItems: {} // keepZone, lblKeep, trashZone, lblTrash, iconTrash, txtTrash
};

// Layout State Markers
let currentMode = 'LANDSCAPE'; // or 'PORTRAIT'
let layoutAnchors = { gridX:0, gridY:0, panelX:0, panelY:0 };

// --- 1. PRELOAD ASSETS ---
function preload() {
    this.load.setPath('assets/');
    this.load.image('bg_desktop', 'Desktop_JustDivide_Game_2.jpg');
    this.load.image('bg_landscape', 'Landscape_JustDivide_Game_2.png');
    this.load.image('bg_portrait', 'Potraite_JustDivide_Game_2.png'); 
    this.load.image('cat', 'Cat.png');
    this.load.image('badge', 'Levels and Score.png');
    this.load.image('slot', 'Placement_Box.png');
    this.load.image('t_blue', 'blue.png');
    this.load.image('t_orange', 'orange.png');
    this.load.image('t_pink', 'pink.png');
    this.load.image('t_red', 'red.png');
    this.load.image('t_purple', 'purpule.png');
}

// --- 2. CREATE SCENE ---
function create() {
    this.cameras.main.setBackgroundColor('#ffe0e5');

    // Reset
    isGameOver = false; isPaused = false; gameTime = 0;
    historyStack = []; hintsEnabled = false;
    ui.gridSlots = []; ui.panelItems = {};

    // Inputs
    this.input.keyboard.on('keydown-Z', () => performUndo(this));
    this.input.keyboard.on('keydown-R', () => restartGame(this));
    this.input.keyboard.on('keydown-ESC', () => togglePause(this));
    this.input.keyboard.on('keydown-G', () => toggleHints(this)); 
    this.input.keyboard.on('keydown-1', () => setDifficulty(this, 'EASY'));
    this.input.keyboard.on('keydown-2', () => setDifficulty(this, 'MEDIUM'));
    this.input.keyboard.on('keydown-3', () => setDifficulty(this, 'HARD'));

    // --- INITIALIZE UI ELEMENTS (At 0,0, moved later by layout engine) ---
    
    // Layer 0: BG Image
    ui.bgImage = this.add.image(0, 0, 'bg_desktop').setOrigin(0.5).setDepth(0);
    
    // Layer 1: BG Graphics (Orange/Teal boxes)
    ui.bgGraphics = this.add.graphics().setDepth(1);

    // Layer 2: Text & Buttons
    ui.title = this.add.text(0, 0, 'JUST DIVIDE', { fontFamily: 'Arial', fontSize: '56px', color: '#2c3e50', fontStyle: 'bold' }).setOrigin(0.5).setDepth(2);
    ui.timer = this.add.text(0, 0, '⌛ 00:00', { fontFamily: 'Arial', fontSize: '32px', color: '#000', fontStyle: 'bold' }).setOrigin(0.5).setDepth(2);

    ui.btnPauseBg = this.add.circle(0,0, 35, 0x9b59b6).setDepth(50).setInteractive();
    ui.btnPauseTxt = this.add.text(0,0, 'II', { fontSize: '30px', fontFamily: 'Arial Black', color: '#fff' }).setOrigin(0.5).setDepth(51);
    ui.btnPauseBg.on('pointerdown', () => togglePause(this));

    ui.btnHelpBg = this.add.circle(0,0, 35, 0x2ecc71).setDepth(50).setInteractive();
    ui.btnHelpTxt = this.add.text(0,0, '?', { fontSize: '40px', fontFamily: 'Arial Black', color: '#fff' }).setOrigin(0.5).setDepth(51);
    ui.btnHelpBg.on('pointerdown', () => showHelp(this));

    // Layer 3: Grid Slots
    for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
            let slot = this.add.image(0, 0, 'slot').setDisplaySize(140, 140).setDepth(3).setInteractive();
            slot.input.dropZone = true;
            slot.setData({ r: r, c: c });
            ui.gridSlots.push(slot);
        }
    }

    // Layer 4: Hints
    hintGraphics = this.add.graphics().setDepth(4);

    // Layer 10+: Decorations & Panel Items
    ui.badgeL = this.add.image(0, 0, 'badge').setDepth(10);
    levelText = this.add.text(0, 0, 'LEVEL ' + level, { fontSize: '32px', fontFamily: 'Arial Black', color: '#fff' }).setOrigin(0.5).setDepth(11);
    ui.badgeR = this.add.image(0, 0, 'badge').setDepth(10);
    scoreText = this.add.text(0, 0, 'SCORE ' + score, { fontSize: '28px', fontFamily: 'Arial Black', color: '#fff' }).setOrigin(0.5).setDepth(11);
    bestText = this.add.text(0, 0, 'BEST: ' + bestScore, { fontSize: '16px', fontFamily: 'Arial', color: '#fff' }).setOrigin(0.5).setDepth(11);
    ui.cat = this.add.image(0, 0, 'cat').setOrigin(0.5, 1).setDepth(20);

    // Panel items
    ui.panelItems.lblKeep = this.add.text(0, 0, 'KEEP', { fontSize: '32px', fontFamily: 'Arial Black', color: '#fff' }).setOrigin(0.5).setDepth(3);
    ui.panelItems.keepZone = this.add.image(0, 0, 'slot').setTint(0x2ecc71).setInteractive().setDepth(3).setDisplaySize(130, 130);
    ui.panelItems.keepZone.name = 'keepZone'; ui.panelItems.keepZone.input.dropZone = true;
    
    ui.panelItems.lblTrash = this.add.text(0, 0, 'TRASH', { fontSize: '32px', fontFamily: 'Arial Black', color: '#c0392b' }).setOrigin(0.5).setDepth(3);
    ui.panelItems.trashZone = this.add.rectangle(0, 0, 120, 120, 0xe74c3c).setInteractive().setDepth(3);
    ui.panelItems.trashZone.name = 'trashZone'; ui.panelItems.trashZone.input.dropZone = true;
    ui.panelItems.iconTrash = this.add.text(0, 0, '🗑️', { fontSize: '60px' }).setOrigin(0.5).setDepth(4);
    ui.panelItems.txtTrashCount = this.add.text(0, 0, 'x' + trashCount, { fontSize: '28px', fontFamily: 'Arial Black', color: '#fff' }).setOrigin(0.5).setDepth(3);

    // Timer Start
    if (timerEvent) timerEvent.remove();
    timerEvent = this.time.addEvent({ delay: 1000, callback: onTimerTick, callbackScope: this, loop: true });

    // Initialize Game State
    if (tileQueue.length === 0) initQueue(this);

    // --- ACTIVATE LAYOUT ENGINE ---
    this.scale.on('resize', (gameSize) => applyLayout(this, gameSize.width, gameSize.height));
    applyLayout(this, this.scale.width, this.scale.height); // Initial Call

    // Drag Events
    setupDragEvents(this);
}

function update() {}

//=============================================================================
// --- THE LAYOUT ENGINE (FIXED) ---
//=============================================================================

function applyLayout(scene, width, height) {
    const isPortrait = height > width;
    currentMode = isPortrait ? 'PORTRAIT' : 'LANDSCAPE';

    // 1. Define Reference Dimensions & Anchors based on Mode
    let refWidth, refHeight, zoom;
    let gridCX, gridCY, panelCX, panelCY;

    if (isPortrait) {
        // Portrait Mode (Targetting ~800px wide content stacked vertically)
        refWidth = 800;
        zoom = width / refWidth;
        refHeight = height / zoom;
        
        // Anchors (Center points for Grid group and Panel group)
        gridCX = refWidth / 2;
        gridCY = 400; // Top half
        panelCX = refWidth / 2;
        panelCY = 1050; // Bottom half (stacked below grid)
        
        // Camera centers vertically on the total content height
        scene.cameras.main.centerOn(refWidth / 2, refHeight / 2);

    } else {
        // Landscape Mode (Targetting Original 1440x1024 layout)
        refWidth = 1440;
        refHeight = 1024;
        zoom = Math.min(width / refWidth, height / refHeight);
        
        // Original Anchors from CONFIG
        gridCX = 550;
        gridCY = 650;
        panelCX = 1180;
        panelCY = 600;

        // Camera centers on fixed world center
        scene.cameras.main.centerOn(720, 512);
    }

    scene.cameras.main.setZoom(zoom);
    // Update global anchors for other functions to use
    layoutAnchors = { gridX: gridCX, gridY: gridCY, panelX: panelCX, panelY: panelCY };

    // 2. Background & Buttons
    let bgTex = isPortrait ? 'bg_portrait' : (width/height > 1.4 ? 'bg_landscape' : 'bg_desktop');
    if(scene.textures.exists(bgTex)) ui.bgImage.setTexture(bgTex);
    ui.bgImage.setPosition(scene.cameras.main.centerX, scene.cameras.main.centerY);
    ui.bgImage.setDisplaySize(width/zoom, height/zoom);

    // Place buttons in top corners of reference area (avoid overlaps)
    const btnMargin = 60;
    const topY = isPortrait ? (refHeight/2) - 550 : 60; // Adjust top Y for portrait scrolling
    
    ui.btnPauseBg.setPosition(btnMargin, topY);
    ui.btnPauseTxt.setPosition(btnMargin, topY);
    ui.btnHelpBg.setPosition(refWidth - btnMargin, topY);
    ui.btnHelpTxt.setPosition(refWidth - btnMargin, topY);

    ui.title.setPosition(refWidth/2, topY + 10);
    ui.title.setFontSize(isPortrait ? '70px' : '56px');
    ui.timer.setPosition(refWidth/2, topY + 70);

    // 3. Position GRID Elements relative to gridCX, gridCY
    const TILE_GAP = 155;
    const gridStartX = gridCX - (1.5 * TILE_GAP);
    const gridStartY = gridCY - (1.5 * TILE_GAP);

    // Move empty slots
    ui.gridSlots.forEach(slot => {
        slot.setPosition(gridStartX + slot.getData('c')*TILE_GAP, gridStartY + slot.getData('r')*TILE_GAP);
    });
    // Move active grid tiles
    for(let i=0; i<16; i++) {
        let t = scene.children.getByName('gridTile_' + i);
        if(t) t.setPosition(gridStartX + (i%4)*TILE_GAP, gridStartY + Math.floor(i/4)*TILE_GAP);
    }

    // Move Grid Decorations
    const badgeY = gridCY - 390;
    ui.badgeL.setPosition(gridCX - 180, badgeY + 75);
    levelText.setPosition(gridCX - 180, badgeY + 75);
    ui.badgeR.setPosition(gridCX + 180, badgeY + 75);
    scoreText.setPosition(gridCX + 180, badgeY + 65);
    bestText.setPosition(gridCX + 180, badgeY + 100);
    ui.cat.setPosition(gridCX, badgeY + 50);

    // 4. Position PANEL Elements relative to panelCX, panelCY
    const p = ui.panelItems;
    
    // Redraw Background Graphics based on new positions
    ui.bgGraphics.clear();
    // Grid BG box
    ui.bgGraphics.fillStyle(0x008080, 1);
    ui.bgGraphics.fillRoundedRect(gridCX - 330, gridCY - 330, 660, 660, 25);
    ui.bgGraphics.lineStyle(8, 0xffffff);
    ui.bgGraphics.strokeRoundedRect(gridCX - 330, gridCY - 330, 660, 660, 25);

    // Panel BG box (Orange)
    let panelBgYOffset = isPortrait ? -350 : -320; // Slight adjustment for portrait stacking
    ui.bgGraphics.fillStyle(0xf39c12, 1);
    ui.bgGraphics.fillRoundedRect(panelCX - 110, panelCY + panelBgYOffset, 220, 650, 30);
    ui.bgGraphics.lineStyle(6, 0xd35400);
    ui.bgGraphics.strokeRoundedRect(panelCX - 110, panelCY + panelBgYOffset, 220, 650, 30);

    // Queue BG box (White)
    let queueYOffset = isPortrait ? -50 : -40;
    ui.bgGraphics.fillStyle(0xffffff, 1);
    ui.bgGraphics.fillRoundedRect(panelCX - 90, panelCY + queueYOffset, 180, 130, 15);
    ui.bgGraphics.lineStyle(4, 0xbdc3c7);
    ui.bgGraphics.strokeRoundedRect(panelCX - 90, panelCY + queueYOffset, 180, 130, 15);

    // Move Panel UI Items (Fixed offsets relative to panel center)
    p.lblKeep.setPosition(panelCX, panelCY - 270);
    p.keepZone.setPosition(panelCX, panelCY - 180);
    let kTile = scene.children.getByName('keepTile');
    if (kTile) kTile.setPosition(panelCX, panelCY - 180);

    p.lblTrash.setPosition(panelCX, panelCY + 160);
    p.trashZone.setPosition(panelCX, panelCY + 240);
    p.iconTrash.setPosition(panelCX, panelCY + 240);
    p.txtTrashCount.setPosition(panelCX, panelCY + 320);

    // 5. Rerender Queue immediately to fix spawn positions
    renderQueue(scene);

    // Redraw hints if active
    if (hintsEnabled && tileQueue.length > 0) drawHints(scene, tileQueue[0]);
}
//=============================================================================

function setupDragEvents(scene) {
    scene.input.on('dragstart', (pointer, obj) => {
        if (isGameOver || isPaused || !obj.getData('draggable')) return;
        scene.children.bringToTop(obj); obj.setDepth(30);
        obj.setData('originX', obj.x); obj.setData('originY', obj.y);
        if (hintsEnabled) drawHints(scene, obj.getData('value'));
    });
    scene.input.on('drag', (pointer, obj, dragX, dragY) => {
        if (isGameOver || isPaused || !obj.getData('draggable')) return;
        obj.x = dragX; obj.y = dragY;
    });
    scene.input.on('drop', (pointer, obj, dropZone) => {
        if (isGameOver || isPaused) return;
        saveState();
        if (dropZone.name === 'keepZone') handleKeep(obj, scene);
        else if (dropZone.name === 'trashZone') handleTrash(obj, scene);
        else if (dropZone.texture.key === 'slot') {
            let idx = dropZone.getData('r') * 4 + dropZone.getData('c');
            if (gridState[idx] === null) placeTile(obj, idx, scene);
            else { historyStack.pop(); returnToOrigin(obj); }
        } else { historyStack.pop(); returnToOrigin(obj); }
    });
    scene.input.on('dragend', (pointer, obj, dropped) => {
        if (!dropped) returnToOrigin(obj);
        if (hintsEnabled && tileQueue.length > 0) drawHints(scene, tileQueue[0]);
    });
}

// --- GAME LOGIC ---

function returnToOrigin(obj) {
    obj.x = obj.getData('originX');
    obj.y = obj.getData('originY');
    obj.setDepth(5);
}

function initQueue(scene) {
    tileQueue = [];
    for(let i=0; i<3; i++) tileQueue.push(genNumber());
    renderQueue(scene);
}

function getTexture(val) {
    if (val <= 4) return 't_blue'; if (val <= 8) return 't_orange';
    if (val <= 19) return 't_pink'; if (val <= 29) return 't_red'; return 't_purple';
}

function createTile(scene, x, y, val) {
    let container = scene.add.container(x, y);
    let bg = scene.add.image(0, 0, getTexture(val)).setDisplaySize(130, 130);
    let txt = scene.add.text(0, 0, val, { fontFamily: 'Arial Black', fontSize: '52px', color: '#fff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
    container.add([bg, txt]); container.setSize(130, 130);
    container.setData('value', val); container.setDepth(5); 
    return container;
}

function renderQueue(scene) {
    if (upcomingGroup) upcomingGroup.destroy(true);
    upcomingGroup = scene.add.group();
    if (isGameOver) return;
    
    // Use current panel anchor from layout engine
    const qX = layoutAnchors.panelX;
    const qY = layoutAnchors.panelY + (currentMode === 'PORTRAIT' ? 15 : 25); 
    
    // Active Tile
    let topTile = createTile(scene, qX - 55, qY, tileQueue[0]); 
    topTile.setInteractive(); scene.input.setDraggable(topTile);
    topTile.setData('draggable', true); topTile.setData('isFromQueue', true);
    topTile.setScale(0.85); upcomingGroup.add(topTile);

    // Preview Tile
    if (tileQueue[1]) {
        let t2 = createTile(scene, qX + 55, qY, tileQueue[1]);
        t2.setScale(0.65); 
        t2.each(child => { if (child.type === 'Image') child.setTint(0x888888); });
        upcomingGroup.add(t2);
    }
    if (hintsEnabled) drawHints(scene, tileQueue[0]);
}

function placeTile(obj, idx, scene) {
    let val = obj.getData('value');
    gridState[idx] = val; obj.destroy();
    checkMerges(idx);
    if (obj.getData('isFromQueue')) { tileQueue.shift(); tileQueue.push(genNumber()); renderQueue(scene); }
    else if (hintsEnabled && tileQueue.length > 0) drawHints(scene, tileQueue[0]);
    redrawGridTiles(scene); checkGameOver(scene);
}

function checkMerges(idx) {
    let current = gridState[idx]; if (!current) return;
    let neighbors = getNeighbors(idx);
    for (let n of neighbors) {
        if (gridState[n.i]) {
            let neighbor = gridState[n.i]; let merged = false; let result = null;
            if (current === neighbor) {
                gridState[idx] = null; gridState[n.i] = null; merged = true; score += current * 2;
            } else if (current % neighbor === 0 || neighbor % current === 0) {
                result = current > neighbor ? current/neighbor : neighbor/current;
                gridState[idx] = null; gridState[n.i] = null;
                gridState[current > neighbor ? idx : n.i] = result === 1 ? null : result;
                merged = true; score += current > neighbor ? current : neighbor;
            }
            if (merged) { updateUI(); break; }
        }
    }
}

function redrawGridTiles(scene) {
    scene.children.getAll().forEach(c => { if (c.name && c.name.startsWith('gridTile_')) c.destroy(); });
    if(ui.gridSlots.length === 0) return;
    const startX = ui.gridSlots[0].x; const startY = ui.gridSlots[0].y; const gap = 155;
    for (let i = 0; i < 16; i++) {
        if (gridState[i] !== null) {
            let t = createTile(scene, startX + (i%4)*gap, startY + Math.floor(i/4)*gap, gridState[i]);
            t.name = 'gridTile_' + i;
        }
    }
}

function handleKeep(obj, scene) {
    let val = obj.getData('value');
    if (keepSlot === null) {
        keepSlot = val; obj.destroy();
        if (obj.getData('isFromQueue')) { tileQueue.shift(); tileQueue.push(genNumber()); }
    } else {
        let temp = keepSlot; keepSlot = val; obj.destroy();
        if (obj.getData('isFromQueue')) tileQueue[0] = temp;
    }
    let old = scene.children.getByName('keepTile'); if (old) old.destroy();
    let k = createTile(scene, ui.panelItems.keepZone.x, ui.panelItems.keepZone.y, keepSlot);
    k.name = 'keepTile'; k.setScale(0.8);
    renderQueue(scene); checkGameOver(scene);
}

function handleTrash(obj, scene) {
    if (trashCount > 0) {
        trashCount--; obj.destroy();
        if (obj.getData('isFromQueue')) { tileQueue.shift(); tileQueue.push(genNumber()); renderQueue(scene); }
        else if (hintsEnabled && tileQueue.length > 0) drawHints(scene, tileQueue[0]);
        updateUI(); checkGameOver(scene);
    } else returnToOrigin(obj);
}

// --- HELPERS & SYSTEMS ---

function updateUI() {
    scoreText.setText('SCORE ' + score); ui.panelItems.txtTrashCount.setText('x' + trashCount);
    if (score > level * 50) { level++; trashCount += 2; levelText.setText('LEVEL ' + level); }
    if (score > bestScore) { bestScore = score; localStorage.setItem('justDivideBest', bestScore); bestText.setText('BEST: ' + bestScore); }
}

function getNeighbors(idx) {
    let r = Math.floor(idx/4), c = idx%4;
    return [{i:(r-1)*4+c,v:r>0},{i:(r+1)*4+c,v:r<3},{i:r*4+(c-1),v:c>0},{i:r*4+(c+1),v:c<3}].filter(n=>n.v);
}

function drawHints(scene, activeVal) {
    hintGraphics.clear(); if (!activeVal || isGameOver || ui.gridSlots.length==0) return;
    const startX = ui.gridSlots[0].x; const startY = ui.gridSlots[0].y; const gap = 155;
    hintGraphics.lineStyle(6, 0xf1c40f, 0.8);
    for (let i = 0; i < 16; i++) {
        if (gridState[i] === null) {
            let isMatch = getNeighbors(i).some(n => gridState[n.i] && (activeVal === gridState[n.i] || activeVal % gridState[n.i] === 0 || gridState[n.i] % activeVal === 0));
            if (isMatch) hintGraphics.strokeRoundedRect(startX + (i%4)*gap - 65, startY + Math.floor(i/4)*gap - 65, 130, 130, 20);
        }
    }
}

function saveState() {
    historyStack.push(JSON.stringify({grid:[...gridState],queue:[...tileQueue],keep:keepSlot,score:score,level:level,trash:trashCount}));
    if (historyStack.length > 20) historyStack.shift();
}

function performUndo(scene) {
    if (isGameOver || isPaused || historyStack.length === 0) return;
    let state = JSON.parse(historyStack.pop());
    gridState = state.grid; tileQueue = state.queue; keepSlot = state.keep;
    score = state.score; level = state.level; trashCount = state.trash;
    redrawGridTiles(scene); renderQueue(scene); updateUI();
    let oldK = scene.children.getByName('keepTile'); if (oldK) oldK.destroy();
    if (keepSlot !== null) {
        let k = createTile(scene, ui.panelItems.keepZone.x, ui.panelItems.keepZone.y, keepSlot);
        k.name = 'keepTile'; k.setScale(0.8);
    }
    showToast(scene, "UNDO!"); if (hintsEnabled) drawHints(scene, tileQueue[0]);
}

function setDifficulty(scene, l) { difficulty = l; showToast(scene, "DIFFICULTY: " + l); }
function genNumber() {
    let opts = difficulty === 'EASY' ? [2,3,4,5,6,8,10] : (difficulty === 'HARD' ? [2,3,4,5,6,8,9,10,12,15,20,24,30,32,35,40,45,48,50,60,64,72,80,100] : [2,3,4,5,6,8,9,10,12,15,20,24,30,32,35,40]);
    return opts[Math.floor(Math.random() * opts.length)];
}
function restartGame(scene) { scene.scene.restart(); }
function checkGameOver(scene) { if (!gridState.includes(null)) triggerGameOver(scene); }

// --- MODALS & TOASTS ---
function showToast(scene, msg) {
    let t = scene.add.text(scene.cameras.main.centerX, scene.cameras.main.centerY, msg, { fontSize: '40px', fontFamily: 'Arial Black', color: '#fff', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(200);
    scene.tweens.add({ targets: t, y: t.y - 100, alpha: 0, duration: 1000, onComplete: () => t.destroy() });
}

function togglePause(scene) {
    if (isGameOver) return;
    let cx = scene.cameras.main.centerX, cy = scene.cameras.main.centerY;
    if (!isPaused) {
        isPaused = true;
        scene.add.rectangle(cx, cy, 3000, 3000, 0x000000, 0.7).setDepth(200).name='pBg';
        scene.add.text(cx, cy-100, 'PAUSED', { fontSize:'80px', fontFamily:'Arial Black', color:'#fff', stroke:'#000', strokeThickness:6 }).setOrigin(0.5).setDepth(201).name='pTxt';
        let rb = scene.add.rectangle(cx, cy+50, 300, 100, 0xf39c12).setInteractive().setDepth(201); rb.name='pResBtn'; rb.on('pointerdown',()=>togglePause(scene));
        scene.add.text(cx, cy+50, 'RESUME', { fontSize:'40px', fontFamily:'Arial Black' }).setOrigin(0.5).setDepth(202).name='pResTxt';
    } else { isPaused = false; ['pBg','pTxt','pResBtn','pResTxt'].forEach(n=>scene.children.getByName(n)?.destroy()); }
}

function showHelp(scene) {
    if (isPaused || isGameOver) return; isPaused = true;
    let cx = scene.cameras.main.centerX, cy = scene.cameras.main.centerY;
    scene.add.rectangle(cx, cy, 3000, 3000, 0x000000, 0.8).setDepth(300).name='hBg';
    scene.add.rectangle(cx, cy, 800, 650, 0xffffff).setDepth(301).name='hBox';
    scene.add.text(cx, cy-250, 'HOW TO PLAY', { fontSize:'50px', color:'#000', fontStyle:'bold' }).setOrigin(0.5).setDepth(302).name='hTitle';
    scene.add.text(cx, cy, "1. Drag tiles onto grid.\n2. MERGE matching #s (Score x2).\n3. DIVIDE #s (e.g. 20÷4=5).\n4. Use KEEP to save.\n5. Use TRASH to discard.\n\nSHORTCUTS: G=Hint, Z=Undo, R=Restart", { fontSize:'28px', color:'#333', align:'center' }).setOrigin(0.5).setDepth(302).name='hBody';
    let cb = scene.add.rectangle(cx, cy+270, 200, 80, 0xe74c3c).setInteractive().setDepth(302); cb.name='hBtn';
    cb.on('pointerdown', ()=>{ isPaused=false; ['hBg','hBox','hTitle','hBody','hBtn','hTxt'].forEach(n=>scene.children.getByName(n)?.destroy()); });
    scene.add.text(cx, cy+270, 'GOT IT', { fontSize:'30px', fontFamily:'Arial Black' }).setOrigin(0.5).setDepth(303).name='hTxt';
}

function triggerGameOver(scene) {
    isGameOver = true; let cx = scene.cameras.main.centerX, cy = scene.cameras.main.centerY;
    scene.add.rectangle(cx, cy, 3000, 3000, 0x000000, 0.7).setDepth(100).setInteractive();
    scene.add.text(cx, cy-50, 'GAME OVER', { fontSize:'80px', fontFamily:'Arial Black', color:'#e74c3c', stroke:'#fff', strokeThickness:6 }).setOrigin(0.5).setDepth(101);
    scene.add.text(cx, cy+50, 'Final Score: ' + score, { fontSize:'40px', color:'#fff' }).setOrigin(0.5).setDepth(101);
    scene.add.rectangle(cx, cy+180, 300, 100, 0x2ecc71).setInteractive().setDepth(101).on('pointerdown',()=>restartGame(scene));
    scene.add.text(cx, cy+180, 'RESTART', { fontSize:'40px', fontFamily:'Arial Black' }).setOrigin(0.5).setDepth(102);
}