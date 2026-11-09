---
id: clock-tree
title: "Clock tree"
section: Power and clocks
group: Clocks
source: src/topics/clock-tree.ts
url: ?p=clock-tree
---
# Clock tree

## Intro
A crystal is stable but slow; a processor wants to be fast. A phase-locked loop bridges the two: it multiplies the crystal’s frequency, and dividers then bring it down to what each part of the chip needs. These are the real limits of the RP2350’s PLL. Change the dividers and watch which stage goes out of range.

## How a PLL multiplies

Inside is a voltage-controlled oscillator, the VCO, running very fast. A divider feeds a slowed copy of it back to be compared with the reference. If the copy runs slow, the VCO is pushed faster, and so it settles at exactly reference × FBDIV. The output is then divided down: (12 MHz ÷ REFDIV) × FBDIV ÷ (POSTDIV1 × POSTDIV2).

## Why the same output has several settings

Many settings reach the same frequency. Running the VCO high minimizes jitter, the cycle-to-cycle variation of the clock; running it low saves power. With a 12 MHz crystal, the VCO’s 750 to 1600 MHz range means FBDIV must be between 63 and 133.

## Branches of the tree

The RP2350 has two PLLs: pll_sys for the processors, up to 150 MHz, and pll_usb for a 48 MHz USB clock. From there, clock generators with their own dividers and glitchless switches feed the peripherals. It boots from an internal ring oscillator and only moves onto a PLL when software has set one up, so a bad setting cannot stop it from starting. Everything that counts time, from a timer to a UART’s baud rate, is derived from these clocks.
