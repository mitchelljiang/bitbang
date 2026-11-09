---
id: sections
title: "Sections and startup"
section: Memory
group: Where data lives
source: src/topics/sections.ts
url: ?p=sections
---
# Sections and startup

## Intro
A compiled program is not one blob: the linker sorts it into sections by what each part needs. Code and constants can stay in Flash and run from there, but writable globals must end up in RAM, and some of them need a copy of their starting values while others just need to be zero. The short stretch of code that runs before main() exists to set all of this up. Step through it.

## The four sections

.text is the code and .rodata the read-only constants, string literals, lookup tables, anything const; both stay in Flash and are read in place, never copied. .data is globals with a non-zero initialiser: the value lives in Flash and a writable copy lives in RAM. .bss is globals that start at zero: they take RAM but nothing in Flash, because zero does not need storing. Making a large array const keeps it out of RAM entirely, which on a part with far more Flash than RAM is often the whole game.

## Load address versus run address

This is why a section has two addresses. Its load address (LMA) is where it sits in the image burned into Flash; its run address (VMA) is where the program expects it at run time. For .text and .rodata the two are the same. For .data they differ: the linker stores the initial values in Flash but links the code to read and write the RAM copy, and the startup loop bridges the gap by copying LMA → VMA. The linker script defines these addresses and exports the symbols (_sdata, _edata, _sbss…) the startup loop uses as its bounds.

## Before main()

The reset handler does only what C assumes is already true: copy .data, zero .bss, set the stack pointer (loaded from the vector table by hardware), and run any C++ static constructors. Then it calls main(). If you have ever set a global expecting it to be zero and found garbage, the usual cause is an overwritten or skipped .bss zeroing loop, exactly this step going wrong.
