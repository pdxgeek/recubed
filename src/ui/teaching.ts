/**
 * The teaching page's arithmetic, with no react-native import.
 *
 * Same reason as `src/ui/net.ts`, `src/ui/layout.ts` and `src/ui/notation.ts`:
 * the numbers that decide what a learner sees are the kind of thing that is
 * silently wrong forever if only a human eye ever checks them.
 * `scripts/verify-teaching.ts` drives all of it.
 *
 * What lives here is the *rendering* half of the teaching page - how the strip
 * wraps, where the playhead is, how the page divides itself. What does not is
 * anything already answered elsewhere, and that boundary is deliberate:
 *
 *  - the case position, the pieces that travel and the trigger decomposition
 *    are `src/cube/cases.ts`;
 *  - the seams between triggers are `chunkByTriggers` in `src/cube/algorithms.ts`,
 *    rendered by `src/ui/notation.ts`;
 *  - the palette, the type scale and the 44pt floor are `src/ui/palette.ts`;
 *  - the cube's floor is `CUBE_MIN` in `src/ui/layout.ts`.
 *
 * This file imports the ones it needs and restates none of them. An earlier
 * draft of this page carried its own copy of the palette and its own trigger
 * chunker, which is two sources of truth for two things that already had one.
 */
import { CubeState, Face, FACES, Move, ColorId } from '../cube/core';
import { CaseTrigger } from '../cube/cases';
import { CUBE_MIN } from './layout';

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export { CUBE_MIN };

/* ══════════════════════════════════════════════════════════════════════════
   1. The filmstrip
   ─────────────────────────────────────────────────────────────────────────
   The design spec's §3.1 numbers. The spec asks for them beside the real glyph
   in `src/ui/glyphs.ts`; that file is the glyph agent's and does not exist in
   this worktree yet. If it lands carrying them, delete this block and
   re-export from there - the names here are the spec's, so nothing that reads
   them has to change.
   ══════════════════════════════════════════════════════════════════════════ */

/** Between tiles in a row. `space.sm`. */
export const FILM_GAP = 8;
/** Between rows. `space.md` - larger than the column gap, so rows read as rows. */
export const FILM_ROW_GAP = 12;
/**
 * The trigger-name lane above each row.
 *
 * A **minimum**, not a fixed height. At large Dynamic Type sizes the overline
 * wraps and the lane has to grow with it; a strip whose height comes from the
 * formula below rather than from `onLayout` is the mistake `net.ts` records as
 * "the formula said 450 and the DOM measured 498". `filmHeight` is a budgeting
 * tool. The component measures.
 */
export const FILM_LABEL_H = 16;
/** WCAG 2.5.8. The tile IS the target, so no hitSlop is needed or wanted. */
export const TILE_MIN = 44;
/** Below this the arrowhead is the only part of the glyph left to read. */
export const TILE_COMFORT = 48;
/** Above this the glyph is mostly empty tile. */
export const TILE_MAX = 72;
/** The printed reference's row length. */
export const COLS_MAX = 8;
/** The one horizontal gutter, everywhere in this app. */
export const STRIP_GUTTER = 16;

export interface FilmLayout {
  cols: number;
  tile: number;
}

/**
 * The largest tile that still fits `cols` across, preferring more tiles per row
 * only while they stay comfortable.
 *
 * Descending from `COLS_MAX` rather than ascending, because the answer wanted
 * is "as many as fit at a decent size", and the first n that clears
 * `TILE_COMFORT` from the top is exactly that.
 *
 * On 8-across: the reference photograph shows eight, and eight across a 375pt
 * phone is a 35pt tile - under the touch-target floor this project has spent
 * three rounds keeping clean. So the phone gets six and the tablet gets the
 * photograph. Someone will compare the page to the photo and ask; this is the
 * answer.
 */
