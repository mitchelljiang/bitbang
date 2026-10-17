---
id: qspi
title: "Quad SPI"
section: Protocols
group: Synchronous buses
source: src/protocols/qspi.ts
url: ?p=qspi
---
# Quad SPI
*Quad Serial Peripheral Interface*

## Summary
SPI with four data lines instead of one in each direction. A flash read sends an instruction, an address and a number of dummy clock cycles, after which the flash returns four bits per clock. Each command specifies how many lines its instruction, address and data phases use, written as 1-1-4, 1-4-4 and so on.

## Used in
External flash memory for microcontrollers (often running code directly from it), ESP32 and RP2040 boards, FPGA configuration flash, and some displays.

**Tags:** synchronous, single-ended, push-pull, half duplex, point-to-point, chip-to-chip, memory

## At a glance
- **Clock:** Synchronous. The controller drives SCLK, usually in SPI mode 0 (most flash devices also accept mode 3), and both devices sample on the rising edge.
- **Wires:** CS, SCLK and four bidirectional data lines, IO0 to IO3. In single-line commands, IO0 acts as MOSI and IO1 as MISO, while IO2 and IO3 serve as the write-protect and hold pins.
- **Drive:** Push-pull. Each IO line changes direction partway through a read, and the dummy cycles give both devices time to switch.
- **Duplex:** Half duplex during four-line phases, because all four lines carry data in one direction at a time.
- **Topology:** Usually one controller and one flash device; a second device needs its own CS line.
- **Addressing:** The CS line selects the device, and a 24-bit (or 32-bit) address within the command selects the byte.
- **Flow control:** None on the bus. Writes and erases take milliseconds, so the controller polls a status register until the device is ready.
- **Error checking:** None on the bus. Some flash devices add error correction (ECC) inside the memory array.
- **Speed:** Commonly 50 to 133 MHz. At four bits per clock, that is up to about 66 MB/s, and double transfer rate (DTR) modes double it.
- **Reach:** Circuit-board distances only, with short traces.

## Strengths
- Four times the throughput of standard SPI with only two additional pins.
- Fast enough for a processor to run code directly from external flash, known as execute in place.
- Backward compatible: the same device still accepts standard single-line SPI commands.

## Limits
- Commands, dummy cycle counts and quad-enable settings differ between flash vendors, so drivers need device-specific configuration.
- The bus must change direction during every read, which costs dummy cycles.
- Signal integrity becomes difficult above 100 MHz: traces must be short and closely matched in length.

## Settings
- **Command** — The read command. The three numbers give the lines used for the instruction, the address and the data: 1-4-4, for example, sends the instruction on one line and the address and data on four.
- **Address** — The 24-bit flash address to read from, in hexadecimal.
- **Data read back** — The bytes the flash returns from that address.
- **As** — Whether the data is read as hexadecimal bytes or as text characters.
- **Clock** — The SCLK frequency. It changes the timescale; the number of clock cycles depends only on the command.

## Going deeper
### Execute in place (XIP)
Most QSPI controllers have a memory-mapped mode in which the external flash appears as ordinary read-only memory. When the processor fetches an instruction from that address range, the controller issues the read command automatically. This allows code to run directly from external flash, at the cost of higher latency than internal flash, which caches reduce.
Continuous read mode reduces the overhead further: after the first read, the mode bits tell the flash to expect another read, so subsequent accesses omit the instruction byte.
### Enabling quad mode
In single-line mode, IO2 and IO3 serve as the write-protect (WP#) and hold (HOLD#) pins. Most flash devices therefore require a Quad Enable (QE) bit in a status register to be set before quad commands work; on many Winbond devices it is bit 1 of Status Register 2. If quad reads return incorrect data while single-line reads succeed, an unset QE bit is the most likely cause. On many devices the bit is non-volatile, so it only needs to be set once.
### Dummy cycles and clock rate
The number of dummy cycles a read requires depends on the clock frequency: the flash needs a fixed amount of time to access its memory array, so faster clocks require more cycles. Some devices make the count configurable. If the controller and the flash disagree on the count, every byte is read shifted by several bits.
### 3-byte and 4-byte addresses
A 24-bit address reaches 16 MB. Larger devices either switch into 4-byte address mode (command 0xB7, Enter 4-Byte Address Mode) or provide separate 4-byte commands, such as 0xEC for a quad I/O read with a 4-byte address.
### SFDP: discovering capabilities
Most modern flash devices implement Serial Flash Discoverable Parameters (JEDEC JESD216), a table read with command 0x5A. It describes the supported read commands, their dummy cycle counts, the address modes and the erase sizes, which allows a driver to configure a device it has no specific knowledge of.
### Beyond quad: DTR and octal
Double transfer rate (DTR) modes transfer data on both clock edges. Octal SPI, standardized as xSPI (JESD251), uses eight data lines and a data strobe (DQS) that the flash drives alongside the data, so the controller can sample reliably at 200 MHz DDR and above, for roughly 400 MB/s.
