---
id: masks
title: "Masks"
section: Bits and bytes
group: Bitwise operations
source: src/topics/ops.ts
url: ?p=masks
---
# Masks

## Intro
A mask is a value whose 1 bits pick out the bits an operation should touch. With the right operator, the same mask sets those bits, clears them, toggles them or tests them, and leaves every other bit of the register alone. Click the bits of reg and mask, and pick an operation.

## The four patterns

| To | In C | Why it works |
| --- | --- | --- |
| Set | reg |= mask; | x | 1 is 1, and x | 0 is x |
| Clear | reg &= ~mask; | x & 0 is 0, and x & 1 is x |
| Toggle | reg ^= mask; | x ^ 1 is the opposite of x, and x ^ 0 is x |
| Test | if (reg & mask) | nonzero exactly when a masked bit is 1 |

## Fields wider than one bit

Registers often pack several settings into one byte or word. To read a 3-bit field at bits 6 to 4, shift it down and mask it. To write one, clear the field, then OR in the new value shifted into place:

```c
uint8_t field = (reg >> 4) & 0x7u;               // read bits 6 to 4
reg = (reg & ~(0x7u << 4)) | ((val & 0x7u) << 4);  // write val there
```

Vendor headers name each field’s position and mask, such as USART_CR1_UE, so code reads as USART1->CR1 |= USART_CR1_UE; rather than a bare number.

On a hardware register each of these is a read-modify-write, which has a pitfall of its own.
