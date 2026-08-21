/**
 * Machine-checks `src/cube/cases.ts`: the case position each algorithm is for,
 * the pieces it moves, the summary the teaching page prints, and the trigger
 * blocks the filmstrip renders.
 *
 * Everything here is recomputed a second way. `cases.ts` reads the case
 * position through the cubie model (`stateToCubie`, `cp`/`co`/`ep`/`eo`); this
 * script reads it through sticker tracking (`CubeState.home`) and through raw
 * sticker colours, and the two must land on the same answer. A shared helper
 * would let a bug live in both the code and its test at once, which is the one
 * failure mode a verifier cannot report.
 *
 * WHAT EACH CATEGORY GUARANTEES
 *
 * The case position is the algorithm run backwards from solved, so running the
 * algorithm from it lands exactly on a solved cube - for every category,
 * without exception, because A after A-inverse is nothing at all. That is
 * asserted for all of them, and it is a statement about the derivation, not
 * about the algorithm. What the algorithm is actually *for* differs:
 *
 *   PLL  permutes the last layer and nothing else. Checked: the case position
 *        differs from solved only in the top layer, and every top-layer piece is
 *        already the right way up in it - a PLL case never has a twisted corner
 *        or a flipped edge to fix, because orientation was finished before it.
 *
 *   OLL  orients the last layer and is allowed to scramble its permutation.
 *        Checked: the case position differs from solved only in the top layer,
 *        and running the algorithm makes the whole top face one colour. That
 *        last part is the real promise. This particular case position also gets
 *        the permutation right, because it was built by inverting the same
 *        algorithm - a fully solved finish here is a property of the derivation,
 *        so it is NOT claimed as an OLL guarantee.
 *
 *   F2L / Triggers / Beginner
 *        No layer is promised intact: `R U R'` deliberately opens a slot, and
 *        the beginner corner-inserter takes the first layer apart in the middle
 *        of itself. Checked: the case position is a legal cube and the algorithm
 *        returns it to solved - which is everything that is true of all of them.
 *
 * Run: npx tsx scripts/verify-cases.ts
 */
import { Quaternion } from 'three';
import {
  CASES,
  DEFAULT_VIEW_FACES,
  buildCase,
  caseStateFor,
  invertMoves,
} from '../src/cube/cases';
import { ALGORITHMS } from '../src/cube/algorithms';
import {
  CENTER_SLOT,
  ColorId,
  CubeState,
  DEFAULT_SCHEME,
  FACES,
  FACE_NORMAL,
  Face,
  Move,
  SLOTS,
  SLOTS_BY_CUBIE,
  Vec3,
  applyAlg,
  cubieKind,
  parseAlg,
  resetTracking,
  solvedState,
  vecKey,
} from '../src/cube/core';
import {
  CORNER_FACELET,
  CORNER_POSITION,
  EDGE_FACELET,
  EDGE_POSITION,
  IDENTITY,
  applyAlgCubie,
  isCubieSolved,
  stateToCubie,
  validate,
} from '../src/cube/cubie';
import { solveBeginner } from '../src/cube/solver/beginner';
import { notationBlocks } from '../src/ui/notation';
import { restingOrientation } from '../src/render/view';

let bad = 0;
const fail = (msg: string) => {
  bad++;
  console.log(`FAIL  ${msg}`);
};
const check = (ok: boolean, msg: string) => {
  if (!ok) fail(msg);
  return ok;
};

const SOLVED = solvedState();
const sameColors = (a: CubeState, b: CubeState) => a.colors.every((c, i) => c === b.colors[i]);
const notation = (moves: Move[]) => moves.map((m) => m.notation);

// ---------------------------------------------------------------------------
// A second reading of the case position, from sticker tracking
// ---------------------------------------------------------------------------

/**
 * `cp`/`co`/`ep`/`eo` for the case position, derived without `stateToCubie`.
 *
 * Run the algorithm from the case position with tracking on. It finishes
 * solved, so slot `t` then holds the sticker that *belongs* at `t`, and
 * `home[t]` says which slot that sticker was sitting in beforehand. Reading
 * that backwards gives, for every piece, where it started and which way round
 * it was - the same four arrays, from sticker indices rather than colours.
 */
