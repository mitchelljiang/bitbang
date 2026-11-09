---
id: protocols-start
title: "Protocols"
section: Protocols
group: Start here
source: src/topics/protocols-start.ts
url: ?p=protocols-start
---
# Protocols

## Intro
A protocol is the agreement two chips share about what the voltages on a few wires mean: when to read the line, which bit comes first, how a message starts and ends, and who may talk next. This section draws each one as an oscilloscope would see it, from a single UART wire to the lanes of PCI Express, with every bit labelled.
Start with How protocols work →

- 1 Asynchronous serial No clock line: timing comes from an agreed baud rate or from pulse widths. UARTTwo wires and no clock line; both devices agree on a baud rate in advance. RS-232UART at inverted ±12 V levels: the traditional serial port. RS-485UART over a differential pair, for long cables and many devices. 1-WireData and power on a single wire, in microsecond time slots. WS2812Addressable LED strips, where a long pulse is a 1 and a short pulse is a 0.
- 2 Synchronous buses A controller drives a clock line, and data is read on its edges. SPIClock, data out, data in and chip select. Simple and fast. Quad SPISPI with four data lines, used by most microcontrollers to read external flash. I²CTwo wires shared by every device on the board, with an acknowledgment for each byte. I3CA faster successor to I²C, with dynamic addresses and in-band interrupts.
- 3 Expansion buses Connections inside a computer, to expansion cards and drives. PCIThe parallel bus that PCI Express replaced: 32 shared lines and a 33 MHz clock. PCIeSerial lanes using 8b/10b encoding in early generations and 128b/130b from Gen3. SATAStorage link built from 8b/10b symbols, primitives and frames.
- 4 Memory interfaces The links between a processor and its external memory. DDR SDRAMDouble data rate memory: data on both clock edges, with a strobe for each byte lane.
- 5 USB Plug-in devices, connected through a host. USB 2.0Host-controlled packets using NRZI encoding, bit stuffing and a sync pattern. USB 3.xSuperSpeed links with separate transmit and receive pairs. USB4Carries USB, DisplayPort and PCIe traffic over a single USB-C link.
- 6 Video & display High-bandwidth links for cameras and displays. HDMITMDS encoding: 8 bits become 10, with as few transitions as possible. MIPI CSI-2Camera lanes that switch between high-speed and low-power modes.
- 7 Ethernet One frame format for every speed and medium, and a different physical layer for each. Ethernet frameThe fields every variant shares: preamble, MAC addresses, EtherType, payload and CRC-32. 10BASE-TThe frame at 10 Mbit/s, Manchester-encoded on one twisted pair in each direction. 100BASE-TXThe frame at 100 Mbit/s: 4B5B coding, then three-level MLT-3 on the cable. 1000BASE-TThe frame at 1 Gbit/s: five-level PAM-5 on all four pairs, in both directions at once. 1000BASE-XThe frame at 1 Gbit/s over fiber, in the same 8b/10b code as PCIe. MII and RMIIHow a microcontroller’s Ethernet controller talks to the PHY chip that drives the cable.
- 8 Automotive & industrial Shared buses that tie together the sensors, motors and controllers in a car or a factory. CANBitwise arbitration where the lowest ID wins. Standard in vehicles. LINA low-cost single-wire vehicle bus, based on UART framing. Modbus RTURequest-and-response messaging over RS-485, widely used in industrial equipment.
- 9 Audio Digital audio between chips and devices. I²SBit clock, word select and data, carrying left and right audio samples. PDMThe high-rate 1-bit output of digital MEMS microphones. S/PDIFSelf-clocking digital audio over coax or optical.
- 10 Debug & programming How a debugger connects to the inside of a chip. JTAGA 16-state TAP controller, navigated with TMS. SWDArm's two-pin alternative to JTAG.
- 11 Wireless & IR Links without a physical connection. NEC IRTelevision remote codes, sent as 38 kHz bursts with data encoded in the gaps. 433 MHz OOKCarrier switched on and off, used by garage doors and weather stations. Bluetooth LEAdvertising packets: preamble, access address, payload, CRC.

## Before you start

The pages build on a few from other sections. If any of these is new, read it first:

- How protocols work: the questions every protocol answers, which each page’s spec sheet links back to.
- Binary and hexadecimal: the data on the wire is written in hex.
- Checksums and CRC: most frames end with a check value.

## Reading the diagrams

Every protocol page is an oscilloscope: time runs left to right, with one trace per wire. Click any bit, or use the arrow keys, to step through the frame and read what each part means. The controls under the scope change the data and the settings, and the spec sheet below it links each property to How protocols work.

## Words this section uses

- Bit rate: How many bits are sent each second. A UART at 115200 baud sends 115,200 bits a second. See UART.
- Asynchronous: No clock wire: both sides agree on the bit rate in advance and time the bits themselves. See UART.
- Synchronous: A clock wire marks the moment each bit is read. See SPI.
- Frame: One complete unit on the wire: a start, the data, any check, and an end. See UART.
- Open-drain: Outputs that can only pull a line low, with a resistor pulling it high, so many devices can share it. See I²C.
- Acknowledge: The receiver’s signal that it got the data, such as I²C’s ACK bit. See I²C.
- Differential: A signal on a pair of wires driven opposite ways and read as their difference, which cancels noise. See RS-485.
- Line code: A mapping from bits to levels that keeps the line changing, so the receiver can recover the clock. See How protocols work.

## After this section

Carry on to Architecture: how the processor runs a program: the instructions it reads, the registers it works in, and the pipeline that runs them.
