/** Checks piece/slot pairing: the partner really is the opposite number. */
import { applyAlg, solvedState, blankState, vecKey, CUBIES, cubieKind, Vec3, SLOTS } from '../src/cube/core';
import { pairFor } from '../src/cube/pieces';
import { BASIC_MOVES } from '../src/cube/cubie';

let fails = 0;
const check = (name: string, ok: boolean, extra = '') => {
  if (!ok) { fails++; console.log(`FAIL  ${name} ${extra}`); }
};

const movable = CUBIES.filter((p) => cubieKind(p) >= 2);
let seed = 31337;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const scramble = (n = 20) =>
  Array.from({ length: n }, () => BASIC_MOVES[Math.floor(rnd() * 18)]).join(' ');

// On a solved cube everything is already home, in both modes.
for (const pos of movable) {
  for (const mode of ['piece', 'location'] as const) {
    const pair = pairFor(solvedState(), pos, mode);
    check(`solved: ${vecKey(pos)} is home in ${mode} mode`, pair.atHome, JSON.stringify(pair));
  }
}
console.log('ok    on a solved cube every piece reports itself as home');

// On scrambles the two modes must be inverses of one another.
let checked = 0;
for (let i = 0; i < 40; i++) {
  const state = applyAlg(solvedState(), scramble());
  for (const pos of movable) {
    const asPiece = pairFor(state, pos, 'piece');
    check(`piece mode finds a home for ${vecKey(pos)}`, asPiece.partner !== null);
    if (!asPiece.partner) continue;

    // The slot that piece belongs in must, in slot mode, point back at it.
    const back = pairFor(state, asPiece.partner, 'location');
    check(
      'the two modes are inverses',
      back.partner !== null && vecKey(back.partner) === vecKey(pos),
      `${vecKey(pos)} -> ${vecKey(asPiece.partner)} -> ${back.partner ? vecKey(back.partner) : 'none'}`
    );
    // A piece and its home slot are always the same kind of piece.
    check(
      'a corner never pairs with an edge',
      cubieKind(pos) === cubieKind(asPiece.partner as Vec3)
    );
    checked++;
  }
}
console.log(`ok    ${checked} pairings are consistent both ways round`);

// The strongest check: the slot a piece belongs in must be bordered by exactly
// that piece's own colours, read off the centres.
{
  const FACES_AT = (p: Vec3) => {
    const out: string[] = [];
    if (p[1] === 1) out.push('U'); else if (p[1] === -1) out.push('D');
    if (p[2] === 1) out.push('F'); else if (p[2] === -1) out.push('B');
    if (p[0] === 1) out.push('R'); else if (p[0] === -1) out.push('L');
    return out;
  };
  let colourChecks = 0;
  for (let i = 0; i < 30; i++) {
    const state = applyAlg(solvedState(), scramble());
    const centre = (face: string) =>
      state.colors[SLOTS.findIndex((s) => s.face === face && s.row === 1 && s.col === 1)];
    for (const pos of movable) {
      const pair = pairFor(state, pos, 'piece');
      if (!pair.partner) continue;
      // Colours actually on the piece right now.
      const onPiece = SLOTS.filter((s) => vecKey(s.pos) === vecKey(pos))
        .map((s) => state.colors[s.index])
        .sort()
        .join('');
      // Colours of the centres around the slot it is headed for.
      const atHome = FACES_AT(pair.partner).map(centre).sort().join('');
      check(
        'a piece belongs where its own colours meet',
        onPiece === atHome,
        `piece ${onPiece} -> slot ${atHome}`
      );
      colourChecks++;
    }
  }
  console.log(`ok    ${colourChecks} pieces belong where their own colours meet`);
}

// Centres and unpainted cubes are refused politely rather than guessed at.
{
  const centre = CUBIES.find((p) => cubieKind(p) === 1)!;
  const pair = pairFor(solvedState(), centre, 'piece');
  check('centres have no partner', pair.partner === null && !!pair.reason);
  const blank = pairFor(blankState(), movable[0], 'piece');
  check('an unpainted cube is refused', blank.partner === null && !!blank.reason);
  console.log(`ok    centres and unpainted cubes are explained: "${blank.reason}"`);
}

console.log(fails === 0 ? '\nPIECE PAIRING OK' : `\n${fails} FAILURES`);
process.exit(fails ? 1 : 0);
