/**
 * WebGL renderer for the cube.
 *
 * three.js is used only for its maths types. Its WebGLRenderer does not drive
 * an expo-gl context correctly (the frame never reaches the presented buffer),
 * so the draw calls here are written against WebGL directly. The scene is a
 * hundred or so quads, which a plain draw loop handles comfortably.
 */
import { Matrix3, Matrix4, Quaternion, Vector3 } from 'three';
import { CubeRotation } from '../cube/orientation';
import {
  COLOR_HEX,
  FACES,
  FACE_NORMAL,
  Face,
  CUBIES,
  CubeState,
  MOVE_DEFS,
  Move,
  SLOTS,
  Vec3,
  cubieKind,
  moveQuarterTurns,
  movedCubies,
  vecKey,
} from '../cube/core';

/**
 * Changes whenever this module is re-evaluated, which is once in a built app
 * and on every edit under Fast Refresh. The canvas keys off it so a change here
 * actually rebuilds the scene instead of leaving the old one running.
 */
export const SCENE_BUILD = String(Date.now());

const SPACING = 1.0;
const BODY = 0.94;
const STICKER = 0.8;
const RING = 0.94;
const STICKER_LIFT = BODY / 2 + 0.012;
const RING_LIFT = BODY / 2 + 0.006;

const BLANK_COLOR = '#2b2b34';
const BODY_COLOR = '#101015';
const WIRE_COLOR = '#6f7080';
/** The piece or slot the user picked. */
const SELECT_COLOR = '#ffffff';
/** Its opposite number: the piece that goes there, or the slot it goes in. */
const PARTNER_COLOR = '#ffb020';
/** Pieces the algorithm being stepped through is moving. */
const TARGET_COLOR = '#39d0ff';
const CLEAR_COLOR = '#0b0b0f';

const FIT_RADIUS = 2.95;
const FOV = 40;

/**
 * The cube turns about the screen's own axes: drag sideways and it turns about
 * the vertical, drag up or down and it tips about the horizontal. After every
 * turn any roll is taken straight back out, measured against whichever of the
 * cube's six faces is nearest to pointing up. That is what keeps it upright and
 * stops it ever balancing on a corner, and because the reference face changes
 * as the cube is tipped, there is no angle at which the controls seize up.
 *
 * Tipping far enough to put a different face on top is how the cube is
 * reoriented. That is biased against rather than blocked: tilt is slower than
 * spin, and there is a slight catch at the point where the top face changes
 * over, so a deliberate pull gets you there and a casual one does not.
 */
const YAW_PER_PIXEL = 0.0080;
const PITCH_PER_PIXEL = 0.0058;
/** How near the changeover (radians) the catch is felt, and how strong it is. */
const DETENT_ZONE = 0.22;
const DETENT_DRAG = 0.55;
/** Share of the last drag that carries on as glide, and its ceiling per frame. */
const GLIDE_SHARE = 0.4;
const GLIDE_MAX = 0.05;
/** Where the face nearest to up sits when the top face is about to change. */
const CHANGEOVER = Math.PI / 4;

/** The cube's six face directions, used to work out which way is up to it. */
const FACE_AXES = [
  new Vector3(1, 0, 0), new Vector3(-1, 0, 0),
  new Vector3(0, 1, 0), new Vector3(0, -1, 0),
  new Vector3(0, 0, 1), new Vector3(0, 0, -1),
];

type RGB = [number, number, number];
const rgb = (hex: string): RGB => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
];

const VERT = `
attribute vec3 aPos;
attribute vec3 aNormal;
uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
uniform mat3 uNormalMat;
uniform vec3 uColor;
uniform float uUnlit;
varying vec3 vColor;
void main() {
  gl_Position = uProj * uView * uModel * vec4(aPos, 1.0);
  vec3 n = normalize(uNormalMat * aNormal);
  float key = max(dot(n, normalize(vec3(0.42, 0.72, 0.55))), 0.0);
  float fill = max(dot(n, normalize(vec3(-0.6, -0.35, -0.5))), 0.0);
  float light = 0.60 + 0.42 * key + 0.14 * fill;
  vColor = mix(uColor * light, uColor, uUnlit);
}
`;

