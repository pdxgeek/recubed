/**
 * A recording stand-in for a WebGL context.
 *
 * `CubeScene` only ever talks to WebGL and to three's maths, both of which run
 * happily under `tsx`, so the whole renderer can be exercised headlessly. Every
 * entry point the scene uses is stubbed; `drawArrays` is recorded together with
 * the uniforms in force at the time, which is enough to say exactly what the
 * frame contains without re-implementing any of the scene's maths.
 *
 * This is a *behaviour* harness, not a rasteriser: it proves which draw calls
 * were issued with which matrices. It says nothing about the native expo-gl
 * traps documented in AGENTS.md.
 */

export interface DrawCall {
  /** gl.TRIANGLES or gl.LINES, as the fake numbers them. */
  mode: number;
  count: number;
  /** Which of the scene's three vertex buffers was bound. */
  buffer: number;
  color: [number, number, number];
  unlit: number;
  /** uModel at the time of the call, column-major, 16 floats. */
  model: number[];
}

export interface FakeGL {
  /** Everything drawn since the last `reset()`. */
  draws: DrawCall[];
  /** Every `lineWidth` asked for, in order. */
  lineWidths: number[];
  /** Attribute name -> the location handed out, so a swap is visible. */
  attribs: Record<string, number>;
  /** Set to make `compileShader` report failure, as a driver would. */
  failCompileWith: string | null;
  /** Set to make `linkProgram` report failure. */
  failLinkWith: string | null;
  /** The GLSL the scene actually uploaded, by shader type. */
  sources: { vertex: string; fragment: string };
  /** Every vertexAttribPointer call, so an attribute swap is detectable. */
  pointers: { index: number; size: number; stride: number; offset: number }[];
  /** uProj / uView as last uploaded. */
  proj: number[];
  view: number[];
  /** Viewport as last set: [x, y, w, h]. */
  viewportRect: number[];
  reset(): void;
  drawingBufferWidth: number;
  drawingBufferHeight: number;
}

const FLOAT_KEYS = ['uProj', 'uView', 'uModel', 'uNormalMat', 'uColor', 'uUnlit'] as const;

/** A WebGL context that records instead of rasterising. */
export function createFakeGL(width = 600, height = 900): FakeGL & Record<string, any> {
  const uniformNames = new Map<object, string>();
  const shaderTypes = new Map<object, number>();
  let bound = 0;
  let nextBuffer = 1;
  let nextAttrib = 0;
  const uniforms: Record<string, any> = {};

  const rec: FakeGL & Record<string, any> = {
    draws: [],
    lineWidths: [],
    attribs: {},
    failCompileWith: null,
    failLinkWith: null,
    sources: { vertex: '', fragment: '' },
    pointers: [],
    proj: [],
    view: [],
    viewportRect: [0, 0, width, height],
    drawingBufferWidth: width,
    drawingBufferHeight: height,
    reset() {
      rec.draws = [];
      rec.lineWidths = [];
    },

    // -- enums (values are arbitrary but distinct) ---------------------------
    ARRAY_BUFFER: 0x8892,
    STATIC_DRAW: 0x88e4,
    FLOAT: 0x1406,
    TRIANGLES: 0x0004,
    LINES: 0x0001,
    DEPTH_TEST: 0x0b71,
    CULL_FACE: 0x0b44,
    BACK: 0x0405,
    CCW: 0x0901,
    LEQUAL: 0x0203,
    COLOR_BUFFER_BIT: 0x4000,
    DEPTH_BUFFER_BIT: 0x0100,
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,

    // -- programs -----------------------------------------------------------
    //
    // Compilation can be made to fail on demand. It is the only handle the
    // headless suite has on the GLSL, which is otherwise the one part of the
    // renderer with no coverage at all: a typo there passes every draw-call
    // assertion and shows up as a black canvas on a device.
    createShader: (type: number) => {
      const sh = {};
      shaderTypes.set(sh, type);
      return sh;
    },
    shaderSource: (sh: object, src: string) => {
      if (shaderTypes.get(sh) === rec.VERTEX_SHADER) rec.sources.vertex = src;
      else rec.sources.fragment = src;
    },
    compileShader: () => {},
    getShaderParameter: () => rec.failCompileWith === null,
    getShaderInfoLog: () => rec.failCompileWith ?? '',
    createProgram: () => ({}),
    attachShader: () => {},
    linkProgram: () => {},
    getProgramParameter: () => rec.failLinkWith === null,
    getProgramInfoLog: () => rec.failLinkWith ?? '',
    useProgram: () => {},
    deleteProgram: () => {},
    // A distinct location per name, so swapping the two attribute pointers is
    // visible rather than silently harmless.
    getAttribLocation: (_p: object, name: string) => {
      if (!(name in rec.attribs)) rec.attribs[name] = nextAttrib++;
      return rec.attribs[name];
    },
    getUniformLocation: (_p: object, name: string) => {
      const handle = {};
      uniformNames.set(handle, name);
      return handle;
    },

    // -- buffers ------------------------------------------------------------
    createBuffer: () => nextBuffer++,
    bindBuffer: (_target: number, buf: number) => {
      bound = buf;
    },
    bufferData: () => {},
    deleteBuffer: () => {},
    enableVertexAttribArray: () => {},
    vertexAttribPointer: (index: number, size: number, _type: number, _n: boolean, stride: number, offset: number) => {
      rec.pointers.push({ index, size, stride, offset });
    },

    // -- fixed function -----------------------------------------------------
    enable: () => {},
    depthFunc: () => {},
    cullFace: () => {},
    frontFace: () => {},
    clearColor: () => {},
    clear: () => {},
    lineWidth: (w: number) => {
      rec.lineWidths.push(w);
    },
    viewport: (x: number, y: number, w: number, h: number) => {
      rec.viewportRect = [x, y, w, h];
    },

    // -- uniforms -----------------------------------------------------------
    uniformMatrix4fv: (loc: object, _t: boolean, value: ArrayLike<number>) => {
      const name = uniformNames.get(loc);
      if (!name) return;
      uniforms[name] = Array.from(value);
      if (name === 'uProj') rec.proj = uniforms[name];
      if (name === 'uView') rec.view = uniforms[name];
    },
    uniformMatrix3fv: (loc: object, _t: boolean, value: ArrayLike<number>) => {
      const name = uniformNames.get(loc);
      if (name) uniforms[name] = Array.from(value);
    },
    uniform3f: (loc: object, a: number, b: number, c: number) => {
      const name = uniformNames.get(loc);
      if (name) uniforms[name] = [a, b, c];
    },
    uniform1f: (loc: object, a: number) => {
      const name = uniformNames.get(loc);
      if (name) uniforms[name] = a;
    },

    drawArrays: (mode: number, _first: number, count: number) => {
      rec.draws.push({
        mode,
        count,
        buffer: bound,
        color: (uniforms.uColor ?? [0, 0, 0]) as [number, number, number],
        unlit: (uniforms.uUnlit ?? 0) as number,
        model: (uniforms.uModel ?? []) as number[],
      });
    },
  };

  for (const k of FLOAT_KEYS) uniforms[k] = undefined;
  return rec;
}

/** A stable key for a model matrix, so two draws of the same quad compare equal. */
export const modelKey = (m: number[]) => m.map((v) => v.toFixed(5)).join(',');

/** Rounded hex for a recorded colour, so it can be compared with the constants. */
export function colorHex(c: [number, number, number]): string {
  const byte = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${byte(c[0])}${byte(c[1])}${byte(c[2])}`;
}
