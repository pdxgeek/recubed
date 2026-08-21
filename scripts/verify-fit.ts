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
import {
  INSETS,
  STRIP_H_FALLBACK,
  canvasHeight,
  panelBudget,
  runPanelHeight,
} from '../src/ui/layout';
import { TOP_BAR_H } from '../src/ui/net';

/** The transport bar's height, measured off the running app in a browser. */
const TRANSPORT_H = 61;
import { applySpin, restingOrientation } from '../src/render/view';
import { CUBIES } from '../src/cube/core';

let fails = 0;
const fail = (msg: string) => {
  fails++;
  console.log(`FAIL  ${msg}`);
};
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) console.log(`ok    ${name}`);
  else fail(`${name}${detail ? ` - ${detail}` : ''}`);
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

// --- 4. THE DRAWING BUFFER IS A LIE ON NATIVE ------------------------------
//
// The input nothing in this project had modelled: THREE heights at once.
//
//   firstLayout  the canvas height when the GL context was created
//   settled      the canvas height now
//   frozen       what `gl.drawingBufferWidth/Height` report - FOREVER the first
//                one, because expo-gl writes them as plain JS properties in
//                `EXWebGLRenderer.cpp:57-58` from a single `glGetIntegerv` and
//                never updates them
//   framebuffer  what `GLView.swift`'s `resizeViewBuffersToWidth` has really
//                allocated, which is the layer's drawable: settled x dpr
//
// A viewport taller than the framebuffer pushes the image off the TOP, because
// GL's origin is bottom left. That is the only mechanism in the whole pipeline
// with a top-specific signature, and it is the screenshot this project has been
// sent twice.
//
// Note what this section does NOT do: it does not ask whether the NDC is inside
// the unit box. Section 1 above asks that, and it is a restatement of
// `fitCamera`'s own formula - it would print `ok` with the viewport set to
// twice the framebuffer, which is the live bug. Everything here is in the
// framebuffer's pixels and the layout's points.
{
  const HEIGHTS = [427, 334, 272, 240, 180];
  const cases: { first: number; settled: number; dpr: number }[] = [];
  for (const first of HEIGHTS) {
    for (const settled of HEIGHTS) {
      for (const dpr of [1, 2, 3]) cases.push({ first, settled, dpr });
    }
  }

  let overrun = 0;
  let underrun = 0;
  let worstOverrun = '';
  for (const c of cases) {
    const layout = { width: 393, height: c.settled };
    const framebuffer = { width: 393 * c.dpr, height: c.settled * c.dpr };
    const viewport = viewportFor(layout, c.dpr);
    if (viewport.height > framebuffer.height + 1 || viewport.width > framebuffer.width + 1) {
      overrun++;
      if (!worstOverrun) {
        worstOverrun =
          `first ${c.first}pt, settled ${c.settled}pt @${c.dpr}: viewport ${viewport.height} ` +
          `rows into a ${framebuffer.height}-row framebuffer, ` +
          `${((viewport.height - framebuffer.height) / c.dpr).toFixed(0)}pt off the top`;
      }
    }
    if (Math.abs(viewport.height - framebuffer.height) > 1 || Math.abs(viewport.width - framebuffer.width) > 1) {
      underrun++;
    }
  }
  check(`the viewport never overruns the framebuffer (${cases.length} first/settled/dpr combinations)`,
    overrun === 0, worstOverrun);
  check('and never underruns it either: the viewport IS the framebuffer', underrun === 0);

  // The bug itself, as an adversarial input: the viewport computed the way the
  // pre-round-5 code computed it, from the frozen buffer.
  {
    const first = 427;
    const settled = 334;
    const dpr = 3;
    const frozen = { width: 393 * dpr, height: first * dpr };
    const framebuffer = { width: 393 * dpr, height: settled * dpr };
    const lost = (frozen.height - framebuffer.height) / dpr;
    check(
      `the frozen buffer would have cut ${lost.toFixed(0)}pt off the top, which is why it is never read`,
      frozen.height > framebuffer.height && lost > 50,
      `${frozen.height} vs ${framebuffer.height}`
    );
  }

  // A canvas that has not been measured yet: the fallback must still be usable.
  {
    const v = viewportFor({ width: 1, height: 1 }, 3);
    check('an unmeasured canvas still yields a drawable viewport', v.width >= 1 && v.height >= 1);
    const bad = viewportFor({ width: 393, height: 334 }, Number.NaN);
    check('a nonsense pixel ratio falls back to 1 rather than to NaN',
      bad.width === 393 && bad.height === 334, JSON.stringify(bad));
  }
}

