/**
 * The flat net's geometry.
 *
 * `slotIndex` is the mapping between what a net cell says it is and which of
 * the 54 stickers it paints. It is the only way a screen-reader user can paint,
 * and a transposed mapping would silently paint a cube different from the one
 * the 3D view shows - with nothing on screen to say so. Two mutations that used
 * to pass every suite are the reason this file exists:
 *
 *   M10  slotIndex -> face * 9 + col * 3 + row   (the net, transposed)
 *   M11  FOCUS_ORDER -> U F L R B D              (reading order no longer the
 *                                                 order the faces are drawn in)
 */
import { FACES, Face, SLOTS, isCenter } from '../src/cube/core';
import {
  CELL,
  CELL_GAP,
  CELL_PITCH,
  CROSS_MIN_WIDTH,
  FACE_BLOCK_H,
  FACE_GAP,
  FACE_SIZE,
  FACE_WORD,
  FOCUS_ORDER,
  LABEL_H,
  NET_PAD,
  NET_ROWS,
  PAINT_ROW_H,
  TOP_BAR_H,
  layoutFor,
  netBand,
  netBlockHeight,
  netFits,
  netHeight,
  netWidth,
  slotIndex,
} from '../src/ui/net';

let fails = 0;
const check = (name: string, ok: boolean, extra = '') => {
  if (ok) console.log(`ok    ${name}`);
  else {
    fails++;
    console.log(`FAIL  ${name} ${extra}`);
  }
};

// -- 1. every cell addresses the sticker it claims to ------------------------

{
  const seen = new Set<number>();
  let wrong = 0;
  let firstWrong = '';
  for (const face of FACES) {
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const i = slotIndex(face, row, col);
        seen.add(i);
        const slot = SLOTS[i];
        if (!slot || slot.face !== face || slot.row !== row || slot.col !== col) {
          wrong++;
          if (!firstWrong) {
            firstWrong =
              `net says ${face} r${row} c${col} -> slot ${i}, ` +
              `which is ${slot ? `${slot.face} r${slot.row} c${slot.col}` : 'out of range'}`;
          }
        }
      }
    }
  }
  check('every net cell addresses the sticker it names', wrong === 0, firstWrong);
  check('the net addresses all 54 stickers, one to one', seen.size === 54, `${seen.size} distinct`);
}

// -- 2. the six centres are exactly the cells the net makes unpressable ------

{
  const centres = FACES.map((f) => slotIndex(f, 1, 1));
  check('the centre of every face is a centre sticker', centres.every((i) => isCenter(SLOTS[i].pos)));
  const others = SLOTS.map((s) => s.index).filter((i) => !centres.includes(i));
  check('and nothing else is', others.every((i) => !isCenter(SLOTS[i].pos)));
}

// -- 3. focus order is reading order -----------------------------------------

{
  check('focus order is U L F R B D', FOCUS_ORDER.join('') === 'ULFRBD', FOCUS_ORDER.join(''));
  for (const layout of ['cross', 'pairs'] as const) {
    const drawn = NET_ROWS[layout].flat().filter((f): f is Face => f !== null);
    check(
      `the ${layout} layout draws the faces in focus order`,
      drawn.join('') === FOCUS_ORDER.join(''),
      `${drawn.join('')} vs ${FOCUS_ORDER.join('')}`
    );
    check(`the ${layout} layout draws each face exactly once`, new Set(drawn).size === 6);
  }
  check('every face has a word a reader can use', FACES.every((f) => /^[A-Z][a-z]+$/.test(FACE_WORD[f])));
}

// -- 4. the pitch rule -------------------------------------------------------
//
// A 34pt cell on a 3pt gutter with 5pt of hitSlop claims a 44pt target on a
// 37pt pitch: neighbours overlapped by 7pt and a tap in that band painted the
// wrong sticker. Slop cannot buy a target the pitch does not carry.

check(`cell pitch is a real 44pt target (${CELL} + ${CELL_GAP} = ${CELL_PITCH})`, CELL_PITCH >= 44);
check('cells are big enough to read a letter in', CELL >= 32);

// -- 5. the layouts fit the screens they are chosen for ----------------------

{
  const phone = [320, 375, 390, 414, 430];
  const gutter = 32;
  for (const w of phone) {
    check(
      `a ${w}pt phone gets the two-up layout, and it fits (${netWidth('pairs')} <= ${w - gutter})`,
      layoutFor(w) === 'pairs' && netWidth('pairs') <= w - gutter
    );
  }
  // The tablet's canvas band, measured at 1024 x 1366.
  const band = 636;
  check(
    `a ${band}pt panel gets the cross, and it fits (${netWidth('cross')} x ${netHeight()})`,
    layoutFor(band) === 'cross' && netWidth('cross') <= band - gutter
  );
  check('the cross is only ever chosen where it fits',
    CROSS_MIN_WIDTH >= netWidth('cross') + gutter);
  check('the two-up layout is never wider than the cross', netWidth('pairs') < netWidth('cross'));
}

// -- 6. the net fits the band it is given, on every phone --------------------
//
// The round-3 report claimed "54 of 54 cells visible at 390". It was measured
// against the *window*, and a cell clipped by its scroller still reports a rect
// inside the window - so the measurement could not see the 75pt of net hanging
// below the fold, nor the 234pt on an SE. The height model is spelled out here
// so it is checked by arithmetic, and `verify-ui.mjs` measures the real DOM
// against the same constants so the two cannot drift apart.

{
  check(
    `a face block is its word plus its grid (${LABEL_H} + ${FACE_SIZE} = ${FACE_BLOCK_H})`,
    FACE_BLOCK_H === LABEL_H + FACE_SIZE
  );
  check(
    `the net is three face blocks and two gaps (${netHeight()})`,
    netHeight() === FACE_BLOCK_H * 3 + FACE_GAP * 2
  );
  check(
    `and the block that has to fit adds its padding (${netBlockHeight()})`,
    netBlockHeight() === netHeight() + NET_PAD * 2
  );

  for (const h of [667, 844, 932]) {
    check(
      `a ${h}pt window fits all 54 cells with nothing to scroll ` +
        `(${netBlockHeight()} <= ${netBand(h)})`,
      netFits(h),
      `short by ${netBlockHeight() - netBand(h)}`
    );
  }

  // What it was before, measured off the DOM at 7418540: a 498pt net in a
  // 264pt band on an SE and a 423pt band at 390. Kept as numbers so the two
  // things that fixed it - trimming the net and collapsing the panel - are
  // both accounted for rather than one of them quietly doing nothing.
  const WAS_NET = 498;
  for (const [h, wasBand] of [
    [667, 264],
    [844, 423],
  ] as const) {
    check(
      `at ${h} the old net overflowed its old band by ${WAS_NET - wasBand}pt`,
      WAS_NET > wasBand
    );
    check(
      `and trimming the net alone would not have fixed ${h} ` +
        `(${netBlockHeight()} > ${wasBand})`,
      netBlockHeight() > wasBand
    );
  }
  check(
    `the compact controls are two 44pt rows and their padding (${PAINT_ROW_H})`,
    PAINT_ROW_H === 44 * 2 + 8 * 3
  );
  // 430 x 932 is the largest phone; anything taller has more room, not less.
  check('every phone height from an SE up fits the net', [667, 736, 812, 844, 852, 926, 932].every(netFits));
}

console.log(fails ? `\n${fails} net check(s) failed` : '\nall net checks passed');
process.exit(fails ? 1 : 0);
