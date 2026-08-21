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

/**
 * The trigger a given move belongs to, or null if it belongs to none. The unit
 * a cuber recalls is the trigger - "what does the sexy move expand to" - so a
 * practise verdict is recorded against this rather than against the letter.
 */
export function chunkNameAt(notation: string[], move: number): string | null {
  for (const b of notationBlocks(notation)) {
    if (move >= b.start && move < b.start + b.all.length) return b.name;
  }
  return null;
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

/**
 * Prose with its move sequences taken out, for practise mode.
 *
 * The "why this works" sheet is the one place a learner can go for help in the
 * middle of a covered run, so taking it away would be the wrong fix. But its
 * explanations quote the moves - "then repeat B U B' U' until it drops in" is
 * the whole answer to a step that is `B U B' U'` five times over - and a
 * feature whose premise is "you cannot spoil it" cannot print that.
 *
 * A run of two or more turns is a sequence and goes. A single turn stays: "F
 * opens the top layer, and F' folds it back" is how the sentence explains the
 * mechanism, one move on its own is not an answer to anything, and blanking
 * them would leave the prose unreadable.
 */
const MOVE_TOKEN = /^[URFDLBMES]w?(?:2|')?$|^[xyz](?:2|')?$/;

export function maskMoveRuns(text: string, mask = '\u2026'): string {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let run: string[] = [];
  /** Trailing punctuation is part of the sentence, not part of the move. */
  const split = (w: string) => {
    const bare = w.replace(/[.,;:!?)\]]+$/, '');
    return { bare, tail: w.slice(bare.length) };
  };
  const flush = () => {
    if (run.length >= 2) out.push(mask);
    else out.push(...run);
    run = [];
  };
  for (const w of words) {
    const { bare, tail } = split(w);
    if (MOVE_TOKEN.test(bare)) {
      run.push(bare);
      if (tail) {
        // A move that ends a clause ends the run with it.
        const wasRun = run.length >= 2;
        flush();
        out[out.length - 1] = wasRun ? mask + tail : bare + tail;
      }
      continue;
    }
    flush();
    out.push(w);
  }
  flush();
  return out.join(' ');
}
