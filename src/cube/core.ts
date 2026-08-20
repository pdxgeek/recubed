/**
 * Cube geometry, state and move engine.
 *
 * Coordinate system (matches three.js world space):
 *   +X -> R   -X -> L
 *   +Y -> U   -Y -> D
 *   +Z -> F   -Z -> B
 *
 * A cubie sits at an integer position (x, y, z) with each component in {-1, 0, 1}.
 * A *sticker slot* is a (position, outward normal) pair; there are exactly 54.
 * Cube state is the list of stickers currently occupying those 54 slots, so
 * slots are fixed in space and stickers permute between them.
 */

export type Axis = 0 | 1 | 2;
export type Vec3 = readonly [number, number, number];

export const FACES = ['U', 'R', 'F', 'D', 'L', 'B'] as const;
export type Face = (typeof FACES)[number];

export const FACE_NORMAL: Record<Face, Vec3> = {
  U: [0, 1, 0],
  R: [1, 0, 0],
  F: [0, 0, 1],
  D: [0, -1, 0],
  L: [-1, 0, 0],
  B: [0, 0, -1],
};

/** Sticker colours. `null` means "not assigned yet" (paint mode). */
export type ColorId = 'W' | 'Y' | 'G' | 'B' | 'R' | 'O';
export const COLOR_IDS: ColorId[] = ['W', 'Y', 'G', 'B', 'R', 'O'];

export const COLOR_HEX: Record<ColorId, string> = {
  W: '#f5f5f7',
  Y: '#ffd400',
  G: '#009e4f',
  B: '#0051ba',
  R: '#d8241f',
  O: '#ff6b17',
};

export const COLOR_NAME: Record<ColorId, string> = {
  W: 'White',
  Y: 'Yellow',
  G: 'Green',
  B: 'Blue',
  R: 'Red',
  O: 'Orange',
};

/** Standard western / BOY colour scheme. Centres are fixed by this. */
export const DEFAULT_SCHEME: Record<Face, ColorId> = {
  U: 'W',
  D: 'Y',
  F: 'G',
  B: 'B',
  R: 'R',
  L: 'O',
};

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------

export interface Slot {
  index: number;
  pos: Vec3;
  normal: Vec3;
  face: Face;
  /** row/col of this sticker within its face, reading the face head-on. */
  row: number;
  col: number;
}

/** Position of the cubie carrying sticker (face, row, col), read head-on. */
function faceCell(face: Face, r: number, c: number): Vec3 {
  switch (face) {
    case 'U':
      return [c - 1, 1, r - 1];
    case 'D':
      return [c - 1, -1, 1 - r];
    case 'F':
      return [c - 1, 1 - r, 1];
    case 'B':
      return [1 - c, 1 - r, -1];
    case 'R':
      return [1, 1 - r, 1 - c];
    case 'L':
      return [-1, 1 - r, c - 1];
  }
}

export const vecKey = (v: Vec3) => `${v[0]},${v[1]},${v[2]}`;
export const slotKey = (pos: Vec3, normal: Vec3) => `${vecKey(pos)}|${vecKey(normal)}`;

export const SLOTS: Slot[] = (() => {
  const out: Slot[] = [];
  for (const face of FACES) {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        out.push({
          index: out.length,
          pos: faceCell(face, r, c),
          normal: FACE_NORMAL[face],
          face,
          row: r,
          col: c,
        });
      }
    }
  }
  return out;
})();

const SLOT_BY_KEY = new Map<string, number>(SLOTS.map((s) => [slotKey(s.pos, s.normal), s.index]));

export function slotAt(pos: Vec3, normal: Vec3): number {
  const i = SLOT_BY_KEY.get(slotKey(pos, normal));
  if (i === undefined) throw new Error(`no slot at ${slotKey(pos, normal)}`);
  return i;
}

/** All 27 cubie positions. */
export const CUBIES: Vec3[] = (() => {
  const out: Vec3[] = [];
  for (let x = -1; x <= 1; x++)
    for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) out.push([x, y, z]);
  return out;
})();

/** Slot indices grouped by the cubie they live on. */
export const SLOTS_BY_CUBIE = new Map<string, number[]>();
for (const s of SLOTS) {
  const k = vecKey(s.pos);
  const list = SLOTS_BY_CUBIE.get(k);
  if (list) list.push(s.index);
  else SLOTS_BY_CUBIE.set(k, [s.index]);
}

