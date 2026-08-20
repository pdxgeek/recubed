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
  let bound = 0;
  let nextBuffer = 1;
  const uniforms: Record<string, any> = {};

  const rec: FakeGL & Record<string, any> = {
    draws: [],
    proj: [],
    view: [],
    viewportRect: [0, 0, width, height],
    drawingBufferWidth: width,
    drawingBufferHeight: height,
    reset() {
      rec.draws = [];
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
    createShader: () => ({}),
    shaderSource: () => {},
    compileShader: () => {},
    getShaderParameter: () => true,
    getShaderInfoLog: () => '',
    createProgram: () => ({}),
    attachShader: () => {},
    linkProgram: () => {},
    getProgramParameter: () => true,
    getProgramInfoLog: () => '',
    useProgram: () => {},
    deleteProgram: () => {},
    getAttribLocation: () => 0,
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
    vertexAttribPointer: () => {},

    // -- fixed function -----------------------------------------------------
    enable: () => {},
    depthFunc: () => {},
    cullFace: () => {},
    frontFace: () => {},
    clearColor: () => {},
    clear: () => {},
    lineWidth: () => {},
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
