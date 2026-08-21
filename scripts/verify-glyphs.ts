/**
 * Does a move glyph point the way the move actually turns?
 *
 * "I like these symbols better than the letters" - so the letters are gone from
 * the strip and a 3x3 diagram with an arrow across it is what a learner reads
 * instead. A glyph pointing the wrong way is worse than a letter, and the way a
 * face turn moves the front of the cube is exactly the kind of thing that gets
 * written down from memory and is wrong.
 *
 * So nothing here trusts the table in `src/ui/glyphs.ts`. Every lit cell and every
 * direction is DERIVED:
 *
 *   1. `MOVE_DEFS` says which layer a move carries and how many right-handed
 *      quarter turns about which axis one clockwise turn is.
 *   2. `SLOTS` says which stickers of the front face are in that layer, and
 *      where each of them sits.
 *   3. `rotateVec` moves them. The direction they travel in the face's own
 *      plane is the direction the arrow has to point.
 *
 * And one more, because a flat diagram is only honest if it matches the cube on
 * screen: the face's own frame - grid right, grid up - has to still be right and
 * up at the app's resting viewing angle, and the face the grid stands for has to
 * be the one pointing at the camera.
 */
import { Quaternion, Vector3 } from 'three';
import { FACES, Face, FACE_NORMAL, MOVE_DEFS, SLOTS, Vec3, parseAlg, rotateVec } from '../src/cube/core';
import { restingOrientation } from '../src/render/view';
import { FACE_MOVES, GLYPH_MOVES, glyphFor, spokenMove } from '../src/ui/glyphs';
import { ALGORITHMS } from '../src/cube/algorithms';
import { applyAlg, solvedState } from '../src/cube/core';
import { buildPlan } from '../src/cube/solver/plan';

let fails = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) console.log(`ok    ${name}`);
  else {
    fails++;
    console.log(`FAIL  ${name}${detail ? ` - ${detail}` : ''}`);
  }
};

// -- 1. the grid is the face the viewer is looking at ------------------------
const Q = restingOrientation(new Quaternion());
const onScreen = (v: Vec3) => new Vector3(v[0], v[1], v[2]).applyQuaternion(Q);
{
  const right = onScreen([1, 0, 0]);
  const up = onScreen([0, 1, 0]);
  let front: Face = 'F';
  let best = -Infinity;
  for (const f of FACES) {
    const z = onScreen(FACE_NORMAL[f]).z;
    if (z > best) {
      best = z;
      front = f;
    }
  }
  check('at rest the face the grid stands for is the one facing the camera', front === 'F',
    `${front} is nearest, F is ${onScreen(FACE_NORMAL.F).z.toFixed(2)}`);
  check(`the grid's right is right on screen (x ${right.x.toFixed(2)})`, right.x > 0.5);
  check(`the grid's up is up on screen (y ${up.y.toFixed(2)})`, up.y > 0.5);
}

// -- 2. every arrow, derived from the engine ---------------------------------
//
// The rule the whole set hangs on: every glyph is the FRONT of the cube, and
// the arrow is the movement you would see from there. So take the vector
// pointing out of the front face and apply one clockwise turn of the move:
//
//   it lands on a side  -> the face slides that way, straight arrow
//   it does not move    -> the move's axis IS the front, so the face spins in
//                          the plane of the page: curved arrow, and its sense
//                          is where the same turn takes the vector pointing
//                          RIGHT.
//
// Derived here from `MOVE_DEFS` and `rotateVec` with no reference to
// `glyphs.ts`, and compared against a hand-written expectation for all
// eighteen bases, so a change to `turnsPerClockwise` cannot quietly flip an
// arrow without this saying which one.
const EXPECTED: Record<string, { shape: string; arrow: string }> = {
  U: { shape: 'straight', arrow: 'left' },
  D: { shape: 'straight', arrow: 'right' },
  R: { shape: 'straight', arrow: 'up' },
  L: { shape: 'straight', arrow: 'down' },
  F: { shape: 'curve', arrow: 'cw' },
  B: { shape: 'curve', arrow: 'ccw' },
  M: { shape: 'straight', arrow: 'down' },
  E: { shape: 'straight', arrow: 'right' },
  S: { shape: 'curve', arrow: 'cw' },
  Uw: { shape: 'straight', arrow: 'left' },
  Dw: { shape: 'straight', arrow: 'right' },
  Rw: { shape: 'straight', arrow: 'up' },
  Lw: { shape: 'straight', arrow: 'down' },
  Fw: { shape: 'curve', arrow: 'cw' },
  Bw: { shape: 'curve', arrow: 'ccw' },
  x: { shape: 'straight', arrow: 'up' },
  y: { shape: 'straight', arrow: 'left' },
  z: { shape: 'curve', arrow: 'cw' },
};