export function filmLayout(contentWidth: number): FilmLayout {
  for (let n = COLS_MAX; n >= 3; n--) {
    const t = Math.floor((contentWidth - (n - 1) * FILM_GAP) / n);
    if (t >= TILE_COMFORT) return { cols: n, tile: Math.min(TILE_MAX, t) };
  }
  // Narrower than three comfortable tiles: three at whatever they can have,
  // floored at the target minimum. No supported width reaches here (a 320pt
  // window gives 3 × 90), but the floor is stated rather than assumed.
  const t = Math.floor((contentWidth - 2 * FILM_GAP) / 3);
  return { cols: 3, tile: Math.max(TILE_MIN, t) };
}

/** The width the strip lays out inside, gutters removed. */
export const filmContentWidth = (width: number) =>
  Math.max(0, Math.floor(width) - STRIP_GUTTER * 2);

/** Rows needed for a sequence at a given layout. */
export const filmRowCount = (l: FilmLayout, count: number) =>
  Math.max(1, Math.ceil(Math.max(0, count) / l.cols));

/** The height the strip wants. A budget, not a measurement - see `FILM_LABEL_H`. */
export function filmHeight(l: FilmLayout, count: number): number {
  const rows = filmRowCount(l, count);
  return rows * (FILM_LABEL_H + l.tile) + (rows - 1) * FILM_ROW_GAP;
}

/**
 * The rows, as index lists.
 *
 * A partial last row is left-aligned, not centred: the strip is read left to
 * right and a centred remainder puts move 7 under move 2. The component walks
 * this rather than trusting flex-wrap, so the wrap the tests check is the wrap
 * the screen draws - and so the tiles' DOM order, which is the screen reader's
 * focus order, is move order by construction.
 */
export function filmRows(l: FilmLayout, count: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < count; i += l.cols) {
    const row: number[] = [];
    for (let k = i; k < Math.min(i + l.cols, count); k++) row.push(k);
    out.push(row);
  }
  return out.length ? out : [[]];
}

/* ─────────────────────────────────────────────────────────────────────────
   1b. The trigger label lane
   ───────────────────────────────────────────────────────────────────────── */

/** The minimum of a `CaseTrigger` the lane needs. */
export interface LaneChunk {
  start: number;
  length: number;
  /** The name with its count - `Sexy move ×3` - or null for an unnamed run. */
  label: string | null;
}

/** `src/cube/cases.ts` already chunks every algorithm; this is just the shape. */
export const laneChunks = (triggers: readonly CaseTrigger[]): LaneChunk[] =>
  triggers.map((t) => ({ start: t.start, length: t.notation.length, label: t.label }));

export interface LaneSegment {
  /** Index into the chunk list, or -1 for moves belonging to no trigger. */
  chunk: number;
  /** The label to print. Null prints nothing - naming the absence of a name is clutter. */
  label: string | null;
  /** First move of this chunk that falls in this row. */
  from: number;
  /** How many of this row's tiles the segment spans. */
  span: number;
  /** The segment's width in points, so the lane and the tiles stay in lockstep. */
  width: number;
}

/**
 * The label lane above one row of tiles.
 *
 * Positioned by flex rather than absolutely: the lane is a row of fixed-width
 * segments, each as wide as the tiles it sits over. That keeps the two locked
 * together at any Dynamic Type size, and it keeps the tiles themselves in
 * plain document order - which is the reason the focus order is move order
 * without anything having to enforce it.
 *
 * A chunk spanning two rows prints its label on **both**, unmodified. A reader
 * scanning row three needs to know what they are looking at; `(cont.)` is
 * noise and an ellipsis is a puzzle.
 */
export function laneSegments(
  chunks: readonly LaneChunk[],
  row: readonly number[],
  tile: number
): LaneSegment[] {
  const out: LaneSegment[] = [];
  for (const move of row) {
    const ci = chunks.findIndex((c) => move >= c.start && move < c.start + c.length);
    const last = out[out.length - 1];
    if (last && last.chunk === ci) {
      last.span++;
      last.width += tile + FILM_GAP;
      continue;
    }
    out.push({
      chunk: ci,
      label: ci === -1 ? null : chunks[ci].label,
      from: move,
      span: 1,
      width: tile,
    });
  }
  return out;
}

