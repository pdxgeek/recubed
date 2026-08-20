import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { tokens } from '../ui/theme';

export type Mode = 'paint' | 'solve';

interface Props {
  mode: Mode;
  onMode: (m: Mode) => void;
  wireframe: boolean;
  onWireframe: (v: boolean) => void;
  onResetView: () => void;
}

const LABEL: Record<Mode, string> = { paint: 'Paint', solve: 'Solve' };
const HINT: Record<Mode, string> = {
  paint: 'Paint the cube',
  solve: 'Solve the cube',
};

export function TopBar({ mode, onMode, wireframe, onWireframe, onResetView }: Props) {
  return (
    <View style={styles.bar}>
      <View style={styles.segment} accessibilityRole="tablist">
        {(['paint', 'solve'] as Mode[]).map((m) => {
          const on = mode === m;
          return (
            <Pressable
              key={m}
              onPress={() => onMode(m)}
              style={[styles.segItem, on && styles.segItemOn]}
              accessibilityRole="tab"
              accessibilityLabel={HINT[m]}
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.segText, on && styles.segTextOn]} maxFontSizeMultiplier={1.4}>
                {LABEL[m]}
              </Text>
              <View style={[styles.segRule, on && styles.segRuleOn]} />
            </Pressable>
          );
        })}
      </View>
      <View style={styles.right}>
        <Pressable
          onPress={() => onWireframe(!wireframe)}
          style={[styles.btn, wireframe && styles.btnOn]}
          accessibilityRole="switch"
          accessibilityLabel="X-ray view"
          accessibilityState={{ checked: wireframe }}
          accessibilityHint="Hides the solved stickers so you can watch the pieces that matter"
        >
          <View style={[styles.dot, wireframe && styles.dotOn]} />
          <Text style={[styles.btnText, wireframe && styles.btnTextOn]} maxFontSizeMultiplier={1.4}>
            X-ray
          </Text>
        </Pressable>
        <Pressable
          onPress={onResetView}
          style={styles.btn}
          accessibilityRole="button"
          accessibilityLabel="Reset the view"
        >
          <Text style={styles.btnText} maxFontSizeMultiplier={1.4}>
            Reset view
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const { surface, line, text, accent, space, type, radius, hit, elevation } = tokens;

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.gutter,
    paddingVertical: space.sm,
    backgroundColor: surface.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: line.hairline,
    ...elevation.low,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: surface.raised,
    borderRadius: radius.md,
    padding: 3,
  },
  segItem: {
    minHeight: hit.min,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radius.sm,
  },
  segItemOn: { backgroundColor: accent.soft },
  segText: { ...type.heading, color: text.secondary },
  segTextOn: { color: text.primary },
  // A second, non-colour carrier for the selected tab.
  segRule: { height: 2, width: 20, marginTop: 3, borderRadius: 1, backgroundColor: 'transparent' },
  segRuleOn: { backgroundColor: accent.base },
  right: { flexDirection: 'row', gap: space.sm, marginLeft: 'auto' },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: hit.min,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: line.outline,
    backgroundColor: surface.raised,
  },
  btnOn: { backgroundColor: accent.soft, borderColor: accent.base, borderWidth: 2 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: line.outline,
    backgroundColor: 'transparent',
  },
  dotOn: { backgroundColor: accent.base, borderColor: accent.base },
  btnText: { ...type.caption, fontWeight: '600', color: text.secondary },
  btnTextOn: { color: text.primary },
});
