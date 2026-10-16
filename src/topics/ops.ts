/**
 * The "Bitwise operations" pages after AND, OR, XOR and NOT: shifts and rotates, masks, read-modify-write, and
 * endianness. Each is a debugger paused on a few lines of C, with the variables shown bit by bit.
 */
import { esc } from '../core/render';
import {
  NUMBER_HELP, binN, bit, bits, code, flips, hex2, hexN, markSeg, nibbles, note, oneOf, page, parseNumber, readHex, row, seg,
  showValue, status, syncUrl, table, wideRow, wire,
} from './dbg';
import { toInt8 } from './numbers';


// ---- Shifts and rotates ----

export const SHIFTS = ['shl', 'shr', 'sar', 'rol', 'ror'] as const;
export type Shift = (typeof SHIFTS)[number];

/** `x` (8 bits) shifted or rotated by `n` (0 to 7). The arithmetic shift reads x as int8_t. Exported for the checks. */
export function shift(op: Shift, x: number, n: number) {
  x &= 0xff;
  const r = op === 'shl' ? x << n : op === 'shr' ? x >>> n : op === 'sar' ? toInt8(x) >> n
    : op === 'rol' ? (x << n) | (x >>> (8 - n)) : (x >>> n) | (x << (8 - n));
  return r & 0xff;
}

/** Where bit `i` of the result comes from: a bit of x, a 0 shifted in, or a copy of the sign bit. */
export function sourceBit(op: Shift, n: number, i: number): number | 'zero' | 'sign' {
  if (op === 'shl') return i - n >= 0 ? i - n : 'zero';
  if (op === 'shr') return i + n <= 7 ? i + n : 'zero';
  if (op === 'sar') return i + n <= 7 ? i + n : 'sign';
  return op === 'rol' ? (i - n + 8) % 8 : (i + n) % 8;
}

/** The C on the shifts page, with each line's result in a comment. Exported so the checks can compile it. */
export function shiftCode(op: Shift, x: number, n: number) {
  const r = shift(op, x, n);
  const out = binN(r, 8);
  const lines = ['#include <stdint.h>', '', note(`uint8_t x = ${hexN(x, 8)};`, binN(x, 8), 46)];
  if (op === 'shl') lines.push(note(`uint8_t r = (uint8_t)(x << ${n});`, out, 46));
  if (op === 'shr') lines.push(note(`uint8_t r = x >> ${n};`, out, 46));
  if (op === 'sar') lines.push(note('int8_t  s = (int8_t)x;', String(toInt8(x)), 46), note(`int8_t  r = s >> ${n};`, `${out} = ${toInt8(r)}`, 46));
  if (op === 'rol') lines.push(note(`uint8_t r = (uint8_t)((x << ${n}) | (x >> ${8 - n}));`, out, 46));
  if (op === 'ror') lines.push(note(`uint8_t r = (uint8_t)((x >> ${n}) | (x << ${8 - n}));`, out, 46));
  return lines;
}

const SHIFT_NAME: Record<Shift, string> = {
  shl: 'Shift left', shr: 'Shift right', sar: 'Arithmetic shift right', rol: 'Rotate left', ror: 'Rotate right',
};

