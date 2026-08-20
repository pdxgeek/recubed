import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StageProgress } from '../cube/solver/plan';
import { tokens } from '../ui/theme';

export const SPEEDS = [
  { label: 'Slow', short: '1×', ms: 1400 },
  { label: 'Steady', short: '2×', ms: 850 },
  { label: 'Brisk', short: '3×', ms: 450 },
];

interface Props {
  atStart: boolean;
  atEnd: boolean;
  playing: boolean;
  speedMs: number;
  /**
   * Where this step sits in the method's stages. Shown in the counter slot that
   * already existed, so the rail costs no height on a phone.
   */
  stage?: StageProgress | null;
  onPrev: () => void;
  onNext: () => void;
  onPlayPause: () => void;
  onRestart: () => void;
  onSpeed: (ms: number) => void;
  closeLabel?: string;
  onClose: () => void;
}

export function StepBar({
  atStart,
  atEnd,
  playing,
  speedMs,
  stage,
  onPrev,
  onNext,
  onPlayPause,
  onRestart,
  onSpeed,
  closeLabel = 'Undo',
  onClose,
}: Props) {
  return (
    <View style={styles.outer}>
      <View style={styles.head}>
        <View style={styles.stage}>
          <Text style={styles.position} numberOfLines={1}>
            {stage ? `${stage.group} · ${stage.step} of ${stage.steps}` : ''}
          </Text>
          <View style={styles.stageTrack}>
            <View
              style={[
                styles.stageFill,
                { width: `${stage ? (stage.step / Math.max(1, stage.steps)) * 100 : 0}%` },
              ]}
            />
          </View>
        </View>
        <Pressable
          onPress={onClose}
          style={[styles.done, closeLabel === 'Keep' && styles.doneKeep]}
          accessibilityRole="button"
          accessibilityLabel={
            closeLabel === 'Keep'
              ? 'Keep these moves and close the step'
              : 'Undo these moves and close the step'
          }
        >
          <Text style={[styles.doneText, closeLabel === 'Keep' && styles.doneTextKeep]}>
            {closeLabel}
          </Text>
        </Pressable>
      </View>
      <View style={styles.bar}>
        <Pressable
          onPress={onRestart}
          style={styles.icon}
          accessibilityRole="button"
          accessibilityLabel="Restart this step"
        >
          <Text style={styles.iconText}>{'↺'}</Text>
        </Pressable>

        <Pressable
          onPress={onPrev}
          disabled={atStart}
          style={[styles.icon, atStart && styles.iconOff]}
          accessibilityRole="button"
          accessibilityLabel="Previous move"
          accessibilityState={{ disabled: atStart }}
        >
          <Text style={styles.iconText}>{'‹'}</Text>
        </Pressable>

        <Pressable
          onPress={onPlayPause}
          style={[styles.icon, styles.play]}
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause' : atEnd ? 'Replay' : 'Play'}
        >
          <Text style={[styles.iconText, styles.playText]}>{playing ? '‖' : '▶'}</Text>
        </Pressable>

        <Pressable
          onPress={onNext}
          disabled={atEnd}
          style={[styles.icon, atEnd && styles.iconOff]}
          accessibilityRole="button"
          accessibilityLabel="Next move"
          accessibilityState={{ disabled: atEnd }}
        >
          <Text style={styles.iconText}>{'›'}</Text>
        </Pressable>

        {/* A visible three-way control. The popover it replaces did not dismiss
            on an outside tap, and the tap that failed to dismiss it deselected
            the user's piece. */}
        <View style={styles.speed} accessibilityRole="radiogroup">
          {SPEEDS.map((s) => {
            const on = s.ms === speedMs;
            return (
              <Pressable
                key={s.label}
                onPress={() => onSpeed(s.ms)}
                style={[styles.speedItem, on && styles.speedItemOn]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${s.label} playback`}
              >
                <Text
                  style={[styles.speedText, on && styles.speedTextOn]}
                  maxFontSizeMultiplier={1.3}
                >
                  {s.short}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const { surface, line, text, accent, space, type, radius, hit } = tokens;

const styles = StyleSheet.create({
  outer: {
    backgroundColor: surface.base,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: line.hairline,
    paddingBottom: space.sm,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.gutter,
    paddingTop: 4,
  },
  stage: { flex: 1, gap: 3 },
  position: { ...type.overline, color: text.tertiary, textTransform: 'uppercase' },
  stageTrack: { height: 2, borderRadius: 1, backgroundColor: line.hairline, overflow: 'hidden' },
  stageFill: { height: 2, backgroundColor: accent.base },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.gutter,
    paddingTop: 6,
  },
  icon: {
    minWidth: hit.min,
    minHeight: hit.min,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: line.outline,
    backgroundColor: surface.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconOff: { opacity: 0.35 },
  iconText: { fontSize: 17, lineHeight: 22, color: text.secondary },
  play: {
    borderColor: line.outlineStrong,
    borderWidth: 2,
    backgroundColor: accent.soft,
    minWidth: 64,
    borderRadius: radius.pill,
  },
  playText: { color: text.primary },

  speed: {
    flexDirection: 'row',
    marginLeft: 'auto',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: line.outline,
    overflow: 'hidden',
  },
  speedItem: {
    minWidth: hit.min,
    minHeight: hit.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedItemOn: { backgroundColor: accent.soft },
  speedText: { ...type.caption, fontWeight: '700', color: text.tertiary },
  speedTextOn: { color: text.primary },

  done: {
    minHeight: hit.min,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: line.outline,
  },
  doneKeep: { backgroundColor: accent.soft, borderColor: accent.base, borderWidth: 2 },
  doneText: { ...type.caption, fontWeight: '700', color: text.secondary },
  doneTextKeep: { color: text.primary },
});
