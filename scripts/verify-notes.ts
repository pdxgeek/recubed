/**
 * Does the teaching copy say what the cube actually does?
 *
 * `verify-plan.ts` asserted that a note *exists* and is longer than a label.
 * That is the wrong bar: `oll-sune`'s note said "twists three of the four top
 * corners and leaves the fourth alone" for four rounds, while the engine says
 * `R U R' U'`... sorry, `R U R' U R U2 R'` permutes all four of them and cycles
 * three top edges as well - and the sheet printed a contradicting count three
 * lines below it. Prose that exists is not prose that is true.
 *
 * Two layers here, both driven by the engine and never by a hand-written
 * number:
 *
 *   1. PHRASE RULES. Every note is scanned for the kinds of claim the copy
 *      makes - "leaves the fourth alone", "no edge moves at all", "clockwise",
 *      "six repetitions". Whenever a phrase matches, its claim must hold. These
 *      catch a claim reintroduced anywhere in the library, in a note nobody
 *      thought to re-check.
 *   2. PER-ALGORITHM CLAIMS. The specific structural things the long notes say,
 *      one predicate per sentence, so rewriting a sentence and leaving the
 *      claim behind fails here rather than teaching someone the wrong cube.
 */
import { ALGORITHMS, Algorithm } from '../src/cube/algorithms';
import { algorithmForStep, buildPlan } from '../src/cube/solver/plan';
import { applyAlg, isSolved, solvedState } from '../src/cube/core';
import { BASIC_MOVES, Corner, CubieCube, Edge, stateToCubie } from '../src/cube/cubie';

const U_CORNERS = [Corner.URF, Corner.UFL, Corner.ULB, Corner.UBR];
const U_EDGES = [Edge.UR, Edge.UF, Edge.UL, Edge.UB];
/** Clockwise around the top face, seen from above with the front nearest you. */
const CLOCKWISE_TOP_EDGES = [Edge.UB, Edge.UR, Edge.UF, Edge.UL];

export interface Facts {
  cube: CubieCube;
  cornersMoved: number;
  edgesMoved: number;
  cornersUntouched: number;
  edgesUntouched: number;
  /**
   * Left completely alone *within the top layer*. The whole-cube count is no
   * use for "leaves the fourth alone": Sune leaves four corners untouched by
   * that measure - the four on the bottom - while permuting every one of the
   * four the sentence is about.
   */
  topCornersUntouched: number;
  topEdgesUntouched: number;
  cornersTwisted: number;
  edgesFlipped: number;
  /** Which corner slots take a twist, by name - "front-right" and friends. */
  twistedCorners: string[];
  /** True when nothing outside the top layer ends up displaced. */
  firstTwoLayersUntouched: boolean;
  /** Repetitions that bring a solved cube back to solved. */
  order: number;
  /** Direction three top edges travel, when exactly three of them do. */
  edgeTravel: 'clockwise' | 'anticlockwise' | null;
}

const CORNER_PLACE: Record<number, string> = {
  [Corner.URF]: 'front-right',
  [Corner.UFL]: 'front-left',
  [Corner.ULB]: 'back-left',
  [Corner.UBR]: 'back-right',
};

const cubeAfter = (alg: string) => stateToCubie(applyAlg(solvedState(), alg));

function order(alg: string): number {
  let st = solvedState();
  for (let i = 1; i <= 200; i++) {
    st = applyAlg(st, alg);
    if (isSolved(st)) return i;
  }
  return -1;
}

/**
 * Which way three top edges travel, seen from above with the front nearest you.
 *
 * Not by counting quarter turns between slots: the three moved slots skip the
 * one that stays put, so the gaps are uneven and a fixed step size says
 * nothing. Order the three that move the way a U turn would visit them and ask
 * whether the cycle follows that order or reverses it.
 */
function edgeTravel(c: CubieCube): 'clockwise' | 'anticlockwise' | null {
  const changed = c.ep.filter((p, i) => p !== i || c.eo[i] !== 0).length;
  const moved = CLOCKWISE_TOP_EDGES.filter((e) => c.ep[e] !== e);
  if (moved.length !== 3 || changed !== 3) return null;
  if (c.eo.some((o) => o !== 0)) return null;
  /** Where the piece currently in slot `s` ends up. */
  const dest = (s: number) => c.ep.indexOf(s);
  const forward = moved.every((e, i) => dest(e) === moved[(i + 1) % 3]);
  const backward = moved.every((e, i) => dest(e) === moved[(i + 2) % 3]);
  return forward ? 'clockwise' : backward ? 'anticlockwise' : null;
}

