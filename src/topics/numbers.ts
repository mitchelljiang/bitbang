/**
 * The "Representing numbers" pages: binary and hexadecimal, two's complement, fixed point, and IEEE 754 floating
 * point. Each is a debugger paused on a few lines of C, with the variables shown bit by bit.
 */
import { esc } from '../core/render';
import {
  binN, bit, bits, code, debuggerWindow, flips, hexN, nibbles, page, parseNumber, readHex, row, showValue, status, sup, syncUrl, table,
  wideRow, wire,
} from './dbg';

// ---- pure conversions, exported for the accuracy checks ----

/** An 8-bit pattern read as int8_t. */
export const toInt8 = (v: number) => (v & 0x80 ? (v & 0xff) - 256 : v & 0xff);

/** An unsigned fixed-point value: the raw integer divided by 2 to the number of fraction bits. */
export const fixedValue = (raw: number, frac: number) => raw / 2 ** frac;

export interface Float32Parts {
  sign: number;
  exponent: number;
  fraction: number;
  kind: 'zero' | 'subnormal' | 'normal' | 'infinity' | 'nan';
  value: number;
  /** The exact decimal value stored, every digit (empty for infinity and NaN). */
  exact: string;
}

/** Decodes a 32-bit pattern as an IEEE 754 single-precision float. */
export function decodeFloat32(b: number): Float32Parts {
  b >>>= 0;
  const sign = b >>> 31;
  const exponent = (b >>> 23) & 0xff;
  const fraction = b & 0x7fffff;
  const view = new DataView(new ArrayBuffer(4));
  view.setUint32(0, b);
  const value = view.getFloat32(0);
  const kind = exponent === 0xff ? (fraction ? 'nan' : 'infinity') : exponent === 0 ? (fraction ? 'subnormal' : 'zero') : 'normal';
  let exact = '';
  if (kind !== 'nan' && kind !== 'infinity') {
    // value = mantissa × 2^power, with an implied leading 1 for normal numbers.
    const mantissa = BigInt(kind === 'normal' ? fraction | 0x800000 : fraction);
    const power = (kind === 'normal' ? exponent - 127 : -126) - 23;
    if (power >= 0) exact = (mantissa << BigInt(power)).toString();
    else {
      // m × 2^-k = m × 5^k / 10^k, which is exact in decimal.
      const digits = (mantissa * 5n ** BigInt(-power)).toString().padStart(-power + 1, '0');
      const cut = digits.length + power;
      exact = `${digits.slice(0, cut)}.${digits.slice(cut)}`.replace(/\.?0+$/, '');
    }
    if (sign) exact = `-${exact}`;
  }
  return { sign, exponent, fraction, kind, value, exact };
}

/** The bit pattern of `x` rounded to a 32-bit float. */
export function encodeFloat32(x: number) {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, x);
  return view.getUint32(0);
}

/**
 * Quake III Arena's fast inverse square root, step by step, in single precision as the C code computes it.
 * The integer steps use the float's bits; the last step is one Newton–Raphson iteration.
 */
export function qRsqrt(x: number) {
  const f = Math.fround(x);
  const x2 = Math.fround(f * 0.5);
  const i0 = encodeFloat32(f);
  const i1 = (0x5f3759df - (i0 >>> 1)) >>> 0;
  const y0 = decodeFloat32(i1).value;
  const y1 = Math.fround(y0 * Math.fround(1.5 - Math.fround(Math.fround(x2 * y0) * y0)));
  return { i0, half: i0 >>> 1, i1, y0, y1 };
}

/** The shortest decimal that rounds to the same float, as C's printf("%g") would want for a literal. */
function shortest(v: number) {
  if (!Number.isFinite(v)) return String(v);
  for (let p = 1; p <= 9; p++) {
    const s = v.toPrecision(p);
    if (Math.fround(Number(s)) === v) return String(Number(s));
  }
  return String(v);
}

// ---- shared wiring ----


// ---- Binary and hexadecimal ----

