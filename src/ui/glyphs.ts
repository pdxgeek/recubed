/**
 * A move drawn as a diagram instead of spelled as a letter.
 *
 * From the user, holding a printed beginner's tutorial: "I like these symbols
 * better than the letters". Each move in that tutorial is a small 3x3 grid with
 * an arrow across it - along the top row for a turn of the top layer, up a side
 * column for a side one, a curved arrow for turning the whole face you are
 * looking at. Eight of them in a row read like a filmstrip: the eye takes in the
 * SHAPE of an algorithm without decoding anything.
 *
 * The grid is the FRONT face, drawn flat. Every move is described by three
 * things:
 *
 *   - the BAND of the grid the move carries - the top row, the bottom row, a
 *     side column, or the whole face;
 *   - the ARROW's direction - along the band for a slice, curved for a whole
 *     face;
 *   - whether the layer is the near one or the far one, because a turn of the
 *     back face is a whole-face turn of a layer you cannot see.
 *
 * NONE OF THAT IS WRITTEN DOWN FROM MEMORY. `scripts/verify-glyphs.ts` derives
 * every band and every direction from the engine itself - it takes the stickers
 * a move actually carries, rotates them the way `MOVE_DEFS` says the move
 * rotates them, and reads the direction they travel in the face's own plane -
 * and fails if this table disagrees. It also checks that the face's own frame
 * still maps to right-and-up on screen at the app's resting viewing angle, so
 * the flat diagram agrees with the cube the learner is looking at.
 *
 * No react-native import, which is what lets the verifier load it.
 */
import { MOVE_DEFS, Vec3, rotateVec } from '../cube/core';

/** A straight arrow along a slice, or a curved one for a turn in the page. */
export type GlyphShape = 'straight' | 'curve';

/** Where the arrow goes. `cw`/`ccw` are the curved ones. */
export type GlyphArrow = 'left' | 'right' | 'up' | 'down' | 'cw' | 'ccw';

export interface GlyphCell {
  row: number;
  col: number;
}

export interface MoveGlyph {
  notation: string;
  /** The base letter, without `w`, `'` or `2`. */
  base: string;
  shape: GlyphShape;
  arrow: GlyphArrow;
  /** The cells of the grid the move carries. Empty for a whole-cube rotation. */
  cells: GlyphCell[];
  /** Two layers: two shafts, or two concentric arcs, sharing one head. */
  wide: boolean;
  /**
   * The layer is behind the one you are looking at, so the cells are drawn
   * hollow. Without it `B` and `F'` are the same picture.
   */
  hollow: boolean;
  /** A whole-cube rotation: the grid shrinks and the arrow goes outside it. */
  whole: boolean;
  /**
   * A half turn. BOTH ends of the arrow get a head - not a numeral, and not a
   * second chevron. `U2` genuinely has no direction, `U2` and `U'2` are the
   * same move, and two heads is the only mark that says so rather than counting
   * something. It is also a different SILHOUETTE rather than a finer detail,
   * which is what survives at chip size.
   */
  half: boolean;
  /** "R prime", "R wide", "x rotation twice". */
  spoken: string;
}

const REVERSE: Record<GlyphArrow, GlyphArrow> = {
  left: 'right',
  right: 'left',
  up: 'down',
  down: 'up',
  cw: 'ccw',
  ccw: 'cw',
};

/**
 * HOW A MOVE IS SPOKEN.
 *
 * `R'` reads as "R apostrophe" if you hand it to a screen reader raw, which is
 * why this exists at all. But the version that lived in two components did
 * `notation[0]` and threw the rest away, so `Rw` - a WIDE turn, two layers -
 * was announced as `R`. Four of the library's algorithms were being read out to
 * a screen-reader user as a DIFFERENT ALGORITHM, on the surface the whole
 * accessibility story rests on. `verify-glyphs.ts` now says every move the
 * library can emit out loud and checks no two of them collide.
 *
 *   R      "R"                  a face
 *   Rw     "R wide"             two layers, the face and the one behind it
 *   M      "M"                  a slice; the letter is its name
 *   x      "x rotation"         the whole cube, and a bare "x" is not a word
 *   R'     "R prime"            never "apostrophe"
 *   Rw2    "R wide twice"
 */
