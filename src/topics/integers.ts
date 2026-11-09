/**
 * The integer types page: three pairs of functions that differ only in a type (uint8_t against uint32_t, a signed
 * and unsigned compare, signed and unsigned division), compiled at -Os, and a table of every basic type's size and
 * alignment on Arm, measured by Clang.
 */
import { esc } from '../core/render';
import { C } from './cdata';
import { pairExplorer } from './cc';

const CASES = ['narrow', 'compare', 'divide'] as const;
type Case = (typeof CASES)[number];
const NAMES: Record<Case, string> = { narrow: '8-bit math', compare: 'Mixed compare', divide: 'Divide by 2' };
const TYPES: Record<Case, [string, string]> = { narrow: ['uint8_t', 'uint32_t'], compare: ['int < unsigned', 'int < int'], divide: ['int', 'unsigned'] };
const SAY: Record<Case, [string, string]> = {
  narrow: [
    'The add is done in 32 bits, as every add is: C promotes both uint8_t values to int first. Then <code>uxtb</code> cuts the result back to 8 bits, so 200 + 100 returns 44. A narrow type saves memory in an array or struct, but in a local variable or argument it can cost an extra instruction.',
    'With uint32_t there is nothing to cut: one <code>adds</code> and return. For locals, loop counters and arguments, a 32-bit type is the natural size on a 32-bit processor.',
  ],
  compare: [
    'Comparing an int with an unsigned converts the int to unsigned first, so the compiler uses <code>blo</code>, an unsigned branch. -1 becomes 0xFFFFFFFF, the largest unsigned value, and <code>below(-1, 1)</code> returns 0. Clang warns about this with <code>-Wsign-compare</code>.',
    'Both signed, so the compiler uses <code>blt</code>, the signed branch, and <code>below(-1, 1)</code> is 1. The instructions are the same size; only the condition differs. The type decides which flags the branch reads.',
  ],
  divide: [
    'Signed division rounds toward zero, but a right shift rounds down: -3 >> 1 is -2, while -3 / 2 is -1. So the compiler adds the sign bit first (<code>lsrs r1, r0, #31</code> is 1 for a negative number) and then shifts with <code>asrs</code>. Three instructions.',
    'An unsigned number is never negative, so dividing by 2 is one shift right. If a value can never be negative, an unsigned type tells the compiler so.',
  ],
};

export function mountIntegers(root: HTMLElement) {
  const panel = pairExplorer({
    file: 'types.c', asm: 'types.s', label: 'Integer types', cls: 'ints', formKey: 'type', formLabel: 'Type',
    cases: CASES, names: NAMES, forms: TYPES, say: SAY, src: C.src.ints, builds: C.ints,
  });

  const sizes = C.sizes.map((s) => `<tr><td><code>${esc(s.type)}</code></td><td>${s.size}</td><td>${s.align}</td></tr>`).join('');
  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Variables and types</p>
      <h1>Integer types</h1>
      <p>C’s integer types look interchangeable, but each choice changes the instructions. Pick an example and switch
        its type to compare the code Clang produces for a Cortex-M0+ at <code>-Os</code>. The status line says what
        changed and why.</p>
    </section>
    ${panel.html}
    <section class="prose">
      <h2>How big is an int?</h2>
      <p>C only sets minimums: an <code>int</code> is at least 16 bits, a <code>long</code> at least 32. The rest is up
        to the platform. On 32-bit Arm, Clang uses these sizes, in bytes:</p>
      <table class="op-table c-sizes"><thead><tr><th>Type</th><th>Size</th><th>Alignment</th></tr></thead><tbody>${sizes}</tbody></table>
      <p>On an 8-bit AVR an <code>int</code> is 2 bytes, and on a 64-bit PC a <code>long</code> is usually 8. For
        registers, protocols and anything stored or sent, use the exact-width types from <code>&lt;stdint.h&gt;</code>:
        <code>uint8_t</code>, <code>int16_t</code>, <code>uint32_t</code>. Plain <code>char</code> may be signed or
        unsigned; on bare-metal Arm it is unsigned and on x86 signed, so use <code>uint8_t</code> for bytes.</p>
      <h2>Promotion</h2>
      <p>Before any arithmetic, C converts anything smaller than <code>int</code> to <code>int</code>. So
        <code>uint8_t a = 200, b = 100;</code> gives <code>a + b == 300</code>, and only storing it back into a
        uint8_t wraps it to 44. It also catches shifts: <code>(uint8_t)0x80 &lt;&lt; 24</code> is an int, and shifting a 1
        into its sign bit is <a href="?p=ub" data-nav>undefined behavior</a>. Write <code>(uint32_t)x &lt;&lt; 24</code>.</p>
      <h2>Signed or unsigned</h2>
      <p>Unsigned arithmetic wraps around by definition: 0 − 1 is 0xFFFFFFFF. Signed overflow is undefined, so the
        compiler may assume it never happens. When signed and unsigned values meet, the signed one is converted to
        unsigned, which turns small negative numbers into huge positive ones. Keep each comparison to one kind, and
        turn on <code>-Wall -Wextra</code>, which warns about mixing them.</p>
    </section>`;

  panel.mount(root);
}
