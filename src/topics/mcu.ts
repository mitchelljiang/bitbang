/**
 * Parts and terms: the Concurrency section's starting page. A block diagram of one microcontroller on the bench glass
 * (the Cortex-M4 core with its CPU, NVIC and SysTick; Flash with the vector table; SRAM with the stack; the peripherals),
 * walked through one timer interrupt from the counter wrapping to the handler returning, so every name the later pages
 * use (TIM2, the NVIC, the vector table, stacking, SysTick, tasks) is met in place first. A glossary follows, each term
 * linking to the page that covers it.
 */
import { esc } from '../core/render';
import { concurrencyTopics } from '../concurrency';
import { memoryTopics } from '../memory';
import { IRQS } from './priorities';

export type Part = 'chip' | 'cpu' | 'nvic' | 'systick' | 'flash' | 'vectors' | 'sram' | 'stack' | 'periph' | 'tim2' | 'usart2' | 'adc' | 'gpio';

/** The Flash base on an STM32F4, where the vector table sits at reset. */
export const FLASH = 0x0800_0000;
/** Exceptions 1–15 belong to the core; interrupt n is exception 16 + n. */
export const excOf = (irqn: number) => 16 + irqn;
/** Each vector-table entry is one 32-bit address, so exception n's entry is at 4 × n. */
export const vectorAddr = (exc: number) => FLASH + 4 * exc;
export const SYSTICK_EXC = 15;
/** The 8 registers the processor stacks on entry, 4 bytes each. */
export const FRAME_BYTES = 8 * 4;
export const SP_MAIN = 0x2000_1fe0;

const irqn = (id: string) => IRQS.find((q) => q.id === id)!.irqn;
const TIM2_IRQ = irqn('tim2');
export const hex = (n: number) => `0x${n.toString(16).toUpperCase().padStart(8, '0').replace(/(....)(....)/, '$1_$2')}`;

export interface PStep { lit: Part[]; irq?: boolean; readout: string[]; note: string }

const low = (s: string) => ` <span class="pm-low">Under the hood:</span> ${s}`;

