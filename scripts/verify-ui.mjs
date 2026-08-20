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
  }

  // -- 4. the flat net view -------------------------------------------------
  {
    await page.click('[aria-label="Flat net view"]');
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
        under: cells.filter((n) => n.getBoundingClientRect().height < 34).length,
      };
    });
    check('the net renders all 54 stickers', net.total === 54, `${net.total}`);
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

  check('the app never threw', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
  if (server) server.kill();
}

console.log(fails ? `\n${fails} ui check(s) failed` : '\nall ui checks passed (web target only)');
process.exit(fails ? 1 : 0);