/**
 * True when move `i` is the first of its named chunk.
 *
 * Only that tile prefixes its label with the trigger's name. Repeating
 * "Sexy move ×2" on all eight tiles is what makes a list unlistenable.
 */
export function opensChunk(chunks: readonly LaneChunk[], i: number): string | null {
  const c = chunks.find((x) => x.start === i);
  return c?.label ?? null;
}

/* ══════════════════════════════════════════════════════════════════════════
   2. The playhead
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The playhead is a count of moves already performed, so it runs 0..count
 * inclusive and `index === count` means the algorithm is finished.
 *
 * That is the same convention `src/cube/run.ts` uses for a solve step, where
 * `atEnd` is `index >= moves.length` and the chip at `index` is the current
 * one. The two must agree: it is one mental model across both screens, and a
 * page that shifted it by one would teach a move out of step with the cube.
 */
export type GlyphState = 'past' | 'current' | 'future';

export interface Playhead {
  /** Moves performed. 0 = the case position, `count` = solved. */
  index: number;
  playing: boolean;
}

/**
 * The transport's three speeds, in milliseconds per move.
 *
 * The page opens on **Slow**. It is the destination a learner reaches by
 * asking "why does this work", so it opens at the speed that answers that -
 * not the speed someone drilling would choose.
 */
export const SPEEDS = [
  { label: 'Slow', ms: 1400 },
  { label: 'Steady', ms: 900 },
  { label: 'Brisk', ms: 520 },
] as const;
export const DEFAULT_SPEED = 0;

/**
 * The X-ray starts on.
 *
 * Watching a corner travel *through* the cube instead of disappearing round
 * the back is the reason this page has a cube on it at all. Defaulting it off
 * would make the pedagogical point an option most people never find.
 *
 * It is page-local: the teaching page never writes the solve screen's own
 * X-ray setting, so a learner who turned it off there does not find it on when
 * they go back. The stated cost is that the first thing they see here is a
 * cube that does not look like their cube.
 */
export const WIREFRAME_DEFAULT = true;

/**
 * The page plays once and holds. It does not loop.
 *
 * Three reasons, in order of weight. **WCAG 2.2.2**: a 21-move algorithm at
 * 1400ms is 29 seconds of motion, and anything auto-moving past five seconds
 * needs a mechanism to stop it - the transport is that mechanism, so one pass
 * is fine, but a loop would mean motion beside prose for as long as the page
 * is open, which is the pattern the criterion exists to stop. **The end state
 * is information**: a learner needs to look at a solved cube and understand
 * that *that* is what the sequence achieves, and a loop erases the ending
 * every few seconds. **It competes with the reading**: the purpose paragraph
 * sits directly below and would lose.
 */
export const LOOPS = false;

/** How a tile is drawn while the playhead sits where it does. */
export function glyphStateAt(playhead: number, i: number, count: number): GlyphState {
  if (playhead >= count) return 'past';
  if (i < playhead) return 'past';
  if (i === playhead) return 'current';
  return 'future';
}

/**
 * The tile lit up, or null once the run is over.
 *
 * Null rather than the last index: at the end no move is being performed, and
 * leaving the last tile lit says the cube is mid-turn when it is solved.
 */
export function currentGlyph(playhead: number, count: number): number | null {
  if (count <= 0) return null;
  return playhead >= count ? null : clamp(playhead, 0, count - 1);
}

/**
 * Where a tap on tile `i` puts the playhead.
 *
 * Tapping tile N means "put the cube where it is about to play move N", so the
 * cube rewinds to just *before* N and N lights up - not to just after it,
 * which would leave the cube one move past the tile the finger is on. That
 * matches the solve screen exactly, where `playback.index` is the move that
 * plays next. Same semantics, no second mental model.
 */
export function scrubTo(i: number, count: number): number {
  return clamp(Math.floor(i), 0, Math.max(0, count));
}