export function mountShifts(root: HTMLElement) {
  let x = readHex('x', 0xb2, 0xff);
  let op = oneOf('op', SHIFTS, 'shl');
  const n0 = Number(new URLSearchParams(location.search).get('n') ?? NaN);
  let n = Number.isInteger(n0) && n0 >= 0 && n0 <= 7 ? n0 : 3;
  let last: number | null = null;

  const html = page({
    crumbs: 'Bitwise operations',
    title: 'Shifts and rotates',
    intro: 'A shift moves every bit of a value left or right by the same number of places. Bits pushed off one end are lost, and new bits come in at the other: zeros, or copies of the sign bit. A rotate wraps the bits that fall off back around. Pick an operation and a distance, and click the bits of x.',
    file: 'shifts.c',
    controls: `
      ${seg('op', 'Operation', [['shl', '&lt;&lt;'], ['shr', '&gt;&gt;'], ['sar', 'signed &gt;&gt;'], ['rol', 'rotl'], ['ror', 'rotr']])}
      <label class="dbg-set">n = <select aria-label="Shift distance">${Array.from({ length: 8 }, (_, k) => `<option>${k}</option>`).join('')}</select></label>
      <label class="dbg-set">x = <input type="text" spellcheck="false" autocomplete="off" aria-label="Set x"></label>`,
    body: '<div class="vars-wrap"></div>',
    after: `<section class="prose">
      <h2>Shifting as arithmetic</h2>
      <p>Shifting left by n multiplies by 2ⁿ, and shifting an unsigned value right by n divides by 2ⁿ, rounding down.
        Compilers turn multiplications and divisions by constant powers of two into shifts, and firmware uses shifts to
        build masks such as <code>1u &lt;&lt; 5</code> and to pull fields out of registers.</p>
      <p>For a signed value, the right shift that copies the sign bit is an arithmetic shift. It divides by 2ⁿ rounding
        toward minus infinity, so −78 &gt;&gt; 3 is −10, not −9. Shifting a negative value right is
        implementation-defined in C; GCC, Clang and Arm’s compilers all copy the sign bit.</p>
      <h2>Pitfalls in C</h2>
      <p>Shifting by the width of the type or more is undefined behavior: <code>x &lt;&lt; 32</code> on a 32-bit
        <code>uint32_t</code> can return x unchanged on one processor and 0 on another. Shifting a 1 into the sign bit of
        a signed <code>int</code>, as in <code>1 &lt;&lt; 31</code>, is undefined too, which is why masks are written
        with an unsigned constant, <code>1u &lt;&lt; 31</code>. And a <code>uint8_t</code> is promoted to
        <code>int</code> before it is shifted, so <code>x &lt;&lt; 3</code> keeps the high bits until the result is
        stored back into 8 bits.</p>
      <p>C has no rotate operator. The two-shift pattern above is recognized by GCC and Clang and compiled to a single
        rotate instruction, and C23 adds <code>stdc_rotate_left</code> and <code>stdc_rotate_right</code>.</p>
    </section>`,
  });

  function draw() {
    const r = shift(op, x, n);
    const signed = op === 'sar';
    const lines = shiftCode(op, x, n);
    code(root, lines, lines.length - 1);

    const src = (i: number) => sourceBit(op, n, i);
    const tip = (i: number) => {
      const s = src(i);
      return s === 'zero' ? `Bit ${i} of r is a 0 shifted in.`
        : s === 'sign' ? `Bit ${i} of r is a copy of the sign bit, bit 7 of x (${bit(x, 7)}).`
        : `Bit ${i} of r is bit ${s} of x (${bit(x, s)}).`;
    };
    const lost = op === 'rol' || op === 'ror' ? 0 : n;
    const value = (v: number, asSigned: boolean) => `<code class="hex">${hexN(v, 8)}</code> <small class="dec">${asSigned ? toInt8(v) : v}</small>`;
    root.querySelector('.vars-wrap')!.innerHTML = table(
      row('x', 'uint8_t', value(x, false),
        bits('x', x, 8, { editable: true, flipped: flips(last, x), under: (i) => String(i),
          tip: (i) => `Bit ${i} of x. Click to ${bit(x, i) ? 'clear' : 'set'} it.` }), last !== null && last !== x) +
      row('r', signed ? 'int8_t' : 'uint8_t', value(r, signed), bits('r', r, 8, { fill: (i) => typeof src(i) === 'string', tip })),
    );
    markSeg(root, 'op', op);
    root.querySelector<HTMLSelectElement>('.dbg-set select')!.value = String(n);
    showValue(root, hexN(x, 8));
    const p = 2 ** n;
    status(root, {
      shl: `${SHIFT_NAME.shl} by ${n}: ${x} × ${p} = ${x * p}, and keeping the low 8 bits leaves ${r}. ${lost} bits fell off the top, and ${lost} zeros came in at the bottom.`,
      shr: `${SHIFT_NAME.shr} by ${n}: ${x} ÷ ${p} = ${r}, rounded down. ${lost} bits fell off the bottom, and ${lost} zeros came in at the top.`,
      sar: `${SHIFT_NAME.sar} by ${n}: ${toInt8(x)} ÷ ${p} = ${toInt8(r)}, rounded toward minus infinity. Copies of the sign bit (${bit(x, 7)}) came in at the top, so the sign is kept.`,
      rol: `${SHIFT_NAME.rol} by ${n}: the ${n} bits that leave the top come back in at the bottom. Nothing is lost.`,
      ror: `${SHIFT_NAME.ror} by ${n}: the ${n} bits that leave the bottom come back in at the top. Nothing is lost.`,
    }[op]);
    last = x;
    syncUrl({ x: hex2(x), op, n: String(n) });
  }

  wire(root, html, draw);
  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    const b = t.closest<HTMLElement>('.bitrow.editable .bit');
    if (b) {
      x ^= 1 << Number(b.dataset.bit);
      draw();
      return;
    }
    const o = t.closest<HTMLElement>('[data-op]');
    if (o) {
      op = o.dataset.op as Shift;
      draw();
    }
  });
  root.querySelector('.dbg-set select')!.addEventListener('change', (e) => {
    n = Number((e.target as HTMLSelectElement).value);
    draw();
  });
  root.querySelector('.dbg-set input')!.addEventListener('change', (e) => {
    const v = parseNumber((e.target as HTMLInputElement).value);
    if (v === null || v < -128 || v > 255) return status(root, `Type a number from −128 to 255, ${NUMBER_HELP}.`);
    x = v & 0xff;
    draw();
  });
}

