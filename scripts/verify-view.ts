/**
 * Checks the view model: turning about the screen's axes with roll levelled out
 * must keep the cube square at every angle, must never seize up, and
 * re-anchoring must leave the picture exactly where it was.
 *
 * This drives `src/render/view.ts` - the maths the renderer actually runs. It
 * used to re-implement all of it, so the test and the shipping code were free
 * to drift; that was the last mirror test in the suite.
 */
import { Quaternion, Vector3, Matrix4 } from 'three';
import { FACES, FACE_NORMAL, Face } from '../src/cube/core';
import { rotationBringing, CubeRotation } from '../src/cube/orientation';
import {
  CHANGEOVER,
  GLIDE_MAX,
  applySpin,
  glide,
  levelRoll,
  nearestUpAxis,
  restingOrientation,
  rollAngle,
  tiltEase,
} from '../src/render/view';

let fails = 0;
const check = (name: string, ok: boolean, extra = '') => {
  if (!ok) { fails++; console.log(`FAIL  ${name} ${extra}`); }
};

const nearestUp = (q: Quaternion) => nearestUpAxis(q, new Vector3());
const rollOf = (q: Quaternion) => Math.abs(rollAngle(q));
const turn = (q: Quaternion, pitch: number, yaw: number) => applySpin(q, pitch, yaw);

// A long, messy sequence of drags must never leave the cube rolled.
{
  let q = restingOrientation(new Quaternion());
  let worst = 0;
  let seed = 99;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5);
  for (let i = 0; i < 4000; i++) {
    q = turn(q, rnd() * 0.6, rnd() * 0.6);
    worst = Math.max(worst, rollOf(q));
  }
  check('the cube never ends up rolled', worst < 1e-6, `worst ${(worst * 180 / Math.PI).toFixed(6)} deg`);
  console.log(`ok    4000 random drags left the cube square (worst roll ${(worst * 180 / Math.PI).toExponential(1)} deg)`);
}

// Facing a face head-on, a sideways drag must turn the cube about the vertical,
// bringing a side face towards the viewer - not spin it on the spot.
for (const [name, setup] of [
  ['head-on', new Quaternion()],
  ['looking at the top', new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2)],
  ['looking at the bottom', new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2)],
  ['from behind', new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI)],
] as [string, Quaternion][]) {
  const before = levelRoll(setup.clone());
  const facingBefore = new Vector3(0, 0, 1).applyQuaternion(before.clone().invert());
  const after = turn(before.clone(), 0, 0.5);
  const facingAfter = new Vector3(0, 0, 1).applyQuaternion(after.clone().invert());
  // The cube-local direction pointing at the viewer must have changed, and it
  // must have swung sideways (about the vertical), not tumbled.
  const moved = facingBefore.distanceTo(facingAfter);
  check(`${name}: a sideways drag turns the cube`, moved > 0.3, `moved ${moved.toFixed(3)}`);
  check(`${name}: it stays square`, rollOf(after) < 1e-6);
  // Turning about the vertical cannot change how high the up-face sits.
  check(
    `${name}: a sideways drag does not tip the cube`,
    Math.abs(nearestUp(after).y - nearestUp(before).y) < 1e-6
  );
}
console.log('ok    a sideways drag turns about the vertical from every angle');

