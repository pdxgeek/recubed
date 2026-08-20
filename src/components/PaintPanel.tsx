import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { COLOR_HEX, COLOR_IDS, COLOR_NAME, ColorId, CubeState, SLOTS } from '../cube/core';
import { theme } from '../ui/theme';

interface Props {
  state: CubeState;
  active: ColorId | null;
  onActive: (c: ColorId | null) => void;
  onFillSolved: () => void;
  onScramble: () => void;
  onClear: () => void;
}

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
  return { counts, blank };
}

export function PaintPanel({ state, active, onActive, onFillSolved, onScramble, onClear }: Props) {
  const { counts, blank } = tally(state);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Paint the stickers</Text>
      <Text style={styles.hint}>
        Centres are fixed by the colour scheme. Pick a colour, then tap a sticker on the cube.
        Drag anywhere to spin it around.
      </Text>

      <ScrollView contentContainerStyle={styles.swatches}>
        {COLOR_IDS.map((c) => {
          const n = counts[c];
          const on = active === c;
          return (
            <Pressable
              key={c}
              onPress={() => onActive(c)}
              style={[styles.swatch, on && styles.swatchOn]}
            >
              <View style={[styles.chip, { backgroundColor: COLOR_HEX[c] }]} />
              <Text style={[styles.swatchName, on && styles.swatchNameOn]}>{COLOR_NAME[c]}</Text>
              <Text style={[styles.count, n === 9 && styles.countOk, n > 9 && styles.countBad]}>
                {n}/9
              </Text>
            </Pressable>
          );
        })}

        <Pressable
          onPress={() => onActive(null)}
          style={[styles.swatch, active === null && styles.swatchOn]}
        >
          <View style={[styles.chip, styles.chipErase]} />
          <Text style={[styles.swatchName, active === null && styles.swatchNameOn]}>Erase</Text>
          <Text style={styles.count}>{blank}</Text>
        </Pressable>
      </ScrollView>

      <View style={styles.actions}>
        <Pressable onPress={onFillSolved} style={styles.action}>
          <Text style={styles.actionText}>Solved</Text>
        </Pressable>
        <Pressable onPress={onScramble} style={styles.action}>
          <Text style={styles.actionText}>Scramble</Text>
        </Pressable>
        <Pressable onPress={onClear} style={styles.action}>
          <Text style={styles.actionText}>Clear</Text>
        </Pressable>
      </View>

      <Text style={[styles.status, blank === 0 && styles.statusOk]}>
        {blank === 0 ? 'All 54 stickers assigned' : `${blank} stickers still blank`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 14, gap: 10 },
  title: { color: theme.text, fontSize: 15, fontWeight: '700' },
  hint: { color: theme.textDim, fontSize: 12, lineHeight: 17 },
  swatches: { gap: 6, paddingVertical: 4 },
  swatch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 8,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: theme.panelAlt,
  },
  swatchOn: { borderColor: theme.accent, backgroundColor: theme.accentDim },
  chip: { width: 22, height: 22, borderRadius: 5, borderWidth: 1, borderColor: '#00000055' },
  chipErase: { backgroundColor: '#2b2b34', borderColor: theme.border, borderStyle: 'dashed' },
  swatchName: { color: theme.textDim, fontSize: 13, fontWeight: '600', flex: 1 },
  swatchNameOn: { color: theme.text },
  count: { color: theme.textDim, fontSize: 12, fontVariant: ['tabular-nums'] },
  countOk: { color: '#5fd67f' },
  countBad: { color: '#ff6b6b' },
  actions: { flexDirection: 'row', gap: 8 },
  action: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
  },
  actionText: { color: theme.textDim, fontSize: 12, fontWeight: '600' },
  status: { color: theme.warn, fontSize: 12 },
  statusOk: { color: '#5fd67f' },
});
