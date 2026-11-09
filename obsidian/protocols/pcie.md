---
id: pcie
title: "PCIe"
section: Protocols
group: Expansion buses
source: src/protocols/pcie.ts
url: ?p=pcie
---
# PCIe
*PCI Express*

## Summary
A serial, point-to-point link built from lanes, each a differential pair in each direction. There is no clock wire: the receiver recovers timing from transitions in the data. Gen1 and Gen2 guarantee those transitions with 8b/10b encoding, which maps every byte to a 10-bit symbol; this diagram shows one lane at that level.

## Used in
Graphics cards, NVMe SSDs, network adapters, M.2 Wi-Fi modules, and Thunderbolt and USB4 tunnels.

**Tags:** embedded clock, differential, full duplex, point-to-point, expansion, 8b/10b, lanes

## At a glance
- **Clock:** Embedded. Both ends share a 100 MHz reference clock, but the receiver recovers bit timing from the data transitions with a clock and data recovery (CDR) circuit.
- **Wires:** Per lane, one differential pair for each direction. Links are x1, x2, x4, x8 or x16 lanes, plus a reference clock pair and sideband signals such as PERST#.
- **Drive:** Differential and low-swing (roughly 0.8 to 1.2 V peak-to-peak differential), AC-coupled through capacitors at the transmitter.
- **Duplex:** Full duplex: each direction of each lane has its own pair.
- **Topology:** Point-to-point links. A root complex at the CPU connects to devices directly or through switches, forming a tree.
- **Addressing:** Packets (TLPs) are routed by memory address or by bus, device and function number, in the packet header.
- **Flow control:** Credit-based: each receiver advertises how much buffer space it has, and a transmitter never sends more than it has credit for.
- **Error checking:** Every TLP carries an LCRC, and the data link layer acknowledges each one and replays any that fail. 8b/10b also detects invalid symbols.
- **Speed:** Per lane and direction: Gen1 2.5 GT/s (250 MB/s), Gen2 5 GT/s (500 MB/s), Gen3 8 GT/s with 128b/130b (about 985 MB/s), doubling each generation to Gen6 at 64 GT/s with PAM4 signaling.
- **Reach:** Board traces and connectors, typically tens of centimeters; retimers and cables extend it.

## Strengths
- Scales from one lane to sixteen with the same protocol.
- Very high bandwidth with reliable delivery: corrupted packets are retransmitted automatically.
- Software-compatible with the original PCI configuration model.

## Limits
- Complex: link training, three protocol layers and strict signal-integrity requirements.
- Requires dedicated transceiver hardware; it cannot be bit-banged.
- 8b/10b spends 20% of the line rate on encoding, which is why Gen3 moved to 128b/130b.

## Settings
- **Lane carries** — Data bytes encodes the bytes entered under Bytes as 8b/10b data symbols. The TS1 training set is what each lane sends during link training, and the SKP ordered set compensates for small clock differences between the two ends.
- **Bytes** — The bytes to encode, in hexadecimal. Used when Lane carries is set to Data bytes.
- **Link width** — The number of lanes. Data bytes are distributed across the lanes in turn, while ordered sets are sent on every lane.
- **Generation** — Gen1 runs at 2.5 GT/s and Gen2 at 5 GT/s. Both use 8b/10b encoding, so the generation changes only the timescale.
- **Starting RD** — The running disparity before the first symbol. Many symbols have two possible codes, and the running disparity selects between them.

## Eye diagram
An eye diagram overlays every bit of a long signal on top of each other. The open area in the middle is the margin the receiver has to decide 1 or 0: the taller and wider it is, the more noise and timing error the link can tolerate. Change the channel and jitter to see the eye close, and turn de-emphasis on to see it reopen.

## Going deeper
### Why 8b/10b
A receiver that recovers its clock from the data needs regular transitions, and an AC-coupled link needs the signal to average to zero. 8b/10b provides both: every 10-bit symbol contains either five 1s, or four or six, and the line never carries more than five identical bits in a row.
The encoder tracks the running disparity (RD), the running excess of 1s over 0s. When the next symbol has an unbalanced code, the encoder picks the variant that pushes RD back toward zero, so RD only ever alternates between −1 and +1.
### Symbols and the comma
A symbol is named Dx.y or Kx.y: x is the value of the low 5 bits and y the value of the high 3 bits. D symbols carry data bytes; K symbols are control characters with no data meaning. K28.5, called COM, contains the bit pattern 0011111 or 1100000, which cannot occur anywhere else in a valid stream. The receiver uses it to find symbol boundaries, a process called symbol lock.
### Link training
After reset, each lane transmits training sequences: TS1 and TS2 ordered sets of 16 symbols. They establish bit and symbol lock, negotiate the link width and data rate, assign link and lane numbers, and correct lane reversal and polarity inversion. Only after training completes are packets exchanged.
### Scrambling
Real links also scramble every data byte with a 16-bit LFSR before 8b/10b encoding, so long repeated data does not concentrate radiated energy at a few frequencies. K symbols are not scrambled, and COM resets the scrambler. This diagram shows unscrambled bytes so the encoding is easier to follow.
### Reading an eye diagram
An eye diagram is built by slicing a long signal into windows two bits wide and drawing every window on top of the others. Transitions cross in an X at each bit boundary, and the open space between the crossings is the eye. Its height is the voltage margin the receiver has to decide between 1 and 0; its width is the timing margin for where it samples. The eye diagram above is generated this way from a simulated link.
### What closes the eye
Circuit-board traces, connectors and cables lose more of the high frequencies than the low ones. A short pulse, such as a single 1 between 0s, therefore never reaches its full level before the next bit begins, and bits blur into their neighbours. This inter-symbol interference (ISI) squeezes the eye vertically. Jitter, variation in when edges occur, narrows it horizontally, and noise, crosstalk and reflections thicken every trace. At several gigabits per second over typical board material, an unequalized eye can close completely.
### De-emphasis and equalization
Gen1 and Gen2 transmitters use de-emphasis: the first bit after a transition is sent at full amplitude, and repeated bits are sent smaller (by 3.5 dB, or 6 dB at Gen2 for longer channels). Reducing the low-frequency content counteracts the channel's high-frequency loss, so after the channel the levels even out and the eye reopens. A scope probe at the transmitter therefore shows four amplitudes even though the data has only two states.
From Gen3, each transmitter has a configurable three-tap filter, and receivers add a continuous-time linear equalizer (CTLE) and a decision feedback equalizer (DFE). During link training, the two ends run an equalization procedure in which each receiver asks the far transmitter to try settings until its eye is open enough.
### Compliance and masks
The specification sets minimum eye dimensions at the transmitter and at the receiver, measured with a defined test pattern and setup. For Gen1, for example, the transmitter eye must be at least 0.75 UI wide and the receiver must work with an eye as small as 0.4 UI wide and 175 mV high. Test equipment overlays a mask, a keep-out region in the middle of the eye, and any trace that enters it is a failure. The mask in the figure above is illustrative, not the specification's exact shape.
### PAM4 eyes
Gen6 uses four signal levels, so its eye diagram shows three eyes stacked vertically, one between each pair of adjacent levels. Each eye is about a third the height of an NRZ eye at the same swing, which leaves much less margin for noise. That is why Gen6 adds forward error correction: a low bit error rate is expected and corrected rather than avoided.
### Gen3 and later
From Gen3, PCIe replaced 8b/10b with 128b/130b: a 2-bit sync header followed by 128 scrambled bits, reducing the overhead from 20% to about 1.5%. Transition density then relies on scrambling alone. Gen6 changes again, to PAM4 signaling with fixed-size FLITs and forward error correction.
