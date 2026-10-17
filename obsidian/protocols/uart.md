---
id: uart
title: "UART"
section: Protocols
group: Asynchronous serial
source: src/protocols/uart.ts
url: ?p=uart
---
# UART
*Universal Asynchronous Receiver-Transmitter*

## Summary
A simple serial link with one wire in each direction and no shared clock. Both devices are configured for the same speed, the baud rate, in advance. The line rests high when idle, and each byte begins with a falling edge that the receiver uses as its timing reference.

## Used in
Debug consoles, GPS receivers, Bluetooth and Wi-Fi modules, and the USB-to-serial converter on most development boards.

**Tags:** asynchronous, single-ended, push-pull, full duplex, point-to-point, chip-to-chip

## At a glance
- **Clock:** None. Each device uses its own clock at the agreed baud rate and resynchronizes at the start of every byte.
- **Wires:** TX (transmit) and RX (receive), plus a shared ground. Two optional lines, RTS and CTS, provide flow control.
- **Drive:** Push-pull: each TX output actively drives its line both high and low.
- **Duplex:** Full duplex. Separate wires for each direction allow both devices to transmit at the same time.
- **Topology:** Point-to-point: exactly one device at each end.
- **Addressing:** None. Each line has only one possible receiver.
- **Flow control:** None by default. Hardware flow control (RTS/CTS) or software flow control (XON/XOFF) can be added.
- **Error checking:** An optional parity bit detects any single flipped bit. A missing stop bit is reported as a framing error.
- **Speed:** Commonly 9600 or 115200 baud. Many devices support 1 to 3 Mbaud or more; the practical limit is how closely the two clocks agree.
- **Reach:** About a meter at 3.3 V logic levels. RS-232 extends this to about 15 m, and RS-485 to more than 1 km.

## Strengths
- Requires only two signal wires and no clock line.
- Available on nearly every microcontroller, and an inexpensive USB adapter connects it to a computer.
- Text sent over UART can be read directly in a terminal, which makes it the standard choice for debug output.

## Limits
- Both devices must use the same baud rate, and their clocks must agree to within about 2% each.
- With the common 8N1 setting, start and stop bits take 20% of the bandwidth: 10 bits are sent for every 8 bits of data.
- No addressing: each pair of wires connects exactly two devices.
- Parity cannot detect two flipped bits in the same byte, and the protocol provides no acknowledgment of receipt.

## Settings
- **Data** — The bytes to transmit. Each byte becomes one frame on the diagram.
- **As** — Whether Data is read as text characters or as hexadecimal bytes, such as 48 69.
- **Baud** — The transmission speed in bits per second. Both devices must use the same rate. Changing it changes the timescale, not the shape of the frame.
- **Data bits** — The number of data bits in each frame. Eight is standard; with fewer, only the low bits of each byte are sent.
- **Parity** — An optional error-checking bit after the data. Even or odd parity makes the total number of 1s even or odd; None omits the bit.
- **Stop bits** — The number of stop bits at the end of each frame, during which the line returns high. Two stop bits give a slow receiver more time between bytes.

## Going deeper
### Baud rate error
Each device produces its baud rate by dividing its own clock, and the result is rarely exact. For example, an Arduino Uno with a 16 MHz clock cannot produce exactly 115200 baud; the nearest it can reach is 117647, about 2.1% fast. Some boards use crystals with unusual frequencies, such as 14.7456 MHz, because they divide evenly into all of the standard baud rates.
The receiver times each bit from the falling edge of the start bit and samples near the middle of every bit, often by taking 16 samples per bit and using the middle three. By the stop bit, about 9.5 bit periods later, the two clocks may differ by no more than half a bit, or roughly 5% in total. In practice, each device should stay within about 2% of the nominal rate.
### Reading "8N1" and similar settings
Serial settings are written as the number of data bits, the parity, and the number of stop bits. 8N1 means 8 data bits, no parity and 1 stop bit, and it is the default almost everywhere. 7E1 (7 data bits, even parity, 1 stop bit) comes from older terminals that sent 7-bit ASCII. 8N1 became standard because data is organized in 8-bit bytes and a single parity bit offers limited protection; higher-level protocols add their own checksums instead.
### The break condition
A break is the line held low for longer than a complete frame, including the stop bit. Because a normal frame always ends with a high stop bit, a break cannot be mistaken for data, and receivers report it separately. LIN and DMX512 begin every frame with a break, and some bootloaders and consoles use it as an attention signal.
### Flow control and overruns
Many microcontroller UARTs can hold only one received byte, or a small buffer. If software does not read a byte before the next one arrives, the earlier byte is lost and the UART reports an overrun error. At 115200 baud, a new byte arrives every 87 µs.
Hardware flow control prevents this with two additional wires: when its buffer is nearly full, the receiver deasserts its RTS output, and the transmitter, which monitors that signal as CTS, pauses. Software flow control sends XON and XOFF characters instead, which only works if those byte values never occur in the data. Most firmware avoids the problem by using interrupts or DMA to move received bytes into a buffer.
### Marking the end of a message
UART defines individual bytes, not messages, so higher-level protocols must mark where each message ends. Common approaches are a pause (Modbus RTU ends a message with 3.5 character times of silence), a delimiter character (a newline for text, or encodings such as SLIP and COBS for binary data), or a length field at the start of the message. Many UARTs provide an idle-line interrupt, triggered after one character time of silence, which works well together with DMA.
### The same frame on different wiring
The bit pattern shown above is the same wherever UART is used; only the electrical layer changes. Between chips it uses 3.3 V or 5 V logic levels, RS-232 inverts it and uses about ±12 V, and RS-485 sends it over a differential pair.
