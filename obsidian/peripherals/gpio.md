---
id: gpio
title: "GPIO"
section: Peripherals
group: Pins
source: src/topics/gpio.ts
url: ?p=gpio
---
# GPIO

## Intro
A general-purpose I/O pin is a few switches and resistors behind one pad. As an output it connects the pad to 3.3 V or to ground; as an input it lets something else set the voltage and reads it. Below is pin PA5 as the circuit inside the chip, with a button outside it. Set the registers, press the button, and follow where the current goes. The registers themselves are covered in Memory-mapped I/O.

## Push-pull and open-drain

A push-pull output has two switches, transistors in silicon: P connects the pin to 3.3 V and N connects it to ground, and exactly one is on, so the pin is always driven. An open-drain output has only N. Writing 0 pulls the pin low; writing 1 lets go, and something else must pull it high: a resistor, inside or outside the chip. That sounds like a weakness, but it lets several devices share one wire safely. Any of them can pull it low, and none can fight another by driving high, which is why I²C and 1-Wire use it.

## Pull-ups and floating inputs

An input with nothing connected is floating: its voltage drifts with leakage and nearby signals, and IDR can read 0 or 1 at random. A pull resistor gives it a default. The internal pulls are weak, about 40 kΩ, so anything stronger, such as a button to ground, wins easily: with a pull-up and the button pressed, about 82 µA flows and the pin reads 0. Released, the pull-up brings it back to 1. That is why a button wired to ground reads 0 when pressed, and why a long or noisy wire may want a stronger external resistor.

$$
I = \frac{V_{\mathrm{DD}}}{R_{\mathrm{pull}}} = \frac{3.3\,\mathrm{V}}{40\,\mathrm{k}\Omega} \approx 82\,\mu\mathrm{A}
$$

## The short to avoid

Drive a push-pull pin high while the button connects it to ground, and the only thing limiting the current is the few tens of ohms of the switches: tens of milliamps, beyond the 25 mA a pin on this chip can safely carry. The fix is to read buttons on inputs, to use open-drain when a wire can be driven from both ends, or to add a series resistor. A button also bounces when pressed, so a pin may read several presses for one; that is debouncing.

$$
I \approx \frac{V_{\mathrm{DD}}}{R_{\mathrm{P}}} = \frac{3.3\,\mathrm{V}}{50\,\Omega} \approx 66\,\mathrm{mA} \gg 25\,\mathrm{mA}
$$