// ---- Masks ----

export const MASK_OPS = ['set', 'clear', 'toggle', 'test'] as const;
export type MaskOp = (typeof MASK_OPS)[number];

/** The register after `op` with `mask`; for 'test', the value `reg & mask` that the if statement checks. */
export function maskOp(op: MaskOp, reg: number, mask: number) {
  const r = op === 'set' ? reg | mask : op === 'clear' ? reg & ~mask : op === 'toggle' ? reg ^ mask : reg & mask;
  return r & 0xff;
}

/** The mask as C would write it: `1u << n` for a single bit, otherwise hex. */
const maskExpr = (m: number) => (m && !(m & (m - 1)) ? `1u << ${Math.log2(m)}` : hexN(m, 8));
const bitList = (m: number) => {
  const on = [7, 6, 5, 4, 3, 2, 1, 0].filter((i) => bit(m, i));
  return on.length === 1 ? `bit ${on[0]}` : `bits ${on.join(', ')}`;
};

export function mountMasks(root: HTMLElement) {
  let reg = readHex('reg', 0x91, 0xff);
  let mask = readHex('mask', 0x20, 0xff);
  let op = oneOf('op', MASK_OPS, 'set');

  const html = page({
    crumbs: 'Bitwise operations',
    title: 'Masks',
    intro: 'A mask is a value whose 1 bits pick out the bits an operation should touch. With the right operator, the same mask sets those bits, clears them, toggles them or tests them, and leaves every other bit of the register alone. Click the bits of reg and mask, and pick an operation.',
    file: 'masks.c',
    controls: seg('op', 'Operation', [['set', 'Set'], ['clear', 'Clear'], ['toggle', 'Toggle'], ['test', 'Test']]),
    body: '<div class="vars-wrap"></div>',
    after: `<section class="prose">
      <h2>The four patterns</h2>
      <table class="op-table">
        <thead><tr><th scope="col">To</th><th scope="col">In C</th><th scope="col">Why it works</th></tr></thead>
        <tbody>
          <tr><th scope="row">Set</th><td><code>reg |= mask;</code></td><td>x | 1 is 1, and x | 0 is x</td></tr>
          <tr><th scope="row">Clear</th><td><code>reg &amp;= ~mask;</code></td><td>x &amp; 0 is 0, and x &amp; 1 is x</td></tr>
          <tr><th scope="row">Toggle</th><td><code>reg ^= mask;</code></td><td>x ^ 1 is the opposite of x, and x ^ 0 is x</td></tr>
          <tr><th scope="row">Test</th><td><code>if (reg &amp; mask)</code></td><td>nonzero exactly when a masked bit is 1</td></tr>
        </tbody>
      </table>
      <h2>Fields wider than one bit</h2>
      <p>Registers often pack several settings into one byte or word. To read a 3-bit field at bits 6 to 4, shift it
        down and mask it. To write one, clear the field, then OR in the new value shifted into place:</p>
      <pre class="code"><code>uint8_t field = (reg &gt;&gt; 4) &amp; 0x7u;               // read bits 6 to 4
reg = (reg &amp; ~(0x7u &lt;&lt; 4)) | ((val &amp; 0x7u) &lt;&lt; 4);  // write val there</code></pre>
      <p>Vendor headers name each field’s position and mask, such as <code>USART_CR1_UE</code>, so code reads as
        <code>USART1-&gt;CR1 |= USART_CR1_UE;</code> rather than a bare number.</p>
      <p>On a hardware register each of these is a <a href="?p=rmw" data-nav>read-modify-write</a>, which has a
        pitfall of its own.</p>
    </section>`,
  });

  function draw() {
    const r = maskOp(op, reg, mask);
    const lines = [
      '#include <stdint.h>',
      '',
      `uint8_t reg  = ${hexN(reg, 8)};`.padEnd(32) + `// ${binN(reg, 8)}`,
      `uint8_t mask = ${maskExpr(mask)};`.padEnd(32) + `// ${binN(mask, 8)}`,
    ];
    if (op === 'set') lines.push('reg |= mask;'.padEnd(32) + `// ${binN(r, 8)}`);
    if (op === 'clear') lines.push('reg &= ~mask;'.padEnd(32) + `// ${binN(r, 8)}, with ~mask = ${binN(~mask & 0xff, 8)}`);
    if (op === 'toggle') lines.push('reg ^= mask;'.padEnd(32) + `// ${binN(r, 8)}`);
    if (op === 'test') lines.push('if (reg & mask) {'.padEnd(32) + `// ${binN(r, 8)}: ${r ? 'true' : 'false'}`, '    /* a masked bit is set */', '}');
    code(root, lines, 4);

    const hexDec = (v: number) => `<code class="hex">${hexN(v, 8)}</code> <small class="dec">${v}</small>`;
    const masked = (i: number) => bit(mask, i) === 1;
    const touched = (i: number) => op !== 'test' && masked(i) && bit(r, i) !== bit(reg, i);
    root.querySelector('.vars-wrap')!.innerHTML = table(
      row('reg', 'uint8_t', hexDec(reg), bits('reg', reg, 8, { editable: true, under: (i) => String(i),
        tip: (i) => `Bit ${i} of reg${masked(i) ? ', selected by the mask' : ''}. Click to flip it.` })) +
      row('mask', 'uint8_t', hexDec(mask), bits('mask', mask, 8, { editable: true,
        tip: (i) => `Mask bit ${i}: ${masked(i) ? `the operation touches bit ${i}` : `bit ${i} is left alone`}. Click to flip it.` })) +
      (op === 'clear' ? row('~mask', '', hexDec(~mask & 0xff), bits('inv', ~mask & 0xff, 8)) : '') +
      row(op === 'test' ? 'reg & mask' : 'reg', op === 'test' ? '' : 'after', hexDec(r),
        bits('r', r, 8, { flipped: touched, tip: (i) => masked(i)
          ? `Bit ${i} is selected by the mask: ${op === 'test' ? `it is ${bit(r, i)} in reg` : `${bit(reg, i)} became ${bit(r, i)}`}.`
          : `Bit ${i} is not in the mask, so ${op === 'test' ? 'the test ignores it' : `it keeps its value, ${bit(reg, i)}`}.` })),
    );
    markSeg(root, 'op', op);
    const which = mask ? bitList(mask) : 'no bits';
    status(root, {
      set: `OR with the mask sets ${which} to 1 and leaves the rest of reg as it was.`,
      clear: `AND with the inverted mask clears ${which} to 0 and leaves the rest of reg as it was.`,
      toggle: `XOR with the mask flips ${which} and leaves the rest of reg as it was.`,
      test: `AND with the mask keeps only ${which}. The result is ${r ? `${hexN(r, 8)}, which is nonzero, so the test is true` : '0, so the test is false'}.`,
    }[op]);
    syncUrl({ reg: hex2(reg), mask: hex2(mask), op });
  }

  wire(root, html, draw);
  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    const b = t.closest<HTMLElement>('.bitrow.editable .bit');
    if (b) {
      const k = 1 << Number(b.dataset.bit);
      if (b.dataset.row === 'reg') reg ^= k;
      else mask ^= k;
      draw();
      return;
    }
    const o = t.closest<HTMLElement>('[data-op]');
    if (o) {
      op = o.dataset.op as MaskOp;
      draw();
    }
  });
}

