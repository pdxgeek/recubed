import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Move } from '../cube/core';
import { chunkByTriggers } from '../cube/algorithms';
import { Recall } from '../learn/session';
import { stripHeading } from '../ui/notation';
import { tokens } from '../ui/theme';

interface Props {
  title: string;
  moves: Move[];
  step: number;
  /**
   * Opens the teaching page for this step.
   *
   * The heading is the doorway: "in the solving part, we just show the name,
   * and if they click the name we can open the teaching page". Solving says
   * where you are; teaching happens when it is asked for.
   */
  onExplain: () => void;
  /**
   * The strip's own measured height.
   *
   * The shell used to reserve a constant 108pt for it - a browser measurement
   * of a strip that is 117 in the same browser and unknown on a device, which
   * is nine points of cube drawn under an opaque scrim. It reports what it
   * actually is instead.
   */
  onHeight?: (h: number) => void;
  /** Practise mode: the moves ahead are covered and revealed one at a time. */
  practising: boolean;
  onPractise: (v: boolean) => void;
  onReveal: () => void;
  /** Restarts the step so it can be practised again. */
  onAgain: () => void;
  /**
   * True once a move has been revealed and the learner has not yet said whether
   * they knew it. Uncovering a move on its own tests nothing - the app never
   * asked for an answer, so it could not tell recall from watching.
   */
  awaitingReport: boolean;
  onReport: (outcome: Recall) => void;
  /** "Done in 13 moves · 11 knew, 2 missed" - their own verdicts, not a guess. */
  summary: string;
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
  onExplain,
  onHeight,
  practising,
  onPractise,
  onReveal,
  onAgain,
  awaitingReport,
  onReport,
  summary,
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

  const done = Math.min(step, moves.length);
  /**
   * The name of the trigger the playhead is inside, or the step's own title
   * when this stretch of moves is not a named one. `src/ui/notation.ts` decides
   * it, so `verify-notation.ts` can check that it tracks the playhead.
   */
  const heading = stripHeading(
    moves.map((m) => m.notation),
    step,
    title
  );
  const label =
    `${title}. Move ${Math.min(step + 1, moves.length)} of ${moves.length}: ` +
    `${spoken(moves[Math.min(step, moves.length - 1)]?.notation ?? '')}`;

  return (
    <View
      style={styles.wrap}
      pointerEvents="box-none"
      onLayout={(e) => onHeight?.(e.nativeEvent.layout.height)}
    >
      <View style={styles.headerRow}>
        {/* The one place the algorithm is named during playback, so it carries
            the weight the step card's title used to. It changes as the playhead
            crosses into the next trigger, which is the teaching moment: these
            four moves, the ones happening now, are the thing called Reverse
            sexy. */}
        <Pressable
          onPress={onExplain}
          style={styles.headingButton}
          accessibilityRole="button"
          accessibilityLabel={`Why ${heading} works`}
          accessibilityHint="Opens the explanation"
        >
          <Text
            nativeID="strip-heading"
            style={styles.heading}
            numberOfLines={1}
            accessibilityLiveRegion="polite"
          >
            {heading}
          </Text>
          <Text style={styles.headingChevron}>›</Text>
        </Pressable>
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
      </View>
      <View style={styles.track} pointerEvents="none">
        <View style={[styles.fill, { width: `${(done / Math.max(1, moves.length)) * 100}%` }]} />
      </View>
      <ScrollView
        ref={scroller}
        // A stable handle on the strip itself, so a test can read the moves it
        // is showing without guessing at the DOM around it.
        nativeID="move-strip"
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
      {practising && awaitingReport && (
        <View
          style={styles.reportRow}
          accessibilityRole="radiogroup"
          accessibilityLabel="Did you know that move?"
        >
          <Pressable
            onPress={() => onReport('knew')}
            style={[styles.report, styles.reportKnew]}
            accessibilityRole="button"
            accessibilityLabel="I knew that move"
          >
            <Text style={styles.reportText}>✓ Knew it</Text>
          </Pressable>
          <Pressable
            onPress={() => onReport('missed')}
            style={[styles.report, styles.reportMissed]}
            accessibilityRole="button"
            accessibilityLabel="I missed that move"
          >
            <Text style={styles.reportText}>✗ Missed it</Text>
          </Pressable>
        </View>
      )}
      {practising && !awaitingReport && step < moves.length && (
        <Pressable
          onPress={onReveal}
          style={styles.reveal}
          accessibilityRole="button"
          accessibilityLabel={`Reveal move ${step + 1} of ${moves.length}`}
          accessibilityHint="Recall it first, then say whether you had it"
        >
          <Text style={styles.revealText}>Reveal the next move</Text>
        </Pressable>
      )}
      {/* "Again?" was a question with no affordance: the only way back was the
          transport's Restart, three controls away and named something else. */}
      {practising && !awaitingReport && step >= moves.length && (
        <View style={styles.doneRow}>
          <Text style={styles.done} accessibilityLiveRegion="polite">
            {summary}
          </Text>
          <Pressable
            onPress={onAgain}
            style={styles.again}
            accessibilityRole="button"
            accessibilityLabel={`Practise these ${moves.length} moves again`}
          >
            <Text style={styles.againText}>Again</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const { surface, line, text, accent, status, space, type, radius, hit } = tokens;

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
  // The card's title weight, moved here: this is now the only place the
  // algorithm is named while the moves play, and the only doorway from solving
  // into teaching. A 44pt target with a chevron, so it reads as a way through
  // rather than as a caption.
  headingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    minHeight: hit.min,
    paddingRight: space.sm,
  },
  heading: { ...type.heading, fontWeight: '700', color: text.primary, flexShrink: 1 },
  headingChevron: { ...type.heading, color: accent.base },
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
  // Side by side and full width: one tap, no typing, no second screen. The
  // answer has to be as cheap as the reveal or nobody gives one.
  reportRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginHorizontal: space.gutter,
    marginTop: space.xs,
  },
  report: {
    flex: 1,
    minHeight: hit.min,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 2,
  },
  reportKnew: { borderColor: status.ok, backgroundColor: status.okSoft },
  reportMissed: { borderColor: status.warn, backgroundColor: status.warnSoft },
  reportText: { ...type.caption, fontWeight: '700', color: text.primary },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.gutter,
    marginTop: space.xs,
  },
  done: { ...type.caption, color: text.primary, flex: 1 },
  again: {
    minHeight: hit.min,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: accent.base,
    backgroundColor: accent.soft,
  },
  againText: { ...type.caption, fontWeight: '700', color: text.primary },
});
