// ============================================================
// BUNNY RUN! - Predator AI & Movement
// ============================================================

const PREDATOR_MOVE_INTERVAL = 150; // ms per tile step (slower than player)

function initPredators() {
  predators.forEach(pred => {
    pred.moveTimer = 0;
    pred.path = [];
    pred.pathIndex = 0;
    pred.lastPathUpdate = 0;
    pred.pathUpdateInterval = 1000; // recalculate path every 1 second
  });
}

function updatePredators(dt) {
  const lvl = LEVELS[game.level];

  predators.forEach(pred => {
    if (pred.eaten) {
      pred.respawnTimer -= dt;
      if (pred.respawnTimer <= 0) {
        pred.eaten = false;
        pred.frightened = false;
        pred.col = pred.startCol;
        pred.row = pred.startRow;
        pred.x = pred.col * TILE + TILE / 2;
        pred.y = pred.row * TILE + TILE / 2;
        pred.path = [];
        pred.pathIndex = 0;
      }
      return;
    }

    // Frightened timer
    if (pred.frightened) {
      pred.frightenedTimer -= dt;
      if (pred.frightenedTimer <= 0) {
        pred.frightened = false;
      }
    }

    // Update path periodically
    pred.lastPathUpdate += dt;
    if (pred.lastPathUpdate >= pred.pathUpdateInterval) {
      pred.lastPathUpdate = 0;
      pred.path = calculatePath(pred);
      pred.pathIndex = 0;
    }

    // Move along path — tile-by-tile teleport (like the bunny)
    pred.moveTimer += dt;
    if (pred.moveTimer >= PREDATOR_MOVE_INTERVAL) {
      pred.moveTimer = 0;

      if (pred.path.length > 0 && pred.pathIndex < pred.path.length) {
        const nextTile = pred.path[pred.pathIndex];
        const dx = nextTile.col - pred.col;
        const dy = nextTile.row - pred.row;

        if (dx !== 0 || dy !== 0) {
          // Validate destination is walkable before committing
          if (isWalkable(nextTile.col, nextTile.row)) {
            pred.col = nextTile.col;
            pred.row = nextTile.row;
            pred.x = pred.col * TILE + TILE / 2;
            pred.y = pred.row * TILE + TILE / 2;
            pred.pathIndex++;
          } else {
            // Path is stale or blocked — recalculate
            pred.path = calculatePath(pred);
            pred.pathIndex = 0;
          }
        }
      }
    }

    // Tunnel wrap
    if (pred.x < -TILE/2) pred.x = COLS * TILE + TILE/2;
    if (pred.x > COLS * TILE + TILE/2) pred.x = -TILE/2;
  });
}

function calculatePath(pred) {
  const goal = { col: bunny.col, row: bunny.row };

  // Frightened mode: run away (find tile farthest from bunny)
  if (pred.frightened) {
    return calculateFleePath(pred);
  }

  // Different behaviors per type
  switch (pred.type) {
    case 'fox':
      // Direct chase
      return aStar({ col: pred.col, row: pred.row }, goal);

    case 'hawk':
      // Swoop behavior
      pred.behaviorTimer += 16; // approximate dt
      if (pred.behaviorTimer > 3000) {
        pred.behaviorTimer = 0;
        pred.swoopTimer = 1500;
      }
      if (pred.swoopTimer > 0) {
        return aStar({ col: pred.col, row: pred.row }, goal);
      } else {
        // Patrol: move to center
        const patrolGoal = { col: 10, row: 9 };
        const path = aStar({ col: pred.col, row: pred.row }, patrolGoal);
        return path.length > 0 ? path : [patrolGoal];
      }

    case 'snake':
      // Ambush: move to random edge position
      pred.behaviorTimer += 16;
      if (pred.behaviorTimer > 4000) {
        pred.behaviorTimer = 0;
        const edgeTiles = [
          { col: 2, row: 2 }, { col: 18, row: 2 },
          { col: 2, row: 16 }, { col: 18, row: 16 }
        ];
        const randomEdge = edgeTiles[Math.floor(Math.random() * edgeTiles.length)];
        return aStar({ col: pred.col, row: pred.row }, randomEdge);
      }
      return aStar({ col: pred.col, row: pred.row }, goal);

    case 'owl':
      // Circle and swoop
      pred.circleAngle += 0.02;
      const cx = Math.floor(COLS / 2);
      const cy = Math.floor(ROWS / 2);
      const orbitR = Math.min(COLS, ROWS) * 0.35;
      const circleGoal = {
        col: Math.round(cx + Math.cos(pred.circleAngle) * orbitR),
        row: Math.round(cy + Math.sin(pred.circleAngle) * orbitR)
      };

      // Occasionally swoop at bunny
      if (Math.random() < 0.005) {
        return aStar({ col: pred.col, row: pred.row }, goal);
      }
      return aStar({ col: pred.col, row: pred.row }, circleGoal);

    default:
      return aStar({ col: pred.col, row: pred.row }, goal);
  }
}

