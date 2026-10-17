---
id: tricks
title: "Bit tricks"
section: Bits and bytes
group: Bitwise operations
source: src/topics/tricks.ts
url: ?p=tricks
---
# Bit tricks

## Intro
Subtracting 1 from a number flips its lowest 1 bit to 0 and every 0 below it to 1. Combined with AND, that one fact finds, clears and counts bits in a single line of C, without a loop over every bit. Pick a trick and click the bits of x.

## Why x & (x − 1) works

Subtracting 1 borrows from the lowest 1 bit: that bit becomes 0, the zeros below it become 1s, and every bit above it stays the same. ANDing with the original keeps the bits above and clears the rest, so exactly one bit, the lowest 1, disappears. A power of two has only one 1 bit, so clearing it leaves 0. And -x in two’s complement is ~x + 1, which flips every bit above the lowest 1 and keeps that bit, so x & -x isolates it.

## Where they are used

Schedulers and interrupt controllers keep a bit per task or per pending interrupt, and find the next one with count leading zeros: Arm has a CLZ instruction, and FreeRTOS’s Cortex-M ports can use it to pick the highest-priority ready task. Popcount measures Hamming distance and parity. GCC and Clang provide __builtin_popcount, __builtin_clz and __builtin_ctz, which compile to single instructions where the processor has them, and C23 adds the same operations in <stdbit.h>.
