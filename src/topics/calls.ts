/**
 * Function calls: main() calling square(5) on a Cortex-M4, one instruction at a time. The machine code
 * is what Clang emits for the C shown, at -O1 for thumbv7em; the checks assemble it to confirm every encoding.
 */
import { esc } from '../core/render';
import { highlight } from './dbg';
import { LR, PC, SP, addr, diagramHtml, drawRegs, hex8, run, showTransfers, thumb, transfers, type Cpu, type Instr } from './inspector';

export const SOURCE = [
  'int square(int x)',
  '{',
  '    return x * x;',
  '}',
  '',
  'int main(void)',
  '{',
  '    int y = square(5);',
  '    return y + 1;',
  '}',
];

const SQUARE = 0x080001a0;
const MAIN = 0x080001a4;
/** Where main returns to: the instruction after Reset_Handler's call to main. */
const BACK = 0x08000214;
const TOP = 0x20020000;

/** The two functions as compiled, with what each instruction is for. Exported for the checks. */
export const PROGRAM: (Instr & { note: string })[] = [
  { addr: SQUARE, enc: '4340', text: 'muls r0, r0, r0', line: 2, note: 'r0 = x * x', op: thumb.muls(0, 0) },
  { addr: SQUARE + 2, enc: '4770', text: 'bx lr', line: 2, note: 'return to the caller', op: thumb.bx(LR) },
  { addr: MAIN, enc: 'b580', text: 'push {r7, lr}', line: 6, note: 'save r7 and the return address', op: thumb.push([7, LR]) },
  { addr: MAIN + 2, enc: '2005', text: 'movs r0, #5', line: 7, note: 'the argument goes in r0', op: thumb.movs(0, 5) },
  { addr: MAIN + 4, enc: 'f7ff fffa', text: 'bl square', line: 7, note: 'call: LR = return address', op: thumb.bl(SQUARE) },
  { addr: MAIN + 8, enc: '3001', text: 'adds r0, #1', line: 8, note: 'y + 1, returned in r0', op: thumb.adds(0, 1) },
  { addr: MAIN + 10, enc: 'bd80', text: 'pop {r7, pc}', line: 9, note: 'restore r7, return through PC', op: thumb.pop([7, PC]) },
];

/** Registers as they are when Reset_Handler has just called main. */
export const START: Cpu = (() => {
  const r = Array<number>(16).fill(0);
  r[SP] = TOP;
  r[LR] = BACK | 1;
  r[PC] = MAIN;
  return { r, n: 0, z: 0, c: 0, v: 0, mem: new Map() };
})();

/** The stack words shown in the memory window, highest address first, as the stack grows down the screen. */
const WORDS = [TOP - 4, TOP - 8, TOP - 12, TOP - 16];
const SAVED: Record<number, string> = { [TOP - 4]: 'LR saved by main', [TOP - 8]: 'r7 saved by main' };

const SHOWN: [string, number][] = [['r0', 0], ['r7', 7], ['sp', SP], ['lr', LR], ['pc', PC]];

/** What each step did, from the state before and after it. */
function say(ran: Instr | undefined, cpu: Cpu) {
  if (!ran) {
    return `Reset_Handler has just called main(). PC holds main’s first instruction, LR holds the address to return to, ${hex8(cpu.r[LR])}, and SP points just past the end of SRAM: the stack is empty, and it grows down.`;
  }
  switch (ran.text) {
    case 'push {r7, lr}':
      return `push {r7, lr}: SP moves down 8 bytes, to ${hex8(cpu.r[SP])}, and r7 and LR are written there. main has to save LR because its own call to square will overwrite it. Pushing r7 as well keeps SP a multiple of 8, which the Arm calling convention requires at every call.`;
    case 'movs r0, #5':
      return 'movs r0, #5: the first argument goes in r0, as the calling convention says. The s means it also sets the N and Z flags from the result.';
    case 'bl square':
      return `bl square: LR gets the address of the next instruction, ${hex8(cpu.r[LR])} (bit 0 is set to mark Thumb code), and PC jumps to square. Nothing is written to memory: the return address lives in a register.`;
    case 'muls r0, r0, r0':
      return `muls r0, r0, r0: square computes x × x = ${cpu.r[0]} in r0, which is also where a function returns its result. square calls nothing, so it never saves LR or touches the stack: it is a leaf function.`;
    case 'bx lr':
      return `bx lr: PC takes the value in LR, with bit 0 cleared, ${hex8(cpu.r[PC])}: back to the instruction after the bl in main.`;
    case 'adds r0, #1':
      return `adds r0, #1: y + 1 = ${cpu.r[0]}, computed in r0, where main returns it.`;
    default:
      return `pop {r7, pc}: r7 gets its saved value back, and the saved LR is loaded straight into PC, returning to Reset_Handler at ${hex8(cpu.r[PC])}. SP moves back up to ${hex8(cpu.r[SP])}. The two words are still in SRAM, but they are above SP now, free for the next call to overwrite.`;
  }
}

