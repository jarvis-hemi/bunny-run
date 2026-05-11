// ============================================================
// BUNNY RUN! - Game Logic
// ============================================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ---- GAME STATE ----
let game = {
  state: 'menu', // menu, playing, paused, gameover, levelComplete, levelTransition
  level: 0,
  score: 0,
  lives: 3,
  highScore: parseInt(localStorage.getItem('bunnyRunHighScore') || '0'),
  totalCarrots: 0,
  totalBerries: 0,
  time: 0,
  lastTime: 0,
  dt: 0,
  map: [],
  collectibles: [],
  powerUp: null,
  powerTimer: 0,
  powerDuration: 8000, // 8 seconds
  particles: [],
  announceTimer: 0,
  announceText: '',
  levelStartTime: 0,
  spawnTimer: 0, // invincibility timer after spawning
  spawnDuration: 3000, // 3 seconds of invincibility at spawn
};

// ---- BUNNY ----
let bunny = {
  col: 10, row: 9,
  x: 10 * TILE + TILE/2,
  y: 9 * TILE + TILE/2,
  dir: { x: 0, y: 0 },
  nextDir: { x: 0, y: 0 },
  speed: 2.5,
  radius: TILE * 0.35,
  mouthOpen: 0,
  mouthDir: 1,
  invincible: false,
  invincibleFlash: 0,
};

// ---- PREDATORS ----
let predators = [];

// ---- AUDIO ----
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

function playSound(freq, duration, type = 'square', volume = 0.15) {
  if (!audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch(e) {}
}

function playEat() { playSound(600 + Math.random()*200, 0.08, 'square', 0.1); }
function eatBerry() { playSound(800, 0.12, 'sine', 0.12); }
function eatMushroom() {
  playSound(400, 0.15, 'sine', 0.15);
  setTimeout(() => playSound(600, 0.15, 'sine', 0.15), 100);
  setTimeout(() => playSound(800, 0.2, 'sine', 0.15), 200);
}
function eatPredator() { playSound(300, 0.3, 'sawtooth', 0.1); }
function loseLife() {
  playSound(200, 0.5, 'sawtooth', 0.15);
  setTimeout(() => playSound(150, 0.5, 'sawtooth', 0.15), 200);
}
function levelComplete() {
  [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playSound(f, 0.3, 'sine', 0.12), i * 150));
}

// ---- INPUT ----
let keys = {};
let touchDir = null;

// Mobile D-pad detection — show if touch device, or always show as fallback
function isTouchDevice() {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;
}
const mobileControls = document.getElementById('mobile-controls');
if (isTouchDevice()) {
  mobileControls.style.display = 'block';
}

document.addEventListener('keydown', e => {
  keys[e.key] = true;
  const keyMap = {
    'ArrowUp': { x: 0, y: -1 }, 'ArrowDown': { x: 0, y: 1 },
    'ArrowLeft': { x: -1, y: 0 }, 'ArrowRight': { x: 1, y: 0 },
    'w': { x: 0, y: -1 }, 's': { x: 0, y: 1 },
    'a': { x: -1, y: 0 }, 'd': { x: 1, y: 0 },
  };
  if (keyMap[e.key]) {
    bunny.nextDir = keyMap[e.key];
    e.preventDefault();
  }
});
document.addEventListener('keyup', e => { keys[e.key] = false; });

// Mobile D-pad
document.querySelectorAll('.d-pad-btn[data-dir]').forEach(btn => {
  const dir = btn.dataset.dir;
  const dirs = {
    up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
    left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
  };
  const handler = (e) => { e.preventDefault(); bunny.nextDir = dirs[dir]; };
  btn.addEventListener('touchstart', handler, { passive: false });
  btn.addEventListener('mousedown', handler);
});

// ---- MAP HELPERS ----
function canMove(col, row) {
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return false;
  return game.map[row][col] !== WALL;
}

function isWalkable(col, row) {
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return false;
  const t = game.map[row][col];
  return t !== WALL && t !== TREE;
}

// ---- PARTICLES ----
function spawnParticles(x, y, color, count = 8) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 3;
    game.particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: 0.02 + Math.random() * 0.02,
      color,
      size: 2 + Math.random() * 4,
    });
  }
}