export function mountBinary(root: HTMLElement) {
  let width = new URLSearchParams(location.search).get('w') === '16' ? 16 : 8;
  let x = readHex('x', 0xb2, 0xffff) & (2 ** width - 1);
  let last: number | null = null;

  const html = page({
    crumbs: 'Representing numbers',
    title: 'Binary and hexadecimal',
    intro: 'Each bit has a place value that is a power of two, and the number is the sum of the place values of the bits that are 1. Hexadecimal writes every group of four bits as one digit, 0 to F. Click the bits, or type a value.',
    file: 'binary.c',
    controls: `
      <div class="dbg-seg" role="radiogroup" aria-label="Width">
        <button type="button" role="radio" data-w="8">uint8_t</button><button type="button" role="radio" data-w="16">uint16_t</button>
      </div>
      <label class="dbg-set">x = <input type="text" spellcheck="false" autocomplete="off" aria-label="Set x"></label>`,
    body: '<div class="vars-wrap"></div>',
  });

  function draw() {
    const type = `uint${width}_t`;
    const v = x;
    code(root, [
      '#include <stdint.h>',
      '',
      `${type} x = ${hexN(v, width)};`.padEnd(34) + '// hexadecimal',
      `${type} y = ${v};`.padEnd(34) + '// the same value in decimal',
      `${type} z = 0b${(v >>> 0).toString(2).padStart(width, '0')};`.padEnd(34) + '// binary (C23, or a GCC/Clang extension)',
    ], 2);
    const ones = Array.from({ length: width }, (_, i) => width - 1 - i).filter((i) => bit(v, i));
    root.querySelector('.vars-wrap')!.innerHTML = table(
      row('x', type, `<code class="hex">${hexN(v, width)}</code> <small class="dec">${v}</small>`,
        bits('x', v, width, {
          editable: true, groups: nibbles(v, width, true), under: (i) => String(2 ** i),
          flipped: flips(last, v),
          tip: (i) => `Bit ${i} is worth 2${sup(i)} = ${2 ** i}. Click to ${bit(v, i) ? 'clear' : 'set'} it.`,
        }),
        last !== null && last !== v));
    root.querySelectorAll<HTMLButtonElement>('[data-w]').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.w) === width)));
    showValue(root, hexN(v, width));
    status(root, `${v} = ${ones.length ? ones.map((i) => 2 ** i).join(' + ') : '0'}. In hex, each group of four bits is one digit: ${binN(v, width)} is ${hexN(v, width)}.`);
    last = v;
    syncUrl({ x: (v >>> 0).toString(16).toUpperCase(), w: String(width) });
  }

  wire(root, html, draw);
  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    const b = t.closest<HTMLElement>('.bitrow.editable .bit');
    if (b) {
      x ^= 1 << Number(b.dataset.bit);
      draw();
      const i = Number(b.dataset.bit);
      status(root, `Bit ${i} has place value 2${sup(i)} = ${2 ** i}. It is now ${bit(x, i)}, so it ${bit(x, i) ? 'adds' : 'no longer adds'} ${2 ** i}.`);
      return;
    }
    const w = t.closest<HTMLElement>('[data-w]');
    if (w) {
      width = Number(w.dataset.w);
      x &= 2 ** width - 1;
      last = null;
      draw();
    }
  });
  root.querySelector('.dbg-set input')!.addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    const n = parseNumber(input.value);
    if (n === null || n < 0 || n >= 2 ** width) {
      status(root, `Type a whole number from 0 to ${2 ** width - 1}, in decimal, hex (0x…) or binary (0b…).`);
      return;
    }
    x = n;
    draw();
  });
}

// ---- Two's complement ----

