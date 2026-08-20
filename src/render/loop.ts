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
  readonly running: boolean;
  readonly frames: number;
}

/** Longest frame delta the scene is allowed to integrate in one go. */
const MAX_DT = 64;

export function createRenderLoop(
  gl: FrameSurface,
  scene: Frameable,
  scheduler: Scheduler
): RenderLoop {
  let handle: number | null = null;
  let alive = false;
  let last = 0;
  let frames = 0;

  const frame = (now: number) => {
    if (!alive) return;
    handle = scheduler.request(frame);
    const dt = last ? now - last : 16;
    last = now;
    // The drawing buffer follows the surface and nothing announces the change,
    // so it is checked every frame. Without this a rotation, a tablet side
    // panel or a split view leaves the cube oversized, off-centre and mis-picked.
    scene.resizeIfNeeded(gl.drawingBufferWidth, gl.drawingBufferHeight);
    scene.update(Math.min(dt, MAX_DT));
    scene.render();
    gl.endFrameEXP();
    frames++;
  };

  return {
    start() {
      if (alive) return;
      alive = true;
      last = 0;
      handle = scheduler.request(frame);
    },
    stop() {
      if (!alive) return;
      alive = false;
      if (handle !== null) scheduler.cancel(handle);
      handle = null;
      scene.dispose();
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
  };
}

/** Narrowing helper so `CubeScene` satisfies `Frameable` at the call site. */
export const asFrameable = (scene: CubeScene): Frameable => scene;
