/**
 * The storage keywords page: one variable declared six ways (a local, a global, static, static in a function, const
 * and extern), each compiled at -Os, with where Clang put it: its section and whether other files can see it.
 */
import { C } from './cdata';
import { asOut, explorer, explorerHtml, maxRows, sizeNote } from './cc';
import { markSeg, oneOf, seg, syncUrl } from './dbg';

export const KEY_CASES = ['local', 'global', 'static', 'staticlocal', 'const', 'extern'] as const;
type Case = (typeof KEY_CASES)[number];
const NAMES: Record<Case, string> = { local: 'Local', global: 'Global', static: 'static', staticlocal: 'static local', const: 'const', extern: 'extern' };

/** Where the variable lives, from the object file's symbol table: its section and who can see it. */
export function whereItLives(c: Case) {
  const s = C.keys[c].sym;
  if (!s) return 'not stored anywhere';
  if (s.section === '*UND*') return 'undefined here';
  return `in ${s.section}, ${s.bind === 'local' ? 'this file only' : 'every file'}`;
}

const SAY: Record<Case, string> = {
  local: 'A local lives in a register, or on the stack if it has to. Here it does not even get a register: the compiler worked out that the answer is always 6 and returns that. Every call starts again from 5.',
  global: 'A global with no starting value goes in .bss, which startup fills with zeros. The code loads its address from after the function (the .word), then loads, adds and stores. Any file that declares <code>extern uint32_t count;</code> uses this same variable.',
  static: 'At file level, static hides the name from other files: the symbol is local. With a starting value, it goes in .data. The code is the same as for a global; only the linker’s view changes. Use static for every global that other files do not need.',
  staticlocal: 'Inside a function, static means the variable lives for the whole program and keeps its value between calls, like a global, but only this function can name it. Clang calls it tick.count. It is in .bss, so it starts at 0.',
  const: 'A const global goes in .rodata, in Flash, so it costs no SRAM. And because its value can never change, the compiler used 100 directly (<code>movs r1, #100</code>) without loading it at all.',
  extern: 'extern declares a variable without creating it. The code is the same as for the global, but the object file has no count of its own: the .word is left blank, with a relocation, for the linker to fill in with the address of the count defined in another file.',
};

export function mountKeywords(root: HTMLElement) {
  let c = oneOf('decl', KEY_CASES, 'global');

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Variables and types</p>
      <h1>Storage keywords</h1>
      <p>Where a variable is declared, and with which keyword, decides two things: where it is stored, and which code
        can see it. Here is one counter declared six ways, compiled by Clang for a Cortex-M0+ at <code>-Os</code>. The
        heading on the right says where it ended up, from the object file’s symbol table.</p>
    </section>
    ${explorerHtml({ file: 'counter.c', label: 'Storage keywords', cls: 'kw', controls: seg('decl', 'Declaration', KEY_CASES.map((k) => [k, NAMES[k]])) })}
    <section class="prose">
      <h2>Where variables live</h2>
      <p>A local variable exists only while its function runs: in a register, or in the function’s
        <a href="?p=frames" data-nav>stack frame</a>. Everything declared outside a function, or with
        <code>static</code> inside one, exists for the whole program and has a fixed address. The linker gives it
        one in SRAM: in <code>.data</code> if it has a starting value, which startup copies from Flash, or in
        <code>.bss</code> if it starts at zero, which startup clears. A <code>const</code> global goes in Flash, which
        on a microcontroller is usually much larger than SRAM. The <a href="?p=sections" data-nav>sections</a> page
        shows the copy and the clear.</p>
      <h2>Who can see a name</h2>
      <p><code>static</code> means two different things. Outside a function it limits a name to its own file, so two
        files can each have a <code>static int count</code> without clashing; this is C’s only privacy. Inside a
        function it means the variable outlives the call. <code>extern</code> says a variable is defined somewhere
        else: put <code>extern</code> declarations in a header, and the one definition in one .c file.</p>
      <h2>const is not a promise about the hardware</h2>
      <p><code>const</code> says this code will not write the object. It can still change in other ways: a
        <code>const volatile</code> register, such as a read-only status register, is one the program may not write
        but the hardware changes all the time. For that, see <a href="?p=volatile" data-nav>volatile</a>.</p>
    </section>`;

  const views = KEY_CASES.map((k) => ({ src: C.src.keys[k], out: C.keys[k].asm }));
  const { draw } = explorer(root, maxRows(views), () => {
    const b = C.keys[c];
    markSeg(root, 'decl', c);
    syncUrl({ decl: c });
    const name = c === 'const' ? 'limit' : c === 'staticlocal' ? 'tick.count' : 'count';
    return {
      src: C.src.keys[c], out: asOut(b.asm),
      head: `${name} ${whereItLives(c)} · ${sizeNote(b)}`,
      summary: SAY[c],
    };
  });

  root.addEventListener('click', (e) => {
    const k = (e.target as Element).closest<HTMLElement>('[data-decl]');
    if (!k) return;
    c = k.dataset.decl as Case;
    draw(true);
  });
}
