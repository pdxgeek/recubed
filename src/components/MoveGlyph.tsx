import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MoveGlyph as Glyph, glyphFor } from '../ui/glyphs';
import { tokens } from '../ui/theme';

/**
 * A move drawn instead of spelled.
 *
 * "I like these symbols better than the letters" - said of a printed beginner's
 * tutorial where every move is a small 3x3 grid with an arrow across it. Eight
 * of them in a row read like a filmstrip: the eye takes in the SHAPE of an
 * algorithm without decoding anything.
 *
 * ONE RULE, and it makes the whole set readable without a legend:
 *
 *   Every glyph is the FRONT of a cube held the normal way, and the arrow is
 *   the movement you would see from there.
 *
 * Where the lit cells are says WHICH layer. Where the arrow points says WHICH
 * WAY. A curve says the layer facing you is turning in the plane of the page,
 * and a hollow grid says the layer is the one BEHIND - without which `B` and
 * `F'` would be the same picture. Two heads on one arrow is a half turn, which
 * genuinely has no direction.
 *
 * None of those directions is written down from memory: `src/ui/glyphs.ts`
 * derives every one of them from the engine's own move table, and
 * `scripts/verify-glyphs.ts` checks the result against the stickers the engine
 * really carries. A glyph pointing the wrong way is worse than a letter.
 *
 * Built out of plain `View`s - no `react-native-svg`, no new dependency of any
 * kind. AGENTS.md opens by recording that this project has already been burned
 * by native modules that fail in Expo Go.
 *
 * The letters are not lost. Every glyph carries its move as its
 * `accessibilityLabel`, spoken the way the app has always spoken it - "R prime",
 * never "R apostrophe" - and the explanation writes the sequence out in
 * standard notation for a learner who wants to carry it elsewhere.
 */

export type GlyphState = 'future' | 'current' | 'past' | 'covered';

interface Props {
  notation: string;
  /** The tile's side, in points. Below 44 the nine cells become three bars. */
  size?: number;
  state?: GlyphState;
  /** Practise mode: the tile is drawn empty, so it cannot give the move away. */
  covered?: boolean;
  /**
   * Print the letters under the diagram as well.
   *
   * Off everywhere by default, and it must stay off on the solve screen: the
   * whole point of the glyph is that it is not a character, and printing both
   * is the clutter round 6 removed. It is here for a surface that is
   * deliberately teaching the standard notation.
   */
  showLetter?: boolean;
  /** Overrides the spoken move, for a caller that has more context. */
  accessibilityLabel?: string;
}

/** Everything the tile's geometry needs, from its one dimension. */
export function glyphMetrics(size: number) {
  const pad = size >= 66 ? 7 : size >= 44 ? 5 : 4;
  const field = size - 2 * pad;
  const detail: 'cells' | 'bar' = size >= 44 ? 'cells' : 'bar';
  const gap = size >= 66 ? 5 : 3;
  const cell = Math.floor((field - 2 * gap) / 3);
  const grid = cell * 3 + gap * 2;
  const stroke = size >= 66 ? 4 : size >= 44 ? 3 : 2;
  const headHalf = size >= 66 ? 6 : size >= 44 ? 5 : 3;
  const headLen = size >= 66 ? 8 : size >= 44 ? 6 : 4;
  return { pad, field, detail, cell, gap, grid, stroke, headHalf, headLen };
}

/** A solid wedge, made from a View's borders - identical on all three targets. */
function Head({
  half,
  len,
  color,
  point,
  left,
  top,
}: {
  half: number;
  len: number;
  color: string;
  point: number;
  left: number;
  top: number;
}) {
  return (
    <View
      style={{
        position: 'absolute',
        left: left - half,
        top: top - len / 2,
        width: 0,
        height: 0,
        backgroundColor: 'transparent',
        borderStyle: 'solid',
        borderLeftWidth: half,
        borderLeftColor: 'transparent',
        borderRightWidth: half,
        borderRightColor: 'transparent',
        borderBottomWidth: len,
        borderBottomColor: color,
        transform: [{ rotate: `${point}deg` }],
      }}
    />
  );
}

