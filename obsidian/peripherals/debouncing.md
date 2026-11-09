---
id: debounce
title: "Debouncing"
section: Peripherals
group: Pins
source: src/topics/debounce.ts
url: ?p=debounce
---
# Debouncing

## Intro
A button is two pieces of metal pushed together, and they do not meet cleanly: they touch, spring apart and touch again for a few milliseconds. To the pin, one press looks like a burst of presses. Debouncing is how firmware turns that burst back into one. Below is one press and release on a pin with a pull-up, so it reads 0 while pressed. Pick a way to read it and count the presses it sees.

## Why contacts bounce

The moving contact in a switch is a small spring. When it hits the fixed contact it rebounds a few times before it settles, typically for 1 to 10 ms, and often less cleanly on release than on press. An interrupt on every falling edge sees each rebound as a new press, which is why a counter wired straight to a button jumps by three or four. Faster microcontrollers make this worse, not better: they are quick enough to catch every bounce.

## Lockout: fast, but trusts every edge

The simplest fix takes the first edge as the press, then ignores the pin for longer than any bounce, and reads it again at the end. It reacts at once, with no delay. But it believes any edge, so a short spike of noise while the button is held looks like a release and a second press. Choose N longer than the worst bounce: here the press bounces for 4.7 ms, so a 2 ms lockout ends in the middle of it.

## Counter: waits until the pin agrees

The counter samples the pin on a timer tick, here every millisecond, and changes its answer only after N samples in a row disagree with it. A spike shorter than the sample interval is never seen, and one that is seen resets the count. The cost is latency: the press is reported N ms after the pin settles. With N = 5 that is imperceptible; with N = 10 a fast double-press can start to merge. The time a press takes to register is

$$
t_{\mathrm{press}} = t_{\mathrm{settle}} + N \cdot t_{\mathrm{sample}}
$$

Hardware can help too: a capacitor across the button and a resistor in series form a low-pass filter that smooths the bounce, and a Schmitt-trigger input, which most GPIO inputs have, ignores the slow, noisy middle of the transition. See GPIO for the pull-up the button needs.
