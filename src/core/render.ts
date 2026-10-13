import type { Bit, Level, Trace, Waveform } from './types';
import { formatTime } from './util';

export const GUTTER = 64;
const TOP = 30;
const LANE_H = 44;
const ROW_H = 24;
const GAP = 18;
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

/** SVG path for a trace, given time→x and level→y mappings. */
function tracePath(trace: Trace, duration: number, x: (t: number) => number, y: (v: Level) => number) {
  let d = `M ${x(0)} ${y(trace.points[0].v)}`;
  for (const pt of trace.points.slice(1)) d += ` H ${x(pt.t)} V ${y(pt.v)}`;
  return d + ` H ${x(duration)}`;
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
  const fitPpu = Math.max(MIN_FIT_PPU, (host.clientWidth - GUTTER - 16) / w.duration);
  const ppu = opts.zoom === 'fit' ? fitPpu : opts.zoom;
  const x = (t: number) => GUTTER + t * ppu;
  const width = Math.ceil(x(w.duration) + 8);

  // Lay out each lane: the trace, then an optional bit row and field row.
  const layout = w.traces.map(() => ({ y: 0, bitY: -1, fieldY: -1 }));
  let y = TOP;
  w.traces.forEach((_, i) => {
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
    parts.push(`<path class="trace" d="${tracePath(trace, w.duration, x, (v) => yOf(i, v))}"/>`);
  });

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
    const label = fits(bit.label, bw) ? `<text x="${bx + bw / 2}" y="${ry + ROW_H / 2 + 4}">${esc(bit.label)}</text>` : '';
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