export function MoveGlyph({
  notation,
  size = 36,
  state = 'future',
  covered = false,
  showLetter = false,
  accessibilityLabel,
}: Props) {
  const g = glyphFor(notation);
  const m = glyphMetrics(size);
  const label = accessibilityLabel ?? (g ? g.spoken : notation);

  const tile = [
    styles.tile,
    { width: size, height: size, borderRadius: size >= 44 ? 8 : 6 },
    state === 'current' && styles.tileCurrent,
    state === 'past' && styles.tilePast,
    covered && styles.tileCovered,
  ];

  // Practise mode covers what is coming, and a glyph is exactly as much of a
  // giveaway as the letters were.
  if (covered || !g) {
    return (
      <View style={tile} accessible accessibilityLabel={covered ? 'A covered move' : label}>
        <Text
          style={[styles.fallback, { fontSize: Math.round(size * 0.42) }]}
          maxFontSizeMultiplier={1.2}
        >
          {covered ? '' : notation}
        </Text>
      </View>
    );
  }

  // White, always. The arrow sits ON the lit slice, and cyan on cyan reads as
  // texture rather than as an instruction - `palette.ts` records accent-on-soft
  // at 3.95:1, which fails AA on its own. Two colours, two facts: the slice is
  // WHICH layer, the arrow is WHICH WAY.
  const ink = text.primary;
  const lit = new Set(g.cells.map((c) => `${c.row},${c.col}`));
  const shrink = g.whole ? 0.68 : 1;

  const body = (
    <View style={tile} accessible={!showLetter} accessibilityLabel={showLetter ? undefined : label}>
      <View style={{ width: m.field, height: m.field, alignItems: 'center', justifyContent: 'center' }}>
        {m.detail === 'cells' ? (
          <View style={{ width: m.grid * shrink, height: m.grid * shrink }}>
            {[0, 1, 2].map((row) => (
              <View key={row} style={{ flexDirection: 'row', flex: 1, marginBottom: row < 2 ? m.gap * shrink : 0 }}>
                {[0, 1, 2].map((col) => {
                  const on = lit.has(`${row},${col}`);
                  return (
                    <View
                      key={col}
                      style={[
                        styles.cell,
                        {
                          flex: 1,
                          marginRight: col < 2 ? m.gap * shrink : 0,
                          borderRadius: size >= 66 ? 3 : 2,
                        },
                        on && !g.hollow && styles.cellOn,
                        on && g.hollow && styles.cellHollow,
                      ]}
                    />
                  );
                })}
              </View>
            ))}
          </View>
        ) : (
          <Bars metrics={m} glyph={g} />
        )}
        <Arrow metrics={m} glyph={g} ink={ink} />
      </View>
    </View>
  );

  if (!showLetter) return body;
  return (
    <View accessible accessibilityLabel={label} style={{ alignItems: 'center' }}>
      {body}
      <Text style={styles.caption} maxFontSizeMultiplier={1.3}>
        {notation}
      </Text>
    </View>
  );
}

/** Below 44pt nine outlined cells are mud, so the grid becomes a frame and bars. */
function Bars({ metrics: m, glyph: g }: { metrics: ReturnType<typeof glyphMetrics>; glyph: Glyph }) {
  // A bar per row and per column of the grid that is lit ALL THE WAY ACROSS.
  // Reading it off the cells rather than off the move keeps the two forms of
  // the glyph saying the same thing - and it is the only way the middle slice's
  // plus comes out as a plus.
  const lit = new Set(g.cells.map((c) => `${c.row},${c.col}`));
  const fullRow = (r: number) => [0, 1, 2].every((c) => lit.has(`${r},${c}`));
  const fullCol = (c: number) => [0, 1, 2].every((r) => lit.has(`${r},${c}`));
  const rows = [0, 1, 2].filter(fullRow);
  const cols = [0, 1, 2].filter(fullCol);
  const whole = rows.length === 3 && cols.length === 3;
  const third = m.field / 3;
  const bars: { left: number; top: number; width: number; height: number }[] = [];
  if (whole) {
    bars.push({ left: 0, top: 0, width: m.field, height: m.field });
  } else {
    for (const r of rows) bars.push({ left: 0, top: r * third, width: m.field, height: third });
    for (const c of cols) bars.push({ left: c * third, top: 0, width: third, height: m.field });
  }
  const size = g.whole ? m.field * 0.68 : m.field;
  const inset = (m.field - size) / 2;
  return (
    <View
      style={[
        styles.frame,
        { position: 'absolute', left: inset, top: inset, width: size, height: size },
      ]}
    >
      {!g.whole &&
        bars.map((b, i) => (
          <View
            key={i}
            style={[styles.bar, g.hollow && styles.barHollow, { position: 'absolute', ...b }]}
          />
        ))}
    </View>
  );
}

