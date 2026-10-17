/**
 * The Memory pages draw the microcontroller as a datasheet block diagram: the core with its registers, Flash with the
 * machine code, SRAM, and the bus between them. A tiny Cortex-M (Thumb) executor steps the program, so every value on
 * screen comes from running it.
 */
import { esc } from '../core/render';

// ---- the processor ----

export const SP = 13;
export const LR = 14;
export const PC = 15;

export interface Cpu {
  r: number[];
  n: number;
  z: number;
  c: number;
  v: number;
  /** Words of memory that have been written, by address. */
  mem: Map<number, number>;
}

/** What an instruction touched in memory, for the memory map and the memory window. */
export interface Access {
  kind: 'read' | 'write';
  addr: number;
  value: number;
}

/** One instruction: where it is, its encoding as the assembler emits it, its text, and what it does. */
export interface Instr {
  addr: number;
  /** Halfwords, as an Arm disassembler prints them: "b580", or "f7ff fffa" for a 32-bit instruction. */
  enc: string;
  text: string;
  /** The C source line it was compiled from, counted from 0. */
  line: number;
  op(i: Instr, cpu: Cpu): Access[];
}

const u32 = (v: number) => v >>> 0;
const nz = (cpu: Cpu, v: number) => {
  cpu.n = (v >>> 31) & 1;
  cpu.z = v === 0 ? 1 : 0;
};
const size = (i: Instr) => (i.enc.includes(' ') ? 4 : 2);
const next = (i: Instr) => i.addr + size(i);

/** The instructions the pages use, each executed the way a Cortex-M does it. */
export const thumb = {
  movs: (rd: number, imm: number) => (i: Instr, cpu: Cpu): Access[] => {
    cpu.r[rd] = imm;
    nz(cpu, imm);
    cpu.r[PC] = next(i);
    return [];
  },
  adds: (rd: number, imm: number) => (i: Instr, cpu: Cpu): Access[] => {
    const a = cpu.r[rd];
    const r = u32(a + imm);
    nz(cpu, r);
    cpu.c = a + imm > 0xffffffff ? 1 : 0;
    cpu.v = ((a ^ r) & (imm ^ r)) >>> 31;
    cpu.r[rd] = r;
    cpu.r[PC] = next(i);
    return [];
  },
  muls: (rd: number, rm: number) => (i: Instr, cpu: Cpu): Access[] => {
    const r = u32(Math.imul(cpu.r[rd], cpu.r[rm]));
    nz(cpu, r);
    cpu.r[rd] = r;
    cpu.r[PC] = next(i);
    return [];
  },
  /** Branch with link: the return address, with bit 0 set for Thumb, goes in LR. */
  bl: (target: number) => (i: Instr, cpu: Cpu): Access[] => {
    cpu.r[LR] = next(i) | 1;
    cpu.r[PC] = target;
    return [];
  },
  bx: (rm: number) => (_: Instr, cpu: Cpu): Access[] => {
    cpu.r[PC] = cpu.r[rm] & ~1;
    return [];
  },
  /** The lowest-numbered register goes to the lowest address, and SP ends at the last one written. */
  push: (regs: number[]) => (i: Instr, cpu: Cpu): Access[] => {
    const sp = cpu.r[SP] - 4 * regs.length;
    const out = regs.map((reg, k) => ({ kind: 'write' as const, addr: sp + 4 * k, value: cpu.r[reg] }));
    for (const a of out) cpu.mem.set(a.addr, a.value);
    cpu.r[SP] = sp;
    cpu.r[PC] = next(i);
    return out;
  },
  /** Popping into PC returns: bit 0 of the loaded value only marks Thumb code and is cleared. */
  pop: (regs: number[]) => (i: Instr, cpu: Cpu): Access[] => {
    const sp = cpu.r[SP];
    const out = regs.map((_, k) => ({ kind: 'read' as const, addr: sp + 4 * k, value: cpu.mem.get(sp + 4 * k) ?? 0 }));
    cpu.r[PC] = next(i);
    regs.forEach((reg, k) => (cpu.r[reg] = reg === PC ? out[k].value & ~1 : out[k].value));
    cpu.r[SP] = sp + 4 * regs.length;
    return out;
  },
};

export interface Frame {
  cpu: Cpu;
  /** The instruction that just ran (undefined for the starting state), and what it touched. */
  ran?: Instr;
  access: Access[];
}

const copy = (c: Cpu): Cpu => ({ ...c, r: [...c.r], mem: new Map(c.mem) });

