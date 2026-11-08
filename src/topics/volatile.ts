/**
 * The volatile page: three loops that wait on something outside the compiler's view (a hardware register, a flag set
 * by an interrupt, and time itself), each compiled at -Os with and without `volatile`.
 */
import { CC } from './ccdata';
import { asOut, explorer, explorerHtml, maxRows, sizeNote } from './cc';
import { markSeg, oneOf, seg, syncUrl } from './dbg';

const CASES = ['poll', 'flag', 'delay'] as const;
type Case = (typeof CASES)[number];
const NAMES: Record<Case, string> = { poll: 'Status register', flag: 'Interrupt flag', delay: 'Delay loop' };
const SAY: Record<Case, [string, string]> = {
  poll: [
    'Without volatile the register is read once. If bit 5 is clear, the code jumps to <code>.LBB0_1</code>, which branches to itself forever: the compiler saw nothing in the loop that could change the value, so it never looks again. It also narrowed the read to one byte (<code>ldrb</code>), which some peripherals do not allow.',
    'With volatile, every pass of the loop loads the register again (<code>ldr r1, [r0]</code>), so the loop ends as soon as the hardware sets bit 5.',
  ],
  flag: [
    'The whole loop is gone: just <code>bx lr</code>. Nothing in the loop changes <code>ready</code>, so if it starts at 0 the loop never ends, and C lets the compiler assume a loop with no side effects does end. So it returns at once, whatever <code>ready</code> holds.',
    'With volatile, the loop loads <code>ready</code> from memory on every pass, and sees the interrupt’s write.',
  ],
  delay: [
    'The delay is gone. The loop does nothing anyone can observe, so the as-if rule lets the compiler delete it, and the function returns at once.',
    'With volatile, every increment of i is a real load and store on the stack, so the loop runs all 1000 times. It is still a poor delay: how long it takes depends on the clock, the wait states of Flash and the compiler. Use a timer.',
  ],
};

export function mountVolatile(root: HTMLElement) {
  let c = oneOf('case', CASES, 'poll');
  let vol = oneOf('vol', ['off', 'on'] as const, 'off');

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Optimization</p>
      <h1>volatile</h1>
      <p>The optimizer assumes that only the program changes memory. Hardware registers, variables shared with an
        interrupt, and loops meant to burn time all break that assumption. <code>volatile</code> tells the compiler
        that every read and write of an object matters and must happen, exactly as written. Toggle it and compare
        the code, built with Clang at <code>-Os</code>.</p>
    </section>
    ${explorerHtml({
      file: 'wait.c', label: 'volatile',
      controls: `${seg('case', 'Example', CASES.map((k) => [k, NAMES[k]]))}
        ${seg('vol', 'volatile', [['off', 'Plain'], ['on', 'volatile']])}`,
    })}
    <section class="prose">
      <h2>What the compiler may assume</h2>
      <p>Inside a loop like <code>while (!ready);</code>, nothing writes to <code>ready</code>. As far as the compiler
        can tell, the value read on the first pass is the value on every pass, so it reads it once. The interrupt
        handler that sets <code>ready</code> is a separate function the loop never calls; the compiler cannot know it
        runs in between. With <code>volatile</code>, each access is part of the program’s observable behavior and
        must stay.</p>
      <h2>Where volatile belongs</h2>
      <ul>
        <li><strong>Peripheral registers.</strong> Every register pointer in a vendor header is volatile, such as
          <code>(*(volatile uint32_t *)0x40004400)</code>. A read can have effects (reading a UART’s data register
          takes the byte out of its FIFO), and so can a write.</li>
        <li><strong>Variables an interrupt handler changes</strong> and the main loop reads, or the reverse.</li>
        <li><strong>Variables changed by DMA</strong> or by another core.</li>
      </ul>
      <h2>What volatile does not do</h2>
      <p>It does not make an access <a href="?p=atomics" data-nav>atomic</a>: <code>count++</code> on a volatile is
        still a separate load, add and store that an interrupt can land between. It does not order accesses to
        ordinary variables around it, and it does not stop the processor reordering memory accesses; that takes a
        <a href="?p=barriers" data-nav>barrier</a>. For data shared between threads, use atomics or a lock, which
        also tell the compiler what it may not move.</p>
    </section>`;

  const views = CASES.flatMap((k) => [0, 1].map((v) => ({ src: CC.src.vol[k][v], out: CC.vol[k][v].asm })));
  const { draw } = explorer(root, maxRows(views), () => {
    const v = vol === 'on' ? 1 : 0;
    const b = CC.vol[c][v];
    markSeg(root, 'case', c);
    markSeg(root, 'vol', vol);
    syncUrl({ case: c, vol });
    return { src: CC.src.vol[c][v], out: asOut(b.asm), head: `wait.s · -Os · ${sizeNote(b)}`, summary: SAY[c][v] };
  });

  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    const k = t.closest<HTMLElement>('[data-case]');
    const o = t.closest<HTMLElement>('[data-vol]');
    if (k) c = k.dataset.case as Case;
    else if (o) vol = o.dataset.vol as typeof vol;
    else return;
    draw(true);
  });
}
