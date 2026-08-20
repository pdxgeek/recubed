/**
 * Two-phase solver (Kociemba). Phase 1 reduces the cube to the subgroup
 * <U, D, R2, L2, F2, B2>; phase 2 finishes inside it. Typical results are
 * 20-23 moves, which is close to optimal and far shorter than any
 * human method.
 *
 * Tables are built once on first use (~1-2s) and cached for the session.
 */
import { BASIC_MOVES, CubieCube, IDENTITY, MOVE_CUBE, cloneCubie, multiply } from '../cubie';

// ---------------------------------------------------------------------------
// Move indexing
// ---------------------------------------------------------------------------

const N_MOVES = 18;
/** BASIC_MOVES order is U U2 U' R R2 R' F F2 F' D D2 D' L L2 L' B B2 B'. */
const FACE_INDEX = (m: number) => (m / 3) | 0; // 0=U 1=R 2=F 3=D 4=L 5=B
const OPPOSITE_OFFSET = 3;

/** Moves allowed in phase 2: quarter turns of U/D plus half turns elsewhere. */
const G1_MOVES = [0, 1, 2, 4, 7, 9, 10, 11, 13, 16];

const N_TWIST = 2187;
const N_FLIP = 2048;
const N_SLICE = 495;
const N_PERM8 = 40320;
const N_PERM4 = 24;

// ---------------------------------------------------------------------------
// Coordinates
// ---------------------------------------------------------------------------

const CNK: number[][] = Array.from({ length: 13 }, (_, n) =>
  Array.from({ length: 13 }, (_, k) => {
    if (k > n) return 0;
    let r = 1;
    for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
    return Math.round(r);
  })
);

function rotateLeft(a: number[], l: number, r: number) {
  const t = a[l];
  for (let i = l; i < r; i++) a[i] = a[i + 1];
  a[r] = t;
}
function rotateRight(a: number[], l: number, r: number) {
  const t = a[r];
  for (let i = r; i > l; i--) a[i] = a[i - 1];
  a[l] = t;
}

/** Lehmer-style index of a permutation of `n` consecutive values. */
function permToIndex(src: number[], offset: number, n: number): number {
  const p = new Array(n);
  for (let i = 0; i < n; i++) p[i] = src[offset + i] - offset;
  let b = 0;
  for (let j = n - 1; j > 0; j--) {
    let k = 0;
    while (p[j] !== j) {
      rotateLeft(p, 0, j);
      k++;
    }
    b = (j + 1) * b + k;
  }
  return b;
}

function indexToPerm(index: number, n: number, offset: number): number[] {
  const p = Array.from({ length: n }, (_, i) => i);
  let b = index;
  for (let j = 1; j < n; j++) {
    let k = b % (j + 1);
    b = (b / (j + 1)) | 0;
    while (k-- > 0) rotateRight(p, 0, j);
  }
  return p.map((v) => v + offset);
}

const getTwist = (c: CubieCube) => {
  let t = 0;
  for (let i = 0; i < 7; i++) t = 3 * t + c.co[i];
  return t;
};
function setTwist(c: CubieCube, t: number) {
  let sum = 0;
  let v = t;
  for (let i = 6; i >= 0; i--) {
    c.co[i] = v % 3;
    sum += c.co[i];
    v = (v / 3) | 0;
  }
  c.co[7] = (3 - (sum % 3)) % 3;
}

const getFlip = (c: CubieCube) => {
  let f = 0;
  for (let i = 0; i < 11; i++) f = 2 * f + c.eo[i];
  return f;
};
function setFlip(c: CubieCube, f: number) {
  let sum = 0;
  let v = f;
  for (let i = 10; i >= 0; i--) {
    c.eo[i] = v % 2;
    sum += c.eo[i];
    v = (v / 2) | 0;
  }
  c.eo[11] = sum % 2;
}

