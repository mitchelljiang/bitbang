---
id: barriers
title: "Memory ordering and barriers"
section: Concurrency
group: Sharing data safely
source: src/topics/barriers.ts
url: ?p=barriers
---
# Memory ordering and barriers

## Intro
A store instruction finishes long before its data arrives. It drops the write into a buffer and moves on, and writes to different places can arrive in a different order than the program made them. Usually nobody can tell. Here are four cases where somebody can: pick one, try it without a barrier, then with the barrier that fixes it.

## Why the order can change

To keep the pipeline moving, a core does not wait for a store to finish. It hands the write to a write buffer and runs the next instruction. The write then travels to its destination: a cache line, a RAM bank across the bus matrix, or a peripheral behind one or two bus bridges, and those trips take different times. The architecture defines how much reordering is allowed. Accesses to Device memory, the peripherals, stay in order with each other. Accesses to normal memory may be reordered, merged or delayed, and normal and Device accesses are not ordered with respect to each other at all. Cortex-M3 and M4 rarely exploit this; Cortex-M7, with its caches and separate memory and peripheral ports, and any multi-core chip, do.

## The three barriers

DMB orders memory accesses: everything before it is complete, as seen by everyone, before anything after it starts. That is what a lock and a DMA hand-off need. DSB is stronger: no instruction at all runs until earlier accesses are complete, which is what you need when the next thing is not a memory access, such as returning from an interrupt, sleeping with WFI, or relying on a system register you just wrote. ISB flushes the pipeline, so instructions already fetched are fetched again under the new settings; it follows a DSB after changing the MPU, the vector table, or the CONTROL register.

## Locks need both sides, and so does the compiler

Every lock pairs two barriers. Releasing it needs a DMB before the store that frees it, so the protected data is visible first; taking it needs a DMB after the successful strex, so reads of the data cannot run before the lock is held. C11 atomics with acquire and release ordering, and RTOS mutexes, emit these for you. The compiler can reorder too: volatile accesses stay in order with each other, but ordinary loads and stores may move across them. A compiler barrier, asm volatile("" ::: "memory"), stops that, and every CMSIS barrier intrinsic includes one. On a single-core Cortex-M4 the compiler barrier is usually the one that matters; on anything bigger, both do. See atomics and mutexes.
