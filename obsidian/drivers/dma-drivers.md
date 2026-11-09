---
id: dma-driver
title: "DMA drivers"
section: Drivers
group: Moving data
source: src/topics/dma-driver.ts
url: ?p=dma-driver
---
# DMA drivers

## Intro
At high rates, even an interrupt per byte is too much. DMA moves the bytes on its own, and a circular buffer means it never has to stop. The code only hears about it twice per trip, at the halfway point and at the end, and it has a deadline. This is a UART at 1 Mbaud, so 100,000 bytes per second.

## Two halves

In circular mode the DMA wraps to the start of the buffer by itself. The half-transfer interrupt says the first half is full, and DMA is now writing the second. The complete interrupt says the reverse. So the code always has one stable half to read while the other is being filled.

## The deadline

A half becomes ready, and DMA comes back to overwrite it one half-time later. So the processing must keep up: on average, and for every half. Doubling the buffer doubles the deadline and adds latency, because data waits longer before anyone looks at it. Choosing a size is that trade.

## Things drivers get wrong

On a chip with a data cache, the CPU can read stale copies of what DMA wrote, so the buffer must be uncached or the cache invalidated first; see caches. A variable-length message may stop in the middle of a half, so a UART driver also needs an idle-line interrupt and reads the DMA’s remaining-count register to learn how many bytes have arrived. Finally, a driver has to notice when it has fallen behind, rather than silently handing back overwritten data.
