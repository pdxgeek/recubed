import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PlanStep, noteForStep, piecesToWatch, stepFootnote } from '../cube/solver/plan';
import { Notation } from './Notation';
import { maskMoveRuns } from '../ui/notation';
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
  /**
   * True while the moves of this step are covered in the strip.
   *
   * Round 4 closed two ways of spoiling a practise run - Play and Next move -
   * and opened a third in the same commit: `?` went onto every row including
   * the running one, and this sheet's first child is the step's entire move
   * sequence, chunked and labelled. One tap printed all 25 moves while the
   * strip below still showed 25 `?` chips. The explanation, the watch list and
   * the piece count all still work without it, so only the notation goes.
   */
  practising?: boolean;
  wireframe: boolean;
  onWireframe: (v: boolean) => void;
  onWatch: () => void;
  onClose: () => void;
}

export function WhySheet({
  step,
  practising = false,
  wireframe,
  onWireframe,
  onWatch,
  onClose,
}: Props) {
  // Practising covers the moves; the prose quotes them. "Then repeat B U B' U'
  // until it drops in" is the whole answer to a step that is those four moves
  // five times over, so a run of turns is masked while a single one - which
  // explains a mechanism and answers nothing - is left alone.
  const veil = (t: string) => (practising ? maskMoveRuns(t) : t);
  const note = useMemo(() => noteForStep(step), [step]);
  const watching = useMemo(() => piecesToWatch(step), [step]);
  // Counted from the step's own moves against the step's own cube, in
  // `plan.ts`, and only read here. The sentence this replaces was the
  // algorithm's count on a solved cube, printed under a step whose notation was
  // something else: right on 112 of 369 sampled steps, and directly
  // contradicted by the "no edge moves at all" line three paragraphs above it.
  const footnote = useMemo(() => stepFootnote(step), [step]);

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
        {practising ? (
          <Text style={styles.covered}>
            The moves stay covered while you are practising. Close this and tap Reveal when you
            want the next one.
          </Text>
        ) : (
          // A stable handle, like the strip's `move-current` and the row's
          // `step-tag`: "is the answer on screen" is then measurable rather
          // than inferred from a text dump.
          <View nativeID="why-notation">
            <Notation moves={step.moves} variant="blocks" rawBelow={4} />
            {/* The strip draws these as diagrams. This is where the standard
                letters live, so a learner who wants to carry the algorithm to
                the wider cubing world can, and it is the one place the diagram's
                convention is stated. */}
            <Text style={styles.legend}>
              In the strip each of these is a diagram: the shaded band is the layer that turns,
              the arrow is which way, and a curved arrow is the face you are looking at.
            </Text>
          </View>
        )}

        <Text style={styles.overline}>What it does</Text>
        {note && <Text style={styles.para}>{veil(note)}</Text>}
        <Text style={styles.para}>{veil(step.detail)}</Text>

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

        {footnote.map((line, i) => (
          <Text key={line} style={[styles.footnote, i > 0 && styles.footnoteNext]}>
            {line}
          </Text>
        ))}
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
  legend: { ...type.caption, color: text.tertiary, marginTop: space.xs },
  scroll: { flexShrink: 1 },
  // Capped, and centred in whatever it is given. On a 1024pt tablet the sheet
  // is full-bleed across both the cube and the side panel, so every paragraph
  // set at 992pt - about 145 characters against the 45-75 that reads - on the
  // one surface in the app where a long line costs comprehension directly.
  body: {
    padding: space.gutter,
    paddingBottom: space.sm,
    gap: 6,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
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
  covered: { ...type.caption, color: text.tertiary, fontStyle: 'italic' },
  watchRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  watchDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4, backgroundColor: cube.moving },
  watchText: { ...type.caption, color: text.secondary, flex: 1 },
  footnote: { ...type.caption, color: text.tertiary, marginTop: space.sm },
  footnoteNext: { marginTop: 0 },
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
