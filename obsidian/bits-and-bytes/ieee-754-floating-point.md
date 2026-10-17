---
id: float
title: "IEEE 754 floating point"
section: Bits and bytes
group: Start here
source: src/topics/numbers.ts
url: ?p=float
---
# IEEE 754 floating point

## Intro
A float stores a sign bit, an 8-bit exponent and a 23-bit fraction. The value is ±1.fraction × 2 to the power of exponent − 127, so it covers a huge range with about seven significant digits. Type a number, pick one below, or click the bits.

## Why 0.1 + 0.2 is not 0.3

Most decimal fractions have no exact binary form, just as 1/3 has no exact decimal form. 0.1 is stored as the nearest float, 0.100000001490116119384765625, so small errors appear when such values are added and compared. Compare floats with a tolerance, or use integers or fixed point for exact quantities such as money or counts.

Exponent 0 marks zero and subnormal numbers, which drop the leading 1 to reach values closer to zero. Exponent 255 marks infinity (fraction 0) and NaN, “not a number” (any other fraction).

## Quake III’s fast inverse square root

Lighting in a 3D game needs 1/√x constantly, to scale vectors to length 1. In 1999, a square root and a division were slow, so Quake III Arena computed an approximation with integer arithmetic on the float’s bits, followed by one refining step. The trick is often credited to John Carmack, but it was in use earlier; its history traces back to Greg Walsh and others.

It works because a float’s bits, read as an integer, are roughly a scaled and shifted log₂ of its value: the exponent field is the logarithm’s whole part, and the fraction is a rough linear stand-in for the rest. Taking 1/√x halves the logarithm and negates it, so the code shifts the bits right by one and subtracts them from a constant, 0x5F3759DF, chosen to undo the shift and offset. That lands within about 3.5% of the answer, and one Newton–Raphson step brings it within about 0.18%.

The comments are the original’s, as released with the Quake III Arena source code in 2005; the values in parentheses are this run’s. The original reads the bits with pointer casts, i = *(long *)&y;, which break C’s strict aliasing rule and are undefined behavior in modern compilers; long is also 64 bits on many systems today. The version above uses memcpy and uint32_t instead, which compilers turn into the same single instruction. Modern processors also have their own reciprocal square root instructions, so the trick is now mostly a lesson in how floats are stored.
