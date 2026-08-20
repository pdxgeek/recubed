/** Checks the cubie representation agrees with the facelet engine. */
import { applyAlg, solvedState, parseAlg, CubeState, SLOTS } from '../src/cube/core';
import {
  IDENTITY, applyAlgCubie, cubieToState, stateToCubie, isCubieSolved, invertCubie,
  multiply, validate, MOVE_CUBE, BASIC_MOVES,
} from '../src/cube/cubie';

let fails = 0;
const check = (name: string, ok: boolean, extra = '') => {
  if (!ok) { fails++; console.log(`FAIL  ${name} ${extra}`); }
};
const sameColors = (a: CubeState, b: CubeState) =>
  SLOTS.every((s) => a.colors[s.index] === b.colors[s.index]);

const rng = (() => { let x = 123456789; return () => (x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
const randomAlg = (n: number) =>
  Array.from({ length: n }, () => BASIC_MOVES[Math.floor(rng() * BASIC_MOVES.length)]).join(' ');

// facelet engine and cubie engine must agree for arbitrary sequences
for (let i = 0; i < 400; i++) {
  const alg = randomAlg(1 + Math.floor(rng() * 20));
  const viaFacelets = applyAlg(solvedState(), alg);
  const viaCubies = cubieToState(applyAlgCubie(IDENTITY, alg));
  check(`facelet/cubie agree: ${alg}`, sameColors(viaFacelets, viaCubies));
}
console.log('ok    facelet and cubie engines agree over 400 random sequences');

// round trip through the facelet form
for (let i = 0; i < 200; i++) {
  const alg = randomAlg(15);
  const c = applyAlgCubie(IDENTITY, alg);
  const back = stateToCubie(cubieToState(c));
  check(`round trip ${alg}`,
    back.cp.join() === c.cp.join() && back.co.join() === c.co.join() &&
    back.ep.join() === c.ep.join() && back.eo.join() === c.eo.join());
}
console.log('ok    stateToCubie / cubieToState round trip');

// inverse
for (let i = 0; i < 200; i++) {
  const c = applyAlgCubie(IDENTITY, randomAlg(12));
  check('inverse cancels', isCubieSolved(multiply(c, invertCubie(c))));
}
console.log('ok    invertCubie');

// every scrambled cube validates; hand-broken ones do not
for (let i = 0; i < 100; i++) {
  check('scramble is legal', validate(applyAlgCubie(IDENTITY, randomAlg(20))) === null);
}
{
  const twisted = applyAlgCubie(IDENTITY, 'R U');
  twisted.co[0] = (twisted.co[0] + 1) % 3;
  check('single twist rejected', validate(twisted) !== null);
  const flipped = applyAlgCubie(IDENTITY, 'R U');
  flipped.eo[0] ^= 1;
  check('single flip rejected', validate(flipped) !== null);
  const swapped = applyAlgCubie(IDENTITY, 'R U');
  [swapped.ep[0], swapped.ep[1]] = [swapped.ep[1], swapped.ep[0]];
  check('single swap rejected', validate(swapped) !== null);
}
console.log('ok    validation catches impossible cubes');

check('18 move cubes built', Object.keys(MOVE_CUBE).length === 18);
console.log(fails === 0 ? '\nCUBIE LAYER OK' : `\n${fails} FAILURES`);
process.exit(fails ? 1 : 0);
