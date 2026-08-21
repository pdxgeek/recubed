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

**Why it works.** Every step in the list carries a `?`. It opens an explanation
over the panel: what the algorithm does to the cube, which pieces to watch by
name and colour, and how many pieces *this step* moves — counted from the step's
own moves against the step's own cube, not from the algorithm on a solved one.
`Watch it slowly` plays the step from there; `Show only these` strips the cube to
the pieces in play.

**Practise mode.** While a step is running, `Practise` covers the moves ahead and
reveals them one at a time. After each reveal you say whether you had it, and the
step ends with your own score rather than a move count. Nothing can give the
answer away while it is on: `Play` and `Next move` are disabled, and the
explanation sheet drops its notation and veils the move sequences in its prose.

**How you are doing.** Practising accumulates, keyed on the algorithm rather than
the step — the sexy move is one thing to learn however many faces you perform it
on. The 4pt rail down the left of each step row shows it: nothing for an
algorithm you have not met, a short amber bar while you are learning it, a full
green one once you have run it clean twice. It is **this session only**; the app
does not claim to remember you tomorrow, and says so.

**Flat view.** A net of all 54 stickers, letters and colours both, for painting
without spinning and for checking the whole cube at once. Every cell is a 44pt
target and reports its face, row and column, so the cube can be read and painted
without the 3D canvas at all.

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
| `src/cube/algorithms.ts` | The algorithm library, with the pieces each one moves derived by running it, and the teaching note for each |
| `src/cube/effect.ts` | What a set of moves does to a given cube — the number under the "why this works" sheet |
| `src/cube/solver/beginner.ts` | Layer-by-layer solver, stage by stage |
| `src/cube/solver/kociemba.ts` | Two-phase solver for the shortest solve |
| `src/cube/solver/plan.ts` | Turns a painted cube into "what is left to do" |
| `src/cube/orientation.ts` | The 24 ways to hold the cube, used to re-label it |
| `src/cube/pieces.ts` | Pairing a piece with the slot it belongs in |
| `src/learn/session.ts` | One practise attempt: what was revealed, and what the learner said about it |
| `src/learn/progress.ts` | What the learner knows, across steps, keyed on the algorithm |
| `src/render/CubeScene.ts` | The WebGL renderer, picking, turning and animation |
| `src/render/fit.ts` | Where the camera stands so the whole cube is in frame, in units the platform cannot confuse |
| `src/ui/layout.ts`, `src/ui/net.ts`, `src/ui/notation.ts`, `src/ui/palette.ts` | The layout, net, notation and colour arithmetic, all free of react-native so the suite can drive them |
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
- the whole plan is replayed through the facelet engine the UI actually uses,
  so the setup rotation is covered too;
- **the teaching copy is checked against the engine**, not merely checked to
  exist: every note is scanned for the kinds of claim it makes — "leaves the
  fourth alone", "no edge moves at all", "clockwise", "six repetitions" — and
  each one has to hold. Four claims were false and are now not;
- the piece count printed under a step equals the count that step's own moves
  produce, computed a second, independent way;
- no step prints a turn against the turn before it (`L' L2` is `L`, `U' U` is
  nothing), and folding a sequence is proved never to change what it does;
- the camera fit is driven with device-shaped surfaces at every device pixel
  ratio, and every vertex the renderer draws has to land inside the frame -
  and then inside the **rectangle on screen**, in layout points, following the
  whole chain from the projection through the GL viewport to the buffer being
  stretched into the view. A drawing buffer that has not caught up with a
  layout change has to leave the cube centred and whole;
- the body's division between the cube and the panel is driven over every
  height a window can have: the panel is a definite number in every state, and
  the cube has a floor the panel yields to rather than the other way round;
- and the learner model is checked to be honest: watching is not knowing, one
  clean run is not knowing, one miss undoes it, and an attempt with no answers
  in it changes nothing.

```bash
npm run verify:ui
```

Drives the real app in a browser through Playwright: reachability, 44pt targets,
accessibility state, the net fitting on an iPhone SE, and that practise mode
cannot be made to print the answer. It is the **web target only** — the first
real-device screenshot of this app disagreed with four rounds of browser
measurement, which is why `src/render/fit.ts` and `src/ui/layout.ts` exist.

```bash
npm run typecheck
```
