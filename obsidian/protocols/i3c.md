---
id: i3c
title: "I3C"
section: Protocols
group: Synchronous buses
source: src/protocols/i3c.ts
url: ?p=i3c
---
# I3C
*Improved Inter-Integrated Circuit*

## Summary
The successor to I²C, using the same two wires. The controller drives the clock actively at up to 12.5 MHz. Each transfer begins in open-drain mode so that devices can arbitrate and acknowledge, then switches to push-pull drive for the data. Each data byte ends with a T-bit instead of an ACK: odd parity on writes, and an end-of-data flag from the target on reads. In HDR-DDR mode, data is transferred on both clock edges.

## Used in
Recent sensors in phones and wearables, sensor hubs, and the sideband bus on DDR5 memory modules, where JEDEC uses I3C Basic.

**Tags:** synchronous, single-ended, open-drain, push-pull, half duplex, multi-drop, addressed, chip-to-chip

## At a glance
- **Clock:** Synchronous. The controller drives SCL push-pull at up to 12.5 MHz. Targets cannot stretch the clock.
- **Wires:** SCL and SDA, plus ground, shared by every device, as in I²C.
- **Drive:** Mixed. SDA is open-drain during addresses and acknowledgments, so several devices can share it, and push-pull during data. SCL is always push-pull.
- **Duplex:** Half duplex. SDA carries data in one direction at a time.
- **Topology:** A shared bus with one active controller. Other devices can request the controller role, and many I²C devices can share the bus.
- **Addressing:** 7-bit dynamic addresses assigned by the controller at startup, so two identical devices never conflict. 0x7E is the broadcast address.
- **Flow control:** No clock stretching. During reads, the target ends a message with its T-bit. Targets can raise in-band interrupts on SDA instead of using a separate interrupt line.
- **Error checking:** Every written data byte carries an odd-parity T-bit. The faster HDR modes add a CRC.
- **Speed:** In SDR mode, a 12.5 MHz clock gives about 11 Mbit/s of data. The HDR modes reach roughly 25 to 33 Mbit/s on the same wires.
- **Reach:** Circuit-board distances. It allows less bus capacitance than I²C, which is what makes the higher speed possible.

## Strengths
- Roughly 10 to 30 times faster than I²C on the same two wires.
- Dynamic addressing: the controller assigns addresses, so identical sensors do not conflict.
- In-band interrupts replace the separate interrupt line that each I²C sensor usually needs.
- Push-pull data drive uses less power than pulling against a resistor for every 0.

## Limits
- Controllers are more complex, and fewer microcontrollers include an I3C peripheral than I²C.
- Legacy I²C devices on the bus need a 50 ns spike filter, or they may misinterpret the faster I3C traffic.
- Targets cannot stretch the clock, so a slow target must keep up or use the protocol's own mechanisms for pausing.
- The full specification is available only to MIPI members; the public I3C Basic subset omits some features.

## Settings
- **Dynamic address** — The target's 7-bit dynamic address in hexadecimal. During ENTDAA, this is the address the controller assigns.
- **Direction** — Write sends data to the target, and Read receives data from it. The HDR-DDR transfer on this page supports writes only.
- **Data** — The data bytes transferred after the address.
- **As** — Whether Data is read as text characters or as hexadecimal bytes, such as 48 69.
- **Header** — Whether the transfer begins with the broadcast address 0x7E, as I3C transfers usually do, or addresses the target directly.
- **Target** — Whether the addressed target responds. Missing shows the NACK the controller receives when no target has the address.
- **Transfer** — SDR is a standard transfer with one bit per clock. HDR-DDR is a write that transfers data on both clock edges. ENTDAA is the procedure that assigns a dynamic address to a target.
- **Provisioned ID (ENTDAA)** — The target's 48-bit Provisioned ID in hexadecimal, sent during ENTDAA. When several targets respond at once, the lowest ID wins arbitration.

