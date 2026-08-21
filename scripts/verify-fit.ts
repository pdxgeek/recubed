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
  screenPoint,
  viewportFor,
} from '../src/render/fit';
import { panelBudget, runPanelHeight } from '../src/ui/layout';
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

// --- 4. THE CUBE IS INSIDE THE RECTANGLE THE USER IS LOOKING AT ------------
//
// The property this file existed for, restated in the units that matter. Round
// 5 asserted "every vertex is inside the frustum", which is true of a cube
// drawn into the wrong quarter of the drawing buffer, and the cube was still
// cut off on the phone afterwards. `screenPoint` follows the whole chain -
// projection, GL viewport inside the buffer, buffer stretched into the view -
// and lands in LAYOUT POINTS. A vertex inside 0..width by 0..height is a
// vertex the user can see.
//
// Driven with the shapes the app really gives the GL view on the user's phone:
// 393 points wide, and a height that is what is left of 852 after the safe
// area, the top bar, the transport bar, the panel's share and the move strip.
{
  /** What the shell hands the GL view on a 393x852 phone, at the panel shares. */
  const CANVASES: { name: string; w: number; h: number; dpr: number }[] = [];
  for (const [name, body] of [
    ['iPhone 15, iOS safe area, running', 631],
    ['iPhone 15, no safe area, running', 724],
    ['iPhone 15, at rest', 692],
    ['iPhone SE, running', 480],
    ['a very short landscape window', 300],
  ] as [string, number][]) {
    const wanted = runPanelHeight(body, 200);
    const strip = name.includes('rest') ? 0 : 120;
    const b = panelBudget(body, wanted, strip);
    CANVASES.push({ name, w: 393, h: b.cube || b.canvas, dpr: 3 });
  }

  const worstFor = (
    buffer: { width: number; height: number },
    layout: { width: number; height: number },
    viewport: { width: number; height: number }
  ) => {
    const fit = fitFor(buffer, layout);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const q of ORIENTATIONS) {
      for (const v of VERTS) {
        const p = v.clone().applyQuaternion(q);
        const s = screenPoint(fit, buffer, layout, viewport, p.x, p.y, p.z);
        minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
        minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y);
      }
    }
    return { minX, maxX, minY, maxY };
  };

  let bad = 0;
  let tightest = 1;
  for (const c of CANVASES) {
    const layout = { width: c.w, height: c.h };
    const buffer = { width: c.w * c.dpr, height: c.h * c.dpr };
    const box = worstFor(buffer, layout, viewportFor(buffer));
    const inside =
      box.minX >= 0 && box.maxX <= c.w && box.minY >= 0 && box.maxY <= c.h;
    if (!inside) {
      bad++;
      console.log(`      ${c.name} (${c.w}x${c.h}): cube box ${JSON.stringify(box)}`);
    }
    // How much of the axis the fit is CONSTRAINED by the cube uses. A cube that
    // clears the frame by miles on both axes passes "inside" and teaches
    // nobody anything; a wide canvas legitimately leaves air at the sides.
    tightest = Math.min(
      tightest,
      Math.max((box.maxY - box.minY) / c.h, (box.maxX - box.minX) / c.w)
    );
  }
  if (bad) fail(`${bad} of ${CANVASES.length} real canvases cut the cube off`);
  else console.log(`ok    all ${CANVASES.length} canvases the shell can hand the GL view show the whole cube`);
  if (tightest < 0.7) fail(`the cube uses only ${(tightest * 100).toFixed(0)}% of the axis it is fitted to`);
  else console.log(`ok    and it fills at least ${(tightest * 100).toFixed(0)}% of the axis it is fitted to`);

  // A DRAWING BUFFER THAT HAS NOT CAUGHT UP.
  //
  // The canvas just lost 120pt to the move strip; expo-gl has not resized yet,
  // so it still reports the taller buffer. With the whole buffer as the
  // viewport this is invisible on screen: the stretch that presents the buffer
  // into the view undoes exactly the aspect difference the projection was built
  // with. This is the case round 5's clamped viewport got wrong.
  {
    const layout = { width: 393, height: 274 };
    const stale = { width: 393 * 3, height: 430 * 3 };
    const box = worstFor(stale, layout, viewportFor(stale));
    const centreY = (box.minY + box.maxY) / 2;
    const inside = box.minY >= 0 && box.maxY <= layout.height;
    const centred = Math.abs(centreY - layout.height / 2) < 1;
    if (!inside || !centred) {
      fail(
        `a stale buffer moved the cube: box ${JSON.stringify(box)} in a ${layout.height}pt view`
      );
    } else {
      console.log('ok    a drawing buffer that has not caught up leaves the cube centred and whole');
    }

    // The same case through round 5's clamped viewport, to show what it cost.
    const clamped = {
      width: stale.width,
      height: Math.min(stale.height, Math.round(layout.height * (stale.width / layout.width))),
    };
    const was = worstFor(stale, layout, clamped);
    const wasCentre = (was.minY + was.maxY) / 2;
    if (Math.abs(wasCentre - layout.height / 2) < 1) {
      fail('the clamped viewport was harmless after all - this check no longer proves anything');
    } else {
      console.log(
        `ok    and the clamped viewport it replaces put the centre at ${wasCentre.toFixed(0)}pt ` +
        `of a ${layout.height}pt view`
      );
    }
  }

  // The viewport is the buffer, rounded, and nothing else.
  {
    let odd = 0;
    for (const s of SURFACES) {
      for (const dpr of [1, 2, 3]) {
        const buffer = { width: s.w * dpr, height: s.h * dpr };
        const v = viewportFor(buffer);
        if (v.width !== buffer.width || v.height !== buffer.height) odd++;
      }
    }
    if (odd) fail(`${odd} surfaces had their viewport altered`);
    else console.log('ok    the viewport is the whole drawing buffer at every surface and ratio');
    const v = viewportFor({ width: 0.4, height: -3 });
    if (v.width < 1 || v.height < 1) fail(`a degenerate buffer gave viewport ${JSON.stringify(v)}`);
    else console.log('ok    a degenerate buffer still yields a drawable viewport');
  }
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
