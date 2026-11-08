---
id: volatile
title: "volatile"
section: Compilers
group: Optimization
source: src/topics/volatile.ts
url: ?p=volatile
---
# volatile

## Intro
The optimizer assumes that only the program changes memory. Hardware registers, variables shared with an interrupt, and loops meant to burn time all break that assumption. volatile tells the compiler that every read and write of an object matters and must happen, exactly as written. Toggle it and compare the code, built with Clang at -Os.

## What the compiler may assume

Inside a loop like while (!ready);, nothing writes to ready. As far as the compiler can tell, the value read on the first pass is the value on every pass, so it reads it once. The interrupt handler that sets ready is a separate function the loop never calls; the compiler cannot know it runs in between. With volatile, each access is part of the program’s observable behavior and must stay.

## Where volatile belongs

- Peripheral registers. Every register pointer in a vendor header is volatile, such as (*(volatile uint32_t *)0x40004400). A read can have effects (reading a UART’s data register takes the byte out of its FIFO), and so can a write.
- Variables an interrupt handler changes and the main loop reads, or the reverse.
- Variables changed by DMA or by another core.

## What volatile does not do

It does not make an access atomic: count++ on a volatile is still a separate load, add and store that an interrupt can land between. It does not order accesses to ordinary variables around it, and it does not stop the processor reordering memory accesses; that takes a barrier. For data shared between threads, use atomics or a lock, which also tell the compiler what it may not move.
