import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { LayoutChangeEvent, PanResponder, StyleSheet, View, ViewStyle } from 'react-native';
import { GLView, ExpoWebGLRenderingContext } from 'expo-gl';
import { CubeScene, SCENE_BUILD } from '../render/CubeScene';
import { RenderLoop, createRenderLoop } from '../render/loop';

export interface CubeCanvasProps {
  style?: ViewStyle;
  /**
   * True while the canvas is on screen but not being looked at - the net view
   * covers it. The context and the scene stay, the drawing stops.
   */
  paused?: boolean;
  /** Called once the GL context exists and the scene is ready. */
  onReady: (scene: CubeScene) => void;
  /** Slot index of the sticker tapped, or null when the tap missed the cube. */
  onPickSticker: (slot: number | null) => void;
  /** Fired when a drag finishes, so the caller can re-read how the cube is held. */
  onGestureEnd?: () => void;
}

const TAP_SLOP = 10;
const TAP_MS = 400;

export function CubeCanvas({
  style,
  paused = false,
  onReady,
  onPickSticker,
  onGestureEnd,
}: CubeCanvasProps) {
  const sceneRef = useRef<CubeScene | null>(null);
  const loopRef = useRef<RenderLoop | null>(null);
  const pausedRef = useRef(paused);
  const layout = useRef({ width: 1, height: 1 });
  const drag = useRef({ x: 0, y: 0, startX: 0, startY: 0, t: 0, moved: 0 });

  // One context per mount. Without the teardown the render loop of a canvas
  // that is gone keeps drawing forever, and a fast refresh leaves two of them.
  useEffect(
    () => () => {
      loopRef.current?.stop();
      loopRef.current = null;
      sceneRef.current = null;
    },
    []
  );

  const onContextCreate = useCallback(
    (gl: ExpoWebGLRenderingContext) => {
      let scene: CubeScene;
      try {
        scene = new CubeScene(
          gl as unknown as WebGLRenderingContext,
          gl.drawingBufferWidth,
          gl.drawingBufferHeight
        );
      } catch (err) {
        console.log('[gl] scene construction failed', String(err));
        return;
      }
      sceneRef.current = scene;
      // Everything about the frame - re-fitting a resized surface, capping the
      // delta, tearing down exactly once - lives in `render/loop.ts`, where it
      // can be driven by a fake clock in `verify-render.ts`.
      loopRef.current?.stop();
      loopRef.current = createRenderLoop(gl, scene, {
        // Called on `globalThis`, not as a bare identifier: on web these are
        // methods of `window` and throw "Illegal invocation" without a receiver.
        request: (cb) => globalThis.requestAnimationFrame(cb),
        cancel: (h) => globalThis.cancelAnimationFrame(h),
      });
      loopRef.current.setPaused(pausedRef.current);
      loopRef.current.start();
      onReady(scene);
    },
    [onReady]
  );

  useEffect(() => {
    pausedRef.current = paused;
    loopRef.current?.setPaused(paused);
    // Coming back into view, re-fit first: the surface may have changed size
    // while nothing was drawing.
    if (!paused) loopRef.current?.syncSize();
  }, [paused]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    layout.current = { width: Math.max(1, width), height: Math.max(1, height) };
    // Picking reads the scene's own aspect, so re-fit as soon as the view
    // changes shape rather than waiting for the next frame.
    loopRef.current?.syncSize();
  }, []);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          const { locationX, locationY } = evt.nativeEvent;
          drag.current = {
            x: 0,
            y: 0,
            startX: locationX,
            startY: locationY,
            t: Date.now(),
            moved: 0,
          };
          sceneRef.current?.stopSpin();
        },
        onPanResponderMove: (_evt, g) => {
          const dx = g.dx - drag.current.x;
          const dy = g.dy - drag.current.y;
          drag.current.x = g.dx;
          drag.current.y = g.dy;
          drag.current.moved = Math.max(drag.current.moved, Math.hypot(g.dx, g.dy));
          sceneRef.current?.orbit(dx, dy);
        },
        onPanResponderRelease: () => {
          const d = drag.current;
          const isTap = d.moved < TAP_SLOP && Date.now() - d.t < TAP_MS;
          if (!isTap) {
            onGestureEnd?.();
            return;
          }
          sceneRef.current?.stopSpin();
          const { width, height } = layout.current;
          const slot = sceneRef.current?.pick(d.startX / width, d.startY / height) ?? null;
          onPickSticker(slot);
        },
      }),
    [onPickSticker, onGestureEnd]
  );

  return (
    <View
      style={[styles.fill, style]}
      onLayout={onLayout}
      // The GL surface carries no accessible representation of the cube. The
      // flat net view is that representation; this stops the canvas being an
      // unlabelled stop on the way to it.
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      {...responder.panHandlers}
    >
      {/* expo-gl's multisampled path presents an empty surface here, so the
          renderer does its own antialiasing instead. */}
      <GLView
        key={SCENE_BUILD}
        style={styles.fill}
        msaaSamples={0}
        onContextCreate={onContextCreate}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