{
  const dominant = (v: Vec3) =>
    Math.abs(v[0]) > 0.5 ? (v[0] > 0 ? 'right' : 'left')
    : Math.abs(v[1]) > 0.5 ? (v[1] > 0 ? 'up' : 'down')
    : null;
  let wrong = 0;
  for (const base of Object.keys(EXPECTED)) {
    const def = MOVE_DEFS[base];
    const slide = dominant(rotateVec([0, 0, 1], def.axis, def.turnsPerClockwise));
    const spin = dominant(rotateVec([1, 0, 0], def.axis, def.turnsPerClockwise)) === 'down' ? 'cw' : 'ccw';
    const shape = slide ? 'straight' : 'curve';
    const arrow = slide ?? spin;
    const want = EXPECTED[base];
    const got = glyphFor(base)!;
    if (shape !== want.shape || arrow !== want.arrow) {
      wrong++;
      console.log(`      ${base}: the engine gives ${shape} ${arrow}, the table expects ${want.shape} ${want.arrow}`);
    }
    if (got.shape !== shape || got.arrow !== arrow) {
      wrong++;
      console.log(`      ${base}: glyphFor draws ${got.shape} ${got.arrow}, the engine gives ${shape} ${arrow}`);
    }
  }
  check(`all ${Object.keys(EXPECTED).length} move bases draw the direction the engine produces`, wrong === 0);
}

// -- 3. the same thing again, from the STICKERS rather than from a vector ----
//
// An independent derivation of the four side turns: take the front-face
// stickers the move really carries and read which way they travel in the face's
// own plane. If the vector rule above were subtly wrong, this would disagree.
{
  let wrong = 0;
  for (const base of ['U', 'D', 'R', 'L']) {
    const def = MOVE_DEFS[base];
    const carried = SLOTS.filter((s) => s.face === 'F' && def.layers.includes(s.pos[def.axis]));
    let dx = 0;
    let dy = 0;
    for (const s of carried) {
      const to = rotateVec(s.pos, def.axis, def.turnsPerClockwise);
      dx += to[0] - s.pos[0];
      dy += to[1] - s.pos[1];
    }
    const travelled =
      Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'up' : 'down';
    const g = glyphFor(base)!;
    if (g.arrow !== travelled) {
      wrong++;
      console.log(`      ${base}: ${carried.length} stickers travel ${travelled}, the glyph points ${g.arrow}`);
    } else {
      console.log(`      ${base}: ${carried.length} front stickers travel (${(dx / carried.length).toFixed(0)}, ${(dy / carried.length).toFixed(0)}) -> ${travelled}`);
    }
  }
  check('and the stickers themselves agree, for all four side turns', wrong === 0);
  // The two whole-face turns, from the same stickers: the sense of the spin.
  for (const [base, want] of [['F', 'cw'], ['B', 'ccw']] as [string, string][]) {
    const def = MOVE_DEFS[base];
    const face = base === 'B' ? 'B' : 'F';
    let spin = 0;
    for (const s of SLOTS.filter((x) => x.face === face)) {
      const to = rotateVec(s.pos, def.axis, def.turnsPerClockwise);
      spin += s.pos[0] * (to[1] - s.pos[1]) - s.pos[1] * (to[0] - s.pos[0]);
    }
    const sense = spin < 0 ? 'cw' : 'ccw';
    check(`${base}'s own stickers spin ${sense} as seen from where the viewer stands`,
      sense === want && glyphFor(base)!.arrow === want, `spin ${spin}`);
  }
}

