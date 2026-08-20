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
 * That bug was a matter of the caller picking the wrong cube, so the caller no
 * longer picks: `selectStep` takes the session it is already in and reads the
 * origin out of it. The app holds a `Playback` and calls these functions; it
 * does not compute cubes of its own. Everything below is pure, so the tests
 * exercise the code that ships rather than a second copy of it.
 */
import {
  CubeState,
  Move,
  applyAlg,
  applyMove,
  cloneState,
  invertMove,
  resetTracking,
} from './core';
import { PlanStep } from './solver/plan';

export interface Playback {
  /** The cube the plan was built from. Never changed by stepping. */
  origin: CubeState;
  /** Where this step begins: `origin` with the step's prelude applied. */
  base: CubeState;
  /** The cube as it stands, `index` moves into the step. */
  live: CubeState;
  step: PlanStep;
  index: number;
  /**
   * True when closing keeps the moves. Solve steps commit; a preview of an
   * algorithm would put the cube back.
   */
  commit: boolean;
}

/** Where a step starts from, always measured from the plan's own origin. */
export function stepStartState(origin: CubeState, step: PlanStep): CubeState {
  const from = step.prelude.length ? applyAlg(origin, step.prelude) : origin;
  // Piece tracking restarts here so the run highlight follows this step's work.
  return resetTracking(from);
}

export function startStep(origin: CubeState, step: PlanStep, commit = true): Playback {
  const base = stepStartState(origin, step);
  return { origin, base, live: cloneState(base), step, index: 0, commit };
}

/**
 * Pick a step to play.
 *
 * If a step is already open, the new one is measured from *that session's*
 * origin - the cube the plan describes - and not from wherever the open step
 * happens to have left things. `fallbackOrigin` is only consulted when there is
 * no session yet. The caller has no way to pass the wrong cube.
 */
export function selectStep(
  current: Playback | null,
  fallbackOrigin: CubeState,
  step: PlanStep,
  commit = true
): Playback {
  return startStep(current ? current.origin : fallbackOrigin, step, commit);
}

export const moveCount = (p: Playback) => p.step.moves.length;
export const atStart = (p: Playback) => p.index === 0;
export const atEnd = (p: Playback) => p.index >= p.step.moves.length;

/** The move `forward` would play next, or null at the end. */
export const nextMove = (p: Playback): Move | null => p.step.moves[p.index] ?? null;

/** The move `back` would undo, already inverted, or null at the start. */
export const prevMove = (p: Playback): Move | null =>
  p.index > 0 ? invertMove(p.step.moves[p.index - 1]) : null;

export function forward(p: Playback): Playback {
  const mv = nextMove(p);
  if (!mv) return p;
  return { ...p, live: applyMove(p.live, mv), index: p.index + 1 };
}

export function back(p: Playback): Playback {
  const mv = prevMove(p);
  if (!mv) return p;
  return { ...p, live: applyMove(p.live, mv), index: p.index - 1 };
}

export function restart(p: Playback): Playback {
  return { ...p, live: cloneState(p.base), index: 0 };
}

/**
 * The cube to keep when the step is closed. A committed step leaves the cube
 * where it finished, and that cube becomes the origin the next plan - and so
 * the next step's prelude - is measured from.
 */
export function close(p: Playback): CubeState {
  return cloneState(p.commit ? p.live : p.base);
}
