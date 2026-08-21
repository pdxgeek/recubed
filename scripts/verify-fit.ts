/**
 * Is the whole cube inside the frame, at every shape a phone can hand us?
 *
 * Round 5's first screenshot from a real device showed the cube cut off by the
 * top of its own canvas in Expo Go, on code that frames it correctly in
 * Chromium. Nothing in the suite could have caught that: the fit lived inside
 * `CubeScene`, behind a GL context, and every measurement this project has ever
 * taken came from the browser. `src/render/fit.ts` is the maths on its own, and
 * this drives it with device-shaped numbers.
 *
 * Three properties, in the order they matter:
 *
 *   1. Every vertex the renderer draws is inside the frustum, at every aspect
 *      and every orientation the cube can be turned to.
 *   2. The fit is scale-invariant: points and pixels give the same camera, so
 *      it cannot matter which of the two a platform reports.
 *   3. When the layout and the drawing buffer disagree about the shape, the
 *      layout wins - that is the rectangle the person is looking at.
 */
import { Quaternion, Vector3 } from 'three';
import {
  BODY,
  CUBE_RADIUS,
  FIT_MARGIN,
  SPACING,
  STICKER_LIFT,
  fitCamera,
  fitFor,
  projectToNdc,
  viewportFor,
} from '../src/render/fit';
import { applySpin, restingOrientation } from '../src/render/view';
import { CUBIES } from '../src/cube/core';

let fails = 0;
const fail = (msg: string) => {
  fails++;
  console.log(`FAIL  ${msg}`);
};

/** Every corner of every cubie body, plus the outermost point of every sticker. */
function vertices(): Vector3[] {
  const out: Vector3[] = [];
  const h = BODY / 2;
  for (const p of CUBIES) {
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          out.push(
            new Vector3(p[0] * SPACING + sx * h, p[1] * SPACING + sy * h, p[2] * SPACING + sz * h)
          );
        }
      }
    }
    // A sticker sits proud of the body along its face normal.
    for (let axis = 0; axis < 3; axis++) {
      if (p[axis] === 0) continue;
      const v = new Vector3(p[0] * SPACING, p[1] * SPACING, p[2] * SPACING);
      v.setComponent(axis, p[axis] * (SPACING + STICKER_LIFT));
      out.push(v);
    }
  }
  return out;
}

const VERTS = vertices();

/**
 * Surfaces to try. Both real devices and the shapes the canvas takes inside the
 * app - it is a slice of the window, not the window, and during playback it
 * loses another 108pt to the move strip.
 */
const SURFACES: { name: string; w: number; h: number }[] = [
  { name: 'iPhone SE canvas, points', w: 375, h: 280 },
  { name: 'iPhone SE canvas, pixels @2', w: 750, h: 560 },
  { name: 'iPhone 15 canvas, points', w: 393, h: 430 },
  { name: 'iPhone 15 canvas, pixels @3', w: 1179, h: 1290 },
  { name: 'iPhone 15 full window, pixels @3', w: 1179, h: 2556 },
  { name: 'iPhone 15 canvas during playback', w: 393, h: 322 },
  { name: 'iPad portrait column', w: 624, h: 1300 },
  { name: 'iPad landscape column', w: 966, h: 700 },
  { name: 'square', w: 500, h: 500 },
  { name: 'very wide', w: 1600, h: 400 },
  { name: 'very tall', w: 320, h: 1200 },
];

/** Orientations: the resting one, plus a sweep of drags away from it. */
function orientations(): Quaternion[] {
  const out: Quaternion[] = [restingOrientation(new Quaternion())];
  for (let yaw = -600; yaw <= 600; yaw += 75) {
    for (let pitch = -400; pitch <= 400; pitch += 100) {
      const q = restingOrientation(new Quaternion());
      applySpin(q, pitch * 0.0058, yaw * 0.008);
      out.push(q.clone());
    }
  }
  return out;
}

const ORIENTATIONS = orientations();

// --- 1. nothing is ever outside the frame ----------------------------------
{
  let checked = 0;
  let worst = 0;
  let worstAt = '';
  for (const s of SURFACES) {
    const fit = fitCamera(s.w, s.h);
    for (const q of ORIENTATIONS) {
      for (const base of VERTS) {
        const v = base.clone().applyQuaternion(q);
        const ndc = projectToNdc(fit, v.x, v.y, v.z);
        checked++;
        if (ndc.depth <= fit.near) {
          fail(`${s.name}: a vertex is behind the near plane (depth ${ndc.depth.toFixed(2)})`);
          break;
        }
        const off = Math.max(Math.abs(ndc.x), Math.abs(ndc.y));
        if (off > worst) {
          worst = off;
          worstAt = s.name;
        }
      }
    }
  }
  if (worst > 1) {
    fail(`the cube leaves the frame: worst vertex at ${(worst * 100).toFixed(1)}% of half-frame on ${worstAt}`);
  } else {
    console.log(
      `ok    all ${checked} vertex projections are inside the frame ` +
      `(${SURFACES.length} surfaces x ${ORIENTATIONS.length} orientations); ` +
      `the tightest is ${(worst * 100).toFixed(1)}% of the half-frame, on ${worstAt}`
    );
  }
  // The margin is meant to be a margin, not a rounding error.
  if (worst > 1 - FIT_MARGIN / 2) {
    fail(`the declared FIT_MARGIN of ${FIT_MARGIN} is not actually free: worst vertex ${worst.toFixed(3)}`);
  } else {
    console.log(`ok    at least ${((1 - worst) * 100).toFixed(1)}% of the half-frame is left clear at the tightest fit`);
  }
}

