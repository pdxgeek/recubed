# recubed

A React Native (Expo) app for a 3×3 Rubik's cube. Paint in the colours of a real
cube, spin it around in 3D, and work through what is left to do — starting with
the beginner method and ending with a near-optimal solve.

## What it does

**Set colours.** The six centres are fixed by the standard colour scheme, so they
are drawn in and cannot be changed. Pick a colour and tap the other 48 stickers.
`Scramble` and `Solved` fill the cube in for you. An impossible cube (a twisted
corner, ten yellow stickers, two pieces swapped) is reported in plain language
rather than silently mis-solved.

**Solve.** The bottom sheet — a side panel on a tablet — shows everything still
to do, gentlest method first:

1. **Beginner — layer by layer**, one piece at a time. Not "first layer corners"
   but "white-green-orange corner", with the moves written out and the algorithm
   named: the sexy move for a first-layer corner, the insert for a middle edge,
   Sune, the corner 3-cycle, the T perm. Grouped under the stage it belongs to,
   so the shape of the method is still visible.
2. **Shortest solve** at the bottom — one sequence of about 20 moves found by a
   two-phase search. Nothing to memorise; it is there to compare against.

Every step can be picked out on its own: the moves that come before it are
applied without animating, so you can practise the one you are stuck on. Steps
play back at a pace you can follow, forwards or backwards, with the move letters
under the cube rather than in a bar of their own.

**Stuck on one piece.** Tap it — a whole piece, never a single sticker, and only
one at a time. It lights up white, the slot it has to reach lights up amber, and
the panel offers **Show me how to get it there**, which jumps straight to the step
that places it. Switch to slot mode and it works the other way round: tap the gap
and the piece that fills it lights up. Turn the pairing off if you only want the
one highlight.

**Wireframe.** Strips the cube back to a cage, leaving only the centres and the
pieces in play. The highlight follows those pieces as the cube turns, which makes
it easy to see what an algorithm actually does. Cages can still be tapped, so you
can pick a piece out from the skeleton.

**Holding the cube.** Drag to turn it: sideways spins it about the vertical,
up and down tips it to show the top or bottom. It never rolls, so it never ends
up balancing on a corner, and there is no angle where the controls seize up.
Turn a different face to the bottom and that face *becomes* the bottom — the cube
is quietly re-labelled to match how you are holding it, so the solver and the
move notation talk about the cube you can see.

## Running it

```bash
npm install
npx expo start
```

Then open it in Expo Go, or `npx expo run:ios` / `npx expo run:android` for a
native build.

## How it is put together

| Path | What lives there |
| --- | --- |
| `src/cube/core.ts` | Sticker slots, move notation, and the facelet engine that the UI animates |
| `src/cube/cubie.ts` | Piece-level (corner/edge permutation and orientation) representation, plus validation of a painted cube |
| `src/cube/algorithms.ts` | The algorithm library, with the pieces each one moves derived by running it |
| `src/cube/solver/beginner.ts` | Layer-by-layer solver, stage by stage |
| `src/cube/solver/kociemba.ts` | Two-phase solver for the shortest solve |
| `src/cube/solver/plan.ts` | Turns a painted cube into "what is left to do" |
| `src/cube/orientation.ts` | The 24 ways to hold the cube, used to re-label it |
| `src/cube/pieces.ts` | Pairing a piece with the slot it belongs in |
| `src/cube/algorithms.ts` | A checked reference set of 52 algorithms, kept for the solvers to draw on |
| `src/cube/algorithms.ts` | A checked reference set of 52 algorithms (not currently shown in the app) |
| `src/render/CubeScene.ts` | The WebGL renderer, picking, turning and animation |
| `src/components/` | Canvas, panels, move strip and controls |

Two representations of the cube are kept deliberately. The **facelet** engine
tracks 54 sticker slots, which is what the screen needs: it can hold a
half-painted cube, and it carries a `home` index so a piece can be followed
through a sequence for the wireframe highlight. The **cubie** engine tracks eight
corners and twelve edges with their orientations, which is what a solver needs.
The cubie move tables are derived from the facelet engine at load time, so the
two cannot drift apart.

### A note on three.js

three.js is used **only as a maths library** (`Matrix4`, `Quaternion`, `Vector3`).
Its `WebGLRenderer` does not drive an `expo-gl` context correctly — the frame
never reaches the buffer that `endFrameEXP` presents, so the canvas stays black
even though the scene, camera and raycasting are all fine. `src/render/CubeScene.ts`
therefore issues its own draw calls. Two related traps:

- `GLView` must be given `msaaSamples={0}`. With the default multisampled path,
  nothing is presented at all, not even a plain `gl.clear`.
- `expo-gl` does not implement `getParameter(gl.FRAMEBUFFER_BINDING)`; calling it
  throws rather than returning a value.

## Checking it

```bash
npm run verify
```

Nothing about the cube maths is taken on trust:

- the move engine is checked against known move orders (`R U` has order 105, the
  T perm is an involution) and against the direction each face turn sends stickers;
- the cubie engine is checked to agree with the facelet engine over hundreds of
  random sequences, and to reject cubes that cannot exist;
- every algorithm in the library is machine-checked — each PLL must leave the
  first two layers untouched and the last layer oriented, and its permutation is
  compared against the cycle structure that name is supposed to have. Nine
  entries were corrected this way;
- the 24 whole-cube rotations are checked against the facelet engine, and
  re-labelling the cube is checked to leave the picture exactly where it was;
- the view model is checked over thousands of random drags: the cube must never
  come out rolled, and a sideways drag must turn it about the vertical from every
  angle, including looking straight at a face;
- piece/slot pairing is checked to be consistent in both directions;
- the beginner solver is run over hundreds of random scrambles;
- the two-phase solver's solutions are applied back to the scramble;
- and the whole plan is replayed through the facelet engine the UI actually uses,
  so the setup rotation is covered too.

```bash
npm run typecheck
```
