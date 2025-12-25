/**
 * Just Divide - Kid Mode
 * REVOLUTIONARY RESPONSIVE EDITION
 * - 'G' to Toggle Hints
 * - Smooth Transitions (Tweens)
 * - Optimized Portrait Zoom (Grid-focused)
 */

const CONFIG = {
    type: Phaser.AUTO,
    width: 1440,
    height: 1024,
    parent: 'game-container',
    backgroundColor: '#ffe0e5',
    scale: {
        mode: Phaser.Scale.RESIZE, // Resizes the canvas to fill window
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    render: {
        pixelArt: false,
        antialias: true,
        roundPixels: false
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

const game = new Phaser.Game(CONFIG);

// --- LAYOUT CONFIGURATION ---
// We use these as "target" values. The code animates towards them.
let LAYOUT = {
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
    
    isGameOver = false;
    isPaused = false;
    gameTime = 0;
    historyStack = [];
    hintsEnabled = false;

    // --- INPUTS ---
    this.input.keyboard.on('keydown-Z', () => performUndo(this));
    this.input.keyboard.on('keydown-R', () => restartGame(this));
    this.input.keyboard.on('keydown-ESC', () => togglePause(this));
    this.input.keyboard.on('keydown-G', () => toggleHints(this)); 
    this.input.keyboard.on('keydown-ONE', () => setDifficulty(this, 'EASY'));
    this.input.keyboard.on('keydown-TWO', () => setDifficulty(this, 'MEDIUM'));
    this.input.keyboard.on('keydown-THREE', () => setDifficulty(this, 'HARD'));

    // --- LAYERS ---
    
    // A. Background (Centered in world 720, 512)
    this.bg = this.add.image(720, 512, 'bg_desktop').setOrigin(0.5).setDepth(0);
    
    // Header Elements (Title & Timer) - We'll group these logically
    this.titleText = this.add.text(720, 50, 'JUST DIVIDE', {
        fontFamily: 'Arial', fontSize: '56px', color: '#2c3e50', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(1);

    timerText = this.add.text(720, 110, '⌛ 00:00', {
        fontFamily: 'Arial', fontSize: '32px', color: '#000', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(1);

    if (timerEvent) timerEvent.remove();
    timerEvent = this.time.addEvent({ delay: 1000, callback: onTimerTick, callbackScope: this, loop: true });

    // B. Graphics & Grid
    this.uiGraphics = this.add.graphics().setDepth(1);
    this.gridSlots = this.add.group();
    
    // Create Grid Slots
    for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
            let slot = this.add.image(0, 0, 'slot').setDisplaySize(140, 140).setDepth(3).setInteractive();
            slot.input.dropZone = true;
            slot.setData({ r: r, c: c });
            this.gridSlots.add(slot);
        }
    }

    hintGraphics = this.add.graphics().setDepth(4);

    // C. Decorative & Stats (Attached to Grid normally)
    // We create them at 0,0 and let the resize handler move them
    this.catImg = this.add.image(0, 0, 'cat').setOrigin(0.5, 1).setDepth(20);
    this.badgeLeft = this.add.image(0, 0, 'badge').setDepth(10);
    this.badgeRight = this.add.image(0, 0, 'badge').setDepth(10);
    
    levelText = this.add.text(0, 0, 'LEVEL ' + level, { fontSize: '32px', fontFamily: 'Arial Black', color: '#fff' }).setOrigin(0.5).setDepth(11);
    scoreText = this.add.text(0, 0, 'SCORE ' + score, { fontSize: '28px', fontFamily: 'Arial Black', color: '#fff' }).setOrigin(0.5).setDepth(11);
    bestText = this.add.text(0, 0, 'BEST: ' + bestScore, { fontSize: '16px', fontFamily: 'Arial', color: '#fff' }).setOrigin(0.5).setDepth(11);

    // D. Right Panel Elements (Keep/Trash)
    this.txtKeep = this.add.text(0, 0, 'KEEP', { fontSize: '32px', fontFamily: 'Arial Black', color: '#fff' }).setOrigin(0.5).setDepth(3);
    
    this.keepZone = this.add.image(0, 0, 'slot').setTint(0x2ecc71).setInteractive().setDisplaySize(130, 130).setDepth(3);
    this.keepZone.name = 'keepZone';
    this.keepZone.input.dropZone = true;

    this.txtTrash = this.add.text(0, 0, 'TRASH', { fontSize: '32px', fontFamily: 'Arial Black', color: '#c0392b' }).setOrigin(0.5).setDepth(3);
    
    this.trashZone = this.add.rectangle(0, 0, 120, 120, 0xe74c3c).setInteractive().setDepth(3);
    this.trashZone.name = 'trashZone';
    this.trashZone.input.dropZone = true;
    
    this.trashIcon = this.add.text(0, 0, '🗑️', { fontSize: '60px' }).setOrigin(0.5).setDepth(4);
    trashText = this.add.text(0, 0, 'x' + trashCount, { fontSize: '28px', fontFamily: 'Arial Black', color: '#fff' }).setOrigin(0.5).setDepth(3);

    createGameControls(this);

    // --- DRAG EVENTS ---
    this.input.on('dragstart', (pointer, obj) => {
        if (isGameOver || isPaused || !obj.getData('draggable')) return;
        this.children.bringToTop(obj);
        obj.setDepth(30);
        obj.setData('originX', obj.x);
        obj.setData('originY', obj.y);
        if (hintsEnabled) drawHints(this, obj.getData('value'));
    });

    this.input.on('drag', (pointer, obj, dragX, dragY) => {
        if (isGameOver || isPaused || !obj.getData('draggable')) return;
        // Simple drag, no tween here to keep it responsive
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
            else { historyStack.pop(); returnToOrigin(obj); }
        } 
        else if (dropZone.name === 'keepZone') handleKeep(obj, this);
        else if (dropZone.name === 'trashZone') handleTrash(obj, this);
        else { historyStack.pop(); returnToOrigin(obj); }
    });

    this.input.on('dragend', (pointer, obj, dropped) => {
        if (!dropped) returnToOrigin(obj);
        if (hintsEnabled && tileQueue.length > 0) drawHints(this, tileQueue[0]);
    });

    if (tileQueue.length === 0) initQueue(this);
    
    // --- RESIZE HANDLING ---
    this.scale.on('resize', (gameSize) => {
        handleResponsiveResize(this, gameSize.width, gameSize.height);
    });
    // Call once to set initial state
    handleResponsiveResize(this, this.scale.width, this.scale.height);
}

function update() {}

// --- REVOLUTIONARY RESPONSIVE & ANIMATION SYSTEM ---

function handleResponsiveResize(scene, width, height) {
    const isPortrait = height > width;
    
    // 1. Determine Logic Dimensions
    // Landscape Design: 1440 width
    // Portrait Design: Focus on Grid Width (~800px)
    
    let targetZoom;
    if (isPortrait) {
        // In Portrait, we ignore the 1440 background width. 
        // We want the 800px wide grid to fill 90% of the screen.
        // Formula: screenWidth / 900 (gives some padding)
        targetZoom = width / 900;
        
        // Clamp zoom so it doesn't get ridiculously huge on iPads
        if (targetZoom > 1.2) targetZoom = 1.2;
    } else {
        // In Landscape, fit the whole 1440 design or height
        targetZoom = Math.min(width / 1440, height / 1024);
    }
    
    // Smoothly Zoom Camera
    scene.tweens.add({
        targets: scene.cameras.main,
        zoom: targetZoom,
        duration: 500,
        ease: 'Cubic.easeOut'
    });
    
    // Center Camera (World is centered at 720, 512)
    scene.cameras.main.centerOn(720, 512);

    // 2. Background Management
    if (isPortrait) scene.bg.setTexture('bg_portrait');
    else scene.bg.setTexture(width / height > 1.4 ? 'bg_landscape' : 'bg_desktop');

    // Make BG cover the whole visible world
    const worldW = width / targetZoom;
    const worldH = height / targetZoom;
    scene.bg.setDisplaySize(Math.max(worldW, 1440), Math.max(worldH, 1024));

    // 3. Define Target Coordinates
    if (isPortrait) {
        // PORTRAIT LAYOUT
        // Shift Grid Up
        LAYOUT.GRID_X = 720;
        LAYOUT.GRID_Y = 500; 
        
        // Panel Elements go to Bottom
        // We calculate how far down based on available height, 
        // but fixed relative coordinates work best for the zoom strategy.
        LAYOUT.PANEL_X = 720; 
        LAYOUT.PANEL_Y = 1000; // Below the grid
        
        // Move Title Up slightly
        smoothMove(scene, scene.titleText, 720, -50); // Move title higher up out of way or top
        smoothMove(scene, timerText, 720, 10);

    } else {
        // LANDSCAPE LAYOUT
        LAYOUT.GRID_X = 550;
        LAYOUT.GRID_Y = 650;
        LAYOUT.PANEL_X = 1180;
        LAYOUT.PANEL_Y = 600;
        
        // Reset Title
        smoothMove(scene, scene.titleText, 720, 50);
        smoothMove(scene, timerText, 720, 110);
    }

    // 4. Animate Everything to New Positions
    animateLayout(scene, isPortrait);
}

// Helper for smooth movement
function smoothMove(scene, target, x, y) {
    if (!target) return;
    scene.tweens.add({
        targets: target,
        x: x,
        y: y,
        duration: 500,
        ease: 'Power2'
    });
}

function animateLayout(scene, isPortrait) {
    // A. Redraw Graphics (Instant because graphics can't easily be tweened structurally)
    // We clear and redraw the boxes at the *target* location immediately, 
    // but the content (slots, tiles) will glide there.
    scene.uiGraphics.clear();
    scene.uiGraphics.setDepth(1);
    
    // Grid Box
    scene.uiGraphics.fillStyle(0x008080, 1);
    scene.uiGraphics.fillRoundedRect(LAYOUT.GRID_X - 330, LAYOUT.GRID_Y - 330, 660, 660, 25);
    scene.uiGraphics.lineStyle(8, 0xffffff);
    scene.uiGraphics.strokeRoundedRect(LAYOUT.GRID_X - 330, LAYOUT.GRID_Y - 330, 660, 660, 25);

    // Panel Box
    if (isPortrait) {
        // Horizontal Panel
        scene.uiGraphics.fillStyle(0xf39c12, 1);
        scene.uiGraphics.fillRoundedRect(100, LAYOUT.PANEL_Y - 100, 1240, 200, 30);
        scene.uiGraphics.lineStyle(6, 0xd35400);
        scene.uiGraphics.strokeRoundedRect(100, LAYOUT.PANEL_Y - 100, 1240, 200, 30);
        
        // Queue Highlight
        scene.uiGraphics.fillStyle(0xffffff, 1);
        scene.uiGraphics.fillRoundedRect(LAYOUT.PANEL_X - 90, LAYOUT.PANEL_Y - 65, 180, 130, 15);
        scene.uiGraphics.strokeRoundedRect(LAYOUT.PANEL_X - 90, LAYOUT.PANEL_Y - 65, 180, 130, 15);
    } else {
        // Vertical Panel
        scene.uiGraphics.fillStyle(0xf39c12, 1);
        scene.uiGraphics.fillRoundedRect(LAYOUT.PANEL_X - 110, 280, 220, 650, 30);
        scene.uiGraphics.lineStyle(6, 0xd35400);
        scene.uiGraphics.strokeRoundedRect(LAYOUT.PANEL_X - 110, 280, 220, 650, 30);

        // Queue Highlight
        scene.uiGraphics.fillStyle(0xffffff, 1);
        scene.uiGraphics.fillRoundedRect(LAYOUT.PANEL_X - 90, 560, 180, 130, 15);
        scene.uiGraphics.strokeRoundedRect(LAYOUT.PANEL_X - 90, 560, 180, 130, 15);
    }

    // B. Animate Grid Slots
    const startX = LAYOUT.GRID_X - (1.5 * LAYOUT.TILE_GAP);
    const startY = LAYOUT.GRID_Y - (1.5 * LAYOUT.TILE_GAP);
    
    scene.gridSlots.getChildren().forEach(slot => {
        let r = slot.getData('r');
        let c = slot.getData('c');
        smoothMove(scene, slot, startX + c * LAYOUT.TILE_GAP, startY + r * LAYOUT.TILE_GAP);
    });

    // C. Animate Active Grid Tiles
    // We find all tiles currently on grid (named gridTile_X)
    scene.children.getAll().forEach(child => {
        if (child.name && child.name.startsWith('gridTile_')) {
            let idx = parseInt(child.name.split('_')[1]);
            let r = Math.floor(idx / 4);
            let c = idx % 4;
            smoothMove(scene, child, startX + c * LAYOUT.TILE_GAP, startY + r * LAYOUT.TILE_GAP);
        }
    });

    // D. Animate Panel UI
    if (isPortrait) {
        // KEEP (Left)
        smoothMove(scene, scene.txtKeep, 350, LAYOUT.PANEL_Y - 50);
        smoothMove(scene, scene.keepZone, 350, LAYOUT.PANEL_Y + 30);
        let keepTile = scene.children.getByName('keepTile');
        smoothMove(scene, keepTile, 350, LAYOUT.PANEL_Y + 30);

        // TRASH (Right)
        smoothMove(scene, scene.txtTrash, 1090, LAYOUT.PANEL_Y - 50);
        smoothMove(scene, scene.trashZone, 1090, LAYOUT.PANEL_Y + 30);
        smoothMove(scene, scene.trashIcon, 1090, LAYOUT.PANEL_Y + 30);
        smoothMove(scene, trashText, 1090, LAYOUT.PANEL_Y + 110);
        
        // Queue (Center)
        refreshQueuePosition(scene, isPortrait);

    } else {
        // KEEP (Top Right)
        smoothMove(scene, scene.txtKeep, LAYOUT.PANEL_X, 330);
        smoothMove(scene, scene.keepZone, LAYOUT.PANEL_X, 420);
        let keepTile = scene.children.getByName('keepTile');
        smoothMove(scene, keepTile, LAYOUT.PANEL_X, 420);

        // TRASH (Bottom Right)
        smoothMove(scene, scene.txtTrash, LAYOUT.PANEL_X, 760);
        smoothMove(scene, scene.trashZone, LAYOUT.PANEL_X, 840);
        smoothMove(scene, scene.trashIcon, LAYOUT.PANEL_X, 840);
        smoothMove(scene, trashText, LAYOUT.PANEL_X, 920);
        
        refreshQueuePosition(scene, isPortrait);
    }

    // E. Decoration
    const badgeY = LAYOUT.GRID_Y - 390;
    smoothMove(scene, scene.catImg, LAYOUT.GRID_X, badgeY + 50);
    smoothMove(scene, scene.badgeLeft, LAYOUT.GRID_X - 180, badgeY + 75);
    smoothMove(scene, levelText, LAYOUT.GRID_X - 180, badgeY + 75);
    smoothMove(scene, scene.badgeRight, LAYOUT.GRID_X + 180, badgeY + 75);
    smoothMove(scene, scoreText, LAYOUT.GRID_X + 180, badgeY + 65);
    smoothMove(scene, bestText, LAYOUT.GRID_X + 180, badgeY + 100);
}

function refreshQueuePosition(scene, isPortrait) {
    if (!upcomingGroup) return;
    
    // We can't tween a group easily, so we tween its children
    let qX = LAYOUT.PANEL_X;
    let qY = isPortrait ? LAYOUT.PANEL_Y : 625;
    
    let children = upcomingGroup.getChildren();
    
    if (children.length > 0) {
        // Top Tile
        let t1 = children[0];
        let t1X = qX - (isPortrait ? 0 : 55);
        smoothMove(scene, t1, t1X, qY);
    }
    
    if (children.length > 1) {
        // Preview Tile
        let t2 = children[1];
        if (isPortrait) {
             // Hide/Shrink preview in portrait to allow space
             scene.tweens.add({ targets: t2, alpha: 0, scale: 0, duration: 300 });
        } else {
             // Show in landscape
             let t2X = qX + 55;
             t2.alpha = 1; // ensure visible
             smoothMove(scene, t2, t2X, qY);
             scene.tweens.add({ targets: t2, scale: 0.65, duration: 300 });
        }
    }
}

// --- HINT SYSTEM ---

function toggleHints(scene) {
    hintsEnabled = !hintsEnabled;
    showToast(scene, hintsEnabled ? "HINTS: ON" : "HINTS: OFF");
    
    if (hintsEnabled) {
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
    
    hintGraphics.lineStyle(6, 0xf1c40f, 0.8);
    for (let i = 0; i < 16; i++) {
        if (gridState[i] === null) {
            let neighbors = getNeighbors(i);
            let isMatch = false;

            for (let n of neighbors) {
                if (gridState[n.i] !== null) {
                    let neighborVal = gridState[n.i];
                    if (activeVal === neighborVal || 
                        activeVal % neighborVal === 0 || 
                        neighborVal % activeVal === 0) {
                        isMatch = true;
                        break;
                    }
                }
            }

            if (isMatch) {
                let r = Math.floor(i / 4);
                let c = i % 4;
                let x = startX + c * LAYOUT.TILE_GAP;
                let y = startY + r * LAYOUT.TILE_GAP;
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
        // Use current Keep Zone coords
        let kX = scene.keepZone ? scene.keepZone.x : LAYOUT.PANEL_X;
        let kY = scene.keepZone ? scene.keepZone.y : 420;
        let k = createTile(scene, kX, kY, keepSlot);
        k.name = 'keepTile';
        k.setScale(0.8);
    }
    
    showToast(scene, "UNDO!");
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
    // Top Left/Right Controls
    let pauseBg = scene.add.circle(60, 60, 35, 0x9b59b6).setDepth(50).setInteractive();
    let pauseIcon = scene.add.text(60, 60, 'II', { fontSize: '30px', fontFamily: 'Arial Black', color: '#fff' }).setOrigin(0.5).setDepth(51);
    pauseBg.on('pointerdown', () => togglePause(scene));
    pauseIcon.on('pointerdown', () => togglePause(scene));

    let helpBg = scene.add.circle(1380, 60, 35, 0x2ecc71).setDepth(50).setInteractive();
    let helpIcon = scene.add.text(1380, 60, '?', { fontSize: '40px', fontFamily: 'Arial Black', color: '#fff' }).setOrigin(0.5).setDepth(51);
    helpBg.on('pointerdown', () => showHelp(scene));
    helpIcon.on('pointerdown', () => showHelp(scene));

    // Fullscreen (Bottom Right in Logic, follows screen in Resize if we wanted, but logic coord is easier)
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
    // If we are currently tweening, the origin might be stale, but typically fine
    // We add a small tween to return instead of snap
    scene = obj.scene;
    scene.tweens.add({
        targets: obj,
        x: obj.getData('originX'),
        y: obj.getData('originY'),
        duration: 200,
        ease: 'Quad.easeOut'
    });
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
    
    // Position checks
    const isPortrait = LAYOUT.GRID_X === 720;
    const qX = LAYOUT.PANEL_X;
    const qY = isPortrait ? LAYOUT.PANEL_Y : 625;

    // Active
    let topVal = tileQueue[0];
    let topTile = createTile(scene, qX - (isPortrait ? 0 : 55), qY, topVal); 
    topTile.setInteractive();
    scene.input.setDraggable(topTile);
    topTile.setData('draggable', true);
    topTile.setData('isFromQueue', true);
    topTile.setScale(0.85); 
    upcomingGroup.add(topTile);

    // Preview
    if (tileQueue[1] && !isPortrait) {
        let t2 = createTile(scene, qX + 55, qY, tileQueue[1]);
        t2.setScale(0.65); 
        t2.each(child => { if (child.type === 'Image') child.setTint(0x888888); });
        upcomingGroup.add(t2);
    }
    
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
    // Clear old grid tiles
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
    
    // Dynamic Pos
    let kX = scene.keepZone ? scene.keepZone.x : LAYOUT.PANEL_X;
    let kY = scene.keepZone ? scene.keepZone.y : 420;
    
    let k = createTile(scene, kX, kY, keepSlot);
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