function calculateFleePath(pred) {
  // Find the walkable tile farthest from the bunny
  let bestTile = null;
  let maxDist = 0;

  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (isWalkableGrid(c, r)) {
        const dist = Math.abs(c - bunny.col) + Math.abs(r - bunny.row);
        if (dist > maxDist) {
          maxDist = dist;
          bestTile = { col: c, row: r };
        }
      }
    }
  }

  if (bestTile) {
    return aStar({ col: pred.col, row: pred.row }, bestTile);
  }

  // If no good tile found, just move randomly
  const dirs = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];
  const randomDir = dirs[Math.floor(Math.random() * dirs.length)];
  const newCol = pred.col + randomDir.x;
  const newRow = pred.row + randomDir.y;
  if (isWalkableGrid(newCol, newRow)) {
    return [{ col: newCol, row: newRow }];
  }
  return [];
}

function drawPredators() {
  const t = game.time;
  ctx.save();
  predators.forEach(pred => {
    if (pred.eaten) return;

  const x = pred.x;
    const y = pred.y;
    const r = TILE * 0.4;

    if (pred.frightened) {
      // Flash blue when frightened
      const flash = Math.sin(t * 0.01) > 0;
      ctx.fillStyle = flash ? '#6666ff' : '#8888ff';
    } else {
      ctx.fillStyle = pred.color;
    }

    // Body
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    const eyeColor = pred.frightened ? '#ffffff' : '#ff4444';
    ctx.fillStyle = eyeColor;
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.2, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + r * 0.3, y - r * 0.2, r * 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Pupils
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.15, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + r * 0.3, y - r * 0.15, r * 0.1, 0, Math.PI * 2);
    ctx.fill();

    // Mouth
    if (pred.frightened) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y + r * 0.2, r * 0.2, 0, Math.PI);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(x, y + r * 0.25, r * 0.15, r * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Type-specific features
    if (pred.type === 'fox') {
      // Fox ears
      ctx.fillStyle = pred.frightened ? '#6666ff' : '#d4700a';
      ctx.beginPath();
      ctx.moveTo(x - r * 0.5, y - r * 0.7);
      ctx.lineTo(x - r * 0.7, y - r * 1.3);
      ctx.lineTo(x - r * 0.1, y - r * 0.8);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + r * 0.5, y - r * 0.7);
      ctx.lineTo(x + r * 0.7, y - r * 1.3);
      ctx.lineTo(x + r * 0.1, y - r * 0.8);
      ctx.fill();
    } else if (pred.type === 'hawk') {
      // Hawk beak
      ctx.fillStyle = '#ffaa00';
      ctx.beginPath();
      ctx.moveTo(x, y + r * 0.1);
      ctx.lineTo(x - r * 0.15, y + r * 0.5);
      ctx.lineTo(x + r * 0.15, y + r * 0.5);
      ctx.fill();
    } else if (pred.type === 'snake') {
      // Snake tongue
      const tongueOut = Math.sin(t * 0.008) > 0;
      if (tongueOut) {
        ctx.strokeStyle = '#ff2222';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y + r * 0.3);
        ctx.lineTo(x, y + r * 0.7);
        ctx.lineTo(x - r * 0.15, y + r * 0.85);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y + r * 0.7);
        ctx.lineTo(x + r * 0.15, y + r * 0.85);
        ctx.stroke();
      }
    } else if (pred.type === 'owl') {
      // Owl ear tufts
      ctx.fillStyle = pred.frightened ? '#6666ff' : '#5a3a6a';
      ctx.beginPath();
      ctx.moveTo(x - r * 0.6, y - r * 0.5);
      ctx.lineTo(x - r * 0.8, y - r * 1.2);
      ctx.lineTo(x - r * 0.3, y - r * 0.7);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + r * 0.6, y - r * 0.5);
      ctx.lineTo(x + r * 0.8, y - r * 1.2);
      ctx.lineTo(x + r * 0.3, y - r * 0.7);
      ctx.fill();
    }
  });
  ctx.restore();
}
