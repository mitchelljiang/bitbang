---
id: bufover
title: "Buffer overflow"
section: Memory
group: The call stack
source: src/topics/bufover.ts
url: ?p=bufover
---
# Buffer overflow

## Intro
A local array lives on the stack, just below the registers the function saved when it started, including the address it will return to. If the program writes past the end of the array, it overwrites those saved values. Overwrite the return address and the function returns to the wrong place: a crash, or, if an attacker chose the bytes, somewhere of their choosing. Type into name and watch it spill down the frame.

## Why it happens

C does not check array bounds. strcpy copies bytes until it meets a zero, however long the source is, into a buffer of whatever size. The bytes that do not fit keep going into the next addresses, which on the stack are the saved registers and the return address. The same flaw is in gets, sprintf, scanf("%s") and any loop that copies until a terminator without counting.

## What an attacker gains

The function ends with pop {r4, pc}, which loads the saved word straight into the program counter. Whoever controls that word controls where the program goes next. The simplest result is a crash. A deliberate overflow instead writes the address of code already in the program, as the “Aim at win()” button does, so the return jumps there with the attacker’s chosen arguments. Chaining many such returns, return-oriented programming, can run arbitrary logic without injecting a single new instruction.

## What stops it

- Count the bytes. Use strncpy, snprintf or memcpy with a length, or check the length before copying. This is the real fix; the rest are safety nets.
- Stack canary. With the stack protector on, the compiler puts a known value just above the buffer and checks it has not changed before returning. An overflow that reaches the return address must cross the canary first, so the program aborts instead of returning. Turn it on above to see the extra code.
- Execute-never memory. A Cortex-M marks the stack and other data regions non-executable, so an attacker cannot run new instructions placed in the buffer. This is why real attacks reuse existing code instead.
- Stack limit and the MPU. Armv8-M stack limit registers and an MPU region below the stack turn an overflow into a fault at the moment it crosses a boundary, before it can do harm.

On a desktop, address space layout randomisation (ASLR) also moves code to unpredictable addresses each run, so the attacker cannot know where win() is. Most microcontrollers run code from a fixed address in flash, so they have no ASLR, which makes careful coding and the canary matter more.
