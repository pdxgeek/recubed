import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../ui/theme';

export const SPEEDS = [
  { label: 'Slow', ms: 1400 },
  { label: 'Steady', ms: 850 },
  { label: 'Brisk', ms: 450 },
];

interface Props {
  /** Only used to close the speed popover when the run changes. */
  runId: string;
  atStart: boolean;
  atEnd: boolean;
  playing: boolean;
  speedMs: number;
  onPrev: () => void;
  onNext: () => void;
  onPlayPause: () => void;
  onRestart: () => void;
  onSpeed: (ms: number) => void;
  closeLabel?: string;
  onClose: () => void;
}

/** Three chevrons, lit up to the chosen speed. */
function SpeedGlyph({ level }: { level: number }) {
  return (
    <View style={styles.glyph}>
      {[0, 1, 2].map((i) => (
        <Text key={i} style={[styles.chevron, i <= level && styles.chevronOn]}>
          {'▸'}
        </Text>
      ))}
    </View>
  );
}

export function StepBar({
  runId,
  atStart,
  atEnd,
  playing,
  speedMs,
  onPrev,
  onNext,
  onPlayPause,
  onRestart,
  onSpeed,
  closeLabel = 'Close',
  onClose,
}: Props) {
  const [speedOpen, setSpeedOpen] = useState(false);
  const speedIndex = Math.max(0, SPEEDS.findIndex((s) => s.ms === speedMs));
  const speed = SPEEDS[speedIndex];

  useEffect(() => setSpeedOpen(false), [runId]);

  const tap = (fn: () => void) => () => {
    setSpeedOpen(false);
    fn();
  };

  return (
    <View style={styles.bar}>
      <Pressable
        onPress={tap(onRestart)}
        style={styles.icon}
        accessibilityRole="button"
        accessibilityLabel="Restart this step"
      >
        <Text style={styles.iconText}>{'↺'}</Text>
      </Pressable>

      <Pressable
        onPress={tap(onPrev)}
        style={[styles.icon, atStart && styles.iconOff]}
        accessibilityRole="button"
        accessibilityLabel="Previous move"
      >
        <Text style={styles.iconText}>{'‹'}</Text>
      </Pressable>

      <Pressable
        onPress={tap(onPlayPause)}
        style={[styles.icon, styles.play]}
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Pause' : atEnd ? 'Replay' : 'Play'}
      >
        <Text style={[styles.iconText, styles.playText]}>
          {playing ? '‖' : '▶'}
        </Text>
      </Pressable>

      <Pressable
        onPress={tap(onNext)}
        style={[styles.icon, atEnd && styles.iconOff]}
        accessibilityRole="button"
        accessibilityLabel="Next move"
      >
        <Text style={styles.iconText}>{'›'}</Text>
      </Pressable>

      <View style={styles.speedWrap}>
        {speedOpen && (
          <View style={styles.speedMenu}>
            {SPEEDS.map((s, i) => (
              <Pressable
                key={s.label}
                onPress={() => {
                  onSpeed(s.ms);
                  setSpeedOpen(false);
                }}
                style={[styles.speedMenuItem, s.ms === speedMs && styles.speedMenuItemOn]}
              >
                <SpeedGlyph level={i} />
                <Text
                  style={[styles.speedMenuText, s.ms === speedMs && styles.speedMenuTextOn]}
                >
                  {s.label}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
        <Pressable
          onPress={() =>
            speedOpen
              ? setSpeedOpen(false)
              : onSpeed(SPEEDS[(speedIndex + 1) % SPEEDS.length].ms)
          }
          onLongPress={() => setSpeedOpen((v) => !v)}
          delayLongPress={320}
          style={[styles.icon, speedOpen && styles.iconOn]}
          accessibilityRole="button"
          accessibilityLabel={`Speed: ${speed.label}`}
          accessibilityHint="Tap to change speed, hold to pick one"
        >
          <SpeedGlyph level={speedIndex} />
        </Pressable>
      </View>

      <Pressable onPress={tap(onClose)} style={styles.done} hitSlop={8}>
        <Text style={styles.doneText}>{closeLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: theme.panel,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.border,
  },
  icon: {
    minWidth: 44,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.panelAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconOff: { opacity: 0.35 },
  iconOn: { borderColor: theme.accent, backgroundColor: theme.accentDim },
  iconText: { color: theme.textDim, fontSize: 15, lineHeight: 19 },
  play: { borderColor: theme.accent, backgroundColor: theme.accentDim, minWidth: 56 },
  playText: { color: theme.text },
  glyph: { flexDirection: 'row', alignItems: 'center' },
  chevron: { color: '#43434f', fontSize: 13, lineHeight: 19, marginRight: -1 },
  chevronOn: { color: theme.accent },
  speedWrap: { marginLeft: 'auto' },
  speedMenu: {
    position: 'absolute',
    bottom: '100%',
    right: 0,
    marginBottom: 6,
    backgroundColor: theme.panelAlt,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.border,
    paddingVertical: 4,
    minWidth: 134,
  },
  speedMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  speedMenuItemOn: { backgroundColor: theme.accentDim },
  speedMenuText: { color: theme.textDim, fontSize: 13, fontWeight: '600' },
  speedMenuTextOn: { color: theme.text },
  done: { paddingHorizontal: 6, paddingVertical: 8 },
  doneText: { color: theme.accent, fontSize: 13, fontWeight: '700' },
});
