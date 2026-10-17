import { GUTTER, esc, groupSteps, readout, render, stepNodes, type Rendered, type Step } from './core/render';
import type { Bit, Kind, Protocol, TourStop, Waveform } from './core/types';
import { defaults, formatTime } from './core/util';
import { bitTopics } from './bits';
import { concurrencyTopics } from './concurrency';
import { memoryTopics } from './memory';
import { catalog, categoryOf } from './catalog';
import { FACTS } from './facts';
import { mountAbout } from './about';
import { mountChangelog } from './changelog';
import { mountGuide } from './guide';
import { mountHome } from './home';
import { mountNav } from './nav';
import { mountProgress } from './progress';
import { mountScopeAids } from './cursor';
import { topics } from './topics';
import { RESOURCES } from './resources';
import { protocols } from './protocols';
import { mountThemeToggle } from './theme';
import { MOTION_MS, easeInOut, mountTour } from './tour';
import { mountEye } from './eye';
import { TOURS } from './tours';
import { mountSearch } from './search';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

const crumbCat = $('#crumb-cat');
const title = $('#proto-name');
const summary = $('#proto-summary');
const usedIn = $('#proto-used');
const fullName = $('#proto-full');
const tagList = $('#proto-tags');
const vizView = $('#viz');
const guideView = $('#guide');
const wipView = $('#wip');
const aboutView = $('#about');
const changelogView = $('#changelog');
const homeView = $('#home');
const topicView = $('#topic');
/** The topic page currently mounted in the topic view, so returning to it keeps its state. */
let topicShown = '';
const glance = $('#glance');
const strengths = $('#strengths');
const limits = $('#limits');
const legend = $('#legend');
const deep = $('#deep');
const deepBody = $('#deep-body');
const extra = $('#extra');

/** Interactive figures that belong to one protocol's page. */
const EXTRAS: Record<string, { title: string; intro: string; mount(root: HTMLElement): void }> = {
  pcie: {
    title: 'Eye diagram',
    intro: 'An eye diagram overlays every bit of a long signal on top of each other. The open area in the middle is the ' +
      'margin the receiver has to decide 1 or 0: the taller and wider it is, the more noise and timing error the link ' +
      'can tolerate. Change the channel and jitter to see the eye close, and turn de-emphasis on to see it reopen.',
    mount: mountEye,
  },
};
let extraFor = '';
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
let current = -1;
let drawn: Rendered | null = null;
let timer: number | undefined;
let zoom: number | 'fit' | 'all' = 'fit';
let inputs: Record<string, HTMLInputElement | HTMLSelectElement> = {};
let wave: Waveform | null = null;
/** Time range the walkthrough keeps bright, or null for no dimming. */
let focus: [number, number] | null = null;

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
  history.replaceState(history.state, '', `?${q}`);
}

// ---- UI ----

function buildControls() {
  controls.innerHTML = '';
  inputs = {};
  for (const param of proto.params) {
    const ctl = document.createElement('div');
    ctl.className = param.type === 'text' ? 'ctl wide' : 'ctl';
    const id = `ctl-${param.key}`;
    const head = Object.assign(document.createElement('div'), { className: 'ctl-head' });
    head.append(Object.assign(document.createElement('label'), { htmlFor: id, textContent: param.label }));
    // The explanation shows while the ? is hovered or focused, and stays open after a click or tap until dismissed.
    const help = Object.assign(document.createElement('p'), { className: 'ctl-help', id: `${id}-help`, textContent: param.help });
    help.setAttribute('role', 'tooltip');
    const tip = Object.assign(document.createElement('button'), { type: 'button', className: 'help-tip', textContent: '?' });
    tip.setAttribute('aria-label', `About ${param.label}`);
    tip.setAttribute('aria-describedby', help.id);
    tip.setAttribute('aria-expanded', 'false');
    tip.addEventListener('click', () => {
      const open = tip.getAttribute('aria-expanded') !== 'true';
      closeHelp();
      tip.setAttribute('aria-expanded', String(open));
    });
    for (const ev of ['mouseenter', 'focus', 'click']) tip.addEventListener(ev, () => requestAnimationFrame(() => keepOnScreen(help)));
    head.append(tip);
    ctl.append(head, help);

    let input: HTMLInputElement | HTMLSelectElement;
    if (param.type === 'select') {
      input = document.createElement('select');
      for (const o of param.options) input.append(new Option(o.label, o.value));
    } else {
      input = Object.assign(document.createElement('input'), {
        type: 'text', spellcheck: false, autocomplete: 'off', placeholder: param.placeholder ?? '',
      });
    }
    input.id = id;
    input.setAttribute('aria-describedby', help.id);
    input.value = params[param.key];
    inputs[param.key] = input;
    input.addEventListener('input', () => {
      params[param.key] = input.value;
      update(param.key);
    });
    ctl.append(input);
    controls.append(ctl);
  }
}

