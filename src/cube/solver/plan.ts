/**
 * Turns the cube currently on screen into "what is left to do", laid out from
 * the gentlest method to the most advanced.
 */
import {
  COLOR_NAME,
  ColorId,
  CubeState,
  Face,
  FACES,
  Move,
  SLOTS,
  Vec3,
  applyAlg,
  formatAlg,
  parseAlg,
  vecKey,
} from '../core';
import { CubeError, colorToFaceMap, stateToCubie, isCubieSolved } from '../cubie';
import { SolveStage, solveBeginner } from './beginner';
import { movesToNotation, solveKociemba, tablesReady } from './kociemba';

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
 * "the white-green edge" rather than "DF".
 */
function pieceName(state: CubeState, slot: Vec3): string {
  const faces = facesAt(slot);
  const colours = faces.map((f) => {
    const c = centreColor(state, f);
    return c ? COLOR_NAME[c].toLowerCase() : '?';
  });
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
  const names = colours.map((c) => (c ? COLOR_NAME[c].toLowerCase() : '?'));
  const kind = colours.length === 3 ? 'corner' : colours.length === 2 ? 'edge' : 'centre';
  return `${names.join('-')} ${kind}`;
}

const sentenceCase = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

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
      });
      prelude = moves;
    }

    for (const stage of stages) {
      for (const step of stage.steps) {
        const named = step.destination ? pieceName(rotated, step.destination) : null;
        const focus = [...step.focus, ...(step.destination ? [step.destination] : [])];
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
          pieceColors: step.destination
            ? colorKeyOfSlot(rotated, step.destination)
            : undefined,
        });
        prelude = [...prelude, ...step.moves];
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
    const solution = movesToNotation(solveKociemba(cube, { timeBudgetMs: 1500, targetLength: 21 }));
    const moves = parseAlg(solution.join(' '));
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
        },
      ],
      totalMoves: moves.length,
    };
  } catch (err) {
    return {
      id: 'shortest', title: 'Shortest solve', subtitle: String(err),
      level: 9, steps: [], totalMoves: 0,
    };
  }
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
