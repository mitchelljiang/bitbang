---
id: optimize
title: "Optimization levels"
section: Compilers
group: Optimization
source: src/topics/optimize.ts
url: ?p=optimize
---
# Optimization levels

## Intro
The same C can become very different code. -O0 translates each line on its own; -O1 and -O2 optimize harder for speed; -Os optimizes for size. All of them must do exactly what the C says, but only what it says. Switch levels and compare.

## What each level is for

-O0 is for debugging. Every variable has a home in memory and every line has its own instructions, so a breakpoint on any line works and every variable can be read. It is also slow and large: sum is 54 bytes against 22 at -Os.

-O2 is the usual choice for speed. It unrolls loops, inlines small functions and schedules instructions around each other, often making the code larger. -Os does most of the same analysis but refuses anything that grows the code, which matters when the whole program must fit in 64 KiB of Flash. -O3, not shown, goes further than -O2 and is rarely worth it on a microcontroller.

## The as-if rule

The C standard lets the compiler produce any code that behaves as if it ran the program as written, where behavior means the values of volatile objects, the data written to files and devices, and what the program returns. Everything else is fair game: variables can live in registers or vanish, loops can be rewritten as formulas, and calls can be inlined. That is why an optimized build is hard to step through in a debugger, and why the volatile and undefined behavior pages matter.

## Helper functions

The Cortex-M0+ has a 32-bit multiply but no divide and no 64-bit multiply, so the compiler calls helpers from its runtime library, such as __aeabi_lmul and __aeabi_idiv, for those. A divide by a constant power of two never needs one: it becomes a shift.