/** The arrow: one or two shafts and a head, or an arc with a head on its end. */
function Arrow({
  metrics: m,
  glyph: g,
  ink,
}: {
  metrics: ReturnType<typeof glyphMetrics>;
  glyph: Glyph;
  ink: string;
}) {
  const G = m.field;
  const c = G / 2;
  if (g.shape === 'curve') {
    // A ring with one transparent border side leaves a 90 degree gap centred on
    // nine o'clock, mitred at 45. It is the standard react-native spinner and
    // it is pixel-identical on iOS, Android and the web target.
    const d = g.whole ? G : G - m.stroke;
    const r = (d - m.stroke) / 2;
    const k = 0.7071 * r;
    const cw = g.arrow === 'cw';
    const heads = g.half ? [true, false] : [cw];
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View
          style={{
            position: 'absolute',
            left: c - d / 2,
            top: c - d / 2,
            width: d,
            height: d,
            borderRadius: d / 2,
            borderWidth: m.stroke,
            borderStyle: 'solid',
            borderTopColor: ink,
            borderRightColor: ink,
            borderBottomColor: ink,
            borderLeftColor: 'transparent',
          }}
        />
        {g.wide && (
          <View
            style={{
              position: 'absolute',
              left: c - (d / 2 - m.stroke - 2),
              top: c - (d / 2 - m.stroke - 2),
              width: d - 2 * (m.stroke + 2),
              height: d - 2 * (m.stroke + 2),
              borderRadius: d / 2,
              borderWidth: m.stroke,
              borderStyle: 'solid',
              borderTopColor: ink,
              borderRightColor: ink,
              borderBottomColor: ink,
              borderLeftColor: 'transparent',
            }}
          />
        )}
        {heads.map((clockwise, i) => (
          <Head
            key={i}
            half={m.headHalf}
            len={m.headLen}
            color={ink}
            point={clockwise ? 315 : 225}
            left={c - k}
            top={clockwise ? c + k : c - k}
          />
        ))}
      </View>
    );
  }

  // A straight arrow, placed in screen space. Rotating one horizontal shaft
  // would be tidier to write and it is what the first version did - and a
  // 270-degree rotation turns a horizontal bar VERTICAL, so every `U` came out
  // as a cross. The four directions are two cases, written out.
  const vertical = g.arrow === 'up' || g.arrow === 'down';
  const step = m.detail === 'cells' ? m.cell + m.gap : G / 3;
  // Which lanes of the grid the arrow runs along: rows for a horizontal arrow,
  // columns for a vertical one. A whole-cube rotation has no lit cells, so its
  // arrow runs outside the shrunken grid.
  const lanes = g.cells.length
    ? [...new Set(g.cells.map((x) => (vertical ? x.col : x.row)))].sort((a, b) => a - b)
    : [g.arrow === 'up' || g.arrow === 'right' ? 2.15 : -0.15];
  const offsets = lanes.map((lane) => (lane - 1) * step);
  const mid = (offsets[0] + offsets[offsets.length - 1]) / 2;
  const span = Math.abs(offsets[offsets.length - 1] - offsets[0]);
  const headLen = m.headLen;
  const len = Math.max(6, G - (g.half ? 2 * headLen : headLen) - 2);
  const half = m.headHalf + Math.round(span / 2);
  const ends: { at: number; point: number }[] = g.half
    ? vertical
      ? [{ at: -1, point: 0 }, { at: 1, point: 180 }]
      : [{ at: -1, point: 270 }, { at: 1, point: 90 }]
    : vertical
      ? [{ at: g.arrow === 'up' ? -1 : 1, point: g.arrow === 'up' ? 0 : 180 }]
      : [{ at: g.arrow === 'left' ? -1 : 1, point: g.arrow === 'left' ? 270 : 90 }];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {offsets.map((off, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: vertical ? c - m.stroke / 2 + off : c - len / 2,
            top: vertical ? c - len / 2 : c - m.stroke / 2 + off,
            width: vertical ? m.stroke : len,
            height: vertical ? len : m.stroke,
            borderRadius: m.stroke / 2,
            backgroundColor: ink,
          }}
        />
      ))}
      {ends.map((e, i) => (
        <Head
          key={i}
          half={half}
          len={headLen}
          color={ink}
          point={e.point}
          left={vertical ? c + mid : c + e.at * (len / 2 + headLen / 2)}
          top={vertical ? c + e.at * (len / 2 + headLen / 2) : c + mid}
        />
      ))}
    </View>
  );
}

const { surface, line, text, accent, space, radius, hit } = tokens;

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: line.outline,
    backgroundColor: surface.raised,
  },
  // Past, current and future differ by more than colour: fill and border too.
  tileCurrent: { borderWidth: 2, borderColor: accent.base, backgroundColor: accent.soft },
  tilePast: { opacity: 0.5 },
  tileCovered: { backgroundColor: 'transparent', borderStyle: 'dashed' },
  cell: { borderWidth: 1, borderColor: line.hairline, backgroundColor: 'transparent' },
  cellOn: { backgroundColor: accent.soft, borderColor: accent.base },
  cellHollow: { backgroundColor: 'transparent', borderColor: accent.base, borderWidth: 1 },
  frame: { borderWidth: 1, borderColor: line.hairline, borderRadius: 2, overflow: 'hidden' },
  bar: { backgroundColor: accent.soft, borderWidth: 1, borderColor: accent.base, borderRadius: 2 },
  barHollow: { backgroundColor: 'transparent' },
  fallback: { ...tokens.type.monoChip, color: text.secondary },
  caption: { ...tokens.type.overline, color: text.tertiary, marginTop: 3 },
});
