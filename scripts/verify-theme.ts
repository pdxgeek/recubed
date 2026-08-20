/**
 * Design-token checks that are really accessibility checks.
 *
 * The letters printed inside the colour swatches are the app's colour-blind
 * affordance: they are how a red/green-blind user tells O from R and G from
 * anything. A letter nobody can read is worse than no letter, so the ink chosen
 * for every cube colour has to clear WCAG contrast - and has to be the better of
 * the two inks available, which is the assertion no threshold can drift past.
 */
import { COLOR_HEX, COLOR_IDS, COLOR_NAME } from '../src/cube/core';
import { contrastRatio, inkOn, palette } from '../src/ui/palette';

let fails = 0;
const check = (name: string, ok: boolean, extra = '') => {
  if (ok) console.log(`ok    ${name}`);
  else {
    fails++;
    console.log(`FAIL  ${name} ${extra}`);
  }
};

// -- the swatch letters ------------------------------------------------------

const BLACK = '#000000';
const WHITE = '#ffffff';
/** AA for large/bold text. The letters are 15pt 700, so this is the bar. */
const FLOOR = 4.5;

for (const id of COLOR_IDS) {
  const hex = COLOR_HEX[id];
  const ink = inkOn(hex);
  const got = contrastRatio(ink, hex);
  const best = Math.max(contrastRatio(BLACK, hex), contrastRatio(WHITE, hex));
  check(
    `${COLOR_NAME[id]} letter is legible (${got.toFixed(2)}:1)`,
    got >= FLOOR,
    `${ink} on ${hex} is ${got.toFixed(2)}:1, needs ${FLOOR}`
  );
  check(
    `${COLOR_NAME[id]} letter uses the better of the two inks`,
    Math.abs(got - best) < 1e-9,
    `picked ${ink} at ${got.toFixed(2)}:1, the other ink gives ${best.toFixed(2)}:1`
  );
}

// -- the line tokens ---------------------------------------------------------
//
// The whole point of splitting `border` in round 1: a control boundary is
// non-text contrast (WCAG 1.4.11, 3:1); a divider is decorative and exempt.

const { line, surface, text, accent } = palette;
for (const [name, ground] of [
  ['raised', surface.raised],
  ['base', surface.base],
] as const) {
  const ratio = contrastRatio(line.outline, ground);
  check(
    `control outlines are visible on ${name} (${ratio.toFixed(2)}:1)`,
    ratio >= 3,
    `${line.outline} on ${ground}`
  );
}
check(
  'the active-control outline is stronger still',
  contrastRatio(line.outlineStrong, surface.raised) >= contrastRatio(line.outline, surface.raised)
);
check(
  'hairline is only ever a divider, never a control edge',
  contrastRatio(line.hairline, surface.raised) < 3,
  'if this ever passes 3:1 the two tokens have collapsed into one'
);

// -- body text ---------------------------------------------------------------

for (const [name, hex, floor] of [
  ['primary', text.primary, 7],
  ['secondary', text.secondary, 4.5],
  ['tertiary', text.tertiary, 4.5],
] as const) {
  const ratio = contrastRatio(hex, surface.raised);
  check(`text.${name} on a card (${ratio.toFixed(2)}:1)`, ratio >= floor, `needs ${floor}`);
}
check(
  'ink on a filled accent button is legible',
  contrastRatio(text.onAccent, accent.base) >= 4.5,
  `${contrastRatio(text.onAccent, accent.base).toFixed(2)}:1`
);
check(
  'text.primary on the accent fill is legible',
  contrastRatio(text.primary, accent.soft) >= 4.5,
  `${contrastRatio(text.primary, accent.soft).toFixed(2)}:1`
);

// -- touch targets -----------------------------------------------------------

check('the minimum target is 44pt', palette.hit.min >= 44);
check('nothing in the type scale is under 11pt',
  Object.values(palette.typeScale).every((t) => t.fontSize >= 11));

console.log(fails ? `\n${fails} theme check(s) failed` : '\nall theme checks passed');
process.exit(fails ? 1 : 0);