/** One interrupt, from the counter wrapping to the handler returning, then the core timer an RTOS runs on. */
export const STEPS: PStep[] = [
  {
    lit: ['chip'], readout: ['STM32F407', 'Arm Cortex-M4 core', '168 MHz'],
    note: 'A microcontroller is a whole small computer on one chip: a processor, memory for the program, memory for data, and hardware helpers called peripherals, all wired together.'
      + low('this one is an STM32F407, made by ST. ST designs the chip; Arm designs the Cortex-M4 core inside it, which is why the same core terms apply to chips from many makers.'),
  },
  {
    lit: ['cpu'], readout: [`PC = <b>${hex(0x0800_0400)}</b>`, `SP = <b>${hex(SP_MAIN)}</b>`, 'running <b>main()</b>'],
    note: 'The CPU runs your program one instruction at a time. There is only one of it, so only one thing truly runs at once; this whole section is about how that one stream gets shared.'
      + low('the CPU keeps its work in registers. PC is the address of the next instruction, SP points at the top of the stack, LR holds where a function returns to, and R0–R12 hold values being worked on.'),
  },
  {
    lit: ['flash', 'vectors'], readout: [`Flash at <b>${hex(FLASH)}</b>`, 'vector table first'],
    note: 'Flash holds the program and keeps it with the power off. It begins with the vector table: a list of addresses saying where the code for each kind of interrupt starts.'
      + low(`entry n is a 32-bit address at ${hex(FLASH)} + 4 × n. Entry 0 is the initial stack pointer, entry 1 the reset handler, and every interrupt has its own entry after the core’s first 16.`),
  },
  {
    lit: ['sram', 'stack'], readout: [`SRAM at <b>${hex(0x2000_0000)}</b>`, `SP = <b>${hex(SP_MAIN)}</b>`],
    note: 'SRAM is the working memory: variables live here while the program runs, and so does the stack, the scratch area where the CPU saves what it was doing when it is interrupted.'
      + low('the stack grows down from the top of its region. Under an RTOS each task gets a stack of its own, which is how a paused task keeps its place.'),
  },
  {
    lit: ['periph', 'tim2', 'usart2', 'adc', 'gpio'], readout: [`peripherals at <b>${hex(0x4000_0000)}</b>`],
    note: 'Peripherals do jobs alongside the CPU without running any code: a timer counts, a serial port sends and receives bytes, an ADC measures a voltage, GPIO drives and reads pins. Their names are a kind plus a number, because a chip has several of each: TIM2 is timer 2, USART2 is serial port 2.'
      + low('the program controls each one by reading and writing its registers, which sit at fixed addresses, so a peripheral register is used just like a variable.'),
  },
  {
    lit: ['tim2'], irq: true, readout: ['TIM2_CNT <b>999 → 0</b>', 'TIM2_SR.UIF = <b>1</b>'],
    note: 'TIM2 counts clock ticks. When its count reaches the limit the program set, it wraps back to 0, sets a flag that says “time’s up”, and raises its interrupt request line.'
      + low(`TIM2_CNT counts up once per (prescaler + 1) clocks. On reaching TIM2_ARR it sets UIF in TIM2_SR and, because UIE is set in TIM2_DIER, raises interrupt request ${TIM2_IRQ}.`),
  },
  {
    lit: ['nvic', 'tim2'], irq: true, readout: [`IRQ ${TIM2_IRQ} <b>pending</b>`, 'priority 2', 'running <b>main()</b>'],
    note: 'The request goes to the NVIC, the Nested Vectored Interrupt Controller: the switchboard every peripheral’s interrupt line plugs into. It marks the request pending and checks whether it is more urgent than what is running now.'
      + low('“nested” means a more urgent interrupt can interrupt a less urgent handler; “vectored” means the NVIC hands the CPU the handler’s address from the vector table, so no code has to look up who called. On a Cortex-M a lower priority number is more urgent.'),
  },
  {
    lit: ['cpu', 'stack', 'vectors'], irq: true,
    readout: [`SP = <b>${hex(SP_MAIN - FRAME_BYTES)}</b>`, `PC ← [<b>${hex(vectorAddr(excOf(TIM2_IRQ)))}</b>]`, 'running <b>TIM2_IRQHandler</b>'],
    note: 'The interrupt wins, so the CPU pauses main() after its current instruction, saves its place on the stack, and jumps to TIM2’s handler. No line of your code does this; the hardware does.'
      + low(`the processor pushes 8 registers (${FRAME_BYTES} bytes) onto the stack, then loads PC from vector-table entry ${excOf(TIM2_IRQ)} (16 + IRQ ${TIM2_IRQ}) at ${hex(vectorAddr(excOf(TIM2_IRQ)))}. This automatic save is called stacking.`),
  },
  {
    lit: ['cpu', 'tim2'], readout: ['TIM2_SR.UIF = <b>0</b>', `SP = <b>${hex(SP_MAIN)}</b>`, 'running <b>main()</b>'],
    note: 'The handler is an ordinary C function. It does its work, clears TIM2’s flag so the request goes away, and returns. The CPU restores the saved registers and main() carries on as if nothing happened.'
      + low('the return uses a special value the processor left in LR, which tells it to pop the 8 registers instead of returning normally. The Interrupts page traces this step by step.'),
  },
  {
    lit: ['systick'], readout: ['SYST_CVR <b>0 → reload</b>', `exception ${SYSTICK_EXC}`, `vector at <b>${hex(vectorAddr(SYSTICK_EXC))}</b>`],
    note: 'SysTick is a timer too, but it is built into the Arm core rather than added by the chip maker, so every Cortex-M has the same one. An RTOS uses it as its heartbeat: on every tick, often each millisecond, it decides which task should run.'
      + low(`a 24-bit counter that counts down from SYST_RVR to 0, reloads, and raises exception ${SYSTICK_EXC}, one of the core’s own, with its vector at ${hex(vectorAddr(SYSTICK_EXC))}. Its registers are at 0xE000_E010, beside the NVIC’s.`),
  },
  {
    lit: ['cpu', 'stack'], readout: ['tasks: <b>Sensor · Control · Logger</b>', 'one CPU'],
    note: 'With an RTOS, the one CPU is shared among several tasks: each is a function that runs forever with its own stack, and the scheduler switches between them so often they appear to run at once. When two of them touch the same variable, you get the bugs, and the fixes, the rest of this section is about.'
      + low('a switch saves one task’s registers on its stack and loads another’s; that is context switching, and choosing who runs next is scheduling.'),
  },
];

