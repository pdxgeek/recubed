/**
 * The selection the solve panel is built on: piece identity, not position.
 *
 * The bug this locks down: the selection used to be a cubie coordinate, so
 * every move slid the pieces out from under the highlight rings and silently
 * retargeted the name, the partner and the "Show me how" button. Pressing that
 * button was the worst case, because it applies a whole prelude at once.
 */
import {
  CUBIES,
  CubeState,
  applyAlg,
  cubieKind,
  solvedState,
  vecKey,
} from '../src/cube/core';
import {
  Selection,
  partnerSlots,
  reanchor,
  resolveSelection,
  sameSelection,
  selectAt,
  selectionName,
  selectionPair,
  selectionSlots,
  stepForSelection,
} from '../src/cube/selection';
import { pairFor } from '../src/cube/pieces';
import { buildPlan, colorKeyOfCubie, colorKeyOfSlot, describeCubie } from '../src/cube/solver/plan';
import { stepStartState } from '../src/cube/run';

let fails = 0;
const check = (name: string, ok: boolean, extra = '') => {
  if (ok) console.log(`ok    ${name}`);
  else {
    fails++;
    console.log(`FAIL  ${name} ${extra}`);
  }
};

let seed = 90210;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const FACES = ['U', 'D', 'R', 'L', 'F', 'B'];
const SUFFIX = ['', "'", '2'];
function scramble(n = 25): string {
  const out: string[] = [];
  let last = '';
  while (out.length < n) {
    const f = FACES[Math.floor(rnd() * 6)];
    if (f === last) continue;
    last = f;
    out.push(f + SUFFIX[Math.floor(rnd() * 3)]);
  }
  return out.join(' ');
}

const MOVABLE = CUBIES.filter((p) => cubieKind(p) >= 2);
const colorsOfSelection = (state: CubeState, sel: Selection) =>
  colorKeyOfCubie(state, resolveSelection(state, sel));

// ---------------------------------------------------------------------------
// 1. The highlight follows the piece through arbitrary moves.
// ---------------------------------------------------------------------------
{
  let moved = 0;
  let wrong = 0;
  let stuck = 0;
  for (let i = 0; i < 12; i++) {
    const before = applyAlg(solvedState(), scramble());
    for (const pos of MOVABLE) {
      const sel = selectAt(before, pos, 'piece')!;
      const alg = scramble(8);
      const after = applyAlg(before, alg);
      const nowAt = resolveSelection(after, sel);
      if (colorKeyOfCubie(after, nowAt) !== sel.colors) wrong++;
      if (vecKey(nowAt) !== vecKey(pos)) moved++;
      // A coordinate-keyed selection would have stayed put every single time,
      // so a run where nothing ever moves proves nothing.
      if (selectionSlots(after, sel).length !== cubieKind(nowAt)) stuck++;
    }
  }
  check('a selected piece is still the same piece after arbitrary moves', wrong === 0, `${wrong} drifted`);
  check('and it is generally somewhere else on the cube', moved > 100, `moved ${moved} times`);
  check('its ring covers exactly that cubie', stuck === 0, `${stuck} bad ring sets`);
}

// ---------------------------------------------------------------------------
// 2. A whole-cube rotation re-labels the cube without losing the selection.
// ---------------------------------------------------------------------------
{
  const state = applyAlg(solvedState(), scramble());
  let wrong = 0;
  for (const rot of ['x', "y'", 'z2', 'x2 y']) {
    const rotated = applyAlg(state, rot);
    for (const pos of MOVABLE) {
      for (const mode of ['piece', 'location'] as const) {
        const sel = selectAt(state, pos, mode)!;
        const after = resolveSelection(rotated, sel);
        const key = mode === 'piece' ? colorKeyOfCubie(rotated, after) : colorKeyOfSlot(rotated, after);
        if (key !== sel.colors) wrong++;
      }
    }
  }
  check('re-labelling the cube after a drag keeps both piece and slot selections', wrong === 0, `${wrong} lost`);
}

