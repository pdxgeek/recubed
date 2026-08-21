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
 * THE VIEWPORT IS THE WHOLE DRAWING BUFFER. ALWAYS.
 *
 * Round 5 made it something cleverer: the layout's shape scaled by the buffer's
 * width, clamped to the buffer, on the theory that a buffer which had not caught
 * up with a layout change was pushing the top of the cube off the surface. That
 * theory is now known to be wrong - the cube was still clipped on the device
 * afterwards - and the clamp is actively harmful, which is easy to show.
 *
 * expo-gl presents the WHOLE buffer stretched into the view's rectangle. So:
 *
 *   - Whole buffer, projection from the layout's shape: a stale buffer changes
 *     nothing on screen. The image is drawn with the layout's aspect into a
 *     buffer of some other aspect, and the stretch that presents it undoes
 *     exactly that difference. The cube comes out centred, square and whole.
 *   - Clamped viewport: the image is drawn into part of the buffer, and the
 *     stretch that presents the whole buffer then moves and squashes it. A
 *     1179x1500 buffer under a 393x235 layout put the cube's centre 180 points
 *     down a 235-point view at half the size it should be.
 *
 * `verify-fit.ts` drives both through `screenPoint`, which is the whole chain,
 * and asserts the property in the units the user is looking at: layout points.
 */
export function viewportFor(buffer: Viewport): Viewport {
  return {
    width: Math.max(1, Math.round(buffer.width)),
    height: Math.max(1, Math.round(buffer.height)),
  };
}

/**
 * Where a vertex lands ON SCREEN, in the layout's own points, following every
 * step the renderer and the platform actually take:
 *
 *   world -> the projection built from `fit` -> NDC
 *         -> the GL viewport, inside the drawing buffer
 *         -> the buffer, stretched into the layout's rectangle
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
