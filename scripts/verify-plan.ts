/**
 * End-to-end check: build a solve plan for a painted cube, then run every step
 * through the app's own facelet engine and confirm the cube ends up solved.
 * This covers the whole-cube setup rotation that the beginner solve starts with.
 */
import { CubeState, applyAlg, isSolved, solvedState, parseAlg } from '../src/cube/core';
import { BASIC_MOVES } from '../src/cube/cubie';
import {
  buildPlan,
  buildShortest,
  cubeKey,
  currentShortest,
  relabelMethod,
  stageProgress,
} from '../src/cube/solver/plan';
import { ROTATIONS } from '../src/cube/orientation';

let seed = Number(process.argv[3] ?? 5150);
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const scramble = (n = 25) =>
  Array.from({ length: n }, () => BASIC_MOVES[Math.floor(rnd() * 18)]).join(' ');

const N = Number(process.argv[2] ?? 40);
let fails = 0;
let beginnerMoves = 0;
let shortMoves = 0;
let checkedShort = 0;

for (let i = 0; i < N; i++) {
  const s = scramble();
  const start: CubeState = applyAlg(solvedState(), s);

  const plan = buildPlan(start);
  if (!plan.ok) {
    fails++;
    console.log(`FAIL  plan rejected a legal cube: ${plan.error}\n      ${s}`);
    continue;
  }
  const beginner = plan.methods.find((m) => m.id === 'beginner')!;
  if (!beginner.steps.length) {
    fails++;
    console.log(`FAIL  no beginner steps for ${s}`);
    continue;
  }

  let cube = start;
  for (const step of beginner.steps) cube = applyAlg(cube, step.moves);
  if (!isSolved(cube)) {
    fails++;
    console.log(`FAIL  beginner plan did not solve: ${s}`);
  }
  beginnerMoves += beginner.steps.reduce((n, st) => n + st.moves.length, 0);

  // The optimal search is slower, so spot-check it.
  if (i % 5 === 0) {
    const short = buildShortest(start);
    const step = short.steps[0];
    if (!step) {
      fails++;
      console.log(`FAIL  no shortest solve for ${s}`);
    } else {
      if (!isSolved(applyAlg(start, step.moves))) {
        fails++;
        console.log(`FAIL  shortest solve did not solve: ${s}`);
      }
      shortMoves += step.moves.length;
      checkedShort++;
    }
  }
}

// A cube that cannot exist must be reported, not silently solved.
{
  const broken = applyAlg(solvedState(), 'R');
  broken.colors[0] = 'Y';
  const plan = buildPlan(broken);
  if (plan.ok) {
    fails++;
    console.log('FAIL  an impossible cube was accepted');
  } else {
    console.log(`ok    impossible cube reported: "${plan.error}"`);
  }
}

// --- the cached shortest solve is only shown while it still fits the cube ----
//
// The regression this locks down: round 1 replaced an over-eager invalidation
// with none at all, so a twenty-move solve computed before a step was played
// survived it - displayed, and tappable, and wrong.
{
  const origin = applyAlg(solvedState(), scramble());
  const plan = buildPlan(origin);
  const shortest = buildShortest(origin);
  const step = plan.ok ? plan.methods.flatMap((m) => m.steps).find((st) => st.moves.length > 0) : null;

  if (!step || shortest.steps.length === 0) {
    fails++;
    console.log('FAIL  could not set up the stale-solve check');
  } else {
    if (currentShortest(shortest, origin) !== shortest) {
      fails++;
      console.log('FAIL  a freshly computed solve is not offered for the cube it was computed for');
    } else {
      console.log('ok    a freshly computed solve is offered for its own cube');
    }

    // Play a step and keep it: the cube really has changed.
    const after = applyAlg(applyAlg(origin, step.prelude), step.moves);
    if (cubeKey(after) === cubeKey(origin)) {
      fails++;
      console.log('FAIL  the test step did not change the cube');
    }
    const stillSolves = isSolved(applyAlg(after, shortest.steps[0].moves));
    if (stillSolves) {
      console.log('ok    (the stale solution happened to still solve this cube)');
    } else if (currentShortest(shortest, after) !== null) {
      fails++;
      console.log('FAIL  a solve that no longer solves the cube is still offered');
    } else {
      console.log('ok    a solve that no longer fits the cube is withdrawn');
    }

    // Re-labelling is not a change: the moves are rewritten and re-stamped.
    let relabelled = 0;
    let kept = 0;
    for (const rot of ROTATIONS) {
      if (!rot.alg) continue;
      const held = applyAlg(origin, rot.alg);
      const moved = relabelMethod(shortest, rot, held);
      relabelled++;
      if (!moved) continue;
      if (currentShortest(moved, held) === moved && isSolved(applyAlg(held, moved.steps[0].moves))) {
        kept++;
      }
    }
    if (kept !== relabelled) {
      fails++;
      console.log(`FAIL  ${relabelled - kept} of ${relabelled} re-labellings lost the solve`);
    } else {
      console.log(`ok    all ${kept} re-labellings keep the solve, rewritten and re-stamped`);
    }
  }
}

// --- stage progress: where a step sits in the method's stages ----------------
{
  const state = applyAlg(solvedState(), scramble());
  const plan = buildPlan(state);
  const steps = plan.ok ? plan.methods.flatMap((m) => m.steps) : [];
  let bad = 0;
  const groups: string[] = [];
  for (const st of steps) if (!groups.includes(st.group)) groups.push(st.group);
  for (const st of steps) {
    const at = stageProgress(plan, st.id);
    if (!at) {
      bad++;
      continue;
    }
    if (at.group !== st.group) bad++;
    if (at.stage !== groups.indexOf(st.group) + 1) bad++;
    if (at.step < 1 || at.step > at.steps) bad++;
    if (at.stages !== groups.length) bad++;
  }
  if (stageProgress(plan, 'no-such-step') !== null) bad++;
  if (stageProgress(null, steps[0]?.id ?? null) !== null) bad++;
  if (bad > 0) {
    fails++;
    console.log(`FAIL  ${bad} stage-progress problems over ${steps.length} steps`);
  } else {
    console.log(`ok    every one of ${steps.length} steps knows its stage (${groups.length} stages)`);
  }
}

// --- titles: one row never says the same thing twice ------------------------
{
  let dupTitle = 0;
  let tagEqualsTitle = 0;
  let checked = 0;
  for (let i = 0; i < 6; i++) {
    const plan = buildPlan(applyAlg(solvedState(), scramble()));
    if (!plan.ok) continue;
    for (const method of plan.methods) {
      const seen = new Set<string>();
      for (const st of method.steps) {
        checked++;
        if (seen.has(st.title)) dupTitle++;
        seen.add(st.title);
        if (st.algorithm && st.algorithm === st.title) tagEqualsTitle++;
      }
    }
  }
  if (dupTitle || tagEqualsTitle) {
    fails++;
    console.log(
      `FAIL  ${dupTitle} duplicate step titles and ${tagEqualsTitle} rows whose tag repeats their title, of ${checked}`
    );
  } else {
    console.log(`ok    all ${checked} step rows have a distinct title and a tag that adds to it`);
  }
}

console.log(
  `\n${N - fails}/${N} plans solved · beginner avg ${(beginnerMoves / Math.max(1, N)).toFixed(1)} moves ` +
  `· shortest avg ${(shortMoves / Math.max(1, checkedShort)).toFixed(1)} over ${checkedShort} checks`
);
process.exit(fails ? 1 : 0);
