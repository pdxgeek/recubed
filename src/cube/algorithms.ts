import {
  Move,
  Vec3,
  algAffectedCubies,
  algAffectedSlots,
  cubieKind,
  parseAlg,
  vecKey,
} from './core';

export type AlgCategory = 'PLL' | 'OLL' | 'F2L' | 'Triggers' | 'Beginner';

export const CATEGORY_ORDER: AlgCategory[] = ['PLL', 'OLL', 'F2L', 'Triggers', 'Beginner'];

export interface AlgorithmDef {
  id: string;
  name: string;
  category: AlgCategory;
  alg: string;
  note?: string;
}

export interface Algorithm extends AlgorithmDef {
  moves: Move[];
  /** Cubie positions this algorithm displaces, on a solved cube. */
  targets: Vec3[];
  targetKeys: Set<string>;
  /** Slot indices it displaces - used to follow the pieces while stepping. */
  targetSlots: number[];
  corners: number;
  edges: number;
}

const DEFS: AlgorithmDef[] = [
  // ---- PLL: permute the last layer -------------------------------------
  { id: 'pll-aa', name: 'Aa perm', category: 'PLL', alg: "x R' U R' D2 R U' R' D2 R2 x'", note: 'Corner 3-cycle' },
  { id: 'pll-ab', name: 'Ab perm', category: 'PLL', alg: "x R2 D2 R U R' D2 R U' R x'", note: 'Corner 3-cycle' },
  { id: 'pll-e', name: 'E perm', category: 'PLL', alg: "x' R U' R' D R U R' D' R U R' D R U' R' D' x", note: 'Two corner swaps' },
  { id: 'pll-f', name: 'F perm', category: 'PLL', alg: "R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R", note: 'Adjacent swap + edge 3-cycle' },
  { id: 'pll-ga', name: 'Ga perm', category: 'PLL', alg: "R2 U R' U R' U' R U' R2 U' D R' U R D' U", note: 'Corner + edge 3-cycle (final AUF included)' },
  { id: 'pll-gb', name: 'Gb perm', category: 'PLL', alg: "R' U' R U D' R2 U R' U R U' R U' R2 D U", note: 'Corner + edge 3-cycle (final AUF included)' },
  { id: 'pll-gc', name: 'Gc perm', category: 'PLL', alg: "R2 U' R U' R U R' U R2 U D' R U' R' D U", note: 'Corner + edge 3-cycle (final AUF included)' },
  { id: 'pll-gd', name: 'Gd perm', category: 'PLL', alg: "R U R' U' D R2 U' R U' R' U R' U R2 D' U", note: 'Corner + edge 3-cycle (final AUF included)' },
  { id: 'pll-h', name: 'H perm', category: 'PLL', alg: 'M2 U M2 U2 M2 U M2', note: 'Swaps both edge pairs' },
  { id: 'pll-ja', name: 'Ja perm', category: 'PLL', alg: "R' U L' U2 R U' R' U2 R L U'", note: 'Adjacent corner + edge swap (final AUF included)' },
  { id: 'pll-jb', name: 'Jb perm', category: 'PLL', alg: "R U R' F' R U R' U' R' F R2 U' R' U'" },
  { id: 'pll-na', name: 'Na perm', category: 'PLL', alg: "R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'" },
  { id: 'pll-nb', name: 'Nb perm', category: 'PLL', alg: "R' U R U' R' F' U' F R U R' F R' F' R U' R" },
  { id: 'pll-ra', name: 'Ra perm', category: 'PLL', alg: "R U' R' U' R U R D R' U' R D' R' U2 R' U'", note: 'Adjacent corner + edge swap (final AUF included)' },
  { id: 'pll-rb', name: 'Rb perm', category: 'PLL', alg: "R2 F R U R U' R' F' R U2 R' U2 R U", note: 'Adjacent corner + edge swap (final AUF included)' },
  {
    id: 'pll-t',
    name: 'T perm',
    category: 'PLL',
    alg: "R U R' U' R' F R2 U' R' U' R U R' F'",
    note:
      'Swaps two neighbouring top corners with each other and two top edges with each other, in ' +
      'one pass - four pieces, and nothing else on the cube. Running it a second time undoes it ' +
      'exactly, which is a quick way to check you have performed it correctly.',
  },
  { id: 'pll-ua', name: 'Ua perm', category: 'PLL', alg: "M2 U M U2 M' U M2", note: 'Edge 3-cycle, clockwise' },
  { id: 'pll-ub', name: 'Ub perm', category: 'PLL', alg: "M2 U' M U2 M' U' M2", note: 'Edge 3-cycle, anticlockwise' },
  { id: 'pll-v', name: 'V perm', category: 'PLL', alg: "R' U R' U' y R' F' R2 U' R' U R' F R F y'", note: 'Diagonal corner + edge swap' },
  { id: 'pll-y', name: 'Y perm', category: 'PLL', alg: "F R U' R' U' R U R' F' R U R' U' R' F R F'" },
  { id: 'pll-z', name: 'Z perm', category: 'PLL', alg: "M' U M2 U M2 U M' U2 M2 U'", note: 'Two edge swaps (final AUF included)' },

  // ---- OLL: orient the last layer (two-look set) ------------------------
  { id: 'oll-dot', name: 'OLL edges: dot', category: 'OLL', alg: "F R U R' U' F' Fw R U R' U' Fw'", note: 'No edges oriented' },
  { id: 'oll-line', name: 'OLL edges: line', category: 'OLL', alg: "F R U R' U' F'", note: 'Horizontal bar' },
  { id: 'oll-lshape', name: 'OLL edges: L shape', category: 'OLL', alg: "Fw R U R' U' Fw'", note: 'Bent pair' },
  {
    id: 'oll-sune',
    name: 'Sune',
    category: 'OLL',
    alg: "R U R' U R U2 R'",
    note:
      'Twists three of the four top corners and leaves the fourth alone. R pulls the first two ' +
      'layers apart and R\' puts them back inside the algorithm, which is how it can rearrange ' +
      'the top without costing anything below. Repeat it - three goes at most - until the whole ' +
      'top face is one colour.',
  },
  {
    id: 'oll-antisune',
    name: 'Anti-Sune',
    category: 'OLL',
    alg: "R U2 R' U' R U' R'",
    note:
      'Sune run the other way: the same three corners, twisted in the opposite direction. Use ' +
      'whichever of the two needs fewer repetitions for the case in front of you - both leave ' +
      'the first two layers exactly as they were.',
  },
  { id: 'oll-h', name: 'OLL H / double Sune', category: 'OLL', alg: "R U R' U R U' R' U R U2 R'" },
  { id: 'oll-pi', name: 'OLL Pi', category: 'OLL', alg: "R U2 R2 U' R2 U' R2 U2 R" },
  { id: 'oll-t', name: 'OLL T', category: 'OLL', alg: "Rw U R' U' Rw' F R F'" },
  { id: 'oll-u', name: 'OLL U / headlights', category: 'OLL', alg: "R2 D R' U2 R D' R' U2 R'" },
  { id: 'oll-l', name: 'OLL L', category: 'OLL', alg: "F R' F' Rw U R U' Rw'" },

  // ---- F2L: pair and insert --------------------------------------------
  { id: 'f2l-basic-right', name: 'Insert right pair', category: 'F2L', alg: "U R U' R'", note: 'Pair joined, insert front-right' },
  { id: 'f2l-basic-left', name: 'Insert left pair', category: 'F2L', alg: "U' L' U L", note: 'Pair joined, insert front-left' },
  { id: 'f2l-split-right', name: 'Split then insert (right)', category: 'F2L', alg: "R U' R' U R U' R'" },
  { id: 'f2l-split-left', name: 'Split then insert (left)', category: 'F2L', alg: "F' U F U' F' U F" },
  { id: 'f2l-three-move', name: 'Three-move insert', category: 'F2L', alg: "R U' R'", note: 'Corner in slot, edge above' },
  { id: 'f2l-reset-slot', name: 'Pull pair out of slot', category: 'F2L', alg: "R U R'", note: 'Free a wrongly-built pair' },
  { id: 'f2l-niklas', name: 'Niklas', category: 'F2L', alg: "R U' L' U R' U' L", note: 'Corner 3-cycle without breaking F2L' },
  { id: 'f2l-niklas-mirror', name: 'Niklas (mirror)', category: 'F2L', alg: "L' U R U' L U R'" },

  // ---- Triggers: the small pieces everything is built from -------------
  {
    id: 'trig-sexy',
    name: 'Sexy move',
    category: 'Triggers',
    alg: "R U R' U'",
    note:
      'Takes the corner out of the front-right slot with R, spins the top, and puts it back a ' +
      'third of a turn over. Only four corners and three edges ever move, all of them in the top ' +
      'layer or that one slot, so the rest of the first layer is never at risk - and six ' +
      'repetitions bring the cube back exactly to where it started, which is why you can keep ' +
      'going until the corner lands the right way up.',
  },
  { id: 'trig-sexy-inv', name: 'Reverse sexy', category: 'Triggers', alg: "U R U' R'" },
  { id: 'trig-lefty', name: 'Lefty sexy', category: 'Triggers', alg: "L' U' L U" },
  { id: 'trig-sledge', name: 'Sledgehammer', category: 'Triggers', alg: "R' F R F'" },
  { id: 'trig-hedge', name: 'Hedgeslammer', category: 'Triggers', alg: "F R' F' R" },
  { id: 'trig-sune-trigger', name: 'Sexy x3', category: 'Triggers', alg: "R U R' U' R U R' U' R U R' U'", note: 'Half of the six-cycle' },

  // ---- Beginner method --------------------------------------------------
  { id: 'beg-daisy-corner', name: 'First layer corner', category: 'Beginner', alg: "R' D' R D", note: 'Repeat until the corner drops in' },
  {
    id: 'beg-second-right',
    name: 'Second layer, edge goes right',
    category: 'Beginner',
    alg: "U R U' R' U' F' U F",
    note:
      'Sends the corner above the front-right slot up out of the way, drops the edge into the ' +
      'gap behind it, then puts the corner straight back. The two halves are mirror images of ' +
      'each other - U R U\' R\' and then U\' F\' U F - which is why the first layer ends up ' +
      'untouched even though it comes apart in the middle.',
  },
  {
    id: 'beg-second-left',
    name: 'Second layer, edge goes left',
    category: 'Beginner',
    alg: "U' L' U L U F U' F'",
    note:
      'The same insertion mirrored, for an edge that has to travel left instead of right. The ' +
      'corner above the front-left slot is lifted, the edge is fed in underneath it, and the ' +
      'corner is put back - so nothing already finished below is disturbed.',
  },
  {
    id: 'beg-cross',
    name: 'Yellow cross',
    category: 'Beginner',
    alg: "F R U R' U' F'",
    note:
      'Turns the top edges over. F opens the top layer, the sexy move turns what is inside it, ' +
      'and F\' folds it back, so the first two layers are put back exactly as they were. Each ' +
      'run moves the shape one step along - a dot becomes an L, an L becomes a line, a line ' +
      'becomes the cross - so three goes finish it whatever you start from.',
  },
  {
    id: 'beg-corner-pos',
    name: 'Position last corners',
    category: 'Beginner',
    alg: "U R U' L' U R' U' L",
    note:
      'Sends three top corners round in a ring and leaves the fourth exactly where it is. No ' +
      'edge moves at all, which is what makes it safe to run before the edges are sorted out. ' +
      'Find a corner that is already home, hold it at the front-right, and one or two goes place ' +
      'the other three.',
  },
  {
    id: 'beg-corner-pos-rev',
    name: 'Position last corners (the other way)',
    category: 'Beginner',
    alg: "L' U R U' L U R' U'",
    note:
      'The same corner ring, sent round the other way. Three corners move, the fourth and every ' +
      'edge stay put. Picking the direction that needs one go rather than two is the whole ' +
      'reason for learning both.',
  },
  { id: 'beg-corner-orient', name: 'Orient last corners', category: 'Beginner', alg: "R' D' R D R' D' R D", note: 'Repeat per corner, keep U facing you' },
  {
    id: 'beg-edge-cycle',
    name: 'Cycle last edges',
    category: 'Beginner',
    alg: "R U' R U R U R U' R' U' R2",
    note:
      'Sends three top edges round and leaves the fourth alone. Not one corner moves, so the ' +
      'corners you have just placed cannot be knocked out. Hold the edge that is already correct ' +
      'at the back; if none of them is correct, one run from anywhere fixes one and the second ' +
      'run finishes the cube.',
  },
  {
    id: 'beg-edge-cycle-rev',
    name: 'Cycle last edges (the other way)',
    category: 'Beginner',
    alg: "R2 U R U R' U' R' U' R' U R'",
    note:
      'The same three edges sent round the other way. Corners are untouched here too. Reading ' +
      'which way the three need to travel before you start is what turns two runs into one.',
  },
  {
    id: 'beg-auf',
    name: 'Line the top layer up',
    category: 'Beginner',
    alg: 'U',
    note:
      'Not an algorithm at all - just a turn of the top face. Every piece up there is already ' +
      'in the right order relative to its neighbours, so all that is left is to rotate the whole ' +
      'ring until the side colours meet the centres below.',
  },
];