// ---------------------------------------------------------------------------
// 3. "Show me how to get it there" lands on the piece the user asked about.
//    This is the exact sequence that broke on the web target.
// ---------------------------------------------------------------------------
{
  let checked = 0;
  let wrongStep = 0;
  let renamed = 0;
  for (let i = 0; i < 8; i++) {
    const origin = applyAlg(solvedState(), scramble());
    const plan = buildPlan(origin);
    if (!plan.ok) continue;
    for (const pos of MOVABLE) {
      const sel = selectAt(origin, pos, 'piece')!;
      const step = stepForSelection(plan, sel);
      if (!step) continue;
      checked++;
      // The step must be about this piece...
      if (
        step.pieceColors !== sel.colors &&
        !step.finishes.includes(sel.colors) &&
        !step.pieceKeys.includes(sel.colors)
      ) {
        wrongStep++;
      }
      // ...and pressing the button, which applies the whole prelude at once and
      // resets piece tracking, must leave the selection naming the same piece.
      const started = stepStartState(origin, step);
      if (colorsOfSelection(started, sel) !== sel.colors) renamed++;
    }
  }
  check('every offered step is about the selected piece', checked > 0 && wrongStep === 0, `${wrongStep} of ${checked}`);
  check('pressing "Show me how" leaves the selection on the same piece', renamed === 0, `${renamed} of ${checked} renamed`);
}

// ---------------------------------------------------------------------------
// 4. Slot mode is about the slot, not about whoever is squatting in it.
// ---------------------------------------------------------------------------
{
  const state = applyAlg(solvedState(), scramble());
  const plan = buildPlan(state);
  let checked = 0;
  let named = 0;
  let keyed = 0;
  for (const pos of MOVABLE) {
    const sel = selectAt(state, pos, 'location')!;
    if (sel.colors !== colorKeyOfSlot(state, pos)) keyed++;
    const intruder = colorKeyOfCubie(state, pos);
    if (intruder === sel.colors) continue; // already home: nothing to confuse
    checked++;
    // The step offered must be about the piece that belongs here, never about
    // the one currently sitting here.
    const step = stepForSelection(plan, sel);
    if (
      step &&
      step.pieceColors !== sel.colors &&
      !step.finishes.includes(sel.colors) &&
      !step.pieceKeys.includes(sel.colors)
    ) {
      keyed++;
    }
    if (step && step.pieceColors === intruder && intruder !== sel.colors) keyed++;
    // The card must not print the name of the piece sitting there.
    const label = selectionName(state, sel)!;
    if (label.toLowerCase().includes(describeCubie(state, pos))) named++;
    if (!label.endsWith('’s slot')) named++;
  }
  check('a slot is identified by the piece that belongs in it', keyed === 0, `${keyed} mis-keyed`);
  check('slot mode names the slot, never the intruder sitting in it', named === 0, `${named} of ${checked}`);
}

// ---------------------------------------------------------------------------
// 5. Partner invariants, at the panel layer, in both modes.
// ---------------------------------------------------------------------------
{
  const state = applyAlg(solvedState(), scramble());
  let bad = 0;
  let withPartner = 0;
  for (const pos of MOVABLE) {
    for (const mode of ['piece', 'location'] as const) {
      const sel = selectAt(state, pos, mode)!;
      if (partnerSlots(state, sel, false).length !== 0) bad++;
      const pair = selectionPair(state, sel)!;
      const slots = partnerSlots(state, sel, true);
      if (pair.atHome) {
        if (slots.length !== 0) bad++;
      } else if (pair.partner) {
        withPartner++;
        if (slots.length !== cubieKind(pair.partner)) bad++;
        if (cubieKind(pair.partner) !== cubieKind(pos)) bad++;
      }
    }
  }
  check('the amber ring is off when the pair toggle is off, and when the piece is home', bad === 0, `${bad} bad`);
  check('and covers a partner of the same kind otherwise', withPartner > 20, `${withPartner} partners`);
}

