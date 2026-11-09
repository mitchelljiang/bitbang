---
id: dac
title: "DAC"
section: Peripherals
group: Analog
source: src/topics/dac.ts
url: ?p=dac
---
# DAC

## Intro
A digital-to-analog converter is the ADC run backwards: write a number and the pin moves to that fraction of the reference voltage. Feed it a new number at a steady rate and a table of numbers becomes a waveform. What comes out is a staircase, one step per sample, and a resistor and capacitor on the pin smooth it into the curve it stands for. Pick a shape, how finely each sample is rounded, and how many samples make one period.

## A code becomes a fraction of the reference

Inside, a resistor ladder or a set of switched current sources adds up one share of the reference voltage for each bit that is set: half for the top bit, a quarter for the next, and so on. The STM32F4's DAC is 12 bits wide, so it has 4096 steps of about 0.81 mV from 3.3 V. The page also rounds to 3 or 6 bits, to make the steps big enough to see.

$$
V_{\mathrm{out}} = V_{\mathrm{ref}} \cdot \frac{\mathrm{DOR}}{2^N} \qquad \frac{3.3\,\mathrm{V} \cdot 2048}{4096} = 1.65\,\mathrm{V}
$$

## Timer, table and DMA

To make a waveform, a timer triggers the DAC at a fixed rate and, on each trigger, DMA copies the next code from a table in memory into the DAC's data register, with no work for the CPU. The table holds one period, and DMA in circular mode runs through it forever. The output frequency is the trigger rate divided by the table length, so fewer samples give a higher frequency but a coarser shape:

$$
f_{\mathrm{out}} = \frac{f_{\mathrm{trigger}}}{N_{\mathrm{samples}}} = \frac{100\,\mathrm{kHz}}{16} = 6.25\,\mathrm{kHz}
$$

## Smoothing the steps

The steps carry energy at the sample rate and its multiples, far above the signal itself, so a low-pass filter removes them. A single resistor and capacitor is the simplest; its time constant, τ = RC, here equals one sample period. Each step moves the output toward its new level by 63% in one τ. A gentle filter like this rounds the steps but also lags the signal and shrinks it a little; more samples per period, or a sharper filter, do better. Audio DACs sample far faster than the signal for exactly this reason.

$$
v(t) = V_{\mathrm{step}} + (v_0 - V_{\mathrm{step}})\, e^{-t/RC}
$$
