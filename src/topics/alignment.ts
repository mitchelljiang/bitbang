/**
 * Alignment: why a multi-byte value belongs at an address that is a multiple of its size. A memory grid of 32-bit
 * words shows a value placed at a chosen offset; when it straddles a word boundary the processor needs two bus
 * accesses instead of one, and some cores fault outright. Struct padding follows from the same rule.
 */
import { code, markSeg, oneOf, seg, status, syncUrl } from './dbg';

const BASE = 0x20000000;
const BYTES = 16; // four 32-bit words
const SIZES: Record<string, number> = { 'uint8_t': 1, 'uint16_t': 2, 'uint32_t': 4 };

/** Natural alignment: the address must be a multiple of the size. */
export const aligned = (size: number, offset: number) => offset % size === 0;
/** Bus accesses: the number of aligned 32-bit words the value spans. Exported for the checks. */
export const accesses = (size: number, offset: number) => Math.floor((offset + size - 1) / 4) - Math.floor(offset / 4) + 1;

export function mountAlignment(root: HTMLElement) {
  let type = oneOf('t', Object.keys(SIZES) as (keyof typeof SIZES)[], 'uint32_t');
  const o0 = Number(new URLSearchParams(location.search).get('o') ?? NaN);
  let offset = Number.isInteger(o0) && o0 >= 0 && o0 <= 9 ? o0 : 1;

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">The address space</p>
      <h1>Alignment</h1>
      <p>Memory is read and written one aligned word at a time: the bus moves the four bytes at addresses 0–3 together,
        then 4–7, and so on. A multi-byte value sits naturally when its address is a multiple of its size, so it fits
        inside one of those words. Put it a byte off and it straddles two words, which takes two bus accesses, or on some
        processors faults. Move the value below and watch it cross a boundary.</p>
    </section>
    <section class="debugger align" aria-label="Alignment">
      <header class="dbg-bar">
        <span class="dbg-file">align.c</span>
        <span class="dbg-state"><i aria-hidden="true"></i>Paused</span>
        <div class="dbg-controls">
          ${seg('t', 'Type', Object.keys(SIZES).map((k) => [k, k.replace('_t', '')]))}
          ${seg('o', 'Address', Array.from({ length: 8 }, (_, k) => [String(k), `+${k}`]))}
        </div>
      </header>
      <div class="dbg-body stacked">
        <pre class="dbg-code" aria-label="Source"><code></code></pre>
        <div class="dbg-vars"><h3>Memory <small>one row is one 32-bit word; the bus moves a whole row at a time</small></h3><div class="grid"></div></div>
      </div>
      <p class="dbg-status" aria-live="polite"></p>
    </section>
    <section class="prose">
      <h2>What happens when it is misaligned</h2>
      <p>A value that spans two words cannot be moved in one bus access. What the processor does then depends on the
        core. A Cortex-M0 or M0+ raises a HardFault immediately: it only does aligned accesses. A Cortex-M3, M4 or M7
        handles a misaligned <code>LDR</code> or <code>STR</code> for you, by splitting it into two accesses, so the code
        still works but each such access costs extra cycles. Even there, some instructions, the load and store multiple
        used in function entry and exit, and the exclusive accesses used for locks, always fault when misaligned. On x86
        it simply works, a little slower. So misalignment is anywhere from free to fatal; keeping to natural alignment
        avoids the question.</p>
      <h2>Where struct padding comes from</h2>
      <p>The compiler keeps every member naturally aligned by inserting padding, which is why a struct can be larger than
        the sum of its members:</p>
      <pre class="code"><code>struct S {
    uint8_t  a;      // offset 0
    // 1 byte of padding, so b lands on an even address
    uint16_t b;      // offset 2
    uint32_t c;      // offset 4
};                   // sizeof is 8, not 7</code></pre>
      <p>Ordering members from largest to smallest minimises the padding. Packing a struct with
        <code>__attribute__((packed))</code> removes it, but then its members are misaligned, so reading them is slower
        or faults; packed structs are for matching a wire or file format, not for everyday data.</p>
    </section>`;

  function draw() {
    const size = SIZES[type];
    offset = Math.min(offset, BYTES - size);
    const n = accesses(size, offset);
    const ok = aligned(size, offset);
    const addr = BASE + offset;
    code(root, [
      '#include <stdint.h>',
      '',
      `uint8_t  mem[16];`.padEnd(34) + `// a block of memory at 0x20000000`,
      `${type} *p = (${type} *)(mem + ${offset});`.padEnd(34) + `// address 0x${addr.toString(16).toUpperCase()}`,
      `${type} x = *p;`.padEnd(34) + `// ${ok ? 'aligned: one bus access' : `misaligned: ${n} bus accesses`}`,
    ], 4);

    const word = (i: number) => Math.floor(i / 4);
    const inVal = (i: number) => i >= offset && i < offset + size;
    const first = word(offset);
    root.querySelector('.grid')!.innerHTML = Array.from({ length: BYTES / 4 }, (_, w) => {
      const cells = Array.from({ length: 4 }, (_, k) => {
        const i = w * 4 + k;
        const a = BASE + i;
        const cls = ['cell', inVal(i) ? 'val' : '', inVal(i) ? (word(i) === first ? 'val-a' : 'val-b') : ''].filter(Boolean).join(' ');
        return `<span class="${cls}"><small>0x${(a & 0xff).toString(16).toUpperCase().padStart(2, '0')}</small><b>${inVal(i) ? '··' : ''}</b></span>`;
      }).join('');
      const used = w === first || (n > 1 && w === first + 1 && !ok) || (inVal(w * 4) || inVal(w * 4 + 3));
      return `<div class="word${used && (inVal(w * 4) || inVal(w * 4 + 3)) ? ' hit' : ''}"><span class="waddr">word ${w} · 0x${(BASE + w * 4).toString(16).toUpperCase()}</span><div class="cells">${cells}</div></div>`;
    }).join('');

    markSeg(root, 't', type);
    markSeg(root, 'o', String(offset));
    root.querySelectorAll<HTMLElement>('[data-o]').forEach((b) => { b.hidden = Number(b.dataset.o) > BYTES - size; });
    status(root, size === 1
      ? `A ${type} is one byte, so it is aligned at every address: one bus access.`
      : ok
        ? `0x${addr.toString(16).toUpperCase()} is a multiple of ${size}, so the ${type} sits inside word ${first}: one bus access.`
        : `0x${addr.toString(16).toUpperCase()} is not a multiple of ${size}, so the ${type} spans words ${first} and ${first + 1}: ${n} bus accesses, and a Cortex-M0 would fault.`);
    syncUrl({ t: type, o: String(offset) });
  }

  draw();
  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    const ty = t.closest<HTMLElement>('[data-t]');
    const of = t.closest<HTMLElement>('[data-o]');
    if (ty) type = ty.dataset.t as keyof typeof SIZES;
    else if (of) offset = Number(of.dataset.o);
    else return;
    draw();
  });
}
