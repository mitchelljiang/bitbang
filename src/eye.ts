/**
 * An interactive eye diagram for PCIe Gen1/Gen2: a random 8b/10b bit stream is sent through a simple channel model,
 * then every two-bit window is overlaid. It is an illustration of how loss, jitter and de-emphasis shape the eye,
 * not a compliance simulation.
 */
import { encode8b10b } from './protocols/pcie';

const BITS = 3000;
const SPU = 24; // samples per unit interval (one bit)
const W = 640;
const H = 300;
const PAD = 28;

/** Seeded random numbers, so the same settings always draw the same eye. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());

function bitStream(r: () => number) {
  const bits: number[] = [];
  let rd: -1 | 1 = -1;
  while (bits.length < BITS) {
    const o = encode8b10b(Math.floor(r() * 256), false, rd);
    rd = o.rd;
    for (const c of o.code) bits.push(+c);
  }
  return bits;
}

interface Settings { loss: number; jitter: number; deemph: boolean }

/** Simulates the received waveform: de-emphasis at the transmitter, jittered edges, a first-order low-pass channel and noise. */
export function simulate({ loss, jitter, deemph }: Settings) {
  const r = rng(7);
  const bits = bitStream(r);
  const reduced = deemph ? 10 ** (-3.5 / 20) : 1; // −3.5 dB on bits that repeat the previous one
  const level = bits.map((b, i) => (b ? 1 : -1) * (i > 0 && bits[i - 1] === b ? reduced : 1));
  const edge = bits.map(() => gauss(r) * jitter); // each bit boundary moves by a random fraction of a UI
  const n = BITS * SPU;
  const x = new Float64Array(n);
  let k = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SPU;
    while (k + 1 < BITS && t >= k + 1 + edge[k + 1]) k++;
    x[i] = level[k];
  }
  const a = 1 - Math.exp(-1 / (loss * SPU));
  const y = new Float64Array(n);
  let v = 0;
  for (let i = 0; i < n; i++) {
    v += a * (x[i] - v);
    y[i] = v + gauss(r) * 0.02;
  }
  return { bits, y };
}

/**
 * Folds the waveform into two-bit windows and measures the opening. The channel delays the signal, so like a real
 * receiver (or an oscilloscope triggered from a recovered clock) the windows are aligned to the best sampling point.
 */
export function fold(bits: number[], y: Float64Array) {
  const cut = (shift: number) => {
    const windows: { bit: number; pts: number[] }[] = [];
    for (let k = 40; k < BITS - 3; k++) {
      const start = Math.round((k - 0.5) * SPU) + shift;
      windows.push({ bit: bits[k], pts: Array.from(y.subarray(start, start + 2 * SPU + 1)) });
    }
    return windows;
  };
  const openingAt = (windows: { bit: number; pts: number[] }[], j: number) => {
    let lowestOne = Infinity;
    let highestZero = -Infinity;
    for (const w of windows) {
      if (w.bit) lowestOne = Math.min(lowestOne, w.pts[j]);
      else highestZero = Math.max(highestZero, w.pts[j]);
    }
    return lowestOne - highestZero;
  };
  // Like clock recovery, sample in the middle of the open region: find the tallest point, extend to where the eye is
  // still at least half that tall, and center the windows there.
  const first = cut(0);
  const op = Array.from({ length: 2 * SPU + 1 }, (_, j) => openingAt(first, j));
  let peak = 0;
  for (let j = 1; j < op.length; j++) if (op[j] > op[peak]) peak = j;
  let lo = peak;
  let hi = peak;
  while (lo > 0 && op[lo - 1] >= op[peak] / 2) lo--;
  while (hi < op.length - 1 && op[hi + 1] >= op[peak] / 2) hi++;
  const windows = cut(Math.round((lo + hi) / 2) - SPU);
  const height = Math.max(0, openingAt(windows, SPU));
  let open = 0;
  for (let j = Math.round(SPU / 2); j <= Math.round(SPU * 1.5); j++) if (openingAt(windows, j) > 0.05) open++;
  return { windows, height, width: open / SPU };
}