function build(def: AlgorithmDef): Algorithm {
  const moves = parseAlg(def.alg);
  const targets = algAffectedCubies(moves);
  let corners = 0;
  let edges = 0;
  for (const t of targets) {
    if (cubieKind(t) === 3) corners++;
    else if (cubieKind(t) === 2) edges++;
  }
  return {
    ...def,
    moves,
    targets,
    targetKeys: new Set(targets.map(vecKey)),
    targetSlots: algAffectedSlots(moves),
    corners,
    edges,
  };
}

export const ALGORITHMS: Algorithm[] = DEFS.map(build);

export const ALGORITHMS_BY_ID = new Map(ALGORITHMS.map((a) => [a.id, a]));

export interface SelectionMatch {
  algorithms: Algorithm[];
  /** True when every listed algorithm moves all the selected pieces. */
  exact: boolean;
}

/**
 * Algorithms that touch the given pieces. Ones that move all of them come
 * first; if nothing moves the whole set, anything moving part of it is offered
 * rather than leaving the list empty.
 */
export function algorithmsForSelection(selected: Vec3[]): SelectionMatch {
  if (selected.length === 0) return { algorithms: ALGORITHMS, exact: true };
  const keys = selected.map(vecKey);
  const all = ALGORITHMS.filter((a) => keys.every((k) => a.targetKeys.has(k)));
  if (all.length) return { algorithms: all, exact: true };

  const partial = ALGORITHMS.map((a) => ({
    a,
    hits: keys.filter((k) => a.targetKeys.has(k)).length,
  }))
    .filter((x) => x.hits > 0)
    .sort((x, y) => y.hits - x.hits || x.a.moves.length - y.a.moves.length)
    .map((x) => x.a);
  return { algorithms: partial, exact: false };
}

