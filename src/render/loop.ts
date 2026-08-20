/**
 * The per-frame driver for a `CubeScene`.
 *
 * This lives apart from `CubeCanvas` for one reason: everything it does is a
 * bug that has already happened once. The surface resizes and nothing tells the
 * scene, so the cube is drawn at the size the GL context happened to be created
 * at. The canvas unmounts and the loop keeps running, so a fast refresh leaves
 * two of them drawing forever. Neither is reachable from a React component in a
 * headless test, so the logic is here, where it can be driven by a fake clock.
 */
import { CubeScene } from './CubeScene';

/** The slice of an expo-gl context a frame needs. */
export interface FrameSurface {
  drawingBufferWidth: number;
  drawingBufferHeight: number;
  endFrameEXP: () => void;
}

/** The slice of a scene a frame needs. Keeps the tests free of a real scene. */
export interface Frameable {
  resizeIfNeeded(width: number, height: number): boolean;
  update(dt: number): void;
  render(): void;
  dispose(): void;
}

export interface Scheduler {
  request: (cb: (now: number) => void) => number;
  cancel: (handle: number) => void;
}

export interface RenderLoop {
  start(): void;
  /** Idempotent: cancels the pending frame and disposes the scene once. */
  stop(): void;
  /** Re-fit now rather than at the next frame, for a layout change. */
  syncSize(): void;
  /** Stop drawing without tearing anything down, e.g. while hidden. */
  setPaused(paused: boolean): void;
  readonly running: boolean;
  readonly paused: boolean;
  readonly frames: number;
}

/** Longest frame delta the scene is allowed to integrate in one go. */
const MAX_DT = 64;

/**
 * The loop currently presenting.
 *
 * There is exactly one GL surface in this app, so there should be exactly one
 * loop. Making that an invariant of the module rather than of the component
 * means a canvas that fails to tear itself down cannot leave a second loop
 * drawing forever - which is what a fast refresh used to do. `CubeCanvas` still
 * stops its loop on unmount; this is the belt that does not depend on it.
 */
let presenting: RenderLoop | null = null;

/** The loop currently presenting, for tests and for teardown assertions. */
export const currentLoop = () => presenting;

export function createRenderLoop(
  gl: FrameSurface,
  scene: Frameable,
  scheduler: Scheduler
): RenderLoop {
  let handle: number | null = null;
  let alive = false;
  let paused = false;
  let last = 0;
  let frames = 0;

  const frame = (now: number) => {
    if (!alive) return;
    handle = scheduler.request(frame);
    const dt = last ? now - last : 16;
    last = now;
    // Hidden behind the net view: keep the context and the scene, draw nothing.
    if (paused) return;
    // The drawing buffer follows the surface and nothing announces the change,
    // so it is checked every frame. Without this a rotation, a tablet side
    // panel or a split view leaves the cube oversized, off-centre and mis-picked.
    scene.resizeIfNeeded(gl.drawingBufferWidth, gl.drawingBufferHeight);
    scene.update(Math.min(dt, MAX_DT));
    scene.render();
    gl.endFrameEXP();
    frames++;
  };

  const loop: RenderLoop = {
    start() {
      if (alive) return;
      // Only one loop presents at a time. A previous canvas that never tore
      // itself down is stopped here rather than left running.
      if (presenting && presenting !== loop) presenting.stop();
      presenting = loop;
      alive = true;
      last = 0;
      handle = scheduler.request(frame);
    },
    stop() {
      if (!alive) return;
      alive = false;
      if (presenting === loop) presenting = null;
      if (handle !== null) scheduler.cancel(handle);
      handle = null;
      scene.dispose();
    },
    setPaused(next: boolean) {
      paused = next;
    },
    syncSize() {
      scene.resizeIfNeeded(gl.drawingBufferWidth, gl.drawingBufferHeight);
    },
    get running() {
      return alive;
    },
    get frames() {
      return frames;
    },
    get paused() {
      return paused;
    },
  };
  return loop;
}

/** Narrowing helper so `CubeScene` satisfies `Frameable` at the call site. */
export const asFrameable = (scene: CubeScene): Frameable => scene;
