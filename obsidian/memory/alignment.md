---
id: alignment
title: "Alignment"
section: Memory
group: The address space
source: src/topics/alignment.ts
url: ?p=alignment
---
# Alignment

## Intro
Memory is read and written one aligned word at a time: the bus moves the four bytes at addresses 0–3 together, then 4–7, and so on. A multi-byte value sits naturally when its address is a multiple of its size, so it fits inside one of those words. Put it a byte off and it straddles two words, which takes two bus accesses, or on some processors faults. Move the value below and watch it cross a boundary.

## What happens when it is misaligned

A value that spans two words cannot be moved in one bus access. What the processor does then depends on the core. A Cortex-M0 or M0+ raises a HardFault immediately: it only does aligned accesses. A Cortex-M3, M4 or M7 handles a misaligned LDR or STR for you, by splitting it into two accesses, so the code still works but each such access costs extra cycles. Even there, some instructions, the load and store multiple used in function entry and exit, and the exclusive accesses used for locks, always fault when misaligned. On x86 it simply works, a little slower. So misalignment is anywhere from free to fatal; keeping to natural alignment avoids the question.

## Where struct padding comes from

The compiler keeps every member naturally aligned by inserting padding, which is why a struct can be larger than the sum of its members:

```c
struct S {
    uint8_t  a;      // offset 0
    // 1 byte of padding, so b lands on an even address
    uint16_t b;      // offset 2
    uint32_t c;      // offset 4
};                   // sizeof is 8, not 7
```

Ordering members from largest to smallest minimises the padding. Packing a struct with __attribute__((packed)) removes it, but then its members are misaligned, so reading them is slower or faults; packed structs are for matching a wire or file format, not for everyday data.
