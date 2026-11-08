/**
 * The optimization levels page: one function compiled at -O0, -O1, -O2 and -Os, with the size and instruction count
 * of each, so the reader can see what each level trades.
 */
import { CC } from './ccdata';
import { asOut, explorer, explorerHtml, maxRows, sizeNote } from './cc';
import { markSeg, oneOf, seg, syncUrl } from './dbg';

const FNS = ['sum', 'sumto', 'scale'] as const;
const LEVELS = ['-O0', '-O1', '-O2', '-Os'] as const;
type Fn = (typeof FNS)[number];
type Level = (typeof LEVELS)[number];

const SAY: Record<Fn, Partial<Record<Level, string>>> = {
  sum: {
    '-O0': 'Every variable lives on the stack, and every line loads what it needs and stores what it changed. Slow, but each line of C has its own instructions, which is what a debugger wants.',
    '-O1': 'The variables live in registers. The loop is four instructions: load and step the pointer, add, count down, branch.',
    '-O2': 'The loop is unrolled: it adds four elements per pass, then finishes the last zero to three one at a time. Fewer branches, so faster on long arrays, but over four times the size of -Os.',
    '-Os': 'The same tight loop as -O1. -Os stops before anything that grows the code, such as unrolling.',
  },
  sumto: {
    '-O0': 'The loop runs n times, keeping s and i on the stack.',
    '-O1': 'No loop at all. The compiler recognized the sum 0 + 1 + … + (n − 1) and replaced it with the formula (n − 1)(n − 2)/2 + (n − 1), using a 64-bit multiply (__aeabi_lmul) so the middle step cannot overflow.',
  },
  scale: {
    '-O0': 'x and y go through the stack, but even at -O0 the divide by 4 is a shift, not a call to a divide routine.',
    '-O1': 'Dividing by 4 became a shift. Because x is signed, it first adds 3 to negative values (from the sign bits), so −7 / 4 rounds to −1 as C requires, not −2.',
  },
};
const say = (f: Fn, l: Level) => SAY[f][l] ?? SAY[f]['-O1']!;

export function mountOptimize(root: HTMLElement) {
  let fn = oneOf('fn', FNS, 'sum');
  let level = oneOf('lvl', LEVELS.map((l) => l.slice(1)) as unknown as readonly string[], 'O0');

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Optimization</p>
      <h1>Optimization levels</h1>
      <p>The same C can become very different code. <code>-O0</code> translates each line on its own;
        <code>-O1</code> and <code>-O2</code> optimize harder for speed; <code>-Os</code> optimizes for size. All of
        them must do exactly what the C says, but only what it says. Switch levels and compare.</p>
    </section>
    ${explorerHtml({
      file: 'opt.c', label: 'Optimization levels',
      controls: `${seg('fn', 'Function', [['sum', 'sum'], ['sumto', 'sum_to'], ['scale', 'scale']])}
        ${seg('lvl', 'Level', LEVELS.map((l) => [l.slice(1), l]))}`,
    })}
    <section class="prose">
      <h2>What each level is for</h2>
      <p><code>-O0</code> is for debugging. Every variable has a home in memory and every line has its own
        instructions, so a breakpoint on any line works and every variable can be read. It is also slow and large:
        <code>sum</code> is ${CC.optimized.sum['-O0'].bytes} bytes against ${CC.optimized.sum['-Os'].bytes} at
        <code>-Os</code>.</p>
      <p><code>-O2</code> is the usual choice for speed. It unrolls loops, inlines small functions and schedules
        instructions around each other, often making the code larger. <code>-Os</code> does most of the same
        analysis but refuses anything that grows the code, which matters when the whole program must fit in 64 KiB
        of Flash. <code>-O3</code>, not shown, goes further than <code>-O2</code> and is rarely worth it on a
        microcontroller.</p>
      <h2>The as-if rule</h2>
      <p>The C standard lets the compiler produce any code that behaves as if it ran the program as written, where
        behavior means the values of <code>volatile</code> objects, the data written to files and devices, and what
        the program returns. Everything else is fair game: variables can live in registers or vanish, loops can be
        rewritten as formulas, and calls can be inlined. That is why an optimized build is hard to step through in a
        debugger, and why the <a href="?p=volatile" data-nav>volatile</a> and
        <a href="?p=ub" data-nav>undefined behavior</a> pages matter.</p>
      <h2>Helper functions</h2>
      <p>The Cortex-M0+ has a 32-bit multiply but no divide and no 64-bit multiply, so the compiler calls helpers from
        its runtime library, such as <code>__aeabi_lmul</code> and <code>__aeabi_idiv</code>, for those. A divide by
        a constant power of two never needs one: it becomes a shift.</p>
    </section>`;

  const views = FNS.flatMap((f) => LEVELS.map((l) => ({ src: CC.src.opt[f], out: CC.optimized[f][l].asm })));
  const { draw } = explorer(root, maxRows(views), () => {
    const l = `-${level}` as Level;
    const b = CC.optimized[fn][l];
    markSeg(root, 'fn', fn);
    markSeg(root, 'lvl', level);
    syncUrl({ fn, lvl: level });
    const others = LEVELS.map((x) => `${x} ${CC.optimized[fn][x].bytes}`).join(' · ');
    return { src: CC.src.opt[fn], out: asOut(b.asm), head: `opt.s · ${l} · ${sizeNote(b)}`, summary: `${say(fn, l)} <span class="cc-dim">Bytes: ${others}.</span>` };
  });

  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    const f = t.closest<HTMLElement>('[data-fn]');
    const o = t.closest<HTMLElement>('[data-lvl]');
    if (f) fn = f.dataset.fn as Fn;
    else if (o) level = o.dataset.lvl!;
    else return;
    draw(true);
  });
}
