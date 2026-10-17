---
id: rmii
title: "MII and RMII"
section: Protocols
group: Ethernet
source: src/protocols/mii.ts
url: ?p=rmii
---
# MII and RMII
*Media Independent Interface, and Reduced MII*

## Summary
A microcontroller’s Ethernet controller does not drive the cable itself. It hands the Ethernet frame to a PHY chip, which turns it into 100BASE-TX or 10BASE-T on the cable. MII is the parallel interface between the two: 4 data bits per 25 MHz clock at 100 Mbit/s. RMII, the reduced version most microcontrollers use, sends 2 bits per 50 MHz clock on fewer pins. Both carry the frame’s bytes, preamble included, with an enable signal around them.

## Used in
STM32, i.MX RT, ESP32 and most other microcontrollers with Ethernet, connected to PHYs such as the LAN8720, DP83848 and KSZ8081.

**Tags:** synchronous, single-ended, push-pull, full duplex, point-to-point, chip-to-chip, networking, parallel

## At a glance
- **Clock:** Synchronous. MII: the PHY drives TX_CLK at 25 MHz. RMII: one 50 MHz REF_CLK, from an oscillator or the PHY, shared by both chips. Data is sampled on the rising edge.
- **Wires:** MII: TXD0–TXD3, TX_EN and TX_CLK to transmit, the same again to receive, plus collision and carrier sense: 16 pins. RMII: TXD0–TXD1, TX_EN, RXD0–RXD1, CRS_DV and REF_CLK: 7 pins. Both add MDC and MDIO for configuration.
- **Drive:** Single-ended 3.3 V logic, push-pull, over a few centimetres of board trace.
- **Duplex:** Full duplex: separate transmit and receive signals.
- **Topology:** Point-to-point: one MAC to one PHY. The MDIO management bus alone can reach up to 32 PHYs.
- **Addressing:** None on the data lines. MDIO uses a 5-bit PHY address and a 5-bit register number.
- **Flow control:** None; TX_EN marks each frame, and the PHY keeps up at the line rate.
- **Error checking:** None added. The frame’s CRC-32 travels through unchanged, and the PHY can flag a receive error on RX_ER.
- **Speed:** 100 Mbit/s: 4 bits × 25 MHz (MII) or 2 bits × 50 MHz (RMII). At 10 Mbit/s, MII’s clock slows to 2.5 MHz, while RMII keeps 50 MHz and holds each bit pair for 10 cycles.
- **Reach:** A few centimetres to a few tens of centimetres of board trace.

## Strengths
- Media independent, as the name says: the same controller works with any PHY, for copper or fiber.
- RMII needs only 7 pins for 100 Mbit/s, which is why it is the default on microcontrollers.
- Carries the frame as plain bytes, easy to probe with a logic analyzer.

## Limits
- RMII’s 50 MHz clock needs careful board layout, and both chips must share it.
- Limited to 100 Mbit/s; gigabit needs RGMII (4 bits on both clock edges at 125 MHz) or SGMII.
- Only for short distances on one board.

## Settings
- **Interface** — MII sends 4 bits per 25 MHz clock; RMII sends 2 bits per 50 MHz clock on fewer pins. Both run at 100 Mbit/s.
- **Destination** — The destination MAC address, as six hexadecimal bytes. ff:ff:ff:ff:ff:ff is the broadcast address, which every device accepts.
- **Source** — The MAC address of the sender, as six hexadecimal bytes.
- **EtherType** — The EtherType, a 2-byte code that identifies the payload protocol, such as 0800 for IPv4. 88B5 is reserved for local experiments.
- **Payload** — The frame payload, up to 46 bytes here (Ethernet allows up to 1500). Shorter payloads are padded with zeros to 46 bytes, the minimum, so the frame is the same length either way.
- **As** — Whether the payload is read as text characters or as hexadecimal bytes.

## Going deeper
### MDIO: configuring the PHY
Besides the data signals, two pins, MDC (a clock) and MDIO (data), let the controller read and write the PHY’s registers: start autonegotiation, read the link status, set the speed. Each transaction is a 32-bit preamble of 1s, then the operation, a 5-bit PHY address, a 5-bit register number and 16 bits of data. Register 1 bit 2 is the standard “link up” bit that network drivers poll.
### The receive side
Receiving mirrors transmitting: the PHY drives RXD with RX_DV (MII) or CRS_DV (RMII) around each frame. On RMII, CRS_DV also means carrier sense, so it can toggle near the end of a frame while the PHY drains its buffer, which controllers have to allow for.
### RGMII for gigabit
Gigabit PHYs use RGMII: 4 data bits sampled on both edges of a 125 MHz clock, 8 bits per cycle. It needs a delay of about 2 ns between clock and data, added either in the PHY, in the controller, or by a longer trace, and a mismatch there is one of the most common reasons a new embedded Linux board has no network.