const FRAG = `
precision mediump float;
varying vec3 vColor;
void main() {
  gl_FragColor = vec4(vColor, 1.0);
}
`;

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** Unit cube centred on the origin, as 36 vertices of position + normal. */
function boxData(): Float32Array {
  const out: number[] = [];
  const faces: { n: Vec3; a: Vec3; b: Vec3 }[] = [
    { n: [0, 0, 1], a: [1, 0, 0], b: [0, 1, 0] },
    { n: [0, 0, -1], a: [-1, 0, 0], b: [0, 1, 0] },
    { n: [1, 0, 0], a: [0, 0, -1], b: [0, 1, 0] },
    { n: [-1, 0, 0], a: [0, 0, 1], b: [0, 1, 0] },
    { n: [0, 1, 0], a: [1, 0, 0], b: [0, 0, -1] },
    { n: [0, -1, 0], a: [1, 0, 0], b: [0, 0, 1] },
  ];
  for (const f of faces) {
    const c = f.n.map((v) => v * 0.5) as unknown as Vec3;
    const corners: Vec3[] = [
      [-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, -1, 0], [1, 1, 0], [-1, 1, 0],
    ];
    for (const [u, v] of corners.map((p) => [p[0], p[1]])) {
      out.push(
        c[0] + (f.a[0] * u + f.b[0] * v) * 0.5,
        c[1] + (f.a[1] * u + f.b[1] * v) * 0.5,
        c[2] + (f.a[2] * u + f.b[2] * v) * 0.5,
        f.n[0], f.n[1], f.n[2]
      );
    }
  }
  return new Float32Array(out);
}

/** Unit quad in the XY plane facing +Z. */
const QUAD = new Float32Array([
  -0.5, -0.5, 0, 0, 0, 1,
  0.5, -0.5, 0, 0, 0, 1,
  0.5, 0.5, 0, 0, 0, 1,
  -0.5, -0.5, 0, 0, 0, 1,
  0.5, 0.5, 0, 0, 0, 1,
  -0.5, 0.5, 0, 0, 0, 1,
]);

/** Twelve edges of a unit cube, as line segments. */
function edgeData(): Float32Array {
  const out: number[] = [];
  const c = [-0.5, 0.5];
  const push = (a: number[], b: number[]) => out.push(...a, 0, 0, 1, ...b, 0, 0, 1);
  for (const y of c) for (const z of c) push([-0.5, y, z], [0.5, y, z]);
  for (const x of c) for (const z of c) push([x, -0.5, z], [x, 0.5, z]);
  for (const x of c) for (const y of c) push([x, y, -0.5], [x, y, 0.5]);
  return new Float32Array(out);
}

// ---------------------------------------------------------------------------

interface StickerView {
  slot: number;
  /** Transform from cubie space to sticker space. */
  local: Matrix4;
  ringLocal: Matrix4;
  color: RGB;
  visible: boolean;
  ring: RGB | null;
}

interface CubieView {
  key: string;
  pos: Vec3;
  base: Matrix4;
  stickers: StickerView[];
  solid: boolean;
}

interface Anim {
  axis: 0 | 1 | 2;
  radians: number;
  elapsed: number;
  duration: number;
  members: Set<string>;
  onDone: () => void;
}

