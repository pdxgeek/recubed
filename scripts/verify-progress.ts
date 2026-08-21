/**
 * The learner model: does it know what it claims to know?
 *
 * The bar this exists to enforce is one sentence: the app must never tell
 * someone they have learned something they have not. Everything below is that
 * sentence taken apart - watching is not knowing, one clean run is not knowing,
 * a miss undoes it, and an attempt with no answers in it is not evidence of
 * anything.
 */
import {
  KNOWN_STREAK,
  deserialise,
  emptyLearnState,
  finishAttempt,
  masteryOf,
  serialise,
  summary,
  watched,
} from '../src/learn/progress';
import { record, startPractise } from '../src/learn/session';
import { ALGORITHM_ID_BY_NAME } from '../src/cube/algorithms';

let fails = 0;
const check = (name: string, ok: boolean, extra = '') => {
  if (ok) console.log(`ok    ${name}`);
  else {
    fails++;
    console.log(`FAIL  ${name}${extra ? ` - ${extra}` : ''}`);
  }
};

/** One clean attempt at `n` moves of the named trigger. */
const clean = (stepId: string, algorithmId: string, chunk: string, n = 4) => {
  let s = startPractise(stepId, n, algorithmId);
  for (let i = 0; i < n; i++) s = record(s, i, 'knew', chunk);
  return s;
};
const withMiss = (stepId: string, algorithmId: string, chunk: string, n = 4) => {
  let s = startPractise(stepId, n, algorithmId);
  for (let i = 0; i < n; i++) s = record(s, i, i === 1 ? 'missed' : 'knew', chunk);
  return s;
};

// --- a fresh state knows nothing -------------------------------------------
{
  const s = emptyLearnState();
  check('a fresh state is unseen everywhere', masteryOf(s, 'trig-sexy') === 'unseen');
  check('and an unknown id is unseen, not a crash', masteryOf(s, 'no-such-alg') === 'unseen');
  check('and no id at all is unseen', masteryOf(s, undefined) === 'unseen');
  const sum = summary(s);
  check(
    'and nothing is counted as known or learning',
    sum.known === 0 && sum.learning === 0 && sum.knew === 0 && sum.missed === 0,
    JSON.stringify(sum)
  );
  check('while every algorithm in the library is unseen', sum.unseen === ALGORITHM_ID_BY_NAME.size,
    `${sum.unseen} of ${ALGORITHM_ID_BY_NAME.size}`);
}

// --- watching is not knowing ------------------------------------------------
{
  let s = emptyLearnState();
  for (let i = 0; i < 20; i++) s = watched(s, 'trig-sexy');
  check('twenty openings of the sheet leave it learning, never known',
    masteryOf(s, 'trig-sexy') === 'learning', masteryOf(s, 'trig-sexy'));
  check('and the watch count is kept', s.byAlgorithm['trig-sexy'].watched === 20);
  check('and no attempt was invented', s.byAlgorithm['trig-sexy'].attempts === 0);
}

// --- one clean attempt is learning; two is known ----------------------------
{
  let s = emptyLearnState();
  s = finishAttempt(s, clean('step-1', 'trig-sexy', 'Sexy move'));
  check(`one clean attempt is learning (KNOWN_STREAK is ${KNOWN_STREAK})`,
    masteryOf(s, 'trig-sexy') === 'learning', masteryOf(s, 'trig-sexy'));
  s = finishAttempt(s, clean('step-2', 'trig-sexy', 'Sexy move'));
  check('two clean attempts are known', masteryOf(s, 'trig-sexy') === 'known',
    masteryOf(s, 'trig-sexy'));
  check('and the totals are the sum of the attempts',
    s.byAlgorithm['trig-sexy'].knew === 8 && s.byAlgorithm['trig-sexy'].missed === 0,
    JSON.stringify(s.byAlgorithm['trig-sexy']));

  // A miss in attempt three takes it straight back.
  s = finishAttempt(s, withMiss('step-3', 'trig-sexy', 'Sexy move'));
  check('one miss in the third attempt returns it to learning',
    masteryOf(s, 'trig-sexy') === 'learning', masteryOf(s, 'trig-sexy'));
  check('and the streak really is zero, not merely below the bar',
    s.byAlgorithm['trig-sexy'].streak === 0, `${s.byAlgorithm['trig-sexy'].streak}`);
  // And it has to be earned back from scratch.
  s = finishAttempt(s, clean('step-4', 'trig-sexy', 'Sexy move'));
  check('one clean attempt after a miss is not enough', masteryOf(s, 'trig-sexy') === 'learning');
  s = finishAttempt(s, clean('step-5', 'trig-sexy', 'Sexy move'));
  check('two are', masteryOf(s, 'trig-sexy') === 'known');
}

// --- an attempt with no verdicts is not evidence ----------------------------
{
  let s = emptyLearnState();
  s = finishAttempt(s, clean('step-1', 'trig-sexy', 'Sexy move'));
  const before = JSON.stringify(s);
  s = finishAttempt(s, startPractise('step-2', 12, 'trig-sexy'));
  check('an attempt with no verdicts changes nothing at all', JSON.stringify(s) === before);
  s = finishAttempt(s, null);
  check('and neither does no attempt', JSON.stringify(s) === before);
}

