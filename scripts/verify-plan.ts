/**
 * End-to-end check: build a solve plan for a painted cube, then run every step
 * through the app's own facelet engine and confirm the cube ends up solved.
 * This covers the whole-cube setup rotation that the beginner solve starts with.
 */
import { CubeState, Move, SLOTS, applyAlg, isSolved, solvedState, parseAlg, vecKey } from '../src/cube/core';
import { BASIC_MOVES } from '../src/cube/cubie';
import {
  algorithmForStep,
  buildPlan,
  buildShortest,
  cubeKey,
  currentShortest,
  describeCubie,
  nameOfPieceKey,
  piecesToWatch,
  noteForStep,
  relabelMethod,
  stageProgress,
  stepFootnote,
} from '../src/cube/solver/plan';
import { CUBIES, SLOTS_BY_CUBIE, cubieKind } from '../src/cube/core';
import { ROTATIONS } from '../src/cube/orientation';

let seed = Number(process.argv[3] ?? 5150);
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const scramble = (n = 25) =>
  Array.from({ length: n }, () => BASIC_MOVES[Math.floor(rnd() * 18)]).join(' ');

const N = Number(process.argv[2] ?? 40);
let fails = 0;
let beginnerMoves = 0;
let shortMoves = 0;
let checkedShort = 0;

for (let i = 0; i < N; i++) {
  const s = scramble();
  const start: CubeState = applyAlg(solvedState(), s);

  const plan = buildPlan(start);
  if (!plan.ok) {
    fails++;
    console.log(`FAIL  plan rejected a legal cube: ${plan.error}\n      ${s}`);
    continue;
  }
  const beginner = plan.methods.find((m) => m.id === 'beginner')!;
  if (!beginner.steps.length) {
    fails++;
    console.log(`FAIL  no beginner steps for ${s}`);
    continue;
  }

  let cube = start;
  for (const step of beginner.steps) cube = applyAlg(cube, step.moves);
  if (!isSolved(cube)) {
    fails++;
    console.log(`FAIL  beginner plan did not solve: ${s}`);
  }
  beginnerMoves += beginner.steps.reduce((n, st) => n + st.moves.length, 0);

  // The optimal search is slower, so spot-check it.
  if (i % 5 === 0) {
    const short = buildShortest(start);
    const step = short.steps[0];
    if (!step) {
      fails++;
      console.log(`FAIL  no shortest solve for ${s}`);
    } else {
      if (!isSolved(applyAlg(start, step.moves))) {
        fails++;
        console.log(`FAIL  shortest solve did not solve: ${s}`);
      }
      shortMoves += step.moves.length;
      checkedShort++;
    }
  }
}

// A cube that cannot exist must be reported, not silently solved.
{
  const broken = applyAlg(solvedState(), 'R');
  broken.colors[0] = 'Y';
  const plan = buildPlan(broken);
  if (plan.ok) {
    fails++;
    console.log('FAIL  an impossible cube was accepted');
  } else {
    console.log(`ok    impossible cube reported: "${plan.error}"`);
  }
}

// --- the cached shortest solve is only shown while it still fits the cube ----
//
// The regression this locks down: round 1 replaced an over-eager invalidation
// with none at all, so a twenty-move solve computed before a step was played
// survived it - displayed, and tappable, and wrong.
{
  const origin = applyAlg(solvedState(), scramble());
  const plan = buildPlan(origin);
  const shortest = buildShortest(origin);
  const step = plan.ok ? plan.methods.flatMap((m) => m.steps).find((st) => st.moves.length > 0) : null;

  if (!step || shortest.steps.length === 0) {
    fails++;
    console.log('FAIL  could not set up the stale-solve check');
  } else {
    if (currentShortest(shortest, origin) !== shortest) {
      fails++;
      console.log('FAIL  a freshly computed solve is not offered for the cube it was computed for');
    } else {
      console.log('ok    a freshly computed solve is offered for its own cube');
    }

    // Play a step and keep it: the cube really has changed.
    const after = applyAlg(applyAlg(origin, step.prelude), step.moves);
    if (cubeKey(after) === cubeKey(origin)) {
      fails++;
      console.log('FAIL  the test step did not change the cube');
    }
    const stillSolves = isSolved(applyAlg(after, shortest.steps[0].moves));
    if (stillSolves) {
      console.log('ok    (the stale solution happened to still solve this cube)');
    } else if (currentShortest(shortest, after) !== null) {
      fails++;
      console.log('FAIL  a solve that no longer solves the cube is still offered');
    } else {
      console.log('ok    a solve that no longer fits the cube is withdrawn');
    }

    // Re-labelling is not a change: the moves are rewritten and re-stamped.
    let relabelled = 0;
    let kept = 0;
    for (const rot of ROTATIONS) {
      if (!rot.alg) continue;
      const held = applyAlg(origin, rot.alg);
      const moved = relabelMethod(shortest, rot, held);
      relabelled++;
      if (!moved) continue;
      if (currentShortest(moved, held) === moved && isSolved(applyAlg(held, moved.steps[0].moves))) {
        kept++;
      }
    }
    if (kept !== relabelled) {
      fails++;
      console.log(`FAIL  ${relabelled - kept} of ${relabelled} re-labellings lost the solve`);
    } else {
      console.log(`ok    all ${kept} re-labellings keep the solve, rewritten and re-stamped`);
    }
  }
}

