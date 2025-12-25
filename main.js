/**
 * Just Divide - Kid Mode
 * RESPONSIVE FIX
 * - Fixed Portrait Mode (Elements stack vertically)
 * - Fixed "Tiny Game" issue on phones
 * - Fixed Green/Black Glitches
 */

const CONFIG = {
    type: Phaser.AUTO,
    width: 1440,
    height: 1024,
    parent: 'game-container',
    backgroundColor: '#ffe0e5', // Pink background to hide glitches
    scale: {
        mode: Phaser.Scale.RESIZE, // CRITICAL: Allows full screen on mobile
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

// Layout References (To move them later)
let gridSlots = [];
let panelElements = {}; // Stores keepZone, trashZone, texts
let bgGraphics;
let bgImage;
let gameTitle;
let catImage;
let badgeL, badgeR;

// --- 1. PRELOAD ASSETS ---
function preload() {
    this.load.setPath('assets/');
    // Ensure you have these images or fallback to the one you have
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
    // 1. Glitch Fix: Set Camera BG Color immediately
    this.cameras.main.setBackgroundColor('#ffe0e5');

    // Reset Variables
    isGameOver = false;
    isPaused = false;
    gameTime = 0;
    historyStack = [];
    hintsEnabled = false;
    gridSlots = [];
    panelElements = {};

    // --- KEYBOARD INPUTS ---
    this.input.keyboard.on('keydown-Z', () => performUndo(this));
    this.input.keyboard.on('keydown-R', () => restartGame(this));
    this.input.keyboard.on('keydown-ESC', () => togglePause(this));
    this.input.keyboard.on('keydown-G', () => toggleHints(this));
    this.input.keyboard.on('keydown-ONE', () => setDifficulty(this, 'EASY'));
    this.input.keyboard.on('keydown-TWO', () => setDifficulty(this, 'MEDIUM'));
    this.input.keyboard.on('keydown-THREE', () => setDifficulty(this, 'HARD'));

    // --- LAYERS ---
    
    // A. Background (Anchor to center)
    // We use the desktop bg as default, resize function will swap it
    bgImage = this.add.image(0, 0, 'bg_desktop').setOrigin(0.5, 0.5).setDepth(0);

    // B. Title & Timer
    gameTitle = this.add.text(0, 0, 'JUST DIVIDE', {
        fontFamily: 'Arial', fontSize: '56px', color: '#2c3e50', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(1);

    timerText = this.add.text(0, 0, '⌛ 00:00', {
        fontFamily: 'Arial', fontSize: '32px', color: '#000', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(1);

    if (timerEvent) timerEvent.remove();
    timerEvent = this.time.addEvent({ delay: 1000, callback: onTimerTick, callbackScope: this, loop: true });

    // C. Graphics Layer (For Colored Rectangles)
    bgGraphics = this.add.graphics().setDepth(1);

    // D. Grid Slots (Depth 3)
    // We create them at (0,0) initially, layout code will move them
    for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
            let slot = this.add.image(0, 0, 'slot').setDisplaySize(140, 140).setDepth(3).setInteractive();
            slot.input.dropZone = true;
            slot.setData({ r: r, c: c });
            gridSlots.push(slot); // Store reference
        }
    }

    // E. Hint Layer
    hintGraphics = this.add.graphics().setDepth(4);

    // F. Decorations
    badgeL = this.add.image(0, 0, 'badge').setDepth(10);
    levelText = this.add.text(0, 0, 'LEVEL ' + level, {
        fontSize: '32px', fontFamily: 'Arial Black', color: '#fff'
    }).setOrigin(0.5).setDepth(11);

    badgeR = this.add.image(0, 0, 'badge').setDepth(10);
    scoreText = this.add.text(0, 0, 'SCORE ' + score, {
        fontSize: '28px', fontFamily: 'Arial Black', color: '#fff'
    }).setOrigin(0.5).setDepth(11);
    bestText = this.add.text(0, 0, 'BEST: ' + bestScore, {
        fontSize: '16px', fontFamily: 'Arial', color: '#fff'
    }).setOrigin(0.5).setDepth(11);

    catImage = this.add.image(0, 0, 'cat').setOrigin(0.5, 1).setDepth(20);

    // G. Panel Elements (Keep/Trash)
    panelElements.lblKeep = this.add.text(0, 0, 'KEEP', { fontSize: '32px', fontFamily: 'Arial Black', color: '#fff' }).setOrigin(0.5).setDepth(3);
    
    panelElements.keepZone = this.add.image(0, 0, 'slot').setTint(0x2ecc71).setInteractive();
    panelElements.keepZone.name = 'keepZone';
    panelElements.keepZone.setDisplaySize(130, 130);
    panelElements.keepZone.input.dropZone = true;
    panelElements.keepZone.setDepth(3);

    panelElements.lblTrash = this.add.text(0, 0, 'TRASH', { fontSize: '32px', fontFamily: 'Arial Black', color: '#c0392b' }).setOrigin(0.5).setDepth(3);
    
    panelElements.trashZone = this.add.rectangle(0, 0, 120, 120, 0xe74c3c).setInteractive();
    panelElements.trashZone.name = 'trashZone';
    panelElements.trashZone.input.dropZone = true;
    panelElements.trashZone.setDepth(3);
    
    panelElements.iconTrash = this.add.text(0, 0, '🗑️', { fontSize: '60px' }).setOrigin(0.5).setDepth(4);
    panelElements.txtTrashCount = this.add.text(0, 0, 'x' + trashCount, { fontSize: '28px', fontFamily: 'Arial Black', color: '#fff' }).setOrigin(0.5).setDepth(3);

    // H. Controls
    createGameControls(this);

    // I. Start Logic
    if (tileQueue.length === 0) initQueue(this);
    else renderQueue(this);

    // --- RESIZE HANDLER ---
    this.scale.on('resize', (gameSize) => {
        doResponsiveLayout(this, gameSize.width, gameSize.height);
    });
    // Initial Call
    doResponsiveLayout(this, this.scale.width, this.scale.height);

    // J. Drag Events (Same as before)
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
}

function update() {}

// --- RESPONSIVE LAYOUT ENGINE ---

function doResponsiveLayout(scene, width, height) {
    const isPortrait = height > width;
    
    // 1. Camera Setup (Center on a logical 1440x1024 world center)
    // We will position elements relative to this center
    const cx = 720; 
    const cy = 512;
    scene.cameras.main.centerOn(cx, cy);

    // 2. Background Handling
    let bgTexture = 'bg_desktop';
    if (isPortrait) bgTexture = 'bg_portrait';
    else if (width / height > 1.4) bgTexture = 'bg_landscape';
    
    // Use the texture if it exists, otherwise fallback
    if(scene.textures.exists(bgTexture)) bgImage.setTexture(bgTexture);
    
    // Scale BG to cover the visible area
    // The camera zoom affects how much we see. We need to calculate inverse zoom.
    let zoom = 1;

    // --- LAYOUT CALCULATIONS ---
    let gridX, gridY, panelX, panelY;
    let tileSize = 130;
    let gap = 155;

    if (isPortrait) {
        // --- PORTRAIT MODE ---
        // Stack Grid on Top, Panel on Bottom
        
        // Logic: Fit the 660px wide grid into the screen width
        // Add some padding (e.g. 50px)
        zoom = width / 800; 

        // Position Grid in the upper half (relative to world center cx, cy)
        gridX = cx; 
        gridY = cy - 250; 

        // Position Panel below the Grid
        panelX = cx; 
        panelY = cy + 450; 

    } else {
        // --- LANDSCAPE MODE ---
        // Side by Side
        zoom = Math.min(width / 1440, height / 1024);
        
        // Standard Positions
        gridX = cx - 170; // 550
        gridY = cy + 138; // 650
        panelX = cx + 460; // 1180
        panelY = cy + 88; // 600
    }

    // Apply Zoom
    scene.cameras.main.setZoom(zoom);

    // Fix Background Size (inverse zoom to cover screen)
    bgImage.setPosition(cx, cy);
    bgImage.setDisplaySize(width / zoom, height / zoom);

    // 3. Move Grid Elements
    const gridStartX = gridX - (1.5 * gap);
    const gridStartY = gridY - (1.5 * gap);

    gridSlots.forEach(slot => {
        let r = slot.getData('r');
        let c = slot.getData('c');
        slot.setPosition(gridStartX + c * gap, gridStartY + r * gap);
    });

    // Move Existing Grid Tiles
    for (let i = 0; i < 16; i++) {
        let t = scene.children.getByName('gridTile_' + i);
        if (t) {
            let r = Math.floor(i / 4);
            let c = i % 4;
            t.setPosition(gridStartX + c * gap, gridStartY + r * gap);
        }
    }

    // 4. Move Panel Elements
    const p = panelElements;
    // Offsets relative to panelCenter (panelX, panelY)
    
    // We need to redraw the background graphics first to match these positions
    bgGraphics.clear();
    
    // Grid Background
    bgGraphics.fillStyle(0x008080, 1);
    bgGraphics.fillRoundedRect(gridX - 330, gridY - 330, 660, 660, 25);
    bgGraphics.lineStyle(8, 0xffffff);
    bgGraphics.strokeRoundedRect(gridX - 330, gridY - 330, 660, 660, 25);

    // Panel Background
    // In Portrait, we might want the panel background to be wider/shorter? 
    // For simplicity, we keep the vertical panel shape but just move it down.
    bgGraphics.fillStyle(0xf39c12, 1);
    bgGraphics.fillRoundedRect(panelX - 110, panelY - 320, 220, 650, 30);
    bgGraphics.lineStyle(6, 0xd35400);
    bgGraphics.strokeRoundedRect(panelX - 110, panelY - 320, 220, 650, 30);

    // Queue Background
    bgGraphics.fillStyle(0xffffff, 1);
    bgGraphics.fillRoundedRect(panelX - 90, panelY - 40, 180, 130, 15); // Adjusted Y
    bgGraphics.lineStyle(4, 0xbdc3c7);
    bgGraphics.strokeRoundedRect(panelX - 90, panelY - 40, 180, 130, 15);

    // Reposition UI Items (Offsets based on original layout relative to center)
    // Original Panel Y was 600.
    // Keep Text was 330 (-270 relative)
    // Keep Zone was 420 (-180)
    // Queue was ~625 (+25)
    // Trash Text was 760 (+160)
    // Trash Zone was 840 (+240)
    
    p.lblKeep.setPosition(panelX, panelY - 270);
    p.keepZone.setPosition(panelX, panelY - 180);
    
    // Handle Keep Tile if exists
    let kTile = scene.children.getByName('keepTile');
    if (kTile) kTile.setPosition(panelX, panelY - 180);

    // Queue (Upcoming Group)
    if (upcomingGroup) {
        // Re-create queue visually or move it
        // The queue group has children with relative offsets. 
        // We need to move the children or the group? Group doesn't support setPosition easily in all versions.
        // Simplest: Destroy and Re-render
        renderQueue(scene);
    }
    // Update global var for queue rendering
    window.lastPanelX = panelX;
    window.lastPanelY = panelY;

    p.lblTrash.setPosition(panelX, panelY + 160);
    p.trashZone.setPosition(panelX, panelY + 240);
    p.iconTrash.setPosition(panelX, panelY + 240);
    p.txtTrashCount.setPosition(panelX, panelY + 320);

    // 5. Decorations & Titles
    gameTitle.setPosition(cx, gridY - 380);
    if (isPortrait) gameTitle.setFontSize('80px'); // Make bigger on mobile
    else gameTitle.setFontSize('56px');

    timerText.setPosition(cx, gridY - 320);

    // Cat & Badges (Attached to Grid Top)
    const badgeY = gridY - 390;
    badgeL.setPosition(gridX - 180, badgeY + 75);
    levelText.setPosition(gridX - 180, badgeY + 75);

    badgeR.setPosition(gridX + 180, badgeY + 75);
    scoreText.setPosition(gridX + 180, badgeY + 65);
    bestText.setPosition(gridX + 180, badgeY + 100);

    catImage.setPosition(gridX, badgeY + 50);

    // Redraw Hints if active
    if (hintsEnabled && tileQueue.length > 0) drawHints(scene, tileQueue[0]);
}

// --- STANDARD FUNCTIONS ---

function toggleHints(scene) {
    hintsEnabled = !hintsEnabled;
    showToast(scene, hintsEnabled ? "HINTS: ON" : "HINTS: OFF");
    if (hintsEnabled && tileQueue.length > 0) drawHints(scene, tileQueue[0]);
    else hintGraphics.clear();
}

function drawHints(scene, activeVal) {
    hintGraphics.clear();
    if (!activeVal || isGameOver) return;
    
    // Calculate current grid position based on the first slot
    if (gridSlots.length === 0) return;
    let s0 = gridSlots[0];
    let startX = s0.x;
    let startY = s0.y;
    let gap = 155;

    hintGraphics.lineStyle(6, 0xf1c40f, 0.8);

    for (let i = 0; i < 16; i++) {
        if (gridState[i] === null) {
            let neighbors = getNeighbors(i);
            let isMatch = false;
            for (let n of neighbors) {
                if (gridState[n.i] !== null) {
                    let neighborVal = gridState[n.i];
                    if (activeVal === neighborVal || activeVal % neighborVal === 0 || neighborVal % activeVal === 0) {
                        isMatch = true;
                        break;
                    }
                }
            }
            if (isMatch) {
                let r = Math.floor(i / 4);
                let c = i % 4;
                let x = startX + c * gap;
                let y = startY + r * gap;
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
        let k = createTile(scene, 0, 0, keepSlot); // Pos updated in render
        k.name = 'keepTile';
        k.setScale(0.8);
        // Force layout update to place it correctly
        doResponsiveLayout(scene, scene.scale.width, scene.scale.height);
    }
    showToast(scene, "UNDO!");
    if (hintsEnabled && tileQueue.length > 0) drawHints(scene, tileQueue[0]);
}

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
    let t = scene.add.text(scene.cameras.main.centerX, scene.cameras.main.centerY - 200, msg, {
        fontSize: '40px', fontFamily: 'Arial Black', color: '#fff', stroke: '#000', strokeThickness: 4
    }).setOrigin(0.5).setDepth(200);
    scene.tweens.add({
        targets: t,
        y: t.y - 50,
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
    // Fixed controls relative to screen corners
    // We add them but position them in Resize probably? 
    // For now, let's keep them fixed in the "Camera" view
    let pauseBg = scene.add.circle(60, 60, 35, 0x9b59b6).setDepth(50).setInteractive().setScrollFactor(0);
    let pauseIcon = scene.add.text(60, 60, 'II', { fontSize: '30px', fontFamily: 'Arial Black', color: '#fff' }).setOrigin(0.5).setDepth(51).setScrollFactor(0);
    pauseBg.on('pointerdown', () => togglePause(scene));
    pauseIcon.on('pointerdown', () => togglePause(scene));

    let helpBg = scene.add.circle(scene.scale.width - 60, 60, 35, 0x2ecc71).setDepth(50).setInteractive().setScrollFactor(0);
    let helpIcon = scene.add.text(scene.scale.width - 60, 60, '?', { fontSize: '40px', fontFamily: 'Arial Black', color: '#fff' }).setOrigin(0.5).setDepth(51).setScrollFactor(0);
    helpBg.on('pointerdown', () => showHelp(scene));
    helpIcon.on('pointerdown', () => showHelp(scene));
    
    // Re-align on resize
    scene.scale.on('resize', (gameSize) => {
        helpBg.x = gameSize.width - 60;
        helpIcon.x = gameSize.width - 60;
    });
}

function togglePause(scene) {
    if (isGameOver) return;
    let cx = scene.cameras.main.centerX;
    let cy = scene.cameras.main.centerY;
    
    if (!isPaused) {
        isPaused = true;
        let overlay = scene.add.rectangle(cx, cy, 3000, 3000, 0x000000, 0.7).setDepth(200);
        overlay.name = 'pauseOverlay';
        scene.add.text(cx, cy - 150, 'PAUSED', {
            fontSize: '80px', fontFamily: 'Arial Black', color: '#fff', stroke: '#000', strokeThickness: 6
        }).setOrigin(0.5).setDepth(201).name = 'pauseText';
        let resumeBtn = scene.add.rectangle(cx, cy + 50, 300, 100, 0xf39c12).setInteractive().setDepth(201);
        resumeBtn.name = 'resumeBtn';
        scene.add.text(cx, cy + 50, 'RESUME', { fontSize: '40px', fontFamily: 'Arial Black', color: '#fff' }).setOrigin(0.5).setDepth(202).name = 'resumeTxt';
        resumeBtn.on('pointerdown', () => togglePause(scene));
        let restartBtn = scene.add.rectangle(cx, cy + 200, 300, 100, 0xe74c3c).setInteractive().setDepth(201);
        restartBtn.name = 'restartBtn';
        scene.add.text(cx, cy + 200, 'RESTART', { fontSize: '40px', fontFamily: 'Arial Black', color: '#fff' }).setOrigin(0.5).setDepth(202).name = 'restartTxt';
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
    let cx = scene.cameras.main.centerX;
    let cy = scene.cameras.main.centerY;

    let overlay = scene.add.rectangle(cx, cy, 3000, 3000, 0x000000, 0.8).setDepth(300);
    let box = scene.add.rectangle(cx, cy, 800, 650, 0xffffff).setDepth(301);
    let title = scene.add.text(cx, cy - 250, 'HOW TO PLAY', { fontSize: '50px', color: '#000', fontStyle: 'bold' }).setOrigin(0.5).setDepth(302);
    let instructions = 
        "1. Drag tiles onto the grid.\n" +
        "2. MERGE matching numbers (Score x2).\n" +
        "3. DIVIDE numbers (e.g., 20 ÷ 4 = 5).\n" +
        "4. Use KEEP to save a tile.\n" +
        "5. Use TRASH to discard.\n\n" +
        "SHORTCUTS:\n" + 
        "G = Toggle Hints\n" +
        "Z = Undo | R = Restart | ESC = Pause";
    let body = scene.add.text(cx, cy, instructions, { 
        fontSize: '28px', color: '#333', align: 'center', lineSpacing: 15 
    }).setOrigin(0.5).setDepth(302);
    let closeBtn = scene.add.rectangle(cx, cy + 270, 200, 80, 0xe74c3c).setInteractive().setDepth(302);
    let closeTxt = scene.add.text(cx, cy + 270, 'GOT IT', { fontSize: '30px', fontFamily: 'Arial Black', color: '#fff' }).setOrigin(0.5).setDepth(303);
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
    
    // Use last known panel position
    const qX = window.lastPanelX || 1180;
    const qY = (window.lastPanelY || 600) + 25; // Adjusted offset
    
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
    scene.children.getAll().forEach(child => {
        if (child.name && child.name.startsWith('gridTile_')) child.destroy();
    });
    
    if(gridSlots.length === 0) return;
    
    // Use gridSlots positions
    let gap = 155;
    let s0 = gridSlots[0];
    let startX = s0.x;
    let startY = s0.y;

    for (let i = 0; i < 16; i++) {
        if (gridState[i] !== null) {
            let r = Math.floor(i / 4);
            let c = i % 4;
            let x = startX + c * gap;
            let y = startY + r * gap;
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
    
    // Place new keep tile at correct dynamic position
    let k = createTile(scene, 0, 0, keepSlot);
    k.name = 'keepTile';
    k.setScale(0.8);
    // Trigger re-layout to position it
    doResponsiveLayout(scene, scene.scale.width, scene.scale.height);
    
    renderQueue(scene);
    checkGameOver(scene);
}

function updateUI() {
    scoreText.setText('SCORE ' + score);
    panelElements.txtTrashCount.setText('x' + trashCount);
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
    let cx = scene.cameras.main.centerX;
    let cy = scene.cameras.main.centerY;

    let overlay = scene.add.rectangle(cx, cy, 3000, 3000, 0x000000, 0.7);
    overlay.setInteractive(); 
    overlay.setDepth(100);

    scene.add.text(cx, cy - 100, 'GAME OVER', {
        fontSize: '80px', fontFamily: 'Arial Black', color: '#e74c3c', stroke: '#fff', strokeThickness: 6
    }).setOrigin(0.5).setDepth(101);

    scene.add.text(cx, cy, 'Final Score: ' + score, {
        fontSize: '40px', fontFamily: 'Arial', color: '#fff'
    }).setOrigin(0.5).setDepth(101);

    let btn = scene.add.rectangle(cx, cy + 150, 300, 100, 0x2ecc71).setInteractive().setDepth(101);
    scene.add.text(cx, cy + 150, 'RESTART', {
        fontSize: '40px', fontFamily: 'Arial Black', color: '#fff'
    }).setOrigin(0.5).setDepth(102);

    btn.on('pointerdown', () => restartGame(scene));
}