// -- 4. the lit cells are the stickers of that face the move carries ---------
{
  let wrong = 0;
  for (const base of ['U', 'D', 'R', 'L', 'M', 'E', 'Uw', 'Dw', 'Rw', 'Lw']) {
    const def = MOVE_DEFS[base];
    const carried = new Set(
      SLOTS.filter((s) => s.face === 'F' && def.layers.includes(s.pos[def.axis])).map(
        (s) => `${s.row},${s.col}`
      )
    );
    const drawn = new Set(glyphFor(base)!.cells.map((c) => `${c.row},${c.col}`));
    if (carried.size !== drawn.size || [...carried].some((k) => !drawn.has(k))) {
      wrong++;
      console.log(`      ${base}: carries ${carried.size} front stickers, lights ${drawn.size}`);
    }
  }
  check('every slice glyph lights exactly the front stickers its move carries', wrong === 0);

  // The turns about z cannot light "the stickers they carry" on a front-facing
  // grid - two of them do not touch the front face at all. They are drawn as
  // what the learner is looking at instead, and this pins that choice.
  const shape = (n: string) => {
    const g = glyphFor(n)!;
    return `${g.cells.length}${g.hollow ? ' hollow' : ''}${g.wide ? ' wide' : ''}`;
  };
  check('the near face fills the grid', shape('F') === '9' && shape('Fw') === '9 wide');
  check('the far face fills it hollow', shape('B') === '9 hollow' && shape('Bw') === '9 hollow wide');
  check('the slice between them is a plus, and is not hollow', shape('S') === '5');
  check('a whole-cube rotation lights nothing and shrinks the grid',
    ['x', 'y', 'z'].every((n) => glyphFor(n)!.cells.length === 0 && glyphFor(n)!.whole));
  check('and nothing else claims to be a whole-cube rotation',
    GLYPH_MOVES.filter((n) => glyphFor(n)!.whole).length === 9);
}

// -- 4b. a prime reverses; a half turn has a head at both ends ---------------
{
  let wrong = 0;
  for (const base of Object.keys(EXPECTED)) {
    const plain = glyphFor(base)!;
    const prime = glyphFor(`${base}'`)!;
    const twice = glyphFor(`${base}2`)!;
    const same = (a: typeof plain, b: typeof plain) =>
      a.shape === b.shape &&
      a.wide === b.wide &&
      a.hollow === b.hollow &&
      a.whole === b.whole &&
      a.cells.length === b.cells.length;
    if (!same(plain, prime) || !same(plain, twice)) wrong++;
    if (prime.arrow === plain.arrow) wrong++;
    if (twice.arrow !== plain.arrow) wrong++;
    if (!twice.half || plain.half || prime.half) wrong++;
  }
  check('a prime keeps the picture and reverses the arrow; a half turn keeps both and gets a second head',
    wrong === 0, `${wrong} disagreements`);
  check('reversing is an involution',
    glyphFor('R')!.arrow === 'up' && glyphFor("R'")!.arrow === 'down' &&
    glyphFor('F')!.arrow === 'cw' && glyphFor("F'")!.arrow === 'ccw');
  // The half turn is a SILHOUETTE, not a character: nothing anywhere in the
  // glyph is a numeral, because "I like these symbols better than the letters"
  // is the whole reason the glyph exists.
  check('a half turn is marked by a second arrowhead and never by a "2"',
    GLYPH_MOVES.filter((n) => glyphFor(n)!.half).length === Object.keys(EXPECTED).length &&
    glyphFor('U2')!.arrow === glyphFor('U')!.arrow);
}

// -- 5. B is not F' wearing a hat -------------------------------------------
//
// Both are a curved anticlockwise arrow over the whole grid. The only thing
// telling them apart is that B's layer is the far one, so that flag has to be
// there and has to be the only pair it applies to.
{
  const b = glyphFor('B')!;
  const fPrime = glyphFor("F'")!;
  check('B and F-prime draw the same arrow, so B must be drawn hollow',
    b.arrow === fPrime.arrow && b.hollow && !fPrime.hollow);
  const behind = GLYPH_MOVES.filter((n) => glyphFor(n)!.hollow);
  check('and only the turns of the far face are drawn hollow',
    behind.length === 6 && behind.every((n) => n.startsWith('B')), behind.join(' '));
}

