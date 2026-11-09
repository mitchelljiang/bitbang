/**
 * Browser smoke test for every page. Run with `npm run smoke` (it builds first).
 *
 * verify.ts checks the logic; this checks the pages themselves, in headless Chrome, 8 tabs at a time:
 * 1. every page loads and mounts without a JavaScript error or console error,
 * 2. clicking every control and typing into every box raises no error,
 * 3. no Memory or Concurrency instrument changes height while you use it (pages that grow by design are listed in
 *    GROWS); the scope and the Bits debugger may add rows for a setting,
 * 4. no page scrolls sideways on a 390 px phone,
 * 5. in-site navigation swaps pages, loads a page's code on demand, and Back returns to the page before.
 *
 * Needs Google Chrome. Exits non-zero if anything fails.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import { SECTION_FILES } from './sections.mjs';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TABS = 8;
/** Panels that grow on purpose: the call stack page adds a frame per call. */
const GROWS = new Set(['stack']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- the built site, served from dist/ on a free port ----
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  const path = join('dist', decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
  if (!existsSync(path)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(readFileSync(path));
}).listen(0);
const site = `http://127.0.0.1:${server.address().port}/`;

// ---- headless Chrome on a free debugging port ----
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'smoke-'))}`, '--no-first-run',
  // Every tab runs at full speed, not only the one in front.
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const devtools = await new Promise((ok, fail) => {
  let err = '';
  chrome.stderr.on('data', (d) => { err += d; const m = err.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (m) ok(new URL(m[1]).port); });
  chrome.on('exit', () => fail(new Error('Chrome did not start: ' + err.slice(0, 200))));
});
const done = (code) => { chrome.kill(); server.close(); process.exit(code); };

/** A fresh tab, driven over the DevTools protocol. Collects every error the page raises. */
async function tab() {
  const t = await (await fetch(`http://127.0.0.1:${devtools}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let n = 0;
  const pend = new Map();
  const errors = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (pend.has(m.id)) { pend.get(m.id)(m.result ?? m.error); pend.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description?.split('\n')[0] ?? m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/favicon/.test(m.params.entry.url ?? '')) errors.push(`${m.params.entry.text} ${m.params.entry.url ?? ''}`);
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++n; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  // A tab that is not in front is treated as hidden and slowed; mark every tab active and focused instead.
  await send('Page.setWebLifecycleState', { state: 'active' });
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value;
  const size = (width) => send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
  const open = async (url) => {
    await size(1280);
    await send('Page.navigate', { url });
    for (let k = 0; k < 50 && !(await ev(`document.readyState === 'complete' && !document.documentElement.classList.contains('loading')`)); k++) await sleep(50);
  };
  return { ev, open, size, errors, close: () => ws.close() };
}

