---
id: bits-start
title: "Bits and bytes"
section: Bits and bytes
group: Start here
source: src/topics/bits-start.ts
url: ?p=bits-start
---
# Bits and bytes

## Intro
Everything a microcontroller handles, from a sensor reading to an instruction, is stored as bits. This section shows how a pattern of bits becomes a number, whole or fractional, signed or not; how firmware changes a few bits at a time without touching the rest; and how a receiver checks that no bit was flipped on the way.
Start with Binary and hexadecimal →

- 1 Representing numbers How a pattern of bits stands for a number. Binary and hexadecimalPlace values in base 2, and why each hex digit is four bits. Two’s complementHow signed integers are stored, and why the same adder handles both signs. Fixed pointFractions stored as integers with an implied binary point. IEEE 754 floating pointSign, exponent and mantissa, and why 0.1 + 0.2 is not 0.3.
- 2 Bitwise operations Working with individual bits inside a word. AND, OR, XOR and NOTThe logic operations applied to every bit position at once. Shifts and rotatesLogical and arithmetic shifts, and rotates that wrap bits around. MasksSetting, clearing, toggling and testing bits in a register. Bit tricksOne-line idioms that find, clear and count bits, such as x & (x - 1). Read-modify-writeChanging some bits of a hardware register without disturbing the rest. EndiannessThe order in which the bytes of a multi-byte value are stored.
- 3 Arithmetic and error checking What happens when a result does not fit, and how data is checked for errors. Overflow and status flagsCarry, overflow, negative and zero, and why one adder needs both C and V. Checksums and CRCHow a receiver detects flipped bits, and why a CRC catches errors a checksum misses.

## Before you start

Nothing beyond a little C: variables, int and unsigned, and the idea that a computer stores numbers in binary. This is the place to begin the whole site.

## Reading the diagrams

Each panel shows a value as a row of bits, the most significant on the left. Click a bit to flip it, and the value in every other form, decimal, hex or signed, follows. Bits that just changed are outlined, and hovering a bit says what it is worth.

## Words this section uses

- Bit: One binary digit, 0 or 1. See Binary and hexadecimal.
- Byte: Eight bits. Memory addresses count bytes. See Binary and hexadecimal.
- Word: 32 bits on a Cortex-M: the width of a register. See Binary and hexadecimal.
- Hex digit: Four bits written as one digit, 0 to 9 then A to F, so 0xB2 is the byte 1011 0010. See Binary and hexadecimal.
- MSB and LSB: The most and least significant bits: the one with the highest place value, drawn on the left, and the one with the lowest. See Binary and hexadecimal.
- Signed: A value whose top bit counts as negative, in two’s complement. See Two’s complement.
- Mask: A value whose 1 bits pick which bits an operation touches. See Masks.
- Endianness: Which byte of a multi-byte value comes first in memory. Arm microcontrollers are almost always little-endian. See Endianness.
- CRC: A check value computed from the data, which the receiver computes again to detect flipped bits. See Checksums and CRC.

## After this section

Carry on to Protocols: how chips and devices talk to each other over wires, from UART and SPI to USB and PCI Express, with the timing of every edge.
