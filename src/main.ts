import './style.css';
import { GUTTER, esc, groupSteps, render, type Rendered, type Step } from './core/render';
import type { Bit, Kind, Protocol, TourStop, Waveform } from './core/types';
import { formatTime } from './core/util';
import { catalog, categoryOf } from './catalog';
import { FACTS } from './facts';
import { mountGuide } from './guide';
import { mountMenu } from './menu';
import { protocols } from './protocols';
import { mountThemeToggle } from './theme';
import { mountTour } from './tour';
import { TOURS } from './tours';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

const crumbCat = $('#crumb-cat');
const title = $('#proto-name');
const summary = $('#proto-summary');
const usedIn = $('#proto-used');
const fullName = $('#proto-full');
const vizView = $('#viz');
const guideView = $('#guide');
const wipView = $('#wip');
const glance = $('#glance');
const strengths = $('#strengths');
const limits = $('#limits');
const legend = $('#legend');
const deep = $('#deep');
const deepBody = $('#deep-body');
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
const toolbar = $('.toolbar');

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
let wave: Waveform | null = null;
/** Time range the walkthrough keeps bright, or null for no dimming. */
let focus: [number, number] | null = null;

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

  deep.hidden = !proto.deepDive?.length;
  deepBody.replaceChildren(...(proto.deepDive ?? []).map(({ title, body }) => {
    const topic = document.createElement('section');
    topic.append(Object.assign(document.createElement('h3'), { textContent: title }));
    for (const para of body) topic.append(Object.assign(document.createElement('p'), { textContent: para }));
    return topic;
  }));
}

