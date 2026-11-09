---
id: calls
title: "Function calls"
section: Memory
group: The call stack
source: src/topics/calls.ts
url: ?p=calls
---
# Function calls

## Intro
A call has to pass its arguments, jump to the function, and leave a way back. On a Cortex-M, bl puts the return address in a register, LR, the arguments and the result travel in r0 to r3, and a function that calls another saves LR on the stack first. Step through main() calling square(5), and follow each instruction from Flash into the core, and each saved register across the bus into SRAM.

## The calling convention

The Arm Procedure Call Standard (AAPCS) is the agreement that lets separately compiled functions call each other. The first four arguments go in r0 to r3, the result comes back in r0, and a function may overwrite r0 to r3 and r12 freely. r4 to r11 belong to the caller, so a function that uses them saves them first and restores them before returning. SP must be a multiple of 8 at every public call.
