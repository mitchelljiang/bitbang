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
Stopping a clock saves the power a circuit spends switching, but the circuit still leaks. To save more, a chip must cut the power itself, and then whatever that part was storing is gone. The RP2350 divides its core into five power domains so you can choose. Pick a state to see what stays on, and try what wakes it up.

## Reading the names

A state is written Pc.m. If c is 1, the switched core is off. m is three bits, for XIP, SRAM0 and SRAM1, and a 1 means that domain is off. So P1.0 has only the core off, and P1.7 has every memory off too. In P0 states the program is running; P1 states are low-power.

## What waking means

P1 states are woken by up to four GPIO events or by the timer alarm in the always-on domain. Nothing else can do it, since the peripherals have no power. The processors were off, so the chip does not carry on from where it stopped: it comes back through the boot path, and anything the program needs afterwards must be in a retained SRAM.

## Sleep and Dormant

Within a P0 state the chip can also just stop clocks. Sleep is entered when both processors have enabled deep sleep and called wfi, with DMA stopped, and SLEEP_EN chooses which clocks stay on. Dormant stops the oscillators too. Both keep all state, so code resumes where it stopped, at a higher current than the P1 states. The datasheet does not tabulate their current, so they are not on the chart.

## Reading the numbers

These are totals across the chip’s 3.3 V supplies, including flash on its QSPI pins. Notice that going from P1.3 to P1.7 saves little: the supplies outside the core already take most of what remains. A real board adds its regulator’s quiescent current, sensors and pull-ups, which often dominate at this level. See battery life.
