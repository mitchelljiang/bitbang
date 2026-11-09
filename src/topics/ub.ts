/**
 * The undefined behavior page: three bugs that the optimizer turns into surprising code, each beside its fix, built
 * with Clang at -Os.
 */
import { CC } from './ccdata';
import { asOut, explorer, explorerHtml, maxRows, sizeNote } from './cc';
import { markSeg, oneOf, seg, syncUrl } from './dbg';

const CASES = ['overflow', 'null', 'bounds'] as const;
type Case = (typeof CASES)[number];
const NAMES: Record<Case, string> = { overflow: 'Signed overflow', null: 'Null check', bounds: 'Out of bounds' };
const SAY: Record<Case, [string, string]> = {
  overflow: [
    'The whole check became <code>movs r0, #1</code>: always true. Signed overflow is undefined, so the compiler may assume <code>x + 1</code> never wraps, and then <code>x + 1 &gt; x</code> holds for every x. On INT_MAX the check you wrote is gone.',
    'Comparing against INT_MAX never overflows, so the compiler must really compare. The subtract-with-borrow sequence works out <code>x &lt; INT_MAX</code> without a branch.',
  ],
  null: [
    'The null check is gone: one load and return. <code>*p</code> runs first, and dereferencing a null pointer is undefined, so after that line the compiler may assume p is not null and drop the test. On a Cortex-M0+, address 0 is usually Flash, so the load quietly succeeds.',
    'Checking first keeps the test: compare, branch to return −1 (<code>mvns</code> of 0), else load.',
  ],
  bounds: [
    'The loop compares <code>i</code> against 16 bytes, so it reads <code>table[4]</code>, the word after the array: whatever the linker happened to put there. Here the compiler kept the loop, but it would be entitled to assume the out-of-bounds pass never happens and remove it, or anything else.',
    'With <code>i &lt; 4</code> the loop stops at 12 bytes, the last element.',
  ],
};

export function mountUb(root: HTMLElement) {
  let c = oneOf('case', CASES, 'overflow');
  let fixed = oneOf('v', ['bug', 'fix'] as const, 'bug');

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Optimization</p>
      <h1>Undefined behavior</h1>
      <p>Some operations in C have no defined result: signed overflow, reading through a null pointer, indexing past
        the end of an array, and a few dozen more. The compiler is allowed to assume they never happen, and the
        optimizer uses that freely. The result is code that drops your checks. Compare each bug with its fix.</p>
    </section>
    ${explorerHtml({
      file: 'ub.c', label: 'Undefined behavior',
      controls: `${seg('case', 'Example', CASES.map((k) => [k, NAMES[k]]))}
        ${seg('v', 'Version', [['bug', 'As written'], ['fix', 'Fixed']])}`,
    })}
    <section class="prose">
      <h2>Why the compiler is allowed</h2>
      <p>The standard says that when a program does something undefined, it places no requirement at all on what
        happens. So the compiler only has to get the defined cases right, and it reasons backwards from there: if
        <code>x + 1</code> cannot overflow, it is always bigger than <code>x</code>; if <code>*p</code> already ran,
        <code>p</code> was not null. Each step is sound for every program without undefined behavior, and the
        optimizer makes thousands of them. They are what makes C fast, and why one bug can remove code far from the
        line where it happens.</p>
      <h2>Common cases in firmware</h2>
      <ul>
        <li><strong>Signed overflow.</strong> <code>int</code> arithmetic that wraps. Unsigned arithmetic wraps by
          definition and is safe; for signed, check before the operation or use
          <code>__builtin_add_overflow</code>. See <a href="?p=flags" data-nav>overflow and status flags</a>.</li>
        <li><strong>Shifts.</strong> Shifting by the width of the type or more, as in <code>1u &lt;&lt; 32</code>, or
          shifting a 1 into the sign bit of an <code>int</code>, as in <code>1 &lt;&lt; 31</code>. Write
          <code>1u &lt;&lt; 31</code>.</li>
        <li><strong>Out-of-bounds access</strong> and uninitialized local variables.</li>
        <li><strong>Type punning through pointers</strong>, such as reading a <code>float</code> through a
          <code>uint32_t *</code>. Use <code>memcpy</code>, which the compiler turns into a plain load.</li>
        <li><strong>Data races</strong>: two threads, or a thread and an interrupt, using the same non-atomic
          variable without a <a href="?p=locks" data-nav>lock</a>.</li>
      </ul>
      <h2>Finding it</h2>
      <p>Build tests on a PC with <code>-fsanitize=undefined,address</code>, which checks every one of these as the
        program runs. <code>-Wall -Wextra</code> catches some at compile time. GCC and Clang also offer
        <code>-fwrapv</code>, which defines signed overflow to wrap, at a small cost in speed.</p>
    </section>`;

  const views = CASES.flatMap((k) => [0, 1].map((v) => ({ src: CC.src.ub[k][v], out: CC.ub[k][v].asm, say: SAY[k][v] })));
  const { draw } = explorer(root, maxRows(views), () => {
    const v = fixed === 'fix' ? 1 : 0;
    const b = CC.ub[c][v];
    markSeg(root, 'case', c);
    markSeg(root, 'v', fixed);
    syncUrl({ case: c, v: fixed });
    return { src: CC.src.ub[c][v], out: asOut(b.asm), head: `ub.s · -Os · ${sizeNote(b)}`, summary: SAY[c][v] };
  });

  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    const k = t.closest<HTMLElement>('[data-case]');
    const o = t.closest<HTMLElement>('[data-v]');
    if (k) c = k.dataset.case as Case;
    else if (o) fixed = o.dataset.v as typeof fixed;
    else return;
    draw(true);
  });
}
