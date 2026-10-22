/**
 * Shared pieces of the debugger view used by the Bits and bytes pages: the window, a code pane paused on a line,
 * rows of bits, and keeping the page's state in the URL.
 */
import { esc } from '../core/render';

/** C source as HTML: comments, types and keywords, and numbers each get a color. */
export function highlight(code: string) {
  return code.split('\n').map((line) => {
    const at = line.indexOf('//');
    const src = at < 0 ? line : line.slice(0, at);
    const body = esc(src)
      .replace(/\b(u?int(8|16|32)_t|int|float|void|if|return|volatile|sizeof)\b/g, '<span class="c-type">$1</span>')
      .replace(/\b(0x[0-9A-Fa-f]+u?|0b[01]+|\d+(\.\d+)?f?u?)\b/g, '<span class="c-num">$1</span>')
      .replace(/(#include)/g, '<span class="c-type">$1</span>');
    return at < 0 ? body : `${body}<span class="c-comment">${esc(line.slice(at))}</span>`;
  }).join('\n');
}

interface DbgWindow {
  file: string;
  controls: string;
  body: string;
  /** Names the window for screen readers, and an extra class, when a page has more than one. */
  label?: string;
  cls?: string;
}

/** A debugger window: file name and controls, then the code pane above the variables, then the status line. */
export const debuggerWindow = (o: DbgWindow) => `
    <section class="debugger${o.cls ? ` ${o.cls}` : ''}" aria-label="${esc(o.label ?? 'Debugger')}">
      <header class="dbg-bar">
        <span class="dbg-file">${esc(o.file)}</span>
        <span class="dbg-state"><i aria-hidden="true"></i>Paused</span>
        <div class="dbg-controls">${o.controls}</div>
      </header>
      <div class="dbg-body stacked">
        <pre class="dbg-code" aria-label="Source"><code></code></pre>
        <div class="dbg-vars"><h3>Variables</h3>${o.body}</div>
      </div>
      <p class="dbg-status" aria-live="polite"></p>
    </section>`;

/** The page: crumbs, title and intro, then the debugger window, then anything after it. */
export const page = (o: DbgWindow & { crumbs: string; title: string; intro: string; after?: string }) => `
    <section class="intro">
      <p class="crumbs">${esc(o.crumbs)}</p>
      <h1>${esc(o.title)}</h1>
      <p>${o.intro}</p>
    </section>
    ${debuggerWindow(o)}
    ${o.after ?? ''}`;

/** Shows `text` in the window's value box, unless the reader is typing in it. */
export function showValue(root: HTMLElement, text: string) {
  const input = root.querySelector<HTMLInputElement>('.dbg-set input')!;
  if (document.activeElement !== input) input.value = text;
}

/** Fills the code pane with `lines`, numbered from `first`, with the paused line `pc` marked. */
export function code(root: HTMLElement, lines: string[], pc: number, first = 1) {
  root.querySelector('.dbg-code code')!.innerHTML = lines.map((l, n) =>
    `<span class="ln${n === pc ? ' pc' : ''}"><span class="gutter">${n + first}</span>${highlight(l) || ' '}</span>`).join('');
}

/** Bit `i` of `v` (up to 32 bits). */
export const bit = (v: number, i: number) => (v >>> i) & 1;

export interface BitOpts {
  /** Clickable, to flip the bit. */
  editable?: boolean;
  /** Bits that changed since the last edit. */
  flipped?: (i: number) => boolean;
  /** Where to draw a binary point: after bit `point` (between it and the bit below). */
  point?: number;
  /** A small label under bit i, such as its place value. */
  under?: (i: number) => string;
  /** What bit i means, shown in the status line while the pointer is over it. */
  tip?: (i: number) => string;
  /** How to group the bits, most significant group first. Defaults to groups of four, one hex digit each. */
  groups?: BitGroup[];
  /** Bits that came from outside the value, such as zeros shifted in, drawn with a dashed outline. */
  fill?: (i: number) => boolean;
}

export interface BitGroup {
  hi: number;
  lo: number;
  /** A name above the group, such as "exponent". */
  head?: string;
  /** A label below the group, such as its hex digit. */
  foot?: string;
  /** Inside a long group, leave a small gap every `split` bits, counted from the group's low end. */
  split?: number;
}

/** Groups of four bits, most significant first, each footed with its hex digit if `hexDigits` is set. */
export const nibbles = (v: number, width: number, hexDigits = false): BitGroup[] =>
  Array.from({ length: width / 4 }, (_, k) => {
    const lo = width - 4 * (k + 1);
    return { hi: lo + 3, lo, foot: hexDigits ? ((v >>> lo) & 0xf).toString(16).toUpperCase() : undefined };
  });

/**
 * A row of bits, most significant first. Each bit is a column: the cell, then its label underneath, so labels always
 * line up with their bits. Groups can carry a name above and a label below. `name` identifies the row for clicks.
 */
export function bits(name: string, v: number, width: number, o: BitOpts = {}) {
  const groups = o.groups ?? nibbles(v, width);
  const dense = width > 16 ? ' dense' : '';
  return `<div class="bitrow${o.editable ? ' editable' : ''}${dense}">${groups.map((g) => {
    const cols: string[] = [];
    for (let i = g.hi; i >= g.lo; i--) {
      const on = bit(v, i) === 1;
      const cls = ['bit', on ? 'on' : '', o.flipped?.(i) ? 'flipped' : '', o.fill?.(i) ? 'fill' : '', o.point === i ? 'point' : ''].filter(Boolean).join(' ');
      const tip = o.tip ? ` data-tip="${esc(o.tip(i))}"` : '';
      const gap = g.split && i > g.lo && (i - g.lo) % g.split === 0 ? ' gap' : '';
      cols.push(`<span class="col${gap}"><button type="button" class="${cls}" data-row="${name}" data-bit="${i}"${tip}${
        o.editable ? '' : ' tabindex="-1" aria-disabled="true"'} aria-label="${name} bit ${i}, ${on ? 1 : 0}${o.editable ? '. Click to flip.' : ''}">${
        on ? 1 : 0}</button>${o.under ? `<small>${o.under(i)}</small>` : ''}</span>`);
    }
    // Each run between split gaps is one chunk, so on a narrow screen a long field wraps between nibbles, never inside one.
    const chunks: string[] = [];
    let run = '';
    cols.forEach((c) => {
      run += c;
      if (c.startsWith('<span class="col gap"')) (chunks.push(run), (run = ''));
    });
    if (run) chunks.push(run);
    return `<span class="grp">${g.head !== undefined ? `<span class="grp-head">${esc(g.head)}</span>` : ''}<span class="grp-cells">${
      chunks.map((c) => `<span class="chunk">${c}</span>`).join('')}</span>${g.foot !== undefined ? `<span class="grp-foot">${esc(g.foot)}</span>` : ''}</span>`;
  }).join('')}</div>`;
}

/** How long the pointer may sit between two hover targets before the text resets, so the gaps don't flash it. */
export const HOVER_GRACE = 150;

/**
 * While the pointer is over a bit that has a tip, the status line explains it; moving away restores what was there.
 * Crossing the gap between two bits keeps the tip, so the old text does not flash in between.
 */
export function hoverTips(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('.debugger').forEach((dbg) => {
    const status = dbg.querySelector<HTMLElement>('.dbg-status')!;
    let saved: string | null = null;
    let timer: number | undefined;
    const restore = () => {
      timer = undefined;
      if (saved === null) return;
      status.innerHTML = saved;
      saved = null;
    };
    dbg.addEventListener('pointerover', (e) => {
      const b = (e.target as Element).closest<HTMLElement>('.bit[data-tip]');
      if (!b) return;
      clearTimeout(timer);
      if (saved === null) saved = status.innerHTML;
      status.textContent = b.dataset.tip!;
    });
    dbg.addEventListener('pointerout', (e) => {
      const to = (e as PointerEvent).relatedTarget as Element | null;
      if (saved === null || to?.closest?.('.bit[data-tip]')) return;
      clearTimeout(timer);
      timer = window.setTimeout(restore, HOVER_GRACE);
    });
    // A click changes the status on purpose; keep that instead of restoring the old text.
    dbg.addEventListener('click', () => { clearTimeout(timer); saved = null; });
  });
}

/** Common page plumbing: render the page, draw it, and explain bits on hover. */
export function wire(root: HTMLElement, html: string, draw: () => void) {
  root.innerHTML = html;
  draw();
  hoverTips(root);
}

/** Sets the status line under the window. */
export const status = (root: HTMLElement, html: string) => (root.querySelector('.dbg-status')!.innerHTML = html);

/** One variable in the Variables pane: name and type, value, then its bits. */
export const row = (name: string, type: string, value: string, bitsHtml: string, changed = false) => `
  <tr class="${changed ? 'changed' : ''}"><th scope="row"><code>${name}</code> <small>${type}</small></th>
  <td class="val">${value}</td><td>${bitsHtml}</td></tr>`;

/** A variable too wide for one line (32 bits): its name and value, then its bits on a full-width line below. */
export const wideRow = (name: string, type: string, value: string, bitsHtml: string, changed = false) => `
  <tr class="${changed ? 'changed' : ''} head-of-wide"><th scope="row"><code>${name}</code> <small>${type}</small></th>
  <td class="val" colspan="2">${value}</td></tr>
  <tr class="${changed ? 'changed' : ''}"><td colspan="3" class="wide-bits">${bitsHtml}</td></tr>`;

export const table = (rows: string) => `<table class="vars"><tbody>${rows}</tbody></table>`;

/** Marks the bits that differ from the previous value, as a debugger does after a step. */
export const flips = (last: number | null, v: number) => (i: number) => last !== null && bit(last, i) !== bit(v, i);

/** A segmented control: one radio button per option, each carrying `data-<key>` with its value. */
export const seg = (key: string, label: string, options: [string, string][]) =>
  `<div class="dbg-seg" role="radiogroup" aria-label="${esc(label)}">${options.map(([v, text]) =>
    `<button type="button" role="radio" data-${key}="${v}">${text}</button>`).join('')}</div>`;

/** Marks the segmented control's current option. */
export function markSeg(root: HTMLElement, key: string, value: string) {
  root.querySelectorAll<HTMLElement>(`[data-${key}]`).forEach((b) => b.setAttribute('aria-checked', String(b.dataset[key] === value)));
}

/** Two hex digits, as the URL and the listings write a byte. */
export const hex2 = (v: number) => v.toString(16).toUpperCase().padStart(2, '0');

/** A setting from the URL, if it is one of `all`; otherwise `d`. */
export const oneOf = <T extends string>(k: string, all: readonly T[], d: T): T => {
  const v = new URLSearchParams(location.search).get(k) as T | null;
  return v !== null && all.includes(v) ? v : d;
};

export const NUMBER_HELP = 'in decimal, hex (0x…) or binary (0b…)';

/** A line of C with a comment lined up at column `col`, or two spaces after the code if it is longer. */
export const note = (line: string, comment: string, col = 40) => `${line.length + 2 > col ? `${line}  ` : line.padEnd(col)}// ${comment}`;

/** Superscript digits, for powers of two such as 2⁻³. */
export const sup = (n: number) => String(n).replace(/-/g, '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+d]);

/** Writes the page's state into the URL without adding history, so a link reproduces it. */
export function syncUrl(values: Record<string, string>) {
  const u = new URL(location.href);
  for (const [k, v] of Object.entries(values)) u.searchParams.set(k, v);
  history.replaceState(history.state, '', u);
}

/** Reads an integer from the URL in hex, or returns `d` when missing or out of range. */
export function readHex(k: string, d: number, max: number) {
  const v = parseInt(new URLSearchParams(location.search).get(k) ?? '', 16);
  return Number.isInteger(v) && v >= 0 && v <= max ? v : d;
}

/** Parses what a reader typed: 0x… hex, 0b… binary, or decimal (with a sign). Returns null if it is not a number. */
export function parseNumber(s: string): number | null {
  const t = s.trim().replace(/_/g, '').toLowerCase();
  const n = /^[+-]?0x[0-9a-f]+$/.test(t) ? parseInt(t, 16)
    : /^[+-]?0b[01]+$/.test(t) ? (t.startsWith('-') ? -1 : 1) * parseInt(t.replace(/^[+-]?0b/, ''), 2)
    : /^[+-]?\d+$/.test(t) ? parseInt(t, 10) : NaN;
  return Number.isFinite(n) ? n : null;
}

export const hexN = (v: number, width: number) => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(width / 4, '0');
export const binN = (v: number, width: number) => ((v >>> 0).toString(2).padStart(width, '0').match(/.{4}/g) ?? []).join(' ');

/** Back / Step / Play / Restart: the controls every stepped walkthrough shares, drawn in the panel's button class. */
export const stepButtons = (cls = 'dbg-btn') => `
  <button type="button" class="${cls}" data-act="back">Back</button>
  <button type="button" class="${cls} primary" data-act="step">Step</button>
  <button type="button" class="${cls}" data-act="play">Play</button>
  <button type="button" class="${cls}" data-act="restart">Restart</button>`;

/**
 * Wires the shared walkthrough controls. `go(i)` shows step i; Play steps on a timer, pausing long enough to read each
 * explanation, until the last step. Any other click on the page pauses it. Call `sync()` after drawing to disable Back
 * and Step at the ends.
 */
export function walkthrough(root: HTMLElement, o: { count: () => number; at: () => number; go: (i: number) => void }) {
  let timer: number | undefined;
  const btn = (a: string) => root.querySelector<HTMLButtonElement>(`[data-act="${a}"]`)!;
  const last = () => o.at() >= o.count() - 1;
  const stop = () => {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
    btn('play').textContent = 'Play';
  };
  const text = () => root.querySelector('.dbg-status, .dg-status')?.textContent ?? '';
  const dwell = () => Math.min(8000, 1600 + text().length * 42);
  const tick = () => {
    // The reader may have moved to another page while playing; stop once this one is gone.
    if (!root.isConnected || last()) return stop();
    o.go(o.at() + 1);
    timer = window.setTimeout(tick, dwell());
  };
  root.addEventListener('click', (e) => {
    const act = (e.target as Element).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'play') {
      if (timer !== undefined) return stop();
      if (last()) o.go(0);
      btn('play').textContent = 'Pause';
      timer = window.setTimeout(tick, dwell());
      return;
    }
    stop();
    if (act === 'step') o.go(Math.min(o.at() + 1, o.count() - 1));
    else if (act === 'back') o.go(Math.max(o.at() - 1, 0));
    else if (act === 'restart') o.go(0);
  });
  return {
    stop,
    sync() {
      btn('back').disabled = o.at() === 0;
      btn('step').disabled = last();
    },
  };
}
