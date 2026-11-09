/**
 * The functions page: four pairs compiled at -Os: inlined against a real call, four arguments against six, a static
 * function nobody calls against a global one, and a struct passed by value against by pointer.
 */
import { C } from './cdata';
import { pairExplorer } from './cc';

const CASES = ['inline', 'args', 'static', 'struct'] as const;
type Case = (typeof CASES)[number];
const NAMES: Record<Case, string> = { inline: 'Inlining', args: 'Arguments', static: 'Unused code', struct: 'Passing structs' };
const FORMS: Record<Case, [string, string]> = { inline: ['static inline', 'noinline'], args: ['4 arguments', '6 arguments'], static: ['global', 'static'], struct: ['By value', 'By pointer'] };
const SAY: Record<Case, [string, string]> = {
  inline: [
    'There is no call: clamp’s compare is pasted in twice, once for each use, with its 100 shared in r2. No stack, no saved registers. Here inlining makes the code smaller as well as faster, because the function is so short.',
    'With inlining forbidden, each use is a <code>bl</code>. level must save lr, because each call overwrites it, and must keep b and the first result in r4 and r5, which a call leaves alone, so those are saved too. It is 12 instructions against 9, and slower.',
  ],
  args: [
    'The first four arguments go in r0 to r3, so a call with four needs no memory: just <code>movs</code> and <code>bl</code>. The result comes back in r0. <code>push {r7, lr}</code> saves the return address, because <code>bl</code> is about to overwrite lr.',
    'r0 to r3 are full, so the fifth and sixth arguments go on the stack: <code>sub sp, #8</code> makes room, two <code>str</code> fill it, and <code>add sp, #8</code> gives it back. Keeping to four arguments, or passing a pointer to a struct, avoids this.',
  ],
  static: [
    'helper is global, so another file might call it. The compiler has to keep it, whether or not anything does.',
    'static means no other file can call helper, and nothing in this file does, so the compiler drops it. Making every internal function static is free space, and lets the compiler inline more.',
  ],
  struct: [
    'An 8-byte struct passed by value travels in registers: x in r0, y in r1. No memory is touched, so this is the fast form for a small struct. A larger one is copied, into r0 to r3 and then onto the stack.',
    'Passing a pointer costs two loads here, but the cost stays the same however large the struct gets, and nothing is copied. Use a <code>const</code> pointer for anything bigger than a few words.',
  ],
};

export function mountFunctions(root: HTMLElement) {
  const panel = pairExplorer({
    file: 'fn.c', asm: 'fn.s', label: 'Functions', cls: 'fn', formKey: 'form', formLabel: 'Form',
    cases: CASES, names: NAMES, forms: FORMS, say: SAY, src: C.src.fns, builds: C.fns,
  });

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Functions</p>
      <h1>Functions</h1>
      <p>A function call is a jump with rules about which registers hold what. Those rules decide what a call costs,
        and the optimizer may remove the call altogether. Pick an example and switch its form to compare the code
        Clang produces for a Cortex-M0+ at <code>-Os</code>.</p>
    </section>
    ${panel.html}
    <section class="prose">
      <h2>The calling convention</h2>
      <p>Arm’s procedure call standard (the AAPCS) is what lets separately compiled files call each other. Arguments
        go in r0 to r3, then on the stack. The result comes back in r0, or in r0 and r1 for 64 bits. r0 to r3 and r12
        may be overwritten by any call; r4 to r11 must be saved by a function that uses them, which is why you see
        <code>push {r4, r5, r7, lr}</code>. The <a href="?p=calls" data-nav>function calls</a> page steps through one
        instruction at a time.</p>
      <h2>inline</h2>
      <p><code>inline</code> does not force inlining: at <code>-Os</code> or <code>-O2</code> the compiler decides for
        itself, and often inlines without being asked. What the keyword really affects is linking. The usual form for a
        header is <code>static inline</code>, which gives each file that includes it its own private copy, with no
        duplicate-symbol errors. Inlining a big function in many places makes the program larger, so
        <code>__attribute__((always_inline))</code> and <code>noinline</code> are there for when you must decide.</p>
      <h2>Interrupt handlers</h2>
      <p>On a Cortex-M, an interrupt handler is an ordinary C function with no special keyword. When the interrupt
        arrives the hardware itself saves r0 to r3, r12, lr, pc and the status register, which are exactly the
        registers a C function may overwrite, and returns from a magic value in lr. So
        <code>void SysTick_Handler(void)</code> needs nothing else. Other architectures, such as AVR and some RISC-V
        chips, do need an attribute. See <a href="?p=interrupts" data-nav>interrupts</a>.</p>
      <h2>Recursion and stack use</h2>
      <p>Each non-inlined call uses stack for its saved registers and locals, and SRAM is small. Avoid recursion, and
        keep large arrays out of locals. <code>-fstack-usage</code> reports each function’s stack use, and a
        <a href="?p=overflow" data-nav>stack overflow</a> otherwise tends to show up as silent corruption.</p>
    </section>`;

  panel.mount(root);
}
