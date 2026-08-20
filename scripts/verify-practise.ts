/**
 * The practise attempt: the only record in this app of how the *person* is
 * doing rather than how the cube is doing.
 *
 * Practise mode used to reveal without ever asking for an answer, so thirteen
 * taps on Reveal and thirteen correct recalls produced exactly the same state.
 * These checks are about the properties round 5's learner model will lean on:
 * a verdict lands against the trigger it belongs to, a correction replaces
 * rather than double-counts, and the summary never claims a score the learner
 * did not give.
 */
import { applyAlg, solvedState } from '../src/cube/core';
import { buildPlan } from '../src/cube/solver/plan';
import { chunkNameAt } from '../src/ui/notation';
import { byChunk, record, startPractise, summarise, tally } from '../src/learn/session';

let fails = 0;
const check = (name: string, ok: boolean, extra = '') => {
  if (ok) console.log(`ok    ${name}`);
  else {
    fails++;
    console.log(`FAIL  ${name} ${extra}`);
  }
};

// -- 1. an attempt with no answers claims no score ---------------------------

{
  const s = startPractise('step-1', 13, 'trig-sexy');
  check('a fresh attempt has recorded nothing', tally(s).answered === 0);
  check(
    'and the summary states the count rather than inventing a score',
    summarise(s, 13) === 'Done in 13 moves.',
    summarise(s, 13)
  );
  check('a null attempt is safe to summarise', summarise(null, 4) === 'Done in 4 moves.');
}

// -- 2. verdicts count, and the summary is the learner's own -----------------

{
  let s = startPractise('step-1', 13, 'trig-sexy');
  for (let i = 0; i < 11; i++) s = record(s, i, 'knew', 'Sexy move');
  s = record(s, 11, 'missed', 'Sexy move');
  s = record(s, 12, 'missed', null);
  const t = tally(s);
  check('every verdict is counted', t.answered === 13 && t.knew === 11 && t.missed === 2,
    JSON.stringify(t));
  check(
    'the summary answers "how did I do?" with those verdicts',
    summarise(s, 13) === 'Done in 13 moves · 11 knew, 2 missed.',
    summarise(s, 13)
  );
  const clean = (() => {
    let a = startPractise('step-2', 4);
    for (let i = 0; i < 4; i++) a = record(a, i, 'knew', 'Sexy move');
    return a;
  })();
  check('a clean run does not print "0 missed"', summarise(clean, 4) === 'Done in 4 moves · 4 knew.',
    summarise(clean, 4));
}

// -- 3. a correction replaces, it does not double-count ----------------------
//
// A learner who taps the wrong button has no other way back, so the second tap
// has to be the answer. Appending would have made 13 moves report 14 verdicts.

{
  let s = startPractise('step-1', 3, 'trig-sexy');
  s = record(s, 0, 'knew', 'Sexy move');
  s = record(s, 0, 'missed', 'Sexy move');
  const t = tally(s);
  check('changing an answer replaces it', t.answered === 1 && t.missed === 1 && t.knew === 0,
    JSON.stringify(t));
  check('and never reports more verdicts than the step has moves',
    t.answered <= s.total);
  check('sequence numbers stay contiguous from 1',
    s.events.every((e, i) => e.seq === i + 1), JSON.stringify(s.events.map((e) => e.seq)));
}

// -- 4. the event stream is what a learner model can consume -----------------
//
// Round 5's progress.ts groups by what a cuber actually recalls: the trigger,
// not the letter. So every event carries the step, the algorithm and the chunk,
// and the chunk is the one the move really belongs to.

{
  const plan = buildPlan(applyAlg(solvedState(), "R U R' U' F2 L D L' B U2 B' R2 D F R"));
  const step = plan.methods
    .flatMap((m) => m.steps)
    .find((st) => st.algorithmId && st.moves.length > 8);
  if (!step) {
    check('the plan offers a long algorithmic step to practise', false);
  } else {
    const notation = step.moves.map((m) => m.notation);
    let s = startPractise(step.id, notation.length, step.algorithmId);
    notation.forEach((_, i) => {
      s = record(s, i, i % 4 === 3 ? 'missed' : 'knew', chunkNameAt(notation, i));
    });
    check(`every event names its step (${step.title})`,
      s.events.every((e) => e.stepId === step.id));
    check('and the algorithm it is teaching',
      s.events.every((e) => e.algorithmId === step.algorithmId), String(step.algorithmId));
    check('and the move it is about, in order',
      s.events.every((e, i) => e.move === i));
    const named = s.events.filter((e) => e.chunk !== null);
    check(`most moves are attributed to a trigger (${named.length} of ${s.events.length})`,
      named.length >= s.events.length / 2);
    // The chunk on the event must be the chunk that really covers the move.
    const wrong = s.events.filter((e) => e.chunk !== chunkNameAt(notation, e.move));
    check('and to the right one', wrong.length === 0, JSON.stringify(wrong.slice(0, 2)));

    const per = byChunk(s);
    const totals = [...per.values()].reduce(
      (a, t) => ({ knew: a.knew + t.knew, missed: a.missed + t.missed, answered: a.answered + t.answered }),
      { knew: 0, missed: 0, answered: 0 }
    );
    check('grouping by trigger loses nothing',
      JSON.stringify(totals) === JSON.stringify(tally(s)),
      `${JSON.stringify(totals)} vs ${JSON.stringify(tally(s))}`);
    check('and there is more than one group to compare',
      per.size >= 2, [...per.keys()].join(' / '));
  }
}

// -- 5. attempts do not bleed into each other --------------------------------

{
  let s = startPractise('step-1', 4, 'trig-sexy');
  s = record(s, 0, 'missed', 'Sexy move');
  const again = startPractise('step-1', 4, 'trig-sexy');
  check('a second attempt at the same step starts empty', tally(again).answered === 0);
  check('and the first is untouched', tally(s).missed === 1);
}

console.log(fails ? `\n${fails} practise check(s) failed` : '\nall practise checks passed');
process.exit(fails ? 1 : 0);
