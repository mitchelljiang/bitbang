---
id: integers
title: "Integer types"
section: C for embedded
group: Variables and types
source: src/topics/integers.ts
url: ?p=integers
---
# Integer types

## Intro
C’s integer types look interchangeable, but each choice changes the instructions. Pick an example and switch its type to compare the code Clang produces for a Cortex-M0+ at -Os. The status line says what changed and why.

## How big is an int?

C only sets minimums: an int is at least 16 bits, a long at least 32. The rest is up to the platform. On 32-bit Arm, Clang uses these sizes, in bytes:

| Type | Size | Alignment |
| --- | --- | --- |
| char | 1 | 1 |
| short | 2 | 2 |
| int | 4 | 4 |
| long | 4 | 4 |
| long long | 8 | 8 |
| float | 4 | 4 |
| double | 8 | 8 |
| void * | 4 | 4 |
| enum mode | 4 | 4 |
| _Bool | 1 | 1 |

On an 8-bit AVR an int is 2 bytes, and on a 64-bit PC a long is usually 8. For registers, protocols and anything stored or sent, use the exact-width types from <stdint.h>: uint8_t, int16_t, uint32_t. Plain char may be signed or unsigned; on bare-metal Arm it is unsigned and on x86 signed, so use uint8_t for bytes.

## Promotion

Before any arithmetic, C converts anything smaller than int to int. So uint8_t a = 200, b = 100; gives a + b == 300, and only storing it back into a uint8_t wraps it to 44. It also catches shifts: (uint8_t)0x80 << 24 is an int, and shifting a 1 into its sign bit is undefined behavior. Write (uint32_t)x << 24.

## Signed or unsigned

Unsigned arithmetic wraps around by definition: 0 − 1 is 0xFFFFFFFF. Signed overflow is undefined, so the compiler may assume it never happens. When signed and unsigned values meet, the signed one is converted to unsigned, which turns small negative numbers into huge positive ones. Keep each comparison to one kind, and turn on -Wall -Wextra, which warns about mixing them.
