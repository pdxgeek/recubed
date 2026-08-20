import React, { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Move } from '../cube/core';
import { theme } from '../ui/theme';

interface Props {
  title: string;
  moves: Move[];
  step: number;
}

/** The move sequence, shown under the cube rather than in its own bar. */
export function MoveStrip({ title, moves, step }: Props) {
  const scroller = useRef<ScrollView>(null);
  const chipX = useRef<number[]>([]);

  useEffect(() => {
    const x = chipX.current[Math.min(step, moves.length - 1)] ?? 0;
    scroller.current?.scrollTo({ x: Math.max(0, x - 110), animated: true });
  }, [step, title, moves.length]);

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.headerRow} pointerEvents="none">
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.progress}>
          {Math.min(step, moves.length)}/{moves.length}
        </Text>
      </View>
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {moves.map((m, i) => {
          const past = i < step;
          const current = i === step;
          return (
            <View
              key={`${m.notation}-${i}`}
              onLayout={(e) => {
                chipX.current[i] = e.nativeEvent.layout.x;
              }}
              style={[styles.chip, past && styles.chipPast, current && styles.chipCurrent]}
            >
              <Text
                style={[
                  styles.chipText,
                  past && styles.chipTextPast,
                  current && styles.chipTextCurrent,
                ]}
              >
                {m.notation}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 6, gap: 4 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  title: { color: theme.textDim, fontSize: 12, fontWeight: '600', flex: 1 },
  progress: { color: theme.textDim, fontSize: 12, fontVariant: ['tabular-nums'] },
  chips: { gap: 5, paddingHorizontal: 14, paddingVertical: 2 },
  chip: {
    minWidth: 32,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 7,
    backgroundColor: '#15151dcc',
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
  },
  chipPast: { backgroundColor: '#1d2c35cc', borderColor: '#2c4956' },
  chipCurrent: { backgroundColor: theme.accent, borderColor: theme.accent },
  chipText: { color: theme.textDim, fontSize: 13, fontWeight: '700', fontFamily: 'Menlo' },
  chipTextPast: { color: '#8fc8de' },
  chipTextCurrent: { color: '#04212c' },
});