// ---------------------------------------------------------------------------
// Reading a long sequence as a few things rather than many
// ---------------------------------------------------------------------------

/**
 * The short sequences cubers actually think in. A 25-move beginner step is six
 * repetitions of one of these plus a couple of setup turns; written out move by
 * move it reads as twenty-five things to remember, which is how the app used to
 * present it.
 *
 * `Sexy x3` is deliberately left out: three sexy moves read better as
 * "Sexy move ×3" than as one twelve-move block with its own name.
 */
const TRIGGER_FACES = ['R', 'L', 'F', 'B'];

/**
 * The same trigger performed on a different face is the same trigger - a
 * beginner's corner insertion is the sexy move whether it is written
 * `R U R' U'` or `B U B' U'`. So each four-move trigger that turns exactly one
 * non-U face is generalised across the four side faces, keeping its name. No
 * new entries in the algorithm library: these are shapes, not algorithms.
 */
function faceVariants(name: string, notation: string[]): { name: string; notation: string[] }[] {
  const faces = new Set(notation.map((n) => n[0]).filter((f) => f !== 'U'));
  if (notation.length !== 4 || faces.size !== 1) return [{ name, notation }];
  const base = [...faces][0];
  return TRIGGER_FACES.map((f) => ({
    name,
    notation: notation.map((n) => (n[0] === base ? f + n.slice(1) : n)),
  }));
}

