---
id: shifts
title: "Shifts and rotates"
section: Bits and bytes
group: Bitwise operations
source: src/topics/ops.ts
url: ?p=shifts
---
# Shifts and rotates

## Intro
A shift moves every bit of a value left or right by the same number of places. Bits pushed off one end are lost, and new bits come in at the other: zeros, or copies of the sign bit. A rotate wraps the bits that fall off back around. Pick an operation and a distance, and click the bits of x.

## Shifting as arithmetic

Shifting left by n multiplies by 2ⁿ, and shifting an unsigned value right by n divides by 2ⁿ, rounding down. Compilers turn multiplications and divisions by constant powers of two into shifts, and firmware uses shifts to build masks such as 1u << 5 and to pull fields out of registers.

For a signed value, the right shift that copies the sign bit is an arithmetic shift. It divides by 2ⁿ rounding toward minus infinity, so −78 >> 3 is −10, not −9. Shifting a negative value right is implementation-defined in C; GCC, Clang and Arm’s compilers all copy the sign bit.

## Pitfalls in C

Shifting by the width of the type or more is undefined behavior: x << 32 on a 32-bit uint32_t can return x unchanged on one processor and 0 on another. Shifting a 1 into the sign bit of a signed int, as in 1 << 31, is undefined too, which is why masks are written with an unsigned constant, 1u << 31. And a uint8_t is promoted to int before it is shifted, so x << 3 keeps the high bits until the result is stored back into 8 bits.

C has no rotate operator. The two-shift pattern above is recognized by GCC and Clang and compiled to a single rotate instruction, and C23 adds stdc_rotate_left and stdc_rotate_right.
