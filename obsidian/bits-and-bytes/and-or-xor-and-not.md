---
id: bitwise
title: "AND, OR, XOR and NOT"
section: Bits and bytes
group: Bitwise operations
source: src/topics/bitwise.ts
url: ?p=bitwise
---
# AND, OR, XOR and NOT

## Intro
Bitwise operators apply one logic operation to every bit position at once, independently. Click the bits of a and b to change them, pick an operator, and watch r. Each bit of r depends only on the bits above it.

## In firmware

Where you will see AND (&) in embedded C:

```c
// Keep only the low four bits
uint8_t low = value & 0x0F;

// Test bit 3
if (flags & (1u << 3)) {
    /* bit 3 is set */
}
```
