---
id: ethernet
title: "10BASE-T"
section: Protocols
group: Ethernet
source: src/protocols/ethernet.ts
url: ?p=ethernet
---
# 10BASE-T
*10 Mbit/s Ethernet over twisted pair (IEEE 802.3i)*

## Summary
Ethernet at 10 Mbit/s over twisted-pair cable. It was the first twisted-pair Ethernet standard, from 1990, and most Ethernet ports still support it as their slowest speed. Every bit is Manchester encoded: a 1 is a low-to-high transition in the middle of the bit and a 0 is high-to-low, so the receiver can recover the clock from the data itself. It carries the same Ethernet frame as every faster Ethernet.

## Used in
Low-cost microcontroller Ethernet controllers such as the ENC28J60, the 10 Mbit/s mode of most Ethernet ports, and the frame format every faster Ethernet still uses.

**Tags:** embedded clock, differential, half duplex, full duplex, star, addressed, cable, networking, Manchester

## At a glance
- **Clock:** Embedded. Manchester encoding guarantees a transition in every bit, and the 56-bit preamble gives the receiver time to lock onto it.
- **Wires:** Two twisted pairs in an RJ45 cable: one to transmit (pins 1 and 2) and one to receive (pins 3 and 6).
- **Drive:** Differential, about ±2.5 V, through an isolation transformer. Manchester has no DC component, which is what lets it pass through the transformer.
- **Duplex:** Half duplex on a hub, where everyone shares the medium and collisions are detected. Full duplex on a switch.
- **Topology:** Star: every device has its own cable to a hub or switch.
- **Addressing:** 48-bit MAC addresses for the destination and the source. All ones (ff:ff:ff:ff:ff:ff) is broadcast.
- **Flow control:** On a hub, collision detection and random backoff. Full-duplex links can send PAUSE frames.
- **Error checking:** A CRC-32 (the frame check sequence) on every frame. Frames that fail are silently dropped.
- **Speed:** 10 Mbit/s. Manchester sends two signal elements (half-bits) per bit, so the line runs at 20 Mbaud.
- **Reach:** 100 m per cable.

## Strengths
- Self-clocking and DC-balanced, so it works through isolation transformers with no separate clock wire.
- Globally unique MAC addresses and a strong CRC on every frame.
- Its frame format is still the one every Ethernet uses, from 100 Mbit/s to 400 Gbit/s.

## Limits
- Manchester doubles the signaling rate, so faster Ethernets switched to more efficient codes.
- High overhead for small messages: 8 bytes of preamble, padding to a 64-byte minimum frame, and a gap between frames.
- Obsolete as a physical layer; current ports run at 100 Mbit/s or faster, although most can still fall back to 10BASE-T.

## Settings
- **Destination** — The destination MAC address, as six hexadecimal bytes. ff:ff:ff:ff:ff:ff is the broadcast address, which every device accepts.
- **Source** — The MAC address of the sender, as six hexadecimal bytes.
- **EtherType** — The EtherType, a 2-byte code that identifies the payload protocol, such as 0800 for IPv4. 88B5 is reserved for local experiments.
- **Payload** — The frame payload, up to 46 bytes here (Ethernet allows up to 1500). Shorter payloads are padded with zeros to 46 bytes, the minimum, so the frame is the same length either way.
- **As** — Whether the payload is read as text characters or as hexadecimal bytes.

## Going deeper
### Link pulses and autonegotiation
When no frames are being sent, a 10BASE-T transmitter emits a normal link pulse (NLP), a single pulse roughly every 16 ms, so the other end knows the cable is connected. Faster Ethernet replaced these with bursts of fast link pulses that carry autonegotiation messages advertising each side's capabilities. A 10BASE-T device still appears to a modern port as a device sending plain link pulses, and the port falls back to 10 Mbit/s.
### Collisions and CSMA/CD
On a hub, every device shares one collision domain. A device listens before transmitting (carrier sense), and if it detects another transmission while sending, it sends a 32-bit jam signal, stops, and waits a random number of slot times before retrying, doubling the range after each collision (binary exponential backoff).
One slot time is 512 bit times, 51.2 µs at 10 Mbit/s, which is exactly the 64-byte minimum frame: a frame must last long enough for a collision at the far end of the network to be detected before the sender finishes. Switches and full-duplex links have eliminated collisions in practice.
### Interframe gap
After each frame, a transmitter must wait at least 96 bit times, 9.6 µs at 10 Mbit/s, before starting the next preamble. Together with the preamble and minimum frame size, this sets the maximum frame rate: about 14,880 minimum-size frames per second at 10 Mbit/s.
### Isolation transformers
Every Ethernet port connects to the cable through transformers, often built into the RJ45 jack, which provide at least 1500 V of isolation between devices. Transformers cannot pass a DC level, which is why Ethernet uses line codes such as Manchester that average to zero.
### Faster Ethernet, same frame
100BASE-TX replaced Manchester with 4B5B coding and three-level MLT-3 signaling at 125 Mbaud. 1000BASE-T uses all four pairs in both directions at once, with five-level PAM-5 signaling and echo cancellation, and 1000BASE-X sends 8b/10b code over fiber. The frame shown here, from preamble to FCS, is unchanged at every speed.
### Bit order and multicast
Because each byte is sent least significant bit first, the very first bit of the destination address on the wire is the individual/group bit. A 1 there marks a multicast or broadcast frame, so a receiver can decide whether to accept the frame after a single bit.
