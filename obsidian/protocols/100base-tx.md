---
id: 100base
title: "100BASE-TX"
section: Protocols
group: Ethernet
source: src/protocols/fast.ts
url: ?p=100base
---
# 100BASE-TX
*Fast Ethernet over twisted pair (IEEE 802.3u)*

## Summary
Ethernet at 100 Mbit/s over two twisted pairs, the speed of most microcontroller Ethernet ports. It carries the same Ethernet frame, but replaces Manchester with two steps. 4B5B coding turns every 4 bits into a 5-bit code group, adding control codes that mark where a frame starts and ends. Then MLT-3 signaling sends a 1 as a step to the next of three voltage levels, so the cable carries 125 Mbaud with its energy below about 31 MHz.

## Used in
The Ethernet ports of STM32, ESP32 (with an external PHY), i.MX RT and most other microcontrollers, PHY chips such as the LAN8720 and DP83848, and the 100 Mbit/s mode of every Ethernet port.

**Tags:** embedded clock, differential, full duplex, star, addressed, cable, networking

## At a glance
- **Clock:** Embedded. 4B5B guarantees transitions often enough for the receiver to recover the clock, and idle code groups keep the receiver locked between frames.
- **Wires:** Two twisted pairs in an RJ45 cable, one to transmit (pins 1 and 2) and one to receive (pins 3 and 6), as in 10BASE-T.
- **Drive:** Differential, three levels: −1 V, 0 V and +1 V, through an isolation transformer.
- **Duplex:** Full duplex on a switch, with a separate pair for each direction.
- **Topology:** Star: every device has its own cable to a switch.
- **Addressing:** 48-bit MAC addresses, in the frame.
- **Flow control:** PAUSE frames on full-duplex links.
- **Error checking:** The frame’s CRC-32, plus invalid code groups: a receiver that sees a 5-bit pattern outside the table knows the signal was corrupted.
- **Speed:** 100 Mbit/s of data, 125 Mbaud on the cable, because 4B5B sends 5 bits for every 4.
- **Reach:** 100 m of Cat 5 cable.

## Strengths
- Ten times the speed of 10BASE-T on the same two pairs, with the same frame.
- MLT-3 needs only a quarter of the bandwidth of the bit rate, which is what lets 125 Mbaud travel over Cat 5 cable.
- Control code groups mark frame boundaries and idle, so the receiver always knows where it is.

## Limits
- Uses only two of the four pairs in the cable.
- 4B5B spends 20% of the signal on coding: 125 Mbaud carries 100 Mbit/s.
- Needs a scrambler and an equalizer in the receiver, so the PHY is far more complex than 10BASE-T’s.

## Settings
- **Destination** — The destination MAC address, as six hexadecimal bytes. ff:ff:ff:ff:ff:ff is the broadcast address, which every device accepts.
- **Source** — The MAC address of the sender, as six hexadecimal bytes.
- **EtherType** — The EtherType, a 2-byte code that identifies the payload protocol, such as 0800 for IPv4. 88B5 is reserved for local experiments.
- **Payload** — The frame payload, up to 46 bytes here (Ethernet allows up to 1500). Shorter payloads are padded with zeros to 46 bytes, the minimum, so the frame is the same length either way.
- **As** — Whether the payload is read as text characters or as hexadecimal bytes.
- **Scrambler** — Whether to apply the scrambler, as a real 100BASE-TX transmitter always does. Off shows the code groups directly in the MLT-3 signal, which is easier to follow.

## Going deeper
### Why 4B5B
Of the 32 possible 5-bit patterns, 4B5B uses the 16 that have no more than one leading 0 and no more than two trailing 0s, so even a run of code groups has no more than three 0s in a row. Since MLT-3 changes level on every 1, the receiver sees a step at least every four bit times. The remaining patterns provide control codes: J and K start a stream, T and R end it, and 11111 is idle.
### Why MLT-3
MLT-3 cycles through 0, +1, 0, −1, and moves one step for each 1. Even a stream of all 1s takes four bit times to complete one full cycle, so the highest frequency on the cable is a quarter of the bit rate: 31.25 MHz at 125 Mbaud. That keeps the signal within what Cat 5 cable carries well, and reduces radiated noise.
### The scrambler
A stream of idle code groups or a long run of the same data would put most of the energy at a few frequencies, which radiates as interference. 100BASE-TX XORs every code bit with the output of an 11-bit shift register, spreading the energy evenly. The receiver runs an identical register and locks it onto the incoming idle pattern, then undoes the scrambling. Turn the scrambler setting on to see the real cable signal; it is off by default so the MLT-3 steps follow the code groups visibly.
### Autonegotiation
Before any frames are sent, the two ends exchange bursts of fast link pulses that advertise the speeds and duplex modes each supports, and both pick the best they have in common. That is how a 100BASE-TX port connects to a 10BASE-T device, or a gigabit port to a 100 Mbit/s one.
