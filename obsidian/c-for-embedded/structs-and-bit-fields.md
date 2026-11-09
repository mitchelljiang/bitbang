---
id: structs
title: "Structs and bit fields"
section: C for embedded
group: Data in memory
source: src/topics/structs.ts
url: ?p=structs
---
# Structs and bit fields

## Intro
A struct’s fields are stored in the order they are written, but not always side by side: the compiler adds padding so each field is aligned. Pick a version of the struct and compare its layout and the code that reads it. The strip under the code is drawn from Clang’s own record layout. Click a field, in the strip or in the source, to see why it sits where it does.

## Padding

Each type has an alignment, usually its size: a uint32_t starts at an address that is a multiple of 4 (the alignment page shows why). Inside a struct the compiler keeps every field aligned by inserting unused bytes before it, and pads the end so the size is a multiple of the largest alignment. Padding bytes hold whatever was there before, so never compare structs with memcmp, and clear a struct before sending it anywhere. sizeof and offsetof tell you the real numbers; _Static_assert(sizeof(struct packet) == 8, "") makes the build fail if they ever change.

## packed

A packed struct has no padding, which is what a protocol header or a file format needs. The price is that fields may be misaligned. The Cortex-M3 and M4 can load a misaligned word, slowly, but the M0 and M0+ cannot, so the compiler splits every access into bytes. Taking the address of a packed field, as in uint32_t *p = &pkt.value, is worse: the pointer forgets that it is misaligned, and the load through it faults.

## Bit fields

Bit fields are tidy for flags inside your own data. For hardware registers they are risky: the order of the bits, whether a field can cross a word, and how wide each access is are all up to the compiler and the ABI. Every write is a read-modify-write, at whatever width the compiler picks, which can clear a status bit that is cleared by writing 1. Vendor headers use plain uint32_t registers and masks instead, such as USART2->CR1 |= USART_CR1_UE (see masks and read-modify-write).

## Register maps

A struct of volatile uint32_t with no gaps lays out exactly like a block of registers, so a pointer to it at the peripheral’s base address gives every register a name. Reserved gaps in the memory map become arrays such as uint32_t RESERVED0[2], so the offsets keep matching the manual.
