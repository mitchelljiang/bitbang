---
id: crc
title: "Checksums and CRC"
section: Bits and bytes
group: Arithmetic and error checking
source: src/topics/crc.ts
url: ?p=crc
---
# Checksums and CRC

## Intro
Noise can flip bits on the way from sender to receiver. Both ends compute a short value from the data, and if the receiver’s does not match the one sent, the data changed. Step through an 8-bit checksum and a CRC, then flip a bit of the data or swap two bytes to see which one notices.

## What each one catches

| Error | Parity bit | 8-bit checksum | CRC-8 |
| --- | --- | --- | --- |
| One bit flipped | Caught | Caught | Caught |
| Two bits flipped | Missed | Usually caught | Caught in short messages |
| Bytes swapped | Missed | Missed | Caught |
| A burst of up to 8 bits | Missed if even | Usually caught | Caught |

## Why a CRC is stronger

A checksum adds the bytes, and addition does not care about order, so swapped bytes give the same sum. A CRC treats the whole message as one long binary number and divides it by the polynomial, using XOR instead of subtraction; the CRC is the remainder. Every bit affects every later step, so the position of each bit matters. A polynomial with 8 bits after the leading 1 catches every error burst up to 8 bits long, and 0x07 also catches every error that flips an odd number of bits.

## Where they are used

This CRC-8 is the packet error check of SMBus, which runs on I²C. USB protects tokens with a 5-bit CRC and data with a 16-bit one, Ethernet ends every frame with a 32-bit CRC, and UART can add a single parity bit. Intel HEX files end each line with the checksum above. Many microcontrollers have a CRC unit that computes these in hardware, and software versions usually use a 256-entry table to process a byte at a time.
