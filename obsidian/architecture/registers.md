---
id: registers
title: "Registers"
section: Architecture
group: Instruction set
source: src/topics/registers.ts
url: ?p=registers
---
# Registers

## Intro
Registers are where a processor does its work: a handful of 32-bit slots inside the core, read and written in a single cycle. A Cortex-M has sixteen. Their names are simple, but a set of rules decides who may change which, and that is what makes one function able to call another. Step through this real program, or click a register.

## Who saves what

There is one set of registers and many functions, so they need a contract. Arm’s, the AAPCS, splits the registers in two. r0 to r3 and r12 are caller-saved: a function may overwrite them, so a caller that needs one afterwards keeps a copy. r4 to r11 are callee-saved: a function that wants one must save it first and put it back. In the program, total needs b after a call, so it moves it into r4 and pays for that by pushing r4. scale calls nothing and uses only r0 and r1, so it saves nothing at all. The functions page shows what compilers do with this.

## Why low registers come first

A 16-bit instruction has room for 3-bit register fields, which name only r0 to r7. That is why compilers reach for the low registers first and why an instruction’s encoding decides which registers it can use. r8 to r12 are real but awkward on a Cortex-M0+: only a few instructions can touch them, and push cannot list them. Thumb-2, on the Cortex-M3 and up, adds 32-bit forms with 4-bit fields.

## Three special registers

SP, LR and PC are also r13, r14 and r15. Writing to PC is a jump, which is why pop {r4, pc} returns. LR holds one return address, so a function that calls another must save its own first, on the stack; a function that calls nothing can skip that. The flags live in a separate status register and are set by arithmetic ending in s; see flags.
