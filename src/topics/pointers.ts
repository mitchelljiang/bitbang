/**
 * The pointers page: a pointer made from a register's address, pointer arithmetic and indexing, struct members through
 * a pointer, and a table of function pointers, each compiled at -Os.
 */
import { C } from './cdata';
import { asOut, explorer, explorerHtml, maxRows, sizeNote } from './cc';
import { markSeg, oneOf, seg, syncUrl } from './dbg';

const CASES = ['register', 'index', 'member', 'fnptr'] as const;
type Case = (typeof CASES)[number];
const NAMES: Record<Case, string> = { register: 'Register address', index: 'Indexing', member: 'Struct members', fnptr: 'Function pointers' };
const SAY: Record<Case, string> = {
  register: 'A number cast to a pointer is an address. <code>(volatile uint32_t *)0x48000014</code> says “a 32-bit value lives at this address”, and the <code>*</code> in front reads or writes it. The address does not fit in a 16-bit instruction, so it is stored after the code and loaded with <code>ldr</code>; then one <code>str</code> is the write to the register.',
  index: 'Adding 1 to a pointer moves it by the size of what it points to. For a <code>uint32_t *</code>, the index is multiplied by 4 first (<code>lsls r1, r1, #2</code>); for a <code>uint8_t *</code>, it is used as it is. <code>*(p + 1)</code> and <code>p[1]</code> are the same thing: a load from offset 4.',
  member: '<code>p-&gt;y</code> is a load from the address in p plus y’s offset: x is at 0, y at 4. A write through a pointer to one field is a load, a change and a store (<code>move</code>). The struct’s name and fields are gone by now; only the offsets are left.',
  fnptr: 'A function pointer holds a function’s address. This table is <code>const</code>, so it sits in Flash. The call checks the bound (<code>cmp r0, #2</code>), multiplies the index by 4, loads the entry, and calls it with <code>blx</code>. A Cortex-M’s vector table is exactly this: an array of function addresses that the hardware indexes.',
};

export function mountPointers(root: HTMLElement) {
  let c = oneOf('case', CASES, 'register');

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Data in memory</p>
      <h1>Pointers</h1>
      <p>A pointer is a 4-byte address, and its type says what to expect there: how many bytes to read, and how far
        <code>+ 1</code> moves. By the time the code runs, the type is gone and only the size and the arithmetic are
        left. Pick an example and click a line to see what each part becomes.</p>
    </section>
    ${explorerHtml({ file: 'ptr.c', label: 'Pointers', cls: 'ptr', controls: seg('case', 'Example', CASES.map((k) => [k, NAMES[k]])) })}
    <section class="prose">
      <h2>Reading the declaration</h2>
      <p>Where <code>const</code> goes changes what it protects. Read a declaration from the name outward:</p>
      <ul>
        <li><code>const uint8_t *p</code>: p points to bytes this code may not change, but p itself can move on. Use it
          for a buffer a function only reads.</li>
        <li><code>uint8_t *const p</code>: p can never point anywhere else, but the bytes it points to can change.</li>
        <li><code>const uint8_t *const p</code>: neither can change.</li>
        <li><code>volatile uint32_t *p</code>: every access through p must really happen, which is the type for a
          <a href="?p=mmio" data-nav>hardware register</a>. <code>uint32_t *volatile p</code> is different: there, the
          pointer variable itself is what may change.</li>
      </ul>
      <h2>Arrays and pointers</h2>
      <p>An array name turns into a pointer to its first element almost everywhere, including when it is passed to a
        function, which is why a function cannot tell how long an array is: pass the length too. <code>sizeof</code>
        is the exception. On the array itself it gives the whole size; on a parameter declared
        <code>uint32_t a[]</code> it gives 4, the size of a pointer. Reading or writing past the end is not caught; on
        the stack it leads to a <a href="?p=bufover" data-nav>buffer overflow</a>.</p>
      <h2>Casts that bite</h2>
      <p>Casting a <code>uint8_t *</code> to <code>uint32_t *</code> and reading through it is a common way to parse a
        packet, and it is wrong twice. If the address is not a multiple of 4, a Cortex-M0+ faults; and reading an object
        through a pointer to a different type breaks the strict aliasing rule, so the optimizer may assume the two do
        not overlap. Use <code>memcpy(&amp;value, buf, 4)</code>, which the compiler turns into the best load the
        processor allows.</p>
      <h2>Function pointers</h2>
      <p>Tables of function pointers are how C does dispatch: command tables, state machines and driver interfaces. A
        function’s address in Thumb code has its lowest bit set, the Thumb bit, which the linker adds.
        <code>blx</code> reads it to stay in Thumb state, and the entries in the vector table have it too.</p>
    </section>`;

  const views = CASES.map((k) => ({ src: C.src.ptrs[k], out: C.ptrs[k].asm }));
  const { draw } = explorer(root, maxRows(views), () => {
    const b = C.ptrs[c];
    markSeg(root, 'case', c);
    syncUrl({ case: c });
    return { src: C.src.ptrs[c], out: asOut(b.asm), head: `ptr.s · -Os · ${sizeNote(b)}`, summary: SAY[c] };
  });

  root.addEventListener('click', (e) => {
    const k = (e.target as Element).closest<HTMLElement>('[data-case]');
    if (!k) return;
    c = k.dataset.case as Case;
    draw(true);
  });
}
