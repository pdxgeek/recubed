import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PlanStep, algorithmForStep, piecesToWatch } from '../cube/solver/plan';
import { Notation } from './Notation';
import { tokens } from '../ui/theme';

/**
 * Why an algorithm works, over the panel rather than inside it.
 *
 * A step row that expands in place pushes the list it belongs to off the
 * screen - that is what killed the first attempt at this. A sheet costs the
 * list nothing: it slides over the panel, the list is exactly where it was when
 * it closes.
 *
 * Everything here is read off data the plan already carries, and every bit of
 * it is checked by `verify-plan.ts`: `algorithmForStep` joins the step to the
 * library by id (matching by name resolved 8 of 15 and left this sheet empty on
 * the rest), and `piecesToWatch` names the pieces by colour out of the step's
 * own `pieceKeys`. The list used to ask what was standing in the step's target
 * *slots*, which the step's own moves then changed - so the piece a step is
 * named after dropped off the list that told the learner to watch it.
 */

interface Props {
  step: PlanStep;
  wireframe: boolean;
  onWireframe: (v: boolean) => void;
  onWatch: () => void;
  onClose: () => void;
}

export function WhySheet({ step, wireframe, onWireframe, onWatch, onClose }: Props) {
  const alg = useMemo(() => algorithmForStep(step), [step]);
  const watching = useMemo(() => piecesToWatch(step), [step]);

  /**
   * Belt and braces for Dynamic Type: the sheet is sized to hold every variant
   * at every supported size, but a reader at 200% can still overrun it. A
   * scrollbar is not an answer - it is not drawn at rest on either platform,
   * which is how the explanatory footnote came to be cut with nothing to say so.
   * A chip that is visible at rest is.
   */
  const [content, setContent] = useState(0);
  const [viewport, setViewport] = useState(0);
  const scroller = React.useRef<ScrollView>(null);
  const overflows = content > viewport + 1;

  return (
    <View style={styles.sheet} accessibilityViewIsModal accessibilityRole="alert">
      <View style={styles.head}>
        <Pressable
          onPress={onClose}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="Back to the step list"
        >
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {step.algorithm ?? step.title}
        </Text>
      </View>

      <ScrollView
        ref={scroller}
        style={styles.scroll}
        contentContainerStyle={styles.body}
        onLayout={(e) => setViewport(e.nativeEvent.layout.height)}
        onContentSizeChange={(_w, h) => setContent(h)}
      >
        <Notation moves={step.moves} variant="blocks" rawBelow={4} />

        <Text style={styles.overline}>What it does</Text>
        {alg?.note && <Text style={styles.para}>{alg.note}</Text>}
        <Text style={styles.para}>{step.detail}</Text>

        {watching.length > 0 && (
          <>
            <Text style={styles.overline}>Watch these</Text>
            {/* One wrapped line, not one row per piece. A T perm moves six, and
                six 22pt rows were 132pt of the sheet - which is most of what
                pushed the footnote below the fold on an SE. */}
            <View style={styles.watchRow}>
              <View style={styles.watchDot} />
              <Text style={styles.watchText}>{watching.join('  ·  ')}</Text>
            </View>
          </>
        )}

        {alg && (
          <Text style={styles.footnote}>
            {alg.corners} corner{alg.corners === 1 ? '' : 's'} and {alg.edges} edge
            {alg.edges === 1 ? '' : 's'} move; the other{' '}
            {20 - alg.corners - alg.edges} pieces do not.
          </Text>
        )}
      </ScrollView>

      {overflows && (
        <Pressable
          onPress={() => scroller.current?.scrollToEnd({ animated: true })}
          style={styles.more}
          accessibilityHint="There is more below"

          accessibilityRole="button"
          accessibilityLabel="Scroll for more"
        >
          <Text style={styles.moreText}>⌄ more</Text>
        </Pressable>
      )}

      <View style={styles.actions}>
        <Pressable
          onPress={onWatch}
          style={styles.primary}
          accessibilityRole="button"
          accessibilityLabel="Watch it slowly"
        >
          <Text style={styles.primaryText}>Watch it slowly</Text>
        </Pressable>
        <Pressable
          onPress={() => onWireframe(!wireframe)}
          style={[styles.secondary, wireframe && styles.secondaryOn]}
          accessibilityRole="switch"
          accessibilityState={{ checked: wireframe }}
          aria-checked={wireframe}
          accessibilityLabel="Show only these pieces"
        >
          <Text style={styles.secondaryText}>Show only these</Text>
        </Pressable>
      </View>
    </View>
  );
}

const { surface, line, text, accent, cube, space, type, radius, elevation, hit } = tokens;

const styles = StyleSheet.create({
  // Sized to its content, capped at the body by the holder. A sheet with a
  // fixed height either cuts a long explanation off or covers the cube for a
  // short one - and the cube is what "Watch these" is pointing at.
  sheet: {
    flexShrink: 1,
    backgroundColor: surface.base,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    ...elevation.high,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.gutter,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: line.hairline,
  },
  back: { minHeight: hit.min, justifyContent: 'center', paddingRight: space.sm },
  backText: { ...type.heading, color: accent.base },
  title: { ...type.heading, color: text.primary, flex: 1, textAlign: 'right' },
  scroll: { flexShrink: 1 },
  body: { padding: space.gutter, paddingBottom: space.sm, gap: 6 },
  // Over the content, not above it: a chip that took 44pt of layout made the
  // overflow it warns about 44pt worse.
  more: {
    position: 'absolute',
    right: space.gutter,
    bottom: 60,
    minHeight: hit.min,
    minWidth: hit.min,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: accent.base,
    backgroundColor: surface.raised,
  },
  moreText: { ...type.overline, color: accent.base },
  overline: { ...type.overline, color: text.tertiary, marginTop: space.sm },
  para: { ...type.caption, color: text.secondary },
  watchRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  watchDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4, backgroundColor: cube.moving },
  watchText: { ...type.caption, color: text.secondary, flex: 1 },
  footnote: { ...type.caption, color: text.tertiary, marginTop: space.sm },
  actions: {
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.gutter,
    paddingBottom: space.md,
  },
  primary: {
    flex: 1,
    minHeight: hit.large,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: accent.base,
    backgroundColor: accent.soft,
  },
  primaryText: { ...type.heading, color: text.primary },
  secondary: {
    flex: 1,
    minHeight: hit.large,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: line.outline,
  },
  secondaryOn: { borderWidth: 2, borderColor: accent.base, backgroundColor: accent.soft },
  secondaryText: { ...type.caption, fontWeight: '600', color: text.secondary },
});