/** Runs the program from `start` until PC leaves it, keeping every state. Exported for the checks. */
export function run(program: Instr[], start: Cpu): Frame[] {
  const frames: Frame[] = [{ cpu: copy(start), access: [] }];
  for (let guard = 0; guard < 100; guard++) {
    const cpu = copy(frames[frames.length - 1].cpu);
    const ins = program.find((p) => p.addr === cpu.r[PC]);
    if (!ins) break;
    const access = ins.op(ins, cpu);
    frames.push({ cpu, ran: ins, access });
  }
  return frames;
}

// ---- drawing: the chip as a datasheet block diagram ----

export const hex8 = (v: number) => '0x' + u32(v).toString(16).toUpperCase().padStart(8, '0');
/** An address the way datasheets print it, with a gap between the halves: 0x2001_FFF8. */
export const addr = (v: number) => {
  const h = u32(v).toString(16).toUpperCase().padStart(8, '0');
  return `0x${h.slice(0, 4)}_${h.slice(4)}`;
};

/** The blocks on the bus. Each page fills the core, Flash and SRAM blocks; the others show what lives there. */
export type Block = 'core' | 'flash' | 'sram' | 'periph' | 'system';

/**
 * The diagram: the chip outline with the core and Flash above the bus and SRAM, peripherals and the system block
 * below it, then the C source beside the explanation.
 */
export function diagramHtml(o: { chip: string; core: string; label: string; controls: string }) {
  const block = (b: Block, name: string, range: string, body: string) =>
    `<div class="blk ${b}" data-blk="${b}"><h3><span>${esc(name)}</span><small>${esc(range)}</small></h3>${body}</div>`;
  return `
    <section class="diagram" aria-label="${esc(o.label)}">
      <div class="dg-bar">
        <span class="dg-state" aria-live="off">Halted</span>
        <div class="dg-controls">${o.controls}</div>
      </div>
      <div class="chip-outline">
        <span class="chip-name">${esc(o.chip)}</span>
        <div class="dg-row upper">
          ${block('core', o.core, 'processor', '<dl class="regs"></dl><p class="exec"></p>')}
          ${block('flash', 'Flash', '0x0800_0000, 1 MB', '<div class="asm-list" role="table" aria-label="Machine code in Flash"></div>')}
        </div>
        <div class="bus" aria-hidden="true"><span class="bus-name">AHB bus matrix</span></div>
        <i class="packet" aria-hidden="true"></i>
        <div class="dg-row lower">
          ${block('sram', 'SRAM', '0x2000_0000, 128 KB', '<div class="mem" role="table" aria-label="Stack in SRAM"></div>')}
          ${block('periph', 'Peripherals', '0x4000_0000', '<p class="idle">GPIO, UART, SPI, timers: their control registers live here.</p>')}
          ${block('system', 'System', '0xE000_0000', '<p class="idle">NVIC, SysTick and debug, inside the Cortex-M core.</p>')}
        </div>
      </div>
      <p class="bus-log" aria-live="polite"></p>
    </section>
    <div class="dg-under">
      <div class="dg-src"><h3>C source</h3><pre><code></code></pre></div>
      <p class="dg-status" aria-live="polite"></p>
    </div>`;
}

/** Which block an address belongs to. */
export const blockOf = (a: number): Block =>
  a >= 0xe0000000 ? 'system' : a >= 0x40000000 ? 'periph' : a >= 0x20000000 ? 'sram' : 'flash';

/** The registers, with the ones this step changed highlighted. */
export function drawRegs(root: HTMLElement, cpu: Cpu, prev: Cpu | null, shown: [string, number][]) {
  const flags = ['N', 'Z', 'C', 'V'].map((f) => `<span class="${cpu[f.toLowerCase() as 'n'] ? 'on' : ''}">${f}</span>`).join('');
  const flagsChanged = prev !== null && (['n', 'z', 'c', 'v'] as const).some((f) => prev[f] !== cpu[f]);
  root.querySelector('.regs')!.innerHTML = shown.map(([name, k]) => {
    const changed = prev !== null && prev.r[k] !== cpu.r[k];
    return `<div class="${changed ? 'changed' : ''}"><dt>${name}</dt><dd>${hex8(cpu.r[k])}</dd></div>`;
  }).join('') + `<div class="${flagsChanged ? 'changed' : ''}"><dt>APSR</dt><dd class="flags">${flags}</dd></div>`;
}

/** One transfer on the bus: an instruction fetch, or a data read or write, between the core and a memory block. */
export interface Transfer {
  from: Block;
  to: Block;
  text: string;
}

