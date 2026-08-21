/**
 * Every algorithm in the library, described as a teachable *case*.
 *
 * The teaching page shows one algorithm at a time: a live cube that starts in
 * the position the algorithm is *for*, the algorithm running on it, and a
 * filmstrip of the moves grouped the way a cuber reads them. All three of those
 * need facts about the algorithm that are cube maths, not layout, so they are
 * derived here, once, from the engine - and never written down by hand.
 *
 * The case position is the algorithm run backwards from solved. Inverting a
 * sequence reverses the order *and* inverts each move, so `R U R' U'` becomes
 * `U R U' R'`; doing only one of the two gives a position that looks plausible
 * and is wrong. `invertMove` in ./core does the per-move half.
 *
 * That construction has a consequence worth stating, because the verifier leans
 * on it: running the algorithm from its own case position always lands exactly
 * on a solved cube, for every category, because A after A-inverse is nothing at
 * all. It is not a claim about what the algorithm is *for*. An OLL is only
 * promised to orient the last layer; the case position derived here happens to
 * also set up the permutation that the same OLL undoes, so this one
 * representative of the case solves completely. `scripts/verify-cases.ts` spells
 * out what each category does and does not guarantee.
 *
 * No react-native import, and nothing from src/ui or src/render: this is cube
 * maths, so `scripts/verify-cases.ts` loads it directly.
 */
import {
  ALGORITHMS,
  AlgCategory,
  ALGORITHM_ID_BY_NAME,
  Algorithm,
  chunkByTriggers,
} from './algorithms';
import {
  CubeState,
  Face,
  FACES,
  MOVE_DEFS,
  Move,
  SLOTS,
  SLOTS_BY_CUBIE,
  Vec3,
  applyAlg,
  invertMove,
  resetTracking,
  solvedState,
  vecKey,
} from './core';
import {
  CORNER_NAMES,
  CORNER_POSITION,
  CubieCube,
  EDGE_NAMES,
  EDGE_POSITION,
  stateToCubie,
} from './cubie';
import { PieceCount, algPiecesMoved } from './effect';

// ---------------------------------------------------------------------------
// Inversion
// ---------------------------------------------------------------------------

/**
 * The moves that undo `moves`: reversed, and each one inverted.
 *
 * Both halves matter. Reversing `R U` without inverting gives `U R`, which is a
 * different position, not the way back.
 */
export const invertMoves = (moves: Move[]): Move[] => moves.slice().reverse().map(invertMove);

/** The position a solved cube is left in by running `moves` backwards. */
export const caseStateFor = (moves: Move[]): CubeState =>
  resetTracking(applyAlg(solvedState(), invertMoves(moves)));

// ---------------------------------------------------------------------------
// Naming pieces the way cubers name them
// ---------------------------------------------------------------------------

export type PieceKind = 'corner' | 'edge';

/** Cubie position -> the piece slot's name, `URF` or `UF`. */
const PIECE_NAME = new Map<string, string>([
  ...CORNER_POSITION.map((p, i) => [vecKey(p), CORNER_NAMES[i]] as const),
  ...EDGE_POSITION.map((p, i) => [vecKey(p), EDGE_NAMES[i]] as const),
]);

/** The name of the corner or edge *place* at `pos`, e.g. `URF`. */
export const pieceNameAt = (pos: Vec3): string => PIECE_NAME.get(vecKey(pos)) ?? vecKey(pos);

/** The sticker slots that make up the cubie at `pos`. */
const slotsOf = (pos: Vec3): number[] => (SLOTS_BY_CUBIE.get(vecKey(pos)) ?? []).slice().sort((a, b) => a - b);

// ---------------------------------------------------------------------------
// Which piece goes where
// ---------------------------------------------------------------------------

/**
 * One piece's journey, read from the case position to the finish.
 *
 * `from` is where the piece is sitting when the learner first sees the cube;
 * `to` is where the algorithm puts it. For a piece that is only twisted in
 * place the two are equal and `twist` is what changed.
 */
export interface PieceTravel {
  kind: PieceKind;
  /** Index of the piece in the cubie model's ordering, for callers that want it. */
  piece: number;
  /** Where it starts, in the case position. */
  from: Vec3;
  /** Where the algorithm leaves it. */
  to: Vec3;
  /** Those two places, named: `URF`, `UF`. */
  fromName: string;
  toName: string;
  /** Sticker slots the piece occupies before and after - for highlighting. */
  fromSlots: number[];
  toSlots: number[];
  /** True when it changes place. */
  permuted: boolean;
  /** True when it arrives a different way up. */
  reoriented: boolean;
  /**
   * How the piece is turned in the case position: 0..2 for a corner, 0..1 for
   * an edge, in the model's own convention. The algorithm takes it back to 0.
   */
  twist: number;
}

/**
 * Every piece the algorithm displaces or reorients, taken from the cubie model.
 *
 * The cubie model is the right tool for this and sticker tracking is not: `cp`
 * and `ep` already say "the piece sitting here belongs there", which is the
 * question, and `co`/`eo` separate turning a piece over from moving it, which
 * sticker indices blur together. `stateToCubie` also refuses an impossible
 * cube, so a bad derivation cannot quietly produce a plausible answer.
 *
 * `scripts/verify-cases.ts` recomputes this list from sticker tracking and from
 * raw colours, deliberately not sharing this path.
 */
