---
id: rmw
title: "Read-modify-write"
section: Bits and bytes
group: Bitwise operations
source: src/topics/ops.ts
url: ?p=rmw
---
# Read-modify-write

## Intro
Hardware is controlled through registers at fixed memory addresses. To change some bits of a register and leave the others alone, code reads it, changes the bits in a copy, and writes the copy back. Step through it, then turn on the interrupt to see the update an interrupt can lose.

## Why volatile

A register can change without the program writing to it, and writing to it has effects beyond storing a value. volatile tells the compiler that every read and write in the source must happen, in order. Without it, the compiler may keep the register in a processor register, merge two writes into one, or remove a read whose result looks unused.

## Avoiding the lost update

The read, the change and the write are separate instructions, and an interrupt between them can change the same register. When the main code writes its copy back, that change is erased. The fixes are to disable interrupts around the sequence, to give each register a single owner, or to use hardware that changes bits in one write. STM32 GPIO ports have a bit set/reset register, BSRR, whose low half sets output bits and whose high half clears them; the Raspberry Pi RP2040 maps every peripheral register at extra addresses that set, clear or toggle bits on a write. Many Cortex-M3 and M4 parts also have bit-banding, an alias address for every single bit.

Status registers add another trap. Many flags clear when a 1 is written to them, so a read-modify-write that writes back a flag it read as 1 clears it by accident. Datasheets mark these bits rc_w1 or W1C; write a mask with only the intended bits instead of a modified copy.