export function factsFor(alg: string): Facts {
  const c = cubeAfter(alg);
  const cornersMoved = c.cp.filter((p, i) => p !== i || c.co[i] !== 0).length;
  const edgesMoved = c.ep.filter((p, i) => p !== i || c.eo[i] !== 0).length;
  const outsideTop =
    c.cp.some((p, i) => (p !== i || c.co[i] !== 0) && !U_CORNERS.includes(i)) ||
    c.ep.some((p, i) => (p !== i || c.eo[i] !== 0) && !U_EDGES.includes(i));
  return {
    cube: c,
    cornersMoved,
    edgesMoved,
    cornersUntouched: 8 - cornersMoved,
    edgesUntouched: 12 - edgesMoved,
    topCornersUntouched: U_CORNERS.filter((i) => c.cp[i] === i && c.co[i] === 0).length,
    topEdgesUntouched: U_EDGES.filter((i) => c.ep[i] === i && c.eo[i] === 0).length,
    cornersTwisted: c.co.filter((o) => o !== 0).length,
    edgesFlipped: c.eo.filter((o) => o !== 0).length,
    twistedCorners: U_CORNERS.filter((i) => c.co[i] !== 0).map((i) => CORNER_PLACE[i]),
    firstTwoLayersUntouched: !outsideTop,
    order: order(alg),
    edgeTravel: edgeTravel(c),
  };
}

// ---------------------------------------------------------------------------
// 1. Phrase rules
// ---------------------------------------------------------------------------

const NUMBER: Record<string, number> = {
  no: 0, none: 0, zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12,
};
const num = (word: string) => (word in NUMBER ? NUMBER[word] : Number(word));

/** A note is checked sentence by sentence: claims do not cross full stops. */
const sentences = (note: string) => note.split(/(?<=\.)\s+/).filter(Boolean);

interface Rule {
  what: string;
  test: (s: string, f: Facts) => string | null;
}

