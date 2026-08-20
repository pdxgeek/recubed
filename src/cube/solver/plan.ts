/**
 * Turns the cube currently on screen into "what is left to do", laid out from
 * the gentlest method to the most advanced.
 */
import {
  CENTER_SLOT,
  COLOR_IDS,
  COLOR_NAME,
  CUBIES,
  ColorId,
  CubeState,
  Face,
  FACES,
  Move,
  SLOTS,
  SLOTS_BY_CUBIE,
  Vec3,
  applyAlg,
  cubieKind,
  formatAlg,
  parseAlg,
  vecKey,
} from '../core';
import { CubeError, colorToFaceMap, stateToCubie, isCubieSolved } from '../cubie';
import { CubeRotation, relabelMoves } from '../orientation';
import { SolveStage, solveBeginner } from './beginner';
import { buildTables, movesToNotation, solveKociemba, tablesReady } from './kociemba';

/** The colour a beginner is told to start with. */
export const FIRST_LAYER_COLOR: ColorId = 'W';
/** The colour that should face the solver while they work. */
export const FRONT_COLOR: ColorId = 'G';

export interface PlanStep {
  id: string;
  /** The stage this step belongs to, shown as a heading above it. */
  group: string;
  title: string;
  detail: string;
  /** The algorithm this step uses, when it uses one worth learning. */
  algorithm?: string;
  /** The moves written out, for the learner to read and remember. */
  notation: string;
  moves: Move[];
  /** Moves that get the cube to this step, applied without animating. */
  prelude: Move[];
  /** Slot indices this step is about - used for the wireframe and highlights. */
  targetSlots: number[];
  /**
   * The colours of the piece this step places, sorted, so a piece the user has
   * picked on the cube can be matched to the step that deals with it. Colours
   * survive every re-labelling of the cube; slot numbers do not.
   */
  pieceColors?: string;
  /**
   * Every piece this step deals with, by colour key. For a step that places one
   * piece this is just `pieceColors`; for the last-layer algorithms, which work
   * on the whole top at once, it is the pieces the algorithm moves. Without it
   * no yellow-layer piece could ever be looked up, which was 43% of the cube.
   */
  pieceKeys: string[];
  /**
   * Pieces this step puts home for good - solved after it and never disturbed
   * again. This is the honest answer to "how do I get this one there?" for a
   * last-layer piece, which no single step is named after.
   */
  finishes: string[];
}

export interface PlanMethod {
  id: string;
  title: string;
  subtitle: string;
  /** 1 = gentlest. The list is rendered in this order, top to bottom. */
  level: number;
  steps: PlanStep[];
  totalMoves: number;
  /** True while the method still needs work done off the main thread. */
  pending?: boolean;
}

export interface SolvePlan {
  ok: boolean;
  error?: string;
  solved: boolean;
  methods: PlanMethod[];
}

// ---------------------------------------------------------------------------

const ROTATIONS: string[] = (() => {
  const out: string[] = [];
  for (const a of ['', 'x', 'x2', "x'", 'z', 'z2', "z'"]) {
    for (const b of ['', 'y', 'y2', "y'"]) {
      out.push(`${a} ${b}`.trim().replace(/\s+/g, ' '));
    }
  }
  // Shortest first, so the solve opens with "z2" rather than "x2 y2".
  return [...new Set(out)].sort((p, q) => p.split(' ').filter(Boolean).length - q.split(' ').filter(Boolean).length);
})();

const centreColor = (state: CubeState, face: Face) =>
  state.colors[SLOTS.findIndex((s) => s.face === face && s.row === 1 && s.col === 1)];

/**
 * Whole-cube rotation that puts the first-layer colour on the bottom and the
 * front colour facing the solver, which is how every beginner guide starts.
 */
export function orientationForBeginner(state: CubeState): string {
  for (const rot of ROTATIONS) {
    const rotated = rot ? applyAlg(state, rot) : state;
    if (
      centreColor(rotated, 'D') === FIRST_LAYER_COLOR &&
      centreColor(rotated, 'F') === FRONT_COLOR
    ) {
      return rot;
    }
  }
  return '';
}

/** Slot indices of every sticker on the given cubies. */
const slotsOn = (cubies: Vec3[]) => {
  const keys = new Set(cubies.map(vecKey));
  return SLOTS.filter((s) => keys.has(vecKey(s.pos))).map((s) => s.index);
};

/**
 * Colours in a fixed order, so the same piece gets the same name however it is
 * arrived at. Without this the panel would call a piece "orange-blue-white"
 * while the step that places it is titled "white-blue-orange".
 */
function orderedColours(ids: (ColorId | null)[]): string[] {
  return [...ids]
    .sort((a, b) => COLOR_IDS.indexOf(a as ColorId) - COLOR_IDS.indexOf(b as ColorId))
    .map((c) => (c ? COLOR_NAME[c].toLowerCase() : '?'));
}

