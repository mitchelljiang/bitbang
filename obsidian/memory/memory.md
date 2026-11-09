---
id: memory-start
title: "Memory"
section: Memory
group: Start here
source: src/topics/memory-start.ts
url: ?p=memory-start
---
# Memory

## Intro
On a microcontroller the program, its variables and every hardware register share one range of addresses. This section maps that range, follows the stack as functions call each other, shows where globals and the heap live, then looks at the hardware underneath: the memory cells, the caches, and the virtual memory that larger processors add.
Start with Memory map →

- 1 The address space Where code, data and hardware live, each at its own range of addresses. Memory mapFlash, SRAM, peripherals and system space, and what lives at each address. Memory-mapped I/OWhy writing to an address can switch on an LED, and what volatile is for. Buses and the bus matrixHow the core, DMA and memories share one interconnect, and who waits when two want the same memory. AlignmentWhy a 32-bit value belongs at a multiple of 4, and where struct padding comes from.
- 2 The call stack How a program keeps track of the functions it is in the middle of. The stackThe stack pointer, push and pop, why it grows down, and what lives on it. Stack framesThe activation record of each call: saved registers, locals and the frame pointer. Function callsThe calling convention: arguments, return values, LR and saved registers. Buffer overflowHow writing past a stack array overwrites the return address, and what stops it. Stack overflowWhat a runaway stack overwrites, and how firmware detects it.
- 3 Where data lives Globals, constants and dynamic memory, and how they get there before main() runs. The heapmalloc and free, fragmentation, and why much firmware avoids them. Sections and startup.text, .data and .bss, the linker script, and the code that runs before main().
- 4 Memory hardware How each kind of memory stores a bit, and what that costs. SRAM, DRAM and FlashLatches, capacitors and trapped charge: speed, density, refresh and wear. CachesHits, misses and cache lines, and why DMA and caches can disagree.
- 5 Virtual memory How larger processors give every program its own address space. Virtual and physical addressesWhy a program on a PC sees its own addresses and a microcontroller does not. Page tables and the TLBTranslating an address one level at a time, and caching the result. MPU and MMUProtection without translation, and protection with it.

## Before you start

The pages build on a few from other sections. If any of these is new, read it first:

- Binary and hexadecimal: addresses are written in hex.
- Endianness: multi-byte values are stored a byte at a time.
- Instructions: the stack pages follow real Thumb instructions.

## Reading the diagrams

Memory panels are drawn like a bench instrument. Address maps put high addresses at the top, as a datasheet does, so the stack grows down the screen. Gold marks what is selected or current, mint what is valid, and coral a fault. Pages with Step and Play walk through one access or one call at a time.

## Words this section uses

- Address: The number of one byte of memory. A 32-bit address reaches 4 GiB. See Memory map.
- Memory map: Which address ranges are Flash, SRAM, peripherals and the core’s own registers. See Memory map.
- Flash: Memory that keeps its contents with the power off. It holds the program, at 0x0800_0000 on an STM32. See SRAM, DRAM and Flash.
- SRAM: The working memory for variables and the stack, at 0x2000_0000 on an STM32. See SRAM, DRAM and Flash.
- Memory-mapped register: A peripheral’s control or status register, at a fixed address and read and written like a variable. See Memory-mapped I/O.
- Stack: The region where each call keeps its return address, saved registers and locals. It grows down. See The stack.
- Heap: Memory handed out while the program runs, by malloc, and given back by free. See The heap.
- Alignment: Placing a value at an address that is a multiple of its size. See Alignment.
- Cache: A small, fast copy of recently used memory, kept next to the CPU. See Caches.

## After this section

Carry on to Peripherals: the hardware blocks beside the processor: pins, timers, PWM, the ADC and DMA, register by register.