/** How many moves of the algorithm the cube on screen has had applied. */
export const movesApplied = (playhead: number) => Math.max(0, playhead);

export function advance(p: Playhead, count: number): Playhead {
  return p.index >= count ? { index: count, playing: false } : { ...p, index: p.index + 1 };
}

export function rewind(p: Playhead, count: number): Playhead {
  return { ...p, index: clamp(p.index - 1, 0, count) };
}

export const restart = (p: Playhead): Playhead => ({ ...p, index: 0 });

/** Progress along the sequence, 0..1, for the strip's rule. */
export function progress(playhead: number, count: number): number {
  return count <= 0 ? 0 : clamp(playhead / count, 0, 1);
}

/**
 * What a scrub should do to the cube.
 *
 * One move either way is animated, because that is the move being taught and
 * watching it is the point. Anything further jumps: honouring a five-tile jump
 * as animation would mean playing up to twenty-one moves backwards, and a
 * rewind that fast is not something anyone can follow. A jump is `applyAlg`
 * over at most 21 moves, which is free.
 */
export function scrubKind(from: number, to: number): 'animate' | 'jump' | 'none' {
  if (from === to) return 'none';
  return Math.abs(to - from) === 1 ? 'animate' : 'jump';
}

/* ══════════════════════════════════════════════════════════════════════════
   3. The page's regions
   ══════════════════════════════════════════════════════════════════════════ */

/** The header. Fixed, never scrolls. */
export const TEACH_HEADER_H = 56;

/**
 * The cube's band.
 *
 * **The cube is pinned and everything below it scrolls.** Scrolling the cube
 * away with the page would buy about 200pt of text room and break the core
 * mechanic: tapping a tile scrubs a cube you can no longer see. The playhead
 * has two views and both have to be on screen at once.
 *
 * At a body of 600 - the shortest supported phone, less its chrome and this
 * header - the 0.30 share is exactly `CUBE_MIN`. The floor and the share meet
 * at the bottom of the range, and that is asserted rather than admired.
 */
export const teachCubeBand = (bodyHeight: number) =>
  Math.max(CUBE_MIN, Math.min(300, Math.round(bodyHeight * 0.3)));

/**
 * Wide enough to put the prose beside the cube instead of under it.
 *
 * Measured, not a device class: the tablet's own side panel is narrower than
 * the tablet, and the same page has to be right in both.
 */
export const WIDE_MIN = 900;
export const isWide = (width: number, height: number) =>
  width >= WIDE_MIN || (width > height && width >= 640);

export interface TeachRegions {
  wide: boolean;
  /** Height under the header. */
  body: number;
  /** The pinned cube's band. */
  cube: number;
  /** What is left for the scrolling prose and filmstrip. */
  scroller: number;
  /** Wide only: the prose column beside the cube. 0 on a phone. */
  textColumn: number;
  /** The cube's column. The full width on a phone. */
  cubeColumn: number;
}

/**
 * How the page divides itself.
 *
 * On a phone the header and the cube band come off the top and the rest
 * scrolls. Wide, the cube and the prose sit side by side in a top row and the
 * filmstrip spans both columns underneath at the full eight across - the first
 * layout in this app that does something a phone cannot, rather than being a
 * phone stretched.
 */
export function teachRegions(width: number, height: number, chromeH = 67): TeachRegions {
  const body = Math.max(0, height - chromeH - TEACH_HEADER_H);
  const cube = Math.min(teachCubeBand(body), body);
  const wide = isWide(width, height);
  const textColumn = wide ? clamp(Math.round(width * 0.4), 360, 460) : 0;
  return {
    wide,
    body,
    cube,
    scroller: Math.max(0, body - cube),
    textColumn,
    cubeColumn: wide ? Math.max(0, width - textColumn) : width,
  };
}

/**
 * Every line of prose on this page is bounded to this.
 *
 * 520pt at 15pt averages about 72 characters, inside the 45-75 band. The sheet
 * this page grows out of set 145 characters at 1024pt wide, which is the
 * failure mode a full-width page has and a phone never does.
 */