/** Which faces meet at a cubie position. */
function facesAt(p: Vec3): Face[] {
  const out: Face[] = [];
  if (p[1] === 1) out.push('U');
  else if (p[1] === -1) out.push('D');
  if (p[2] === 1) out.push('F');
  else if (p[2] === -1) out.push('B');
  if (p[0] === 1) out.push('R');
  else if (p[0] === -1) out.push('L');
  return out;
}

/**
 * What a learner would call the piece belonging in a slot, by its colours -
 * "the white-green edge" rather than "DF". Note this names the slot's rightful
 * occupant, which in general is not the piece sitting there right now.
 */
export function describeSlot(state: CubeState, slot: Vec3): string {
  const faces = facesAt(slot);
  const colours = orderedColours(faces.map((f) => centreColor(state, f) ?? null));
  const kind = faces.length === 3 ? 'corner' : 'edge';
  return `${colours.join('-')} ${kind}`;
}

/** A piece's colours, sorted - a name for it that no rotation can change. */
export function colorKeyOfSlot(state: CubeState, slot: Vec3): string {
  return facesAt(slot)
    .map((f) => centreColor(state, f) ?? '?')
    .sort()
    .join('');
}

export function colorKeyOfCubie(state: CubeState, pos: Vec3): string {
  return SLOTS.filter((s) => vecKey(s.pos) === vecKey(pos))
    .map((s) => state.colors[s.index] ?? '?')
    .sort()
    .join('');
}

/** What a learner would call the piece sitting at a position right now. */
export function describeCubie(state: CubeState, pos: Vec3): string {
  const colours = SLOTS.filter((s) => vecKey(s.pos) === vecKey(pos)).map(
    (s) => state.colors[s.index]
  );
  const names = orderedColours(colours);
  const kind = colours.length === 3 ? 'corner' : colours.length === 2 ? 'edge' : 'centre';
  return `${names.join('-')} ${kind}`;
}

const sentenceCase = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const MOVABLE_CUBIES = CUBIES.filter((p) => cubieKind(p) >= 2);

/** Colour keys of every piece sitting in its own slot, the right way up. */
function solvedPieceKeys(state: CubeState): Set<string> {
  const out = new Set<string>();
  for (const p of MOVABLE_CUBIES) {
    const slots = SLOTS_BY_CUBIE.get(vecKey(p)) ?? [];
    const home = slots.every((i) => {
      const c = state.colors[i];
      return c !== null && c === state.colors[CENTER_SLOT[SLOTS[i].face]];
    });
    if (home) out.add(colorKeyOfCubie(state, p));
  }
  return out;
}

/** Fast: the beginner ladder only. */
export function buildPlan(state: CubeState): SolvePlan {
  let cube;
  try {
    colorToFaceMap(state);
    cube = stateToCubie(state);
  } catch (err) {
    return {
      ok: false,
      solved: false,
      error: err instanceof CubeError ? err.message : String(err),
      methods: [],
    };
  }

  if (isCubieSolved(cube)) return { ok: true, solved: true, methods: [] };

  const methods: PlanMethod[] = [];

  try {
    const rot = orientationForBeginner(state);
    const rotated = rot ? applyAlg(state, rot) : state;
    const stages = solveBeginner(stateToCubie(rotated));

    const steps: PlanStep[] = [];
    let prelude: Move[] = [];
    /** The cube as it stands when the next step begins. */
    let cursor = rotated;
    /** Where each step leaves the cube, by step id. */
    const after = new Map<string, CubeState>();

    // Holding the cube the right way round is a step in its own right - and it
    // disappears once the cube is already being held that way.
    if (rot) {
      const moves = parseAlg(rot);
      steps.push({
        id: 'beginner-hold',
        group: 'Getting started',
        title: `Put ${COLOR_NAME[FIRST_LAYER_COLOR].toLowerCase()} on the bottom`,
        detail:
          `Turn the whole cube - no layers, just the cube - so the ` +
          `${COLOR_NAME[FIRST_LAYER_COLOR].toLowerCase()} centre is underneath and the ` +
          `${COLOR_NAME[FRONT_COLOR].toLowerCase()} centre faces you. Everything after this ` +
          `assumes you are holding it that way.`,
        notation: rot,
        moves,
        prelude: [],
        targetSlots: [],
        pieceKeys: [],
        finishes: [],
      });
      prelude = moves;
    }

    for (const stage of stages) {
      for (const step of stage.steps) {
        const named = step.destination ? describeSlot(rotated, step.destination) : null;
        const focus = [...step.focus, ...(step.destination ? [step.destination] : [])];
        const pieceColors = step.destination
          ? colorKeyOfSlot(rotated, step.destination)
          : undefined;
        // Which pieces this step is about, named by colour so a tap on the cube
        // can be matched to it however the cube has since been turned. `focus`
        // is where those pieces sit as the step begins, so they are read off the
        // cube as it stands at that point rather than off the finished solve.
        const keys = new Set<string>(pieceColors ? [pieceColors] : []);
        for (const p of step.focus) {
          if (cubieKind(p) >= 2) keys.add(colorKeyOfCubie(cursor, p));
        }
        steps.push({
          id: `beginner-${stage.id}-${steps.length}`,
          group: stage.title,
          title: named ? sentenceCase(named) : step.algorithm ?? stage.title,
          detail: step.detail,
          algorithm: step.algorithm,
          notation: formatAlg(step.moves),
          moves: step.moves,
          prelude: [...prelude],
          targetSlots: slotsOn(focus),
          pieceColors,
          pieceKeys: [...keys],
          finishes: [],
        });
        prelude = [...prelude, ...step.moves];
        cursor = applyAlg(cursor, step.moves);
        // Remember where each step leaves the cube, so the pass below can work
        // out which step actually finishes each piece.
        after.set(steps[steps.length - 1].id, cursor);
      }
    }

    // Which step puts each piece home for good. Walking backwards, a piece
    // belongs to the earliest step from which it is solved and stays solved -
    // not to the first step that happens to nudge it into place, which a later
    // algorithm may well knock out again.
    {
      const timeline = steps.filter((st) => after.has(st.id));
      const solvedAfter = timeline.map((st) => solvedPieceKeys(after.get(st.id)!));
      const solvedBefore = solvedPieceKeys(rotated);
      const everyKey = new Set<string>();
      for (const set of solvedAfter) for (const k of set) everyKey.add(k);
      for (const key of everyKey) {
        let first = timeline.length;
        for (let i = timeline.length - 1; i >= 0; i--) {
          if (!solvedAfter[i].has(key)) break;
          first = i;
        }
        if (first === timeline.length) continue; // never ends up solved
        if (first === 0 && solvedBefore.has(key)) continue; // was already home
        timeline[first].finishes.push(key);
      }
    }

    methods.push({
      id: 'beginner',
      title: 'Beginner - layer by layer',
      subtitle: 'One piece at a time, with the algorithm to remember for each.',
      level: 1,
      steps,
      totalMoves: steps.reduce((n, st) => n + st.moves.length, 0),
    });
  } catch (err) {
    methods.push({
      id: 'beginner',
      title: 'Beginner — layer by layer',
      subtitle: `Could not work this one out: ${String(err)}`,
      level: 1,
      steps: [],
      totalMoves: 0,
    });
  }

  methods.push({
    id: 'shortest',
    title: 'Shortest solve',
    subtitle: tablesReady()
      ? 'Working it out…'
      : 'The fewest moves possible, found by search. Tap to work it out.',
    level: 9,
    steps: [],
    totalMoves: 0,
    pending: true,
  });

  return { ok: true, solved: false, methods };
}

