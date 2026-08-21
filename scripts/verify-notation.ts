/**
 * How a move sequence is written down for a learner.
 *
 * Two rules, both of which lived inside JSX until now and so were checked by
 * nobody:
 *
 *   1. A repeated trigger prints one period plus a multiplier, and the block
 *      still accounts for every move. Printing `R U R' U'` five times under a
 *      label that already says `×5` wrapped onto two lines and said the same
 *      thing twice; collapsing it without stating the total would have cost the
 *      learner the one number they need to follow along.
 *   2. A row never prints the same words twice. `Sexy move · Sexy move ·
 *      L U L' U'` is what the active card read - the algorithm tag and the first
 *      chunk's name, side by side.
 *
 * Checked against the real beginner plans, not only against hand-written
 * sequences, so a change to the trigger library shows up here.
 */
import { applyAlg, solvedState } from '../src/cube/core';
import { ALGORITHMS, TRIGGERS, chunkByTriggers } from '../src/cube/algorithms';
import { buildPlan } from '../src/cube/solver/plan';
import {
  baseName,
  maskMoveRuns,
  notationBlocks,
  printsMoves,
  stepRowLines,
  stripHeading,
  summaryLine,
  tagFor,
} from '../src/ui/notation';

let fails = 0;
const check = (name: string, ok: boolean, extra = '') => {
  if (ok) console.log(`ok    ${name}`);
  else {
    fails++;
    console.log(`FAIL  ${name} ${extra}`);
  }
};

const words = (s: string) => s.trim().split(/\s+/);

// -- 1. a collapsed block still accounts for every move ----------------------

{
  const sexy = TRIGGERS.find((t) => t.name === 'Sexy move');
  if (!sexy) {
    check('the library still has a Sexy move to collapse', false);
  } else {
    const five = Array.from({ length: 5 }, () => sexy.notation).flat();
    const [block] = notationBlocks(five);
    check('five sexy moves read as one block', notationBlocks(five).length === 1);
    check('labelled with the count', block.label === 'Sexy move ×5', String(block.label));
    check('printing one period', block.period.join(' ') === sexy.notation.join(' '),
      block.period.join(' '));
    check(
      `and keeping the total (${five.length} moves, not ${sexy.notation.length})`,
      block.all.length === five.length && block.repeat === 5,
      `${block.all.length} / ×${block.repeat}`
    );
    check('the period is shorter than the run, so collapsing is worth doing',
      block.period.length < block.all.length);
  }
}

// -- 2. every block, on every real step, accounts for its moves --------------

{
  let steps = 0;
  let collapsed = 0;
  let lost = '';
  let unlabelledCollapse = '';
  for (let i = 0; i < 12; i++) {
    const scramble = ["R U R' U' F2 L D L'", "B U2 B' R2 D F R", "L' U R2 F' D2 B", "U R2 F B' D L"][
      i % 4
    ];
    const plan = buildPlan(applyAlg(solvedState(), `${scramble} ${'U R F '.repeat(i % 3)}`.trim()));
    for (const method of plan.methods) {
      for (const step of method.steps) {
        const notation = step.moves.map((m) => m.notation);
        steps++;
        const blocks = notationBlocks(notation);
        // Concatenating every block's `all` must give the sequence back.
        const rebuilt = blocks.flatMap((b) => b.all);
        if (rebuilt.join(' ') !== notation.join(' ') && !lost) {
          lost = `${step.title}: ${rebuilt.join(' ')} vs ${notation.join(' ')}`;
        }
        for (const b of blocks) {
          if (b.repeat > 1) {
            collapsed++;
            if (b.period.length * b.repeat !== b.all.length && !lost) {
              lost = `${step.title}: ${b.label} is ${b.all.length} moves from a ${b.period.length} period`;
            }
            // A block with no name has nothing to carry the count, so it must
            // never be collapsed - the learner would just lose moves.
            if (!b.name && !unlabelledCollapse) unlabelledCollapse = `${step.title}: ${b.all.join(' ')}`;
          }
        }
      }
    }
  }
  check(`the blocks of all ${steps} steps rebuild their sequence exactly`, lost === '', lost);
  check(`and ${collapsed} of them are real collapsed repeats, so this is a real test`,
    collapsed > 20, `${collapsed}`);
  check('nothing is ever collapsed without a name to carry the count',
    unlabelledCollapse === '', unlabelledCollapse);
}

// -- 3. the summary line names triggers rather than spelling them out --------

