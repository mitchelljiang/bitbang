import type { Category } from './catalog';

/** Memory topics, grouped for the section sidebar. Pages with an interactive page are registered in src/topics. */
export const memoryTopics: Category[] = [
  {
    id: 'space',
    name: 'The address space',
    blurb: 'Where code, data and hardware live, each at its own range of addresses.',
    entries: [
      { id: 'memmap', name: 'Memory map', blurb: 'Flash, SRAM, peripherals and system space, and what lives at each address.' },
      { id: 'mmio', name: 'Memory-mapped I/O', blurb: 'Why writing to an address can switch on an LED, and what volatile is for.' },
      { id: 'interconnect', name: 'Buses and the bus matrix', blurb: 'How the core, DMA and memories share one interconnect, and who waits when two want the same memory.' },
      { id: 'alignment', name: 'Alignment', blurb: 'Why a 32-bit value belongs at a multiple of 4, and where struct padding comes from.' },
    ],
  },
  {
    id: 'stack-group',
    name: 'The stack',
    blurb: 'How a program keeps track of the functions it is in the middle of.',
    entries: [
      { id: 'stack', name: 'The stack', blurb: 'The stack pointer, push and pop, why it grows down, and what lives on it.' },
      { id: 'frames', name: 'Stack frames', blurb: 'The activation record of each call: saved registers, locals and the frame pointer.' },
      { id: 'calls', name: 'Function calls', blurb: 'The calling convention: arguments, return values, LR and saved registers.' },
      { id: 'overflow', name: 'Stack overflow', blurb: 'What a runaway stack overwrites, and how firmware detects it.' },
    ],
  },
  {
    id: 'data',
    name: 'Where data lives',
    blurb: 'Globals, constants and dynamic memory, and how they get there before main() runs.',
    entries: [
      { id: 'heap', name: 'The heap', blurb: 'malloc and free, fragmentation, and why much firmware avoids them.' },
      { id: 'sections', name: 'Sections and startup', blurb: '.text, .data and .bss, the linker script, and the code that runs before main().' },
    ],
  },
  {
    id: 'hardware',
    name: 'Memory hardware',
    blurb: 'How each kind of memory stores a bit, and what that costs.',
    entries: [
      { id: 'cells', name: 'SRAM, DRAM and Flash', blurb: 'Latches, capacitors and trapped charge: speed, density, refresh and wear.' },
      { id: 'caches', name: 'Caches', blurb: 'Hits, misses and cache lines, and why DMA and caches can disagree.' },
    ],
  },
  {
    id: 'virtual',
    name: 'Virtual memory',
    blurb: 'How larger processors give every program its own address space.',
    entries: [
      { id: 'vaddr', name: 'Virtual and physical addresses', blurb: 'Why a program on a PC sees its own addresses and a microcontroller does not.' },
      { id: 'paging', name: 'Page tables and the TLB', blurb: 'Translating an address one level at a time, and caching the result.' },
      { id: 'mpu', name: 'MPU and MMU', blurb: 'Protection without translation, and protection with it.' },
    ],
  },
];
