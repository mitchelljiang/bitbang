---
id: dma
title: "DMA"
section: Peripherals
group: Data
source: src/topics/dma.ts
url: ?p=dma
---
# DMA

## Intro
Copying every received byte out of a peripheral costs the CPU an interrupt per byte. A DMA controller does the copying instead: the peripheral asks for a transfer, DMA moves the byte from the peripheral's register to the next address in a buffer, and the CPU is told only when a batch is ready. Below, a UART receives twelve bytes into an 8-byte buffer. Step through them and watch the count, the addresses and the flags.

## What the stream is told

Before the first byte, firmware programs the stream once: the source (USART2's data register, a fixed address), the destination (the buffer, with the address incremented after each byte), the transfer size and the count, NDTR. Each time the UART receives a byte it raises a request; DMA reads the byte, writes it to memory, adds one to the address and subtracts one from NDTR. The CPU runs other code throughout, sharing the bus with DMA through the bus matrix.

$$
\mathrm{address}_k = \mathrm{M0AR} + k \qquad \mathrm{NDTR}_k = N - k
$$

## Half-transfer and transfer-complete

When half the count has moved, the stream sets its half-transfer flag, HTIF; when NDTR reaches zero, the transfer-complete flag, TCIF. Either can raise an interrupt. In normal mode the stream then switches itself off, and the next byte to arrive waits in the UART; any after it are lost, an overrun. In circular mode NDTR reloads and the address wraps to the start, so the buffer is reused forever: while DMA fills the second half, the CPU processes the first half, which the half-transfer interrupt said was ready, and the other way round. This is the usual way to receive a continuous stream, and the same scheme feeds a DAC from a table.

## Caches and ordering

On a chip with a data cache, DMA writes memory behind the CPU's back, so the CPU must invalidate the cached copy before reading the buffer, or it reads stale bytes; see Caches. And a CPU that writes a buffer and then starts DMA must make sure the writes landed first, which is what a barrier is for; see Memory ordering and barriers.
