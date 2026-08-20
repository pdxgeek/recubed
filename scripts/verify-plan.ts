/**
 * End-to-end check: build a solve plan for a painted cube, then run every step
 * through the app's own facelet engine and confirm the cube ends up solved.
 * This covers the whole-cube setup rotation that the beginner solve starts with.
 */
import { CubeState, applyAlg, isSolved, solvedState, parseAlg } from '../src/cube/core';
import { BASIC_MOVES } from '../src/cube/cubie';
import { buildPlan, buildShortest } from '../src/cube/solver/plan';

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

console.log(
  `\n${N - fails}/${N} plans solved · beginner avg ${(beginnerMoves / Math.max(1, N)).toFixed(1)} moves ` +
  `· shortest avg ${(shortMoves / Math.max(1, checkedShort)).toFixed(1)} over ${checkedShort} checks`
);
process.exit(fails ? 1 : 0);
