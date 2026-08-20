/**
 * Whole-cube rotations, and the bookkeeping that lets the cube be re-labelled
 * to match how the viewer is currently holding it.
 *
 * The cube state has fixed face labels (U, R, F, D, L, B) but the viewer can
 * turn the cube to any angle. Once a different face is at the bottom of the
 * screen, that face should *be* the bottom as far as the solver and the move
 * notation are concerned - otherwise "R" means a face that is nowhere near the
 * right of the screen.
 */
import {
  FACES,
  FACE_NORMAL,
  Face,
  Vec3,
  moveQuarterTurns,
  MOVE_DEFS,
  parseAlg,
  rotateVec,
  vecKey,
} from './core';

const FACE_BY_NORMAL = new Map<string, Face>(
  FACES.map((f) => [vecKey(FACE_NORMAL[f]), f])
);

export interface CubeRotation {
  /** Notation for the rotation, e.g. `z2` or `x y'`. Empty means no turn. */
  alg: string;
  /** Where the sticker on each face ends up. */
  faceMap: Record<Face, Face>;
  /** Images of the +X, +Y and +Z axes - the rotation as a matrix. */
  basis: [Vec3, Vec3, Vec3];
}

/** Apply a whole-cube rotation alg to a single vector. */
function rotateThrough(alg: string, v: Vec3): Vec3 {
  let out = v;
  for (const mv of parseAlg(alg)) {
    const def = MOVE_DEFS[mv.base];
    out = rotateVec(out, def.axis, moveQuarterTurns(mv));
  }
  return out;
}

function build(alg: string): CubeRotation {
  const faceMap = {} as Record<Face, Face>;
  for (const f of FACES) {
    const moved = rotateThrough(alg, FACE_NORMAL[f]);
    faceMap[f] = FACE_BY_NORMAL.get(vecKey(moved))!;
  }
  return {
    alg,
    faceMap,
    basis: [
      rotateThrough(alg, [1, 0, 0]),
      rotateThrough(alg, [0, 1, 0]),
      rotateThrough(alg, [0, 0, 1]),
    ],
  };
}

/** All 24 ways the cube can sit, shortest notation first. */
export const ROTATIONS: CubeRotation[] = (() => {
  const seen = new Set<string>();
  const out: CubeRotation[] = [];
  for (const a of ['', 'x', 'x2', "x'", 'z', 'z2', "z'"]) {
    for (const b of ['', 'y', 'y2', "y'"]) {
      const alg = `${a} ${b}`.trim().replace(/\s+/g, ' ');
      const rot = build(alg);
      const key = FACES.map((f) => rot.faceMap[f]).join('');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(rot);
    }
  }
  return out.sort(
    (p, q) => p.alg.split(' ').filter(Boolean).length - q.alg.split(' ').filter(Boolean).length
  );
})();

export const IDENTITY_ROTATION = ROTATIONS.find((r) => r.alg === '')!;

/**
 * The rotation that brings `down` to the bottom and `front` to the front.
 * Returns null if those two faces are not at right angles.
 */
export function rotationBringing(down: Face, front: Face): CubeRotation | null {
  return (
    ROTATIONS.find((r) => r.faceMap[down] === 'D' && r.faceMap[front] === 'F') ?? null
  );
}

/** Where a cubie at `pos` ends up under this rotation. */
export const rotateCubie = (rot: CubeRotation, pos: Vec3): Vec3 => [
  rot.basis[0][0] * pos[0] + rot.basis[1][0] * pos[1] + rot.basis[2][0] * pos[2],
  rot.basis[0][1] * pos[0] + rot.basis[1][1] * pos[1] + rot.basis[2][1] * pos[2],
  rot.basis[0][2] * pos[0] + rot.basis[1][2] * pos[1] + rot.basis[2][2] * pos[2],
];
