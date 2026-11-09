---
id: battery-life
title: "Battery life"
section: Power and clocks
group: Energy
source: src/topics/battery-life.ts
url: ?p=battery-life
---
# Battery life

## Intro
A device that lasts for years is asleep almost all the time. Its life depends on the average current, and that comes from a simple sum: how long it is awake, how much it draws then, and what it draws the rest of the time. Change the schedule and see which number matters.

## The sum

Average current is each current weighted by the share of time spent at it: (Iactive × tactive + Isleep × tsleep) ÷ period. Battery life is then capacity divided by that average. The page uses 80% of the rated capacity, because a cell cannot deliver all of it, particularly a coin cell under load.

## When sleep stops mattering

Two terms compete. If the device wakes often, the active term is larger and the answer is to work faster or wake less. If it wakes rarely, the sleep term wins and every microamp counts. The point where they are equal tells you which one to work on.

## What this leaves out

These are the RP2350’s measured totals from its datasheet, with awake being CoreMark at 150 MHz, so a real product will do worse. Add the regulator’s own quiescent current, sensors, a radio and pull-ups. Waking also costs energy: leaving a P1 state runs the boot path, restarting oscillators and the PLL takes time at full current. A coin cell cannot supply large pulses, so bursts often need a capacitor. Measure with a real board before promising a number.
