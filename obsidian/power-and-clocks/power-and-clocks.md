---
id: power-start
title: "Power and clocks"
section: Power and clocks
group: Start here
source: src/topics/power-start.ts
url: ?p=power-start
---
# Power and clocks

## Intro
Before a program can do anything, something has to supply a clock and a stable voltage. This section starts with where a chip’s frequencies come from, then looks at how it saves energy by stopping them, and at what protects it when the supply sags. The pages use the RP2040, and every limit and current comes from its datasheet.
Start with Clock tree →

- 1 Clocks Where the chip’s frequencies come from. Clock treeA crystal, a PLL and its dividers: how 12 MHz becomes 125 MHz, and what limits each stage.
- 2 Energy Stopping work to save current, and surviving a sagging supply. Sleep modesWhat stops in Sleep and Dormant, what wakes the chip, and how much current each saves. Battery lifeAverage current from a duty cycle, and how long a battery lasts. Brown-outWhen the supply sags: power-on reset, brown-out detection and its threshold.

## Before you start

The pages build on a few from other sections. If any of these is new, read it first:

- Parts and terms: the parts of the chip that clocks feed.
- Timers: a timer counts the clocks this section produces.

## Reading the diagrams

Each page has one diagram with a small set of controls. A value in red has gone out of range. Readouts under the diagram give the numbers, and currents are typical figures from the datasheet.

## Words this section uses

- PLL: A phase-locked loop: a circuit that multiplies a reference frequency. See Clock tree.
- VCO: The fast oscillator inside a PLL, whose speed is steered by a control voltage. See Clock tree.
- Clock gating: Stopping a block’s clock to save the power it spends switching. See Sleep modes.
- Duty cycle: The fraction of the time a device is awake. See Battery life.
- Brown-out: A supply voltage that sags below what the chip needs, without going fully off. See Brown-out.

## After this section

Carry on to C for embedded: the parts of C that matter on a microcontroller: where variables live, integer types, structs and bit fields, pointers and functions.
