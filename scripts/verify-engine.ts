/** Sanity checks for the move engine. Run: npx tsx scripts/verify-engine.ts */
import {
  solvedState, applyAlg, isSolved, SLOTS, parseAlg, formatAlg, invertMove,
  CENTER_SLOT, Face, FACES, foldMoves,
} from '../src/cube/core';

/** A cube's stickers as a string, for comparing two ways of reaching it. */
const cubeKeyOf = (st: { colors: (string | null)[] }) => st.colors.join('');

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

// --- folding consecutive turns of one face ---------------------------------
//
// `L' L2` is `L`; `U' U` is nothing. Both were printed to learners - 15% of
// beginner steps carried a pair that should merge and 7.3% a pair that cancels
// outright - and practise mode then covered each of them with a `?` and scored
// the learner on recalling it. The fold is only allowed to change how many
// moves a sequence takes to say, never what it does.
{
  const hand: [string, string][] = [
    ["L' L2", 'L'],
    ["L2 L F'", "L' F'"],
    ["U2 U F U' F' U' L' U L", "U' F U' F' U' L' U L"],
    ["F U F' U' U L U L' U'", "F U F' L U L' U'"],
    ["R U U' R'", ''],
    ["R U R' U'", "R U R' U'"],
    ['U U U', "U'"],
    ['U U U U', ''],
    ['', ''],
  ];
  let bad = 0;
  for (const [input, want] of hand) {
    const got = formatAlg(foldMoves(parseAlg(input)));
    if (got !== want) {
      bad++;
      check(`fold "${input}"`, false, `got "${got}", wanted "${want}"`);
    }
  }
  if (!bad) check(`${hand.length} hand-written folds come out right`, true);

  // And over random sequences: same cube, never longer, nothing left to fold,
  // and folding a folded sequence changes nothing.
  let seed = 20260821;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const BASES = ['U', 'D', 'R', 'L', 'F', 'B', 'M', 'E', 'S', 'Rw', 'Uw', 'x', 'y'];
  let changed = 0;
  let longer = 0;
  let leftovers = 0;
  let unstable = 0;
  let saved = 0;
  let total = 0;
  for (let i = 0; i < 3000; i++) {
    // Deliberately repetitive: a uniform random sequence rarely repeats a face.
    const n = 2 + Math.floor(rnd() * 12);
    const tokens: string[] = [];
    for (let j = 0; j < n; j++) {
      const base = tokens.length && rnd() < 0.45
        ? tokens[tokens.length - 1].replace(/[2']/g, '')
        : BASES[Math.floor(rnd() * BASES.length)];
      tokens.push(base + ["", "'", '2'][Math.floor(rnd() * 3)]);
    }
    const moves = parseAlg(tokens.join(' '));
    const folded = foldMoves(moves);
    total += moves.length;
    saved += moves.length - folded.length;
    if (cubeKeyOf(applyAlg(solvedState(), moves)) !== cubeKeyOf(applyAlg(solvedState(), folded))) changed++;
    if (folded.length > moves.length) longer++;
    for (let j = 0; j + 1 < folded.length; j++) if (folded[j].base === folded[j + 1].base) leftovers++;
    if (formatAlg(foldMoves(folded)) !== formatAlg(folded)) unstable++;
  }
  check('folding never changes what a sequence does', changed === 0, `${changed} of 3000`);
  check('folding never makes a sequence longer', longer === 0, `${longer} of 3000`);
  check('nothing foldable is left behind', leftovers === 0, `${leftovers} pairs`);
  check('folding a folded sequence is a no-op', unstable === 0, `${unstable} of 3000`);
  check(`and it had something to do (${saved} of ${total} moves removed)`, saved > total * 0.1);
}

console.log(failures === 0 ? '\nALL ENGINE CHECKS PASSED' : `\n${failures} FAILURES`);
process.exit(failures ? 1 : 0);
