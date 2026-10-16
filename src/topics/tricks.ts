/** The bit tricks page: one-line idioms that find, clear and count bits, each shown on the bits it works on. */
import {
  NUMBER_HELP, binN, bits, code, hex2, hexN, markSeg, note, oneOf, page, parseNumber, readHex, row, seg, showValue,
  status, syncUrl, table, wire,
} from './dbg';

export const TRICKS = ['clear', 'isolate', 'pow2', 'popcount', 'clz'] as const;
export type Trick = (typeof TRICKS)[number];

/** The result of each trick on an 8-bit `x`: a value for clear and isolate, 1 or 0 for pow2, a count otherwise. */
export function trick(t: Trick, x: number) {
  x &= 0xff;
  if (t === 'clear') return x & (x - 1) & 0xff;
  if (t === 'isolate') return x & -x & 0xff;
  if (t === 'pow2') return x !== 0 && (x & (x - 1)) === 0 ? 1 : 0;
  if (t === 'popcount') return [...binN(x, 8)].filter((c) => c === '1').length;
  return Math.clz32(x) - 24; // leading zeros in 8 bits; Math.clz32(0) is 32, so 0 gives 8, as on the page
}

/** The values the popcount loop's v takes, from x down to 0: each pass clears the lowest 1. */
const passes = (x: number) => {
  const vs = [x];
  while (vs[vs.length - 1]) vs.push(vs[vs.length - 1] & (vs[vs.length - 1] - 1));
  return vs;
};

/** The C on the page for trick `t`, with its result in a comment. Exported so the checks can compile it. */
export function trickCode(t: Trick, x: number) {
  const r = trick(t, x);
  const head = ['#include <stdint.h>', '', note(`uint8_t x = ${hexN(x, 8)};`, binN(x, 8), 44)];
  if (t === 'clear') return [...head, note('uint8_t r = x & (x - 1);', `${binN(r, 8)}: lowest 1 cleared`, 44)];
  if (t === 'isolate') return [...head, note('uint8_t r = x & -x;', `${binN(r, 8)}: only the lowest 1 kept`, 44)];
  if (t === 'pow2') {
    return ['#include <stdbool.h>', ...head, note('bool pow2 = x && !(x & (x - 1));', r ? 'true: exactly one bit is set' : 'false', 44)];
  }
  if (t === 'popcount') {
    return [...head, 'int count = 0;', note('for (uint8_t v = x; v; v &= v - 1)', 'each pass clears the lowest 1', 44),
      note('    count++;', `count = ${r}`, 44), '// GCC and Clang also have __builtin_popcount(x)'];
  }
  return [...head, '// __builtin_clz counts in a 32-bit int, and is undefined for 0', note('int lz = x ? __builtin_clz(x) - 24 : 8;', String(r), 44)];
}

