---
id: mapfile
title: "Map files"
section: Compilers
group: The image
source: src/topics/mapfile.ts
url: ?p=mapfile
---
# Map files

## Intro
Ask the linker for a map (-Map app.map) and it writes down where it put everything: every output section, every input section in it and which file it came from, and every symbol, with addresses and sizes. It is the first place to look when the program does not fit. This is the real map of a firmware in five files. Click a file, or any line.

## Reading the columns

VMA is where a thing is when the program runs, and LMA where it is stored; they differ only for .data, which runs from SRAM but is stored in Flash (see linker scripts). Size is in hex bytes, and Align the alignment the section needs. Then the name, indented by level: an output section; an input section, written file.o:(section); and the symbols inside it. A function’s address ends in 1, the Thumb bit: main is at 0x08000000 but its symbol says 8000001.

## Where the space went

Here the biggest single item is not code but crc.c’s lookup table: 256 entries of two bytes, 512 bytes of .rodata, more than all the code together. The second surprise is div.c: the M0+ cannot divide, so each unsigned / here calls __aeabi_uidiv. In a real build that comes from the compiler’s runtime library, which the map lists the same way. Library code such as printf often turns out to be the largest thing in the map.

## Throwing away what is not used

Each function and variable here was compiled into its own section, with -ffunction-sections -fdata-sections, and linked with --gc-sections. The linker starts from the entry point, follows every reference, and drops any section nothing reaches. Without those flags a whole file’s .text is one section, kept or dropped together. --print-gc-sections lists what was removed. arm-none-eabi-size app.elf gives the totals; the map gives the detail.