const TRIGGERS = ALGORITHMS.filter((a) => a.category === 'Triggers' && a.id !== 'trig-sune-trigger')
  .flatMap((a) => faceVariants(a.name, a.moves.map((m) => m.notation)))
  .sort((a, b) => b.notation.length - a.notation.length);

export interface MoveChunk {
  /** The trigger's name, or null for moves that are not part of one. */
  label: string | null;
  /** Index of the first move of the chunk. */
  start: number;
  /** How many moves the chunk covers in total, repeats included. */
  length: number;
  /** How many times the trigger runs back to back. 1 for a plain run. */
  repeat: number;
}

const matchesAt = (notation: string[], at: number, pattern: string[]) =>
  pattern.every((p, i) => notation[at + i] === p);

/**
 * Break a move sequence into the triggers it is built from. Greedy and
 * longest-first, with back-to-back repeats of the same trigger merged, so
 * `L U L' U' L U L' U' U B U B'` reads as "Sexy move ×2, U, Reverse sexy".
 */
export function chunkByTriggers(notation: string[]): MoveChunk[] {
  const out: MoveChunk[] = [];
  let i = 0;
  while (i < notation.length) {
    const hit = TRIGGERS.find(
      (t) => i + t.notation.length <= notation.length && matchesAt(notation, i, t.notation)
    );
    if (hit) {
      let repeat = 1;
      while (
        i + hit.notation.length * (repeat + 1) <= notation.length &&
        matchesAt(notation, i + hit.notation.length * repeat, hit.notation)
      ) {
        repeat++;
      }
      out.push({
        label: hit.name,
        start: i,
        length: hit.notation.length * repeat,
        repeat,
      });
      i += hit.notation.length * repeat;
      continue;
    }
    // A run of moves belonging to no trigger is one unlabelled chunk.
    const start = i;
    while (
      i < notation.length &&
      !TRIGGERS.some(
        (t) => i + t.notation.length <= notation.length && matchesAt(notation, i, t.notation)
      )
    ) {
      i++;
    }
    out.push({ label: null, start, length: i - start, repeat: 1 });
  }
  return out;
}
