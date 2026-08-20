/** Small depth-limited searches used to place one piece at a time. */
import { BASIC_MOVES, CubieCube, MOVE_CUBE, multiply } from '../cubie';

const FACE_OF: Record<string, string> = {};
for (const m of BASIC_MOVES) FACE_OF[m] = m[0];
const AXIS: Record<string, number> = { U: 0, D: 0, R: 1, L: 1, F: 2, B: 2 };
/** When two moves share an axis, only this order is explored - the other is a duplicate. */
const FIRST_OF_AXIS: Record<number, string> = { 0: 'U', 1: 'R', 2: 'F' };

export interface PieceSet {
  corners: number[];
  edges: number[];
}

export const piecesSolved = (c: CubieCube, set: PieceSet) =>
  set.corners.every((i) => c.cp[i] === i && c.co[i] === 0) &&
  set.edges.every((i) => c.ep[i] === i && c.eo[i] === 0);

export const mergeSets = (...sets: PieceSet[]): PieceSet => ({
  corners: [...new Set(sets.flatMap((s) => s.corners))],
  edges: [...new Set(sets.flatMap((s) => s.edges))],
});

/**
 * Shortest sequence (up to `maxDepth`) from `start` to a state satisfying
 * `goal`, exploring only `moveSet`. Returns null when nothing is found.
 */
export function findSequence(
  start: CubieCube,
  goal: (c: CubieCube) => boolean,
  maxDepth: number,
  moveSet: readonly string[] = BASIC_MOVES
): string[] | null {
  if (goal(start)) return [];
  const path: string[] = [];

  const dfs = (cube: CubieCube, depth: number, lastFace: string | null): boolean => {
    if (depth === 0) return false;
    for (const m of moveSet) {
      const face = FACE_OF[m];
      if (lastFace) {
        if (face === lastFace) continue;
        if (AXIS[face] === AXIS[lastFace] && face === FIRST_OF_AXIS[AXIS[face]]) continue;
      }
      const next = multiply(cube, MOVE_CUBE[m]);
      path.push(m);
      if (goal(next) || dfs(next, depth - 1, face)) return true;
      path.pop();
    }
    return false;
  };

  for (let limit = 1; limit <= maxDepth; limit++) {
    path.length = 0;
    if (dfs(start, limit, null)) return path.slice();
  }
  return null;
}

/** Moves that only turn the given faces, e.g. facesOnly('RUD'). */
export const facesOnly = (faces: string) =>
  BASIC_MOVES.filter((m) => faces.includes(m[0]));
