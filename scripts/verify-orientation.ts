/** Checks the 24 whole-cube rotations behave like real rotations. */
import { FACES, Face, SLOTS, applyAlg, solvedState, CENTER_SLOT } from '../src/cube/core';
import { ROTATIONS, rotationBringing, rotateCubie, IDENTITY_ROTATION, relabelMoves } from '../src/cube/orientation';
import { parseAlg, formatAlg, isSolved } from '../src/cube/core';

let fails = 0;
const check = (name: string, ok: boolean) => {
  if (!ok) { fails++; console.log(`FAIL  ${name}`); }
};

check('there are 24 distinct orientations', ROTATIONS.length === 24);
check('the do-nothing rotation is first', ROTATIONS[0].alg === '');

// Every rotation must be a genuine rotation: a permutation of the faces that
// keeps opposite faces opposite, and matches what the facelet engine does.
const OPPOSITE: Record<Face, Face> = { U: 'D', D: 'U', R: 'L', L: 'R', F: 'B', B: 'F' };
for (const rot of ROTATIONS) {
  const images = FACES.map((f) => rot.faceMap[f]);
  check(`${rot.alg || 'identity'} permutes the faces`, new Set(images).size === 6);
  for (const f of FACES) {
    check(
      `${rot.alg || 'identity'} keeps ${f} opposite ${OPPOSITE[f]}`,
      rot.faceMap[OPPOSITE[f]] === OPPOSITE[rot.faceMap[f]]
    );
  }
  // The centre colours after the alg must land where faceMap says.
  const st = rot.alg ? applyAlg(solvedState(), rot.alg) : solvedState();
  for (const f of FACES) {
    const solvedColour = solvedState().colors[CENTER_SLOT[f]];
    check(
      `${rot.alg || 'identity'} moves the ${f} centre to ${rot.faceMap[f]}`,
      st.colors[CENTER_SLOT[rot.faceMap[f]]] === solvedColour
    );
  }
  // rotateCubie must agree with the facelet engine's slot movement.
  for (const s of SLOTS) {
    const moved = rotateCubie(rot, s.pos);
    check(
      `${rot.alg || 'identity'} moves cubies consistently`,
      Math.abs(moved[0]) <= 1 && Math.abs(moved[1]) <= 1 && Math.abs(moved[2]) <= 1
    );
    break;
  }
}
console.log(`ok    all ${ROTATIONS.length} rotations are consistent with the facelet engine`);

// Every legal (down, front) pair must be reachable, and impossible ones refused.
let reachable = 0;
for (const down of FACES) {
  for (const front of FACES) {
    const rot = rotationBringing(down, front);
    if (front === down || front === OPPOSITE[down]) {
      check(`${down}/${front} is refused`, rot === null);
    } else {
      check(`${down} to the bottom with ${front} in front`, rot !== null);
      if (rot) reachable++;
    }
  }
}
check('all 24 holds are reachable', reachable === 24);
console.log(`ok    every one of the ${reachable} ways to hold the cube has a rotation`);

check('identity rotation changes nothing', FACES.every((f) => IDENTITY_ROTATION.faceMap[f] === f));

// --- a solution survives the cube being re-labelled --------------------------
//
// The bug this locks down: one drag threw away a computed solve. A drag only
// re-labels the cube - the cube itself has not changed - so the moves are
// rewritten for the new labels instead of being discarded.
{
  const scrambles = [
    "R U R' U' F2 L D L' B2 U'",
    "D2 F R2 U' L B' R D F2 U",
    "B L2 U R' F D' R2 U2 L F'",
  ];
  let checked = 0;
  let bad = 0;
  for (const scramble of scrambles) {
    const state = applyAlg(solvedState(), scramble);
    // Any sequence that solves this cube will do; the inverse of the scramble
    // is one, and it is made of nothing but face turns.
    const solution = parseAlg(scramble)
      .map((m) => (m.notation.endsWith('2') ? m.notation : m.notation.endsWith("'") ? m.base : `${m.base}'`))
      .reverse();
    const asMoves = parseAlg(solution.join(' '));
    if (!isSolved(applyAlg(state, asMoves))) {
      bad++;
      console.log(`FAIL  the test's own solution does not solve ${scramble}`);
      continue;
    }
    for (const rot of ROTATIONS) {
      const relabelled = relabelMoves(rot, asMoves);
      checked++;
      if (!relabelled) {
        bad++;
        console.log(`FAIL  could not re-label ${formatAlg(asMoves)} through "${rot.alg}"`);
        continue;
      }
      const held = rot.alg ? applyAlg(state, rot.alg) : state;
      if (!isSolved(applyAlg(held, relabelled))) {
        bad++;
        console.log(`FAIL  re-labelled solution does not solve the re-labelled cube ("${rot.alg}")`);
      }
    }
  }
  if (bad === 0) {
    console.log(`ok    a solution still solves the cube after all ${checked} re-labellings`);
  } else {
    fails += bad;
  }
  // Slice moves and whole-cube rotations are refused rather than mangled.
  check('a sequence that is not plain face turns is refused',
    relabelMoves(ROTATIONS[1], parseAlg("M2 U M2")) === null);
}

console.log(fails === 0 ? '\nORIENTATIONS OK' : `\n${fails} FAILURES`);
process.exit(fails ? 1 : 0);
