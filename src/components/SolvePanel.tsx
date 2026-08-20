import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { COLOR_IDS, COLOR_NAME, ColorId } from '../cube/core';
import { PlanMethod, PlanStep, SolvePlan } from '../cube/solver/plan';
import { HighlightMode, PiecePair } from '../cube/pieces';
import { Notation } from './Notation';
import { tagFor } from '../ui/notation';
import { tokens } from '../ui/theme';

interface Props {
  plan: SolvePlan;
  shortest: PlanMethod | null;
  computing: boolean;
  onComputeShortest: () => void;
  activeStepId: string | null;
  /** True while a step is being played, when the panel gets out of the way. */
  running: boolean;
  /** True while the moves are covered, so the card must not give them away. */
  practising: boolean;
  onSelectStep: (step: PlanStep) => void;
  /** Opens the "why this works" sheet over the panel. */
  onExplain: (step: PlanStep) => void;
  /** `focus` is the colour the error blames, armed on the way back. */
  onGoPaint: (focus?: ColorId) => void;
  highlightMode: HighlightMode;
  onHighlightMode: (m: HighlightMode) => void;
  showPartner: boolean;
  onShowPartner: (v: boolean) => void;
  /** The piece the user has picked on the cube, if any. */
  selectedName: string | null;
  pair: PiecePair | null;
  /** The step that puts that piece where it belongs. */
  stepForSelection: PlanStep | null;
  onClearSelection: () => void;
}

const MODE_LABEL: Record<HighlightMode, string> = {
  piece: 'Where does it go?',
  location: 'What goes here?',
};

/** A labelled dot, so the highlight colours are named rather than described. */
function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

