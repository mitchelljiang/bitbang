import './style.css';
import { GUTTER, esc, groupSteps, render, type Rendered, type Step } from './core/render';
import type { Bit, Kind, Protocol, Waveform } from './core/types';
import { formatTime } from './core/util';
import { categoryOf } from './catalog';
import { FACTS } from './facts';
import { mountGuide } from './guide';
import { mountMenu } from './menu';
import { protocols } from './protocols';
import { mountThemeToggle } from './theme';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

const crumbCat = $('#crumb-cat');
const title = $('#proto-name');
const summary = $('#proto-summary');
const usedIn = $('#proto-used');
const vizView = $('#viz');
const guideView = $('#guide');
const glance = $('#glance');
const strengths = $('#strengths');
const limits = $('#limits');
const legend = $('#legend');
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

/** The spec sheet under the diagram. Each label links to its section in the guide. */
function buildSpecs() {
  glance.replaceChildren(...FACTS.flatMap(({ key, label }) => {
    const dt = document.createElement('dt');
    dt.append(Object.assign(document.createElement('a'), { href: `?p=basics#${key}`, textContent: label }));
    dt.firstElementChild!.setAttribute('data-nav', '');
    return [dt, Object.assign(document.createElement('dd'), { textContent: proto.facts[key] })];
  }));
  const items = (list: string[]) => list.map((t) => Object.assign(document.createElement('li'), { textContent: t }));
  strengths.replaceChildren(...items(proto.strengths));
  limits.replaceChildren(...items(proto.limits));
}

function buildAll() {
  title.textContent = proto.name;
  crumbCat.textContent = categoryOf(proto.id)?.name ?? '';
  summary.textContent = proto.summary;
  usedIn.textContent = proto.usedIn;
  buildSpecs();
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
  buildLegend(wave);
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

/** Bit kinds that share a color share a legend entry. Only entries this waveform actually uses are shown. */
const LEGEND: { kinds: Kind[]; label: string }[] = [
  { kinds: ['start', 'stop'], label: 'start / stop' },
  { kinds: ['cmd'], label: 'command' },
  { kinds: ['addr', 'rw'], label: 'address / R/W' },
  { kinds: ['dummy'], label: 'dummy / turnaround' },
  { kinds: ['data'], label: 'data' },
  { kinds: ['parity'], label: 'parity' },
  { kinds: ['ack'], label: 'ACK' },
  { kinds: ['nack'], label: 'NACK' },
];

function buildLegend(wave: Waveform) {
  const used = new Set(wave.bits.map((b) => b.kind));
  const item = (swatch: string, text: string) => `<span>${swatch}${esc(text)}</span>`;
  const rows = LEGEND.filter((e) => e.kinds.some((k) => used.has(k))).map((e) =>
    item(`<i class="tag k-${e.kinds[0]}"></i>`, proto.legend?.[e.kinds[0]] ?? e.label));
  if (wave.bits.some((b) => b.by === 'target')) rows.push(item('<i class="tag dashed"></i>', 'driven by target'));
  if (wave.bits.some((b) => b.sample !== undefined)) rows.push(item('<i class="dot"></i>', 'sample point'));
  legend.innerHTML = rows.join('');
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

const svg = (d: string) => `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${d}"/></svg>`;
const icon = { play: svg('M5 3l8 5-8 5z'), pause: svg('M4 3h3v10H4zM9 3h3v10H9z') };

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
  playBtn.innerHTML = `${icon.pause}Pause`;
  timer = window.setInterval(() => {
    if (current >= steps.length - 1) return stop();
    go(current + 1);
  }, 700);
}

function stop() {
  if (timer === undefined) return;
  clearInterval(timer);
  timer = undefined;
  playBtn.innerHTML = `${icon.play}Play`;
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
  resizeTimer = window.setTimeout(() => !vizView.hidden && update(), 150);
});

// ---- routing: ?p=<id> shows that protocol; anything else (including no ?p) shows the guide ----

const menu = mountMenu($<HTMLDetailsElement>('#menu'));
mountThemeToggle($<HTMLButtonElement>('#theme'));

mountGuide(guideView);

function route() {
  const q = new URLSearchParams(location.search);
  const p = protocols.find((x) => x.id === q.get('p'));
  const showGuide = !p;
  vizView.hidden = showGuide;
  guideView.hidden = !showGuide;
  if (showGuide) {
    stop();
    menu.setCurrent('basics');
    document.title = 'How protocols work · bitbang';
  } else {
    menu.setCurrent(p.id);
    readUrl(q, p);
    buildAll();
  }
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}

// In-site links swap views without a page load; the back button still works.
document.addEventListener('click', (e) => {
  const a = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>('a[data-nav]') : null;
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  history.pushState(null, '', a.href);
  current = -1;
  zoom = 'fit';
  window.scrollTo(0, 0);
  route();
});
window.addEventListener('popstate', route);

route();
