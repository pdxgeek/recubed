import React, { useCallback, useMemo, useRef } from 'react';
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
  const layout = useRef({ width: 1, height: 1 });
  const drag = useRef({ x: 0, y: 0, startX: 0, startY: 0, t: 0, moved: 0 });

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
      onReady(scene);

      let last = 0;
      const loop = (now: number) => {
        requestAnimationFrame(loop);
        const dt = last ? now - last : 16;
        last = now;
        scene.update(Math.min(dt, 64));
        scene.render();
        gl.endFrameEXP();
      };
      requestAnimationFrame(loop);
    },
    [onReady]
  );

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    layout.current = { width: Math.max(1, width), height: Math.max(1, height) };
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