export function SolvePanel({
  plan,
  shortest,
  computing,
  onComputeShortest,
  activeStepId,
  running,
  practising,
  onSelectStep,
  onExplain,
  onGoPaint,
  highlightMode,
  onHighlightMode,
  showPartner,
  onShowPartner,
  selectedName,
  pair,
  stepForSelection,
  onClearSelection,
}: Props) {
  const list = useRef<ScrollView>(null);
  const stepY = useRef<Record<string, number>>({});

  // Bring the running step into view: with the step bar on screen the list is
  // only a couple of rows tall, and the active card used to be clipped by it.
  useEffect(() => {
    if (!activeStepId) return;
    const y = stepY.current[activeStepId];
    if (y !== undefined) list.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
  }, [activeStepId]);

  if (!plan.ok) {
    // The message already names the colour at fault; arm it so the user lands
    // on the paint panel ready to fix it rather than hunting for it.
    const blamed = COLOR_IDS.find((c) =>
      (plan.error ?? '').toLowerCase().includes(COLOR_NAME[c].toLowerCase())
    );
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>That cube can’t exist</Text>
        <Text style={styles.problem}>{plan.error}</Text>
        <Pressable
          onPress={() => onGoPaint(blamed)}
          style={styles.primary}
          accessibilityRole="button"
          accessibilityLabel={
            blamed ? `Back to the colours with ${COLOR_NAME[blamed]} ready` : 'Back to the colours'
          }
        >
          <Text style={styles.primaryText}>
            {blamed ? `Fix the ${COLOR_NAME[blamed].toLowerCase()} stickers` : 'Back to the colours'}
          </Text>
        </Pressable>
      </View>
    );
  }

  if (plan.solved) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Solved</Text>
        <Text style={styles.emptySub}>
          Nothing left to do. Paint in a scramble and the ways to solve it show up here.
        </Text>
        <Pressable
          onPress={() => onGoPaint()}
          style={styles.primary}
          accessibilityRole="button"
          accessibilityLabel="Set the colours"
        >
          <Text style={styles.primaryText}>Set the colours</Text>
        </Pressable>
      </View>
    );
  }

  const methods = [...plan.methods]
    .map((m) => (m.id === 'shortest' && shortest ? shortest : m))
    .sort((a, b) => a.level - b.level);
  const hasSteps = methods.some((m) => m.steps.length > 0);

  const selectionCard = selectedName ? (
    <View style={styles.picked}>
      <View style={styles.pickedHead}>
        <Text style={styles.pickedName} numberOfLines={2}>
          {selectedName}
        </Text>
        <Pressable
          onPress={onClearSelection}
          style={styles.clear}
          accessibilityRole="button"
          accessibilityLabel={`Clear selection: ${selectedName}`}
        >
          <Text style={styles.clearText}>Clear</Text>
        </Pressable>
      </View>

      {pair?.reason ? (
        <Text style={styles.pickedNote}>{pair.reason}</Text>
      ) : pair?.atHome ? (
        <Text style={styles.pickedNote}>Already where it belongs. Nothing to do for it.</Text>
      ) : (
        <View style={styles.legend}>
          <LegendRow
            color={cube.selected}
            label={highlightMode === 'piece' ? 'this piece' : 'this slot'}
          />
          {/* The target highlight is switched on and off where it is explained,
              rather than from a control called "Pair" at the top of the panel. */}
          <Pressable
            onPress={() => onShowPartner(!showPartner)}
            style={styles.legendSwitch}
            accessibilityRole="switch"
            accessibilityState={{ checked: showPartner }}
            aria-checked={showPartner}
            accessibilityLabel="Show where it goes"
          >
            <View
              style={[
                styles.legendDot,
                showPartner ? { backgroundColor: cube.target } : styles.legendDotOff,
              ]}
            />
            <Text style={[styles.legendText, !showPartner && styles.legendTextOff]}>
              {highlightMode === 'piece' ? 'where it goes' : 'the piece that goes there'}
            </Text>
            <Text style={styles.legendAction}>{showPartner ? 'Hide' : 'Show'}</Text>
          </Pressable>
        </View>
      )}

      <Pressable
        onPress={() => stepForSelection && onSelectStep(stepForSelection)}
        disabled={!stepForSelection}
        style={[styles.primary, !stepForSelection && styles.primaryOff]}
        accessibilityRole="button"
        accessibilityLabel="Show me how to get it there"
        accessibilityState={{ disabled: !stepForSelection }}
        aria-disabled={!stepForSelection}
        accessibilityHint={
          stepForSelection ? undefined : 'No step for this one yet — it settles as the layers go in'
        }
      >
        <Text style={[styles.primaryText, !stepForSelection && styles.primaryTextOff]}>
          {stepForSelection ? 'Show me how to get it there' : 'It settles as the layers go in'}
        </Text>
      </Pressable>
    </View>
  ) : hasSteps ? (
    // One line, not a 96pt box. On an SE the box was larger than the list it
    // introduced, and a hint above a populated list is not an empty state.
    <Text style={styles.listHint} numberOfLines={1}>
      ◇  Tap a piece to look it up
    </Text>
  ) : (
    <View style={styles.empty} accessibilityRole="summary">
      <Text style={styles.emptyGlyph}>◇</Text>
      <Text style={styles.emptyTitle}>Tap a piece on the cube</Text>
      <Text style={styles.emptySub}>to see where it goes</Text>
    </View>
  );

  return (
    <View style={styles.wrap}>
      {!running && selectionCard}

      <ScrollView ref={list} style={styles.list} contentContainerStyle={styles.listContent}>
        {methods.map((method) => (
          <View key={method.id} style={styles.method}>
            <View style={styles.methodHead}>
              <Text style={styles.methodTitle}>{method.title}</Text>
              {method.totalMoves > 0 && (
                <Text style={styles.methodCount}>
                  {method.totalMoves} moves · {method.steps.length} steps
                </Text>
              )}
            </View>
            {method.steps.length === 0 && (method.failed || method.id !== 'shortest') && (
              <Text style={[styles.methodSub, method.failed && styles.methodSubBad]}>
                {method.subtitle}
              </Text>
            )}

            {/* Gated on there being nothing to show rather than on the cache
                being empty: a search that gave up returns a method too, and
                gating on that took the retry button away with it. */}
            {method.id === 'shortest' && method.steps.length === 0 && (
              <Pressable
                onPress={onComputeShortest}
                disabled={computing}
                style={[styles.secondary, computing && styles.primaryBusy]}
                accessibilityRole="button"
                accessibilityLabel={
                  method.failed ? 'Try the search again' : 'Work out the shortest solve'
                }
                accessibilityState={{ disabled: computing, busy: computing }}
                aria-disabled={computing}
                aria-busy={computing}
              >
                {computing ? (
                  <View style={styles.busyRow}>
                    <ActivityIndicator size="small" color={text.primary} />
                    <Text style={styles.secondaryText}>Searching…</Text>
                  </View>
                ) : (
                  <Text style={styles.secondaryText}>
                    {method.failed ? 'Try the search again' : 'Work out the shortest solve'}
                  </Text>
                )}
              </Pressable>
            )}

            {method.steps.map((step, i) => {
              const on = step.id === activeStepId;
              const newGroup = i === 0 || method.steps[i - 1].group !== step.group;
              // Not shown when it would repeat the title or a chunk's name:
              // the card used to read "… 25 › Sexy move · Sexy move · L U L' U'".
              const tag = tagFor(step.title, step.algorithm, step.moves.map((m) => m.notation));
              return (
                <View
                  key={step.id}
                  onLayout={(e) => {
                    stepY.current[step.id] = e.nativeEvent.layout.y;
                  }}
                >
                  {newGroup && <Text style={styles.group}>{step.group}</Text>}
                  <Pressable
                    onPress={() => onSelectStep(step)}
                    style={[styles.step, on && styles.stepOn]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    aria-selected={on}
                    accessibilityLabel={`${step.title}, ${step.moves.length} moves${
                      step.algorithm ? `, ${step.algorithm}` : ''
                    }`}
                  >
                    <View style={[styles.rail, on && styles.railOn]} />
                    <View style={styles.stepBody}>
                      <View style={styles.stepHead}>
                        {/* The marker carries "running"; the row keeps its name.
                            It used to read "▸ Running", so the moment a step
                            started the list stopped saying which step it was -
                            and the row's own accessibility label with it. */}
                        <Text style={[styles.stepTitle, on && styles.stepTitleOn]} numberOfLines={1}>
                          {on ? `▸ ${step.title}` : step.title}
                        </Text>
                        <Text style={styles.stepCount}>{step.moves.length}</Text>
                        {/* Every row, not only the running one. Gating the
                            explanation on playback meant a learner could not ask
                            why anything worked until they had committed to
                            watching it. A 44pt target, which the 36pt text link
                            it replaces was not - and it costs the card no
                            height, because it sits in a row that already
                            existed. */}
                        <Pressable
                          onPress={() => onExplain(step)}
                          style={styles.why}
                          accessibilityRole="button"
                          accessibilityLabel={`Why ${step.algorithm ?? step.title} works`}
                          accessibilityHint="Explains what these moves do to the cube"
                        >
                          <Text style={styles.whyText}>?</Text>
                        </Pressable>
                      </View>
                      <View style={styles.stepMeta}>
                        {!on && (
                          <Notation
                            moves={step.moves}
                            variant="summary"
                            numberOfLines={1}
                            style={styles.notationFlex}
                          />
                        )}
                        {tag && (
                          // A stable handle, like the strip's `move-current`:
                          // "does the row print its algorithm twice" is then
                          // measurable rather than inferred from a text dump.
                          <Text nativeID={on ? 'step-tag' : undefined} style={styles.tag} numberOfLines={1}>
                            {tag}
                          </Text>
                        )}
                      </View>
                      {/* Practise mode covers the moves in the strip; the card
                          must not print the answer underneath it. */}
                      {on && !practising && (
                        <Notation moves={step.moves} variant="blocks" rawBelow={4} />
                      )}
                    </View>
                  </Pressable>
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>

      {!running && (
        <View
          style={styles.modes}
          accessibilityRole="radiogroup"
          accessibilityLabel="What tapping the cube looks up"
        >
          {(['piece', 'location'] as HighlightMode[]).map((m) => {
            const on = highlightMode === m;
            return (
              <Pressable
                key={m}
                onPress={() => onHighlightMode(m)}
                style={[styles.mode, on && styles.modeOn]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                aria-checked={on}
                accessibilityLabel={MODE_LABEL[m]}
              >
                <Text style={[styles.modeText, on && styles.modeTextOn]} numberOfLines={1}>
                  {MODE_LABEL[m]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const { surface, line, text, accent, status, cube, space, type, radius, hit } = tokens;

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: space.gutter, paddingTop: space.md, gap: space.sm },
  title: { ...type.title, color: text.primary },

  // -- selection ------------------------------------------------------------
  picked: {
    backgroundColor: surface.raised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: line.hairline,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: space.xs,
  },
  pickedHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  pickedName: { ...type.heading, color: text.primary, flex: 1 },
  clear: {
    minHeight: hit.min,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: line.outline,
  },
  clearText: { ...type.caption, fontWeight: '600', color: text.secondary },
  pickedNote: { ...type.caption, color: text.secondary },
  legend: { gap: space.xs },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 22 },
  legendSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: hit.min,
  },
  legendAction: {
    ...type.caption,
    fontWeight: '700',
    color: accent.base,
    marginLeft: 'auto',
  },
  legendTextOff: { color: text.tertiary },
  legendDotOff: { backgroundColor: 'transparent', borderColor: line.outline },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: surface.chipRim,
  },
  legendText: { ...type.caption, color: text.secondary },

  empty: {
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: line.hairline,
  },
  emptyGlyph: { fontSize: 24, lineHeight: 28, color: text.tertiary },
  listHint: { ...type.caption, color: text.tertiary, paddingVertical: space.xs },
  emptyTitle: { ...type.body, color: text.secondary },
  emptySub: { ...type.caption, color: text.tertiary },

  // -- list -----------------------------------------------------------------
  list: { flex: 1, marginHorizontal: -4 },
  listContent: { paddingHorizontal: 4, paddingBottom: 72 },
  method: { marginTop: space.md },
  methodHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  methodTitle: { ...type.heading, color: text.primary, flex: 1 },
  methodCount: { ...type.caption, ...tokens.numeric, color: text.tertiary },
  methodSub: { ...type.caption, color: text.tertiary, marginTop: space.xs, marginBottom: space.sm },
  methodSubBad: { color: status.danger },
  group: {
    ...type.overline,
    color: text.tertiary,
    textTransform: 'uppercase',
    marginTop: space.md,
    marginBottom: 6,
  },
  step: {
    flexDirection: 'row',
    backgroundColor: surface.raised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    marginBottom: space.sm,
    overflow: 'hidden',
  },
  stepOn: { borderColor: accent.base, backgroundColor: accent.soft },
  rail: { width: 3, backgroundColor: 'transparent' },
  railOn: { backgroundColor: accent.base },
  stepBody: { flex: 1, paddingVertical: space.md, paddingHorizontal: 14, gap: space.xs },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stepTitle: { ...type.body, fontWeight: '600', color: text.secondary, flex: 1 },
  stepTitleOn: { color: text.primary },
  stepCount: { ...type.caption, ...tokens.numeric, color: text.tertiary },
  chevron: { ...type.heading, color: text.tertiary },
  stepMeta: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  notationFlex: { flex: 1 },
  stepDetail: { ...type.caption, color: text.secondary, marginTop: space.xs },
  // A real 44pt target, and square, so it reads as a button rather than as the
  // decorative chevron it replaces.
  why: {
    minWidth: hit.min,
    minHeight: hit.min,
    marginVertical: -space.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: line.outline,
  },
  whyText: { ...type.heading, fontWeight: '700', color: accent.base },
  tag: {
    ...type.overline,
    flexShrink: 1,
    maxWidth: '52%',
    color: text.primary,
    backgroundColor: accent.soft,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    overflow: 'hidden',
  },

  // -- mode footer ----------------------------------------------------------
  modes: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    paddingBottom: space.md,
  },
  mode: {
    flex: 1,
    minHeight: hit.min,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: line.outline,
    backgroundColor: surface.raised,
  },
  modeOn: { borderWidth: 2, borderColor: accent.base, backgroundColor: accent.soft },
  modeText: { ...type.caption, fontWeight: '600', color: text.secondary },
  modeTextOn: { color: text.primary },

  // -- buttons --------------------------------------------------------------
  primary: {
    minHeight: hit.large,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: accent.soft,
    borderWidth: 2,
    borderColor: accent.base,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
  },
  primaryOff: { backgroundColor: 'transparent', borderWidth: 1, borderColor: line.hairline },
  primaryBusy: { opacity: 0.7 },
  primaryText: { ...type.heading, color: text.primary, textAlign: 'center' },
  primaryTextOff: { ...type.caption, color: text.tertiary },
  secondary: {
    minHeight: hit.min,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: line.outline,
    borderRadius: radius.md,
    marginBottom: space.sm,
  },
  secondaryText: { ...type.caption, fontWeight: '600', color: text.secondary },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },

  problem: {
    ...type.caption,
    color: status.warn,
    backgroundColor: status.warnSoft,
    borderRadius: radius.md,
    padding: space.md,
    overflow: 'hidden',
  },
});
