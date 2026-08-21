/**
 * The move sequence as a wrapping grid of glyph tiles, with a playhead.
 *
 * "I like these symbols better than the letters." This is that: uniform square
 * tiles, one per move, evenly spaced, read left to right, in the shape a
 * printed tutorial uses. Every number it lays out with comes from
 * `src/ui/teaching.ts`, so `scripts/verify-teaching.ts` checks the wrap rather
 * than a screenshot of it.
 *
 * Three things this deliberately does NOT do:
 *
 *  - **It does not collapse repeats.** `src/ui/notation.ts` has a good rule
 *    that a repeated trigger prints one period and a count, because repeating
 *    four letters five times in prose says the same thing twice. A filmstrip
 *    is not prose - it is a strip of film, and a film that omits its repeated
 *    frames cannot carry a playhead. The label lane already says `×5`, so the
 *    reader is told it is a repeat *and* can watch each pass.
 *  - **It does not print letters.** Not on the tile, not under it. The letters
 *    appear once, at the bottom of the page, which is the whole point of the
 *    separation. They are in every tile's `accessibilityLabel`, which is where
 *    a reader who needs them actually gets them.
 *  - **It does not scroll horizontally.** A horizontal strip is what the solve
 *    screen has, and there it is right: it is a heads-up display beside a
 *    playing cube. Here the whole sequence has to be visible at once, because
 *    the page's job is "what is this thing", and you cannot see the shape of an
 *    algorithm through a four-move window.
 */
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Move } from '../cube/core';
import { MoveGlyphStub } from './MoveGlyphStub';
import {
  FILM_GAP,
  FILM_LABEL_H,
  FILM_ROW_GAP,
  FilmLayout,
  LaneChunk,
  MoveGlyphProps,
  filmLayout,
  filmRows,
  glyphLabel,
  glyphStateAt,
  laneSegments,
  opensChunk,
} from '../ui/teaching';
import { tokens } from '../ui/theme';

export interface FilmstripProps {
  moves: Move[];
  /** Moves already performed. `moves.length` means the run is finished. */
  index: number;
  /** Tapping tile i asks for the cube to be put where it is about to play i. */
  onScrub: (i: number) => void;
  /**
   * The sequence read as triggers, for the label lane.
   * `laneChunks(case.triggers)` - `src/cube/cases.ts` has already done this.
   */
  chunks?: LaneChunk[];
  /** Content width, gutters already removed. */
  contentWidth: number;
  /**
   * Practise mode: tiles at or past this index are covered and not tappable.
   * `null` when nothing is hidden, which is every case but a practised step.
   */
  hiddenFrom?: number | null;
  /** No scale transform on the current tile. The border and rule carry it. */
  reduceMotion?: boolean;
  /** SWAP: pass the real `MoveGlyph` here at merge. See `MoveGlyphStub.tsx`. */
  MoveGlyph?: React.ComponentType<MoveGlyphProps>;
}

const { surface, line, text, accent, space, radius, type } = tokens;

