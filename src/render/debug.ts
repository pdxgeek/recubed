/**
 * TWO SWITCHES FOR SETTLING THE CUBE-CLIPPING BUG ON A REAL PHONE.
 *
 * This container cannot run the app on a device, and two rounds of confident
 * reasoning from browser measurements have now been wrong. So instead of a
 * third guess, here is the experiment, in a file with nothing else in it.
 *
 * Change a `false` to `true`, save, and reload the app in Expo Go.
 *
 * ---------------------------------------------------------------------------
 * FIT_DEBUG - one line in the console per re-fit
 *
 * Metro's terminal (or the Expo Go dev menu's log) will show, for example:
 *
 *   [fit] {"layout":{"width":393,"height":334},"buffer":{"w":1179,"h":1281},
 *          "expected":{"w":1179,"h":1002},"viewport":{"width":1179,"height":1002},...}
 *
 * Read the LAST line after the app settles:
 *
 *   buffer.h !== expected.h    the drawing buffer expo-gl reports is frozen at
 *                              the size the canvas had when the GL context was
 *                              created. Expected on a device; it is the input
 *                              the whole bug needs.
 *   viewport.h  >  expected.h  THE BUG. The viewport overruns the framebuffer,
 *                              and (viewport.h - expected.h) / dpr points of
 *                              cube are pushed off the TOP of the canvas.
 *   viewport.h === expected.h  the viewport is right. If the cube is still cut
 *                              off, nothing in GL is doing it - go to
 *                              FRAME_MARKERS.
 *   only one [fit] line, ever  the scene is never told the canvas resized.
 *
 * ---------------------------------------------------------------------------
 * FRAME_MARKERS - four bright lines at the very edge of the GL surface
 *
 * Drawn with no projection at all, at normalised device coordinates +/-0.98, so
 * they land at the edges of whatever rectangle GL is really writing into.
 *
 *   all four visible, cube inside them   GL maps correctly onto the canvas.
 *                                        Whatever crops the cube is layout, not
 *                                        the renderer.
 *   TOP line missing, other three there  CONFIRMED: the viewport is taller than
 *                                        the framebuffer and the top of the
 *                                        image is off the surface.
 *   all four visible but the box sits
 *   low, with a gap above it             the image is being drawn into part of
 *                                        the framebuffer and stretched - the
 *                                        opposite error.
 *
 * Both are off in the shipped app and cost nothing while they are.
 */

/** Log the layout, the reported buffer, the expected framebuffer, the viewport. */
export const FIT_DEBUG = false;

/** Draw four lines at the edges of the GL surface. */
export const FRAME_MARKERS = false;
