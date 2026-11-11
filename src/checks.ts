/**
 * Check yourself: two or three questions at the end of a page, answerable from that page alone. Recalling an answer
 * does more for memory than reading it again, so the questions ask the reader to work something out, not to spot a
 * phrase. Each has exactly one right option, and `why` is shown once it is found. Text between backticks is set as
 * code. Keep every number in step with the page it belongs to; verify checks the structure, not the facts.
 */
export interface Check { q: string; options: string[]; answer: number; why: string }

export const CHECKS: Record<string, Check[]> = {
  // ---- Bits and bytes ----
  binary: [
    { q: 'What is `1011 0010` in hex?', options: ['`0xA2`', '`0xB2`', '`0x2B`', '`0xD4`'], answer: 1,
      why: 'Each group of four bits is one hex digit: 1011 is B and 0010 is 2.' },
    { q: 'A byte has bits 7, 5, 4 and 1 set. What is its value in decimal?', options: ['172', '178', '89', '210'], answer: 1,
      why: '128 + 32 + 16 + 2 = 178.' },
  ],
  twos: [
    { q: 'Read as an `int8_t`, what is `1111 1111`?', options: ['255', '−127', '−1', '−128'], answer: 2,
      why: 'The top bit is worth −128 and the other seven add up to 127, so the value is −1.' },
    { q: 'How do you negate a two’s complement number?', options: ['Flip the top bit', 'Invert every bit', 'Invert every bit, then add 1', 'Subtract 1, then flip the top bit'], answer: 2,
      why: 'x + ~x is all ones, and one more carries out to zero, so −x is ~x + 1.' },
  ],
  fixed: [
    { q: 'In UQ4.4, what value do the bits `0001 1000` hold?', options: ['24', '1.8', '1.5', '0.15'], answer: 2,
      why: 'The integer part is 1, and the first bit after the point is worth one half.' },
    { q: 'Two values in the same fixed-point format are multiplied. What must happen to the product?', options: ['Nothing: it is already in the format', 'It is shifted right by the number of fraction bits', 'It is shifted left by the number of fraction bits', 'It is converted to a float'], answer: 1,
      why: 'Multiplying doubles the fraction bits, so the product is shifted right to return to the original format.' },
  ],
  float: [
    { q: 'How are the 32 bits of a `float` divided?', options: ['1 sign, 8 exponent, 23 fraction', '1 sign, 11 exponent, 20 fraction', '8 sign and exponent, 24 fraction', '1 sign, 7 exponent, 24 fraction'], answer: 0,
      why: 'One sign bit, an 8-bit exponent stored with 127 added, and a 23-bit fraction.' },
    { q: 'Why is `0.1 + 0.2 == 0.3` false?', options: ['Floats round every addition down', '0.1 has no exact binary form, so the nearest float is stored', 'The exponent overflows', 'The comparison promotes to int'], answer: 1,
      why: 'Like 1/3 in decimal, 0.1 repeats forever in binary. The stored value is slightly off, and the errors show when values are added and compared.' },
  ],
  bitwise: [
    { q: 'What does `value & 0x0F` keep?', options: ['The high four bits', 'The low four bits', 'Every bit, inverted', 'Only bit 4'], answer: 1,
      why: 'AND with 1 keeps a bit and AND with 0 clears it. 0x0F has ones in the low four positions.' },
    { q: 'Which operator flips the bits chosen by a mask and leaves the others alone?', options: ['AND', 'OR', 'XOR', 'NOT'], answer: 2,
      why: 'x ^ 1 is the opposite of x, and x ^ 0 is x.' },
  ],
  shifts: [
    { q: 'With an arithmetic right shift, what is `-78 >> 3`?', options: ['−9', '−10', '9', '−624'], answer: 1,
      why: 'An arithmetic shift rounds toward minus infinity: −78 / 8 is −9.75, which becomes −10.' },
    { q: 'Why is a mask for bit 31 written `1u << 31` and not `1 << 31`?', options: ['It compiles to a faster instruction', '`1 << 31` shifts a 1 into the sign bit of an `int`, which is undefined', '`1 << 31` is zero', 'The `u` makes the result 64 bits wide'], answer: 1,
      why: 'Shifting a 1 into the sign bit of a signed int is undefined behavior. An unsigned constant has no sign bit.' },
  ],
  masks: [
    { q: 'Which line clears bit 3 of `reg` and leaves the other bits alone?', options: ['`reg |= (1u << 3);`', '`reg &= (1u << 3);`', '`reg &= ~(1u << 3);`', '`reg ^= ~(1u << 3);`'], answer: 2,
      why: 'The inverted mask has a 0 only at bit 3. AND with 0 clears, and AND with 1 keeps.' },
    { q: 'How do you read a 3-bit field at bits 6 to 4?', options: ['`reg & 0x7u`', '`(reg >> 4) & 0x7u`', '`(reg << 4) & 0x7u`', '`reg >> 6`'], answer: 1,
      why: 'Shift the field down to bit 0, then mask off everything above its three bits.' },
  ],
  tricks: [
    { q: 'What does `x & (x - 1)` do?', options: ['Isolates the lowest 1 bit', 'Clears the lowest 1 bit', 'Sets the lowest 0 bit', 'Counts the 1 bits'], answer: 1,
      why: 'Subtracting 1 turns the lowest 1 into 0 and the zeros below it into ones. AND with the original keeps only the bits above.' },
    { q: 'For a nonzero `x`, what does `(x & (x - 1)) == 0` tell you?', options: ['x is odd', 'x is a power of two', 'x is negative', 'x has an even number of 1 bits'], answer: 1,
      why: 'A power of two has a single 1 bit, so clearing it leaves zero.' },
  ],
  rmw: [
    { q: 'An interrupt changes a register between main’s read and main’s write-back. What happens?', options: ['Both changes are kept', 'The interrupt’s change is lost', 'Main’s change is lost', 'The processor faults'], answer: 1,
      why: 'Main writes back a copy made before the interrupt ran, which erases what the interrupt wrote.' },
    { q: 'A status flag is marked W1C (cleared by writing 1). Why is `STATUS |= OTHER_BIT` risky?', options: ['It cannot set OTHER_BIT', 'It writes back every flag it read as 1, which clears them', 'It leaves the register read-only', 'It takes two bus cycles'], answer: 1,
      why: 'The read returns the pending flags as ones, and writing those ones back clears them by accident. Write a mask with only the intended bits.' },
  ],
  endianness: [
    { q: 'A little-endian machine stores `uint16_t x = 0x1234` at address 0x100. Which byte is at 0x100?', options: ['`0x12`', '`0x34`', '`0x21`', '`0x43`'], answer: 1,
      why: 'Little-endian puts the least significant byte at the lowest address.' },
    { q: 'Where does byte order not matter?', options: ['Sending a `uint32_t` over a network', 'Reading a value one byte at a time through a pointer', 'Shifts and masks on a value', 'Parsing a file format'], answer: 2,
      why: 'Shifts and masks work on the value, not on its bytes in memory, so they give the same result on either kind of machine.' },
  ],
  flags: [
    { q: 'An 8-bit add of `0x64 + 0x50` gives `0xB4`. Which flags are set?', options: ['C only', 'V and N', 'C and V', 'Z only'], answer: 1,
      why: 'As unsigned, 100 + 80 = 180 fits, so C is clear. As signed the result reads as −76, so V is set, and the top bit sets N.' },
    { q: 'Which check for overflow is reliable in C?', options: ['`if (a + b < a)` with signed `int`', '`if (r < a)` after an unsigned add', 'Either: they compile to the same code', 'Neither: overflow cannot be detected'], answer: 1,
      why: 'Unsigned arithmetic wraps by definition. Signed overflow is undefined, so the compiler may remove a check written after the fact.' },
  ],
  crc: [
    { q: 'Two bytes of a message are swapped. Which check notices?', options: ['A parity bit', 'An 8-bit checksum', 'A CRC-8', 'All three'], answer: 2,
      why: 'Addition does not care about order, so the sum is unchanged. In a CRC every bit affects every later step, so position matters.' },
    { q: 'What is a CRC, arithmetically?', options: ['The sum of the bytes, modulo 256', 'The XOR of all the bytes', 'The remainder of dividing the message by a polynomial, using XOR', 'The count of 1 bits'], answer: 2,
      why: 'The message is treated as one long binary number and divided by the polynomial, with XOR in place of subtraction. The remainder is the CRC.' },
  ],

  // ---- Memory ----
  memmap: [
    { q: 'On a Cortex-M, what does the address `0x4000_0000` reach?', options: ['Flash', 'SRAM', 'A peripheral register', 'The core’s system registers'], answer: 2,
      why: 'The Peripheral region starts at 0x4000_0000. SRAM is at 0x2000_0000 and the system registers are at 0xE000_0000 and up.' },
    { q: 'Why is Flash at `0x0800_0000` usually also visible at address 0?', options: ['To double the Flash size', 'Reset reads the initial stack pointer and reset address from address 0', 'Address 0 is faster to read', 'So that null pointers are valid'], answer: 1,
      why: 'The core fetches the first two vector table entries from address 0, so the boot configuration aliases Flash there.' },
  ],
  mmio: [
    { q: 'A first GPIO program sets the output bit and nothing happens. Which is a likely cause?', options: ['The port’s clock is not enabled, or the pin is still an input', 'The register pointer is volatile', 'The compiler chose the wrong endianness', 'GPIO writes need an interrupt'], answer: 0,
      why: 'Until the port’s clock is enabled its registers ignore writes, and the output register only drives pins whose mode is output.' },
    { q: 'Why is writing BSRR safer than `ODR |= (1u << 12)`?', options: ['BSRR is at a lower address', 'One write changes only the chosen pins, with no read to go stale', 'BSRR is not volatile', 'ODR is read-only'], answer: 1,
      why: 'The OR is a read-modify-write that an interrupt can split. BSRR sets or clears pins in a single write that touches no other bit.' },
  ],
  alignment: [
    { q: 'What is `sizeof` a struct holding a `uint8_t`, then a `uint16_t`, then a `uint32_t`?', options: ['7', '8', '10', '12'], answer: 1,
      why: 'One byte of padding puts the uint16_t at offset 2, and the uint32_t lands at offset 4, for 8 bytes in all.' },
    { q: 'A Cortex-M0+ loads a `uint32_t` from an odd address. What happens?', options: ['It works at full speed', 'It works, using two bus accesses', 'A HardFault', 'The low two address bits are ignored'], answer: 2,
      why: 'The M0 and M0+ only do aligned accesses. A Cortex-M3 or M4 would split the load in two and carry on.' },
  ],
  stack: [
    { q: 'How does a function make room for its frame?', options: ['It calls the allocator', 'It subtracts the frame’s size from SP', 'It adds the frame’s size to SP', 'The linker reserves it'], answer: 1,
      why: 'On a Cortex-M the stack grows down, so making room means moving SP to a lower address.' },
    { q: 'Why does the stack never fragment?', options: ['Frames are all the same size', 'Frames are freed in the reverse of the order they were made', 'The MPU compacts it', 'It is cleared on every return'], answer: 1,
      why: 'Last in, first out leaves a single free edge, where SP points.' },
  ],
  overflow: [
    { q: 'With no guard in place, what happens when the stack grows past its limit?', options: ['The chip resets at once', 'A HardFault at the first write', 'Ordinary writes land in whatever is below, usually the globals', 'The linker reports an error'], answer: 2,
      why: 'The hardware carries out the stores. The data below is corrupted, and any crash comes later and somewhere else.' },
    { q: 'What does stack painting tell you?', options: ['The moment the stack overflows', 'The deepest the stack has reached so far', 'Which function used the most stack', 'The current value of SP'], answer: 1,
      why: 'Scanning for the first byte still holding the fill pattern gives the high-water mark. It measures; it does not stop an overflow.' },
  ],
  heap: [
    { q: 'A heap has 600 bytes free and `malloc(400)` fails. Why?', options: ['malloc rounds every request up to 1 KiB', 'The free space is in pieces, and none is 400 bytes long', 'The heap must be half empty', 'A free was called twice'], answer: 1,
      why: 'Every allocation must be one contiguous block. This is external fragmentation.' },
    { q: 'Why does a pool of fixed-size blocks not fragment?', options: ['It is never freed', 'Every block is the same size, so any free block fits any request', 'It lives on the stack', 'It is compacted by the linker'], answer: 1,
      why: 'Blocks are interchangeable, so a free block can always be reused.' },
  ],
  sections: [
    { q: 'Where is `uint32_t period = 500;` (a global) stored?', options: ['In Flash only', 'In SRAM only', 'Its starting value in Flash and a writable copy in SRAM', 'On the stack'], answer: 2,
      why: 'It is in .data: startup copies the initial value from its load address in Flash to its run address in SRAM.' },
    { q: 'What does making a large lookup table `const` save?', options: ['Flash', 'SRAM', 'Both', 'Neither: only compile time'], answer: 1,
      why: 'A const table goes in .rodata and is read in place from Flash, so it takes no SRAM.' },
  ],
  caches: [
    { q: 'In a direct-mapped cache, two addresses share an index. What happens when the program alternates between them?', options: ['Both stay cached', 'Each access evicts the other, even if the rest of the cache is empty', 'The cache switches to two ways', 'The second address is never cached'], answer: 1,
      why: 'A set holds one line, so the two blocks knock each other out. That is a conflict miss.' },
    { q: 'DMA has just written a buffer on a chip with a data cache. What must the CPU do before reading it?', options: ['Clean (flush) the cache', 'Invalidate the cached copy of the buffer', 'Disable interrupts', 'Nothing'], answer: 1,
      why: 'The cache may still hold the old contents. Invalidating drops them, so the read goes to memory.' },
  ],
  mpu: [
    { q: 'What does an MPU do that an MMU also does?', options: ['Translates addresses', 'Checks each access against permissions', 'Swaps pages to disk', 'Gives each task its own address space'], answer: 1,
      why: 'An MPU is protection without translation: there is still one address space, with rules on it.' },
    { q: 'Two MPU regions overlap on a classic Cortex-M. Which one applies?', options: ['The larger', 'The lower-numbered', 'The higher-numbered', 'The access faults'], answer: 2,
      why: 'The highest-numbered region wins, which is how a small stack guard overrides the RAM region around it.' },
  ],

  // ---- Concurrency ----
  interrupts: [
    { q: 'What saves R0 to R3, R12, LR, PC and xPSR when a Cortex-M takes an interrupt?', options: ['The handler’s first instructions', 'The compiler, in the interrupted function', 'The processor, by itself', 'The RTOS'], answer: 2,
      why: 'Stacking those eight registers is hardware, which is why a handler can be an ordinary C function.' },
    { q: 'What is tail-chaining?', options: ['One handler calling another', 'Going straight to a pending handler without popping and pushing the registers again', 'Running two handlers at the same priority in turn', 'Returning to main through the vector table'], answer: 1,
      why: 'If another interrupt is pending when a handler returns, the processor skips the pop and the next push.' },
  ],
  priorities: [
    { q: 'On a Cortex-M, a priority 2 handler is running and a priority 2 interrupt fires. What happens?', options: ['It preempts at once', 'It stays pending until the running handler finishes', 'It is lost', 'The lower exception number preempts'], answer: 1,
      why: 'Preemption needs a strictly lower number. Equal priorities never interrupt each other.' },
    { q: 'An STM32F4 implements 4 priority bits. How many levels is that, and which is most urgent?', options: ['16 levels, and 15 is most urgent', '16 levels, and 0 is most urgent', '4 levels, and 0 is most urgent', '256 levels, and 255 is most urgent'], answer: 1,
      why: 'Four bits give levels 0 to 15, and a lower number is more urgent.' },
  ],
  context: [
    { q: 'Which registers does an RTOS kernel have to save itself in a Cortex-M context switch?', options: ['All sixteen', 'R0 to R3 and R12', 'R4 to R11', 'Only SP'], answer: 2,
      why: 'Exception entry already pushed the other eight. The kernel saves the ones C code must preserve.' },
    { q: 'Why is the switch done in PendSV at the lowest priority?', options: ['PendSV runs fastest', 'So it happens only after every other handler has finished', 'PendSV has its own stack', 'The tick interrupt cannot read registers'], answer: 1,
      why: 'Swapping the task stack while another handler is still running would corrupt it.' },
  ],
  scheduling: [
    { q: 'Rate-monotonic assignment gives the highest priority to which task?', options: ['The one with the most work', 'The one with the shortest period', 'The one created first', 'The one with the longest deadline'], answer: 1,
      why: 'For independent periodic tasks, shortest period first is the best fixed assignment there is.' },
    { q: 'A set of three tasks has 95% utilization, above the 78% bound. What does that mean?', options: ['It must miss a deadline', 'The bound cannot tell: it may still fit, and exact analysis decides', 'It needs round-robin', 'It needs a faster tick'], answer: 1,
      why: 'The bound is sufficient, not necessary. Only above 100% is it certain that no policy keeps up.' },
  ],
  races: [
    { q: 'Two tasks each run `count++` once, starting from 0. Which final values are possible?', options: ['Only 2', '1 or 2', '0, 1 or 2', 'Only 1'], answer: 1,
      why: 'If both load the old value before either stores, one increment is lost and the result is 1.' },
    { q: 'Why can a race pass every test and still fail in the field?', options: ['Tests run with interrupts off', 'The window is a few instructions wide, so a switch rarely lands in it', 'Debug builds have no races', 'The compiler fixes races at -O0'], answer: 1,
      why: 'Only an interleaving that splits the load from the store goes wrong, and that takes unlucky timing.' },
  ],
  atomics: [
    { q: 'Does `volatile` make `count++` safe against an interrupt?', options: ['Yes', 'No: it is still a load, an add and a store', 'Only at -O0', 'Only on a Cortex-M0'], answer: 1,
      why: 'volatile makes each access really happen. It says nothing about atomicity.' },
    { q: 'What is the cost of protecting an update by disabling interrupts?', options: ['Interrupts that fire meanwhile are lost', 'Every interrupt waits for the longest critical section', 'It needs a Cortex-M3 or later', 'It needs an RTOS'], answer: 1,
      why: 'An interrupt that fires while masked is held pending, not lost. The price is latency, so critical sections stay a few instructions long.' },
  ],
  locks: [
    { q: 'In priority inversion, what is the high-priority task really waiting for?', options: ['Only the low task’s short critical section', 'A medium-priority task that never touches the mutex', 'The scheduler tick', 'An interrupt'], answer: 1,
      why: 'Medium outranks Low, so Low cannot run to release the mutex, and High waits for as long as Medium runs.' },
    { q: 'How does priority inheritance fix it?', options: ['High skips the mutex', 'The holder runs at the priority of the highest task waiting', 'Medium is suspended for good', 'The mutex becomes a semaphore'], answer: 1,
      why: 'Low briefly runs at High’s priority, so Medium cannot get in, and High waits only for the critical section.' },
  ],

  // ---- Peripherals ----
  gpio: [
    { q: 'A button connects a pin to ground, and the pin has a pull-up. What does the pin read while the button is pressed?', options: ['1', '0', 'It floats', 'It alternates'], answer: 1,
      why: 'The button is far stronger than the weak pull-up, so it pulls the pin to ground.' },
    { q: 'Why do I²C and 1-Wire use open-drain outputs?', options: ['They are faster', 'Any device can pull the line low and none can fight another by driving high', 'They use less current when low', 'They need no resistor'], answer: 1,
      why: 'An open-drain output can only pull low or let go, so several devices can share one wire safely.' },
  ],
  debounce: [
    { q: 'A counter debouncer samples every 1 ms and needs N = 5 samples in a row. About how long after the pin settles is a press reported?', options: ['1 ms', '5 ms', '25 ms', 'At once'], answer: 1,
      why: 'N samples at the sample interval: 5 × 1 ms.' },
    { q: 'What is the weakness of a lockout debouncer?', options: ['It adds latency to every press', 'It believes any edge, so a noise spike counts as a press', 'It needs a timer interrupt', 'It cannot see a release'], answer: 1,
      why: 'It reacts to the first edge with no delay, which also means it trusts an edge that was only noise.' },
  ],
  timers: [
    { q: 'From a 16 MHz timer clock, which settings give a 1 kHz update?', options: ['PSC = 16, ARR = 1000', 'PSC = 15, ARR = 999', 'PSC = 15, ARR = 1000', 'PSC = 16, ARR = 999'], answer: 1,
      why: 'Each register divides by its value plus 1: 16 MHz / (16 × 1000) = 1 kHz.' },
    { q: 'With preload on, when does a newly written ARR take effect?', options: ['At once', 'At the next update event', 'After two periods', 'Only after the timer is restarted'], answer: 1,
      why: 'The write lands in a shadow register and is taken at the next update, so a period never ends early.' },
  ],
  pwm: [
    { q: 'In PWM mode 1 with ARR = 9, which CCR gives a 30% duty cycle?', options: ['2', '3', '4', '30'], answer: 1,
      why: 'Duty is CCR / (ARR + 1) = 3 / 10.' },
    { q: 'From the same clock, what does a larger ARR do?', options: ['Finer duty steps and a higher frequency', 'Finer duty steps and a lower frequency', 'Coarser duty steps and a lower frequency', 'It changes neither'], answer: 1,
      why: 'More counts per period means smaller steps, and a longer period.' },
  ],
  watchdog: [
    { q: 'Why should the watchdog not be kicked from a timer interrupt?', options: ['Interrupts cannot write the key register', 'The interrupt keeps firing while the main loop is stuck', 'It makes the timeout too short', 'It resets the timer'], answer: 1,
      why: 'The kick has to prove that the main loop is healthy. An interrupt would keep kicking through a hang.' },
    { q: 'What does a window watchdog catch that an independent one cannot?', options: ['A hang', 'A loop that runs too fast and kicks early', 'A failed main clock', 'A brown-out'], answer: 1,
      why: 'It resets if kicked too late or too early, and too early means the loop is skipping work.' },
  ],
  adc: [
    { q: 'How many comparisons does a 12-bit successive-approximation conversion take?', options: ['1', '12', '4096', 'It depends on the input'], answer: 1,
      why: 'It is a binary search: one comparison per bit, whatever the input.' },
    { q: 'With a 3.3 V reference at 12 bits, about how big is one step?', options: ['0.81 mV', '12.9 mV', '3.3 mV', '0.275 V'], answer: 0,
      why: '3.3 V / 4096 ≈ 0.81 mV.' },
  ],
  dma: [
    { q: 'In circular mode, what does the half-transfer interrupt tell the CPU?', options: ['The transfer has stopped', 'The first half of the buffer is ready while DMA fills the second', 'A byte was lost', 'The buffer address is invalid'], answer: 1,
      why: 'The CPU always has one stable half to process while DMA writes the other.' },
    { q: 'In normal (not circular) mode, what happens when NDTR reaches zero?', options: ['It reloads and carries on', 'The stream switches itself off', 'The CPU is halted', 'The peripheral is reset'], answer: 1,
      why: 'The transfer is complete and the stream stops. The next byte waits in the UART, and any after it are lost.' },
  ],

  // ---- Architecture ----
  registers: [
    { q: 'Under the AAPCS, a function wants to use r4. What must it do?', options: ['Nothing: r4 is free to overwrite', 'Save it first and put it back before returning', 'Ask its caller', 'Use r12'], answer: 1,
      why: 'r4 to r11 are callee-saved. r0 to r3 and r12 may be overwritten freely.' },
    { q: 'Why does `pop {r4, pc}` return from a function?', options: ['pop is an alias of bx lr', 'Writing to PC is a jump, and the saved return address is loaded into it', 'r4 holds the return address', 'It raises an exception'], answer: 1,
      why: 'The function pushed LR on entry. Popping that value into PC jumps back to the caller.' },
  ],
  pipeline: [
    { q: 'What does a pipeline improve?', options: ['The time one instruction takes from fetch to done', 'How often an instruction finishes', 'The number of registers', 'Interrupt priority'], answer: 1,
      why: 'Each instruction still passes through every stage. Once the pipeline is full, one finishes every cycle.' },
    { q: 'Why do microcontrollers keep the pipeline short?', options: ['Long pipelines cannot run Thumb code', 'A short pipeline costs fewer cycles when it is thrown away and refilled', 'Flash is too slow for more stages', 'It leaves room for more registers'], answer: 1,
      why: 'A long pipeline buys clock speed but costs more on every taken branch and interrupt.' },
  ],

  // ---- C for embedded ----
  keywords: [
    { q: 'What does `static` do to a variable declared outside any function?', options: ['Makes it constant', 'Limits its name to that file', 'Puts it on the stack', 'Makes it volatile'], answer: 1,
      why: 'Outside a function, static is about visibility. Inside one, it means the variable outlives the call.' },
    { q: 'Where does a global `const` table usually end up on a microcontroller?', options: ['.data, in SRAM', '.bss, in SRAM', 'Flash', 'The stack'], answer: 2,
      why: 'Read-only data is read in place from Flash, which is usually much larger than SRAM.' },
  ],
  integers: [
    { q: 'With `uint8_t a = 200, b = 100;`, what is `a + b` before it is stored anywhere?', options: ['44', '300', '255', 'Undefined'], answer: 1,
      why: 'Both are promoted to int before the add. Only storing the result back into a uint8_t wraps it to 44.' },
    { q: 'A signed `-1` is compared with an unsigned `1u`. What happens?', options: ['−1 is less, as expected', '−1 is converted to unsigned and becomes a huge value', 'A compile error', 'Both are converted to long long'], answer: 1,
      why: 'When signed and unsigned meet, the signed value is converted to unsigned, so −1 becomes 0xFFFFFFFF.' },
  ],
  structs: [
    { q: 'Why should structs not be compared with `memcmp`?', options: ['memcmp is slow', 'Padding bytes hold whatever was there before', 'Structs are stored out of order', 'It compares only the first field'], answer: 1,
      why: 'Two structs with equal fields can differ in their padding.' },
    { q: 'Why do vendor headers use `uint32_t` registers and masks, not bit fields?', options: ['Bit fields are slower to compile', 'Bit order and access width are up to the compiler, and every write is a read-modify-write', 'Bit fields cannot be volatile', 'Masks use less Flash'], answer: 1,
      why: 'The layout is not portable, and a read-modify-write at a width the compiler picks can clear write-1-to-clear flags.' },
  ],
  pointers: [
    { q: 'In `const uint8_t *p`, what is protected?', options: ['The pointer p cannot change', 'The bytes p points to cannot be changed through p', 'Both', 'Neither'], answer: 1,
      why: 'Read from the name outward: p is a pointer to const bytes. `uint8_t *const p` is the other way round.' },
    { q: 'What is the safe way to read a `uint32_t` out of a byte buffer at any offset?', options: ['`*(uint32_t *)buf`', '`memcpy(&value, buf, 4)`', 'A packed bit field', '`(uint32_t)buf`'], answer: 1,
      why: 'The cast can fault on a misaligned address and breaks strict aliasing. The compiler turns the memcpy into the best load the processor allows.' },
  ],

  // ---- Compilers ----
  linking: [
    { q: 'What does a Thumb `bl` instruction hold?', options: ['The absolute address of the function', 'The distance from itself to the function', 'An index into the vector table', 'A symbol name'], answer: 1,
      why: 'The call is relative. The linker fills in the distance once it knows where both ends are.' },
    { q: 'A global `counter = 40` runs in SRAM. Where is the 40 at power-up?', options: ['Already in SRAM', 'In Flash, at the load address, until startup copies it', 'In a register', 'Nowhere: the compiler emits code to set it'], answer: 1,
      why: 'SRAM is empty at power-up, so the value is stored in Flash and copied before main.' },
  ],
  'linker-script': [
    { q: 'What does `.data` cost?', options: ['Its size in Flash only', 'Its size in SRAM only', 'Its size twice: once in Flash and once in SRAM', 'Nothing'], answer: 2,
      why: 'The starting values are stored at the load address in Flash and copied to the run address in SRAM.' },
    { q: 'A buffer is too big for SRAM. When do you find out?', options: ['At run time, as a crash', 'At link time, as an error', 'At compile time', 'Never'], answer: 1,
      why: 'The linker checks every region against the sizes in the MEMORY block.' },
  ],
  mapfile: [
    { q: 'In the map, `main` is at 0x08000000 but its symbol reads 8000001. Why?', options: ['An off-by-one in the linker', 'The low bit is the Thumb bit', 'The symbol is the function’s second byte', 'It is the load address'], answer: 1,
      why: 'A function’s address in Thumb code has its lowest bit set.' },
    { q: 'Which flags let the linker drop unused functions one at a time?', options: ['`-O2`', '`-ffunction-sections -fdata-sections` with `--gc-sections`', '`-Map`', '`-static`'], answer: 1,
      why: 'Each function gets its own section, and the linker drops any section nothing reaches.' },
  ],
  optimize: [
    { q: 'Which level is for stepping through code in a debugger?', options: ['`-O0`', '`-O2`', '`-Os`', '`-O3`'], answer: 0,
      why: 'At -O0 every variable has a home in memory and every line has its own instructions.' },
    { q: 'Under the as-if rule, what must the optimizer preserve?', options: ['Every variable in memory', 'The order of every instruction', 'Observable behavior: volatile accesses, output, and the result', 'The size of the code'], answer: 2,
      why: 'Everything else is fair game: variables can live in registers or vanish, and loops can be rewritten.' },
  ],
  volatile: [
    { q: 'Without `volatile`, what may the compiler do to `while (!ready);`?', options: ['Read ready once and loop forever', 'Refuse to compile it', 'Insert a delay', 'Disable interrupts'], answer: 0,
      why: 'Nothing in the loop writes ready, so as far as the compiler can tell the first read is the value on every pass.' },
    { q: 'Which of these does `volatile` not do?', options: ['Keep every read in the source', 'Keep every write in the source', 'Make `count++` atomic', 'Keep the accesses in order'], answer: 2,
      why: 'A volatile increment is still a separate load, add and store that an interrupt can land between.' },
  ],
  ub: [
    { q: 'Why can the compiler delete `if (x + 1 < x)` for a signed `x`?', options: ['It is a syntax error', 'Signed overflow is undefined, so it assumes x + 1 is always larger', 'x is promoted to unsigned', 'It cannot'], answer: 1,
      why: 'The compiler only has to get the defined cases right, and in those the condition is always false.' },
    { q: 'Which is defined behavior?', options: ['`1 << 31`', '`1u << 32` on a 32-bit type', 'Unsigned arithmetic wrapping past its maximum', 'Reading a float through a `uint32_t *`'], answer: 2,
      why: 'Unsigned arithmetic wraps by definition. The other three are undefined.' },
  ],

  // ---- Power and clocks ----
  'clock-tree': [
    { q: 'A PLL has a 12 MHz reference, REFDIV = 1 and FBDIV = 125. What does its VCO run at?', options: ['125 MHz', '1500 MHz', '150 MHz', '96 kHz'], answer: 1,
      why: 'The VCO settles at reference × FBDIV = 12 MHz × 125. The post dividers then bring it down.' },
    { q: 'Why does the RP2350 boot from an internal ring oscillator and not from a PLL?', options: ['The ring oscillator is more accurate', 'So a bad PLL setting cannot stop it from starting', 'PLLs cannot run at boot voltage', 'To save Flash'], answer: 1,
      why: 'It moves onto a PLL only once software has set one up.' },
  ],
  'sleep-modes': [
    { q: 'What is the difference between stopping a clock and cutting the power?', options: ['None', 'Stopping a clock keeps state but still leaks; cutting power saves more and loses the state', 'Stopping a clock loses state', 'Cutting power is quicker to wake from'], answer: 1,
      why: 'A circuit with no clock still leaks. Removing its supply saves that too, and whatever it stored is gone.' },
    { q: 'After waking from a P1 state on the RP2350, where does the code carry on?', options: ['Where it stopped', 'Through the boot path', 'In the interrupt handler', 'At main’s last line'], answer: 1,
      why: 'The processors were off, so the chip boots again. Anything needed afterwards must be in a retained SRAM.' },
  ],
  'battery-life': [
    { q: 'A device draws 10 mA for 1 s, then 10 µA for 99 s, and repeats. What is its average current?', options: ['About 5 mA', 'About 110 µA', 'About 10 µA', 'About 1 mA'], answer: 1,
      why: '(10 mA × 1 s + 10 µA × 99 s) / 100 s ≈ 100 µA + 10 µA.' },
    { q: 'In that device, which change saves more?', options: ['Halving the sleep current', 'Halving the time awake', 'They save the same', 'Neither matters'], answer: 1,
      why: 'The active term is about 100 µA of the 110 µA average and the sleep term about 10 µA, so the time awake dominates.' },
  ],
  brownout: [
    { q: 'Why does a chip hold itself in reset when its supply sags?', options: ['To save power', 'Logic keeps running with marginal timing and can corrupt memory', 'To recharge the capacitors', 'The crystal stops'], answer: 1,
      why: 'Digital logic does not stop cleanly at a low voltage: it misreads Flash and corrupts data.' },
    { q: 'What is the risk of a brown-out threshold set too high?', options: ['The chip runs outside its specified voltage', 'Normal supply ripple resets the chip', 'Flash wears out', 'The detector slows down'], answer: 1,
      why: 'Too low runs the chip on a voltage it is not specified for. Too high turns ordinary ripple into resets.' },
  ],

  // ---- Drivers ----
  'register-layer': [
    { q: 'Why do vendor register structs contain members such as `RESERVED0[2]`?', options: ['For future features', 'To keep each register’s offset matching the gaps in the memory map', 'To align the struct to a cache line', 'For debugging'], answer: 1,
      why: 'The struct is laid over the registers, so every gap in the manual needs a member of the same size.' },
  ],
  hal: [
    { q: 'Which kind of HAL boundary lets several devices sit behind one interface and be chosen while the program runs?', options: ['Macros in a header per chip', 'One .c file per chip, chosen by the build', 'A struct of function pointers', 'Inline functions'], answer: 2,
      why: 'Compile-time and link-time boundaries fix the choice in the build. Function pointers decide at run time, at the cost of an indirect call.' },
    { q: 'Most projects never change chips. What is a HAL still good for?', options: ['Faster code', 'Running the logic on a PC with a fake GPIO, so it can be unit tested', 'A smaller image', 'Fewer interrupts'], answer: 1,
      why: 'A boundary between logic and registers lets the logic be tested away from the hardware.' },
  ],
  'ring-buffer': [
    { q: 'How many bytes can an 8-slot ring buffer of this design hold?', options: ['8', '7', '6', '4'], answer: 1,
      why: 'One slot stays empty, so that head equal to tail can only mean empty.' },
    { q: 'Why do the interrupt and the main loop need no lock here?', options: ['The buffer is volatile', 'Each index has one writer, and the byte is stored before head moves', 'Interrupts are off during get', 'The buffer is a power of two'], answer: 1,
      why: 'Only the interrupt changes head and only the main loop changes tail, and the reader never sees a slot that is not yet filled.' },
  ],
  'uart-driver': [
    { q: 'At 115200 baud with 8N1 framing, about how long does one byte take?', options: ['8.7 µs', '86.8 µs', '868 µs', '1 ms'], answer: 1,
      why: 'Ten bit times per byte: 10 / 115200 s ≈ 86.8 µs.' },
    { q: 'A UART has a 32-entry FIFO at 115200 baud. About how long can interrupts stay off before a byte is lost?', options: ['86.8 µs', '2.8 ms', '32 ms', '1 s'], answer: 1,
      why: 'The FIFO’s depth times the byte time: 32 × 86.8 µs ≈ 2.8 ms.' },
  ],
  'dma-driver': [
    { q: 'A circular DMA buffer is doubled in size. What changes?', options: ['The deadline doubles and so does the latency', 'The deadline halves', 'The data rate doubles', 'Nothing'], answer: 0,
      why: 'Each half takes twice as long to fill, so the code has longer to process it, and data waits longer before anyone looks at it.' },
    { q: 'A message ends in the middle of a half. How does a UART driver learn it has arrived?', options: ['It cannot', 'An idle-line interrupt, then reading the DMA’s remaining count', 'By polling the buffer for zeros', 'The half-transfer interrupt fires early'], answer: 1,
      why: 'The idle-line interrupt says the line went quiet, and the remaining-count register says how many bytes have landed.' },
  ],

  // ---- Protocols ----
  uart: [
    { q: 'With 8N1, how many bits are on the wire for each byte of data?', options: ['8', '9', '10', '11'], answer: 2,
      why: 'A start bit, eight data bits and a stop bit, so a fifth of the bandwidth is framing.' },
    { q: 'What does the receiver use as its timing reference for each byte?', options: ['A shared clock wire', 'The falling edge of the start bit', 'The stop bit', 'The parity bit'], answer: 1,
      why: 'There is no clock line. The receiver times every bit of the byte from the start bit’s falling edge.' },
  ],
  spi: [
    { q: 'How many wires does an SPI controller need for three targets?', options: ['4', '5', '6', '12'], answer: 2,
      why: 'SCLK, MOSI and MISO are shared, plus one CS line per target: 3 + 3.' },
    { q: 'No target is connected. What does the controller see?', options: ['A NACK', 'A timeout error', 'Whatever level is on MISO, usually all 1s or all 0s', 'A bus fault'], answer: 2,
      why: 'SPI has no acknowledgment, so the controller clocks in whatever the line happens to hold.' },
  ],
  i2c: [
    { q: 'Why are rising edges on an I²C bus slow?', options: ['The controller limits the slew rate', 'Devices only pull low, and a pull-up resistor has to charge the bus capacitance', 'The clock is stretched on every bit', 'The edges are filtered in software'], answer: 1,
      why: 'The drive is open-drain: nothing drives the line high, so the resistor does it, at a rate set by R and the capacitance.' },
    { q: 'What does an ACK after a byte confirm?', options: ['That the byte was correct', 'That the byte was received', 'That the checksum matched', 'That the target is not busy'], answer: 1,
      why: 'An ACK says only that a device took the byte. Plain I²C has no checksum.' },
  ],
  can: [
    { q: 'Two CAN nodes start sending at the same moment. Which frame gets through?', options: ['Neither: both back off and retry', 'The one with the lower identifier', 'The one with the higher identifier', 'The one that started first'], answer: 1,
      why: 'A dominant 0 overrides a recessive 1, so the node sending the lower identifier wins without losing a bit.' },
    { q: 'Why is the bit rate of a CAN bus tied to its length?', options: ['Long cables attenuate the clock wire', 'During arbitration every node has to see each bit within its bit time', 'Termination resistors limit the current', 'The CRC takes longer to compute'], answer: 1,
      why: 'Nodes compare what they send with what they read back, so a bit must cross the whole bus within one bit time.' },
  ],
};
