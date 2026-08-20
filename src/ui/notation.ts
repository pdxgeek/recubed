/**
 * How a move sequence is read.
 *
 * No react-native import, so `scripts/verify-notation.ts` can load it. That is
 * the point of the file: the two rules below are the ones that decide what a
 * learner sees written down, and both used to live inside JSX where nothing
 * could check them.
 *
 *  1. **A repeated trigger prints one period, not all of them.** `Sexy move ×5`
 *     followed by `R U R' U'` five times says the same thing twice and wraps
 *     onto two lines. The count is already in the label - but the *total* is
 *     what a learner following along needs ("this step is twenty moves, not
 *     four"), so the block states it, and the whole run is one tap away.
 *  2. **A row never prints the same words twice.** The algorithm tag was
 *     suppressed when it equalled the step's title (rule N4, round 2); it was
 *     not suppressed when it equalled a chunk's name, so the active card read
 *     `Sexy move · Sexy move · L U L' U'`. Face qualifiers are stripped before
 *     comparing, because `Sexy move (back)` and `Sexy move` are the same words
 *     to a reader.
 */
import { chunkByTriggers } from '../cube/algorithms';

export interface NotationBlock {
  /** Index of the block's first move in the sequence. */
  start: number;
  /** The trigger's name, without the count. Null for a plain run of moves. */
  name: string | null;
  /** The name with its count - `Sexy move ×5` - or null. */
  label: string | null;
  /** How many times the trigger runs back to back. 1 for a plain run. */
  repeat: number;
  /** One repetition: what a collapsed block prints. */
  period: string[];
  /** Every move the block covers, repeats included. */
  all: string[];
}

/** The blocks a sequence reads as, collapsed. */
export function notationBlocks(notation: string[]): NotationBlock[] {
  return chunkByTriggers(notation).map((chunk) => {
    const all = notation.slice(chunk.start, chunk.start + chunk.length);
    return {
      start: chunk.start,
      name: chunk.label,
      label: chunk.label ? `${chunk.label}${chunk.repeat > 1 ? ` ×${chunk.repeat}` : ''}` : null,
      repeat: chunk.repeat,
      period: all.slice(0, chunk.length / chunk.repeat),
      all,
    };
  });
}

/** The one-line form a collapsed row shows. */
export function summaryLine(notation: string[]): string {
  return notationBlocks(notation)
    .map((b) => b.label ?? b.all.join(' '))
    .join(' · ');
}

/**
 * An algorithm name without its face qualifier: `Sexy move (back)` is the same
 * words as `Sexy move`, and the moves printed underneath already say the face.
 */
export const baseName = (algorithm: string) => algorithm.replace(/\s*\([^)]*\)\s*$/, '').trim();

/**
 * The tag a step row shows beside its notation, or null when showing it would
 * repeat something already on the row.
 */
export function tagFor(
  title: string,
  algorithm: string | null | undefined,
  notation: string[]
): string | null {
  if (!algorithm) return null;
  if (algorithm === title) return null;
  const base = baseName(algorithm);
  if (base === baseName(title)) return null;
  const names = notationBlocks(notation)
    .map((b) => b.name)
    .filter((n): n is string => n !== null)
    .map(baseName);
  if (names.includes(base)) return null;
  return algorithm;
}
