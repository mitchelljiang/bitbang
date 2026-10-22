/**
 * Sections and startup: the linker splits a program into .text, .rodata, .data and .bss and decides where each lives,
 * then a few lines of startup code copy .data into RAM and zero .bss before main() runs. Step through it, watching the
 * SRAM side fill in. sramValue is exported for the checks.
 */
import { status, stepButtons, syncUrl, walkthrough } from './dbg';

export interface Sym { name: string; section: 'data' | 'bss' | 'rodata'; init: string; zero?: string }

/** The globals in the example program, in the order they appear in memory. */
export const SYMS: Sym[] = [
  { name: 'int count', section: 'data', init: '42' },
  { name: 'uint16_t rate', section: 'data', init: '9600' },
  { name: 'int total', section: 'bss', init: '0', zero: '0' },
  { name: 'char buf[8]', section: 'bss', init: '0…', zero: '0…' },
];

export const STEPS = [
  { name: 'On reset', note: 'Flash holds the whole program. SRAM is powered but uninitialised: every global is whatever was left in the RAM from before. Nothing in C works yet, so the reset handler runs first, not main().' },
  { name: 'Copy .data', note: 'The startup loop copies the initial values of .data from their load address in Flash to their run address in SRAM. Now count is 42 and rate is 9600, as the source said. This copy is why initialised globals cost space in both Flash and RAM.' },
  { name: 'Zero .bss', note: 'Everything in .bss, globals with no initialiser or set to zero, is cleared in one loop. This is how C can promise uninitialised globals start at zero without storing a single zero byte in Flash.' },
  { name: 'Call main()', note: 'With .data copied and .bss zeroed, the C environment is ready, so the startup code branches to main(). Only now does the program you wrote begin to run.' },
];

/** What a symbol reads as in SRAM at a given startup step: '??' before it is set up, else its value. */
export function sramValue(sym: Sym, step: number): string {
  if (sym.section === 'rodata') return '—';
  if (sym.section === 'data') return step >= 1 ? sym.init : '??';
  return step >= 2 ? sym.zero! : '??';
}

export function mountSections(root: HTMLElement) {
  const q = Number(new URLSearchParams(location.search).get('k'));
  let step = Number.isInteger(q) && q >= 0 && q < STEPS.length ? q : 0;

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Where data lives</p>
      <h1>Sections and startup</h1>
      <p>A compiled program is not one blob: the linker sorts it into sections by what each part needs. Code and
        constants can stay in Flash and run from there, but writable globals must end up in RAM, and some of them need a
        copy of their starting values while others just need to be zero. The short stretch of code that runs before
        <code>main()</code> exists to set all of this up. Step through it.</p>
    </section>
    <section class="debugger mem sects" aria-label="Sections and startup">
      <header class="dbg-bar">
        <span class="dbg-file">startup</span>
        <span class="dbg-state"><i aria-hidden="true"></i>${STEPS[0].name}</span>
        <div class="dbg-controls">
          ${stepButtons()}
        </div>
      </header>
      <div class="se-body"></div>
      <p class="dbg-status" aria-live="polite"></p>
    </section>
    <section class="prose">
      <h2>The four sections</h2>
      <p><b>.text</b> is the code and <b>.rodata</b> the read-only constants, string literals, lookup tables, anything
        <code>const</code>; both stay in Flash and are read in place, never copied. <b>.data</b> is globals with a
        non-zero initialiser: the value lives in Flash and a writable copy lives in RAM. <b>.bss</b> is globals that start
        at zero: they take RAM but nothing in Flash, because zero does not need storing. Making a large array
        <code>const</code> keeps it out of RAM entirely, which on a part with far more Flash than RAM is often the whole
        game.</p>
      <h2>Load address versus run address</h2>
      <p>This is why a section has two addresses. Its <b>load address</b> (LMA) is where it sits in the image burned into
        Flash; its <b>run address</b> (VMA) is where the program expects it at run time. For .text and .rodata the two are
        the same. For .data they differ: the linker stores the initial values in Flash but links the code to read and
        write the RAM copy, and the startup loop bridges the gap by copying LMA → VMA. The linker script defines these
        addresses and exports the symbols (<code>_sdata</code>, <code>_edata</code>, <code>_sbss</code>…) the startup
        loop uses as its bounds.</p>
      <h2>Before main()</h2>
      <p>The reset handler does only what C assumes is already true: copy .data, zero .bss, set the stack pointer (loaded
        from the <a href="?p=interrupts" data-nav>vector table</a> by hardware), and run any C++ static constructors.
        Then it calls <code>main()</code>. If you have ever set a global expecting it to be zero and found garbage, the
        usual cause is an overwritten or skipped <code>.bss</code> zeroing loop, exactly this step going wrong.</p>
    </section>`;

  const walk = walkthrough(root, { count: () => STEPS.length, at: () => step, go: (i) => { step = i; draw(); } });

  function draw(note?: string) {
    const flashRows = [
      secBlock('.text', 'code', 'Reset_Handler, main, …', true),
      secBlock('.rodata', 'const', 'banner[] = "bit"', true),
      secBlock('.data init', 'LMA', SYMS.filter((s) => s.section === 'data').map((s) => `${s.name.split(' ')[1]} = ${s.init}`).join(', '), true),
    ].join('');
    const sramRows = [
      secGroup('.data', 'data', step),
      secGroup('.bss', 'bss', step),
    ].join('');
    const copying = step === 1;
    const zeroing = step === 2;
    root.querySelector('.se-body')!.innerHTML = `
      <div class="se-col"><h4>Flash <small>0x08000000</small></h4>${flashRows}</div>
      <div class="se-mid">${copying ? '<span class="se-arrow copy">copy ↓→</span>' : zeroing ? '<span class="se-arrow zero">= 0</span>' : '<span class="se-arrow idle">→</span>'}</div>
      <div class="se-col"><h4>SRAM <small>0x20000000</small></h4>${sramRows}</div>`;

    root.querySelector('.dbg-state')!.innerHTML = `<i aria-hidden="true"></i>${STEPS[step].name}`;
    walk.sync();
    status(root, `Step ${step + 1} of ${STEPS.length}. ${note ?? STEPS[step].note}`);
    syncUrl({ k: String(step) });
  }

  const secBlock = (name: string, tag: string, body: string, flash: boolean) =>
    `<div class="se-sec se-${flash ? 'flash' : 'ram'}"><div class="se-sh"><b>${name}</b><span>${tag}</span></div><div class="se-sb">${body}</div></div>`;

  function secGroup(name: string, section: 'data' | 'bss', step: number) {
    const rows = SYMS.filter((s) => s.section === section).map((s) => {
      const v = sramValue(s, step);
      const set = v !== '??' && v !== '—';
      return `<div class="se-sym${set ? ' set' : ''}"><span class="sy">${s.name}</span><span class="sv">${v}</span></div>`;
    }).join('');
    return `<div class="se-sec se-ram se-k-${section}"><div class="se-sh"><b>${name}</b><span>VMA</span></div><div class="se-sb">${rows}</div></div>`;
  }

  draw();
}
