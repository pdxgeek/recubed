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

/**
 * THE CUBE IS THE SUBJECT OF THE APP, AND IT NEVER YIELDS TO THE LIST.
 *
 * Round 6, from the user: "I dunno about zero panel height either the cube is
 * off the screen". Rounds 3, 4 and 5 each added a control on the argument that
 * it cost "zero panel height" - and every one of those measurements was taken
 * in Chromium through react-native-web, which is the same evidence that already
 * hid two native layout bugs from this project.
 *
 * The honest position is that "zero panel height" was true of the *panel* and
 * says nothing about the *canvas*. What decides the canvas is the panel's box,
 * and the panel's box was a PERCENTAGE (`maxHeight: '56%'`) of a parent whose
 * height Yoga resolves differently on the two platforms - with the canvas as
 * the only shrinkable sibling in the column and a step list that wants to be a
 * thousand points tall. If that percentage does not resolve, the panel sizes
 * itself to its content and the canvas is what gives way.
 *
 * So the panel's height is a definite number in every state, and the canvas has
 * a floor the panel is not allowed to cross. `verify-layout.ts` drives this over
 * every body height a phone or tablet can produce.
 */

/** The smallest slice of cube worth drawing, in points. */
export const CUBE_MIN = 180;
/** ...and never less than this share of the body, however tall the body is. */
export const CUBE_MIN_SHARE = 1 / 3;
/**
 * The move strip's height before it has measured itself.
 *
 * Was a constant 108 in `App.tsx` - a browser measurement of a strip that is
 * really 117 on the same browser and unknown on a device, which is nine points
 * of cube drawn underneath an opaque scrim. The strip reports its own height
 * now and this is only the first frame's guess.
 */
export const STRIP_H_FALLBACK = 120;

/**
 * How much canvas is left, from the window down.
 *
 * Here rather than as a literal in a test, because that is how three rounds of
 * browser numbers got into the suite wearing a device's name: `verify-fit.ts`
 * called `393x430` an "iPhone 15 canvas" when 430 is 852 minus the top bar and
 * the panel with the safe-area insets taken as ZERO, which is Chromium's
 * answer, not a phone's. On the phone the same chain gives 334. A browser
 * measurement can still enter the suite - it just has to enter it wearing its
 * own name, as `insets: {top: 0, bottom: 0}`.
 */
export function canvasHeight(
  windowHeight: number,
  insets: { top: number; bottom: number },
  topBar: number,
  panel: number,
  strip = 0
): number {
  return Math.max(0, windowHeight - insets.top - insets.bottom - topBar - panel - strip);
}

/** Safe-area insets, by what is really being measured. */
export const INSETS = {
  /** iPhone 15/16 class, Dynamic Island. */
  iphone: { top: 59, bottom: 34 },
  /** iPhone SE: a status bar and no home indicator. */
  iphoneSE: { top: 20, bottom: 0 },
  /** Chromium through react-native-web, which resolves every `env()` to zero. */
  browser: { top: 0, bottom: 0 },
} as const;

/** The least the panel may be squeezed to before the cube's floor gives way. */
export const PANEL_LAST_RESORT = 96;

/** The floor under the cube's own region, for a body of this height. */
export const cubeFloor = (bodyHeight: number) =>
  Math.max(CUBE_MIN, Math.round(bodyHeight * CUBE_MIN_SHARE));

export interface Budget {
  /** The panel's height, as a definite number. */
  panel: number;
  /** What is left for the canvas, strip included. */
  canvas: number;
  /** The part of the canvas the strip is not sitting on: the cube's own room. */
  cube: number;
}

/**
 * How the body is divided between the cube and the panel.
 *
 * `wanted` is what the panel would like - 38% during a run, the sheet's minimum
 * at rest. It gets it only if the cube still clears its floor; otherwise the
 * PANEL yields, which is the whole point. A body that has not been measured yet
 * (the first frame) gets `wanted` unchanged, because guessing at a division of
 * zero is worse than waiting one frame.
 */
export function panelBudget(bodyHeight: number, wanted: number, stripHeight = 0): Budget {
  if (!(bodyHeight > 0)) return { panel: wanted, canvas: 0, cube: 0 };
  const strip = Math.max(0, Math.round(stripHeight));
  const floor = Math.min(cubeFloor(bodyHeight), Math.max(0, bodyHeight - strip));
  const most = Math.max(0, bodyHeight - strip - floor);
  // The one case where the cube's floor gives way: a body so short that
  // honouring it would leave the panel with nothing at all. A 3pt panel is not
  // a panel, so the last resort is a panel that can still show a row, and the
  // cube keeps whatever is left. No phone in portrait produces this; a very
  // short landscape window can.
  const panel = Math.max(
    Math.min(Math.round(wanted), PANEL_LAST_RESORT),
    Math.min(Math.round(wanted), most)
  );
  const canvas = bodyHeight - panel;
  return { panel, canvas, cube: Math.max(0, canvas - strip) };
}

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