// ---- Read-modify-write ----

/** Where the debugger is paused: before a line of led_on() runs, after it returns, or inside the interrupt handler. */
type At = 'read' | 'modify' | 'write' | 'end' | 'isr';

export interface RmwState {
  at: At;
  /** The register, and the local copy (null before it exists). */
  odr: number;
  v: number | null;
  say: string;
}

const START = 0x40;
const LED = 3;
const IRQ_BIT = 0;

/**
 * Every state the debugger stops at: led_on() setting bit 3 of the output register, either by read-modify-write or
 * with one write to a set register, optionally with an interrupt that sets bit 0 partway through. Exported for the
 * checks.
 */
export function rmwRun(mode: 'rmw' | 'set', irq: boolean): RmwState[] {
  const s: RmwState[] = [];
  let odr = START;
  const isr = (when: string) => {
    odr |= 1 << IRQ_BIT;
    s.push({ at: 'isr', odr, v: s[s.length - 1].v, say: `An interrupt arrives ${when}. Its handler sets bit ${IRQ_BIT} of the register, to switch on another output.` });
  };
  if (mode === 'rmw') {
    s.push({ at: 'read', odr, v: null, say: `Paused before the read. The register holds ${hexN(odr, 8)}: only bit 6 is set.` });
    const v0 = odr;
    s.push({ at: 'modify', odr, v: v0, say: `Read: v is now a copy of the register, ${hexN(v0, 8)}.` });
    if (irq) isr('between the read and the write');
    const v1 = v0 | (1 << LED);
    s.push({ at: 'write', odr, v: v1, say: `Modify: v |= (1u << ${LED}) sets bit ${LED} of the copy, ${hexN(v1, 8)}. The register itself has not changed.` });
    odr = v1;
    s.push({ at: 'end', odr, v: v1, say: irq
      ? `Write: the register becomes ${hexN(odr, 8)}. Bit ${IRQ_BIT}, set by the interrupt, is 0 again: the write put back the old copy and erased it. This is a lost update.`
      : `Write: the register becomes ${hexN(odr, 8)}. Bit ${LED} is set and every other bit is unchanged. Turn on the interrupt to see what can go wrong.` });
  } else {
    s.push({ at: 'write', odr, v: null, say: `Paused before the write. The register holds ${hexN(odr, 8)}.` });
    if (irq) isr('before the write. It cannot arrive in the middle of it: the write is a single store');
    odr |= 1 << LED;
    s.push({ at: 'end', odr, v: null, say: `Write: the set register turns on bit ${LED} of the output register in a single store, without reading it, so every other bit is left alone. The register is ${hexN(odr, 8)}${irq ? `, and bit ${IRQ_BIT} from the interrupt is still set` : ''}.` });
  }
  return s;
}

