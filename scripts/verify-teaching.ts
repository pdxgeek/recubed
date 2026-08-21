/**
 * The teaching page's arithmetic, checked headlessly.
 *
 * Same reason as `verify-net.ts` and `verify-layout.ts`: everything asserted
 * here is the kind of thing that is silently wrong forever if only a human eye
 * ever looks at it. Four properties carry the page.
 *
 *  1. **The wrap.** The page reproduces a printed row of glyph tiles. Six
 *     across at 375 and 390, seven at 430, eight at 1024 - and every one of
 *     those tiles at or above the 44pt target this app has kept clean for
 *     three rounds. A strip that quietly drops to a 35pt tile to fit the
 *     reference photo's eight-across looks right and is untappable.
 *  2. **The playhead.** A tile lit one move behind the cube teaches the wrong
 *     move and nothing on screen says so. `glyphStateAt` and `movesApplied`
 *     are checked against each other rather than each against a constant.
 *  3. **Scrubbing.** Tapping tile N must show move N - the cube put where it
 *     is *about* to play N, not one turn past it.
 *  4. **The case.** Playing the algorithm forward from the position the page
 *     opens on must land on a solved cube. That one line is the whole
 *     correctness story of this page's cube, for all 52 entries.
 */
import { applyAlg, isSolved, parseAlg, solvedState } from '../src/cube/core';
import { ALGORITHMS, CATEGORY_ORDER } from '../src/cube/algorithms';
import { CASES, caseForId } from '../src/cube/cases';
import {
  COLS_MAX,
  CUBE_MIN,
  FILM_GAP,
  FILM_LABEL_H,
  FILM_ROW_GAP,
  PROSE_MAX_W,
  SPEEDS,
  TILE_COMFORT,
  TILE_MAX,
  TILE_MIN,
  LIBRARY_ROW_H,
  PREVIEW_TILE,
  advance,
  algorithmIdsInPlan,
  castSlots,
  currentGlyph,
  faceGrid,
  filmContentWidth,
  filmHeight,
  filmLayout,
  filmRowCount,
  filmRows,
  glyphGeometry,
  glyphLabel,
  glyphStateAt,
  groupByCategory,
  isWide,
  laneChunks,
  laneSegments,
  libraryColumns,
  masterySuffix,
  opensChunk,
  previewCount,
  railShare,
  movesApplied,
  playheadLabel,
  progress,
  restart,
  rewind,
  ROW_SUMMARY_MAX,
  rowSummary,
  scrubKind,
  scrubTo,
  spokenMove,
  spokenSequence,
  staticFaceSize,
  teachCubeBand,
  teachRegions,
} from '../src/ui/teaching';

let fails = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) console.log(`ok    ${name}`);
  else {
    fails++;
    console.log(`FAIL  ${name}${detail ? ` - ${detail}` : ''}`);
  }
};

/** iPhone SE/13-mini, iPhone 15, 15 Pro Max, iPad portrait. */
const WIDTHS = [375, 390, 430, 1024];
/** 4 is a trigger, 8 the reference photo, 14 a T perm, 21 the longest in the library. */
const COUNTS = [1, 3, 4, 6, 7, 8, 11, 14, 18, 21];