function trackedCubie(caseState: CubeState, moves: Move[]) {
  const end = applyAlg(resetTracking(caseState), moves);
  const cornerSlot = new Map(CORNER_POSITION.map((p, i) => [vecKey(p), i]));
  const edgeSlot = new Map(EDGE_POSITION.map((p, i) => [vecKey(p), i]));

  const cp = new Array<number>(8).fill(-1);
  const co = new Array<number>(8).fill(-1);
  for (let j = 0; j < 8; j++) {
    // The piece's white-or-yellow sticker: CORNER_FACE[j][0] is always U or D.
    const was = end.home[CORNER_FACELET[j][0]];
    const i = cornerSlot.get(vecKey(SLOTS[was].pos))!;
    cp[i] = j;
    co[i] = CORNER_FACELET[i].indexOf(was);
  }
  const ep = new Array<number>(12).fill(-1);
  const eo = new Array<number>(12).fill(-1);
  for (let j = 0; j < 12; j++) {
    const was = end.home[EDGE_FACELET[j][0]];
    const i = edgeSlot.get(vecKey(SLOTS[was].pos))!;
    ep[i] = j;
    eo[i] = was === EDGE_FACELET[i][0] ? 0 : 1;
  }
  return { cp, co, ep, eo };
}

// ---------------------------------------------------------------------------
// A third reading: which pieces differ, straight from the sticker colours
// ---------------------------------------------------------------------------

/**
 * Corner and edge counts for the pieces that are not already home, taken by
 * diffing the case position against a solved cube sticker by sticker.
 *
 * No tracking, no cubie model: a piece counts when any sticker on it wears a
 * different colour than it would on a solved cube. On a real cube every piece
 * carries a different set of colours, so this cannot miss one.
 */
function colorDiffCounts(caseState: CubeState) {
  let corners = 0;
  let edges = 0;
  const positions: Vec3[] = [];
  for (const [key, slots] of SLOTS_BY_CUBIE) {
    const pos = SLOTS[slots[0]].pos;
    const kind = cubieKind(pos);
    if (kind !== 2 && kind !== 3) continue;
    if (slots.every((s) => caseState.colors[s] === SOLVED.colors[s])) continue;
    positions.push(pos);
    if (kind === 3) corners++;
    else edges++;
    void key;
  }
  return { corners, edges, positions };
}

/**
 * Where each displaced piece starts and finishes, identified by the *set of
 * colours* it is wearing rather than by any index the module computed.
 */
