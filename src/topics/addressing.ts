/**
 * The addressing page: the ways a load finds its address, with the sum drawn out, the memory it lands on, and the
 * instruction's bits, so the limits of each form can be seen. `encodeLoad` is exported; verify checks every offset
 * against Clang's assembler, including the first one that no longer fits.
 */
import { bits, hex8, markSeg, oneOf, reservedStatus, seg, syncUrl, type BitGroup } from './dbg';

export const FORMS = ['imm', 'reg', 'sp', 'pc', 'scaled', 'pre', 'post'] as const;
export type Form = (typeof FORMS)[number];
export const SIZES = ['word', 'half', 'byte'] as const;
export type Size = (typeof SIZES)[number];

const SCALE: Record<Size, number> = { word: 4, half: 2, byte: 1 };
const MN: Record<Size, string> = { word: 'ldr', half: 'ldrh', byte: 'ldrb' };
const IMM_OP: Record<Size, number> = { word: 0x6800, half: 0x8800, byte: 0x7800 };

export const R1 = 0x20000040;
export const SP_VAL = 0x20000f00;
/** The address of the instruction, for the PC form. Not a multiple of 4, to show the rounding. */
export const INS_AT = 0x08000102;

/**
 * How far apart the offsets the control offers are, the largest it offers, and the most the instruction's field can
 * hold. A register offset has no field limit: the value is in r2, and the control just stops at a sensible size.
 */
export function limits(form: Form, size: Size) {
  if (form === 'imm') return { step: SCALE[size], max: 31 * SCALE[size], field: 31 * SCALE[size] };
  if (form === 'sp' || form === 'pc') return { step: 4, max: 1020, field: 1020 };
  if (form === 'reg') return { step: 4, max: 64, field: Infinity };
  if (form === 'scaled') return { step: 1, max: 16, field: Infinity };
  return { step: 4, max: 252, field: 255 };
}

export interface Encoded { text: string; ok: boolean; hex: string; value: number; width: 16 | 32; fields: BitGroup[]; base: number; ea: number; after?: number }

/** One load: its assembly, its encoding as the assembler produces it, and the address it reads. */
export function encodeLoad(form: Form, size: Size, off: number): Encoded {
  const ok = off >= 0 && off <= limits(form, size).field;
  const f = (hi: number, lo: number, head: string): BitGroup => ({ hi, lo, head });
  const s = form === 'imm' ? size : 'word';
  if (form === 'imm') {
    const k = off / SCALE[s], v = IMM_OP[s] | ((k & 31) << 6) | (1 << 3);
    return { text: `${MN[s]} r0, [r1, #${off}]`, ok, hex: v.toString(16).padStart(4, '0'), value: v, width: 16, base: R1, ea: R1 + off, fields: [f(15, 11, 'opcode'), f(10, 6, 'imm5'), f(5, 3, 'Rn'), f(2, 0, 'Rt')] };
  }
  if (form === 'reg') {
    const v = 0x5800 | (2 << 6) | (1 << 3);
    return { text: 'ldr r0, [r1, r2]', ok, hex: v.toString(16), value: v, width: 16, base: R1, ea: R1 + off, fields: [f(15, 9, 'opcode'), f(8, 6, 'Rm'), f(5, 3, 'Rn'), f(2, 0, 'Rt')] };
  }
  if (form === 'sp') {
    const v = 0x9800 | ((off / 4) & 255);
    return { text: `ldr r0, [sp, #${off}]`, ok, hex: v.toString(16), value: v, width: 16, base: SP_VAL, ea: SP_VAL + off, fields: [f(15, 11, 'opcode'), f(10, 8, 'Rt'), f(7, 0, 'imm8')] };
  }
  if (form === 'pc') {
    const v = 0x4800 | ((off / 4) & 255), pc = (INS_AT + 4) & ~3;
    return { text: `ldr r0, [pc, #${off}]`, ok, hex: v.toString(16), value: v, width: 16, base: pc, ea: pc + off, fields: [f(15, 11, 'opcode'), f(10, 8, 'Rt'), f(7, 0, 'imm8')] };
  }
  const hw = (a: number, b: number) => (a * 65536) + b;
  const hx = (a: number, b: number) => `${a.toString(16)} ${b.toString(16).padStart(4, '0')}`;
  if (form === 'scaled') {
    const b = (2 << 4) | 2;
    return { text: `ldr.w r0, [r1, r2, lsl #2]`, ok, hex: hx(0xf851, b), value: hw(0xf851, b), width: 32, base: R1, ea: R1 + off * 4, fields: [f(31, 20, 'opcode'), f(19, 16, 'Rn'), f(15, 12, 'Rt'), f(11, 6, '0'), f(5, 4, 'imm2'), f(3, 0, 'Rm')] };
  }
  const flags = form === 'pre' ? 0x0f00 : 0x0b00, b = flags | (off & 255);
  return { text: form === 'pre' ? `ldr r0, [r1, #${off}]!` : `ldr r0, [r1], #${off}`, ok, hex: hx(0xf851, b), value: hw(0xf851, b), width: 32, base: R1, ea: form === 'pre' ? R1 + off : R1, after: R1 + off, fields: [f(31, 20, 'opcode'), f(19, 16, 'Rn'), f(15, 12, 'Rt'), f(11, 8, '1PUW'), f(7, 0, 'imm8')] };
}

