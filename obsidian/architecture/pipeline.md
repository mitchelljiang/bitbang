---
id: pipeline
title: "Pipeline"
section: Architecture
group: Execution
source: src/topics/pipeline.ts
url: ?p=pipeline
---
# Pipeline

## Intro
Every instruction has to be fetched, decoded and executed. If the processor did those one after another it would need three cycles per instruction. Instead it overlaps them: while one instruction executes, the next is decoded and the one after that is fetched. Step through the cycles to see where that works and where it breaks down.

## Overlap, not speed

A pipeline does not make any one instruction faster; the first one still takes three cycles from fetch to done. What it changes is how often one finishes: once it is full, every cycle. The stages also get shorter, because each does less, so the clock can run faster.

## Short on purpose

The Cortex-M0+ has two stages and the Cortex-M3 and M4 have three. A long pipeline buys clock speed, but costs more cycles whenever it has to be thrown away and refilled. Microcontrollers care about responding promptly and using little energy. The Cortex-M7, built for higher clocks, has six stages and can start two instructions at once.

## What the numbers leave out

These counts assume memory that answers in one cycle. Flash on a fast chip is slower than the core: at 168 MHz an STM32F4 needs 5 wait states, so a fetch would take 6 cycles if the chip did not read ahead and cache. A taken branch costs more there. The Cortex-M4’s branch refill is also 1 to 3 cycles depending on the width and alignment of the target; this diagram shows 2. See branches for what prediction does about it.
