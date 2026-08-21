import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Move } from '../cube/core';
import { NotationBlock, notationBlocks, summaryLine } from '../ui/notation';
import { spokenMove } from '../ui/glyphs';
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
 *
 * The chunking itself lives in `src/ui/notation.ts`, which imports no
 * react-native, so `scripts/verify-notation.ts` can check that a collapsed
 * block still accounts for every move.
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
  const blocks = useMemo(() => notationBlocks(notation), [notation]);
  const raw = notation.join(' ');
  const [expanded, setExpanded] = useState<number[]>([]);

  if (moves.length <= rawBelow || blocks.every((b) => !b.label)) {
    return (
      <Text style={[styles.mono, style]} numberOfLines={numberOfLines}>
        {raw}
      </Text>
    );
  }

  if (variant === 'summary') {
    return (
      <Text style={[styles.summary, style]} numberOfLines={numberOfLines ?? 1}>
        {summaryLine(notation)}
      </Text>
    );
  }

  return (
    <View style={[styles.blocks, style]}>
      {blocks.map((block: NotationBlock) => {
        const open = expanded.includes(block.start);
        const text = (block.repeat > 1 && !open ? block.period : block.all).join(' ');
        const spokenAll = block.all.map(spokenMove).join(', ');
        const body = (
          <>
            {block.label ? (
              <View style={styles.labelRow}>
                <Text style={styles.label} numberOfLines={1}>
                  {block.label}
                </Text>
                {block.repeat > 1 && (
                  <Text style={styles.total}>{block.all.length} moves</Text>
                )}
              </View>
            ) : null}
            <Text style={styles.mono}>{text}</Text>
          </>
        );

        // Only a collapsed repeat is worth a control: everything else is
        // already printed in full, so a Pressable there would be a 44pt target
        // that does nothing.
        if (block.repeat === 1) {
          return (
            <View key={block.start} style={styles.block}>
              {body}
            </View>
          );
        }
        return (
          <Pressable
            key={block.start}
            onPress={() =>
              setExpanded((prev) =>
                prev.includes(block.start)
                  ? prev.filter((n) => n !== block.start)
                  : [...prev, block.start]
              )
            }
            style={[styles.block, styles.blockTappable]}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            aria-expanded={open}
            accessibilityLabel={`${block.label}: ${spokenAll}. ${block.all.length} moves.`}
            accessibilityHint={
              open ? 'Collapses to one repeat' : `Writes out all ${block.all.length} moves`
            }
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
