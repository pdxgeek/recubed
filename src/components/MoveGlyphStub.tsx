/**
 * A STAND-IN for the real `MoveGlyph`, which is being built in the main tree.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SWAP, at merge time, in one step:
 *
 *   1. delete this file, and
 *   2. pass the real component to `TeachingPage` / `Filmstrip` as their
 *      `MoveGlyph` prop (both already take one and both default to this).
 *
 * The interface is `MoveGlyphProps` in `src/ui/teaching.ts` and it is the
 * design spec's own signature - `{ notation, size, state, showLetter }` - so
 * the swap is a prop and nothing else moves. `glyphGeometry` in the same file
 * drives this stub only and is deleted with it; the real component derives the
 * same facts from `MOVE_DEFS` inside `src/ui/glyphs.ts`, which is stronger.
 *
 * TWO THINGS THE REAL ONE MUST KEEP, because the verifier holds both:
 *
 *  - **A half turn is a double-headed arrow, not a glyph carrying a `2`.** The
 *    page's premise is symbols instead of letters, and `U2` genuinely has no
 *    direction - which a double head states and a numeral does not.
 *  - **F and B differ by DEPTH, not by arrow.** Seen head on they turn the
 *    same way; if the glyph does not draw which layer is moving, `F'` and `B`
 *    are the same picture. `no two moves draw the same glyph` caught exactly
 *    that during this page's development.
 *
 * COVERAGE: this stub draws all eighteen bases, including `M`, `Rw`, `Fw`, `x`
 * and `y`. That is not optional here. `H perm` is `M2 U M2 U2 M2 U M2`; a
 * glyph component that returns null for slices renders this page's central
 * feature as seven letters and no symbols at all.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * What this draws is deliberately the minimum that is still *correct*: a 3×3
 * grid with the carried band shaded and a straight or curved arrow across it.
 * It is not the finished glyph and does not try to be. It exists so the page
 * renders, so the filmstrip can be driven end to end, and so nothing in
 * `TeachingPage` is written against a component that is not there yet.
 *
 * No SVG and no new dependency: three nested `View`s and a rotated bar, which
 * is all react-native offers without one. That is also why the arrowhead is a
 * rotated square rather than a path.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { parseMove } from '../cube/core';
import { GlyphState, MoveGlyphProps, glyphGeometry, spokenMove } from '../ui/teaching';
import { tokens } from '../ui/theme';

const { line, text, accent, surface, type } = tokens;

/**
 * Arrow ink, and it is WHITE rather than the accent.
 *
 * The obvious choice is a cyan arrow on the cyan-soft lit slice, and
 * `palette.ts` states in its own comment that accent-on-soft measures 3.95:1
 * and failed AA. It would clear the 3:1 graphics floor, but a 2-4pt stroke has
 * no margin to give away, and a cyan arrow over a cyan slice reads as texture
 * rather than as an instruction. White over the slice over a dark cell is the
 * printed reference's black-on-white-on-grey, inverted for this ground, and it
 * is 11:1 or better everywhere.
 *
 * A rotation is deliberately quieter: `x`, `y` and `z` do not change the
 * puzzle, only where you are standing, and that deserves a visual difference.
 */
const INK: Record<GlyphState, string> = {
  future: text.primary,
  current: text.primary,
  past: text.tertiary,
};

