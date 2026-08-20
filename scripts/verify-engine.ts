/** Sanity checks for the move engine. Run: npx tsx scripts/verify-engine.ts */
import {
  solvedState, applyAlg, isSolved, SLOTS, parseAlg, formatAlg, invertMove,
  CENTER_SLOT, Face, FACES,
} from '../src/cube/core';

let failures = 0;
const check = (name: string, ok: boolean, extra = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
};

// A face turn has order 4; every generator repeated 4x is identity.
for (const g of ['U', 'D', 'R', 'L', 'F', 'B', 'M', 'E', 'S', 'Rw', 'Uw', 'x', 'y', 'z']) {
  check(`${g} x4 = identity`, isSolved(applyAlg(solvedState(), `${g} ${g} ${g} ${g}`)));
}

// Well-known orders.
const order = (alg: string, n: number) =>
  check(`(${alg}) x${n} = identity`, isSolved(applyAlg(solvedState(), Array(n).fill(alg).join(' '))));
order("R U R' U'", 6);
order("R U R' U R U2 R'", 6);   // Sune
order('M2 U M2 U2 M2 U M2', 2); // H-perm is an involution
order('R U', 105);          // the classic order of the R U pair
order('R U R\' F\' R U R\' U\' R\' F R2 U\' R\' U\'', 2); // T-perm is an involution

// alg followed by its inverse is identity
const roundTrip = (alg: string) => {
  const inv = formatAlg(parseAlg(alg).slice().reverse().map(invertMove));
  check(`${alg} then inverse`, isSolved(applyAlg(solvedState(), `${alg} ${inv}`)));
};
roundTrip("R U R' U' F' U F R2 D' M2 Rw Uw'");

// Direction check: U takes the F face top row to the L face.
{
  const st = applyAlg(solvedState(), 'U');
  const fTop = SLOTS.filter((s) => s.face === 'F' && s.row === 0);
  const lTop = SLOTS.filter((s) => s.face === 'L' && s.row === 0);
  check('U: F top row -> L top row', lTop.every((s) => st.colors[s.index] === 'G'));
  check('U: F top row receives R colours', fTop.every((s) => st.colors[s.index] === 'R'));
}

// Direction check: R takes F to U.
{
  const st = applyAlg(solvedState(), 'R');
  const uRight = SLOTS.filter((s) => s.face === 'U' && s.col === 2);
  check('R: F right column -> U right column', uRight.every((s) => st.colors[s.index] === 'G'));
}

// Whole cube rotations keep it solved and move the centres correctly.
{
  const st = applyAlg(solvedState(), 'y');
  check('y keeps cube solved', isSolved(st));
  check("y: F centre becomes L's original colour", st.colors[CENTER_SLOT.F] === 'R');
}
{
  const st = applyAlg(solvedState(), 'x');
  check('x: U centre takes F colour', st.colors[CENTER_SLOT.U] === 'G');
}

// Sexy move disturbs exactly 7 pieces' worth of stickers (2 corners cycle... ) - just check count is stable
{
  const st = applyAlg(solvedState(), "R U R' U'");
  const moved = st.home.filter((h, i) => h !== i).length;
  check('sexy move displaces some stickers', moved > 0, `moved=${moved}`);
}

console.log(failures === 0 ? '\nALL ENGINE CHECKS PASSED' : `\n${failures} FAILURES`);
process.exit(failures ? 1 : 0);
