---
id: addressing
title: "Addressing"
section: Architecture
group: Instruction set
source: src/topics/addressing.ts
url: ?p=addressing
---
# Addressing

## Intro
Arm processors only touch memory with loads and stores, and everything else works on registers. So every read of a variable, a field or an array element comes down to one question: how does the instruction say which address? There are a few ways, and each has limits, because the answer has to fit in the instruction’s bits.

## From C to an address

| In C | Clang, Cortex-M0+, -Os |
| --- | --- |
| p->c, where c is at offset 8 | ldr r0, [r0, #8] |
| a[i] of int | lsls r1, r1, #2, then ldr r0, [r0, r1] |
| s[i] of char | ldrb r0, [r0, r1] |
| a local on the stack | ldr r0, [sp, #4] |
| a global | ldr r0, .LCPI0_0, then ldr r0, [r0] |

A global takes two loads. The instruction has no room for a 32-bit address, so the compiler stores the address beside the code, loads it PC-relative, and then loads through it.

## Why the limits fall where they do

An offset field counts in units of the access size, because an aligned word is always a multiple of 4 bytes away. That turns the 5 bits of a load into a reach of 124 bytes rather than 31. It is also a reason to put a struct’s most-used fields first: past the reach, the compiler needs another instruction. See structs.

The 32-bit forms in Thumb-2 are bigger, so they have room for a full register and shift, or for a write-back bit. The Cortex-M0+ has only the 16-bit forms, plus bl and a few system instructions.
