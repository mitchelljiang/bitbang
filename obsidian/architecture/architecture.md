---
id: architecture-start
title: "Architecture"
section: Architecture
group: Start here
source: src/topics/architecture-start.ts
url: ?p=architecture-start
---
# Architecture

## Intro
A processor does one small thing over and over: read an instruction from memory, work out what it says, and do it. This section looks at that loop from the inside: how an instruction is encoded in bits, which registers it works on, how a load or store finds its address, and how the pipeline keeps several instructions in flight at once.
Start with Instructions →

- 1 Instruction set What the processor is told to do, one instruction at a time. InstructionsHow an instruction packs its opcode, registers and constants into fields, in Arm Thumb, RISC-V and Xtensa. Registersr0 to r15, the stack pointer, link register and program counter, and the status flags. AddressingRegister, immediate and offset forms: how a load or store finds its address.
- 2 Execution How the core runs a stream of instructions quickly. PipelineFetch, decode and execute overlapped, and what makes the pipeline stall. BranchesWhat a taken branch costs, and how prediction hides it.

## Before you start

The pages build on a few from other sections. If any of these is new, read it first:

- Binary and hexadecimal: an instruction is a few bit fields, written in hex.
- Two’s complement: branch offsets and many constants are signed.
- Endianness: an instruction’s bytes are stored low byte first.
- Overflow and status flags: Arm’s conditional branches test the N, Z, C and V flags.

## Reading the diagrams

Instructions are drawn as their bits, split into fields with the field’s name above and its meaning below. Bits with a dashed outline are the opcode and stay fixed; click any other bit to change the operand, and the assembly, hex and bytes in memory follow. The switch at the top picks the instruction set.

## Words this section uses

- Instruction set: The instructions a processor understands and how each one is encoded. Arm Thumb, RISC-V and Xtensa are three. See Instructions.
- Opcode: The fixed bits that say which instruction this is. See Instructions.
- Operand: What an instruction works on: a register, a constant or an address. See Instructions.
- Immediate: A constant stored inside the instruction itself. See Instructions.
- Register: One of a small set of 32-bit slots inside the CPU, where values are worked on. A Cortex-M has r0 to r12, SP, LR and PC.
- PC: The program counter: the address of the instruction being run.
- Flags: Status bits (N, Z, C and V on Arm) set by arithmetic and tested by conditional branches. See Overflow and status flags.
- Pipeline: Fetch, decode and execute in overlapping stages, so a new instruction can start every cycle.

## After this section

Carry on to Memory: where code and data live and how they get there: the memory map, the stack, the heap, memory hardware and virtual memory.
