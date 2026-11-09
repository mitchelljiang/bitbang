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
Main memory is far slower than the processor, so between them sits a cache: a small, fast copy of the lines of memory used most recently. The processor checks the cache first; a hit is quick, a miss pays the full cost of going to memory and brings a whole line back. Which line an address can occupy is fixed by some of its bits, so two addresses that share those bits fight over one slot. Access the locations below and watch.

## How an address is split

The low bits are the offset into a line, the next bits are the index that picks a line, and the rest are the tag stored alongside the line to say which block of memory it currently holds. Because the index comes from fixed bits, an address has exactly one line it is allowed to live in. A hit is when that line is valid and its tag matches; otherwise it is a miss, the line is fetched from memory, and whatever was there is evicted. Fetching a whole line at once is a bet on spatial locality: nearby bytes, like the next elements of an array, will probably be wanted soon, so a[1] after a[0] is already present.

## Conflict misses and associativity

In a direct-mapped cache, two hot addresses that happen to share an index knock each other out repeatedly even when the rest of the cache is empty, a conflict miss. The fix is set associativity: give each index several lines (ways), so a few tags can share a set. A 4-way cache tolerates four conflicting addresses before it has to evict, at the cost of comparing four tags per access. Fully associative caches let any address go anywhere but must check every tag, so real caches pick a middle point.

## Caches and DMA disagree

A cache means there can be two copies of an address: the stale one in memory and the fresh one in the cache. That is invisible until something else touches memory directly. If DMA writes a buffer, the CPU may still read the old cached copy; if the CPU writes and DMA reads before the line is written back, DMA sends stale data. Firmware handles this by cleaning the cache (flushing writes out) before a DMA read and invalidating it (dropping cached copies) after a DMA write, or by placing DMA buffers in memory marked non-cacheable. Forgetting is a classic, maddening source of intermittent DMA bugs.
