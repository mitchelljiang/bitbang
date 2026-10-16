/**
 * The overflow and status flags page: an 8-bit add or subtract, read as unsigned and as signed, with the N, Z, C and V
 * flags an Arm processor sets for it.
 */
import { toInt8 } from './numbers';
import { bit, bits, code, flips, hex2, hexN, markSeg, note, oneOf, page, readHex, row, seg, status, syncUrl, table, wire } from './dbg';

export const FLAG_OPS = ['add', 'sub'] as const;
export type FlagOp = (typeof FLAG_OPS)[number];

/**
 * The 8-bit result and the flags, as Arm sets them: N is the top bit, Z is set for zero, C is the carry out of an add
 * or, for a subtract, the absence of a borrow, and V is signed overflow. Exported for the checks.
 */
export function arith(op: FlagOp, a: number, b: number) {
  const r = (op === 'add' ? a + b : a - b) & 0xff;
  return {
    r,
    n: r >> 7,
    z: r === 0 ? 1 : 0,
    c: op === 'add' ? (a + b > 0xff ? 1 : 0) : a >= b ? 1 : 0,
    v: ((op === 'add' ? (a ^ r) & (b ^ r) : (a ^ b) & (a ^ r)) >> 7) & 1,
  };
}

/** The C on the page: the operation, then each flag computed the way firmware would. Exported so the checks can compile it. */
export function flagCode(op: FlagOp, a: number, b: number) {
  const f = arith(op, a, b);
  const sym = op === 'add' ? '+' : '-';
  return [
    '#include <stdbool.h>',
    '#include <stdint.h>',
    '',
    note(`uint8_t a = ${hexN(a, 8)}, b = ${hexN(b, 8)};`, `${a} and ${b}, or ${toInt8(a)} and ${toInt8(b)} as int8_t`, 46),
    note(`uint8_t r = a ${sym} b;`, `${hexN(f.r, 8)}: ${f.r}, or ${toInt8(f.r)} as int8_t`, 46),
    note('bool n = r >> 7;', `N = ${f.n}: the top bit, the sign as int8_t`, 46),
    note('bool z = r == 0;', `Z = ${f.z}`, 46),
    op === 'add'
      ? note('bool c = r < a;', `C = ${f.c}: the unsigned sum ${f.c ? 'wrapped past 255' : 'fit'}`, 46)
      : note('bool c = a >= b;', `C = ${f.c}: ${f.c ? 'no borrow' : 'a borrow'} (Arm’s convention)`, 46),
    op === 'add'
      ? note('bool v = ((a ^ r) & (b ^ r)) >> 7;', `V = ${f.v}: ${f.v ? 'a and b share a sign that r does not' : 'the signed sum fit'}`, 46)
      : note('bool v = ((a ^ b) & (a ^ r)) >> 7;', `V = ${f.v}: ${f.v ? 'a and b differ in sign, and r’s differs from a’s' : 'the signed difference fit'}`, 46),
  ];
}

const PRESETS: [string, FlagOp, number, number][] = [
  ['V only', 'add', 100, 80], ['C only', 'add', 200, 100], ['C and V', 'add', 0x80, 0x80], ['Borrow', 'sub', 5, 10],
];

const FLAG_TIP = [
  'V, overflow: the result is wrong when a and b are read as signed numbers.',
  'C, carry: the result is wrong when a and b are read as unsigned numbers (for a subtract, C = 0 means a borrow).',
  'Z, zero: the 8-bit result is 0.',
  'N, negative: the top bit of the result, which is the sign as a signed number.',
];

