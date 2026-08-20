/** Runs the beginner solver over random scrambles. */
import { IDENTITY, applyAlgCubie, isCubieSolved, BASIC_MOVES } from '../src/cube/cubie';
import { solveBeginner } from '../src/cube/solver/beginner';

let seed = Number(process.argv[3] ?? 20260820);
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const scramble = (n = 25) =>
  Array.from({ length: n }, () => BASIC_MOVES[Math.floor(rnd() * 18)]).join(' ');

const N = Number(process.argv[2] ?? 50);
let fails = 0;
let totalMoves = 0;
let maxMoves = 0;
let worst = '';
const t0 = Date.now();
const times: number[] = [];

for (let i = 0; i < N; i++) {
  const s = scramble();
  const cube = applyAlgCubie(IDENTITY, s);
  const start = Date.now();
  try {
    const stages = solveBeginner(cube);
    times.push(Date.now() - start);
    const all = stages.flatMap((st) => st.moves);
    let check = cube;
    for (const m of all) check = applyAlgCubie(check, m.notation);
    if (!isCubieSolved(check)) {
      fails++;
      console.log(`FAIL  not solved: ${s}`);
    }
    totalMoves += all.length;
    if (all.length > maxMoves) { maxMoves = all.length; worst = s; }
  } catch (err) {
    fails++;
    times.push(Date.now() - start);
    console.log(`FAIL  ${String(err)}\n      scramble: ${s}`);
  }
}

times.sort((a, b) => a - b);
console.log(
  `\n${N - fails}/${N} solved · avg ${(totalMoves / Math.max(1, N - fails)).toFixed(1)} moves ` +
  `· max ${maxMoves} · median ${times[Math.floor(times.length / 2)]}ms ` +
  `· slowest ${times[times.length - 1]}ms · total ${((Date.now() - t0) / 1000).toFixed(1)}s`
);
if (worst) console.log(`worst scramble: ${worst}`);
process.exit(fails ? 1 : 0);
