// ============================================================
// BUNNY RUN! - A* Pathfinding
// ============================================================

function isWalkableGrid(col, row) {
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return false;
  const t = game.map[row][col];
  return t !== WALL && t !== TREE;
}

function heuristic(a, b) {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
}

function aStar(start, goal) {
  const openSet = [];
  const closedSet = new Set();
  const cameFrom = {};
  const gScore = {};
  const fScore = {};

  const startKey = `${start.col},${start.row}`;
  const goalKey = `${goal.col},${goal.row}`;

  gScore[startKey] = 0;
  fScore[startKey] = heuristic(start, goal);
  openSet.push({ col: start.col, row: start.row, key: startKey, f: fScore[startKey] });

  while (openSet.length > 0) {
    // Find node with lowest fScore
    let current = openSet[0];
    let currentIndex = 0;
    for (let i = 1; i < openSet.length; i++) {
      if (openSet[i].f < current.f) {
        current = openSet[i];
        currentIndex = i;
      }
    }

    // Current is goal
    if (current.key === goalKey) {
      // Reconstruct path
      const path = [];
      let c = goalKey;
      while (c in cameFrom) {
        const [col, row] = c.split(',').map(Number);
        path.unshift({ col, row });
        c = cameFrom[c];
      }
      return path;
    }

    closedSet.add(current.key);
    openSet.splice(currentIndex, 1);

    // Get neighbors (4 directions: up, down, left, right)
    const neighbors = [
      { col: current.col, row: current.row - 1 }, // up
      { col: current.col, row: current.row + 1 }, // down
      { col: current.col - 1, row: current.row }, // left
      { col: current.col + 1, row: current.row }, // right
    ];

    for (const neighbor of neighbors) {
      const neighborKey = `${neighbor.col},${neighbor.row}`;

      // Skip if not walkable or already evaluated
      if (!isWalkableGrid(neighbor.col, neighbor.row) || closedSet.has(neighborKey)) {
        continue;
      }

      const tentativeG = gScore[current.key] + 1;

      if (!gScore[neighborKey] || tentativeG < gScore[neighborKey]) {
        cameFrom[neighborKey] = current.key;
        gScore[neighborKey] = tentativeG;
        fScore[neighborKey] = tentativeG + heuristic(neighbor, goal);

        if (!openSet.find(n => n.key === neighborKey)) {
          openSet.push({ col: neighbor.col, row: neighbor.row, key: neighborKey, f: fScore[neighborKey] });
        }
      }
    }
  }

  // No path found
  return [];
}
