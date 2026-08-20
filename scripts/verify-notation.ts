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
import { TRIGGERS, chunkByTriggers } from '../src/cube/algorithms';
import { buildPlan } from '../src/cube/solver/plan';
import { baseName, notationBlocks, summaryLine, tagFor } from '../src/ui/notation';

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

console.log(fails ? `\n${fails} notation check(s) failed` : '\nall notation checks passed');
process.exit(fails ? 1 : 0);