// --- stage progress: where a step sits in the method's stages ----------------
{
  const state = applyAlg(solvedState(), scramble());
  const plan = buildPlan(state);
  const steps = plan.ok ? plan.methods.flatMap((m) => m.steps) : [];
  let bad = 0;
  const groups: string[] = [];
  for (const st of steps) if (!groups.includes(st.group)) groups.push(st.group);
  for (const st of steps) {
    const at = stageProgress(plan, st.id);
    if (!at) {
      bad++;
      continue;
    }
    if (at.group !== st.group) bad++;
    if (at.stage !== groups.indexOf(st.group) + 1) bad++;
    if (at.step < 1 || at.step > at.steps) bad++;
    if (at.stages !== groups.length) bad++;
  }
  if (stageProgress(plan, 'no-such-step') !== null) bad++;
  if (stageProgress(null, steps[0]?.id ?? null) !== null) bad++;
  if (bad > 0) {
    fails++;
    console.log(`FAIL  ${bad} stage-progress problems over ${steps.length} steps`);
  } else {
    console.log(`ok    every one of ${steps.length} steps knows its stage (${groups.length} stages)`);
  }
}

// --- titles: one row never says the same thing twice ------------------------
{
  let dupTitle = 0;
  let tagEqualsTitle = 0;
  let checked = 0;
  for (let i = 0; i < 6; i++) {
    const plan = buildPlan(applyAlg(solvedState(), scramble()));
    if (!plan.ok) continue;
    for (const method of plan.methods) {
      const seen = new Set<string>();
      for (const st of method.steps) {
        checked++;
        if (seen.has(st.title)) dupTitle++;
        seen.add(st.title);
        if (st.algorithm && st.algorithm === st.title) tagEqualsTitle++;
      }
    }
  }
  if (dupTitle || tagEqualsTitle) {
    fails++;
    console.log(
      `FAIL  ${dupTitle} duplicate step titles and ${tagEqualsTitle} rows whose tag repeats their title, of ${checked}`
    );
  } else {
    console.log(`ok    all ${checked} step rows have a distinct title and a tag that adds to it`);
  }
}

