/**
 * Race conditions: two tasks each run count++, which compiles to a load, an add and a store. The reader is the
 * scheduler: each click runs the next instruction of task A or task B, building the interleaving one instruction at a
 * time. The trace shows both tasks and the value of count in memory; a lost update is marked when it happens.
 */
import { esc } from '../core/render';
import { highlight, syncUrl } from './dbg';
import { cursor, drawTrace, readout, type Bar, type Lane } from './timeline';

export type T = 'A' | 'B';
export const ASM = ['ldr  r0, [r1]', 'adds r0, r0, #1', 'str  r0, [r1]'];
const OP = ['LDR', 'ADDS', 'STR'];

export interface RaceState { mem: number; r0: Record<T, number | null>; pc: Record<T, number>; loadedAt: Record<T, number>; storeLog: { who: T; v: number; t: number }[] }

/** Runs an interleaving such as "AABBAB" and returns the final state. Each task's r0 is its own, saved on a switch. */
export function runOrder(order: string): RaceState {
  const s: RaceState = { mem: 0, r0: { A: null, B: null }, pc: { A: 0, B: 0 }, loadedAt: { A: -1, B: -1 }, storeLog: [] };
  [...order].forEach((c, t) => exec(s, c as T, t));
  return s;
}

function exec(s: RaceState, who: T, t: number) {
  const pc = s.pc[who];
  if (pc === 0) { s.r0[who] = s.mem; s.loadedAt[who] = t; }
  else if (pc === 1) s.r0[who] = s.r0[who]! + 1;
  else if (pc === 2) { s.mem = s.r0[who]!; s.storeLog.push({ who, v: s.mem, t }); }
  s.pc[who] = pc + 1;
}

/** Every way to interleave two three-instruction sequences: 6 choose 3 = 20 orders. */
export const ALL_ORDERS: string[] = (() => {
  const out: string[] = [];
  const go = (o: string, a: number, b: number) => {
    if (a === 3 && b === 3) out.push(o);
    if (a < 3) go(o + 'A', a + 1, b);
    if (b < 3) go(o + 'B', a, b + 1);
  };
  go('', 0, 0);
  return out;
})();

const LOST = ALL_ORDERS.filter((o) => runOrder(o).mem !== 2).length;
const other = (w: T): T => (w === 'A' ? 'B' : 'A');

/** What the last instruction did, and what it means given where the other task is. */
function explain(order: string): string {
  if (!order.length) return 'count is 0. Both tasks are about to run <code>count++</code>. Run the next instruction of A or B, in any order you like: you are the scheduler.';
  const before = runOrder(order.slice(0, -1));
  const s = runOrder(order);
  const w = order[order.length - 1] as T, o = other(w);
  const pc = before.pc[w];
  let text: string;
  if (pc === 0) {
    text = `${w} loads count, ${s.r0[w]}, into its r0.`;
    if (before.pc[o] === 1 || before.pc[o] === 2) text += ` ${o} has already loaded the same value and not stored its result yet, so both are now working from ${s.r0[w]}. One of the two updates is doomed.`;
    else if (before.pc[o] === 3) text += ` ${o} has already stored its result, so ${w} sees the updated value.`;
  } else if (pc === 1) {
    text = `${w} adds 1 in its own register: r0 = ${s.r0[w]}. Memory still holds ${s.mem}; nobody else can see this result until it is stored.`;
  } else {
    const otherStore = before.storeLog.find((x) => x.who === o && x.t > before.loadedAt[w]);
    text = `${w} stores r0 = ${s.r0[w]} to count.`;
    if (otherStore) text += ` <span class="bad">That overwrites ${o}’s update: ${o} stored ${otherStore.v} after ${w} had loaded, so ${w}’s result is based on a stale value.</span>`;
  }
  if (order.length === 6) text += s.mem === 2
    ? ` <span class="good">Both increments landed: count = 2.</span> One task finished its read-modify-write before the other began.`
    : ` <span class="bad">Lost update: two increments ran, but count = ${s.mem}.</span> ${LOST} of the ${ALL_ORDERS.length} possible orders end this way.`;
  return text;
}

const COLOR: Record<T, string> = { A: 'var(--ch2)', B: 'var(--ch3)' };

