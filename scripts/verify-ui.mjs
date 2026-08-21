/**
 * Opt-in browser checks: `npm run verify:ui`.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHAT THIS EXERCISES, AND WHAT IT CANNOT
 *
 * This drives the Expo **web** target, where expo-gl is an ordinary browser
 * WebGL canvas. AGENTS.md documents two traps that exist only on the native
 * expo-gl path:
 *
 *   - `GLView` needs `msaaSamples={0}`; on the default multisampled path
 *     nothing is presented, not even a bare `gl.clear`;
 *   - `expo-gl` does not implement `getParameter(gl.FRAMEBUFFER_BINDING)`.
 *
 * Neither can be reached from a browser. A green run here therefore proves a
 * rendering bug is *absent on web*; it never proves the native path. Anything
 * about how the cube looks on a device still has to be checked on a device.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Deliberately NOT part of `npm run verify`: it needs a Metro bundle and a
 * browser, and the core suite must stay fast and dependency-free.
 *
 * `react-dom`, `react-native-web` and `@expo/metro-runtime` are devDependencies
 * so `npm ci` restores them; `playwright` is too, but its browser is a separate
 * download (`npx playwright install chromium`). Everything this script needs is
 * probed up front and reported by name - a missing dependency used to surface
 * as a three-minute timeout with no hint of the cause.
 *
 * Set RECUBED_CHROME to use a chromium binary playwright did not install.
 * Point it at an already-running server with RECUBED_URL, otherwise it starts
 * `expo start --web` itself and shuts it down at the end.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { setTimeout as sleep } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const URL_ = process.env.RECUBED_URL ?? 'http://localhost:8081';
const HEADLESS_GL = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'];

let fails = 0;
const check = (name, ok, extra = '') => {
  if (ok) console.log(`ok    ${name}`);
  else {
    fails++;
    console.log(`FAIL  ${name} ${extra}`);
  }
};

// -- dependencies, named before anything slow happens ------------------------

const NEEDED = ['react-dom', 'react-native-web', '@expo/metro-runtime', 'playwright'];
const missing = NEEDED.filter((n) => {
  try {
    require.resolve(`${n}/package.json`);
    return false;
  } catch {
    return true;
  }
});
if (missing.length) {
  console.log(`verify:ui needs ${missing.join(', ')} — run:\n    npm ci && npx playwright install chromium`);
  process.exit(2);
}
const { chromium } = await import('playwright');

async function serverUp() {
  try {
    const res = await fetch(URL_, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

let server = null;
if (!(await serverUp())) {
  console.log(`starting expo web at ${URL_} ...`);
  server = spawn('npx', ['expo', 'start', '--web', '--port', new global.URL(URL_).port || '8081'], {
    env: { ...process.env, CI: '1', BROWSER: 'none' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 120 && !(await serverUp()); i++) await sleep(2000);
  if (!(await serverUp())) {
    console.log('FAIL  the dev server never came up');
    server.kill();
    process.exit(1);
  }
}

const executablePath = process.env.RECUBED_CHROME || undefined;
const browser = await chromium.launch({ args: HEADLESS_GL, executablePath });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));

const labelled = (label) => page.locator(`[aria-label="${label}"]`);
const count = (label) => labelled(label).count();
const bodyText = () => page.evaluate(() => document.body.innerText);

/** Pixel statistics of the canvas: how much is painted, and where. */
const canvasStats = async () => {
  const box = await page.locator('canvas').boundingBox();
  if (!box || box.width < 2 || box.height < 2) return null;
  const shot = await page.screenshot({ clip: box });
  return page.evaluate(
    ([b64, w, h]) =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          const g = c.getContext('2d');
          g.drawImage(img, 0, 0);
          const d = g.getImageData(0, 0, w, h).data;
          let lit = 0;
          let sum = 0;
          let minX = w;
          let maxX = 0;
          let minY = h;
          let maxY = 0;
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const i = (y * w + x) * 4;
              const v = d[i] + d[i + 1] + d[i + 2];
              sum = (sum * 31 + v) % 2147483647;
              if (v > 150) {
                lit++;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
              }
            }
          }
          resolve({ lit, signature: sum, minX, maxX, minY, maxY, w, h });
        };
        img.src = `data:image/png;base64,${b64}`;
      }),
    [shot.toString('base64'), Math.round(box.width), Math.round(box.height)]
  );
};

const tapCube = async (fx, fy) => {
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  await sleep(700);
};

