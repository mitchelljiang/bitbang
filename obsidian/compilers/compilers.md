---
id: compilers-start
title: "Compilers"
section: Compilers
group: Start here
source: src/topics/compilers-start.ts
url: ?p=compilers-start
---
# Compilers

## Intro
Between the C you write and the bits in Flash sit four programs: the preprocessor, the compiler, the assembler and the linker. This section follows one small program through each of them, then looks at what the optimizer is allowed to change, and why volatile and undefined behavior matter so much on a microcontroller.
Start with Preprocessor →

- 1 The build The steps that turn a .c file into a program the chip can run. Preprocessor#include, #define and #if: the text the compiler actually sees. CompilingOne C function and the assembly it becomes, line by line. Object filesSections, symbols and relocations: what an .o file holds before linking. LinkingHow the linker joins object files and fixes every address.
- 2 The image What ends up in Flash, and where. Linker scriptsMEMORY and SECTIONS: placing code in Flash and data in SRAM. Map filesReading the linker’s map to find what takes up space.
- 3 Optimization What the compiler may change, and what it must keep. Optimization levelsThe same function at -O0, -O2 and -Os. volatileWhy a register read in a loop disappears without it. Undefined behaviorCode the compiler may assume never runs, and what it does with that.

## Before you start

The pages build on a few from other sections. If any of these is new, read it first:

- Instructions: the compiler’s output is instructions like these.
- Memory map: the linker places code and data at real addresses.
- Sections and startup: startup copies .data and clears .bss, which the linker set up.

## Reading the diagrams

Most pages put C on the left and what a tool made of it on the right, every line of C and its output in the same color. Click a line on either side to pick it out and read what it does. Everything shown is the real output of Clang, objdump and the LLD linker, building for a Cortex-M0+ (the Raspberry Pi Pico’s core), and the checks rebuild it to make sure it still matches.

## Words this section uses

- Toolchain: The compiler, assembler, linker and the tools around them, such as arm-none-eabi-gcc.
- Translation unit: One .c file after the preprocessor has pasted in its #includes. The compiler sees one at a time. See Preprocessor.
- Object file: The compiler’s output for one translation unit: machine code with some addresses still blank. See Object files.
- Symbol: A named function or variable that the linker can find and point to. See Object files.
- Relocation: A note in an object file saying which bytes the linker must fill in with an address. See Linking.
- Linker script: The file that tells the linker where Flash and SRAM are, and which sections go where. See Linker scripts.
- Optimization: Rewriting the code to be faster or smaller while keeping what the C standard says it must do. See Optimization levels.

## After this section

Carry on to Concurrency: how one processor does more than one thing at once: interrupts, tasks and the bugs that come from sharing data.