/** The two listings, and the line each pause point is on. */
const LISTINGS: Record<'rmw' | 'set', { lines: string[]; line: Partial<Record<At, number>> }> = {
  rmw: {
    lines: [
      '#include <stdint.h>',
      '#define GPIO_ODR (*(volatile uint8_t *)0x40020014)',
      '',
      'void led_on(void)',
      '{',
      '    uint8_t v = GPIO_ODR;'.padEnd(30) + '// read',
      `    v |= (1u << ${LED});`.padEnd(30) + '// modify',
      '    GPIO_ODR = v;'.padEnd(30) + '// write',
      '}',
      '',
      'void timer_isr(void)',
      '{',
      `    GPIO_ODR |= (1u << ${IRQ_BIT});`,
      '}',
    ],
    line: { read: 5, modify: 6, write: 7, end: 8, isr: 12 },
  },
  set: {
    lines: [
      '#include <stdint.h>',
      '// Writing a 1 to a bit of GPIO_SET sets that bit of GPIO_ODR; 0s change nothing.',
      '#define GPIO_SET (*(volatile uint8_t *)0x40020018)',
      '',
      'void led_on(void)',
      '{',
      `    GPIO_SET = (1u << ${LED});`,
      '}',
      '',
      'void timer_isr(void)',
      '{',
      `    GPIO_SET = (1u << ${IRQ_BIT});`,
      '}',
    ],
    line: { write: 6, end: 7, isr: 11 },
  },
};