function colorTravels(caseState: CubeState) {
  const colorKey = (colors: (ColorId | null)[], slots: number[]) =>
    slots
      .map((s) => colors[s])
      .sort()
      .join('');
  const homeByColors = new Map<string, string>();
  for (const [key, slots] of SLOTS_BY_CUBIE) {
    if (cubieKind(SLOTS[slots[0]].pos) < 2) continue;
    homeByColors.set(colorKey(SOLVED.colors, slots), key);
  }
  const out = new Map<string, string>(); // from cubie key -> to cubie key
  for (const [key, slots] of SLOTS_BY_CUBIE) {
    if (cubieKind(SLOTS[slots[0]].pos) < 2) continue;
    const home = homeByColors.get(colorKey(caseState.colors, slots));
    if (home === undefined) throw new Error(`case position has no piece wearing the colours at ${key}`);
    out.set(key, home);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The resting camera really does show U, R and F
// ---------------------------------------------------------------------------
{
  // Quaternion rotation written out longhand rather than through three's
  // Vector3.applyQuaternion, so this is a check and not an echo.
  const q = restingOrientation(new Quaternion());
  const rotate = (v: Vec3): Vec3 => {
    const [x, y, z] = v;
    const cx = q.y * z - q.z * y;
    const cy = q.z * x - q.x * z;
    const cz = q.x * y - q.y * x;
    const tx = 2 * (cx + q.w * x);
    const ty = 2 * (cy + q.w * y);
    const tz = 2 * (cz + q.w * z);
    return [
      x + q.y * tz - q.z * ty,
      y + q.z * tx - q.x * tz,
      z + q.x * ty - q.y * tx,
    ];
  };
  // The camera sits on +Z looking back at the origin, so a face shows when its
  // normal has turned to point towards the viewer.
  const showing = FACES.filter((f) => rotate(FACE_NORMAL[f])[2] > 1e-6);
  check(
    showing.join('') === [...DEFAULT_VIEW_FACES].join(''),
    `DEFAULT_VIEW_FACES says ${[...DEFAULT_VIEW_FACES].join('')} but restingOrientation shows ` +
      `${showing.join('')} - src/render/view.ts changed its resting angle`
  );
  console.log(`ok    resting view shows ${showing.join(', ')}`);
}

// ---------------------------------------------------------------------------
// Inverting a sequence
// ---------------------------------------------------------------------------
{
  const cases: [string, string][] = [
    ["R U R' U'", "U R U' R'"],
    ['M2 U M2', "M2 U' M2"],
    ["x R' U R' D2 R U' R' D2 R2 x'", "x R2 D2 R U R' D2 R U' R x'"],
    ['U2 F2 Rw2', "Rw2 F2 U2"],
    ['y', "y'"],
  ];
  for (const [alg, want] of cases) {
    const got = notation(invertMoves(parseAlg(alg))).join(' ');
    check(got === want, `invertMoves("${alg}") = "${got}", want "${want}"`);
  }
  // Reversing without inverting, or inverting without reversing, must not pass.
  const alg = parseAlg("R U R' U'");
  check(
    notation(invertMoves(alg)).join(' ') !== notation(alg.slice().reverse()).join(' '),
    'invertMoves only reversed the order'
  );
  console.log(`ok    inversion, ${cases.length} sequences`);
}

check(CASES.length === ALGORITHMS.length, `${CASES.length} cases for ${ALGORITHMS.length} algorithms`);

// ---------------------------------------------------------------------------
// Every algorithm
// ---------------------------------------------------------------------------
for (const c of CASES) {
  const label = `${c.category.padEnd(8)} ${c.name.padEnd(34)}`;
  const before = bad;

  // --- the case position is what the algorithm solves from -----------------
  const finish = applyAlg(c.caseState, c.moves);
  check(sameColors(finish, SOLVED), `${label} algorithm does not solve its own case position`);
  check(
    sameColors(applyAlg(SOLVED, c.setup), c.caseState),
    `${label} setup moves do not build the case position`
  );
  check(
    c.setupAlg === notation(invertMoves(c.moves)).join(' '),
    `${label} setupAlg is not the inverse of the algorithm`
  );

  // The case position is where an animation starts, so its piece tracking has
  // to start clean - otherwise the first frame reports travel the learner never
  // saw, inherited from the setup moves that built the position off-screen.
  check(
    c.caseState.home.every((h, i) => h === i),
    `${label} case position carries piece tracking left over from the setup moves`
  );

  // --- it round-trips ------------------------------------------------------
  check(
    notation(invertMoves(invertMoves(c.moves))).join(' ') === c.notation.join(' '),
    `${label} inverting twice does not give the algorithm back`
  );
  // Re-running the derivation must land in the same place, and the case of the
  // inverse sequence must be where the algorithm takes a solved cube.
  check(sameColors(caseStateFor(c.moves), c.caseState), `${label} case derivation is not stable`);
  check(
    sameColors(caseStateFor(invertMoves(c.moves)), applyAlg(SOLVED, c.moves)),
    `${label} case of the inverse is not the algorithm's own finish`
  );
  const rebuilt = buildCase(ALGORITHMS.find((a) => a.id === c.id)!);
  check(sameColors(rebuilt.caseState, c.caseState), `${label} buildCase is not deterministic`);

  // --- the case position is a legal cube -----------------------------------
  let legal = true;
  try {
    const problem = validate(stateToCubie(c.caseState));
    if (problem) {
      legal = false;
      fail(`${label} case position is illegal: ${problem}`);
    }
  } catch (err) {
    legal = false;
    fail(`${label} case position is not a readable cube: ${String(err)}`);
  }
  // Constructive proof of the same thing: the project's beginner solver has to
  // be able to take it apart. A position that validates but cannot be solved
  // would still be a broken derivation.
  if (legal) {
    try {
      let cube = stateToCubie(c.caseState);
      for (const stage of solveBeginner(cube)) {
        for (const mv of stage.moves) cube = applyAlgCubie(cube, mv.notation);
      }
      check(isCubieSolved(cube), `${label} beginner solver cannot solve the case position`);
    } catch (err) {
      fail(`${label} beginner solver threw on the case position: ${String(err)}`);
    }
  }
  // Centres stay put, so "solved" means solved and not merely solved-if-you-
  // turn-the-whole-cube. Every algorithm in the library is centre-neutral.
  check(
    FACES.every((f) => c.caseState.colors[CENTER_SLOT[f]] === DEFAULT_SCHEME[f]),
    `${label} case position has moved a centre`
  );

  // --- the pieces that move, counted three ways ----------------------------
  const tracked = trackedCubie(c.caseState, c.moves);
  check(
    JSON.stringify(tracked) === JSON.stringify(c.caseCubie),
    `${label} sticker tracking and the cubie model disagree about the case position`
  );

  const diff = colorDiffCounts(c.caseState);
  check(
    diff.corners === c.summary.corners && diff.edges === c.summary.edges,
    `${label} summary says ${c.summary.corners}c/${c.summary.edges}e, colour diff says ` +
      `${diff.corners}c/${diff.edges}e`
  );
  check(
    c.travels.length === diff.corners + diff.edges,
    `${label} ${c.travels.length} travels for ${diff.corners + diff.edges} changed pieces`
  );
  check(
    c.summary.pieces === c.summary.corners + c.summary.edges,
    `${label} summary.pieces does not add up`
  );
  check(
    c.travels.filter((t) => t.kind === 'corner').length === diff.corners &&
      c.travels.filter((t) => t.kind === 'edge').length === diff.edges,
    `${label} travels are split wrongly between corners and edges`
  );
  // Every travel must name a piece the colour diff also flagged, and vice versa.
  const diffKeys = new Set(diff.positions.map(vecKey));
  check(
    c.travels.every((t) => diffKeys.has(vecKey(t.from))) && c.travels.length === diffKeys.size,
    `${label} travels and the colour diff disagree about which pieces changed`
  );

  // --- where each piece travels, read from its colours ---------------------
  const byColor = colorTravels(c.caseState);
  for (const t of c.travels) {
    const want = byColor.get(vecKey(t.from));
    check(
      want === vecKey(t.to),
      `${label} piece at ${t.fromName} goes to ${t.toName}, colours say ${want}`
    );
    check(t.permuted === (vecKey(t.from) !== vecKey(t.to)), `${label} ${t.fromName} permuted flag`);
    check(t.reoriented === (t.twist !== 0), `${label} ${t.fromName} reoriented flag`);
    check(
      t.permuted || t.reoriented,
      `${label} ${t.fromName} is listed as travelling but neither moves nor turns`
    );
    check(t.twist >= 0 && t.twist < (t.kind === 'corner' ? 3 : 2), `${label} ${t.fromName} twist range`);
    const slotsAt = (p: Vec3) => SLOTS_BY_CUBIE.get(vecKey(p))!.slice().sort((a, b) => a - b);
    check(
      t.fromSlots.join() === slotsAt(t.from).join() && t.toSlots.join() === slotsAt(t.to).join(),
      `${label} ${t.fromName} sticker slots`
    );
  }
  // Pieces land on distinct places, and the set they leave is the set they fill.
  const froms = c.travels.map((t) => vecKey(t.from)).sort();
  const tos = c.travels.map((t) => vecKey(t.to)).sort();
  check(new Set(tos).size === tos.length, `${label} two pieces land in the same place`);
  check(froms.join('|') === tos.join('|'), `${label} the travelling pieces are not a permutation`);

  // --- the summary ---------------------------------------------------------
  const permuted = c.travels.filter((t) => t.permuted).length;
  const reoriented = c.travels.filter((t) => t.reoriented).length;
  check(
    c.summary.permuted === permuted && c.summary.reoriented === reoriented,
    `${label} summary permuted/reoriented counts`
  );
  const wantMode =
    permuted && reoriented ? 'both' : permuted ? 'permute' : reoriented ? 'orient' : 'identity';
  check(c.summary.mode === wantMode, `${label} mode is ${c.summary.mode}, want ${wantMode}`);
  check(c.summary.mode !== 'identity', `${label} does nothing at all`);

  const wantFaces = FACES.filter((f) =>
    c.travels.some((t) => [...t.fromSlots, ...t.toSlots].some((s) => SLOTS[s].face === f))
  );
  check(c.summary.faces.join('') === wantFaces.join(''), `${label} summary.faces`);
  check(
    c.summary.visibleFaces.every((f) => DEFAULT_VIEW_FACES.includes(f)) &&
      c.summary.hiddenFaces.every((f) => !DEFAULT_VIEW_FACES.includes(f)) &&
      c.summary.visibleFaces.length + c.summary.hiddenFaces.length === c.summary.faces.length,
    `${label} visible/hidden faces do not partition summary.faces`
  );
  check(
    c.summary.lastLayerOnly === c.travels.every((t) => t.from[1] === 1 && t.to[1] === 1),
    `${label} lastLayerOnly`
  );
  // Turned faces: read straight off the notation letters instead of MOVE_DEFS.
  const wide: Record<string, Face> = { Rw: 'R', Lw: 'L', Uw: 'U', Dw: 'D', Fw: 'F', Bw: 'B' };
  const wantTurned = FACES.filter((f) =>
    c.moves.some((m) => m.base === f || wide[m.base] === f)
  );
  check(c.summary.turnedFaces.join('') === wantTurned.join(''), `${label} turnedFaces`);
  check(
    c.summary.usesSlices === c.moves.some((m) => 'MES'.includes(m.base)),
    `${label} usesSlices`
  );
  check(
    c.summary.usesWideMoves === c.moves.some((m) => m.base.endsWith('w')),
    `${label} usesWideMoves`
  );
  check(
    c.summary.usesRotations === c.moves.some((m) => 'xyz'.includes(m.base)),
    `${label} usesRotations`
  );

  // --- what the category actually promises ---------------------------------
  const outsideTop = (st: CubeState) =>
    SLOTS.filter((s) => s.pos[1] !== 1 && st.colors[s.index] !== SOLVED.colors[s.index]);
  const topOriented = (st: CubeState) =>
    SLOTS.every((s) => s.face !== 'U' || st.colors[s.index] === DEFAULT_SCHEME.U);

  if (c.category === 'PLL') {
    check(outsideTop(c.caseState).length === 0, `${label} PLL case disturbs a piece below the top`);
    check(topOriented(c.caseState), `${label} PLL case has an unoriented top-layer piece`);
    check(c.summary.mode === 'permute', `${label} PLL case is not a pure permutation`);
    check(c.summary.lastLayerOnly, `${label} PLL case reaches outside the last layer`);
  } else if (c.category === 'OLL') {
    check(outsideTop(c.caseState).length === 0, `${label} OLL case disturbs a piece below the top`);
    // The promise: from this case the whole top face comes out one colour.
    check(topOriented(finish), `${label} OLL does not orient the top face`);
    check(!topOriented(c.caseState), `${label} OLL case is already oriented - nothing to teach`);
    check(c.summary.lastLayerOnly, `${label} OLL case reaches outside the last layer`);
  }

  // --- trigger decomposition ----------------------------------------------
  const joined = c.triggers.flatMap((t) => t.notation);
  check(
    joined.join(' ') === c.notation.join(' '),
    `${label} triggers concatenate to "${joined.join(' ')}", not "${c.notation.join(' ')}"`
  );
  let at = 0;
  for (const t of c.triggers) {
    check(t.start === at, `${label} trigger block starts at ${t.start}, expected ${at}`);
    check(t.notation.length > 0, `${label} empty trigger block`);
    check(t.repeat >= 1, `${label} trigger repeat ${t.repeat}`);
    check(
      t.period.length * t.repeat === t.notation.length,
      `${label} trigger period does not divide the block`
    );
    check(
      Array.from({ length: t.repeat }, () => t.period).flat().join(' ') === t.notation.join(' '),
      `${label} trigger block is not its period repeated`
    );
    check(
      t.label === (t.name ? `${t.name}${t.repeat > 1 ? ` ×${t.repeat}` : ''}` : null),
      `${label} trigger label`
    );
    check(
      t.name === null ? t.algorithmId === null : true,
      `${label} unnamed trigger block carries an algorithm id`
    );
    if (t.algorithmId !== null) {
      check(
        ALGORITHMS.some((a) => a.id === t.algorithmId),
        `${label} trigger names algorithm ${t.algorithmId}, which is not in the library`
      );
      // The named trigger's own moves, on whichever face this run uses, must be
      // exactly the period - the label has to be true of the moves under it.
      const trig = ALGORITHMS.find((a) => a.id === t.algorithmId)!;
      check(
        trig.moves.length === t.period.length,
        `${label} "${t.name}" covers ${t.period.length} moves but is ${trig.moves.length} long`
      );
    }
    check(t.name === null || t.repeat >= 1, `${label} named block repeat`);
    at += t.notation.length;
  }
  check(at === c.notation.length, `${label} trigger blocks cover ${at} of ${c.notation.length} moves`);
  check(
    c.hasTriggers === c.triggers.some((t) => t.name !== null),
    `${label} hasTriggers disagrees with the blocks`
  );
  // The strip the app renders and the data here must be the same decomposition.
  const blocks = notationBlocks(c.notation);
  check(
    JSON.stringify(blocks.map((b) => [b.start, b.name, b.label, b.repeat, b.period, b.all])) ===
      JSON.stringify(c.triggers.map((t) => [t.start, t.name, t.label, t.repeat, t.period, t.notation])),
    `${label} trigger blocks differ from src/ui/notation.ts`
  );

  if (bad === before) {
    const s = c.summary;
    console.log(
      `ok    ${label} ${s.mode.padEnd(7)} ${s.corners}c/${s.edges}e  ` +
        `${s.lastLayerOnly ? 'LL' : '  '}  ${c.triggers.map((t) => t.label ?? `${t.notation.length} moves`).join(' · ')}`
    );
  }
}

// ---------------------------------------------------------------------------
// A worked example, checked by hand
// ---------------------------------------------------------------------------
{
  // The T perm swaps UBR with URF and UL with UR, twisting nothing.
  const t = CASES.find((c) => c.id === 'pll-t')!;
  check(t.summary.mode === 'permute', 'T perm should be a pure permutation');
  check(t.summary.corners === 2 && t.summary.edges === 2, 'T perm should move two corners, two edges');
  check(t.travels.every((x) => x.twist === 0), 'T perm should twist nothing');
  // Running it twice is the identity, so its case position is what it produces.
  check(
    sameColors(applyAlg(SOLVED, [...t.moves, ...t.moves]), SOLVED),
    'T perm run twice should be the identity'
  );
  check(sameColors(t.caseState, applyAlg(SOLVED, t.moves)), 'T perm is its own inverse');

  // Sune orients three corners and is not a permutation-only case.
  const sune = CASES.find((c) => c.id === 'oll-sune')!;
  check(sune.summary.mode === 'both', 'Sune should both move and turn pieces');
  check(
    sune.travels.filter((x) => x.kind === 'corner' && x.twist !== 0).length === 3,
    'Sune should have three twisted corners in its case'
  );
  check(sune.setupAlg === "R U2 R' U' R U' R'", `Sune setup is "${sune.setupAlg}"`);

  // The sexy move reads as one trigger, and three of them read as one block.
  const sexy = CASES.find((c) => c.id === 'trig-sexy')!;
  check(
    sexy.triggers.length === 1 && sexy.triggers[0].label === 'Sexy move',
    'the sexy move should read as one named trigger'
  );
  const x3 = CASES.find((c) => c.id === 'trig-sune-trigger')!;
  check(
    x3.triggers.length === 1 && x3.triggers[0].label === 'Sexy move ×3' && x3.triggers[0].repeat === 3,
    `Sexy x3 should read as one block repeated three times, got "${x3.triggers[0]?.label}"`
  );

  // A cube built from IDENTITY and the setup alg is the case position too.
  for (const c of CASES) {
    if (c.summary.usesSlices || c.summary.usesWideMoves || c.summary.usesRotations) continue;
    let cube = IDENTITY;
    for (const mv of c.setup) cube = applyAlgCubie(cube, mv.notation);
    check(
      JSON.stringify(cube) === JSON.stringify(c.caseCubie),
      `${c.id}: the cubie engine and the facelet engine disagree about the case position`
    );
  }
  console.log('ok    worked examples');
}

console.log(
  bad === 0
    ? `\nPASS  ${CASES.length} algorithm cases`
    : `\nFAIL  ${bad} problem${bad === 1 ? '' : 's'} across ${CASES.length} algorithm cases`
);
process.exit(bad === 0 ? 0 : 1);
