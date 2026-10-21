---
id: mcu
title: "Parts and terms"
section: Concurrency
group: Start here
source: src/topics/mcu.ts
url: ?p=mcu
---
# Parts and terms

## Intro
The pages in this section talk about TIM2, SysTick, the NVIC, stacking and tasks. They are all parts of one chip, doing one job each. Step through below to meet every part in place, by following a single timer interrupt from the moment it fires to the moment the program carries on. Each step gives the plain idea first, then what happens underneath. Click any part to jump to it.

## How to read the Concurrency diagrams

The other pages draw time left to right, like a logic analyzer. Each row, or lane, is one thread of execution: the main loop, an interrupt handler, or a task. A bright bar means that lane holds the CPU; a hatched bar is the processor saving or restoring registers; a dashed outline is a task that is ready but waiting, and a coral one is a task blocked on a lock. A small arrow above a lane is an event arriving, and the gold line is the current moment.

## The hardware

- Microcontroller (MCU): A CPU, Flash, SRAM and peripherals on one chip. STM32F4 is a family of them; Cortex-M4 is the Arm processor core inside. Covered in Memory map.
- Register: A small named storage slot. CPU registers (R0–R12, SP, LR, PC) hold what the processor is working on; peripheral registers are addresses that control hardware. Covered in Memory-mapped I/O.
- Peripheral: Hardware on the chip that does one job without running code: timers, serial ports, ADCs, GPIO. Named by kind and number, such as TIM2 or USART2. Covered in Memory-mapped I/O.
- TIM2: General-purpose timer 2: a counter that raises an interrupt each time it reaches a set value. Covered in Priorities and nesting.
- USART2, ADC, GPIO: Serial port 2 (the UART); the analog-to-digital converter, which measures a voltage; general-purpose input/output pins. Covered in Priorities and nesting.
- SysTick: A simple timer built into every Cortex-M core, the usual heartbeat of an RTOS. Covered in Scheduling.
- NVIC: Nested Vectored Interrupt Controller: receives every interrupt request, holds each one’s priority, and decides which runs. Covered in Priorities and nesting.
- Vector table: The list of handler addresses at the start of Flash, one entry per exception. Covered in Interrupts.

## Interrupts

- Interrupt, IRQ: A hardware signal that makes the CPU stop, run a handler, and come back. IRQ is short for interrupt request; the IRQ number is the line’s position on the NVIC. Covered in Interrupts.
- Exception: Arm’s umbrella word for anything that diverts the CPU. Exceptions 1–15 are the core’s own (Reset, HardFault, SVCall, PendSV, SysTick); interrupts are 16 and up. Covered in Interrupts.
- Handler, ISR: The function that runs for an interrupt, such as TIM2_IRQHandler. ISR stands for interrupt service routine. Covered in Interrupts.
- Priority: How urgent an interrupt is. On a Cortex-M a lower number is more urgent. Covered in Priorities and nesting.
- Pending: Requested but not yet running, because something at least as urgent holds the CPU. Covered in Priorities and nesting.
- Preemption, nesting: A more urgent interrupt interrupting a running handler, so handlers stack up inside each other. Covered in Priorities and nesting.
- Stacking: The processor saving 8 registers to the stack by itself on the way into a handler, and restoring them on the way out. Covered in Interrupts.
- Latency: The delay from an interrupt firing to its handler’s first instruction. Covered in Interrupts.

## Running many tasks

- Thread of execution: Anything with its own stream of instructions: the main loop, a handler, a task. Each gets a lane in the diagrams. Covered in Interrupts.
- RTOS: Real-time operating system, such as FreeRTOS: a small library that gives firmware tasks, a scheduler and locks. Covered in Context switching.
- Task: A function that runs forever with its own stack, taking turns on the CPU with other tasks. Covered in Context switching.
- Context, context switch: A task’s saved registers and stack pointer; swapping one task’s context for another’s. Covered in Context switching.
- PendSV: A core exception an RTOS triggers on purpose to do a context switch at the lowest priority. Covered in Context switching.
- Scheduler, tick: The code that picks which ready task runs next, usually woken by SysTick each tick. Covered in Scheduling.
- Deadline: The time by which a task’s work must be done. Covered in Scheduling.

## Sharing data safely

- Race condition: A bug where the result depends on who happens to run first, such as two tasks adding to one counter and losing an update. Covered in Race conditions.
- Atomic: Done as one indivisible step, so nothing can run in the middle of it. Covered in Atomics and critical sections.
- Critical section: Code that must not be interrupted partway, often protected by briefly disabling interrupts. Covered in Atomics and critical sections.
- volatile: A C keyword telling the compiler to really read or write memory each time. It does not make anything atomic. Covered in Atomics and critical sections.
- Memory barrier: An instruction (DMB, DSB, ISB) that makes earlier memory accesses finish, or be seen, before later ones. Covered in Memory ordering and barriers.
- Mutex, semaphore: A lock one task holds while using something shared; a counter tasks use to signal each other. Covered in Mutexes and semaphores.
- Priority inversion: An urgent task stuck waiting on a lock held by a less urgent one. Covered in Mutexes and semaphores.
