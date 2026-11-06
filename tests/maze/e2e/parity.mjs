// Phase 0: the A/B parity harness.
//
// Starts the LEGACY app (legacy/mazeV3) and the unified Vite/React app plus Maze WebSocket server side by side, drives both
// with exactly the same scripted session in real Chromium (seeded Math.random, fake clock for timers / rAF /
// Date / performance.now, animations frozen) and compares, after every step:
//   · the rendered page (PNG, pixel for pixel)        · every <canvas> (hash of its pixels)
//   · the DOM of <body> (normalised URLs only)        · localStorage
//   · for the online scenario: every WebSocket frame the page sends (exact) and receives (normalised).
//
//   node --import tsx e2e/parity.mjs            legacy  vs  new
//   node --import tsx e2e/parity.mjs --self     legacy  vs  legacy   (the harness must find ZERO differences)
//   node --import tsx e2e/parity.mjs --mutate      legacy  vs  new with one deliberate 1-px CSS change   (must be caught)
//   node --import tsx e2e/parity.mjs --mutate-js   legacy  vs  new with one deliberate logic change (zoom step 1.25 → 1.26)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import WebSocket from 'ws';
import { generateMazeData } from '@maze/shared';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const E2E_DIR = path.join(root, 'tests', 'maze', 'e2e');
const OUT = path.join(E2E_DIR, 'out');
const args = new Set(process.argv.slice(2));
const MUTATE = args.has('--mutate-js') ? 'js' : args.has('--mutate') ? 'css' : null;
const MODE = args.has('--self') ? 'self' : MUTATE ? 'mutate' : 'ab';
const only = process.argv.slice(2).find(a => a.startsWith('--only='))?.slice(7);
const NOISE_FLOOR = 0; // strict: legacy-vs-legacy needs no tolerance at all (see --self)
let noise = 0;
let sharp = null;
for (const where of ['sharp', '/opt/npm-tools/node_modules/sharp']) { try { sharp = createRequire(import.meta.url)(where); break; } catch { /* optional: only used to describe a mismatch */ } }

/* ── servers ─────────────────────────────────────────────────────────── */
const ENV = { MAZE_LOBBY_FLUSH_MS: '40', MAZE_HEARTBEAT_MS: '60000' };
function startServer(script) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['--require', path.join(E2E_DIR, 'seed-server.cjs'), script], { env: { ...process.env, MAZE_PORT: '0', ...ENV }, stdio: ['ignore', 'pipe', 'pipe'], cwd: path.dirname(script) });
        let out = '';
        const timer = setTimeout(() => { child.kill(); reject(new Error('server did not start:\n' + out)); }, 8000);
        child.stdout.on('data', chunk => {
            out += chunk;
            const m = /listening on port (\d+)/.exec(out);
            if (m) { clearTimeout(timer); resolve({ port: Number(m[1]), kill: () => child.kill('SIGKILL') }); }
        });
        child.stderr.on('data', c => { out += c; });
    });
}
const SIDES = {
    legacy: () => startServer(path.join(root, 'legacy/mazeV3/server/server.js')),
    new: () => startServer(path.join(root, 'dist/maze-server/server.cjs'))
};

