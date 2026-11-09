/**
 * The registers page: a real two-function program, compiled by Clang for a Cortex-M0+, run one instruction at a time
 * by the same executor the Memory pages use, beside the whole register file. Click a register for what it is for.
 * The listing and the program's result are exported; verify checks them against Clang and against the C run natively.
 */
import { stepButtons, walkthrough, hex8, reservedStatus } from './dbg';
import { LR, PC, SP, run, thumb, type Cpu, type Frame, type Instr } from './inspector';

export const REG_SRC = `int scale(int x) {
    return x * 3;
}

int total(int a, int b) {
    return scale(a) + b;
}
`;

const BASE = 0x08000000;
const next = (i: Instr) => i.addr + (i.enc.includes(' ') ? 4 : 2);
const mov = (rd: number, rm: number) => (i: Instr, cpu: Cpu) => {
  cpu.r[rd] = cpu.r[rm];
  cpu.r[PC] = next(i);
  return [];
};
const addsReg = (rd: number, rn: number, rm: number) => (i: Instr, cpu: Cpu) => {
  const a = cpu.r[rn], b = cpu.r[rm], r = (a + b) >>> 0;
  cpu.n = r >>> 31;
  cpu.z = r === 0 ? 1 : 0;
  cpu.c = a + b > 0xffffffff ? 1 : 0;
  cpu.v = ((a ^ r) & (b ^ r)) >>> 31;
  cpu.r[rd] = r;
  cpu.r[PC] = next(i);
  return [];
};

/** The linked program. `bl` is 0xF7FF 0xFFF9 once the linker has filled in the distance back to scale. */
export const REG_PROGRAM: Instr[] = [
  { addr: BASE, enc: '2103', text: 'movs r1, #3', line: 1, op: thumb.movs(1, 3) },
  { addr: BASE + 2, enc: '4348', text: 'muls r0, r1, r0', line: 1, op: thumb.muls(0, 1) },
  { addr: BASE + 4, enc: '4770', text: 'bx lr', line: 1, op: thumb.bx(LR) },
  { addr: BASE + 6, enc: 'b510', text: 'push {r4, lr}', line: 5, op: thumb.push([4, LR]) },
  { addr: BASE + 8, enc: '460c', text: 'mov r4, r1', line: 5, op: mov(4, 1) },
  { addr: BASE + 10, enc: 'f7ff fff9', text: 'bl scale', line: 5, op: thumb.bl(BASE) },
  { addr: BASE + 14, enc: '1900', text: 'adds r0, r0, r4', line: 5, op: addsReg(0, 0, 4) },
  { addr: BASE + 16, enc: 'bd10', text: 'pop {r4, pc}', line: 5, op: thumb.pop([4, PC]) },
];

/** A call of total(5, 2): the caller has something of its own in r4, and returns to 0x08000100. */
export function regStart(): Cpu {
  const r = new Array(16).fill(0);
  r[0] = 5; r[1] = 2; r[4] = 0x11; r[SP] = 0x20001000; r[LR] = 0x08000101; r[PC] = BASE + 6;
  return { r, n: 0, z: 0, c: 0, v: 0, mem: new Map() };
}
export const regFrames = (): Frame[] => run(REG_PROGRAM, regStart());

const SAYS: Record<string, string> = {
  start: 'The caller has run <code>total(5, 2)</code>: the arguments are in r0 and r1, the return address in LR. r4 holds something the caller still needs.',
  'push {r4, lr}': '<code>total</code> will call another function, which overwrites LR, and it wants r4 for itself. So it saves both on the stack, and SP drops by 8.',
  'mov r4, r1': 'b has to survive the call, and r1 will not: the callee may overwrite r0 to r3. r4 is safe, because any function that uses it must put it back.',
  'bl scale': '<code>bl</code> puts the address after itself in LR, with bit 0 set to mark Thumb code, and jumps. a is already in r0, where <code>scale</code> expects it.',
  'movs r1, #3': '<code>scale</code> uses r1 freely: it is a scratch register, so it needs no saving. The <code>s</code> means the instruction also updates the flags.',
  'muls r0, r1, r0': 'r0 becomes 5 × 3. The result of a function is returned in r0, so it is already in the right place.',
  'bx lr': 'Return: jump to the address in LR. <code>scale</code> called nothing, so it never had to save LR.',
  'adds r0, r0, r4': 'Back in <code>total</code>. b is still safe in r4, and the sum goes in r0 as the return value.',
  'pop {r4, pc}': 'Two jobs in one instruction: r4 gets back the caller’s value, and the saved LR goes straight into PC, which returns. SP is back where it started.',
};

