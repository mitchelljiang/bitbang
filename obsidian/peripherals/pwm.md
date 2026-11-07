---
id: pwm
title: "PWM"
section: Peripherals
group: Time
source: src/topics/pwm.ts
url: ?p=pwm
---
# PWM

## Intro
Pulse-width modulation makes an output that is high for a chosen fraction of every period. A timer does it with no help from the CPU: the counter runs from 0 to ARR as on the Timers page, and a compare register, CCR, decides where in each period the output switches. Averaged over a period, the pin looks like a voltage between 0 and 3.3 V, which is how a microcontroller dims an LED or sets a motor's speed. Here ARR is 9, so each period is 10 counts.

## Compare, then switch

Every counter tick, the channel compares CNT with CCR. In PWM mode 1 the output is active while CNT is below CCR and inactive from the match until the counter wraps, so it is high for CCR counts out of ARR + 1. PWM mode 2 is the same comparison with the output inverted. The two ends behave sensibly: CCR = 0 never goes high, and any CCR above ARR never goes low, so 0% and 100% are both reachable. The resolution is one count: with ARR = 999, duty moves in steps of 0.1%.

$$
D = \frac{\mathrm{CCR}}{\mathrm{ARR} + 1} \;\text{(mode 1)} \qquad D = 1 - \frac{\mathrm{CCR}}{\mathrm{ARR} + 1} \;\text{(mode 2)}
$$

## Frequency and resolution trade off

The PWM frequency is the timer's update rate, the clock divided by (PSC + 1) × (ARR + 1). A larger ARR gives finer duty steps but a lower frequency from the same clock. From 16 MHz with no prescaler, ARR = 999 gives 16 kHz with 1000 steps, above hearing, which matters for motors, and far faster than an eye can see flicker, which matters for LEDs. Writing a new CCR takes effect at the next update when preload is on (OCxPE), so a period is never cut short.

$$
f_{\mathrm{PWM}} = \frac{f_{\mathrm{clk}}}{(\mathrm{PSC} + 1)(\mathrm{ARR} + 1)} = \frac{16\,\mathrm{MHz}}{1 \times 1000} = 16\,\mathrm{kHz}
$$

## Why the LED looks dimmer

The LED is either fully on or fully off; it never sees a lower voltage. It is the eye, or a motor's inertia, or an RC filter on the pin, that averages the pulses into duty × 3.3 V. With a filter, PWM becomes a crude digital-to-analog converter. The same channel hardware also drives the WS2812 LED protocol when its pulses are fed by DMA.

$$
V_{\mathrm{avg}} = D \cdot V_{\mathrm{DD}} = 0.2 \times 3.3\,\mathrm{V} = 0.66\,\mathrm{V}
$$
