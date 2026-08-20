/**
 * How the cube is held: turning it about the screen's own axes, and taking the
 * roll straight back out so it is always square to the viewer.
 *
 * This lives apart from `CubeScene` so the suite can test the maths that ships
 * rather than a copy of it. `scripts/verify-view.ts` used to re-implement all of
 * it, which meant the test and the renderer were free to drift.
 *
 * three is a maths dependency here, as everywhere: no renderer, no GL.
 */
import { Quaternion, Vector3 } from 'three';

/** The cube's six face directions, used to work out which way is up to it. */
export const FACE_AXES: Vector3[] = [
  new Vector3(1, 0, 0),
  new Vector3(-1, 0, 0),
  new Vector3(0, 1, 0),
  new Vector3(0, -1, 0),
  new Vector3(0, 0, 1),
  new Vector3(0, 0, -1),
];

/**
 * The cube turns about the screen's own axes: drag sideways and it turns about
 * the vertical, drag up or down and it tips about the horizontal. After every
 * turn any roll is taken straight back out, measured against whichever of the
 * cube's six faces is nearest to pointing up. That is what keeps it upright and
 * stops it ever balancing on a corner, and because the reference face changes
 * as the cube is tipped, there is no angle at which the controls seize up.
 *
 * Tipping far enough to put a different face on top is how the cube is
 * reoriented. That is biased against rather than blocked: tilt is slower than
 * spin, and there is a slight catch at the point where the top face changes
 * over, so a deliberate pull gets you there and a casual one does not.
 */
export const YAW_PER_PIXEL = 0.008;
export const PITCH_PER_PIXEL = 0.0058;
/** How near the changeover (radians) the catch is felt, and how strong it is. */
export const DETENT_ZONE = 0.22;
export const DETENT_DRAG = 0.55;
/** Share of the last drag that carries on as glide, and its ceiling per frame. */
export const GLIDE_SHARE = 0.4;
export const GLIDE_MAX = 0.05;
/** Where the face nearest to up sits when the top face is about to change. */
export const CHANGEOVER = Math.PI / 4;

const scratch = new Vector3();
const spinQuat = new Quaternion();
const rollQuat = new Quaternion();
const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);
const Z = new Vector3(0, 0, 1);

/**
 * How far the cube is rolled: the smallest turn about the view axis that would
 * bring one of its face axes exactly upright on screen.
 *
 * Faces pointing nearly straight at the viewer are skipped - they barely show
 * on screen, so squaring them up would mean nothing. At least two of the three
 * axes always show well, so there is always a sensible one to measure from.
 */
export function rollAngle(quat: Quaternion): number {
  let best = 0;
  let found = false;
  for (const a of FACE_AXES) {
    const v = scratch.copy(a).applyQuaternion(quat);
    if (Math.hypot(v.x, v.y) < 0.5) continue;
    const roll = Math.atan2(v.x, v.y);
    if (!found || Math.abs(roll) < Math.abs(best)) {
      best = roll;
      found = true;
    }
  }
  return best;
}

/**
 * Take the roll straight back out, so the cube is always square to the screen.
 * Turning by the smallest correction leaves the same face upright as before, so
 * this settles in one step and never spins the cube on its own.
 */
export function levelRoll(quat: Quaternion): Quaternion {
  const roll = rollAngle(quat);
  if (Math.abs(roll) < 1e-9) return quat;
  return quat.premultiply(rollQuat.setFromAxisAngle(Z, roll));
}

/** Whichever of the cube's faces currently points nearest to straight up. */
export function nearestUpAxis(quat: Quaternion, out: Vector3): Vector3 {
  let bestDot = -Infinity;
  for (const a of FACE_AXES) {
    const v = scratch.copy(a).applyQuaternion(quat);
    if (v.y > bestDot) {
      bestDot = v.y;
      out.copy(v);
    }
  }
  return out;
}

/** A slight catch just where the face on top is about to change over. */
export function tiltEase(quat: Quaternion): number {
  const up = nearestUpAxis(quat, new Vector3());
  const tilt = Math.acos(Math.max(-1, Math.min(1, up.y)));
  const near = Math.max(0, 1 - Math.abs(CHANGEOVER - tilt) / DETENT_ZONE);
  return 1 - DETENT_DRAG * near * near;
}

/** Turn about the screen's axes, then square the cube back up. */
export function applySpin(quat: Quaternion, pitchDelta: number, yawDelta: number): Quaternion {
  spinQuat
    .setFromAxisAngle(X, pitchDelta)
    .multiply(rollQuat.setFromAxisAngle(Y, yawDelta));
  quat.premultiply(spinQuat);
  return levelRoll(quat);
}

/** The orientation the cube starts and returns to. */
export function restingOrientation(out: Quaternion): Quaternion {
  const yaw = new Quaternion().setFromAxisAngle(Y, -0.62);
  const pitch = new Quaternion().setFromAxisAngle(X, 0.42);
  out.copy(pitch).multiply(yaw);
  return levelRoll(out);
}

/** How much of a drag carries on as glide, capped so a coarse event cannot fling. */
export const glide = (delta: number) =>
  Math.max(-GLIDE_MAX, Math.min(GLIDE_MAX, delta * GLIDE_SHARE));
