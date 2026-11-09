---
id: hal
title: "HAL design"
section: Drivers
group: Talking to hardware
source: src/topics/hal.ts
url: ?p=hal
---
# HAL design

## Intro
A hardware abstraction layer lets the same application run on different chips, by putting a boundary between the code that decides what to do and the code that touches registers. The boundary can be placed at compile time, at link time or at run time, and each one costs something different.

## Three kinds of boundary

Compile time: a header per chip, with macros or static inline functions, costs nothing but needs a rebuild per target. Link time: one header and one .c file per chip, selected by the build, costs a call. Run time: a struct of function pointers, as a driver model uses, lets several devices coexist behind one interface and be chosen while the program runs.

## Where to draw the line

Abstract what really varies. Most projects never change chips, yet a layer that lets the logic run on a PC is valuable on its own: it means the logic can be unit tested with a fake GPIO. Make the interface describe what the application wants, such as led_on(), rather than mirroring registers.

## What it costs

The price of a call is small until it is in a loop or an interrupt. A driver’s fast path, such as a byte-at-a-time FIFO, usually stays direct, while setup goes through the layer. Measure first: link-time optimization can erase a function boundary, as the optimization pages show.
