import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../ui/theme';

export type Mode = 'paint' | 'solve';

interface Props {
  mode: Mode;
  onMode: (m: Mode) => void;
  wireframe: boolean;
  onWireframe: (v: boolean) => void;
  onResetView: () => void;
}

export function TopBar({ mode, onMode, wireframe, onWireframe, onResetView }: Props) {
  return (
    <View style={styles.bar}>
      <View style={styles.segment}>
        {(['paint', 'solve'] as Mode[]).map((m) => (
          <Pressable
            key={m}
            onPress={() => onMode(m)}
            style={[styles.segItem, mode === m && styles.segItemOn]}
          >
            <Text style={[styles.segText, mode === m && styles.segTextOn]}>
              {m === 'paint' ? 'Paint' : 'Solve'}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.right}>
        <Pressable
          onPress={() => onWireframe(!wireframe)}
          style={[styles.btn, wireframe && styles.btnOn]}
        >
          <Text style={[styles.btnText, wireframe && styles.btnTextOn]}>Wireframe</Text>
        </Pressable>
        <Pressable onPress={onResetView} style={styles.btn}>
          <Text style={styles.btnText}>Centre</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: theme.panel,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: theme.panelAlt,
    borderRadius: theme.radius,
    padding: 3,
  },
  segItem: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: theme.radius - 3 },
  segItemOn: { backgroundColor: theme.accentDim },
  segText: { color: theme.textDim, fontSize: 12, fontWeight: '600' },
  segTextOn: { color: theme.text },
  right: { flexDirection: 'row', gap: 6, marginLeft: 'auto' },
  btn: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.panelAlt,
  },
  btnOn: { backgroundColor: theme.accentDim, borderColor: theme.accent },
  btnText: { color: theme.textDim, fontSize: 12, fontWeight: '600' },
  btnTextOn: { color: theme.text },
});