// Re-anchoring must not move the picture.
{
  const quatOf = (rot: CubeRotation) => {
    const m = new Matrix4().set(
      rot.basis[0][0], rot.basis[1][0], rot.basis[2][0], 0,
      rot.basis[0][1], rot.basis[1][1], rot.basis[2][1], 0,
      rot.basis[0][2], rot.basis[1][2], rot.basis[2][2], 0,
      0, 0, 0, 1
    );
    return new Quaternion().setFromRotationMatrix(m);
  };
  const facing = (q: Quaternion) => {
    let down: Face = 'D';
    let lowest = Infinity;
    for (const f of FACES) {
      const v = new Vector3(...FACE_NORMAL[f]).applyQuaternion(q);
      if (v.y < lowest) { lowest = v.y; down = f; }
    }
    const dn = new Vector3(...FACE_NORMAL[down]);
    let front: Face = 'F';
    let nearest = -Infinity;
    for (const f of FACES) {
      const n = new Vector3(...FACE_NORMAL[f]);
      if (Math.abs(n.dot(dn)) > 0.5) continue;
      const v = n.clone().applyQuaternion(q);
      if (v.z > nearest) { nearest = v.z; front = f; }
    }
    return { down, front };
  };

  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5);
  let q = levelRoll(new Quaternion());
  let checked = 0;
  for (let i = 0; i < 2000; i++) {
    q = turn(q, rnd() * 0.8, rnd() * 0.8);
    const { down, front } = facing(q);
    const rot = rotationBringing(down, front);
    check('every hold has a rotation', rot !== null, `${down}/${front}`);
    if (!rot || rot.alg === '') continue;
    checked++;
    // Where a cubie renders must be unchanged: state moves by R, view by R inverse.
    const after = q.clone().multiply(quatOf(rot).invert());
    const p = new Vector3(1, -1, 1);
    const rendersBefore = p.clone().applyQuaternion(q);
    const rendersAfter = p.clone().applyMatrix4(new Matrix4().set(
      rot.basis[0][0], rot.basis[1][0], rot.basis[2][0], 0,
      rot.basis[0][1], rot.basis[1][1], rot.basis[2][1], 0,
      rot.basis[0][2], rot.basis[1][2], rot.basis[2][2], 0,
      0, 0, 0, 1
    )).applyQuaternion(after);
    check('re-anchoring does not move the picture', rendersBefore.distanceTo(rendersAfter) < 1e-6);
    check('re-anchoring leaves the cube square', rollOf(after.clone()) < 1e-6, `roll ${(rollOf(after.clone()) * 180 / Math.PI).toFixed(4)} deg, before ${(rollOf(q.clone()) * 180 / Math.PI).toFixed(4)} deg`);
  }
  console.log(`ok    ${checked} re-anchors left the picture untouched`);
}

// --- the parts of the view model no assertion reached before ----------------
{
  // The resting orientation is square, and shows three faces rather than one.
  const rest = restingOrientation(new Quaternion());
  check('the cube rests square to the screen', rollOf(rest) < 1e-6);
  const seen = FACES.filter(
    (f) => new Vector3(...FACE_NORMAL[f]).applyQuaternion(rest).z > 0.15
  );
  check('and rests showing three faces', seen.length === 3, seen.join(''));

  // The catch at the changeover: tilting is eased just where the top face is
  // about to swap, and nowhere else. That is what stops a casual drag from
  // re-orienting the cube by accident.
  const atTilt = (tilt: number) =>
    tiltEase(levelRoll(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), tilt)));
  const flat = atTilt(0);
  const changeover = atTilt(CHANGEOVER);
  check('there is no drag when a face is squarely on top', Math.abs(flat - 1) < 1e-9, `${flat}`);
  check('and a real one at the changeover', changeover < flat * 0.7, `${changeover.toFixed(3)}`);
  let worstEase = 1;
  for (let t = 0; t <= Math.PI / 2; t += 0.01) worstEase = Math.min(worstEase, atTilt(t));
  check('but the controls never seize up', worstEase > 0.2, `worst ease ${worstEase.toFixed(3)}`);

  // Glide carries the last of a drag on, and can never fling.
  check('glide follows the drag', glide(0.02) > 0 && glide(-0.02) < 0);
  check('glide is capped in both directions',
    glide(99) === GLIDE_MAX && glide(-99) === -GLIDE_MAX);
  check('glide is a share, not the whole drag', Math.abs(glide(0.02)) < 0.02);
}

console.log(fails === 0 ? '\nVIEW MODEL OK' : `\n${fails} FAILURES`);
process.exit(fails ? 1 : 0);
