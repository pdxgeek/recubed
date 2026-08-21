import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { tokens } from '../ui/theme';

/** Which of the three speeds a millisecond value is, defaulting to the middle. */
export const speedIndex = (ms: number) => {
  const i = SPEEDS.findIndex((s) => s.ms === ms);
  return i < 0 ? 1 : i;
};

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
  onPrev: () => void;
  /** Null while practising: the moves ahead are covered, so Next would spoil it. */
  onNext: (() => void) | null;
  /**
   * Null while practising, for the same reason as `onNext` and a worse one: one
   * tap on Play auto-played the whole step and spoiled every move in it, so the
   * "you cannot spoil it" rule had a hole big enough to drive the feature
   * through. Reveal, in the strip's own footer, is the way forward.
   */
  onPlayPause: (() => void) | null;
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
  onPrev,
  onNext,
  onPlayPause,
  onRestart,
  onSpeed,
  closeLabel = 'Undo',
  onClose,
}: Props) {
  const speed = SPEEDS[speedIndex(speedMs)];
  return (
    <View style={styles.outer}>
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
          aria-disabled={atStart}
        >
          <Text style={styles.iconText}>{'‹'}</Text>
        </Pressable>

        <Pressable
          onPress={onPlayPause ?? undefined}
          disabled={!onPlayPause}
          style={[styles.icon, styles.play, !onPlayPause && styles.iconOff]}
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause' : atEnd ? 'Replay' : 'Play'}
          accessibilityState={{ disabled: !onPlayPause }}
          aria-disabled={!onPlayPause}
          accessibilityHint={onPlayPause ? undefined : 'Reveal the moves one at a time instead'}
        >
          <Text style={[styles.iconText, styles.playText]}>{playing ? '‖' : '▶'}</Text>
        </Pressable>

        <Pressable
          onPress={onNext ?? undefined}
          disabled={atEnd || !onNext}
          style={[styles.icon, (atEnd || !onNext) && styles.iconOff]}
          accessibilityRole="button"
          accessibilityLabel="Next move"
          accessibilityState={{ disabled: atEnd || !onNext }}
          aria-disabled={atEnd || !onNext}
        >
          <Text style={styles.iconText}>{'›'}</Text>
        </Pressable>

        {/* One control, not three. Three radio buttons were 132pt of a 393pt
            bar spent on a preference, next to four transport buttons that are
            what the bar is for; this cycles Slow -> Steady -> Brisk and says
            which one it is on. */}
        <Pressable
          onPress={() => onSpeed(SPEEDS[(speedIndex(speedMs) + 1) % SPEEDS.length].ms)}
          style={styles.speed}
          accessibilityRole="button"
          accessibilityLabel={`${speed.label} playback`}
          accessibilityHint="Tap for the next speed"
        >
          <Text style={styles.speedText} maxFontSizeMultiplier={1.3}>
            {speed.short}
          </Text>
        </Pressable>

        {/* Was a row of its own above the transport, beside a stage rail that
            repeated the group heading the step list prints two inches away.
            The rail went; this moved down into the space it left. */}
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
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.gutter,
    paddingTop: space.sm,
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
    minWidth: hit.min,
    minHeight: hit.min,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: line.outline,
    backgroundColor: surface.raised,
  },
  speedText: { ...type.caption, fontWeight: '700', color: text.secondary },

  done: {
    marginLeft: 'auto',
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
