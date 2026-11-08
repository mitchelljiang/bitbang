---
id: pointers
title: "Pointers"
section: C for embedded
group: Data in memory
source: src/topics/pointers.ts
url: ?p=pointers
---
# Pointers

## Intro
A pointer is a 4-byte address, and its type says what to expect there: how many bytes to read, and how far + 1 moves. By the time the code runs, the type is gone and only the size and the arithmetic are left. Pick an example and click a line to see what each part becomes.

## Reading the declaration

Where const goes changes what it protects. Read a declaration from the name outward:

- const uint8_t *p: p points to bytes this code may not change, but p itself can move on. Use it for a buffer a function only reads.
- uint8_t *const p: p can never point anywhere else, but the bytes it points to can change.
- const uint8_t *const p: neither can change.
- volatile uint32_t *p: every access through p must really happen, which is the type for a hardware register. uint32_t *volatile p is different: there, the pointer variable itself is what may change.

## Arrays and pointers

An array name turns into a pointer to its first element almost everywhere, including when it is passed to a function, which is why a function cannot tell how long an array is: pass the length too. sizeof is the exception. On the array itself it gives the whole size; on a parameter declared uint32_t a[] it gives 4, the size of a pointer. Reading or writing past the end is not caught; on the stack it leads to a buffer overflow.

## Casts that bite

Casting a uint8_t * to uint32_t * and reading through it is a common way to parse a packet, and it is wrong twice. If the address is not a multiple of 4, a Cortex-M0+ faults; and reading an object through a pointer to a different type breaks the strict aliasing rule, so the optimizer may assume the two do not overlap. Use memcpy(&value, buf, 4), which the compiler turns into the best load the processor allows.

## Function pointers

Tables of function pointers are how C does dispatch: command tables, state machines and driver interfaces. A function’s address in Thumb code has its lowest bit set, the Thumb bit, which the linker adds. blx reads it to stay in Thumb state, and the entries in the vector table have it too.