const RULES: Rule[] = [
  {
    what: '"leaves the fourth alone" needs a piece that really is left alone',
    test: (s, f) => {
      if (!/leaves? the (fourth|other)[a-z ]*\balone\b|leaves? the fourth exactly where it is|the fourth (and every \w+ )?stays? put|fourth stays put/.test(s)) {
        return null;
      }
      const aboutCorners = /corner/.test(s);
      const aboutEdges = /edge/.test(s);
      if (aboutCorners && f.topCornersUntouched < 1) {
        return `claims one of the four top corners is left alone, but all four are displaced`;
      }
      if (aboutEdges && !aboutCorners && f.topEdgesUntouched < 1) {
        return 'claims one of the four top edges is left alone, but all four are displaced';
      }
      if (!aboutCorners && !aboutEdges) return 'claims something is left alone without saying what';
      return null;
    },
  },
  {
    what: '"no corner/edge moves" needs a zero',
    test: (s, f) => {
      if (/\bno edges? moves?\b|not one edge moves|leaves every edge alone|every edge stays? put|edges are untouched/.test(s) && f.edgesMoved !== 0) {
        return `claims no edge moves, but ${f.edgesMoved} do`;
      }
      if (/\bno corners? moves?\b|not one corner moves|leaves every corner (alone|untouched)|corners are untouched/.test(s) && f.cornersMoved !== 0) {
        return `claims no corner moves, but ${f.cornersMoved} do`;
      }
      return null;
    },
  },
  {
    what: '"N corners and M edges move" must be N and M',
    test: (s, f) => {
      const m = /(\w+) corners? and (\w+) edges? (?:ever )?move/.exec(s);
      if (!m) return null;
      const c = num(m[1]);
      const e = num(m[2]);
      if (Number.isNaN(c) || Number.isNaN(e)) return null;
      if (c !== f.cornersMoved || e !== f.edgesMoved) {
        return `says ${c} corners and ${e} edges move; the engine moves ${f.cornersMoved} and ${f.edgesMoved}`;
      }
      return null;
    },
  },
  {
    what: '"twists N corners" must twist N corners',
    test: (s, f) => {
      const m = /(?:twists|turns) (\w+)(?: of the \w+)? (?:top )?corners/.exec(s);
      if (!m) return null;
      const n = num(m[1]);
      if (Number.isNaN(n)) return null;
      return n === f.cornersTwisted
        ? null
        : `says it twists ${n} corners; the engine twists ${f.cornersTwisted}`;
    },
  },
  {
    what: 'a stated edge direction must be the direction the edges travel',
    test: (s, f) => {
      if (!/edge/.test(s)) return null;
      const said = /anticlockwise|counter-?clockwise/.test(s)
        ? 'anticlockwise'
        : /clockwise/.test(s)
          ? 'clockwise'
          : null;
      if (!said) return null;
      if (!f.edgeTravel) return 'names a direction, but this is not a plain three-edge cycle of the top';
      return said === f.edgeTravel
        ? null
        : `says the edges go ${said}; seen from above they go ${f.edgeTravel}`;
    },
  },
  {
    what: '"X run the other way: the same three corners" must be the same three',
    test: (s, f) => {
      const m = /^(.+?) run the other way: the same three corners/.exec(s.trim());
      if (!m) return null;
      const other = ALGORITHMS.find((a) => a.name.toLowerCase() === m[1].trim());
      if (!other) return `refers to "${m[1]}", which is not an algorithm in the library`;
      const theirs = factsFor(other.alg).twistedCorners;
      const same =
        theirs.length === f.twistedCorners.length && theirs.every((c) => f.twistedCorners.includes(c));
      return same
        ? null
        : `says it twists the same three corners as ${other.name}; ${other.name} twists ` +
          `${theirs.join(', ')} and this twists ${f.twistedCorners.join(', ')}`;
    },
  },
  {
    what: '"six repetitions bring the cube back" must be its order',
    test: (s, f) => {
      const m = /(\w+) repetitions bring the cube back/.exec(s);
      if (!m) return null;
      const n = num(m[1]);
      return n === f.order ? null : `says ${n} repetitions return the cube; its order is ${f.order}`;
    },
  },
  {
    what: '"the first two layers exactly as they were" must be true',
    test: (s, f) =>
      /first two layers (?:end up |are put back )?exactly as they were/.test(s) && !f.firstTwoLayersUntouched
        ? 'claims the first two layers are untouched, but something below the top layer moves'
        : null,
  },
  {
    what: '"nothing else on the cube" must mean nothing else',
    test: (s, f) => {
      const m = /(\w+) pieces, and nothing else on the cube/.exec(s);
      if (!m) return null;
      const n = num(m[1]);
      const moved = f.cornersMoved + f.edgesMoved;
      return n === moved ? null : `says ${n} pieces and nothing else; ${moved} pieces move`;
    },
  },
];

// ---------------------------------------------------------------------------
// 2. Per-algorithm claims, one predicate per sentence that makes one
// ---------------------------------------------------------------------------

type Claim = (f: Facts) => string | null;

