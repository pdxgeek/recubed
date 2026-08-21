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
  LIST_BREATHING_ROOM,
  RUN_PANEL_MAX,
  RUN_PANEL_MIN,
  RUN_PANEL_SHARE,
  listBottomInset,
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

console.log(`\n${fails ? `${fails} layout check(s) failed` : 'all layout checks passed'}`);
process.exit(fails ? 1 : 0);
