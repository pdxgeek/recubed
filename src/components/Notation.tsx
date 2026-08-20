import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Move } from '../cube/core';
import { MoveChunk, chunkByTriggers } from '../cube/algorithms';
import { tokens } from '../ui/theme';

/**
 * A move sequence, read as the triggers it is built from.
 *
 * One component for all three places notation appears - the move strip, the
 * collapsed step row and the expanded card - because they diverged once
 * already: the collapsed rows read `U' · Sexy move ×3` while the card directly
 * below them printed twenty-one raw letters over three wrapped lines.
 *
 * `summary` is the one-line form for a row; `blocks` is the chunked form with
 * each trigger named above its moves.
 *
 * A repeated trigger prints **one** period, not all of them. `Sexy move ×5`
 * followed by `R U R' U'` five times said the same thing twice and wrapped
 * onto two lines; the count is already in the label. What the learner would
 * lose is the total, so the block states it - `20 moves` - and tapping the
 * block writes the whole run out for anyone who wants to read it end to end.
 * The screen-reader label always carries the full expansion.
 */

interface Props {
  moves: Move[];
  /** 'summary' = one line of trigger names; 'blocks' = named groups of moves. */
  variant?: 'summary' | 'blocks';
  /** Below this many moves the raw notation reads fine on its own. */
  rawBelow?: number;
  numberOfLines?: number;
  style?: object;
}

/** "R'" reads as "R apostrophe" otherwise. */
function spoken(notation: string): string {
  const base = notation[0];
  if (notation.endsWith("'")) return `${base} prime`;
  if (notation.endsWith('2')) return `${base} twice`;
  return base;
}

export const chunkLabel = (chunk: MoveChunk) =>
  chunk.label ? `${chunk.label}${chunk.repeat > 1 ? ` ×${chunk.repeat}` : ''}` : null;

export function Notation({
  moves,
  variant = 'summary',
  rawBelow = 8,
  numberOfLines,
  style,
}: Props) {
  const notation = useMemo(() => moves.map((m) => m.notation), [moves]);
  const chunks = useMemo(() => chunkByTriggers(notation), [notation]);
  const raw = notation.join(' ');
  const [expanded, setExpanded] = useState<number[]>([]);

  if (moves.length <= rawBelow || chunks.every((c) => !c.label)) {
    return (
      <Text style={[styles.mono, style]} numberOfLines={numberOfLines}>
        {raw}
      </Text>
    );
  }

  if (variant === 'summary') {
    const text = chunks
      .map((c) => chunkLabel(c) ?? notation.slice(c.start, c.start + c.length).join(' '))
      .join(' · ');
    return (
      <Text style={[styles.summary, style]} numberOfLines={numberOfLines ?? 1}>
        {text}
      </Text>
    );
  }

  return (
    <View style={[styles.blocks, style]}>
      {chunks.map((chunk) => {
        const label = chunkLabel(chunk);
        const period = chunk.length / chunk.repeat;
        const open = expanded.includes(chunk.start);
        const shown = chunk.repeat > 1 && !open ? period : chunk.length;
        const text = notation.slice(chunk.start, chunk.start + shown).join(' ');
        const spokenAll = notation
          .slice(chunk.start, chunk.start + chunk.length)
          .map(spoken)
          .join(', ');
        const body = (
          <>
            {label ? (
              <View style={styles.labelRow}>
                <Text style={styles.label} numberOfLines={1}>
                  {label}
                </Text>
                {chunk.repeat > 1 && (
                  <Text style={styles.total}>{chunk.length} moves</Text>
                )}
              </View>
            ) : null}
            <Text style={styles.mono}>{text}</Text>
          </>
        );

        // Only a collapsed repeat is worth a control: everything else is
        // already printed in full, so a Pressable there would be a 44pt target
        // that does nothing.
        if (chunk.repeat === 1) {
          return (
            <View key={chunk.start} style={styles.block}>
              {body}
            </View>
          );
        }
        return (
          <Pressable
            key={chunk.start}
            onPress={() =>
              setExpanded((prev) =>
                prev.includes(chunk.start)
                  ? prev.filter((n) => n !== chunk.start)
                  : [...prev, chunk.start]
              )
            }
            style={[styles.block, styles.blockTappable]}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            aria-expanded={open}
            accessibilityLabel={`${label}: ${spokenAll}. ${chunk.length} moves.`}
            accessibilityHint={open ? 'Collapses to one repeat' : `Writes out all ${chunk.length} moves`}
          >
            {body}
          </Pressable>
        );
      })}
    </View>
  );
}

const { line, text, space, type, radius, hit } = tokens;

const styles = StyleSheet.create({
  mono: { ...type.mono, color: text.primary },
  summary: { ...type.caption, color: text.secondary },
  blocks: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  block: {
    flexShrink: 1,
    maxWidth: '100%',
    borderWidth: 1,
    borderColor: line.outline,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    gap: 2,
  },
  // A tappable block is a control, so it carries a control's target height.
  blockTappable: { minHeight: hit.min, justifyContent: 'center' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  label: { ...type.overline, color: text.tertiary, flexShrink: 1 },
  total: { ...type.overline, ...tokens.numeric, color: text.tertiary, marginLeft: 'auto' },
});