const glide = (delta: number) =>
  Math.max(-GLIDE_MAX, Math.min(GLIDE_MAX, delta * GLIDE_SHARE));

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export class CubeScene {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private attrPos = 0;
  private attrNormal = 0;
  private boxBuffer: WebGLBuffer;
  private quadBuffer: WebGLBuffer;
  private edgeBuffer: WebGLBuffer;

  private proj = new Matrix4();
  private view = new Matrix4();
  private cubeQuat = new Quaternion();
  private cubeMatrix = new Matrix4();

  private cubies: CubieView[] = [];
  private byKey = new Map<string, CubieView>();
  private slotToSticker = new Map<number, { cubie: CubieView; sticker: StickerView }>();

  private anim: Anim | null = null;
  private spin = { yaw: 0, pitch: 0 };
  private axis = new Vector3();

  private width = 1;
  private height = 1;

  private wireframe = false;
  private targetKeys = new Set<string>();
  private highlights: { selected: Set<number>; partner: Set<number>; target: Set<number> } = {
    selected: new Set(),
    partner: new Set(),
    target: new Set(),
  };

  private scratchModel = new Matrix4();
  private scratchNormal = new Matrix3();
  private pivot = new Matrix4();

  constructor(gl: WebGLRenderingContext, width: number, height: number) {
    this.gl = gl;
    this.program = this.compile(VERT, FRAG);
    gl.useProgram(this.program);
    this.attrPos = gl.getAttribLocation(this.program, 'aPos');
    this.attrNormal = gl.getAttribLocation(this.program, 'aNormal');
    for (const name of ['uProj', 'uView', 'uModel', 'uNormalMat', 'uColor', 'uUnlit']) {
      this.loc[name] = gl.getUniformLocation(this.program, name);
    }

    this.boxBuffer = this.makeBuffer(boxData());
    this.quadBuffer = this.makeBuffer(QUAD);
    this.edgeBuffer = this.makeBuffer(edgeData());

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
    const c = rgb(CLEAR_COLOR);
    gl.clearColor(c[0], c[1], c[2], 1);

    this.buildCubies();
    this.resetOrientation();
    this.resize(width, height);
  }

  private compile(vs: string, fs: string): WebGLProgram {
    const gl = this.gl;
    const make = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error(`shader: ${gl.getShaderInfoLog(sh)}`);
      }
      return sh;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, make(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, make(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(`link: ${gl.getProgramInfoLog(p)}`);
    }
    return p;
  }

  private makeBuffer(data: Float32Array): WebGLBuffer {
    const gl = this.gl;
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return buf;
  }

  // -- construction --------------------------------------------------------

  private buildCubies() {
    const forward = new Vector3(0, 0, 1);
    for (const pos of CUBIES) {
      if (cubieKind(pos) === 0) continue;
      const base = new Matrix4().makeTranslation(
        pos[0] * SPACING, pos[1] * SPACING, pos[2] * SPACING
      );
      const stickers: StickerView[] = [];
      for (const slot of SLOTS) {
        if (vecKey(slot.pos) !== vecKey(pos)) continue;
        const n = new Vector3(...slot.normal);
        const quat = new Quaternion().setFromUnitVectors(forward, n);
        const make = (lift: number, size: number) =>
          new Matrix4()
            .compose(n.clone().multiplyScalar(lift), quat, new Vector3(size, size, 1));
        stickers.push({
          slot: slot.index,
          local: make(STICKER_LIFT, STICKER),
          ringLocal: make(RING_LIFT, RING),
          color: rgb(BLANK_COLOR),
          visible: true,
          ring: null,
        });
      }
      const view: CubieView = { key: vecKey(pos), pos, base, stickers, solid: true };
      this.cubies.push(view);
      this.byKey.set(view.key, view);
      for (const s of stickers) this.slotToSticker.set(s.slot, { cubie: view, sticker: s });
    }
  }

  // -- view ----------------------------------------------------------------

  resetOrientation() {
    const yaw = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -0.62);
    const pitch = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.42);
    this.cubeQuat.copy(pitch).multiply(yaw);
    this.spin.yaw = 0;
    this.spin.pitch = 0;
    this.levelRoll();
  }

  /**
   * How far the cube is rolled: the smallest turn about the view axis that
   * would bring one of its face axes exactly upright on screen.
   *
   * Faces pointing nearly straight at the viewer are skipped - they barely show
   * on screen, so squaring them up would mean nothing. At least two of the three
   * axes always show well, so there is always a sensible one to measure from.
   */
  private rollAngle() {
    let best = 0;
    let found = false;
    for (const a of FACE_AXES) {
      const v = this.axis.copy(a).applyQuaternion(this.cubeQuat);
      if (Math.hypot(v.x, v.y) < 0.5) continue;
      const roll = Math.atan2(v.x, v.y);
      if (!found || Math.abs(roll) < Math.abs(best)) {
        best = roll;
        found = true;
      }
    }
    return best;
  }

  /**
   * Take the roll straight back out, so the cube is always square to the
   * screen. Turning by the smallest correction leaves the same face upright as
   * before, so this settles in one step and never spins the cube on its own.
   */
  private levelRoll() {
    const roll = this.rollAngle();
    if (Math.abs(roll) < 1e-9) return;
    this.cubeQuat.premultiply(
      new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), roll)
    );
  }

  /** Whichever of the cube's faces currently points nearest to straight up. */
  private nearestUpAxis(out: Vector3) {
    let bestDot = -Infinity;
    for (const a of FACE_AXES) {
      const v = this.axis.copy(a).applyQuaternion(this.cubeQuat);
      if (v.y > bestDot) {
        bestDot = v.y;
        out.copy(v);
      }
    }
    return out;
  }

  /** A slight catch just where the face on top is about to change over. */
  private tiltEase() {
    const up = this.nearestUpAxis(new Vector3());
    const tilt = Math.acos(Math.max(-1, Math.min(1, up.y)));
    const near = Math.max(0, 1 - Math.abs(CHANGEOVER - tilt) / DETENT_ZONE);
    return 1 - DETENT_DRAG * near * near;
  }

  /** Turn about the screen's axes, then square the cube back up. */
  private applySpin(pitchDelta: number, yawDelta: number) {
    const q = new Quaternion()
      .setFromAxisAngle(new Vector3(1, 0, 0), pitchDelta)
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yawDelta));
    this.cubeQuat.premultiply(q);
    this.levelRoll();
  }

  /**
   * Which face is currently nearest the bottom of the screen, and which is
   * nearest the viewer. These two decide how the cube is being held. The front
   * is picked from the four faces at right angles to the bottom one, so the
   * pair always describes a real hold.
   */
  viewFaces(): { down: Face; front: Face } {
    const v = new Vector3();
    let down: Face = 'D';
    let lowest = Infinity;
    for (const face of FACES) {
      v.set(...FACE_NORMAL[face]).applyQuaternion(this.cubeQuat);
      if (v.y < lowest) {
        lowest = v.y;
        down = face;
      }
    }
    const downNormal = new Vector3(...FACE_NORMAL[down]);
    let front: Face = 'F';
    let nearest = -Infinity;
    for (const face of FACES) {
      const n = new Vector3(...FACE_NORMAL[face]);
      if (Math.abs(n.dot(downNormal)) > 0.5) continue; // same axis as the bottom
      v.copy(n).applyQuaternion(this.cubeQuat);
      if (v.z > nearest) {
        nearest = v.z;
        front = face;
      }
    }
    return { down, front };
  }

  /**
   * Take a whole-cube rotation into the cube's labels without the picture
   * moving. The caller applies the same rotation to the cube state; countering
   * it here leaves everything exactly where the viewer put it, but from now on
   * the face at the bottom of the screen really is the D face.
   */
  absorbRotation(rot: CubeRotation) {
    const m = new Matrix4().set(
      rot.basis[0][0], rot.basis[1][0], rot.basis[2][0], 0,
      rot.basis[0][1], rot.basis[1][1], rot.basis[2][1], 0,
      rot.basis[0][2], rot.basis[1][2], rot.basis[2][2], 0,
      0, 0, 0, 1
    );
    this.cubeQuat.multiply(new Quaternion().setFromRotationMatrix(m).invert());
  }

  resize(width: number, height: number) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    const aspect = this.width / this.height;
    let dist = FIT_RADIUS / Math.tan((FOV * Math.PI) / 360);
    if (aspect < 1) dist /= aspect;
    const top = 0.1 * Math.tan((FOV * Math.PI) / 360);
    const right = top * aspect;
    this.proj.makePerspective(-right, right, top, -top, 0.1, 100);
    this.view.makeTranslation(0, 0, -dist);
    this.gl.viewport(0, 0, this.width, this.height);
  }

  orbit(dx: number, dy: number) {
    const tilt = dy * PITCH_PER_PIXEL * this.tiltEase();
    const spin = dx * YAW_PER_PIXEL;
    this.applySpin(tilt, spin);
    // Glide on from the last of the drag, but never fling: a coarse drag event
    // would otherwise set a per-frame rate that spins the cube right round.
    this.spin.pitch = glide(tilt);
    this.spin.yaw = glide(spin);
  }

  stopSpin() {
    this.spin.yaw = 0;
    this.spin.pitch = 0;
  }

  // -- state ---------------------------------------------------------------

  setColors(state: CubeState) {
    for (const cubie of this.cubies) {
      for (const s of cubie.stickers) {
        const c = state.colors[s.slot];
        s.color = rgb(c ? COLOR_HEX[c] : BLANK_COLOR);
      }
    }
  }

  /**
   * Which stickers wear which ring. `selected` is what the user picked,
   * `partner` is its opposite number, and `target` is whatever the algorithm
   * being stepped through is moving.
   */
  setHighlights(next: { selected?: Iterable<number>; partner?: Iterable<number>; target?: Iterable<number> }) {
    this.highlights = {
      selected: new Set(next.selected ?? []),
      partner: new Set(next.partner ?? []),
      target: new Set(next.target ?? []),
    };
    this.refreshRings();
  }

  setTargets(cubieKeys: Iterable<string>) {
    this.targetKeys = new Set(cubieKeys);
    this.refreshVisibility();
  }

  setWireframe(on: boolean) {
    this.wireframe = on;
    this.refreshVisibility();
  }

  private refreshRings() {
    const select = rgb(SELECT_COLOR);
    const partner = rgb(PARTNER_COLOR);
    const target = rgb(TARGET_COLOR);
    for (const cubie of this.cubies) {
      for (const s of cubie.stickers) {
        if (this.highlights.selected.has(s.slot)) s.ring = select;
        else if (this.highlights.partner.has(s.slot)) s.ring = partner;
        else if (this.highlights.target.has(s.slot)) s.ring = target;
        else s.ring = null;
      }
    }
  }

  private refreshVisibility() {
    for (const cubie of this.cubies) {
      const keep = this.targetKeys.has(cubie.key) || cubieKind(cubie.pos) === 1;
      cubie.solid = !this.wireframe || keep;
      for (const s of cubie.stickers) s.visible = cubie.solid;
    }
    this.refreshRings();
  }

  // -- picking -------------------------------------------------------------

  /** `u`/`v` run 0..1 across the canvas from the top-left. Returns a slot index. */
  pick(u: number, v: number): number | null {
    const ndcX = u * 2 - 1;
    const ndcY = -(v * 2) + 1;
    const top = Math.tan((FOV * Math.PI) / 360);
    const aspect = this.width / this.height;
    const dir = new Vector3(ndcX * top * aspect, ndcY * top, -1).normalize();
    const camDist = -this.view.elements[14];
    const origin = new Vector3(0, 0, camDist);

    this.cubeMatrix.makeRotationFromQuaternion(this.cubeQuat);
    let bestSlot: number | null = null;
    let bestT = Infinity;
    const inv = new Matrix4();
    const o = new Vector3();
    const d = new Vector3();

    // Wireframe cages answer to a tap too, so a piece can always be picked out.
    for (const cubie of this.cubies) {
      for (const s of cubie.stickers) {
        this.scratchModel
          .copy(this.cubeMatrix)
          .multiply(this.cubieLocal(cubie))
          .multiply(s.local);
        inv.copy(this.scratchModel).invert();
        o.copy(origin).applyMatrix4(inv);
        d.copy(dir).transformDirection(inv);
        if (Math.abs(d.z) < 1e-6) continue;
        const t = -o.z / d.z;
        if (t <= 0 || t >= bestT) continue;
        const x = o.x + d.x * t;
        const y = o.y + d.y * t;
        if (Math.abs(x) > 0.5 || Math.abs(y) > 0.5) continue;
        bestT = t;
        bestSlot = s.slot;
      }
    }
    return bestSlot;
  }

  // -- animation -----------------------------------------------------------

  get isAnimating() {
    return this.anim !== null;
  }

  playMove(move: Move, durationMs: number, onDone: () => void) {
    if (this.anim) this.finishAnim();
    const def = MOVE_DEFS[move.base];
    this.anim = {
      axis: def.axis,
      radians: (moveQuarterTurns(move) * Math.PI) / 2,
      elapsed: 0,
      duration: Math.max(1, durationMs),
      members: new Set(movedCubies(move).map(vecKey)),
      onDone,
    };
    this.pivot.identity();
  }

  private finishAnim() {
    const a = this.anim;
    if (!a) return;
    this.anim = null;
    this.pivot.identity();
    a.onDone();
  }

  cancelMove() {
    const a = this.anim;
    if (!a) return;
    a.onDone = () => {};
    this.finishAnim();
  }

  update(dtMs: number) {
    if (this.anim) {
      const a = this.anim;
      a.elapsed += dtMs;
      const t = Math.min(1, a.elapsed / a.duration);
      const angle = a.radians * easeInOutCubic(t);
      if (a.axis === 0) this.pivot.makeRotationX(angle);
      else if (a.axis === 1) this.pivot.makeRotationY(angle);
      else this.pivot.makeRotationZ(angle);
      if (t >= 1) this.finishAnim();
    } else if (Math.abs(this.spin.yaw) > 1e-5 || Math.abs(this.spin.pitch) > 1e-5) {
      this.applySpin(this.spin.pitch * this.tiltEase(), this.spin.yaw);
      this.spin.yaw *= 0.93;
      // Tilt settles faster than spin, so a flick reads as turning on the spot.
      this.spin.pitch *= 0.86;
      if (Math.abs(this.spin.yaw) < 1e-4) this.spin.yaw = 0;
      if (Math.abs(this.spin.pitch) < 1e-4) this.spin.pitch = 0;
    }
  }

  private cubieLocalCache = new Matrix4();
  private cubieLocal(cubie: CubieView): Matrix4 {
    if (this.anim && this.anim.members.has(cubie.key)) {
      return this.cubieLocalCache.copy(this.pivot).multiply(cubie.base);
    }
    return this.cubieLocalCache.copy(cubie.base);
  }

  // -- drawing -------------------------------------------------------------

  private bind(buffer: WebGLBuffer) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(this.attrPos);
    gl.vertexAttribPointer(this.attrPos, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(this.attrNormal);
    gl.vertexAttribPointer(this.attrNormal, 3, gl.FLOAT, false, 24, 12);
  }

  private draw(model: Matrix4, color: RGB, count: number, mode: number, unlit = 0) {
    const gl = this.gl;
    gl.uniformMatrix4fv(this.loc.uModel!, false, model.elements);
    this.scratchNormal.setFromMatrix4(model);
    gl.uniformMatrix3fv(this.loc.uNormalMat!, false, this.scratchNormal.elements);
    gl.uniform3f(this.loc.uColor!, color[0], color[1], color[2]);
    gl.uniform1f(this.loc.uUnlit!, unlit);
    gl.drawArrays(mode, 0, count);
  }

  render() {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.viewport(0, 0, this.width, this.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(this.loc.uProj!, false, this.proj.elements);
    gl.uniformMatrix4fv(this.loc.uView!, false, this.view.elements);

    this.cubeMatrix.makeRotationFromQuaternion(this.cubeQuat);
    const bodyColor = rgb(BODY_COLOR);
    const wireColor = rgb(WIRE_COLOR);
    const bodyScale = new Matrix4().makeScale(BODY, BODY, BODY);

    // Solid bodies.
    this.bind(this.boxBuffer);
    for (const cubie of this.cubies) {
      if (!cubie.solid) continue;
      this.scratchModel
        .copy(this.cubeMatrix)
        .multiply(this.cubieLocal(cubie))
        .multiply(bodyScale);
      this.draw(this.scratchModel, bodyColor, 36, gl.TRIANGLES);
    }

    // Wireframe cages for everything hidden.
    this.bind(this.edgeBuffer);
    for (const cubie of this.cubies) {
      if (cubie.solid) continue;
      this.scratchModel
        .copy(this.cubeMatrix)
        .multiply(this.cubieLocal(cubie))
        .multiply(bodyScale);
      this.draw(this.scratchModel, wireColor, 24, gl.LINES, 1);
    }

    // Highlight rings sit just under the stickers.
    this.bind(this.quadBuffer);
    for (const cubie of this.cubies) {
      for (const s of cubie.stickers) {
        if (!s.visible || !s.ring) continue;
        this.scratchModel
          .copy(this.cubeMatrix)
          .multiply(this.cubieLocal(cubie))
          .multiply(s.ringLocal);
        this.draw(this.scratchModel, s.ring, 6, gl.TRIANGLES, 1);
      }
    }
    // Wireframe cages answer to a tap too, so a piece can always be picked out.
    for (const cubie of this.cubies) {
      for (const s of cubie.stickers) {
        this.scratchModel
          .copy(this.cubeMatrix)
          .multiply(this.cubieLocal(cubie))
          .multiply(s.local);
        this.draw(this.scratchModel, s.color, 6, gl.TRIANGLES);
      }
    }
  }

  dispose() {
    const gl = this.gl;
    gl.deleteBuffer(this.boxBuffer);
    gl.deleteBuffer(this.quadBuffer);
    gl.deleteBuffer(this.edgeBuffer);
    gl.deleteProgram(this.program);
  }
}
