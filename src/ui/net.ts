/**
 * Geometry for the flat net view.
 *
 * No react-native import, so `scripts/verify-net.ts` can load it. That matters
 * more here than anywhere else in the app: `slotIndex` is the mapping between
 * what the net says a cell is ("Up face, row 1, column 3") and which of the 54
 * stickers it actually paints, and the net is the *only* way a screen-reader
 * user can paint at all. Transposing it would silently paint a different cube
 * than the 3D view shows, and nothing on screen would say so.
 */
import { FACES, Face } from '../cube/core';

/** `SLOTS` is face-major: face index × 9, then row × 3, then column. */
export const slotIndex = (face: Face, row: number, col: number) =>
  FACES.indexOf(face) * 9 + row * 3 + col;

export const FACE_WORD: Record<Face, string> = {
  U: 'Up',
  R: 'Right',
  F: 'Front',
  D: 'Down',
  L: 'Left',
  B: 'Back',
};

/**
 * The order a reader walks the net, which is also the DOM order and so the
 * focus order. Not `SLOTS` order: it follows how the faces are drawn.
 */
export const FOCUS_ORDER: Face[] = ['U', 'L', 'F', 'R', 'B', 'D'];

/**
 * Two layouts, chosen by measured width rather than by device class.
 *
 * `cross` is the unfolded diagram every printed guide uses. It is four faces
 * wide, and at an honest 44pt cell pitch that is ~560pt - wider than any phone.
 * So phones get `pairs`: the same six faces, two per row, in focus order, so
 * reading order and focus order still agree and no face is ever split.
 */
export type NetLayout = 'cross' | 'pairs';

/** Rows of faces for a layout. `null` is a leading blank of one face width. */
export const NET_ROWS: Record<NetLayout, (Face | null)[][]> = {
  cross: [
    [null, 'U'],
    ['L', 'F', 'R', 'B'],
    [null, 'D'],
  ],
  pairs: [
    ['U', 'L'],
    ['F', 'R'],
    ['B', 'D'],
  ],
};

/**
 * A cell is 40pt on a 4pt gutter, so the *pitch* is 44 and every target is a
 * true 44 × 44 without borrowing from its neighbour.
 *
 * The rule the round-2 net broke: `CELL + CELL_GAP >= 44`. A 34pt cell with 5pt
 * of `hitSlop` claims 44pt on a 37pt pitch, so neighbouring targets overlapped
 * by 7pt and a tap in that band painted the wrong sticker. Slop cannot buy a
 * target the pitch does not carry.
 */
export const CELL = 40;
export const CELL_GAP = 4;
export const CELL_PITCH = CELL + CELL_GAP;
export const FACE_SIZE = CELL * 3 + CELL_GAP * 2; // 128
export const FACE_GAP = 12;
export const LABEL_H = 14;

export const netWidth = (layout: NetLayout) =>
  layout === 'cross' ? FACE_SIZE * 4 + FACE_GAP * 3 : FACE_SIZE * 2 + FACE_GAP;

export const netHeight = () => (FACE_SIZE + LABEL_H) * 3 + FACE_GAP * 2;

/** Below this the cross does not fit, so the two-up layout is used. */
export const CROSS_MIN_WIDTH = netWidth('cross') + 32;

export const layoutFor = (availableWidth: number): NetLayout =>
  availableWidth >= CROSS_MIN_WIDTH ? 'cross' : 'pairs';
