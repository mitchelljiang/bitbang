---
id: endianness
title: "Endianness"
section: Bits and bytes
group: Bitwise operations
source: src/topics/ops.ts
url: ?p=endianness
---
# Endianness

## Intro
A value wider than one byte is stored in several bytes at consecutive addresses. A little-endian processor puts the least significant byte at the lowest address; a big-endian one puts the most significant byte there. This program finds out which one it runs on by pointing at a uint16_t through a uint8_t pointer and reading the bytes one at a time. This computer is little-endian.

## How the program works

x_ptr points at x as a whole value. Casting it to uint8_t * keeps the same address but changes how much each read takes: byte_ptr[0] is the byte at the lowest address, byte_ptr[1] the next one. If byte_ptr[0] is the low byte of x, the machine is little-endian. Reading any object through a character type such as uint8_t is allowed by C’s aliasing rules, so this is well defined. Pick a value whose bytes differ, such as 0x1234: if every byte is the same, both orders look alike.

## Where it matters

x86, most Arm processors and RISC-V are little-endian. Network protocols send the most significant byte first, called network byte order, so code converts with htons and ntohl, or with __builtin_bswap16 and __builtin_bswap32. Byte order also matters when a value is sent over a bus a byte at a time: USB sends multi-byte fields least significant byte first, while Ethernet sends its EtherType most significant byte first. It never matters inside a register or for shifts and masks, which work on the value, not on its bytes in memory.