export function Filmstrip({
  moves,
  index,
  onScrub,
  chunks = [],
  contentWidth,
  hiddenFrom = null,
  reduceMotion = false,
  MoveGlyph = MoveGlyphStub,
}: FilmstripProps) {
  const layout: FilmLayout = useMemo(() => filmLayout(contentWidth), [contentWidth]);
  const rows = useMemo(() => filmRows(layout, moves.length), [layout, moves.length]);
  const notation = useMemo(() => moves.map((m) => m.notation), [moves]);

  return (
    <View
      style={styles.wrap}
      // The tiles are the list, in move order, and their DOM order is that
      // order - which is what a screen reader walks. `filmRows` exists partly
      // so this is true by construction rather than by flex-wrap's goodwill.
      accessibilityRole="list"
      accessibilityLabel={`The moves: ${moves.length} in total`}
      // OFF, deliberately. The playhead's changes are announced once, by the
      // cube's live region under the canvas. Twenty-one tiles competing to
      // announce the same event is not an accessible strip, it is a barrage.
      accessibilityLiveRegion="none"
    >
      {rows.map((row, ri) => {
        const segments = laneSegments(chunks, row, layout.tile);
        return (
          <View key={ri} style={{ marginBottom: ri === rows.length - 1 ? 0 : FILM_ROW_GAP }}>
            {/* The label lane. A chunk spanning two rows is named on both,
                unmodified: a reader scanning row three needs to know what they
                are looking at, and "(cont.)" is noise.

                Decorative to a screen reader: its content is already in the
                tile that opens each chunk, and walking it would read every
                trigger name twice. */}
            <View
              style={styles.lane}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {segments.map((seg, si) => (
                <View
                  key={`${seg.chunk}-${seg.from}`}
                  style={[styles.laneSeg, { width: seg.width, marginLeft: si === 0 ? 0 : FILM_GAP }]}
                >
                  {seg.label ? (
                    <>
                      <Text style={styles.laneText} numberOfLines={1}>
                        {seg.label}
                      </Text>
                      {/* The bracket: it says how far the name reaches. */}
                      <View style={styles.laneRule} />
                    </>
                  ) : null}
                </View>
              ))}
            </View>

            <View style={styles.row}>
              {row.map((i, k) => {
                const state = glyphStateAt(index, i, moves.length);
                const hidden = hiddenFrom !== null && i >= hiddenFrom;
                const style = [
                  styles.tile,
                  { width: layout.tile, height: layout.tile, marginLeft: k === 0 ? 0 : FILM_GAP },
                  state === 'past' && styles.tilePast,
                  state === 'current' && styles.tileCurrent,
                  state === 'current' && !reduceMotion && styles.tileCurrentLift,
                  hidden && styles.tileHidden,
                ];

                if (hidden) {
                  // A dashed EMPTY tile, not a "?". A question mark was found
                  // meaning two different things on one screen; an empty
                  // dashed box says "hidden" without competing for a reading.
                  return (
                    <View
                      key={i}
                      style={style}
                      accessible
                      accessibilityLabel={`Move ${i + 1}, not revealed yet`}
                    />
                  );
                }

                return (
                  <Pressable
                    key={i}
                    onPress={() => onScrub(i)}
                    // The tile IS the target and it is never under 44pt, so no
                    // hitSlop: slop cannot buy a target the pitch does not
                    // carry, and overlapping targets scrub the wrong move.
                    style={style}
                    accessibilityRole="button"
                    accessibilityState={{ selected: state === 'current' }}
                    // The trigger's name is prefixed on the tile that OPENS
                    // the chunk and on no other. Repeating "Sexy move ×2" on
                    // all eight tiles is what makes a list unlistenable.
                    accessibilityLabel={glyphLabel(
                      notation[i],
                      i,
                      moves.length,
                      opensChunk(chunks, i)
                    )}
                    accessibilityHint={state === 'current' ? 'Puts the cube here' : undefined}
                  >
                    <MoveGlyph
                      notation={notation[i]}
                      size={layout.tile}
                      state={state}
                      // The tile owns the announcement, so the glyph inside it
                      // does not announce itself a second time.
                      accessibilityLabel=""
                    />
                    {/* The fourth channel on a played tile, and the fifth on
                        the current one: a rule the other states do not have,
                        so no pair of states differs only in hue. */}
                    {state === 'past' && <View style={styles.pastRule} />}
                    {state === 'current' && <View style={styles.currentRule} />}
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'flex-start' },
  lane: { flexDirection: 'row', height: FILM_LABEL_H, alignItems: 'center' },
  laneSeg: { flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  laneText: { ...type.overline, color: text.tertiary, flexShrink: 1 },
  laneRule: { flex: 1, height: 1, backgroundColor: line.hairline, marginLeft: space.sm },
  // Left-aligned, never centred: the strip is read left to right, and a
  // centred remainder puts move 7 under move 2.
  row: { flexDirection: 'row', justifyContent: 'flex-start' },
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: surface.raised,
    borderWidth: 1,
    borderColor: line.outline,
    overflow: 'hidden',
  },
  // Three backgrounds at three luminances, three inks at three luminances, a
  // border weight that jumps on current, and a rule on each of current and
  // past that the other does not carry.
  tilePast: { backgroundColor: surface.sunken, borderColor: line.hairline },
  tileCurrent: { backgroundColor: accent.soft, borderColor: accent.base, borderWidth: 2 },
  tileCurrentLift: { transform: [{ scale: 1.06 }] },
  tileHidden: { backgroundColor: 'transparent', borderStyle: 'dashed', borderColor: line.outline },
  pastRule: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, backgroundColor: text.tertiary },
  currentRule: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: accent.base },
});
