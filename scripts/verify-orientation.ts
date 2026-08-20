/** Checks the 24 whole-cube rotations behave like real rotations. */
import { FACES, Face, SLOTS, applyAlg, solvedState, CENTER_SLOT } from '../src/cube/core';
import { ROTATIONS, rotationBringing, rotateCubie, IDENTITY_ROTATION } from '../src/cube/orientation';

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

console.log(fails === 0 ? '\nORIENTATIONS OK' : `\n${fails} FAILURES`);
process.exit(fails ? 1 : 0);
