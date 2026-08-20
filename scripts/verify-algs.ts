/**
 * Machine-checks every algorithm in the database.
 *   PLL - must leave F2L untouched and the last layer oriented.
 *   OLL - must leave F2L untouched; the case it solves is derived by running
 *         the algorithm backwards from solved, and printed for inspection.
 * Run: npx tsx scripts/verify-algs.ts
 */
import {
  SLOTS, applyAlg, solvedState, vecKey, cubieKind, Vec3, CubeState, parseAlg, invertMove,
} from '../src/cube/core';
import { ALGORITHMS } from '../src/cube/algorithms';

const inU = (p: Vec3) => p[1] === 1;
const f2lIntact = (st: CubeState) =>
  SLOTS.every((s) => inU(s.pos) || st.home[s.index] === s.index);
const llOriented = (st: CubeState) =>
  SLOTS.every((s) => s.face !== 'U' || SLOTS[st.home[s.index]].face === 'U');
const inverse = (alg: string) => parseAlg(alg).slice().reverse().map(invertMove);

/** ASCII picture of which U-face stickers show the U colour. */
function pattern(st: CubeState) {
  const rows: string[] = [];
  for (let r = 0; r < 3; r++) {
    let row = '';
    for (let c = 0; c < 3; c++) {
      const s = SLOTS.find((x) => x.face === 'U' && x.row === r && x.col === c)!;
      row += SLOTS[st.home[s.index]].face === 'U' ? '#' : '.';
    }
    rows.push(row);
  }
  return rows.join('/');
}
const orientedCount = (st: CubeState, kind: 2 | 3) =>
  SLOTS.filter((s) => s.face === 'U' && cubieKind(s.pos) === kind &&
    SLOTS[st.home[s.index]].face === 'U').length;

let bad = 0;
const fail = (msg: string) => { bad++; console.log(`FAIL  ${msg}`); };

for (const a of ALGORITHMS) {
  const end = applyAlg(solvedState(), a.moves);
  const label = `${a.category.padEnd(8)} ${a.name.padEnd(30)}`;

  if (a.category === 'PLL') {
    if (!f2lIntact(end)) fail(`${label} breaks F2L`);
    else if (!llOriented(end)) fail(`${label} leaves LL unoriented`);
    else console.log(`ok    ${label} ${a.corners}c/${a.edges}e`);
    continue;
  }

  if (a.category === 'OLL') {
    if (!f2lIntact(end)) { fail(`${label} breaks F2L`); continue; }
    const caseState = applyAlg(solvedState(), inverse(a.alg));
    if (!f2lIntact(caseState)) { fail(`${label} inverse breaks F2L`); continue; }
    console.log(
      `ok    ${label} case ${pattern(caseState)}  ` +
      `edges ${orientedCount(caseState, 2)}/4  corners ${orientedCount(caseState, 3)}/4`
    );
    continue;
  }

  // Everything else: report the pieces it touches so the UI filter is sane.
  if (a.targets.length === 0) fail(`${label} does nothing`);
  else console.log(`ok    ${label} ${a.corners}c/${a.edges}e  ${a.moves.length} moves`);
}

console.log(bad === 0 ? `\nALL ${ALGORITHMS.length} ALGORITHMS VALID` : `\n${bad} INVALID`);
process.exit(bad ? 1 : 0);
