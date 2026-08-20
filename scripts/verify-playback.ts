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
import { atEnd, atStart, back, commit, forward, restart, startStep, stepStartState } from '../src/cube/run';
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
    if (!p.base.home.every((h, i) => h === i)) bad++; // tracking restarts here
  }
  check('every step begins at origin + its own prelude', bad === 0, `${bad} of ${steps.length}`);
}

// -- 2. picking a second step mid-run ----------------------------------------
{
  const a = steps[2];
  const b = steps[5];
  let p = startStep(origin, a);
  for (let i = 0; i < 3 && !atEnd(p); i++) p = forward(p);

  // The fix: the second step is measured from the origin the plan describes,
  // not from where the first step happened to leave the cube.
  const second = startStep(p.origin, b);
  check('picking a second step without closing the first starts from the right cube',
    sameColors(second.live, applyAlg(origin, b.prelude)));

  // The shape of the old bug, spelled out so it cannot creep back: measuring
  // from the previous step's base stacks the two preludes.
  const stacked = stepStartState(p.base, b);
  check('and that is genuinely different from stacking the preludes',
    !sameColors(stacked, second.live) || b.prelude.length === 0);

  // Playing the second step through must reach the position the plan intends.
  let q = second;
  while (!atEnd(q)) q = forward(q);
  check('playing it through lands where the plan says it should',
    sameColors(q.live, applyAlg(origin, [...b.prelude, ...b.moves])));
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
  while (!atEnd(p)) p = forward(p);
  const done = p;
  p = restart(p);
  check('restart returns to the step\'s start, tracking and all', same(p.live, p.base) && atStart(p));
  check('back at the start is a no-op', back(p) === p);
  check('forward at the end is a no-op', forward(done) === done);
  check('a step that has run to the end reports it', atEnd(done) && !atStart(done));
}

// -- 5. committing a finished step moves the origin on ------------------------
{
  const first = steps[1];
  let p = startStep(origin, first);
  while (!atEnd(p)) p = forward(p);
  const nextOrigin = commit(p);
  const rebuilt = planSteps(nextOrigin);
  check('the cube a finished step leaves behind is a legal cube with a plan of its own',
    rebuilt.length > 0, `${rebuilt.length} steps`);
  const after = startStep(nextOrigin, rebuilt[0]);
  check('and the next step measured from it starts where it says it does',
    sameColors(after.live, applyAlg(nextOrigin, rebuilt[0].prelude)));
}

console.log(fails ? `\n${fails} playback check(s) failed` : '\nall playback checks passed');
process.exit(fails ? 1 : 0);
