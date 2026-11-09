---
id: flags
title: "Overflow and status flags"
section: Bits and bytes
group: Arithmetic and error checking
source: src/topics/flags.ts
url: ?p=flags
---
# Overflow and status flags

## Intro
The adder does not know whether its inputs are signed or unsigned. It produces one 8-bit result and sets flags that describe it both ways: C when the result does not fit as unsigned, V when it does not fit as signed, plus N for negative and Z for zero. Click the bits of a and b, or try a preset.

## One adder, two meanings

0x64 + 0x50 = 0xB4 is the same bit pattern either way. Read as unsigned, it is 100 + 80 = 180, which is correct, so C is clear. Read as signed, it is 100 + 80 = −76, which is wrong, so V is set. The processor sets both flags, and the instruction that follows decides which one matters: an unsigned comparison branches on C, and a signed comparison on N and V.

Arm sets C on a subtract when there is no borrow, so a − b leaves C = 1 when a ≥ b as unsigned. x86 does the opposite and sets its carry flag on a borrow. AVR also sets carry on a borrow.

## Overflow in C

Unsigned arithmetic in C wraps around by definition, so checking r < a after an add is reliable. Signed overflow is undefined behavior: the compiler may assume it never happens and remove a check written after the fact. Check before adding, or use __builtin_add_overflow in GCC and Clang, or ckd_add from C23’s <stdckdint.h>. On the 8-bit values here, C promotes a and b to int first, so the sum itself never overflows; the wrap happens when it is stored back into 8 bits.
