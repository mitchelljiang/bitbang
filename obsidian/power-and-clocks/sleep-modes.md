---
id: sleep-modes
title: "Sleep modes"
section: Power and clocks
group: Energy
source: src/topics/sleep-modes.ts
url: ?p=sleep-modes
---
# Sleep modes

## Intro
Most of the current a chip draws goes on switching its clocks, so the way to save power is to stop them. The catch is that something has to start them again. Pick a state of the RP2040 to see what stops, and try what wakes it up.

## Where the current goes

A CMOS gate draws almost nothing while it holds still and spends energy each time it switches: power is roughly proportional to capacitance, the voltage squared and the frequency. So stopping a clock removes nearly all of a block’s current, even with the power still on. What remains is leakage, which grows quickly with temperature. That is why the datasheet’s maximum for Dormant, measured on the worst silicon at the hot extreme, is 4.2 mA against a typical 0.18 mA.

## Sleep and Dormant

Sleep is entered when both processors are in wfi or wfe and DMA is idle. The oscillators keep running, so waking is immediate, and SLEEP_EN chooses which clocks stay on. Dormant stops every oscillator. It is entered by writing a keyword to the running oscillator’s DORMANT register. Waking requires a GPIO event, or the RTC running from an external clock, and then waiting for the oscillator to restart. PLLs are not stopped by Dormant, so software must power them down first and set them up again afterwards.

## Reading the numbers

These are currents into the core supply only. A real board also has its regulator’s quiescent current, flash, sensors and pull-ups, which often dominate at this level. See battery life for what that does to a design.