export function mountRmw(root: HTMLElement) {
  let mode = oneOf('mode', ['rmw', 'set'] as const, 'rmw');
  let irq = new URLSearchParams(location.search).get('irq') === '1';
  let at = 0;

  const html = page({
    crumbs: 'Bitwise operations',
    title: 'Read-modify-write',
    intro: 'Hardware is controlled through registers at fixed memory addresses. To change some bits of a register and leave the others alone, code reads it, changes the bits in a copy, and writes the copy back. Step through it, then turn on the interrupt to see the update an interrupt can lose.',
    file: 'gpio.c',
    controls: `
      ${seg('mode', 'Method', [['rmw', 'Read-modify-write'], ['set', 'Set register']])}
      ${seg('irq', 'Interrupt', [['0', 'No interrupt'], ['1', 'Interrupt']])}
      <button type="button" class="dbg-btn" data-act="step">Step</button>
      <button type="button" class="dbg-btn" data-act="restart">Restart</button>`,
    body: '<div class="vars-wrap"></div>',
    after: `<section class="prose">
      <h2>Why volatile</h2>
      <p>A register can change without the program writing to it, and writing to it has effects beyond storing a value.
        <code>volatile</code> tells the compiler that every read and write in the source must happen, in order. Without
        it, the compiler may keep the register in a processor register, merge two writes into one, or remove a read whose
        result looks unused.</p>
      <h2>Avoiding the lost update</h2>
      <p>The read, the change and the write are separate instructions, and an interrupt between them can change the same
        register. When the main code writes its copy back, that change is erased. The fixes are to disable interrupts
        around the sequence, to give each register a single owner, or to use hardware that changes bits in one write.
        STM32 GPIO ports have a bit set/reset register, BSRR, whose low half sets output bits and whose high half clears
        them; the Raspberry Pi RP2040 maps every peripheral register at extra addresses that set, clear or toggle bits
        on a write. Many Cortex-M3 and M4 parts also have bit-banding, an alias address for every single bit.</p>
      <p>Status registers add another trap. Many flags clear when a 1 is written to them, so a read-modify-write that
        writes back a flag it read as 1 clears it by accident. Datasheets mark these bits rc_w1 or W1C; write a mask with
        only the intended bits instead of a modified copy.</p>
    </section>`,
  });

  function draw() {
    const states = rmwRun(mode, irq);
    at = Math.min(at, states.length - 1);
    const s = states[at];
    const prev = at > 0 ? states[at - 1] : null;
    const listing = LISTINGS[mode];
    code(root, listing.lines, listing.line[s.at]!);

    const tipOdr = (i: number) => (i === LED ? `Bit ${i} drives the LED that led_on() switches on.`
      : i === IRQ_BIT ? `Bit ${i} is the output the interrupt switches on.` : `Bit ${i} belongs to another output and should not change.`);
    root.querySelector('.vars-wrap')!.innerHTML = table(
      row('GPIO_ODR', 'volatile uint8_t', `<code class="hex">${hexN(s.odr, 8)}</code>`,
        bits('odr', s.odr, 8, { under: (i) => String(i), flipped: flips(prev?.odr ?? null, s.odr), tip: tipOdr }), prev !== null && prev.odr !== s.odr) +
      (mode === 'rmw'
        ? row('v', 'uint8_t', s.v === null ? '<small>—</small>' : `<code class="hex">${hexN(s.v, 8)}</code>`,
          s.v === null ? '' : bits('v', s.v, 8, { flipped: flips(prev?.v ?? null, s.v), tip: (i) => `Bit ${i} of the copy in v.` }), prev?.v != null && prev.v !== s.v)
        : ''),
    );
    markSeg(root, 'mode', mode);
    markSeg(root, 'irq', irq ? '1' : '0');
    root.querySelector<HTMLButtonElement>('[data-act="step"]')!.disabled = at === states.length - 1;
    status(root, `Step ${at + 1} of ${states.length}. ${esc(s.say)}`);
    syncUrl({ mode, irq: irq ? '1' : '0' });
  }

  wire(root, html, draw);
  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    const m = t.closest<HTMLElement>('[data-mode]');
    const i = t.closest<HTMLElement>('[data-irq]');
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (m) mode = m.dataset.mode as 'rmw' | 'set';
    if (i) irq = i.dataset.irq === '1';
    if (m || i || act === 'restart') at = 0;
    else if (act === 'step') at++;
    else return;
    draw();
  });
}

