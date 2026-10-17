---
id: pci
title: "PCI"
section: Protocols
group: Expansion buses
source: src/protocols/pci.ts
url: ?p=pci
---
# PCI
*Peripheral Component Interconnect*

## Summary
The parallel bus PCI Express replaced. Every card shares 32 multiplexed address/data lines (AD) and a common 33 MHz clock. A transaction is an address phase followed by one or more data phases, and a word moves only on a rising clock edge where both the initiator (IRDY#) and the target (TRDY#) signal that they are ready. Signals ending in # are active low.

## Used in
Desktop PCs from the mid-1990s to the late 2000s (sound, network and early graphics cards), industrial systems such as CompactPCI, and the configuration model that PCI Express still uses.

**Tags:** synchronous, single-ended, parallel, push-pull, half duplex, multi-drop, addressed, expansion

## At a glance
- **Clock:** Synchronous: one shared 33 MHz (or 66 MHz) clock. Every signal is sampled on its rising edge.
- **Wires:** 32 multiplexed address/data lines, 4 command/byte-enable lines, control lines (FRAME#, IRDY#, TRDY#, DEVSEL#, STOP#), parity, and a request/grant pair for devices that can act as bus master: 47 signals for a 32-bit target-only device, 49 for a bus master.
- **Drive:** Push-pull, using reflected-wave switching. Control lines are sustained tri-state: a driver must drive them high for one clock before releasing them, and pull-ups hold them high afterward.
- **Duplex:** Half duplex: one transaction at a time on the shared bus.
- **Topology:** A shared multi-drop bus, typically with up to four or five slots. Bridges create additional buses.
- **Addressing:** 32-bit memory and I/O addresses (64-bit with a dual address cycle). Configuration accesses select a slot with its dedicated IDSEL line.
- **Flow control:** IRDY# and TRDY# handshake every data phase, so either side can insert wait states. A target can also end a transaction early with STOP#.
- **Error checking:** Even parity (PAR) over AD and C/BE#, with PERR# reporting data parity errors and SERR# reporting system errors.
- **Speed:** 133 MB/s peak for 32 bits at 33 MHz, 533 MB/s for 64 bits at 66 MHz, and up to about 1 GB/s with PCI-X at 133 MHz, shared by every device on the bus.
- **Reach:** A motherboard and its add-in cards. Reflected-wave signaling depends on short bus traces.

## Strengths
- Simple, synchronous transfers with efficient bursts.
- Plug and play: a standard configuration space lets software discover and configure every device. PCI Express kept it.
- Broad, long-lived industry support.

## Limits
- All devices share one bus, so they share its bandwidth.
- Skew and reflections between dozens of parallel lines limit how fast the clock can run.
- Many pins per device, and only one transaction at a time.

## Settings
- **Command** — The bus command, sent on C/BE# during the address phase.
- **Address** — The 32-bit memory address, in hexadecimal.
- **Data words** — One to four 32-bit words, in hexadecimal. More than one word makes a burst, which transfers one word per clock cycle.
- **Target decode** — How quickly the target claims the transaction by asserting DEVSEL#: one, two or three clock cycles after the address phase.
- **Target wait states** — Clock cycles the target adds before it is ready for the first data word, which it signals by holding TRDY# high.

## Going deeper
### Why PCI was replaced by a serial link
A parallel bus sends every bit of a word at the same moment, so every line must arrive within a fraction of a clock period of the others. As clock rates rose, the small differences in length and loading between 32 or 64 lines, together with reflections on a bus shared by several slots, consumed the timing budget. PCI-X reached 133 MHz with fewer slots per bus; going further required a different approach.
PCI Express replaced the shared bus with point-to-point serial lanes, each of which recovers its own clock from its own data. Lanes can then differ in delay by many bits, because the receiver realigns them, and bandwidth scales by adding lanes rather than by raising one shared clock.
### Multiplexed address and data
To save pins, the same 32 AD lines carry the address in the first clock of a transaction and data afterward. The four C/BE# lines likewise carry the command during the address phase (for example 0110 for Memory Read and 0111 for Memory Write) and byte enables during data phases, where a 0 marks each byte lane that carries valid data.
### Turnaround cycles
In a read, the initiator drives the address and the target drives the data on the same AD lines. A turnaround clock in which neither drives them sits between the two, so their output drivers never conflict. Writes need no turnaround on AD, because the initiator drives both the address and the data.
### DEVSEL# and subtractive decode
Every target decodes the address, and the one that owns it asserts DEVSEL# one, two or three clocks later (fast, medium or slow decode). If no target responds by then, a subtractive-decode bridge, typically the one leading to legacy ISA devices, may claim the transaction. If nothing claims it, the initiator ends it with a master abort.
### Arbitration and bus mastering
Any card can become the initiator. Each slot has its own REQ# and GNT# lines to a central arbiter; a device asserts REQ#, waits for GNT#, and starts its transaction when the bus is idle. This bus mastering let network and disk controllers move data to memory without the CPU, and the same idea continues as DMA over PCI Express.
