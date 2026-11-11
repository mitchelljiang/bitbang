/**
 * Learning paths: routes through the site that cross its sections, one per kind of reader. A section's own Start here
 * page orders the pages of that section; a path picks pages from several sections and says why each one is on it.
 * Every step must be a live page (verify checks this), and each `why` is written for that path's reader.
 */
export interface Path {
  id: string;
  name: string;
  /** Who it is for, as one short clause on the home page card. */
  who: string;
  /** What the reader has at the start and what they will be able to do at the end. */
  intro: string;
  steps: [page: string, why: string][];
}

export const PATHS: Path[] = [
  {
    id: 'first',
    name: 'New to embedded',
    who: 'You know some C and have not programmed a chip directly.',
    intro: 'From a number in binary to a chip that blinks an LED, answers an interrupt and talks to a sensor. Each page needs only the ones before it.',
    steps: [
      ['binary', 'Every address and register value on the site is written in hex.'],
      ['bitwise', 'The four operations all register code is built from.'],
      ['masks', 'Setting, clearing and testing single bits of a register.'],
      ['mcu', 'The parts of a microcontroller and the words used for them.'],
      ['memmap', 'Where Flash, SRAM and the peripherals sit in the address space.'],
      ['mmio', 'Writing to an address turns on an LED.'],
      ['gpio', 'What is behind a pin: push-pull, open-drain and pull-ups.'],
      ['rmw', 'Changing some bits of a register, and the update an interrupt can lose.'],
      ['timers', 'A prescaler and a counter make a periodic event.'],
      ['interrupts', 'How hardware breaks into the program and hands it back.'],
      ['uart', 'The simplest way to get bytes off the chip.'],
      ['spi', 'A clocked bus with one select line per device.'],
      ['i2c', 'Two wires shared by every sensor on the board.'],
    ],
  },
  {
    id: 'software',
    name: 'From software to firmware',
    who: 'You write software for a PC, phone or server.',
    intro: 'What changes when there is no operating system: you own the memory map, the startup code and every interrupt, and the compiler is less forgiving.',
    steps: [
      ['mcu', 'The chip in one diagram, with the vocabulary firmware people use.'],
      ['memmap', 'One address space holds code, data and hardware, with no virtual memory.'],
      ['mmio', 'Hardware is driven by writing to addresses, not by system calls.'],
      ['sections', 'Something has to copy .data and zero .bss before main() runs.'],
      ['linker-script', 'You tell the linker where Flash and SRAM are.'],
      ['stack', 'The stack is a fixed slice of SRAM with nothing guarding its end.'],
      ['heap', 'Why much firmware never calls malloc after startup.'],
      ['volatile', 'The optimizer assumes only your code changes memory. Hardware does too.'],
      ['ub', 'Undefined behavior removes checks, and there is no OS to catch the result.'],
      ['interrupts', 'Concurrency without threads: a handler can run between any two instructions.'],
      ['races', 'The lost update, one instruction at a time.'],
      ['atomics', 'Protecting shared data with no mutex available.'],
      ['ring-buffer', 'The lock-free queue between an interrupt and the main loop.'],
      ['uart-driver', 'A first driver, and how long interrupts may stay off.'],
      ['watchdog', 'What restarts the chip when the code hangs.'],
    ],
  },
  {
    id: 'hardware',
    name: 'From hardware to firmware',
    who: 'You design circuits or boards and want to write the code for them.',
    intro: 'You know what the registers do. This is the C that reaches them, what the compiler does with it, and how the code is split between interrupts and tasks.',
    steps: [
      ['keywords', 'static, extern and const decide where a variable is stored.'],
      ['integers', 'Sizes, promotion and the signed and unsigned traps.'],
      ['structs', 'Padding, packing, and laying a struct over a block of registers.'],
      ['pointers', 'A register is a volatile pointer to a fixed address.'],
      ['compile', 'One C function and the instructions it becomes.'],
      ['optimize', 'Why the same code is 54 bytes at -O0 and 22 at -Os.'],
      ['volatile', 'Why a register read in a loop disappears without it.'],
      ['register-layer', 'Three ways to write one register, and what each compiles to.'],
      ['hal', 'Where to put the boundary between logic and registers.'],
      ['interrupts', 'What the processor saves, and how a handler returns.'],
      ['priorities', 'Which interrupt wins, and when one preempts another.'],
      ['context', 'What an RTOS saves to swap one task for another.'],
      ['scheduling', 'Choosing priorities so every deadline is met.'],
      ['locks', 'Mutexes, semaphores and priority inversion.'],
    ],
  },
  {
    id: 'bringup',
    name: 'Bringing up a board',
    who: 'A new board is on the bench and nothing works yet.',
    intro: 'In the order the problems appear: power and clocks, the debug port, a first pin, a first serial line, then the buses to everything else.',
    steps: [
      ['brownout', 'Is the supply high enough for the chip to leave reset?'],
      ['clock-tree', 'Every baud rate and timer period depends on this being right.'],
      ['swd', 'What the debug probe says to the chip on two wires.'],
      ['jtag', 'The older debug port, and the one for chains of chips.'],
      ['mmio', 'Enable the clock, set the mode, then drive the pin.'],
      ['gpio', 'Why a pin floats, and the short to avoid.'],
      ['uart', 'A serial console, and how much baud rate error it tolerates.'],
      ['spi', 'Clock mode and bit order, the two settings that are usually wrong.'],
      ['i2c', 'Pull-ups, addresses and what a NACK means.'],
      ['timers', 'A known 1 kHz tick proves the clock setup.'],
      ['watchdog', 'Add it once the main loop runs.'],
      ['mapfile', 'When the image stops fitting in Flash.'],
      ['overflow', 'When it crashes somewhere unrelated: check the stack.'],
    ],
  },
  {
    id: 'rtos',
    name: 'Real-time software',
    who: 'You are moving from a main loop to interrupts and an RTOS.',
    intro: 'How one processor is shared, from a single interrupt to tasks with deadlines, and how to share data between them without losing any.',
    steps: [
      ['mcu', 'SysTick, the NVIC and the vector table, each in its place.'],
      ['interrupts', 'Entry, stacking and return.'],
      ['priorities', 'Preemption, pending and tail-chaining.'],
      ['context', 'A task is a stack and one saved stack pointer.'],
      ['scheduling', 'Fixed priorities, rate-monotonic order and the utilization bound.'],
      ['races', 'Why count++ is three instructions.'],
      ['atomics', 'Masking interrupts, or LDREX and STREX.'],
      ['barriers', 'When a write has not landed yet.'],
      ['locks', 'Priority inheritance, and semaphores as signals from interrupts.'],
      ['ring-buffer', 'Passing bytes from a handler to a task without a lock.'],
      ['dma-driver', 'A deadline set by the buffer size.'],
      ['overflow', 'Sizing each task’s stack.'],
    ],
  },
  {
    id: 'interview',
    name: 'Interview review',
    who: 'You have a firmware interview coming up.',
    intro: 'The topics firmware interviews return to most. Each page has a diagram to reason from, so you can explain the answer and not only recite it.',
    steps: [
      ['endianness', 'Write the program that detects byte order.'],
      ['twos', 'Why −x is ~x + 1.'],
      ['tricks', 'x & (x − 1), and what it is used for.'],
      ['alignment', 'Why sizeof a struct is more than the sum of its fields.'],
      ['keywords', 'The two meanings of static, and what const does not promise.'],
      ['volatile', 'When it is needed, and what it does not do.'],
      ['stack', 'What a frame holds and why the stack grows down.'],
      ['heap', 'Fragmentation, and what to use in place of malloc.'],
      ['sections', '.text, .data and .bss, and what runs before main().'],
      ['interrupts', 'What the hardware does between the event and the handler.'],
      ['races', 'Find the window in a read-modify-write.'],
      ['atomics', 'Critical sections and their cost in latency.'],
      ['locks', 'Explain priority inversion and its fix.'],
      ['uart', 'Framing, baud rate error and what 8N1 means.'],
      ['spi', 'The four modes, and why there is no acknowledge.'],
      ['i2c', 'Open-drain, addressing, ACK and clock stretching.'],
    ],
  },
];

export const pathById = (id: string | null) => PATHS.find((p) => p.id === id);
