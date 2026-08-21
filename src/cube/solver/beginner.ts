/**
 * Layer-by-layer beginner solver.
 *
 * Works in a frame where the first-layer colour is on D. The caller supplies
 * the whole-cube rotation that gets it there, and the moves returned here are
 * meant to be performed after it.
 *
 * The two intuitive stages (cross and first-layer corners) are found by short
 * searches, the way a beginner is told to work them out. The last-layer stages
 * are searched over the taught algorithms themselves, so every step can name
 * the algorithm a learner is meant to memorise.
 */
import {
  CORNER_POSITION,
  Corner,
  CubieCube,
  EDGE_POSITION,
  Edge,
  applyAlgCubie,
  isCubieSolved,
} from '../cubie';
import { Move, Vec3, algAffectedCubies, cubieKind, parseAlg } from '../core';
import { PieceSet, facesOnly, findSequence, mergeSets, piecesSolved } from './search';

export interface SolveStep {
  title: string;
  detail: string;
  /** Name of the taught algorithm, when the step uses one. */
  algorithm?: string;
  /**
   * The library entry that name belongs to, by id.
   *
   * The solver and `src/cube/algorithms.ts` speak different vocabularies on
   * purpose - "Insert right" is what a learner is told, "Second layer, edge
   * goes right" is what the reference set calls it - and for three rounds the
   * "why this works" sheet joined them by string matching, so twelve of the
   * fifteen algorithms the beginner plan uses resolved to nothing and the sheet
   * had no explanation to show. The id is the join, and `verify-plan.ts`
   * asserts every step carries one that resolves to an entry with a note.
   */
  algorithmId?: string;
  /**
   * Values for the placeholders in that library entry's note.
   *
   * All four first-layer corner slots teach the same trigger, so all four
   * carry `algorithmId: 'trig-sexy'` - and for a round the sheet therefore
   * explained `R U R' U'` and the front-right slot on top of a step that
   * played `B U B' U'` into the back-right one. 74% of those steps used no R
   * turn at all. The note is written with `{face}` and `{slot}` in it and the
   * step says which face it is actually playing.
   */
  noteVars?: Record<string, string>;
  moves: Move[];
  /**
   * The piece this step is dealing with, where it sits as the step begins.
   * Empty for the last-layer steps, which work on the whole top at once.
   */
  focus: Vec3[];
  /** Which slot the piece is headed for, when the step is placing one. */
  destination?: Vec3;
}

export interface SolveStage {
  id: string;
  title: string;
  goal: string;
  steps: SolveStep[];
  moves: Move[];
  /** Cubie positions this stage is about, in the solving frame. */
  focus: Vec3[];
}

const edgeSet = (...e: number[]): PieceSet => ({ corners: [], edges: e });
const cornerSet = (...c: number[]): PieceSet => ({ corners: c, edges: [] });

const U_LAYER_EDGES = [Edge.UR, Edge.UF, Edge.UL, Edge.UB];
const U_LAYER_CORNERS = [Corner.URF, Corner.UFL, Corner.ULB, Corner.UBR];
const CROSS_EDGES = [Edge.DF, Edge.DR, Edge.DB, Edge.DL];
const FIRST_CORNERS = [Corner.DFR, Corner.DRB, Corner.DBL, Corner.DLF];
const MIDDLE_EDGES = [Edge.FR, Edge.FL, Edge.BL, Edge.BR];

const F2L: PieceSet = { corners: FIRST_CORNERS, edges: [...CROSS_EDGES, ...MIDDLE_EDGES] };

/** Cubie positions, in the solving frame, that each stage is working on. */
const CROSS_FOCUS: Vec3[] = [[0, -1, 1], [1, -1, 0], [0, -1, -1], [-1, -1, 0]];
const CORNER_FOCUS: Vec3[] = [[1, -1, 1], [1, -1, -1], [-1, -1, -1], [-1, -1, 1]];
const MIDDLE_FOCUS: Vec3[] = [[1, 0, 1], [-1, 0, 1], [-1, 0, -1], [1, 0, -1]];
const TOP_FOCUS: Vec3[] = [
  [0, 1, 1], [1, 1, 0], [0, 1, -1], [-1, 1, 0],
  [1, 1, 1], [1, 1, -1], [-1, 1, -1], [-1, 1, 1],
];

/** Faces that can turn without lifting a piece out of the D layer's far side. */
const CORNER_FACES: Record<number, string> = {
  [Corner.DFR]: 'RFUD',
  [Corner.DRB]: 'RBUD',
  [Corner.DBL]: 'LBUD',
  [Corner.DLF]: 'LFUD',
};

