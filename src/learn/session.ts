/**
 * What happened while a learner practised one step.
 *
 * Practise mode covers the moves ahead and reveals them one at a time, which
 * makes it possible to test recall but does not on its own test anything: the
 * app never asked the learner to commit to an answer, so it could not tell
 * "watched thirteen moves go by" from "knew twelve of thirteen". One tap after
 * each reveal - `✓ Knew it` / `✗ Missed it` - turns *uncover* into *commit then
 * check*, and produces the only record in this app of how the person is doing
 * rather than how the cube is doing.
 *
 * No react-native import, so `scripts/verify-practise.ts` can load it.
 *
 * **This is deliberately not a learner model.** It records one step's attempt
 * and forgets it when the step closes. Round 5's `src/learn/progress.ts` is
 * what accumulates across steps and sessions; everything it needs is on
 * `RecallEvent` - which step, which algorithm, which trigger, which move, and
 * the verdict - and `byChunk` is the shape it wants that from, because the unit
 * a cuber recalls is the trigger, not the letter.
 */

export type Recall = 'knew' | 'missed';

export interface RecallEvent {
  /**
   * Position in the session, from 1. Monotonic and clock-free: a consumer can
   * order and de-duplicate these without the app owning a notion of time, and
   * a re-run of the same step starts a new session rather than continuing this
   * one.
   */
  seq: number;
  /** The step being practised. Stable for the life of a plan. */
  stepId: string;
  /** The library entry the step teaches, when it has one. */
  algorithmId?: string;
  /** The trigger this move belongs to - the unit of recall. Null outside one. */
  chunk: string | null;
  /** Index of the move inside the step, from 0. */
  move: number;
  outcome: Recall;
}

export interface PractiseSession {
  stepId: string;
  algorithmId?: string;
  /** Moves in the step, so a partial attempt is still interpretable. */
  total: number;
  events: RecallEvent[];
}

export function startPractise(
  stepId: string,
  total: number,
  algorithmId?: string
): PractiseSession {
  return { stepId, algorithmId, total, events: [] };
}

/**
 * Record one verdict. Immutable, like the rest of the app's state modules, and
 * idempotent per move: a second verdict on the same move corrects the first
 * rather than counting twice.
 *
 * The route that reaches it is `‹ Previous move` and then `Reveal` again - the
 * transport is deliberately not disabled while practising, and stepping back
 * re-arms the report for the move you stepped back onto. The verdict buttons
 * themselves vanish the moment either is tapped, so there is no in-place
 * correction: this is what makes going back safe rather than double-counting,
 * not a second chance at the same button.
 */
export function record(
  session: PractiseSession,
  move: number,
  outcome: Recall,
  chunk: string | null
): PractiseSession {
  const kept = session.events.filter((e) => e.move !== move);
  const event: RecallEvent = {
    seq: kept.length + 1,
    stepId: session.stepId,
    algorithmId: session.algorithmId,
    chunk,
    move,
    outcome,
  };
  const events = [...kept, event]
    .sort((a, b) => a.move - b.move)
    .map((e, i) => ({ ...e, seq: i + 1 }));
  return { ...session, events };
}

export interface Tally {
  knew: number;
  missed: number;
  answered: number;
}

export function tally(session: PractiseSession | null): Tally {
  const events = session?.events ?? [];
  const knew = events.filter((e) => e.outcome === 'knew').length;
  return { knew, missed: events.length - knew, answered: events.length };
}

/** How the learner did per trigger - the shape a learner model consumes. */
export function byChunk(session: PractiseSession): Map<string, Tally> {
  const out = new Map<string, Tally>();
  for (const e of session.events) {
    const key = e.chunk ?? '(loose moves)';
    const t = out.get(key) ?? { knew: 0, missed: 0, answered: 0 };
    t.answered++;
    if (e.outcome === 'knew') t.knew++;
    else t.missed++;
    out.set(key, t);
  }
  return out;
}

/**
 * The line shown when the step is finished. It answers "how did I do?" with the
 * learner's own verdicts, and falls back to the move count when they answered
 * nothing - a count is a fact, and inventing a score from no answers is not.
 */
export function summarise(session: PractiseSession | null, moves: number): string {
  const { knew, missed, answered } = tally(session);
  if (answered === 0) return `Done in ${moves} moves.`;
  const score = missed === 0 ? `${knew} knew` : `${knew} knew, ${missed} missed`;
  // Practise off and on again starts a fresh attempt while the step stays where
  // it was, so an attempt can end with fewer answers than the step has moves.
  // "21 moves · 5 knew" reads as a clean run of 21; it was five. The module
  // will not invent the other sixteen, so it says how many there were.
  const total = session?.total ?? answered;
  if (answered < total) {
    return `Done in ${moves} moves · answered ${answered} of ${total} · ${score}.`;
  }
  return `Done in ${moves} moves · ${score}.`;
}
