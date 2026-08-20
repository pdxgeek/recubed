/**
 * Stepping through a plan: src/cube/run.ts.
 *
 * The bug this locks down: a step's prelude is absolute, measured from the cube
 * the plan was built for. It used to be applied to whatever cube was on screen,
 * which after picking one step is the *previous* step's starting position. So
 * picking a second step without closing the first ran `origin + preludeA +
 * preludeB` and demonstrated the algorithm on a cube it does not apply to.
 */
import { CubeState, applyAlg, solvedState } from '../src/cube/core';
import {
  Playback,
  atEnd,
  atStart,
  back,
  close,
  forward,
  nextMove,
  prevMove,
  restart,
  selectStep,
  startStep,
  stepStartState,
} from '../src/cube/run';
import { PlanStep, buildPlan } from '../src/cube/solver/plan';

let fails = 0;
const check = (name: string, ok: boolean, extra = '') => {
  if (ok) console.log(`ok    ${name}`);
  else {
    fails++;
    console.log(`FAIL  ${name} ${extra}`);
  }
};

const same = (a: CubeState, b: CubeState) =>
  a.colors.join(',') === b.colors.join(',') && a.home.join(',') === b.home.join(',');
const sameColors = (a: CubeState, b: CubeState) => a.colors.join(',') === b.colors.join(',');

let seed = 4242;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const FACES = ['U', 'D', 'R', 'L', 'F', 'B'];
const SUFFIX = ['', "'", '2'];
function scramble(n = 25): string {
  const out: string[] = [];
  let last = '';
  while (out.length < n) {
    const f = FACES[Math.floor(rnd() * 6)];
    if (f === last) continue;
    last = f;
    out.push(f + SUFFIX[Math.floor(rnd() * 3)]);
  }
  return out.join(' ');
}

function planSteps(origin: CubeState): PlanStep[] {
  const plan = buildPlan(origin);
  if (!plan.ok) return [];
  return plan.methods.flatMap((m) => m.steps).filter((s) => s.moves.length > 0);
}

const origin = applyAlg(solvedState(), scramble());
const steps = planSteps(origin);
check('the test has a plan to work with', steps.length > 6, `${steps.length} steps`);

// -- 1. any step starts from the plan's own origin ---------------------------
{
  let bad = 0;
  for (const step of steps) {
    const p = startStep(origin, step);
    if (!sameColors(p.live, applyAlg(origin, step.prelude))) bad++;
    if (p.step !== step) bad++;
    if (!p.base.home.every((h, i) => h === i)) bad++; // tracking restarts here
  }
  check('every step begins at origin + its own prelude', bad === 0, `${bad} of ${steps.length}`);
}

// -- 2. picking a second step mid-run ----------------------------------------
//
// The round-1 blocker. A step's prelude is absolute, so the second step has to
// be measured from the cube the plan describes. `selectStep` reads that out of
// the open session, so a caller cannot supply the wrong cube - which is the
// mistake that caused the bug and the one a test has to be able to catch.
{
  const a = steps[2];
  const b = steps[5];
  let p: Playback | null = selectStep(null, origin, a);
  for (let i = 0; i < 3 && !atEnd(p); i++) p = forward(p);

  const second = selectStep(p, /* deliberately wrong */ p.live, b);
  check('a second step is measured from the plan origin, not from the open step',
    sameColors(second.live, applyAlg(origin, b.prelude)));
  check('and the fallback origin is ignored entirely while a session is open',
    second.origin === p.origin);

  // The shape of the old bug, spelled out so it cannot creep back.
  const stacked = stepStartState(p.base, b);
  check('stacking the two preludes really would give a different cube',
    !sameColors(stacked, second.live) || b.prelude.length === 0);

  // Playing the second step through must reach the position the plan intends.
  let q = second;
  while (!atEnd(q)) q = forward(q);
  check('playing it through lands where the plan says it should',
    sameColors(q.live, applyAlg(origin, [...b.prelude, ...b.moves])));

  // Round-trip: A -> B -> A must land on A's start again, byte for byte.
  const backToA = selectStep(q, q.live, a);
  check('going back to the first step lands on exactly its own starting cube',
    same(backToA.live, selectStep(null, origin, a).live));

  // With no session open the fallback is what is used.
  const fresh = selectStep(null, origin, b);
  check('with nothing open, the fallback origin is the origin',
    sameColors(fresh.live, applyAlg(origin, b.prelude)));
}

// -- 3. forward and back are exact inverses ----------------------------------
{
  let bad = 0;
  for (const step of steps) {
    let p = startStep(origin, step);
    const start = p;
    let n = 0;
    while (!atEnd(p)) {
      p = forward(p);
      n++;
    }
    for (let i = 0; i < n; i++) p = back(p);
    if (!same(p.live, start.live) || p.index !== 0) bad++;
  }
  check('forward × n then back × n returns to the exact starting cube', bad === 0, `${bad} of ${steps.length}`);
}

// -- 4. restart, and the guards at either end --------------------------------
{
  let p = startStep(origin, steps[3]);
  check('a fresh step reports the move it is about to play', nextMove(p) === steps[3].moves[0]);
  check('and has nothing to undo yet', prevMove(p) === null);
  while (!atEnd(p)) p = forward(p);
  const done = p;
  check('at the end there is no next move', nextMove(done) === null);
  p = restart(p);
  check("restart returns to the step's start, tracking and all", same(p.live, p.base) && atStart(p));
  check('back at the start is a no-op', back(p) === p);
  check('forward at the end is a no-op', forward(done) === done);
  check('a step that has run to the end reports it', atEnd(done) && !atStart(done));
}

// -- 5. closing a step: commit keeps the moves, a preview puts them back ------
{
  const first = steps[1];
  let p = startStep(origin, first);
  while (!atEnd(p)) p = forward(p);
  const kept = close(p);
  check('a committed step leaves the cube where it finished', same(kept, p.live));

  let preview = startStep(origin, first, false);
  while (!atEnd(preview)) preview = forward(preview);
  check('an uncommitted step puts the cube back where it started',
    same(close(preview), preview.base));

  const rebuilt = planSteps(kept);
  check('the cube a finished step leaves behind is legal and has a plan of its own',
    rebuilt.length > 0, `${rebuilt.length} steps`);
  const after = startStep(kept, rebuilt[0]);
  check('and the next step measured from it starts where it says it does',
    sameColors(after.live, applyAlg(kept, rebuilt[0].prelude)));
}

console.log(fails ? `\n${fails} playback check(s) failed` : '\nall playback checks passed');
process.exit(fails ? 1 : 0);