/* ── deterministic page ──────────────────────────────────────────────── */
const SEED = `(() => { let s = 0x9E3779B9; Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();`;
// A virtual clock that only moves when the harness calls window.__advance(ms), and then moves SYNCHRONOUSLY: all timers and
// animation frames due in that span run back to back in one task, so no real-time event (ResizeObserver, animationend,
// a WebSocket message…) can slip into the middle of an advance. (Playwright's own page.clock yields to the event loop
// between callbacks, which is exactly what made repeated runs disagree.)
const CLOCK = `(() => {
  const EPOCH = Date.UTC(2026, 0, 1, 12, 0, 0);
  let now = 1000, nextId = 1, nextRaf = 1;
  const timers = new Map(), rafs = new Map();
  const RealDate = Date;
  class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(EPOCH + now); else super(...a); } static now() { return EPOCH + now; } }
  window.Date = FakeDate;
  performance.now = () => now;
  window.requestAnimationFrame = cb => { const id = nextRaf++; rafs.set(id, cb); return id; };
  window.cancelAnimationFrame = id => { rafs.delete(id); };
  const add = (fn, ms, args, every) => { const id = nextId++; ms = Math.max(0, Number(ms) || 0); timers.set(id, { at: now + ms, seq: id, fn, args, every: every ? Math.max(1, ms) : 0 }); return id; };
  window.setTimeout = (fn, ms, ...args) => add(fn, ms, args, false);
  window.setInterval = (fn, ms, ...args) => add(fn, ms, args, true);
  window.clearTimeout = window.clearInterval = id => { timers.delete(id); };
  window.__advance = ms => {
    const end = now + ms;
    for (;;) {
      let t = end, due = null;
      for (const tm of timers.values()) if (tm.at <= t && (!due || tm.at < due.at || (tm.at === due.at && tm.seq < due.seq))) { due = tm; t = tm.at; }
      const frameAt = (Math.floor(now / 16) + 1) * 16;
      if (rafs.size && frameAt <= t && (!due || frameAt < due.at)) {
        now = frameAt; const list = [...rafs]; rafs.clear();
        for (const [, cb] of list) { try { cb(now); } catch (e) { setTimeout.call(window, () => { throw e; }, 0); } }
        continue;
      }
      if (!due) break;
      now = due.at;
      if (due.every) { due.at = now + due.every; due.seq = nextId++; } else timers.delete([...timers].find(([, v]) => v === due)[0]);
      try { due.fn(...due.args); } catch (e) { console.error(e); }
    }
    now = end;
  };
})();`;
const norm = s => s.replace(/ ?\bis-(shining|bump)\b/g, '').replace(/<i class="cg-spark"[^>]*><\/i>/g, '').replace(/class="\s*"/g, '')
    .replace(/https?:\/\/(localhost|127\.0\.0\.1):\d+/g, 'HOST').replace(/(?:[\w./-]*\/)?images\/([\w-]+\.svg)/g, 'IMG/$1').replace(/ws:\/\/(localhost|127\.0\.0\.1):\d+/g, 'WS');
const sha = b => crypto.createHash('sha1').update(b).digest('hex').slice(0, 12);

async function openPage(browser, side, port, { mobile = false, mutate = false } = {}) {
    const context = await browser.newContext(mobile
        ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
        : { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const frames = { sent: [], received: [] };
    page.on('websocket', ws => {
        ws.on('framesent', f => frames.sent.push(String(f.payload)));
        ws.on('framereceived', f => frames.received.push(String(f.payload)));
    });
    page.on('pageerror', e => (frames.errors ??= []).push(String(e.message)));
    page.on('console', m => { if (m.type() === 'error') (frames.errors ??= []).push('console: ' + m.text()); });
    if (mutate === 'js') {
        // One deliberate LOGIC difference: the zoom step changes from 1.25 to 1.26.
        await page.route('**/*.js', async route => {
            const res = await route.fetch(); const body = await res.text();
            // the bundle is minified: ZOOM_MIN=1, ZOOM_MAX=5, ZOOM_STEP=1.25 appears as `x=1,y=5,z=1.25`
            const re = /(\w+=1,\w+=5,\w+=)1\.25,/;
            if (!re.test(body)) throw new Error('mutation anchor not found');
            await route.fulfill({ response: res, body: body.replace(re, '$11.26,') });
        });
    }
    if (mutate === 'css') {
        // One deliberate difference, to prove the harness notices it: a 1-px margin on a HUD element.
        await page.route('**/*.css', async route => {
            const res = await route.fetch(); const body = await res.text();
            await route.fulfill({ response: res, body: body + '\n#hudSteps{margin-left:1px}' });
        });
    }
    await page.addInitScript(CLOCK);
    await page.addInitScript(SEED);
    const pagePath = side === 'legacy' ? '/' : '/maze.html';
    await page.goto(`http://localhost:${port}${pagePath}`, { waitUntil: 'load' });
    const h = { page, context, frames };
    await tick(h, 1500);
    return h;
}
// Real-clock events (ResizeObserver, IntersectionObserver, animationend…) must have been delivered BEFORE the fake clock
// moves on, otherwise they land in a different frame from run to run. So: let real time pass first, then advance the fake one.
const tick = async (h, ms = 600) => { await h.page.waitForTimeout(60); await h.page.evaluate(n => window.__advance(n), ms); };
const reseed = h => h.page.evaluate(SEED);

/* ── what is captured after every step ───────────────────────────────── */
async function snap(h, label, { mask = [] } = {}) {
    const { page } = h;
    // A fixed amount of fake time (never a data-dependent amount: some canvases animate forever, and a varying
    // number of ticks would shift their phase between the two runs).
    await tick(h, 34);
    await page.waitForTimeout(600);   // CSS transitions/animations run on the real clock, not the fake one: let them finish
    const info = await page.evaluate(() => {
        const body = document.body.cloneNode(true);
        body.querySelectorAll('script').forEach(n => n.remove());
        let ls = {}; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); ls[k] = localStorage.getItem(k); } } catch (_) { ls = { error: true }; }
        return {
            dom: body.outerHTML,
            ls,
            canvases: [...document.querySelectorAll('canvas')].filter(c => c.checkVisibility({ checkVisibilityCSS: true })).map(c => ({ id: c.id || c.className, w: c.width, h: c.height, url: c.toDataURL() }))
        };
    });
    // The compositor is asynchronous: accept a screenshot only once two consecutive ones are identical.
    const shoot = () => page.screenshot({ animations: 'disabled', caret: 'hide', mask: mask.map(s => page.locator(s)) });
    let png = await shoot();
    for (let i = 0; i < 8; i++) { await page.waitForTimeout(150); const again = await shoot(); if (again.equals(png)) break; png = again; }
    return {
        label,
        dom: norm(info.dom),
        ls: norm(JSON.stringify(info.ls)),
        canvases: info.canvases.map(c => `${c.id}:${c.w}x${c.h}:${sha(c.url)}`).join(' | '),
        png
    };
}