/** Which four slots hold the middle-slice edges, ignoring their order. */
function getSlice(c: CubieCube) {
  let a = 0;
  let x = 0;
  for (let j = 11; j >= 0; j--) {
    if (c.ep[j] >= 8) {
      a += CNK[11 - j][x + 1];
      x++;
    }
  }
  return a;
}
function setSlice(c: CubieCube, idx: number) {
  const slice = [8, 9, 10, 11];
  const others = [0, 1, 2, 3, 4, 5, 6, 7];
  for (let j = 0; j < 12; j++) c.ep[j] = -1;
  let a = idx;
  let x = 4;
  for (let j = 0; j < 12; j++) {
    if (a - CNK[11 - j][x] >= 0) {
      c.ep[j] = slice[4 - x];
      a -= CNK[11 - j][x];
      x--;
    }
  }
  let k = 0;
  for (let j = 0; j < 12; j++) if (c.ep[j] === -1) c.ep[j] = others[k++];
}

const getCornerPerm = (c: CubieCube) => permToIndex(c.cp, 0, 8);
const getUdPerm = (c: CubieCube) => permToIndex(c.ep, 0, 8);
const getSlicePerm = (c: CubieCube) => permToIndex(c.ep, 8, 4);

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

interface Tables {
  twistMove: Int16Array;
  flipMove: Int16Array;
  sliceMove: Int16Array;
  cornerPermMove: Int32Array;
  udPermMove: Int32Array;
  slicePermMove: Int32Array;
  pruneTwistSlice: Uint8Array;
  pruneFlipSlice: Uint8Array;
  pruneCornerSlice: Uint8Array;
  pruneUdSlice: Uint8Array;
}

let tables: Tables | null = null;

function blankCube(): CubieCube {
  return cloneCubie(IDENTITY);
}

/** Breadth-first fill of a pruning table over a product coordinate. */
function buildPruning(
  size: number,
  start: number,
  moves: number[],
  next: (state: number, move: number) => number
): Uint8Array {
  const depth = new Uint8Array(size).fill(0xff);
  const queue = new Int32Array(size);
  depth[start] = 0;
  queue[0] = start;
  let head = 0;
  let tail = 1;
  while (head < tail) {
    const state = queue[head++];
    const d = depth[state] + 1;
    for (const m of moves) {
      const n = next(state, m);
      if (depth[n] === 0xff) {
        depth[n] = d;
        queue[tail++] = n;
      }
    }
  }
  return depth;
}

