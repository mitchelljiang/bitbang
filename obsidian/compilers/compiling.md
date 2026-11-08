---
id: compile
title: "Compiling"
section: Compilers
group: The build
source: src/topics/compile.ts
url: ?p=compile
---
# Compiling

## Intro
The compiler turns each C function into instructions for one processor. Here that is Clang building for a Cortex-M0+, the core in the Raspberry Pi Pico, with -Os, the size setting most firmware ships with. Pick a function, then click a line of C to find its instructions, or an instruction to see what it does and where it came from.

## From C to instructions

A compiler works in stages. It splits the text into tokens and parses them into a tree; checks the types; lowers the tree into a simple intermediate code with unlimited registers; optimizes that; and finally picks real instructions, assigns the processor’s registers to the values, and writes the assembly. Only the last step knows about Arm: the same front end and optimizer serve RISC-V and x86.

## The calling convention

Every function here follows the Arm procedure call standard, AAPCS. The first four arguments arrive in r0 to r3 and the result goes back in r0. A function may change r0 to r3 and r12 freely, but must put r4 to r11 back as it found them, which is why sum_sq pushes r4 and r5 before using them. The return address is in lr; bx lr returns. The function calls page steps through this on the stack.

## Bytes, not text

The grey column is each instruction’s encoding, as it will sit in Flash: adds r0, r1, r0 is 0x1808. The Instructions page takes that encoding apart bit by bit. A .word is not an instruction but data: a constant too big for a 16-bit instruction, placed after the code and read with ldr. The nop before it is padding, so the word is 4-byte aligned.

Labels such as .LBB0_2 are names the compiler invents for the targets of its branches. They do not reach the object file; in the bytes, a branch holds the distance to its target.
