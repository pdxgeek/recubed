/**
 * Renderer checks: CubeScene driven headlessly against a recording fake GL
 * context (scripts/fakegl.ts).
 *
 * What this proves: which draw calls a frame contains, with which matrices.
 * It is the only automated cover for src/render/, and it locks:
 *   1. wireframe really strips the tiles it flags invisible;
 *   2. the keep-set contract (centres plus the pieces in play stay solid);
 *   3. highlight rings land on the right stickers, in the right colours;
 *   4. picking round-trips against the very matrices the frame was drawn with;
 *   5. a resized surface re-fits the projection and keeps picking honest.
 *
 * What it does NOT prove: anything about expo-gl's native path. AGENTS.md
 * documents two traps there (GLView needs msaaSamples={0}; getParameter on
 * FRAMEBUFFER_BINDING throws) which no headless harness can reach.
 */
import { Matrix4, Vector3, Vector4 } from 'three';
import {
  CUBIES,
  SLOTS,
  SLOTS_BY_CUBIE,
  cubieKind,
  isCenter,
  solvedState,
  vecKey,
} from '../src/cube/core';
import { CubeScene, SCENE_COLORS } from '../src/render/CubeScene';
import { DrawCall, colorHex, createFakeGL, modelKey } from './fakegl';

let fails = 0;
const check = (name: string, ok: boolean, extra = '') => {
  if (ok) console.log(`ok    ${name}`);
  else {
    fails++;
    console.log(`FAIL  ${name} ${extra}`);
  }
};

const gl = createFakeGL(600, 900);
const scene = new CubeScene(gl as unknown as WebGLRenderingContext, 600, 900);
scene.setColors(solvedState());

// -- classifying a recorded frame -------------------------------------------

const isBody = (d: DrawCall) => d.count === 36;
const isCage = (d: DrawCall) => d.mode === gl.LINES;
const isRing = (d: DrawCall) => d.count === 6 && d.unlit === 1;
const isSticker = (d: DrawCall) => d.count === 6 && d.unlit === 0;

function frame() {
  gl.reset();
  scene.render();
  const draws = gl.draws;
  return {
    draws,
    bodies: draws.filter(isBody),
    cages: draws.filter(isCage),
    rings: draws.filter(isRing),
    stickers: draws.filter(isSticker),
  };
}

/**
 * Every sticker quad the scene can draw, keyed by its model matrix. Taken from
 * a frame with nothing hidden, where the draw order is exactly the scene's own
 * iteration order, so no sticker geometry is recomputed here.
 */
const CUBIE_ORDER = CUBIES.filter((p) => cubieKind(p) > 0);
const SLOT_ORDER = CUBIE_ORDER.flatMap((p) => SLOTS_BY_CUBIE.get(vecKey(p)) ?? []);

scene.setWireframe(false);
scene.setTargets([]);
const base = frame();
check('a plain frame draws 26 bodies, no cages and 54 tiles',
  base.bodies.length === 26 && base.cages.length === 0 && base.stickers.length === 54,
  `bodies=${base.bodies.length} cages=${base.cages.length} tiles=${base.stickers.length}`);

const slotOfModel = new Map<string, number>();
base.stickers.forEach((d, i) => slotOfModel.set(modelKey(d.model), SLOT_ORDER[i]));
check('every tile quad is identifiable by its model matrix',
  slotOfModel.size === 54, `distinct=${slotOfModel.size}`);

const drawnSlots = (draws: DrawCall[]) =>
  draws.map((d) => slotOfModel.get(modelKey(d.model)) ?? -1);

// -- 1. wireframe hides the tiles it flags invisible -------------------------

const CENTRE_SLOTS = SLOTS.filter((s) => isCenter(s.pos)).map((s) => s.index);

scene.setWireframe(true);
const bare = frame();
check('wireframe with nothing in play keeps the six centres solid',
  bare.bodies.length === 6, `bodies=${bare.bodies.length}`);
check('wireframe cages the other twenty cubies',
  bare.cages.length === 20, `cages=${bare.cages.length}`);
check('wireframe draws only the six centre tiles',
  bare.stickers.length === 6, `tiles=${bare.stickers.length}`);
check('no tile on a caged cubie is drawn',
  drawnSlots(bare.stickers).every((s) => CENTRE_SLOTS.includes(s)),
  JSON.stringify(drawnSlots(bare.stickers)));

// The sharp form of the same claim, stated the way the bug was: the scene
// flags 45 stickers invisible, and not one of them may reach a draw call.
const invisible = SLOTS.map((s) => s.index).filter((i) => !CENTRE_SLOTS.includes(i));
check('none of the 48 stickers flagged invisible produces a draw call',
  drawnSlots(bare.stickers).every((s) => !invisible.includes(s)),
  `${drawnSlots(bare.stickers).filter((s) => invisible.includes(s)).length} leaked`);

// -- 2. the keep set: pieces in play stay solid ------------------------------

const corner = vecKey([1, 1, 1]);
const edge = vecKey([1, 1, 0]);
scene.setTargets([corner, edge]);
const inPlay = frame();
const keptSlots = [
  ...CENTRE_SLOTS,
  ...(SLOTS_BY_CUBIE.get(corner) ?? []),
  ...(SLOTS_BY_CUBIE.get(edge) ?? []),
];
check('the pieces in play join the centres as solid bodies',
  inPlay.bodies.length === 8, `bodies=${inPlay.bodies.length}`);