/**
 * Build the search tables. About a second the first time and free afterwards,
 * so it is worth doing on its own tick: the caller gets a frame to paint a
 * spinner in before the search itself takes the thread.
 */
export function prepareShortest(): void {
  buildTables();
}

/** Slow: the near-optimal search. Call this when the user asks for it. */
export function buildShortest(state: CubeState): PlanMethod {
  try {
    const cube = stateToCubie(state);
    if (isCubieSolved(cube)) {
      return {
        id: 'shortest', title: 'Shortest solve', subtitle: 'Already solved.',
        level: 9, steps: [], totalMoves: 0,
      };
    }
    const solution = movesToNotation(
      solveKociemba(cube, { timeBudgetMs: 900, hardBudgetMs: 4000, targetLength: 21 })
    );
    const moves = parseAlg(solution.join(' '));
    if (moves.length === 0) throw new Error('The search came back empty.');
    return {
      id: 'shortest',
      title: 'Shortest solve',
      subtitle: `${moves.length} moves, found by two-phase search. No stages, no shortcuts to memorise.`,
      level: 9,
      steps: [
        {
          id: 'shortest-all',
          group: 'Advanced',
          title: `Solve in ${moves.length} moves`,
          detail: 'One sequence from here to solved. Step through it slowly and watch the pieces.',
          notation: formatAlg(moves),
          moves,
          prelude: [],
          targetSlots: SLOTS.map((s) => s.index),
          pieceKeys: [],
          finishes: [],
        },
      ],
      totalMoves: moves.length,
    };
  } catch (err) {
    return {
      id: 'shortest',
      title: 'Shortest solve',
      subtitle: err instanceof Error ? err.message : String(err),
      level: 9,
      steps: [],
      totalMoves: 0,
    };
  }
}

/**
 * A cached method rewritten for the cube's new labels after a drag. Returns
 * null when the moves cannot be rewritten, so the caller recomputes instead.
 */
export function relabelMethod(method: PlanMethod, rot: CubeRotation): PlanMethod | null {
  const steps: PlanStep[] = [];
  for (const step of method.steps) {
    const moves = relabelMoves(rot, step.moves);
    const prelude = relabelMoves(rot, step.prelude);
    if (!moves || !prelude) return null;
    steps.push({ ...step, moves, prelude, notation: formatAlg(moves) });
  }
  return { ...method, steps };
}

/** Human-readable summary of an illegal painted cube. */
export const titleCase = sentenceCase;

export function describeProblem(state: CubeState): string | null {
  try {
    stateToCubie(state);
    return null;
  } catch (err) {
    return err instanceof CubeError ? err.message : String(err);
  }
}
