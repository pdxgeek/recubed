import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLOR_HEX, COLOR_IDS, COLOR_NAME, ColorId, CubeState, SLOTS, isCenter } from '../cube/core';
import { inkOn, tokens } from '../ui/theme';

interface Props {
  state: CubeState;
  active: ColorId | null;
  onActive: (c: ColorId | null) => void;
  onFillSolved: () => void;
  onScramble: () => void;
  onClear: () => void;
  /** Offered once every sticker is painted, so the cube leads somewhere. */
  onSolveThis: () => void;
  /** Just-in-time feedback, e.g. after a tap on a centre. Cleared by the shell. */
  nudge?: string | null;
}

/** 48 of the 54 stickers are paintable; the six centres are fixed. */
const PAINTABLE = SLOTS.filter((s) => !isCenter(s.pos));

/** How many stickers carry each colour. A legal cube has nine of each. */
function tally(state: CubeState) {
  const counts: Record<string, number> = {};
  for (const c of COLOR_IDS) counts[c] = 0;
  let blank = 0;
  for (const s of SLOTS) {
    const c = state.colors[s.index];
    if (c) counts[c]++;
    else blank++;
  }
  let painted = 0;
  for (const s of PAINTABLE) if (state.colors[s.index]) painted++;
  return { counts, blank, painted };
}