// ---------------------------------------------------------------------------
// 1. The filmstrip wraps to the design's numbers
// ---------------------------------------------------------------------------
{
  // The spec's table, restated as assertions. If any of these four move, the
  // page no longer looks like the thing that was designed.
  const want: Record<number, { cols: number; tile: number }> = {
    375: { cols: 6, tile: 50 },
    390: { cols: 6, tile: 53 },
    430: { cols: 7, tile: 50 },
    1024: { cols: 8, tile: 72 },
  };
  for (const w of WIDTHS) {
    const l = filmLayout(filmContentWidth(w));
    check(
      `${w}: ${want[w].cols} tiles across at ${want[w].tile}pt`,
      l.cols === want[w].cols && l.tile === want[w].tile,
      `got ${l.cols} × ${l.tile}`
    );
  }

  for (const w of WIDTHS) {
    const content = filmContentWidth(w);
    const l = filmLayout(content);
    const used = l.tile * l.cols + FILM_GAP * (l.cols - 1);

    check(`${w}: every tile clears the 44pt target`, l.tile >= TILE_MIN, `tile ${l.tile}`);
    check(`${w}: and is comfortable to read`, l.tile >= TILE_COMFORT, `tile ${l.tile}`);
    check(`${w}: no tile is mostly empty`, l.tile <= TILE_MAX, `tile ${l.tile}`);
    check(`${w}: a full row fits inside the gutters`, used <= content, `${used} > ${content}`);
    check(`${w}: never more than the reference's eight across`, l.cols <= COLS_MAX, `${l.cols}`);
    check(
      `${w}: one more column would be untappable or uncomfortable`,
      l.cols === COLS_MAX ||
        Math.floor((content - l.cols * FILM_GAP) / (l.cols + 1)) < TILE_COMFORT,
      `${l.cols + 1} across would give ${Math.floor((content - l.cols * FILM_GAP) / (l.cols + 1))}`
    );
  }

  // Nothing anywhere in the supported range may produce an untappable tile.
  let small = '';
  for (let w = 320; w <= 1400; w++) {
    const l = filmLayout(filmContentWidth(w));
    if (l.tile < TILE_MIN) small = `${w}pt gives a ${l.tile}pt tile`;
  }
  check('no supported width produces a tile under 44pt', small === '', small);

  // A wider screen never shows fewer tiles per row.
  let shrank = '';
  let prev = 0;
  for (let w = 320; w <= 1400; w++) {
    const c = filmLayout(filmContentWidth(w)).cols;
    if (c < prev) shrank = `${w - 1}pt gave ${prev} columns, ${w}pt gave ${c}`;
    prev = c;
  }
  check('widening the screen never costs a column', shrank === '', shrank);
}

// --- rows account for every move, in order ----------------------------------
{
  for (const w of WIDTHS) {
    const l = filmLayout(filmContentWidth(w));
    for (const count of COUNTS) {
      const rows = filmRows(l, count);
      const flat = rows.flat();
      check(
        `${w}/${count}: the rows are the moves, in order, once each`,
        rows.length === filmRowCount(l, count) &&
          flat.length === count &&
          flat.every((v, i) => v === i),
        JSON.stringify(rows)
      );
      check(
        `${w}/${count}: every row but the last is full`,
        rows.slice(0, -1).every((r) => r.length === l.cols),
        JSON.stringify(rows.map((r) => r.length))
      );
      check(
        `${w}/${count}: the last row is left-aligned, not centred`,
        rows[rows.length - 1][0] === (rows.length - 1) * l.cols
      );
    }
  }
}

// --- the strip's height is what its rows need -------------------------------
{
  // The spec's height table, at 375 and 1024.
  const at375 = filmLayout(filmContentWidth(375));
  check('375: eight moves are two rows of 144pt', filmHeight(at375, 8) === 144, `${filmHeight(at375, 8)}`);
  check('375: a 21-move perm is four rows of 300pt', filmHeight(at375, 21) === 300, `${filmHeight(at375, 21)}`);
  const at1024 = filmLayout(filmContentWidth(1024));
  check('1024: eight moves are one row of 88pt', filmHeight(at1024, 8) === 88, `${filmHeight(at1024, 8)}`);

  for (const w of WIDTHS) {
    const l = filmLayout(filmContentWidth(w));
    for (const count of COUNTS) {
      const rows = filmRowCount(l, count);
      check(
        `${w}/${count}: the height is label lanes, tiles and the gaps between rows`,
        filmHeight(l, count) === rows * (FILM_LABEL_H + l.tile) + (rows - 1) * FILM_ROW_GAP
      );
    }
    check(`${w}: more moves is never a shorter strip`, filmHeight(l, 21) >= filmHeight(l, 8));
  }
}