function updateParticles() {
  for (let i = game.particles.length - 1; i >= 0; i--) {
    const p = game.particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life -= p.decay;
    if (p.life <= 0) game.particles.splice(i, 1);
  }
}

function drawParticles() {
  game.particles.forEach(p => {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

// ---- LEVEL SETUP ----
function loadLevel(idx) {
  const lvl = LEVELS[idx % LEVELS.length];
  game.level = idx % LEVELS.length;
  game.map = lvl.map.map(row => [...row]);
  game.collectibles = [];
  game.powerUp = null;
  game.powerTimer = 0;
  game.particles = [];
  game.powerDuration = Math.max(5000, 8000 - idx * 1000);

  // Count collectibles
  let carrotCount = 0, berryCount = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (game.map[r][c] === CARROT) carrotCount++;
      if (game.map[r][c] === BERRY) berryCount++;
    }
  }
  game.totalCarrots = carrotCount;
  game.totalBerries = berryCount;

  // Set bunny position
  bunny.col = lvl.bunnyStart.col;
  bunny.row = lvl.bunnyStart.row;
  bunny.x = lvl.bunnyStart.col * TILE + TILE / 2;
  bunny.y = lvl.bunnyStart.row * TILE + TILE / 2;
  bunny.dir = { x: 0, y: 0 };
  bunny.nextDir = { x: 0, y: 0 };
  bunny.invincible = false;

  // Set spawn invincibility
  game.spawnTimer = game.spawnDuration;

  // Set predators
  predators = lvl.predators.map(p => ({
    ...p,
    col: p.col,
    row: p.row,
    x: p.col * TILE + TILE / 2,
    y: p.row * TILE + TILE / 2,
    dir: { x: 0, y: 0 },
    speed: 1.8 + idx * 0.2,
    frightened: false,
    frightenedTimer: 0,
    eaten: false,
    respawnTimer: 0,
    behaviorTimer: 0,
    swoopTimer: 0,
    circleAngle: Math.random() * Math.PI * 2,
  }));

  // Add mushrooms
  lvl.mushroomPositions.forEach(mp => {
    game.map[mp.row][mp.col] = MUSHROOM;
  });

  // Add hearts
  lvl.heartPositions.forEach(hp => {
    if (game.map[hp.row][hp.col] === EMPTY || game.map[hp.row][hp.col] === PATH) {
      game.map[hp.row][hp.col] = HEART;
    }
  });

  // Collectible list
  game.collectibles = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = game.map[r][c];
      if (t === CARROT || t === BERRY || t === MUSHROOM) {
        game.collectibles.push({ col: c, row: r, type: t, x: c * TILE + TILE/2, y: r * TILE + TILE/2 });
      }
    }
  }

  // Show level announcement
  game.announceText = lvl.name;
  game.announceTimer = 2;

  // Reset power
  game.powerTimer = 0;

  // Update UI
  document.getElementById('level-text').textContent = lvl.name;
  updateHUD();

  // Show level screen briefly
  showLevelAnnounce();
}

function showLevelAnnounce() {
  const el = document.getElementById('level-announce');
  el.textContent = `🌿 ${game.announceText}`;
  el.style.opacity = '1';
  setTimeout(() => { el.style.opacity = '0'; }, 2000);
}