## Going deeper
### Dynamic addressing
I²C addresses are fixed in silicon or set by one or two pins, so two identical sensors often cannot share a bus. An I3C device instead carries a unique 48-bit Provisioned ID, and the controller assigns each device a short 7-bit dynamic address when the bus starts up.
Because the controller chooses the addresses, it also sets priorities: lower addresses win arbitration, so assigning a device a low address gives its interrupts higher priority.
### ENTDAA: assigning the addresses
The controller broadcasts the ENTDAA command (0x07). It then repeats a single request: a repeated START followed by 0x7E with the read bit set, asking the next device without an address to respond. Every device still waiting acknowledges and begins sending its 48-bit ID, followed by its BCR and DCR, most significant bit first and in open-drain mode.
On an open-drain line, a 0 always overrides a 1. A device that transmits a 1 but reads back a 0 has lost arbitration and stops transmitting. After 64 bits, exactly one device remains: the one with the lowest ID. The controller sends it a 7-bit address and an odd parity bit, the device acknowledges, and it takes no further part. When the request receives no acknowledgment, every device has an address. Set Transfer to ENTDAA above to step through one round.
### BCR and DCR
The two bytes after the ID describe the device. The Bus Characteristics Register (BCR) indicates whether the device can raise interrupts and whether a data byte follows them, whether it has speed limitations, whether it supports the HDR modes, and whether it can act as a controller. The Device Characteristics Register (DCR) is a type code from a list maintained by MIPI, so software can distinguish, for example, an accelerometer from a gyroscope without further queries.
### In-band interrupts
An I²C sensor usually needs a dedicated interrupt line. An I3C target instead pulls SDA low while the bus is idle. The controller responds by clocking an address phase, and the target places its own address on the bus with the read bit set. If several targets request an interrupt at once, open-drain arbitration gives priority to the lowest address. The controller acknowledges to accept the interrupt, or declines it with a NACK, and may then read a data byte that describes the event.
### Hot-Join
A device that powers up after the bus is already running can announce itself by sending the reserved address 0x02 with the write bit during an arbitration. The controller then runs ENTDAA again to assign it an address, without affecting the devices that already have one.
### Common Command Codes (CCCs)
Bus management uses commands sent to 0x7E. Codes 0x00 to 0x7F are broadcast to every target; codes 0x80 to 0xFE are direct commands, followed by a repeated START and the address of one target.
Frequently used commands include ENEC and DISEC, which enable and disable interrupts and Hot-Join; RSTDAA, which clears every dynamic address; SETDASA, which converts a known static address into a dynamic one without running ENTDAA; SETMWL and SETMRL, which set the maximum write and read lengths; GETPID, GETBCR, GETDCR and GETSTATUS, which read a device's identity and status; and ENTHDR0 to ENTHDR7 (0x20 to 0x27), which enter the HDR modes.
### Sharing a bus with I²C
Legacy I²C targets can remain on an I3C bus if they have the 50 ns spike filter that Fast-mode I²C requires. I3C keeps its SCL high pulses short enough for that filter to suppress, so an I²C device never interprets I3C traffic as a START condition or as data addressed to it. The I²C devices keep their static addresses, and the controller communicates with them at I²C speeds.
### The HDR modes
HDR-DDR, shown above, transfers a bit on both clock edges. The ternary modes, HDR-TSP and HDR-TSL, go further by encoding data in the combined transitions of SCL and SDA, so both lines carry information; HDR-TSL is the variant that tolerates I²C devices on the bus. HDR-BT, bulk transport, can add further data lanes. Every HDR mode is entered with an ENTHDR command and left with the HDR exit pattern.
### Transferring the controller role
A bus can include more than one device capable of acting as controller. A secondary controller requests the bus with a request similar to an in-band interrupt, and the active controller hands over control with the GETACCCR command. This allows, for example, a sensor hub to manage the bus while the main processor sleeps.
