/**
 * Where the camera has to stand for the whole cube to be inside the frame.
 *
 * Split out of `CubeScene` because this is the one piece of the renderer that
 * cannot be checked by looking at the web build. Round 5's first real-device
 * screenshot showed the cube cut off at the top and the bottom of the canvas in
 * Expo Go, on the same code that frames it correctly in Chromium. So the maths
 * moved here, where `scripts/verify-fit.ts` can drive it with device-shaped
 * inputs - 393x852 points at devicePixelRatio 3, which is 1179x2556 pixels -
 * and assert that every drawn vertex lands inside the frustum.
 *
 * Two rules this module exists to enforce:
 *
 *   1. **Scale invariance.** The fit depends on the *shape* of the surface and
 *      on nothing else. Points, pixels, a buffer measured one way and a layout
 *      measured the other - all of them give the same camera, because only the
 *      ratio is ever read. `verify-fit.ts` asserts that directly.
 *   2. **A real margin.** The old fit put a plane of radius 2.95 at the frame
 *      edge (`d = R / tan(fov/2)`), which is the formula for a flat card, not
 *      for a solid: a sphere of radius R at that distance overruns the frame,
 *      and the cube only stayed inside because 2.95 happened to be larger than
 *      the cube. `d = R / sin(halfAngle)` is the sphere fit, and `FIT_MARGIN`
 *      is stated rather than accidental, so a few per cent of disagreement
 *      between what the layout says and what the drawing buffer says cannot
 *      clip a corner.
 *
 * No react-native, no GL, no three: plain numbers in and out.
 */

// ---- the geometry the renderer draws --------------------------------------
// These live here rather than in `CubeScene` so the fit and the thing being
// fitted cannot drift apart.

/** Distance between neighbouring cubie centres. Cubies sit at -1, 0, 1. */
export const SPACING = 1.0;
/** Edge length of a cubie body. */
export const BODY = 0.94;
/** Edge length of a sticker quad. */
export const STICKER = 0.8;
/** Edge length of a highlight ring. */
export const RING = 0.94;
/** How far a sticker sits off the body's surface. */
export const STICKER_LIFT = BODY / 2 + 0.012;
/** How far a highlight ring sits off it. */
export const RING_LIFT = BODY / 2 + 0.006;

/** Half-extent of the cube along one axis: the outermost thing drawn. */
export const CUBE_HALF_EXTENT = SPACING + Math.max(BODY / 2, STICKER_LIFT, RING_LIFT);

/**
 * Radius of the sphere containing every vertex the renderer draws.
 *
 * The furthest point is a body corner of an outer cubie: `SPACING + BODY/2` on
 * all three axes. A sticker reaches further along its own normal but is only
 * `STICKER/2` across, so it never wins.
 */
export const CUBE_RADIUS = Math.hypot(
  SPACING + BODY / 2,
  SPACING + BODY / 2,
  Math.max(SPACING + BODY / 2, SPACING + STICKER_LIFT)
);

// ---- the camera -----------------------------------------------------------

/** Vertical field of view, in degrees. */
export const FOV_DEGREES = 40;

/**
 * Empty frame left around the cube, as a fraction of its radius.
 *
 * Not decoration. It is the allowance for every way the surface can turn out
 * not to be the shape we were told it was: a drawing buffer that has not caught
 * up with a layout change, a device pixel ratio applied to one measurement and
 * not the other, a rounded pixel size. On the web target those are all zero and
 * this costs a tenth of the frame; on a device it is the difference between a
 * tight fit and a cube with its top layer cut off.
 */
export const FIT_MARGIN = 0.12;

export interface CameraFit {
  /** Width divided by height. Free of units by construction. */
  aspect: number;
  /** How far back the camera stands, in cube units. */
  distance: number;
  /** Half-height of the near plane. */
  top: number;
  /** Half-width of the near plane. */
  right: number;
  near: number;
  far: number;
}

export const NEAR = 0.1;
export const FAR = 100;

const radians = (deg: number) => (deg * Math.PI) / 180;

/**
 * The camera for a surface of this shape.
 *
 * `width` and `height` may be in any unit at all, as long as they are in the
 * same one: only their ratio is read. Non-finite or non-positive input falls
 * back to a square, which is the shape that needs the camera furthest away on
 * neither axis and cannot produce a NaN projection.
 */
export function fitCamera(width: number, height: number): CameraFit {
  const w = Number.isFinite(width) && width > 0 ? width : 1;
  const h = Number.isFinite(height) && height > 0 ? height : 1;
  const aspect = w / h;

  const halfV = radians(FOV_DEGREES) / 2;
  // The horizontal half-angle of the same frustum. Narrower than the vertical
  // one exactly when the surface is taller than it is wide.
  const halfH = Math.atan(Math.tan(halfV) * aspect);
  const tightest = Math.min(halfV, halfH);

  const radius = CUBE_RADIUS * (1 + FIT_MARGIN);
  const distance = radius / Math.sin(tightest);

  const top = NEAR * Math.tan(halfV);
  return { aspect, distance, top, right: top * aspect, near: NEAR, far: FAR };
}

/**
 * Where a point in camera-facing world space lands in normalised device
 * coordinates. Both components are inside [-1, 1] exactly when the point is
 * inside the frame, which is what `verify-fit.ts` asserts for every vertex.
 */
