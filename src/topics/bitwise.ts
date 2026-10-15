import { esc } from '../core/render';
import { hex } from '../core/util';
import { highlight } from './dbg';

export type Op = 'and' | 'or' | 'xor' | 'not';
const OPS: Op[] = ['and', 'or', 'xor', 'not'];
const NAME: Record<Op, string> = { and: 'AND', or: 'OR', xor: 'XOR', not: 'NOT' };
const SYMBOL: Record<Op, string> = { and: '&', or: '|', xor: '^', not: '~' };
const RULE: Record<Op, string> = {
  and: 'AND gives 1 only where both inputs are 1. Use it to keep some bits and clear the rest. In C: a & b, or a &= b to update a in place.',
  or: 'OR gives 1 where either input is 1, or both. Use it to set bits without touching the others. In C: a | b, or a |= b to update a in place.',
  xor: 'XOR gives 1 where the inputs differ. Use it to flip bits, or to find which bits changed. In C: a ^ b, or a ^= b to update a in place.',
  not: 'NOT flips every bit of a; b is not used. In C: ~a. There is no ~= operator, so write a = ~a to update a in place.',
};
/** The expression and its in-place (compound assignment) form, for the operator table. */
const FORMS: Record<Op, [string, string]> = {
  and: ['a & b', 'a &= b'], or: ['a | b', 'a |= b'], xor: ['a ^ b', 'a ^= b'], not: ['~a', 'a = ~a'],
};

/** The result of `op` on two 8-bit values. Exported for the accuracy checks. */
export function apply(op: Op, a: number, b: number) {
  const r = op === 'and' ? a & b : op === 'or' ? a | b : op === 'xor' ? a ^ b : ~a;
  return r & 0xff;
}

/** Where each operator shows up in real firmware, as C. Comments are written as // lines. */
const IDIOMS: Record<Op, string> = {
  and: `// Keep only the low four bits
uint8_t low = value & 0x0F;

// Test bit 3
if (flags & (1u << 3)) {
    /* bit 3 is set */
}`,
  or: `// Set bit 5 and leave the others alone
reg |= (1u << 5);

// Combine flags
uint8_t mode = ENABLE | INTERRUPT;`,
  xor: `// Toggle bit 2, for example to blink an LED
port ^= (1u << 2);

// Find which bits changed
uint8_t changed = before ^ after;`,
  not: `// Clear bit 3: AND with a mask that has every bit set except bit 3
reg &= ~(1u << 3);

// ~ works on int, so cast to keep the low 8 bits
uint8_t inverted = (uint8_t)~value;`,
};

const bits8 = (v: number) => {
  const s = v.toString(2).padStart(8, '0');
  return `${s.slice(0, 4)} ${s.slice(4)}`;
};


const bitOf = (v: number, i: number) => (v >> i) & 1;
const BITS = [7, 6, 5, 4, 3, 2, 1, 0];

/**
 * The bitwise logic page, drawn as a debugger paused on one line of C. The Variables pane shows a, b and r bit by
 * bit; clicking a bit of a or b edits it, r is recomputed at once, and any value that changed is highlighted, as a
 * debugger does after a step. Hovering a bit of r explains it in the status line. The state lives in the URL
 * (?a=B2&b=6B&op=xor), so a link reproduces exactly what is on screen.
 */
