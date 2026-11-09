---
id: c-start
title: "C for embedded"
section: C for embedded
group: Start here
source: src/topics/c-start.ts
url: ?p=c-start
---
# C for embedded

## Intro
C on a microcontroller is the same language as anywhere else, but a few parts of it matter far more: where each variable is stored, how big each integer type is, how a struct is laid out in bytes, and what a pointer to a hardware register means. This section shows each of them in the code Clang produces for a Cortex-M0+, so you can see the cost of every choice.
Start with Storage keywords →

- 1 Variables and types Where a variable lives, and what its type does to the code. Storage keywordsstatic, extern and const: where a variable lives and who can see it. Integer typesSizes, promotion, and signed against unsigned in the generated code.
- 2 Data in memory How structs and pointers map onto bytes and registers. Structs and bit fieldsField order, padding, packed structs, bit fields and register maps. PointersRegister addresses, pointer arithmetic, struct members and function pointers.
- 3 Functions What a call costs, and when there is no call at all. Functionsinline, static, arguments in registers and on the stack, and passing structs.

## Before you start

The pages build on a few from other sections. If any of these is new, read it first:

- Binary and hexadecimal: sizes and addresses are in bytes and hex.
- Alignment: struct padding comes from alignment.
- Instructions: every example shows the instructions it becomes.

## Reading the diagrams

Each page puts C on the left and the assembly Clang made of it on the right, every line of C and its instructions in the same color. Click a line on either side to pick it out and read what it does. The struct page also draws the layout byte by byte, with padding hatched. All of it is real compiler output, rebuilt by the checks.

## Words this section uses

- Storage duration: How long a variable lives: for the whole program (globals, static) or for one call (locals). See Storage keywords.
- Linkage: Whether other files can see a name. static gives a global internal linkage: this file only. See Storage keywords.
- Integer promotion: Before arithmetic, C widens anything smaller than int to int. See Integer types.
- Padding: Unused bytes the compiler adds inside a struct so each field is aligned. See Structs and bit fields.
- Bit field: A struct member a given number of bits wide, packed with its neighbors into one word. See Structs and bit fields.
- Pointer: A variable holding an address. On a 32-bit chip it is 4 bytes. See Pointers.
- Inlining: Pasting a function’s body into its caller instead of calling it. See Functions.
- Calling convention: The rules for where arguments and results go. On Arm (the AAPCS): r0 to r3, then the stack. See Functions.

## After this section

Carry on to Compilers: how C becomes the instructions in Flash: the preprocessor, compiler, assembler and linker, and what optimization changes.