const LABEL: Record<Form, string> = { imm: 'Offset', reg: 'Register', sp: 'Stack', pc: 'Literal', scaled: 'Scaled', pre: 'Pre-index', post: 'Post-index' };
const SAY: Record<Form, string> = {
  imm: 'A base register plus a constant in the instruction. This is <code>p-&gt;field</code>: the constant is the field’s offset. The 5-bit field counts in units of the access size, so a word can be up to 124 bytes away.',
  reg: 'A base register plus another register. This is <code>a[i]</code> on a Cortex-M0+, after the compiler has multiplied i by the element size with a separate shift.',
  sp: 'An offset from the stack pointer, with an 8-bit field counted in words. This is how a local variable on the stack is read.',
  pc: 'An offset from the instruction’s own address: PC reads as the instruction plus 4, rounded down to a multiple of 4. This is how a 32-bit constant, stored beside the code, gets loaded.',
  scaled: 'The Cortex-M3 and up can shift the index inside the instruction: r2 counts elements, and <code>lsl #2</code> multiplies by 4. One instruction instead of two.',
  pre: 'The Cortex-M3 and up: add the offset, read from the new address, and write that address back into r1. Note the <code>!</code>.',
  post: 'The Cortex-M3 and up: read from r1 as it stands, and then add the offset to it. This is <code>*p++</code>.',
};
const BAD = (e: Encoded, field: number) => `<code>${e.text}</code> does not assemble: the field stops at ${field}. A compiler would first put the address in a register.`;

