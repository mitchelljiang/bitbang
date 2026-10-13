import type { Bit, Driver, Field, Kind, Protocol } from '../core/types';
import { TraceBuilder, hex, parseBytes, printable } from '../core/util';

export const i2c: Protocol = {
  id: 'i2c',
  name: 'I²C',
  summary:
    'Two wires with pull-up resistors. Devices can pull a line low but never drive it high. Each ' +
    'target has a 7-bit address, and whoever receives a byte answers with an ACK.',
  params: [
    { key: 'addr', label: 'Address', type: 'text', default: '50', placeholder: '50 (hex, 7-bit)' },
    {
      key: 'rw', label: 'Direction', type: 'select', default: 'w',
      options: [{ value: 'w', label: 'Write (controller → target)' }, { value: 'r', label: 'Read (target → controller)' }],
    },
    { key: 'data', label: 'Data', type: 'text', default: '00 2A', placeholder: '00 2A' },
    {
      key: 'format', label: 'As', type: 'select', default: 'hex',
      options: [{ value: 'hex', label: 'Hex' }, { value: 'text', label: 'Text' }],
    },
    {
      key: 'present', label: 'Target', type: 'select', default: 'yes',
      options: [{ value: 'yes', label: 'Responds (ACK)' }, { value: 'no', label: 'Missing (NACK)' }],
    },
    {
      key: 'speed', label: 'Speed', type: 'select', default: '100000',
      options: [
        { value: '100000', label: 'Standard (100 kHz)' },
        { value: '400000', label: 'Fast (400 kHz)' },
        { value: '1000000', label: 'Fast+ (1 MHz)' },
      ],
    },
  ],

  encode(p) {
    const addrText = p.addr.trim().replace(/^0x/i, '');
    if (!/^[0-9a-f]{1,2}$/i.test(addrText)) throw new Error('The address should be a hex number like 50 or 0x3C.');
    const addr = parseInt(addrText, 16);
    if (addr > 0x7f) throw new Error(`${hex(addr)} is more than 7 bits. I²C addresses go from 0x00 to 0x7F.`);
    const read = p.rw === 'r';
    const present = p.present === 'yes';
    const bytes = parseBytes(p.data, p.format);

    const scl = new TraceBuilder('SCL', 1);
    const sda = new TraceBuilder('SDA', 1);
    const bits: Bit[] = [];
    const fields: Field[] = [];

    // START: SDA falls while SCL is high, which is never allowed during normal data.
    sda.set(1, 0);
    scl.set(1.5, 0);
    bits.push({
      lane: 1, t0: 0.5, t1: 1.5, label: 'S', kind: 'start',
      info: 'START condition: SDA falls while SCL is still high. During data, SDA only changes while SCL is low, so ' +
        'this special pattern can\'t be mistaken for a bit. Every device on the bus wakes up and listens for its address.',
    });

    let t = 1.5;
    const slot = (v: 0 | 1, label: string, kind: Kind, by: Driver, info: string) => {
      sda.set(t + 0.25, v); // change SDA while SCL is low
      scl.set(t + 0.5, 1); // receiver samples while SCL is high
      scl.set(t + 1, 0);
      bits.push({ lane: 1, t0: t, t1: t + 1, label, kind, by, sample: t + 0.75, info });
      t += 1;
    };

    const addrStart = t;
    for (let i = 6; i >= 0; i--) {
      const v = ((addr >> i) & 1) as 0 | 1;
      slot(v, `A${i}`, 'addr', 'controller',
        `Address bit ${i} = ${v}. The controller sends the 7-bit target address ${hex(addr)}, most significant bit first. ` +
        'Every device compares it with its own address.');
    }
    slot(read ? 1 : 0, read ? 'R' : 'W', 'rw', 'controller',
      `Read/write bit = ${read ? 1 : 0} (${read ? 'read' : 'write'}). Together with the address, this makes the first ` +
      `byte ${hex((addr << 1) | (read ? 1 : 0))}. That's why datasheets sometimes list an "8-bit address" that is ` +
      'really the 7-bit address shifted left.');
    fields.push({ lane: 1, t0: addrStart, t1: t, label: `${hex(addr)} ${read ? 'R' : 'W'}`, kind: 'addr' });

    if (present) {
      slot(0, 'ACK', 'ack', 'target',
        `ACK: the target at ${hex(addr)} recognized its address and pulls SDA low during this clock cycle. The controller ` +
        'released SDA, so the wire is now driven by the target.');
    } else {
      slot(1, 'NACK', 'nack', 'controller',
        `NACK: no device answered to ${hex(addr)}, so nobody pulled SDA low and the pull-up kept it high. The controller ` +
        'gives up and sends STOP. This is exactly what an I²C bus scanner looks for.');
    }

    if (present) {
      bytes.forEach((b, idx) => {
        const start = t;
        const sender: Driver = read ? 'target' : 'controller';
        for (let i = 7; i >= 0; i--) {
          const v = ((b >> i) & 1) as 0 | 1;
          slot(v, `${i}`, 'data', sender,
            `Data bit ${i} of ${hex(b)} = ${v}, sent by the ${sender}, most significant bit first. The ${sender} changes ` +
            'SDA only while SCL is low. The receiver reads it while SCL is high.');
        }
        fields.push({ lane: 1, t0: start, t1: t, label: `${hex(b)} ${printable(b)}`.trim(), kind: 'data' });

        const lastRead = read && idx === bytes.length - 1;
        if (lastRead) {
          slot(1, 'NACK', 'nack', 'controller',
            'NACK from the controller: when reading, the controller acknowledges each byte except the last one. Leaving ' +
            'SDA high here tells the target "that\'s enough, stop sending."');
        } else {
          slot(0, 'ACK', 'ack', read ? 'controller' : 'target',
            `ACK: the ${read ? 'controller' : 'target'} pulls SDA low to confirm it received the byte. Then the ` +
            `${sender} sends the next one.`);
        }
      });
    }

    // STOP: SDA rises while SCL is high.
    sda.set(t + 0.25, 0);
    scl.set(t + 0.5, 1);
    sda.set(t + 0.75, 1);
    bits.push({
      lane: 1, t0: t + 0.25, t1: t + 1.25, label: 'P', kind: 'stop',
      info: 'STOP condition: SDA rises while SCL is high, the mirror image of START. Both lines are released and the ' +
        'bus is free for any controller to use.',
    });

    return { traces: [scl.trace, sda.trace], bits, fields, duration: t + 1.75, unitTime: 1 / +p.speed };
  },
};
