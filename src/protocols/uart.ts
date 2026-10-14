import type { Bit, Field, Note, Protocol } from '../core/types';
import { TraceBuilder, bin, hex, parseBytes, printable } from '../core/util';

export const uart: Protocol = {
  id: 'uart',
  name: 'UART',
  fullName: 'Universal Asynchronous Receiver-Transmitter',
  tags: ['asynchronous', 'single-ended', 'push-pull', 'full duplex', 'point-to-point', 'chip-to-chip'],
  summary:
    'A simple serial link with one wire in each direction and no shared clock. Both devices are configured for the ' +
    'same speed, the baud rate, in advance. The line rests high when idle, and each byte begins with a falling edge ' +
    'that the receiver uses as its timing reference.',
  usedIn: 'Debug consoles, GPS receivers, Bluetooth and Wi-Fi modules, and the USB-to-serial converter on most development boards.',
  facts: {
    clock: 'None. Each device uses its own clock at the agreed baud rate and resynchronizes at the start of every byte.',
    wires: 'TX (transmit) and RX (receive), plus a shared ground. Two optional lines, RTS and CTS, provide flow control.',
    drive: 'Push-pull: each TX output actively drives its line both high and low.',
    duplex: 'Full duplex. Separate wires for each direction allow both devices to transmit at the same time.',
    topology: 'Point-to-point: exactly one device at each end.',
    addressing: 'None. Each line has only one possible receiver.',
    flow: 'None by default. Hardware flow control (RTS/CTS) or software flow control (XON/XOFF) can be added.',
    errors: 'An optional parity bit detects any single flipped bit. A missing stop bit is reported as a framing error.',
    speed: 'Commonly 9600 or 115200 baud. Many devices support 1 to 3 Mbaud or more; the practical limit is how closely the two clocks agree.',
    reach: 'About a meter at 3.3 V logic levels. RS-232 extends this to about 15 m, and RS-485 to more than 1 km.',
  },
  strengths: [
    'Requires only two signal wires and no clock line.',
    'Available on nearly every microcontroller, and an inexpensive USB adapter connects it to a computer.',
    'Text sent over UART can be read directly in a terminal, which makes it the standard choice for debug output.',
  ],
  limits: [
    'Both devices must use the same baud rate, and their clocks must agree to within about 2% each.',
    'With the common 8N1 setting, start and stop bits take 20% of the bandwidth: 10 bits are sent for every 8 bits of data.',
    'No addressing: each pair of wires connects exactly two devices.',
    'Parity cannot detect two flipped bits in the same byte, and the protocol provides no acknowledgment of receipt.',
  ],
  deepDive: [
    {
      title: 'Baud rate error',
      body: [
        'Each device produces its baud rate by dividing its own clock, and the result is rarely exact. For example, an ' +
        'Arduino Uno with a 16 MHz clock cannot produce exactly 115200 baud; the nearest it can reach is 117647, about ' +
        '2.1% fast. Some boards use crystals with unusual frequencies, such as 14.7456 MHz, because they divide evenly ' +
        'into all of the standard baud rates.',
        'The receiver times each bit from the falling edge of the start bit and samples near the middle of every bit, ' +
        'often by taking 16 samples per bit and using the middle three. By the stop bit, about 9.5 bit periods later, ' +
        'the two clocks may differ by no more than half a bit, or roughly 5% in total. In practice, each device should ' +
        'stay within about 2% of the nominal rate.',
      ],
    },
    {
      title: 'Reading "8N1" and similar settings',
      body: [
        'Serial settings are written as the number of data bits, the parity, and the number of stop bits. 8N1 means ' +
        '8 data bits, no parity and 1 stop bit, and it is the default almost everywhere. 7E1 (7 data bits, even parity, ' +
        '1 stop bit) comes from older terminals that sent 7-bit ASCII. 8N1 became standard because data is organized in ' +
        '8-bit bytes and a single parity bit offers limited protection; higher-level protocols add their own checksums instead.',
      ],
    },
    {
      title: 'The break condition',
      body: [
        'A break is the line held low for longer than a complete frame, including the stop bit. Because a normal frame ' +
        'always ends with a high stop bit, a break cannot be mistaken for data, and receivers report it separately. LIN ' +
        'and DMX512 begin every frame with a break, and some bootloaders and consoles use it as an attention signal.',
      ],
    },
    {
      title: 'Flow control and overruns',
      body: [
        'Many microcontroller UARTs can hold only one received byte, or a small buffer. If software does not read a byte ' +
        'before the next one arrives, the earlier byte is lost and the UART reports an overrun error. At 115200 baud, a ' +
        'new byte arrives every 87 µs.',
        'Hardware flow control prevents this with two additional wires: when its buffer is nearly full, the receiver ' +
        'deasserts its RTS output, and the transmitter, which monitors that signal as CTS, pauses. Software flow control ' +
        'sends XON and XOFF characters instead, which only works if those byte values never occur in the data. Most ' +
        'firmware avoids the problem by using interrupts or DMA to move received bytes into a buffer.',
      ],
    },
    {
      title: 'Marking the end of a message',
      body: [
        'UART defines individual bytes, not messages, so higher-level protocols must mark where each message ends. Common ' +
        'approaches are a pause (Modbus RTU ends a message with 3.5 character times of silence), a delimiter character ' +
        '(a newline for text, or encodings such as SLIP and COBS for binary data), or a length field at the start of the ' +
        'message. Many UARTs provide an idle-line interrupt, triggered after one character time of silence, which works ' +
        'well together with DMA.',
      ],
    },
    {
      title: 'The same frame on different wiring',
      body: [
        'The bit pattern shown above is the same wherever UART is used; only the electrical layer changes. Between chips ' +
        'it uses 3.3 V or 5 V logic levels, [RS-232](?p=rs232) inverts it and uses about ±12 V, and ' +
        '[RS-485](?p=rs485) sends it over a differential pair.',
      ],
    },
  ],
  params: [
    { key: 'data', label: 'Data', type: 'text', default: 'Hi', placeholder: 'Hi' },
    {
      key: 'format', label: 'As', type: 'select', default: 'text',
      options: [{ value: 'text', label: 'Text' }, { value: 'hex', label: 'Hex' }],
    },
    {
      key: 'baud', label: 'Baud', type: 'select', default: '9600',
      options: ['1200', '9600', '19200', '57600', '115200'].map((v) => ({ value: v, label: v })),
    },
    {
      key: 'bits', label: 'Data bits', type: 'select', default: '8',
      options: ['5', '6', '7', '8'].map((v) => ({ value: v, label: v })),
    },
    {
      key: 'parity', label: 'Parity', type: 'select', default: 'none',
      options: [{ value: 'none', label: 'None' }, { value: 'even', label: 'Even' }, { value: 'odd', label: 'Odd' }],
    },
    {
      key: 'stop', label: 'Stop bits', type: 'select', default: '1',
      options: [{ value: '1', label: '1' }, { value: '2', label: '2' }],
    },
  ],

  encode(p) {
    const bytes = parseBytes(p.data, p.format);
    const nBits = +p.bits;
    const nStop = +p.stop;
    const mask = (1 << nBits) - 1;

    const tx = new TraceBuilder('TX', 1);
    const bits: Bit[] = [];
    const fields: Field[] = [];
    const notes: Note[] = [{ lane: 0, t: 0.15, text: 'idle: line held high' }];
    let t = 1;

    for (const raw of bytes) {
      const b = raw & mask;
      const frameStart = t;
      const truncated = b !== raw ? ` ${hex(raw)} does not fit in ${nBits} bits, so only its lowest ${nBits} bits are sent.` : '';

      if (!notes[1]) notes.push({ lane: 0, t, text: 'start bit: line goes low' });
      tx.set(t, 0);
      bits.push({
        lane: 0, t0: t, t1: t + 1, label: 'S', kind: 'start', sample: t + 0.5,
        info: 'Start bit, always 0. The line falls from its idle high level, and this edge tells the receiver that a byte ' +
          'is beginning. From this point the receiver uses its own clock to sample each following bit near its center.',
      });
      t++;

      for (let i = 0; i < nBits; i++) {
        const v = ((b >> i) & 1) as 0 | 1;
        tx.set(t, v);
        bits.push({
          lane: 0, t0: t, t1: t + 1, label: `D${i}`, kind: 'data', sample: t + 0.5,
          info: `Data bit ${i} = ${v}. UART sends the least significant bit first, so ${hex(b)} (binary ${bin(b, nBits)}) ` +
            `is transmitted from right to left.${truncated}`,
        });
        t++;
      }

      if (p.parity !== 'none') {
        let ones = 0;
        for (let i = 0; i < nBits; i++) ones += (b >> i) & 1;
        const v = (p.parity === 'even' ? ones % 2 : 1 - (ones % 2)) as 0 | 1;
        tx.set(t, v);
        bits.push({
          lane: 0, t0: t, t1: t + 1, label: 'P', kind: 'parity', sample: t + 0.5,
          info: `${p.parity === 'even' ? 'Even' : 'Odd'} parity bit = ${v}. The data contains ${ones} bit${ones === 1 ? '' : 's'} ` +
            `set to 1, and this bit makes the total number of 1s ${p.parity}. If a single bit changes in transit, the count ` +
            'no longer matches and the receiver reports a parity error.',
        });
        t++;
      }

      if (notes.length === 2) notes.push({ lane: 0, t, text: 'stop bit: line returns high' });
      tx.set(t, 1);
      for (let s = 0; s < nStop; s++) {
        bits.push({
          lane: 0, t0: t, t1: t + 1, label: nStop > 1 ? `Sp${s + 1}` : 'Sp', kind: 'stop', sample: t + 0.5,
          info: 'Stop bit, always 1. It returns the line to its idle level so that the next start bit can produce a falling ' +
            'edge. If the receiver reads a 0 here, it reports a framing error, which usually indicates mismatched baud rates.',
        });
        t++;
      }

      fields.push({ lane: 0, t0: frameStart, t1: t, label: `${hex(b)} ${printable(b)}`.trim(), kind: 'data' });
      t += 1; // a little idle time between frames, for readability
    }

    return { traces: [tx.trace], bits, fields, notes, duration: t, unitTime: 1 / +p.baud };
  },
};
