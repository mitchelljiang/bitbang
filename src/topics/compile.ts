/**
 * The compiling page: one small C function at a time and the Thumb assembly Clang makes of it for a Cortex-M0+ at
 * -Os, with each instruction's bytes. Every source line and its instructions share a colour.
 */
import { CC } from './ccdata';
import { asOut, explorer, explorerHtml, maxRows, sizeNote } from './cc';
import { markSeg, oneOf, seg, syncUrl } from './dbg';

const FNS = ['add', 'clamp', 'sum', 'toggle', 'call'] as const;
type Fn = (typeof FNS)[number];
const NAMES: Record<Fn, string> = { add: 'add', clamp: 'if', sum: 'loop', toggle: 'register', call: 'call' };
const SUMMARY: Record<Fn, string> = {
  add: 'The arguments arrive in r0 and r1, and the result goes back in r0. One add, one return.',
  clamp: 'The <code>if</code> became a compare and a conditional branch that skips the <code>mov</code> when x is already small enough.',
  sum: 'The loop became a compare before it, four instructions inside it, and a branch back to <code>.LBB0_2</code>. The compiler counts n down to zero instead of counting i up.',
  toggle: 'The register’s address does not fit in a 16-bit instruction, so it is stored after the code and loaded with <code>ldr</code>. Then load, XOR, store.',
  call: 'Calling another function means saving lr and any register needed afterwards, since the callee may change r0 to r3.',
};

export function mountCompile(root: HTMLElement) {
  let fn = oneOf('fn', FNS, 'add');

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">The build</p>
      <h1>Compiling</h1>
      <p>The compiler turns each C function into instructions for one processor. Here that is Clang building for a
        Cortex-M0+, the core in the Raspberry Pi Pico, with <code>-Os</code>, the size setting most firmware ships
        with. Pick a function, then click a line of C to find its instructions, or an instruction to see what it does
        and where it came from.</p>
    </section>
    ${explorerHtml({ file: 'fn.c', label: 'Compiler output', controls: seg('fn', 'Function', FNS.map((f) => [f, NAMES[f]])) })}
    <section class="prose">
      <h2>From C to instructions</h2>
      <p>A compiler works in stages. It splits the text into tokens and parses them into a tree; checks the types;
        lowers the tree into a simple intermediate code with unlimited registers; optimizes that; and finally picks
        real instructions, assigns the processor’s registers to the values, and writes the assembly. Only the last
        step knows about Arm: the same front end and optimizer serve RISC-V and x86.</p>
      <h2>The calling convention</h2>
      <p>Every function here follows the Arm procedure call standard, AAPCS. The first four arguments arrive in r0
        to r3 and the result goes back in r0. A function may change r0 to r3 and r12 freely, but must put r4 to r11
        back as it found them, which is why <code>sum_sq</code> pushes r4 and r5 before using them. The return
        address is in lr; <code>bx lr</code> returns. The <a href="?p=calls" data-nav>function calls</a> page steps
        through this on the stack.</p>
      <h2>Bytes, not text</h2>
      <p>The grey column is each instruction’s encoding, as it will sit in Flash: <code>adds r0, r1, r0</code> is
        <code>0x1808</code>. The <a href="?p=instructions" data-nav>Instructions</a> page takes that encoding apart
        bit by bit. A <code>.word</code> is not an instruction but data: a constant too big for a 16-bit
        instruction, placed after the code and read with <code>ldr</code>. The <code>nop</code> before it is padding,
        so the word is 4-byte aligned.</p>
      <p>Labels such as <code>.LBB0_2</code> are names the compiler invents for the targets of its branches. They do
        not reach the object file; in the bytes, a branch holds the distance to its target.</p>
    </section>`;

  const views = FNS.map((f) => ({ src: CC.src.compile[f], out: CC.compiled[f].asm, say: SUMMARY[f] }));
  const { draw } = explorer(root, maxRows(views), () => {
    const b = CC.compiled[fn];
    markSeg(root, 'fn', fn);
    syncUrl({ fn });
    return { src: CC.src.compile[fn], out: asOut(b.asm), head: `fn.s · -Os · ${sizeNote(b)}`, summary: SUMMARY[fn], hex: true };
  });

  root.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-fn]');
    if (!b) return;
    fn = b.dataset.fn as Fn;
    draw(true);
  });
}
