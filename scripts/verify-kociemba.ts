/** Checks the two-phase solver's coordinates and solutions. */
import { IDENTITY, applyAlgCubie, isCubieSolved, BASIC_MOVES, cloneCubie } from '../src/cube/cubie';
import { buildTables, solveKociemba, movesToNotation } from '../src/cube/solver/kociemba';

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

times.sort((a, b) => a - b);
console.log(
  `\n${N - fails}/${N} solved · avg ${(total / N).toFixed(1)} moves · max ${max} ` +
  `· median ${times[Math.floor(times.length / 2)]}ms · slowest ${times[times.length - 1]}ms`
);
process.exit(fails ? 1 : 0);