export function mountTricks(root: HTMLElement) {
  let x = readHex('x', 0xb4, 0xff);
  let t = oneOf('t', TRICKS, 'clear');

  const html = page({
    crumbs: 'Bitwise operations',
    title: 'Bit tricks',
    intro: 'Subtracting 1 from a number flips its lowest 1 bit to 0 and every 0 below it to 1. Combined with AND, that one fact finds, clears and counts bits in a single line of C, without a loop over every bit. Pick a trick and click the bits of x.',
    file: 'tricks.c',
    controls: `
      ${seg('t', 'Trick', TRICKS.map((k) => [k, { clear: 'x &amp; (x−1)', isolate: 'x &amp; −x', pow2: 'Power of 2', popcount: 'Popcount', clz: 'CLZ' }[k]]))}
      <label class="dbg-set">x = <input type="text" spellcheck="false" autocomplete="off" aria-label="Set x"></label>`,
    body: '<div class="vars-wrap"></div>',
    after: `<section class="prose">
      <h2>Why x &amp; (x − 1) works</h2>
      <p>Subtracting 1 borrows from the lowest 1 bit: that bit becomes 0, the zeros below it become 1s, and every bit
        above it stays the same. ANDing with the original keeps the bits above and clears the rest, so exactly one bit,
        the lowest 1, disappears. A power of two has only one 1 bit, so clearing it leaves 0. And <code>-x</code> in
        two’s complement is <code>~x + 1</code>, which flips every bit above the lowest 1 and keeps that bit, so
        <code>x &amp; -x</code> isolates it.</p>
      <h2>Where they are used</h2>
      <p>Schedulers and interrupt controllers keep a bit per task or per pending interrupt, and find the next one with
        count leading zeros: Arm has a <code>CLZ</code> instruction, and FreeRTOS’s Cortex-M ports can use it to pick
        the highest-priority ready task. Popcount measures Hamming distance and parity. GCC and Clang provide
        <code>__builtin_popcount</code>, <code>__builtin_clz</code> and <code>__builtin_ctz</code>, which compile to
        single instructions where the processor has them, and C23 adds the same operations in
        <code>&lt;stdbit.h&gt;</code>.</p>
    </section>`,
  });

  function draw() {
    const r = trick(t, x);
    const lines = trickCode(t, x);
    code(root, lines, t === 'popcount' ? lines.length - 2 : lines.length - 1);

    const lowest = x ? Math.log2(x & -x) : -1;
    const hd = (v: number) => `<code class="hex">${hexN(v, 8)}</code> <small class="dec">${v}</small>`;
    const xRow = row('x', 'uint8_t', hd(x), bits('x', x, 8, {
      editable: true, under: (i) => String(i), fill: t === 'clz' ? (i) => x >> i === 0 : undefined,
      tip: (i) => `Bit ${i} of x${i === lowest ? ', its lowest 1' : ''}. Click to flip it.`,
    }));
    const lowTip = (name: string) => (i: number) => (i > lowest ? `Above the lowest 1, ${name} matches x.` : i === lowest ? `The lowest 1 of x, at bit ${i}.` : `Below the lowest 1.`);
    let rows = xRow;
    if (t === 'clear' || t === 'pow2') {
      rows += row('x - 1', '', hd((x - 1) & 0xff), bits('xm1', (x - 1) & 0xff, 8, { tip: (i) => (i > lowest ? 'Above the lowest 1, x − 1 matches x.' : i === lowest ? 'The lowest 1 of x became 0.' : 'Below it, the 0s became 1s.') }));
      rows += row(t === 'clear' ? 'r' : 'x & (x - 1)', '', hd(x & (x - 1) & 0xff), bits('r', x & (x - 1) & 0xff, 8, { tip: lowTip('the result') }));
    }
    if (t === 'isolate') {
      rows += row('-x', '', hd(-x & 0xff), bits('neg', -x & 0xff, 8, { tip: (i) => (i > lowest ? 'Above the lowest 1, −x is the inverse of x.' : i === lowest ? 'The lowest 1 of x is kept.' : 'Below it, 0s, as in x.') }));
      rows += row('r', '', hd(r), bits('r', r, 8, { tip: lowTip('the result') }));
    }
    if (t === 'popcount') {
      rows += passes(x).slice(1).map((v, k) => row('v', `pass ${k + 1}`, hd(v), bits(`v${k}`, v, 8))).join('');
    }
    root.querySelector('.vars-wrap')!.innerHTML = table(rows);
    markSeg(root, 't', t);
    showValue(root, hexN(x, 8));
    const ones = trick('popcount', x);
    status(root, {
      clear: x ? `x − 1 turns the lowest 1 (bit ${lowest}) into 0 and the bits below it into 1s. ANDing with x clears bit ${lowest} and nothing else.` : 'x is 0, which has no 1 to clear, so the result is 0.',
      isolate: x ? `−x is ~x + 1: every bit above bit ${lowest} is inverted, so ANDing with x keeps only bit ${lowest}, worth ${2 ** lowest}.` : 'x is 0, so there is no lowest 1 and the result is 0.',
      pow2: !x ? 'x is 0, which is not a power of two; the x && part rules it out.' : r ? `x has exactly one 1 bit, so clearing it leaves 0: x is 2${'⁰¹²³⁴⁵⁶⁷'[lowest]} = ${x}, a power of two.` : `x has ${ones} 1 bits, so clearing the lowest leaves ${x & (x - 1)}, not 0: x is not a power of two.`,
      popcount: `Each pass clears one 1, so the loop runs once per 1 bit: ${ones} ${ones === 1 ? 'pass' : 'passes'}, never all 8 unless every bit is set.`,
      clz: x ? `The highest 1 is bit ${7 - r}, so there are ${r} zeros above it. Counting leading zeros finds the highest set bit in one instruction.` : 'x is 0: all 8 bits are leading zeros. __builtin_clz(0) is undefined, which is why the code checks for 0 first.',
    }[t]);
    syncUrl({ x: hex2(x), t });
  }

  wire(root, html, draw);
  root.addEventListener('click', (e) => {
    const target = e.target as Element;
    const b = target.closest<HTMLElement>('.bitrow.editable .bit');
    if (b) x ^= 1 << Number(b.dataset.bit);
    else {
      const o = target.closest<HTMLElement>('[data-t]');
      if (!o) return;
      t = o.dataset.t as Trick;
    }
    draw();
  });
  root.querySelector('.dbg-set input')!.addEventListener('change', (e) => {
    const v = parseNumber((e.target as HTMLInputElement).value);
    if (v === null || v < 0 || v > 255) return status(root, `Type a whole number from 0 to 255, ${NUMBER_HELP}.`);
    x = v;
    draw();
  });
}