{
  const sexy = TRIGGERS.find((t) => t.name === 'Sexy move')!;
  const line = summaryLine([...sexy.notation, ...sexy.notation, 'U2']);
  check('a summary names the trigger and its count', line === 'Sexy move ×2 · U2', line);
  check('and stays one short line', words(line).length <= 6, `${words(line).length} words`);
}

// -- 4. a row never prints the same words twice ------------------------------

{
  const sexy = TRIGGERS.find((t) => t.name === 'Sexy move')!;
  const run = [...sexy.notation, ...sexy.notation];
  check('a tag equal to the title is dropped (rule N4)',
    tagFor('Sexy move', 'Sexy move', run) === null);
  check('a tag equal to a chunk name is dropped',
    tagFor('White-green-orange corner', 'Sexy move', run) === null,
    String(tagFor('White-green-orange corner', 'Sexy move', run)));
  check('and so is one that differs only by its face',
    tagFor('White-blue-orange corner', 'Sexy move (back)', run) === null,
    String(tagFor('White-blue-orange corner', 'Sexy move (back)', run)));
  check('a tag that adds something is kept',
    tagFor('Free the slot', 'Insert right', ['R', 'U', "R'"]) === 'Insert right');
  check('no algorithm, no tag', tagFor('Put white on the bottom', null, ['U']) === null);
  check('baseName strips only a trailing qualifier',
    baseName('Sexy move (back)') === 'Sexy move' &&
      baseName('T perm (swap two corners and two edges)') === 'T perm' &&
      baseName('Sexy move') === 'Sexy move');
}

// -- 5. the rule holds on every row of every generated plan ------------------

{
  let rows = 0;
  let dupes = 0;
  let first = '';
  for (let i = 0; i < 20; i++) {
    const plan = buildPlan(
      applyAlg(solvedState(), ["R U R' U'", "B U2 B' R2 D F", "L' U R2 F' D2", "U R2 F B' D L U'"][i % 4].repeat(1) + ` ${'R U F '.repeat(i % 4)}`)
    );
    for (const method of plan.methods) {
      for (const step of method.steps) {
        const notation = step.moves.map((m) => m.notation);
        const tag = tagFor(step.title, step.algorithm, notation);
        rows++;
        if (!tag) continue;
        // What the row actually prints: the summary line, then the tag.
        const printed = [summaryLine(notation), tag];
        const names = chunkByTriggers(notation)
          .map((c) => c.label)
          .filter((n): n is string => n !== null)
          .map(baseName);
        if (names.includes(baseName(tag)) || baseName(tag) === baseName(step.title)) {
          dupes++;
          if (!first) first = `${step.title} · ${printed.join(' · ')}`;
        }
      }
    }
  }
  check(`no row of ${rows} prints its algorithm twice`, dupes === 0, first);
  check('and there were enough rows for that to mean something', rows > 200, `${rows}`);
}

// --- the practise veil: prose without its move sequences --------------------
//
// The "why this works" sheet stays open during a practise run, and its
// explanations quote the moves - "then repeat B U B' U' until it drops in" is
// the whole answer to a step that is those four moves five times over. A run of
// turns goes; a single turn stays, because "F opens the top layer and F' folds
// it back" is how the sentence explains the mechanism and one move on its own
// answers nothing.
{
  const cases: { in: string; out: string }[] = [
    {
      in: "Hold the empty slot at the back-right and repeat B U B' U' until it drops in.",
      out: 'Hold the empty slot at the back-right and repeat \u2026 until it drops in.',
    },
    {
      in: "The step opens with L U L' U' to knock it out.",
      out: 'The step opens with \u2026 to knock it out.',
    },
    {
      in: "F opens the top layer, and F' folds it back.",
      out: "F opens the top layer, and F' folds it back.",
    },
    {
      in: "The two halves are U R U' R' and then U' F' U F, which is why.",
      out: 'The two halves are \u2026 and then \u2026, which is why.',
    },
    {
      in: 'Takes the corner out of the front-right slot with R, spins the top.',
      out: 'Takes the corner out of the front-right slot with R, spins the top.',
    },
    { in: "R U R' U'", out: '\u2026' },
    { in: '', out: '' },
  ];
  let bad = 0;
  for (const c of cases) {
    const got = maskMoveRuns(c.in);
    if (got !== c.out) {
      bad++;
      console.log(`FAIL  masked "${c.in}"\n      got  "${got}"\n      want "${c.out}"`);
    }
  }
  if (bad) fails += bad;
  else console.log(`ok    ${cases.length} sentences keep their meaning with their move runs taken out`);

  // And over the real library: no note or step detail keeps a run of turns.
  {
    const isMove = (w: string) => /^[URFDLBMES]w?(?:2|')?$|^[xyz](?:2|')?$/.test(w.replace(/[.,;:!?)\]]+$/, ''));
    let runs = 0;
    let checked = 0;
    const plan = buildPlan(applyAlg(solvedState(), "R U R' U' F2 L D B' R2 U' L' B R D2 F"));
    const texts: string[] = [];
    for (const a of ALGORITHMS) if (a.note) texts.push(a.note);
    for (const m of plan.methods) for (const st of m.steps) texts.push(st.detail);
    for (const t of texts) {
      checked++;
      const words = maskMoveRuns(t).split(/\s+/);
      for (let i = 0; i + 1 < words.length; i++) {
        if (isMove(words[i]) && isMove(words[i + 1])) runs++;
      }
    }
    check(
      `no run of turns survives the veil in any of ${checked} notes and step details`,
      runs === 0,
      `${runs} runs left`
    );
  }
}

