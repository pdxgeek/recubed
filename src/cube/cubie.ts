/**
 * Piece-level ("cubie") representation: which corner/edge sits where and how
 * it is twisted. This is what the solvers work on.
 *
 * Facelet indices here are the standard U1..U9, R1..R9, F1..F9, D1..D9, L1..L9,
 * B1..B9 numbering, which is exactly the order of `SLOTS` in ./core.
 */
import {
  COLOR_NAME,
  ColorId,
  CubeState,
  DEFAULT_SCHEME,
  Face,
  FACES,
  Move,
  SLOTS,
  Vec3,
  applyMove,
  parseAlg,
  parseMove,
  solvedState,
} from './core';

export const CORNER_NAMES = ['URF', 'UFL', 'ULB', 'UBR', 'DFR', 'DLF', 'DBL', 'DRB'] as const;
export const EDGE_NAMES = [
  'UR', 'UF', 'UL', 'UB', 'DR', 'DF', 'DL', 'DB', 'FR', 'FL', 'BL', 'BR',
] as const;
export type CornerName = (typeof CORNER_NAMES)[number];
export type EdgeName = (typeof EDGE_NAMES)[number];

export const Corner = Object.fromEntries(CORNER_NAMES.map((n, i) => [n, i])) as Record<CornerName, number>;
export const Edge = Object.fromEntries(EDGE_NAMES.map((n, i) => [n, i])) as Record<EdgeName, number>;

/** Facelet index for face letter + 1-based cell number, e.g. fx('U', 9). */
const fx = (face: Face, n: number) => FACES.indexOf(face) * 9 + (n - 1);

export const CORNER_FACELET: number[][] = [
  [fx('U', 9), fx('R', 1), fx('F', 3)], // URF
  [fx('U', 7), fx('F', 1), fx('L', 3)], // UFL
  [fx('U', 1), fx('L', 1), fx('B', 3)], // ULB
  [fx('U', 3), fx('B', 1), fx('R', 3)], // UBR
  [fx('D', 3), fx('F', 9), fx('R', 7)], // DFR
  [fx('D', 1), fx('L', 9), fx('F', 7)], // DLF
  [fx('D', 7), fx('B', 9), fx('L', 7)], // DBL
  [fx('D', 9), fx('R', 9), fx('B', 7)], // DRB
];

export const EDGE_FACELET: number[][] = [
  [fx('U', 6), fx('R', 2)], // UR
  [fx('U', 8), fx('F', 2)], // UF
  [fx('U', 4), fx('L', 2)], // UL
  [fx('U', 2), fx('B', 2)], // UB
  [fx('D', 6), fx('R', 8)], // DR
  [fx('D', 2), fx('F', 8)], // DF
  [fx('D', 4), fx('L', 8)], // DL
  [fx('D', 8), fx('B', 8)], // DB
  [fx('F', 6), fx('R', 4)], // FR
  [fx('F', 4), fx('L', 6)], // FL
  [fx('B', 6), fx('L', 4)], // BL
  [fx('B', 4), fx('R', 6)], // BR
];

export const CORNER_FACE: Face[][] = [
  ['U', 'R', 'F'], ['U', 'F', 'L'], ['U', 'L', 'B'], ['U', 'B', 'R'],
  ['D', 'F', 'R'], ['D', 'L', 'F'], ['D', 'B', 'L'], ['D', 'R', 'B'],
];

export const EDGE_FACE: Face[][] = [
  ['U', 'R'], ['U', 'F'], ['U', 'L'], ['U', 'B'],
  ['D', 'R'], ['D', 'F'], ['D', 'L'], ['D', 'B'],
  ['F', 'R'], ['F', 'L'], ['B', 'L'], ['B', 'R'],
];

/** Cubie position of each corner and edge slot, in model order. */
export const CORNER_POSITION: Vec3[] = CORNER_FACELET.map((f) => SLOTS[f[0]].pos);
export const EDGE_POSITION: Vec3[] = EDGE_FACELET.map((f) => SLOTS[f[0]].pos);

export interface CubieCube {
  cp: number[]; // cp[i] = corner piece sitting at corner slot i
  co: number[]; // twist 0..2
  ep: number[]; // ep[i] = edge piece sitting at edge slot i
  eo: number[]; // flip 0..1
}

