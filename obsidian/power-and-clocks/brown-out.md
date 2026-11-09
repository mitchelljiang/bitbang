---
id: brownout
title: "Brown-out"
section: Power and clocks
group: Energy
source: src/topics/brownout.ts
url: ?p=brownout
---
# Brown-out

## Intro
When a supply sags, digital logic does not stop cleanly. It keeps running with marginal timing and can misread flash or corrupt memory. So a chip watches its own supply and holds itself in reset when the voltage is too low. This is the RP2350’s 1.1 V core supply, with a dip you can shape.

## Two detectors

Power-on reset holds the chip in reset as the supply comes up, until DVDD passes a threshold of typically 0.957 V. Brown-out detection does the reverse job during operation: if DVDD falls below its threshold, nominally 0.946 V at power-on, it resets the chip. The threshold can be set in steps of 43 mV from 0.473 V to 1.204 V through the VSEL field of the BOD register, and the chip stays in reset until DVDD is back above 101% of it. Note that the register’s field list still marks 0.860 V as the default; its reset value of 0x0b and the prose both give 0.946 V.

## Why a short dip can pass

A detector with no delay would reset on every spike. The RP2350’s takes typically 3 µs, and at most 10 µs, to act on a low supply. Between those two figures it may or may not reset, so a robust design treats the whole window as unknown.

## Choosing a threshold

Too low, and the chip keeps running on a voltage it is not specified for. Too high, and normal ripple resets it. Keep it above the lowest voltage at which the chip’s clock speed is guaranteed, and fix the cause of real dips: decoupling capacitors near the power pins and a regulator that can supply the load step. After a reset, the watchdog and reset-reason registers tell the firmware what happened, so it can record the event.
