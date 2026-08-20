import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Move } from '../cube/core';
import { chunkByTriggers } from '../cube/algorithms';
import { tokens } from '../ui/theme';

interface Props {
  title: string;
  moves: Move[];
  step: number;
  /** The scoped X-ray control: it lives here because it acts on the canvas. */
  wireframe: boolean;
  onWireframe: (v: boolean) => void;
  /** Practise mode: the moves ahead are covered and revealed one at a time. */
  practising: boolean;
  onPractise: (v: boolean) => void;
  onReveal: () => void;
}

/** "R'" reads as "R apostrophe" otherwise. */
function spoken(notation: string): string {
  const base = notation[0];
  if (notation.endsWith("'")) return `${base} prime`;
  if (notation.endsWith('2')) return `${base} twice`;
  return base;
}

/** The move sequence, shown under the cube rather than in its own bar. */
export function MoveStrip({
  title,
  moves,
  step,
  wireframe,
  onWireframe,
  practising,
  onPractise,
  onReveal,
}: Props) {
  const scroller = useRef<ScrollView>(null);
  /**
   * Where each chunk starts inside the scroll content, and where each chip
   * starts inside its chunk. `onLayout` reports an offset relative to the
   * parent view, so once the chips were nested inside chunk rows the raw chip
   * `x` stopped being a content offset - it became 0-110px for every move in
   * the sequence, and the strip stopped following the playhead. The two are
   * added back together here.
   */
  const chunkX = useRef<number[]>([]);
  const chipX = useRef<number[]>([]);
  const viewport = useRef(0);

  // Cubers learn algorithms as triggers, never as letters. Chunking turns a
  // twenty-five move step into four things to remember.
  const chunks = useMemo(() => chunkByTriggers(moves.map((m) => m.notation)), [moves]);
  const chunkOfMove = useMemo(() => {
    const out: number[] = [];
    chunks.forEach((c, ci) => {
      for (let i = 0; i < c.length; i++) out[c.start + i] = ci;
    });
    return out;
  }, [chunks]);

  const scrollToStep = useCallback(
    (i: number) => {
      const ci = chunkOfMove[Math.min(i, moves.length - 1)];
      if (ci === undefined) return;
      const x = (chunkX.current[ci] ?? 0) + (chipX.current[Math.min(i, moves.length - 1)] ?? 0);
      // Keep the playhead a third of the way in, so what comes next is visible.
      const lead = Math.max(60, viewport.current / 3);
      scroller.current?.scrollTo({ x: Math.max(0, x - lead), animated: true });
    },
    [chunkOfMove, moves.length]
  );

  useEffect(() => {
    scrollToStep(step);
  }, [step, title, scrollToStep]);

  const onViewport = useCallback((e: LayoutChangeEvent) => {
    viewport.current = e.nativeEvent.layout.width;
  }, []);

  // Only give the labels a row when there is something to put in it.
  const labelled = chunks.some((c) => c.label);
  const done = Math.min(step, moves.length);
  const label =
    `${title}. Move ${Math.min(step + 1, moves.length)} of ${moves.length}: ` +
    `${spoken(moves[Math.min(step, moves.length - 1)]?.notation ?? '')}`;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.headerRow}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {/* Scoped X-ray. In the panel it cost a row of the step list; here it is
            over the canvas it acts on and costs no panel height at all. */}
        <Pressable
          onPress={() => onPractise(!practising)}
          style={[styles.only, practising && styles.onlyOn]}
          accessibilityRole="switch"
          accessibilityState={{ checked: practising }}
          aria-checked={practising}
          accessibilityLabel="Practise mode: hide the moves ahead"
        >
          <Text style={[styles.onlyText, practising && styles.onlyTextOn]}>practise</Text>
        </Pressable>
        <Pressable
          onPress={() => onWireframe(!wireframe)}
          style={[styles.only, wireframe && styles.onlyOn]}
          accessibilityRole="switch"
          accessibilityState={{ checked: wireframe }}
          aria-checked={wireframe}
          accessibilityLabel="Show only the pieces this step moves"
        >
          <View style={[styles.onlyDot, wireframe && styles.onlyDotOn]} />
          <Text style={[styles.onlyText, wireframe && styles.onlyTextOn]}>only these</Text>
        </Pressable>
      </View>
      <View style={styles.track} pointerEvents="none">
        <View style={[styles.fill, { width: `${(done / Math.max(1, moves.length)) * 100}%` }]} />
      </View>
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        onLayout={onViewport}
        accessible
        accessibilityLabel={label}
        accessibilityLiveRegion="polite"
      >
        {chunks.map((chunk, ci) => (
          <View
            key={chunk.start}
            style={styles.chunk}
            onLayout={(e) => {
              chunkX.current[ci] = e.nativeEvent.layout.x;
            }}
          >
            {labelled &&
              (chunk.label ? (
                <Text style={styles.chunkLabel} numberOfLines={1}>
                  {chunk.label}
                  {chunk.repeat > 1 ? ` ×${chunk.repeat}` : ''}
                </Text>
              ) : (
                // A space-only Text collapses, leaving the chunk 14pt taller
                // than its neighbours. A spacer does not.
                <View style={styles.chunkLabelSpacer} />
              ))}
            <View style={[styles.chunkRow, chunk.label ? styles.chunkRowNamed : null]}>
              {moves.slice(chunk.start, chunk.start + chunk.length).map((m, k) => {
                const i = chunk.start + k;
                const past = i < step;
                const current = i === step;
                // In practise mode the moves you have not reached yet are
                // covered: the point is to recall `R U R' U'` from its name.
                const hidden = practising && i >= step;
                return (
                  <View
                    key={`${m.notation}-${i}`}
                    // A stable handle on the playhead, so "is the current move
                    // still on screen" is measurable rather than inferred.
                    nativeID={current ? 'move-current' : undefined}
                    onLayout={(e) => {
                      chipX.current[i] = e.nativeEvent.layout.x;
                    }}
                    style={[
                      styles.chip,
                      past && styles.chipPast,
                      current && !hidden && styles.chipCurrent,
                      hidden && styles.chipHidden,
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        past && styles.chipTextPast,
                        current && !hidden && styles.chipTextCurrent,
                        hidden && styles.chipTextHidden,
                      ]}
                      maxFontSizeMultiplier={1.3}
                    >
                      {hidden ? '?' : m.notation}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
      {/* The footer is over the canvas, so practise mode costs the panel no
          height at all - the same trick as the stage rail and "only these". */}
      {practising && step < moves.length && (
        <Pressable
          onPress={onReveal}
          style={styles.reveal}
          accessibilityRole="button"
          accessibilityLabel={`Reveal move ${step + 1} of ${moves.length}`}
        >
          <Text style={styles.revealText}>Reveal the next move</Text>
        </Pressable>
      )}
      {practising && step >= moves.length && (
        <Text style={styles.done}>Done in {moves.length} moves. Again?</Text>
      )}
    </View>
  );
}

const { surface, line, text, accent, space, type, radius, hit } = tokens;

const styles = StyleSheet.create({
  // A heads-up display over the cube, so it needs its own ground to read on.
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: space.xs,
    paddingTop: space.xs,
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
  only: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: hit.min,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: line.outline,
  },
  onlyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: line.outline,
    backgroundColor: 'transparent',
  },
  onlyDotOn: { backgroundColor: accent.base, borderColor: accent.base },
  onlyOn: { borderColor: accent.base, borderWidth: 2 },
  onlyText: { ...type.overline, color: text.secondary },
  onlyTextOn: { color: text.primary },
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
  // Left-aligned: a "Sexy move ×5" chunk is 900pt wide on a tablet, and a
  // centred label floats half a screen away from the chunk it names.
  chunkLabel: { ...type.overline, color: text.tertiary, textAlign: 'left', paddingLeft: 3 },
  chunkLabelSpacer: { height: type.overline.lineHeight },
  chunkRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 3, borderRadius: radius.sm },
  // The bracket is the only thing that groups a named chunk, which makes it a
  // control boundary rather than a divider: it needs the 3:1 token, not the
  // decorative one.
  chunkRowNamed: {
    borderWidth: 1,
    borderColor: line.outline,
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
  chipHidden: {
    backgroundColor: 'transparent',
    borderStyle: 'dashed',
    borderColor: line.outline,
  },
  chipTextHidden: { color: text.tertiary },
  chipText: { ...type.monoChip, color: text.secondary },
  chipTextPast: { color: text.primary },
  chipTextCurrent: { color: accent.ink },
  reveal: {
    marginHorizontal: space.gutter,
    marginTop: space.xs,
    minHeight: hit.min,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: accent.base,
    backgroundColor: accent.soft,
  },
  revealText: { ...type.caption, fontWeight: '700', color: text.primary },
  done: {
    ...type.caption,
    color: text.primary,
    textAlign: 'center',
    paddingTop: space.xs,
  },
});