export function buildTables(): Tables {
  if (tables) return tables;

  const twistMove = new Int16Array(N_TWIST * N_MOVES);
  const flipMove = new Int16Array(N_FLIP * N_MOVES);
  const sliceMove = new Int16Array(N_SLICE * N_MOVES);

  const work = blankCube();
  for (let t = 0; t < N_TWIST; t++) {
    setTwist(work, t);
    for (let m = 0; m < N_MOVES; m++) {
      twistMove[t * N_MOVES + m] = getTwist(multiply(work, MOVE_CUBE[BASIC_MOVES[m]]));
    }
  }
  const work2 = blankCube();
  for (let f = 0; f < N_FLIP; f++) {
    setFlip(work2, f);
    for (let m = 0; m < N_MOVES; m++) {
      flipMove[f * N_MOVES + m] = getFlip(multiply(work2, MOVE_CUBE[BASIC_MOVES[m]]));
    }
  }
  const work3 = blankCube();
  for (let s = 0; s < N_SLICE; s++) {
    setSlice(work3, s);
    for (let m = 0; m < N_MOVES; m++) {
      sliceMove[s * N_MOVES + m] = getSlice(multiply(work3, MOVE_CUBE[BASIC_MOVES[m]]));
    }
  }

  const cornerPermMove = new Int32Array(N_PERM8 * N_MOVES);
  const udPermMove = new Int32Array(N_PERM8 * N_MOVES);
  const slicePermMove = new Int32Array(N_PERM4 * N_MOVES);

  const wc = blankCube();
  for (let p = 0; p < N_PERM8; p++) {
    wc.cp = indexToPerm(p, 8, 0);
    for (const m of G1_MOVES) {
      cornerPermMove[p * N_MOVES + m] = getCornerPerm(multiply(wc, MOVE_CUBE[BASIC_MOVES[m]]));
    }
  }
  const we = blankCube();
  for (let p = 0; p < N_PERM8; p++) {
    const head = indexToPerm(p, 8, 0);
    for (let i = 0; i < 8; i++) we.ep[i] = head[i];
    for (let i = 8; i < 12; i++) we.ep[i] = i;
    for (const m of G1_MOVES) {
      udPermMove[p * N_MOVES + m] = getUdPerm(multiply(we, MOVE_CUBE[BASIC_MOVES[m]]));
    }
  }
  const ws = blankCube();
  for (let p = 0; p < N_PERM4; p++) {
    const tail = indexToPerm(p, 4, 8);
    for (let i = 0; i < 8; i++) ws.ep[i] = i;
    for (let i = 0; i < 4; i++) ws.ep[8 + i] = tail[i];
    for (const m of G1_MOVES) {
      slicePermMove[p * N_MOVES + m] = getSlicePerm(multiply(ws, MOVE_CUBE[BASIC_MOVES[m]]));
    }
  }

  const allMoves = Array.from({ length: N_MOVES }, (_, i) => i);
  const pruneTwistSlice = buildPruning(N_TWIST * N_SLICE, 0, allMoves, (state, m) => {
    const t = (state / N_SLICE) | 0;
    const s = state % N_SLICE;
    return twistMove[t * N_MOVES + m] * N_SLICE + sliceMove[s * N_MOVES + m];
  });
  const pruneFlipSlice = buildPruning(N_FLIP * N_SLICE, 0, allMoves, (state, m) => {
    const f = (state / N_SLICE) | 0;
    const s = state % N_SLICE;
    return flipMove[f * N_MOVES + m] * N_SLICE + sliceMove[s * N_MOVES + m];
  });
  const pruneCornerSlice = buildPruning(N_PERM8 * N_PERM4, 0, G1_MOVES, (state, m) => {
    const c = (state / N_PERM4) | 0;
    const s = state % N_PERM4;
    return cornerPermMove[c * N_MOVES + m] * N_PERM4 + slicePermMove[s * N_MOVES + m];
  });
  const pruneUdSlice = buildPruning(N_PERM8 * N_PERM4, 0, G1_MOVES, (state, m) => {
    const u = (state / N_PERM4) | 0;
    const s = state % N_PERM4;
    return udPermMove[u * N_MOVES + m] * N_PERM4 + slicePermMove[s * N_MOVES + m];
  });

  tables = {
    twistMove, flipMove, sliceMove,
    cornerPermMove, udPermMove, slicePermMove,
    pruneTwistSlice, pruneFlipSlice, pruneCornerSlice, pruneUdSlice,
  };
  return tables;
}

export const tablesReady = () => tables !== null;

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface SolveOptions {
  /** Stop once a solution this short is found. */
  targetLength?: number;
  /** Give up looking for something better after this many milliseconds. */
  timeBudgetMs?: number;
  maxPhase1Depth?: number;
}

const allowed = (move: number, lastFace: number) => {
  if (lastFace < 0) return true;
  const face = FACE_INDEX(move);
  if (face === lastFace) return false;
  // Same axis: only ever explore U before D, R before L, F before B.
  if (face + OPPOSITE_OFFSET === lastFace) return false;
  return true;
};

