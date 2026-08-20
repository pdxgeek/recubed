import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Move } from '../cube/core';
import { chunkByTriggers } from '../cube/algorithms';
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

  if (moves.length <= rawBelow || chunks.every((c) => !c.label)) {
    return (
      <Text style={[styles.mono, style]} numberOfLines={numberOfLines}>
        {raw}
      </Text>
    );
  }

  if (variant === 'summary') {
    const text = chunks
      .map((c) =>
        c.label
          ? `${c.label}${c.repeat > 1 ? ` ×${c.repeat}` : ''}`
          : notation.slice(c.start, c.start + c.length).join(' ')
      )
      .join(' · ');
    return (
      <Text style={[styles.summary, style]} numberOfLines={numberOfLines ?? 1}>
        {text}
      </Text>
    );
  }

  return (
    <View style={[styles.blocks, style]}>
      {chunks.map((chunk) => (
        <View key={chunk.start} style={styles.block}>
          {chunk.label ? (
            <Text style={styles.label} numberOfLines={1}>
              {chunk.label}
              {chunk.repeat > 1 ? ` ×${chunk.repeat}` : ''}
            </Text>
          ) : null}
          <Text style={styles.mono}>
            {notation.slice(chunk.start, chunk.start + chunk.length).join(' ')}
          </Text>
        </View>
      ))}
    </View>
  );
}

const { line, text, space, type, radius } = tokens;

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
  label: { ...type.overline, color: text.tertiary },
});