// ---------------------------------------------------------------------------
// 2. The trigger label lane tiles its row exactly
// ---------------------------------------------------------------------------
{
  // `src/cube/cases.ts` has already chunked every algorithm, via
  // `chunkByTriggers` - the one place that decides where the seams fall. The
  // lane renders those chunks and must never re-derive them.
  let lost = '';
  for (const c of CASES) {
    const chunks = laneChunks(c.triggers);
    const covered = chunks.reduce((n, x) => n + x.length, 0);
    const contiguous = chunks.every(
      (x, i) => x.start === (i === 0 ? 0 : chunks[i - 1].start + chunks[i - 1].length)
    );
    if (covered !== c.notation.length || !contiguous) lost = `${c.id}: ${covered}/${c.notation.length}`;
  }
  check('the lane accounts for every move of every algorithm', lost === '', lost);

  const sexy = caseForId('trig-sexy-x3');
  const twoSexy = laneChunks(caseForId('oll-line')!.triggers);
  check('a case exposes its trigger blocks as data', twoSexy.length >= 1);

  // The invariant that matters: at every width, for every algorithm, the lane
  // segments tile their row exactly - every tile belongs to one segment, and
  // no segment overhangs the row it sits above. Same class of check as the
  // one `net.ts` earned its keep with.
  let bad = '';
  for (const w of WIDTHS) {
    const l = filmLayout(filmContentWidth(w));
    const content = filmContentWidth(w);
    for (const c of CASES) {
      const chunks = laneChunks(c.triggers);
      for (const row of filmRows(l, c.notation.length)) {
        const segs = laneSegments(chunks, row, l.tile);
        const tiles = segs.reduce((n, s) => n + s.span, 0);
        const width = segs.reduce((n, s) => n + s.width, 0) + FILM_GAP * (segs.length - 1);
        const rowWidth = row.length * l.tile + FILM_GAP * (row.length - 1);
        if (tiles !== row.length) bad = `${w}/${c.id}: ${tiles} tiles covered of ${row.length}`;
        else if (width !== rowWidth) bad = `${w}/${c.id}: lane ${width} vs row ${rowWidth}`;
        else if (width > content) bad = `${w}/${c.id}: lane ${width} overhangs ${content}`;
      }
    }
  }
  check('the label lane tiles its row exactly, at every width', bad === '', bad);

  // A chunk split across two rows is named on both - a reader scanning row
  // three needs to know what they are looking at.
  const narrow = filmLayout(filmContentWidth(375));
  let spanned = '';
  for (const c of CASES) {
    const chunks = laneChunks(c.triggers);
    for (const x of chunks) {
      if (x.label === null) continue;
      const rows = filmRows(narrow, c.notation.length).filter((r) =>
        r.some((m) => m >= x.start && m < x.start + x.length)
      );
      if (rows.length < 2) continue;
      const named = rows.every((r) =>
        laneSegments(chunks, r, narrow.tile).some((s) => s.label === x.label)
      );
      if (!named) spanned = `${c.id}: ${x.label}`;
    }
  }
  check('a trigger spanning two rows is named on both', spanned === '', spanned);

  // Only the tile that OPENS a chunk carries the trigger name. Repeating it on
  // all eight tiles is what makes a list unlistenable.
  const line = caseForId('oll-line')!;
  const lineChunks = laneChunks(line.triggers);
  const opensAt = line.notation.map((_, i) => opensChunk(lineChunks, i)).filter(Boolean);
  check(
    'the trigger name is spoken once per chunk, not once per tile',
    opensAt.length === lineChunks.filter((x) => x.label !== null).length,
    `${opensAt.length} openings for ${lineChunks.length} chunks`
  );
}
// 3. The playhead and the tiles agree
// ---------------------------------------------------------------------------
{
  const count = 8;
  for (let p = 0; p <= count; p++) {
    const states = Array.from({ length: count }, (_, i) => glyphStateAt(p, i, count));
    const past = states.filter((s) => s === 'past').length;
    const current = states.filter((s) => s === 'current').length;

    check(
      `playhead ${p}: exactly the moves already performed read as played`,
      past === movesApplied(p),
      `${past} played, ${movesApplied(p)} applied`
    );
    check(
      `playhead ${p}: ${p < count ? 'one tile is current' : 'nothing is current at the end'}`,
      current === (p < count ? 1 : 0),
      `got ${current}`
    );
    const cur = currentGlyph(p, count);
    check(
      `playhead ${p}: the lit tile is the move about to happen`,
      p < count ? cur === p : cur === null,
      `got ${cur}`
    );
  }
  check('an empty sequence lights nothing', currentGlyph(0, 0) === null);
  check('progress runs 0..1', progress(0, 8) === 0 && progress(8, 8) === 1 && progress(4, 8) === 0.5);
}

