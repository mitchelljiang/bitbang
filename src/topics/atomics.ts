/**
 * Atomics and critical sections: main() increments a counter that an interrupt handler also increments, and the
 * interrupt fires right after main() has loaded it. The reader picks the protection, none, volatile, disabling
 * interrupts, or an LDREX/STREX loop, and a small interpreter runs the instructions, so whether the update is lost
 * follows from the instructions themselves.
 */
import { esc } from '../core/render';
import { highlight, markSeg, oneOf, seg, syncUrl } from './dbg';
import { stepper, traceHtml, type Bar, type Lane, type Step } from './timeline';

export type Mode = 'none' | 'volatile' | 'irq' | 'excl';
export const MODES: Mode[] = ['none', 'volatile', 'irq', 'excl'];
type Op = 'ldr' | 'ldrex' | 'adds' | 'str' | 'strex' | 'cmp' | 'bne' | 'cpsid' | 'cpsie';
interface Ins { op: Op; asm: string }

const I = (op: Op, asm: string): Ins => ({ op, asm });
const LDR = I('ldr', 'ldr   r0, [r1]'), ADDS = I('adds', 'adds  r0, r0, #1'), STR = I('str', 'str   r0, [r1]');
/** main()'s code for each mode: the C, then the instructions it compiles to. */
export const PROGRAM: Record<Mode, { c: string[]; asm: Ins[] }> = {
  none: { c: ['uint32_t count;', 'count++;'], asm: [LDR, ADDS, STR] },
  volatile: { c: ['volatile uint32_t count;', 'count++;'], asm: [LDR, ADDS, STR] },
  irq: { c: ['__disable_irq();', 'count++;', '__enable_irq();'], asm: [I('cpsid', 'cpsid i'), LDR, ADDS, STR, I('cpsie', 'cpsie i')] },
  excl: { c: ['atomic_fetch_add(&count, 1);'], asm: [I('ldrex', 'ldrex r0, [r1]'), ADDS, I('strex', 'strex r2, r0, [r1]'), I('cmp', 'cmp   r2, #0'), I('bne', 'bne   retry')] },
};
export const ISR = { c: ['void USART2_IRQHandler(void) {', '  count++;', '}'], asm: [LDR, ADDS, STR] };

export interface ASeg {
  lane: 'main' | 'isr';
  t0: number;
  t1: number;
  kind: 'run' | 'hatch' | 'bg';
  /** Which instruction ran, as an index into main's or the ISR's asm, or -1. */
  pc: number;
  label?: string;
  note: string;
  mem: number;
  r0: number;
  primask: number;
  monitor: 'open' | 'exclusive';
}
export interface ARun { segs: ASeg[]; pending: [number, number] | null; mem: number; strexFails: number; end: number }

