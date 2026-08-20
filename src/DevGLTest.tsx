import React from 'react';
import { View, Text } from 'react-native';
import { GLView } from 'expo-gl';

export default function DevGLTest() {
  return (
    <View style={{ flex: 1, backgroundColor: '#003300', paddingTop: 60 }}>
      <Text style={{ color: 'white' }}>GLView smoke test</Text>
      <GLView
        style={{ width: 300, height: 300, backgroundColor: '#330000' }}
        msaaSamples={0}
        onContextCreate={(gl) => {
          console.log('[t] ctx', gl.drawingBufferWidth, gl.drawingBufferHeight);
          gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
          gl.clearColor(1, 0, 1, 1);
          gl.clear(gl.COLOR_BUFFER_BIT);
          console.log('[t] err after clear', gl.getError());
          gl.endFrameEXP();
          console.log('[t] presented');
          let n = 0;
          const loop = () => {
            gl.clearColor(n % 2 ? 1 : 0, 1, 0, 1);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.endFrameEXP();
            if (++n < 200) requestAnimationFrame(loop);
          };
          requestAnimationFrame(loop);
        }}
      />
    </View>
  );
}