// ---- BUNNY UPDATE ----
function updateBunny() {
  // Try to change direction
  if (bunny.nextDir.x !== 0 || bunny.nextDir.y !== 0) {
    const nextCol = Math.floor(bunny.x / TILE);
    const nextRow = Math.floor(bunny.y / TILE);
    // Check if we can move in the next direction
    if (isWalkable(nextCol + bunny.nextDir.x, nextRow + bunny.nextDir.y)) {
      bunny.dir = { ...bunny.nextDir };
    }
  }

  if (bunny.dir.x === 0 && bunny.dir.y === 0) return;

  const speed = bunny.speed * (game.dt / 16.67); // normalize to ~60fps
  const newX = bunny.x + bunny.dir.x * speed;
  const newY = bunny.y + bunny.dir.y * speed;

  // Check wall collision with margin
  const margin = bunny.radius * 0.55;
  let canMoveX = true, canMoveY = true;

  if (bunny.dir.x !== 0) {
    const testCol = bunny.dir.x > 0 ? Math.floor((newX + margin) / TILE) : Math.floor((newX - margin) / TILE);
    const topRow = Math.floor((bunny.y - bunny.radius) / TILE);
    const botRow = Math.floor((bunny.y + bunny.radius) / TILE);
    canMoveX = isWalkable(testCol, topRow) && (topRow === botRow || isWalkable(testCol, botRow));
  }
  if (bunny.dir.y !== 0) {
    const testRow = bunny.dir.y > 0 ? Math.floor((newY + margin) / TILE) : Math.floor((newY - margin) / TILE);
    const leftCol = Math.floor((bunny.x - bunny.radius) / TILE);
    const rightCol = Math.floor((bunny.x + bunny.radius) / TILE);
    canMoveY = isWalkable(leftCol, testRow) && (leftCol === rightCol || isWalkable(rightCol, testRow));
  }

  if (canMoveX) bunny.x = newX;
  if (canMoveY) bunny.y = newY;

  // Tunnel wrap
  if (bunny.x < -TILE/2) bunny.x = COLS * TILE + TILE/2;
  if (bunny.x > COLS * TILE + TILE/2) bunny.x = -TILE/2;

  // Update grid position
  bunny.col = Math.round(bunny.x / TILE);
  bunny.row = Math.round(bunny.y / TILE);

  // Mouth animation
  bunny.mouthOpen += bunny.mouthDir * 0.15;
  if (bunny.mouthOpen > 1 || bunny.mouthOpen < 0) bunny.mouthDir *= -1;

  // Invincibility flash
  if (bunny.invincible) {
    bunny.invincibleFlash += 0.1;
  }
}

// ---- PREDATOR AI ----
function updatePredators() {
  const lvl = LEVELS[game.level];

  predators.forEach(pred => {
    if (pred.eaten) {
      pred.respawnTimer -= game.dt;
      if (pred.respawnTimer <= 0) {
        pred.eaten = false;
        pred.frightened = false;
        pred.x = pred.col * TILE + TILE / 2;
        pred.y = pred.row * TILE + TILE / 2;
        pred.dir = { x: 0, y: 0 };
      }
      return;
    }

    // Frightened timer
    if (pred.frightened) {
      pred.frightenedTimer -= game.dt;
      if (pred.frightenedTimer <= 0) {
        pred.frightened = false;
      }
    }

    const speed = (pred.frightened ? pred.speed * 0.6 : pred.speed) * (game.dt / 16.67);
    let targetX, targetY;

    if (pred.frightened) {
      // Run away from bunny
      targetX = bunny.x;
      targetY = bunny.y;
    } else {
      // Different behaviors per type
      switch (pred.type) {
        case 'fox':
          // Direct chase
          targetX = bunny.x;
          targetY = bunny.y;
          break;
        case 'hawk':
          // Swoop behavior
          pred.behaviorTimer += game.dt;
          if (pred.behaviorTimer > 3000) {
            pred.behaviorTimer = 0;
            pred.swoopTimer = 1500;
          }
          if (pred.swoopTimer > 0) {
            pred.swoopTimer -= game.dt;
            targetX = bunny.x;
            targetY = bunny.y;
          } else {
            // Patrol
            targetX = 5 * TILE + TILE/2;
            targetY = 5 * TILE + TILE/2;
          }
          break;
        case 'snake':
          // Ambush - move along edges
          pred.behaviorTimer += game.dt;
          if (pred.behaviorTimer > 4000) {
            pred.behaviorTimer = 0;
            const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }];
            pred.dir = dirs[Math.floor(Math.random() * dirs.length)];
          }
          targetX = bunny.x;
          targetY = bunny.y;
          break;
        case 'owl':
          // Circle and swoop
          pred.circleAngle += 0.02;
          const cx = COLS * TILE / 2;
          const cy = ROWS * TILE / 2;
          const orbitR = Math.min(COLS, ROWS) * TILE * 0.35;
          targetX = cx + Math.cos(pred.circleAngle) * orbitR;
          targetY = cy + Math.sin(pred.circleAngle) * orbitR;
          // Occasionally swoop
          if (Math.random() < 0.005) {
            targetX = bunny.x;
            targetY = bunny.y;
          }
          break;
      }
    }

     // Move towards target
      const dx = targetX - pred.x;
      const dy = targetY - pred.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 5) {
        const moveX = (dx / dist) * speed;
        const moveY = (dy / dist) * speed;

        const nextCol = Math.round((pred.x + moveX) / TILE);
        const nextRow = Math.round((pred.y + moveY) / TILE);

        // Try straight movement first
        if (isWalkable(nextCol, nextRow)) {
          pred.x += moveX;
          pred.y += moveY;
        } else {
          // Try moving along axes
          const altX = Math.round((pred.x + moveX) / TILE);
          const altY = Math.round(pred.y / TILE);
          if (isWalkable(altX, altY)) {
            pred.x += moveX;
            pred.y = altY * TILE + TILE / 2;
          } else {
            const altX2 = Math.round(pred.x / TILE);
            const altY2 = Math.round((pred.y + moveY) / TILE);
            if (isWalkable(altX2, altY2)) {
              pred.x = altX2 * TILE + TILE / 2;
              pred.y += moveY;
            }
          }
        }

        pred.dir = { x: dist > 0 ? moveX / speed : 0, y: dist > 0 ? moveY / speed : 0 };
      }

      // Tunnel wrap
      if (pred.x < -TILE/2) pred.x = COLS * TILE + TILE/2;
      if (pred.x > COLS * TILE + TILE/2) pred.x = -TILE/2;

    pred.col = Math.round(pred.x / TILE);
    pred.row = Math.round(pred.y / TILE);
  });
}

