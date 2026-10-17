---
id: i2c
title: "I²C"
section: Protocols
group: Synchronous buses
source: src/protocols/i2c.ts
url: ?p=i2c
---
# I²C
*Inter-Integrated Circuit*

## Summary
A two-wire bus shared by many devices on the same board. Devices can pull either line low but never drive it high; pull-up resistors return the lines high. Each target has an address (7 bits, or optionally 10), and the receiver of each byte confirms it with an acknowledge bit (ACK).

## Used in
Temperature and motion sensors, EEPROMs, real-time clocks and small OLED displays, often many of them on the same two wires.

**Tags:** synchronous, single-ended, open-drain, half duplex, multi-drop, addressed, chip-to-chip

## At a glance
- **Clock:** Synchronous. The controller drives SCL, but a target can hold it low to pause a transfer, which is called clock stretching.
- **Wires:** SCL (clock) and SDA (data), plus ground, shared by every device, with one pull-up resistor on each line.
- **Drive:** Open-drain. Devices can only pull a line low; the pull-up resistor returns it high, which is why rising edges are slow.
- **Duplex:** Half duplex. SDA carries data in one direction at a time.
- **Topology:** A shared bus: many targets, and optionally several controllers, on the same two wires.
- **Addressing:** 7-bit addresses sent at the start of each transfer, giving about 112 usable addresses. An optional 10-bit mode sends the address in two bytes.
- **Flow control:** An ACK or NACK after every byte, plus clock stretching when a target needs more time.
- **Error checking:** An ACK confirms only that a byte was received, not that it was correct. There is no checksum, although SMBus adds an optional CRC-8 called PEC.
- **Speed:** 100 kHz (Standard mode), 400 kHz (Fast mode), 1 MHz (Fast-mode Plus), 3.4 MHz (High-speed mode, rarely used), and 5 MHz Ultra-fast mode, which is write-only and push-pull.
- **Reach:** Circuit-board distances. The specification allows at most 400 pF of bus capacitance, roughly a meter of wiring plus the connected devices.

## Strengths
- Two wires serve any number of devices, so adding a sensor requires no additional pins.
- Addressing and acknowledgments are built in, so a missing device is detected immediately.
- Several controllers can share one bus; arbitration on SDA determines which one proceeds, without corrupting data.

## Limits
- Relatively slow, because the pull-up resistor must charge the bus capacitance on every rising edge.
- Choosing the pull-up value is a trade-off: smaller resistors give faster edges but consume more current.
- Many devices have fixed or limited address options, so two identical sensors can conflict.
- A single faulty device holding SDA low can stop the entire bus until it is reset.

## Settings
- **Address** — The target address in hexadecimal: 0x00 to 0x7F for 7-bit addresses, or up to 0x3FF for 10-bit addresses.
- **Address size** — Most devices use 7-bit addresses. 10-bit addressing sends the address in two bytes, beginning with the reserved prefix 11110.
- **Direction** — Write sends data to the target, and Read receives data from it. Register read first writes a register number and then reads from that register, which is how most sensors are accessed.
- **Register** — The register to read from. Used only when Direction is set to Register read.
- **Data** — The bytes transferred after the address. In a write the controller sends them; in a read they are the bytes the target returns.
- **As** — Whether Data is read as text characters or as hexadecimal bytes, such as 48 69.
- **Target** — Whether a device with this address responds. Missing shows what the controller sees when no device acknowledges the address.
- **Clock stretching** — Whether the target holds the clock low before the data phase to gain extra time, which is called clock stretching.
- **Speed** — The bus speed grade. Faster modes need smaller pull-up resistors or less bus capacitance. On the diagram, only the timescale changes.

## Going deeper
### The register read
Most I²C sensors behave like a small memory with an internal pointer. To read from one, the controller writes the register number, issues a repeated START, sends the address again with the read bit set, and then reads. Most devices advance the pointer after each byte, so a multi-byte read returns consecutive registers.
The repeated START matters because the controller keeps ownership of the bus, so another controller cannot begin a transfer between the write and the read. Set Direction to "Register read" above to see the complete sequence.
### Choosing pull-up resistors
Smaller pull-up resistors produce faster rising edges, but every device pulling a line low must then sink more current. The specification limits that current to 3 mA in Standard and Fast mode, so the smallest pull-up is about (VDD − 0.4 V) / 3 mA, roughly 1 kΩ at 3.3 V.
The largest value is set by the required rise time: R = t_r / (0.8473 × C_bus), where t_r is at most 1000 ns in Standard mode, 300 ns in Fast mode and 120 ns in Fast-mode Plus. A Fast-mode bus with 200 pF of capacitance therefore needs about 1.8 kΩ or less. Smaller buses with less capacitance are why 2.2 kΩ to 4.7 kΩ are the usual choices. A resistor that is too large makes the rising edges so slow that bits are misread.
### Clock stretching
A target that needs more time can hold SCL low after the controller releases it. The controller must detect that SCL has not risen and wait, which is why it must read back the actual level of SCL rather than assuming it rose on schedule. Set Clock stretching above to see it.
Not every controller handles stretching well. The original Raspberry Pi I²C controller had a well-known fault with short stretches, and SMBus limits how long a stretch may last.
### Recovering a stuck bus
If the controller resets partway through a read, a target may be in the middle of sending a 0 and continue holding SDA low while it waits for clock pulses that never arrive. No other transfer can take place. The specification describes the remedy: the controller toggles SCL up to nine times until the target finishes its byte and releases SDA, then sends a STOP condition.
### Resolving address conflicts
Many devices have one to three address pins that select between a small number of addresses, allowing two or four identical sensors on one bus. Beyond that, an I²C multiplexer such as the TCA9548A divides the bus into eight branches and connects one at a time. Some devices allow their address to be changed in software, and some designs use a second bus.
### SMBus and PMBus
SMBus is a stricter variant of I²C designed for PC motherboards and batteries. It adds a timeout (a device that holds the clock low for more than about 35 ms is reset), a minimum clock speed, standard message formats such as read byte and block read, an optional CRC-8 called PEC, and an alert line. PMBus builds on SMBus to control power supplies. At 100 kHz, most I²C and SMBus devices interoperate without problems.
