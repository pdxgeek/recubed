import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CubeState, SLOTS, vecKey } from '../cube/core';
import { ALGORITHMS } from '../cube/algorithms';
import { PlanStep, describeCubie } from '../cube/solver/plan';
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
 * Everything here is read off data the plan already carries. There is no new
 * cube maths and nothing for `npm run verify` to re-check: the algorithm's
 * note comes from the library, the pieces to watch come from the step's own
 * target slots named through `describeCubie`.
 */

interface Props {
  step: PlanStep;
  state: CubeState;
  wireframe: boolean;
  onWireframe: (v: boolean) => void;
  onWatch: () => void;
  onClose: () => void;
}

export function WhySheet({ step, state, wireframe, onWireframe, onWatch, onClose }: Props) {
  // Step names carry the face a trigger is performed on ("Sexy move (left)"),
  // so an exact match misses the library entry it is a variant of.
  const alg = useMemo(() => {
    const name = step.algorithm;
    if (!name) return undefined;
    return (
      ALGORITHMS.find((a) => a.name === name) ??
      ALGORITHMS.find((a) => name.startsWith(`${a.name} (`))
    );
  }, [step.algorithm]);

  /** The pieces this step moves, named the way the panel names them. */
  const watching = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const i of step.targetSlots) {
      const key = vecKey(SLOTS[i].pos);
      if (seen.has(key)) continue;
      seen.add(key);
      const name = describeCubie(state, SLOTS[i].pos);
      if (!name.startsWith('?') && !name.endsWith('centre')) out.push(name);
    }
    return out;
  }, [step.targetSlots, state]);

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

      <ScrollView contentContainerStyle={styles.body}>
        <Notation moves={step.moves} variant="blocks" rawBelow={4} />

        <Text style={styles.overline}>What it does</Text>
        {alg?.note && (
          <Text style={styles.para}>
            {alg.note}. Everything else on the cube ends up exactly where it started.
          </Text>
        )}
        <Text style={styles.para}>{step.detail}</Text>

        {watching.length > 0 && (
          <>
            <Text style={styles.overline}>Watch these</Text>
            {watching.map((name) => (
              <View key={name} style={styles.watchRow}>
                <View style={styles.watchDot} />
                <Text style={styles.watchText}>{name}</Text>
              </View>
            ))}
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
  sheet: {
    flex: 1,
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
  body: { padding: space.gutter, paddingBottom: space.xl, gap: space.sm },
  overline: { ...type.overline, color: text.tertiary, marginTop: space.sm },
  para: { ...type.caption, color: text.secondary },
  watchRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 22 },
  watchDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: cube.moving },
  watchText: { ...type.caption, color: text.secondary },
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