const CLAIMS: Record<string, Claim[]> = {
  'oll-sune': [
    (f) => (f.cornersTwisted === 3 ? null : `"three of the four ... the right way up": ${f.cornersTwisted} twisted`),
    (f) => (f.cornersMoved === 4 ? null : `"all four swap places": ${f.cornersMoved} corners move`),
    (f) => (f.edgesMoved === 3 ? null : `"three top edges cycle": ${f.edgesMoved} edges move`),
    (f) => (f.firstTwoLayersUntouched ? null : '"the first two layers end up exactly as they were"'),
    (f) =>
      f.twistedCorners.join() === 'front-right,front-left,back-left'
        ? null
        : `Anti-Sune's note names Sune's corners as the two front and the back-left; Sune twists ${f.twistedCorners.join(', ')}`,
  ],
  'oll-antisune': [
    (f) => (f.cornersTwisted === 3 ? null : `"twists three top corners": ${f.cornersTwisted}`),
    (f) => (f.cornersMoved === 4 ? null : `"swaps all four top corners round": ${f.cornersMoved}`),
    (f) => (f.edgesMoved === 3 ? null : `"cycles three top edges": ${f.edgesMoved}`),
    (f) => (f.firstTwoLayersUntouched ? null : '"leaves the first two layers exactly as they were"'),
    (f) =>
      f.twistedCorners.join() === 'front-right,back-left,back-right'
        ? null
        : `"the front-right and both back corners": it twists ${f.twistedCorners.join(', ')}`,
    () =>
      isSolved(applyAlg(applyAlg(solvedState(), "R U R' U R U2 R'"), "R U2 R' U' R U' R'"))
        ? null
        : '"Sune run backwards - one straight after the other leaves the cube exactly as it was"',
  ],
  'trig-sexy': [
    (f) =>
      f.cornersMoved + f.edgesMoved === 7 ? null : `"seven pieces move in all": ${f.cornersMoved + f.edgesMoved}`,
    (f) => (f.order === 6 ? null : `"six repetitions bring the cube back": order ${f.order}`),
    (f) => {
      // "the corner and the edge in the {slot} column, and five of the eight in
      // the top layer" - so exactly two displaced pieces sit outside the top,
      // and they are the front-right corner slot and the front-right edge slot.
      const c = f.cube;
      const belowCorners = c.cp.filter((p, i) => (p !== i || c.co[i] !== 0) && !U_CORNERS.includes(i));
      const belowEdges = c.ep.filter((p, i) => (p !== i || c.eo[i] !== 0) && !U_EDGES.includes(i));
      const cornerBelow = c.cp.findIndex((p, i) => (p !== i || c.co[i] !== 0) && !U_CORNERS.includes(i));
      const edgeBelow = c.ep.findIndex((p, i) => (p !== i || c.eo[i] !== 0) && !U_EDGES.includes(i));
      if (belowCorners.length !== 1 || belowEdges.length !== 1) {
        return `"nothing else in the first two layers": ${belowCorners.length} corners and ${belowEdges.length} edges below the top move`;
      }
      if (cornerBelow !== Corner.DFR || edgeBelow !== Edge.FR) {
        return 'the two pieces below the top are not the front-right corner and edge';
      }
      const top = f.cornersMoved - 1 + (f.edgesMoved - 1);
      return top === 5 ? null : `"five of the eight in the top layer": ${top}`;
    },
  ],
  'beg-corner-pos': [
    (f) => (f.cornersMoved === 3 ? null : `"three top corners round in a ring": ${f.cornersMoved}`),
    (f) => (f.topCornersUntouched === 1 ? null : 'the fourth top corner is not left where it is'),
    (f) => (f.edgesMoved === 0 ? null : `"moves no edge at all": ${f.edgesMoved} edges move`),
    (f) =>
      f.cube.cp[Corner.URF] === Corner.URF && f.cube.co[Corner.URF] === 0
        ? null
        : '"hold it at the front-right": the front-right corner is not the one left alone',
  ],
  'beg-corner-pos-rev': [
    (f) => (f.cornersMoved === 3 ? null : `"three corners move": ${f.cornersMoved}`),
    (f) => (f.edgesMoved === 0 ? null : `"leaves every edge alone": ${f.edgesMoved} edges move`),
  ],
  'beg-edge-cycle': [
    (f) => (f.edgesMoved === 3 ? null : `"three top edges": ${f.edgesMoved}`),
    (f) => (f.cornersMoved === 0 ? null : `"not one corner": ${f.cornersMoved} corners move`),
    (f) =>
      f.cube.ep[Edge.UB] === Edge.UB && f.cube.eo[Edge.UB] === 0
        ? null
        : '"hold the edge that is already correct at the back": the back edge is not the one left alone',
  ],
  'beg-edge-cycle-rev': [
    (f) => (f.edgesMoved === 3 ? null : `"the same three edges": ${f.edgesMoved}`),
    (f) => (f.cornersMoved === 0 ? null : `"leaves every corner untouched": ${f.cornersMoved} move`),
  ],
  'beg-cross': [
    (f) => (f.firstTwoLayersUntouched ? null : '"the first two layers are put back exactly as they were"'),
    (f) => (f.edgesFlipped > 0 ? null : '"turns the top edges over": nothing is flipped'),
  ],
  'beg-second-right': [
    (f) =>
      f.firstTwoLayersUntouched ||
      (f.cube.cp.every((p, i) => p === i && f.cube.co[i] === 0 || U_CORNERS.includes(i)) &&
        f.cube.ep.every((p, i) => p === i && f.cube.eo[i] === 0 || U_EDGES.includes(i) || i === Edge.FR))
        ? null
        : '"the first layer ends up untouched": something outside the top and the front-right slot moves',
  ],
  'beg-second-left': [
    (f) =>
      f.cube.cp.every((p, i) => (p === i && f.cube.co[i] === 0) || U_CORNERS.includes(i)) &&
      f.cube.ep.every((p, i) => (p === i && f.cube.eo[i] === 0) || U_EDGES.includes(i) || i === Edge.FL)
        ? null
        : '"nothing already finished below is disturbed"',
  ],
  'pll-t': [
    (f) => (f.cornersMoved === 2 && f.edgesMoved === 2 ? null : 'not a two-corner, two-edge swap'),
    () =>
      isSolved(
        applyAlg(
          applyAlg(solvedState(), "R U R' U' R' F R2 U' R' U' R U R' F'"),
          "R U R' U' R' F R2 U' R' U' R U R' F'"
        )
      )
        ? null
        : '"running it a second time undoes it exactly"',
  ],
  // "Half of the six-cycle": three sexy moves out of the six that return the
  // cube, so running this twice must be identity.
  'trig-sune-trigger': [
    (f) => (order("R U R' U'") === 6 && f.order === 2 ? null : `"half of the six-cycle": order ${f.order}`),
  ],
};

