import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLOR_HEX, COLOR_IDS, COLOR_NAME, ColorId, CubeState, SLOTS, isCenter } from '../cube/core';
import { PAINT_ROW_H } from '../ui/net';
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
  /**
   * `compact` is the Flat-view form: two 44pt rows and nothing else, so the net
   * gets the whole body. The full panel is 336pt, which left a 264pt band for a
   * 462pt net on an SE - roughly half the cube at a time, and no measurement in
   * the app said so. Every control here keeps the label it has in the full
   * panel, so nothing a screen reader or a test knows about moves.
   */
  variant?: 'full' | 'compact';
  /**
   * True on a window under 700pt tall, where the two-row colour grid does not
   * fit alongside everything below it.
   *
   * Measured on an iPhone SE with all 48 stickers painted: the action row sat
   * at y 660-704 in a 667pt window, and `document.scrollHeight` was 716. On the
   * web target the document scrolls and the buttons are merely below the fold;
   * on a device the root View does not scroll and they are gone - `Scramble`,
   * which the panel's own framing line tells you to tap, and `Start over`,
   * which is the only way out of an impossible cube. Following the instruction
   * is what pushes them off, because completing the cube adds the 56pt
   * "Solve this cube" primary above them.
   *
   * The compact swatch row this switches to is 44pt against the grid's 154, and
   * it is not a new component: it is the one the Flat view already uses, with
   * every label unchanged.
   */
  short?: boolean;
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
  variant = 'full',
  short = false,
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

  // The full panel stacks a large "Solve this cube →" primary above this row;
  // the compact one has no room for a second row, so the primary joins the row
  // itself. Only ever one of the two, so "Solve this cube" is one control.
  const actionRow = (withPrimary: boolean) => (
    <View style={styles.actions}>
      {withPrimary && complete && (
        <Pressable
          onPress={onSolveThis}
          style={[styles.action, styles.actionPrimary]}
          accessibilityRole="button"
          accessibilityLabel="Solve this cube"
        >
          <Text style={[styles.actionText, styles.actionTextPrimary]}>Solve →</Text>
        </Pressable>
      )}
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
  );

  /**
   * The 44pt colour row. `withErase` because the full panel already has an
   * "Erase N" control in its header, and two radios with the same label in the
   * same group is a worse answer than one.
   */
  const swatchRow = (withErase: boolean, hint: string) => (
    <View style={styles.swatchRow} accessibilityRole="radiogroup" accessibilityLabel="Sticker colour">
      {withErase && (
        <Pressable
          onPress={() => onActive(null)}
          style={[styles.swatch, styles.swatchErase, active === null && styles.swatchOn]}
          accessibilityRole="radio"
          accessibilityState={{ selected: active === null }}
          aria-checked={active === null}
          accessibilityLabel={`Erase, ${blank} stickers blank`}
        >
          <Text style={styles.swatchEraseLetter} maxFontSizeMultiplier={1.3}>
            ⌫
          </Text>
        </Pressable>
      )}
      {COLOR_IDS.map((c) => {
        const n = counts[c];
        const on = active === c;
        const tooMany = n > 9;
        return (
          <Pressable
            key={c}
            onPress={() => onActive(c)}
            style={[
              styles.swatch,
              { backgroundColor: COLOR_HEX[c] },
              on && styles.swatchOn,
              tooMany && styles.swatchBad,
            ]}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            aria-checked={on}
            accessibilityLabel={`${COLOR_NAME[c]}, ${n} of 9${tooMany ? ', too many' : n === 9 ? ', complete' : ''}`}
            accessibilityHint={hint}
          >
            <Text
              style={[styles.swatchLetter, { color: inkOn(COLOR_HEX[c]) }]}
              maxFontSizeMultiplier={1.3}
            >
              {c}
            </Text>
            <Text
              style={[styles.swatchCount, { color: inkOn(COLOR_HEX[c]) }]}
              maxFontSizeMultiplier={1.2}
            >
              {n}/9
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  if (variant === 'compact') {
    return (
      <View style={styles.compact}>
        {swatchRow(true, 'Then tap stickers on the net')}
        {actionRow(true)}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Paint the stickers</Text>
        <Pressable
          onPress={() => onActive(null)}
          style={[styles.erase, active === null && styles.eraseOn]}
          accessibilityRole="radio"
          accessibilityState={{ selected: active === null }}
          aria-checked={active === null}
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
            : painted === 0
              ? `0 of ${PAINTABLE.length} painted · or tap Scramble to practise on a random cube`
              : `${painted} of ${PAINTABLE.length} painted`}
        </Text>
      </View>

      {/* On a short window the two-row grid is 154pt the panel does not have:
          at 375x667 with all 48 painted it pushed the action row to y 660-704
          of a 667pt window, which on a device is off the screen rather than
          below the fold. The compact row is 44pt and every label on it is the
          same label. */}
      {short ? (
        swatchRow(false, 'Then tap stickers on the cube')
      ) : (
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
                aria-checked={on}
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
      )}

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
        {actionRow(false)}
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

  // -- the Flat-view form ---------------------------------------------------
  // A fixed height, because the net's budget is computed from it: `net.ts`
  // owns PAINT_ROW_H and `verify-net.ts` checks the net fits what is left.
  compact: {
    height: PAINT_ROW_H,
    paddingHorizontal: space.gutter,
    paddingVertical: space.sm,
    gap: space.sm,
    justifyContent: 'center',
  },
  swatchRow: { flexDirection: 'row', gap: space.xs },
  swatch: {
    flex: 1,
    height: hit.min,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchOn: { borderColor: accent.base, borderWidth: 3 },
  swatchBad: { borderColor: status.danger },
  swatchErase: {
    backgroundColor: cube.blank,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: line.outline,
  },
  swatchEraseLetter: { ...type.body, color: text.secondary },
  swatchLetter: { fontSize: 14, lineHeight: 16, fontWeight: '700' },
  swatchCount: { fontSize: 10, lineHeight: 12, fontWeight: '700' },
  actionPrimary: { borderWidth: 2, borderColor: accent.base, backgroundColor: accent.soft },
  actionTextPrimary: { color: text.primary },
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
