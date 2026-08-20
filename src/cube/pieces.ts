/**
 * Pairing a cubie with its opposite number: the piece that belongs in a slot,
 * or the slot a piece belongs in.
 */
import { CubeState, Vec3, vecKey } from './core';
import { CORNER_POSITION, EDGE_POSITION, stateToCubie } from './cubie';

export type HighlightMode = 'location' | 'piece';

const CORNER_POS = CORNER_POSITION;
const EDGE_POS = EDGE_POSITION;
const CORNER_KEYS = CORNER_POS.map(vecKey);
const EDGE_KEYS = EDGE_POS.map(vecKey);

export interface PiecePair {
  /** The cubie the user picked. */
  primary: Vec3;
  /**
   * In location mode, where the piece that belongs in `primary` is sitting now.
   * In piece mode, the slot the piece in `primary` belongs in.
   */
  partner: Vec3 | null;
  /** True when the piece is already where it belongs, so both are the same. */
  atHome: boolean;
  /** Why there is no partner, when there isn't one. */
  reason?: string;
}

function locate(pos: Vec3) {
  const key = vecKey(pos);
  const corner = CORNER_KEYS.indexOf(key);
  if (corner >= 0) return { kind: 'corner' as const, index: corner };
  const edge = EDGE_KEYS.indexOf(key);
  if (edge >= 0) return { kind: 'edge' as const, index: edge };
  return null;
}

export function pairFor(state: CubeState, pos: Vec3, mode: HighlightMode): PiecePair {
  const at = locate(pos);
  if (!at) return { primary: pos, partner: null, atHome: false, reason: 'Centres never move.' };

  let cube;
  try {
    cube = stateToCubie(state);
  } catch {
    return {
      primary: pos,
      partner: null,
      atHome: false,
      reason: 'Finish painting the cube to see where this piece belongs.',
    };
  }

  const perm = at.kind === 'corner' ? cube.cp : cube.ep;
  const table = at.kind === 'corner' ? CORNER_POS : EDGE_POS;
  // location: the piece belonging here is piece `index`; find where it sits.
  // piece: the piece sitting here is `perm[index]`; its home is that slot.
  const partnerIndex = mode === 'location' ? perm.indexOf(at.index) : perm[at.index];
  if (partnerIndex < 0) return { primary: pos, partner: null, atHome: false };

  const partner = table[partnerIndex];
  return { primary: pos, partner, atHome: vecKey(partner) === vecKey(pos) };
}
