---
id: mmio
title: "Memory-mapped I/O"
section: Memory
group: The address space
source: src/topics/mmio.ts
url: ?p=mmio
---
# Memory-mapped I/O

## Intro
A microcontroller’s peripherals, its GPIO pins, timers and serial ports, are controlled through registers that live at fixed addresses, in the same address space as memory. Writing to one of those addresses does not store a value in RAM; it changes the hardware. Here the output register of a GPIO port sits at 0x40020C14, and each bit drives a pin. Click the bits, or type a value, and watch the pins.

## Why volatile

A peripheral register is not an ordinary variable. Its value can change on its own, when an input pin moves or a byte arrives, and writing to it has effects the compiler cannot see, such as turning on an LED. The volatile keyword tells the compiler that every read and write in the source must actually happen, in order. Without it, the optimiser is free to assume nothing else touches the address: it may keep the register in a CPU register, drop a read whose result looks unused, or merge two writes into one. Toggle the setting above: with volatile off, a loop that pulses a pin high then low can be optimised away entirely, because the compiler sees the final value is unchanged.

## Set and clear without read-modify-write

Changing one pin with ODR |= (1u << 12) is a read-modify-write: read the whole register, change one bit, write it back. If an interrupt changes another pin in between, that change is lost. STM32 ports have a bit set/reset register, BSRR, whose low half sets pins and whose high half clears them, each in a single write that touches no other bit, so no read is needed and nothing can be lost.

## How the address reaches the pin

The processor puts the address on the bus like any other access. The bus matrix sees that 0x4000_0000 and above belongs to the peripherals, not to RAM or flash, and routes the write to the GPIO block, which latches the bits onto its output pins. The peripheral’s registers are laid out at fixed offsets from its base address; vendor headers wrap them in a struct, so GPIOD->ODR compiles to exactly this address.
