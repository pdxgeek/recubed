/**
 * Stepping through one step of a plan.
 *
 * A plan step's `prelude` is absolute: it lists every move from the cube the
 * plan was built for, so that any step can be picked out and practised without
 * doing the ones before it. That only works if it is applied to the cube the
 * plan was built for. Applying it to whatever happens to be on screen - the
 * previous step's starting position, say - stacks one prelude on top of another
 * and demonstrates the algorithm on a cube it does not apply to.
 *
 * Hence `origin`: the cube the current plan describes, kept apart from the cube
 * being stepped through.
 */
import { CubeState, Move, applyMove, cloneState, invertMove, resetTracking } from './core';
import { applyAlg } from './core';
import { PlanStep } from './solver/plan';

export interface Playback {
  /** The cube the plan was built from. Never changed by stepping. */
  origin: CubeState;
  /** Where this step begins: `origin` with the step's prelude applied. */
  base: CubeState;
  /** The cube as it stands, `index` moves into the step. */
  live: CubeState;
  moves: Move[];
  index: number;
}

/** Where a step starts from, always measured from the plan's own origin. */
export function stepStartState(origin: CubeState, step: PlanStep): CubeState {
  const from = step.prelude.length ? applyAlg(origin, step.prelude) : origin;
  // Piece tracking restarts here so the run highlight follows this step's work.
  return resetTracking(from);
}

export function startStep(origin: CubeState, step: PlanStep): Playback {
  const base = stepStartState(origin, step);
  return { origin, base, live: cloneState(base), moves: step.moves, index: 0 };
}

export const atStart = (p: Playback) => p.index === 0;
export const atEnd = (p: Playback) => p.index >= p.moves.length;

export function forward(p: Playback): Playback {
  if (atEnd(p)) return p;
  return { ...p, live: applyMove(p.live, p.moves[p.index]), index: p.index + 1 };
}

export function back(p: Playback): Playback {
  if (atStart(p)) return p;
  return {
    ...p,
    live: applyMove(p.live, invertMove(p.moves[p.index - 1])),
    index: p.index - 1,
  };
}

export function restart(p: Playback): Playback {
  return { ...p, live: cloneState(p.base), index: 0 };
}

/**
 * Finishing a step commits it: the cube it leaves behind becomes the origin the
 * next plan - and so the next step's prelude - is measured from.
 */
export function commit(p: Playback): CubeState {
  return cloneState(p.live);
}