// ---------------------------------------------------------------------------
// 6. The two modes are opposites, and re-anchoring does not move the highlight.
// ---------------------------------------------------------------------------
{
  const state = applyAlg(solvedState(), scramble());
  let bad = 0;
  for (const pos of MOVABLE) {
    const piece = selectAt(state, pos, 'piece')!;
    const slot = reanchor(state, piece, 'location');
    if (vecKey(resolveSelection(state, slot)) !== vecKey(pos)) bad++;
    if (slot.mode !== 'location') bad++;
    if (!sameSelection(piece, reanchor(state, slot, 'piece'))) bad++;
    if (sameSelection(piece, slot)) bad++;
  }
  check('switching between "where does it go" and "what goes here" keeps the ring put', bad === 0, `${bad} bad`);
}

// ---------------------------------------------------------------------------
// 7. Coverage: a piece that is not already home always has a step to offer.
//    43% of taps used to fall through to "this one falls into place".
// ---------------------------------------------------------------------------
{
  let offered = 0;
  let missing = 0;
  for (let i = 0; i < 10; i++) {
    const state = applyAlg(solvedState(), scramble());
    const plan = buildPlan(state);
    if (!plan.ok) continue;
    for (const pos of MOVABLE) {
      if (pairFor(state, pos, 'piece').atHome) continue;
      const sel = selectAt(state, pos, 'piece')!;
      if (stepForSelection(plan, sel)) offered++;
      else missing++;
    }
  }
  const rate = missing / Math.max(1, offered + missing);
  check('almost every unsolved piece can be looked up', rate < 0.02,
    `${missing} of ${offered + missing} (${(rate * 100).toFixed(1)}%) had no step`);
}

// ---------------------------------------------------------------------------
// 7b. And the step offered is the one that actually lands the piece - not the
//     first step that happens to nudge it into place on its way past.
// ---------------------------------------------------------------------------
{
  let misdirected = 0;
  let checked = 0;
  for (let i = 0; i < 10; i++) {
    const state = applyAlg(solvedState(), scramble());
    const plan = buildPlan(state);
    if (!plan.ok) continue;
    for (const pos of MOVABLE) {
      if (pairFor(state, pos, 'piece').atHome) continue;
      const sel = selectAt(state, pos, 'piece')!;
      const step = stepForSelection(plan, sel);
      if (!step) continue;
      checked++;
      // A yellow-layer piece belongs to a last-layer step, never to the cross.
      const lastLayer = describeCubie(state, pos).includes('yellow');
      if (lastLayer && /First layer|Middle layer/.test(step.group)) misdirected++;
    }
  }
  check('a last-layer piece is never sent to a first-layer step',
    misdirected === 0, `${misdirected} of ${checked}`);
}

// ---------------------------------------------------------------------------
// 7c. The card and the step it sends you to must call the piece the same thing.
//     "Orange-blue-white corner" and "White-blue-orange corner" are the same
//     piece, and nobody should have to work that out.
// ---------------------------------------------------------------------------
{
  let checked = 0;
  let mismatched = 0;
  for (let i = 0; i < 8; i++) {
    const state = applyAlg(solvedState(), scramble());
    const plan = buildPlan(state);
    if (!plan.ok) continue;
    for (const pos of MOVABLE) {
      const sel = selectAt(state, pos, 'piece')!;
      const step = stepForSelection(plan, sel);
      if (!step || step.pieceColors !== sel.colors) continue;
      checked++;
      if (step.title.toLowerCase() !== (selectionName(state, sel) ?? '').toLowerCase()) {
        mismatched++;
      }
    }
  }
  check('the card and its step name the piece identically', checked > 0 && mismatched === 0,
    `${mismatched} of ${checked}`);
}

// ---------------------------------------------------------------------------
// 8. A half-painted cube cannot single a piece out; fall back, do not crash.
// ---------------------------------------------------------------------------
{
  const half = applyAlg(solvedState(), scramble());
  for (let i = 0; i < 30; i++) half.colors[i] = null;
  const pos = MOVABLE[0];
  const sel = selectAt(half, pos, 'piece')!;
  check('an unfinished paint job falls back to where the user tapped',
    vecKey(resolveSelection(half, sel)) === vecKey(pos));
  check('and centres still cannot be selected', selectAt(half, [0, 1, 0], 'piece') === null);
}

console.log(fails ? `\n${fails} selection check(s) failed` : '\nall selection checks passed');
process.exit(fails ? 1 : 0);
