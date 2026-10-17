---
id: fixed
title: "Fixed point"
section: Bits and bytes
group: Start here
source: src/topics/numbers.ts
url: ?p=fixed
---
# Fixed point

## Intro
A fixed-point number is an ordinary integer with an imaginary binary point at an agreed position. The bits after the point are worth one half, one quarter, one eighth and so on. Move the point to trade range for precision.

## Where it is used

Fixed point needs only integer hardware, so it is common on small microcontrollers without a floating-point unit, in digital signal processing, and in sensor drivers that report values such as 1/16 °C per count. Adding two values in the same format is ordinary integer addition; multiplying them doubles the fraction bits, so the product is shifted right to return to the original format.

UQ4.4 means unsigned, with 4 integer bits and 4 fraction bits. Signed formats, written Q, use two’s complement.