/** Shifts an open explanation left when it would run past the right edge of the screen. */
function keepOnScreen(help: HTMLElement) {
  help.style.left = '0';
  const over = help.getBoundingClientRect().right - (document.documentElement.clientWidth - 16);
  if (over > 0) help.style.left = `${-over}px`;
}

/**
 * Splits the settings into the fewest rows that fit, with the same number in each (the first rows take any extra),
 * so a setting never sits alone on a line. Phones use a fixed two-per-row grid instead, set in CSS.
 */
function balanceControls() {
  controls.querySelectorAll('.ctl-break').forEach((b) => b.remove());
  const items = [...controls.querySelectorAll<HTMLElement>(':scope > .ctl')];
  if (items.length < 2 || matchMedia('(max-width: 600px)').matches) return;
  for (let rows = 1; rows <= items.length; rows++) {
    const per = Math.ceil(items.length / rows);
    controls.querySelectorAll('.ctl-break').forEach((b) => b.remove());
    for (let i = per; i < items.length; i += per) {
      items[i - 1].after(Object.assign(document.createElement('div'), { className: 'ctl-break' }));
    }
    // It fits when every item sits on the same line as the first item of its row.
    const fits = items.every((el, i) => el.offsetTop === items[i - (i % per)].offsetTop);
    if (fits) return;
  }
}

/** Closes any setting explanation opened by a click or tap. */
function closeHelp() {
  for (const t of controls.querySelectorAll('.help-tip[aria-expanded="true"]')) t.setAttribute('aria-expanded', 'false');
}
document.addEventListener('click', (e) => {
  if (!(e.target as Element).closest('.help-tip')) closeHelp();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeHelp();
});

/** Pages already linked on this page. Only the first mention of each protocol becomes a link. */
const linked = new Set<string>();

/**
 * A paragraph of protocol text. Links to other pages are written [text](?p=id); only those internal links are
 * recognized, everything else is inserted as plain text, and a page that is already linked is shown as plain text.
 */
function paragraph(text: string) {
  const p = document.createElement('p');
  const re = /\[([^\]]+)\]\((\?p=[a-z0-9]+)\)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    p.append(text.slice(last, m.index));
    if (linked.has(m[2])) {
      p.append(m[1]);
    } else {
      linked.add(m[2]);
      const a = Object.assign(document.createElement('a'), { href: m[2], textContent: m[1] });
      a.setAttribute('data-nav', '');
      p.append(a);
    }
    last = m.index! + m[0].length;
  }
  p.append(text.slice(last));
  return p;
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

  const fig = EXTRAS[proto.id];
  extra.hidden = !fig;
  if (fig && extraFor !== proto.id) {
    $('#extra-title').textContent = fig.title;
    $('#extra-intro').textContent = fig.intro;
    fig.mount($('#extra-body'));
  }
  extraFor = fig ? proto.id : '';

  deep.hidden = !proto.deepDive?.length;
  deepBody.replaceChildren(...(proto.deepDive ?? []).map(({ title, body }) => {
    const topic = document.createElement('section');
    topic.append(Object.assign(document.createElement('h3'), { textContent: title }));
    for (const para of body) topic.append(paragraph(para));
    return topic;
  }));
}

function buildAll() {
  title.textContent = proto.name;
  fullName.textContent = proto.fullName ?? '';
  fullName.hidden = !proto.fullName;
  crumbCat.textContent = categoryOf(proto.id)?.name ?? '';
  // The summary can link to other pages, written [text](?p=id), like the deep dives.
  linked.clear();
  summary.replaceChildren(...paragraph(proto.summary).childNodes);
  usedIn.textContent = proto.usedIn;
  // Each tag searches the site for every protocol that shares it.
  tagList.replaceChildren(...proto.tags.map((tag) => {
    const b = Object.assign(document.createElement('button'), { type: 'button', className: 'tag-chip', textContent: tag });
    b.title = `Find other ${tag} protocols`;
    b.dataset.tag = tag;
    b.addEventListener('click', () => search.searchTag(tag));
    return b;
  }));
  buildSpecs();
  document.title = `${proto.name} · bitbang`;
  buildControls();
  balanceControls();
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
  hideTip();
  draw();
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
  $('#readout').innerHTML = readout(wave, drawn.divTime, proto.name);
  scopeAids.refresh();
  // Lit whenever the whole frame is on screen.
  zoomFit.setAttribute('aria-pressed', String(drawn.ppu <= drawn.allPpu + 0.01));
}

