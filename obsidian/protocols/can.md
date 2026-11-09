---
id: can
title: "CAN"
section: Protocols
group: Automotive & industrial
source: src/protocols/can.ts
url: ?p=can
---
# CAN
*Controller Area Network*

## Summary
A two-wire differential bus where any node may start sending when the bus is idle. A dominant 0 overrides a recessive 1, so nodes that start together compare their identifiers bit by bit as they send, and the lowest identifier wins without losing a single bit. Frames name their contents, not a destination, and every node checks every frame.

## Used in
Vehicles (engine, brakes and body electronics, through OBD-II), industrial automation (CANopen, DeviceNet), robots, e-bikes and medical equipment.

**Tags:** asynchronous, differential, half duplex, multi-drop, cable

## At a glance
- **Clock:** None. Nodes share a configured bit rate and resynchronize on recessive-to-dominant edges, which bit stuffing guarantees.
- **Wires:** CANH and CANL as a twisted pair, usually with a ground reference.
- **Drive:** Differential. Dominant drives CANH to about 3.5 V and CANL to about 1.5 V. Recessive drives neither, and termination pulls both to about 2.5 V.
- **Duplex:** Half duplex. Every node listens, including the one transmitting, which reads back each bit it sends.
- **Topology:** A linear bus with short stubs and a 120 Ω terminating resistor at each end.
- **Addressing:** Message identifiers of 11 or 29 bits, describing the content rather than a destination. Nodes filter for the identifiers they want.
- **Flow control:** None beyond arbitration: a lower-priority frame waits for the bus to go idle and tries again.
- **Error checking:** CRC-15, plus bit, stuff, form and acknowledgement checks. A node that detects an error sends an error frame, and the transmitter automatically retries.
- **Speed:** Up to 1 Mbit/s for classic CAN. CAN FD raises the data phase further.
- **Reach:** About 40 m at 1 Mbit/s and about 500 m at 125 kbit/s, because arbitration needs every node to see each bit within its bit time.

## Strengths
- Non-destructive arbitration: the highest-priority message gets through with no retransmission or added delay.
- Strong error detection, with automatic retransmission handled in hardware.
- Differential signaling tolerates the electrical noise of a vehicle.
- Nodes can be added without changing the others, because frames carry no destination.

## Limits
- Only 8 data bytes per classic frame, and a standard frame adds 44 bits of overhead before stuffing.
- Bit rate is tied to bus length, because a bit has to reach every node during arbitration.
- A low-priority message can wait indefinitely on a heavily loaded bus.
- All nodes must be configured for the same bit timing.

## Settings
- **ID** — The message identifier, in hex. Lower numbers have higher priority.
- **Competing ID** — A second node that starts sending at the same moment, in hex. Leave it empty for a single sender. The lower identifier wins, so its frame is the one shown.
- **Data** — Up to 8 data bytes in hex, such as DE AD. Leave it empty for a frame with no data.
- **Format** — A standard frame has an 11-bit identifier, and an extended frame a 29-bit one.
- **Frame** — A data frame carries bytes. A remote frame asks another node to send them, and has no data field.
- **Receiver** — Whether any other node acknowledges the frame. With nobody listening, the ACK slot stays recessive and the transmitter reports an error.
- **Bit rate** — The bus speed. Every node must use the same rate. It changes the timescale, not the shape of the frame.

## Going deeper
### Why arbitration loses nothing
The bus behaves like a wired AND: if any node drives dominant, the bus is dominant. Every transmitter reads the bus while it sends. A node that sends recessive and reads dominant knows a higher-priority frame is on the bus, stops transmitting, and becomes a receiver. The winner never notices. It carries on as if it were alone, so no time is wasted.
This is why identifiers must be unique among nodes that can send at the same time. Two nodes sending the same identifier with different data would both reach the data field, and the resulting bit error would have no winner.
### Bit stuffing
After five consecutive equal bits, the transmitter adds one opposite bit, from start of frame through the CRC sequence. It serves two purposes: it guarantees edges that keep receivers in step, and six equal bits become a violation that error frames can use to signal a problem on purpose. It also means a frame’s length depends on its contents.
### Sample point and bit timing
Each bit is divided into time quanta, and the bus is read at a sample point late in the bit, typically around 75 to 87.5%. The time before it has to cover the delay out to the farthest node and back, which is what links maximum length to bit rate. Controllers resynchronize on each recessive-to-dominant edge by lengthening or shortening a bit by a few quanta.
### Error handling
A node that detects an error transmits six dominant bits, which breaks the stuffing rule and makes every other node reject the frame too. The transmitter then resends it automatically. Each node keeps transmit and receive error counters; one that accumulates too many goes error-passive, and then bus-off, so that a faulty node removes itself rather than jamming the bus.
### The acknowledge slot
The transmitter sends the ACK slot recessive, and every node that received the frame correctly overwrites it with a dominant bit. It says that at least one node got it, not that the intended one did, since a CAN frame has no destination.