export function mountTwos(root: HTMLElement) {
  let raw = readHex('x', 0xb2, 0xff);
  let last: number | null = null;

  const html = page({
    crumbs: 'Representing numbers',
    title: 'Two’s complement',
    intro: 'The same eight bits can be read as an unsigned number from 0 to 255, or as a signed one from −128 to 127. In two’s complement, the top bit is worth −128 instead of 128; everything else is unchanged. Click the bits, type a value, or negate it.',
    file: 'twos.c',
    controls: `
      <button type="button" class="dbg-btn" data-act="neg">Negate</button>
      <label class="dbg-set">raw = <input type="text" spellcheck="false" autocomplete="off" aria-label="Set raw"></label>`,
    body: '<div class="vars-wrap"></div>',
    after: `<section class="prose">
      <h2>Why it works</h2>
      <p>Adding a number and its negation must give zero. Inverting every bit of x gives a pattern that adds to x as
        1111 1111, and adding 1 more carries out of the top bit, leaving 0000 0000. So −x is ~x + 1, and the same adder
        circuit handles signed and unsigned numbers alike.</p>
      <p>Converting a value that does not fit, such as 178, to <code>int8_t</code> is implementation-defined in C. GCC,
        Clang and most embedded compilers keep the bits and reinterpret them, as shown here.</p>
    </section>`,
  });

  function draw() {
    const s = toInt8(raw);
    const n = (-s) & 0xff;
    code(root, [
      '#include <stdint.h>',
      '',
      `uint8_t raw = ${hexN(raw, 8)};`.padEnd(30) + `// ${binN(raw, 8)}`,
      `int8_t  s   = (int8_t)raw;`.padEnd(30) + `// ${s}`,
      `int8_t  n   = -s;`.padEnd(30) + `// ${toInt8(n)}: invert every bit, add 1`,
    ], 4);
    const flipped = flips(last, raw);
    root.querySelector('.vars-wrap')!.innerHTML = table(
      row('raw', 'uint8_t', `<code class="hex">${hexN(raw, 8)}</code> <small class="dec">${raw}</small>`,
        bits('raw', raw, 8, { editable: true, flipped, under: (i) => String(2 ** i),
          tip: (i) => `As uint8_t, bit ${i} is worth ${2 ** i}. Click to ${bit(raw, i) ? 'clear' : 'set'} it.` }), last !== null && last !== raw) +
      row('s', 'int8_t', `<code class="hex">${s}</code>`,
        bits('s', raw, 8, { under: (i) => (i === 7 ? '−128' : String(2 ** i)),
          tip: (i) => (i === 7 ? 'As int8_t, bit 7 is worth −128 instead of 128. That is the whole difference.' : `Bit ${i} is worth ${2 ** i}, as in uint8_t.`) }),
        last !== null && last !== raw) +
      row('n', 'int8_t', `<code class="hex">${toInt8(n)}</code>`, bits('n', n, 8)),
    );
    showValue(root, hexN(raw, 8));
    const terms = [7, 6, 5, 4, 3, 2, 1, 0].filter((i) => bit(raw, i)).map((i) => (i === 7 ? '−128' : String(2 ** i)));
    status(root, `As int8_t: ${terms.length ? terms.join(' + ').replace(/\+ −/g, '− ') : '0'} = ${s}.` +
      (raw === 0x80 ? ' −(−128) is 128, which does not fit in int8_t, so negating −128 gives −128 again on typical compilers.' : ''));
    last = raw;
    syncUrl({ x: raw.toString(16).toUpperCase().padStart(2, '0') });
  }

  wire(root, html, draw);
  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    const b = t.closest<HTMLElement>('.bitrow.editable .bit');
    if (b) {
      raw ^= 1 << Number(b.dataset.bit);
      draw();
      return;
    }
    if (t.closest('[data-act="neg"]')) {
      const before = raw;
      const inverted = ~raw & 0xff;
      raw = (inverted + 1) & 0xff;
      draw();
      status(root, `Negating ${toInt8(before)}: invert every bit, ${binN(before, 8)} → ${binN(inverted, 8)}, then add 1 → ${binN(raw, 8)}, which is ${toInt8(raw)}.` +
        (before === 0x80 ? ' −128 has no positive partner in 8 bits, so it comes back as −128.' : ''));
    }
  });
  root.querySelector('.dbg-set input')!.addEventListener('change', (e) => {
    const n = parseNumber((e.target as HTMLInputElement).value);
    if (n === null || n < -128 || n > 255) {
      status(root, 'Type a number from −128 to 255, in decimal, hex (0x…) or binary (0b…). Negative numbers are stored in two’s complement.');
      return;
    }
    raw = n & 0xff;
    draw();
  });
}

// ---- Fixed point ----

