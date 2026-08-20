# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Rendering

three.js is a **maths dependency only** here. Its `WebGLRenderer` does not present
to an `expo-gl` context: draw calls appear to succeed, but the frame never reaches
the buffer `endFrameEXP` shows, so the canvas stays black. `src/render/CubeScene.ts`
issues its own WebGL draw calls instead. Do not reintroduce `THREE.WebGLRenderer`
or `expo-three` (the latter also pulls in native modules that fail in Expo Go).

Two related traps:

- `GLView` needs `msaaSamples={0}`. On the default multisampled path nothing is
  presented, not even a bare `gl.clear`.
- `expo-gl` does not implement `getParameter(gl.FRAMEBUFFER_BINDING)` — it throws.

# Cube maths

Run `npm run verify` after touching anything under `src/cube/`. It checks the move
engine, the two cube representations against each other, every algorithm in the
library, both solvers, and a full end-to-end replay. Do not add an algorithm to
`src/cube/algorithms.ts` without letting the verifier confirm it.