export function mountBitwise(root: HTMLElement) {
  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Bitwise operations</p>
      <h1>AND, OR, XOR and NOT</h1>
      <p>Bitwise operators apply one logic operation to every bit position at once, independently. Click the bits of a
        and b to change them, pick an operator, and watch r. Each bit of r depends only on the bits above it.</p>
    </section>
    <section class="debugger" aria-label="Debugger">
      <header class="dbg-bar">
        <span class="dbg-file">bitwise.c</span>
        <span class="dbg-state"><i aria-hidden="true"></i>Paused</span>
        <div class="dbg-ops" role="radiogroup" aria-label="Operator">${OPS.map((op) =>
          `<button type="button" role="radio" data-op="${op}" title="${NAME[op]}"><code>${SYMBOL[op]}</code> ${NAME[op]}</button>`).join('')}</div>
      </header>
      <div class="dbg-body">
        <pre class="dbg-code" aria-label="Source"><code></code></pre>
        <div class="dbg-vars">
          <h3>Variables</h3>
          <table>
            <thead><tr><th scope="col">Name</th><th scope="col">Value</th><th scope="col" class="bits-head">${BITS.map((i) => `<span>${i}</span>`).join('')}</th></tr></thead>
            <tbody>${['a', 'b', 'r'].map((v) => `
              <tr data-var="${v}">
                <th scope="row"><code>${v}</code> <small>uint8_t</small></th>
                <td class="val"><code class="hex"></code> <small class="dec"></small></td>
                <td class="bits">${BITS.map((i) => `<button type="button" class="bit" data-bit="${i}"${v === 'r' ? ' tabindex="-1"' : ''}></button>`).join('')}</td>
              </tr>`).join('')}</tbody>
          </table>
        </div>
      </div>
      <p class="dbg-status" aria-live="polite"></p>
    </section>
    <table class="op-table">
      <thead><tr><th scope="col">Operation</th><th scope="col">In C</th><th scope="col">In place</th><th scope="col">Result bit is 1 when</th></tr></thead>
      <tbody>${OPS.map((op) => `<tr data-op="${op}"><th scope="row">${NAME[op]}</th><td><code>${FORMS[op][0]}</code></td><td><code>${FORMS[op][1]}</code></td><td>${
        { and: 'both bits are 1', or: 'either bit is 1', xor: 'the bits differ', not: 'the bit of a is 0' }[op]}</td></tr>`).join('')}</tbody>
    </table>
    <section class="code-example" aria-labelledby="in-c">
      <h2 id="in-c">In firmware</h2>
      <p class="code-uses"></p>
      <pre class="code" data-code="uses"><code></code></pre>
    </section>`;

  const q = new URLSearchParams(location.search);
  const read = (k: string, d: number) => {
    const v = parseInt(q.get(k) ?? '', 16);
    return Number.isInteger(v) && v >= 0 && v <= 0xff ? v : d;
  };
  const state = { a: read('a', 0xb2), b: read('b', 0x6b), op: (OPS as string[]).includes(q.get('op') ?? '') ? q.get('op') as Op : 'and' as Op };
  const status = root.querySelector<HTMLElement>('.dbg-status')!;
  const say = (html: string) => (status.innerHTML = html);
  const ruleText = () => esc(RULE[state.op]);
  let last: Record<string, number> | null = null;

  /** Why bit `i` of r came out the way it did. */
  function why(i: number) {
    const a = bitOf(state.a, i);
    const b = bitOf(state.b, i);
    const r = bitOf(apply(state.op, state.a, state.b), i);
    return state.op === 'not'
      ? `Bit ${i}: a is ${a}, so ~${a} = ${r}.`
      : `Bit ${i}: a is ${a} and b is ${b}, so ${a} ${SYMBOL[state.op]} ${b} = ${r}.`;
  }

  function draw() {
    const r = apply(state.op, state.a, state.b);
    const vals: Record<string, number> = { a: state.a, b: state.b, r };
    const notOp = state.op === 'not';
    const pad = (s: string) => s.padEnd(24);
    const source = [
      '#include <stdint.h>',
      '',
      'int main(void) {',
      `    ${pad(`uint8_t a = ${hex(state.a)};`)}// ${bits8(state.a)}`,
      `    ${pad(`uint8_t b = ${hex(state.b)};`)}// ${notOp ? 'not used by ~' : bits8(state.b)}`,
      `    ${pad(notOp ? 'uint8_t r = (uint8_t)~a;' : `uint8_t r = a ${SYMBOL[state.op]} b;`)}// ${bits8(r)}`,
      '}',
    ];
    const PC = 5; // the line the debugger is paused on, after it ran
    root.querySelector('.dbg-code code')!.innerHTML = source.map((l, n) =>
      `<span class="ln${n === PC ? ' pc' : ''}"><span class="gutter">${n + 9}</span>${highlight(l) || ' '}</span>`).join('');

    for (const v of ['a', 'b', 'r']) {
      const row = root.querySelector<HTMLElement>(`tr[data-var="${v}"]`)!;
      const changed = last !== null && last[v] !== vals[v];
      row.classList.toggle('changed', changed);
      row.classList.toggle('unused', v === 'b' && notOp);
      row.querySelector('.hex')!.textContent = hex(vals[v]);
      row.querySelector('.dec')!.textContent = String(vals[v]);
      row.querySelectorAll<HTMLButtonElement>('.bit').forEach((k) => {
        const i = Number(k.dataset.bit);
        const on = bitOf(vals[v], i) === 1;
        const flipped = last !== null && bitOf(last[v], i) !== bitOf(vals[v], i);
        k.textContent = on ? '1' : '0';
        k.classList.toggle('on', on);
        k.classList.toggle('flipped', flipped);
        k.setAttribute('aria-label', v === 'r' ? `r bit ${i} is ${on ? 1 : 0}` : `${v} bit ${i}, ${on ? 1 : 0}. Click to flip.`);
      });
    }
    root.querySelectorAll<HTMLElement>('.op-table tbody tr').forEach((tr) => tr.classList.toggle('current', tr.dataset.op === state.op));
    root.querySelectorAll<HTMLButtonElement>('.dbg-ops button').forEach((b) => {
      const on = b.dataset.op === state.op;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    root.querySelector('.code-uses')!.textContent = `Where you will see ${NAME[state.op]} (${SYMBOL[state.op]}) in embedded C:`;
    root.querySelector('[data-code="uses"] code')!.innerHTML = highlight(IDIOMS[state.op]);
    last = vals;

    const u = new URL(location.href);
    u.searchParams.set('a', state.a.toString(16).toUpperCase().padStart(2, '0'));
    u.searchParams.set('b', state.b.toString(16).toUpperCase().padStart(2, '0'));
    u.searchParams.set('op', state.op);
    history.replaceState(null, '', u);
  }

  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    const bit = t.closest<HTMLButtonElement>('tr[data-var="a"] .bit, tr[data-var="b"] .bit');
    if (bit) {
      const v = bit.closest<HTMLElement>('tr')!.dataset.var as 'a' | 'b';
      state[v] ^= 1 << Number(bit.dataset.bit);
      draw();
      say(why(Number(bit.dataset.bit)));
      return;
    }
    const op = t.closest<HTMLButtonElement>('.dbg-ops button');
    if (op) {
      state.op = op.dataset.op as Op;
      draw();
      say(ruleText());
    }
  });
  // Arrow keys move between operators, as in any radio group.
  root.querySelector('.dbg-ops')!.addEventListener('keydown', (e) => {
    const ev = e as KeyboardEvent;
    const d = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[ev.key];
    if (!d) return;
    ev.preventDefault();
    state.op = OPS[(OPS.indexOf(state.op) + d + OPS.length) % OPS.length];
    draw();
    say(ruleText());
    root.querySelector<HTMLButtonElement>(`.dbg-ops button[data-op="${state.op}"]`)!.focus();
  });
  const rRow = root.querySelector<HTMLElement>('tr[data-var="r"]')!;
  rRow.addEventListener('pointerover', (e) => {
    const k = (e.target as Element).closest<HTMLElement>('.bit');
    if (k) say(why(Number(k.dataset.bit)));
  });
  rRow.addEventListener('pointerleave', () => say(ruleText()));

  draw();
  say(ruleText());
}