// --- 5. EVERY VERTEX IS INSIDE THE RECTANGLE ON SCREEN, IN POINTS ----------
//
// The property "the cube is not cut off" actually means, asserted in the units
// the user is looking at, over canvases built from the shell's own arithmetic
// rather than from literals. The failing edge is reported BY NAME, because
// "12pt off the top" is the sentence that would have ended this in round 5.
{
  const SHAPES: { name: string; w: number; h: number; dpr: number }[] = [];
  for (const [label, insets, dpr] of [
    ['iPhone 15', INSETS.iphone, 3],
    ['iPhone SE', INSETS.iphoneSE, 2],
    ['Chromium through react-native-web', INSETS.browser, 1],
  ] as [string, { top: number; bottom: number }, number][]) {
    const windowH = label === 'iPhone SE' ? 667 : 852;
    for (const running of [false, true]) {
      const body = canvasHeight(windowH, insets, TOP_BAR_H, 0, running ? TRANSPORT_H : 0);
      const wanted = running ? runPanelHeight(body, 200) : Math.min(360, Math.round(windowH * 0.42));
      const b = panelBudget(body, wanted, running ? STRIP_H_FALLBACK : 0);
      SHAPES.push({
        name: `${label}, ${running ? 'running' : 'at rest'}`,
        w: 393,
        h: running ? b.cube : b.canvas,
        dpr,
      });
    }
  }

  const EDGES = ['left', 'right', 'top', 'bottom'] as const;
  let cut = 0;
  let offCentre = 0;
  let shrunk = 0;
  let anamorphic = 0;
  let worst = '';
  let tightest = Infinity;
  for (const shape of SHAPES) {
    const layout = { width: shape.w, height: shape.h };
    const framebuffer = { width: shape.w * shape.dpr, height: shape.h * shape.dpr };
    const viewport = viewportFor(layout, shape.dpr);
    const fit = fitFor(framebuffer, layout);
    const clear = { left: Infinity, right: Infinity, top: Infinity, bottom: Infinity };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const q of ORIENTATIONS) {
      for (const v of VERTS) {
        const p = v.clone().applyQuaternion(q);
        const s = screenPoint(fit, framebuffer, layout, viewport, p.x, p.y, p.z);
        clear.left = Math.min(clear.left, s.x);
        clear.right = Math.min(clear.right, layout.width - s.x);
        clear.top = Math.min(clear.top, s.y);
        clear.bottom = Math.min(clear.bottom, layout.height - s.y);
        minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
        minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y);
      }
    }
    for (const e of EDGES) {
      if (clear[e] < 0) {
        cut++;
        if (!worst) worst = `${shape.name}: ${(-clear[e]).toFixed(0)}pt off the ${e}`;
      }
      tightest = Math.min(tightest, clear[e]);
    }
    const centre = screenPoint(fit, framebuffer, layout, viewport, 0, 0, 0);
    if (Math.abs(centre.x - layout.width / 2) > 1 || Math.abs(centre.y - layout.height / 2) > 1) {
      offCentre++;
      if (!worst) {
        worst = `${shape.name}: centre at ${centre.y.toFixed(0)}pt of a ${layout.height}pt view`;
      }
    }
    // A cube drawn at a quarter size passes every containment check there is.
    const across = Math.max(maxX - minX, maxY - minY);
    if (across < 0.6 * Math.min(layout.width, layout.height)) {
      shrunk++;
      if (!worst) worst = `${shape.name}: the cube is only ${across.toFixed(0)}pt across`;
    }
    // An aspect mismatch between the projection and the presented surface shows
    // up as a stretch, which no NDC assertion can see. Measured on the unit
    // vectors themselves rather than on the cube's silhouette: how many points
    // one cube unit is worth across, against how many it is worth down.
    const o = screenPoint(fit, framebuffer, layout, viewport, 0, 0, 0);
    const ax = screenPoint(fit, framebuffer, layout, viewport, 1, 0, 0);
    const ay = screenPoint(fit, framebuffer, layout, viewport, 0, 1, 0);
    const ratio = Math.abs(ax.x - o.x) / Math.abs(ay.y - o.y);
    if (ratio < 0.99 || ratio > 1.01) {
      anamorphic++;
      if (!worst) {
        worst = `${shape.name}: one cube unit is ${Math.abs(ax.x - o.x).toFixed(2)}pt across and ` +
          `${Math.abs(ay.y - o.y).toFixed(2)}pt down`;
      }
    }
  }
  check(`the whole cube is on screen at all ${SHAPES.length} real canvas shapes`, cut === 0, worst);
  check(`and ${tightest.toFixed(0)}pt of clearance is left at the tightest edge`, tightest >= 4, worst);
  check('the cube is centred in the canvas at every shape', offCentre === 0, worst);
  check('the cube is not drawn at a fraction of the size it should be', shrunk === 0, worst);
  check('and it is not stretched: a cube unit is the same number of points across as down',
    anamorphic === 0, worst);
  for (const s of SHAPES) console.log(`      ${s.name}: ${s.w}x${s.h}pt @${s.dpr}`);

  // THE BUG, DRIVEN THROUGH THE SAME INSTRUMENT.
  //
  // Everything above is the fix. This is the pre-round-5 code: the viewport set
  // from `gl.drawingBufferWidth/Height`, which on native is the canvas's size
  // at context creation and never changes. The canvas was 427pt tall then (the
  // first layout pass, before the safe-area insets land) and is 334pt now, so
  // the viewport is 279 rows taller than the framebuffer - and GL's origin is
  // the BOTTOM left, so all of that comes off the top.
  //
  // If this ever stops cutting the top off, the mechanism has changed and the
  // section above has stopped proving anything.
  {
    const dpr = 3;
    const layout = { width: 393, height: 334 };
    const framebuffer = { width: 393 * dpr, height: 334 * dpr };
    const frozen = { width: 393 * dpr, height: 427 * dpr };
    const fit = fitFor(framebuffer, layout);
    let top = Infinity;
    let bottom = Infinity;
    for (const q of ORIENTATIONS) {
      for (const v of VERTS) {
        const p = v.clone().applyQuaternion(q);
        const s = screenPoint(fit, framebuffer, layout, frozen, p.x, p.y, p.z);
        top = Math.min(top, s.y);
        bottom = Math.min(bottom, layout.height - s.y);
      }
    }
    check(
      `the frozen-buffer viewport cuts ${(-top).toFixed(0)}pt off the TOP and nothing off the bottom`,
      top < -1 && bottom > 0,
      `top ${top.toFixed(1)} bottom ${bottom.toFixed(1)}`
    );
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