function buildAll() {
  title.textContent = proto.name;
  fullName.textContent = proto.fullName ?? '';
  fullName.hidden = !proto.fullName;
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
  let next: Waveform;
  try {
    next = proto.encode(params);
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
  wave = next;
  try {
    wave.tour ??= TOURS[proto.id]?.(wave, params);
  } catch (e) {
    console.error('Walkthrough failed to build; showing the diagram without it.', e);
  }
  steps = groupSteps(wave.bits);
  buildLegend(wave);
  laneNames = wave.traces.map((t) => t.name);
  unitTime = wave.unitTime;
  hideTip();
  draw();
  reserveExplainHeight();
  go(current < steps.length ? current : -1);
  tour.refresh();
}

function draw() {
  if (!wave) return;
  drawn = render(scope, wave, steps, {
    zoom,
    focus,
    onPick(i) {
      stop();
      go(i);
    },
    onHover: showTip,
  });
  zoomFit.setAttribute('aria-pressed', String(zoom === 'fit'));
}

// ---- walkthrough: zooms from stop to stop, dimming the rest ----

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let anim = 0;

/** Width of the drawing area right of the lane names, and the time at its center. */
const viewWidth = () => scope.clientWidth - GUTTER - 16;
const centerTime = () => (drawn ? (scope.scrollLeft + viewWidth() / 2) / drawn.ppu : 0);

function zoomTo(ppu: number, center: number) {
  zoom = ppu;
  draw();
  scope.scrollLeft = center * ppu - viewWidth() / 2;
}

function showStop(s: TourStop, animate: boolean) {
  cancelAnimationFrame(anim);
  const [v0, v1] = s.view;
  focus = s.focus === undefined ? s.view : s.focus;
  const toPpu = Math.min(200, viewWidth() / (v1 - v0));
  const toCenter = (v0 + v1) / 2;
  if (!animate || reducedMotion.matches || !drawn) return zoomTo(toPpu, toCenter);
  const fromPpu = drawn.ppu;
  const fromCenter = centerTime();
  const t0 = performance.now();
  const DURATION = 450;
  const frame = (now: number) => {
    const k = Math.min(1, (now - t0) / DURATION);
    const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2; // ease in-out
    // Zoom moves geometrically, so going from 1× to 8× feels as even as 8× to 64×.
    zoomTo(fromPpu * (toPpu / fromPpu) ** e, fromCenter + (toCenter - fromCenter) * e);
    if (k < 1) anim = requestAnimationFrame(frame);
  };
  anim = requestAnimationFrame(frame);
}

const tour = mountTour($('#tour-bar'), toolbar, $<HTMLButtonElement>('#tour-start'), {
  wave: () => wave,
  show: showStop,
  caption(s) {
    if (!s) return go(-1);
    stepInfo.replaceChildren(tourNode(s.text));
  },
  exit() {
    cancelAnimationFrame(anim);
    focus = null;
    zoom = 'fit';
    draw();
    scope.scrollLeft = 0;
  },
});

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

const HINT = '<p class="hint">Click a bit, or use <kbd>←</kbd> <kbd>→</kbd> to walk through the frame.</p>';

/** The explanation for one step: a paragraph per bit, tagged with its label (and lane, if several lanes move at once). */
function stepNodes(step: Step) {
  const lanes = new Set(step.bits.map((b) => b.lane)).size > 1;
  return step.bits.map((bit) => {
    const p = document.createElement('p');
    const tag = Object.assign(document.createElement('span'), {
      className: `tag k-${bit.kind}`,
      textContent: lanes ? `${laneNames[bit.lane]} ${bit.label}` : bit.label,
    });
    p.append(tag, ' ', bit.info);
    return p;
  });
}

const tourNode = (text: string) => Object.assign(document.createElement('p'), { className: 'tour-text', textContent: text });

/**
 * Reserves the height of the tallest explanation this diagram can show (every step, the hint and every walkthrough
 * caption), so the box below the diagram doesn't change size while stepping through it.
 */
function reserveExplainHeight() {
  stepInfo.style.minHeight = '';
  const probe = stepInfo.cloneNode(false) as HTMLElement;
  probe.removeAttribute('id');
  probe.setAttribute('aria-hidden', 'true');
  Object.assign(probe.style, { position: 'absolute', visibility: 'hidden', left: '0', top: '0', width: `${stepInfo.offsetWidth}px` });
  instrument.append(probe);
  let tallest = 0;
  const measure = (nodes: Node[] | string) => {
    if (typeof nodes === 'string') probe.innerHTML = nodes;
    else probe.replaceChildren(...nodes);
    tallest = Math.max(tallest, probe.offsetHeight);
  };
  measure(HINT);
  const seen = new Set<string>();
  for (const step of steps) {
    const key = step.bits.map((b) => b.label + b.info).join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    measure(stepNodes(step));
  }
  for (const stop of wave?.tour ?? []) measure([tourNode(stop.text)]);
  probe.remove();
  stepInfo.style.minHeight = `${tallest}px`;
}

function go(i: number) {
  current = i;
  const step = steps[i] ?? null;
  drawn?.select(step);
  prevBtn.disabled = i <= 0;
  nextBtn.disabled = i >= steps.length - 1;
  if (!step) {
    stepLabel.textContent = `${steps.length} bits`;
    stepInfo.innerHTML = HINT;
    return;
  }
  stepLabel.textContent = `${i + 1} / ${steps.length}`;
  stepInfo.replaceChildren(...stepNodes(step));
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
  if (tour.active()) {
    if (e.target instanceof Element && e.target.closest('input, select, textarea')) return;
    const action = ({ ArrowRight: tour.next, ArrowLeft: tour.prev, Escape: tour.stop } as Record<string, () => void>)[e.key];
    if (!action || e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    return action();
  }
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

// The feedback address is put together here rather than written in the page, so simple scrapers can't harvest it.
// Without JavaScript the link falls back to GitHub issues.
$<HTMLAnchorElement>('#feedback').href = `mailto:${['feedback', 'bitbang.fyi'].join('@')}?subject=${encodeURIComponent('[BITBANG FEEDBACK] ')}`;

mountGuide(guideView);

function route() {
  const q = new URLSearchParams(location.search);
  const p = protocols.find((x) => x.id === q.get('p'));
  const wip = p ? undefined : catalog.flatMap((c) => c.entries).find((e) => e.id === q.get('p') && e.wip);
  const showGuide = !p && !wip;
  vizView.hidden = !p;
  guideView.hidden = !showGuide;
  wipView.hidden = !wip;
  if (wip) {
    stop();
    tour.stop();
    menu.setCurrent(wip.id);
    $('#wip-cat').textContent = categoryOf(wip.id)?.name ?? '';
    $('#wip-name').textContent = wip.name;
    $('#wip-text').textContent = wip.wip!;
    const related = ['usb', 'pcie'].filter((id) => protocols.some((x) => x.id === id));
    $('#wip-links').innerHTML = related
      .map((id) => `<a href="?p=${id}" data-nav>${esc(protocols.find((x) => x.id === id)!.name)}</a>`).join('');
    document.title = `${wip.name} · bitbang`;
  } else if (showGuide) {
    stop();
    menu.setCurrent('basics');
    document.title = 'How protocols work · bitbang';
  } else if (p) {
    if (p !== proto) tour.stop();
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
