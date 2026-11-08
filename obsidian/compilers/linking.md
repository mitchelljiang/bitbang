---
id: linking
title: "Linking"
section: Compilers
group: The build
source: src/topics/linking.ts
url: ?p=linking
---
# Linking

## Intro
Two object files go in; one program comes out. The linker decides where every section lives, works out the address of every symbol, and then goes back and fills in each blank the compiler left. Step through it.

## The program

main.c calls add and reads counter, both defined in math.c; it defines total itself. Compiled separately, each file is a relocatable object whose addresses start at 0, with three blanks in main.o. The linker script, on the next page, says that Flash starts at 0x08000000 and SRAM at 0x20000000.

## Filling in a call

A Thumb bl does not hold the address it calls; it holds the distance from itself. The processor adds that to the address of the bl plus 4 (the pipeline has already moved on). In the object file the field holds −4, so the target would be the bl itself; the linker adds the real distance: value = S + A − P, where S is the symbol’s address, A the −4 already there, and P the address of the bl. Then it re-encodes the result across the instruction’s two halfwords, split into fields named S, J1, J2, imm10 and imm11.

The distance must fit in 25 bits, ±16 MiB, which always holds within a microcontroller’s Flash. On larger chips the linker adds a small stub, a veneer, to reach further.

## Filling in an address

The addresses of counter and total are stored after main’s code, where ldr loads them from. An R_ARM_ABS32 relocation is simpler: write the symbol’s address, S + A, as four little-endian bytes. A function’s address would also get its lowest bit set, which tells the processor the target is Thumb code.

## Load address and run address

counter runs at 0x20000000 in SRAM, but SRAM is empty at power-up. So the linker stores its starting value, 40, in Flash right after the code, at its load address, and the startup code copies it over before main. total, in .bss, needs no copy: startup fills it with zero.
