import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { tokens } from '../ui/theme';

export type Mode = 'paint' | 'solve';

export type CubeView = '3d' | 'net';

interface Props {
  mode: Mode;
  onMode: (m: Mode) => void;
  view: CubeView;
  onView: (v: CubeView) => void;
  wireframe: boolean;
  onWireframe: (v: boolean) => void;
  onResetView: () => void;
}

const VIEW_LABEL: Record<CubeView, string> = { '3d': '3D', net: 'Flat' };
const VIEW_HINT: Record<CubeView, string> = {
  '3d': '3D cube view',
  net: 'Flat net view',
};

const LABEL: Record<Mode, string> = { paint: 'Paint', solve: 'Solve' };
const HINT: Record<Mode, string> = {
  paint: 'Paint the cube',
  solve: 'Solve the cube',
};

export function TopBar({ mode, onMode, view, onView, wireframe, onWireframe, onResetView }: Props) {
  return (
    <View style={styles.bar}>
      <View style={styles.segment} accessibilityRole="tablist" accessibilityLabel="Mode">
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
              aria-selected={on}
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
        <View style={styles.segment} accessibilityRole="tablist" accessibilityLabel="Cube view">
          {(['3d', 'net'] as CubeView[]).map((v) => {
            const on = view === v;
            return (
              <Pressable
                key={v}
                onPress={() => onView(v)}
                style={[styles.viewItem, on && styles.segItemOn]}
                accessibilityRole="tab"
                accessibilityLabel={VIEW_HINT[v]}
                accessibilityState={{ selected: on }}
                aria-selected={on}
              >
                <Text
                  style={[styles.btnText, on && styles.btnTextOn]}
                  maxFontSizeMultiplier={1.4}
                >
                  {VIEW_LABEL[v]}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {/* X-ray strips the 3D cube back to a cage; there is nothing for it to
            do to a flat net, where every sticker is already legible. */}
        {view === '3d' && (
          <Pressable
            onPress={() => onWireframe(!wireframe)}
            style={[styles.btn, wireframe && styles.btnOn]}
            accessibilityRole="switch"
            accessibilityLabel="X-ray view"
            accessibilityState={{ checked: wireframe }}
            aria-checked={wireframe}
            accessibilityHint="Hides the solved stickers so you can watch the pieces that matter"
          >
            <View style={[styles.dot, wireframe && styles.dotOn]} />
            <Text
              style={[styles.btnText, wireframe && styles.btnTextOn]}
              maxFontSizeMultiplier={1.4}
            >
              X-ray
            </Text>
          </Pressable>
        )}
        {view === '3d' && (
          <Pressable
            onPress={onResetView}
            style={styles.btn}
            accessibilityRole="button"
            accessibilityLabel="Reset the view"
          >
            <Text style={styles.btnText} maxFontSizeMultiplier={1.4}>
              Reset
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const { surface, line, text, accent, space, type, radius, hit, elevation } = tokens;

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
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
  viewItem: {
    minHeight: hit.min,
    minWidth: hit.min,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    borderRadius: radius.sm,
  },
  segItem: {
    minHeight: hit.min,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
  },
  segItemOn: { backgroundColor: accent.soft },
  segText: { ...type.heading, color: text.secondary },
  segTextOn: { color: text.primary },
  // A second, non-colour carrier for the selected tab.
  segRule: { height: 2, width: 20, marginTop: 3, borderRadius: 1, backgroundColor: 'transparent' },
  segRuleOn: { backgroundColor: accent.base },
  right: { flexDirection: 'row', gap: 6, marginLeft: 'auto', flexShrink: 1 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: hit.min,
    paddingHorizontal: space.sm,
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
