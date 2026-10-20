/**
 * Headless-Chrome visual checks for bitbang, over the Chrome DevTools Protocol.
 *
 * Run Node with --experimental-websocket (Node ≥ 21 has no global WebSocket otherwise):
 *
 *   node --experimental-websocket shot.mjs shot     <url> <selector> <out.png> [--w=820] [--dsf=2] [--reduced] [--click='<js>']
 *   node --experimental-websocket shot.mjs measure  <url> <selector> '<clickJs>' [--w=820]
 *   node --experimental-websocket shot.mjs overflow <url[,url2,...]>            [--w=390]
 *
 * Common flags: --port=9341 (Chrome remote-debugging port), --w (viewport width), --dsf (device scale factor),
 * --reduced (emulate prefers-reduced-motion: reduce — needed for the home page's intro animation), --click (JS run
 * once after load, before the shot).
 *
 * Start Chrome first, e.g.:
 *   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
 *     --remote-debugging-port=9341 --user-data-dir=/tmp/shot-prof about:blank &
 * and serve the built site:  python3 -m http.server 4329 -d dist &
 */
import { writeFileSync } from 'node:fs';

const [mode, url, ...rest] = process.argv.slice(2);
// Split each flag at its first '=' only, so a --click script can contain '=' (e.g. [data-act=step]).
const flags = Object.fromEntries(rest.filter(a => a.startsWith('--')).map(a => { const [k, ...v] = a.slice(2).split('='); return [k, v.length ? v.join('=') : 'true']; }));
const pos = rest.filter(a => !a.startsWith('--'));
const port = flags.port || '9341';
const width = +(flags.w || (mode === 'overflow' ? 390 : 820));
const dsf = +(flags.dsf || 1);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find(x => x.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pend = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m.result ?? m.error); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => (await send('Runtime.evaluate', { returnByValue: true, expression: expr })).result.value;

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width, height: mode === 'shot' ? 2600 : 900, deviceScaleFactor: dsf, mobile: width < 600 });
if (flags.reduced) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

const load = async (u) => { await send('Page.navigate', { url: u }); await sleep(flags.reduced ? 1500 : 1000); };
const heightOf = sel => `(()=>{const e=document.querySelector(${JSON.stringify(sel)});return e?Math.round(e.getBoundingClientRect().height):-1;})()`;

if (mode === 'shot') {
  const [selector, out] = pos;
  await load(url);
  if (flags.click) { await ev(flags.click); await sleep(500); }
  const rect = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;const r=e.getBoundingClientRect();return {x:Math.max(0,Math.floor(r.left)),y:Math.floor(r.top+window.scrollY),w:Math.ceil(r.width),h:Math.ceil(r.height)};})()`);
  if (!rect || rect.w === 0 || rect.h === 0) { console.error('no visible element for', selector, rect); process.exit(1); }
  const shot = await send('Page.captureScreenshot', { clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 1 }, format: 'png', captureBeyondViewport: true, fromSurface: true });
  writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log('saved', out, JSON.stringify(rect));
} else if (mode === 'measure') {
  const [selector, click] = pos;
  await load(url);
  const before = await ev(heightOf(selector));
  await ev(click); await sleep(500);
  const after = await ev(heightOf(selector));
  console.log(before === after ? `fixed (${before}px)` : `JUMPS ${before} -> ${after}`);
} else if (mode === 'overflow') {
  for (const u of url.split(',')) {
    await load(u);
    const r = await ev(`({ sw: document.documentElement.scrollWidth, iw: window.innerWidth })`);
    console.log(u.padEnd(48), r.sw <= r.iw ? 'ok' : `OVERFLOW ${r.sw}>${r.iw}`);
  }
} else {
  console.error('mode must be shot | measure | overflow');
  process.exit(2);
}
process.exit(0);