export function mountAddressing(root: HTMLElement) {
  const q = new URLSearchParams(location.search);
  let form = oneOf('f', FORMS, 'imm');
  let size = oneOf('s', SIZES, 'word');
  let off = Math.max(0, Number(q.get('o')) || 8);

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Instruction set</p>
      <h1>Addressing</h1>
      <p>Arm processors only touch memory with loads and stores, and everything else works on registers. So every read of
        a variable, a field or an array element comes down to one question: how does the instruction say which address?
        There are a few ways, and each has limits, because the answer has to fit in the instruction’s bits.</p>
    </section>
    <section class="debugger addressing" aria-label="Addressing modes">
      <header class="dbg-bar"><span class="dbg-file ad-text"></span><div class="dbg-controls">${seg('f', 'Addressing form', FORMS.map((x) => [x, LABEL[x]]))}</div></header>
      <div class="ad-body">
        <div class="ad-left">
          <div class="ad-sum"></div>
          <div class="ad-ctl">
            <span class="ad-size">${seg('s', 'Access size', [['word', 'Word'], ['half', 'Half'], ['byte', 'Byte']])}</span>
            <span class="ad-step"><button type="button" class="dbg-btn" data-off="-1" aria-label="Smaller offset">−</button><output class="ad-off"></output><button type="button" class="dbg-btn" data-off="1" aria-label="Larger offset">+</button></span>
          </div>
          <div class="ad-enc"></div>
        </div>
        <div class="ad-mem" aria-label="Memory"></div>
      </div>
      <p class="dbg-status" aria-live="polite"></p>
    </section>
    <section class="prose">
      <h2>From C to an address</h2>
      <table class="op-table"><thead><tr><th>In C</th><th>Clang, Cortex-M0+, <code>-Os</code></th></tr></thead><tbody>
        <tr><td><code>p-&gt;c</code>, where c is at offset 8</td><td><code>ldr r0, [r0, #8]</code></td></tr>
        <tr><td><code>a[i]</code> of <code>int</code></td><td><code>lsls r1, r1, #2</code>, then <code>ldr r0, [r0, r1]</code></td></tr>
        <tr><td><code>s[i]</code> of <code>char</code></td><td><code>ldrb r0, [r0, r1]</code></td></tr>
        <tr><td>a local on the stack</td><td><code>ldr r0, [sp, #4]</code></td></tr>
        <tr><td>a global</td><td><code>ldr r0, .LCPI0_0</code>, then <code>ldr r0, [r0]</code></td></tr>
      </tbody></table>
      <p>A global takes two loads. The instruction has no room for a 32-bit address, so the compiler stores the address
        beside the code, loads it PC-relative, and then loads through it.</p>
      <h2>Why the limits fall where they do</h2>
      <p>An offset field counts in units of the access size, because an aligned word is always a multiple of 4 bytes away.
        That turns the 5 bits of a load into a reach of 124 bytes rather than 31. It is also a reason to put a struct’s
        most-used fields first: past the reach, the compiler needs another instruction. See
        <a href="?p=structs" data-nav>structs</a>.</p>
      <p>The 32-bit forms in Thumb-2 are bigger, so they have room for a full register and shift, or for a write-back bit.
        The Cortex-M0+ has only the 16-bit forms, plus <code>bl</code> and a few system instructions.</p>
    </section>`;

  const panel = root.querySelector<HTMLElement>('.addressing')!;
  const all = FORMS.flatMap((f) => [SAY[f], BAD(encodeLoad(f, 'word', limits(f, 'word').max + limits(f, 'word').step), 1020)]);
  const say = reservedStatus(panel, all);

  function draw() {
    const { max, field } = limits(form, size);
    const e = encodeLoad(form, size, off);
    const baseName = form === 'sp' ? 'sp' : form === 'pc' ? 'PC' : 'r1';
    const pre = form === 'post' ? 0 : off;
    const scaled = form === 'scaled';
    root.querySelector('.ad-text')!.textContent = e.text;
    panel.classList.toggle('over', !e.ok);
    root.querySelector('.ad-sum')!.innerHTML = `
      <div class="ad-row"><span>${baseName}${form === 'pc' ? ' rounded' : ''}</span><b>${hex8(e.base)}</b></div>
      <div class="ad-row"><span>${form === 'post' ? 'not added yet' : scaled ? `r2 × 4 (${off} × 4)` : form === 'reg' ? 'r2' : 'offset'}</span><b>+ ${form === 'post' ? 0 : scaled ? off * 4 : pre}</b></div>
      <div class="ad-row total"><span>address</span><b>${hex8(e.ea)}</b></div>
      <div class="ad-row after"><span>${e.after === undefined ? '&nbsp;' : 'r1 afterwards'}</span><b>${e.after === undefined ? '&nbsp;' : hex8(e.after)}</b></div>`;
    root.querySelector('.ad-off')!.textContent = `${off}`;
    root.querySelector<HTMLElement>('.ad-size')!.style.visibility = form === 'imm' ? '' : 'hidden';
    root.querySelector<HTMLButtonElement>('[data-off="-1"]')!.disabled = off === 0;
    root.querySelector<HTMLButtonElement>('[data-off="1"]')!.disabled = field === Infinity ? off >= max : off > max;
    // The widest encodings sit invisibly in the same cell, so the box is as tall as the tallest at any width.
    const encHtml = (x: Encoded, hex: string) => `<p class="ad-hex">${hex}</p>${bits('enc', x.value >>> 0, x.width, { groups: x.fields })}`;
    const ghosts = (['imm', 'sp', 'scaled', 'pre'] as const).map((g) => `<div class="cc-ghost" aria-hidden="true">${encHtml(encodeLoad(g, 'word', 0), '&nbsp;')}</div>`).join('');
    root.querySelector('.ad-enc')!.innerHTML = `<div>${encHtml(e, e.ok ? `<code>${e.hex}</code> · ${e.width} bits` : 'No encoding')}</div>${ghosts}`;
    const size_ = form === 'imm' ? SCALE[size] : 4;
    const at = e.ea - (e.ea % 4);
    root.querySelector('.ad-mem')!.innerHTML = [-8, -4, 0, 4, 8].map((d) => {
      const a = at + d, mine = d === 0 && e.ok;
      const tag = a === e.base - (e.base % 4) ? baseName : '';
      const bytes = [0, 1, 2, 3].map((b) => `<i class="${mine && a + b >= e.ea && a + b < e.ea + size_ ? 'hit' : ''}"></i>`).join('');
      return `<div class="ad-word${mine ? ' on' : ''}"><span>${hex8(a)}</span><em>${bytes}</em><b>${tag}</b></div>`;
    }).join('');
    say(e.ok ? SAY[form] : BAD(e, field));
    markSeg(root, 'f', form);
    markSeg(root, 's', size);
    syncUrl({ f: form, s: size, o: String(off) });
  }

  panel.addEventListener('click', (e) => {
    const t = e.target as Element;
    const fb = t.closest<HTMLElement>('[data-f]'), sb = t.closest<HTMLElement>('[data-s]'), ob = t.closest<HTMLElement>('[data-off]');
    if (fb) { form = fb.dataset.f as Form; }
    else if (sb) { size = sb.dataset.s as Size; }
    else if (ob) { const { step, max, field } = limits(form, size); off = Math.min(field === Infinity ? max : max + step, Math.max(0, off + Number(ob.dataset.off) * step)); }
    else return;
    if (fb || sb) { const { step, max } = limits(form, size); off = Math.min(max, Math.max(0, Math.round(off / step) * step)); }
    draw();
  });
  draw();
}
