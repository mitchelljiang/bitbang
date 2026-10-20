---
id: usb
title: "USB 2.0"
section: Protocols
group: USB
source: src/protocols/usb.ts
url: ?p=usb
---
# USB 2.0
*Universal Serial Bus 2.0*

## Summary
Data travels on a differential pair, D+ and D−, as NRZI: a 0 is a change of state and a 1 is no change. After six 1s in a row the transmitter inserts an extra 0 (bit stuffing) so the receiver always sees transitions to stay in sync. Every transfer is a short exchange of packets: a token from the host, an optional data packet, and a handshake.

## Used in
Keyboards, mice, game controllers, microcontroller boards, serial adapters, and the fallback mode of every faster USB port.

**Tags:** embedded clock, differential, half duplex, star, addressed, cable, NRZI

## At a glance
- **Clock:** Embedded. Each packet starts with a SYNC pattern the receiver locks onto, and bit stuffing guarantees a transition at least every seven bits.
- **Wires:** D+ and D− as a twisted pair, plus VBUS (5 V) and ground.
- **Drive:** Differential. Low and full speed use 3.3 V push-pull drivers; high speed uses current-mode drivers into 45 Ω terminations, giving about 400 mV. Both lines low (SE0) ends packets at low and full speed and is the idle state at high speed. A pull-up resistor on the device tells the host its speed.
- **Duplex:** Half duplex: the host and the device take turns on the same pair.
- **Topology:** A tiered star: a host at the root, hubs fanning out, and up to 127 devices.
- **Addressing:** The host assigns each device a 7-bit address when it connects. Each device has up to 16 endpoint numbers, each with an IN and an OUT direction, selected in the token.
- **Flow control:** Host-controlled. The host polls every device; a device that is not ready answers NAK, and the host retries later.
- **Error checking:** CRC5 on tokens and CRC16 on data packets, plus PID check bits. Packets that fail receive no handshake and are retried.
- **Speed:** Low speed 1.5 Mbit/s, full speed 12 Mbit/s, high speed 480 Mbit/s.
- **Reach:** 5 m per cable; hubs extend it, up to five hubs deep.

## Strengths
- One connector for almost everything, with power included.
- Plug and play: devices describe themselves, and standard classes need no custom drivers.
- Reliable delivery for bulk and control transfers, with automatic retries.

## Limits
- Host-centric: devices cannot talk to each other, and every transfer waits for the host to poll.
- Protocol overhead is large for small transfers: tokens, handshakes and gaps around every packet.
- Implementing a device requires a full protocol stack, descriptors and, for products, a vendor ID.

## Settings
- **Transaction** — The transaction type. SETUP and OUT carry data from the host to the device; IN asks the device to send data to the host. SOF is a lone timing token the host broadcasts at the start of every frame.
- **Address** — The device address, from 0 to 127. A newly connected device uses address 0 until the host assigns it one.
- **Endpoint** — The endpoint number, from 0 to 15. Endpoint 0 is the control endpoint that every device provides.
- **Frame number** — The 11-bit frame number carried by a SOF packet, from 0 to 2047. The host increments it each frame and wraps around, giving every device a shared frame counter. Ignored by the other transactions.
- **Data** — The data packet payload, in hexadecimal. A SETUP packet is always exactly 8 bytes; the default is the standard GET_DESCRIPTOR request. Other data packets carry at most 8 bytes at low speed, 1023 at full speed and 1024 at high speed.
- **Data PID** — DATA0 and DATA1 alternate on successful transactions, which lets the receiver recognize a retransmitted packet.
- **Handshake** — The handshake that ends the transaction: ACK for success, NAK when the device is busy, and STALL when the endpoint cannot complete the request. After an IN token, a busy or stalled device sends NAK or STALL instead of data. NYET, at high speed only, accepts OUT data but warns that the device has no room for the next packet yet. A device always accepts SETUP.
- **Speed** — All three speeds use the same packets. Low speed swaps J and K and limits data packets to 8 bytes. High speed signals at about 400 mV instead of 3.3 V, idles in SE0, uses a 32-bit SYNC, and ends each packet with an 8-bit EOP that breaks the bit-stuffing rule.

## Going deeper
### J, K and SE0
USB names line states rather than voltages. At full speed, J is D+ high and D− low, which is also the idle state; K is the opposite. Low speed swaps them. SE0 (single-ended zero) is both lines low: two bit times of SE0 end every packet, and a long SE0 resets the device.
At high speed, J and K keep their full-speed meaning, but the idle state is SE0, because neither line is driven between packets.
The host learns a device's speed from its pull-up resistor: 1.5 kΩ on D+ for full speed, on D− for low speed.
### Bit stuffing
NRZI produces no transitions for a run of 1s, so after six consecutive 1s the transmitter inserts a 0, which forces a transition. The receiver removes it again. Stuffing makes packet length depend on the data: a payload of 0xFF bytes is noticeably longer on the wire than the same number of 0x00 bytes.
### Transactions and transfers
A transaction is a token, an optional data packet and a handshake. SETUP and OUT carry data from the host; IN asks the device to send. DATA0 and DATA1 alternate on each successful transaction, so if an ACK is lost and the host resends, the device recognizes the duplicate.
Transactions build four transfer types: control (enumeration and configuration), bulk (storage, printers), interrupt (keyboards, mice) and isochronous (audio and video, with guaranteed bandwidth but no retries).
### Frames and the SOF packet
The host divides time into frames of 1 ms at full speed, or microframes of 125 µs at high speed, and starts each one by broadcasting a Start-of-Frame token: the SOF PID, an 11-bit frame number that counts up and wraps at 2047, and a CRC5. It is a lone token — no device answers it, and there is no data packet or handshake.
The frame number is a clock every device shares. Isochronous endpoints use it to pace audio and video, a device can lock its own timing to the 1 ms cadence, and the steady SOF traffic keeps a bus that is otherwise idle from letting devices suspend. Choose SOF above to see the token on its own.
### Enumeration
When a device connects, the host resets it, reads its device descriptor at address 0 (the SETUP packet shown by default here is that request: GET_DESCRIPTOR for the device descriptor), assigns it an address, and reads the configuration descriptors that list its interfaces and endpoints. The class codes in those descriptors let the operating system load a generic driver for keyboards, storage, audio and serial devices.
### High speed
High-speed USB (480 Mbit/s) keeps the packets, NRZI and bit stuffing of full speed; only the signaling changes. Instead of driving 3.3 V, the transmitter switches a current of about 17.8 mA into one line or the other. Both ends terminate each line with 45 Ω to ground, so the active line sits at about 400 mV. Between packets neither line carries current, so the bus idles in SE0.
Packets start with a 32-bit SYNC and end with an 8-bit EOP that deliberately breaks the bit-stuffing rule, instead of using SE0. High speed also adds the NYET handshake and the PING token, which lets the host ask whether a device has room before it sends a large OUT packet.
Every high-speed device starts at full speed, attaching with its 1.5 kΩ pull-up on D+. During the bus reset that follows, the device sends a chirp K, about 800 mV on D−, and a high-speed host answers with alternating chirp K and chirp J. The device then disconnects its pull-up and connects its 45 Ω terminations. If the host or hub does not answer, the device stays at full speed.