// -- 5b. NO TWO MOVES DRAW THE SAME PICTURE ---------------------------------
//
// The one that would have shipped: `F'` and `B` are both an anticlockwise curve
// over the whole grid, because seen head-on they DO turn the same way and only
// depth tells them apart. A glyph that means two different moves is worse than
// a letter. So every glyph is reduced to the marks a reader can actually see -
// which cells, filled or hollow, which arrow, one head or two, one shaft or two,
// grid full size or shrunk - and no two moves may reduce to the same string.
{
  const picture = (n: string) => {
    const g = glyphFor(n)!;
    return [
      g.cells.map((c) => `${c.row}${c.col}`).sort().join('-') || 'none',
      g.hollow ? 'hollow' : 'filled',
      g.shape,
      g.arrow,
      g.wide ? 'wide' : 'single',
      g.half ? 'two-heads' : 'one-head',
      g.whole ? 'shrunk' : 'full',
    ].join('/');
  };
  const seen = new Map<string, string[]>();
  for (const n of GLYPH_MOVES) {
    const p = picture(n);
    seen.set(p, [...(seen.get(p) ?? []), n]);
  }
  const clashes = [...seen.entries()].filter(([, ns]) => ns.length > 1);
  check(
    `all ${GLYPH_MOVES.length} moves draw a different picture`,
    clashes.length === 0,
    clashes.map(([p, ns]) => `${ns.join(' = ')} (${p})`).join('; ')
  );
  // Named, because it is the pair that nearly shipped.
  check("F-prime and B are told apart by depth, not by their arrow",
    glyphFor("F'")!.arrow === glyphFor('B')!.arrow && picture("F'") !== picture('B'),
    `${picture("F'")} vs ${picture('B')}`);
  check('and so are F and B-prime',
    glyphFor('F')!.arrow === glyphFor("B'")!.arrow && picture('F') !== picture("B'"));
  // Depth is a real mark, not a colour: hollow cells have no fill at all.
  check('depth is carried by fill, which survives being printed in black and white',
    glyphFor('B')!.hollow && !glyphFor("F'")!.hollow);
}

// -- 6. every move a learner is ever shown has a glyph, or a letter ----------
//
// The strip falls back to the letters for anything without one. That is fine as
// long as it is rare and deliberate, so this counts it - over the steps a real
// beginner plan actually produces, which is what the strip shows, and then over
// the whole library, which includes the advanced entries the beginner path
// never reaches.
{
  const plan = buildPlan(applyAlg(solvedState(), "R U R' U' F2 L D B' R2 U' L' B R D2 F"));
  const shown = new Map<string, number>();
  for (const m of plan.methods) {
    for (const st of m.steps) {
      for (const mv of st.moves) shown.set(mv.notation, (shown.get(mv.notation) ?? 0) + 1);
    }
  }
  const total = [...shown.values()].reduce((a, b) => a + b, 0);
  const without = [...shown.entries()].filter(([n]) => !glyphFor(n));
  // The one exception a beginner plan produces is the setup ROTATION - `z2`,
  // "put white on the bottom". That is not a turn of a layer at all, it is
  // re-holding the cube, and an arrow over a front-face grid cannot say so: the
  // grid would be the thing moving. It keeps its letter, and this asserts that
  // nothing else does.
  const rotations = without.filter(([n]) => /^[xyz]/.test(n));
  const worse = without.filter(([n]) => !/^[xyz]/.test(n));
  check(
    `every one of ${total} moves in a real plan has a glyph, bar ${rotations.reduce((a, [, c]) => a + c, 0)} whole-cube rotation(s)`,
    worse.length === 0,
    worse.map(([n, c]) => `${n}x${c}`).join(' ')
  );
  check('and a plan holds no more than a couple of those',
    rotations.reduce((a, [, c]) => a + c, 0) <= 2, JSON.stringify(rotations));
  check(`and there are ${shown.size} distinct moves in it, so that means something`, shown.size >= 12);

  // The library as a whole. `M`, `Rw`, `x` and `y` live in the advanced entries
  // and are shown as letters; if that share ever grows the fallback has stopped
  // being an edge case.
  const lib = new Map<string, number>();
  for (const a of ALGORITHMS) {
    for (const mv of parseAlg(a.alg)) lib.set(mv.notation, (lib.get(mv.notation) ?? 0) + 1);
  }
  const libTotal = [...lib.values()].reduce((a, b) => a + b, 0);
  const libMissing = [...lib.entries()].filter(([n]) => !glyphFor(n)).reduce((a, [, c]) => a + c, 0);
  check(
    `across the whole library only ${libMissing} of ${libTotal} moves fall back to letters`,
    libMissing / libTotal < 0.1,
    `${((libMissing / libTotal) * 100).toFixed(1)}%`
  );
}