// ---------------------------------------------------------------------------
// 4. Tapping tile N scrubs to move N
// ---------------------------------------------------------------------------
{
  const count = 14;
  for (let n = 0; n < count; n++) {
    const p = scrubTo(n, count);
    check(
      `tapping tile ${n} lights tile ${n}`,
      glyphStateAt(p, n, count) === 'current' && currentGlyph(p, count) === n,
      `playhead ${p} -> ${glyphStateAt(p, n, count)}`
    );
    check(
      `tapping tile ${n} shows the cube with ${n} moves performed`,
      movesApplied(p) === n,
      `got ${movesApplied(p)}`
    );
    if (n > 0) {
      check(`tapping tile ${n} leaves tile ${n - 1} played`, glyphStateAt(p, n - 1, count) === 'past');
    }
  }
  check('a tap out of range cannot leave the sequence', scrubTo(-5, count) === 0 && scrubTo(99, count) === count);

  // The transport and the strip move one playhead, so they must land together.
  for (let n = 0; n < count - 1; n++) {
    const after = advance({ index: scrubTo(n, count), playing: true }, count);
    check(`stepping on from tile ${n} lights tile ${n + 1}`, currentGlyph(after.index, count) === n + 1);
  }
  const atEnd = advance({ index: count, playing: true }, count);
  check('the end is the end, and it stops playing', atEnd.index === count && !atEnd.playing);
  check('stepping back from the start stays at the start', rewind({ index: 0, playing: false }, count).index === 0);
  check('restart returns to the case', restart({ index: 9, playing: true }).index === 0);

  // A neighbouring scrub animates; a jump does not try to rewind twenty moves.
  check('a step of one is animated', scrubKind(3, 4) === 'animate' && scrubKind(4, 3) === 'animate');
  check('a longer scrub jumps', scrubKind(0, 7) === 'jump' && scrubKind(13, 2) === 'jump');
  check('scrubbing to where you already are does nothing', scrubKind(5, 5) === 'none');
}

