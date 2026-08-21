/**
 * The two runtime layout numbers, checked against the shapes a device reports.
 *
 * These exist because the first real-device screenshot of this app disagreed
 * with four rounds of browser measurement. The properties asserted here are the
 * ones that make the disagreement survivable: a correct layout costs nothing, a
 * layout that overflows reserves exactly what it overflowed by, and a height
 * that used to be a percentage is now a number with stated bounds.
 */
import {
  CUBE_MIN,
  CUBE_MIN_SHARE,
  LIST_BREATHING_ROOM,
  PANEL_LAST_RESORT,
  RUN_PANEL_MAX,
  RUN_PANEL_MIN,
  RUN_PANEL_SHARE,
  STRIP_H_FALLBACK,
  cubeFloor,
  listBottomInset,
  panelBudget,
  panelOverflow,
  runPanelHeight,
} from '../src/ui/layout';

let fails = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) console.log(`ok    ${name}`);
  else {
    fails++;
    console.log(`FAIL  ${name}${detail ? ` - ${detail}` : ''}`);
  }
};

// --- an honest layout costs the list nothing --------------------------------
{
  // iPhone 15-class: body 852 - status/top bar - step bar.
  const body = { height: 700 };
  const panel = { y: 700 - 266, height: 266 };
  const over = panelOverflow(body, panel);
  check('a panel that ends exactly at the body reserves nothing', over === 0, `got ${over}`);
  check(
    'the list then leaves only breathing room',
    listBottomInset(over) === LIST_BREATHING_ROOM,
    `got ${listBottomInset(over)}`
  );
  check(
    'which is well short of the 72 it used to reserve',
    listBottomInset(over) < 72,
    `got ${listBottomInset(over)}`
  );
}

// --- a panel that runs past the body reserves exactly the difference --------
{
  const body = { height: 700 };
  for (const spill of [1, 18, 76, 140]) {
    const panel = { y: 700 - 266, height: 266 + spill };
    const over = panelOverflow(body, panel);
    check(`a panel spilling ${spill}pt reserves ${spill}pt`, over === spill, `got ${over}`);
  }
}

// --- nothing is guessed before it is measured -------------------------------
{
  check('an unmeasured body reserves nothing', panelOverflow({ height: 0 }, { y: 10, height: 200 }) === 0);
  check('an unmeasured panel reserves nothing', panelOverflow({ height: 700 }, { y: 0, height: 0 }) === 0);
  check(
    'a negative overflow is not a negative inset',
    listBottomInset(panelOverflow({ height: 700 }, { y: 0, height: 100 })) === LIST_BREATHING_ROOM
  );
}

// --- the run panel is a number, with bounds ---------------------------------
{
  const cases: { body: number; want: number }[] = [
    { body: 700, want: Math.round(700 * RUN_PANEL_SHARE) }, // 266, as the percentage gave
    { body: 520, want: Math.round(520 * RUN_PANEL_SHARE) }, // 198
    { body: 300, want: RUN_PANEL_MIN }, // clamped up
    { body: 1200, want: RUN_PANEL_MAX }, // clamped down
  ];
  for (const c of cases) {
    const got = runPanelHeight(c.body, 200);
    check(`a ${c.body}pt body gives a ${c.want}pt panel`, got === c.want, `got ${got}`);
  }
  check('an unmeasured body falls back to the caller"s number', runPanelHeight(0, 200) === 200);
  check(
    'and the fallback is clamped too',
    runPanelHeight(0, 5000) === RUN_PANEL_MAX && runPanelHeight(0, 5) === RUN_PANEL_MIN
  );
  // The cube must keep the majority of the body whatever the window.
  for (const body of [300, 520, 700, 900, 1200]) {
    const h = runPanelHeight(body, 200);
    check(`the cube keeps most of a ${body}pt body during a run`, h <= body * 0.5, `panel ${h}`);
  }
}

// -- THE CUBE'S FLOOR --------------------------------------------------------
//
// Round 6, from the user: "I dunno about zero panel height either the cube is
// off the screen". Three rounds of controls were added on a "zero panel height"
// argument measured in Chromium, and what actually decides the cube's size is
// the panel's BOX - which was a percentage of a parent whose height Yoga
// settles differently on the two platforms, with the canvas as the only
// shrinkable sibling in the column. So the panel is a definite number, and it
// yields to the cube rather than the other way round.
//
// Every body height between a short landscape window and a large tablet, at
// every strip height the strip can measure itself at.
{
  let short = 0;
  let overflow = 0;
  let notDefinite = 0;
  let cases = 0;
  let worst = '';
  for (let body = 260; body <= 1400; body += 4) {
    for (const strip of [0, 96, STRIP_H_FALLBACK, 160]) {
      cases++;
      const wanted = runPanelHeight(body, 200);
      const b = panelBudget(body, wanted, strip);
      if (b.panel + b.canvas !== body) {
        overflow++;
        if (!worst) worst = `${body}/${strip}: ${b.panel} + ${b.canvas} != ${body}`;
      }
      if (!Number.isFinite(b.panel) || b.panel < 0) notDefinite++;
      // The floor holds unless the panel has been squeezed to its own last
      // resort, which only a window shorter than any phone can do.
      const floor = Math.min(cubeFloor(body), body - strip);
      if (b.cube < floor && b.panel > PANEL_LAST_RESORT) {
        short++;
        if (!worst) worst = `${body}pt body, ${strip}pt strip: ${b.cube}pt of cube, floor ${floor}`;
      }
    }
  }
  check(`the panel and the canvas always add up to the body (${cases} cases)`, overflow === 0, worst);
  check('the panel is always a definite, non-negative number', notDefinite === 0);
  check('the cube never falls below its floor while the panel has room to yield',
    short === 0, worst);

  // The specific numbers a 393x852 iPhone produces, with and without the safe
  // area, so a change to the shares is visible in the diff rather than implied.
  for (const [name, body, strip, minCube] of [
    ['iPhone 15, iOS safe area, running', 631, 120, 240],
    ['iPhone 15, no safe area, running', 724, 120, 300],
    ['iPhone 15, at rest', 692, 0, 300],
  ] as [string, number, number, number][]) {
    const b = panelBudget(body, runPanelHeight(body, 200), strip);
    check(`${name}: ${b.cube}pt of cube, ${b.panel}pt of panel`, b.cube >= minCube,
      `wanted at least ${minCube}`);
  }

  // The panel wins only when honouring the floor would leave it with nothing.
  {
    const b = panelBudget(260, runPanelHeight(260, 200), 120);
    check('a window too short for both keeps a usable panel',
      b.panel === PANEL_LAST_RESORT && b.cube > 0, JSON.stringify(b));
  }
  check('an unmeasured body waits rather than guessing',
    panelBudget(0, 210, 120).panel === 210);
  check(`the floor is ${CUBE_MIN}pt or ${Math.round(CUBE_MIN_SHARE * 100)}% of the body, whichever is more`,
    cubeFloor(300) === CUBE_MIN && cubeFloor(900) === 300);
}

console.log(`\n${fails ? `${fails} layout check(s) failed` : 'all layout checks passed'}`);
process.exit(fails ? 1 : 0);