// -- 7. the letter survives, spoken the way the app already speaks it --------
//
// A glyph replaces the letters ON SCREEN. It must not take them away from a
// screen reader, and what is said has to be the move that is drawn.
{
  let wrong = 0;
  for (const n of GLYPH_MOVES) {
    const g = glyphFor(n)!;
    if (g.spoken !== spokenMove(n)) wrong++;
    if (!g.spoken.startsWith(g.base[0])) wrong++;
  }
  check('every glyph carries its own letter for a screen reader', wrong === 0);
  check('a prime is spoken "prime", not "apostrophe"', spokenMove("R'") === 'R prime');
  check('a double is spoken "twice"', spokenMove('U2') === 'U twice');
  check('a plain turn is just the letter', spokenMove('F') === 'F');
}

// -- 8. NO TWO MOVES ARE SPOKEN THE SAME WAY ---------------------------------
//
// The version of this that lived in `MoveStrip` and `Notation` took
// `notation[0]` and threw the rest away, so a WIDE turn was announced as the
// outer face: `Rw` was read out as "R". Four of the library's algorithms were
// being spoken to a screen-reader user as a different algorithm - on the
// surface the app's whole accessibility story rests on.
//
// Said out loud over every move the library and a real plan can emit, and every
// suffix each of them can carry.
{
  const vocabulary = new Set<string>();
  for (const a of ALGORITHMS) for (const mv of parseAlg(a.alg)) vocabulary.add(mv.notation);
  const plan = buildPlan(applyAlg(solvedState(), "R U R' U' F2 L D B' R2 U' L' B R D2 F"));
  for (const m of plan.methods) {
    for (const st of m.steps) for (const mv of st.moves) vocabulary.add(mv.notation);
  }
  // And every base in the engine's own table, with every suffix, so a move the
  // library does not happen to use today is covered too.
  for (const base of Object.keys(MOVE_DEFS)) {
    for (const suffix of ['', "'", '2']) vocabulary.add(`${base}${suffix}`);
  }

  const said = new Map<string, string[]>();
  for (const n of vocabulary) {
    const phrase = spokenMove(n);
    said.set(phrase, [...(said.get(phrase) ?? []), n]);
  }
  const collisions = [...said.entries()].filter(([, ns]) => ns.length > 1);
  check(
    `all ${vocabulary.size} moves in the vocabulary are spoken differently`,
    collisions.length === 0,
    collisions.map(([p, ns]) => `"${p}" = ${ns.join('/')}`).join('; ')
  );

  // The exact regression, named.
  check('a wide turn is not announced as the face turn it contains',
    spokenMove('Rw') !== spokenMove('R') && spokenMove('Rw') === 'R wide',
    spokenMove('Rw'));
  check("and a wide prime keeps both halves", spokenMove("Fw'") === 'F wide prime', spokenMove("Fw'"));
  check('a slice keeps its own letter', spokenMove('M') === 'M' && spokenMove("M'") === 'M prime');
  check('a whole-cube rotation is a rotation, not a bare letter',
    spokenMove('x') === 'x rotation' && spokenMove('y2') === 'y rotation twice');
  // Nothing is ever spoken as raw punctuation.
  const punctuation = [...vocabulary].filter((n) => /['2]/.test(spokenMove(n)));
  check('no move is ever spoken with an apostrophe or a digit in it',
    punctuation.length === 0, punctuation.join(' '));
  // Nothing outside the vocabulary gets a glyph.
  let stray = 0;
  for (const n of ['', 'RU', 'R3', 'Q', "R''", 'Rw3']) if (glyphFor(n)) stray++;
  check('nothing that is not a move gets a glyph', stray === 0);
}

console.log(`\n${fails ? `${fails} glyph check(s) failed` : 'all glyph checks passed'}`);
process.exit(fails ? 1 : 0);
