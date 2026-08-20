/**
 * Design tokens.
 *
 * The palette, spacing, radii and the contrast helpers live in `palette.ts`,
 * which imports nothing, so they can be asserted headlessly. This file adds the
 * parts that need react-native - the mono font family and the shadow props -
 * and exposes the single `tokens` object the components read.
 */
import { Platform, TextStyle } from 'react-native';
import { palette } from './palette';

export { contrastRatio, inkOn, luminance } from './palette';

const { surface, line, text, accent, status, cube, space, radius, motion, hit } = palette;

const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' })!;

const type = {
  title: palette.typeScale.title,
  heading: palette.typeScale.heading,
  body: palette.typeScale.body,
  caption: palette.typeScale.caption,
  overline: palette.typeScale.overline,
  mono: { ...palette.typeScale.mono, fontFamily: mono },
  monoChip: { ...palette.typeScale.monoChip, fontFamily: mono },
} satisfies Record<string, TextStyle>;

/** Spread alongside a type role for any number that must not jitter. */
const numeric = { fontVariant: ['tabular-nums'] } satisfies TextStyle;

const elevation = {
  none: {},
  low: {
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  high: {
    shadowColor: '#000',
    shadowOpacity: 0.42,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
} as const;

export const tokens = {
  surface,
  line,
  text,
  accent,
  status,
  cube,
  space,
  type,
  numeric,
  radius,
  elevation,
  motion,
  hit,
} as const;
