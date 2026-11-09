---
id: onewire
title: "1-Wire"
section: Protocols
group: Asynchronous serial
source: src/protocols/onewire.ts
url: ?p=onewire
---
# 1-Wire
*Dallas/Maxim single-wire bus*

## Summary
A bus that uses a single wire for data, and often for power as well. There is no clock: the controller begins every bit by pulling the line low, and the length of the low pulse determines the bit. A short pulse is a 1 and a long pulse is a 0. Every transaction begins with a reset pulse, to which devices respond with a presence pulse.

## Used in
DS18B20 temperature probes, iButton keys, and identification chips in battery packs, printer cartridges and laptop chargers.

**Tags:** asynchronous, single-ended, open-drain, half duplex, multi-drop, addressed, cable

## At a glance
- **Clock:** None. Each bit is a time slot that the controller begins with a falling edge, and devices time the rest of the slot from that edge.
- **Wires:** One data wire (DQ) plus ground. Devices can also draw their power from the data line, known as parasite power.
- **Drive:** Open-drain with a pull-up resistor, typically 4.7 kΩ. Any device can pull the line low; no device drives it high.
- **Duplex:** Half duplex: a single wire carrying data in one direction at a time.
- **Topology:** A shared bus: one controller and many devices on the same wire.
- **Addressing:** Every device has a unique 64-bit ROM ID programmed at the factory: an 8-bit family code, a 48-bit serial number and an 8-bit CRC. The Search ROM command discovers them.
- **Flow control:** The controller begins every time slot, so it sets the pace. Devices respond only within slots that the controller opens.
- **Error checking:** A CRC-8 protects the ROM ID and data such as the DS18B20 scratchpad. Individual bits are not checked.
- **Speed:** About 15 kbit/s at standard speed, and about 125 kbit/s in overdrive mode.
- **Reach:** Tens of meters with a simple pull-up resistor, and more with a stronger, actively switched pull-up.

## Strengths
- A single wire plus ground, even for power, which suits sensors at the end of long cables.
- Every device has a unique ID, so dozens of sensors can share one wire without any address configuration.
- Low-cost devices and minimal wiring.

## Limits
- Slow: a single bit takes about 70 µs.
- Timing requirements are strict; a software implementation must keep interrupts disabled for the duration of each slot.
- Parasite-powered devices require a strong pull-up during operations such as temperature conversions.
- Largely a single-vendor ecosystem (Maxim, now part of Analog Devices).

## Settings
- **Write** — The command bytes the controller writes after the reset, in hexadecimal. The default, CC BE, is Skip ROM followed by Read Scratchpad.
- **Then read** — The bytes the device returns in read time slots, in hexadecimal. Leave empty for a write-only transaction.
- **Device** — Whether a device answers the reset with a presence pulse. Missing shows what the controller sees on an empty bus.

## Going deeper
### The 64-bit ROM ID
Every 1-Wire device carries a factory-programmed 64-bit ID, transmitted least significant bit first: an 8-bit family code (0x28 for the DS18B20, 0x01 for the DS2401 serial number), a 48-bit serial number, and a CRC-8 over the first seven bytes (polynomial x⁸ + x⁵ + x⁴ + 1). The family code identifies the device type, and the CRC lets the controller verify that the ID was read correctly.
### Search ROM: finding every device
The Search ROM command (0xF0) discovers all devices on the bus one ID at a time, as a binary tree search. For each bit position, every participating device transmits its ID bit and then the complement of that bit. Because the bus is wired-AND, the controller reads 0 then 1 if all devices have a 0, 1 then 0 if all have a 1, and 0 then 0 if both values are present.
The controller then writes the bit value it chooses to follow, and devices whose ID differs drop out until the next search. After 64 bits exactly one ID has been read; repeating the search with different choices at each conflict enumerates the rest.
### Parasite power
A device in parasite-power mode has no supply pin connected. It charges an internal capacitor from the data line while the line is high. Some operations, such as a DS18B20 temperature conversion, draw more current than the pull-up resistor can supply, so the controller must switch in a strong pull-up, typically a MOSFET to the supply rail, within about 10 µs of issuing the command and hold it for the duration of the conversion.
### Reading a DS18B20
A typical temperature read is two transactions. The first is a reset, Skip ROM (0xCC) and Convert T (0x44), followed by a wait of up to 750 ms at 12-bit resolution. The second is a reset, Skip ROM and Read Scratchpad (0xBE), followed by nine bytes: the temperature (least significant byte first, in units of 1/16 °C), two alarm thresholds, a configuration byte, three reserved bytes and a CRC.
The default read data on this page, 0x50 0x05, is 0x0550, or 85.0 °C. That is the DS18B20's power-on value, so a reading of exactly 85 °C usually means a conversion was never triggered or had not finished.
### Overdrive speed
Many devices support overdrive, with timing roughly ten times shorter: for example, a reset low time of about 48 µs instead of 480 µs. The controller switches a device into overdrive with the Overdrive Skip ROM (0x3C) or Overdrive Match ROM (0x69) command.
### Long cables
1-Wire can run tens to hundreds of meters, but cable capacitance slows each rise through the pull-up, and branches cause reflections. Linear topologies with short stubs work best. For long networks, bridge chips such as the DS2482 replace the simple resistor with an actively controlled pull-up and precise slot timing.