export function spokenMove(notation: string): string {
  const m = /^([URFDLBMES])(w?)(['2]?)$/.exec(notation) ?? /^([xyz])()(['2]?)$/.exec(notation);
  if (!m) return notation;
  const [, letter, wide, suffix] = m;
  const base = /[xyz]/.test(letter) ? `${letter} rotation` : wide ? `${letter} wide` : letter;
  if (suffix === "'") return `${base} prime`;
  if (suffix === '2') return `${base} twice`;
  return base;
}

/**
 * The front face's own frame, in world terms: `faceCell(F, r, c)` is
 * `[c - 1, 1 - r, 1]`, so a column runs along +x and a row runs down -y.
 */
const RIGHT: Vec3 = [1, 0, 0];
const FRONT: Vec3 = [0, 0, 1];

const dominant = (v: Vec3): GlyphArrow | null => {
  if (Math.abs(v[0]) > 0.5) return v[0] > 0 ? 'right' : 'left';
  if (Math.abs(v[1]) > 0.5) return v[1] > 0 ? 'up' : 'down';
  return null;
};

/**
 * The glyph for a move, DERIVED from the engine's own move table.
 *
 * One clockwise turn of the move is `turnsPerClockwise` quarter turns about
 * `axis`. Apply that to the vector pointing out of the front face:
 *
 *   - it lands on a side, so the face you are looking at slides that way and
 *     the arrow is straight, pointing there;
 *   - it does not move at all, so the axis IS the front and the face spins in
 *     the plane of the page: the arrow is curved, and its sense is which way
 *     the same turn takes the vector pointing RIGHT.
 *
 * `layers` gives the cells: values along x are columns of the grid, values
 * along y are rows, and a layer on z is the near face, the far face, or the
 * slice between them. Nothing in this function is written down from memory, and
 * `scripts/verify-glyphs.ts` checks the result against the stickers the engine
 * really carries.
 */
export function glyphFor(notation: string): MoveGlyph | null {
  const m = /^([URFDLBMES]w?|[xyz])(['2]?)$/.exec(notation);
  if (!m) return null;
  const [, base, suffix] = m;
  const def = MOVE_DEFS[base];
  if (!def) return null;

  const turned = rotateVec(FRONT, def.axis, def.turnsPerClockwise);
  const slide = dominant(turned);
  const shape: GlyphShape = slide ? 'straight' : 'curve';
  const spin: GlyphArrow = dominant(rotateVec(RIGHT, def.axis, def.turnsPerClockwise)) === 'down'
    ? 'cw'
    : 'ccw';
  const base_arrow: GlyphArrow = slide ?? spin;

  const cells: GlyphCell[] = [];
  const whole = def.layers.length === 3;
  if (!whole) {
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        // The cubie carrying front-face cell (row, col).
        const at: Vec3 = [col - 1, 1 - row, 1];
        const on =
          def.axis === 2
            ? // A layer on z is a whole face turning in the plane of the page.
              // Two of the three do not touch the front face at all, so they
              // cannot "light the stickers they carry" - they are drawn as what
              // the learner is looking at: the near face fills the grid, the
              // far face fills it hollow, and the slice between them is a plus.
              def.layers.includes(1) || def.layers.includes(-1)
              ? true
              : row === 1 || col === 1
            : def.layers.includes(at[def.axis]);
        if (on) cells.push({ row, col });
      }
    }
  }

  // Hollow means "the layer behind the one you are looking at", so it is the
  // far side of the cube and nothing else: `B` and `Bw` yes, the middle slice
  // `S` no. Without it `B` and `F'` are the same picture.
  const hollow = def.axis === 2 && !whole && Math.min(...def.layers) < 0;

  return {
    notation,
    base,
    shape,
    arrow: suffix === "'" ? REVERSE[base_arrow] : base_arrow,
    cells,
    wide: def.layers.length === 2,
    hollow,
    whole,
    half: suffix === '2',
    spoken: spokenMove(notation),
  };
}

/** Every move a glyph exists for, for the verifier and for a specimen sheet. */
export const GLYPH_MOVES = Object.keys(MOVE_DEFS).flatMap((b) => [b, `${b}'`, `${b}2`]);

/** The six face turns, which is what a beginner plan is almost entirely made of. */
export const FACE_MOVES = ['U', 'D', 'R', 'L', 'F', 'B'];