export function PaintPanel({
  state,
  active,
  onActive,
  onFillSolved,
  onScramble,
  onClear,
  onSolveThis,
  nudge,
}: Props) {
  const { counts, blank, painted } = tally(state);
  const complete = painted === PAINTABLE.length;
  // Clearing throws away a whole painted cube, so it asks first. An inline
  // arm-then-confirm rather than a dialog: it works on every target and does
  // not take the user out of the panel.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(id);
  }, [armed]);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Paint the stickers</Text>
        <Pressable
          onPress={() => onActive(null)}
          style={[styles.erase, active === null && styles.eraseOn]}
          accessibilityRole="radio"
          accessibilityState={{ selected: active === null }}
          accessibilityLabel={`Erase, ${blank} stickers blank`}
        >
          <View style={styles.eraseDot} />
          <Text style={[styles.eraseText, active === null && styles.eraseTextOn]}>
            Erase {blank}
          </Text>
        </Pressable>
      </View>

      <View
        accessibilityRole="progressbar"
        accessibilityLabel="Stickers painted"
        accessibilityValue={{ min: 0, max: PAINTABLE.length, now: painted }}
      >
        <View style={styles.track}>
          <View
            style={[
              styles.fill,
              { width: `${(painted / PAINTABLE.length) * 100}%` },
              complete && styles.fillDone,
            ]}
          />
        </View>
        <Text style={[styles.progressText, complete && styles.progressDone]}>
          {complete
            ? `All ${PAINTABLE.length} painted — ready to solve`
            : `${painted} of ${PAINTABLE.length} painted`}
        </Text>
      </View>

      <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel="Sticker colour">
        {COLOR_IDS.map((c) => {
          const n = counts[c];
          const on = active === c;
          const tooMany = n > 9;
          return (
            <Pressable
              key={c}
              onPress={() => onActive(c)}
              style={[styles.tile, on && styles.tileOn, tooMany && styles.tileBad]}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${COLOR_NAME[c]}, ${n} of 9${tooMany ? ', too many' : n === 9 ? ', complete' : ''}`}
              accessibilityHint="Then tap stickers on the cube"
            >
              <View style={[styles.bar, { backgroundColor: COLOR_HEX[c] }]}>
                <Text
                  style={[styles.letter, { color: inkOn(COLOR_HEX[c]) }]}
                  maxFontSizeMultiplier={1.4}
                >
                  {c}
                </Text>
              </View>
              <View style={styles.tileFoot}>
                <Text style={[styles.tileName, on && styles.tileNameOn]} numberOfLines={1}>
                  {COLOR_NAME[c]}
                </Text>
                <Text
                  style={[styles.count, n === 9 && styles.countOk, tooMany && styles.countBad]}
                  maxFontSizeMultiplier={1.4}
                >
                  {n}/9{n === 9 ? ' ✓' : tooMany ? ' !' : ''}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {nudge ? (
        <Text style={styles.nudge} accessibilityLiveRegion="polite">
          {nudge}
        </Text>
      ) : null}

      {/* The primary is stacked ABOVE the actions, never in place of them.
          Scramble fills all 48 stickers, so a row that disappears at 48/48
          deletes the app's most-used button the first time it is used - and
          strands anyone who painted an impossible cube with no way to clear it. */}
      <View style={styles.foot}>
        {complete && (
          <Pressable
            onPress={onSolveThis}
            style={styles.primary}
            accessibilityRole="button"
            accessibilityLabel="Solve this cube"
          >
            <Text style={styles.primaryText}>Solve this cube →</Text>
          </Pressable>
        )}
        <View style={styles.actions}>
          <Pressable
            onPress={onFillSolved}
            style={styles.action}
            accessibilityRole="button"
            accessibilityLabel="Fill in a solved cube"
          >
            <Text style={styles.actionText}>Solved</Text>
          </Pressable>
          <Pressable
            onPress={onScramble}
            style={styles.action}
            accessibilityRole="button"
            accessibilityLabel="Fill in a random scramble"
          >
            <Text style={styles.actionText}>Scramble</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              if (armed) {
                setArmed(false);
                onClear();
              } else setArmed(true);
            }}
            style={[styles.action, armed && styles.actionArmed]}
            accessibilityRole="button"
            accessibilityLabel={armed ? 'Tap again to clear every sticker' : 'Clear every sticker'}
          >
            <Text style={[styles.actionText, armed && styles.actionTextArmed]}>
              {armed ? 'Sure?' : 'Start over'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const { surface, line, text, accent, status, space, type, radius, hit, cube } = tokens;

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.gutter, paddingVertical: space.md, gap: space.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: hit.min },
  title: { ...type.title, color: text.primary, flex: 1 },
  erase: {
    minHeight: hit.min,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: line.outline,
  },
  eraseOn: { borderWidth: 2, borderColor: accent.base, backgroundColor: accent.soft },
  eraseDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: line.outline,
    backgroundColor: cube.blank,
  },
  eraseText: { ...type.caption, fontWeight: '600', color: text.secondary },
  eraseTextOn: { color: text.primary },

  track: { height: 4, borderRadius: 2, backgroundColor: surface.sunken, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: accent.base },
  fillDone: { backgroundColor: status.ok },
  progressText: { ...type.caption, ...tokens.numeric, color: text.tertiary, marginTop: space.xs },
  progressDone: { color: status.ok },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    flexBasis: 0,
    flexGrow: 1,
    minWidth: 92,
    height: 72,
    padding: space.sm,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: surface.raised,
    justifyContent: 'space-between',
  },
  tileOn: { borderColor: accent.base, backgroundColor: accent.soft },
  tileBad: { borderColor: status.danger },
  bar: {
    height: 30,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: surface.chipRim,
  },
  letter: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
  tileFoot: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  tileName: { ...type.caption, color: text.secondary, flex: 1 },
  tileNameOn: { color: text.primary },
  count: { ...type.caption, ...tokens.numeric, color: text.tertiary },
  countOk: { color: status.ok },
  countBad: { color: status.danger, fontWeight: '700' },

  nudge: {
    ...type.caption,
    color: text.primary,
    backgroundColor: status.warnSoft,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    overflow: 'hidden',
  },

  foot: { gap: space.sm },
  actions: { flexDirection: 'row', gap: space.sm },
  action: {
    flex: 1,
    minHeight: hit.min,
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: line.outline,
    alignItems: 'center',
  },
  actionArmed: { borderColor: status.danger, backgroundColor: status.dangerSoft },
  actionText: { ...type.caption, fontWeight: '600', color: text.secondary },
  actionTextArmed: { color: status.danger },

  primary: {
    minHeight: hit.large,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: accent.base,
    backgroundColor: accent.soft,
  },
  primaryText: { ...type.heading, color: text.primary },
});