// --- the "why this works" sheet has something to say about every step -------
//
// The sheet's whole payload is the library entry behind the step: the "What it
// does" paragraph and the corner/edge footnote both come from it. Joining the
// solver's vocabulary to the library's by *name* resolved 8 of 15 algorithms
// and carried a note on 3, so twelve of fifteen steps opened an explanation
// screen with no explanation on it. Nothing failed - the JSX simply rendered
// nothing - which is exactly the class of bug a test has to catch.
{
  const missingId = new Map<string, number>();
  const unresolved = new Map<string, number>();
  const noteless = new Map<string, number>();
  const thin = new Map<string, string>();
  const used = new Set<string>();
  let checked = 0;

  for (let i = 0; i < 8; i++) {
    const plan = buildPlan(applyAlg(solvedState(), scramble()));
    if (!plan.ok) continue;
    for (const method of plan.methods) {
      for (const st of method.steps) {
        if (!st.algorithm) continue;
        checked++;
        used.add(st.algorithm);
        if (!st.algorithmId) {
          missingId.set(st.algorithm, (missingId.get(st.algorithm) ?? 0) + 1);
          continue;
        }
        const alg = algorithmForStep(st);
        if (!alg) {
          unresolved.set(st.algorithm, (unresolved.get(st.algorithm) ?? 0) + 1);
          continue;
        }
        if (!alg.note) {
          noteless.set(st.algorithm, (noteless.get(st.algorithm) ?? 0) + 1);
          continue;
        }
        // A note that is a two-word label ("The workhorse") renders as a
        // heading with nothing under it. The bar is a sentence that explains
        // the mechanism, so the shape of one is enforced rather than trusted.
        if (alg.note.length < 60 || !/[.]$/.test(alg.note)) {
          thin.set(st.algorithm, alg.note);
        }
      }
    }
  }

  const broken =
    missingId.size + unresolved.size + noteless.size + thin.size;
  if (broken > 0) {
    fails++;
    console.log(
      `FAIL  ${broken} of ${used.size} algorithms the plan uses cannot fill the "why this works" sheet`
    );
    for (const [name, n] of missingId) console.log(`      no algorithmId at all: "${name}" (${n} steps)`);
    for (const [name, n] of unresolved) console.log(`      id resolves to nothing: "${name}" (${n} steps)`);
    for (const [name, n] of noteless) console.log(`      library entry has no note: "${name}" (${n} steps)`);
    for (const [name, note] of thin) console.log(`      note is a label, not an explanation: "${name}" -> "${note}"`);
  } else {
    console.log(
      `ok    all ${used.size} algorithms used across ${checked} steps resolve to a library entry with a real note`
    );
  }
}

// --- "Watch these" names the step's own pieces, and keeps naming them -------
//
// The list used to be built by asking `describeCubie` who was standing in the
// step's target *slots*. The step's own moves push pieces through those slots,
// so the list re-ordered mid-step on 146 of 146 steps and changed membership on
// 136 - the piece the step is named after dropped off the list telling the
// learner to watch it. Naming by colour key cannot drift, and this asserts both
// halves: the names are the step's own pieces, and they survive its moves.
{
  let outsiders = 0;
  let drifted = 0;
  let empty = 0;
  let checked = 0;
  let positionalWouldDrift = 0;

  for (let i = 0; i < 4; i++) {
    const start = applyAlg(solvedState(), scramble());
    const plan = buildPlan(start);
    if (!plan.ok) continue;
    const beginner = plan.methods.find((m) => m.id === 'beginner');
    if (!beginner) continue;

    for (const st of beginner.steps) {
      if (st.pieceKeys.length === 0) continue;
      checked++;
      const own = new Set(st.pieceKeys.map(nameOfPieceKey));
      const base = piecesToWatch(st);
      if (base.length === 0) empty++;
      for (const name of base) if (!own.has(name)) outsiders++;

      // Step through the step's own moves and re-ask.
      let cube = applyAlg(start, st.prelude);
      const positionalAt = (state: CubeState) => {
        const seen = new Set<string>();
        const out: string[] = [];
        for (const slot of st.targetSlots) {
          const key = vecKey(SLOTS[slot].pos);
          if (seen.has(key)) continue;
          seen.add(key);
          const name = describeCubie(state, SLOTS[slot].pos);
          if (!name.startsWith('?') && !name.endsWith('centre')) out.push(name);
        }
        return out.join(' | ');
      };
      const positionalStart = positionalAt(cube);
      for (const mv of st.moves) {
        cube = applyAlg(cube, [mv]);
        if (piecesToWatch(st).join(' | ') !== base.join(' | ')) drifted++;
      }
      if (positionalAt(cube) !== positionalStart) positionalWouldDrift++;
    }
  }

  if (outsiders || drifted || empty) {
    fails++;
    console.log(
      `FAIL  "Watch these" is wrong on ${checked} steps: ${outsiders} names outside the ` +
      `step's own pieces, ${drifted} lists that changed mid-step, ${empty} empty lists`
    );
  } else {
    console.log(
      `ok    all ${checked} steps name their own pieces and keep naming them ` +
      `(the slot-based list would have drifted on ${positionalWouldDrift})`
    );
  }
}

