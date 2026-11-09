/**
 * Small drawings that give each part of the site a face. `areaGlyph` is a 16 px line icon for a header tab (Data: a
 * square wave, Hardware: a chip, Software: code brackets). `sectionArt` is a strip of dark instrument glass showing
 * what that section's diagrams look like, in the scope's channel colours. Both are decorative (aria-hidden).
 */
const GLYPHS: Record<string, string> = {
  data: '<path d="M1 11.5h3v-7h4v7h4v-7h3"/>',
  hardware: '<rect x="4" y="4" width="8" height="8" rx="1.2"/><path d="M6.5 4V1.5M9.5 4V1.5M6.5 14.5V12M9.5 14.5V12M4 6.5H1.5M4 9.5H1.5M14.5 6.5H12M14.5 9.5H12"/>',
  software: '<path d="M5.5 4 2 8l3.5 4M10.5 4 14 8l-3.5 4"/>',
};
export const areaGlyph = (id: string) =>
  `<svg class="glyph" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">${GLYPHS[id] ?? ''}</svg>`;

const W = 300, H = 72;
const C = { gold: '#f2c230', cyan: '#2bb7e3', pink: '#ec5a92', blue: '#5b8cff', mint: '#7ddc6a', orange: '#ff9f5a', dim: 'rgba(150,185,200,0.22)' };
/** A digital trace through levels `lv` (1 high, 0 low), one per `step` px, between y = hi and y = lo. */
const wave = (lv: number[], x0: number, step: number, hi: number, lo: number, color: string) => {
  let d = `M${x0} ${lv[0] ? hi : lo}`;
  lv.forEach((v, i) => {
    const y = v ? hi : lo;
    if (i) d += `V${y}`;
    d += `H${x0 + (i + 1) * step}`;
  });
  return `<path d="${d}" stroke="${color}" fill="none" stroke-width="2" stroke-linejoin="round"/>`;
};
const rect = (x: number, y: number, w: number, h: number, fill: string, extra = '') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${fill}" ${extra}/>`;

const ART: Record<string, () => string> = {
  // UART sending one byte under a clock: idle high, start bit, data, stop bit.
  protocols: () => wave([1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0], 6, 12, 12, 28, C.cyan)
    + wave([1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1], 6, 12, 42, 60, C.gold),
  // One byte, 0x2A, bit by bit: the ones lit.
  bits: () => [0, 0, 1, 0, 1, 0, 1, 0].map((b, i) => rect(30 + i * 31, 18, 26, 36, b ? C.gold : 'none',
    `stroke="${b ? C.gold : C.dim}" stroke-width="1.5" fill-opacity="${b ? 0.9 : 0}"`)).join(''),
  // A 32-bit instruction split into its fields.
  architecture: () => ([[0, 7, C.blue], [7, 5, C.pink], [12, 3, C.mint], [15, 5, C.pink], [20, 12, C.gold]] as const)
    .map(([at, n, c]) => rect(22 + at * 8, 22, n * 8 - 3, 28, c, 'fill-opacity="0.85"')).join(''),
  // The memory map as an address bar: Flash, SRAM, peripherals, with the selected byte marked.
  memory: () => rect(18, 26, 96, 20, C.blue, 'fill-opacity="0.8"') + rect(118, 26, 64, 20, C.mint, 'fill-opacity="0.8"')
    + rect(186, 26, 96, 20, C.orange, 'fill-opacity="0.7"') + `<path d="M150 16v40" stroke="${C.gold}" stroke-width="2"/>`
    + `<path d="M145 12h10l-5 6z" fill="${C.gold}"/>`,
  // A slow clock multiplied into a fast one.
  power: () => wave([1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0], 6, 12, 10, 26, C.cyan)
    + wave(Array.from({ length: 48 }, (_, i) => (i % 2 ? 0 : 1)), 6, 6, 42, 60, C.gold),
  // A ring of slots, some filled, with the head marked.
  drivers: () => Array.from({ length: 12 }, (_, i) => rect(24 + i * 21.5, 26, 18, 20, i >= 3 && i < 8 ? C.mint : 'none', i >= 3 && i < 8 ? 'fill-opacity="0.85"' : `stroke="${C.dim}" stroke-width="1.5"`)).join('')
    + `<path d="M${24 + 8 * 21.5 + 9} 58v-8m-4 4 4-4 4 4" stroke="${C.gold}" stroke-width="2" fill="none"/>`,
  // A PWM output above an ADC's sampled sine.
  peripherals: () => wave([1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0], 6, 12, 10, 26, C.pink)
    + `<path d="${Array.from({ length: 41 }, (_, i) => `${i ? 'L' : 'M'}${6 + i * 7.2} ${(50 - 12 * Math.sin(i / 40 * Math.PI * 3)).toFixed(1)}`).join('')}" stroke="${C.blue}" fill="none" stroke-width="2"/>`
    + Array.from({ length: 11 }, (_, i) => `<circle cx="${6 + i * 28.8}" cy="${(50 - 12 * Math.sin(i * 4 / 40 * Math.PI * 3)).toFixed(1)}" r="2.6" fill="${C.blue}"/>`).join(''),
  // Three threads of execution taking turns, with the cursor at the current step.
  concurrency: () => ([[10, [[10, 70], [180, 60]], C.cyan], [30, [[80, 40], [244, 46]], C.pink], [50, [[120, 60]], C.mint]] as const)
    .map(([y, runs, c]) => `<path d="M10 ${y + 6}H290" stroke="${C.dim}" stroke-width="1"/>`
      + runs.map(([x, w]) => rect(x, y, w, 12, c, 'fill-opacity="0.85"')).join('')).join('')
    + `<path d="M150 4v64" stroke="${C.gold}" stroke-width="2"/>`,
  // A struct's twelve bytes: a byte, three of padding, a word, a byte and three more of padding.
  c: () => ([[0, 1, C.blue], [1, 3, ''], [4, 4, C.gold], [8, 1, C.pink], [9, 3, '']] as const).map(([at, n, col]) =>
    Array.from({ length: n }, (_, k) => rect(24 + (at + k) * 21.5, 22, 18, 28, col || 'none',
      col ? 'fill-opacity="0.85"' : `stroke="${C.dim}" stroke-width="1.5" stroke-dasharray="3 3"`)).join('')).join('')
    + `<path d="M24 60h${4 * 21.5 - 3.5}M110 60h${4 * 21.5 - 3.5}M196 60h${4 * 21.5 - 3.5}" stroke="${C.dim}" stroke-width="2"/>`,
  // C source lines on the left, the assembly they become on the right, one line and its instructions matched.
  compilers: () => [70, 92, 54, 80].map((w, i) => rect(18, 10 + i * 14, w, 7, i === 1 ? C.gold : C.dim)).join('')
    + `<path d="M132 36h28m-6-5 6 5-6 5" stroke="${C.dim}" stroke-width="2" fill="none" stroke-linecap="round"/>`
    + [44, 60, 52, 38, 56, 48].map((w, i) => rect(180, 8 + i * 10, w, 6, i >= 1 && i <= 3 ? C.gold : C.dim)).join(''),
};

export const sectionArt = (id: string) => ART[id]
  ? `<svg class="art" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${ART[id]()}</svg>`
  : '';