export function mountEye(root: HTMLElement) {
  root.innerHTML = `
    <div class="eye-controls">
      <label class="ctl">Channel
        <select data-k="loss">
          <option value="0.2">Short trace (little loss)</option>
          <option value="0.5" selected>Typical board trace</option>
          <option value="1.05">Long trace (heavy loss)</option>
        </select>
      </label>
      <label class="ctl">Jitter
        <select data-k="jitter">
          <option value="0.015" selected>Low</option>
          <option value="0.05">High</option>
        </select>
      </label>
      <label class="ctl">De-emphasis
        <select data-k="deemph">
          <option value="1" selected>−3.5 dB (on)</option>
          <option value="0">Off</option>
        </select>
      </label>
    </div>
    <figure class="eye-figure">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Eye diagram"></svg>
      <figcaption class="eye-readout" aria-live="polite"></figcaption>
    </figure>
    <p class="eye-note">Simulated from a random 8b/10b stream through a simple low-pass channel model with random jitter and
      noise. It shows the effects qualitatively; real compliance testing uses the specification's measurement setup and masks.</p>`;

  const svg = root.querySelector('svg')!;
  const readout = root.querySelector<HTMLElement>('.eye-readout')!;
  const selects = [...root.querySelectorAll<HTMLSelectElement>('select')];

  const draw = () => {
    const s: Settings = { loss: 0.5, jitter: 0.015, deemph: true };
    for (const sel of selects) {
      if (sel.dataset.k === 'deemph') s.deemph = sel.value === '1';
      else s[sel.dataset.k as 'loss' | 'jitter'] = +sel.value;
    }
    const { bits, y } = simulate(s);
    const { windows, height, width } = fold(bits, y);

    const px = (j: number) => PAD + (j / (2 * SPU)) * (W - 2 * PAD);
    const py = (v: number) => H / 2 - v * (H / 2 - PAD);
    const paths = windows.slice(0, 700).map((w) =>
      `<polyline class="eye-trace" points="${w.pts.map((v, j) => `${px(j).toFixed(1)},${py(v).toFixed(1)}`).join(' ')}"/>`).join('');

    // An illustrative receiver mask: a hexagon in the center of the eye that no trace may enter.
    const mw = 0.4 * SPU; // 0.4 UI wide, the Gen1 receiver's minimum eye width
    const mh = 0.1;
    const c = SPU;
    const mask = [[c - mw / 2, 0], [c - mw / 4, mh], [c + mw / 4, mh], [c + mw / 2, 0], [c + mw / 4, -mh], [c - mw / 4, -mh]];
    const inside = (j: number, v: number) => {
      const dx = Math.abs(j - c);
      if (dx > mw / 2) return false;
      const limit = dx <= mw / 4 ? mh : mh * (1 - (dx - mw / 4) / (mw / 4));
      return Math.abs(v) < limit;
    };
    const fails = windows.some((w) => w.pts.some((v, j) => inside(j, v)));

    svg.innerHTML =
      `<line class="eye-axis" x1="${PAD}" x2="${W - PAD}" y1="${H / 2}" y2="${H / 2}"/>` +
      [0.5, 1, 1.5].map((u) => `<line class="eye-axis" x1="${px(u * SPU)}" x2="${px(u * SPU)}" y1="${PAD / 2}" y2="${H - PAD / 2}"/>`).join('') +
      paths +
      `<polygon class="eye-mask ${fails ? 'fail' : 'pass'}" points="${mask.map(([j, v]) => `${px(j)},${py(v)}`).join(' ')}"/>` +
      `<text class="eye-label" x="${px(0.5 * SPU)}" y="${H - 6}">bit edge</text>` +
      `<text class="eye-label" x="${px(SPU)}" y="${H - 6}">sample point</text>` +
      `<text class="eye-label" x="${px(1.5 * SPU)}" y="${H - 6}">bit edge</text>`;
    readout.textContent = `Eye height ${Math.round((height / 2) * 100)}% of the transmitted swing, eye width ` +
      `${width.toFixed(2)} UI. ${fails ? 'Traces enter the mask: a receiver would see bit errors.' : 'The mask is clear.'}`;
  };

  for (const sel of selects) sel.addEventListener('change', draw);
  draw();
}
