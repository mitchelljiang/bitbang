import type { Bit, Level, Trace, Waveform } from './types';
import { formatTime } from './util';

export const GUTTER = 64;
const TOP = 30;
const LANE_H = 44;
const ROW_H = 24;
const GAP = 18;
const NOTE_H = 22;
/** Below this, "fit" would be unreadable (e.g. on a phone), so we scroll instead. */
const MIN_FIT_PPU = 22;

/** Bits that start at the same moment are stepped through together (e.g. MOSI and MISO in SPI). */
export interface Step {
  t0: number;
  t1: number;
  bits: Bit[];
}

export function groupSteps(bits: Bit[]): Step[] {
  const sorted = [...bits].sort((a, b) => a.t0 - b.t0 || a.lane - b.lane);
  const steps: Step[] = [];
  for (const bit of sorted) {
    const last = steps[steps.length - 1];
    if (last && last.t0 === bit.t0) {
      last.bits.push(bit);
      last.t1 = Math.max(last.t1, bit.t1);
    } else {
      steps.push({ t0: bit.t0, t1: bit.t1, bits: [bit] });
    }
  }
  return steps;
}

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function levelAt(trace: Trace, t: number): Level {
  let v = trace.points[0].v;
  for (const p of trace.points) {
    if (p.t > t) break;
    v = p.v;
  }
  return v;
}

/** Rough width of monospace text at 11px, to decide whether a label fits in its cell. */
const fits = (label: string, width: number) => label.length * 6.8 + 6 <= width;

/** Time an open-drain line takes to rise, in protocol units; shortened if the next edge comes sooner. */
const RISE = 0.2;
const rank = (v: Level) => (v === 0 ? 0 : v === 'z' ? 1 : 2);

function riseTime(trace: Trace, i: number) {
  const next = trace.points[i + 1];
  return next ? Math.min(RISE, (next.t - trace.points[i].t) * 0.8) : RISE;
}

/**
 * SVG path for a trace. Push-pull lines are drawn as square waves. Open-drain lines fall sharply but rise along
 * an RC charging curve (the "shark fin"), because only a pull-up resistor brings them back high.
 */
function tracePath(trace: Trace, duration: number, x: (t: number) => number, y: (v: Level) => number) {
  const pts = trace.points;
  let d = `M ${x(0)} ${y(pts[0].v)}`;
  for (let i = 1; i < pts.length; i++) {
    const { t, v } = pts[i];
    d += ` H ${x(t)}`;
    if ((trace.openDrain || pts[i].soft) && rank(v) > rank(pts[i - 1].v)) {
      const y0 = y(pts[i - 1].v);
      const y1 = y(v);
      const w = x(t + riseTime(trace, i)) - x(t);
      for (let k = 1; k <= 12; k++) {
        const s = k / 12;
        d += ` L ${x(t) + s * w} ${y0 + (y1 - y0) * ((1 - Math.exp(-5 * s)) / (1 - Math.exp(-5)))}`;
      }
    } else {
      d += ` V ${y(v)}`;
    }
  }
  return d + ` H ${x(duration)}`;
}

/** Where an edge visibly reaches its new level: the end of the curve for an open-drain rise, otherwise the edge itself. */
function edgeEnd(trace: Trace, t: number) {
  const i = trace.points.findIndex((p) => p.t === t);
  const p = trace.points[i];
  if (i > 0 && (trace.openDrain || p.soft) && rank(p.v) > rank(trace.points[i - 1].v)) return t + riseTime(trace, i);
  return t;
}

export interface RenderOptions {
  /** Pixels per time unit, or 'fit' to fill the available width. */
  zoom: number | 'fit';
  onPick(step: number): void;
  onHover(bit: Bit | null, cell: Element | null): void;
}

export interface Rendered {
  select(step: Step | null): void;
  ppu: number;
  fitPpu: number;
}