// ---- Endianness ----

/** The bytes of `x` (16 or 32 bits) in memory order, lowest address first. Exported for the checks. */
export function bytesOf(x: number, width: 16 | 32, little: boolean) {
  const be = Array.from({ length: width / 8 }, (_, k) => (x >>> (width - 8 * (k + 1))) & 0xff);
  return little ? be.reverse() : be;
}

/** The endianness program, with what it prints on a machine of the given byte order. Exported so the checks can compile it. */
export function endianCode(x: number, width: 16 | 32, little: boolean) {
  const mem = bytesOf(x, width, little);
  const type = `uint${width}_t`;
  return [
    '#include <stdint.h>',
    '#include <stdio.h>',
    '',
    'int main(void)',
    '{',
    `    ${type} x = ${hexN(x, width)};`,
    note(`    ${type} *x_ptr = &x;`, 'points at all of x', 44),
    note('    uint8_t *byte_ptr = (uint8_t *)x_ptr;', 'same address, read one byte at a time', 44),
    note(`    printf("${mem.map(() => '%02X').join(' ')}\\n", ${mem.map((_, k) => `byte_ptr[${k}]`).join(', ')});`, `prints ${mem.map(hex2).join(' ')}`, 44),
    note('    if (byte_ptr[0] == (uint8_t)x)', 'is the low byte first?', 44),
    note('        puts("little-endian");', mem[0] === (x & 0xff) ? 'runs' : 'skipped', 44),
    '    else',
    note('        puts("big-endian");', mem[0] === (x & 0xff) ? 'skipped' : 'runs', 44),
    '    return 0;',
    '}',
  ];
}

/** This computer's byte order, found the same way as the C program: write a 16-bit value and read its first byte. */
const HERE_LITTLE = new Uint8Array(new Uint16Array([0x0102]).buffer)[0] === 0x02;