// ---- COLLISIONS ----
function checkCollectibles() {
  for (let i = game.collectibles.length - 1; i >= 0; i--) {
    const c = game.collectibles[i];
    const dist = Math.sqrt((bunny.x - c.x) ** 2 + (bunny.y - c.y) ** 2);
    if (dist < bunny.radius + TILE * 0.3) {
      if (c.type === CARROT) {
        game.score += 10;
        game.totalCarrots--;
        playEat();
        spawnParticles(c.x, c.y, '#ff6600', 6);
      } else if (c.type === BERRY) {
        game.score += 25;
        game.totalBerries--;
        eatBerry();
        spawnParticles(c.x, c.y, '#ff3366', 8);
      } else if (c.type === MUSHROOM) {
        game.score += 50;
        eatMushroom();
        bunny.invincible = true;
        game.powerTimer = game.powerDuration;
        spawnParticles(c.x, c.y, '#ff4444', 12);
        spawnParticles(c.x, c.y, '#ffffff', 8);
      } else if (c.type === HEART) {
        if (game.lives < 5) game.lives++;
        game.score += 100;
        playEat();
        spawnParticles(c.x, c.y, '#ff4488', 10);
      }
      game.collectibles.splice(i, 1);
      updateHUD();
    }
  }
}

function checkPredatorCollisions() {
  predators.forEach(pred => {
    if (pred.eaten) return;
    const dist = Math.sqrt((bunny.x - pred.x) ** 2 + (bunny.y - pred.y) ** 2);
    if (dist < bunny.radius + TILE * 0.35) {
      if (pred.frightened) {
        // Eat predator
        pred.eaten = true;
        pred.respawnTimer = 5000;
        game.score += 200;
        eatPredator();
        spawnParticles(pred.x, pred.y, '#ffff00', 15);
      } else {
        // Lose life — but not during spawn invincibility
        game.spawnTimer -= game.dt;
        if (game.spawnTimer > 0) {
          // Still in spawn invincibility, don't lose life
          return;
        }
        loseLife();
        game.lives--;
        updateHUD();

        if (game.lives <= 0) {
          gameOver();
          return;
        }

        // Reset positions
        const lvl = LEVELS[game.level];
        bunny.x = lvl.bunnyStart.col * TILE + TILE/2;
        bunny.y = lvl.bunnyStart.row * TILE + TILE/2;
        bunny.dir = { x: 0, y: 0 };
        bunny.nextDir = { x: 0, y: 0 };
        bunny.invincible = false;

        predators.forEach(p => {
          p.frightened = false;
          p.frightenedTimer = 0;
          p.dir = { x: 0, y: 0 };
        });
      }
    }
  });
}