// --- one trigger, four faces, one entry -------------------------------------
//
// The whole reason the model is keyed on the id. `Sexy move (back)` is not a
// different thing to learn from `Sexy move`; the solver's four first-layer
// slots all carry `algorithmId: 'trig-sexy'`, and the chunk name is constant
// across faces by construction (`faceVariants`).
{
  let s = emptyLearnState();
  s = finishAttempt(s, clean('beginner-first-corners-3', 'trig-sexy', 'Sexy move'));
  s = finishAttempt(s, clean('beginner-first-corners-5', 'trig-sexy', 'Sexy move'));
  const ids = Object.keys(s.byAlgorithm);
  check('the same trigger on two faces lands on one entry', ids.length === 1 && ids[0] === 'trig-sexy',
    JSON.stringify(ids));
  check('and two attempts at it are two attempts', s.byAlgorithm['trig-sexy'].attempts === 2);
  check('so it is known after the second', masteryOf(s, 'trig-sexy') === 'known');
}

// --- a step credits both what it is and what it is made of ------------------
{
  let s = emptyLearnState();
  // A first-layer corner step: its algorithm is the sexy move, and its chunks
  // are named for the sexy move too. One entry, not two.
  s = finishAttempt(s, clean('step-1', 'trig-sexy', 'Sexy move'));
  check('a step whose algorithm is its own trigger is one entry',
    Object.keys(s.byAlgorithm).length === 1, JSON.stringify(Object.keys(s.byAlgorithm)));

  // A last-layer step: the algorithm is Sune, the moves inside it chunk as the
  // sexy move. Both are rehearsed, so both are credited.
  let t = emptyLearnState();
  let attempt = startPractise('step-2', 7, 'oll-sune');
  attempt = record(attempt, 0, 'knew', 'Sexy move');
  attempt = record(attempt, 1, 'knew', 'Sexy move');
  attempt = record(attempt, 2, 'knew', null);
  t = finishAttempt(t, attempt);
  check('a step built out of a trigger credits both',
    !!t.byAlgorithm['oll-sune'] && !!t.byAlgorithm['trig-sexy'],
    JSON.stringify(Object.keys(t.byAlgorithm)));
  check('and the loose moves are not invented into an algorithm',
    Object.keys(t.byAlgorithm).length === 2, JSON.stringify(Object.keys(t.byAlgorithm)));
  check('the step gets the whole attempt', t.byAlgorithm['oll-sune'].knew === 3);
  check('the trigger gets only its own moves', t.byAlgorithm['trig-sexy'].knew === 2);
}

// --- a miss on the trigger does not spare the step --------------------------
{
  let s = emptyLearnState();
  let attempt = startPractise('step-1', 4, 'oll-sune');
  attempt = record(attempt, 0, 'knew', 'Sexy move');
  attempt = record(attempt, 1, 'missed', 'Sexy move');
  s = finishAttempt(s, attempt);
  check('a miss inside the trigger stops the trigger', s.byAlgorithm['trig-sexy'].streak === 0);
  check('and stops the step it was inside', s.byAlgorithm['oll-sune'].streak === 0);
}

// --- seq is monotonic and clock-free ---------------------------------------
{
  let s = emptyLearnState();
  const seen: number[] = [];
  for (let i = 0; i < 10; i++) {
    s = watched(s, 'oll-sune');
    seen.push(s.seq);
    s = finishAttempt(s, clean(`step-${i}`, 'trig-sexy', 'Sexy move'));
    seen.push(s.seq);
  }
  check('seq only ever goes up', seen.every((n, i) => i === 0 || n > seen[i - 1]), JSON.stringify(seen));
  check('and every entry remembers where it last moved',
    s.byAlgorithm['trig-sexy'].lastSeq > s.byAlgorithm['oll-sune'].lastSeq);
}

// --- the state is a value, not a thing that gets mutated --------------------
{
  const a = finishAttempt(emptyLearnState(), clean('step-1', 'trig-sexy', 'Sexy move'));
  const snapshot = JSON.stringify(a);
  const b = finishAttempt(a, clean('step-2', 'trig-sexy', 'Sexy move'));
  check('folding an attempt does not touch the state it came from', JSON.stringify(a) === snapshot);
  check('and the new one is different', JSON.stringify(b) !== snapshot);
}

// --- a store would be a leaf change ----------------------------------------
{
  let s = emptyLearnState();
  s = watched(s, 'oll-sune');
  s = finishAttempt(s, clean('step-1', 'trig-sexy', 'Sexy move'));
  s = finishAttempt(s, withMiss('step-2', 'beg-cross', 'Yellow cross'));
  const round = deserialise(serialise(s));
  check('deserialise(serialise(s)) is s', JSON.stringify(round) === JSON.stringify(s),
    `${serialise(round)}\n      ${serialise(s)}`);
  for (const junk of ['', 'not json', '{}', '{"v":2}', 'null', '[]', '{"v":1,"seq":0}']) {
    const back = deserialise(junk);
    if (JSON.stringify(back) !== JSON.stringify(emptyLearnState())) {
      fails++;
      console.log(`FAIL  deserialise("${junk}") gave ${serialise(back)}`);
    }
  }
  check('and anything unreadable comes back empty rather than throwing', true);
}

// --- the summary adds up ----------------------------------------------------
{
  let s = emptyLearnState();
  s = finishAttempt(s, clean('a', 'trig-sexy', 'Sexy move'));
  s = finishAttempt(s, clean('b', 'trig-sexy', 'Sexy move'));
  s = finishAttempt(s, withMiss('c', 'beg-cross', 'Yellow cross'));
  s = watched(s, 'pll-t');
  const sum = summary(s);
  check('the summary counts one known, two learning', sum.known === 1 && sum.learning === 2,
    JSON.stringify(sum));
  check('and the three states cover the library exactly',
    sum.known + sum.learning + sum.unseen === ALGORITHM_ID_BY_NAME.size, JSON.stringify(sum));
  check('and the verdicts add up', sum.knew === 8 + 3 && sum.missed === 1, JSON.stringify(sum));
}

console.log(`\n${fails ? `${fails} progress check(s) failed` : 'all progress checks passed'}`);
process.exit(fails ? 1 : 0);