export const PROSE_MAX_W = 520;

/* ══════════════════════════════════════════════════════════════════════════
   4. Wording
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * How a move is spoken.
 *
 * `'` is "prime" and `2` is "twice", exactly as `MoveStrip` and `Notation`
 * already say them - that wording is in people's ears and this page must not
 * invent a second one.
 *
 * The base is where it deliberately differs, and it is fixing a live bug.
 * Both existing copies take `notation[0]`, which throws the `w` away: `Rw` is
 * announced "R", so `oll-t`, `oll-l`, `oll-dot` and `oll-lshape` are currently
 * read out as a *different algorithm* than the one on screen. On the solve
 * screen the letters sit beside the speech and the slip is survivable. Here
 * the tile carries no letters at all, so the label is the only channel there
 * is and it has to be right.
 *
 * FOLLOW-UP: `MoveStrip.tsx` and `Notation.tsx` should delete their local
 * `spoken()` and import this. That deletion is the part that fixes shipped
 * code, and it is outside this page's footprint.
 */
const SPOKEN_BASE: Record<string, string> = {
  U: 'U', D: 'D', R: 'R', L: 'L', F: 'F', B: 'B',
  Rw: 'R wide', Lw: 'L wide', Uw: 'U wide', Dw: 'D wide', Fw: 'F wide', Bw: 'B wide',
  M: 'M slice', E: 'E slice', S: 'S slice',
  x: 'x rotation', y: 'y rotation', z: 'z rotation',
};

