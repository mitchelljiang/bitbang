---
id: heap
title: "The heap"
section: Memory
group: Where data lives
source: src/topics/heap.ts
url: ?p=heap
---
# The heap

## Intro
Globals and locals have their memory decided before a function runs, but sometimes a program does not know how much it will need until it is running. The heap is the pool that malloc hands out from and free returns to, in any order. That freedom is the catch: free blocks in the middle and the space comes back in scattered pieces, so a later request can fail even when the total free space is plenty. Allocate and free below.

## Fragmentation

Every malloc must return one contiguous block. After a run of allocations and frees, the free space is broken into gaps between the blocks still in use. The total might be large, but if no single gap is big enough, the request fails: this is external fragmentation, and on a long-running system it is the quiet way a heap “fills up” while half empty. A general-purpose allocator also keeps bookkeeping next to each block and rounds sizes up for alignment, so the memory actually used is always more than the bytes asked for.

## Why much firmware avoids the heap

On a microcontroller with no virtual memory, fragmentation cannot be hidden by remapping pages, and a failed allocation deep in a long-running system is hard to recover from. So safety-critical firmware often forbids malloc after startup entirely: it allocates everything up front, or uses fixed-size memory pools, where every block is the same size so they are interchangeable and nothing fragments. The MISRA C guidelines used in automotive code ban dynamic allocation for exactly this reason.

## Garbage collection

Languages like Java, Go, Python and JavaScript do not make you call free. A garbage collector finds memory no longer in use and reclaims it automatically. The classic method is mark and sweep: start from the roots, the variables the program can reach directly, follow every reference, and mark everything found; then sweep the heap and free whatever was not marked, because nothing can reach it any more. Below, advancing the list head leaves the earlier nodes with nothing pointing at them, and a collection frees them.

Garbage collection removes a whole class of bugs, forgetting to free, freeing twice, using memory after freeing it, but it costs time and memory, and a collection can pause the program at an unpredictable moment. That pause is why hard real-time and most embedded systems do not use it, and why the languages that do work hard to make their collectors incremental and quick.
