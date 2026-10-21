---
id: interrupts
title: "Interrupts"
section: Concurrency
group: Interrupting the program
source: src/topics/interrupts.ts
url: ?p=interrupts
---
# Interrupts

## Intro
A processor runs one instruction stream at a time, but the world does not wait for it. When a timer expires or a byte arrives, the hardware interrupts whatever is running, jumps to a handler, and returns to exactly where it left off. Each lane below is one thread of execution; the bright bar is what holds the CPU at that moment. Step through a SysTick tick that a UART byte interrupts partway. New to SysTick, the NVIC or the vector table? Start with Parts and terms.

## What the processor does automatically

On a Cortex-M, taking an interrupt is hardware, not code. The processor finishes the current instruction, pushes eight registers, xPSR, the return address, LR, R12 and R3–R0, onto the current stack, loads the handler’s address from the vector table at the start of memory, and starts running it. The handler is an ordinary C function; it returns with a normal return, which the processor recognises, by a special value left in LR, as the cue to pop those eight registers and resume. Because the compiler-saved registers are already preserved, a handler can call other functions without any special annotation.

## Priority and nesting

Each interrupt has a priority, and on Cortex-M a lower number is more urgent. A handler can itself be interrupted by a higher-priority one, which is the preemption shown above: the UART byte arrives while SysTick is running, and because it is more urgent it runs first, stacking a second frame. Handlers always return in the reverse of the order they were entered, so the stack unwinds cleanly. An interrupt that is not more urgent than what is running stays pending until the CPU is free.

## Latency and tail-chaining

The time from an interrupt firing to its handler’s first instruction is the interrupt latency, about twelve cycles on a Cortex-M4, most of it the register stacking. If a second interrupt is already pending when a handler returns, the processor skips the pop and the next push and goes straight to it, called tail-chaining, which saves that work. Keeping handlers short is what keeps the whole system responsive, because everything of lower priority waits behind them.
