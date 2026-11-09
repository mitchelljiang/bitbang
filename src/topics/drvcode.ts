/**
 * Two Drivers pages built on real compiler output: how C reaches a register, and what a hardware abstraction layer
 * costs. Every listing comes from Clang (see scripts/ccgen.ts); verify pins the explanations to the code.
 */
import { C } from './cdata';
import { asOut, explorer, explorerHtml, maxRows, sizeNote } from './cc';
import { markSeg, oneOf, seg, syncUrl } from './dbg';

type Key = keyof typeof C.drv;
const page = (root: HTMLElement, o: { keys: readonly Key[]; names: Record<string, string>; says: Record<string, string>; file: string; asm: string; intro: string; prose: string; crumbs: string; title: string; d: Key }) => {
  let k = oneOf('case', o.keys as readonly string[], o.d) as Key;
  root.innerHTML = `
    <section class="intro"><p class="crumbs">${o.crumbs}</p><h1>${o.title}</h1><p>${o.intro}</p></section>
    ${explorerHtml({ file: o.file, label: o.title, controls: seg('case', 'Example', o.keys.map((x) => [x, o.names[x]])) })}
    <section class="prose">${o.prose}</section>`;
  const views = o.keys.map((x) => ({ src: C.src.drv[x], out: C.drv[x].asm, say: o.says[x] }));
  const { draw } = explorer(root, maxRows(views), () => {
    markSeg(root, 'case', k);
    syncUrl({ case: k });
    return { src: C.src.drv[k], out: asOut(C.drv[k].asm), head: `${o.asm} · -Os · ${sizeNote(C.drv[k])}`, summary: o.says[k] };
  });
  root.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-case]');
    if (!b) return;
    k = b.dataset.case as Key;
    draw(true);
  });
};

export function mountRegisterLayer(root: HTMLElement) {
  page(root, {
    crumbs: 'Talking to hardware', title: 'Register access', file: 'gpio.c', asm: 'gpio.s', d: 'raw',
    keys: ['raw', 'overlay', 'setclr'],
    names: { raw: 'Address macro', overlay: 'Struct overlay', setclr: 'Set register' },
    says: {
      raw: 'A cast turns a number into a pointer. <code>|=</code> is a load, an OR and a store, so another piece of code that writes the register between them is overwritten.',
      overlay: 'Exactly the same instructions. A struct gives every register a name and leaves the offsets to the compiler, so a whole peripheral needs one base address.',
      setclr: 'One store. Writing a 1 to BSRR sets that pin, and 0s change nothing, so there is no read to go stale and no window for anything to interrupt.',
    },
    intro: `A peripheral is controlled through registers at fixed addresses, so C needs a way to say “this address, and really
      do the access”. These are the three common ways to turn on one pin of an STM32’s GPIO port, and what each compiles to.`,
    prose: `<h2>Why <code>volatile</code> is there</h2>
      <p>Without it the compiler may remove or merge accesses, because as far as C knows, nothing else can see that memory. <code>volatile</code>
      says every read and write in the source must happen, in order. See <a href="?p=volatile" data-nav>volatile</a>.</p>
      <h2>Struct overlays</h2>
      <p>A struct with the registers in order, placed at the peripheral’s base address, gives readable code and one definition per
      peripheral type: <code>GPIOA</code> and <code>GPIOB</code> differ only in the base. Vendor headers are built this way. The layout must match the
      datasheet exactly, including any reserved gaps, which is why those headers contain padding members. See <a href="?p=structs" data-nav>structs</a>.</p>
      <h2>Set and clear registers</h2>
      <p>A read-modify-write is three steps, and an interrupt between them can lose an update. Many peripherals offer a register
      where writing 1 acts and 0 does nothing, such as the STM32’s BSRR. The RP2040 goes further and gives most registers aliases for atomic set, clear and XOR. See
      <a href="?p=rmw" data-nav>read-modify-write</a>.</p>`,
  });
}

export function mountHal(root: HTMLElement) {
  page(root, {
    crumbs: 'Talking to hardware', title: 'HAL design', file: 'blink.c', asm: 'blink.s', d: 'direct',
    keys: ['direct', 'call', 'ops'],
    names: { direct: 'Direct', call: 'Function', ops: 'Function pointer' },
    says: {
      direct: 'One store. The code knows exactly which chip it runs on, and it can run on no other.',
      call: 'The caller does not know the pin hardware, so another chip only needs another <code>gpio_write</code> at link time. The cost is a call.',
      ops: 'Two loads find the function at run time, so one build can drive several kinds of device. It costs the most and the compiler can no longer inline it.',
    },
    intro: `A hardware abstraction layer lets the same application run on different chips, by putting a boundary between the
      code that decides what to do and the code that touches registers. The boundary can be placed at compile time, at link time or at run time, and
      each one costs something different.`,
    prose: `<h2>Three kinds of boundary</h2>
      <p><strong>Compile time</strong>: a header per chip, with macros or <code>static inline</code> functions, costs nothing but needs a rebuild per target.
      <strong>Link time</strong>: one header and one <code>.c</code> file per chip, selected by the build, costs a call. <strong>Run time</strong>: a struct of function pointers,
      as a driver model uses, lets several devices coexist behind one interface and be chosen while the program runs.</p>
      <h2>Where to draw the line</h2>
      <p>Abstract what really varies. Most projects never change chips, yet a layer that lets the logic run on a PC is valuable on its own: it means the logic can be
      unit tested with a fake GPIO. Make the interface describe what the application wants, such as <code>led_on()</code>, rather than mirroring registers.</p>
      <h2>What it costs</h2>
      <p>The price of a call is small until it is in a loop or an interrupt. A driver’s fast path, such as a byte-at-a-time FIFO, usually stays direct, while setup goes through the layer. Measure first:
      link-time optimization can erase a function boundary, as the <a href="?p=optimize" data-nav>optimization</a> pages show.</p>`,
  });
}
