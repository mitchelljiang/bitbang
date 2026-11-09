/**
 * Overview: a section's "Start here" page. It says what the section answers, what to read first, how to read the
 * section's diagrams and the words it uses, and draws the route through its pages, built from the section's sidebar
 * groups so a page that goes live appears here too. One function serves every section; `OVERVIEWS` holds the text.
 */
import { esc } from '../core/render';
import { areas } from '../nav';
import { statusOf } from '../search';
import { sectionArt } from '../art';

interface Term { term: string; def: string; page?: string }
interface Overview {
  intro: string;
  /** Pages from other sections to read first, and why. */
  before: { page: string; why: string }[];
  /** What the panels in this section look like and how to work them. */
  read: string;
  terms: Term[];
}

const OVERVIEWS: Record<string, Overview> = {
  protocols: {
    intro: `A protocol is the agreement two chips share about what the voltages on a few wires mean: when to read the
      line, which bit comes first, how a message starts and ends, and who may talk next. This section draws each one
      as an oscilloscope would see it, from a single UART wire to the lanes of PCI Express, with every bit labelled.`,
    before: [
      { page: 'basics', why: 'the questions every protocol answers, which each page’s spec sheet links back to' },
      { page: 'binary', why: 'the data on the wire is written in hex' },
      { page: 'crc', why: 'most frames end with a check value' },
    ],
    read: `Every protocol page is an oscilloscope: time runs left to right, with one trace per wire. Click any bit, or
      use the arrow keys, to step through the frame and read what each part means. The controls under the scope change
      the data and the settings, and the spec sheet below it links each property to How protocols work.`,
    terms: [
      { term: 'Bit rate', def: 'How many bits are sent each second. A UART at 115200 baud sends 115,200 bits a second.', page: 'uart' },
      { term: 'Asynchronous', def: 'No clock wire: both sides agree on the bit rate in advance and time the bits themselves.', page: 'uart' },
      { term: 'Synchronous', def: 'A clock wire marks the moment each bit is read.', page: 'spi' },
      { term: 'Frame', def: 'One complete unit on the wire: a start, the data, any check, and an end.', page: 'uart' },
      { term: 'Open-drain', def: 'Outputs that can only pull a line low, with a resistor pulling it high, so many devices can share it.', page: 'i2c' },
      { term: 'Acknowledge', def: 'The receiver’s signal that it got the data, such as I²C’s ACK bit.', page: 'i2c' },
      { term: 'Differential', def: 'A signal on a pair of wires driven opposite ways and read as their difference, which cancels noise.', page: 'rs485' },
      { term: 'Line code', def: 'A mapping from bits to levels that keeps the line changing, so the receiver can recover the clock.', page: 'basics' },
    ],
  },
  concurrency: {
    intro: `A microcontroller has one CPU, but firmware has many things to do at once: answer a button, keep a motor’s
      timing, send a packet. This section shows how that one CPU is shared: interrupts that break into the program, an
      RTOS that switches between tasks, and the bugs that appear when two of them touch the same data, with the tools
      that prevent them.`,
    before: [
      { page: 'stack', why: 'the processor saves its place on the stack when it is interrupted' },
      { page: 'rmw', why: 'an interrupted read-modify-write is the classic race' },
      { page: 'timers', why: 'a timer’s interrupt is the heartbeat of an RTOS' },
    ],
    read: `The pages draw time left to right, like a logic analyzer. Each lane is one thread of execution: the main loop,
      an interrupt handler, or a task. A bright bar means that lane holds the CPU; a hatched bar is the processor saving
      or restoring registers; a dashed outline is a task that is ready but waiting, and a coral one is a task blocked on
      a lock. A small arrow above a lane is an event arriving, and the gold line is the current moment.`,
    terms: [
      { term: 'Interrupt', def: 'A hardware signal that makes the CPU pause the program and run a handler.', page: 'interrupts' },
      { term: 'Handler', def: 'The function that runs when an interrupt fires. It is also called an ISR.', page: 'interrupts' },
      { term: 'Priority', def: 'Which interrupt wins when two are pending, and which can interrupt another.', page: 'priorities' },
      { term: 'Task', def: 'An independent thread of execution under an RTOS, with its own stack.', page: 'context' },
      { term: 'Context switch', def: 'Saving one task’s registers and restoring another’s, so the CPU picks up where that task left off.', page: 'context' },
      { term: 'Race condition', def: 'A bug where the result depends on which of two threads gets there first.', page: 'races' },
      { term: 'Atomic', def: 'An operation that nothing else can interrupt halfway through.', page: 'atomics' },
      { term: 'Mutex', def: 'A lock that lets only one task at a time into a piece of code.', page: 'locks' },
    ],
  },
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
  c: {
    intro: `C on a microcontroller is the same language as anywhere else, but a few parts of it matter far more:
      where each variable is stored, how big each integer type is, how a struct is laid out in bytes, and what a
      pointer to a hardware register means. This section shows each of them in the code Clang produces for a
      Cortex-M0+, so you can see the cost of every choice.`,
    before: [
      { page: 'binary', why: 'sizes and addresses are in bytes and hex' },
      { page: 'alignment', why: 'struct padding comes from alignment' },
      { page: 'instructions', why: 'every example shows the instructions it becomes' },
    ],
    read: `Each page puts C on the left and the assembly Clang made of it on the right, every line of C and its
      instructions in the same color. Click a line on either side to pick it out and read what it does. The struct
      page also draws the layout byte by byte, with padding hatched. All of it is real compiler output, rebuilt by
      the checks.`,
    terms: [
      { term: 'Storage duration', def: 'How long a variable lives: for the whole program (globals, static) or for one call (locals).', page: 'keywords' },
      { term: 'Linkage', def: 'Whether other files can see a name. static gives a global internal linkage: this file only.', page: 'keywords' },
      { term: 'Integer promotion', def: 'Before arithmetic, C widens anything smaller than int to int.', page: 'integers' },
      { term: 'Padding', def: 'Unused bytes the compiler adds inside a struct so each field is aligned.', page: 'structs' },
      { term: 'Bit field', def: 'A struct member a given number of bits wide, packed with its neighbors into one word.', page: 'structs' },
      { term: 'Pointer', def: 'A variable holding an address. On a 32-bit chip it is 4 bytes.', page: 'pointers' },
      { term: 'Inlining', def: 'Pasting a function’s body into its caller instead of calling it.', page: 'functions' },
      { term: 'Calling convention', def: 'The rules for where arguments and results go. On Arm (the AAPCS): r0 to r3, then the stack.', page: 'functions' },
    ],
  },
  compilers: {
    intro: `Between the C you write and the bits in Flash sit four programs: the preprocessor, the compiler, the
      assembler and the linker. This section follows one small program through each of them, then looks at what the
      optimizer is allowed to change, and why <code>volatile</code> and undefined behavior matter so much on a
      microcontroller.`,
    before: [
      { page: 'instructions', why: 'the compiler’s output is instructions like these' },
      { page: 'memmap', why: 'the linker places code and data at real addresses' },
      { page: 'sections', why: 'startup copies .data and clears .bss, which the linker set up' },
    ],
    read: `Most pages put C on the left and what a tool made of it on the right, every line of C and its output in
      the same color. Click a line on either side to pick it out and read what it does. Everything shown is the
      real output of Clang, objdump and the LLD linker, building for a Cortex-M0+ (the Raspberry Pi Pico’s core),
      and the checks rebuild it to make sure it still matches.`,
    terms: [
      { term: 'Toolchain', def: 'The compiler, assembler, linker and the tools around them, such as arm-none-eabi-gcc.' },
      { term: 'Translation unit', def: 'One .c file after the preprocessor has pasted in its #includes. The compiler sees one at a time.', page: 'preprocess' },
      { term: 'Object file', def: 'The compiler’s output for one translation unit: machine code with some addresses still blank.', page: 'objects' },
      { term: 'Symbol', def: 'A named function or variable that the linker can find and point to.', page: 'objects' },
      { term: 'Relocation', def: 'A note in an object file saying which bytes the linker must fill in with an address.', page: 'linking' },
      { term: 'Linker script', def: 'The file that tells the linker where Flash and SRAM are, and which sections go where.', page: 'linker-script' },
      { term: 'Optimization', def: 'Rewriting the code to be faster or smaller while keeping what the C standard says it must do.', page: 'optimize' },
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
  power: {
    intro: `Before a program can do anything, something has to supply a clock and a stable voltage. This section starts with where a chip’s
      frequencies come from, then looks at how it saves energy by stopping them, and at what protects it when the supply sags. The
      pages use the RP2040, and every limit and current comes from its datasheet.`,
    before: [
      { page: 'mcu', why: 'the parts of the chip that clocks feed' },
      { page: 'timers', why: 'a timer counts the clocks this section produces' },
    ],
    read: `Each page has one diagram with a small set of controls. A value in red has gone out of range. Readouts under the diagram give the numbers, and currents are typical figures from the datasheet.`,
    terms: [
      { term: 'PLL', def: 'A phase-locked loop: a circuit that multiplies a reference frequency.', page: 'clock-tree' },
      { term: 'VCO', def: 'The fast oscillator inside a PLL, whose speed is steered by a control voltage.', page: 'clock-tree' },
      { term: 'Clock gating', def: 'Stopping a block’s clock to save the power it spends switching.', page: 'sleep-modes' },
      { term: 'Duty cycle', def: 'The fraction of the time a device is awake.', page: 'battery-life' },
      { term: 'Brown-out', def: 'A supply voltage that sags below what the chip needs, without going fully off.', page: 'brownout' },
    ],
  },
  drivers: {
    intro: `A driver is the code between an application and a piece of hardware. It has to reach the registers correctly, get data past interrupts without losing any, and leave the rest of the program with a simple interface.
      These pages build one up from a single register write to a DMA receive path.`,
    before: [
      { page: 'mmio', why: 'a register is an address that talks to hardware' },
      { page: 'volatile', why: 'register accesses must not be optimized away' },
      { page: 'interrupts', why: 'drivers do their work in interrupt handlers' },
      { page: 'dma', why: 'the DMA driver page starts where this one ends' },
    ],
    read: `Register access and HAL design show C beside the real instructions. The others are simulations, with controls for buffer sizes and timing; a result in red means data was lost.`,
    terms: [
      { term: 'Overlay', def: 'A struct laid over a peripheral’s address, so each member is a register.', page: 'register-layer' },
      { term: 'HAL', def: 'Hardware abstraction layer: an interface that hides which chip the code runs on.', page: 'hal' },
      { term: 'Ring buffer', def: 'A fixed array used as a queue, with indexes that wrap around.', page: 'ring-buffer' },
      { term: 'Overrun', def: 'A byte arrived with nowhere to put it, so data was lost.', page: 'uart-driver' },
      { term: 'Circular DMA', def: 'A DMA transfer that wraps to the start of its buffer and never stops.', page: 'dma-driver' },
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
/** A page with something to open: built, or in progress with a page saying so. */
const open = (id: string) => statusOf.get(id) !== 'soon';
const link = (id: string, text = entry(id)?.name ?? id) => (live(id) ? `<a href="?p=${id}" data-nav>${esc(text)}</a>` : esc(text));

/** The section's groups in order, skipping its own Start here group. */
const routeOf = (id: string) => allSections.find((s) => s.id === id)!.categories.filter((c) => !c.entries.some((e) => e.id === `${id}-start`));

export const overview = (id: string) => (root: HTMLElement) => {
  const o = OVERVIEWS[id], s = allSections.find((x) => x.id === id)!;
  const groups = routeOf(id);
  const pages = groups.flatMap((g) => g.entries);
  const ready = pages.filter((e) => live(e.id));
  // The first page to read: another Start here page if the section has one (Protocols' guide), else the route's first.
  const first = s.categories.find((c) => !groups.includes(c))!.entries.find((e) => e.id !== `${id}-start` && live(e.id)) ?? ready[0];
  const next = allSections[allSections.indexOf(s) + 1];
  const nextFirst = next?.categories.flatMap((c) => c.entries.map((e) => e.id)).find(live);

  root.innerHTML = `
    <section class="intro">
      <div class="ov-art">${sectionArt(id)}</div>
      <p class="crumbs">Start here</p>
      <h1>${esc(s.name)}</h1>
      <p>${o.intro}</p>
      ${first ? `<p class="ov-go"><a href="?p=${first.id}" data-nav>Start with ${esc(first.name)} →</a></p>` : ''}
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
              <li class="${live(e.id) ? '' : open(e.id) ? 'wip' : 'soon'}">${open(e.id)
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