export const CUBIE_BY_KEY = new Map<string, Vec3>(CUBIES.map((p) => [vecKey(p), p]));

export const isCenter = (p: Vec3) => Math.abs(p[0]) + Math.abs(p[1]) + Math.abs(p[2]) === 1;
export const isCore = (p: Vec3) => p[0] === 0 && p[1] === 0 && p[2] === 0;

/** How many stickers a cubie has: 3 = corner, 2 = edge, 1 = centre, 0 = core. */
export const cubieKind = (p: Vec3) => Math.abs(p[0]) + Math.abs(p[1]) + Math.abs(p[2]);

// ---------------------------------------------------------------------------
// Rotation
// ---------------------------------------------------------------------------

/** Rotate an integer vector by `q` right-handed quarter turns about +axis. */
export function rotateVec(v: Vec3, axis: Axis, q: number): Vec3 {
  let [x, y, z] = v;
  const n = ((q % 4) + 4) % 4;
  for (let i = 0; i < n; i++) {
    if (axis === 0) {
      const ny = -z;
      const nz = y;
      y = ny;
      z = nz;
    } else if (axis === 1) {
      const nx = z;
      const nz = -x;
      x = nx;
      z = nz;
    } else {
      const nx = -y;
      const ny = x;
      x = nx;
      y = ny;
    }
  }
  return [x, y, z];
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

export interface MoveDef {
  /** Coordinate axis the layer spins about. */
  axis: Axis;
  /** Which coordinate values along `axis` are carried by the move. */
  layers: number[];
  /**
   * Right-handed quarter turns about +axis produced by ONE clockwise turn of
   * this move. A face turn is clockwise seen from outside that face, which is
   * -1 quarter turns about the outward normal.
   */
  turnsPerClockwise: number;
}

const D = (axis: Axis, layers: number[], turnsPerClockwise: number): MoveDef => ({
  axis,
  layers,
  turnsPerClockwise,
});

export const MOVE_DEFS: Record<string, MoveDef> = {
  // faces
  U: D(1, [1], -1),
  D: D(1, [-1], 1),
  R: D(0, [1], -1),
  L: D(0, [-1], 1),
  F: D(2, [1], -1),
  B: D(2, [-1], 1),
  // slices (M follows L, E follows D, S follows F)
  M: D(0, [0], 1),
  E: D(1, [0], 1),
  S: D(2, [0], -1),
  // wide (two layers)
  Rw: D(0, [0, 1], -1),
  Lw: D(0, [-1, 0], 1),
  Uw: D(1, [0, 1], -1),
  Dw: D(1, [-1, 0], 1),
  Fw: D(2, [0, 1], -1),
  Bw: D(2, [-1, 0], 1),
  // whole cube rotations
  x: D(0, [-1, 0, 1], -1),
  y: D(1, [-1, 0, 1], -1),
  z: D(2, [-1, 0, 1], -1),
};

export interface Move {
  /** Canonical notation, e.g. `R'`, `U2`, `Rw`. */
  notation: string;
  base: string;
  /** 1 = clockwise, -1 = counter-clockwise, 2 = half turn. */
  amount: number;
}

const LOWER_WIDE: Record<string, string> = {
  r: 'Rw',
  l: 'Lw',
  u: 'Uw',
  d: 'Dw',
  f: 'Fw',
  b: 'Bw',
};

export function parseMove(token: string): Move {
  const m = /^([UDRLFBMES]w?|[xyz]|[rludfb])(2'?|'2?|)$/.exec(token.replace(/[｀’′]/g, "'"));
  if (!m) throw new Error(`unparseable move: "${token}"`);
  let base = m[1];
  if (LOWER_WIDE[base]) base = LOWER_WIDE[base];
  if (!MOVE_DEFS[base]) throw new Error(`unknown move base: "${base}"`);
  const suffix = m[2];
  const amount = suffix.startsWith('2') ? 2 : suffix === "'" ? -1 : suffix.includes('2') ? 2 : 1;
  const notation = base + (amount === 2 ? '2' : amount === -1 ? "'" : '');
  return { notation, base, amount };
}

export function parseAlg(alg: string): Move[] {
  return alg
    .trim()
    .split(/[\s,]+/)
    .filter((t) => t.length > 0 && t !== '(' && t !== ')')
    .map((t) => t.replace(/[()]/g, ''))
    .filter((t) => t.length > 0)
    .map(parseMove);
}

export const invertMove = (mv: Move): Move =>
  parseMove(mv.base + (mv.amount === 2 ? '2' : mv.amount === 1 ? "'" : ''));

export const formatAlg = (moves: Move[]) => moves.map((m) => m.notation).join(' ');

/** Signed quarter turns about the positive basis axis for this move. */
export function moveQuarterTurns(mv: Move): number {
  return MOVE_DEFS[mv.base].turnsPerClockwise * mv.amount;
}

/** Slot indices carried by a move (used for both permutation and animation). */
export function movedSlots(mv: Move): number[] {
  const def = MOVE_DEFS[mv.base];
  return SLOTS.filter((s) => def.layers.includes(s.pos[def.axis])).map((s) => s.index);
}

/** Cubie positions carried by a move. */
export function movedCubies(mv: Move): Vec3[] {
  const def = MOVE_DEFS[mv.base];
  return CUBIES.filter((p) => def.layers.includes(p[def.axis]));
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface CubeState {
  /** colors[slot] = colour of the sticker currently in that slot. */
  colors: (ColorId | null)[];
  /** home[slot] = index of the slot this sticker started in. Tracks pieces. */
  home: number[];
}

export function solvedState(scheme: Record<Face, ColorId> = DEFAULT_SCHEME): CubeState {
  return {
    colors: SLOTS.map((s) => scheme[s.face]),
    home: SLOTS.map((s) => s.index),
  };
}

/** Centres filled in from the scheme, every other sticker blank. */
export function blankState(scheme: Record<Face, ColorId> = DEFAULT_SCHEME): CubeState {
  return {
    colors: SLOTS.map((s) => (isCenter(s.pos) ? scheme[s.face] : null)),
    home: SLOTS.map((s) => s.index),
  };
}

export function cloneState(st: CubeState): CubeState {
  return { colors: st.colors.slice(), home: st.home.slice() };
}

export function applyMove(st: CubeState, mv: Move): CubeState {
  const def = MOVE_DEFS[mv.base];
  const q = moveQuarterTurns(mv);
  const colors = st.colors.slice();
  const home = st.home.slice();
  for (const s of SLOTS) {
    if (!def.layers.includes(s.pos[def.axis])) continue;
    const target = slotAt(rotateVec(s.pos, def.axis, q), rotateVec(s.normal, def.axis, q));
    colors[target] = st.colors[s.index];
    home[target] = st.home[s.index];
  }
  return { colors, home };
}

export function applyAlg(st: CubeState, alg: string | Move[]): CubeState {
  const moves = typeof alg === 'string' ? parseAlg(alg) : alg;
  return moves.reduce(applyMove, st);
}

/** Reset piece tracking without touching colours. */
export function resetTracking(st: CubeState): CubeState {
  return { colors: st.colors.slice(), home: SLOTS.map((s) => s.index) };
}

/**
 * Slot indices whose sticker is displaced by `alg` when run on a solved cube.
 * These identify the pieces an algorithm actually operates on.
 */
export function algAffectedSlots(alg: string | Move[]): number[] {
  const end = applyAlg(solvedState(), alg);
  const out: number[] = [];
  for (let i = 0; i < 54; i++) if (end.home[i] !== i) out.push(end.home[i]);
  return out;
}

/** Cubie positions an algorithm operates on. */
export function algAffectedCubies(alg: string | Move[]): Vec3[] {
  const seen = new Set<string>();
  const out: Vec3[] = [];
  for (const slot of algAffectedSlots(alg)) {
    const p = SLOTS[slot].pos;
    const k = vecKey(p);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(p);
    }
  }
  return out;
}

/** Slot index of the centre sticker of a face. */
export const CENTER_SLOT: Record<Face, number> = Object.fromEntries(
  FACES.map((f) => [f, SLOTS.findIndex((s) => s.face === f && s.row === 1 && s.col === 1)])
) as Record<Face, number>;

export const isSolved = (st: CubeState) =>
  SLOTS.every((s) => st.colors[s.index] !== null && st.colors[s.index] === st.colors[CENTER_SLOT[s.face]]);