/** The step each part is introduced on, so clicking a part shows its explanation. */
export const firstStep = (p: Part) => STEPS.findIndex((s) => s.lit.includes(p));

export interface Term { term: string; def: string; page?: string }
/** The glossary, grouped as the section is. Each term links to the page that covers it. */
export const TERMS: { group: string; terms: Term[] }[] = [
  {
    group: 'The hardware',
    terms: [
      { term: 'Microcontroller (MCU)', def: 'A CPU, Flash, SRAM and peripherals on one chip. STM32F4 is a family of them; Cortex-M4 is the Arm processor core inside.', page: 'memmap' },
      { term: 'Register', def: 'A small named storage slot. CPU registers (R0–R12, SP, LR, PC) hold what the processor is working on; peripheral registers are addresses that control hardware.', page: 'mmio' },
      { term: 'Peripheral', def: 'Hardware on the chip that does one job without running code: timers, serial ports, ADCs, GPIO. Named by kind and number, such as TIM2 or USART2.', page: 'mmio' },
      { term: 'TIM2', def: 'General-purpose timer 2: a counter that raises an interrupt each time it reaches a set value.', page: 'priorities' },
      { term: 'USART2, ADC, GPIO', def: 'Serial port 2 (the UART); the analog-to-digital converter, which measures a voltage; general-purpose input/output pins.', page: 'priorities' },
      { term: 'SysTick', def: 'A simple timer built into every Cortex-M core, the usual heartbeat of an RTOS.', page: 'scheduling' },
      { term: 'NVIC', def: 'Nested Vectored Interrupt Controller: receives every interrupt request, holds each one’s priority, and decides which runs.', page: 'priorities' },
      { term: 'Vector table', def: 'The list of handler addresses at the start of Flash, one entry per exception.', page: 'interrupts' },
    ],
  },
  {
    group: 'Interrupts',
    terms: [
      { term: 'Interrupt, IRQ', def: 'A hardware signal that makes the CPU stop, run a handler, and come back. IRQ is short for interrupt request; the IRQ number is the line’s position on the NVIC.', page: 'interrupts' },
      { term: 'Exception', def: 'Arm’s umbrella word for anything that diverts the CPU. Exceptions 1–15 are the core’s own (Reset, HardFault, SVCall, PendSV, SysTick); interrupts are 16 and up.', page: 'interrupts' },
      { term: 'Handler, ISR', def: 'The function that runs for an interrupt, such as TIM2_IRQHandler. ISR stands for interrupt service routine.', page: 'interrupts' },
      { term: 'Priority', def: 'How urgent an interrupt is. On a Cortex-M a lower number is more urgent.', page: 'priorities' },
      { term: 'Pending', def: 'Requested but not yet running, because something at least as urgent holds the CPU.', page: 'priorities' },
      { term: 'Preemption, nesting', def: 'A more urgent interrupt interrupting a running handler, so handlers stack up inside each other.', page: 'priorities' },
      { term: 'Stacking', def: 'The processor saving 8 registers to the stack by itself on the way into a handler, and restoring them on the way out.', page: 'interrupts' },
      { term: 'Latency', def: 'The delay from an interrupt firing to its handler’s first instruction.', page: 'interrupts' },
    ],
  },
  {
    group: 'Running many tasks',
    terms: [
      { term: 'Thread of execution', def: 'Anything with its own stream of instructions: the main loop, a handler, a task. Each gets a lane in the diagrams.', page: 'interrupts' },
      { term: 'RTOS', def: 'Real-time operating system, such as FreeRTOS: a small library that gives firmware tasks, a scheduler and locks.', page: 'context' },
      { term: 'Task', def: 'A function that runs forever with its own stack, taking turns on the CPU with other tasks.', page: 'context' },
      { term: 'Context, context switch', def: 'A task’s saved registers and stack pointer; swapping one task’s context for another’s.', page: 'context' },
      { term: 'PendSV', def: 'A core exception an RTOS triggers on purpose to do a context switch at the lowest priority.', page: 'context' },
      { term: 'Scheduler, tick', def: 'The code that picks which ready task runs next, usually woken by SysTick each tick.', page: 'scheduling' },
      { term: 'Deadline', def: 'The time by which a task’s work must be done.', page: 'scheduling' },
    ],
  },
  {
    group: 'Sharing data safely',
    terms: [
      { term: 'Race condition', def: 'A bug where the result depends on who happens to run first, such as two tasks adding to one counter and losing an update.', page: 'races' },
      { term: 'Atomic', def: 'Done as one indivisible step, so nothing can run in the middle of it.', page: 'atomics' },
      { term: 'Critical section', def: 'Code that must not be interrupted partway, often protected by briefly disabling interrupts.', page: 'atomics' },
      { term: 'volatile', def: 'A C keyword telling the compiler to really read or write memory each time. It does not make anything atomic.', page: 'atomics' },
      { term: 'Memory barrier', def: 'An instruction (DMB, DSB, ISB) that makes earlier memory accesses finish, or be seen, before later ones.', page: 'barriers' },
      { term: 'Mutex, semaphore', def: 'A lock one task holds while using something shared; a counter tasks use to signal each other.', page: 'locks' },
      { term: 'Priority inversion', def: 'An urgent task stuck waiting on a lock held by a less urgent one.', page: 'locks' },
    ],
  },
];

