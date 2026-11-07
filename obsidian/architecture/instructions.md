---
id: instructions
title: "Instructions"
section: Architecture
group: Instruction set
source: src/topics/instructions.ts
url: ?p=instructions
---
# Instructions

## Intro
A program in Flash is a list of numbers, and each one is an instruction: a few bits that say what to do, and the rest saying to what. Which bits mean what is the chip's instruction set. Pick one of the three found on common microcontrollers, then an instruction, and click its operand bits: the assembly, the hex word and the bytes that sit in memory all follow. The opcode bits, with a dashed outline, are what make it that instruction.

## Fields packed into bits

The processor decodes an instruction by looking at a few fixed bits first. They pick the instruction; the bits around them are fields whose meaning that instruction defines. In Thumb's movs r3, #42 the top five bits, 00100, say "move an 8-bit constant", the next three name the register, and the low eight are the constant itself. Because every field has a fixed position, the hardware can pull all of them out at once, in the same cycle, with no searching.

## Three instruction sets

Arm Thumb is what every Arm Cortex-M runs: the STM32 family, the Raspberry Pi Pico's RP2040, and most other Arm microcontrollers. The common instructions are 16 bits, and Thumb-2 adds 32-bit ones for everything else. Arm's phone and desktop chips use a different, fixed 32-bit encoding, so their bits will not match these. RISC-V is an open instruction set, run by the ESP32-C3 and C6 and by the Pico 2's RP2350, which can boot either its Arm or its RISC-V cores. Its base instructions are 32 bits; the compressed extension adds 16-bit forms of the common ones. Xtensa is the core in the original ESP32 and the ESP32-S3. Its instructions are 24 bits, three bytes, with 16-bit short forms (written with .n) for the most common.

Thumb's arithmetic sets the N, Z, C and V flags, and a conditional branch tests them. RISC-V and Xtensa have no flags: a branch names two registers and compares them itself.

## Register fields

The width of a register field sets how many registers an instruction can name. Thumb's 16-bit encodings have 3-bit fields, so they reach only r0 to r7; compilers prefer those registers so that code fits in 16 bits. RISC-V has 5-bit fields for all 32 registers, and keeps rd, rs1 and rs2 in the same bit positions in every instruction, so the hardware can read the registers before it has worked out what the instruction is. Xtensa's 4-bit fields name 16 registers, a0 to a15, a window onto 64 physical registers that slides along on each function call.

## Immediates are scaled and split

An immediate field counts in the unit that makes sense. Thumb's word load counts words, so imm5 = 3 means 12 bytes, and Xtensa's L32I does the same; RISC-V's LW counts bytes, so its offset can be any value from −2048 to 2047. Some immediates are split across fields to keep the rest in place. RISC-V's branch scatters its offset so that the sign is always bit 31 and the register fields never move, and drops the offset's bit 0, which is always zero. Xtensa's MOVI puts the top four bits of its constant where a register field would be.

A branch's offset is counted from different places. On a Cortex-M the PC reads as the branch's address plus 4, a leftover of the pipeline fetching ahead; Xtensa also adds 4; RISC-V counts from the branch itself:

$$
\text{Thumb:}\; a + 4 + 2 \cdot \mathrm{imm8} \qquad \text{RISC-V:}\; a + \mathrm{imm} \qquad \text{Xtensa:}\; a + 4 + \mathrm{imm8}
$$

The bytes in memory are the word's low byte first: the instruction stream is little-endian like the data, in all three. To see a short Thumb program run instruction by instruction, see Function calls.