function travelsFor(caseCubie: CubieCube): PieceTravel[] {
  const out: PieceTravel[] = [];
  for (let i = 0; i < 8; i++) {
    const piece = caseCubie.cp[i];
    const twist = caseCubie.co[i];
    if (piece === i && twist === 0) continue;
    const from = CORNER_POSITION[i];
    const to = CORNER_POSITION[piece];
    out.push({
      kind: 'corner',
      piece,
      from,
      to,
      fromName: pieceNameAt(from),
      toName: pieceNameAt(to),
      fromSlots: slotsOf(from),
      toSlots: slotsOf(to),
      permuted: piece !== i,
      reoriented: twist !== 0,
      twist,
    });
  }
  for (let i = 0; i < 12; i++) {
    const piece = caseCubie.ep[i];
    const twist = caseCubie.eo[i];
    if (piece === i && twist === 0) continue;
    const from = EDGE_POSITION[i];
    const to = EDGE_POSITION[piece];
    out.push({
      kind: 'edge',
      piece,
      from,
      to,
      fromName: pieceNameAt(from),
      toName: pieceNameAt(to),
      fromSlots: slotsOf(from),
      toSlots: slotsOf(to),
      permuted: piece !== i,
      reoriented: twist !== 0,
      twist,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

/**
 * What the algorithm does, in the few numbers a page header can print.
 *
 * `permute` moves pieces about without turning any of them over; `orient` turns
 * pieces without moving any; `both` does the two together. `identity` cannot
 * arise from the library as it stands, but a sequence that cancels itself out
 * is a legal thing to write, so it has a name rather than a crash.
 */
export type CaseMode = 'permute' | 'orient' | 'both' | 'identity';

export interface CaseSummary {
  /** Corners and edges displaced or reoriented. Centres never count. */
  corners: number;
  edges: number;
  pieces: number;
  mode: CaseMode;
  /** How many of those pieces change place, and how many arrive turned over. */
  permuted: number;
  reoriented: number;
  /** Faces carrying at least one sticker of an affected piece, in FACES order. */
  faces: Face[];
  /** Of those faces, the ones the resting view already shows. */
  visibleFaces: Face[];
  /** ...and the ones the learner has to turn the cube to see. */
  hiddenFaces: Face[];
  /** Outer faces whose layer the moves actually turn. */
  turnedFaces: Face[];
  usesSlices: boolean;
  usesWideMoves: boolean;
  usesRotations: boolean;
  /** True when nothing below the top layer is disturbed. */
  lastLayerOnly: boolean;
}

/**
 * The three faces the app's resting camera shows.
 *
 * `restingOrientation` in src/render/view.ts yaws the cube -0.62 and tips it
 * 0.42, which is the usual cubing three-quarter view: the top, the right and
 * the front. This module does not import the renderer - cube maths must not
 * depend on it - so the fact is written here and
 * `scripts/verify-cases.ts` proves it against the real camera, and will say so
 * if the resting angle is ever changed.
 */
export const DEFAULT_VIEW_FACES: readonly Face[] = ['U', 'R', 'F'];

/** Which outer face, if any, a coordinate along an axis belongs to. */
const AXIS_FACE: Record<number, [Face, Face]> = {
  0: ['L', 'R'], // -1, +1
  1: ['D', 'U'],
  2: ['B', 'F'],
};

/**
 * The outer faces a sequence turns.
 *
 * A wide move counts as its outer face - `Rw` is the R face plus the slice
 * behind it, and the face is what a learner grips. A slice on its own turns no
 * face and a whole-cube rotation turns all of them, so neither contributes;
 * `usesSlices` and `usesRotations` report those instead, because "this one
 * needs an M slice" is the useful thing to say about `M2 U M2 U2 M2 U M2`, not
 * "it turns U".
 */
function turnedFaces(moves: Move[]): Face[] {
  const hit = new Set<Face>();
  for (const mv of moves) {
    const def = MOVE_DEFS[mv.base];
    if (def.layers.length === 3) continue; // whole-cube rotation
    for (const layer of def.layers) {
      if (layer === 0) continue; // slice layer, no outer face
      hit.add(AXIS_FACE[def.axis][layer > 0 ? 1 : 0]);
    }
  }
  return FACES.filter((f) => hit.has(f));
}

function summarise(moves: Move[], travels: PieceTravel[], counts: PieceCount): CaseSummary {
  const faceHit = new Set<Face>();
  for (const t of travels) {
    for (const s of [...t.fromSlots, ...t.toSlots]) faceHit.add(SLOTS[s].face);
  }
  const faces = FACES.filter((f) => faceHit.has(f));
  const permuted = travels.filter((t) => t.permuted).length;
  const reoriented = travels.filter((t) => t.reoriented).length;
  const mode: CaseMode =
    permuted && reoriented ? 'both' : permuted ? 'permute' : reoriented ? 'orient' : 'identity';
  return {
    corners: counts.corners,
    edges: counts.edges,
    pieces: counts.corners + counts.edges,
    mode,
    permuted,
    reoriented,
    faces,
    visibleFaces: faces.filter((f) => DEFAULT_VIEW_FACES.includes(f)),
    hiddenFaces: faces.filter((f) => !DEFAULT_VIEW_FACES.includes(f)),
    turnedFaces: turnedFaces(moves),
    usesSlices: moves.some((m) => MOVE_DEFS[m.base].layers.length === 1 && MOVE_DEFS[m.base].layers[0] === 0),
    usesWideMoves: moves.some((m) => MOVE_DEFS[m.base].layers.length === 2),
    usesRotations: moves.some((m) => MOVE_DEFS[m.base].layers.length === 3),
    lastLayerOnly: travels.every((t) => t.from[1] === 1 && t.to[1] === 1),
  };
}

// ---------------------------------------------------------------------------
// Reading the moves as triggers
// ---------------------------------------------------------------------------

/**
 * One block of the filmstrip: a named trigger, possibly repeated, or a run of
 * moves that belongs to no trigger.
 *
 * `chunkByTriggers` in ./algorithms is the one place that decides where the
 * seams fall, and src/ui/notation.ts renders the same chunks; this exposes them
 * as data so the teaching page never parses a move string of its own.
 * Concatenating every block's `notation` in order reproduces the algorithm
 * exactly, which is what makes it safe to render from.
 */
export interface CaseTrigger {
  /** The trigger's name, or null for moves belonging to none. */
  name: string | null;
  /** That trigger's id in the library, when it has one. */
  algorithmId: string | null;
  /** The name with its count - `Sexy move ×3` - or null. */
  label: string | null;
  /** Index of the block's first move within the algorithm. */
  start: number;
  /** How many times the trigger runs back to back. 1 for a plain run. */
  repeat: number;
  /** One repetition: what a collapsed block prints. */
  period: string[];
  /** Every move the block covers, repeats included. */
  notation: string[];
}

function triggersFor(notation: string[]): CaseTrigger[] {
  return chunkByTriggers(notation).map((chunk) => {
    const all = notation.slice(chunk.start, chunk.start + chunk.length);
    return {
      name: chunk.label,
      algorithmId: chunk.label ? ALGORITHM_ID_BY_NAME.get(chunk.label) ?? null : null,
      label: chunk.label ? `${chunk.label}${chunk.repeat > 1 ? ` ×${chunk.repeat}` : ''}` : null,
      start: chunk.start,
      repeat: chunk.repeat,
      period: all.slice(0, chunk.length / chunk.repeat),
      notation: all,
    };
  });
}

// ---------------------------------------------------------------------------
// The case
// ---------------------------------------------------------------------------

export interface AlgorithmCase {
  id: string;
  name: string;
  category: AlgCategory;
  note?: string;
  /** The algorithm itself. */
  alg: string;
  moves: Move[];
  notation: string[];
  /** The moves that build the case position from a solved cube. */
  setup: Move[];
  setupAlg: string;
  /**
   * The position the algorithm solves from, with piece tracking reset so an
   * animation started here counts travel from what the learner is looking at.
   */
  caseState: CubeState;
  /** The cubie reading of that position - permutation and orientation. */
  caseCubie: CubieCube;
  /** Every piece that travels or turns, and where it goes. */
  travels: PieceTravel[];
  summary: CaseSummary;
  /** The move sequence as the blocks a cuber reads it in. */
  triggers: CaseTrigger[];
  /** True when at least one block is a named trigger. */
  hasTriggers: boolean;
}

export function buildCase(a: Algorithm): AlgorithmCase {
  const setup = invertMoves(a.moves);
  const caseState = caseStateFor(a.moves);
  const caseCubie = stateToCubie(caseState);
  const travels = travelsFor(caseCubie);
  const notation = a.moves.map((m) => m.notation);
  const triggers = triggersFor(notation);
  return {
    id: a.id,
    name: a.name,
    category: a.category,
    ...(a.note === undefined ? {} : { note: a.note }),
    alg: a.alg,
    moves: a.moves,
    notation,
    setup,
    setupAlg: setup.map((m) => m.notation).join(' '),
    caseState,
    caseCubie,
    travels,
    // effect.ts already answers "how many pieces does this algorithm move", and
    // answers it from sticker tracking rather than from the cubie model, so the
    // two derivations here are independent of each other by construction.
    summary: summarise(a.moves, travels, algPiecesMoved(a.moves)),
    triggers,
    hasTriggers: triggers.some((t) => t.name !== null),
  };
}

export const CASES: AlgorithmCase[] = ALGORITHMS.map(buildCase);

export const CASES_BY_ID = new Map(CASES.map((c) => [c.id, c]));

export const caseForId = (id: string): AlgorithmCase | undefined => CASES_BY_ID.get(id);

/** Every case in a category, in library order. */
export const casesInCategory = (category: AlgCategory): AlgorithmCase[] =>
  CASES.filter((c) => c.category === category);