export function mountEndian(root: HTMLElement) {
  const q = new URLSearchParams(location.search);
  let width: 16 | 32 = q.get('w') === '32' ? 32 : 16;
  let x = readHex('x', width === 32 ? 0x12345678 : 0x1234, 2 ** width - 1);
  let little = q.has('e') ? q.get('e') === 'le' : HERE_LITTLE;

  const html = page({
    crumbs: 'Bitwise operations',
    title: 'Endianness',
    intro: `A value wider than one byte is stored in several bytes at consecutive addresses. A little-endian processor puts the least significant byte at the lowest address; a big-endian one puts the most significant byte there. This program finds out which one it runs on by pointing at a <code>uint16_t</code> through a <code>uint8_t</code> pointer and reading the bytes one at a time. This computer is ${HERE_LITTLE ? 'little' : 'big'}-endian.`,
    file: 'endian.c',
    controls: `
      ${seg('w', 'Width', [['16', 'uint16_t'], ['32', 'uint32_t']])}
      ${seg('e', 'Byte order', [['le', 'Little-endian'], ['be', 'Big-endian']])}
      <label class="dbg-set">x = <input type="text" spellcheck="false" autocomplete="off" aria-label="Set x"></label>`,
    body: '<div class="vars-wrap"></div>',
    after: `<section class="prose">
      <h2>How the program works</h2>
      <p><code>x_ptr</code> points at x as a whole value. Casting it to <code>uint8_t *</code> keeps the same address but
        changes how much each read takes: <code>byte_ptr[0]</code> is the byte at the lowest address, <code>byte_ptr[1]</code> the
        next one. If <code>byte_ptr[0]</code> is the low byte of x, the machine is little-endian. Reading any object through a
        character type such as <code>uint8_t</code> is allowed by C’s aliasing rules, so this is well defined. Pick a
        value whose bytes differ, such as 0x1234: if every byte is the same, both orders look alike.</p>
      <h2>Where it matters</h2>
      <p>x86, most Arm processors and RISC-V are little-endian. Network protocols send the most significant byte first,
        called network byte order, so code converts with <code>htons</code> and <code>ntohl</code>, or with
        <code>__builtin_bswap16</code> and <code>__builtin_bswap32</code>. Byte order also matters when a value is sent
        over a bus a byte at a time: <a href="?p=usb" data-nav>USB</a> sends multi-byte fields least significant byte
        first, while <a href="?p=ethernet" data-nav>Ethernet</a> sends its EtherType most significant byte first. It
        never matters inside a register or for shifts and masks, which work on the value, not on its bytes in memory.</p>
    </section>`,
  });

  function draw() {
    const n = width / 8;
    const mem = bytesOf(x, width, little);
    const type = `uint${width}_t`;
    const same = mem.every((b) => b === mem[0]);
    code(root, endianCode(x, width, little), 8);

    const base = 0x20001000;
    const name = (k: number) => (k === 0 ? 'least' : k === n - 1 ? 'most' : '');
    const significance = (b: number) => {
      const k = little ? b : n - 1 - b;
      return `${name(k) ? `${name(k)} significant byte, ` : ''}bits ${8 * k + 7}–${8 * k} of x`;
    };
    const byteGroups = Array.from({ length: n }, (_, k) => {
      const lo = width - 8 * (k + 1);
      return { hi: lo + 7, lo, foot: hex2((x >>> lo) & 0xff), split: 4 };
    });
    root.querySelector('.vars-wrap')!.innerHTML = table(
      (width === 32 ? wideRow : row)('x', type, `<code class="hex">${hexN(x, width)}</code>`,
        bits('x', x, width, { groups: byteGroups, tip: (i) => `Bit ${i} of x, in byte ${Math.floor(i / 8)} counting from the least significant.` })) +
      mem.map((b, k) => row(`byte_ptr[${k}]`, '', `<code class="hex">${hexN(b, 8)}</code> <small>at 0x${(base + k).toString(16).toUpperCase()}</small>`,
        bits(`m${k}`, b, 8, { groups: nibbles(b, 8, true), tip: () => `The byte at address 0x${(base + k).toString(16).toUpperCase()}: the ${significance(k)}.` }))).join(''),
    );
    markSeg(root, 'w', String(width));
    markSeg(root, 'e', little ? 'le' : 'be');
    showValue(root, hexN(x, width));
    status(root, same
      ? `Every byte of x is ${hexN(mem[0], 8)}, so both byte orders store it the same way and the test cannot tell them apart. Pick a value whose bytes differ.`
      : `On a ${little ? 'little' : 'big'}-endian machine, the byte at the lowest address, byte_ptr[0], is the ${little ? 'least' : 'most'} significant byte of x, ${hexN(mem[0], 8)}, so it prints ${mem.map(hex2).join(' ')}.` +
        (little === HERE_LITTLE ? ' That is what it prints on this computer.' : ''));
    syncUrl({ x: (x >>> 0).toString(16).toUpperCase(), w: String(width), e: little ? 'le' : 'be' });
  }

  wire(root, html, draw);
  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    const w = t.closest<HTMLElement>('[data-w]');
    const o = t.closest<HTMLElement>('[data-e]');
    if (w) {
      width = w.dataset.w === '32' ? 32 : 16;
      // Keep the example readable when switching: 0x1234 and 0x12345678 trade places, anything else is kept or cut to 16 bits.
      x = width === 32 ? (x === 0x1234 ? 0x12345678 : x) : x === 0x12345678 ? 0x1234 : x & 0xffff;
    } else if (o) little = o.dataset.e === 'le';
    else return;
    draw();
  });
  root.querySelector('.dbg-set input')!.addEventListener('change', (e) => {
    const v = parseNumber((e.target as HTMLInputElement).value);
    if (v === null || v < 0 || v >= 2 ** width) return status(root, `Type a whole number from 0 to ${hexN(2 ** width - 1, width)}, ${NUMBER_HELP}.`);
    x = v;
    draw();
  });
}
