---
id: 1000basex
title: "1000BASE-X"
section: Protocols
group: Ethernet
source: src/protocols/gigx.ts
url: ?p=1000basex
---
# 1000BASE-X
*Gigabit Ethernet over fiber (IEEE 802.3z)*

## Summary
Ethernet at 1 Gbit/s over fiber (1000BASE-SX and LX), or over short copper links (CX) and backplanes. It carries the same Ethernet frame in 8b/10b code, the same code as PCIe Gen1 and SATA: every byte becomes 10 bits with a balanced number of 1s and 0s, at 1.25 Gbaud. Control codes mark the start and end of each frame and fill the gaps between them, and on fiber each 1 is a pulse of light.

## Used in
SFP fiber modules in switches and routers, SGMII links between Ethernet controllers and PHY chips, and gigabit backplanes.

**Tags:** embedded clock, differential, full duplex, point-to-point, cable, networking, 8b/10b

## At a glance
- **Clock:** Embedded. 8b/10b guarantees frequent transitions, and the receiver aligns to code-group boundaries on the K28.5 comma in every idle.
- **Wires:** A pair of fibers, one per direction, usually in an SFP module; or a differential copper pair each way for CX and SGMII.
- **Drive:** On fiber, light on for a 1 and off for a 0; on copper, a differential pair.
- **Duplex:** Full duplex, a fiber in each direction.
- **Topology:** Point-to-point: each fiber link connects one port to one other port.
- **Addressing:** 48-bit MAC addresses, in the frame.
- **Flow control:** PAUSE frames, negotiated by the 1000BASE-X autonegotiation code words sent during idle.
- **Error checking:** The frame’s CRC-32, plus 8b/10b itself: a code group that is not in the table, or that breaks the running disparity, is a detected error.
- **Speed:** 1 Gbit/s of data, 1.25 Gbaud on the line, because 8b/10b sends 10 bits for every 8.
- **Reach:** About 550 m on multimode fiber (SX), 5 km or more on single-mode fiber (LX), 25 m on copper (CX).

## Strengths
- DC-balanced code that works through capacitors, transformers and optical receivers alike.
- Every 10-bit code group is checked twice, against the table and against the running disparity, so bit errors are caught right away.
- The same physical coding as Fibre Channel, PCIe Gen1 and SATA, so the hardware is well understood and widely shared.

## Limits
- 20% of the line rate is spent on coding: 1.25 Gbaud carries 1 Gbit/s. 10 Gbit/s Ethernet switched to 64b/66b to cut that to 3%.
- Needs an optical module and fiber, or very short copper.
- Point-to-point only; every link needs a switch port at each end.

## Settings
- **Destination** — The destination MAC address, as six hexadecimal bytes. ff:ff:ff:ff:ff:ff is the broadcast address, which every device accepts.
- **Source** — The MAC address of the sender, as six hexadecimal bytes.
- **EtherType** — The EtherType, a 2-byte code that identifies the payload protocol, such as 0800 for IPv4. 88B5 is reserved for local experiments.
- **Payload** — The frame payload, up to 46 bytes here (Ethernet allows up to 1500). Shorter payloads are padded with zeros to 46 bytes, the minimum, so the frame is the same length either way.
- **As** — Whether the payload is read as text characters or as hexadecimal bytes.

## Going deeper
### Running disparity
Each data byte has two possible 10-bit codes, one with more 1s and one with more 0s (or a single balanced code). The transmitter tracks the running disparity, whether it has sent more 1s or more 0s so far, and picks the code that brings it back toward balance. The signal never drifts away from its average, which is what lets it pass through capacitors and optical receivers.
### The comma
K28.5 contains the sequence 0011111 or 1100000, which no combination of other code groups can produce. A receiver that has lost track of where code groups begin finds it in the next idle, and aligns to it. That is why every idle starts with K28.5.
### SGMII
Many Ethernet controllers connect to their PHY chip with SGMII: the same 8b/10b coding as 1000BASE-X, on one differential pair each way, at 1.25 Gbaud. At 100 and 10 Mbit/s it repeats each byte 10 or 100 times, so the line rate never changes.