// ---------------------------------------------------------------------------

let fails = 0;
let phraseChecks = 0;
let claimChecks = 0;
const withNote = ALGORITHMS.filter((a: Algorithm) => a.note);

for (const a of withNote) {
  const f = factsFor(a.alg);
  for (const s of sentences(a.note!)) {
    for (const rule of RULES) {
      phraseChecks++;
      const bad = rule.test(s.toLowerCase(), f);
      if (bad) {
        fails++;
        console.log(`FAIL  ${a.id} (${a.alg}): ${bad}`);
        console.log(`      rule: ${rule.what}`);
        console.log(`      "${s.trim()}"`);
      }
    }
  }
  for (const claim of CLAIMS[a.id] ?? []) {
    claimChecks++;
    const bad = claim(f);
    if (bad) {
      fails++;
      console.log(`FAIL  ${a.id} (${a.alg}): ${bad}`);
    }
  }
}

// Every algorithm's declared corner/edge counts are the engine's counts. The
// footnote and the sheet both read these, so a wrong one is wrong twice.
{
  let bad = 0;
  for (const a of ALGORITHMS) {
    const f = factsFor(a.alg);
    if (a.corners !== f.cornersMoved || a.edges !== f.edgesMoved) {
      bad++;
      console.log(
        `FAIL  ${a.id}: library says ${a.corners}c/${a.edges}e, engine says ${f.cornersMoved}c/${f.edgesMoved}e`
      );
    }
  }
  if (bad) fails += bad;
  else console.log(`ok    all ${ALGORITHMS.length} library piece counts match the engine`);
}

// --- the names the plan puts on a step must not name the wrong direction ----
//
// `beginner.ts` labels its two edge cycles "(clockwise)" and "(anticlockwise)"
// and those strings are what a learner reads on the step row. Both were the
// wrong way round: `R U' R U R U R U' R' U' R2` sends the front edge to the
// right, which is anticlockwise seen from above.
{
  let seed = 90210;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const scramble = () =>
    Array.from({ length: 25 }, () => BASIC_MOVES[Math.floor(rnd() * 18)]).join(' ');
  let checked = 0;
  let bad = 0;
  const named = new Set<string>();
  const plans = Array.from({ length: 12 }, () => buildPlan(applyAlg(solvedState(), scramble())));
  for (const method of plans.flatMap((p) => p.methods)) {
    for (const st of method.steps) {
      const alg = algorithmForStep(st);
      const said = /anticlockwise/.test(st.algorithm ?? '')
        ? 'anticlockwise'
        : /clockwise/.test(st.algorithm ?? '')
          ? 'clockwise'
          : null;
      if (!said || !alg) continue;
      checked++;
      named.add(`${st.algorithm}`);
      const travel = factsFor(alg.alg).edgeTravel;
      if (travel !== said) {
        bad++;
        console.log(`FAIL  the step tag "${st.algorithm}" says ${said}; the edges travel ${travel}`);
      }
    }
  }
  if (bad) fails += bad;
  else if (checked === 0) console.log('ok    (no step in this plan names a direction)');
  else console.log(`ok    ${checked} step tags naming a direction name the right one (${[...named].join(', ')})`);
}

console.log(
  `\n${withNote.length} notes · ${phraseChecks} phrase checks · ${claimChecks} claims · ${fails} failures`
);
process.exit(fails ? 1 : 0);
