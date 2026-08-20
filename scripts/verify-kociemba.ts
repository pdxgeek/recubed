/** Checks the two-phase solver's coordinates and solutions. */
import { IDENTITY, applyAlgCubie, isCubieSolved, BASIC_MOVES, cloneCubie } from '../src/cube/cubie';
import { SolveTimeout, buildTables, solveKociemba, movesToNotation } from '../src/cube/solver/kociemba';

let seed = Number(process.argv[3] ?? 424242);
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const scramble = (n = 25) =>
  Array.from({ length: n }, () => BASIC_MOVES[Math.floor(rnd() * 18)]).join(' ');

console.log('building tables...');
const t0 = Date.now();
buildTables();
console.log(`tables built in ${Date.now() - t0}ms`);

const N = Number(process.argv[2] ?? 25);
let fails = 0;
let total = 0;
let max = 0;
const times: number[] = [];

for (let i = 0; i < N; i++) {
  const s = scramble();
  const cube = applyAlgCubie(IDENTITY, s);
  const start = Date.now();
  const solution = solveKociemba(cube, { timeBudgetMs: 1200, targetLength: 21 });
  times.push(Date.now() - start);
  const notation = movesToNotation(solution);
  let check = cloneCubie(cube);
  for (const m of notation) check = applyAlgCubie(check, m);
  if (!isCubieSolved(check)) {
    fails++;
    console.log(`FAIL  ${s}\n      -> ${notation.join(' ')}`);
  }
  total += solution.length;
  max = Math.max(max, solution.length);
}

// --- the time budget is honoured, including when it runs out ----------------
//
// The bug this locks down: on a timeout the search used to set its deadline to
// Infinity and start again with no limit at all - the budget was thrown away in
// exactly the case it exists for - and it could hand back an empty move list,
// which the panel rendered as a step titled "Solve in 0 moves".
{
  const cube = applyAlgCubie(IDENTITY, scramble());

  // No time at all. There is nothing to do but say so.
  const started = Date.now();
  let reported = false;
  let returned: number[] | null = null;
  try {
    returned = solveKociemba(cube, { timeBudgetMs: 0, hardBudgetMs: 0, targetLength: 21 });
  } catch (err) {
    if (err instanceof SolveTimeout) reported = true;
    else throw err;
  }
  const elapsed = Date.now() - started;
  if (!reported) {
    fails++;
    console.log(
      `FAIL  a zero-millisecond budget searched anyway and returned ` +
      `${returned?.length ?? 0} moves after ${elapsed}ms`
    );
  } else {
    console.log(`ok    a zero-millisecond budget gives up and says so (${elapsed}ms)`);
  }
  if (returned !== null && returned.length === 0) {
    fails++;
    console.log('FAIL  the search returned an empty solution instead of reporting failure');
  }

  // A small but real budget still has to come back promptly, with a solution
  // that actually solves the cube.
  const t = Date.now();
  const quick = solveKociemba(cube, { timeBudgetMs: 20, hardBudgetMs: 500, targetLength: 21 });
  const quickMs = Date.now() - t;
  let check = cloneCubie(cube);
  for (const m of movesToNotation(quick)) check = applyAlgCubie(check, m);
  if (quick.length === 0 || !isCubieSolved(check)) {
    fails++;
    console.log(`FAIL  a 20ms budget produced ${quick.length} moves that do not solve the cube`);
  } else if (quickMs > 1500) {
    fails++;
    console.log(`FAIL  a 20ms budget (hard 500ms) ran for ${quickMs}ms`);
  } else {
    console.log(`ok    a 20ms budget returned a working ${quick.length}-move solve in ${quickMs}ms`);
  }
}

times.sort((a, b) => a - b);
console.log(
  `\n${N - fails}/${N} solved · avg ${(total / N).toFixed(1)} moves · max ${max} ` +
  `· median ${times[Math.floor(times.length / 2)]}ms · slowest ${times[times.length - 1]}ms`
);
process.exit(fails ? 1 : 0);