function checkLevelComplete() {
  if (game.collectibles.length === 0) {
    game.state = 'levelComplete';
    levelComplete();

    if (game.score > game.highScore) {
      game.highScore = game.score;
      localStorage.setItem('bunnyRunHighScore', game.highScore.toString());
    }

    const elapsed = ((Date.now() - game.levelStartTime) / 1000).toFixed(1);

    const screen = document.getElementById('level-screen');
    document.getElementById('level-title').textContent = '🌟 Level Complete!';
    document.getElementById('level-subtitle').textContent = `${LEVELS[game.level].name}`;
    document.getElementById('level-score').textContent = `Score: ${game.score}  |  Time: ${elapsed}s`;
    screen.style.display = 'flex';
  }
}

// ---- HUD ----
function updateHUD() {
  document.getElementById('score-text').textContent = game.score;
  let hearts = '';
  for (let i = 0; i < game.lives; i++) hearts += '❤️';
  for (let i = game.lives; i < 5; i++) hearts += '🖤';
  document.getElementById('lives-text').textContent = hearts;

  const powerBar = document.getElementById('power-bar-container');
  const powerFill = document.getElementById('power-fill');
  if (bunny.invincible) {
    powerBar.style.display = 'block';
    powerFill.style.width = (game.powerTimer / game.powerDuration * 100) + '%';
  } else {
    powerBar.style.display = 'none';
  }
}