// --- the piece count under the sheet is THIS step's, not the algorithm's ----
//
// The footnote used to state the algorithm's effect on a solved cube while the
// sheet was open on a step, showed that step's notation and played that step's
// moves. Measured over 369 steps it was right on 112. The dominant cause is
// that a step's AUF setup turns are part of `step.moves` and turn the whole top
// layer, so `beg-corner-pos` - whose prose says "no edge moves at all" - was
// printed over notation that moved four.
//
// Counted here independently of `src/cube/effect.ts`: by comparing the colours
// on each cubie before and after, rather than by sticker tracking.
{
  /** Pieces whose stickers differ after `moves`, counted the long way round. */
  const movedTheOtherWay = (before: CubeState, moves: Move[]) => {
    const after = applyAlg(before, moves);
    let corners = 0;
    let edges = 0;
    for (const p of CUBIES) {
      const kind = cubieKind(p);
      if (kind < 2) continue;
      const slots = SLOTS_BY_CUBIE.get(vecKey(p)) ?? [];
      if (slots.every((i) => before.colors[i] === after.colors[i])) continue;
      if (kind === 3) corners++;
      else edges++;
    }
    return { corners, edges };
  };
  const spell = (n: number, one: string) =>
    n === 0 ? `no ${one}s` : n === 1 ? `1 ${one}` : `${n} ${one}s`;

  let checked = 0;
  let wrong = 0;
  let missing = 0;
  let algWouldBeWrong = 0;
  let faceChecked = 0;
  let faceWrong = 0;
  const examples: string[] = [];

  for (let i = 0; i < 6; i++) {
    const start = applyAlg(solvedState(), scramble());
    const plan = buildPlan(start);
    if (!plan.ok) continue;
    const beginner = plan.methods.find((m) => m.id === 'beginner');
    if (!beginner) continue;
    for (const st of beginner.steps) {
      const alg = algorithmForStep(st);
      if (!alg) continue;
      checked++;

      const base = applyAlg(start, st.prelude);
      const real = movedTheOtherWay(base, st.moves);
      const said = stepFootnote(st)[0] ?? '';
      const want = `This step moves ${spell(real.corners, 'corner')} and ${spell(real.edges, 'edge')};`;
      if (!said) {
        missing++;
      } else if (!said.startsWith(want)) {
        wrong++;
        if (examples.length < 4) examples.push(`${st.algorithm}: "${said}" but the moves move ${want}`);
      }
      if (alg.corners !== real.corners || alg.edges !== real.edges) algWouldBeWrong++;

      // The note is filled in for the face this step actually plays.
      //
      // All four first-layer corner slots teach `trig-sexy`, so all four used
      // to be explained "takes the corner out of the front-right slot with R"
      // - and 74% of those steps contain no R turn at all. Both halves are
      // checked: no placeholder survives, and the face the note names is a
      // face the step really turns.
      const note = noteForStep(st) ?? '';
      if (/\{\w+\}/.test(note)) {
        wrong++;
        if (examples.length < 4) examples.push(`${st.algorithm}: note still has a placeholder in it`);
      }
      const face = st.noteVars?.face;
      if (/\{\w+\}/.test(alg.note ?? '') && !face) {
        faceWrong++;
        faceChecked++;
        if (examples.length < 4) {
          examples.push(`${st.algorithm}: the library note is written per face and the step does not say which`);
        }
      } else if (face) {
        faceChecked++;
        if (!st.moves.some((m) => m.notation[0] === face)) {
          faceWrong++;
          if (examples.length < 4) {
            examples.push(`${st.algorithm}: the note explains ${face}, the step never turns ${face} (${st.notation})`);
          }
        }
        if (st.noteVars?.slot && !st.detail.includes(st.noteVars.slot)) {
          faceWrong++;
          if (examples.length < 4) {
            examples.push(`${st.algorithm}: the detail does not name the ${st.noteVars.slot} slot`);
          }
        }
      }
    }
  }

  if (wrong || missing || faceWrong) {
    fails++;
    console.log(
      `FAIL  the sheet's piece count is wrong on ${wrong} of ${checked} steps ` +
      `(${missing} with no count at all, ${faceWrong} of ${faceChecked} explaining the wrong face or slot)`
    );
    for (const e of examples) console.log(`      ${e}`);
  } else {
    console.log(
      `ok    all ${checked} steps print the count their own moves produce ` +
      `(the algorithm's count would have been wrong on ${algWouldBeWrong}); ` +
      `all ${faceChecked} trigger steps explain a face they actually turn`
    );
  }
}

console.log(
  `\n${N - fails}/${N} plans solved · beginner avg ${(beginnerMoves / Math.max(1, N)).toFixed(1)} moves ` +
  `· shortest avg ${(shortMoves / Math.max(1, checkedShort)).toFixed(1)} over ${checkedShort} checks`
);
process.exit(fails ? 1 : 0);
