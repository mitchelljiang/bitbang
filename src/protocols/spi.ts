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
  tags: ['synchronous', 'single-ended', 'push-pull', 'full duplex', 'multi-drop', 'daisy chain', 'chip-to-chip'],
  summary:
    'A fast, simple link between a controller and one or more targets. The controller drives a clock and selects a ' +
    'target by pulling its chip-select (CS) line low. On every clock cycle, one bit travels from the controller to the ' +
    'target on MOSI and one bit travels back on MISO at the same time.',
  usedIn: 'Flash memory, SD cards, small displays, fast analog-to-digital and digital-to-analog converters, and some radio chips.',
  facts: {
    clock: 'Synchronous. The controller drives SCLK, and data is sampled on one of its edges, as set by the SPI mode.',
    wires: 'SCLK, MOSI and MISO, shared by all targets, plus one CS line per target: four wires for a single target, and 3 + N for N targets.',
    drive: 'Push-pull. A target drives MISO only while its CS line is low and leaves it released (high-impedance) otherwise.',
    duplex: 'Full duplex. Each clock cycle shifts one bit out on MOSI and one bit in on MISO.',
    topology: 'One controller and one or more targets, each selected by its own CS line. Some devices can also be daisy-chained.',
    addressing: 'By wire: the CS line selects the target, so no address is sent over the bus.',
    flow: 'None. The controller sets the pace, and a target has no way to request a pause.',
    errors: 'None in the protocol itself. Some devices add their own CRC or status bytes.',
    speed: 'Not fixed by any standard: the clock can run as fast as both devices and the wiring allow. Commonly 1 to 50 MHz, up to about 80 MHz for fast flash and displays, and above 100 MHz for some flash devices.',
    reach: 'Circuit-board distances, or a short cable at most. Fast edges and timing differences between clock and data limit longer connections.',
  },
  strengths: [
    'Fast and simple to implement: at its core it is two shift registers and a clock.',
    'Full duplex, with no address or acknowledgment overhead, so every clock cycle carries data.',
    'Supports any word length and any clock rate the target can handle, with no fixed framing.',
  ],
  limits: [
    'Each additional target requires another CS line, so the pin count grows with the number of devices.',
    'There is no acknowledgment. If no target is connected, the controller simply reads whatever level is on MISO, usually all 1s or all 0s.',
    'Not a single formal standard: clock mode, bit order, word size and maximum speed vary between devices, so each datasheet must be checked.',
    'Suitable only for short distances.',
  ],
  deepDive: [
    {
      title: 'Finding the mode in a datasheet',
      body: [
        'Datasheets often show a timing diagram rather than naming the SPI mode. Two observations determine it. First, ' +
        'the level of SCLK when CS goes low: low means CPOL = 0, and high means CPOL = 1. Second, the edge on which data ' +
        'is sampled: if the device samples on the first clock edge, CPHA = 0; if data changes on the first edge and is ' +
        'sampled on the second, CPHA = 1.',
        'Modes 0 and 3 cover most devices, and many accept both, because in each case data is sampled on a rising edge.',
      ],
    },
    {
      title: 'Signal names: MOSI, MISO, SDO, SDI, COPI, CIPO',
      body: [
        'The traditional names are MOSI and MISO. Newer datasheets often use SDO (serial data out) and SDI (serial data ' +
        'in), named from each device\'s own perspective, so the controller\'s SDO connects to the target\'s SDI. The open ' +
        'hardware community has adopted COPI and CIPO (controller out, peripheral in). The chip-select line also appears ' +
        'as SS, nCS, CE or SYNC.',
      ],
    },
    {
      title: 'What limits the clock rate',
      body: [
        'Writing data at high speed is straightforward. Reading is harder, because the clock edge must travel to the ' +
        'target, the target needs time to update MISO, and the new value must travel back, all before the controller ' +
        'samples it. At 50 MHz, that round trip must fit within 10 ns. Many SPI controllers offer a delayed-sampling ' +
        'option that samples MISO later in the cycle, and short traces also help.',
      ],
    },
    {
      title: 'Chip select does more than select',
      body: [
        'Many devices act when CS goes high: an analog-to-digital converter starts a conversion, a digital-to-analog ' +
        'converter updates its output, or a flash device starts an erase. CS going low also resets the device\'s bit ' +
        'counter, so a glitch on CS during a transfer can shift every following byte by several bits. Some commands ' +
        'require CS to stay low for an entire multi-byte sequence.',
        'Every target must release MISO when its CS line is high. Some low-cost modules, and SD cards in SPI mode until ' +
        'they receive one additional clock cycle, do not, which causes errors that are difficult to diagnose on a shared bus.',
      ],
    },
    {
      title: '3-wire SPI and daisy chains',
      body: [
        '3-wire SPI combines MOSI and MISO into a single bidirectional data line to save a pin. The trade-off is full ' +
        'duplex: the controller sends a command, then releases the line and reads the response.',
        'A daisy chain does the opposite: many devices share one CS line, and each device\'s output feeds the next ' +
        'device\'s input. For example, shifting 16 bits through two 74HC595 shift registers and then raising CS updates ' +
        'both at once. LED drivers and some digital-to-analog converters are designed for this arrangement.',
      ],
    },
  ],
  params: [
    { key: 'data', label: 'MOSI', help: 'The bytes the controller sends to the target on MOSI.', type: 'text', default: '9F 00 00', placeholder: '9F 00 00' },
    { key: 'miso', label: 'MISO', help: 'The bytes the target sends back on MISO during the same clock cycles. If left empty, the target returns 0x00.', type: 'text', default: 'FF EF 40', placeholder: 'FF EF 40' },
    {
      key: 'format', label: 'As', help: 'Whether MOSI and MISO are read as hexadecimal bytes or as text characters.', type: 'select', default: 'hex',
      options: [{ value: 'hex', label: 'Hex' }, { value: 'text', label: 'Text' }],
    },
    {
      key: 'mode', label: 'Mode', help: 'CPOL sets the level at which the clock idles, and CPHA sets whether data is sampled on the first or the second clock edge. Both devices must use the same mode.', type: 'select', default: '0',
      options: ['0', '1', '2', '3'].map((m) => ({ value: m, label: `${m} (CPOL ${+m >> 1}, CPHA ${+m & 1})` })),
    },
    {
      key: 'order', label: 'Bit order', help: 'Whether each byte is sent most significant bit first, as most devices expect, or least significant bit first.', type: 'select', default: 'msb',
      options: [{ value: 'msb', label: 'MSB first' }, { value: 'lsb', label: 'LSB first' }],
    },
    {
      key: 'clock', label: 'Clock', help: 'The SCLK frequency. It changes the timescale, not the sequence of bits.', type: 'select', default: '1000000',
      // SPI defines no fixed rates or maximum; these are common settings, up to the 80 MHz many fast parts support.
      options: [100e3, 400e3, 1e6, 2e6, 4e6, 5e6, 8e6, 10e6, 16e6, 20e6, 25e6, 40e6, 50e6, 80e6].map((hz) => ({
        value: String(hz),
        label: hz < 1e6 ? `${hz / 1e3} kHz` : `${hz / 1e6} MHz`,
      })),
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
          info: `MISO bit ${shift} of ${hex(back)} = ${vi}. In the same clock cycle, the target sends a bit back. ` +
            `SPI is effectively two shift registers connected in a ring: every bit transmitted is matched by a bit received.`,
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
      info: 'Chip select goes low, selecting one target. Every other target on the bus ignores the clock and keeps MISO ' +
        'released (high-impedance). SPI has no addresses; each target has its own CS line instead.',
    });
    bits.push({
      lane: 0, t0: csHigh - 0.5, t1: csHigh + 0.5, label: 'CS↑', kind: 'stop',
      info: 'Chip select goes high, ending the transaction. The target releases MISO, and many devices execute the ' +
        'received command at this moment.',
    });

    const notes: Note[] = [
      { lane: 0, t: csLow, text: 'CS low: target selected' },
      { lane: 0, t: csHigh, text: 'CS high: transaction ends' },
      { lane: 1, t: csLow + 0.5 + (cpha ? 0.5 : 0), text: `both devices sample on this ${cpha === cpol ? 'rising' : 'falling'} edge` },
      { lane: 3, t: 0.15, text: 'released (high-Z)' },
    ];

    return {
      traces: [cs.trace, sclk.trace, mosi.trace, miso.trace],
      bits, fields, notes, duration: csHigh + 1, unitTime: 1 / +p.clock,
    };
  },
};
