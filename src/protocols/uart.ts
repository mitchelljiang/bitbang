import type { Bit, Field, Note, Protocol } from '../core/types';
import { TraceBuilder, bin, hex, parseBytes, printable } from '../core/util';

export const uart: Protocol = {
  id: 'uart',
  name: 'UART',
  summary:
    'One wire each way and no clock. Both sides agree on a baud rate in advance. The line sits high ' +
    'when idle, and the receiver times everything from the falling edge of the start bit.',
  usedIn: 'Debug consoles, GPS modules, Bluetooth and Wi-Fi serial modules, and the USB-to-serial chip on most dev boards.',
  facts: {
    clock: 'None (asynchronous). Both sides run their own clock at an agreed baud rate and resync on every start bit.',
    wires: 'TX and RX, plus a shared ground. Optional RTS/CTS for flow control.',
    drive: 'Push-pull. Each TX pin is the only thing driving its wire.',
    duplex: 'Full duplex. TX and RX are separate wires, so both directions can talk at once.',
    topology: 'Point-to-point. One device on each end.',
    addressing: 'None. There is only one possible receiver.',
    flow: 'None by default. Optional hardware (RTS/CTS) or software (XON/XOFF) flow control.',
    errors: 'Optional parity bit (catches any odd number of flipped bits). A 0 where the stop bit should be is a framing error.',
    speed: '9600 and 115200 baud are the usual rates. Many chips manage 1 to 3 Mbaud or more; the limit is clock accuracy, not the protocol.',
    reach: 'A meter or so at 3.3 V logic levels. About 15 m as RS-232, and over 1 km as differential RS-485.',
  },
  strengths: [
    'Only two signal wires, and no clock line to route.',
    'Nearly every microcontroller has one, and a cheap USB adapter lets a computer talk to it.',
    'Human-readable when you send text, which is why it\'s the default debug console.',
  ],
  limits: [
    'Both sides must be set to the same baud rate. Their clocks may drift apart by only about 2% each before bits are misread.',
    'Start and stop bits cost 20% of the bandwidth with 8N1 (10 bits on the wire per 8 bits of data).',
    'No addressing: each pair of wires connects exactly two devices.',
    'Parity misses two flipped bits in the same byte, and there\'s no acknowledgment that anything was received.',
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
    const notes: Note[] = [{ lane: 0, t: 0.15, text: 'idle (high)' }];
    let t = 1;

    for (const raw of bytes) {
      const b = raw & mask;
      const frameStart = t;
      const truncated = b !== raw ? ` (${hex(raw)} doesn't fit in ${nBits} bits, so only the low bits are sent)` : '';

      if (!notes[1]) notes.push({ lane: 0, t, text: 'start bit pulls the line low' });
      tx.set(t, 0);
      bits.push({
        lane: 0, t0: t, t1: t + 1, label: 'S', kind: 'start', sample: t + 0.5,
        info: 'Start bit (always 0). The line falls from idle-high, and that edge tells the receiver a frame is beginning. ' +
          'It then samples each following bit in the middle of its period, using its own clock at the agreed baud rate.',
      });
      t++;

      for (let i = 0; i < nBits; i++) {
        const v = ((b >> i) & 1) as 0 | 1;
        tx.set(t, v);
        bits.push({
          lane: 0, t0: t, t1: t + 1, label: `D${i}`, kind: 'data', sample: t + 0.5,
          info: `Data bit ${i} = ${v}. UART sends the least significant bit first, so ${hex(b)} = ${bin(b, nBits)}₂ goes out ` +
            `right to left.${truncated}`,
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
          info: `${p.parity === 'even' ? 'Even' : 'Odd'} parity bit = ${v}. The data has ${ones} one-bit${ones === 1 ? '' : 's'}, ` +
            `and this bit makes the total count of 1s ${p.parity}. If a single bit flips in transit, the count is wrong and ` +
            `the receiver flags a parity error.`,
        });
        t++;
      }

      if (notes.length === 2) notes.push({ lane: 0, t, text: 'stop bit: back to idle' });
      tx.set(t, 1);
      for (let s = 0; s < nStop; s++) {
        bits.push({
          lane: 0, t0: t, t1: t + 1, label: nStop > 1 ? `Sp${s + 1}` : 'Sp', kind: 'stop', sample: t + 0.5,
          info: 'Stop bit (always 1). It returns the line to idle so the next start bit has a falling edge to produce. ' +
            'If the receiver samples a 0 here, it reports a framing error, which usually means the baud rates don\'t match.',
        });
        t++;
      }

      fields.push({ lane: 0, t0: frameStart, t1: t, label: `${hex(b)} ${printable(b)}`.trim(), kind: 'data' });
      t += 1; // a little idle time between frames, for readability
    }

    return { traces: [tx.trace], bits, fields, notes, duration: t, unitTime: 1 / +p.baud };
  },
};