export function mountFixed(root: HTMLElement) {
  let raw = readHex('x', 0xb2, 0xff);
  const fp = new URLSearchParams(location.search).get('f');
  const f0 = fp === null ? NaN : Number(fp);
  let frac = Number.isInteger(f0) && f0 >= 0 && f0 <= 8 ? f0 : 4;
  let last: number | null = null;

  const html = page({
    crumbs: 'Representing numbers',
    title: 'Fixed point',
    intro: 'A fixed-point number is an ordinary integer with an imaginary binary point at an agreed position. The bits after the point are worth one half, one quarter, one eighth and so on. Move the point to trade range for precision.',
    file: 'fixed.c',
    controls: `
      <label class="dbg-set">Format <select aria-label="Fixed-point format">${Array.from({ length: 9 }, (_, f) =>
        `<option value="${f}">UQ${8 - f}.${f}</option>`).join('')}</select></label>
      <label class="dbg-set">raw = <input type="text" spellcheck="false" autocomplete="off" aria-label="Set raw"></label>`,
    body: '<div class="vars-wrap"></div>',
    after: `<section class="prose">
      <h2>Where it is used</h2>
      <p>Fixed point needs only integer hardware, so it is common on small microcontrollers without a floating-point
        unit, in digital signal processing, and in sensor drivers that report values such as 1/16 °C per count. Adding
        two values in the same format is ordinary integer addition; multiplying them doubles the fraction bits, so the
        product is shifted right to return to the original format.</p>
      <p>UQ4.4 means unsigned, with 4 integer bits and 4 fraction bits. Signed formats, written Q, use two’s complement.</p>
    </section>`,
  });

  function draw() {
    const value = fixedValue(raw, frac);
    const scale = 2 ** frac;
    const bin = (raw >>> 0).toString(2).padStart(8, '0');
    const pointed = frac === 0 ? bin : frac === 8 ? `.${bin}` : `${bin.slice(0, 8 - frac)}.${bin.slice(8 - frac)}`;
    code(root, [
      '#include <stdint.h>',
      '',
      `uint8_t raw = ${hexN(raw, 8)};`.padEnd(30) + `// ${pointed}`,
      `// UQ${8 - frac}.${frac}: ${8 - frac} integer bits, ${frac} fraction bits`,
      `float value = raw / ${scale}.0f;`.padEnd(30) + `// ${value}`,
    ], 4);
    root.querySelector('.vars-wrap')!.innerHTML = table(
      row('raw', 'uint8_t', `<code class="hex">${hexN(raw, 8)}</code> <small class="dec">${raw}</small>`,
        bits('raw', raw, 8, { editable: true, point: frac > 0 && frac < 8 ? frac : undefined,
          flipped: flips(last, raw), under: (i) => `2${sup(i - frac)}`,
          tip: (i) => `Bit ${i} is worth 2${sup(i - frac)} = ${2 ** (i - frac)}. Click to ${bit(raw, i) ? 'clear' : 'set'} it.` }),
        last !== null && last !== raw) +
      row('value', 'float', `<code class="hex">${value}</code>`, ''),
    );
    root.querySelector<HTMLSelectElement>('.dbg-set select')!.value = String(frac);
    showValue(root, hexN(raw, 8));
    status(root, `value = raw ÷ 2${sup(frac)} = ${raw} ÷ ${scale} = ${value}. Steps of ${1 / scale}, from 0 to ${255 / scale}.`);
    last = raw;
    syncUrl({ x: raw.toString(16).toUpperCase().padStart(2, '0'), f: String(frac) });
  }

  wire(root, html, draw);
  root.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('.bitrow.editable .bit');
    if (!b) return;
    const i = Number(b.dataset.bit);
    raw ^= 1 << i;
    draw();
    status(root, `Bit ${i} is worth 2${sup(i - frac)} = ${2 ** (i - frac)}. value = ${raw} ÷ ${2 ** frac} = ${fixedValue(raw, frac)}.`);
  });
  root.querySelector('.dbg-set select')!.addEventListener('change', (e) => {
    frac = Number((e.target as HTMLSelectElement).value);
    last = null;
    draw();
  });
  root.querySelector('.dbg-set input')!.addEventListener('change', (e) => {
    const n = parseNumber((e.target as HTMLInputElement).value);
    if (n === null || n < 0 || n > 255) {
      status(root, 'Type the raw integer, from 0 to 255, in decimal, hex (0x…) or binary (0b…).');
      return;
    }
    raw = n;
    draw();
  });
}