type Group = 'arg' | 'save' | 'scratch' | 'special';
const REGS: { name: string; group: Group; say: string }[] = [
  ...[0, 1, 2, 3].map((n) => ({ name: `r${n}`, group: 'arg' as Group, say: `<b>r${n}</b>: ${n === 0 ? 'the first argument, and the return value' : `argument ${n + 1}${n === 1 ? ', and the top half of a 64-bit return value' : ''}`}. A function may overwrite it, so a caller that needs it afterwards must keep a copy. Encodable by every 16-bit instruction.` })),
  ...[4, 5, 6, 7].map((n) => ({ name: `r${n}`, group: 'save' as Group, say: `<b>r${n}</b>: callee-saved. A function that uses it must restore it before returning, so its value survives any call. Encodable by every 16-bit instruction.` })),
  ...[8, 9, 10, 11].map((n) => ({ name: `r${n}`, group: 'save' as Group, say: `<b>r${n}</b>: a high register, callee-saved. Most 16-bit instructions have 3-bit register fields and cannot name it; on a Cortex-M0+ only <code>mov</code>, <code>add</code>, <code>cmp</code>, <code>bx</code> and <code>blx</code> can.${n === 9 ? ' Some platforms reserve r9.' : ''}` })),
  { name: 'r12', group: 'scratch', say: '<b>r12</b> (IP): a scratch register. It carries no argument, and a function may overwrite it. Linker-generated veneers use it for long jumps.' },
  { name: 'sp', group: 'special', say: '<b>SP</b> (r13): the stack pointer, the address of the last item pushed. The stack grows down. A Cortex-M has two, MSP and PSP; SP is whichever is active.' },
  { name: 'lr', group: 'special', say: '<b>LR</b> (r14): the link register. <code>bl</code> leaves the return address here, with bit 0 set to mark Thumb code. Interrupt entry puts a special value here instead.' },
  { name: 'pc', group: 'special', say: '<b>PC</b> (r15): the address of the instruction. An instruction that reads PC sees its own address plus 4, because of how far the fetch has run ahead.' },
];
const FLAGS = 'The flags N, Z, C and V are the top four bits of the APSR. The rest of the program status register holds the interrupt number and the Thumb state bit.';

