import './style.css';
import { GUTTER, groupSteps, render, type Rendered, type Step } from './core/render';
import type { Bit, Protocol } from './core/types';
import { formatTime } from './core/util';
import { categoryOf } from './catalog';
import { mountHome } from './home';
import { mountMenu } from './menu';
import { protocols } from './protocols';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

const homeView = $('#home');
const vizView = $('#viz');
const crumbCat = $('#crumb-cat');
const title = $('#proto-name');
const summary = $('#proto-summary');
const controls = $('#controls');
const scope = $('#scope');
const error = $('#error');
const stepLabel = $('#step-label');
const stepInfo = $('#step-info');
const prevBtn = $<HTMLButtonElement>('#prev');
const nextBtn = $<HTMLButtonElement>('#next');
const playBtn = $<HTMLButtonElement>('#play');
const zoomOut = $<HTMLButtonElement>('#zoom-out');
const zoomFit = $<HTMLButtonElement>('#zoom-fit');
const zoomIn = $<HTMLButtonElement>('#zoom-in');
const copyBtn = $<HTMLButtonElement>('#copy-link');
const instrument = $('.instrument');
const tooltip = $('#tooltip');

let proto: Protocol = protocols[0];
let params: Record<string, string> = {};
let steps: Step[] = [];
let laneNames: string[] = [];
let current = -1;
let drawn: Rendered | null = null;
let timer: number | undefined;
let zoom: number | 'fit' = 'fit';
let unitTime = 1;
let inputs: Record<string, HTMLInputElement | HTMLSelectElement> = {};

const defaults = (p: Protocol) => Object.fromEntries(p.params.map((x) => [x.key, x.default]));

// ---- URL state, so any frame can be shared as a link ----

function readUrl(q: URLSearchParams, p: Protocol) {
  proto = p;
  params = defaults(proto);
  for (const key of Object.keys(params)) {
    const v = q.get(key);
    if (v !== null) params[key] = v;
  }
}

function writeUrl() {
  const q = new URLSearchParams({ p: proto.id });
  const d = defaults(proto);
  for (const [k, v] of Object.entries(params)) if (v !== d[k]) q.set(k, v);
  history.replaceState(null, '', `?${q}`);
}

// ---- UI ----

function buildControls() {
  controls.innerHTML = '';
  inputs = {};
  for (const param of proto.params) {
    const label = document.createElement('label');
    label.className = param.type === 'text' ? 'ctl wide' : 'ctl';
    label.append(Object.assign(document.createElement('span'), { textContent: param.label }));

    let input: HTMLInputElement | HTMLSelectElement;
    if (param.type === 'select') {
      input = document.createElement('select');
      for (const o of param.options) input.append(new Option(o.label, o.value));
    } else {
      input = Object.assign(document.createElement('input'), {
        type: 'text', spellcheck: false, autocomplete: 'off', placeholder: param.placeholder ?? '',
      });
    }
    input.value = params[param.key];
    inputs[param.key] = input;
    input.addEventListener('input', () => {
      params[param.key] = input.value;
      update(param.key);
    });
    label.append(input);
    controls.append(label);
  }
}

function buildAll() {
  title.textContent = proto.name;
  crumbCat.textContent = categoryOf(proto.id)?.name ?? '';
  summary.textContent = proto.summary;
  document.title = `${proto.name} · bitbang`;
  buildControls();
  update();
}

/** Re-encodes and redraws. `changed` is the setting the user just edited, if any, so errors can point at it. */
function update(changed?: string) {
  stop();
  writeUrl();
  let wave;
  try {
    wave = proto.encode(params);
  } catch (e) {
    // Keep the last good waveform on screen, dimmed, while the user is mid-edit.
    error.textContent = (e as Error).message;
    error.hidden = false;
    scope.classList.add('stale');
    if (changed) inputs[changed]?.setAttribute('aria-invalid', 'true');
    return;
  }
  error.hidden = true;
  scope.classList.remove('stale');
  for (const input of Object.values(inputs)) input.removeAttribute('aria-invalid');
  steps = groupSteps(wave.bits);
  laneNames = wave.traces.map((t) => t.name);
  unitTime = wave.unitTime;
  hideTip();
  drawn = render(scope, wave, steps, {
    zoom,
    onPick(i) {
      stop();
      go(i);
    },
    onHover: showTip,
  });
  zoomFit.setAttribute('aria-pressed', String(zoom === 'fit'));
  go(current < steps.length ? current : -1);
}

// ---- zoom: keeps whatever is in the middle of the view in the middle ----

function setZoom(next: number | 'fit') {
  if (!drawn) return;
  const center = (scope.scrollLeft + scope.clientWidth / 2 - GUTTER) / drawn.ppu;
  zoom = next !== 'fit' && Math.abs(next - drawn.fitPpu) < 0.5 ? 'fit' : next;
  update();
  scope.scrollLeft = GUTTER + center * drawn.ppu - scope.clientWidth / 2;
}

const clampZoom = (z: number) => Math.min(200, Math.max(6, z));
zoomIn.addEventListener('click', () => drawn && setZoom(clampZoom(drawn.ppu * 1.5)));
zoomOut.addEventListener('click', () => drawn && setZoom(clampZoom(drawn.ppu / 1.5)));
zoomFit.addEventListener('click', () => setZoom('fit'));

