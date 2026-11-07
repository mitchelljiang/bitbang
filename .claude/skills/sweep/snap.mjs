/**
 * Pixel safety net for refactors: screenshot every page, then compare two runs byte for byte.
 *
 *   node --experimental-websocket snap.mjs snap <outdir> [--w=1280,390] [--only=uart,memmap]
 *   node --experimental-websocket snap.mjs diff <dirA> <dirB>
 *
 * Needs the built site on :4329 and headless Chrome on :9341 (see the visual-check skill's setup). Pages render with
 * reduced motion so nothing is caught mid-animation. Headless Chrome is deterministic, so identical PNGs mean identical
 * pixels; a differing page is listed and should be opened (Read both PNGs) before deciding whether the change is wanted.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const [mode, a, b] = process.argv.slice(2).filter((x) => !x.startsWith('--'));
const flags = Object.fromEntries(process.argv.slice(2).filter((x) => x.startsWith('--')).map((x) => x.slice(2).split('=')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Every page id: the sidebar entries of every section, plus the pages outside them. */
function pageIds() {
  const ids = ['', 'basics', 'about', 'changelog'];
  for (const f of ['src/catalog.ts', 'src/bits.ts', 'src/memory.ts', 'src/concurrency.ts', 'src/peripherals.ts', 'src/architecture.ts']) {
    for (const m of readFileSync(f, 'utf8').matchAll(/\{[ \t]*id:[ \t]*'([a-z0-9-]+)',[ \t]*name:/g)) ids.push(m[1]);
  }
  return [...new Set(ids)];
}

if (mode === 'diff') {
  const hash = (f) => createHash('sha1').update(readFileSync(f)).digest('hex');
  const names = [...new Set([...readdirSync(a), ...readdirSync(b)])].filter((n) => n.endsWith('.png')).sort();
  let changed = 0;
  for (const n of names) {
    const inA = existsSync(join(a, n)), inB = existsSync(join(b, n));
    if (!inA || !inB) { console.log(`${n.padEnd(32)} only in ${inA ? a : b}`); changed++; continue; }
    if (hash(join(a, n)) !== hash(join(b, n))) { console.log(`${n.padEnd(32)} DIFFERS`); changed++; }
  }
  console.log(changed ? `${changed} of ${names.length} differ` : `all ${names.length} identical`);
  process.exit(0);
}

if (mode !== 'snap' || !a) { console.error('usage: snap <outdir> | diff <dirA> <dirB>'); process.exit(1); }
mkdirSync(a, { recursive: true });
const widths = (flags.w ?? '1280,390').split(',').map(Number);
const only = flags.only?.split(',');
const ids = pageIds().filter((id) => !only || only.includes(id || 'home'));

const targets = await (await fetch('http://127.0.0.1:9341/json')).json();
const ws = new WebSocket(targets.find((x) => x.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let n = 0; const pend = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m.result ?? m.error); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++n; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable');
// The home page picks a random protocol for its hero; a seeded Math.random makes every run draw the same one.
await send('Page.addScriptToEvaluateOnNewDocument', { source: 'let s=7;Math.random=()=>((s=(s*16807)%2147483647)-1)/2147483646;' });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

for (const w of widths) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: w < 600 });
  for (const id of ids) {
    await send('Page.navigate', { url: `http://localhost:4329/${id ? `?p=${id}` : ''}` });
    await sleep(700);
    const { result } = await send('Runtime.evaluate', { returnByValue: true, awaitPromise: true,
      expression: 'document.fonts.ready.then(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight])' });
    const [sw, sh] = result.value;
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, fromSurface: true,
      clip: { x: 0, y: 0, width: sw, height: Math.min(sh, 16000), scale: 1 } });
    writeFileSync(join(a, `${id || 'home'}@${w}.png`), Buffer.from(shot.data, 'base64'));
  }
  console.log(`${ids.length} pages at ${w}px`);
}
process.exit(0);
