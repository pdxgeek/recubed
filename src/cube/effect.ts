/**
 * What a sequence of moves actually does to the cube in front of you.
 *
 * The app used to answer "which pieces does this move?" with a number computed
 * from the *algorithm* on a *solved* cube, and print it under a step whose own
 * notation was something else entirely - the algorithm plus the setup turns
 * that aim it. Measured over 369 beginner steps, that number was right on 112
 * of them. `beg-corner-pos` was the worst: its prose says "no edge moves at
 * all", and the notation printed six lines above it moved four.
 *
 * So there are two questions, and they have two different answers:
 *
 *   - what does this ALGORITHM do, on its own, from solved  -> `Algorithm.corners`
 *     / `.edges` in `algorithms.ts`, which is what the teaching prose is about;
 *   - what do THESE MOVES do to THIS cube -> `piecesMoved`, which is what the
 *     learner is watching.
 *
 * Both are computed from the engine, never written down by hand.
 *
 * No react-native import: `scripts/verify-notes.ts` and `verify-plan.ts` load
 * this directly.
 */
import {
  CubeState,
  Move,
  SLOTS,
  applyAlg,
  cubieKind,
  resetTracking,
  solvedState,
  vecKey,
} from './core';

export interface PieceCount {
  corners: number;
  edges: number;
}

/**
 * Pieces displaced by `moves`, starting from `base`.
 *
 * Displacement, not colour change: a piece counts as moved when it ends up in a
 * different place or a different way up, which is the thing a learner can see
 * happening. Sticker tracking (`CubeState.home`) gives that directly and does
 * not care what colours the cube happens to be wearing, so a half-solved cube
 * is measured the same way a solved one is.
 */
export function piecesMoved(base: CubeState, moves: Move[]): PieceCount {
  const end = applyAlg(resetTracking(base), moves);
  const seen = new Set<string>();
  let corners = 0;
  let edges = 0;
  for (let i = 0; i < SLOTS.length; i++) {
    if (end.home[i] === i) continue;
    const pos = SLOTS[i].pos;
    const key = vecKey(pos);
    if (seen.has(key)) continue;
    seen.add(key);
    const kind = cubieKind(pos);
    if (kind === 3) corners++;
    else if (kind === 2) edges++;
  }
  return { corners, edges };
}

/** The same measurement for an algorithm run on a solved cube. */
export const algPiecesMoved = (moves: Move[]): PieceCount => piecesMoved(solvedState(), moves);

const plural = (n: number, one: string) => (n === 0 ? `no ${one}s` : n === 1 ? `1 ${one}` : `${n} ${one}s`);

/** "4 corners and 3 edges", "3 corners and no edges", "1 corner and 1 edge". */
export const describeCount = (c: PieceCount) =>
  `${plural(c.corners, 'corner')} and ${plural(c.edges, 'edge')}`;

/** The 20 pieces that can move at all - the six centres never do. */
export const MOVABLE_PIECES = 20;
