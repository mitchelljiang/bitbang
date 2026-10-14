import type { Bit, Field, Note, Protocol } from '../core/types';
import { TraceBuilder, hex, parseBytes, printable } from '../core/util';

const MODE_INFO = [
  'Mode 0 (CPOL=0, CPHA=0): the clock idles low, and data is sampled on the rising edge.',
  'Mode 1 (CPOL=0, CPHA=1): the clock idles low, and data is sampled on the falling edge.',
  'Mode 2 (CPOL=1, CPHA=0): the clock idles high, and data is sampled on the falling edge.',
  'Mode 3 (CPOL=1, CPHA=1): the clock idles high, and data is sampled on the rising edge.',
];

export const spi: Protocol = {
  id: 'spi',
  name: 'SPI',
  fullName: 'Serial Peripheral Interface',
  summary:
    'The controller drives the clock and pulls CS low to pick a device. Each clock cycle moves one ' +
    'bit out on MOSI and one bit back on MISO, at the same time.',
  usedIn: 'Flash memory, SD cards, small displays, fast ADCs and DACs, and some radio chips.',
  facts: {
    clock: 'Synchronous. The controller drives SCLK, and data is sampled on one of its edges (set by the SPI mode).',
    wires: 'SCLK, MOSI and MISO, shared by all targets, plus one CS line per target. 4 wires for one target, 3 + N for N targets.',
    drive: 'Push-pull. A target only drives MISO while its CS is low and leaves it released (high-Z) otherwise.',
    duplex: 'Full duplex. Every clock cycle shifts one bit out on MOSI and one bit in on MISO.',
    topology: 'One controller, one or more targets, each picked by its own chip select. Some parts can be daisy-chained instead.',
    addressing: 'By wire: the CS line is the address. No address bits go over the bus.',
    flow: 'None. The controller sets the pace, and a target has no way to say "wait".',
    errors: 'None in the protocol. Some devices add their own CRC or status bytes.',
    speed: 'Commonly 1 to 50 MHz. Quad SPI flash runs above 100 MHz using four data lines.',
    reach: 'Board level: centimeters, maybe a short cable. Fast edges and clock-to-data skew limit longer runs.',
  },
  strengths: [
    'Fast, and simple to build: underneath it\'s just two shift registers and a clock.',
    'Full duplex, with no address or acknowledgment overhead. Every clock cycle carries data.',
    'Any word length and any data rate the target can handle; no fixed framing.',
  ],
  limits: [
    'Pin count grows with every target, because each one needs its own CS line.',
    'No acknowledgment. If no target is connected, the controller just reads back whatever is on MISO, usually all 1s or all 0s.',
    'Not really a single standard: clock mode, bit order, word size and max speed vary from chip to chip, so you check each datasheet.',
    'Only works over short distances.',
  ],
  deepDive: [
    {
      title: 'Finding the mode in a datasheet',
      body: [
        'Datasheets often show a timing diagram instead of saying "mode 0". Two questions answer it. Where does SCLK ' +
        'sit when CS goes low? Low means CPOL = 0, high means CPOL = 1. Is the data already valid at the first clock ' +
        'edge? If the chip samples on that first edge, CPHA = 0; if data changes on it and is sampled on the second, ' +
        'CPHA = 1.',
        'Modes 0 and 3 cover most chips, and many accept both, because in both the data is sampled on a rising edge.',
      ],
    },
    {
      title: 'MOSI, MISO, SDO, SDI, COPI, CIPO',
      body: [
        'The classic names are MOSI and MISO. Newer datasheets use SDO and SDI, named from each chip\'s own point of ' +
        'view, so the controller\'s SDO connects to the target\'s SDI. The open hardware community now uses COPI and ' +
        'CIPO (controller out, peripheral in). Chip select also goes by CS, SS, nCS, CE and SYNC.',
      ],
    },
    {
      title: 'What really limits the speed',
      body: [
        'Writing is easy to make fast. Reading is harder: the clock edge has to travel to the target, the target takes ' +
        'some time to change MISO, and MISO has to travel back, all before the controller samples. At 50 MHz that ' +
        'whole round trip has to fit in 10 ns. Many SPI peripherals have a "delayed sampling" option to sample MISO ' +
        'later, and short traces help.',
      ],
    },
    {
      title: 'Chip select does more than select',
      body: [
        'Many chips act on CS going high: an ADC starts converting, a DAC updates its output, a flash chip starts an ' +
        'erase. CS going low also resets the chip\'s bit counter, so a glitch on CS mid-transfer can throw every ' +
        'following byte off by a few bits. Some commands need CS held low for the whole multi-byte sequence.',
        'Every target must also release MISO when its CS is high. A few cheap modules (and SD cards in SPI mode, until ' +
        'they get one extra clock) don\'t, which breaks a shared bus in confusing ways.',
      ],
    },
    {
      title: '3-wire SPI and daisy chains',
      body: [
        '3-wire SPI merges MOSI and MISO into one bidirectional data line to save a pin, at the cost of full duplex: ' +
        'the controller sends a command, then lets go of the line and reads.',
        'A daisy chain goes the other way: one CS for many chips, with each chip\'s output feeding the next one\'s input. ' +
        'Shifting 16 bits through two 74HC595 shift registers and then raising CS updates both at once. LED drivers and ' +
        'some DACs are built for this.',
      ],
    },
  ],
  params: [
    { key: 'data', label: 'MOSI', type: 'text', default: '9F 00 00', placeholder: '9F 00 00' },
    { key: 'miso', label: 'MISO', type: 'text', default: 'FF EF 40', placeholder: 'FF EF 40' },
    {
      key: 'format', label: 'As', type: 'select', default: 'hex',
      options: [{ value: 'hex', label: 'Hex' }, { value: 'text', label: 'Text' }],
    },
    {
      key: 'mode', label: 'Mode', type: 'select', default: '0',
      options: ['0', '1', '2', '3'].map((m) => ({ value: m, label: `${m} (CPOL ${+m >> 1}, CPHA ${+m & 1})` })),
    },
    {
      key: 'order', label: 'Bit order', type: 'select', default: 'msb',
      options: [{ value: 'msb', label: 'MSB first' }, { value: 'lsb', label: 'LSB first' }],
    },
    {
      key: 'clock', label: 'Clock', type: 'select', default: '1000000',
      options: [
        { value: '100000', label: '100 kHz' },
        { value: '1000000', label: '1 MHz' },
        { value: '10000000', label: '10 MHz' },
      ],
    },
  ],

  encode(p) {
    const mosiBytes = parseBytes(p.data, p.format);
    const misoBytes = p.miso.trim() ? parseBytes(p.miso, p.format) : [];
    const mode = +p.mode;
    const cpol = (mode >> 1) as 0 | 1;
    const cpha = mode & 1;
    const msb = p.order === 'msb';
    const n = Math.max(mosiBytes.length, misoBytes.length);

    const cs = new TraceBuilder('CS', 1);
    const sclk = new TraceBuilder('SCLK', cpol);
    const mosi = new TraceBuilder('MOSI', 'z');
    const miso = new TraceBuilder('MISO', 'z');
    const bits: Bit[] = [];
    const fields: Field[] = [];
    const active = (1 - cpol) as 0 | 1;

    const csLow = 1;
    cs.set(csLow, 0);

    // CPHA=0: data is set up before the first (leading) edge and sampled on it, then changes on the trailing edge.
    // CPHA=1: data changes on the leading edge and is sampled on the trailing edge.
    const start = csLow + (cpha ? 0.5 : 0);

    for (let byte = 0; byte < n; byte++) {
      const out = mosiBytes[byte] ?? 0;
      const back = misoBytes[byte] ?? 0;
      const byteStart = start + byte * 8;

      for (let i = 0; i < 8; i++) {
        const shift = msb ? 7 - i : i;
        const t = byteStart + i;
        const lead = csLow + 0.5 + byte * 8 + i;
        const sample = cpha ? lead + 0.5 : lead;
        const vo = ((out >> shift) & 1) as 0 | 1;
        const vi = ((back >> shift) & 1) as 0 | 1;

        mosi.set(t, vo);
        miso.set(t, vi);
        sclk.set(lead, active);
        sclk.set(lead + 0.5, cpol);

        const edge = (sample === lead) === (cpol === 0) ? 'rising' : 'falling';
        const where = `bit ${shift} of ${hex(out)}`;
        const order = msb ? 'most significant bit first' : 'least significant bit first';
        bits.push({
          lane: 2, t0: t, t1: t + 1, label: `${shift}`, kind: 'data', sample, by: 'controller',
          info: `MOSI ${where} = ${vo}. The controller shifts out ${order}, and the target samples it on the ${edge} ` +
            `clock edge. ${MODE_INFO[mode]}`,
        });
        bits.push({
          lane: 3, t0: t, t1: t + 1, label: `${shift}`, kind: 'data', sample, by: 'target',
          info: `MISO bit ${shift} of ${hex(back)} = ${vi}. During the same clock cycle the target sends a bit back. ` +
            `SPI is a pair of shift registers connected in a ring: every bit out is also a bit in.`,
        });
      }

      const end = byteStart + 8;
      fields.push({ lane: 2, t0: byteStart, t1: end, label: `${hex(out)} ${printable(out)}`.trim(), kind: 'data' });
      fields.push({ lane: 3, t0: byteStart, t1: end, label: `${hex(back)} ${printable(back)}`.trim(), kind: 'data' });
    }

    const last = csLow + 0.5 + n * 8;
    const csHigh = last + 0.5;
    cs.set(csHigh, 1);
    mosi.set(csHigh, 'z');
    miso.set(csHigh, 'z');

    bits.unshift({
      lane: 0, t0: csLow - 0.5, t1: csLow + 0.5, label: 'CS↓', kind: 'start',
      info: 'Chip select goes low. This selects one target, and every other target on the bus ignores the clock and ' +
        'keeps MISO released (high-impedance). SPI has no addresses: each target gets its own CS wire.',
    });
    bits.push({
      lane: 0, t0: csHigh - 0.5, t1: csHigh + 0.5, label: 'CS↑', kind: 'stop',
      info: 'Chip select goes high, which ends the transaction. The target releases MISO, and many chips act on the ' +
        'command they received only at this moment.',
    });

    const notes: Note[] = [
      { lane: 0, t: csLow, text: 'CS low: target selected' },
      { lane: 0, t: csHigh, text: 'CS high: done' },
      { lane: 1, t: csLow + 0.5 + (cpha ? 0.5 : 0), text: `both sides sample on this ${cpha === cpol ? 'rising' : 'falling'} edge` },
      { lane: 3, t: 0.15, text: 'released (high-Z)' },
    ];

    return {
      traces: [cs.trace, sclk.trace, mosi.trace, miso.trace],
      bits, fields, notes, duration: csHigh + 1, unitTime: 1 / +p.clock,
    };
  },
};
