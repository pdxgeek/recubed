import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PlanMethod, PlanStep, SolvePlan } from '../cube/solver/plan';
import { HighlightMode, PiecePair } from '../cube/pieces';
import { theme } from '../ui/theme';

interface Props {
  plan: SolvePlan;
  shortest: PlanMethod | null;
  computing: boolean;
  onComputeShortest: () => void;
  activeStepId: string | null;
  onSelectStep: (step: PlanStep) => void;
  onGoPaint: () => void;
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

export function SolvePanel({
  plan,
  shortest,
  computing,
  onComputeShortest,
  activeStepId,
  onSelectStep,
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
  if (!plan.ok) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>That cube can’t exist</Text>
        <Text style={styles.problem}>{plan.error}</Text>
        <Pressable onPress={onGoPaint} style={styles.primary}>
          <Text style={styles.primaryText}>Back to the colours</Text>
        </Pressable>
      </View>
    );
  }

  if (plan.solved) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Solved</Text>
        <Text style={styles.hint}>
          Nothing left to do. Paint in a scramble and the ways to solve it will show up here.
        </Text>
        <Pressable onPress={onGoPaint} style={styles.primary}>
          <Text style={styles.primaryText}>Set the colours</Text>
        </Pressable>
      </View>
    );
  }

  const methods = [...plan.methods]
    .map((m) => (m.id === 'shortest' && shortest ? shortest : m))
    .sort((a, b) => a.level - b.level);

  return (
    <View style={styles.wrap}>
      <View style={styles.modes}>
        {(['piece', 'location'] as HighlightMode[]).map((m) => (
          <Pressable
            key={m}
            onPress={() => onHighlightMode(m)}
            style={[styles.mode, highlightMode === m && styles.modeOn]}
          >
            <Text style={[styles.modeText, highlightMode === m && styles.modeTextOn]}>
              {m === 'piece' ? 'Tap a piece' : 'Tap a slot'}
            </Text>
          </Pressable>
        ))}
        <Pressable
          onPress={() => onShowPartner(!showPartner)}
          style={[styles.partnerToggle, showPartner && styles.partnerToggleOn]}
        >
          <View style={[styles.partnerDot, !showPartner && styles.partnerDotOff]} />
          <Text style={[styles.modeText, showPartner && styles.modeTextOn]}>Pair</Text>
        </Pressable>
      </View>

      {selectedName ? (
        <View style={styles.picked}>
          <View style={styles.pickedHead}>
            <Text style={styles.pickedName}>{selectedName}</Text>
            <Pressable onPress={onClearSelection} hitSlop={8}>
              <Text style={styles.clearText}>Clear</Text>
            </Pressable>
          </View>
          {pair?.reason ? (
            <Text style={styles.pickedNote}>{pair.reason}</Text>
          ) : pair?.atHome ? (
            <Text style={styles.pickedNote}>Already where it belongs. Nothing to do for it.</Text>
          ) : (
            <Text style={styles.pickedNote}>
              {highlightMode === 'piece'
                ? 'White is the piece, amber is the slot it has to reach.'
                : 'White is the slot, amber is the piece that has to reach it.'}
            </Text>
          )}
          {stepForSelection ? (
            <Pressable onPress={() => onSelectStep(stepForSelection)} style={styles.primary}>
              <Text style={styles.primaryText}>Show me how to get it there</Text>
            </Pressable>
          ) : (
            !pair?.atHome && (
              <Text style={styles.pickedNote}>
                This one falls into place while the rest of the cube is solved - work down the
                list below.
              </Text>
            )
          )}
        </View>
      ) : (
        <Text style={styles.hint}>
          Tap any piece on the cube to see where it has to go and how to get it there, or work
          down the list: everything still to do, gentlest method first.
        </Text>
      )}
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {methods.map((method) => (
          <View key={method.id} style={styles.method}>
            <View style={styles.methodHead}>
              <Text style={styles.methodTitle}>{method.title}</Text>
              {method.totalMoves > 0 && (
                <Text style={styles.methodCount}>{method.totalMoves} moves</Text>
              )}
            </View>
            <Text style={styles.methodSub}>{method.subtitle}</Text>

            {method.id === 'shortest' && !shortest && (
              <Pressable
                onPress={onComputeShortest}
                disabled={computing}
                style={[styles.primary, computing && styles.primaryBusy]}
              >
                {computing ? (
                  <View style={styles.busyRow}>
                    <ActivityIndicator size="small" color={theme.text} />
                    <Text style={styles.primaryText}>Searching…</Text>
                  </View>
                ) : (
                  <Text style={styles.primaryText}>Work out the shortest solve</Text>
                )}
              </Pressable>
            )}

            {method.steps.map((step, i) => {
              const on = step.id === activeStepId;
              const newGroup = i === 0 || method.steps[i - 1].group !== step.group;
              return (
                <View key={step.id}>
                  {newGroup && <Text style={styles.group}>{step.group}</Text>}
                  <Pressable
                    onPress={() => onSelectStep(step)}
                    style={[styles.step, on && styles.stepOn]}
                  >
                    <View style={styles.stepHead}>
                      <Text style={[styles.stepTitle, on && styles.stepTitleOn]}>{step.title}</Text>
                      <Text style={styles.stepCount}>{step.moves.length}</Text>
                    </View>
                    <Text style={styles.notation}>{step.notation}</Text>
                    {step.algorithm && <Text style={styles.tag}>{step.algorithm}</Text>}
                    <Text style={styles.stepDetail}>{step.detail}</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 14, paddingTop: 12, gap: 8 },
  title: { color: theme.text, fontSize: 15, fontWeight: '700' },
  hint: { color: theme.textDim, fontSize: 12, lineHeight: 17 },
  modes: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  mode: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.panelAlt,
  },
  modeOn: { borderColor: theme.accent, backgroundColor: theme.accentDim },
  modeText: { color: theme.textDim, fontSize: 11, fontWeight: '600' },
  modeTextOn: { color: theme.text },
  partnerToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 'auto',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
  },
  partnerToggleOn: { borderColor: theme.warn },
  partnerDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: theme.warn },
  partnerDotOff: { backgroundColor: theme.border },
  picked: {
    backgroundColor: theme.panelAlt,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 10,
    gap: 6,
  },
  pickedHead: { flexDirection: 'row', alignItems: 'center' },
  pickedName: { color: theme.text, fontSize: 14, fontWeight: '700', flex: 1 },
  pickedNote: { color: theme.textDim, fontSize: 11, lineHeight: 16 },
  clearText: { color: theme.accent, fontSize: 12, fontWeight: '600' },
  problem: {
    color: theme.warn,
    fontSize: 13,
    lineHeight: 19,
    backgroundColor: '#2a1f10',
    borderRadius: theme.radius,
    padding: 10,
  },
  list: { flex: 1, marginHorizontal: -4 },
  listContent: { paddingHorizontal: 4, paddingBottom: 24 },
  method: { marginTop: 12 },
  methodHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  methodTitle: { color: theme.text, fontSize: 13, fontWeight: '700', flex: 1 },
  methodCount: { color: theme.textDim, fontSize: 11, fontVariant: ['tabular-nums'] },
  methodSub: { color: theme.textDim, fontSize: 11, lineHeight: 16, marginBottom: 8 },
  group: {
    color: theme.textDim,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginTop: 10,
    marginBottom: 5,
  },
  notation: { color: theme.text, fontSize: 12, fontFamily: 'Menlo', lineHeight: 17 },
  step: {
    backgroundColor: theme.panelAlt,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: 'transparent',
    padding: 10,
    marginBottom: 6,
    gap: 4,
  },
  stepOn: { borderColor: theme.accent, backgroundColor: theme.accentDim },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepTitle: { color: theme.textDim, fontSize: 13, fontWeight: '700', flex: 1 },
  stepTitleOn: { color: theme.text },
  stepCount: { color: theme.textDim, fontSize: 11, fontVariant: ['tabular-nums'] },
  stepDetail: { color: theme.textDim, fontSize: 11, lineHeight: 16 },
  tag: {
    alignSelf: 'flex-start',
    color: theme.accent,
    fontSize: 10,
    fontWeight: '600',
    borderWidth: 1,
    borderColor: theme.accentDim,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  primary: {
    backgroundColor: theme.accentDim,
    borderWidth: 1,
    borderColor: theme.accent,
    borderRadius: theme.radius,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 8,
  },
  primaryBusy: { opacity: 0.7 },
  primaryText: { color: theme.text, fontSize: 13, fontWeight: '600' },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