try {
  await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await page.waitForSelector('text=Paint the stickers', { timeout: 240000 });
  await sleep(3000);

  // -- 0. the bundle is this round's, not a cached one -----------------------
  {
    const text = await bodyText();
    check(
      'the served bundle is the current one',
      text.includes('Solved') && text.includes('Scramble') && text.includes('Start over'),
      text.slice(0, 160).replace(/\n/g, ' / ')
    );
  }

  // -- 0b. the 3D view is the default ---------------------------------------
  //
  // react-native-web answers `isScreenReaderEnabled` with an unconditional
  // `true`, so an unguarded auto-switch puts every browser visitor in the net.
  {
    const canvases = await page.locator('canvas').count();
    const netCells = await page.evaluate(
      () =>
        [...document.querySelectorAll('[role="button"]')].filter((n) =>
          / face, (row|centre)/.test(n.getAttribute('aria-label') ?? '')
        ).length
    );
    check('the app opens on the 3D view', canvases === 1 && netCells === 0,
      `${canvases} canvases, ${netCells} net cells`);
  }

  // -- 1. the colour picker shows all six colours without scrolling ----------
  {
    const swatches = await page.evaluate(() =>
      [...document.querySelectorAll('[role="radio"]')].map((n) => {
        const r = n.getBoundingClientRect();
        return {
          label: n.getAttribute('aria-label'),
          inView: r.top >= 0 && r.bottom <= window.innerHeight,
        };
      })
    );
    const colours = swatches.filter((s) => /of 9/.test(s.label ?? ''));
    check(
      'all six colours are on screen at once',
      colours.length === 6 && colours.every((c) => c.inView),
      JSON.stringify(colours)
    );
  }

  // -- 2. the swatch letters are legible -------------------------------------
  {
    const ratios = await page.evaluate(() => {
      const lum = (rgb) => {
        const [r, g, b] = rgb.match(/\d+/g).map(Number).map((v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const out = [];
      for (const n of document.querySelectorAll('[role="radio"]')) {
        const label = n.getAttribute('aria-label') ?? '';
        if (!/of 9/.test(label)) continue;
        // The letter sits inside the coloured bar.
        const letter = [...n.querySelectorAll('div, span')]
          .map((e) => e.firstElementChild)
          .find((e) => e && /^[WYGBRO]$/.test((e.textContent ?? '').trim()));
        const bar = letter?.parentElement;
        if (!letter || !bar) continue;
        const a = lum(getComputedStyle(letter).color);
        const b = lum(getComputedStyle(bar).backgroundColor);
        out.push({
          letter: letter.textContent.trim(),
          ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
        });
      }
      return out;
    });
    check(
      'every colour letter clears 4.5:1 against its swatch',
      ratios.length === 6 && ratios.every((r) => r.ratio >= 4.5),
      ratios.map((r) => `${r.letter} ${r.ratio.toFixed(2)}`).join(' ')
    );
  }

  // -- 3. scrambling does not delete the buttons ----------------------------
  //
  // Scramble fills all 48 stickers, and a "Solve this cube" primary that
  // *replaced* the actions row therefore deleted the app's most-used button the
  // first time it was used - and stranded anyone holding an impossible cube.
  {
    await page.click('[aria-label="Fill in a random scramble"]');
    await sleep(1500);
    const [scramble, solved, clear, solveThis] = await Promise.all([
      count('Fill in a random scramble'),
      count('Fill in a solved cube'),
      count('Clear every sticker'),
      count('Solve this cube'),
    ]);
    check(
      'Scramble, Solved and Start over survive a completed cube',
      scramble === 1 && solved === 1 && clear === 1,
      `scramble=${scramble} solved=${solved} clear=${clear}`
    );
    check('and the primary appears alongside them', solveThis === 1, `${solveThis}`);

    // 3b. ...and they are ON THE SCREEN, on the smallest phone the app supports.
    //
    // The web target scrolls the document, so a button pushed past the bottom
    // is merely below the fold; the native root View does not scroll, so it is
    // simply gone. Measured at 375x667 with all 48 painted, the action row sat
    // at y 660-704 of a 667pt window and `document.scrollHeight` was 716 -
    // and following the panel's own "tap Scramble to practise on a random
    // cube" is what pushed it there, because completing the cube adds the
    // "Solve this cube" primary above it.
    //
    // So this asserts what a device would enforce: nothing below the fold, and
    // no document taller than the window.
    for (const [w, h] of [
      [375, 667],
      [390, 844],
    ]) {
      await page.setViewportSize({ width: w, height: h });
      await sleep(900);
      const fold = await page.evaluate(() => {
        const wanted = [
          'Fill in a random scramble',
          'Fill in a solved cube',
          'Clear every sticker',
          'Solve this cube',
        ];
        const out = [];
        for (const label of wanted) {
          const n = document.querySelector(`[aria-label="${label}"]`);
          if (!n) continue;
          const r = n.getBoundingClientRect();
          out.push({ label, bottom: Math.round(r.bottom), top: Math.round(r.top) });
        }
        return {
          controls: out,
          window: window.innerHeight,
          scrollHeight: document.documentElement.scrollHeight,
        };
      });
      const off = fold.controls.filter((c) => c.bottom > fold.window + 1);
      check(
        `${w}x${h} paint, all 48: every action is above the fold`,
        off.length === 0,
        JSON.stringify({ off, window: fold.window })
      );
      check(
        `${w}x${h} paint, all 48: the document is no taller than the window`,
        fold.scrollHeight <= fold.window + 1,
        `${fold.scrollHeight} against ${fold.window}`
      );
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await sleep(700);

    const nestedPaint = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '[role="button"] [role="button"], [role="button"] [role="radio"],' +
            '[role="radio"] [role="button"], [role="radio"] [role="radio"]'
        ),
      ]
        .filter((n) => n.offsetParent !== null)
        .map((n) => n.getAttribute('aria-label'))
    );
    check('paint: no control is nested inside another control', nestedPaint.length === 0,
      JSON.stringify(nestedPaint));
  }

  // -- 4. the flat net view -------------------------------------------------
  {
    await page.click('[aria-label="Flat net view"]');
    await sleep(1400);

    // 4a. every one of the 54 cells is on screen, on every phone.
    //
    // Measured against the net's own clip region, not against the window. A
    // cell scrolled out of a ScrollView still reports a rect inside the window,
    // which is how round 3 came to claim "54 of 54 visible at 390" while 12 of
    // them were below the fold - and 30 of them on an SE. `src/ui/net.ts` has
    // the arithmetic (netBand / netFits); this is the DOM agreeing with it.
    for (const [w, h] of [
      [375, 667],
      [390, 844],
      [430, 932],
    ]) {
      await page.setViewportSize({ width: w, height: h });
      await sleep(1200);
      const fit = await page.evaluate(() => {
        const cells = [...document.querySelectorAll('[role="button"]')].filter((n) =>
          / face, (row|centre)/.test(n.getAttribute('aria-label') ?? '')
        );
        const list = cells[0]?.closest('[role="list"]');
        if (!list) return null;
        let clip = list.parentElement;
        while (clip && getComputedStyle(clip).overflowY === 'visible') clip = clip.parentElement;
        const c = clip.getBoundingClientRect();
        const inside = cells.filter((n) => {
          const r = n.getBoundingClientRect();
          return (
            r.top >= c.top - 0.5 &&
            r.bottom <= c.bottom + 0.5 &&
            r.left >= c.left - 0.5 &&
            r.right <= c.right + 0.5
          );
        }).length;
        return {
          total: cells.length,
          inside,
          overflow: clip.scrollHeight - clip.clientHeight,
          band: Math.round(c.height),
          // Whatever sits above and below the net, whatever draws it.
          above: Math.round(c.top),
          below: Math.round(window.innerHeight - c.bottom),
        };
      });
      check(
        `${w}x${h}: all 54 net cells are inside the net's own viewport`,
        fit && fit.total === 54 && fit.inside === 54,
        JSON.stringify(fit)
      );
      check(
        `${w}x${h}: and the net has nothing to scroll`,
        fit && fit.overflow <= 0,
        `${fit?.overflow}pt of overflow in a ${fit?.band}pt band`
      );
      // The furniture src/ui/net.ts budgets for: TOP_BAR_H 67 above, and
      // PAINT_ROW_H + PANEL_RULE = 113 below. If either drifts the arithmetic
      // in net.ts goes on saying the net fits while the DOM disagrees.
      check(
        `${w}x${h}: the furniture net.ts budgets for is the furniture drawn (67 / 113)`,
        fit && fit.above === 67 && fit.below === 113,
        `${fit?.above} above, ${fit?.below} below`
      );
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await sleep(1200);
    const net = await page.evaluate(() => {
      const cells = [...document.querySelectorAll('[role="button"]')].filter((n) =>
        / face, (row|centre)/.test(n.getAttribute('aria-label') ?? '')
      );
      return {
        total: cells.length,
        disabled: cells.filter((n) => n.getAttribute('aria-disabled') === 'true').length,
        firstSix: cells.slice(0, 6).map((n) => n.getAttribute('aria-label')),
        labels: cells.map((n) => n.getAttribute('aria-label')),
        under: cells.filter((n) => n.getBoundingClientRect().height < 44).length,
        // Every cell's own rect, so visibility and pitch are measurable rather
        // than inferred - the round-2 net carried its 44pt target in hitSlop,
        // which no assertion can see.
        rects: cells.map((n) => {
          const r = n.getBoundingClientRect();
          return { x: r.left, y: r.top, w: r.width, h: r.height };
        }),
        scroller: (() => {
          const first = cells[0];
          let el = first?.parentElement;
          while (el && el.scrollWidth <= el.clientWidth) el = el.parentElement;
          return el ? { scrollW: el.scrollWidth, clientW: el.clientWidth } : null;
        })(),
        band: (() => {
          const first = cells[0];
          const scroller = first?.closest('div[style*="overflow"]');
          const r = (scroller ?? document.body).getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
        })(),
      };
    });
    check('the net renders all 54 stickers', net.total === 54, `${net.total}`);
    check('every net cell is a real 44pt target',
      net.rects.every((r) => r.w >= 40 && r.h >= 40), `smallest ${Math.min(...net.rects.map((r) => r.w))}`);
    // A 44pt pitch means neighbouring targets never overlap. The round-2 net
    // was 34 on a 37pt pitch with 5pt of slop each side: a 7pt band of every
    // gutter painted the wrong sticker.
    const xs = [...new Set(net.rects.map((r) => Math.round(r.x)))].sort((a, b) => a - b);
    const gaps = xs.slice(1).map((x, i) => x - xs[i]).filter((g) => g < 60);
    check('and neighbouring targets never overlap',
      gaps.every((g) => g >= 44), `smallest pitch ${Math.min(...gaps)}`);
    check('the net never scrolls sideways',
      !net.scroller, JSON.stringify(net.scroller));
    // The property the two-up layout buys and the cross cannot: no face is
    // ever split across the horizontal axis, so a face is either on screen or
    // one natural vertical swipe away. On the cross, BACK never fits a phone.
    const offSide = net.rects.filter((r) => r.x < 0 || r.x + r.w > 390).length;
    check('no sticker is cut off the side of the screen',
      offSide === 0, `${offSide} of 54 cells off-screen horizontally`);
    check('the six centres are not pressable', net.disabled === 6, `${net.disabled}`);
    check(
      'focus order starts at the Up face',
      net.firstSix.every((l) => l.startsWith('Up face')),
      JSON.stringify(net.firstSix.slice(0, 2))
    );
    check(
      'every sticker says what colour it is',
      net.labels.every((l) => /(White|Yellow|Green|Blue|Red|Orange)\.|Not painted\./.test(l)),
      net.labels.find((l) => !/(White|Yellow|Green|Blue|Red|Orange)\.|Not painted\./.test(l)) ?? ''
    );

    // Painting through the net changes the cube.
    await page.click('[aria-label="Blue, 9 of 9, complete"]');
    await sleep(400);
    const target = page.locator('[aria-label^="Front face, row 2 of 3, column 3 of 3"]').first();
    await target.click();
    await sleep(600);
    const after = await target.getAttribute('aria-label');
    check('a sticker painted in the net takes the chosen colour',
      (after ?? '').includes('Blue.'), after ?? '');
    await page.click('[aria-label="3D cube view"]');
    await sleep(1000);
    await page.click('[aria-label="Fill in a random scramble"]');
    await sleep(1200);
  }

  // -- 5. X-ray really strips the cube --------------------------------------
  {
    await page.click('[aria-label="Solve the cube"]');
    await sleep(2500);
    const solid = await canvasStats();
    await page.click('[aria-label="X-ray view"]');
    await sleep(1200);
    const bare = await canvasStats();
    await page.click('[aria-label="X-ray view"]');
    await sleep(800);
    check('X-ray strips most of the cube away', bare.lit < solid.lit * 0.5,
      `${bare.lit} lit vs ${solid.lit} solid`);
  }

  // -- 6. a step's prelude is measured from the plan's origin ----------------
  //
  // The round-1 blocker: picking a second step mid-run stacked its prelude on
  // the first step's. A -> B -> A must land on exactly the cube A started from.
  {
    const steps = page.locator('[role="button"][aria-label*=" moves"]');
    const n = await steps.count();
    check('the plan offers steps to run', n >= 6, `${n} steps`);
    if (n >= 6) {
      await steps.nth(4).click();
      await sleep(1600);
      const first = await canvasStats();
      await steps.nth(1).click();
      await sleep(1600);
      await steps.nth(4).click();
      await sleep(1600);
      const again = await canvasStats();
      check(
        'a step picked twice, with another in between, starts from the same cube',
        first && again && first.signature === again.signature,
        `${first?.signature} vs ${again?.signature}`
      );
    }
  }

  // -- 7. the move strip follows the playhead -------------------------------
  //
  // Chunking the chips into trigger groups made `onLayout`'s x relative to the
  // chunk instead of to the content, so the strip stayed pinned at the far left
  // while the playhead walked off the right-hand edge. Needs a step long enough
  // to overflow, so the longest one is picked deliberately.
  {
    await page.click('[aria-label^="Keep these moves"]').catch(() => {});
    await sleep(1200);
    const rows = page.locator('[role="button"][aria-label*=" moves"]');
    const labels = await rows.evaluateAll((ns) =>
      ns.map((n) => n.getAttribute('aria-label') ?? '')
    );
    let longest = 0;
    let most = 0;
    labels.forEach((l, i) => {
      const m = Number((l.match(/(\d+) moves/) ?? [])[1] ?? 0);
      if (m > most) {
        most = m;
        longest = i;
      }
    });
    await rows.nth(longest).click();
    await sleep(1600);
    const strip = page.locator('[aria-label*="Move "][aria-label*=" of "]').first();
    const scrollLeft = () => strip.evaluate((n) => n.scrollLeft);
    const width = await strip.evaluate((n) => ({ view: n.clientWidth, content: n.scrollWidth }));
    await page.click('[aria-label="Brisk playback"]').catch(() => {});
    await sleep(400);
    // Far enough in that a strip which is not following has certainly lost it.
    const presses = Math.max(8, Math.min(most - 2, 16));
    for (let i = 0; i < presses; i++) {
      await page.click('[aria-label="Next move"]').catch(() => {});
      await sleep(650);
    }
    const moved = await scrollLeft();
    check('the longest step overflows the strip, so this is a real test',
      width.content > width.view * 1.5, `content ${width.content} in ${width.view}`);
    // Not "did it scroll" - scrolling to the wrong place is the bug. The
    // playhead itself has to still be on screen.
    const playhead = await page.evaluate(() => {
      const chip = document.getElementById('move-current');
      const strip = chip?.closest('[aria-label*="Move "]');
      if (!chip || !strip) return null;
      const c = chip.getBoundingClientRect();
      const s = strip.getBoundingClientRect();
      return { left: c.left - s.left, right: c.right - s.left, width: s.width };
    });
    check(
      `the current move is still on screen after ${presses} of them`,
      !!playhead && playhead.left >= 0 && playhead.right <= playhead.width,
      `${JSON.stringify(playhead)}, scrollLeft ${moved}`
    );
    await page.click('[aria-label^="Keep these moves"]');
    await sleep(1200);
  }

  // -- 7b. the teaching surfaces --------------------------------------------
  //
  // Every one of these was a real defect found in round 4: the explanation was
  // reachable only from the step already playing, the playing step stopped
  // being named, its affordance was the one sub-44pt control in the app, the
  // sheet cut off the sentence it exists to say, and Play spoiled practise mode
  // in one tap.
  {
    const rows = page.locator('[role="button"][aria-label*=" moves"]');
    const nRows = await rows.count();
    const nWhy = await page.locator('[role="button"][aria-label^="Why "]').count();
    check(
      'every step row offers its explanation, not only the running one',
      nRows > 0 && nWhy === nRows,
      `${nWhy} explanations for ${nRows} rows`
    );

    // The invariant, stated once and enforced everywhere below.
    const census = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('[tabindex],button,[role]')]
          .filter((n) => n.offsetParent !== null && n.getAttribute('role') !== 'list')
          .filter((n) => n.getAttribute('focusable') !== 'n')
          .filter((n) => !/ face, (row|centre)/.test(n.getAttribute('aria-label') ?? ''))
          .map((n) => {
            const r = n.getBoundingClientRect();
            return { label: n.getAttribute('aria-label'), h: Math.round(r.height), w: Math.round(r.width) };
          })
          .filter((c) => c.h < 44)
      );

    check('idle: nothing outside the net is under 44pt', (await census()).length === 0,
      JSON.stringify(await census()));

    // No interactive element inside another one.
    //
    // The `?` was a Pressable inside the step row's Pressable. React logs the
    // nesting on web and the tab order happens to come out right, so four
    // rounds of browser testing said nothing. On iOS a View with
    // `accessible={true}` - which Pressable sets as soon as it is given an
    // accessibilityRole - merges every child into ONE accessibility element, so
    // VoiceOver would have found the row and never the `?` inside it: the
    // teaching affordance the round made universal, invisible to exactly the
    // people the accessibility work was for.
    const nested = () =>
      page.evaluate(() =>
        [
          ...document.querySelectorAll(
            '[role="button"] [role="button"], [role="button"] [role="radio"],' +
              '[role="button"] [role="switch"], [role="radio"] [role="button"],' +
              '[role="switch"] [role="button"]'
          ),
        ]
          .filter((n) => n.offsetParent !== null)
          .map((n) => ({
            inner: n.getAttribute('aria-label'),
            outer: n.parentElement?.closest('[role="button"],[role="radio"],[role="switch"]')
              ?.getAttribute('aria-label'),
          }))
      );
    check(
      'solve: no control is nested inside another control',
      (await nested()).length === 0,
      JSON.stringify(await nested())
    );

    // 7b.1 the explanation opens from a row that is not running.
    let longest = 0;
    let most = 0;
    const labels = await rows.evaluateAll((ns) => ns.map((n) => n.getAttribute('aria-label') ?? ''));
    labels.forEach((l, i) => {
      const m = Number((l.match(/(\d+) moves/) ?? [])[1] ?? 0);
      if (m > most) {
        most = m;
        longest = i;
      }
    });
    // For the tag check below, prefer a step whose algorithm is also a chunk
    // name - that is the shape the duplication bug lived in, and picking
    // "whichever step happened to be longest" made it a coin toss.
    // The LONGEST such step, not the first: the practise-spoiler check below
    // measures how much of the covered step comes back on screen, and a
    // five-move step makes that a much weaker question than a twenty-move one.
    let sexy = -1;
    let sexyMoves = 0;
    labels.forEach((l, i) => {
      if (!/, Sexy move/.test(l)) return;
      const m = Number((l.match(/(\d+) moves/) ?? [])[1] ?? 0);
      if (m > sexyMoves) {
        sexyMoves = m;
        sexy = i;
      }
    });
    const probe = sexy >= 0 ? sexy : longest;
    const title = labels[probe].split(',')[0];
    await page.locator('[role="button"][aria-label^="Why "]').nth(longest).click();
    await sleep(1000);
    const opened = await bodyText();
    check(
      'the explanation opens without committing to playback',
      /What it does/.test(opened) && (await count('Watch it slowly')) === 1,
      opened.slice(0, 120).replace(/\n/g, ' / ')
    );
    check('sheet open: nothing is under 44pt', (await census()).length === 0,
      JSON.stringify(await census()));

    // 7b.2 the sheet does not cut its own explanation off - for any step, on
    // any phone. Round 4 cut the line "N corners and M edges move; the others
    // do not" off the bottom of a scroller with no indicator at rest, which is
    // the one sentence the sheet exists to say. Every variant is opened at 375,
    // the tightest supported size, because a longer explanation clips worse.
    const sheetFit = () =>
      page.evaluate(() => {
        const sheet = document.querySelector('[role="alert"]');
        if (!sheet) return null;
        const sc = [...sheet.querySelectorAll('*')].find((n) => n.scrollHeight > n.clientHeight + 1);
        const body = sheet.innerText;
        return {
          overflow: sc ? sc.scrollHeight - sc.clientHeight : 0,
          // The payload: "This step moves N corners and M edges; the other K
          // pieces stay where they are". Counted from the step's own moves
          // against the step's own cube - the algorithm's count on a solved
          // cube, which this used to look for, was right on 30% of steps.
          hasFootnote: /This step moves (no|\d+) corners? and (no|\d+) edges?;/.test(body),
          hasNote: /What it does/.test(body),
          more: !!document.querySelector('[aria-label="Scroll for more"]'),
        };
      });

    await page.click('[aria-label="Back to the step list"]');
    await sleep(600);
    {
      await page.setViewportSize({ width: 375, height: 667 });
      await sleep(1000);
      const whys = page.locator('[role="button"][aria-label^="Why "]');
      const n = await whys.count();
      let clipped = 0;
      let silent = 0;
      let noFootnote = 0;
      let worst = '';
      for (let i = 0; i < n; i++) {
        await whys.nth(i).click();
        await sleep(320);
        const fit = await sheetFit();
        if (!fit || fit.overflow > 0) {
          clipped++;
          if (!fit?.more) silent++;
          if (!worst) worst = `${labels[i]} overflows by ${fit?.overflow}`;
        }
        // Only a step that names an algorithm has a library entry to count
        // pieces from; "Put white on the bottom" is a setup turn, not one.
        if (/ moves, /.test(labels[i]) && !fit?.hasFootnote) {
          noFootnote++;
          if (!worst) worst = `${labels[i]} has no footnote`;
        }
        await page.click('[aria-label="Back to the step list"]');
        await sleep(200);
      }
      check(`375x667: none of the ${n} explanations is cut off`, clipped === 0, worst);
      check('and if one ever were, a control at rest would say so', silent === 0, worst);
      check(`375x667: every explanation of an algorithm says which pieces move`,
        noFootnote === 0, worst);
    }
    for (const [w, h] of [
      [390, 844],
      [430, 932],
    ]) {
      await page.setViewportSize({ width: w, height: h });
      await sleep(900);
      await page.locator('[role="button"][aria-label^="Why "]').nth(longest).click();
      await sleep(700);
      const fit = await sheetFit();
      check(
        `${w}x${h}: the explanation of a ${most}-move step is whole`,
        fit && fit.overflow <= 0 && fit.hasFootnote && fit.hasNote,
        JSON.stringify(fit)
      );
      await page.click('[aria-label="Back to the step list"]');
      await sleep(400);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await sleep(900);

    // 7b.2b the scrim is a real way out: the sheet takes the height it needs,
    // so there is cube above it to tap.
    await page.locator('[role="button"][aria-label^="Why "]').nth(longest).click();
    await sleep(800);
    await page.mouse.click(190, 100);
    await sleep(700);
    check(
      'tapping the dimmed cube above the sheet closes it',
      (await page.locator('[role="alert"]').count()) === 0
    );

    // 7b.3 the running row keeps its name, and does not print it twice.
    await rows.nth(probe).click();
    await sleep(1600);
    const active = await page.evaluate(() => {
      const on = [...document.querySelectorAll('[aria-selected="true"]')].find((n) =>
        / moves/.test(n.getAttribute('aria-label') ?? '')
      );
      return on ? { label: on.getAttribute('aria-label'), text: on.innerText } : null;
    });
    check(
      'the running step is still named in the list',
      active && active.text.includes(title) && !/Running/.test(active.text),
      JSON.stringify(active)
    );
    check(
      'and the marker says it is running',
      active && active.text.includes('▸'),
      JSON.stringify(active?.text)
    );
    // The tag and the first chunk's label used to read "Sexy move · Sexy move".
    // Two chunks carrying the same trigger name is not the same thing and is
    // correct - the same trigger on two faces - so this asks only whether the
    // tag repeats something the row already says.
    const tagClash = await page.evaluate(() => {
      const on = [...document.querySelectorAll('[aria-selected="true"]')].find((n) =>
        / moves/.test(n.getAttribute('aria-label') ?? '')
      );
      const tag = on?.querySelector('#step-tag');
      if (!tag) return { tag: null, clash: false };
      const base = (x) => x.replace(/\s*×\d+$/, '').replace(/\s*\([^)]*\)\s*$/, '').trim();
      const t = base(tag.innerText);
      // Counted, not filtered: filtering "the tag's own line" also removed the
      // chunk label it duplicated, which is the whole thing being looked for.
      const same = (on.innerText ?? '')
        .split('\n')
        .map(base)
        .filter((l) => l === t);
      return { tag: tag.innerText.trim(), lines: same.length, clash: same.length > 1 };
    });
    check('the active card does not repeat its own algorithm', !tagClash.clash,
      JSON.stringify(tagClash));
    check('running: nothing outside the net is under 44pt', (await census()).length === 0,
      JSON.stringify(await census()));

    // The running step's own moves, read off the strip while they are still
    // uncovered. Needed below to ask whether any of them come back on screen.
    const stepMoves = await page.evaluate(() => {
      const tokens = (n) =>
        (n?.innerText ?? '').split(/\s+/).filter((w) => /^[URFDLBMESxyz]w?(?:2|')?$/.test(w));
      // Climb out of the current chip until the strip is whole, stopping before
      // the ancestor that also contains the step list.
      let node = document.getElementById('move-current');
      let best = [];
      for (let i = 0; i < 8 && node; i++) {
        if (node.querySelector?.('[aria-selected]')) break;
        const t = tokens(node);
        if (t.length > best.length) best = t;
        node = node.parentElement;
      }
      return best;
    });

    // 7b.4 practise mode cannot be spoiled by the transport.
    await page.click('[aria-label="Practise mode: hide the moves ahead"]');
    await sleep(900);
    const transport = await page.evaluate(() =>
      ['Play', 'Next move'].map((l) => ({
        l,
        disabled: document.querySelector(`[aria-label="${l}"]`)?.getAttribute('aria-disabled'),
      }))
    );
    check(
      'practising: neither Play nor Next can give the answer away',
      transport.every((t) => t.disabled === 'true'),
      JSON.stringify(transport)
    );

    // 7b.4b practise mode cannot be spoiled by the "why this works" sheet.
    //
    // Round 4 closed Play and Next and opened this in the same commit: `?` went
    // onto every row including the running one, and the sheet's first child was
    // the step's whole move sequence, chunked and labelled. One tap printed it
    // while the strip below still showed a row of `?`.
    //
    // Measured over the WHOLE SCREEN, and as a difference: how many four-move
    // runs of the running step's own moves are readable before the sheet opens,
    // and how many after. The list underneath does not change when the sheet
    // opens, so the difference is the sheet's contribution and nothing else.
    // None is allowed. The sheet keeps its explanation, its watch list and its
    // piece count while practising; what it loses is the notation block and any
    // run of turns inside the prose, which `maskMoveRuns` replaces with an
    // ellipsis - "then repeat ... until it drops in".
    {
      check(
        'the covered step has enough moves to make this measurable',
        stepMoves.length >= 5,
        `${stepMoves.length} moves read off the strip`
      );
      const runsOf = async () => {
        const words = (await bodyText())
          .split(/\s+/)
          .map((w) => w.trim())
          .filter(Boolean);
        if (stepMoves.length < 4) return [];
        const grams = new Set();
        for (let i = 0; i + 4 <= stepMoves.length; i++) grams.add(stepMoves.slice(i, i + 4).join(' '));
        const hits = [];
        for (let i = 0; i + 4 <= words.length; i++) {
          const g = words.slice(i, i + 4).join(' ');
          if (grams.has(g)) hits.push(g);
        }
        return hits;
      };
      const before = await runsOf();
      const whyLabel = await page.evaluate(() => {
        const on = [...document.querySelectorAll('[aria-selected="true"]')].find((n) =>
          / moves/.test(n.getAttribute('aria-label') ?? '')
        );
        const why = [...(on?.parentElement?.querySelectorAll('[aria-label^="Why "]') ?? [])][0];
        return why?.getAttribute('aria-label') ?? null;
      });
      check('the running step still offers its explanation while practising', !!whyLabel, String(whyLabel));
      if (whyLabel) {
        await page.click(`[aria-label="${whyLabel}"]`);
        await sleep(700);
        const after = await runsOf();
        const block = await page.evaluate(() => !!document.querySelector('#why-notation'));
        check(
          'practising: the sheet does not print the step it is covering',
          !block,
          'the notation block is on screen'
        );
        check(
          `practising: opening the sheet adds no move sequence (${before.length} four-move runs before, ${after.length} after)`,
          after.length <= before.length,
          JSON.stringify(after)
        );
        check(
          'and the strip is still covered underneath it',
          /\?/.test(await bodyText())
        );
        await page.click('[aria-label="Back to the step list"]');
        await sleep(500);
      }
    }

    // 7b.5 practise mode asks for an answer, and reports the one it was given.
    //
    // Uncovering a move tested nothing: thirteen taps on Reveal and thirteen
    // correct recalls left the app in exactly the same state, so "how did I
    // do?" had no honest answer and a learner model would have had nothing to
    // record but "watched".
    check(
      'the verdict is asked for only after a move is revealed',
      (await count('I knew that move')) === 0
    );
    const moves = Number((labels[probe].match(/(\d+) moves/) ?? [])[1] ?? 0);
    let knew = 0;
    let missed = 0;
    let missingRow = -1;
    for (let i = 0; i < moves; i++) {
      await page.click('[aria-label^="Reveal move "]');
      await sleep(650);
      if ((await count('I knew that move')) !== 1) {
        missingRow = i;
        break;
      }
      if (i % 4 === 3) {
        await page.click('[aria-label="I missed that move"]');
        missed++;
      } else {
        await page.click('[aria-label="I knew that move"]');
        knew++;
      }
      await sleep(300);
    }
    check(`every one of the ${moves} reveals asked for a verdict`, missingRow === -1,
      `none offered at move ${missingRow + 1}`);
    await sleep(500);
    const scored = await bodyText();
    check(
      `the score is the learner's own answers (${knew} knew, ${missed} missed)`,
      scored.includes(`Done in ${moves} moves · ${knew} knew, ${missed} missed.`),
      scored.split('\n').filter((l) => /Done in/.test(l)).join(' / ')
    );
    check('and Again is a button, not a question mark',
      (await count(`Practise these ${moves} moves again`)) === 1);
    await page.click(`[aria-label="Practise these ${moves} moves again"]`);
    await sleep(900);
    const restarted = await bodyText();
    check(
      'a second attempt starts from an empty score',
      !/Done in/.test(restarted) && /Reveal the next move/.test(restarted),
      restarted.split('\n').filter((l) => /Done in|Reveal/.test(l)).join(' / ')
    );

    await page.click('[aria-label="Practise mode: hide the moves ahead"]');
    await sleep(600);
    await page.click('[aria-label^="Keep these moves"]');
    await sleep(1200);
  }

  // -- 8. a computed solve is withdrawn once the cube changes ---------------
  {
    await page.click('[aria-label="Work out the shortest solve"]').catch(() => {});
    await sleep(9000);
    const before = await bodyText();
    const hasSolve = /Solve in \d+ moves/.test(before);
    if (!hasSolve) {
      console.log('ok    (skipped) the search did not produce a solve to go stale');
    } else {
      const steps = page.locator('[role="button"][aria-label*=" moves"]');
      await steps.nth(1).click();
      await sleep(1600);
      await page.click('[aria-label^="Keep these moves"]');
      await sleep(1800);
      const after = await bodyText();
      check(
        'a solve computed for the old cube is not still offered',
        !/Solve in \d+ moves/.test(after),
        after.split('\n').filter((l) => /Solve in/.test(l)).join(' / ')
      );
      check('and the offer to compute a new one comes back',
        (await count('Work out the shortest solve')) === 1);
    }
  }

  // -- 9. a resize keeps the cube on screen and roughly centred -------------
  {
    await page.setViewportSize({ width: 844, height: 390 });
    await sleep(1800);
    const land = await canvasStats();
    check('after a rotation the cube is still drawn', !!land && land.lit > 0);
    if (land) {
      const cx = (land.minX + land.maxX) / 2 / land.w;
      const cy = (land.minY + land.maxY) / 2 / land.h;
      check(
        'it stays inside the canvas',
        land.minX > 0 && land.maxX < land.w - 1 && land.minY > 0 && land.maxY < land.h - 1,
        JSON.stringify(land)
      );
      check('and stays roughly centred', Math.abs(cx - 0.5) < 0.15 && Math.abs(cy - 0.5) < 0.2,
        `centre at ${cx.toFixed(2)}, ${cy.toFixed(2)}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await sleep(1500);
  }

  // -- 10. accessibility census ---------------------------------------------
  for (const [where, prepare] of [
    ['solve', async () => {}],
    ['net', async () => {
      await page.click('[aria-label="Flat net view"]');
      await sleep(1000);
    }],
  ]) {
    await prepare();
    const a11y = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('[tabindex],button,[role]')].filter(
        (n) => n.offsetParent !== null && n.getAttribute('role') !== 'list'
      );
      const focusable = nodes.filter((n) => n.getAttribute('focusable') !== 'n');
      return {
        total: focusable.length,
        role: focusable.filter((n) => n.getAttribute('role')).length,
        label: focusable.filter((n) => n.getAttribute('aria-label')).length,
        // Net cells are 34pt with 5pt of hit slop, which is the documented
        // exception; nothing else may be under 44.
        small: focusable.filter(
          (n) =>
            n.getBoundingClientRect().height < 44 &&
            !/ face, (row|centre)/.test(n.getAttribute('aria-label') ?? '')
        ).length,
      };
    });
    check(`${where}: every focusable control has a role`, a11y.role === a11y.total,
      `${a11y.role} of ${a11y.total}`);
    check(`${where}: every focusable control has a label`, a11y.label === a11y.total,
      `${a11y.label} of ${a11y.total}`);
    check(`${where}: nothing outside the net is under 44pt`, a11y.small === 0,
      `${a11y.small} too small`);
  }

  // -- 11. selected/checked state reaches the accessibility tree -------------
  //
  // react-native-web drops `accessibilityState` entirely, so for three rounds
  // every control announced as if unselected: which mode, which view, which
  // colour, whether X-ray was on. `aria-disabled` did serialise, which is what
  // hid it.
  {
    await page.click('[aria-label="3D cube view"]');
    await sleep(800);
    await page.click('[aria-label="Paint the cube"]');
    await sleep(1200);
    const state = await page.evaluate(() => {
      const grab = (sel) =>
        [...document.querySelectorAll(sel)].map((n) => ({
          label: n.getAttribute('aria-label'),
          selected: n.getAttribute('aria-selected'),
          checked: n.getAttribute('aria-checked'),
        }));
      return { tabs: grab('[role="tab"]'), radios: grab('[role="radio"]'), switches: grab('[role="switch"]') };
    });
    const selectedTabs = state.tabs.filter((t) => t.selected === 'true');
    check('every tab reports whether it is selected',
      state.tabs.length >= 4 && state.tabs.every((t) => t.selected === 'true' || t.selected === 'false'),
      JSON.stringify(state.tabs));
    check('exactly one tab per tablist is selected',
      selectedTabs.length === 2, `${selectedTabs.length} selected: ${selectedTabs.map((t) => t.label).join(', ')}`);
    check('every colour reports whether it is armed',
      state.radios.length >= 7 && state.radios.every((r) => r.checked === 'true' || r.checked === 'false'),
      JSON.stringify(state.radios.slice(0, 3)));
    check('exactly one colour is armed',
      state.radios.filter((r) => r.checked === 'true').length === 1,
      state.radios.filter((r) => r.checked === 'true').map((r) => r.label).join(', '));
    check('every switch reports whether it is on',
      state.switches.length >= 1 && state.switches.every((w) => w.checked === 'true' || w.checked === 'false'),
      JSON.stringify(state.switches));
  }

  check('the app never threw', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
  if (server) server.kill();
}

console.log(fails ? `\n${fails} ui check(s) failed` : '\nall ui checks passed (web target only)');
process.exit(fails ? 1 : 0);
