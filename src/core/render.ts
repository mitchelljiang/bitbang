import type { Bit, Level, Trace, Waveform } from './types';
import { formatTime, levelAt } from './util';

export const GUTTER = 64;
const TOP = 30;
const LANE_H = 44;
/** A multi-level lane is taller, so its levels stay clearly apart: 16px between PAM-5's five levels. */
const laneH = (t: Trace) => (t.span ? Math.max(LANE_H, 12 + 16 * (t.span[1] - t.span[0])) : LANE_H);
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

/** Rough width of monospace text at 11px, to decide whether a label fits in its cell. */
const fits = (label: string, width: number) => label.length * 6.8 + 6 <= width;

/** Time an open-drain line takes to rise, in protocol units; shortened if the next edge comes sooner. */
const RISE = 0.2;
const rank = (v: Level) => (v === 0 ? 0 : v === 'z' ? 1 : 2);

function riseTime(trace: Trace, i: number) {
  const next = trace.points[i + 1];
  return next ? Math.min(RISE, (next.t - trace.points[i].t) * 0.8) : RISE;
}

/** Point `i` is a rise through a pull-up (open drain, or a soft rise), drawn as a curve instead of a sharp edge. */
const softRise = (trace: Trace, i: number) =>
  i > 0 && (trace.openDrain || trace.points[i].soft) && rank(trace.points[i].v) > rank(trace.points[i - 1].v);

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
    if (softRise(trace, i)) {
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

/** A bus as datasheets draw it: a band per value with the value written inside, crossing over at each change. */
function busParts(trace: Trace, duration: number, x: (t: number) => number, top: number, bottom: number) {
  const mid = (top + bottom) / 2;
  const out: string[] = [];
  const pts = trace.points;
  pts.forEach((p, i) => {
    const x0 = x(p.t);
    const x1 = x(pts[i + 1]?.t ?? duration);
    if (x1 <= x0) return;
    if (p.v === 'z') {
      out.push(`<path class="trace" d="M ${x0} ${mid} H ${x1}"/>`);
      return;
    }
    const s = Math.min(4, (x1 - x0) / 4);
    out.push(`<path class="trace bus" d="M ${x0} ${mid} L ${x0 + s} ${top} H ${x1 - s} L ${x1} ${mid} L ${x1 - s} ${bottom} H ${x0 + s} Z"/>`);
    if (p.label && fits(p.label, x1 - x0 - 2 * s)) {
      out.push(`<text class="bus-value" x="${(x0 + x1) / 2}" y="${mid + 4}">${esc(p.label)}</text>`);
    }
  });
  return out.join('');
}

/** Where an edge visibly reaches its new level: the end of the curve for an open-drain rise, otherwise the edge itself. */
function edgeEnd(trace: Trace, t: number) {
  const i = trace.points.findIndex((p) => p.t === t);
  return softRise(trace, i) ? t + riseTime(trace, i) : t;
}

export interface RenderOptions {
  /**
   * Pixels per time unit; 'all' to show the whole frame, however small; or 'fit' to show the whole frame unless the
   * bits would get too narrow to read, in which case it scrolls. Pages open at 'fit'.
   */
  zoom: number | 'fit' | 'all';
  onPick(step: number): void;
  onHover(bit: Bit | null, cell: Element | null): void;
  /** Time range to keep bright; everything outside it is dimmed. Used by the walkthrough. */
  focus?: [number, number] | null;
}

export interface Rendered {
  select(step: Step | null): void;
  ppu: number;
  /** The zoom that shows the whole frame. */
  allPpu: number;
  /** Seconds per graticule division, as drawn. */
  divTime: number;
}

/** The scope-style step (1, 2 or 5 times a power of ten) nearest to `t`, so the screen shows about ten divisions. */
function niceStep(t: number) {
  const p = 10 ** Math.floor(Math.log10(t));
  return [1, 2, 5, 10].map((m) => m * p).reduce((a, b) => (Math.abs(Math.log(b / t)) < Math.abs(Math.log(a / t)) ? b : a));
}

/** Draws the waveform as SVG into `host`. */
export function render(host: HTMLElement, w: Waveform, steps: Step[], opts: RenderOptions): Rendered {
  const allPpu = (host.clientWidth - GUTTER - 16) / w.duration;
  const fitPpu = Math.max(w.minPpu ?? MIN_FIT_PPU, allPpu);
  const ppu = opts.zoom === 'fit' ? fitPpu : opts.zoom === 'all' ? allPpu : opts.zoom;
  const x = (t: number) => GUTTER + t * ppu;
  const width = Math.ceil(x(w.duration) + 8);

  // Lay out each lane: the trace, then an optional bit row and field row.
  const notes = w.notes ?? [];
  const layout = w.traces.map(() => ({ y: 0, bitY: -1, fieldY: -1, noteY: -1 }));
  let y = TOP;
  w.traces.forEach((_, i) => {
    if (notes.some((n) => n.lane === i)) { layout[i].noteY = y; y += NOTE_H; }
    layout[i].y = y;
    y += laneH(w.traces[i]);
    if (w.bits.some((b) => b.lane === i)) { layout[i].bitY = y; y += ROW_H; }
    if (w.fields.some((f) => f.lane === i)) { layout[i].fieldY = y; y += ROW_H; }
    y += GAP;
  });
  const height = y - GAP + 8;
  const yOf = (lane: number, v: Level) => {
    const ly = layout[lane].y;
    const span = w.traces[lane].span;
    const h = laneH(w.traces[lane]);
    if (span && v !== 'z') return ly + h - 6 - ((v - span[0]) / (span[1] - span[0])) * (h - 12);
    return v === 'z' ? ly + LANE_H / 2 : v ? ly + 6 : ly + LANE_H - 6;
  };

  const parts: string[] = [];
  parts.push(`<rect id="sel" class="sel" x="0" y="0" width="0" height="${height}" visibility="hidden"/>`);

  // Graticule and ruler, as on a scope: a round time per division (1, 2 or 5 times a power of ten) close to a tenth
  // of the visible width, a vertical line at every multiple of it from time zero, and labels on those lines, spaced
  // so they stay readable. The readout shows the same value, so the grid, the ruler and the readout always agree.
  const visible = Math.max(1, host.clientWidth - GUTTER - 16) / ppu;
  const divTime = niceStep((visible * w.unitTime) / 10);
  const div = divTime / w.unitTime;
  const labelEvery = Math.max(1, Math.ceil(70 / (div * ppu)));
  for (let k = 0; k * div <= w.duration + 1e-9; k++) {
    const gx = x(k * div);
    parts.push(`<line class="grid" x1="${gx}" x2="${gx}" y1="${TOP - 10}" y2="${height}"/>`);
    if (k % labelEvery === 0) parts.push(`<text class="ruler" x="${gx + 3}" y="${TOP - 14}">${formatTime(k * divTime)}</text>`);
  }


  w.traces.forEach((trace, i) => {
    const ly = layout[i].y;
    // Each lane is a numbered channel, as on a scope, and takes that channel's color (six colors, then round again).
    parts.push(`<g class="ch ch${(i % 6) + 1}">`);
    parts.push(`<text class="lane-name" x="8" y="${ly + laneH(trace) / 2 + 4}">${esc(trace.name)}</text>`);
    if (trace.span) {
      // A faint guide at each level, so the steps of a multi-level signal can be counted.
      for (let v = trace.span[0]; v <= trace.span[1]; v++) {
        const gy = yOf(i, v);
        parts.push(`<line class="level-guide" x1="${GUTTER}" x2="${width}" y1="${gy}" y2="${gy}"/>`);
      }
    }
    if (trace.levels) {
      const [lo, hi] = trace.levels;
      parts.push(
        `<text class="level" x="${GUTTER - 6}" y="${yOf(i, 1) + 3}">${esc(hi)}</text>` +
        `<text class="level" x="${GUTTER - 6}" y="${yOf(i, 0) + 3}">${esc(lo)}</text>`,
      );
    }
    parts.push(trace.bus
      ? busParts(trace, w.duration, x, yOf(i, 1), yOf(i, 0))
      : `<path class="trace" d="${tracePath(trace, w.duration, x, (v) => yOf(i, v))}"/>`);
    parts.push('</g>');
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
    // A multi-level lane is sampled on every symbol, so marking each one would only add clutter; so would a bus.
    if (w.traces[bit.lane].span) continue;
    if (ppu >= 14) parts.push(`<line class="sample" x1="${sx}" x2="${sx}" y1="${ly}" y2="${ly + LANE_H}"/>`);
    if (w.traces[bit.lane].bus) continue; // a bus has no single level to put a dot on
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

  if (opts.focus) {
    const [f0, f1] = opts.focus.map(x);
    parts.push(
      `<rect class="dim" x="0" y="0" width="${Math.max(0, f0)}" height="${height}"/>` +
      `<rect class="dim" x="${f1}" y="0" width="${Math.max(0, width - f1)}" height="${height}"/>` +
      `<line class="focus-edge" x1="${f0}" x2="${f0}" y1="0" y2="${height}"/>` +
      `<line class="focus-edge" x1="${f1}" x2="${f1}" y1="0" y2="${height}"/>`,
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
    allPpu,
    divTime,
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

/** The explanation for one step: a paragraph per bit, tagged with its label (and lane, if several lanes move at once). */
export function stepNodes(step: Step, laneNames: string[]) {
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

/** The scope's readout bar: each lane's channel and name, the time per graticule division, and what is decoded. */
export function readout(w: Waveform, divTime: number, decode: string) {
  return w.traces.map((t, i) => `<span class="rd-ch ch${(i % 6) + 1}"><b>CH${i + 1}</b> ${esc(t.name)}</span>`).join('') +
    `<span class="rd-div">${formatTime(divTime)}/div</span><span class="rd-cursor"></span><span class="rd-decode">Decode ${esc(decode)}</span>`;
}