/** Every page id: the sidebar entries of every section, plus the pages outside them. */
const ids = ['', 'about', 'changelog'];
for (const [, f] of SECTION_FILES) {
  for (const m of readFileSync(f, 'utf8').matchAll(/\{[ \t]*id:[ \t]*'([a-z0-9-]+)',[ \t]*name:/g)) ids.push(m[1]);
}

/** In the page: click every control in every panel, type into every box, and report panels that changed height. */
const exercise = (only) => `(async () => {
  // Pages redraw synchronously, and measuring forces layout; a zero-delay yield lets any timers they start run.
  const wait = () => new Promise((r) => setTimeout(r));
  const panels = [...document.querySelectorAll('${only}')].filter((p) => p.offsetParent);
  const height = () => panels.map((p) => Math.round(p.getBoundingClientRect().height));
  const before = height();
  const grew = new Set();
  const fixed = (p) => p.matches('.debugger.mem, section.trace, .diagram, .debugger.cc, .debugger.registers, .debugger.addressing, .debugger.pipe, .debugger.brn, .debugger.clk, .debugger.slp, .debugger.bat, .debugger.bod, .debugger.ring, .debugger.uartd, .debugger.dmad');
  for (const [i, p] of panels.entries()) {
    const controls = [...p.querySelectorAll('button:not([disabled]), [role=radio], .bit[data-bit], .cc .ln[data-src]:nth-child(3n), .cc .ln[data-out]:nth-child(4n), .cc tr[data-k], .cc [data-file], .cc [data-line]:nth-child(2n)')];
    for (const c of controls.slice(0, 60)) {
      if (!c.isConnected) continue;
      c.click();
      await wait();
      const h = p.getBoundingClientRect().height;
      if (fixed(p) && Math.abs(h - before[i]) > 1) grew.add(p.className.split(' ').join('.') + ' after ' + (c.textContent.trim() || c.getAttribute('aria-label') || c.dataset.bit || '?').slice(0, 24) + ' (' + before[i] + ' -> ' + Math.round(h) + ')');
    }
    for (const box of p.querySelectorAll('input[type=text], input:not([type])')) for (const v of ['0', '0xFF', '12345', 'zz']) {
      box.value = v;
      box.dispatchEvent(new Event('input', { bubbles: true }));
      box.dispatchEvent(new Event('change', { bubbles: true }));
      await wait();
    }
  }
  return { panels: panels.length, grew: [...grew] };
})()`;

let failures = 0;
const results = [];
const fail = (where, what) => { failures++; results.push(`  FAIL ${where}: ${what}`); };

// 1–4: every page, at desktop width with every control exercised, then at phone width.
const queue = [...ids];
let pages = 0;
await Promise.all(Array.from({ length: TABS }, async () => {
  const t = await tab();
  for (let id; (id = queue.shift()) !== undefined;) {
    const name = id || 'home';
    const t0 = Date.now();
    const url = site + (id ? `?p=${id}` : '');
    await t.open(url);
    const shown = await t.ev(`!!document.querySelector('main h1, #content h1, h1')`);
    if (!shown) fail(name, 'no heading rendered');
    const r = await t.ev(exercise('section.debugger, section.trace, .diagram, .instrument'));
    if (r?.grew.length && !GROWS.has(id)) fail(name, `panel changed height while used: ${r.grew.join(', ')}`);
    // The C and Compilers panels hold their height at the widths where their text and controls re-wrap, too.
    if (await t.ev(`!!document.querySelector('.debugger.cc, .debugger.registers, .debugger.addressing, .debugger.pipe, .debugger.brn, .debugger.clk, .debugger.slp, .debugger.bat, .debugger.bod, .debugger.ring, .debugger.uartd, .debugger.dmad')`)) for (const w of [1000, 700, 390]) {
      await t.size(w);
      await t.ev('new Promise((r) => setTimeout(r, 50))');
      const rw = await t.ev(exercise('section.debugger.cc, section.debugger.registers, section.debugger.addressing, section.debugger.pipe, section.debugger.brn, section.debugger.clk, section.debugger.slp, section.debugger.bat, section.debugger.bod, section.debugger.ring, section.debugger.uartd, section.debugger.dmad'));
      if (rw?.grew.length) fail(name, `at ${w}px, panel changed height while used: ${rw.grew.join(', ')}`);
    }
    // The same page, now on a phone: narrowing the viewport relays it out without loading it again.
    await t.size(390);
    const over = await t.ev('new Promise((r) => setTimeout(() => r(document.documentElement.scrollWidth - innerWidth), 50))');
    if (over > 0) fail(name, `scrolls sideways by ${over}px at 390px`);
    for (const e of t.errors.splice(0)) fail(name, e);
    if (process.env.SMOKE_TIMES) console.log(`  ${String(Date.now() - t0).padStart(5)}ms ${name}`);
    pages++;
  }
  t.close();
}));

// 5: in-site navigation. Start on the home page, follow links between pages, then go Back.
{
  const t = await tab();
  await t.open(site);
  const nav = await t.ev(`(async () => {
    const until = async (f) => { for (let k = 0; k < 60 && !f(); k++) await new Promise((r) => setTimeout(r, 50)); return f(); };
    const heading = () => document.querySelector('#topic h1')?.textContent;
    const go = async (id) => {
      const was = heading();
      const a = Object.assign(document.createElement('a'), { href: '?p=' + id });
      a.dataset.nav = '';
      document.body.append(a);
      a.click();
      a.remove();
      return until(() => !document.querySelector('#topic')?.hidden && heading() && heading() !== was);
    };
    const first = await go('memmap') && heading();
    const second = await go('races') && heading();
    history.back();
    const back = await until(() => heading() === first);
    return { first, second, back, url: location.search };
  })()`);
  if (nav?.first !== 'Memory map') fail('navigation', `home → memmap showed ${JSON.stringify(nav?.first)}`);
  if (!nav?.second || nav.second === nav.first) fail('navigation', `memmap → races showed ${JSON.stringify(nav?.second)}`);
  if (!nav?.back) fail('navigation', `Back did not return to Memory map (at ${nav?.url})`);
  for (const e of t.errors.splice(0)) fail('navigation', e);
  t.close();
}

console.log(results.join('\n') || `  ok   ${pages} pages load, run every control without errors, keep their size, and fit a phone; navigation and Back work`);
console.log(`\n${failures ? `${failures} failed` : 'smoke test passed'}`);
done(failures ? 1 : 0);
