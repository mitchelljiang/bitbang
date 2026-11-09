---
id: functions
title: "Functions"
section: C for embedded
group: Functions
source: src/topics/functions.ts
url: ?p=functions
---
# Functions

## Intro
A function call is a jump with rules about which registers hold what. Those rules decide what a call costs, and the optimizer may remove the call altogether. Pick an example and switch its form to compare the code Clang produces for a Cortex-M0+ at -Os.

## The calling convention

Arm’s procedure call standard (the AAPCS) is what lets separately compiled files call each other. Arguments go in r0 to r3, then on the stack. The result comes back in r0, or in r0 and r1 for 64 bits. r0 to r3 and r12 may be overwritten by any call; r4 to r11 must be saved by a function that uses them, which is why you see push {r4, r5, r7, lr}. The function calls page steps through one instruction at a time.

## inline

inline does not force inlining: at -Os or -O2 the compiler decides for itself, and often inlines without being asked. What the keyword really affects is linking. The usual form for a header is static inline, which gives each file that includes it its own private copy, with no duplicate-symbol errors. Inlining a big function in many places makes the program larger, so __attribute__((always_inline)) and noinline are there for when you must decide.

## Interrupt handlers

On a Cortex-M, an interrupt handler is an ordinary C function with no special keyword. When the interrupt arrives the hardware itself saves r0 to r3, r12, lr, pc and the status register, which are exactly the registers a C function may overwrite, and returns from a magic value in lr. So void SysTick_Handler(void) needs nothing else. Other architectures, such as AVR and some RISC-V chips, do need an attribute. See interrupts.

## Recursion and stack use

Each non-inlined call uses stack for its saved registers and locals, and SRAM is small. Avoid recursion, and keep large arrays out of locals. -fstack-usage reports each function’s stack use, and a stack overflow otherwise tends to show up as silent corruption.
