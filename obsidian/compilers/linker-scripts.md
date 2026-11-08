---
id: linker-script
title: "Linker scripts"
section: Compilers
group: The image
source: src/topics/linker-script.ts
url: ?p=linker-script
---
# Linker scripts

## Intro
The linker does not know your chip. A linker script tells it where the memory is and which sections go where. This is a minimal one for a chip with 64 KiB of Flash and 20 KiB of SRAM. Pick a program to link, and click a line of the script to see what it places.

## Memory, then sections

The MEMORY block copies the chip’s memory map from its datasheet: each region’s name, start and size. The SECTIONS block then builds the output file’s sections in order. Each line says which input sections to collect, with wildcards: *(.text*) means the .text sections, and any named .text.something, of every object file. > FLASH says which region it runs in. Sections fill a region in order, each aligned as its contents need.

## Two addresses for .data

A variable like uint32_t period = 500 must be in SRAM to be written, but SRAM forgets everything at power-off. So .data has two addresses: a run address, its VMA, in SRAM, and a load address, its LMA, in Flash, given by AT > FLASH. The 500 is stored at the LMA; the code uses the VMA. Startup copies one to the other before main, as the startup page shows. So .data costs its size twice: once in Flash and once in SRAM.

## When it does not fit

The linker checks every region. Too much code, or a buffer too big for SRAM, is a link error rather than a crash at run time. The fix is to shrink something, move it (a const table belongs in Flash), or use a bigger chip. A real script also defines symbols the startup code reads, such as _sidata, _sdata and _ebss for the copy and clear, reserves room for the stack, and places the vector table at the very start of Flash, where the processor looks for it at reset. Vendor tools generate one for each chip.