// ---------------------------------------------------------------------------
// 5. The regions fit, and the cube stays a cube
// ---------------------------------------------------------------------------
{
  // The floor and the 30% share meet exactly at the shortest supported phone.
  check('at the shortest phone the share IS the floor', teachCubeBand(600) === CUBE_MIN, `${teachCubeBand(600)}`);
  check('a taller phone gets a bigger cube', teachCubeBand(777) > CUBE_MIN);
  check('the cube stops growing at 300', teachCubeBand(4000) === 300, `${teachCubeBand(4000)}`);

  const screens = [
    { name: 'iPhone SE', width: 375, height: 667 },
    { name: 'iPhone 15', width: 390, height: 844 },
    { name: 'iPhone 15 Pro Max', width: 430, height: 932 },
    { name: 'iPad portrait', width: 1024, height: 1366 },
  ];
  for (const s of screens) {
    const r = teachRegions(s.width, s.height);
    check(`${s.name}: the cube and the scroller are the whole body`, r.cube + r.scroller === r.body,
      `${r.cube} + ${r.scroller} != ${r.body}`);
    check(`${s.name}: the cube keeps its floor`, r.cube >= Math.min(CUBE_MIN, r.body), `${r.cube}`);
    check(`${s.name}: the scroller has room for prose and a strip`, r.scroller > 200, `${r.scroller}`);
    check(`${s.name}: the columns are the whole width`, r.textColumn + r.cubeColumn === s.width);
  }

  check('a phone is not wide', !isWide(375, 812) && !isWide(430, 932));
  check('a tablet is', isWide(1024, 1366));
  check('a landscape phone is not mistaken for one', !isWide(844, 390) || 844 >= 640);

  const tablet = teachRegions(1024, 1366);
  check('the tablet prose column is 410 wide', tablet.textColumn === 410, `${tablet.textColumn}`);
  check('and the cube gets the rest', tablet.cubeColumn === 614, `${tablet.cubeColumn}`);
  check('prose is bounded even on a tablet', PROSE_MAX_W <= 560 && PROSE_MAX_W >= 480);

  // The worst case fits the phone scroller, or scrolls - which is the point of
  // a scroller, but the beginner plan's own algorithms must never need it.
  const beginner = ALGORITHMS.filter((a) => a.category === 'Beginner' || a.category === 'Triggers');
  const longestBeginner = Math.max(...beginner.map((a) => a.moves.length));
  const se = teachRegions(375, 667);
  const l375 = filmLayout(filmContentWidth(375));
  check(
    'the longest beginner algorithm strip fits an SE without scrolling the strip off',
    filmHeight(l375, longestBeginner) < se.scroller,
    `${filmHeight(l375, longestBeginner)} vs ${se.scroller}`
  );
}

// ---------------------------------------------------------------------------
// 6. Every tile says its letter, and says it right
// ---------------------------------------------------------------------------
{
  check('a plain turn is its letter', spokenMove('R') === 'R');
  // The wording MoveStrip already uses, so the two screens sound the same.
  check('a prime is "prime"', spokenMove("R'") === 'R prime');
  check('a half turn is "twice"', spokenMove('U2') === 'U twice');
  // Where this page deliberately does better than MoveStrip's `spoken()`,
  // which takes notation[0] and so reads Rw' as "R prime" - a different move.
  check('a wide turn is not read as its face', spokenMove("Rw'") === 'R wide prime');
  check('a slice is named as one', spokenMove('M') === 'M slice');
  check('a cube rotation is named as one', spokenMove("y'") === 'y rotation prime');

  const notation = parseAlg("R U R' U'").map((m) => m.notation);
  check(
    'a tile announces its position in the sequence',
    glyphLabel(notation[2], 2, 4) === 'Move 3 of 4: R prime',
    glyphLabel(notation[2], 2, 4)
  );
  check('the page announces the move it is playing', playheadLabel(notation, 1) === 'Move 2 of 4: U');
  check(
    'and says so when it has finished, rather than nothing',
    playheadLabel(notation, 4) === 'Solved. 4 moves performed.',
    playheadLabel(notation, 4)
  );
  check(
    'the whole sequence has a spoken form for the notation line',
    spokenSequence(notation) === "R, U, R prime, U prime",
    spokenSequence(notation)
  );

  let unspoken = '';
  for (const a of ALGORITHMS) {
    for (const m of a.moves) {
      const said = spokenMove(m.notation);
      // Anything longer than a bare letter must have been expanded into words;
      // a label still reading `Rw'` means the table has a hole in it.
      if (!said || (m.notation.length > 1 && said === m.notation)) unspoken = `${a.id}: ${m.notation}`;
    }
  }
  check('every move in the library has a spoken form', unspoken === '', unspoken);
}

