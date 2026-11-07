/**
 * Overview: a section's "Start here" page. It says what the section answers, what to read first, how to read the
 * section's diagrams and the words it uses, and draws the route through its pages, built from the section's sidebar
 * groups so a page that goes live appears here too. One function serves every section; `OVERVIEWS` holds the text.
 */
import { esc } from '../core/render';
import { areas } from '../nav';
import { statusOf } from '../search';

interface Term { term: string; def: string; page?: string }
interface Overview {
  intro: string;
  /** Pages from other sections to read first, and why. */
  before: { page: string; why: string }[];
  /** What the panels in this section look like and how to work them. */
  read: string;
  terms: Term[];
}

export const OVERVIEWS: Record<string, Overview> = {
  bits: {
    intro: `Everything a microcontroller handles, from a sensor reading to an instruction, is stored as bits. This
      section shows how a pattern of bits becomes a number, whole or fractional, signed or not; how firmware changes a
      few bits at a time without touching the rest; and how a receiver checks that no bit was flipped on the way.`,
    before: [],
    read: `Each panel shows a value as a row of bits, the most significant on the left. Click a bit to flip it, and the
      value in every other form, decimal, hex or signed, follows. Bits that just changed are outlined, and hovering
      a bit says what it is worth.`,
    terms: [
      { term: 'Bit', def: 'One binary digit, 0 or 1.', page: 'binary' },
      { term: 'Byte', def: 'Eight bits. Memory addresses count bytes.', page: 'binary' },
      { term: 'Word', def: '32 bits on a Cortex-M: the width of a register.', page: 'binary' },
      { term: 'Hex digit', def: 'Four bits written as one digit, 0 to 9 then A to F, so 0xB2 is the byte 1011 0010.', page: 'binary' },
      { term: 'MSB and LSB', def: 'The most and least significant bits: the one with the highest place value, drawn on the left, and the one with the lowest.', page: 'binary' },
      { term: 'Signed', def: 'A value whose top bit counts as negative, in two’s complement.', page: 'twos' },
      { term: 'Mask', def: 'A value whose 1 bits pick which bits an operation touches.', page: 'masks' },
      { term: 'Endianness', def: 'Which byte of a multi-byte value comes first in memory. Arm microcontrollers are almost always little-endian.', page: 'endianness' },
      { term: 'CRC', def: 'A check value computed from the data, which the receiver computes again to detect flipped bits.', page: 'crc' },
    ],
  },
  architecture: {
    intro: `A processor does one small thing over and over: read an instruction from memory, work out what it says, and
      do it. This section looks at that loop from the inside: how an instruction is encoded in bits, which registers it
      works on, how a load or store finds its address, and how the pipeline keeps several instructions in flight at
      once.`,
    before: [
      { page: 'binary', why: 'an instruction is a few bit fields, written in hex' },
      { page: 'twos', why: 'branch offsets and many constants are signed' },
      { page: 'endianness', why: 'an instruction’s bytes are stored low byte first' },
      { page: 'flags', why: 'Arm’s conditional branches test the N, Z, C and V flags' },
    ],
    read: `Instructions are drawn as their bits, split into fields with the field’s name above and its meaning below.
      Bits with a dashed outline are the opcode and stay fixed; click any other bit to change the operand, and the
      assembly, hex and bytes in memory follow. The switch at the top picks the instruction set.`,
    terms: [
      { term: 'Instruction set', def: 'The instructions a processor understands and how each one is encoded. Arm Thumb, RISC-V and Xtensa are three.', page: 'instructions' },
      { term: 'Opcode', def: 'The fixed bits that say which instruction this is.', page: 'instructions' },
      { term: 'Operand', def: 'What an instruction works on: a register, a constant or an address.', page: 'instructions' },
      { term: 'Immediate', def: 'A constant stored inside the instruction itself.', page: 'instructions' },
      { term: 'Register', def: 'One of a small set of 32-bit slots inside the CPU, where values are worked on. A Cortex-M has r0 to r12, SP, LR and PC.', page: 'registers' },
      { term: 'PC', def: 'The program counter: the address of the instruction being run.', page: 'registers' },
      { term: 'Flags', def: 'Status bits (N, Z, C and V on Arm) set by arithmetic and tested by conditional branches.', page: 'flags' },
      { term: 'Pipeline', def: 'Fetch, decode and execute in overlapping stages, so a new instruction can start every cycle.', page: 'pipeline' },
    ],
  },
  memory: {
    intro: `On a microcontroller the program, its variables and every hardware register share one range of addresses.
      This section maps that range, follows the stack as functions call each other, shows where globals and the heap
      live, then looks at the hardware underneath: the memory cells, the caches, and the virtual memory that larger
      processors add.`,
    before: [
      { page: 'binary', why: 'addresses are written in hex' },
      { page: 'endianness', why: 'multi-byte values are stored a byte at a time' },
      { page: 'instructions', why: 'the stack pages follow real Thumb instructions' },
    ],
    read: `Memory panels are drawn like a bench instrument. Address maps put high addresses at the top, as a datasheet
      does, so the stack grows down the screen. Gold marks what is selected or current, mint what is valid, and coral a
      fault. Pages with Step and Play walk through one access or one call at a time.`,
    terms: [
      { term: 'Address', def: 'The number of one byte of memory. A 32-bit address reaches 4 GiB.', page: 'memmap' },
      { term: 'Memory map', def: 'Which address ranges are Flash, SRAM, peripherals and the core’s own registers.', page: 'memmap' },
      { term: 'Flash', def: 'Memory that keeps its contents with the power off. It holds the program, at 0x0800_0000 on an STM32.', page: 'cells' },
      { term: 'SRAM', def: 'The working memory for variables and the stack, at 0x2000_0000 on an STM32.', page: 'cells' },
      { term: 'Memory-mapped register', def: 'A peripheral’s control or status register, at a fixed address and read and written like a variable.', page: 'mmio' },
      { term: 'Stack', def: 'The region where each call keeps its return address, saved registers and locals. It grows down.', page: 'stack' },
      { term: 'Heap', def: 'Memory handed out while the program runs, by malloc, and given back by free.', page: 'heap' },
      { term: 'Alignment', def: 'Placing a value at an address that is a multiple of its size.', page: 'alignment' },
      { term: 'Cache', def: 'A small, fast copy of recently used memory, kept next to the CPU.', page: 'caches' },
    ],
  },
  peripherals: {
    intro: `Peripherals are the hardware blocks beside the processor that deal with the world outside it: pins, timers,
      converters and DMA. Each one is controlled through registers at fixed addresses, and each does its job without
      running any code, so the CPU is free to do something else. The pages use an STM32F4 and the register names from
      its reference manual.`,
    before: [
      { page: 'mmio', why: 'a peripheral is controlled through registers at addresses' },
      { page: 'masks', why: 'registers are set and read a field at a time' },
      { page: 'rmw', why: 'changing one field must not disturb the others' },
    ],
    read: `Signals are drawn on the glass as on an oscilloscope: time runs left to right, and each lane is one pin or
      one value. A dashed trace is the ideal or the reference. The readout above the glass gives the numbers, and the
      formulas in the text show where they come from.`,
    terms: [
      { term: 'Peripheral', def: 'A hardware block on the chip that does one job alongside the CPU, such as a timer or a serial port.', page: 'mcu' },
      { term: 'Clock and prescaler', def: 'A peripheral counts the ticks of its clock, often divided down first by a prescaler.', page: 'timers' },
      { term: 'Pull-up', def: 'A resistor that holds an input high when nothing else drives it.', page: 'gpio' },
      { term: 'Duty cycle', def: 'The fraction of each period that a signal is high.', page: 'pwm' },
      { term: 'Resolution', def: 'How many bits a converter’s code has: 12 bits make 4096 steps.', page: 'adc' },
      { term: 'Reference voltage', def: 'The voltage that a converter’s full-scale code stands for, 3.3 V on these pages.', page: 'adc' },
      { term: 'Interrupt flag', def: 'A status bit an event sets, which can make the CPU run a handler.', page: 'interrupts' },
      { term: 'DMA request', def: 'A peripheral’s signal asking DMA to move one item of data.', page: 'dma' },
    ],
  },
};