export const IDENTITY: CubieCube = {
  cp: [0, 1, 2, 3, 4, 5, 6, 7],
  co: [0, 0, 0, 0, 0, 0, 0, 0],
  ep: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

export const cloneCubie = (c: CubieCube): CubieCube => ({
  cp: c.cp.slice(), co: c.co.slice(), ep: c.ep.slice(), eo: c.eo.slice(),
});

/** Apply move-cube `m` to state `a`. */
export function multiply(a: CubieCube, m: CubieCube): CubieCube {
  const cp = new Array(8);
  const co = new Array(8);
  for (let i = 0; i < 8; i++) {
    cp[i] = a.cp[m.cp[i]];
    co[i] = (a.co[m.cp[i]] + m.co[i]) % 3;
  }
  const ep = new Array(12);
  const eo = new Array(12);
  for (let i = 0; i < 12; i++) {
    ep[i] = a.ep[m.ep[i]];
    eo[i] = (a.eo[m.ep[i]] + m.eo[i]) % 2;
  }
  return { cp, co, ep, eo };
}

export function invertCubie(c: CubieCube): CubieCube {
  const cp = new Array(8);
  const co = new Array(8);
  const ep = new Array(12);
  const eo = new Array(12);
  for (let i = 0; i < 8; i++) cp[c.cp[i]] = i;
  for (let i = 0; i < 8; i++) co[i] = (3 - c.co[cp[i]]) % 3;
  for (let i = 0; i < 12; i++) ep[c.ep[i]] = i;
  for (let i = 0; i < 12; i++) eo[i] = c.eo[ep[i]];
  return { cp, co, ep, eo };
}

// ---------------------------------------------------------------------------
// Facelets <-> cubies
// ---------------------------------------------------------------------------

export class CubeError extends Error {}

/** Which face each colour belongs to, taken from the six centre stickers. */
export function colorToFaceMap(state: CubeState): Record<string, Face> {
  const map: Record<string, Face> = {};
  for (const face of FACES) {
    const centre = SLOTS.find((s) => s.face === face && s.row === 1 && s.col === 1)!;
    const c = state.colors[centre.index];
    if (!c) throw new CubeError('A centre sticker has no colour.');
    if (map[c]) throw new CubeError(`Two centres are both ${COLOR_NAME[c].toLowerCase()}.`);
    map[c] = face;
  }
  return map;
}

export function stateToCubie(state: CubeState): CubieCube {
  const blanks = state.colors.filter((c) => c === null).length;
  if (blanks) throw new CubeError(`${blanks} sticker${blanks === 1 ? '' : 's'} still blank.`);

  const counts = new Map<ColorId, number>();
  for (const c of state.colors) if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  for (const [c, n] of counts) {
    if (n !== 9) {
      throw new CubeError(
        `There are ${n} ${COLOR_NAME[c].toLowerCase()} stickers; each colour needs exactly 9.`
      );
    }
  }

  const toFace = colorToFaceMap(state);
  const faceAt = (facelet: number): Face => {
    const c = state.colors[facelet];
    if (!c) throw new CubeError('Blank sticker.');
    return toFace[c];
  };

  const cp = new Array(8).fill(-1);
  const co = new Array(8).fill(0);
  for (let i = 0; i < 8; i++) {
    let ori = 0;
    for (; ori < 3; ori++) {
      const f = faceAt(CORNER_FACELET[i][ori]);
      if (f === 'U' || f === 'D') break;
    }
    if (ori === 3) throw new CubeError(`Corner ${CORNER_NAMES[i]} has no white or yellow sticker.`);
    const a = faceAt(CORNER_FACELET[i][(ori + 1) % 3]);
    const b = faceAt(CORNER_FACELET[i][(ori + 2) % 3]);
    let found = -1;
    for (let j = 0; j < 8; j++) {
      if (CORNER_FACE[j][1] === a && CORNER_FACE[j][2] === b) { found = j; break; }
    }
    if (found < 0) throw new CubeError(`Corner ${CORNER_NAMES[i]} is not a real corner of this cube.`);
    cp[i] = found;
    co[i] = ori;
  }

  const ep = new Array(12).fill(-1);
  const eo = new Array(12).fill(0);
  for (let i = 0; i < 12; i++) {
    const a = faceAt(EDGE_FACELET[i][0]);
    const b = faceAt(EDGE_FACELET[i][1]);
    let found = -1;
    for (let j = 0; j < 12; j++) {
      if (EDGE_FACE[j][0] === a && EDGE_FACE[j][1] === b) { ep[i] = j; eo[i] = 0; found = j; break; }
      if (EDGE_FACE[j][1] === a && EDGE_FACE[j][0] === b) { ep[i] = j; eo[i] = 1; found = j; break; }
    }
    if (found < 0) throw new CubeError(`Edge ${EDGE_NAMES[i]} is not a real edge of this cube.`);
  }

  const cube = { cp, co, ep, eo };
  const problem = validate(cube);
  if (problem) throw new CubeError(problem);
  return cube;
}

export function cubieToState(
  cube: CubieCube,
  scheme: Record<Face, ColorId> = DEFAULT_SCHEME
): CubeState {
  const colors: (ColorId | null)[] = new Array(54).fill(null);
  for (const face of FACES) colors[fx(face, 5)] = scheme[face];
  for (let i = 0; i < 8; i++) {
    const j = cube.cp[i];
    const ori = cube.co[i];
    for (let n = 0; n < 3; n++) colors[CORNER_FACELET[i][(n + ori) % 3]] = scheme[CORNER_FACE[j][n]];
  }
  for (let i = 0; i < 12; i++) {
    const j = cube.ep[i];
    const ori = cube.eo[i];
    for (let n = 0; n < 2; n++) colors[EDGE_FACELET[i][(n + ori) % 2]] = scheme[EDGE_FACE[j][n]];
  }
  return { colors, home: SLOTS.map((s) => s.index) };
}

/** Returns a human-readable problem, or null when the cube is solvable. */
export function validate(cube: CubieCube): string | null {
  const seenC = new Set(cube.cp);
  if (seenC.size !== 8) return 'Some corner piece appears twice - check the corner colours.';
  const seenE = new Set(cube.ep);
  if (seenE.size !== 12) return 'Some edge piece appears twice - check the edge colours.';

  const twist = cube.co.reduce((a, b) => a + b, 0) % 3;
  if (twist !== 0) return 'A corner is twisted on its own, which a real cube cannot be.';

  const flip = cube.eo.reduce((a, b) => a + b, 0) % 2;
  if (flip !== 0) return 'An edge is flipped on its own, which a real cube cannot be.';

  const parity = (arr: number[]) => {
    let swaps = 0;
    const a = arr.slice();
    for (let i = 0; i < a.length; i++) {
      while (a[i] !== i) {
        const j = a[i];
        [a[i], a[j]] = [a[j], a[i]];
        swaps++;
      }
    }
    return swaps % 2;
  };
  if (parity(cube.cp) !== parity(cube.ep)) {
    return 'Two pieces are swapped, which a real cube cannot be.';
  }
  return null;
}

export const isCubieSolved = (c: CubieCube) =>
  c.cp.every((v, i) => v === i) && c.co.every((v) => v === 0) &&
  c.ep.every((v, i) => v === i) && c.eo.every((v) => v === 0);

// ---------------------------------------------------------------------------
// Move cubes, derived from the (tested) facelet engine so they cannot drift
// ---------------------------------------------------------------------------

export const BASIC_MOVES = [
  'U', 'U2', "U'", 'R', 'R2', "R'", 'F', 'F2', "F'",
  'D', 'D2', "D'", 'L', 'L2', "L'", 'B', 'B2', "B'",
] as const;
export type BasicMove = (typeof BASIC_MOVES)[number];

export const MOVE_CUBE: Record<string, CubieCube> = {};
for (const m of BASIC_MOVES) {
  MOVE_CUBE[m] = stateToCubie(applyMove(solvedState(), parseMove(m)));
}

export function applyMoveCubie(cube: CubieCube, notation: string): CubieCube {
  const m = MOVE_CUBE[notation];
  if (!m) throw new CubeError(`no cubie move for ${notation}`);
  return multiply(cube, m);
}

export function applyAlgCubie(cube: CubieCube, alg: string | Move[]): CubieCube {
  const moves = typeof alg === 'string' ? parseAlg(alg) : alg;
  let out = cube;
  for (const mv of moves) out = applyMoveCubie(out, mv.notation);
  return out;
}
