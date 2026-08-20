import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { LayoutChangeEvent, PanResponder, StyleSheet, View, ViewStyle } from 'react-native';
import { GLView, ExpoWebGLRenderingContext } from 'expo-gl';
import { CubeScene, SCENE_BUILD } from '../render/CubeScene';

export interface CubeCanvasProps {
  style?: ViewStyle;
  /** Called once the GL context exists and the scene is ready. */
  onReady: (scene: CubeScene) => void;
  /** Slot index of the sticker tapped, or null when the tap missed the cube. */
  onPickSticker: (slot: number | null) => void;
  /** Fired when a drag finishes, so the caller can re-read how the cube is held. */
  onGestureEnd?: () => void;
}

const TAP_SLOP = 10;
const TAP_MS = 400;

export function CubeCanvas({ style, onReady, onPickSticker, onGestureEnd }: CubeCanvasProps) {
  const sceneRef = useRef<CubeScene | null>(null);
  const glRef = useRef<ExpoWebGLRenderingContext | null>(null);
  const layout = useRef({ width: 1, height: 1 });
  const drag = useRef({ x: 0, y: 0, startX: 0, startY: 0, t: 0, moved: 0 });
  const frame = useRef<number | null>(null);
  const alive = useRef(true);

  // One context per mount. Without this the render loop of a torn-down canvas
  // keeps drawing forever, and a fast refresh leaves two of them running.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      sceneRef.current?.dispose();
      sceneRef.current = null;
      glRef.current = null;
    };
  }, []);

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
      glRef.current = gl;
      onReady(scene);

      let last = 0;
      const loop = (now: number) => {
        if (!alive.current) return;
        frame.current = requestAnimationFrame(loop);
        const dt = last ? now - last : 16;
        last = now;
        // The drawing buffer follows the surface; nothing tells the scene when
        // that changes, so it is checked here. Without it a rotation or a
        // tablet split view leaves the cube oversized, off-centre, and mis-picked.
        scene.resizeIfNeeded(gl.drawingBufferWidth, gl.drawingBufferHeight);
        scene.update(Math.min(dt, 64));
        scene.render();
        gl.endFrameEXP();
      };
      frame.current = requestAnimationFrame(loop);
    },
    [onReady]
  );

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    layout.current = { width: Math.max(1, width), height: Math.max(1, height) };
    // Picking reads the scene's own aspect, so re-fit as soon as the view
    // changes shape rather than waiting for the next frame.
    const gl = glRef.current;
    if (gl) sceneRef.current?.resizeIfNeeded(gl.drawingBufferWidth, gl.drawingBufferHeight);
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
    <View style={[styles.fill, style]} onLayout={onLayout} {...responder.panHandlers}>
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