/** Runs main() and the interrupt for one protection mode. The interrupt fires as main() finishes its first load. */
export function atomicRun(mode: Mode): ARun {
  const prog = PROGRAM[mode].asm;
  const segs: ASeg[] = [];
  let mem = 0, r0 = 0, r2 = 0, z = false, primask = 0, monitor: 'open' | 'exclusive' = 'open';
  let t = 0, pc = 0, arrived = -1, isrDone = false, strexFails = 0, loads = 0;
  let pending: [number, number] | null = null;
  const push = (s: Omit<ASeg, 't0' | 't1' | 'mem' | 'r0' | 'primask' | 'monitor'>) => {
    segs.push({ ...s, t0: t, t1: t + 1, mem, r0, primask, monitor });
    t += 1;
  };
  const vol = mode === 'volatile';

  // Each pass: take the interrupt if it is pending and not masked, then run main()'s next instruction.
  for (let guard = 0; guard < 50; guard++) {
    if (arrived >= 0 && !isrDone && !primask) {
      if (t > arrived) pending = [arrived, t];
      monitor = 'open';
      push({ lane: 'isr', kind: 'hatch', pc: -1, label: '',
        note: `${pending ? 'PRIMASK is clear again, so the pending UART interrupt is taken at once. ' : ''}The processor stacks main()’s registers, its r0 = ${r0} among them, and enters the handler.${
          mode === 'excl' ? ' Taking an exception also clears the exclusive monitor: main()’s reservation on count is gone.' : ''}` });
      let ir0 = 0;
      ISR.asm.forEach((ins, k) => {
        let note: string;
        if (ins.op === 'ldr') { ir0 = mem; note = `The handler loads count: ${mem}.${mem === 0 && mode !== 'irq' ? ' main() has not stored its result yet; it is sitting in main()’s saved r0.' : ''}`; }
        else if (ins.op === 'adds') { ir0 += 1; note = `The handler adds 1 in its own r0: ${ir0}.`; }
        else { mem = ir0; note = `The handler stores ${ir0}. count = ${mem}.`; }
        const saved = r0; r0 = ir0;
        push({ lane: 'isr', kind: 'run', pc: k, label: ins.op.toUpperCase(), note });
        r0 = saved;
      });
      push({ lane: 'isr', kind: 'hatch', pc: -1, label: '',
        note: pc >= prog.length
          ? 'The handler returns and main() carries on after its critical section. The interrupt was delayed by a few instructions, not lost.'
          : `The handler returns and main()’s registers come back, so main()’s r0 is ${r0} again, the value it loaded before the interrupt.${mode === 'excl' ? ' The exception return leaves the monitor open.' : ''}` });
      monitor = 'open';
      isrDone = true;
    }
    if (pc >= prog.length) break;
    const ins = prog[pc];
    let note = '';
    let next = pc + 1;
    switch (ins.op) {
      case 'cpsid':
        primask = 1;
        note = '<code>__disable_irq()</code> is one instruction, <code>cpsid i</code>, which sets PRIMASK: from here no configurable interrupt can be taken. It is still recorded, as pending.';
        break;
      case 'cpsie':
        primask = 0;
        note = '<code>cpsie i</code> clears PRIMASK. The critical section is over, and count++ completed without anything in between.';
        break;
      case 'ldr': case 'ldrex':
        r0 = mem; loads++;
        if (ins.op === 'ldrex') monitor = 'exclusive';
        note = loads === 1
          ? `main() loads count, ${mem}, into r0${ins.op === 'ldrex' ? ', and LDREX also sets the exclusive monitor: it now watches count’s address' : ''}.${vol ? ' Because count is volatile, the compiler must really load it from memory, every time.' : ''}`
          : `LDREX loads count again: ${mem}, which already includes the handler’s increment, and sets the monitor again.`;
        break;
      case 'adds':
        r0 += 1;
        note = `main() adds 1 in r0: ${r0}.${mem !== r0 - 1 ? ` But count in memory is ${mem} now, so this result is already out of date.` : ''}`;
        break;
      case 'str': {
        const lost = mem >= r0;
        mem = r0;
        note = lost
          ? `main() stores r0 = ${r0}. <span class="bad">That overwrites the handler’s update: two increments ran, count = ${mem}.</span>${vol ? ' volatile made every access real, but the load, add and store are still three separate instructions with a gap between them.' : ''}`
          : `main() stores r0 = ${r0}. count = ${mem}.`;
        break;
      }
      case 'strex':
        if (monitor === 'exclusive') { mem = r0; r2 = 0; note = `STREX checks the monitor: still exclusive, since nothing has happened since LDREX. The store happens and r2 = 0 reports success. count = ${mem}.`; }
        else { r2 = 1; strexFails++; note = 'STREX checks the monitor and finds it open: an exception happened since LDREX, so count may have changed. The store does not happen, and r2 = 1 reports the failure.'; }
        monitor = 'open';
        break;
      case 'cmp':
        z = r2 === 0;
        note = `<code>cmp r2, #0</code>: r2 is ${r2}, so ${z ? 'the store succeeded' : 'the store failed'}.`;
        break;
      case 'bne':
        if (!z) { next = 0; note = '<code>bne retry</code> branches back to LDREX to redo the whole read-modify-write with a fresh value.'; }
        else note = `r2 was 0, so the loop exits. <span class="good">count = ${mem}: both increments landed.</span>`;
        break;
    }
    push({ lane: 'main', kind: 'run', pc, label: ins.op.toUpperCase(), note });
    // The UART interrupt fires as main() completes its first load.
    if ((ins.op === 'ldr' || ins.op === 'ldrex') && arrived < 0) {
      arrived = t;
      const last = segs[segs.length - 1];
      last.note += primask ? ' The UART interrupt fires now, but PRIMASK is set, so the NVIC holds it pending.' : ' The UART interrupt fires now.';
    }
    pc = next;
  }
  const end = 16;
  segs.push({ lane: 'main', t0: t, t1: end, kind: 'bg', pc: -1, mem, r0, primask, monitor,
    note: mem === 2
      ? `<span class="good">count = 2.</span> ${mode === 'irq' ? 'With interrupts masked, the handler could not run in the middle of the read-modify-write, only after it.' : 'The store-exclusive noticed the interruption and the loop retried, so no update was lost.'}`
      : `<span class="bad">count = ${mem}, not 2.</span> ${mode === 'volatile' ? 'volatile did not help: it controls whether the compiler may cache or skip an access, not whether the sequence can be interrupted.' : 'The handler’s increment was overwritten by main()’s stale result.'}` });
  return { segs, pending, mem, strexFails, end };
}

