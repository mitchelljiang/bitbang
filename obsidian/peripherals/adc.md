---
id: adc
title: "ADC"
section: Peripherals
group: Analog
source: src/topics/adc.ts
url: ?p=adc
---
# ADC

## Intro
An analog-to-digital converter turns a voltage into a number. The one in most microcontrollers is a successive-approximation converter: it holds the input steady, then plays twenty questions with it, one bit per question, starting with the most significant. Each question sets a bit, turns the code so far into a voltage, and asks a comparator whether the input is at least that high. Pick an input and a resolution, then step through the comparisons.

## A binary search in hardware

The first comparison asks whether the input is in the top half of the range, the next which quarter, and so on: each one halves what is left, so N bits take N comparisons, whatever the input. Inside, a small DAC makes the trial voltage from the code so far, usually by sharing charge between capacitors sized 1, 2, 4 and up, and one comparator answers each question. On an STM32F4 a 12-bit conversion takes 12 clock cycles for the comparisons, plus the sampling time you choose.

## Resolution and the step size

The code counts steps of Vref / 2N: about 0.81 mV at 12 bits from 3.3 V, 12.9 mV at 8 bits. Every voltage within one step gives the same code, so an ideal converter is off by up to one step, the quantization error. Fewer bits convert faster and are enough for a battery level or a knob; audio and precise sensors want more. Real converters add a little offset, gain error and noise on top, which is why datasheets quote accuracy separately from resolution.

$$
\mathrm{LSB} = \frac{V_{\mathrm{ref}}}{2^N} = \frac{3.3\,\mathrm{V}}{4096} \approx 0.81\,\mathrm{mV} \qquad \mathrm{code} = \left\lfloor \frac{V_{\mathrm{in}}}{\mathrm{LSB}} \right\rfloor
$$

## Sample, then hold

The comparisons take time, and the input must not move while they happen, or the later bits answer a different question from the earlier ones. So a conversion starts by connecting the input to a small capacitor for the sampling time, then disconnecting it and converting the voltage it holds. A source with a high resistance needs a longer sampling time to charge that capacitor fully. How often to sample is a separate question: a signal must be sampled more than twice as fast as its highest frequency, or it aliases. Finished conversions are usually moved out by an interrupt or by DMA.