export function spokenMove(notation: string): string {
  const m = /^([A-Za-z]w?)(2|')?$/.exec(notation.trim());
  if (!m) return notation;
  const word = SPOKEN_BASE[m[1]] ?? m[1];
  if (m[2] === "'") return `${word} prime`;
  if (m[2] === '2') return `${word} twice`;
  return word;
}

/** The whole sequence read out, for the notation line at the foot of the page. */
export const spokenSequence = (notation: readonly string[]) =>
  notation.map(spokenMove).join(', ');

/**
 * What a single tile announces.
 *
 * Position first, because the strip is an ordered list and "where am I" is the
 * question. The trigger's name is prefixed only on the tile that opens the
 * chunk - see `opensChunk`.
 */
export function glyphLabel(notation: string, i: number, count: number, opens?: string | null): string {
  const body = `Move ${i + 1} of ${count}: ${spokenMove(notation)}`;
  return opens ? `${opens}. ${body}` : body;
}

/**
 * What the page says the cube is doing, for its one live region.
 *
 * Never "move 9 of 8". At the end it says so, because "finished" is the state
 * a learner is checking for and silence is not an answer.
 */
export function playheadLabel(notation: readonly string[], playhead: number): string {
  const i = currentGlyph(playhead, notation.length);
  if (i === null) return `Solved. ${notation.length} moves performed.`;
  return `Move ${i + 1} of ${notation.length}: ${spokenMove(notation[i])}`;
}

/* ══════════════════════════════════════════════════════════════════════════
   5. The cube's highlights
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The slots the cast currently occupies, rather than the slots it started in.
 *
 * Follow the pieces, not the holes. `algAffectedSlots` reports *net*
 * displacement - the slots whose sticker does not end where it started - so it
 * is smaller than the union of the layers the algorithm turns, and halfway
 * through a sequence a cast piece is routinely sitting somewhere that is not
 * in it at all. A highlight pinned to those slots would go dark on the piece
 * being watched and light up whatever wandered into the hole it left.
 *
 * `home` is what makes this answerable, and it is why `cases.ts` resets
 * tracking at the case position.
 */
export function castSlots(live: CubeState, homeSlots: readonly number[]): number[] {
  const homes = new Set(homeSlots);
  const out: number[] = [];
  for (let s = 0; s < live.home.length; s++) if (homes.has(live.home[s])) out.push(s);
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   6. The static cube
   ─────────────────────────────────────────────────────────────────────────
   The page has to work with the animation switched off - reduce-motion, a
   screen reader, or no GL surface to borrow. These three faces are that path:
   the same three `cases.ts` calls `DEFAULT_VIEW_FACES`, as grids, with the
   colour letter on every sticker so colour is never the only channel.
   ══════════════════════════════════════════════════════════════════════════ */

/** The faces a solver has in view, in reading order. Matches `DEFAULT_VIEW_FACES`. */
export const VISIBLE_FACES: Face[] = ['U', 'F', 'R'];

export const FACE_WORD: Record<Face, string> = {
  U: 'Up', R: 'Right', F: 'Front', D: 'Down', L: 'Left', B: 'Back',
};

/** `SLOTS` is face-major: face index × 9, then row × 3, then column. */
export const slotIndex = (face: Face, row: number, col: number) =>
  FACES.indexOf(face) * 9 + row * 3 + col;

/** One face as three rows of three colour ids. `null` is an unpainted sticker. */
export function faceGrid(state: CubeState, face: Face): (ColorId | null)[][] {
  const rows: (ColorId | null)[][] = [];
  for (let r = 0; r < 3; r++) {
    const row: (ColorId | null)[] = [];
    for (let c = 0; c < 3; c++) row.push(state.colors[slotIndex(face, r, c)] ?? null);
    rows.push(row);
  }
  return rows;
}

export const STATIC_FACE_GAP = 10;
export const STATIC_STICKER_GAP = 2;

/**
 * The edge of one face in the static diagram: three side by side inside the
 * cube's band. Not a touch target - nothing in the diagram is tappable, it is
 * there to be read.
 */
export function staticFaceSize(width: number, height: number): number {
  const byWidth = (width - STRIP_GUTTER * 2 - STATIC_FACE_GAP * 2) / 3;
  // One row of face labels above the grids.
  const byHeight = height - 28;
  return Math.max(48, Math.floor(Math.min(byWidth, byHeight)));
}

/* ══════════════════════════════════════════════════════════════════════════
   7. The glyph
   ─────────────────────────────────────────────────────────────────────────
   SWAP: the real glyph is `src/ui/glyphs.ts` + `MoveGlyph`, being built in the
   main tree. `MoveGlyphProps` below is the interface this page calls it
   through and is the spec's own signature (§4.6), so pointing the page at the
   real component is a one-line prop change - see `MoveGlyphStub.tsx`.
   `glyphGeometry` drives the stub ONLY and is deleted with it.
   ══════════════════════════════════════════════════════════════════════════ */

export interface MoveGlyphProps {
  /** The move in standard notation: `R`, `U'`, `F2`, `Rw`, `M`, `x`. */
  notation: string;
  /** Edge of the square tile the glyph draws inside. */
  size: number;
  /** Playhead relationship. Drives emphasis, and is never the only channel. */
  state?: GlyphState;
  /**
   * An 8pt caption of the letters inside the tile's bottom edge. Default off -
   * the user asked for symbols instead of letters. It is a prop rather than a
   * redesign in case that is ever wanted back.
   */
  showLetter?: boolean;
  /** Spoken form. The strip owns the wording, so it is passed down. */
  accessibilityLabel?: string;
}

/** Which band of the 3x3 grid a move carries, and which way it turns. */
export interface GlyphGeometry {
  /** 'col' = a vertical band (R, L, M, x), 'row' = a horizontal one (U, D, E, y). */
  band: 'row' | 'col' | 'face';
  /**
   * Which thirds are carried, left-to-right or top-to-bottom; several for a
   * wide move.
   *
   * For a `face` turn these are DEPTHS, not bands, and they are what tells F
   * from B. Seen head on, F' and B turn the same way - the arrow is identical -
   * and only which layer is moving separates them. Drawing both as a curve
   * across the whole face made them one glyph, which the verifier caught.
   */
  cells: number[];
  /** Screen direction of the turn. */
  dir: 'up' | 'down' | 'left' | 'right' | 'cw' | 'ccw';
  /** A whole-face turn draws a curve rather than a straight arrow. */
  curved: boolean;
  /**
   * A half turn draws TWO heads rather than carrying the character `2`.
   * The page's whole premise is symbols instead of letters, and `U2` genuinely
   * has no direction - which a double head states and a numeral does not.
   */
  doubleHead: boolean;
  /** A whole-cube rotation carries every band and is drawn quieter. */
  wholeCube: boolean;
}

const BAND_OF: Record<string, { band: 'row' | 'col' | 'face'; cells: number[]; positive: boolean }> = {
  // Vertical bands, seen from the front. Column 2 is the right-hand face.
  R: { band: 'col', cells: [2], positive: false },
  L: { band: 'col', cells: [0], positive: true },
  M: { band: 'col', cells: [1], positive: true },
  Rw: { band: 'col', cells: [1, 2], positive: false },
  Lw: { band: 'col', cells: [0, 1], positive: true },
  x: { band: 'col', cells: [0, 1, 2], positive: false },
  // Horizontal bands. Row 0 is the top face.
  U: { band: 'row', cells: [0], positive: false },
  D: { band: 'row', cells: [2], positive: true },
  E: { band: 'row', cells: [1], positive: true },
  Uw: { band: 'row', cells: [0, 1], positive: false },
  Dw: { band: 'row', cells: [1, 2], positive: true },
  y: { band: 'row', cells: [0, 1, 2], positive: false },
  // Turns of the face you are looking at, which read as a rotation. Here the
  // cells are depths: 2 is the layer nearest the reader, 0 the one at the back.
  // `B` is drawn ANTICLOCKWISE - what you see from the front - because the
  // animation playing six inches above the glyph shows it that way. Printed
  // tutorials draw it as the performer sees it; consistency with the cube wins.
  F: { band: 'face', cells: [2], positive: false },
  S: { band: 'face', cells: [1], positive: false },
  B: { band: 'face', cells: [0], positive: true },
  Fw: { band: 'face', cells: [1, 2], positive: false },
  Bw: { band: 'face', cells: [0, 1], positive: true },
  z: { band: 'face', cells: [0, 1, 2], positive: false },
};

export function glyphGeometry(move: Move): GlyphGeometry {
  const b = BAND_OF[move.base] ?? BAND_OF.F;
  // `amount` is 1, -1 or 2; a half turn keeps the clockwise sense and gains a
  // second head rather than becoming a different arrow.
  const forward = b.positive === (move.amount !== -1);
  const dir =
    b.band === 'col'
      ? forward
        ? 'down'
        : 'up'
      : b.band === 'row'
        ? forward
          ? 'right'
          : 'left'
        : forward
          ? 'ccw'
          : 'cw';
  return {
    band: b.band,
    cells: b.cells,
    dir,
    curved: b.band === 'face',
    doubleHead: move.amount === 2,
    wholeCube: /^[xyz]$/.test(move.base),
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   8. The library
   ══════════════════════════════════════════════════════════════════════════ */

/** Row height: the 44pt floor plus twelve of breathing room. One line of text. */
export const LIBRARY_ROW_H = 56;
/** The mastery rail down a row's leading edge. */
export const LIBRARY_RAIL_W = 4;
/** The glyph preview at the right of a row. */
export const PREVIEW_TILE = 36;
export const PREVIEW_GAP = 4;

/**
 * How many glyphs a row previews.
 *
 * Four is the shape you recognise an algorithm by. At 375pt four previews cost
 * 4 × 36 + 3 × 4 = 156pt and leave 175 for the name, which is enough; below
 * 380 it drops to three rather than truncating the name to nothing.
 */
export const previewCount = (width: number) => (width >= 380 ? 4 : 3);

/**
 * Two columns once there is room for two full rows side by side.
 *
 * Measured, not a device class: the tablet's side panel is narrower than the
 * tablet, and the same list has to be right in both.
 */
export const LIBRARY_ROW_MIN = 260;
export const LIBRARY_COL_GAP = 12;

export function libraryColumns(width: number): number {
  const content = width - STRIP_GUTTER * 2;
  const cols = Math.floor((content + LIBRARY_COL_GAP) / (LIBRARY_ROW_MIN + LIBRARY_COL_GAP));
  return clamp(cols, 1, 2);
}

export interface CategoryGroup<T> {
  category: string;
  items: T[];
}

/** Items under their category headings, in the library's stated order. */
export function groupByCategory<T extends { category: string }>(
  items: readonly T[],
  order: readonly string[]
): CategoryGroup<T>[] {
  const seen = new Map<string, T[]>();
  for (const it of items) {
    const bucket = seen.get(it.category);
    if (bucket) bucket.push(it);
    else seen.set(it.category, [it]);
  }
  const out: CategoryGroup<T>[] = [];
  for (const category of order) {
    const list = seen.get(category);
    if (list?.length) out.push({ category, items: list });
    seen.delete(category);
  }
  // Anything the order forgot is still shown rather than silently dropped.
  for (const [category, list] of seen) out.push({ category, items: list });
  return out;
}

/**
 * The algorithms this solve actually teaches, in plan order, deduplicated.
 *
 * **This is the library's default scope, and it is the whole answer to
 * `806ced6`.** That commit dropped an algorithm-browsing tab because
 * "filtering a library by which algorithms touch a piece never answered the
 * question someone holding a cube actually has". It was a query over all 55
 * entries with no notion of this cube, this learner, or any meaningful order.
 *
 * This is the opposite of that in four ways, and each one is checkable: the
 * default scope is the plan rather than the catalogue; every row carries the
 * learner's own mastery; every row opens a lesson rather than a filter result;
 * and it is not on the top-level navigation, so it cannot compete with the
 * step list. It never tries to answer "how do I get this piece home" - the
 * piece-picking flow that replaced the tab still owns that, untouched.
 */
export function algorithmIdsInPlan(
  steps: readonly { algorithmId?: string }[]
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of steps) {
    if (!s.algorithmId || seen.has(s.algorithmId)) continue;
    seen.add(s.algorithmId);
    out.push(s.algorithmId);
  }
  return out;
}

/**
 * The one line a library row prints under the name, when there is room.
 *
 * The engine-verified `note` truncated to its first sentence: the notes were
 * written for the teaching page, where there is room for five lines, and a row
 * that prints all of one pushes the next row off the screen. The full note is
 * one tap away and is the first thing the page shows.
 */
export const ROW_SUMMARY_MAX = 72;

export function rowSummary(note: string | undefined, moveCount: number): string {
  const count = `${moveCount} move${moveCount === 1 ? '' : 's'}`;
  if (!note) return count;
  // No lookbehind: Hermes is not guaranteed to have it, and a regex that only
  // fails on a device is exactly what this file exists to avoid.
  const stop = note.search(/[.;]\s/);
  let first = (stop === -1 ? note : note.slice(0, stop)).replace(/[.;]$/, '').trim();
  // A sentence is not a length. Several of the merged notes open with a
  // hundred-character clause, and `numberOfLines={1}` would truncate that
  // mid-word at whatever the font happened to measure. Cutting on a word
  // boundary, here, means the row is the same length on every device.
  const room = ROW_SUMMARY_MAX - count.length - 3;
  if (first.length > room) {
    const cut = first.slice(0, room);
    const space = cut.lastIndexOf(' ');
    first = `${(space > room * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
  }
  return `${count} · ${first}`;
}

/** The suffix a row's spoken label carries. `unseen` says nothing. */
export const masterySuffix = (m: 'unseen' | 'learning' | 'known') =>
  m === 'known' ? ', known' : m === 'learning' ? ', learning' : '';

/** How much of the rail is filled: none, the top 40%, or all of it. */
export const railShare = (m: 'unseen' | 'learning' | 'known') =>
  m === 'known' ? 1 : m === 'learning' ? 0.4 : 0;