export function mountRaces(root: HTMLElement) {
  const q = new URLSearchParams(location.search).get('o') ?? '';
  let order = /^[AB]{0,6}$/.test(q) && [...q].filter((c) => c === 'A').length <= 3 && [...q].filter((c) => c === 'B').length <= 3 ? q : '';

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Sharing data safely</p>
      <h1>Race conditions</h1>
      <p>Two tasks share a counter, and each adds one to it. In C that is one line, <code>count++</code>, but the processor
        does it in three instructions: load, add, store. A task can be switched out between any two of them. Here you are
        the scheduler: run the next instruction of A or of B in whatever order you like, and watch what reaches memory.</p>
    </section>
    <section class="trace races" aria-label="Race condition trace">
      <header class="tr-bar">
        <span class="tr-title">Two tasks · count++</span>
        <div class="tr-controls">
          <button type="button" class="tr-btn primary rc-a" data-run="A">Run A</button>
          <button type="button" class="tr-btn primary rc-b" data-run="B">Run B</button>
          <button type="button" class="tr-btn" data-undo>Undo</button>
          <button type="button" class="tr-btn" data-reset>Reset</button>
        </div>
      </header>
      <div class="tr-screen">
        <div class="tr-readout"></div>
        <div class="tr-grid"></div>
        <div class="tr-side rc-side"><div class="rc-code" data-t="A"></div><div class="rc-code" data-t="B"></div></div>
      </div>
      <p class="tr-status" aria-live="polite"></p>
    </section>
    <section class="prose">
      <h2>Read, modify, write</h2>
      <p>An ARM core cannot add to memory directly. To increment a variable it loads it into a register, adds in the
        register, and stores it back. Between the load and the store the true value lives only in that task’s register,
        invisible to everyone else. If another task loads the variable in that window, both start from the same old value
        and both store the same new one, and one increment vanishes. Each task has its own r0 because the context switch
        saves and restores it, which is exactly why the two copies can disagree.</p>
      <h2>Why races are hard to find</h2>
      <p>Of the ${ALL_ORDERS.length} ways to interleave these six instructions, only 2 give the right answer: those where one
        task finishes before the other starts. Yet in a real system the window is a couple of nanoseconds wide, and a
        switch lands in it rarely. The code passes every test, then fails once a week in the field. The same race happens
        between a task and an interrupt handler, or between two cores, and with any shared read-modify-write: setting a bit
        in a flags word, appending to a buffer, updating a linked list.</p>
      <h2>The fix is to make it indivisible</h2>
      <p>The cure is to make the whole read-modify-write happen as one step that nothing can split, either by stopping
        anything else from running during it, or by using an instruction sequence that detects interference and retries.
        That is the next page: <a href="?p=atomics">atomics and critical sections</a>.</p>
    </section>`;

  const lanes: Lane[] = [
    { id: 'A', name: 'Task A', sub: '', color: COLOR.A },
    { id: 'B', name: 'Task B', sub: '', color: COLOR.B },
    { id: 'mem', name: 'count', sub: 'in RAM', color: 'var(--ch4)', bus: true },
  ];

  function draw() {
    const s = runOrder(order);
    // One bar per instruction, labelled with what it did, and count's value on the bus lane: a new value at every store,
    // drawn as bad when it is less than the number of stores so far, which means an update was lost.
    const bars: Bar[] = [];
    const r = runOrder('');
    let from = 0, stores = 0;
    const value = (t1: number) => bars.push({ lane: 'mem', t0: from, t1, kind: r.mem < stores ? 'bad' : 'value', label: String(r.mem) });
    [...order].forEach((c, t) => {
      const w = c as T, pc = r.pc[w];
      if (pc === 2) value(t + 1);
      exec(r, w, t);
      if (pc === 2) { stores++; from = t + 1; }
      bars.push({ lane: w, t0: t, t1: t + 1, kind: 'run', label: pc === 2 ? `STR ${r.mem}` : `${OP[pc]} r0=${r.r0[w]}` });
    });
    value(6);
    for (const l of lanes) if (l.id !== 'mem') l.sub = `r0 = ${s.r0[l.id as T] ?? '–'}`;
    drawTrace(root, { lanes, bars, end: 6, every: 1 });
    cursor(root, order.length, 6);
    root.querySelectorAll<HTMLElement>('.tr-lane').forEach((l) => l.classList.toggle('on', l.dataset.lane === order[order.length - 1]));
    root.querySelector(`.tr-seg[data-i="${bars.length - 2}"]`)?.classList.toggle('active', order.length > 0);

    const done = order.length === 6;
    readout(root, [`count = <b>${s.mem}</b>`, `A: ${s.pc.A}/3 done`, `B: ${s.pc.B}/3 done`,
      done ? `<span class="${s.mem === 2 ? 'good' : 'bad'}">${s.mem === 2 ? 'Correct' : 'Lost update'}</span>` : `Order: <b>${order || '—'}</b>`]);
    root.querySelector('.tr-status')!.innerHTML = explain(order);
    for (const t of ['A', 'B'] as T[]) {
      root.querySelector<HTMLButtonElement>(`[data-run="${t}"]`)!.disabled = s.pc[t] === 3;
      root.querySelector(`.rc-code[data-t="${t}"]`)!.innerHTML = `<h4 style="--lane:${COLOR[t]}">Task ${t} <small>r0 = ${s.r0[t] ?? '–'}</small></h4>
        <pre class="dbg-code"><code>${[`count++;`, ...ASM].map((l, n) => `<span class="ln${n > 0 && n - 1 === s.pc[t] ? ' pc' : ''}${n > 0 && n - 1 < s.pc[t] ? ' did' : ''}"><span class="gutter">${n === 0 ? 'C' : n}</span>${n === 0 ? highlight(l) : esc(l)}</span>`).join('')}</code></pre>`;
    }
    root.querySelector<HTMLButtonElement>('[data-undo]')!.disabled = !order.length;
    syncUrl({ o: order });
  }
  draw();

  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    const run = t.closest<HTMLElement>('[data-run]')?.dataset.run as T | undefined;
    if (run && runOrder(order).pc[run] < 3) { order += run; draw(); }
    else if (t.closest('[data-undo]')) { order = order.slice(0, -1); draw(); }
    else if (t.closest('[data-reset]')) { order = ''; draw(); }
  });
  let rt: number | undefined;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = window.setTimeout(() => cursor(root, order.length, 6), 100); });
}
