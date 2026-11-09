---
id: spi
title: "SPI"
section: Protocols
group: Synchronous buses
source: src/protocols/spi.ts
url: ?p=spi
---
# SPI
*Serial Peripheral Interface*

## Summary
A fast, simple link between a controller and one or more targets. The controller drives a clock and selects a target by pulling its chip-select (CS) line low. On every clock cycle, one bit travels from the controller to the target on MOSI and one bit travels back on MISO at the same time.

## Used in
Flash memory, SD cards, small displays, fast analog-to-digital and digital-to-analog converters, and some radio chips.

**Tags:** synchronous, single-ended, push-pull, full duplex, multi-drop, daisy chain, chip-to-chip

## At a glance
- **Clock:** Synchronous. The controller drives SCLK, and data is sampled on one of its edges, as set by the SPI mode.
- **Wires:** SCLK, MOSI and MISO, shared by all targets, plus one CS line per target: four wires for a single target, and 3 + N for N targets.
- **Drive:** Push-pull. A target drives MISO only while its CS line is low and leaves it released (high-impedance) otherwise.
- **Duplex:** Full duplex. Each clock cycle shifts one bit out on MOSI and one bit in on MISO.
- **Topology:** One controller and one or more targets, each selected by its own CS line. Some devices can also be daisy-chained.
- **Addressing:** By wire: the CS line selects the target, so no address is sent over the bus.
- **Flow control:** None. The controller sets the pace, and a target has no way to request a pause.
- **Error checking:** None in the protocol itself. Some devices add their own CRC or status bytes.
- **Speed:** Not fixed by any standard: the clock can run as fast as both devices and the wiring allow. Commonly 1 to 50 MHz, up to about 80 MHz for fast flash and displays, and above 100 MHz for some flash devices.
- **Reach:** Circuit-board distances, or a short cable at most. Fast edges and timing differences between clock and data limit longer connections.

## Strengths
- Fast and simple to implement: at its core it is two shift registers and a clock.
- Full duplex, with no address or acknowledgment overhead, so every clock cycle carries data.
- Supports any word length and any clock rate the target can handle, with no fixed framing.

## Limits
- Each additional target requires another CS line, so the pin count grows with the number of devices.
- There is no acknowledgment. If no target is connected, the controller simply reads whatever level is on MISO, usually all 1s or all 0s.
- Not a single formal standard: clock mode, bit order, word size and maximum speed vary between devices, so each datasheet must be checked.
- Suitable only for short distances.

## Settings
- **MOSI** — The bytes the controller sends to the target on MOSI.
- **MISO** — The bytes the target sends back on MISO during the same clock cycles. If left empty, the target returns 0x00.
- **As** — Whether MOSI and MISO are read as hexadecimal bytes or as text characters.
- **Mode** — CPOL sets the level at which the clock idles, and CPHA sets whether data is sampled on the first or the second clock edge. Both devices must use the same mode.
- **Bit order** — Whether each byte is sent most significant bit first, as most devices expect, or least significant bit first.
- **Clock** — The SCLK frequency. It changes the timescale, not the sequence of bits.

## Going deeper
### Finding the mode in a datasheet
Datasheets often show a timing diagram rather than naming the SPI mode. Two observations determine it. First, the level of SCLK when CS goes low: low means CPOL = 0, and high means CPOL = 1. Second, the edge on which data is sampled: if the device samples on the first clock edge, CPHA = 0; if data changes on the first edge and is sampled on the second, CPHA = 1.
Modes 0 and 3 cover most devices, and many accept both, because in each case data is sampled on a rising edge.
### Signal names: MOSI, MISO, SDO, SDI, COPI, CIPO
The traditional names are MOSI and MISO. Newer datasheets often use SDO (serial data out) and SDI (serial data in), named from each device's own perspective, so the controller's SDO connects to the target's SDI. The open hardware community has adopted COPI and CIPO (controller out, peripheral in). The chip-select line also appears as SS, nCS, CE or SYNC.
### What limits the clock rate
Writing data at high speed is straightforward. Reading is harder, because the clock edge must travel to the target, the target needs time to update MISO, and the new value must travel back, all before the controller samples it. At 50 MHz, that round trip must fit within 10 ns. Many SPI controllers offer a delayed-sampling option that samples MISO later in the cycle, and short traces also help.
### Chip select does more than select
Many devices act when CS goes high: an analog-to-digital converter starts a conversion, a digital-to-analog converter updates its output, or a flash device starts an erase. CS going low also resets the device's bit counter, so a glitch on CS during a transfer can shift every following byte by several bits. Some commands require CS to stay low for an entire multi-byte sequence.
Every target must release MISO when its CS line is high. Some low-cost modules, and SD cards in SPI mode until they receive one additional clock cycle, do not, which causes errors that are difficult to diagnose on a shared bus.
### 3-wire SPI and daisy chains
3-wire SPI combines MOSI and MISO into a single bidirectional data line to save a pin. The trade-off is full duplex: the controller sends a command, then releases the line and reads the response.
A daisy chain does the opposite: many devices share one CS line, and each device's output feeds the next device's input. For example, shifting 16 bits through two 74HC595 shift registers and then raising CS updates both at once. LED drivers and some digital-to-analog converters are designed for this arrangement.
