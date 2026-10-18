---
id: memmap
title: "Memory map"
section: Memory
group: The address space
source: src/topics/memmap.ts
url: ?p=memmap
---
# Memory map

## Intro
A processor has one address space, and everything it can reach has an address in it: the program in Flash, the variables in RAM, every peripheral register, even the core’s own controls. On a Cortex-M the 4 GB space is split into fixed regions, so the top bits of an address alone tell you what kind of thing it reaches. Type an address, or pick a landmark, and see which region it lands in.

## Why the map is fixed

The ARMv7-M architecture defines these regions for every Cortex-M part, so a compiler, a debugger and an operating system all agree on what an address means without asking the chip. A vendor then places its real Flash and RAM inside the Code and SRAM regions and wires its peripherals into the Peripheral region. That is why the same vector table layout and the same 0xE000E000 system registers work on parts from every manufacturer.

## Alias regions

The Code region starts at 0x00000000, but the Flash is usually also visible at 0x08000000. On reset the core fetches the initial stack pointer and reset address from address 0, so the boot configuration maps either Flash, system memory or RAM to appear there. The two addresses reach the same bytes; the alias just lets the vector table live at address 0 where the hardware expects it.

## Reading the top bits

Because the regions fall on half-gigabyte boundaries, the processor decides where an access goes from the high bits of the address, long before the full address is known. That is how one bus matrix routes a load to Flash, RAM or a peripheral: it switches on the top nibble. An address in the Peripheral region is handed to the peripheral bus; one in SRAM goes to the memory controller.
