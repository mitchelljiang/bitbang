---
id: timers
title: "Timers"
section: Peripherals
group: Time
source: src/topics/timers.ts
url: ?p=timers
---
# Timers

## Intro
A timer counts clock edges. A prescaler divides the clock first, then a counter steps up once per tick until it reaches the value in its auto-reload register, ARR, wraps to zero and raises an update event. That event is what fires a periodic interrupt, and the rate is set entirely by two numbers. Pick them below; each lane is one signal inside the timer, one clock cycle per column.

## Two dividers in a row

The prescaler counts timer-clock edges from 0 to PSC and then ticks the counter once, so it divides by PSC + 1. The counter counts ticks from 0 to ARR and then wraps, so it divides by ARR + 1. An update happens every (PSC + 1) × (ARR + 1) clocks. The +1s matter: the registers hold the last value counted, not the number of steps, which is why a 1 kHz tick from 16 MHz is PSC = 15 and ARR = 999, not 16 and 1000.

$$
f_{\mathrm{update}} = \frac{f_{\mathrm{clk}}}{(\mathrm{PSC} + 1)(\mathrm{ARR} + 1)} \qquad T = \frac{1}{f_{\mathrm{update}}}
$$

## Real numbers

The same arithmetic covers any rate. From the 16 MHz clock, PSC = 15999 gives a 1 kHz counter and ARR = 999 makes it overflow once a second. On a chip clocked at 84 MHz, PSC = 8399 and ARR = 9999 does the same. Both registers are 16 bits wide on most timers, 32 bits for the counter on TIM2 and TIM5, so a slower clock or a longer period means a larger prescaler, at the cost of coarser steps. The counter's value is also a clock in its own right: reading CNT tells you how many ticks have passed since the last update, which is how code measures short intervals without an interrupt.

$$
\frac{16\,\mathrm{MHz}}{(15999 + 1)(999 + 1)} = 1\,\mathrm{Hz} \qquad \frac{84\,\mathrm{MHz}}{(8399 + 1)(9999 + 1)} = 1\,\mathrm{Hz}
$$

## Changing ARR on the fly

ARR and PSC are buffered: with auto-reload preload on (ARPE in CR1), a write lands in a shadow register and only takes effect at the next update event, so a period never ends early or runs past a value already passed. Without it, writing an ARR below the current count makes the counter run all the way to its maximum before it wraps. The same counter, compared against a second register, makes a square wave: that is PWM. The update event drives an interrupt like any other; see Interrupts.
