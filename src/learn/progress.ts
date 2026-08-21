/**
 * What the learner knows, accumulated across steps.
 *
 * `session.ts` records one step's attempt and forgets it when the step closes.
 * This is the thing that does not forget - keyed on ALGORITHM ID, because the
 * unit a person learns is the algorithm, not the step: the sexy move turns up
 * in four steps of a single solve, on four different faces, and someone who
 * knows it knows it once.
 *
 * Pure and clock-free, for the same reason `session.ts` is. `seq` orders
 * events, so this module never has to own a notion of time and
 * `scripts/verify-progress.ts` can drive a whole learning history through it in
 * a loop. No react-native import either.
 *
 * **Session-scoped, deliberately.** `serialise` / `deserialise` are here so
 * that adding a store later is a leaf change in `App.tsx` and nothing else, and
 * there is no store now: `AGENTS.md` opens by recording that this project was
 * already burned by a native module that fails in Expo Go, and adding one on
 * the final round to a project whose verification is entirely headless is how
 * you ship a broken app. The UI says THIS SESSION so the app never claims
 * something it cannot keep.
 */
import { ALGORITHM_ID_BY_NAME } from '../cube/algorithms';
import { PractiseSession, byChunk, tally } from './session';

/** Three states. The thresholds are the whole pedagogy, so they live here. */
export type Mastery = 'unseen' | 'learning' | 'known';

export interface AlgorithmProgress {
  id: string;
  /** Times its "why this works" sheet was opened. */
  watched: number;
  /** Attempts that carried at least one verdict on it. */
  attempts: number;
  knew: number;
  missed: number;
  /** Consecutive attempts in which every verdict on it was `knew`. */
  streak: number;
  /** `seq` of the most recent event, so "recent" is orderable without a clock. */
  lastSeq: number;
}

export interface LearnState {
  byAlgorithm: Record<string, AlgorithmProgress>;
  /** Monotonic across the whole app run; the only counter. */
  seq: number;
}

export const emptyLearnState = (): LearnState => ({ byAlgorithm: {}, seq: 0 });

/**
 * Clean attempts in a row before something counts as known.
 *
 * Two, not one. One clean attempt at a four-move trigger you have just watched
 * is short-term memory, and telling someone they have learned something they
 * have not is the one thing a training app must never do. Two separated
 * attempts is the cheapest honest bar.
 */
export const KNOWN_STREAK = 2;

export function mastery(p: AlgorithmProgress | undefined): Mastery {
  if (!p || (p.watched === 0 && p.attempts === 0)) return 'unseen';
  return p.streak >= KNOWN_STREAK ? 'known' : 'learning';
}

export const masteryOf = (s: LearnState, id: string | undefined): Mastery =>
  id ? mastery(s.byAlgorithm[id]) : 'unseen';

const blank = (id: string): AlgorithmProgress => ({
  id,
  watched: 0,
  attempts: 0,
  knew: 0,
  missed: 0,
  streak: 0,
  lastSeq: 0,
});

/** The sheet was opened. Never demotes: watching is not knowing. */
export function watched(s: LearnState, algorithmId?: string): LearnState {
  if (!algorithmId) return s;
  const seq = s.seq + 1;
  const was = s.byAlgorithm[algorithmId] ?? blank(algorithmId);
  return {
    seq,
    byAlgorithm: { ...s.byAlgorithm, [algorithmId]: { ...was, watched: was.watched + 1, lastSeq: seq } },
  };
}

/**
 * A whole practise attempt, folded in when the step closes or completes.
 *
 * A whole attempt rather than one verdict at a time, for two reasons: `record`
 * is idempotent per move and a learner can go back and answer again, so a
 * per-verdict fold would count a correction as an attempt; and a streak is a
 * property of an attempt, not of a move.
 *
 * The step's own algorithm gets an entry, and so does every trigger named in
 * `byChunk` that resolves through `ALGORITHM_ID_BY_NAME` - so practising
 * "White-green-orange corner" credits both the step's algorithm and the sexy
 * move it is built from, which is what the learner actually rehearsed.
 *
 * An attempt with no verdicts is discarded entirely. The learner uncovered
 * moves and never said how they did, and inventing a verdict from that is
 * exactly what `summarise` already refuses to do.
 */
export function finishAttempt(s: LearnState, session: PractiseSession | null): LearnState {
  if (!session) return s;
  const whole = tally(session);
  if (whole.answered === 0) return s;

  /** id -> the tally that decides its streak this attempt. */
  const credited = new Map<string, { knew: number; missed: number; answered: number }>();
  if (session.algorithmId) credited.set(session.algorithmId, whole);
  for (const [name, t] of byChunk(session)) {
    const id = ALGORITHM_ID_BY_NAME.get(name);
    if (!id) continue; // "(loose moves)", and anything the library does not name
    const was = credited.get(id);
    // A step whose own algorithm is also one of its triggers is one entry, and
    // the whole-attempt tally is the one that decides its streak.
    if (!was) credited.set(id, t);
  }
  if (credited.size === 0) return s;

  let seq = s.seq;
  const byAlgorithm = { ...s.byAlgorithm };
  for (const [id, t] of credited) {
    seq++;
    const was = byAlgorithm[id] ?? blank(id);
    byAlgorithm[id] = {
      ...was,
      attempts: was.attempts + 1,
      knew: was.knew + t.knew,
      missed: was.missed + t.missed,
      // A single miss resets it. Nothing else in this module is unforgiving,
      // and this is the one place it has to be.
      streak: t.missed === 0 && t.answered > 0 ? was.streak + 1 : 0,
      lastSeq: seq,
    };
  }
  return { seq, byAlgorithm };
}

/** Everything the app knows, counted. */
export function summary(s: LearnState): {
  known: number;
  learning: number;
  unseen: number;
  knew: number;
  missed: number;
} {
  let known = 0;
  let learning = 0;
  let knew = 0;
  let missed = 0;
  const all = Object.values(s.byAlgorithm);
  for (const p of all) {
    const m = mastery(p);
    if (m === 'known') known++;
    else if (m === 'learning') learning++;
    knew += p.knew;
    missed += p.missed;
  }
  return { known, learning, unseen: ALGORITHM_ID_BY_NAME.size - known - learning, knew, missed };
}

/**
 * For a future store; nothing in the app calls these yet.
 *
 * They exist so that the decision not to persist is a decision about `App.tsx`
 * and not about this module. `deserialise` is total: anything it cannot read
 * comes back as an empty state rather than as a throw, because a corrupt store
 * must not stop the app from starting.
 */
export function serialise(s: LearnState): string {
  return JSON.stringify({ v: 1, seq: s.seq, byAlgorithm: s.byAlgorithm });
}

export function deserialise(json: string): LearnState {
  try {
    const raw = JSON.parse(json);
    if (!raw || raw.v !== 1 || typeof raw.seq !== 'number' || !raw.byAlgorithm) {
      return emptyLearnState();
    }
    const byAlgorithm: Record<string, AlgorithmProgress> = {};
    for (const [id, p] of Object.entries(raw.byAlgorithm as Record<string, AlgorithmProgress>)) {
      if (!p || typeof p !== 'object') continue;
      byAlgorithm[id] = {
        id,
        watched: Number(p.watched) || 0,
        attempts: Number(p.attempts) || 0,
        knew: Number(p.knew) || 0,
        missed: Number(p.missed) || 0,
        streak: Number(p.streak) || 0,
        lastSeq: Number(p.lastSeq) || 0,
      };
    }
    return { seq: raw.seq, byAlgorithm };
  } catch {
    return emptyLearnState();
  }
}