const pageName = (id: string) => [...concurrencyTopics, ...memoryTopics].flatMap((c) => c.entries).find((e) => e.id === id)?.name ?? id;

export function mountMcu(root: HTMLElement) {
  const part = (p: Part, name: string, sub: string, tag?: string) =>
    `<button type="button" class="pm-part pm-p-${p}" data-part="${p}"><span class="pm-head"><b>${esc(name)}</b>${
      tag ? `<i class="pm-irq">${esc(tag)}</i>` : ''}</span><small>${esc(sub)}</small></button>`;

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Start here</p>
      <h1>Parts and terms</h1>
      <p>The pages in this section talk about TIM2, SysTick, the NVIC, stacking and tasks. They are all parts of one chip,
        doing one job each. Step through below to meet every part in place, by following a single timer interrupt from the
        moment it fires to the moment the program carries on. Each step gives the plain idea first, then what happens
        underneath. Click any part to jump to it.</p>
    </section>
    <section class="trace mcu" aria-label="Microcontroller block diagram">
      <header class="tr-bar">
        <span class="tr-title">STM32F407 · one interrupt</span>
        <div class="tr-controls">
          <button type="button" class="tr-btn" data-act="back">Back</button>
          <button type="button" class="tr-btn primary" data-act="step">Step</button>
          <button type="button" class="tr-btn" data-act="play">Play</button>
          <button type="button" class="tr-btn" data-act="restart">Restart</button>
        </div>
      </header>
      <div class="tr-screen">
        <div class="tr-readout"></div>
        <div class="pm-chip" data-part-box="chip">
          <span class="pm-chip-name">STM32F407 chip</span>
          <div class="pm-blk pm-core">
            <span class="pm-blk-name">Cortex-M4 core</span>
            ${part('cpu', 'CPU', 'runs instructions · R0–R12, SP, LR, PC')}
            ${part('nvic', 'NVIC', 'interrupt controller · priorities', `IRQ ${TIM2_IRQ}`)}
            ${part('systick', 'SysTick', 'core timer · RTOS tick')}
          </div>
          <div class="pm-blk pm-flash">
            ${part('flash', 'Flash', hex(FLASH))}
            ${part('vectors', 'Vector table', 'handler addresses')}
          </div>
          <div class="pm-blk pm-sram">
            ${part('sram', 'SRAM', hex(0x2000_0000))}
            ${part('stack', 'Stack', 'saved registers')}
          </div>
          <div class="pm-blk pm-periph">
            ${part('periph', 'Peripherals', hex(0x4000_0000))}
            <div class="pm-row">
              ${part('tim2', 'TIM2', 'timer', `IRQ ${TIM2_IRQ}`)}
              ${part('usart2', 'USART2', 'serial port', `IRQ ${irqn('usart2')}`)}
              ${part('adc', 'ADC', 'voltage', `IRQ ${irqn('adc')}`)}
              ${part('gpio', 'GPIOA', 'pins')}
            </div>
          </div>
        </div>
      </div>
      <p class="tr-status" aria-live="polite"></p>
    </section>
    <section class="prose pm-glossary">
      <h2>How to read the Concurrency diagrams</h2>
      <p>The other pages draw time left to right, like a logic analyzer. Each row, or lane, is one thread of execution: the
        main loop, an interrupt handler, or a task. A bright bar means that lane holds the CPU; a hatched bar is the
        processor saving or restoring registers; a dashed outline is a task that is ready but waiting, and a coral one is a
        task blocked on a lock. A small arrow above a lane is an event arriving, and the gold line is the current moment.</p>
      ${TERMS.map((g) => `
      <h2>${esc(g.group)}</h2>
      <ul class="pm-terms">${g.terms.map((t) =>
        `<li><b>${esc(t.term)}<span class="pm-sep">:</span></b> ${esc(t.def)}${
          t.page ? ` Covered in <a href="?p=${t.page}" data-nav>${esc(pageName(t.page))}</a>.` : ''}</li>`).join('')}</ul>`).join('')}
    </section>`;

  let at = 0;
  let timer: number | undefined;
  const panel = root.querySelector('.trace')!;
  const btn = (a: string) => root.querySelector<HTMLButtonElement>(`[data-act="${a}"]`)!;

  function draw() {
    const s = STEPS[at];
    root.querySelectorAll<HTMLElement>('.pm-part').forEach((e) => e.classList.toggle('lit', s.lit.includes(e.dataset.part as Part)));
    root.querySelector('.pm-chip')!.classList.toggle('lit', s.lit.includes('chip'));
    root.querySelectorAll('.pm-irq').forEach((e) => e.classList.toggle('on', !!s.irq && !!e.closest('.pm-p-tim2, .pm-p-nvic')));
    root.querySelector('.tr-readout')!.innerHTML = s.readout.map((r) => `<span>${r}</span>`).join('');
    root.querySelector('.tr-status')!.innerHTML = `<b>Step ${at + 1} of ${STEPS.length}.</b> ${s.note}`;
    btn('back').disabled = at === 0;
    btn('step').disabled = at === STEPS.length - 1;
  }
  const go = (i: number) => { at = Math.max(0, Math.min(STEPS.length - 1, i)); draw(); };
  const stop = () => {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
    btn('play').textContent = 'Play';
  };
  // The same pacing as the trace pages: a base time plus reading time for the text.
  const dwell = () => Math.min(9000, 1600 + STEPS[at].note.replace(/<[^>]+>/g, '').length * 42);
  const tick = () => {
    if (at >= STEPS.length - 1 || !panel.isConnected) return stop();
    go(at + 1);
    timer = window.setTimeout(tick, dwell());
  };

  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    const p = t.closest<HTMLElement>('.pm-part')?.dataset.part as Part | undefined;
    if (p) { stop(); go(firstStep(p)); return; }
    const act = t.closest<HTMLElement>('.trace [data-act]')?.dataset.act;
    if (act === 'step') { stop(); go(at + 1); }
    else if (act === 'back') { stop(); go(at - 1); }
    else if (act === 'restart') { stop(); go(0); }
    else if (act === 'play') {
      if (timer !== undefined) return stop();
      if (at === STEPS.length - 1) go(0);
      btn('play').textContent = 'Pause';
      timer = window.setTimeout(tick, dwell());
    }
  });
  panel.addEventListener('keydown', (e) => {
    const k = (e as KeyboardEvent).key;
    if (k === 'ArrowRight' || k === 'ArrowLeft') { e.preventDefault(); stop(); go(at + (k === 'ArrowRight' ? 1 : -1)); }
  });
  draw();
}
