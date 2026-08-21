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
 * The rectangle of the drawing buffer to render into.
 *
 * Normally the whole of it, and on the web target always the whole of it. The
 * case this exists for is a native one: `expo-gl` resizes its drawing buffer in
 * its own time, so for a frame or two after the canvas changes shape -
 * `canvasWrapRunning` taking 108pt for the move strip is the app's own example
 * - `drawingBufferHeight` can still be the old, taller number. Setting the GL
 * viewport to a rectangle taller than the framebuffer does not scale the image
 * down; it pushes the top of it off the surface, which is a cube with its top
 * layer cut off.
 *
 * So the buffer is trusted for the scale factor, which is stable, and the
 * layout for the shape, which is not: the viewport is the layout scaled by the
 * ratio the buffer's width implies, never larger than the buffer says it is.
 * When the two agree this returns the buffer unchanged, which is the only thing
 * that has ever been observed on web.
 */
export function viewportFor(
  buffer: Viewport,
  layout?: { width: number; height: number } | null
): Viewport {
  const bw = Math.max(1, Math.round(buffer.width));
  const bh = Math.max(1, Math.round(buffer.height));
  if (!layout || !(layout.width > 1) || !(layout.height > 1)) return { width: bw, height: bh };
  const scale = bw / layout.width;
  if (!Number.isFinite(scale) || scale <= 0) return { width: bw, height: bh };
  return {
    width: bw,
    height: Math.max(1, Math.min(bh, Math.round(layout.height * scale))),
  };
}

/**
 * Two measurements of the same surface, reconciled.
 *
 * The projection is built from the shape the *layout* reports, because that is
 * the rectangle the user is looking at; the GL viewport is set from the drawing
 * buffer, because that is the rectangle GL is writing into. When the two
 * disagree about the shape - which on a device they can, and on the web target
 * never do - the layout wins and `FIT_MARGIN` absorbs the difference. When
 * there is no layout yet, the buffer is all we have.
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
