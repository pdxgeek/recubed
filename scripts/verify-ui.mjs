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
 * Requires playwright and the web preview deps, which are not installed by
 * default:
 *     npm i -D playwright react-dom react-native-web @expo/metro-runtime
 *     npx playwright install chromium
 *
 * Set RECUBED_CHROME to use a chromium binary playwright did not install.
 *
 * Point it at an already-running server with RECUBED_URL, otherwise it starts
 * `expo start --web` itself and shuts it down at the end.
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const URL = process.env.RECUBED_URL ?? 'http://localhost:8081';
const HEADLESS_GL = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'];

let fails = 0;
const check = (name, ok, extra = '') => {
  if (ok) console.log(`ok    ${name}`);
  else {
    fails++;
    console.log(`FAIL  ${name} ${extra}`);
  }
};

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.log('verify:ui needs playwright:  npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}

async function serverUp() {
  try {
    const res = await fetch(URL, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

let server = null;
if (!(await serverUp())) {
  console.log(`starting expo web at ${URL} ...`);
  server = spawn('npx', ['expo', 'start', '--web', '--port', new global.URL(URL).port || '8081'], {
    env: { ...process.env, CI: '1', BROWSER: 'none' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 90 && !(await serverUp()); i++) await sleep(2000);
  if (!(await serverUp())) {
    console.log('FAIL  could not start the dev server');
    server.kill();
    process.exit(1);
  }
}

// Some environments ship a prebuilt chromium outside playwright's cache.
const executablePath = process.env.RECUBED_CHROME || undefined;
const browser = await chromium.launch({ args: HEADLESS_GL, executablePath });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));

const canvasStats = async () => {
  const box = await page.locator('canvas').boundingBox();
  const shot = await page.screenshot({ clip: box });
  // Count how much of the canvas is painted rather than background, and where.
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
          let minX = w;
          let maxX = 0;
          let minY = h;
          let maxY = 0;
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const i = (y * w + x) * 4;
              // Anything clearly brighter than the near-black clear colour.
              if (d[i] + d[i + 1] + d[i + 2] > 150) {
                lit++;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
              }
            }
          }
          resolve({ lit, total: w * h, minX, maxX, minY, maxY, w, h });
        };
        img.src = `data:image/png;base64,${b64}`;
      }),
    [shot.toString('base64'), Math.round(box.width), Math.round(box.height)]
  );
};

try {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await page.waitForSelector('text=Paint the stickers', { timeout: 240000 });
  await sleep(3000);

  // -- 1. a scrambled cube, then X-ray really strips it ----------------------
  await page.click('[aria-label="Fill in a random scramble"]');
  await sleep(1500);
  await page.click('[aria-label="Solve the cube"]');
  await sleep(2500);

  const solid = await canvasStats();
  await page.click('[aria-label="X-ray view"]');
  await sleep(1200);
  const bare = await canvasStats();
  await page.click('[aria-label="X-ray view"]');
  await sleep(800);

  check(
    'X-ray strips most of the cube away',
    bare.lit < solid.lit * 0.5,
    `${bare.lit} lit vs ${solid.lit} solid`
  );

  // -- 2. the selection survives the cube being turned --------------------
  //
  // The headline bug: the selection was a coordinate, so playing a step slid
  // the pieces out from under the rings and the card silently renamed itself.
  const box = await page.locator('canvas').boundingBox();
  for (const [fx, fy] of [
    [0.34, 0.52],
    [0.62, 0.5],
    [0.4, 0.38],
    [0.66, 0.62],
  ]) {
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    await sleep(700);
    if (await page.locator('[aria-label^="Clear selection:"]').count()) break;
  }
  const named = async () => {
    const label = await page
      .locator('[aria-label^="Clear selection:"]')
      .first()
      .getAttribute('aria-label')
      .catch(() => null);
    return label ? label.replace('Clear selection: ', '') : null;
  };
  const before = await named();
  if (!before) {
    check('a tap on the cube selects a piece', false, 'nothing was selected');
  } else {
    // Run a step - any step - which applies its whole prelude at once and
    // restarts piece tracking, then commit it.
    const steps = page.locator('[role="button"][aria-label*=" moves"]');
    const count = await steps.count();
    check('the plan offers steps to run', count > 0, `${count} steps`);
    if (count > 0) {
      await steps.nth(Math.min(2, count - 1)).click();
      await sleep(1500);
      await page.click('[aria-label^="Keep these moves"]');
      await sleep(1200);
      const after = await named();
      check(
        'the selection still names the same piece after a step has run',
        after === before,
        `was "${before}", now "${after}"`
      );
    }
  }

  // -- 3. a resize keeps the cube on screen and roughly centred --------------
  await page.setViewportSize({ width: 844, height: 390 });
  await sleep(1500);
  const land = await canvasStats();
  const cx = (land.minX + land.maxX) / 2 / land.w;
  const cy = (land.minY + land.maxY) / 2 / land.h;
  check(
    'after a rotation the cube stays inside the canvas',
    land.minX > 0 && land.maxX < land.w - 1 && land.minY > 0 && land.maxY < land.h - 1,
    JSON.stringify(land)
  );
  check(
    'and stays roughly centred',
    Math.abs(cx - 0.5) < 0.15 && Math.abs(cy - 0.5) < 0.2,
    `centre at ${cx.toFixed(2)}, ${cy.toFixed(2)}`
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await sleep(1200);

  // -- 4. accessibility census ----------------------------------------------
  const a11y = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('[tabindex],button,[role]')].filter(
      (n) => n.offsetParent !== null
    );
    return {
      total: nodes.length,
      role: nodes.filter((n) => n.getAttribute('role')).length,
      label: nodes.filter((n) => n.getAttribute('aria-label')).length,
      small: nodes.filter((n) => n.getBoundingClientRect().height < 44).length,
    };
  });
  check(
    'every focusable control has a role',
    a11y.role === a11y.total,
    `${a11y.role} of ${a11y.total}`
  );
  check(
    'nearly all of them carry a label',
    a11y.label >= a11y.total - 2,
    `${a11y.label} of ${a11y.total}`
  );
  check('no control is under 44pt tall', a11y.small === 0, `${a11y.small} too small`);

  // -- 5. the colour picker shows all six colours without scrolling ----------
  await page.click('[aria-label="Paint the cube"]');
  await sleep(1200);
  const swatches = await page.evaluate(() => {
    const out = [];
    for (const n of document.querySelectorAll('[role="radio"]')) {
      const r = n.getBoundingClientRect();
      out.push({
        label: n.getAttribute('aria-label'),
        inView: r.top >= 0 && r.bottom <= window.innerHeight,
        h: Math.round(r.height),
      });
    }
    return out;
  });
  const colours = swatches.filter((s) => /of 9/.test(s.label ?? ''));
  check('all six colours are on screen at once', colours.length === 6 && colours.every((c) => c.inView), JSON.stringify(colours));

  check('the app never threw', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
  if (server) server.kill();
}

console.log(fails ? `\n${fails} ui check(s) failed` : '\nall ui checks passed (web target only)');
process.exit(fails ? 1 : 0);