export function MoveGlyphStub({
  notation,
  size,
  state = 'future',
  showLetter = false,
  accessibilityLabel,
}: MoveGlyphProps) {
  // The stub parses; the real component derives the same thing from
  // `MOVE_DEFS` inside `src/ui/glyphs.ts`. Either way there is exactly one
  // parser in the app and it is `src/cube/core.ts`.
  const geo = glyphGeometry(parseMove(notation));
  const ink = geo.wholeCube && state !== 'past' ? text.secondary : INK[state];
  // The lit band is the accent; the arrow over it is not. Two colours, one of
  // which is the instruction.
  const lit = state === 'past' ? surface.sunken : accent.soft;
  const litEdge = state === 'past' ? line.outline : accent.base;
  // The grid takes about two thirds of the tile, leaving a margin the arrow can
  // overhang into without touching the tile's border.
  const grid = Math.round(size * 0.62);
  const cell = Math.floor(grid / 3);
  const label = accessibilityLabel ?? spokenMove(notation);

  const cells: React.ReactNode[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      // A row move shades a row, a column move shades a column. A face turn
      // has no band to shade - its cells are depths, not squares - so it
      // shades the whole grid and lets the depth pip carry the difference.
      const carried =
        geo.band === 'row'
          ? geo.cells.includes(r)
          : geo.band === 'col'
            ? geo.cells.includes(c)
            : true;
      cells.push(
        <View
          key={`${r}-${c}`}
          style={{
            position: 'absolute',
            left: c * cell,
            top: r * cell,
            width: cell - 1,
            height: cell - 1,
            backgroundColor: carried && !geo.wholeCube ? lit : surface.base,
            borderWidth: 1,
            borderColor: carried && !geo.wholeCube ? litEdge : line.hairline,
          }}
        />
      );
    }
  }

  const straight = geo.band !== 'face';
  const vertical = geo.dir === 'up' || geo.dir === 'down';
  const bar = Math.max(2, Math.round(size / 26));

  return (
    <View
      style={[styles.box, { width: size, height: size }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
    >
      <View style={{ width: grid, height: grid }}>{cells}</View>

      {straight ? (
        // The arrow: a bar across the tile in the direction of travel, with a
        // rotated square for a head. Two heads for a half turn, so a double is
        // never read as a quarter.
        <View
          pointerEvents="none"
          style={[
            styles.arrowWrap,
            vertical
              ? { width: bar, height: grid + 8, flexDirection: 'column' }
              : { height: bar, width: grid + 8, flexDirection: 'row' },
          ]}
        >
          <Head show={geo.doubleHead || geo.dir === 'up' || geo.dir === 'left'} dir={geo.dir} size={bar * 3} ink={ink} />
          <View style={{ flex: 1, backgroundColor: ink }} />
          <Head show={geo.doubleHead || geo.dir === 'down' || geo.dir === 'right'} dir={geo.dir} size={bar * 3} ink={ink} />
        </View>
      ) : (
        // A whole-face turn reads as a rotation, so it gets a ring rather than
        // a bar, with the sense written in the one place a curve cannot be
        // drawn without a path.
        <View
          pointerEvents="none"
          style={[
            styles.ring,
            {
              width: grid + 6,
              height: grid + 6,
              borderRadius: (grid + 6) / 2,
              borderColor: ink,
              borderWidth: bar,
              borderLeftColor: 'transparent',
            },
          ]}
        >
          <Text style={[styles.sense, { color: ink, fontSize: Math.max(11, Math.round(size / 4)) }]}>
            {geo.dir === 'cw' ? '↻' : '↺'}
            {geo.doubleHead ? '²' : ''}
          </Text>
        </View>
      )}

      {/* The letters, off by default. The user asked for symbols instead of
          letters; this is a prop rather than a redesign in case that is ever
          wanted back. */}
      {showLetter && (
        <Text style={[styles.letter, { color: ink }]} maxFontSizeMultiplier={1}>
          {notation}
        </Text>
      )}

      {/* Depth, for a face turn: which layer is moving is the ONLY thing that
          separates F' from B, and the verifier holds that line. Three pips,
          the carried ones filled. */}
      {geo.band === 'face' && (
        <View style={styles.pips} pointerEvents="none">
          {[0, 1, 2].map((d) => (
            <View
              key={d}
              style={{
                width: bar + 1,
                height: bar + 1,
                borderRadius: bar,
                marginHorizontal: 1,
                backgroundColor: geo.cells.includes(d) ? ink : 'transparent',
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: ink,
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function Head({ show, dir, size, ink }: { show: boolean; dir: string; size: number; ink: string }) {
  if (!show) return <View style={{ width: 0, height: 0 }} />;
  const vertical = dir === 'up' || dir === 'down';
  return (
    <View
      style={{
        width: size,
        height: size,
        transform: [{ rotate: '45deg' }],
        borderTopWidth: 2,
        borderRightWidth: 2,
        borderColor: ink,
        alignSelf: 'center',
        marginTop: vertical ? -size / 3 : 0,
        marginLeft: vertical ? 0 : -size / 3,
      }}
    />
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  arrowWrap: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  sense: { fontWeight: '700', backgroundColor: surface.raised, paddingHorizontal: 2 },
  pips: { position: 'absolute', bottom: 2, flexDirection: 'row' },
  letter: { ...type.overline, position: 'absolute', bottom: 1, fontSize: 8, lineHeight: 10 },
});