// ---- hover tooltip ----

function showTip(bit: Bit | null, cell: Element | null) {
  if (!bit || !cell) return hideTip();
  const lane = laneNames.length > 1 ? `${laneNames[bit.lane]} ` : '';
  tooltip.innerHTML = '';
  tooltip.append(
    Object.assign(document.createElement('span'), { className: `tag k-${bit.kind}`, textContent: lane + bit.label }),
    ` ${bit.info.split('. ')[0].replace(/\.$/, '')}.`,
    Object.assign(document.createElement('span'), { className: 'at', textContent: `at ${formatTime(bit.t0 * unitTime)}` }),
  );
  tooltip.hidden = false;
  const box = instrument.getBoundingClientRect();
  const r = cell.getBoundingClientRect();
  const half = tooltip.offsetWidth / 2;
  const cx = Math.min(box.width - half - 8, Math.max(half + 8, r.left - box.left + r.width / 2));
  tooltip.style.left = `${cx}px`;
  tooltip.style.top = `${r.top - box.top - 8}px`;
}

function hideTip() {
  tooltip.hidden = true;
}

// ---- copy link ----

copyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    copyBtn.textContent = 'Copied';
  } catch {
    copyBtn.textContent = 'Copy failed';
  }
  setTimeout(() => (copyBtn.textContent = 'Copy link'), 1500);
});

function go(i: number) {
  current = i;
  const step = steps[i] ?? null;
  drawn?.select(step);
  prevBtn.disabled = i <= 0;
  nextBtn.disabled = i >= steps.length - 1;
  if (!step) {
    stepLabel.textContent = `${steps.length} bits`;
    stepInfo.innerHTML = '<p class="hint">Click a bit, or use <kbd>←</kbd> <kbd>→</kbd> to walk through the frame.</p>';
    return;
  }
  stepLabel.textContent = `${i + 1} / ${steps.length}`;
  stepInfo.innerHTML = '';
  const lanes = new Set(step.bits.map((b) => b.lane)).size > 1;
  for (const bit of step.bits) {
    const p = document.createElement('p');
    const tag = Object.assign(document.createElement('span'), {
      className: `tag k-${bit.kind}`,
      textContent: lanes ? `${laneNames[bit.lane]} ${bit.label}` : bit.label,
    });
    p.append(tag, ' ', bit.info);
    stepInfo.append(p);
  }
}

function play() {
  if (timer !== undefined) return stop();
  if (current >= steps.length - 1) go(-1);
  playBtn.textContent = '❚❚ Pause';
  timer = window.setInterval(() => {
    if (current >= steps.length - 1) return stop();
    go(current + 1);
  }, 700);
}

function stop() {
  if (timer === undefined) return;
  clearInterval(timer);
  timer = undefined;
  playBtn.textContent = '▶ Play';
}

prevBtn.addEventListener('click', () => { stop(); go(Math.max(0, current - 1)); });
nextBtn.addEventListener('click', () => { stop(); go(Math.min(steps.length - 1, current + 1)); });
playBtn.addEventListener('click', play);

document.addEventListener('keydown', (e) => {
  if (vizView.hidden) return;
  if (e.target instanceof Element && e.target.closest('input, select, textarea, button, a')) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const keys: Record<string, () => void> = {
    ArrowRight: () => nextBtn.click(),
    ArrowLeft: () => prevBtn.click(),
    Home: () => { stop(); go(0); },
    End: () => { stop(); go(steps.length - 1); },
    ' ': play,
    Escape: () => { stop(); go(-1); },
    '+': () => zoomIn.click(),
    '=': () => zoomIn.click(),
    '-': () => zoomOut.click(),
    '0': () => zoomFit.click(),
  };
  const action = keys[e.key];
  if (!action) return;
  e.preventDefault();
  action();
});

let resizeTimer: number | undefined;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => (vizView.hidden ? home.start() : update()), 150);
});

// ---- routing: no ?p shows the home page, ?p=<id> shows that protocol ----

const home = mountHome(homeView);
const menuEl = $<HTMLDetailsElement>('#menu');
const menu = mountMenu(menuEl);

// "Browse protocols" on the home page just opens the header menu.
document.addEventListener('click', (e) => {
  if (!(e.target instanceof Element) || !e.target.closest('[data-open-menu]')) return;
  e.stopPropagation();
  menuEl.open = true;
  menuEl.querySelector('a')?.focus();
}, true);

function route() {
  const q = new URLSearchParams(location.search);
  const p = protocols.find((x) => x.id === q.get('p'));
  homeView.hidden = !!p;
  vizView.hidden = !p;
  menu.setCurrent(p?.id ?? null);
  if (p) {
    home.stop();
    readUrl(q, p);
    buildAll();
  } else {
    stop();
    document.title = 'bitbang';
    home.start();
  }
}

// In-site links swap views without a page load; the back button still works.
document.addEventListener('click', (e) => {
  const a = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>('a[data-nav]') : null;
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  history.pushState(null, '', a.href);
  current = -1;
  zoom = 'fit';
  route();
  window.scrollTo(0, 0);
});
window.addEventListener('popstate', route);

route();
