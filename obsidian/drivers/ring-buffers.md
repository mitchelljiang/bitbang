---
id: ring-buffer
title: "Ring buffers"
section: Drivers
group: Moving data
source: src/topics/ring-buffer.ts
url: ?p=ring-buffer
---
# Ring buffers

## Intro
An interrupt receives bytes whenever they arrive; the main loop handles them when it can. A ring buffer sits between the two. The interrupt writes at the head, the main loop reads at the tail, and neither needs a lock. Put in some bytes, take some out, and fill it up.

## Why one slot stays empty

Head equal to tail has to mean one thing. If the buffer could fill completely, a full buffer and an empty one would both have head equal to tail. Giving up one slot makes the test simple: empty when they are equal, full when the next head would reach the tail. An 8-slot buffer holds 7 bytes.

## Why it needs no lock

Each index has one writer: only the interrupt changes head, only the main loop changes tail. And the writer stores the byte before it moves head, so the reader never sees a slot that has not been filled. On a single-core Cortex-M with word-sized indexes, volatile is enough. On multi-core chips the two steps also need the ordering guarantees of barriers or C11 atomics. With more than one writer on either side it is no longer safe: use a lock.

## Sizing it

The buffer has to hold everything that arrives during the longest time the main loop is busy. A power-of-two size also lets % N become & (N - 1), which matters on a chip with no divide instruction.
