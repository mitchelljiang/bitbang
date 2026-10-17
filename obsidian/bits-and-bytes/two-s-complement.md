---
id: twos
title: "Two’s complement"
section: Bits and bytes
group: Start here
source: src/topics/numbers.ts
url: ?p=twos
---
# Two’s complement

## Intro
The same eight bits can be read as an unsigned number from 0 to 255, or as a signed one from −128 to 127. In two’s complement, the top bit is worth −128 instead of 128; everything else is unchanged. Click the bits, type a value, or negate it.

## Why it works

Adding a number and its negation must give zero. Inverting every bit of x gives a pattern that adds to x as 1111 1111, and adding 1 more carries out of the top bit, leaving 0000 0000. So −x is ~x + 1, and the same adder circuit handles signed and unsigned numbers alike.

Converting a value that does not fit, such as 178, to int8_t is implementation-defined in C. GCC, Clang and most embedded compilers keep the bits and reinterpret them, as shown here.