export function solveKociemba(cube: CubieCube, options: SolveOptions = {}): number[] {
  const t = buildTables();
  const target = options.targetLength ?? 21;
  const budget = options.timeBudgetMs ?? 1200;
  const maxDepth1 = options.maxPhase1Depth ?? 12;
  let deadline = Date.now() + budget;

  const found: { best: number[] | null } = { best: null };

  // Phase 2 -------------------------------------------------------------
  const phase2 = (start: CubieCube, limit: number, lastFace: number): number[] | null => {
    const cornStart = getCornerPerm(start);
    const udStart = getUdPerm(start);
    const sliceStart = getSlicePerm(start);
    const path: number[] = [];

    const heuristic = (corn: number, ud: number, sl: number) =>
      Math.max(
        t.pruneCornerSlice[corn * N_PERM4 + sl],
        t.pruneUdSlice[ud * N_PERM4 + sl]
      );

    const dfs = (corn: number, ud: number, sl: number, depth: number, last: number): boolean => {
      if (corn === 0 && ud === 0 && sl === 0) return true;
      if (depth === 0) return false;
      if (heuristic(corn, ud, sl) > depth) return false;
      for (const m of G1_MOVES) {
        if (!allowed(m, last)) continue;
        const nc = t.cornerPermMove[corn * N_MOVES + m];
        const nu = t.udPermMove[ud * N_MOVES + m];
        const ns = t.slicePermMove[sl * N_MOVES + m];
        path.push(m);
        if (dfs(nc, nu, ns, depth - 1, FACE_INDEX(m))) return true;
        path.pop();
      }
      return false;
    };

    for (let d = heuristic(cornStart, udStart, sliceStart); d <= limit; d++) {
      path.length = 0;
      if (dfs(cornStart, udStart, sliceStart, d, lastFace)) return path.slice();
    }
    return null;
  };

  // Phase 1 -------------------------------------------------------------
  const twist0 = getTwist(cube);
  const flip0 = getFlip(cube);
  const slice0 = getSlice(cube);
  const path1: number[] = [];

  const h1 = (tw: number, fl: number, sl: number) =>
    Math.max(t.pruneTwistSlice[tw * N_SLICE + sl], t.pruneFlipSlice[fl * N_SLICE + sl]);

  const tryPhase2 = (): boolean => {
    let mid = cube;
    for (const m of path1) mid = multiply(mid, MOVE_CUBE[BASIC_MOVES[m]]);
    const cap = (found.best ? found.best.length : 31) - path1.length - 1;
    if (cap < 0) return false;
    const lastFace = path1.length ? FACE_INDEX(path1[path1.length - 1]) : -1;
    const tail = phase2(mid, Math.min(cap, 18), lastFace);
    if (!tail) return false;
    const total = [...path1, ...tail];
    if (!found.best || total.length < found.best.length) found.best = total;
    return true;
  };

  const dfs1 = (tw: number, fl: number, sl: number, depth: number, last: number): boolean => {
    if (Date.now() > deadline) return true; // out of time: unwind
    if (tw === 0 && fl === 0 && sl === 0) {
      tryPhase2();
      return found.best !== null && found.best.length <= target;
    }
    if (depth === 0) return false;
    if (h1(tw, fl, sl) > depth) return false;
    for (let m = 0; m < N_MOVES; m++) {
      if (!allowed(m, last)) continue;
      const nt = t.twistMove[tw * N_MOVES + m];
      const nf = t.flipMove[fl * N_MOVES + m];
      const ns = t.sliceMove[sl * N_MOVES + m];
      path1.push(m);
      if (dfs1(nt, nf, ns, depth - 1, FACE_INDEX(m))) return true;
      path1.pop();
    }
    return false;
  };

  for (let d = h1(twist0, flip0, slice0); d <= maxDepth1; d++) {
    path1.length = 0;
    if (dfs1(twist0, flip0, slice0, d, -1)) break;
    if (found.best && found.best.length <= target) break;
    if (Date.now() > deadline && found.best) break;
  }

  if (!found.best) {
    // Nothing inside the budget: keep going without one until a solution exists.
    deadline = Infinity;
    for (let d = h1(twist0, flip0, slice0); d <= 14 && !found.best; d++) {
      path1.length = 0;
      dfs1(twist0, flip0, slice0, d, -1);
    }
  }
  return found.best ?? [];
}

export const movesToNotation = (moves: number[]) => moves.map((m) => BASIC_MOVES[m]);