const EDGE_LABEL: Record<number, string> = {
  [Edge.DF]: 'front', [Edge.DR]: 'right', [Edge.DB]: 'back', [Edge.DL]: 'left',
  [Edge.FR]: 'front-right', [Edge.FL]: 'front-left',
  [Edge.BL]: 'back-left', [Edge.BR]: 'back-right',
};
const CORNER_LABEL: Record<number, string> = {
  [Corner.DFR]: 'front-right', [Corner.DRB]: 'back-right',
  [Corner.DBL]: 'back-left', [Corner.DLF]: 'front-left',
};

const isEdgeSolved = (c: CubieCube, i: number) => c.ep[i] === i && c.eo[i] === 0;
const isCornerSolved = (c: CubieCube, i: number) => c.cp[i] === i && c.co[i] === 0;
const findEdge = (c: CubieCube, piece: number) => c.ep.indexOf(piece);
const findCorner = (c: CubieCube, piece: number) => c.cp.indexOf(piece);

const AUF = ['', 'U', 'U2', "U'"];

// ---------------------------------------------------------------------------
// Last-layer algorithm vocabulary
// ---------------------------------------------------------------------------

interface NamedAlg {
  /** Id of the matching entry in `src/cube/algorithms.ts`. */
  id: string;
  name: string;
  alg: string;
}

const YELLOW_CROSS: NamedAlg[] = [
  { id: 'beg-cross', name: 'Yellow cross', alg: "F R U R' U' F'" },
];
const ORIENT_CORNERS: NamedAlg[] = [
  { id: 'oll-sune', name: 'Sune', alg: "R U R' U R U2 R'" },
  { id: 'oll-antisune', name: 'Anti-Sune', alg: "R U2 R' U' R U' R'" },
];
const PERMUTE_CORNERS: NamedAlg[] = [
  { id: 'beg-corner-pos', name: 'Corner 3-cycle', alg: "U R U' L' U R' U' L" },
  { id: 'beg-corner-pos-rev', name: 'Corner 3-cycle (reverse)', alg: "L' U R U' L U R' U'" },
  { id: 'pll-t', name: 'T perm (swap two corners and two edges)', alg: "R U R' U' R' F R2 U' R' U' R U R' F'" },
];
const PERMUTE_EDGES: NamedAlg[] = [
  { id: 'beg-edge-cycle', name: 'Edge 3-cycle (anticlockwise)', alg: "R U' R U R U R U' R' U' R2" },
  { id: 'beg-edge-cycle-rev', name: 'Edge 3-cycle (clockwise)', alg: "R2 U R U R' U' R' U' R' U R'" },
];
/** A bare U turn to finish on, which is a step in the plan like any other. */
const LINE_UP: NamedAlg = { id: 'beg-auf', name: 'Line the top layer up', alg: 'U' };

/**
 * Shortest chain of `vocabulary` entries (each optionally preceded by a U turn)
 * that reaches `goal`. Depth is small, so this is an exhaustive breadth-first
 * walk over whole algorithms rather than single moves.
 */