export function mountCalls(root: HTMLElement) {
  const frames = run(PROGRAM, START);
  let at = 0;

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">The stack</p>
      <h1>Function calls</h1>
      <p>A call has to pass its arguments, jump to the function, and leave a way back. On a Cortex-M, <code>bl</code>
        puts the return address in a register, LR, the arguments and the result travel in r0 to r3, and a function that
        calls another saves LR on the stack first. Step through main() calling square(5), and follow each instruction from
        Flash into the core, and each saved register across the bus into SRAM.</p>
    </section>
    ${diagramHtml({
      chip: 'STM32F407',
      core: 'Cortex-M4',
      label: 'Block diagram of the microcontroller',
      controls: `<button type="button" class="dg-btn" data-act="back">Back</button>
        <button type="button" class="dg-btn primary" data-act="step">Step</button>
        <button type="button" class="dg-btn" data-act="restart">Restart</button>`,
    })}
    <section class="prose">
      <h2>The calling convention</h2>
      <p>The Arm Procedure Call Standard (AAPCS) is the agreement that lets separately compiled functions call each
        other. The first four arguments go in r0 to r3, the result comes back in r0, and a function may overwrite r0 to
        r3 and r12 freely. r4 to r11 belong to the caller, so a function that uses them saves them first and restores
        them before returning. SP must be a multiple of 8 at every public call.</p>
    </section>`;

  const step = (to: number) => {
    const before = at;
    at = Math.max(0, Math.min(frames.length - 1, to));
    // Only a step forward sends traffic along the bus; going back just shows the earlier state.
    draw(at === before + 1);
  };

  function draw(animate = false) {
    const f = frames[at];
    const prev = at > 0 ? frames[at - 1].cpu : null;
    const cpu = f.cpu;
    const pc = cpu.r[PC];
    const current = PROGRAM.find((p) => p.addr === pc);

    root.querySelector('.dg-src code')!.innerHTML = SOURCE.map((l, n) =>
      `<span class="ln${current?.line === n ? ' pc' : ''}"><span class="gutter">${n + 1}</span>${highlight(l) || ' '}</span>`).join('');
    root.querySelector('.asm-list')!.innerHTML = PROGRAM.map((p) => {
      const label = p.addr === SQUARE ? 'square:' : p.addr === MAIN ? 'main:' : '';
      return (label ? `<div class="asm-label" role="row">${label}</div>` : '') +
        `<div class="asm${p.addr === pc ? ' pc' : ''}" role="row"><span class="a-addr">${addr(p.addr).slice(-4)}</span>` +
        `<span class="a-enc">${p.enc}</span><span class="a-text">${esc(p.text)}</span><span class="a-note">${esc(p.note)}</span></div>`;
    }).join('') + `<div class="asm${current ? ' ghost' : ' pc'}" role="row"><span class="a-addr">${current ? '0000' : addr(pc).slice(-4)}</span><span class="a-enc"></span><span class="a-text">…</span><span class="a-note">back in Reset_Handler</span></div>`;

    drawRegs(root, cpu, prev, SHOWN);
    root.querySelector('.exec')!.innerHTML = f.ran ? `Executed <code>${esc(f.ran.text)}</code>` : 'Ready to run main()';

    const sp = cpu.r[SP];
    root.querySelector('.mem')!.innerHTML = `<div class="m-row edge" role="row"><span class="m-addr">${addr(TOP).slice(-4)}</span><span class="m-val">top of SRAM</span><span class="m-note">grows down</span>${sp === TOP ? '<b class="pin">SP</b>' : '<span></span>'}</div>` +
      WORDS.map((a) => {
        const v = cpu.mem.get(a);
        const live = a >= sp;
        const touched = f.access.find((x) => x.addr === a);
        const cls = ['m-row', live && v !== undefined ? 'live' : '', v !== undefined && !live ? 'stale' : '', touched ? touched.kind : ''].filter(Boolean).join(' ');
        const note = v === undefined ? 'not written yet' : live ? SAVED[a] : `${SAVED[a]}, now free`;
        return `<div class="${cls}" role="row"><span class="m-addr">${addr(a).slice(-4)}</span><span class="m-val">${v === undefined ? '········' : hex8(v)}</span>` +
          `<span class="m-note">${esc(note)}</span>${a === sp ? '<b class="pin">SP</b>' : '<span></span>'}</div>`;
      }).join('');

    root.querySelector('.dg-status')!.textContent = `Step ${at} of ${frames.length - 1}. ${say(f.ran, cpu)}`;
    root.querySelector('.dg-state')!.textContent = at === frames.length - 1 ? 'Returned' : 'Halted';
    root.querySelector<HTMLButtonElement>('[data-act="back"]')!.disabled = at === 0;
    root.querySelector<HTMLButtonElement>('[data-act="step"]')!.disabled = at === frames.length - 1;
    void showTransfers(root, transfers(f.ran, f.access), animate);
  }

  root.addEventListener('click', (e) => {
    const act = (e.target as Element).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'step') step(at + 1);
    else if (act === 'back') step(at - 1);
    else if (act === 'restart') step(0);
  });
  root.querySelector('.diagram')!.addEventListener('keydown', (e) => {
    const k = (e as KeyboardEvent).key;
    if (k === 'ArrowRight' || k === 'ArrowLeft') {
      e.preventDefault();
      step(at + (k === 'ArrowRight' ? 1 : -1));
    }
  });
  draw();
}
