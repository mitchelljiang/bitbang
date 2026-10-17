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
A microcontroller’s peripherals, its GPIO pins, timers and serial ports, are controlled through registers that live at fixed addresses, in the same address space as memory. Writing to one of those addresses does not store a value in RAM; it changes the hardware. But a pin does nothing until it is configured. Each GPIO port has a mode register that says what every pin is, and an output register that drives the ones set to output. Set the mode and the output below; an LED lights only when its pin is an output and driven high.

## Configure, then drive

Setting a bit in the output register only does something if the pin is already an output. The reset state of most pins is input (or analog), so firmware’s first job is to write the configuration registers: set the mode to output, often the output type, speed and pull-up or pull-down too, and only then write the data register. And before any of that, the port’s clock must be enabled in the RCC block, or its registers read back as zero and ignore writes entirely. Forgetting one of these steps is the classic reason a first GPIO program does nothing.

## Why volatile

A peripheral register is not an ordinary variable. Its value can change on its own, when an input pin moves or a byte arrives, and writing to it has effects the compiler cannot see. The volatile keyword on the register’s address tells the compiler that every read and write in the source must actually happen, in order. Without it, the optimiser is free to assume nothing else touches the address: it may keep the register in a CPU register, drop a read whose result looks unused, or merge two writes into one, so a routine that briefly pulses a pin could vanish entirely. Every peripheral access must go through a volatile pointer, which is why vendor headers declare the register structs volatile.

## Set and clear without read-modify-write

Changing one pin with ODR |= (1u << 12) is a read-modify-write: read the whole register, change one bit, write it back. If an interrupt changes another pin in between, that change is lost. STM32 ports have a bit set/reset register, BSRR, whose low half sets pins and whose high half clears them, each in a single write that touches no other bit, so no read is needed and nothing can be lost.

## How the address reaches the pin

The processor puts the address on the bus like any other access. The bus matrix sees that 0x4000_0000 and above belongs to the peripherals, not to RAM or flash, and routes the write to the GPIO block, which latches the bits onto its output pins. The peripheral’s registers sit at fixed offsets from its base address; vendor headers wrap them in a struct, so GPIOD->MODER and GPIOD->ODR compile to exactly these addresses.
