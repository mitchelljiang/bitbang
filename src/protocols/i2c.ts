import type { Bit, Driver, Field, Kind, Note, Protocol } from '../core/types';
import { TraceBuilder, bin, hex, parseBytes, printable } from '../core/util';

export const i2c: Protocol = {
  id: 'i2c',
  name: 'I²C',
  fullName: 'Inter-Integrated Circuit',
  summary:
    'Two wires with pull-up resistors. Devices can pull a line low but never drive it high. Each ' +
    'target has an address (7 bits, or optionally 10), and whoever receives a byte answers with an ACK.',
  usedIn: 'Temperature and motion sensors, EEPROMs, real-time clocks, and small OLED displays, often many of them on the same two wires.',
  facts: {
    clock: 'Synchronous. The controller drives SCL, but a target can hold it low to pause the transfer (clock stretching).',
    wires: 'SCL and SDA, plus ground, shared by every device. One pull-up resistor on each line.',
    drive: 'Open-drain. Devices can only pull a line low; the pull-up resistor brings it back high, which is why the rising edges are slow.',
    duplex: 'Half duplex. SDA carries data in one direction at a time.',
    topology: 'Multi-drop bus: many targets, and optionally several controllers, on the same two wires.',
    addressing: '7-bit addresses sent at the start of each transfer, so about 112 usable. An optional 10-bit mode sends the address in two bytes.',
    flow: 'ACK/NACK after every byte, plus clock stretching when a target needs more time.',
    errors: 'ACK only shows that someone received a byte, not that it was right. There\'s no checksum (SMBus adds an optional CRC-8, called PEC).',
    speed: '100 kHz (Standard), 400 kHz (Fast), 1 MHz (Fast-mode Plus), and 3.4 MHz (High-speed, rarely used).',
    reach: 'Board level. The spec allows at most 400 pF on the bus, which is roughly a meter of wiring plus the devices.',
  },
  strengths: [
    'Two wires for any number of devices. Adding a sensor costs no extra pins.',
    'Addressing and acknowledgments are built in, so you can tell when a device is missing.',
    'Several controllers can share one bus. Arbitration on SDA decides who wins without corrupting anything.',
  ],
  limits: [
    'Slow. The pull-up resistor has to charge the line\'s capacitance on every rising edge, which caps the speed.',
    'Choosing the pull-up is a trade-off: smaller resistors give faster edges but waste more current.',
    'Many parts have fixed or barely configurable addresses, so two identical sensors can collide.',
    'One stuck device holding SDA low can hang the entire bus until it\'s reset.',
  ],
  params: [
    { key: 'addr', label: 'Address', type: 'text', default: '50', placeholder: '50 (hex)' },
    {
      key: 'addrMode', label: 'Address size', type: 'select', default: '7',
      options: [{ value: '7', label: '7-bit' }, { value: '10', label: '10-bit' }],
    },
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
    const ten = p.addrMode === '10';
    const addrText = p.addr.trim().replace(/^0x/i, '');
    if (!/^[0-9a-f]{1,3}$/i.test(addrText)) throw new Error('The address should be a hex number like 50 or 0x3C.');
    const addr = parseInt(addrText, 16);
    if (!ten && addr > 0x7f) {
      throw new Error(`${hex(addr)} is more than 7 bits. 7-bit addresses go from 0x00 to 0x7F. Switch Address size to 10-bit for larger ones.`);
    }
    if (ten && addr > 0x3ff) throw new Error(`${hex(addr)} is more than 10 bits. 10-bit addresses go from 0x000 to 0x3FF.`);
    const read = p.rw === 'r';
    const present = p.present === 'yes';
    const bytes = parseBytes(p.data, p.format);

    const scl = new TraceBuilder('SCL', 1, true);
    const sda = new TraceBuilder('SDA', 1, true);
    const bits: Bit[] = [];
    const fields: Field[] = [];
    const notes: Note[] = [
      { lane: 0, t: 2, text: 'slow rise: only a pull-up resistor pulls it high' },
      { lane: 1, t: 1, text: 'START: SDA falls while SCL is high' },
    ];

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

    // Repeated START: release SDA while SCL is low, raise SCL, then pull SDA low again while SCL is high.
    const repeatedStart = () => {
      sda.set(t + 0.25, 1);
      scl.set(t + 0.5, 1);
      sda.set(t + 1, 0);
      scl.set(t + 1.5, 0);
      bits.push({
        lane: 1, t0: t + 0.5, t1: t + 1.5, label: 'Sr', kind: 'start',
        info: 'Repeated START: a START without a STOP before it. The controller keeps the bus, so no other controller ' +
          'can jump in, and it can now resend the address with the direction flipped to read.',
      });
      t += 1.5;
    };

    const rwSlot = (r: boolean, info: string) =>
      slot(r ? 1 : 0, r ? 'R' : 'W', 'rw', 'controller', `Read/write bit = ${r ? 1 : 0} (${r ? 'read' : 'write'}). ${info}`);

    /** First byte of a 10-bit address: the reserved 11110 prefix, then A9 and A8, then R/W. */
    const tenBitHeader = (r: boolean) => {
      const start = t;
      for (const v of [1, 1, 1, 1, 0] as const) {
        slot(v, `${v}`, 'addr', 'controller',
          'Part of the reserved 11110 prefix. No 7-bit device has an address starting with 11110, so they all ignore ' +
          'this transfer, and 10-bit devices know the next two bits are the top of their address.');
      }
      for (const i of [9, 8]) {
        const v = ((addr >> i) & 1) as 0 | 1;
        slot(v, `A${i}`, 'addr', 'controller', `Address bit ${i} = ${v}, one of the two high bits of the 10-bit address ${hex(addr)}.`);
      }
      rwSlot(r, r
        ? 'After the repeated START, only the top two address bits are resent, now with R, and the target that was ' +
          'already addressed answers.'
        : 'The first byte of a 10-bit address always says write, even for a read, because the second address byte ' +
          'still has to be sent to the target.');
      const header = 0xf0 | ((addr >> 8) << 1) | (r ? 1 : 0);
      fields.push({ lane: 1, t0: start, t1: t, label: `${hex(header)} 11110+A9A8 ${r ? 'R' : 'W'}`, kind: 'addr' });
    };

    const addrAck = (who: string) => {
      notes.push({ lane: 1, t: t + 0.25, text: present ? 'target pulls SDA low: ACK' : 'nobody answers: NACK' });
      if (present) {
        slot(0, 'ACK', 'ack', 'target',
          `ACK: ${who} pulls SDA low during this clock cycle. The controller released SDA, so the wire is now driven by ` +
          'the target.');
      } else {
        slot(1, 'NACK', 'nack', 'controller',
          `NACK: no device answered to ${hex(addr)}, so nobody pulled SDA low and the pull-up kept it high. The ` +
          'controller gives up and sends STOP. This is exactly what an I²C bus scanner looks for.');
      }
    };

    if (!ten) {
      const addrStart = t;
      for (let i = 6; i >= 0; i--) {
        const v = ((addr >> i) & 1) as 0 | 1;
        slot(v, `A${i}`, 'addr', 'controller',
          `Address bit ${i} = ${v}. The controller sends the 7-bit target address ${hex(addr)}, most significant bit ` +
          'first. Every device compares it with its own address.');
      }
      rwSlot(read,
        `Together with the address, this makes the first byte ${hex((addr << 1) | (read ? 1 : 0))}. That's why ` +
        'datasheets sometimes list an "8-bit address" that is really the 7-bit address shifted left.');
      fields.push({ lane: 1, t0: addrStart, t1: t, label: `${hex(addr)} ${read ? 'R' : 'W'}`, kind: 'addr' });
      addrAck(`the target at ${hex(addr)} recognized its address and`);
    } else {
      tenBitHeader(false);
      addrAck(`every 10-bit target whose top two address bits are ${bin(addr >> 8, 2)}`);
      if (present) {
        const start = t;
        for (let i = 7; i >= 0; i--) {
          const v = ((addr >> i) & 1) as 0 | 1;
          slot(v, `A${i}`, 'addr', 'controller',
            `Address bit ${i} = ${v}. The second byte carries the low 8 bits of the 10-bit address ${hex(addr)}.`);
        }
        fields.push({ lane: 1, t0: start, t1: t, label: `${hex(addr & 0xff)} A7–A0`, kind: 'addr' });
        slot(0, 'ACK', 'ack', 'target',
          `ACK: only the target whose full address is ${hex(addr)} answers this time. It is now the addressed target.`);
        if (read) {
          repeatedStart();
          tenBitHeader(true);
          slot(0, 'ACK', 'ack', 'target', `ACK: the target at ${hex(addr)} confirms it's ready to send data.`);
        }
      }
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
    notes.push({ lane: 1, t: t + 0.75, text: 'STOP: SDA rises while SCL is high' });
    bits.push({
      lane: 1, t0: t + 0.25, t1: t + 1.25, label: 'P', kind: 'stop',
      info: 'STOP condition: SDA rises while SCL is high, the mirror image of START. Both lines are released and the ' +
        'bus is free for any controller to use.',
    });

    return { traces: [scl.trace, sda.trace], bits, fields, notes, duration: t + 1.75, unitTime: 1 / +p.speed };
  },
};
