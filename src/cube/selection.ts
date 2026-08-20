/**
 * What the user has picked out on the cube.
 *
 * The important thing here is that a selection is a *piece*, not a place. A
 * coordinate stops meaning anything the moment the cube turns: the rings stay
 * put while the pieces slide out from under them, and every derived value -
 * the partner, the name, the step to jump to - quietly retargets. So a
 * selection is stored as the piece's colours, which no move and no re-labelling
 * of the cube can change, and resolved back to a position on every read.
 *
 * The same holds for a slot. In "location" mode the user is asking about a
 * place on the cube - "what goes here?" - and the honest name for that place is
 * the piece that belongs in it, again by colour.
 */
import {
  CUBIES,
  CubeState,
  SLOTS_BY_CUBIE,
  Vec3,
  cubieKind,
  vecKey,
} from './core';
import { HighlightMode, PiecePair, pairFor } from './pieces';
import {
  PlanStep,
  SolvePlan,
  colorKeyOfCubie,
  colorKeyOfSlot,
  describeCubie,
  describeSlot,
  titleCase,
} from './solver/plan';

export interface Selection {
  /**
   * Whether the colours below name a piece ("where does this go?") or the
   * rightful occupant of a slot ("what goes here?"). Fixed when the selection
   * is made; `reanchor` moves an existing selection to the other mode.
   */
  mode: HighlightMode;
  /** The identity: sorted sticker colours, e.g. `GOW`. */
  colors: string;
  /** 2 for an edge, 3 for a corner. Separates the two if colours ever repeat. */
  kind: number;
  /**
   * Where the user tapped. Only consulted when `colors` cannot single a piece
   * out, which happens on a half-painted cube where several pieces read alike.
   */
  origin: Vec3;
}

const MOVABLE = CUBIES.filter((p) => cubieKind(p) >= 2);

/** The colour key that identifies whatever was picked at `pos`. */
function keyAt(state: CubeState, pos: Vec3, mode: HighlightMode): string {
  return mode === 'piece' ? colorKeyOfCubie(state, pos) : colorKeyOfSlot(state, pos);
}

/** Pick out the piece (or slot) at a cubie position. Centres cannot be picked. */
export function selectAt(state: CubeState, pos: Vec3, mode: HighlightMode): Selection | null {
  const kind = cubieKind(pos);
  if (kind < 2) return null;
  return { mode, colors: keyAt(state, pos, mode), kind, origin: pos };
}

export const sameSelection = (a: Selection | null, b: Selection | null) =>
  !!a && !!b && a.mode === b.mode && a.colors === b.colors && a.kind === b.kind;

/**
 * Where the selection is on the cube as it stands now. This is the whole point
 * of the module: it is recomputed from the colours every time, so a move, a
 * whole-cube rotation or a step's prelude all leave the selection on the same
 * piece.
 */
export function resolveSelection(state: CubeState, sel: Selection): Vec3 {
  const matches = MOVABLE.filter(
    (p) => cubieKind(p) === sel.kind && keyAt(state, p, sel.mode) === sel.colors
  );
  if (matches.length === 1) return matches[0];
  // Ambiguous (an unfinished paint job) - fall back to where the user tapped.
  return matches.find((p) => vecKey(p) === vecKey(sel.origin)) ?? sel.origin;
}

/** Keep the selection where it is on screen, but read it the other way round. */
export function reanchor(state: CubeState, sel: Selection, mode: HighlightMode): Selection {
  if (sel.mode === mode) return sel;
  return selectAt(state, resolveSelection(state, sel), mode) ?? sel;
}

/** Sticker slots of the selected cubie - the white ring. */
export function selectionSlots(state: CubeState, sel: Selection | null): number[] {
  if (!sel) return [];
  return SLOTS_BY_CUBIE.get(vecKey(resolveSelection(state, sel))) ?? [];
}

/** The selection's opposite number: the slot it must reach, or its occupant. */
export function selectionPair(state: CubeState, sel: Selection | null): PiecePair | null {
  if (!sel) return null;
  return pairFor(state, resolveSelection(state, sel), sel.mode);
}

/** Sticker slots of that opposite number - the amber ring. */
export function partnerSlots(
  state: CubeState,
  sel: Selection | null,
  showPartner: boolean
): number[] {
  if (!showPartner) return [];
  const pair = selectionPair(state, sel);
  if (!pair?.partner || pair.atHome) return [];
  return SLOTS_BY_CUBIE.get(vecKey(pair.partner)) ?? [];
}

/**
 * What to call the selection. In piece mode that is the piece itself; in slot
 * mode it is the slot, named after the piece that belongs there - naming the
 * intruder currently sitting in it is how the panel used to contradict its own
 * caption and send the user to the wrong step.
 */
export function selectionName(state: CubeState, sel: Selection | null): string | null {
  if (!sel) return null;
  const pos = resolveSelection(state, sel);
  return sel.mode === 'piece'
    ? titleCase(describeCubie(state, pos))
    : `${titleCase(describeSlot(state, pos))}’s slot`;
}

/**
 * The step that deals with the selected piece. Steps are keyed on colours for
 * exactly this reason, so the lookup is the identity itself - no re-derivation
 * from the current position, and the same answer in both modes.
 */
export function stepForSelection(plan: SolvePlan | null, sel: Selection | null): PlanStep | null {
  if (!sel || !plan?.ok) return null;
  // A step named after the piece is the best answer...
  for (const method of plan.methods) {
    const exact = method.steps.find((st) => st.pieceColors === sel.colors);
    if (exact) return exact;
  }
  // ...then the step that puts it home for good, which is how the last layer
  // works: no step is named after a single yellow piece, but exactly one step
  // is the one that lands it...
  for (const method of plan.methods) {
    const finishing = method.steps.find((st) => st.finishes.includes(sel.colors));
    if (finishing) return finishing;
  }
  // ...and failing that, the first step that works on it at all.
  for (const method of plan.methods) {
    const touching = method.steps.find((st) => st.pieceKeys.includes(sel.colors));
    if (touching) return touching;
  }
  return null;
}