const allSections = areas.flatMap((a) => a.sections);
const entry = (id: string) => allSections.flatMap((s) => s.categories.flatMap((c) => c.entries)).find((e) => e.id === id);
const live = (id: string) => statusOf.get(id) === 'live';
const link = (id: string, text = entry(id)?.name ?? id) => (live(id) ? `<a href="?p=${id}" data-nav>${esc(text)}</a>` : esc(text));

/** The section's groups in order, skipping its own Start here group. */
export const routeOf = (id: string) => allSections.find((s) => s.id === id)!.categories.filter((c) => !c.entries.some((e) => e.id === `${id}-start`));

export const overview = (id: string) => (root: HTMLElement) => {
  const o = OVERVIEWS[id], s = allSections.find((x) => x.id === id)!;
  const groups = routeOf(id);
  const pages = groups.flatMap((g) => g.entries);
  const ready = pages.filter((e) => live(e.id));
  const next = allSections[allSections.indexOf(s) + 1];
  const nextFirst = next && (next.lead[0]?.id ?? next.categories.flatMap((c) => c.entries.map((e) => e.id)).find(live));

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Start here</p>
      <h1>${esc(s.name)}</h1>
      <p>${o.intro}</p>
      ${ready[0] ? `<p class="ov-go"><a href="?p=${ready[0].id}" data-nav>Start with ${esc(ready[0].name)} →</a></p>` : ''}
    </section>
    <section class="ov-route" aria-label="The pages in this section, in reading order">
      <header><h2>The route</h2><span>${ready.length} of ${pages.length} page${pages.length === 1 ? '' : 's'} ready</span></header>
      <ol>${groups.map((g, i) => `
        <li class="ov-stop">
          <span class="ov-num" aria-hidden="true">${i + 1}</span>
          <div>
            <h3>${esc(g.name)}</h3>
            <p>${esc(g.blurb)}</p>
            <ul>${g.entries.map((e) => `
              <li class="${live(e.id) ? '' : 'soon'}">${live(e.id)
                ? `<a href="?p=${e.id}" data-nav><b>${esc(e.name)}</b><span>${esc(e.blurb)}</span></a>`
                : `<div><b>${esc(e.name)}</b><span>${esc(e.blurb)}</span></div>`}</li>`).join('')}
            </ul>
          </div>
        </li>`).join('')}
      </ol>
    </section>
    <section class="prose">
      <h2>Before you start</h2>
      ${o.before.length
        ? `<p>The pages build on a few from other sections. If any of these is new, read it first:</p>
      <ul>${o.before.map((b) => `<li>${link(b.page)}: ${esc(b.why)}.</li>`).join('')}</ul>`
        : '<p>Nothing beyond a little C: variables, <code>int</code> and <code>unsigned</code>, and the idea that a computer stores numbers in binary. This is the place to begin the whole site.</p>'}
      <h2>Reading the diagrams</h2>
      <p>${o.read}</p>
      <h2>Words this section uses</h2>
      <ul class="pm-terms">${o.terms.map((t) => `
        <li><b>${esc(t.term)}<span class="pm-sep">:</span></b> ${esc(t.def)}${t.page && live(t.page) ? ` See ${link(t.page)}.` : ''}</li>`).join('')}
      </ul>
      ${nextFirst ? `<h2>After this section</h2>
      <p>Carry on to ${link(nextFirst, next.name)}${next.blurb ? `: ${esc(next.blurb.charAt(0).toLowerCase() + next.blurb.slice(1))}` : '.'}</p>` : ''}
    </section>`;
};