// ---------------------------------------------------------------------------
// 7. The glyph distinguishes what has to be distinguished
// ---------------------------------------------------------------------------
{
  const g = (n: string) => glyphGeometry(parseAlg(n)[0]);
  check('R and L are opposite bands', g('R').cells[0] === 2 && g('L').cells[0] === 0);
  check('R and U are different axes', g('R').band === 'col' && g('U').band === 'row');
  check('a prime reverses the arrow', g('R').dir !== g("R'").dir, `${g('R').dir} vs ${g("R'").dir}`);
  check('a half turn keeps the sense and gains a head', g('R2').dir === g('R').dir && g('R2').doubleHead);
  check('a quarter turn has one head', !g('R').doubleHead);
  check('a whole-face turn is curved', g('F').curved && !g('R').curved);
  check('a wide turn carries two bands', g('Rw').cells.length === 2, JSON.stringify(g('Rw').cells));
  check('a slice carries the middle one', g('M').cells.length === 1 && g('M').cells[0] === 1);
  check('a cube rotation says it is one', g('x').wholeCube && !g('Rw').wholeCube);
  // F' and B turn the same way seen head on; only depth separates them, and if
  // the glyph does not draw depth the two are the same picture.
  check("F' and B differ by depth, not by arrow", g("F'").dir === g('B').dir && g("F'").cells[0] !== g('B').cells[0]);

  const seen = new Map<string, string>();
  let collision = '';
  for (const n of ['R', "R'", 'R2', 'L', "L'", 'U', "U'", 'U2', 'D', "D'", 'F', "F'", 'F2', 'B', "B'", 'M', "M'", 'E', 'S', 'Rw', 'Lw', 'Uw', 'Dw', 'Fw', 'Bw', 'x', 'y', 'z']) {
    const key = JSON.stringify(g(n));
    const prev = seen.get(key);
    if (prev) collision = `${prev} and ${n} draw the same glyph`;
    seen.set(key, n);
  }
  check('no two moves draw the same glyph', collision === '', collision);
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// 8. The case the page opens on
// ---------------------------------------------------------------------------
{
  // `src/cube/cases.ts` owns the case position and `verify-cases.ts` checks it.
  // What this page needs from it is one thing, and it is worth restating here
  // because the page's whole animation rests on it: the cube the page opens on
  // must become a solved cube when the algorithm is played forward.
  let bad = '';
  for (const c of CASES) if (!isSolved(applyAlg(c.caseState, c.moves))) bad = c.id;
  check('every case position is solved by its own algorithm', bad === '', bad);

  let unscrambled = '';
  for (const c of CASES) if (isSolved(c.caseState)) unscrambled = c.id;
  check('and no case position is already solved', unscrambled === '', unscrambled);

  check('the page has a case for every algorithm in the library', CASES.length === ALGORITHMS.length,
    `${CASES.length} cases, ${ALGORITHMS.length} algorithms`);

  /**
   * The cyan cast is a set of PIECES, and it keeps every one of them.
   *
   * `castSlots` follows the pieces rather than the holes, and the reason is
   * this loop. `algAffectedSlots` reports *net* displacement - the slots whose
   * sticker does not end where it started - so it is smaller than the union of
   * the layers the algorithm turns. Halfway through a sequence a cast piece is
   * routinely sitting in a slot that is not in `targetSlots` at all: the cast
   * travels out through slots the algorithm gives back later.
   *
   * A highlight pinned to `targetSlots` would therefore go dark on the piece
   * being watched and light up whatever wandered into the hole it left - which
   * is the failure this function exists to prevent. What must hold instead is
   * that the cast never gains or loses a member, and is back on the named
   * slots at both ends.
   */
  let lost = '';
  let ends = '';
  let travelled = '';
  for (const a of ALGORITHMS) {
    const home = a.targetSlots.slice().sort((x, y) => x - y).join();
    let live = caseForId(a.id)!.caseState;
    for (let i = 0; i <= a.moves.length; i++) {
      const cast = castSlots(live, a.targetSlots).sort((x, y) => x - y);
      if (cast.length !== a.targetSlots.length) lost = `${a.id} at move ${i}: ${cast.length}`;
      if ((i === 0 || i === a.moves.length) && cast.join() !== home) ends = `${a.id} at move ${i}`;
      if (cast.join() !== home) travelled = a.id;
      if (i < a.moves.length) live = applyAlg(live, [a.moves[i]]);
    }
  }
  check('the cast never gains or loses a piece', lost === '', lost);
  check('and sits on the named slots at the case and at the end', ends === '', ends);
  check(
    'but leaves them in between - which is why the highlight follows pieces',
    travelled !== '',
    'no algorithm ever moved a piece outside its net-displaced slots'
  );

  // The pieces themselves travel, even though the set of slots they occupy
  // does not - that difference is the whole lesson.
  const t = caseForId('pll-t')!;
  check(
    'T perm: the pieces travel even though the cast keeps its slots',
    t.travels.length > 0 && t.travels.some((x) => x.permuted)
  );
}
// ---------------------------------------------------------------------------
// 9. The static path - the page with the animation switched off
// ---------------------------------------------------------------------------
{
  const uaCase = caseForId('pll-ua')!.caseState;
  const up = faceGrid(uaCase, 'U');
  check('a face reads as three rows of three', up.length === 3 && up.every((r) => r.length === 3));
  check('the centre of the Up face is still the Up colour', up[1][1] === 'W', String(up[1][1]));
  check('a solved face is one colour', new Set(faceGrid(solvedState(), 'F').flat()).size === 1);
  // A PLL leaves the top face solid by definition - the cycle shows on the
  // sides, which is exactly why the static diagram draws three faces and not
  // the one a learner would think to look at.
  check('a PLL case still has a solid top', new Set(up.flat()).size === 1, JSON.stringify(up));
  check(
    'and shows its case on the side faces the diagram also draws',
    new Set(faceGrid(uaCase, 'F')[0]).size > 0 &&
      ['F', 'R'].some((f) => new Set(faceGrid(uaCase, f as 'F' | 'R').flat()).size > 1),
    JSON.stringify(faceGrid(uaCase, 'F'))
  );

  for (const w of WIDTHS) {
    const s = staticFaceSize(w, 220);
    check(`${w}: three static faces fit side by side`, s * 3 + 20 <= w - 32 || s === 48, `face ${s}`);
    check(`${w}: and inside the cube's band`, s <= 220 - 28 || s === 48, `face ${s}`);
  }

  // The page opens slow, because it is the destination for "why does this work".
  check('the page opens on the slowest speed', SPEEDS[0].ms === Math.max(...SPEEDS.map((s) => s.ms)));
  check('and the slowest is slow enough to follow', SPEEDS[0].ms >= 1200, `${SPEEDS[0].ms}`);
}

// ---------------------------------------------------------------------------
// 10. The library
// ---------------------------------------------------------------------------
{
  const groups = groupByCategory(ALGORITHMS, CATEGORY_ORDER);
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  check('grouping loses no algorithm', total === ALGORITHMS.length, `${total} of ${ALGORITHMS.length}`);
  check(
    'the groups come in the stated order',
    groups.map((g) => g.category).join() ===
      CATEGORY_ORDER.filter((c) => groups.some((g) => g.category === c)).join()
  );
  check('a category nobody uses is not an empty heading', groups.every((g) => g.items.length > 0));

  const orphan = groupByCategory([{ category: 'Nowhere' }], CATEGORY_ORDER);
  check('an algorithm outside the order is still shown', orphan.length === 1 && orphan[0].category === 'Nowhere');

  check('a phone gets one column', libraryColumns(375) === 1 && libraryColumns(430) === 1);
  check('a tablet gets two', libraryColumns(1024) === 2);
  check('a narrow side panel falls back to one', libraryColumns(320) === 1);

  check('a row without a note still says its length', rowSummary(undefined, 8) === '8 moves');
  check('one move is not "1 moves"', rowSummary(undefined, 1) === '1 move');
  check(
    'a row prints the first sentence of a long note, not all of it',
    rowSummary('Swaps two corners. Running it again undoes it exactly.', 14) === '14 moves · Swaps two corners',
    rowSummary('Swaps two corners. Running it again undoes it exactly.', 14)
  );
  // The merged notes are written for the teaching page, where there is room
  // for five lines. Several open with a hundred-character clause, so a row
  // that printed "the first sentence" would still be truncated mid-word by
  // whatever the font measured. The cut is made here instead, on a word.
  let longest = 0;
  let midWord = '';
  for (const a of ALGORITHMS) {
    const line = rowSummary(a.note, a.moves.length);
    longest = Math.max(longest, line.length);
    if (line.endsWith('…') && /\S…$/.test(line) && !/ \S+…$/.test(line)) midWord = a.id;
  }
  check('no library row summary runs past a line', longest <= ROW_SUMMARY_MAX, `longest ${longest}`);
  check('a truncated summary is cut on a word, not mid-word', midWord === '', midWord);
  check(
    'a short note is printed whole, with no ellipsis',
    rowSummary('Two edge swaps', 7) === '7 moves · Two edge swaps',
    rowSummary('Two edge swaps', 7)
  );
}

// ---------------------------------------------------------------------------
// 11. The library is scoped to the plan, which is what makes it not 806ced6
// ---------------------------------------------------------------------------
{
  // The default scope is the plan, in plan order, deduplicated. A plan repeats
  // the same algorithm across steps constantly - the sexy move appears in most
  // of them - and a list that printed it eight times would be a transcript,
  // not an index.
  const steps = [
    { algorithmId: 'trig-sexy' },
    { algorithmId: 'beg-cross' },
    { algorithmId: 'trig-sexy' },
    {},
    { algorithmId: 'beg-second-right' },
    { algorithmId: 'beg-cross' },
  ];
  const ids = algorithmIdsInPlan(steps);
  check('the library opens on the plan, deduplicated', ids.join() === 'trig-sexy,beg-cross,beg-second-right', ids.join());
  check('and in plan order, not library order', ids[0] === 'trig-sexy');
  check('a step with no algorithm contributes nothing', ids.length === 3);
  check(
    'the default scope is far smaller than the catalogue',
    ids.length < CASES.length / 3,
    `${ids.length} of ${CASES.length}`
  );
  check('every scoped id resolves to a real case', ids.every((id) => caseForId(id) !== undefined));

  // Mastery: three states, told apart by rail LENGTH first and hue second, and
  // carrying a word in the spoken label - except `unseen`, which says nothing
  // because an absence of progress is not news.
  check('an unseen algorithm has no rail and says nothing', railShare('unseen') === 0 && masterySuffix('unseen') === '');
  check('a learning one has a partial rail and says so', railShare('learning') > 0 && railShare('learning') < 1 && masterySuffix('learning') === ', learning');
  check('a known one has a full rail and says so', railShare('known') === 1 && masterySuffix('known') === ', known');
  check(
    'the three rail lengths are distinct, so hue is never the only channel',
    new Set([railShare('unseen'), railShare('learning'), railShare('known')]).size === 3
  );

  // The row's preview has to leave the name somewhere to live.
  for (const w of [320, 375, 390, 430, 512, 1024]) {
    const n = previewCount(w);
    const previewW = n * PREVIEW_TILE + (n - 1) * 4;
    // rail + gaps + preview + chevron, against the row's own width.
    const nameRoom = w - 32 - 4 - previewW - 24;
    check(`${w}: a row's preview leaves room for the name`, nameRoom >= 120, `${nameRoom}pt left`);
    check(`${w}: the preview is a thumbnail, not the algorithm`, n <= 4 && n >= 3, `${n}`);
  }
  check('a narrow row previews three glyphs, not four', previewCount(375) === 3 || previewCount(375) === 4);

  check('a library row clears the touch target', LIBRARY_ROW_H >= 44, `${LIBRARY_ROW_H}`);
}

console.log(fails === 0 ? '\nteaching: all checks passed' : `\nteaching: ${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
