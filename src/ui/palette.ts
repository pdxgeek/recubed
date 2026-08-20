/**
 * The palette and scales, with no react-native import, so the contrast maths can
 * be checked headlessly by `scripts/verify-theme.ts`. `theme.ts` composes these
 * into the `tokens` object the components use.
 */

/* ── Surfaces ──────────────────────────────────────────────────────────────
   A four-step ramp. Everything sits on exactly one of these.               */
const surface = {
  /** Behind the GL canvas. Matches CubeScene's CLEAR_COLOR family. */
  canvas: '#0a0a0e',
  /** Panels, bars, sheets. */
  base: '#131319',
  /** Cards, buttons, swatch tiles, chips. */
  raised: '#1c1c25',
  /** Wells: progress tracks, inactive segment backgrounds. */
  sunken: '#24242f',
  /** Overlay veils (canvas nudge, modal backdrops). */
  scrim: '#00000099',
  /** Rim drawn around a colour chip so light swatches keep an edge. */
  chipRim: '#00000055',
} as const;

/* ── Lines ─────────────────────────────────────────────────────────────────
   Two tokens, because WCAG 1.4.11 treats them differently. The old single
   `border: #2a2a36` was 1.19:1 on raised - invisible as a control boundary,
   which is the main reason the UI read as a debug panel.                    */
const line = {
  /** Decorative rules and dividers only. 1.24:1 - exempt from 1.4.11. */
  hairline: '#262631',
  /** Boundaries of interactive controls. 3.22:1 on raised, 3.52:1 on base. */
  outline: '#6a6a82',
  /** Boundary of a selected or active control. 9.98:1 on raised. */
  outlineStrong: '#4fd6ff',
} as const;

/* ── Text ──────────────────────────────────────────────────────────────────
   Ratios given against surface.raised, the worst case for body text.       */
const text = {
  primary: '#f4f4f7', // 15.40:1
  secondary: '#b4b4c4', //  8.26:1
  /** Captions only, never below 13pt. */
  tertiary: '#8a8a9c', //  4.99:1
  /** Ink on a filled accent button. 9.84:1 on accent. */
  onAccent: '#04212c',
  disabled: '#5a5a70',
} as const;

/* ── Accent & semantics ────────────────────────────────────────────────────
   accent.base : outlines, glyphs, the "current move" fill
   accent.soft : the fill behind a selected control. Use text.primary on it
                 (11.09:1); accent-on-soft was 3.95:1 and failed AA.        */
const accent = {
  base: '#4fd6ff', // 10.92:1 on surface.base
  soft: '#164a5e',
  ink: text.onAccent,
} as const;

const status = {
  ok: '#54d98c', // 9.40:1 on raised
  okSoft: '#12301f',
  warn: '#ffb020', // 9.24:1 - also CubeScene's PARTNER_COLOR
  warnSoft: '#2e2210',
  danger: '#ff8a80', // 7.41:1
  dangerSoft: '#3a1512',
} as const;

/* ── Cube semantics ────────────────────────────────────────────────────────
   Mirrors CubeScene's highlight colours so the panels can draw a legend that
   matches the cube without importing from the renderer.                     */
const cube = {
  /** SELECT_COLOR - the piece or slot the user picked. */
  selected: '#ffffff',
  /** PARTNER_COLOR - its opposite number. */
  target: '#ffb020',
  /** TARGET_COLOR - pieces the running algorithm moves. */
  moving: '#39d0ff',
  /** BLANK_COLOR - an unpainted sticker. */
  blank: '#2b2b34',
  wire: '#8d8fa6',
} as const;

/* ── Spacing ───────────────────────────────────────────────────────────────
   4pt base, one gutter.                                                     */
const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  /** The one horizontal gutter, everywhere. */
  gutter: 16,
} as const;

/* ── Type scale ────────────────────────────────────────────────────────────
   Six roles. Nothing below 11pt. `theme.ts` adds the mono font family.       */
const typeScale = {
  /** Panel and screen titles. */
  title: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  /** Section and method headings, selected piece names. */
  heading: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  /** Default body: step titles, swatch names, button labels. */
  body: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  /** Supporting copy, counts, legends. */
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  /** Stage labels, algorithm tags, group headings. Never smaller. */
  overline: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.8 },
  /** Move notation. */
  mono: { fontSize: 14, lineHeight: 19 },
  /** Move chips. */
  monoChip: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
} as const;

const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

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

const motion = {
  instant: 90,
  base: 160,
  slow: 240,
  nudgeHold: 4000,
  toastHold: 2500,
} as const;

const hit = {
  /** Apple HIG / WCAG 2.5.8. minHeight on every Pressable. */
  min: 44,
  /** Primary calls to action. */
  large: 48,
  slop: { top: 8, bottom: 8, left: 8, right: 8 },
} as const;

/** Relative luminance, per WCAG 2.x. */
export function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const c = [0, 2, 4].map((i) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** WCAG contrast ratio between two hex colours. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Which ink to print a sticker letter in.
 *
 * Not a luminance threshold: "is this colour light?" is a different question
 * from "which ink contrasts better with it", and the two disagree. A 0.35
 * threshold put white on orange at 2.85:1 - below the 3:1 floor, on the very
 * letter a red/green-blind reader leans on to tell O from R - where black gives
 * 7.37:1. So the two ratios are compared directly, which is optimal for any
 * palette and has no threshold to drift.
 */
export function inkOn(hex: string): string {
  const L = luminance(hex);
  // (L + 0.05) / 0.05 against black, versus 1.05 / (L + 0.05) against white.
  return (L + 0.05) * (L + 0.05) >= 0.0525 ? '#000000' : '#ffffff';
}

export const palette = {
  surface,
  line,
  text,
  accent,
  status,
  cube,
  space,
  typeScale,
  radius,
  motion,
  hit,
} as const;
