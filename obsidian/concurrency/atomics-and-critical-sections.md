---
id: atomics
title: "Atomics and critical sections"
section: Concurrency
group: Sharing data safely
source: src/topics/atomics.ts
url: ?p=atomics
---
# Atomics and critical sections

## Intro
main() and a UART interrupt handler both increment count. The interrupt fires just after main() has loaded it, the worst possible moment. Choose how main() protects its increment and step through to see whether both updates survive.

## Why volatile is not enough

volatile tells the compiler that every read and write of the variable must really happen, in order, because something outside the code can see or change it. That is essential for hardware registers and for flags shared with interrupts, but it says nothing about atomicity. A volatile increment is still a load, an add and a store, and an interrupt can still land between them. The trace is identical to the unprotected one.

## Critical sections: masking interrupts

On a single core, the simplest fix is to stop interrupts for the few instructions of the update. __disable_irq() compiles to cpsid i, which sets PRIMASK; an interrupt that fires while it is set is not lost, only held pending until cpsie i. Real code saves PRIMASK first and restores it after, so that a critical section inside another does not re-enable interrupts too early. The cost is latency: every interrupt waits for the longest critical section, so keep them a few instructions long.

## LDREX and STREX

Cortex-M3 and up offer a way that blocks no one. ldrex loads a value and sets an exclusive monitor on its address; strex stores only if the monitor is still set, and reports whether it did. Anything that might have changed the value clears the monitor in between, including any exception, so the loop simply retries. This is what C11 atomic_fetch_add compiles to on these cores, with memory barriers added. Cortex-M0 has no exclusive instructions, so there atomics fall back to masking interrupts.
