/**
 * Shared pieces of the debugger view used by the bit manipulation pages: the window, a code pane paused on a line,
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

/** The page: crumbs, title and intro, then the debugger window, then anything after it. */
export function page(o: { crumbs: string; title: string; intro: string; file: string; controls: string; body: string; after?: string }) {
  return `
    <section class="intro">
      <p class="crumbs">${esc(o.crumbs)}</p>
      <h1>${esc(o.title)}</h1>
      <p>${o.intro}</p>
    </section>
    <section class="debugger" aria-label="Debugger">
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
    </section>
    ${o.after ?? ''}`;
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
      const cls = ['bit', on ? 'on' : '', o.flipped?.(i) ? 'flipped' : '', o.point === i ? 'point' : ''].filter(Boolean).join(' ');
      const tip = o.tip ? ` data-tip="${esc(o.tip(i))}"` : '';
      const gap = g.split && i > g.lo && (i - g.lo) % g.split === 0 ? ' gap' : '';
      cols.push(`<span class="col${gap}"><button type="button" class="${cls}" data-row="${name}" data-bit="${i}"${tip}${
        o.editable ? '' : ' tabindex="-1" aria-disabled="true"'} aria-label="${name} bit ${i}, ${on ? 1 : 0}${o.editable ? '. Click to flip.' : ''}">${
        on ? 1 : 0}</button>${o.under ? `<small>${o.under(i)}</small>` : ''}</span>`);
    }
    return `<span class="grp">${g.head !== undefined ? `<span class="grp-head">${esc(g.head)}</span>` : ''}<span class="grp-cells">${
      cols.join('')}</span>${g.foot !== undefined ? `<span class="grp-foot">${esc(g.foot)}</span>` : ''}</span>`;
  }).join('')}</div>`;
}

/**
 * While the pointer is over a bit that has a tip, the status line explains it; moving away restores what was there.
 */
export function hoverTips(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('.debugger').forEach((dbg) => {
    const status = dbg.querySelector<HTMLElement>('.dbg-status')!;
    let saved: string | null = null;
    dbg.addEventListener('pointerover', (e) => {
      const b = (e.target as Element).closest<HTMLElement>('.bit[data-tip]');
      if (!b) return;
      if (saved === null) saved = status.innerHTML;
      status.textContent = b.dataset.tip!;
    });
    dbg.addEventListener('pointerout', (e) => {
      const to = (e as PointerEvent).relatedTarget as Element | null;
      if (saved === null || to?.closest?.('.bit[data-tip]')) return;
      status.innerHTML = saved;
      saved = null;
    });
    // A click changes the status on purpose; keep that instead of restoring the old text.
    dbg.addEventListener('click', () => (saved = null));
  });
}

/** Superscript digits, for powers of two such as 2⁻³. */
export const sup = (n: number) => String(n).replace(/-/g, '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+d]);

/** Writes the page's state into the URL without adding history, so a link reproduces it. */
export function syncUrl(values: Record<string, string>) {
  const u = new URL(location.href);
  for (const [k, v] of Object.entries(values)) u.searchParams.set(k, v);
  history.replaceState(null, '', u);
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
