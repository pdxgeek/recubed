import React, { useEffect, useMemo, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Move } from '../cube/core';
import { chunkByTriggers } from '../cube/algorithms';
import { tokens } from '../ui/theme';

interface Props {
  title: string;
  moves: Move[];
  step: number;
}

/** "R'" reads as "R apostrophe" otherwise. */
function spoken(notation: string): string {
  const base = notation[0];
  if (notation.endsWith("'")) return `${base} prime`;
  if (notation.endsWith('2')) return `${base} twice`;
  return base;
}

/** The move sequence, shown under the cube rather than in its own bar. */
export function MoveStrip({ title, moves, step }: Props) {
  const scroller = useRef<ScrollView>(null);
  const chipX = useRef<number[]>([]);

  useEffect(() => {
    const x = chipX.current[Math.min(step, moves.length - 1)] ?? 0;
    scroller.current?.scrollTo({ x: Math.max(0, x - 110), animated: true });
  }, [step, title, moves.length]);

  // Cubers learn algorithms as triggers, never as letters. Chunking turns a
  // twenty-five move step into four things to remember.
  const chunks = useMemo(
    () => chunkByTriggers(moves.map((m) => m.notation)),
    [moves]
  );

  // Only give the labels a row when there is something to put in it.
  const labelled = chunks.some((c) => c.label);
  const done = Math.min(step, moves.length);
  const label =
    `${title}. Move ${Math.min(step + 1, moves.length)} of ${moves.length}: ` +
    `${spoken(moves[Math.min(step, moves.length - 1)]?.notation ?? '')}`;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.headerRow} pointerEvents="none">
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.progress}>
          {done}/{moves.length}
        </Text>
      </View>
      <View style={styles.track} pointerEvents="none">
        <View style={[styles.fill, { width: `${(done / Math.max(1, moves.length)) * 100}%` }]} />
      </View>
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        accessible
        accessibilityLabel={label}
        accessibilityLiveRegion="polite"
      >
        {chunks.map((chunk) => (
          <View key={chunk.start} style={styles.chunk}>
            {labelled && (
              <Text style={styles.chunkLabel} numberOfLines={1}>
                {chunk.label ? `${chunk.label}${chunk.repeat > 1 ? ` ×${chunk.repeat}` : ''}` : ' '}
              </Text>
            )}
            <View style={[styles.chunkRow, chunk.label ? styles.chunkRowNamed : null]}>
              {moves.slice(chunk.start, chunk.start + chunk.length).map((m, k) => {
                const i = chunk.start + k;
                const past = i < step;
                const current = i === step;
                return (
                  <View
                    key={`${m.notation}-${i}`}
                    onLayout={(e) => {
                      chipX.current[i] = e.nativeEvent.layout.x;
                    }}
                    style={[styles.chip, past && styles.chipPast, current && styles.chipCurrent]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        past && styles.chipTextPast,
                        current && styles.chipTextCurrent,
                      ]}
                      maxFontSizeMultiplier={1.3}
                    >
                      {m.notation}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const { surface, line, text, accent, space, type, radius } = tokens;

const styles = StyleSheet.create({
  // A heads-up display over the cube, so it needs its own ground to read on.
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: space.xs,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    backgroundColor: surface.scrim,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.gutter,
  },
  title: { ...type.caption, fontWeight: '600', color: text.secondary, flex: 1 },
  progress: { ...type.caption, ...tokens.numeric, color: text.secondary },
  track: {
    height: 3,
    marginHorizontal: space.gutter,
    borderRadius: 2,
    backgroundColor: line.hairline,
    overflow: 'hidden',
  },
  fill: { height: 3, backgroundColor: accent.base },
  chips: { gap: space.sm, paddingHorizontal: space.gutter, paddingVertical: 2 },
  chunk: { gap: 2 },
  chunkLabel: { ...type.overline, color: text.tertiary, textAlign: 'center' },
  chunkRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 3, borderRadius: radius.sm },
  chunkRowNamed: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: line.hairline,
    paddingVertical: 3,
  },
  chip: {
    minWidth: 40,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    backgroundColor: surface.raised,
    borderWidth: 1,
    borderColor: line.outline,
    alignItems: 'center',
  },
  // Past, current and future differ by more than colour: opacity and weight too.
  chipPast: { backgroundColor: accent.soft, borderColor: line.outline, opacity: 0.55 },
  chipCurrent: {
    backgroundColor: accent.base,
    borderColor: accent.base,
    borderWidth: 2,
    transform: [{ scale: 1.06 }],
  },
  chipText: { ...type.monoChip, color: text.secondary },
  chipTextPast: { color: text.primary },
  chipTextCurrent: { color: accent.ink },
});