export function mountFlags(root: HTMLElement) {
  let a = readHex('a', 100, 0xff);
  let b = readHex('b', 80, 0xff);
  let op = oneOf('op', FLAG_OPS, 'add');
  let last: { a: number; b: number } | null = null;

  const html = page({
    crumbs: 'Arithmetic and error checking',
    title: 'Overflow and status flags',
    intro: 'The adder does not know whether its inputs are signed or unsigned. It produces one 8-bit result and sets flags that describe it both ways: C when the result does not fit as unsigned, V when it does not fit as signed, plus N for negative and Z for zero. Click the bits of a and b, or try a preset.',
    file: 'flags.c',
    controls: `
      ${seg('op', 'Operation', [['add', 'a + b'], ['sub', 'a − b']])}
      <div class="dbg-presets">${PRESETS.map(([name], k) => `<button type="button" class="dbg-btn" data-preset="${k}">${name}</button>`).join('')}</div>`,
    body: '<div class="vars-wrap"></div>',
    after: `<section class="prose">
      <h2>One adder, two meanings</h2>
      <p>0x64 + 0x50 = 0xB4 is the same bit pattern either way. Read as unsigned, it is 100 + 80 = 180, which is
        correct, so C is clear. Read as signed, it is 100 + 80 = −76, which is wrong, so V is set. The processor sets
        both flags, and the instruction that follows decides which one matters: an unsigned comparison branches on C,
        and a signed comparison on N and V.</p>
      <p>Arm sets C on a subtract when there is no borrow, so <code>a − b</code> leaves C = 1 when a ≥ b as unsigned.
        x86 does the opposite and sets its carry flag on a borrow. AVR also sets carry on a borrow.</p>
      <h2>Overflow in C</h2>
      <p>Unsigned arithmetic in C wraps around by definition, so checking <code>r &lt; a</code> after an add is
        reliable. Signed overflow is undefined behavior: the compiler may assume it never happens and remove a check
        written after the fact. Check before adding, or use <code>__builtin_add_overflow</code> in GCC and Clang, or
        <code>ckd_add</code> from C23’s <code>&lt;stdckdint.h&gt;</code>. On the 8-bit values here, C promotes a and
        b to <code>int</code> first, so the sum itself never overflows; the wrap happens when it is stored back into
        8 bits.</p>
    </section>`,
  });

  function draw() {
    const f = arith(op, a, b);
    code(root, flagCode(op, a, b), 4);
    const nzcv = (f.n << 3) | (f.z << 2) | (f.c << 1) | f.v;
    const both = (v: number) => `<code class="hex">${hexN(v, 8)}</code> <small class="dec">${v} / ${toInt8(v)}</small>`;
    const edit = (name: string, v: number, prev: number | undefined) => row(name, 'uint8_t', both(v), bits(name, v, 8, {
      editable: true, under: (i) => (i === 7 ? '±' : String(i)), flipped: flips(prev ?? null, v),
      tip: (i) => (i === 7 ? `Bit 7 of ${name}: worth 128 unsigned, −128 signed. Click to flip it.` : `Bit ${i} of ${name}. Click to flip it.`),
    }), prev !== undefined && prev !== v);
    root.querySelector('.vars-wrap')!.innerHTML = table(
      edit('a', a, last?.a) + edit('b', b, last?.b) +
      row('r', 'uint8_t', both(f.r), bits('r', f.r, 8)) +
      row('flags', 'NZCV', `<code class="hex">${'NZCV'.split('').map((l, k) => (bit(nzcv, 3 - k) ? l : '-')).join('')}</code>`,
        bits('flags', nzcv, 4, { groups: [{ hi: 3, lo: 0 }], under: (i) => 'VCZN'[i], tip: (i) => FLAG_TIP[i] })),
    );
    markSeg(root, 'op', op);
    const sym = op === 'add' ? '+' : '−';
    const s = (n: number) => String(n).replace('-', '−');
    const exactU = op === 'add' ? a + b : a - b;
    const exactS = op === 'add' ? toInt8(a) + toInt8(b) : toInt8(a) - toInt8(b);
    status(root,
      `Unsigned: ${a} ${sym} ${b} = ${s(exactU)}${exactU === f.r ? ', which fits, so' : `, which does not fit in 0 to 255; r wraps to ${f.r}, and`} C is ${f.c}${op === 'sub' ? ` (${f.c ? 'no borrow' : 'a borrow'})` : ''}. ` +
      `Signed: ${s(toInt8(a))} ${sym} ${s(toInt8(b))} = ${s(exactS)}${exactS === toInt8(f.r) ? ', which fits, so V is 0.' : `, which does not fit in −128 to 127; r reads as ${s(toInt8(f.r))}, and V is 1.`}`);
    last = { a, b };
    syncUrl({ a: hex2(a), b: hex2(b), op });
  }

  wire(root, html, draw);
  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    const k = t.closest<HTMLElement>('.bitrow.editable .bit');
    const o = t.closest<HTMLElement>('[data-op]');
    const p = t.closest<HTMLElement>('[data-preset]');
    if (k) {
      const m = 1 << Number(k.dataset.bit);
      if (k.dataset.row === 'a') a ^= m;
      else b ^= m;
    } else if (o) op = o.dataset.op as FlagOp;
    else if (p) [, op, a, b] = PRESETS[Number(p.dataset.preset)];
    else return;
    draw();
  });
}