// -- 6. ONE RENDERING OF A MOVE SEQUENCE AT A TIME ---------------------------
//
// Round 6, from the user with their phone in their hand: "here you show it
// twice". The strip printed `Reverse sexy` over four chips and the step card
// ten points below printed the same four moves under the same label again.
// The rule now is that the strip owns the notation, because the strip has the
// playhead; a row carries a NAME and never a second copy of the moves.
//
// Both halves of this are checked against every step of real plans, so a
// component that starts printing notation again fails here rather than in a
// screenshot nobody takes.
{
  const scrambles = [
    "R U R' U' F2 L D B' R2 U' L' B R D2 F",
    "D2 F' L2 B U R' F2 D L B2 R' U2 F D' L2",
    "B L2 U' R F D2 B' L U2 R2 F' D B2 U L'",
  ];
  let rows = 0;
  let printed = 0;
  let running = 0;
  let named = 0;
  let repeats = 0;
  for (const scramble of scrambles) {
    const plan = buildPlan(applyAlg(solvedState(), scramble));
    for (const method of plan.methods) {
      for (const st of method.steps) {
        const notation = st.moves.map((m) => m.notation);
        for (const isRunning of [false, true]) {
          const lines = stepRowLines({
            title: st.title,
            algorithm: st.algorithm,
            notation,
            running: isRunning,
          });
          rows++;
          if (lines.some(printsMoves)) printed++;
          if (isRunning && lines.length !== 1) running++;
          // A row never says the same words twice, which is the older rule of
          // this file kept honest against the new one.
          const seen = lines.map(baseName);
          if (new Set(seen).size !== seen.length) repeats++;
          if (!isRunning && lines.length === 2) named++;
        }
      }
    }
  }
  check(`no step row prints a move, over ${rows} rows of real plans`, printed === 0, `${printed} did`);
  check('the running row prints its name and nothing else', running === 0, `${running} printed more`);
  check('no row prints the same name twice', repeats === 0, `${repeats} did`);
  check('rows that teach an algorithm still name it', named > 0, `${named} named`);
}

// -- 7. the strip's heading follows the playhead -----------------------------
//
// The heading is the only place the algorithm is named during playback and the
// only doorway from solving into teaching, so "does it say what is happening
// right now" is the whole of its job. Checked on a sequence whose chunking is
// known: a T perm's own moves, run after a setup turn that belongs to nothing.
{
  const notation = "D R U R' U' R' F R2 U' R' U' R U R' F'".split(' ');
  const blocks = notationBlocks(notation);
  const title = 'Swap the two front corners';
  let wrong = 0;
  for (let i = 0; i < notation.length; i++) {
    const want =
      blocks.find((b) => i >= b.start && i < b.start + b.all.length)?.label ?? title;
    if (stripHeading(notation, i, title) !== want) wrong++;
  }
  check(`the heading names the chunk under the playhead at all ${notation.length} moves`, wrong === 0);
  check('an unnamed stretch of moves falls back to the step title',
    stripHeading(notation, 0, title) === title, stripHeading(notation, 0, title));
  const distinct = new Set(notation.map((_, i) => stripHeading(notation, i, title)));
  check('the heading changes as the playhead crosses into another trigger', distinct.size > 1,
    [...distinct].join(' / '));
  // Out-of-range indices are what an empty or finished step hands it.
  check('a playhead past the end still has a heading',
    stripHeading(notation, 99, title).length > 0);
  check('an empty sequence falls back to the title', stripHeading([], 0, title) === title);
}

console.log(fails ? `\n${fails} notation check(s) failed` : '\nall notation checks passed');
process.exit(fails ? 1 : 0);