/* ── scenarios ───────────────────────────────────────────────────────── */
const click = async (h, sel) => { await reseed(h); await h.page.locator(sel).click(); await tick(h, 900); };
async function holdLaunch(h) {
    const box = await h.page.locator('#cgLaunch').boundingBox();
    await reseed(h);
    await h.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await h.page.mouse.down();
    await tick(h, 1300);
    await h.page.mouse.up();
    await tick(h, 2500);
}
const KEYS = ['ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowRight', 'ArrowDown', 'KeyD', 'KeyS', 'KeyA', 'KeyW', 'ArrowRight', 'ArrowDown'];
async function play(h, shots, tag, rounds = 3) {
    for (let r = 0; r < rounds; r++) {
        for (const key of KEYS) { await reseed(h); await h.page.keyboard.press(key); await tick(h, 140); }
        await tick(h, 800);
        shots.push(await snap(h, `${tag}: after ${KEYS.length * (r + 1)} keys`));
    }
}

const SCENARIOS = {
    async wizard(browser, side, port, opts) {
        const shots = [];
        for (const mobile of [false, true]) {
            const h = await openPage(browser, side, port, { ...opts, mobile });
            const tag = mobile ? 'mobile' : 'desktop';
            shots.push(await snap(h, `${tag}: first paint`));
            await click(h, '#cgNext'); shots.push(await snap(h, `${tag}: step 2 (racers)`));
            await click(h, '#cgPlayersPlus'); shots.push(await snap(h, `${tag}: racers +1`));
            await click(h, '#cgPlayersMinus'); shots.push(await snap(h, `${tag}: racers -1`));
            await click(h, '#cgNext'); shots.push(await snap(h, `${tag}: step 3 (targets)`));
            await click(h, '#cgNext'); shots.push(await snap(h, `${tag}: step 4 (launch)`));
            await click(h, '#cgBack'); shots.push(await snap(h, `${tag}: back`));
            for (const theme of await h.page.$$eval('.theme-option', els => els.map(e => e.dataset.theme))) {
                await reseed(h);
                await h.page.evaluate(t => document.querySelector(`.theme-option[data-theme="${t}"]`).click(), theme);
                await tick(h, 700);
                shots.push(await snap(h, `${tag}: theme ${theme}`));
            }
            await click(h, '#tabRooms'); shots.push(await snap(h, `${tag}: rooms tab (offline view)`));
            await h.context.close();
        }
        return { shots };
    },
    async solo(browser, side, port, opts) {
        const shots = [];
        for (const mobile of [false, true]) {
            const h = await openPage(browser, side, port, { ...opts, mobile });
            const tag = `solo ${mobile ? 'mobile' : 'desktop'}`;
            for (let i = 0; i < 3; i++) await click(h, '#cgNext');
            await holdLaunch(h);
            shots.push(await snap(h, `${tag}: game started`));
            await play(h, shots, tag, 2);
            for (const key of ['Equal', 'Equal', 'Minus', 'Digit0', 'KeyF', 'KeyH', 'KeyC', 'KeyF']) {
                await reseed(h); await h.page.keyboard.press(key); await tick(h, 500);
                shots.push(await snap(h, `${tag}: key ${key}`));
            }
            await h.page.keyboard.press('KeyN').catch(() => { }); await tick(h, 600);
            shots.push(await snap(h, `${tag}: key N (new maze dialog?)`));
            await h.page.evaluate(() => dispatchEvent(new Event('pagehide'))); await tick(h, 300);
            await h.page.reload({ waitUntil: 'load' }); await tick(h, 2000);
            shots.push(await snap(h, `${tag}: after reload (saved game restore)`));
            await h.context.close();
        }
        return { shots };
    },
    async online(browser, side, port, opts) {
        const shots = [];
        const h = await openPage(browser, side, port, opts);
        await click(h, '#cgNext'); await click(h, '#cgPlayersPlus');             // 2 racers → online
        await click(h, '#cgNext'); await click(h, '#cgNext');
        await holdLaunch(h);
        await h.page.waitForTimeout(400); await tick(h, 1200);
        const MASK = ['.lb-code-tag', '#raceRoomCode', '#hudTime', '#lbToast'];
        shots.push(await snap(h, 'online: waiting room', { mask: MASK }));
        // A second player (a plain WebSocket bot) takes the free seat with the same set-up.
        const bot = new WebSocket(`ws://localhost:${port}`);
        await new Promise(r => bot.on('open', r));
        const setup = JSON.parse(h.frames.sent.filter(m => /room:(quick|create)/.test(m)).at(-1) || '{}');
        bot.send(JSON.stringify({ type: 'room:quick', size: setup.size, players: setup.players, goals: setup.goals, name: 'Bot', separate: setup.separate }));
        await h.page.waitForTimeout(500); await tick(h, 2500);
        await h.page.waitForTimeout(500); await tick(h, 2500);
        shots.push(await snap(h, 'online: race started', { mask: MASK }));
        for (let r = 0; r < 2; r++) {
            for (const key of KEYS) { await h.page.keyboard.press(key); await h.page.waitForTimeout(25); await tick(h, 120); }
            await h.page.waitForTimeout(300); await tick(h, 800);
            shots.push(await snap(h, `online: after ${KEYS.length * (r + 1)} keys`, { mask: MASK }));
        }
        bot.close(); await h.page.waitForTimeout(300); await tick(h, 1500);
        shots.push(await snap(h, 'online: opponent left', { mask: MASK }));
        const wsView = list => list.map(s => { try { const m = JSON.parse(s); return m.type + ':' + Object.keys(m).sort().join(','); } catch { return 'raw:' + s.length; } });
        const sentExact = h.frames.sent.map(norm);
        await h.context.close();
        return { shots, extra: { 'client→server frames (exact)': sentExact, 'server→client frame shapes': wsView(h.frames.received), 'page errors': h.frames.errors || [] } };
    }
};