// ---- DRAWING ----
function drawMap() {
  const lvl = LEVELS[game.level];
  const time = game.time;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = c * TILE;
      const y = r * TILE;
      const t = game.map[r][c];

      if (t === WALL) {
        // Wall with rounded corners
        ctx.fillStyle = lvl.wallColor;
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = lvl.wallTop;
        ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);

        // Wall highlight
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(x + 2, y + 2, TILE - 4, 2);
      } else if (t === PATH || t === EMPTY) {
        ctx.fillStyle = lvl.pathColor;
        ctx.fillRect(x, y, TILE, TILE);
      } else if (t === TREE) {
        ctx.fillStyle = lvl.pathColor;
        ctx.fillRect(x, y, TILE, TILE);
        // Tree
        ctx.fillStyle = '#3a2a1a';
        ctx.fillRect(x + TILE/2 - 3, y + TILE * 0.6, 6, TILE * 0.4);
        ctx.fillStyle = '#2a6a2a';
        ctx.beginPath();
        ctx.arc(x + TILE/2, y + TILE * 0.5, TILE * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3a8a3a';
        ctx.beginPath();
        ctx.arc(x + TILE/2 - 2, y + TILE * 0.45, TILE * 0.25, 0, Math.PI * 2);
        ctx.fill();
      } else if (t === FLOWER) {
        ctx.fillStyle = lvl.pathColor;
        ctx.fillRect(x, y, TILE, TILE);
        // Small flower
        const colors = ['#ff6688', '#ffaa44', '#ff44aa', '#88aaff'];
        ctx.fillStyle = colors[(r + c) % colors.length];
        ctx.beginPath();
        ctx.arc(x + TILE/2, y + TILE/2, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#4a8a3a';
        ctx.fillRect(x + TILE/2 - 1, y + TILE/2, 2, 6);
      }

      // Draw collectibles
      const col = game.collectibles.find(cc => cc.col === c && cc.row === r);
      if (col) {
        const cx = c * TILE + TILE/2;
        const cy = r * TILE + TILE/2;
        const bob = Math.sin(time * 0.005 + c + r) * 2;

        if (col.type === CARROT) {
          // Carrot
          ctx.fillStyle = '#ff8800';
          ctx.beginPath();
          ctx.ellipse(cx, cy + bob + 3, 4, 8, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#44aa22';
          ctx.fillRect(cx - 1, cy + bob - 8, 2, 6);
          ctx.fillRect(cx - 3, cy + bob - 6, 6, 2);
        } else if (col.type === BERRY) {
          // Berry
          ctx.fillStyle = '#ff2266';
          ctx.beginPath();
          ctx.arc(cx, cy + bob, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.3)';
          ctx.beginPath();
          ctx.arc(cx - 2, cy + bob - 2, 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#22aa44';
          ctx.fillRect(cx - 1, cy + bob - 7, 2, 4);
        } else if (col.type === MUSHROOM) {
          // Mushroom
          const pulse = 1 + Math.sin(time * 0.008) * 0.1;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(cx - 3, cy + bob, 6, 8);
          ctx.fillStyle = '#ff3333';
          ctx.beginPath();
          ctx.arc(cx, cy + bob, 7 * pulse, Math.PI, 0);
          ctx.fill();
          // Dots
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(cx - 3, cy + bob - 3, 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(cx + 3, cy + bob - 2, 1.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (col.type === HEART) {
          // Heart
          const pulse = 1 + Math.sin(time * 0.006) * 0.15;
          ctx.fillStyle = '#ff4488';
          ctx.save();
          ctx.translate(cx, cy + bob);
          ctx.scale(pulse, pulse);
          ctx.beginPath();
          ctx.moveTo(0, 3);
          ctx.bezierCurveTo(-6, -3, -8, -8, 0, -4);
          ctx.bezierCurveTo(8, -8, 6, -3, 0, 3);
          ctx.fill();
          ctx.restore();
        }
      }
    }
  }
}

function drawBunny() {
  const x = bunny.x;
  const y = bunny.y;
  const r = bunny.radius;
  const t = game.time;

  // Invincibility glow
  if (bunny.invincible) {
    const glow = Math.sin(t * 0.01) * 0.3 + 0.4;
    ctx.fillStyle = `rgba(255, 255, 100, ${glow})`;
    ctx.beginPath();
    ctx.arc(x, y, r + 8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Spawn invincibility glow
  if (game.spawnTimer > 0) {
    const glow = Math.sin(t * 0.008) * 0.2 + 0.3;
    ctx.fillStyle = `rgba(100, 255, 100, ${glow})`;
    ctx.beginPath();
    ctx.arc(x, y, r + 12, 0, Math.PI * 2);
    ctx.fill();
    // Countdown ring
    ctx.strokeStyle = `rgba(100, 255, 100, ${0.5 + Math.sin(t * 0.01) * 0.3})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r + 10, -Math.PI/2, -Math.PI/2 + (game.spawnTimer / game.spawnDuration) * Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  ctx.save();
  ctx.translate(x, y);

  // Body
  const flash = bunny.invincible && Math.sin(t * 0.015) > 0;
  ctx.fillStyle = flash ? '#ffff88' : '#ffffff';
  ctx.beginPath();
  ctx.ellipse(0, 2, r * 0.8, r, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.fillStyle = flash ? '#ffff88' : '#ffffff';
  ctx.beginPath();
  ctx.arc(0, -r * 0.5, r * 0.65, 0, Math.PI * 2);
  ctx.fill();

  // Ears
  ctx.fillStyle = flash ? '#ffff88' : '#ffffff';
  ctx.beginPath();
  ctx.ellipse(-r * 0.25, -r * 1.4, r * 0.15, r * 0.5, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(r * 0.25, -r * 1.4, r * 0.15, r * 0.5, 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Inner ears
  ctx.fillStyle = flash ? '#ffaaaa' : '#ffcccc';
  ctx.beginPath();
  ctx.ellipse(-r * 0.25, -r * 1.3, r * 0.08, r * 0.3, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(r * 0.25, -r * 1.3, r * 0.08, r * 0.3, 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#333';
  ctx.beginPath();
  ctx.arc(-r * 0.22, -r * 0.6, r * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(r * 0.22, -r * 0.6, r * 0.12, 0, Math.PI * 2);
  ctx.fill();

  // Eye shine
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(-r * 0.18, -r * 0.65, r * 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(r * 0.26, -r * 0.65, r * 0.05, 0, Math.PI * 2);
  ctx.fill();

  // Nose
  ctx.fillStyle = '#ff88aa';
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.35, r * 0.08, r * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();

  // Mouth (wink when eating)
  if (bunny.mouthOpen > 0.5) {
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, -r * 0.2, r * 0.15, 0, Math.PI);
    ctx.stroke();
  }

  // Cheeks
  ctx.fillStyle = 'rgba(255, 150, 170, 0.4)';
  ctx.beginPath();
  ctx.arc(-r * 0.45, -r * 0.35, r * 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(r * 0.45, -r * 0.35, r * 0.15, 0, Math.PI * 2);
  ctx.fill();

  // Tail
  ctx.fillStyle = flash ? '#ffff88' : '#ffffff';
  ctx.beginPath();
  ctx.arc(r * 0.7, r * 0.5, r * 0.25, 0, Math.PI * 2);
  ctx.fill();

  // Feet
  ctx.fillStyle = flash ? '#ffff88' : '#ffffff';
  ctx.beginPath();
  ctx.ellipse(-r * 0.3, r * 0.8, r * 0.25, r * 0.15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(r * 0.3, r * 0.8, r * 0.25, r * 0.15, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawPredator(pred) {
  if (pred.eaten) return;
  const x = pred.x;
  const y = pred.y;
  const r = TILE * 0.4;
  const t = game.time;

  ctx.save();
  ctx.translate(x, y);

  if (pred.frightened) {
    // Flash blue when frightened
    const flash = Math.sin(t * 0.01) > 0;
    ctx.fillStyle = flash ? '#6666ff' : '#8888ff';
  } else {
    ctx.fillStyle = pred.color;
  }

  // Body
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  const eyeColor = pred.frightened ? '#ffffff' : '#ff4444';
  ctx.fillStyle = eyeColor;
  ctx.beginPath();
  ctx.arc(-r * 0.3, -r * 0.2, r * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(r * 0.3, -r * 0.2, r * 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Pupils
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(-r * 0.3, -r * 0.15, r * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(r * 0.3, -r * 0.15, r * 0.1, 0, Math.PI * 2);
  ctx.fill();

  // Mouth
  if (pred.frightened) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, r * 0.2, r * 0.2, 0, Math.PI);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.25, r * 0.15, r * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Type-specific features
  if (pred.type === 'fox') {
    // Fox ears
    ctx.fillStyle = pred.frightened ? '#6666ff' : '#d4700a';
    ctx.beginPath();
    ctx.moveTo(-r * 0.5, -r * 0.7);
    ctx.lineTo(-r * 0.7, -r * 1.3);
    ctx.lineTo(-r * 0.1, -r * 0.8);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(r * 0.5, -r * 0.7);
    ctx.lineTo(r * 0.7, -r * 1.3);
    ctx.lineTo(r * 0.1, -r * 0.8);
    ctx.fill();
  } else if (pred.type === 'hawk') {
    // Hawk beak
    ctx.fillStyle = '#ffaa00';
    ctx.beginPath();
    ctx.moveTo(0, r * 0.1);
    ctx.lineTo(-r * 0.15, r * 0.5);
    ctx.lineTo(r * 0.15, r * 0.5);
    ctx.fill();
  } else if (pred.type === 'snake') {
    // Snake tongue
    const tongueOut = Math.sin(t * 0.008) > 0;
    if (tongueOut) {
      ctx.strokeStyle = '#ff2222';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, r * 0.3);
      ctx.lineTo(0, r * 0.7);
      ctx.lineTo(-r * 0.15, r * 0.85);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, r * 0.7);
      ctx.lineTo(r * 0.15, r * 0.85);
      ctx.stroke();
    }
  } else if (pred.type === 'owl') {
    // Owl ear tufts
    ctx.fillStyle = pred.frightened ? '#6666ff' : '#5a3a6a';
    ctx.beginPath();
    ctx.moveTo(-r * 0.6, -r * 0.5);
    ctx.lineTo(-r * 0.8, -r * 1.2);
    ctx.lineTo(-r * 0.3, -r * 0.7);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(r * 0.6, -r * 0.5);
    ctx.lineTo(r * 0.8, -r * 1.2);
    ctx.lineTo(r * 0.3, -r * 0.7);
    ctx.fill();
  }

  ctx.restore();
}

function drawBackground() {
  const lvl = LEVELS[game.level];
  // Background
  ctx.fillStyle = lvl.bg;
  ctx.fillRect(0, 0, COLS * TILE, ROWS * TILE);

  // Ambient particles (fireflies at night)
  if (lvl.dayPhase > 0.5) {
    const alpha = (lvl.dayPhase - 0.5) * 2;
    for (let i = 0; i < 8; i++) {
      const fx = (Math.sin(game.time * 0.001 + i * 2.3) * 0.5 + 0.5) * COLS * TILE;
      const fy = (Math.cos(game.time * 0.0008 + i * 1.7) * 0.5 + 0.5) * ROWS * TILE;
      const glow = Math.sin(game.time * 0.003 + i) * 0.5 + 0.5;
      ctx.fillStyle = `rgba(200, 255, 100, ${alpha * glow * 0.3})`;
      ctx.beginPath();
      ctx.arc(fx, fy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Ground texture dots
  ctx.fillStyle = 'rgba(255,255,255,0.02)';
  for (let i = 0; i < 30; i++) {
    const gx = ((i * 137 + game.level * 53) % (COLS * TILE));
    const gy = ((i * 89 + game.level * 31) % (ROWS * TILE));
    ctx.beginPath();
    ctx.arc(gx, gy, 1, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---- GAME OVER ----
function gameOver() {
  game.state = 'gameover';
  if (game.score > game.highScore) {
    game.highScore = game.score;
    localStorage.setItem('bunnyRunHighScore', game.highScore.toString());
  }
  document.getElementById('score-display').textContent = `Score: ${game.score}`;
  document.getElementById('stats-display').innerHTML =
    `High Score: ${game.highScore}<br>Levels: ${game.level + 1}<br>Carrots: ${game.totalCarrots}  Berries: ${game.totalBerries}`;
  document.getElementById('gameover-screen').style.display = 'flex';
  document.getElementById('hud').style.display = 'none';
  document.getElementById('mobile-controls').style.display = 'none';
}

// ---- GAME LOOP ----
function update(dt) {
  if (game.state !== 'playing') return;

  game.time += dt;
  game.dt = dt;

  updateBunny();
  updatePredators();
  checkCollectibles();
  checkPredatorCollisions();
  updateParticles();

  // Power timer
  if (bunny.invincible) {
    game.powerTimer -= dt;
    if (game.powerTimer <= 0) {
      bunny.invincible = false;
      game.powerTimer = 0;
    }
  }

  updateHUD();
  checkLevelComplete();
}

function draw() {
  // Clear
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (game.state === 'playing' || game.state === 'levelComplete') {
    drawBackground();
    drawMap();
    drawPredators();
    drawBunny();
    drawParticles();
  }
}

function drawPredators() {
  predators.forEach(p => drawPredator(p));
}

function gameLoop(timestamp) {
  if (!game.lastTime) game.lastTime = timestamp;
  const dt = Math.min(timestamp - game.lastTime, 50);
  game.lastTime = timestamp;

  update(dt);
  draw();

  requestAnimationFrame(gameLoop);
}

// ---- CANVAS RESIZE ----
function resizeCanvas() {
  const maxW = Math.min(window.innerWidth - 16, COLS * TILE + 32);
  const maxH = Math.min(window.innerHeight - 80, ROWS * TILE + 64);
  const scale = Math.min(maxW / (COLS * TILE), maxH / (ROWS * TILE));
  canvas.width = COLS * TILE;
  canvas.height = ROWS * TILE;
  const displayW = Math.floor(COLS * TILE * scale);
  const displayH = Math.floor(ROWS * TILE * scale);
  canvas.style.width = displayW + 'px';
  canvas.style.height = displayH + 'px';
  const marginTop = Math.max(0, Math.floor((window.innerHeight - 80 - displayH) / 2));
  canvas.style.marginTop = marginTop + 'px';
}

window.addEventListener('resize', resizeCanvas);

// ---- UI HANDLERS ----
document.getElementById('btn-start').addEventListener('click', () => {
  initAudio();
  game.score = 0;
  game.lives = 3;
  game.levelStartTime = Date.now();
  document.getElementById('menu-screen').style.display = 'none';
  document.getElementById('hud').style.display = 'flex';
  mobileControls.style.display = 'block';
  loadLevel(0);
  game.state = 'playing';
  resizeCanvas();
});

document.getElementById('btn-howto').addEventListener('click', () => {
  document.getElementById('howto-screen').style.display = 'flex';
});

document.getElementById('btn-back').addEventListener('click', () => {
  document.getElementById('howto-screen').style.display = 'none';
});

document.getElementById('btn-restart').addEventListener('click', () => {
  initAudio();
  game.score = 0;
  game.lives = 3;
  game.levelStartTime = Date.now();
  document.getElementById('gameover-screen').style.display = 'none';
  document.getElementById('hud').style.display = 'flex';
  mobileControls.style.display = 'block';
  loadLevel(0);
  game.state = 'playing';
  resizeCanvas();
});

document.getElementById('btn-next').addEventListener('click', () => {
  initAudio();
  document.getElementById('level-screen').style.display = 'none';
  mobileControls.style.display = 'block';
  loadLevel(game.level + 1);
  game.state = 'playing';
  game.levelStartTime = Date.now();
});

// ---- INIT ----
resizeCanvas();
requestAnimationFrame(gameLoop);
