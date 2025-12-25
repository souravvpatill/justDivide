/**
 * Just Divide - Kid Mode
 * HINT SYSTEM EDITION
 * - 'G' to Toggle Hints
 * - Highlights empty spots where merges are possible
 * - Fixed Grid Layout
 */

const CONFIG = {
    type: Phaser.AUTO,
    width: 1440,
    height: 1024,
    parent: 'game-container',
    backgroundColor: '#ffe0e5',
    scale: {
        // CHANGED: Use RESIZE to fill the whole window (removes black bars)
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

const game = new Phaser.Game(CONFIG);

// --- LAYOUT CONFIGURATION ---
const LAYOUT = {
    DRAW_SHAPES: true, 
    GRID_X: 550, 
    GRID_Y: 650, 
    PANEL_X: 1180,
    PANEL_Y: 600,
    TILE_SIZE: 130,
    TILE_GAP: 155, 
};

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

// --- 1. PRELOAD ASSETS ---
function preload() {
    this.load.setPath('assets/');
    
    // CHANGED: Load all 3 background variations
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
    // Reset Variables
    isGameOver = false;
    isPaused = false;
    gameTime = 0;
    historyStack = [];
    hintsEnabled = false;

    // --- KEYBOARD INPUTS ---
    this.input.keyboard.on('keydown-Z', () => performUndo(this));
    this.input.keyboard.on('keydown-R', () => restartGame(this));
    this.input.keyboard.on('keydown-ESC', () => togglePause(this));
    this.input.keyboard.on('keydown-G', () => toggleHints(this)); 
    
    // Difficulty
    this.input.keyboard.on('keydown-ONE', () => setDifficulty(this, 'EASY'));
    this.input.keyboard.on('keydown-TWO', () => setDifficulty(this, 'MEDIUM'));
    this.input.keyboard.on('keydown-THREE', () => setDifficulty(this, 'HARD'));

    // --- LAYERS ---
    
    // A. Background (Responsive Logic)
    // We create a background image variable attached to the scene
    this.bg = this.add.image(0, 0, 'bg_desktop');
    this.bg.setOrigin(0, 0);
    this.bg.setDepth(0);
    this.bg.setScrollFactor(0); // Ensure background doesn't move if camera moves

    // Add a resize listener
    this.scale.on('resize', (gameSize) => {
        handleResponsiveResize(this, gameSize.width, gameSize.height);
    });

    // Call it immediately to set initial state
    handleResponsiveResize(this, this.scale.width, this.scale.height);

    this.add.text(720, 50, 'JUST DIVIDE', {
        fontFamily: 'Arial', fontSize: '56px', color: '#2c3e50', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(1);

    // B. Timer
    timerText = this.add.text(720, 110, '⌛ 00:00', {
        fontFamily: 'Arial', fontSize: '32px', color: '#000', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(1);

    if (timerEvent) timerEvent.remove();
    timerEvent = this.time.addEvent({ delay: 1000, callback: onTimerTick, callbackScope: this, loop: true });

    // C. Shapes
    if (LAYOUT.DRAW_SHAPES) {
        let g = this.add.graphics();
        g.setDepth(1);
        
        // Grid Box
        g.fillStyle(0x008080, 1);
        g.fillRoundedRect(LAYOUT.GRID_X - 330, LAYOUT.GRID_Y - 330, 660, 660, 25);
        g.lineStyle(8, 0xffffff);
        g.strokeRoundedRect(LAYOUT.GRID_X - 330, LAYOUT.GRID_Y - 330, 660, 660, 25);

        // Panel
        g.fillStyle(0xf39c12, 1);
        g.fillRoundedRect(LAYOUT.PANEL_X - 110, 280, 220, 650, 30);
        g.lineStyle(6, 0xd35400);
        g.strokeRoundedRect(LAYOUT.PANEL_X - 110, 280, 220, 650, 30);

        // Queue
        g.fillStyle(0xffffff, 1);
        g.fillRoundedRect(LAYOUT.PANEL_X - 90, 560, 180, 130, 15);
        g.lineStyle(4, 0xbdc3c7);
        g.strokeRoundedRect(LAYOUT.PANEL_X - 90, 560, 180, 130, 15);
    }

    // D. Grid Slots (Depth 3)
    const startX = LAYOUT.GRID_X - (1.5 * LAYOUT.TILE_GAP);
    const startY = LAYOUT.GRID_Y - (1.5 * LAYOUT.TILE_GAP);

    for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
            let x = startX + c * LAYOUT.TILE_GAP;
            let y = startY + r * LAYOUT.TILE_GAP;
            let slot = this.add.image(x, y, 'slot').setDisplaySize(140, 140).setDepth(3).setInteractive();
            slot.input.dropZone = true;
            slot.setData({ r: r, c: c });
        }
    }

    // E. Hint Graphics Layer (Depth 4 - Above slots, below tiles)
    hintGraphics = this.add.graphics();
    hintGraphics.setDepth(4);

    // F. Decorations (Cat & Badges)
    const badgeY = LAYOUT.GRID_Y - 390;
    this.add.image(LAYOUT.GRID_X - 180, badgeY + 75, 'badge').setDepth(10);
    levelText = this.add.text(LAYOUT.GRID_X - 180, badgeY + 75, 'LEVEL ' + level, {
        fontSize: '32px', fontFamily: 'Arial Black', color: '#fff'
    }).setOrigin(0.5).setDepth(11);

    this.add.image(LAYOUT.GRID_X + 180, badgeY + 75, 'badge').setDepth(10);
    scoreText = this.add.text(LAYOUT.GRID_X + 180, badgeY + 65, 'SCORE ' + score, {
        fontSize: '28px', fontFamily: 'Arial Black', color: '#fff'
    }).setOrigin(0.5).setDepth(11);

    bestText = this.add.text(LAYOUT.GRID_X + 180, badgeY + 100, 'BEST: ' + bestScore, {
        fontSize: '16px', fontFamily: 'Arial', color: '#fff'
    }).setOrigin(0.5).setDepth(11);

    this.add.image(LAYOUT.GRID_X, badgeY + 50, 'cat').setOrigin(0.5, 1).setDepth(20);

    // G. Right Panel UI
    this.add.text(LAYOUT.PANEL_X, 330, 'KEEP', { fontSize: '32px', fontFamily: 'Arial Black', color: '#fff' }).setOrigin(0.5).setDepth(3);
    let keepZone = this.add.image(LAYOUT.PANEL_X, 420, 'slot').setTint(0x2ecc71).setInteractive();
    keepZone.name = 'keepZone';
    keepZone.setDisplaySize(130, 130);
    keepZone.input.dropZone = true;
    keepZone.setDepth(3);

    this.add.text(LAYOUT.PANEL_X, 760, 'TRASH', { fontSize: '32px', fontFamily: 'Arial Black', color: '#c0392b' }).setOrigin(0.5).setDepth(3);
    let trashZone = this.add.rectangle(LAYOUT.PANEL_X, 840, 120, 120, 0xe74c3c).setInteractive();
    trashZone.name = 'trashZone';
    trashZone.input.dropZone = true;
    trashZone.setDepth(3);
    this.add.text(LAYOUT.PANEL_X, 840, '🗑️', { fontSize: '60px' }).setOrigin(0.5).setDepth(4);

    trashText = this.add.text(LAYOUT.PANEL_X, 920, 'x' + trashCount, { fontSize: '28px', fontFamily: 'Arial Black', color: '#fff' }).setOrigin(0.5).setDepth(3);

    // H. Controls
    createGameControls(this);

    // Start
    if (tileQueue.length === 0) initQueue(this);
    else renderQueue(this);

    // I. Drag Events
    this.input.on('dragstart', (pointer, obj) => {
        if (isGameOver || isPaused || !obj.getData('draggable')) return;
        this.children.bringToTop(obj);
        obj.setDepth(30);
        obj.setData('originX', obj.x);
        obj.setData('originY', obj.y);
        
        // Update hints for the specific tile being dragged (Keep or Queue)
        if (hintsEnabled) drawHints(this, obj.getData('value'));
    });

    this.input.on('drag', (pointer, obj, dragX, dragY) => {
        if (isGameOver || isPaused || !obj.getData('draggable')) return;
        obj.x = dragX;
        obj.y = dragY;
    });

    this.input.on('drop', (pointer, obj, dropZone) => {
        if (isGameOver || isPaused) return;

        saveState();

        if (dropZone.texture && dropZone.texture.key === 'slot' && dropZone.name !== 'keepZone') {
            let r = dropZone.getData('r');
            let c = dropZone.getData('c');
            let idx = r * 4 + c;
        
            if (gridState[idx] === null) placeTile(obj, idx, this);
            else {
                historyStack.pop(); 
                returnToOrigin(obj);
            }
        } 
        else if (dropZone.name === 'keepZone') handleKeep(obj, this);
        else if (dropZone.name === 'trashZone') handleTrash(obj, this);
        else {
            historyStack.pop(); 
            returnToOrigin(obj);
        }
    });

    this.input.on('dragend', (pointer, obj, dropped) => {
        if (!dropped) returnToOrigin(obj);
        // Reset hints to default queue tile
        if (hintsEnabled && tileQueue.length > 0) drawHints(this, tileQueue[0]);
    });
}

function update() {}

// --- RESPONSIVE HANDLER ---
function handleResponsiveResize(scene, width, height) {
    // --- 1. Background Logic ---
    // Determine orientation
    const isPortrait = height > width;
    
    // Select the correct image based on screen ratio
    if (isPortrait) {
        scene.bg.setTexture('bg_portrait');
    } else {
        // If width is much larger than height (Mobile Landscape), use Landscape
        // Otherwise use Desktop
        if (width / height > 1.4) {
             scene.bg.setTexture('bg_landscape');
        } else {
             scene.bg.setTexture('bg_desktop');
        }
    }

    // Force the background to match the screen size exactly (Stretch)
    scene.bg.setDisplaySize(width, height);

    // --- 2. Game Content Logic (Camera Zoom) ---
    // Your game is designed for 1440 x 1024
    const safeWidth = 1440;
    const safeHeight = 1024;

    // Calculate how much to zoom to fit the game in the current screen
    const zoomX = width / safeWidth;
    const zoomY = height / safeHeight;
    
    // Choose the smaller zoom to ensure ALL game content is visible (Fit)
    const zoom = Math.min(zoomX, zoomY);

    // Apply zoom to the main camera
    scene.cameras.main.setZoom(zoom);
    
    // Center the camera on your game's center point (720, 512)
    scene.cameras.main.centerOn(720, 512);

    // Re-adjust background position because of camera centering
    // We calculate the top-left corner relative to the camera
    scene.bg.x = 720 - (width / 2) / zoom;
    scene.bg.y = 512 - (height / 2) / zoom;
    
    // Since we are zooming, we need to counter-scale the background 
    // so it looks like it fills the screen regardless of zoom
    scene.bg.setScale(
        (width / scene.bg.width) / zoom, 
        (height / scene.bg.height) / zoom
    );
}

// --- HINT SYSTEM ---

function toggleHints(scene) {
    hintsEnabled = !hintsEnabled;
    showToast(scene, hintsEnabled ? "HINTS: ON" : "HINTS: OFF");
    
    if (hintsEnabled) {
        // Draw hints for the active tile
        let val = tileQueue.length > 0 ? tileQueue[0] : null;
        if(val) drawHints(scene, val);
    } else {
        hintGraphics.clear();
    }
}

function drawHints(scene, activeVal) {
    hintGraphics.clear();
    if (!activeVal || isGameOver) return;

    const startX = LAYOUT.GRID_X - (1.5 * LAYOUT.TILE_GAP);
    const startY = LAYOUT.GRID_Y - (1.5 * LAYOUT.TILE_GAP);

    // Style: Gold Glow
    hintGraphics.lineStyle(6, 0xf1c40f, 0.8);

    for (let i = 0; i < 16; i++) {
        // Only check empty cells
        if (gridState[i] === null) {
            let neighbors = getNeighbors(i);
            let isMatch = false;

            // Check if placing 'activeVal' here creates a merge
            for (let n of neighbors) {
                if (gridState[n.i] !== null) {
                    let neighborVal = gridState[n.i];
                    
                    // Logic: Equal OR Divisible OR Reverse Divisible
                    if (activeVal === neighborVal || 
                        activeVal % neighborVal === 0 || 
                        neighborVal % activeVal === 0) {
                        isMatch = true;
                        break;
                    }
                }
            }

            // Draw highlight if match found
            if (isMatch) {
                let r = Math.floor(i / 4);
                let c = i % 4;
                let x = startX + c * LAYOUT.TILE_GAP;
                let y = startY + r * LAYOUT.TILE_GAP;
                
                // Draw rounded rect around slot
                hintGraphics.strokeRoundedRect(x - 65, y - 65, 130, 130, 20);
            }
        }
    }
}

function getNeighbors(idx) {
    let r = Math.floor(idx / 4);
    let c = idx % 4;
    return [
        { i: (r-1)*4 + c, valid: r > 0 }, 
        { i: (r+1)*4 + c, valid: r < 3 }, 
        { i: r*4 + (c-1), valid: c > 0 }, 
        { i: r*4 + (c+1), valid: c < 3 }  
    ].filter(n => n.valid);
}

// --- UNDO SYSTEM ---

function saveState() {
    const state = {
        grid: [...gridState],
        queue: [...tileQueue],
        keep: keepSlot,
        score: score,
        level: level,
        trash: trashCount
    };
    historyStack.push(JSON.stringify(state));
    if (historyStack.length > 20) historyStack.shift();
}

function performUndo(scene) {
    if (isGameOver || isPaused || historyStack.length === 0) return;

    const json = historyStack.pop();
    const state = JSON.parse(json);

    gridState = state.grid;
    tileQueue = state.queue;
    keepSlot = state.keep;
    score = state.score;
    level = state.level;
    trashCount = state.trash;

    redrawGrid(scene);
    renderQueue(scene);
    updateUI();
    
    let oldKeep = scene.children.getByName('keepTile');
    if (oldKeep) oldKeep.destroy();

    if (keepSlot !== null) {
        let k = createTile(scene, LAYOUT.PANEL_X, 420, keepSlot);
        k.name = 'keepTile';
        k.setScale(0.8);
    }
    
    showToast(scene, "UNDO!");
    // Update hints after undo
    if (hintsEnabled && tileQueue.length > 0) drawHints(scene, tileQueue[0]);
}

// --- LOGIC ---

function setDifficulty(scene, levelName) {
    difficulty = levelName;
    showToast(scene, "DIFFICULTY: " + levelName);
}

function genNumber() {
    let opts;
    if (difficulty === 'EASY') opts = [2, 3, 4, 5, 6, 8, 10];
    else if (difficulty === 'HARD') opts = [2, 3, 4, 5, 6, 8, 9, 10, 12, 15, 20, 24, 30, 32, 35, 40, 45, 48, 50, 60, 64, 72, 80, 100];
    else opts = [2, 3, 4, 5, 6, 8, 9, 10, 12, 15, 20, 24, 30, 32, 35, 40];
    return opts[Math.floor(Math.random() * opts.length)];
}

function restartGame(scene) {
    gridState = Array(16).fill(null);
    score = 0;
    level = 1;
    trashCount = 10;
    keepSlot = null;
    tileQueue = [];
    historyStack = [];
    isGameOver = false;
    isPaused = false;
    scene.scene.restart();
}

function showToast(scene, msg) {
    let t = scene.add.text(720, 200, msg, {
        fontSize: '40px', fontFamily: 'Arial Black', color: '#fff', stroke: '#000', strokeThickness: 4
    }).setOrigin(0.5).setDepth(200);
    scene.tweens.add({
        targets: t,
        y: 150,
        alpha: 0,
        duration: 1000,
        onComplete: () => t.destroy()
    });
}

function onTimerTick() {
    if (!isGameOver && !isPaused) {
        gameTime++;
        let min = Math.floor(gameTime / 60);
        let sec = gameTime % 60;
        let timeStr = (min < 10 ? '0' : '') + min + ':' + (sec < 10 ? '0' : '') + sec;
        timerText.setText('⌛ ' + timeStr);
    }
}

function createGameControls(scene) {
    let pauseBg = scene.add.circle(60, 60, 35, 0x9b59b6).setDepth(50).setInteractive();
    let pauseIcon = scene.add.text(60, 60, 'II', { fontSize: '30px', fontFamily: 'Arial Black', color: '#fff' }).setOrigin(0.5).setDepth(51);
    pauseBg.on('pointerdown', () => togglePause(scene));
    pauseIcon.on('pointerdown', () => togglePause(scene));

    let helpBg = scene.add.circle(1380, 60, 35, 0x2ecc71).setDepth(50).setInteractive();
    let helpIcon = scene.add.text(1380, 60, '?', { fontSize: '40px', fontFamily: 'Arial Black', color: '#fff' }).setOrigin(0.5).setDepth(51);
    helpBg.on('pointerdown', () => showHelp(scene));
    helpIcon.on('pointerdown', () => showHelp(scene));

    let fsBg = scene.add.rectangle(1380, 960, 60, 60, 0x27ae60).setDepth(50).setInteractive();
    let fsIcon = scene.add.text(1380, 960, '⛶', { fontSize: '40px', color: '#fff' }).setOrigin(0.5).setDepth(51);
    fsBg.on('pointerdown', () => {
        if (scene.scale.isFullscreen) scene.scale.stopFullscreen();
        else scene.scale.startFullscreen();
    });
}

function togglePause(scene) {
    if (isGameOver) return;
    if (!isPaused) {
        isPaused = true;
        let overlay = scene.add.rectangle(720, 512, 1440, 1024, 0x000000, 0.7).setDepth(200);
        overlay.name = 'pauseOverlay';
        scene.add.text(720, 350, 'PAUSED', {
            fontSize: '80px', fontFamily: 'Arial Black', color: '#fff', stroke: '#000', strokeThickness: 6
        }).setOrigin(0.5).setDepth(201).name = 'pauseText';
        let resumeBtn = scene.add.rectangle(720, 550, 300, 100, 0xf39c12).setInteractive().setDepth(201);
        resumeBtn.name = 'resumeBtn';
        scene.add.text(720, 550, 'RESUME', { fontSize: '40px', fontFamily: 'Arial Black', color: '#fff' }).setOrigin(0.5).setDepth(202).name = 'resumeTxt';
        resumeBtn.on('pointerdown', () => togglePause(scene));
        let restartBtn = scene.add.rectangle(720, 700, 300, 100, 0xe74c3c).setInteractive().setDepth(201);
        restartBtn.name = 'restartBtn';
        scene.add.text(720, 700, 'RESTART', { fontSize: '40px', fontFamily: 'Arial Black', color: '#fff' }).setOrigin(0.5).setDepth(202).name = 'restartTxt';
        restartBtn.on('pointerdown', () => restartGame(scene));
    } else {
        isPaused = false;
        ['pauseOverlay', 'pauseText', 'resumeBtn', 'resumeTxt', 'restartBtn', 'restartTxt'].forEach(name => {
            scene.children.getByName(name)?.destroy();
        });
    }
}

function showHelp(scene) {
    if (isPaused || isGameOver) return;
    isPaused = true;
    let overlay = scene.add.rectangle(720, 512, 1440, 1024, 0x000000, 0.8).setDepth(300);
    let box = scene.add.rectangle(720, 512, 800, 650, 0xffffff).setDepth(301);
    let title = scene.add.text(720, 250, 'HOW TO PLAY', { fontSize: '50px', color: '#000', fontStyle: 'bold' }).setOrigin(0.5).setDepth(302);
    let instructions = 
        "1. Drag tiles onto the grid.\n" +
        "2. MERGE matching numbers (Score x2).\n" +
        "3. DIVIDE numbers (e.g., 20 ÷ 4 = 5).\n" +
        "4. Use KEEP to save a tile.\n" +
        "5. Use TRASH to discard.\n\n" +
        "SHORTCUTS:\n" + 
        "G = Toggle Hints\n" +
        "Z = Undo | R = Restart | ESC = Pause";
    let body = scene.add.text(720, 500, instructions, { 
        fontSize: '28px', color: '#333', align: 'center', lineSpacing: 15 
    }).setOrigin(0.5).setDepth(302);
    let closeBtn = scene.add.rectangle(720, 780, 200, 80, 0xe74c3c).setInteractive().setDepth(302);
    let closeTxt = scene.add.text(720, 780, 'GOT IT', { fontSize: '30px', fontFamily: 'Arial Black', color: '#fff' }).setOrigin(0.5).setDepth(303);
    closeBtn.on('pointerdown', () => {
        overlay.destroy();
        box.destroy();
        title.destroy();
        body.destroy();
        closeBtn.destroy();
        closeTxt.destroy();
        isPaused = false;
    });
}

// --- STANDARD LOGIC ---

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
    if (val <= 4) return 't_blue';
    if (val <= 8) return 't_orange';
    if (val <= 19) return 't_pink'; 
    if (val <= 29) return 't_red';
    return 't_purple';
}

function createTile(scene, x, y, val) {
    let container = scene.add.container(x, y);
    let key = getTexture(val);
    let bg = scene.add.image(0, 0, key);
    bg.setDisplaySize(130, 130);
    let txt = scene.add.text(0, 0, val, { 
        fontFamily: 'Arial Black', fontSize: '52px', color: '#fff', stroke: '#000', strokeThickness: 3 
    }).setOrigin(0.5);
    container.add([bg, txt]);
    container.setSize(130, 130);
    container.setData('value', val);
    container.setDepth(5); 
    return container;
}

function renderQueue(scene) {
    if (upcomingGroup) upcomingGroup.destroy(true);
    upcomingGroup = scene.add.group();
    if (isGameOver) return;
    const qX = LAYOUT.PANEL_X;
    const qY = 625;
    
    // Active
    let topVal = tileQueue[0];
    let topTile = createTile(scene, qX - 55, qY, topVal); 
    topTile.setInteractive();
    scene.input.setDraggable(topTile);
    topTile.setData('draggable', true);
    topTile.setData('isFromQueue', true);
    topTile.setScale(0.85); 
    upcomingGroup.add(topTile);

    // Preview
    if (tileQueue[1]) {
        let t2 = createTile(scene, qX + 55, qY, tileQueue[1]);
        t2.setScale(0.65); 
        t2.each(child => { if (child.type === 'Image') child.setTint(0x888888); });
        upcomingGroup.add(t2);
    }
    
    // Update hints on new turn
    if (hintsEnabled) drawHints(scene, topVal);
}

function placeTile(obj, idx, scene) {
    let val = obj.getData('value');
    let isFromQueue = obj.getData('isFromQueue'); 
    gridState[idx] = val;
    obj.destroy();
    checkMerges(idx);
    if (isFromQueue) {
        tileQueue.shift();
        tileQueue.push(genNumber());
        renderQueue(scene);
    } else {
        // If placing Keep tile
        if (hintsEnabled && tileQueue.length > 0) drawHints(scene, tileQueue[0]);
    }
    redrawGrid(scene);
    checkGameOver(scene);
}

function checkMerges(idx) {
    let neighbors = getNeighbors(idx);
    let current = gridState[idx];
    if (!current) return;

    for (let n of neighbors) {
        if (gridState[n.i]) {
            let neighbor = gridState[n.i];
            let merged = false;
            let result = null;

            if (current === neighbor) {
                gridState[idx] = null;
                gridState[n.i] = null;
                merged = true;
                score += current * 2;
            } else if (current % neighbor === 0) {
                result = current / neighbor;
                gridState[n.i] = null;
                gridState[idx] = result;
                merged = true;
                score += current;
            } else if (neighbor % current === 0) {
                result = neighbor / current;
                gridState[idx] = null;
                gridState[n.i] = result;
                merged = true;
                score += neighbor;
            }

            if (result === 1) {
                if(gridState[idx] === 1) gridState[idx] = null;
                if(gridState[n.i] === 1) gridState[n.i] = null;
            }

            if (merged) {
                updateUI();
                break; 
            }
        }
    }
}

function redrawGrid(scene) {
    scene.children.getAll().forEach(child => {
        if (child.name && child.name.startsWith('gridTile_')) child.destroy();
    });
    const startX = LAYOUT.GRID_X - (1.5 * LAYOUT.TILE_GAP);
    const startY = LAYOUT.GRID_Y - (1.5 * LAYOUT.TILE_GAP);
    for (let i = 0; i < 16; i++) {
        if (gridState[i] !== null) {
            let r = Math.floor(i / 4);
            let c = i % 4;
            let x = startX + c * LAYOUT.TILE_GAP;
            let y = startY + r * LAYOUT.TILE_GAP;
            let t = createTile(scene, x, y, gridState[i]);
            t.name = 'gridTile_' + i;
        }
    }
}

function handleTrash(obj, scene) {
    let isFromQueue = obj.getData('isFromQueue');
    if (trashCount > 0) {
        trashCount--;
        obj.destroy();
        if (isFromQueue) {
            tileQueue.shift();
            tileQueue.push(genNumber());
            renderQueue(scene);
        } else {
             if (hintsEnabled && tileQueue.length > 0) drawHints(scene, tileQueue[0]);
        }
        updateUI();
        checkGameOver(scene);
    } else {
        returnToOrigin(obj);
    }
}

function handleKeep(obj, scene) {
    let val = obj.getData('value');
    let fromQueue = obj.getData('isFromQueue');
    if (keepSlot === null) {
        keepSlot = val;
        obj.destroy();
        if (fromQueue) {
            tileQueue.shift();
            tileQueue.push(genNumber());
        }
    } else {
        let temp = keepSlot;
        keepSlot = val;
        obj.destroy();
        if (fromQueue) tileQueue[0] = temp;
    }
    let old = scene.children.getByName('keepTile');
    if (old) old.destroy();
    let k = createTile(scene, LAYOUT.PANEL_X, 420, keepSlot);
    k.name = 'keepTile';
    k.setScale(0.8);
    renderQueue(scene);
    checkGameOver(scene);
}

function updateUI() {
    scoreText.setText('SCORE ' + score);
    trashText.setText('x' + trashCount);
    if (score > level * 50) {
        level++;
        trashCount += 2;
        levelText.setText('LEVEL ' + level);
    }
    if (score > bestScore) {
        bestScore = score;
        localStorage.setItem('justDivideBest', bestScore);
        bestText.setText('BEST: ' + bestScore);
    }
}

function checkGameOver(scene) {
    if (!gridState.includes(null)) {
        triggerGameOver(scene);
    }
}

function triggerGameOver(scene) {
    isGameOver = true;
    let overlay = scene.add.rectangle(720, 512, 1440, 1024, 0x000000, 0.7);
    overlay.setInteractive(); 
    overlay.setDepth(100);

    scene.add.text(720, 400, 'GAME OVER', {
        fontSize: '80px', fontFamily: 'Arial Black', color: '#e74c3c', stroke: '#fff', strokeThickness: 6
    }).setOrigin(0.5).setDepth(101);

    scene.add.text(720, 500, 'Final Score: ' + score, {
        fontSize: '40px', fontFamily: 'Arial', color: '#fff'
    }).setOrigin(0.5).setDepth(101);

    let btn = scene.add.rectangle(720, 650, 300, 100, 0x2ecc71).setInteractive().setDepth(101);
    scene.add.text(720, 650, 'RESTART', {
        fontSize: '40px', fontFamily: 'Arial Black', color: '#fff'
    }).setOrigin(0.5).setDepth(102);

    btn.on('pointerdown', () => restartGame(scene));
}