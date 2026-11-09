---
id: interconnect
title: "Buses and the bus matrix"
section: Memory
group: The address space
source: src/topics/interconnect.ts
url: ?p=interconnect
---
# Buses and the bus matrix

## Intro
A simple microcontroller puts the processor and all its memory on one shared bus, so only one transfer happens at a time. A Cortex-M4 instead has a bus matrix: a crossbar where several masters, the core and the DMA engines, each connect to several slaves, the Flash, the RAMs and the peripheral bus. Transfers to different slaves run at the same time; only when two masters want the same slave does one wait. Point each master at a slave below.

## Why a crossbar, not a bus

Direct memory access is the reason. A DMA engine copying a buffer from SRAM to a UART should not stop the core from running code out of Flash: the two touch different memories, so there is no reason they cannot happen at once. The matrix makes that physical. Each master has its own path to each slave, and the arbiters sit at the slaves, not on one shared wire, so N masters hitting N different slaves all proceed in parallel. This is how a DMA transfer can run “in the background” while the CPU keeps working.

## When two want the same memory

The parallelism ends at a shared slave. If the core and a DMA engine both access SRAM1 in the same cycle, the slave’s arbiter grants one and makes the other wait a cycle. The STM32 matrix arbitrates round-robin by default, so no master is starved; it can also be set to fixed priority. The waiting master is not told anything, it simply sees its access take an extra cycle, which is why heavy DMA traffic can quietly slow down code that shares a RAM with it. Splitting hot data across SRAM1 and SRAM2 so the core and DMA stay on different slaves is a common firmware optimisation.

## The core’s two buses

The Cortex-M4 itself appears to the matrix as more than one master: it fetches instructions on one bus and loads and stores data on another, so running code from Flash while reading a variable from SRAM is already two parallel accesses. Keeping code in Flash and data in RAM is not just about size, it keeps the instruction and data streams on separate slaves so neither waits for the other.