check('the rest stay caged',
  inPlay.cages.length === 18, `cages=${inPlay.cages.length}`);
check('exactly the tiles of the centres and the pieces in play are drawn',
  inPlay.stickers.length === keptSlots.length &&
    drawnSlots(inPlay.stickers).every((s) => keptSlots.includes(s)),
  `tiles=${inPlay.stickers.length} want=${keptSlots.length}`);

// -- 3. highlight rings ------------------------------------------------------

const selected = SLOTS_BY_CUBIE.get(corner)!;
const partner = SLOTS_BY_CUBIE.get(edge)!;
const hiddenTarget = SLOTS_BY_CUBIE.get(vecKey([-1, -1, -1]))!;
scene.setHighlights({ selected, partner, target: hiddenTarget });
const ringed = frame();
const byColor = (hex: string) => ringed.rings.filter((d) => colorHex(d.color) === hex);
check('the selected piece wears white rings on every visible tile',
  byColor(SCENE_COLORS.selected).length === selected.length,
  `${byColor(SCENE_COLORS.selected).length} of ${selected.length}`);
check('its partner wears amber rings',
  byColor(SCENE_COLORS.partner).length === partner.length,
  `${byColor(SCENE_COLORS.partner).length} of ${partner.length}`);
check('a ring on a caged cubie is not drawn',
  byColor(SCENE_COLORS.target).length === 0,
  `${byColor(SCENE_COLORS.target).length} leaked`);
check('every ring is drawn unlit, so it reads as paint rather than a surface',
  ringed.rings.every((d) => d.unlit === 1));

// With the cube whole again the third highlight has somewhere to land.
scene.setWireframe(false);
const ringedSolid = frame();
const byColorSolid = (hex: string) =>
  ringedSolid.rings.filter((d) => colorHex(d.color) === hex).length;
check('a solid cube shows all three highlight colours',
  byColorSolid(SCENE_COLORS.selected) === selected.length &&
    byColorSolid(SCENE_COLORS.partner) === partner.length &&
    byColorSolid(SCENE_COLORS.target) === hiddenTarget.length,
  `${byColorSolid(SCENE_COLORS.selected)}/${byColorSolid(SCENE_COLORS.partner)}/${byColorSolid(SCENE_COLORS.target)}`);

scene.setHighlights({});

// -- 4/5. picking round-trips, at both surface sizes -------------------------

/** Project a recorded tile back to canvas coordinates and ask pick() for it. */
function pickRoundTrip(label: string) {
  const f = frame();
  const P = new Matrix4().fromArray(gl.proj);
  const V = new Matrix4().fromArray(gl.view);
  const PV = new Matrix4().multiplyMatrices(P, V);
  const camera = new Vector3(0, 0, -gl.view[14]);
  let tested = 0;
  let wrong = 0;
  // Nothing is hidden here, so the draw order is the scene's iteration order.
  f.stickers.forEach((d, i) => {
    const M = new Matrix4().fromArray(d.model);
    const world = new Vector3(0, 0, 0).applyMatrix4(M);
    const normal = new Vector3(M.elements[8], M.elements[9], M.elements[10]).normalize();
    const toCamera = camera.clone().sub(world).normalize();
    // Grazing tiles legitimately occlude one another (STICKER_LIFT exceeds the
    // gap between cubies), so only face-on tiles are asserted.
    if (toCamera.dot(normal) < 0.7) return;
    const clip = new Vector4(world.x, world.y, world.z, 1).applyMatrix4(PV);
    const u = (clip.x / clip.w + 1) / 2;
    const v = (1 - clip.y / clip.w) / 2;
    const got = scene.pick(u, v);
    tested++;
    const want = SLOT_ORDER[i];
    if (got === null || vecKey(SLOTS[got].pos) !== vecKey(SLOTS[want].pos)) wrong++;
  });
  check(`${label}: every face-on tile picks its own cubie`,
    tested > 0 && wrong === 0, `tested=${tested} wrong=${wrong}`);
}

let orientations = 0;
for (let i = 0; i < 24; i++) {
  scene.orbit(((i * 37) % 71) - 35, ((i * 19) % 41) - 20);
  scene.stopSpin();
  orientations++;
  pickRoundTrip(`orientation ${i}`);
}
check(`picking checked over ${orientations} orientations`, orientations === 24);

// The bug this guards: the canvas never told the scene its surface had changed,
// so both the projection and pick()'s aspect stayed at the size the context was
// created with. This is exactly the call the render loop now makes.
check('resizeIfNeeded is a no-op when the surface has not changed',
  scene.resizeIfNeeded(gl.drawingBufferWidth, gl.drawingBufferHeight) === false);

gl.drawingBufferWidth = 1024;
gl.drawingBufferHeight = 700;
check('resizeIfNeeded reports a real change',
  scene.resizeIfNeeded(gl.drawingBufferWidth, gl.drawingBufferHeight) === true);
check('the scene adopts the new surface size',
  scene.size.width === 1024 && scene.size.height === 700,
  JSON.stringify(scene.size));
frame();
check('the viewport follows the surface',
  gl.viewportRect[2] === 1024 && gl.viewportRect[3] === 700, JSON.stringify(gl.viewportRect));
pickRoundTrip('after a landscape resize');

console.log(fails ? `\n${fails} renderer check(s) failed` : '\nall renderer checks passed');
process.exit(fails ? 1 : 0);
