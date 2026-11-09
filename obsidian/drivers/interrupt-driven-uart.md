---
id: uart-driver
title: "Interrupt-driven UART"
section: Drivers
group: Moving data
source: src/topics/uart-driver.ts
url: ?p=uart-driver
---
# Interrupt-driven UART

## Intro
A UART receives one byte at a time, whether or not the program is ready. Waiting in a loop for each byte wastes the whole processor. An interrupt fixes that, but interrupts are sometimes turned off, and then the only thing holding the data is a small FIFO. Find out how long is too long.

## How long a byte takes

With 8 data bits, a start bit and a stop bit, one byte is 10 bit times. At 115200 baud that is 86.8 µs, so at a 100 MHz core clock, polling burns about 8,700 cycles per byte just waiting. An interrupt handler that reads the byte costs perhaps a hundred.

## The limit

While interrupts are off, bytes pile up in the FIFO, and when it is full the next byte is lost and the UART’s overrun flag is set. So the longest safe time is the FIFO’s depth times the byte time. A one-byte holding register at 115200 baud gives 86.8 µs. The RP2040’s UART has a 32-entry FIFO, which gives 2.8 ms.

## What a driver does

The handler moves bytes from the FIFO into a ring buffer and returns. The UART can interrupt at a FIFO level instead of per byte, with a timeout for the final few, so the handler runs less often. Always check and clear the error flags: an unhandled overrun can leave the interrupt stuck asserted on some parts. For sustained high rates, see DMA drivers.
