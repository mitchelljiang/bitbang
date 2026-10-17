---
id: 1000baset
title: "1000BASE-T"
section: Protocols
group: Ethernet
source: src/protocols/gigt.ts
url: ?p=1000baset
---
# 1000BASE-T
*Gigabit Ethernet over twisted pair (IEEE 802.3ab)*

## Summary
Ethernet at 1 Gbit/s over the same Cat 5 cable as 100BASE-TX, carrying the same Ethernet frame. It gets ten times the speed by using all four pairs at once, in both directions at the same time, and by sending one of five voltage levels per symbol (PAM-5) at 125 Mbaud. Each pair carries 2 bits per symbol, so each symbol period moves a whole byte. This page shows that structure exactly, but maps bits straight onto levels: the standard also scrambles them and adds an error-correcting trellis code, which makes the real signal look like noise.

## Used in
Practically every wired port on PCs, laptops, routers and switches made in the last two decades, and gigabit PHY chips such as the RTL8211 and KSZ9031 on embedded Linux boards.

**Tags:** embedded clock, differential, full duplex, star, addressed, cable, networking, lanes

## At a glance
- **Clock:** Embedded. One end is the master and transmits with its own clock; the other, the slave, recovers that clock and transmits in step with it.
- **Wires:** All four twisted pairs in an RJ45 cable, called A, B, C and D, each carrying data in both directions at once.
- **Drive:** Differential, five levels from about −1 V to +1 V (PAM-5). Each end subtracts an estimate of its own transmitted signal, and its echo, from what it receives.
- **Duplex:** Full duplex on every pair at once, using echo cancellation instead of separate pairs per direction.
- **Topology:** Star: every device has its own cable to a switch.
- **Addressing:** 48-bit MAC addresses, in the frame.
- **Flow control:** PAUSE frames on full-duplex links.
- **Error checking:** The frame’s CRC-32, plus the trellis code, which lets the receiver correct small noise errors in the symbols before decoding them.
- **Speed:** 1 Gbit/s: 4 pairs × 125 Mbaud × 2 bits per symbol.
- **Reach:** 100 m of Cat 5e cable.

## Strengths
- Ten times 100BASE-TX over the same cable, with the same 125 Mbaud symbol rate per pair.
- Uses the cable fully: all four pairs, both directions at once.
- Autonegotiates with 10 and 100 Mbit/s devices on the same port.

## Limits
- Needs heavy signal processing in the PHY: echo cancellation, crosstalk cancellation, equalization and a trellis decoder.
- Draws noticeably more power than 100BASE-TX, which matters on small embedded boards.
- Needs all four pairs connected; a cable wired for 100BASE-TX with two pairs falls back to 100 Mbit/s.

## Settings
- **Destination** — The destination MAC address, as six hexadecimal bytes. ff:ff:ff:ff:ff:ff is the broadcast address, which every device accepts.
- **Source** — The MAC address of the sender, as six hexadecimal bytes.
- **EtherType** — The EtherType, a 2-byte code that identifies the payload protocol, such as 0800 for IPv4. 88B5 is reserved for local experiments.
- **Payload** — The frame payload, up to 46 bytes here (Ethernet allows up to 1500). Shorter payloads are padded with zeros to 46 bytes, the minimum, so the frame is the same length either way.
- **As** — Whether the payload is read as text characters or as hexadecimal bytes.

## Going deeper
### Both directions on every pair
Each end transmits on all four pairs while receiving on the same four pairs. A circuit called a hybrid separates the two, and an echo canceller subtracts an estimate of its own signal, including the reflections from connectors along the cable, from what arrives. What remains is the other end’s signal. Without this, 1 Gbit/s would need twice the pairs or twice the symbol rate.
### What this page leaves out
The real coding, 8B1Q4, first scrambles the data with a 33-bit shift register so the signal has no patterns, then passes it through an 8-state trellis encoder that adds one bit of redundancy per symbol period. That extra bit is why PAM-5 has five levels instead of four: the receiver uses it to correct symbols that noise pushed toward a neighboring level. Start-of-stream and end-of-stream delimiters replace the edges of the preamble and frame. All of that changes which levels appear, but not the shape shown here: four pairs, five levels, a byte per symbol period.
### Master and slave
During autonegotiation, one end becomes the master and the other the slave. The master transmits on its own clock; the slave recovers that clock from the signal and uses it to transmit. Both ends then share one clock, which the echo cancellers need.