// ---- IEEE 754 floating point ----

/** A float's fields, named above the bits. Inside the fraction, a small gap every four bits helps counting. */
const FLOAT_GROUPS = [
  { hi: 31, lo: 31, head: 'sign' },
  { hi: 30, lo: 23, head: 'exponent' },
  { hi: 22, lo: 0, head: 'fraction', split: 4 },
];
/** What bit `i` of a float is. */
const floatBit = (i: number) => (i === 31 ? 'the sign bit: 0 is positive, 1 is negative'
  : i >= 23 ? `exponent bit ${i - 23}, worth ${2 ** (i - 23)} in the stored exponent`
  : `fraction bit ${i}, worth 2${sup(i - 23)} of the significand`);
const floatTip = (i: number) => `Bit ${i} is ${floatBit(i)}. Click to flip it.`;

export function mountFloat(root: HTMLElement) {
  let b = readHex('x', 0x3dcccccd, 0xffffffff);
  let last: number | null = null;
  const PRESETS: [string, number][] = [['0.1', encodeFloat32(0.1)], ['1', encodeFloat32(1)], ['−2.5', encodeFloat32(-2.5)],
    ['Smallest', 0x00000001], ['∞', 0x7f800000], ['NaN', 0x7fc00000]];

  const html = page({
    crumbs: 'Representing numbers',
    title: 'IEEE 754 floating point',
    intro: 'A <code>float</code> stores a sign bit, an 8-bit exponent and a 23-bit fraction. The value is ±1.fraction × 2 to the power of exponent − 127, so it covers a huge range with about seven significant digits. Type a number, pick one below, or click the bits.',
    file: 'float.c',
    controls: `
      <div class="dbg-presets">${PRESETS.map(([n, v]) => `<button type="button" class="dbg-btn" data-bits="${v}">${n}</button>`).join('')}</div>
      <label class="dbg-set">f = <input type="text" spellcheck="false" autocomplete="off" aria-label="Set f"></label>`,
    body: '<div class="vars-wrap"></div>',
    after: `<section class="prose">
      <h2>Why 0.1 + 0.2 is not 0.3</h2>
      <p>Most decimal fractions have no exact binary form, just as 1/3 has no exact decimal form. 0.1 is stored as the
        nearest float, 0.100000001490116119384765625, so small errors appear when such values are added and compared.
        Compare floats with a tolerance, or use integers or fixed point for exact quantities such as money or counts.</p>
      <p>Exponent 0 marks zero and subnormal numbers, which drop the leading 1 to reach values closer to zero. Exponent
        255 marks infinity (fraction 0) and NaN, “not a number” (any other fraction).</p>
    </section>
    <section class="prose quake" aria-labelledby="quake">
      <h2 id="quake">Quake III’s fast inverse square root</h2>
      <p>Lighting in a 3D game needs 1/√x constantly, to scale vectors to length 1. In 1999, a square root and a division
        were slow, so Quake III Arena computed an approximation with integer arithmetic on the float’s bits, followed by
        one refining step. The trick is often credited to John Carmack, but it was in use earlier; its history traces
        back to Greg Walsh and others.</p>
      <p>It works because a float’s bits, read as an integer, are roughly a scaled and shifted log₂ of its value: the
        exponent field is the logarithm’s whole part, and the fraction is a rough linear stand-in for the rest. Taking
        1/√x halves the logarithm and negates it, so the code shifts the bits right by one and subtracts them from a
        constant, 0x5F3759DF, chosen to undo the shift and offset. That lands within about 3.5% of the answer, and one
        Newton–Raphson step brings it within about 0.18%.</p>
    </section>
    ${debuggerWindow({
      file: 'q_rsqrt.c', label: 'Fast inverse square root, step by step', cls: 'quake-dbg', body: '<div class="quake-vars"></div>',
      controls: '<label class="dbg-set">number = <input type="text" spellcheck="false" autocomplete="off" aria-label="Set number" value="2"></label>',
    })}
    <section class="prose">
      <p>The comments are the original’s, as released with the Quake III Arena source code in 2005; the values in
        parentheses are this run’s. The original reads the bits with pointer casts, <code>i = *(long *)&amp;y;</code>, which break C’s strict
        aliasing rule and are undefined behavior in modern compilers; <code>long</code> is also 64 bits on many
        systems today. The version above uses <code>memcpy</code> and <code>uint32_t</code> instead, which compilers
        turn into the same single instruction. Modern processors also have their own reciprocal square root
        instructions, so the trick is now mostly a lesson in how floats are stored.</p>
    </section>`,
  });

  function draw() {
    const d = decodeFloat32(b);
    const shown = d.kind === 'nan' ? 'NAN' : d.kind === 'infinity' ? `${d.sign ? '-' : ''}INFINITY` : `${shortest(d.value)}f`;
    code(root, [
      '#include <math.h>',
      '#include <stdint.h>',
      '#include <string.h>',
      '',
      `float f = ${shown};`,
      'uint32_t bits;',
      `memcpy(&bits, &f, sizeof bits);`.padEnd(34) + `// ${hexN(b, 32)}`,
    ], 6);
    const flipped = flips(last, b);
    const significand = d.kind === 'normal' ? 1 + d.fraction / 2 ** 23 : d.fraction / 2 ** 23;
    const power = d.kind === 'normal' ? d.exponent - 127 : -126;
    const meaning: Record<Float32Parts['kind'], string> = {
      normal: `(−1)${sup(d.sign)} × ${significand} × 2${sup(power)}`,
      subnormal: `subnormal: (−1)${sup(d.sign)} × 0.${d.fraction.toString(2).padStart(23, '0').replace(/0+$/, '')}₂ × 2⁻¹²⁶`,
      zero: `${d.sign ? 'negative ' : ''}zero`,
      infinity: `${d.sign ? 'negative ' : ''}infinity`,
      nan: 'NaN, not a number',
    };
    root.querySelector('.vars-wrap')!.innerHTML = table(
      wideRow('bits', 'uint32_t', `<code class="hex">${hexN(b, 32)}</code>`,
        bits('bits', b, 32, { editable: true, flipped, groups: FLOAT_GROUPS, tip: floatTip }),
        last !== null && last !== b) +
      row('sign', '', `<code class="hex">${d.sign}</code> <small>${d.sign ? 'negative' : 'positive'}</small>`, '') +
      row('exponent', '', `<code class="hex">${d.exponent}</code> <small>${d.kind === 'normal' ? `${d.exponent} − 127 = ${d.exponent - 127}` : d.exponent === 0 ? 'zero or subnormal' : 'infinity or NaN'}</small>`, '') +
      row('fraction', '', `<code class="hex">${hexN(d.fraction, 24).replace('0x0', '0x')}</code> <small>${d.kind === 'normal' ? `1.fraction = ${significand}` : ''}</small>`, '') +
      row('f', 'float', `<code class="hex">${d.kind === 'nan' ? 'NaN' : d.kind === 'infinity' ? (d.sign ? '−∞' : '∞') : shortest(d.value)}</code>`, ''),
    );
    showValue(root, d.kind === 'nan' ? 'NaN' : d.kind === 'infinity' ? (d.sign ? '-inf' : 'inf') : shortest(d.value));
    status(root, `${esc(meaning[d.kind])}${d.exact ? ` = ${d.exact}` : ''}.`);
    last = b;
    syncUrl({ x: (b >>> 0).toString(16).toUpperCase().padStart(8, '0') });
  }

  wire(root, html, draw);
  const quake = root.querySelector<HTMLElement>('.quake-dbg')!;
  function drawQuake(x: number) {
    const q = qRsqrt(x);
    const exact = 1 / Math.sqrt(Math.fround(x));
    const err = (v: number) => `${(((v - exact) / exact) * 100).toFixed(4)}%`;
    code(quake, [
      'float Q_rsqrt(float number)',
      '{',
      '    float x2 = number * 0.5f;',
      '    float y = number;',
      '    uint32_t i;',
      `    memcpy(&i, &y, sizeof i);`.padEnd(40) + `// evil floating point bit level hacking  (${hexN(q.i0, 32)})`,
      `    i = 0x5F3759DF - (i >> 1);`.padEnd(40) + `// what the fuck?  (${hexN(q.i1, 32)})`,
      `    memcpy(&y, &i, sizeof y);`.padEnd(40) + `//   (first guess: ${shortest(q.y0)})`,
      `    y = y * (1.5f - (x2 * y * y));`.padEnd(40) + `// 1st iteration  (${shortest(q.y1)})`,
      `//  y = y * (1.5f - (x2 * y * y));`.padEnd(40) + '// 2nd iteration, this can be removed',
      '    return y;',
      '}',
    ], 10);
    quake.querySelector('.quake-vars')!.innerHTML = table(
      row('number', 'float', `<code class="hex">${shortest(Math.fround(x))}</code>`, '') +
      wideRow('i', 'uint32_t', `<code class="hex">${hexN(q.i0, 32)}</code> <small>the bits of number</small>`, bits('i', q.i0, 32, { groups: FLOAT_GROUPS })) +
      wideRow('i >> 1', '', `<code class="hex">${hexN(q.half, 32)}</code> <small>halves the exponent, roughly halving log₂</small>`, bits('h', q.half, 32, { groups: FLOAT_GROUPS })) +
      wideRow('i', 'uint32_t', `<code class="hex">${hexN(q.i1, 32)}</code> <small>0x5F3759DF − (i >> 1)</small>`, bits('m', q.i1, 32, { groups: FLOAT_GROUPS })) +
      row('y', 'float', `<code class="hex">${shortest(q.y0)}</code> <small>first guess, error ${err(q.y0)}</small>`, '') +
      row('y', 'float', `<code class="hex">${shortest(q.y1)}</code> <small>after one Newton step, error ${err(q.y1)}</small>`, '') +
      row('1/√x', '', `<code class="hex">${exact.toPrecision(9)}</code> <small>exact, for comparison</small>`, ''),
    );
    quake.querySelector('.dbg-status')!.textContent =
      `1/√${shortest(Math.fround(x))} ≈ ${shortest(q.y1)} after one Newton step, ${err(q.y1)} from the exact ${exact.toPrecision(9)}.`;
  }
  drawQuake(2);
  quake.querySelector('input')!.addEventListener('change', (e) => {
    const x = Number((e.target as HTMLInputElement).value.trim());
    if (!Number.isFinite(x) || x <= 0) {
      quake.querySelector('.dbg-status')!.textContent = 'Type a positive number, such as 2, 0.25 or 1000. The trick only works for positive, normal floats.';
      return;
    }
    drawQuake(x);
  });
  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    if (quake.contains(t)) return;
    const k = t.closest<HTMLElement>('.bitrow.editable .bit');
    if (k) {
      const i = Number(k.dataset.bit);
      b = (b ^ (1 << i)) >>> 0;
      draw();
      const { exact } = decodeFloat32(b);
      status(root, `Bit ${i} is ${floatBit(i)}. ${esc(exact ? `f is now exactly ${exact}.` : '')}`);
      return;
    }
    const p = t.closest<HTMLElement>('[data-bits]');
    if (p) {
      b = Number(p.dataset.bits) >>> 0;
      draw();
    }
  });
  root.querySelector('.dbg-set input')!.addEventListener('change', (e) => {
    const s = (e.target as HTMLInputElement).value.trim().toLowerCase().replace('−', '-');
    const x = s === 'nan' ? NaN : /^[+-]?(inf|infinity|∞)$/.test(s) ? (s.startsWith('-') ? -Infinity : Infinity) : Number(s);
    if (s === '' || (Number.isNaN(x) && s !== 'nan')) {
      status(root, 'Type a number such as 0.1, -2.5 or 1e-10, or inf or nan.');
      return;
    }
    b = Number.isNaN(x) ? 0x7fc00000 : encodeFloat32(x);
    draw();
  });
}