function findAlgChain(
  start: CubieCube,
  goal: (c: CubieCube) => boolean,
  vocabulary: NamedAlg[],
  maxApplications: number,
  allowFinalAuf = true
): NamedAlg[] | null {
  interface Node {
    cube: CubieCube;
    used: NamedAlg[];
  }
  const finish = (node: Node): NamedAlg[] | null => {
    if (goal(node.cube)) return node.used;
    if (!allowFinalAuf) return null;
    for (const auf of AUF.slice(1)) {
      if (goal(applyAlgCubie(node.cube, auf))) {
        return [...node.used, { ...LINE_UP, alg: auf }];
      }
    }
    return null;
  };

  let frontier: Node[] = [{ cube: start, used: [] }];
  const done = finish(frontier[0]);
  if (done) return done;

  for (let depth = 0; depth < maxApplications; depth++) {
    const next: Node[] = [];
    for (const node of frontier) {
      for (const entry of vocabulary) {
        for (const auf of AUF) {
          const full = auf ? `${auf} ${entry.alg}` : entry.alg;
          const cube = applyAlgCubie(node.cube, full);
          const child: Node = {
            cube,
            used: [...node.used, { id: entry.id, name: entry.name, alg: full }],
          };
          const result = finish(child);
          if (result) return result;
          next.push(child);
        }
      }
    }
    frontier = next;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

function solveCross(cube: CubieCube): { cube: CubieCube; stage: SolveStage } {
  const steps: SolveStep[] = [];
  let current = cube;
  const placed: number[] = [];

  for (const target of CROSS_EDGES) {
    const before = current;
    if (isEdgeSolved(current, target)) {
      placed.push(target);
      continue;
    }
    const keep = edgeSet(...placed);
    const inU = (c: CubieCube) =>
      U_LAYER_EDGES.includes(findEdge(c, target)) && piecesSolved(c, keep);

    let moves: string[] = [];
    let staged = current;
    if (!inU(current)) {
      const lift = findSequence(current, inU, 4);
      if (!lift) throw new Error(`cross: cannot lift edge ${target}`);
      moves = lift;
      staged = applyAlgCubie(current, lift.join(' '));
    }
    const keepPlus = edgeSet(...placed, target);
    const drop = findSequence(staged, (c) => piecesSolved(c, keepPlus), 6);
    if (!drop) throw new Error(`cross: cannot place edge ${target}`);
    moves = [...moves, ...drop];

    const from = EDGE_POSITION[findEdge(before, target)];
    current = applyAlgCubie(staged, drop.join(' '));
    placed.push(target);
    steps.push({
      title: '',
      detail:
        'Bring the edge up to the top layer, turn the top until it sits above its slot, then drop it straight down. No algorithm to remember here - it is worked out by eye.',
      moves: parseAlg(moves.join(' ')),
      focus: [from],
      destination: EDGE_POSITION[target],
    });
  }

  return {
    cube: current,
    stage: {
      id: 'cross',
      title: 'First layer cross',
      goal: 'Four edges of the first colour around its centre, side colours matching their own centres.',
      steps,
      moves: steps.flatMap((s) => s.moves),
      focus: CROSS_FOCUS,
    },
  };
}

/**
 * The taught first-layer corner insert, one per slot. Hold the empty slot at
 * the front-right with the corner in the top layer above it, then repeat the
 * sexy move until it drops in. It disturbs nothing in the cross and no other
 * first-layer corner, which is exactly why it is the one beginners learn.
 */
const CORNER_INSERT: Record<
  number,
  { alg: string; name: string; id: string; above: number; face: string; slot: string }
> = {
  [Corner.DFR]: { alg: "R U R' U'", name: 'Sexy move', id: 'trig-sexy', above: Corner.URF, face: 'R', slot: 'front-right' },
  [Corner.DLF]: { alg: "F U F' U'", name: 'Sexy move (front)', id: 'trig-sexy', above: Corner.UFL, face: 'F', slot: 'front-left' },
  [Corner.DBL]: { alg: "L U L' U'", name: 'Sexy move (left)', id: 'trig-sexy', above: Corner.ULB, face: 'L', slot: 'back-left' },
  [Corner.DRB]: { alg: "B U B' U'", name: 'Sexy move (back)', id: 'trig-sexy', above: Corner.UBR, face: 'B', slot: 'back-right' },
};

function solveFirstCorners(cube: CubieCube): { cube: CubieCube; stage: SolveStage } {
  const steps: SolveStep[] = [];
  let current = cube;

  for (const target of FIRST_CORNERS) {
    if (isCornerSolved(current, target)) continue;
    const from = CORNER_POSITION[findCorner(current, target)];
    const parts: string[] = [];
    const insert = CORNER_INSERT[target];

    // Stuck in the bottom layer the wrong way round: knock it out with the
    // same algorithm, then put it in properly. Those four moves open a quarter
    // of these steps and used to go unmentioned, so the explanation described
    // an insertion the notation did not begin with.
    let ejected: { alg: string; slot: string } | null = null;
    if (FIRST_CORNERS.includes(findCorner(current, target))) {
      const stuckIn = CORNER_INSERT[findCorner(current, target)];
      current = applyAlgCubie(current, stuckIn.alg);
      parts.push(stuckIn.alg);
      ejected = { alg: stuckIn.alg, slot: stuckIn.slot };
    }

    // Turn the top until the corner sits directly above its slot.
    for (const auf of AUF) {
      const test = auf ? applyAlgCubie(current, auf) : current;
      if (findCorner(test, target) === insert.above) {
        if (auf) {
          current = test;
          parts.push(auf);
        }
        break;
      }
    }
    if (findCorner(current, target) !== insert.above) {
      throw new Error(`corners: cannot bring corner ${target} above its slot`);
    }

    // Then work it in. It takes at most five goes whichever way it is twisted.
    let turns = 0;
    while (!isCornerSolved(current, target) && turns < 6) {
      current = applyAlgCubie(current, insert.alg);
      parts.push(insert.alg);
      turns++;
    }
    if (!isCornerSolved(current, target)) {
      throw new Error(`corners: corner ${target} never dropped in`);
    }

    steps.push({
      title: '',
      detail:
        (ejected
          ? `The corner is stuck in the ${ejected.slot} slot the wrong way round, so the step ` +
            `opens with ${ejected.alg} to knock it out into the top layer. Then hold `
          : `Hold `) +
        `the empty slot at the ${insert.slot} with the corner in the top layer above it and ` +
        `repeat ${insert.alg} until it drops in. It comes out and goes back a little ` +
        `differently each time until it lands the right way up.`,
      algorithm: insert.name,
      algorithmId: insert.id,
      noteVars: { face: insert.face, slot: insert.slot },
      moves: parseAlg(parts.join(' ')),
      focus: [from],
      destination: CORNER_POSITION[target],
    });
  }

  return {
    cube: current,
    stage: {
      id: 'first-corners',
      title: 'First layer corners',
      goal: 'The whole first layer done, with the side colours running in a straight band.',
      steps,
      moves: steps.flatMap((s) => s.moves),
      focus: CORNER_FOCUS,
    },
  };
}

/** Middle-layer insertions, written for the front-right slot and rotated round. */
const MIDDLE_INSERTS: { slot: number; dir: 'right' | 'left'; alg: string }[] = [
  { slot: Edge.FR, dir: 'right', alg: "U R U' R' U' F' U F" },
  { slot: Edge.FL, dir: 'left', alg: "U' L' U L U F U' F'" },
  { slot: Edge.BR, dir: 'left', alg: "U' R' U R U B U' B'" },
  { slot: Edge.BL, dir: 'right', alg: "U L U' L' U' B' U B" },
  { slot: Edge.FR, dir: 'left', alg: "U' F' U F U R U' R'" },
  { slot: Edge.FL, dir: 'right', alg: "U F U' F' U' L' U L" },
  { slot: Edge.BR, dir: 'right', alg: "U B U' B' U' R' U R" },
  { slot: Edge.BL, dir: 'left', alg: "U' B' U B U L U' L'" },
];

function solveMiddleLayer(cube: CubieCube): { cube: CubieCube; stage: SolveStage } {
  const steps: SolveStep[] = [];
  let current = cube;
  const firstLayer = mergeSets(edgeSet(...CROSS_EDGES), cornerSet(...FIRST_CORNERS));
  const solvedCount = (c: CubieCube) => MIDDLE_EDGES.filter((e) => isEdgeSolved(c, e)).length;

  /** Every insertion that leaves the first layer alone, with its alignment. */
  const legalMoves = (c: CubieCube) => {
    const out: { insert: (typeof MIDDLE_INSERTS)[number]; full: string; next: CubieCube }[] = [];
    for (const insert of MIDDLE_INSERTS) {
      for (const auf of AUF) {
        const full = auf ? `${auf} ${insert.alg}` : insert.alg;
        const next = applyAlgCubie(c, full);
        if (piecesSolved(next, firstLayer)) out.push({ insert, full, next });
      }
    }
    return out;
  };

  for (let guard = 0; guard < 16 && solvedCount(current) < 4; guard++) {
    const before = solvedCount(current);
    const options = legalMoves(current);
    if (!options.length) throw new Error('middle layer: no legal insertion');

    let chosen = options
      .filter((o) => solvedCount(o.next) > before)
      .sort((a, b) => solvedCount(b.next) - solvedCount(a.next))[0];
    let ejecting = false;

    if (!chosen) {
      // Every unsolved slot is blocked by an edge sitting in it the wrong way
      // round. Send a top edge in to knock one out, then place it properly.
      const stuck = MIDDLE_EDGES.filter((e) => !isEdgeSolved(current, e));
      chosen = options.find((o) =>
        stuck.some((e) => {
          const piece = current.ep[e];
          const nowAt = o.next.ep.indexOf(piece);
          return U_LAYER_EDGES.includes(nowAt);
        })
      )!;
      ejecting = true;
      if (!chosen) throw new Error('middle layer: cannot free a slot');
    }

    const target = chosen.insert.slot;
    // When freeing a slot the step is about the slot itself, not about the
    // edge that happens to belong there.
    const from = ejecting ? EDGE_POSITION[target] : EDGE_POSITION[findEdge(current, target)];
    current = chosen.next;
    steps.push({
      title: ejecting ? 'Free the slot' : '',
      focus: [from],
      destination: ejecting ? undefined : EDGE_POSITION[target],
      detail: ejecting
        ? 'This slot holds an edge the wrong way round. Send any top edge in to knock it out, then place it properly.'
        : `Line the edge up with its centre, then send it ${chosen.insert.dir} into the slot.`,
      algorithm: chosen.insert.dir === 'right' ? 'Insert right' : 'Insert left',
      algorithmId: chosen.insert.dir === 'right' ? 'beg-second-right' : 'beg-second-left',
      moves: parseAlg(chosen.full),
    });
  }

  return {
    cube: current,
    stage: {
      id: 'middle',
      title: 'Middle layer edges',
      goal: 'Two full layers done. Only the last layer is left.',
      steps,
      moves: steps.flatMap((s) => s.moves),
      focus: MIDDLE_FOCUS,
    },
  };
}

function lastLayerStage(
  cube: CubieCube,
  id: string,
  title: string,
  goal: string,
  detail: string,
  /** What one application of this stage's algorithm does, in plain words. */
  action: string,
  vocabulary: NamedAlg[],
  test: (c: CubieCube) => boolean,
  maxApplications: number,
  allowFinalAuf = false
): { cube: CubieCube; stage: SolveStage } {
  const chain = findAlgChain(cube, test, vocabulary, maxApplications, allowFinalAuf);
  if (!chain) throw new Error(`${id}: no algorithm chain found`);
  let current = cube;
  const steps: SolveStep[] = chain.map((entry) => {
    current = applyAlgCubie(current, entry.alg);
    return {
      // A human sentence, not the algorithm's name: the name goes on the tag
      // beside it, and a row that says "Sune" twice says nothing twice.
      title: action,
      detail,
      algorithm: entry.name,
      algorithmId: entry.id,
      moves: parseAlg(entry.alg),
      // The last layer is worked as a group, so there is no single destination.
      // The pieces the algorithm actually displaces are the next best thing:
      // they are what the highlight should follow and what a learner who taps
      // one of them is asking about.
      focus: algAffectedCubies(entry.alg).filter((p) => cubieKind(p) >= 2),
    };
  });
  return {
    cube: current,
    stage: { id, title, goal, steps, moves: steps.flatMap((s) => s.moves), focus: TOP_FOCUS },
  };
}

const topEdgesOriented = (c: CubieCube) => U_LAYER_EDGES.every((e) => c.eo[e] === 0);
const topCornersOriented = (c: CubieCube) => U_LAYER_CORNERS.every((i) => c.co[i] === 0);
const topCornersPlaced = (c: CubieCube) =>
  topCornersOriented(c) && U_LAYER_CORNERS.every((i) => c.cp[i] === i);

// ---------------------------------------------------------------------------

export function solveBeginner(cube: CubieCube): SolveStage[] {
  const stages: SolveStage[] = [];
  let current = cube;

  const push = (r: { cube: CubieCube; stage: SolveStage }) => {
    current = r.cube;
    if (r.stage.moves.length) stages.push(r.stage);
  };

  push(solveCross(current));
  if (!piecesSolved(current, edgeSet(...CROSS_EDGES))) throw new Error('cross incomplete');
  push(solveFirstCorners(current));
  if (!piecesSolved(current, mergeSets(edgeSet(...CROSS_EDGES), cornerSet(...FIRST_CORNERS))))
    throw new Error('first layer incomplete');
  push(solveMiddleLayer(current));
  if (!piecesSolved(current, F2L)) throw new Error('middle layer incomplete');

  push(
    lastLayerStage(
      current, 'top-cross', 'Last layer cross',
      'A cross of the last colour on the top face, side colours ignored for now.',
      'Hold the shape you have at the back-left and run the algorithm. A dot becomes an L, an L becomes a line, a line becomes the cross.',
      'Grow the yellow cross',
      YELLOW_CROSS, topEdgesOriented, 3
    )
  );
  push(
    lastLayerStage(
      current, 'top-corners-orient', 'Turn the last corners the right way up',
      'The whole top face showing one colour.',
      'Hold the cube so the corners match the case and run Sune. Repeat until the top face is solid.',
      'Turn the top corners over',
      ORIENT_CORNERS, topCornersOriented, 4
    )
  );
  push(
    lastLayerStage(
      current, 'top-corners-place', 'Move the last corners home',
      'Every corner in its own spot, even if the edges are still wrong.',
      'Find a corner already home, hold it at the front-right, and cycle the other three.',
      'Send the corners home',
      PERMUTE_CORNERS, topCornersPlaced, 3
    )
  );
  push(
    lastLayerStage(
      current, 'top-edges-place', 'Move the last edges home',
      'The last four edges into place - and the cube is done.',
      'Hold the edge that is already correct at the back and cycle the other three round.',
      'Send the edges home',
      PERMUTE_EDGES, isCubieSolved, 3, true
    )
  );

  return stages;
}