/** The transfers a step made: the fetch of the instruction, then its data accesses. */
export function transfers(ran: Instr | undefined, access: Access[]): Transfer[] {
  if (!ran) return [];
  const out: Transfer[] = [{ from: 'flash', to: 'core', text: `fetch ${addr(ran.addr)}: ${ran.enc}` }];
  for (const a of access) {
    out.push(a.kind === 'write'
      ? { from: 'core', to: blockOf(a.addr), text: `write ${addr(a.addr)} ← ${hex8(a.value)}` }
      : { from: blockOf(a.addr), to: 'core', text: `read ${addr(a.addr)} → ${hex8(a.value)}` });
  }
  return out;
}

let flight: Animation | null = null;
const watched = new WeakSet<HTMLElement>();

/**
 * One junction dot on the bus line for each place a block connects, measured from the blocks so the dots sit exactly
 * on the line. Blocks stacked in the same column share a dot, which is lit when either of them was used.
 */
function drawJunctions(root: HTMLElement) {
  const bus = root.querySelector<HTMLElement>('.bus');
  if (!bus || getComputedStyle(bus).display === 'none') return;
  const left = bus.getBoundingClientRect().left;
  const points = new Map<number, boolean>();
  root.querySelectorAll<HTMLElement>('.blk').forEach((b) => {
    const r = b.getBoundingClientRect();
    const x = Math.round(r.left + r.width / 2 - left);
    points.set(x, (points.get(x) ?? false) || b.classList.contains('used'));
  });
  bus.querySelectorAll('.jn').forEach((j) => j.remove());
  for (const [x, on] of points) {
    bus.append(Object.assign(document.createElement('i'), { className: `jn${on ? ' on' : ''}`, style: `left: ${x}px` }));
  }
  // Keep them in place when the diagram changes width.
  if (!watched.has(root)) {
    watched.add(root);
    new ResizeObserver(() => drawJunctions(root)).observe(bus);
  }
}

/**
 * Lights the blocks a step used and sends a packet along the bus for each transfer, one after another. Readers who
 * prefer less motion see the lit blocks and the log without the packet.
 */
export async function showTransfers(root: HTMLElement, list: Transfer[], animate: boolean) {
  root.querySelectorAll('.blk').forEach((b) => b.classList.remove('src', 'dst', 'used'));
  for (const t of list) {
    root.querySelector(`[data-blk="${t.from}"]`)!.classList.add('used');
    root.querySelector(`[data-blk="${t.to}"]`)!.classList.add('used');
  }
  drawJunctions(root);
  root.querySelector('.bus-log')!.innerHTML = list.length
    ? list.map((t) => `<span class="${t.text.startsWith('fetch') ? 'fetch' : 'data'}">${esc(t.text)}</span>`).join('')
    : '<span>No bus traffic yet.</span>';
  flight?.cancel();
  const bus = root.querySelector<HTMLElement>('.bus')!;
  const packet = root.querySelector<HTMLElement>('.packet')!;
  packet.style.opacity = '0';
  if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches || getComputedStyle(bus).display === 'none') return;
  // Positions inside the chip outline: each block's connection point on its edge facing the bus, and the bus itself.
  // The packet is positioned inside the outline's border, so measure from there.
  const box = root.querySelector<HTMLElement>('.chip-outline')!;
  const edge = box.getBoundingClientRect();
  const outline = { left: edge.left + box.clientLeft, top: edge.top + box.clientTop };
  const lane = bus.getBoundingClientRect();
  const busY = lane.top + lane.height / 2 - outline.top;
  const port = (b: Block) => {
    const el = root.querySelector<HTMLElement>(`[data-blk="${b}"]`)!;
    const r = el.getBoundingClientRect();
    const upper = el.closest('.upper') !== null;
    return { x: r.left + r.width / 2 - outline.left, y: (upper ? r.bottom : r.top) - outline.top };
  };
  const at = (p: { x: number; y: number }) => `translate(${p.x}px, ${p.y}px)`;
  for (const t of list) {
    const from = root.querySelector(`[data-blk="${t.from}"]`)!;
    const to = root.querySelector(`[data-blk="${t.to}"]`)!;
    from.classList.add('src');
    to.classList.add('dst');
    packet.classList.toggle('fetch', t.text.startsWith('fetch'));
    const a = port(t.from);
    const b = port(t.to);
    // Out of the source block, onto the bus, along it, and up or down into the target block.
    flight = packet.animate([
      { transform: at(a), opacity: 0 },
      { transform: at({ x: a.x, y: busY }), opacity: 1, offset: 0.25 },
      { transform: at({ x: b.x, y: busY }), opacity: 1, offset: 0.75 },
      { transform: at(b), opacity: 0 },
    ], { duration: 560, easing: 'linear' });
    try {
      await flight.finished;
    } catch {
      return; // a newer step took over
    }
    from.classList.remove('src');
    to.classList.remove('dst');
  }
}
