---
id: overflow
title: "Stack overflow"
section: Memory
group: The call stack
source: src/topics/overflow.ts
url: ?p=overflow
---
# Stack overflow

## Intro
The stack is given a fixed slice of RAM, but nothing in the hardware forces it to stay inside it. Every call pushes a frame and moves SP down; deep enough recursion, or one large local array, pushes SP past the bottom of its region and into whatever is there, usually the globals. Recurse below and watch SP fall toward the limit, then try each way firmware guards against crossing it.

## Why it is dangerous and quiet

With no guard, overrunning the stack is simply a write to an address below the limit, an ordinary store that the hardware carries out. It overwrites the globals, or another task’s stack, and execution continues with corrupted data. The crash, if there is one, comes later and somewhere else, which makes a stack overflow one of the hardest embedded bugs to track down. Recursion and large stack-allocated buffers are the usual causes, which is why safety-critical coding standards bound recursion and cap local array sizes.

## Catching it at the line

The cleanest guard puts an MPU region with no access permission just below the stack. The instant SP crosses it and the function writes, the access faults, so the error is reported exactly when and where it happens instead of corrupting memory silently. Armv8-M adds a dedicated stack-limit register, MSPLIM/PSPLIM, that faults on the SP update itself, even before any write.

## Measuring it after the fact

A cheaper, common technique is stack painting: fill the whole stack region with a known value such as 0xDEADBEEF at startup, then later scan from the bottom for the first byte still unchanged. The gap tells you the deepest the stack ever reached, the high-water mark. It does not stop an overflow, and it only measures what has happened so far, but it is how an RTOS reports per-task stack usage so you can size each stack with a margin.
