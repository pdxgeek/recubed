/**
 * The shell's two runtime layout decisions, as arithmetic rather than as
 * constants baked from a browser measurement.
 *
 * Every layout number in this project was measured in Chromium through
 * react-native-web. Round 5's first screenshot from a real phone showed the
 * step bar drawn over the step list and the step list cramped to two and a half
 * rows - neither of which the browser reproduces, because react-native-web
 * clips a `View` by default while iOS does not, and because a percentage height
 * resolves against a parent whose own height the two platforms settle
 * differently. So these two numbers are worked out from what the device
 * actually measured, and this file has no react-native import so
 * `scripts/verify-layout.ts` can drive it.
 */

/** Room left under the last row of the step list when nothing is in the way. */
export const LIST_BREATHING_ROOM = 16;

/**
 * How far the panel's box runs past the bottom of the body it sits in.
 *
 * Zero whenever the layout is honest, which on the web target it always is.
 * When it is not, this is exactly how much of the list the furniture below is
 * covering, so the list can reserve exactly that and no more. Unmeasured boxes
 * report zero rather than guessing: a wrong reservation is worse than none.
 */
export function panelOverflow(
  body: { height: number },
  panel: { y: number; height: number }
): number {
  if (!(body.height > 0) || !(panel.height > 0)) return 0;
  return Math.max(0, Math.round(panel.y + panel.height - body.height));
}

/** What the step list should leave under its last row. */
export const listBottomInset = (overflow: number) => LIST_BREATHING_ROOM + Math.max(0, overflow);

/** Share of the body the panel takes while a step is being stepped through. */
export const RUN_PANEL_SHARE = 0.38;
export const RUN_PANEL_MIN = 140;
export const RUN_PANEL_MAX = 320;

/**
 * The panel's height during a run, as a definite number.
 *
 * A percentage would be simpler to write and is what this was: `maxHeight:
 * '38%'` of a parent that is itself `flex: 1`. Yoga resolves a percentage
 * against a *definite* parent height, and whether the parent has one depends on
 * how the platform settled the rest of the column - so the same percentage is
 * not the same height everywhere. A number is.
 *
 * `fallback` is used only until the body has been measured, i.e. for one frame.
 */
export function runPanelHeight(bodyHeight: number, fallback: number): number {
  const wanted = bodyHeight > 0 ? Math.round(bodyHeight * RUN_PANEL_SHARE) : fallback;
  return Math.max(RUN_PANEL_MIN, Math.min(wanted, RUN_PANEL_MAX));
}