export function mountRegisters(root: HTMLElement) {
  const frames = regFrames();
  let at = 0, pick = -1;

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Instruction set</p>
      <h1>Registers</h1>
      <p>Registers are where a processor does its work: a handful of 32-bit slots inside the core, read and written in a
        single cycle. A Cortex-M has sixteen. Their names are simple, but a set of rules decides who may change which, and
        that is what makes one function able to call another. Step through this real program, or click a register.</p>
    </section>
    <section class="debugger registers" aria-label="Registers">
      <header class="dbg-bar"><span class="dbg-file">total(5, 2)</span><div class="dbg-controls">${stepButtons()}</div></header>
      <div class="dbg-body">
        <pre class="dbg-code rg-code" aria-label="Program"><code></code></pre>
        <div class="dbg-vars"><div class="rg-grid"></div><div class="rg-foot"></div></div>
      </div>
      <p class="dbg-status" aria-live="polite"></p>
    </section>
    <section class="prose">
      <h2>Who saves what</h2>
      <p>There is one set of registers and many functions, so they need a contract. Arm’s, the AAPCS, splits the registers
        in two. r0 to r3 and r12 are <em>caller-saved</em>: a function may overwrite them, so a caller that needs one
        afterwards keeps a copy. r4 to r11 are <em>callee-saved</em>: a function that wants one must save it first and
        put it back. In the program, <code>total</code> needs b after a call, so it moves it into r4 and pays for that
        by pushing r4. <code>scale</code> calls nothing and uses only r0 and r1, so it saves nothing at all. The
        <a href="?p=functions" data-nav>functions</a> page shows what compilers do with this.</p>
      <h2>Why low registers come first</h2>
      <p>A 16-bit instruction has room for 3-bit register fields, which name only r0 to r7. That is why compilers
        reach for the low registers first and why <a href="?p=instructions" data-nav>an instruction’s encoding</a> decides
        which registers it can use. r8 to r12 are real but awkward on a Cortex-M0+: only a few instructions can touch them, and
        <code>push</code> cannot list them. Thumb-2, on the Cortex-M3 and up, adds 32-bit forms with 4-bit fields.</p>
      <h2>Three special registers</h2>
      <p>SP, LR and PC are also r13, r14 and r15. Writing to PC is a jump, which is why <code>pop {r4, pc}</code> returns.
        LR holds one return address, so a function that calls another must save its own first, on the stack; a function
        that calls nothing can skip that. The flags live in a separate status register and are set by arithmetic ending
        in <code>s</code>; see <a href="?p=flags" data-nav>flags</a>.</p>
    </section>`;

  const panel = root.querySelector<HTMLElement>('.registers')!;
  const say = reservedStatus(panel, [...Object.values(SAYS), ...REGS.map((r) => r.say), FLAGS]);
  const w = walkthrough(root, { count: () => frames.length, at: () => at, go: (i) => { at = i; pick = -1; draw(); } });

  function draw() {
    const f = frames[at], prev = frames[at - 1];
    const pc = f.cpu.r[PC];
    const labels = new Map([[BASE, 'scale:'], [BASE + 6, 'total:']]);
    root.querySelector('.rg-code code')!.innerHTML = REG_PROGRAM.map((i) =>
      `${labels.has(i.addr) ? `<span class="ln lab">${labels.get(i.addr)}</span>` : ''}<span class="ln${i.addr === pc ? ' pc' : ''}"><span class="gutter">${(i.addr & 0xfff).toString(16).padStart(3, '0')}</span>    ${i.text}</span>`).join('');
    const cell = (k: number) => {
      const reg = REGS[k], v = f.cpu.r[k], was = prev?.cpu.r[k];
      return `<button type="button" class="rg-cell g-${reg.group}${prev && was !== v ? ' changed' : ''}${pick === k ? ' self' : ''}" data-reg="${k}"><b>${reg.name}</b><span>${hex8(v)}</span></button>`;
    };
    const stack = [0x20000ffc, 0x20000ff8].map((a) => {
      const live = f.cpu.mem.has(a) && a >= f.cpu.r[SP];
      return `<span class="rg-word${live ? ' live' : ''}"><i>${hex8(a)}</i><b>${live ? hex8(f.cpu.mem.get(a)!) : '·'.repeat(10)}</b></span>`;
    }).join('');
    root.querySelector('.rg-grid')!.innerHTML = REGS.map((_, k) => cell(k)).join('');
    root.querySelector('.rg-foot')!.innerHTML = `
      <div class="rg-flags" data-flags>${(['n', 'z', 'c', 'v'] as const).map((x) => `<span class="${f.cpu[x] ? 'on' : ''}">${x.toUpperCase()}</span>`).join('')}</div>
      <div class="rg-stack"><small>Stack</small>${stack}</div>`;
    const text = f.ran?.text;
    say(pick === -2 ? FLAGS : pick >= 0 ? REGS[pick].say : SAYS[text ?? 'start']);
    w.sync();
  }

  panel.addEventListener('click', (e) => {
    const t = e.target as Element;
    const c = t.closest<HTMLElement>('[data-reg]');
    if (c) { const k = Number(c.dataset.reg); pick = pick === k ? -1 : k; draw(); }
    else if (t.closest('[data-flags]')) { pick = pick === -2 ? -1 : -2; draw(); }
  });
  draw();
}
