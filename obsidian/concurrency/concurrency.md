---
id: concurrency-start
title: "Concurrency"
section: Concurrency
group: Start here
source: src/topics/concurrency-start.ts
url: ?p=concurrency-start
---
# Concurrency

## Intro
A microcontroller has one CPU, but firmware has many things to do at once: answer a button, keep a motor’s timing, send a packet. This section shows how that one CPU is shared: interrupts that break into the program, an RTOS that switches between tasks, and the bugs that appear when two of them touch the same data, with the tools that prevent them.
Start with Parts and terms →

- 1 The chip The parts of a microcontroller, met by following one interrupt. Parts and termsTIM2, SysTick, the NVIC, the vector table and the stack, met in place by following one interrupt, plus a glossary.
- 2 Interrupting the program How the processor stops what it is doing to handle something, and comes back. InterruptsThe vector table, what the processor saves, and how a handler returns. Priorities and nestingWhich interrupt wins, and when one can interrupt another.
- 3 Running many tasks How one processor is shared between several threads of execution. Context switchingWhat an RTOS saves and restores to swap one task for another. SchedulingChoosing which ready task runs next, and when to switch.
- 4 Sharing data safely What goes wrong when two threads touch the same memory, and how to prevent it. Race conditionsTwo tasks reading and writing the same variable, and the update that gets lost. Atomics and critical sectionsLoad-exclusive and store-exclusive, disabling interrupts, and why volatile is not enough. Memory ordering and barriersWhy writes land out of order, and when you need DMB, DSB or ISB: interrupts, DMA, locks and the MPU. Mutexes and semaphoresTaking turns, signalling between tasks, and priority inversion.

## Before you start

The pages build on a few from other sections. If any of these is new, read it first:

- The stack: the processor saves its place on the stack when it is interrupted.
- Read-modify-write: an interrupted read-modify-write is the classic race.
- Timers: a timer’s interrupt is the heartbeat of an RTOS.

## Reading the diagrams

The pages draw time left to right, like a logic analyzer. Each lane is one thread of execution: the main loop, an interrupt handler, or a task. A bright bar means that lane holds the CPU; a hatched bar is the processor saving or restoring registers; a dashed outline is a task that is ready but waiting, and a coral one is a task blocked on a lock. A small arrow above a lane is an event arriving, and the gold line is the current moment.

## Words this section uses

- Interrupt: A hardware signal that makes the CPU pause the program and run a handler. See Interrupts.
- Handler: The function that runs when an interrupt fires. It is also called an ISR. See Interrupts.
- Priority: Which interrupt wins when two are pending, and which can interrupt another. See Priorities and nesting.
- Task: An independent thread of execution under an RTOS, with its own stack. See Context switching.
- Context switch: Saving one task’s registers and restoring another’s, so the CPU picks up where that task left off. See Context switching.
- Race condition: A bug where the result depends on which of two threads gets there first. See Race conditions.
- Atomic: An operation that nothing else can interrupt halfway through. See Atomics and critical sections.
- Mutex: A lock that lets only one task at a time into a piece of code. See Mutexes and semaphores.