// --- 2. the fit cannot depend on which unit a platform reports --------------
{
  let bad = 0;
  for (const s of SURFACES) {
    const base = fitCamera(s.w, s.h);
    for (const dpr of [1, 1.5, 2, 3, 3.5]) {
      const scaled = fitCamera(s.w * dpr, s.h * dpr);
      if (
        Math.abs(scaled.distance - base.distance) > 1e-9 ||
        Math.abs(scaled.aspect - base.aspect) > 1e-9 ||
        Math.abs(scaled.top - base.top) > 1e-9 ||
        Math.abs(scaled.right - base.right) > 1e-9
      ) {
        bad++;
        console.log(`      ${s.name} at dpr ${dpr}: distance ${scaled.distance} vs ${base.distance}`);
      }
    }
  }
  if (bad) fail(`${bad} surfaces fit differently once a device pixel ratio is applied`);
  else console.log(`ok    the fit is identical at every device pixel ratio (${SURFACES.length} surfaces x 5)`);
}

// --- 3. layout beats buffer, and a missing layout is survivable -------------
{
  const buffer = { width: 1179, height: 1290 };
  const layout = { width: 393, height: 430 };
  const same = fitFor(buffer, layout);
  if (Math.abs(same.distance - fitCamera(393, 430).distance) > 1e-9) {
    fail('a layout that agrees with the buffer changed the fit');
  } else {
    console.log('ok    a layout that agrees with the buffer leaves the fit alone');
  }

  // A buffer that has not caught up with a rotation is the case that clips.
  const stale = fitFor({ width: 1290, height: 1179 }, layout);
  if (Math.abs(stale.aspect - 393 / 430) > 1e-9) {
    fail(`a stale buffer overrode the layout: aspect ${stale.aspect}`);
  } else {
    console.log('ok    a drawing buffer that disagrees with the layout does not decide the shape');
  }

  const none = fitFor(buffer, null);
  if (Math.abs(none.aspect - 1179 / 1290) > 1e-9) fail('without a layout the buffer is not used');
  else console.log('ok    with no layout yet, the buffer decides the shape');

  for (const bad of [
    { width: 0, height: 0 },
    { width: Number.NaN, height: 100 },
    { width: -5, height: 10 },
  ]) {
    const f = fitFor(bad, null);
    if (!Number.isFinite(f.distance) || f.distance <= 0) {
      fail(`a degenerate surface ${JSON.stringify(bad)} produced distance ${f.distance}`);
    }
  }
  console.log('ok    a degenerate or unmeasured surface still produces a usable camera');
}

// --- 4. the viewport never overruns the drawing buffer ---------------------
//
// The suspected cause of the device screenshot: `expo-gl` resizes its drawing
// buffer in its own time, so for a frame or two after the canvas changes shape
// the reported height is the old, taller one. A GL viewport taller than the
// framebuffer does not scale the image down - it pushes the top of it off the
// surface. Nothing here can prove that is what happened on the phone, but this
// asserts the two properties the fix needs: it is a no-op when the two
// measurements agree, and it never asks for more than the buffer has.
{
  let bad = 0;
  for (const s of SURFACES) {
    for (const dpr of [1, 2, 3]) {
      const buffer = { width: s.w * dpr, height: s.h * dpr };
      const v = viewportFor(buffer, { width: s.w, height: s.h });
      if (v.width !== buffer.width || v.height !== buffer.height) {
        bad++;
        console.log(`      ${s.name} @${dpr}: agreeing measurements changed the viewport`);
      }
    }
  }
  if (bad) fail(`${bad} agreeing surfaces had their viewport altered`);
  else console.log(`ok    when the buffer and the layout agree the whole buffer is used`);

  // A buffer that has not shrunk yet: the canvas lost 108pt to the move strip.
  {
    const layout = { width: 393, height: 322 };
    const stale = { width: 393 * 3, height: 430 * 3 };
    const v = viewportFor(stale, layout);
    if (v.height !== 322 * 3) fail(`a stale-tall buffer gave viewport height ${v.height}, wanted ${322 * 3}`);
    else console.log('ok    a drawing buffer that has not caught up does not stretch the viewport past the surface');
  }

  // And it can never ask for more than the buffer really has.
  {
    const v = viewportFor({ width: 200, height: 100 }, { width: 393, height: 2000 });
    if (v.height > 100) fail(`the viewport asked for ${v.height} rows of a 100-row buffer`);
    else console.log('ok    the viewport is never taller than the buffer says it is');
  }

  // No layout, or a nonsense one, still yields the buffer untouched.
  for (const l of [null, { width: 0, height: 0 }, { width: Number.NaN, height: 10 }]) {
    const v = viewportFor({ width: 640, height: 480 }, l as never);
    if (v.width !== 640 || v.height !== 480) fail(`a missing layout changed the viewport: ${JSON.stringify(v)}`);
  }
  console.log('ok    a missing or nonsense layout leaves the buffer alone');
}

// --- the radius really does contain the cube -------------------------------
{
  let worst = 0;
  for (const v of VERTS) worst = Math.max(worst, v.length());
  if (worst > CUBE_RADIUS + 1e-9) {
    fail(`CUBE_RADIUS is ${CUBE_RADIUS.toFixed(4)} but a vertex is ${worst.toFixed(4)} from the centre`);
  } else {
    console.log(
      `ok    CUBE_RADIUS ${CUBE_RADIUS.toFixed(4)} contains all ${VERTS.length} vertices ` +
      `(furthest ${worst.toFixed(4)})`
    );
  }
}

console.log(`\n${fails ? `${fails} fit check(s) failed` : 'all fit checks passed'}`);
process.exit(fails ? 1 : 0);
