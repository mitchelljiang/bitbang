import type { Bit, Field, Protocol } from '../core/types';
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
  summary:
    'The controller drives the clock and pulls CS low to pick a device. Each clock cycle moves one ' +
    'bit out on MOSI and one bit back on MISO, at the same time.',
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

    return {
      traces: [cs.trace, sclk.trace, mosi.trace, miso.trace],
      bits, fields, duration: csHigh + 1, unitTime: 1 / +p.clock,
    };
  },
};
