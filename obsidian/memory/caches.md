---
id: caches
title: "Caches"
section: Memory
group: Memory hardware
source: src/topics/caches.ts
url: ?p=caches
---
# Caches

## Intro
Main memory is far slower than the processor, so between them sits a cache: a small, fast copy of the lines of memory used most recently. The processor checks the cache first; a hit is quick, a miss pays the full cost of going to memory and brings a whole line back. Some of an address’s bits pick the set of lines it may occupy, so addresses that share those bits compete for room. Pick how the same eight lines are organized, access the locations below, and watch.

## How an address is split

The low bits are the offset into a line, the next bits are the index that picks a set, and the rest are the tag stored alongside each line to say which block of memory it currently holds. A hit is when some line in the address’s set is valid and its tag matches; otherwise it is a miss, the line is fetched from memory, and if the set is full one of its lines is evicted. Fetching a whole line at once is a bet on spatial locality: nearby bytes, like the next elements of an array, will probably be wanted soon, so a[1] after a[0] is already present.

## Direct-mapped, set associative, fully associative

The organizations differ only in how many lines share a set. Direct-mapped gives every set one line, so an address has exactly one place to go: the lookup is a single tag compare, but two hot addresses that share an index knock each other out even when the rest of the cache is empty, a conflict miss. Set associative caches give each set several lines, called ways: a 2-way set holds two blocks with the same index, a 4-way set four, at the cost of comparing that many tags in parallel on every access. Fully associative is one set holding every line, so any block can go anywhere and only the cache’s total size limits it, but every tag must be checked, which is why it is kept for small structures such as the TLB. Each extra way halves the number of sets, so the index loses a bit and the tag gains one. Real L1 caches are typically 8- to 12-way, and larger caches often 16-way.

When a set is full, a replacement policy chooses which line to evict. This page uses least recently used (LRU), which evicts the line untouched for longest. Tracking exact LRU gets expensive with many ways, so hardware often approximates it (pseudo-LRU) or picks a line at random. Run a[0], b, c, d, e, then a[0] again: only the fully associative cache still has a[0], because only it can hold all five.

## Where caches sit: the memory hierarchy

A computer stacks memories from small and fast to large and slow, and each level holds copies of the data the level above is most likely to want next. The fast levels are SRAM, a latch per bit, which is quick but large and power-hungry, so there is little of it. Main memory is DRAM, a capacitor per bit: far denser, but slower and in need of constant refresh. Below that, Flash keeps data with the power off. The figures are typical for a recent desktop or laptop processor and vary between designs.

## On a microcontroller

A microcontroller flattens this hierarchy. An STM32F407 has no data cache at all: its 192 KB of SRAM, including 64 KB of core-coupled memory, answers at the full 168 MHz with no wait states, so there is nothing for a cache to hide. The slow level is the on-chip Flash that holds the program: at 168 MHz each read needs five wait states. ST puts a small accelerator, the ART, between the core and the Flash: it prefetches ahead, and holds 64 lines of 128 bits of instructions and 8 lines of data, which is a cache in all but name. Larger Cortex-M7 parts such as the STM32F7 add true L1 instruction and data caches of 4 to 16 KB each, and application processors such as a phone’s Cortex-A cores have the full L1, L2 and L3 stack above.

## Caches and DMA disagree

A cache means there can be two copies of an address: the stale one in memory and the fresh one in the cache. That is invisible until something else touches memory directly. If DMA writes a buffer, the CPU may still read the old cached copy; if the CPU writes and DMA reads before the line is written back, DMA sends stale data. Firmware handles this by cleaning the cache (flushing writes out) before a DMA read and invalidating it (dropping cached copies) after a DMA write, or by placing DMA buffers in memory marked non-cacheable. Forgetting is a classic, maddening source of intermittent DMA bugs.