/* ── compare ─────────────────────────────────────────────────────────── */
async function pixelDiff(a, b) {
    if (!sharp) return null;
    const [x, y] = await Promise.all([sharp(a).ensureAlpha().raw().toBuffer({ resolveWithObject: true }), sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true })]);
    if (x.info.width !== y.info.width || x.info.height !== y.info.height) return { n: Infinity, max: 255, text: 'size differs' };
    let n = 0, max = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; const W = x.info.width;
    for (let i = 0; i < x.data.length; i += 4) {
        const d = Math.max(Math.abs(x.data[i] - y.data[i]), Math.abs(x.data[i + 1] - y.data[i + 1]), Math.abs(x.data[i + 2] - y.data[i + 2]));
        if (d) { n++; max = Math.max(max, d); const p = i / 4, px = p % W, py = (p / W) | 0; x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py); }
    }
    return { n, max, text: `${n} px, largest channel difference ${max}/255, in box x ${x0}-${x1}, y ${y0}-${y1}` };
}
function firstDiff(a, b) { let i = 0; while (i < a.length && a[i] === b[i]) i++; return `…${a.slice(Math.max(0, i - 60), i + 90)}\n      vs\n      …${b.slice(Math.max(0, i - 60), i + 90)}`; }

async function main() {
    fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
    const sideA = 'legacy', sideB = MODE === 'self' ? 'legacy' : 'new';
    const [A, B] = [await SIDES[sideA](), await SIDES[sideB]()];
    const browser = await chromium.launch();
    let totalSteps = 0, bad = 0; const lines = [];
    try {
        for (const [name, fn] of Object.entries(SCENARIOS)) {
            if (only && name !== only) continue;
            const a = await fn(browser, sideA, A.port, {});
            const b = await fn(browser, sideB, B.port, { mutate: MUTATE });
            const n = Math.max(a.shots.length, b.shots.length);
            let scenarioBad = 0;
            for (let i = 0; i < n; i++) {
                const x = a.shots[i], y = b.shots[i]; totalSteps++;
                if (!x || !y) { scenarioBad++; lines.push(`  ✖ [${name}] step ${i + 1} exists on one side only`); continue; }
                const problems = [];
                if (x.dom !== y.dom) problems.push('DOM differs:\n      ' + firstDiff(x.dom, y.dom));
                if (x.canvases !== y.canvases) problems.push(`canvas pixels differ:\n      ${x.canvases}\n      ${y.canvases}`);
                if (x.ls !== y.ls) problems.push(`localStorage differs:\n      ${x.ls}\n      ${y.ls}`);
                if (!x.png.equals(y.png)) {
                    const d = await pixelDiff(x.png, y.png);
                    // Translucent, blurred panels (backdrop-filter) are composited with ±1-3/255 jitter even when the very same
                    // build is loaded twice; anything above that is a real difference.
                    if (d && d.max <= NOISE_FLOOR) { noise++; lines.push(`  ~ [${name}] step ${i + 1} "${x.label}": within the compositor noise floor (${d.text})`); }
                    else {
                        problems.push(`screenshot differs (${d ? d.text : '?'})`);
                        fs.writeFileSync(path.join(OUT, `${name}-${i + 1}-A.png`), x.png); fs.writeFileSync(path.join(OUT, `${name}-${i + 1}-B.png`), y.png);
                    }
                }
                if (problems.length) { scenarioBad++; lines.push(`  ✖ [${name}] step ${i + 1} "${x.label}":\n    - ${problems.join('\n    - ')}`); }
            }
            for (const key of Object.keys(a.extra || {})) {
                totalSteps++;
                const sa = JSON.stringify(a.extra[key]), sb = JSON.stringify(b.extra[key]);
                if (sa !== sb) { scenarioBad++; lines.push(`  ✖ [${name}] ${key} differ:\n      A: ${sa.slice(0, 600)}\n      B: ${sb.slice(0, 600)}`); }
                else lines.push(`  · [${name}] ${key}: identical (${a.extra[key].length} entries)`);
            }
            bad += scenarioBad;
            console.log(`${scenarioBad ? '✖' : '✔'} ${name}: ${n} snapshots compared, ${scenarioBad} problem(s)`);
        }
    } finally { await browser.close(); A.kill(); B.kill(); }
    console.log(lines.join('\n'));
    console.log(`\n[${MODE}] ${sideA} vs ${sideB}: ${totalSteps} comparisons, ${bad} difference(s), ${noise} screenshot(s) equal only within ±${NOISE_FLOOR}/255`);
    fs.writeFileSync(path.join(OUT, `report-${MODE}.txt`), lines.join('\n') + `\n${totalSteps} comparisons, ${bad} difference(s)\n`);
    process.exit(MODE === 'mutate' ? (bad ? 0 : 1) : (bad ? 1 : 0));
}
main().catch(e => { console.error(e); process.exit(2); });