export function projectToNdc(
  fit: CameraFit,
  x: number,
  y: number,
  z: number
): { x: number; y: number; depth: number } {
  // The camera sits at +z looking down -z, so a point's depth from it is
  // `distance - z`.
  const depth = fit.distance - z;
  const halfV = radians(FOV_DEGREES) / 2;
  const halfHeight = depth * Math.tan(halfV);
  const halfWidth = halfHeight * fit.aspect;
  return { x: x / halfWidth, y: y / halfHeight, depth };
}

export interface Viewport {
  width: number;
  height: number;
}

/**
 * THE VIEWPORT IS THE FRAMEBUFFER, AND THE FRAMEBUFFER IS `layout x dpr`.
 *
 * `gl.drawingBufferWidth/Height` MUST NOT BE READ ON NATIVE. In expo-gl they
 * are plain JS number properties, written once when the context is created and
 * never again:
 *
 *   - `expo-gl/common/EXWebGLRenderer.cpp:57-58` sets them with
 *     `gl.setProperty(...)`, not as getters, from `createWebGLRenderer`, which
 *     runs once per context;
 *   - the values come from a single `glGetIntegerv(GL_VIEWPORT)` in
 *     `EXGLNativeContext.cpp:157-161`;
 *   - meanwhile `expo-gl/ios/GLView.swift`'s `resizeViewBuffersToWidth`
 *     REALLOCATES the colour, depth and MSAA renderbuffers on every layout
 *     change, and never tells JS.
 *
 * So on a device those two numbers are the canvas's size at the moment the
 * context was created, forever. Setting the viewport from them into a
 * framebuffer that has since been reallocated SMALLER pushes the image off the
 * TOP, because GL's origin is bottom left - and a cube cut off at the top of
 * its own canvas is exactly the screenshot this project has now been sent
 * twice. Nothing else in the pipeline has a top-specific signature: the
 * projection cannot clip vertically at any aspect at all, because the vertical
 * field of view is fixed at 40 degrees and a wrong aspect can only push the
 * camera further back.
 *
 * The framebuffer is the layer's own drawable, which is the view's size in
 * points times the screen's pixel ratio. That is a number this app already
 * knows honestly, from `onLayout` and `PixelRatio.get()`, and it is right on
 * the web target too. So it is the only thing the viewport is ever set from.
 *
 * (The other correct answer is to not call `gl.viewport` at all on native and
 * let `resizeViewBuffersToWidth`'s own `glViewport` stand. That is fewer moving
 * parts but it is platform-specific, untestable from here, and it leaves the
 * viewport wrong on web - so this app computes the same number instead, on both
 * platforms, where a test can see it.)
 */
export function viewportFor(layout: { width: number; height: number }, dpr: number): Viewport {
  const r = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  return {
    width: Math.max(1, Math.round(layout.width * r)),
    height: Math.max(1, Math.round(layout.height * r)),
  };
}

/**
 * Where a vertex lands ON SCREEN, in the layout's own points, following every
 * step the renderer and the platform actually take:
 *
 *   world -> the projection built from `fit` -> NDC
 *         -> the GL viewport, placed at the bottom left of the FRAMEBUFFER
 *         -> the framebuffer, presented into the layout's rectangle
 *
 * `buffer` is the framebuffer that is really allocated - `layout x dpr` - and
 * NOT whatever `gl.drawingBufferWidth/Height` claims, which on native is a
 * number frozen at context creation. Passing the frozen one here is how a test
 * models the bug rather than the fix.
 *
 * A point inside `0..layout.width` by `0..layout.height` is a point the user
 * can see. That is the property "the cube is not cut off" actually means, and
 * it is the one `verify-fit.ts` asserts - not "the NDC is inside the unit box",
 * which is true of a cube drawn into the wrong quarter of the buffer.
 */
export function screenPoint(
  fit: CameraFit,
  buffer: { width: number; height: number },
  layout: { width: number; height: number },
  viewport: Viewport,
  x: number,
  y: number,
  z: number
): { x: number; y: number } {
  const ndc = projectToNdc(fit, x, y, z);
  const bw = Math.max(1, buffer.width);
  const bh = Math.max(1, buffer.height);
  // GL's origin is the bottom left of the buffer, and the viewport is placed
  // there: this is where the clamped viewport's displacement comes from.
  const px = (ndc.x * 0.5 + 0.5) * viewport.width;
  const pyFromBottom = (ndc.y * 0.5 + 0.5) * viewport.height;
  const pyFromTop = bh - pyFromBottom;
  return { x: (px / bw) * layout.width, y: (pyFromTop / bh) * layout.height };
}

/**
 * Two measurements of the same surface, reconciled.
 *
 * The projection is built from the shape the *layout* reports, because that is
 * the rectangle the user is looking at, and the buffer is presented stretched
 * into exactly that rectangle - so the layout's aspect is the one that survives
 * to the screen whatever shape the buffer happens to be. When there is no
 * layout yet, the buffer is all we have.
 */
export function fitFor(
  buffer: { width: number; height: number },
  layout?: { width: number; height: number } | null
): CameraFit {
  const usable = (s?: { width: number; height: number } | null) =>
    !!s && Number.isFinite(s.width) && Number.isFinite(s.height) && s.width > 1 && s.height > 1;
  if (usable(layout)) return fitCamera(layout!.width, layout!.height);
  return fitCamera(buffer.width, buffer.height);
}