/** Draws the waveform as SVG into `host`. */
export function render(host: HTMLElement, w: Waveform, steps: Step[], opts: RenderOptions): Rendered {
  const fitPpu = Math.max(w.minPpu ?? MIN_FIT_PPU, (host.clientWidth - GUTTER - 16) / w.duration);
  const ppu = opts.zoom === 'fit' ? fitPpu : opts.zoom;
  const x = (t: number) => GUTTER + t * ppu;
  const width = Math.ceil(x(w.duration) + 8);

  // Lay out each lane: the trace, then an optional bit row and field row.
  const notes = w.notes ?? [];
  const layout = w.traces.map(() => ({ y: 0, bitY: -1, fieldY: -1, noteY: -1 }));
  let y = TOP;
  w.traces.forEach((_, i) => {
    if (notes.some((n) => n.lane === i)) { layout[i].noteY = y; y += NOTE_H; }
    layout[i].y = y;
    y += LANE_H;
    if (w.bits.some((b) => b.lane === i)) { layout[i].bitY = y; y += ROW_H; }
    if (w.fields.some((f) => f.lane === i)) { layout[i].fieldY = y; y += ROW_H; }
    y += GAP;
  });
  const height = y - GAP + 8;
  const yOf = (lane: number, v: Level) => {
    const ly = layout[lane].y;
    return v === 'z' ? ly + LANE_H / 2 : v ? ly + 6 : ly + LANE_H - 6;
  };

  const parts: string[] = [];
  parts.push(`<rect id="sel" class="sel" x="0" y="0" width="0" height="${height}" visibility="hidden"/>`);

  // Ruler: a tick per unit (or fewer when zoomed out), with labels spaced to stay readable.
  const tickEvery = ppu < 6 ? Math.ceil(6 / ppu) : 1;
  const labelEvery = Math.max(tickEvery, Math.ceil(70 / ppu / tickEvery) * tickEvery);
  for (let u = 0; u <= Math.floor(w.duration); u += tickEvery) {
    const labeled = u % labelEvery === 0;
    parts.push(`<line class="tick${labeled ? ' major' : ''}" x1="${x(u)}" x2="${x(u)}" y1="${TOP - (labeled ? 10 : 5)}" y2="${height}"/>`);
    if (labeled) parts.push(`<text class="ruler" x="${x(u) + 3}" y="${TOP - 14}">${formatTime(u * w.unitTime)}</text>`);
  }

  w.traces.forEach((trace, i) => {
    const ly = layout[i].y;
    parts.push(`<text class="lane-name" x="8" y="${ly + LANE_H / 2 + 4}">${esc(trace.name)}</text>`);
    if (trace.levels) {
      const [lo, hi] = trace.levels;
      parts.push(
        `<text class="level" x="${GUTTER - 6}" y="${yOf(i, 1) + 3}">${esc(hi)}</text>` +
        `<text class="level" x="${GUTTER - 6}" y="${yOf(i, 0) + 3}">${esc(lo)}</text>`,
      );
    }
    parts.push(`<path class="trace" d="${tracePath(trace, w.duration, x, (v) => yOf(i, v))}"/>`);
  });

  // Callouts: a label above the lane with a thin leader down to the wire. Skipped when it would overlap the previous one.
  const noteEnd = new Map<number, number>();
  for (const n of [...notes].sort((a, b) => a.t - b.t)) {
    const nx = x(n.t);
    const textW = n.text.length * 6.2;
    const anchorEnd = nx + textW > width - 4;
    const left = anchorEnd ? nx - textW : nx;
    if (left < (noteEnd.get(n.lane) ?? 0) + 10) continue;
    noteEnd.set(n.lane, left + textW);
    const ny = layout[n.lane].noteY;
    // Point at the top corner of the edge (or at the wire, if nothing changes there).
    const trace = w.traces[n.lane];
    const before = yOf(n.lane, levelAt(trace, n.t - 1e-6));
    const after = yOf(n.lane, levelAt(trace, n.t));
    const tipX = before > after ? x(edgeEnd(trace, n.t)) : nx;
    const tipY = Math.min(before, after);
    const textX = anchorEnd ? tipX + 4 : tipX - 4;
    parts.push(
      `<g class="note"><line x1="${tipX}" x2="${tipX}" y1="${ny + NOTE_H - 4}" y2="${tipY - 3}"/>` +
      `<circle cx="${tipX}" cy="${tipY}" r="2.5"/>` +
      `<text x="${textX}" y="${ny + NOTE_H - 8}" text-anchor="${anchorEnd ? 'end' : 'start'}">${esc(n.text)}</text></g>`,
    );
  }

  // Sample points: a dot on the wire where the receiver reads each bit.
  for (const bit of w.bits) {
    if (bit.sample === undefined) continue;
    const ly = layout[bit.lane].y;
    const sx = x(bit.sample);
    if (ppu >= 14) parts.push(`<line class="sample" x1="${sx}" x2="${sx}" y1="${ly}" y2="${ly + LANE_H}"/>`);
    parts.push(`<circle class="sample-dot" cx="${sx}" cy="${yOf(bit.lane, levelAt(w.traces[bit.lane], bit.sample))}" r="${ppu >= 14 ? 3 : 2}"/>`);
  }

  const stepOf = new Map<Bit, number>();
  steps.forEach((s, i) => s.bits.forEach((b) => stepOf.set(b, i)));

  w.bits.forEach((bit, n) => {
    const ry = layout[bit.lane].bitY;
    const bx = x(bit.t0) + 1;
    const bw = Math.max(1, (bit.t1 - bit.t0) * ppu - 2);
    // Narrow cells fall back to the first letter (ACK → A), then to no label.
    const text = fits(bit.label, bw) ? bit.label : fits(bit.label[0], bw) ? bit.label[0] : '';
    const label = text ? `<text x="${bx + bw / 2}" y="${ry + ROW_H / 2 + 4}">${esc(text)}</text>` : '';
    parts.push(
      `<g class="cell k-${bit.kind}${bit.by ? ' by-' + bit.by : ''}" data-step="${stepOf.get(bit)}" data-bit="${n}">` +
      `<rect x="${bx}" y="${ry + 2}" width="${bw}" height="${ROW_H - 4}" rx="2"/>${label}</g>`,
    );
  });

  for (const f of w.fields) {
    const ry = layout[f.lane].fieldY;
    const fx = x(f.t0) + 1;
    const fw = (f.t1 - f.t0) * ppu - 2;
    const label = fits(f.label, fw) ? f.label : fits(f.label.split(' ')[0], fw) ? f.label.split(' ')[0] : '';
    parts.push(
      `<g class="field k-${f.kind}"><rect x="${fx}" y="${ry + 2}" width="${fw}" height="${ROW_H - 4}" rx="2"/>` +
      (label ? `<text x="${fx + fw / 2}" y="${ry + ROW_H / 2 + 4}">${esc(label)}</text>` : '') + `</g>`,
    );
  }

  host.innerHTML =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" ` +
    `role="img" aria-label="Waveform of ${w.traces.map((t) => t.name).join(', ')}">${parts.join('')}</svg>`;

  const svg = host.querySelector('svg')!;
  const cellOf = (e: Event) => (e.target as Element).closest('.cell') as SVGGElement | null;
  svg.addEventListener('click', (e) => {
    const cell = cellOf(e);
    if (cell) opts.onPick(+cell.dataset.step!);
  });
  svg.addEventListener('pointerover', (e) => {
    const cell = cellOf(e);
    opts.onHover(cell ? w.bits[+cell.dataset.bit!] : null, cell);
  });
  svg.addEventListener('pointerleave', () => opts.onHover(null, null));

  const sel = svg.querySelector('#sel') as SVGRectElement;
  return {
    ppu,
    fitPpu,
    select(step) {
      svg.querySelectorAll('.cell.active').forEach((c) => c.classList.remove('active'));
      if (!step) {
        sel.setAttribute('visibility', 'hidden');
        return;
      }
      sel.setAttribute('visibility', 'visible');
      sel.setAttribute('x', `${x(step.t0)}`);
      sel.setAttribute('width', `${(step.t1 - step.t0) * ppu}`);
      const i = steps.indexOf(step);
      svg.querySelectorAll(`.cell[data-step="${i}"]`).forEach((c) => c.classList.add('active'));
      // Keep the selected bit in view when the waveform is wider than the screen.
      const left = x(step.t0) - 40;
      const right = x(step.t1) + 40;
      if (left < host.scrollLeft || right > host.scrollLeft + host.clientWidth) {
        host.scrollTo({ left: Math.max(0, (left + right) / 2 - host.clientWidth / 2), behavior: 'smooth' });
      }
    },
  };
}
