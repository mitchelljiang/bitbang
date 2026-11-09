/**
 * The Peripherals section's screen: signals drawn on the bench glass, one lane per signal, time (or any step count)
 * left to right. A lane is digital (a 0/1 wire, drawn as edges) or analog (a value such as a counter or a voltage, drawn
 * as a line), with optional reference levels (a dashed line such as ARR or Vin) and dots (sample points). Text sits in
 * HTML over the SVG, so labels stay crisp however wide the panel is.
 */
import { esc } from '../core/render';

/** A Peripherals page's glass (readout and waveform) and status line. `extra` goes on the glass under the wave. */
export const waveScreen = (extra = '') => `
      <div class="pf-screen">
        <div class="pf-readout"></div>
        <div class="pf-wave"></div>${extra}
      </div>
      <p class="dbg-status" aria-live="polite"></p>`;

export interface WaveLane {
  name: string;
  /** Small text under the name. */
  sub?: string;
  /** Any CSS color, usually a scope channel such as var(--ch2). */
  color: string;
  /** Lane height in px (digital lanes default to 34, analog to 120). */
  h?: number;
  /** A 0/1 wire. Otherwise an analog value in the range `y`. */
  digital?: boolean;
  y?: [number, number];
  /** (t, value) points. With `step`, a value holds until the next point, like a register; otherwise points are joined. */
  pts: [number, number][];
  step?: boolean;
  /** Dashed reference levels, each with a label at the right end. */
  refs?: { v: number; label: string; color?: string }[];
  /** A second, fainter line drawn under the first: the ideal or target a signal approximates. Always joined, never stepped. */
  ghost?: [number, number][];
  /** A third line in its own color, such as a filtered output. Always joined. */
  extra?: { pts: [number, number][]; color: string };
  /** Points marked with a dot, such as sample instants. A dot's class can mark it, e.g. 'keep' or 'drop'. */
  dots?: { t: number; v: number; cls?: string }[];
}

/** A vertical marker across every lane, such as an update event. */
export interface WaveMark { t: number; label?: string; cls?: string }

const PAD = 10; // % of an analog lane kept clear above and below the trace

/** Where value v sits in a lane, as a percentage from the top. */
function yPct(l: WaveLane, v: number) {
  if (l.digital) return v ? 18 : 82;
  const [lo, hi] = l.y ?? [0, 1];
  return PAD + (1 - (v - lo) / (hi - lo || 1)) * (100 - 2 * PAD);
}

function pathOf(l: WaveLane, end: number, p = l.pts, stepped = !!(l.step || l.digital)) {
  const x = (t: number) => ((t / end) * 1000).toFixed(2);
  if (!p.length) return '';
  let d = `M${x(p[0][0])} ${yPct(l, p[0][1]).toFixed(2)}`;
  for (let i = 1; i < p.length; i++) {
    if (stepped) d += `H${x(p[i][0])}V${yPct(l, p[i][1]).toFixed(2)}`;
    else d += `L${x(p[i][0])} ${yPct(l, p[i][1]).toFixed(2)}`;
  }
  if (stepped) d += `H${x(end)}`;
  return d;
}

/** The glass: a ruler, then one lane per signal, with markers drawn across all of them. */
export function waveHtml(o: { lanes: WaveLane[]; end: number; every: number; unit?: string; ticks?: { t: number; label: string }[]; marks?: WaveMark[]; cursor?: number }) {
  const pct = (t: number) => `${(t / o.end) * 100}%`;
  const ticks = o.ticks
    ? o.ticks.map((k) => `<span class="mid" style="left:${pct(k.t)}">${esc(k.label)}</span>`).join('')
    : Array.from({ length: Math.floor(o.end / o.every) + 1 }, (_, k) =>
      `<span style="left:${pct(k * o.every)}">${k * o.every}${k === 0 && o.unit ? `<small> ${o.unit}</small>` : ''}</span>`).join('');
  const lanes = o.lanes.map((l) => {
    const h = l.h ?? (l.digital ? 34 : 120);
    const refs = (l.refs ?? []).map((r) => `<i class="wv-ref" style="top:${yPct(l, r.v)}%;${r.color ? `--ref:${r.color}` : ''}"><em>${r.label}</em></i>`).join('');
    const dots = (l.dots ?? []).map((d) => `<b class="wv-dot${d.cls ? ` ${d.cls}` : ''}" style="left:${pct(d.t)};top:${yPct(l, d.v)}%"></b>`).join('');
    return `
      <div class="wv-lane${l.digital ? ' dig' : ''}" style="--lane:${l.color};height:${h}px">
        <span class="wv-label"><b>${esc(l.name)}</b>${l.sub ? `<small>${l.sub}</small>` : ''}</span>
        <div class="wv-track">
          <svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">${
            l.ghost ? `<path class="ghost" d="${pathOf(l, o.end, l.ghost, false)}" vector-effect="non-scaling-stroke"/>` : ''}<path d="${pathOf(l, o.end)}" vector-effect="non-scaling-stroke"/>${
            l.extra ? `<path class="extra" style="stroke:${l.extra.color}" d="${pathOf(l, o.end, l.extra.pts, false)}" vector-effect="non-scaling-stroke"/>` : ''}</svg>
          ${refs}${dots}
        </div>
      </div>`;
  }).join('');
  const marks = (o.marks ?? []).map((m) => `<i class="wv-mark${m.cls ? ` ${m.cls}` : ''}" style="left:${pct(m.t)}">${m.label ? `<em>${esc(m.label)}</em>` : ''}</i>`).join('');
  const cur = o.cursor === undefined ? '' : `<i class="wv-cursor" style="left:${pct(o.cursor)}"></i>`;
  return `<div class="wv"><div class="wv-ruler" aria-hidden="true"><div>${ticks}</div></div>${lanes}<div class="wv-over" aria-hidden="true"><div>${marks}${cur}</div></div></div>`;
}
