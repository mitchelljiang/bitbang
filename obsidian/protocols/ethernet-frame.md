---
id: ethframe
title: "Ethernet frame"
section: Protocols
group: Ethernet
source: src/protocols/ethframe.ts
url: ?p=ethframe
---
# Ethernet frame
*The IEEE 802.3 MAC frame*

## Summary
Every Ethernet, from 10 Mbit/s over copper to 400 Gbit/s over fiber, sends the same frame: a preamble, the destination and source MAC addresses, an EtherType, a payload of 46 to 1500 bytes, and a CRC-32. This page shows the frame as bits, in the order they are sent. The physical layer pages, starting with 10BASE-T, show how each one puts these same bits on the wire.

## Used in
Every wired network port, Wi-Fi bridges (which carry the same addresses and EtherType), and industrial networks such as EtherCAT and PROFINET.

**Tags:** embedded clock, differential, full duplex, star, addressed, cable, networking

## At a glance
- **Clock:** Not part of the frame. Each physical layer has its own way to recover the clock; the preamble gives the oldest ones time to lock on.
- **Wires:** Not part of the frame: 10BASE-T and 100BASE-TX use two pairs, 1000BASE-T uses all four, and 1000BASE-X uses a fiber pair.
- **Drive:** Set by the physical layer: Manchester, MLT-3, PAM-5 or light pulses.
- **Duplex:** Full duplex on a switched link; half duplex with collision detection on an old shared hub.
- **Topology:** Star, through switches. A switch learns which port each source address is on and forwards frames only where they need to go.
- **Addressing:** 48-bit MAC addresses for the destination and the source. All ones (ff:ff:ff:ff:ff:ff) is broadcast, and a 1 in the first bit sent marks multicast.
- **Flow control:** None in the frame. Full-duplex links can send PAUSE frames, which are themselves Ethernet frames with EtherType 0x8808.
- **Error checking:** A CRC-32 (the frame check sequence) over every byte from the destination address to the end of the payload. Damaged frames are dropped, not repaired.
- **Speed:** The frame is the same at every speed; this page draws it at 100 Mbit/s, 10 ns per bit.
- **Reach:** Set by the physical layer: 100 m on twisted pair, kilometres on fiber.

## Strengths
- One format at every speed and on every medium, so switches can connect 10 Mbit/s devices to 100 Gbit/s ones.
- Globally unique 48-bit addresses, assigned to manufacturers, so devices need no configuration to talk on a local network.
- A strong CRC-32 that catches every burst error up to 32 bits long.

## Limits
- At least 84 bytes on the wire for even a 1-byte message, counting the preamble, padding and the gap between frames.
- No delivery guarantee: a damaged or dropped frame is gone unless a higher layer, such as TCP, sends it again.
- A maximum payload of 1500 bytes, unless both ends agree on jumbo frames.

## Settings
- **Destination** — The destination MAC address, as six hexadecimal bytes. ff:ff:ff:ff:ff:ff is the broadcast address, which every device accepts.
- **Source** — The MAC address of the sender, as six hexadecimal bytes.
- **EtherType** — The EtherType, a 2-byte code that identifies the payload protocol, such as 0800 for IPv4. 88B5 is reserved for local experiments.
- **Payload** — The frame payload, up to 46 bytes here (Ethernet allows up to 1500). Shorter payloads are padded with zeros to 46 bytes, the minimum, so the frame is the same length either way.
- **As** — Whether the payload is read as text characters or as hexadecimal bytes.

## Going deeper
### Bit order and multicast
Bytes are sent in order, and each byte least significant bit first. So the first bit of the destination address on the wire is the individual/group bit: a 1 there marks a multicast or broadcast frame, and a receiver can decide whether the frame might be for it after a single bit. The EtherType and the CRC are the exceptions to reading left to right: the EtherType goes most significant byte first, and the CRC least significant byte first.
### EtherType or length
The two bytes after the source address have two meanings. A value of 1536 (0x0600) or more is an EtherType, which names the payload protocol. A value of 1500 or less is the length of the payload, used by the original IEEE 802.3 format, where an 802.2 LLC header inside the payload names the protocol instead. Almost all traffic today uses EtherTypes.
### VLAN tags
A switch can add a 4-byte 802.1Q tag between the source address and the EtherType: the value 0x8100, then a 3-bit priority and a 12-bit VLAN number. VLANs split one physical network into separate logical ones, and the priority lets time-sensitive traffic go first.
### Minimum and maximum size
From the destination address to the FCS, a frame is 64 to 1518 bytes (1522 with a VLAN tag). The minimum comes from the original shared-cable Ethernet: a frame had to last long enough for a collision at the far end of the network to be detected before the sender finished. Switched links no longer collide, but the minimum stayed, so every Ethernet can still interoperate.
