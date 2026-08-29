import {
  GAME_WIDTH,
  GAME_HEIGHT,
  TOKEN_RADIUS,
  GRID_COLS,
  GRID_ROWS,
  GRID_PADDING,
  TOKEN_CONFIG,
  MAX_TOKENS_ON_SCREEN,
  TokenType,
} from '@/utils/constants';

export interface SpawnPoint {
  x: number;
  y: number;
}

// --- Seeded PRNG (mulberry32) ---
export function createSeededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

export function generateGridSpawnPoints(): SpawnPoint[] {
  const points: SpawnPoint[] = [];
  const cellW = (GAME_WIDTH - GRID_PADDING * 2) / GRID_COLS;
  const cellH = (GAME_HEIGHT - GRID_PADDING * 2) / GRID_ROWS;

  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const x = Math.round(GRID_PADDING + col * cellW + cellW / 2);
      const y = Math.round(GRID_PADDING + row * cellH + cellH / 2);
      points.push({ x, y });
    }
  }

  return points;
}

// rng defaults to Math.random for backwards-compat / free mode
export function pickRandomTokenType(rng: () => number = Math.random): TokenType {
  const rand = rng() * 100;
  let cumulative = 0;

  for (const type of ['blue', 'gold', 'red', 'golden'] as TokenType[]) {
    cumulative += TOKEN_CONFIG[type].spawnWeight;
    if (rand <= cumulative) return type;
  }

  return 'blue';
}

export function selectSpawnPositions(
  occupiedPositions: Set<string>,
  spawnPoints: SpawnPoint[],
  count: number,
  rng: () => number = Math.random,
): SpawnPoint[] {
  const available = spawnPoints.filter(
    (p) => !occupiedPositions.has(`${p.x},${p.y}`),
  );

  const selected: SpawnPoint[] = [];
  const occupiedList: SpawnPoint[] = [];
  
  for (const str of occupiedPositions) {
    const [xStr, yStr] = str.split(',');
    occupiedList.push({ x: Number(xStr), y: Number(yStr) });
  }

  const numToSelect = Math.min(count, MAX_TOKENS_ON_SCREEN, available.length);
  const NUM_CANDIDATES = 5;

  for (let i = 0; i < numToSelect; i++) {
    if (available.length === 0) break;

    // If board is empty, pick completely randomly
    if (occupiedList.length === 0 && selected.length === 0) {
      const idx = Math.floor(rng() * available.length);
      selected.push(available[idx]);
      available.splice(idx, 1);
      continue;
    }

    let bestCandidateIdx = -1;
    let maxMinDist = -1;

    // Pick random candidates and choose the one furthest from existing tokens
    const candidatesToCheck = Math.min(NUM_CANDIDATES, available.length);
    for (let c = 0; c < candidatesToCheck; c++) {
      const candidateIdx = Math.floor(rng() * available.length);
      const candidate = available[candidateIdx];

      let minDistSq = Infinity;

      // Distance to previously occupied
      for (const p of occupiedList) {
        const dx = candidate.x - p.x;
        const dy = candidate.y - p.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < minDistSq) minDistSq = distSq;
      }

      // Distance to already selected in this batch
      for (const p of selected) {
        const dx = candidate.x - p.x;
        const dy = candidate.y - p.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < minDistSq) minDistSq = distSq;
      }

      if (minDistSq > maxMinDist) {
        maxMinDist = minDistSq;
        bestCandidateIdx = candidateIdx;
      }
    }

    if (bestCandidateIdx !== -1) {
      selected.push(available[bestCandidateIdx]);
      available.splice(bestCandidateIdx, 1);
    }
  }

  return selected;
}

export function positionKey(x: number, y: number): string {
  return `${x},${y}`;
}
