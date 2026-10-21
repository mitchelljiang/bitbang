---
id: priorities
title: "Priorities and nesting"
section: Concurrency
group: Interrupting the program
source: src/topics/priorities.ts
url: ?p=priorities
---
# Priorities and nesting

## Intro
When two interrupts want the CPU, the interrupt controller decides by priority, and on a Cortex-M the lower number is the more urgent. Three peripherals, a timer (TIM2), a serial port (USART2) and an ADC, fire at fixed times below. Click a priority on its lane to change it, then step through and watch who preempts whom, who has to wait, and how handlers chain together on the way out. The names are introduced in Parts and terms.

## Lower number, more urgent

Every interrupt has a priority register in the NVIC. The architecture defines eight bits, but a chip implements only the top few: an STM32F4 has four, so sixteen levels, 0 to 15. Zero is the most urgent a configurable interrupt can be; only Reset, NMI and HardFault sit above it, at fixed negative priorities. A new interrupt preempts the running code only if its number is strictly lower than the running handler’s. Equal is not enough, which is why two handlers at the same priority never interrupt each other.

## Pending, and how ties are broken

An interrupt that cannot preempt is not lost: the NVIC sets its pending bit, and it runs as soon as nothing more urgent is active. When several are pending at the same priority, the one with the lower exception number goes first, which is fixed by the chip’s vector table. Priorities can also be split into a group priority, which decides preemption, and a subpriority, which only orders pending interrupts within a group.

## Tail-chaining

When a handler finishes and another interrupt is pending that is more urgent than the code underneath, there is no point popping eight registers only to push the same eight again. The processor skips both and jumps straight to the next handler, taking about six cycles on a Cortex-M4 instead of roughly twelve to unstack and twelve to stack again. The bars marked as a narrow hatch between two handlers are those chained entries.