const TEXT: Record<Mode, string> = { none: 'No protection', volatile: 'volatile', irq: 'Disable interrupts', excl: 'LDREX / STREX' };

export function mountAtomics(root: HTMLElement) {
  let mode = oneOf<Mode>('m', MODES, 'none');

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Sharing data safely</p>
      <h1>Atomics and critical sections</h1>
      <p>main() and a UART interrupt handler both increment <code>count</code>. The interrupt fires just after main() has
        loaded it, the worst possible moment. Choose how main() protects its increment and step through to see whether
        both updates survive.</p>
    </section>
    ${traceHtml({ label: 'Atomic increment trace', title: 'Cortex-M4 · shared counter', cls: 'atomics',
      controls: seg('m', 'Protection', MODES.map((m) => [m, TEXT[m]])),
      side: '<div class="tr-side rc-side"><div class="rc-code" data-t="main"></div><div class="rc-code" data-t="isr"></div></div>' })}
    <section class="prose">
      <h2>Why volatile is not enough</h2>
      <p><code>volatile</code> tells the compiler that every read and write of the variable must really happen, in order,
        because something outside the code can see or change it. That is essential for hardware registers and for flags
        shared with interrupts, but it says nothing about atomicity. A volatile increment is still a load, an add and a
        store, and an interrupt can still land between them. The trace is identical to the unprotected one.</p>
      <h2>Critical sections: masking interrupts</h2>
      <p>On a single core, the simplest fix is to stop interrupts for the few instructions of the update.
        <code>__disable_irq()</code> compiles to <code>cpsid i</code>, which sets PRIMASK; an interrupt that fires while it
        is set is not lost, only held pending until <code>cpsie i</code>. Real code saves PRIMASK first and restores it
        after, so that a critical section inside another does not re-enable interrupts too early. The cost is latency:
        every interrupt waits for the longest critical section, so keep them a few instructions long.</p>
      <h2>LDREX and STREX</h2>
      <p>Cortex-M3 and up offer a way that blocks no one. <code>ldrex</code> loads a value and sets an exclusive monitor on
        its address; <code>strex</code> stores only if the monitor is still set, and reports whether it did. Anything that
        might have changed the value clears the monitor in between, including any exception, so the loop simply retries.
        This is what C11 <code>atomic_fetch_add</code> compiles to on these cores, with <a href="?p=barriers">memory barriers</a> added. Cortex-M0
        has no exclusive instructions, so there atomics fall back to masking interrupts.</p>
    </section>`;

  const st = stepper(root, (_, i) => {
    const s = run.segs[i];
    const box = (who: 'main' | 'isr') => {
      const p = who === 'main' ? PROGRAM[mode] : ISR;
      const lines = [...p.c.map((l) => ({ text: highlight(l), pc: false, g: 'C' })),
        ...(who === 'main' && mode === 'excl' ? [{ text: 'retry:', pc: false, g: '' }] : []),
        ...p.asm.map((ins, k) => ({ text: esc(ins.asm), pc: s.lane === who && s.pc === k, g: String(k + 1) }))];
      // main()'s r0 as of this step: its live value, or the value saved on the stack while the handler runs.
      const mainR0 = run.segs.slice(0, i + 1).filter((x) => x.lane === 'main').map((x) => x.r0).pop() ?? 0;
      return `<h4 style="--lane:${who === 'main' ? 'var(--ch2)' : 'var(--ch6)'}">${who === 'main' ? 'main()' : 'UART handler'} <small>${
        who === 'main' ? `r0 = ${mainR0}` : ''}</small></h4>
        <pre class="dbg-code"><code>${lines.map((l) => `<span class="ln${l.pc ? ' pc' : ''}"><span class="gutter">${l.g}</span>${l.text}</span>`).join('')}</code></pre>`;
    };
    root.querySelector('.rc-code[data-t="main"]')!.innerHTML = box('main');
    root.querySelector('.rc-code[data-t="isr"]')!.innerHTML = box('isr');
  });
  let run = atomicRun(mode);

  function load() {
    run = atomicRun(mode);
    const lanes: Lane[] = [
      { id: 'main', name: 'main()', sub: 'thread', color: 'var(--ch2)' },
      { id: 'isr', name: 'UART IRQ', sub: 'handler', color: 'var(--ch6)' },
      { id: 'mem', name: 'count', sub: 'in RAM', color: 'var(--ch4)', bus: true },
    ];
    const bars: Bar[] = run.segs.map((s) => ({ lane: s.lane, t0: s.t0, t1: s.t1, kind: s.kind, label: s.label }));
    if (run.pending) bars.push({ lane: 'isr', t0: run.pending[0], t1: run.pending[1], kind: 'ready' });
    // count over time, from the value after each segment.
    let from = 0, v = 0;
    run.segs.forEach((s) => {
      if (s.mem !== v) { bars.push({ lane: 'mem', t0: from, t1: s.t1, kind: 'value', label: String(v) }); from = s.t1; v = s.mem; }
    });
    bars.push({ lane: 'mem', t0: from, t1: run.end, kind: v === 2 ? 'value' : 'bad', label: String(v) });
    const steps: Step[] = run.segs.map((s, i) => ({ bar: i, at: s.t1, lane: s.lane, note: s.note,
      readout: [`count = <b>${s.mem}</b>`, mode === 'irq' ? `PRIMASK = <b>${s.primask}</b>` : mode === 'excl' ? `Monitor: <b>${s.monitor}</b>` : `main r0 = <b>${s.lane === 'main' ? s.r0 : '(stacked)'}</b>`,
        `CPU: <b>${s.lane === 'main' ? 'main()' : 'UART handler'}</b>`,
        ...(i === run.segs.length - 1 ? [`<span class="${s.mem === 2 ? 'good' : 'bad'}">${s.mem === 2 ? 'Both updates kept' : 'Update lost'}</span>`] : [])] }));
    st.load({ lanes, bars, marks: [{ lane: 'isr', t: run.segs.find((s) => s.note.includes('fires now'))!.t1, kind: 'fire', title: 'The UART interrupt fires' }], end: run.end, every: 2, minor: 1 }, steps);
    markSeg(root, 'm', mode);
    syncUrl({ m: mode });
  }
  load();

  root.addEventListener('click', (e) => {
    const m = (e.target as Element).closest<HTMLElement>('[data-m]');
    if (m) { mode = m.dataset.m as Mode; load(); }
  });
}
