---
id: peripherals-start
title: "Peripherals"
section: Peripherals
group: Start here
source: src/topics/peripherals-start.ts
url: ?p=peripherals-start
---
# Peripherals

## Intro
Peripherals are the hardware blocks beside the processor that deal with the world outside it: pins, timers, converters and DMA. Each one is controlled through registers at fixed addresses, and each does its job without running any code, so the CPU is free to do something else. The pages use an STM32F4 and the register names from its reference manual.
Start with GPIO →

- 1 Pins How a pin drives a wire, and how it reads one. GPIOPush-pull and open-drain outputs, pull-up and pull-down resistors, and what an input reads. DebouncingWhy one button press looks like many, and how to count it once.
- 2 Time Counting clock edges to measure and make time. TimersThe prescaler, the counter and the auto-reload register, and how they set an update rate. PWMA compare register turns the counter into a square wave with a chosen duty cycle. WatchdogA timer that resets the chip unless the program keeps proving it is alive.
- 3 Analog Turning voltages into numbers and back. ADCA successive-approximation converter finds a voltage one bit at a time. DACA number becomes a voltage, one step of the reference at a time.
- 4 Data Moving data without the processor. DMAA transfer engine copies between a peripheral and memory while the CPU runs other code.

## Before you start

The pages build on a few from other sections. If any of these is new, read it first:

- Memory-mapped I/O: a peripheral is controlled through registers at addresses.
- Masks: registers are set and read a field at a time.
- Read-modify-write: changing one field must not disturb the others.

## Reading the diagrams

Signals are drawn on the glass as on an oscilloscope: time runs left to right, and each lane is one pin or one value. A dashed trace is the ideal or the reference. The readout above the glass gives the numbers, and the formulas in the text show where they come from.

## Words this section uses

- Peripheral: A hardware block on the chip that does one job alongside the CPU, such as a timer or a serial port. See Parts and terms.
- Clock and prescaler: A peripheral counts the ticks of its clock, often divided down first by a prescaler. See Timers.
- Pull-up: A resistor that holds an input high when nothing else drives it. See GPIO.
- Duty cycle: The fraction of each period that a signal is high. See PWM.
- Resolution: How many bits a converter’s code has: 12 bits make 4096 steps. See ADC.
- Reference voltage: The voltage that a converter’s full-scale code stands for, 3.3 V on these pages. See ADC.
- Interrupt flag: A status bit an event sets, which can make the CPU run a handler. See Interrupts.
- DMA request: A peripheral’s signal asking DMA to move one item of data. See DMA.

## After this section

Carry on to Power and clocks: where a chip’s clocks come from and how it saves energy: PLLs, sleep modes, battery life and brown-out.
