---
id: drivers-start
title: "Drivers"
section: Drivers
group: Start here
source: src/topics/drivers-start.ts
url: ?p=drivers-start
---
# Drivers

## Intro
A driver is the code between an application and a piece of hardware. It has to reach the registers correctly, get data past interrupts without losing any, and leave the rest of the program with a simple interface. These pages build one up from a single register write to a DMA receive path.
Start with Register access →

- 1 Talking to hardware How C reaches a peripheral, and what a layer costs. Register accessMacros, struct overlays and set/clear registers, and the instructions each one becomes. HAL designA direct write, a function call, or a table of function pointers: what portability costs.
- 2 Moving data Getting bytes between an interrupt or DMA and the main program. Ring buffersA head, a tail and one empty slot: passing bytes safely from an interrupt to the main loop. Interrupt-driven UARTHow long interrupts can stay off before a received byte is lost. DMA driversA circular buffer, half and full interrupts, and how fast the code has to keep up.

## Before you start

The pages build on a few from other sections. If any of these is new, read it first:

- Memory-mapped I/O: a register is an address that talks to hardware.
- volatile: register accesses must not be optimized away.
- Interrupts: drivers do their work in interrupt handlers.
- DMA: the DMA driver page starts where this one ends.

## Reading the diagrams

Register access and HAL design show C beside the real instructions. The others are simulations, with controls for buffer sizes and timing; a result in red means data was lost.

## Words this section uses

- Overlay: A struct laid over a peripheral’s address, so each member is a register. See Register access.
- HAL: Hardware abstraction layer: an interface that hides which chip the code runs on. See HAL design.
- Ring buffer: A fixed array used as a queue, with indexes that wrap around. See Ring buffers.
- Overrun: A byte arrived with nowhere to put it, so data was lost. See Interrupt-driven UART.
- Circular DMA: A DMA transfer that wraps to the start of its buffer and never stops. See DMA drivers.