const scopeAids = mountScopeAids(scope, $('#readout'), () => (drawn && wave ? { ppu: drawn.ppu, duration: wave.duration, unitTime: wave.unitTime } : null));

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
  const frame = (now: number) => {
    const k = Math.min(1, (now - t0) / MOTION_MS);
    const e = easeInOut(k);
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
  holdCaptionHeight(on) {
    stepInfo.style.minHeight = '';
    if (!on) return;
    // Measure every caption in this tour in an invisible copy of the box, and hold the tallest height.
    const probe = stepInfo.cloneNode(false) as HTMLElement;
    probe.removeAttribute('id');
    probe.setAttribute('aria-hidden', 'true');
    Object.assign(probe.style, { position: 'absolute', visibility: 'hidden', left: '0', top: '0', width: `${stepInfo.offsetWidth}px` });
    instrument.append(probe);
    let tallest = stepInfo.offsetHeight;
    for (const stop of wave?.tour ?? []) {
      probe.replaceChildren(tourNode(stop.text));
      tallest = Math.max(tallest, probe.offsetHeight);
    }
    probe.remove();
    stepInfo.style.minHeight = `${tallest}px`;
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

function setZoom(next: number | 'all') {
  if (!drawn) return;
  const center = (scope.scrollLeft + scope.clientWidth / 2 - GUTTER) / drawn.ppu;
  zoom = next !== 'all' && Math.abs(next - drawn.allPpu) < 0.5 ? 'all' : next;
  update();
  scope.scrollLeft = GUTTER + center * drawn.ppu - scope.clientWidth / 2;
}

/** Zooming out stops once the whole frame is on screen; zooming further out would only add empty space. */
const clampZoom = (z: number) => Math.min(200, Math.max(drawn?.allPpu ?? 6, z));
zoomIn.addEventListener('click', () => drawn && setZoom(clampZoom(drawn.ppu * 1.5)));
zoomOut.addEventListener('click', () => drawn && setZoom(clampZoom(drawn.ppu / 1.5)));
zoomFit.addEventListener('click', () => setZoom('all'));

// ---- hover tooltip ----

function showTip(bit: Bit | null, cell: Element | null) {
  if (!bit || !cell || !wave) return hideTip();
  const lane = wave.traces.length > 1 ? `${wave.traces[bit.lane].name} ` : '';
  tooltip.innerHTML = '';
  tooltip.append(
    Object.assign(document.createElement('span'), { className: `tag k-${bit.kind}`, textContent: lane + bit.label }),
    ` ${bit.info.split('. ')[0].replace(/\.$/, '')}.`,
    Object.assign(document.createElement('span'), { className: 'at', textContent: `at ${formatTime(bit.t0 * wave.unitTime)}` }),
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

let copyReset = 0;
copyBtn.addEventListener('click', async () => {
  // Hold the button's width, so "Copied" doesn't shift the buttons beside it.
  copyBtn.style.minWidth = `${copyBtn.offsetWidth}px`;
  clearTimeout(copyReset);
  try {
    await navigator.clipboard.writeText(location.href);
    copyBtn.textContent = 'Copied';
  } catch {
    copyBtn.textContent = 'Copy failed';
  }
  copyReset = setTimeout(() => (copyBtn.textContent = 'Copy link'), 1500);
});

const HINT = '<p class="hint">Click a bit, or use <kbd>←</kbd> <kbd>→</kbd> to walk through the frame.</p>';

const tourNode = (text: string) => Object.assign(document.createElement('p'), { className: 'tour-text', textContent: text });

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
  stepInfo.replaceChildren(...stepNodes(step, wave!.traces.map((t) => t.name)));
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
  resizeTimer = window.setTimeout(() => {
    if (vizView.hidden) return;
    balanceControls();
    update();
  }, 150);
});

// ---- routing: ?p=<id> shows that protocol; anything else (including no ?p) shows the guide ----

const nav = mountNav($('#tabs'), $('#side'), $('#pager'));
const search = mountSearch($('#top-search'));
mountThemeToggle($<HTMLButtonElement>('#theme'));
mountProgress();

// The feedback address is put together here rather than written in the page, so simple scrapers can't harvest it.
// Without JavaScript the link falls back to GitHub issues.
$<HTMLAnchorElement>('#feedback').href = `mailto:${['feedback', 'bitbang.fyi'].join('@')}?subject=${encodeURIComponent('[BITBANG FEEDBACK] ')}`;

mountGuide(guideView);
mountAbout(aboutView);
mountChangelog(changelogView);
const home = mountHome(homeView);

function route() {
  const q = new URLSearchParams(location.search);
  const id = q.get('p') ?? '';
  const p = protocols.find((x) => x.id === id);
  const topic = p ? undefined : topics[id];
  const wipCat = p || topic ? undefined : [...catalog, ...bitTopics, ...memoryTopics, ...concurrencyTopics].find((c) => c.entries.some((e) => e.id === id && e.wip));
  const wip = wipCat?.entries.find((e) => e.id === id);
  const page = p ? 'viz' : topic ? 'topic' : wip ? 'wip' : id === 'basics' ? 'guide' : id === 'about' ? 'about' : id === 'changelog' ? 'changelog' : 'home';
  const views = { viz: vizView, wip: wipView, guide: guideView, about: aboutView, changelog: changelogView, home: homeView, topic: topicView };
  for (const [k, v] of Object.entries(views)) v.hidden = k !== page;
  // The home page, About and the changelog belong to no section, so they have no sidebar.
  const inSection = page !== 'home' && page !== 'about' && page !== 'changelog';
  nav.show(inSection ? id : null);
  showResources(inSection ? id : null);
  $('#shell').classList.toggle('no-side', !inSection);
  if (page !== 'viz') {
    stop();
    tour.stop();
  }
  if (wip) {
    const isProtocol = catalog.includes(wipCat!);
    $('#wip-cat').textContent = wipCat!.name;
    $('#wip-name').textContent = wip.name;
    $('#wip-text').textContent = wip.wip!;
    $('#wip-note').textContent = isProtocol
      ? 'An interactive diagram for this protocol is in progress. In the meantime, the related pages below cover the parts it shares with other protocols.'
      : 'An interactive page for this topic is in progress.';
    const related = isProtocol ? ['usb', 'pcie'].filter((x) => protocols.some((y) => y.id === x)) : [];
    $('#wip-links').innerHTML = related
      .map((x) => `<a href="?p=${x}" data-nav>${esc(protocols.find((y) => y.id === x)!.name)}</a>`).join('');
    document.title = `${wip.name} · bitbang`;
  } else if (topic) {
    if (topicShown !== id) {
      topic(topicView);
      topicShown = id;
    }
    document.title = `${topicView.querySelector('h1')?.textContent ?? ''} · bitbang`;
  } else if (page === 'guide') {
    document.title = 'How protocols work · bitbang';
  } else if (page === 'about') {
    document.title = 'About · bitbang';
  } else if (page === 'changelog') {
    document.title = 'Changelog · bitbang';
  } else if (page === 'home') {
    document.title = 'bitbang';
    home.show();
  } else if (p) {
    if (p !== proto) tour.stop();
    readUrl(q, p);
    buildAll();
  }
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}

/** The "Related resources" list at the bottom of every page in a section, grouped by kind. */
function showResources(id: string | null) {
  const box = $('#resources');
  box.hidden = !id;
  if (!id) return;
  const list = RESOURCES[id] ?? [];
  const kinds = [...new Set(list.map((r) => r.kind))];
  box.innerHTML = '<h2 id="resources-title">Related resources</h2>' + (list.length
    ? kinds.map((k) => `<h3>${esc(k)}</h3><ul>${list.filter((r) => r.kind === k).map((r) =>
        `<li><a href="${esc(r.url)}" rel="noopener" target="_blank">${esc(r.title)}</a>${r.note ? ` <span>${esc(r.note)}</span>` : ''}</li>`).join('')}</ul>`).join('')
    : '<p class="resources-empty">Specifications, datasheets and other sources for this page will be listed here.</p>');
}

// In-site links swap views without a page load; the back button still works and returns to where the reader was.
// Each history entry remembers its scroll position, saved just before leaving it.
history.scrollRestoration = 'manual';
const saveScroll = () => history.replaceState({ ...history.state, y: window.scrollY }, '', location.href);
const restoreScroll = () => window.scrollTo({ top: history.state?.y ?? 0, behavior: 'instant' as ScrollBehavior });
document.addEventListener('click', (e) => {
  const a = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>('a[data-nav]') : null;
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  clearTimeout(scrollSave);
  saveScroll();
  history.pushState(null, '', a.href);
  current = -1;
  zoom = 'fit';
  window.scrollTo(0, 0);
  route();
});
window.addEventListener('popstate', () => {
  clearTimeout(scrollSave);
  route();
  restoreScroll();
});
// Back and forward switch entries before telling the page, so the position is saved as the reader scrolls (shortly
// after they stop, since browsers limit how often history can be rewritten). It also covers a reload.
let scrollSave = 0;
window.addEventListener('scroll', () => {
  clearTimeout(scrollSave);
  scrollSave = setTimeout(saveScroll, 150);
}, { passive: true });
window.addEventListener('pagehide', saveScroll);

route();
// The home page's opening plays from the top, so only other pages restore a saved position on load.
if (new URLSearchParams(location.search).has('p')) restoreScroll();
// The first page is built: show the content and footer, now that the footer has its real position.
document.documentElement.classList.remove('loading');
