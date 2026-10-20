---
id: context
title: "Context switching"
section: Concurrency
group: Running many tasks
source: src/topics/context.ts
url: ?p=context
---
# Context switching

## Intro
A task’s whole state, everything it would need to carry on, is its sixteen core registers. An RTOS switches tasks by saving one task’s registers on its own stack, and loading another’s from its stack. On a Cortex-M the hardware saves half of them and the kernel saves the other half. Step through one switch from task A to task B and watch both stacks.

## What a context is

To stop a task and resume it later as if nothing happened, the kernel must put back every register exactly as it was: R0–R12, the stack pointer, the link register, the program counter and the status register. Everything else the task owns, its local variables and its call chain, is already on its own stack. So a task is fully described by its stack plus one saved number, the stack pointer, which the kernel keeps in the task’s control block, the TCB.

## Why half is done by hardware

Taking any exception already pushes R0–R3, R12, LR, PC and xPSR, the registers a C function may freely overwrite. That is what lets an interrupt handler be an ordinary C function. The kernel only has to save the other eight, R4–R11, which C code must preserve, so the context switch is a handful of instructions. With the FPU in use there are up to 18 more words to save, which the hardware can defer until a task actually touches it.

## Why PendSV, at the lowest priority

The tick interrupt decides that a switch is due, but it does not switch itself. If it did, it might be interrupting another handler, and swapping the task stack out from under a running handler would corrupt it. Instead it pends PendSV, which is set to the lowest priority, so the switch happens only after every other handler has finished and the processor is about to return to a task. Each task runs on PSP while handlers use MSP, so handlers never touch task stacks at all.
