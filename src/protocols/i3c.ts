import type { Bit, Driver, Field, Kind, Note, Protocol } from '../core/types';
import { TraceBuilder, hex, parseBytes, printable } from '../core/util';

const BROADCAST = 0x7e;

export const i3c: Protocol = {
  id: 'i3c',
  name: 'I3C',
  summary:
    'I²C\'s successor, on the same two wires. The controller drives SCL push-pull at up to 12.5 MHz. Each transfer ' +
    'starts in open-drain mode so devices can arbitrate and acknowledge, then switches to push-pull for the data. ' +
    'Data bytes end with a parity bit instead of an ACK.',
  usedIn: 'Newer phone and wearable sensors, sensor hubs, and the sideband bus on DDR5 memory modules (JEDEC uses I3C Basic).',
  facts: {
    clock: 'Synchronous. The controller drives SCL push-pull, up to 12.5 MHz. Targets can\'t stretch the clock.',
    wires: 'SCL and SDA, plus ground, shared by every device, just like I²C.',
    drive: 'Mixed. SDA is open-drain while addresses and ACKs go by, so several devices can share it, and push-pull for data. SCL is always push-pull.',
    duplex: 'Half duplex. SDA carries data in one direction at a time.',
    topology: 'Multi-drop bus with one active controller. Other controllers can ask to take over, and many I²C devices can share the bus.',
    addressing: '7-bit dynamic addresses that the controller hands out at startup, so two identical parts never collide. 0x7E is the broadcast address.',
    flow: 'No clock stretching. On reads, the target ends a message with its T-bit. Targets can raise in-band interrupts on SDA instead of using an extra IRQ wire.',
    errors: 'Every written data byte carries an odd-parity T-bit. The faster HDR modes add a CRC.',
    speed: 'SDR mode: 12.5 MHz clock, about 11 Mbit/s of data. HDR modes reach roughly 25 to 33 Mbit/s on the same wires.',
    reach: 'Board level. It allows less bus capacitance than I²C, which is what lets it run so much faster.',
  },
  strengths: [
    'Roughly 10 to 30 times faster than I²C on the same two wires.',
    'Dynamic addressing: the controller assigns addresses, so identical sensors don\'t collide.',
    'In-band interrupts replace the separate interrupt pin each I²C sensor usually needs.',
    'Push-pull data uses less power than pulling against a resistor on every 0.',
  ],
  limits: [
    'Controllers are more complex, and fewer microcontrollers have an I3C peripheral than I²C.',
    'Legacy I²C devices on the bus need a 50 ns spike filter, or they can misread the fast I3C traffic.',
    'Targets can\'t stretch the clock, so a slow target has to keep up or use the protocol\'s own ways of pausing.',
    'The full spec is for MIPI members; the public I3C Basic subset leaves out some features.',
  ],
  params: [
    { key: 'addr', label: 'Dynamic address', type: 'text', default: '08', placeholder: '08 (hex, 7-bit)' },
    {
      key: 'rw', label: 'Direction', type: 'select', default: 'w',
      options: [{ value: 'w', label: 'Write (controller → target)' }, { value: 'r', label: 'Read (target → controller)' }],
    },
    { key: 'data', label: 'Data', type: 'text', default: '0F 42', placeholder: '0F 42' },
    {
      key: 'format', label: 'As', type: 'select', default: 'hex',
      options: [{ value: 'hex', label: 'Hex' }, { value: 'text', label: 'Text' }],
    },
    {
      key: 'header', label: 'Header', type: 'select', default: 'yes',
      options: [{ value: 'yes', label: 'Broadcast 7E first' }, { value: 'no', label: 'Target address only' }],
    },
    {
      key: 'present', label: 'Target', type: 'select', default: 'yes',
      options: [{ value: 'yes', label: 'Responds (ACK)' }, { value: 'no', label: 'Missing (NACK)' }],
    },
  ],

  encode(p) {
    const addrText = p.addr.trim().replace(/^0x/i, '');
    if (!/^[0-9a-f]{1,2}$/i.test(addrText)) throw new Error('The address should be a hex number like 08 or 0x2A.');
    const addr = parseInt(addrText, 16);
    if (addr > 0x7f) throw new Error(`${hex(addr)} is more than 7 bits. I3C addresses go from 0x00 to 0x7F.`);
    if (addr === BROADCAST) throw new Error('0x7E is the broadcast address, so no single target can have it.');
    const read = p.rw === 'r';
    const present = p.present === 'yes';
    const header = p.header === 'yes';
    const bytes = parseBytes(p.data, p.format);

    const scl = new TraceBuilder('SCL', 1);
    const sda = new TraceBuilder('SDA', 1);
    const bits: Bit[] = [];
    const fields: Field[] = [];
    const notes: Note[] = [];

    sda.set(1, 0);
    scl.set(1.5, 0);
    bits.push({
      lane: 1, t0: 0.5, t1: 1.5, label: 'S', kind: 'start',
      info: 'START condition: SDA falls while SCL is high, exactly like I²C. Every device, I3C or legacy I²C, starts ' +
        'listening for an address.',
    });

    let t = 1.5;
    /** One bit. In open-drain mode a 1 is just "let go", so SDA rises slowly through the pull-up. */
    const slot = (v: 0 | 1, openDrain: boolean, label: string, kind: Kind, by: Driver, info: string) => {
      sda.set(t + 0.25, v, openDrain);
      scl.set(t + 0.5, 1);
      scl.set(t + 1, 0);
      bits.push({ lane: 1, t0: t, t1: t + 1, label, kind, by, sample: t + 0.5, info }); // latched on SCL's rising edge
      t += 1;
    };

    const addressByte = (a: number, r: boolean, info: string) => {
      const start = t;
      for (let i = 6; i >= 0; i--) {
        const v = ((a >> i) & 1) as 0 | 1;
        slot(v, true, `A${i}`, 'addr', 'controller', `Address bit ${i} = ${v}. ${info}`);
      }
      slot(r ? 1 : 0, true, r ? 'R' : 'W', 'rw', 'controller',
        `Read/write bit = ${r ? 1 : 0} (${r ? 'read' : 'write'}). Still open-drain, so a target could pull SDA low here ` +
        'to win arbitration and raise an in-band interrupt.');
      fields.push({ lane: 1, t0: start, t1: t, label: `${hex(a)} ${r ? 'R' : 'W'}`, kind: 'addr' });
    };

    const ack = (info: string) => {
      notes.push({ lane: 1, t: t + 0.25, text: present ? 'ACK, then push-pull: sharp edges' : 'nobody answers: NACK' });
      if (present) slot(0, true, 'ACK', 'ack', 'target', info);
      else {
        slot(1, true, 'NACK', 'nack', 'controller',
          `NACK: no target has the address ${hex(addr)}, so SDA stays high. The controller ends the transfer with STOP.`);
      }
    };

    notes.push({ lane: 1, t: t + 0.25, text: 'open-drain: slow rises, so devices can share SDA' });
    if (header) {
      addressByte(BROADCAST, false,
        'The controller sends the broadcast address 0x7E. Every I3C target listens to it, and because SDA is ' +
        'open-drain, a target that wants attention can pull a bit low and win arbitration with its own address.');
      slot(0, true, 'ACK', 'ack', 'target',
        'ACK to the broadcast: the targets pull SDA low together. Open-drain means several devices can do that at once.');
      sda.set(t + 0.25, 1, true);
      scl.set(t + 0.5, 1);
      sda.set(t + 1, 0);
      scl.set(t + 1.5, 0);
      bits.push({
        lane: 1, t0: t + 0.5, t1: t + 1.5, label: 'Sr', kind: 'start',
        info: 'Repeated START. The controller keeps the bus and now names the one target it wants.',
      });
      t += 1.5;
    }

    addressByte(addr, read,
      `The controller sends the target's dynamic address ${hex(addr)}, most significant bit first. The controller ` +
      'assigned this address at startup, which is why two identical sensors never collide.');
    ack(`ACK: the target at ${hex(addr)} pulls SDA low. After this bit the bus switches from open-drain to push-pull.`);

    if (present) {
      bytes.forEach((b, idx) => {
        const start = t;
        const sender: Driver = read ? 'target' : 'controller';
        for (let i = 7; i >= 0; i--) {
          const v = ((b >> i) & 1) as 0 | 1;
          slot(v, false, `${i}`, 'data', sender,
            `Data bit ${i} of ${hex(b)} = ${v}, driven push-pull by the ${sender}, most significant bit first. Both ` +
            'edges are driven, so the bit settles well before SCL rises, and the receiver latches it on that rising edge.');
        }
        fields.push({ lane: 1, t0: start, t1: t, label: `${hex(b)} ${printable(b)}`.trim(), kind: 'data' });

        if (idx === 0) notes.push({ lane: 1, t: t + 0.25, text: read ? 'T-bit: more data or end' : 'T-bit: parity instead of ACK' });
        if (read) {
          const more = idx < bytes.length - 1;
          slot(more ? 1 : 0, false, 'T', 'parity', 'target',
            more
              ? 'T-bit = 1: the target says it has more data. (The controller could still cut the read short here.)'
              : 'T-bit = 0: the target says this was the last byte, so the controller can send STOP. Unlike I²C, the ' +
                'target decides when a read ends.');
        } else {
          let ones = 0;
          for (let i = 0; i < 8; i++) ones += (b >> i) & 1;
          const v = (1 - (ones % 2)) as 0 | 1;
          slot(v, false, 'T', 'parity', 'controller',
            `T-bit = ${v}: odd parity. ${hex(b)} has ${ones} one-bit${ones === 1 ? '' : 's'}, and this bit makes the ` +
            'count of 1s odd. There is no ACK per data byte in I3C; the target checks parity instead.');
        }
      });
    }

    sda.set(t + 0.25, 0);
    scl.set(t + 0.5, 1);
    sda.set(t + 0.75, 1);
    notes.push({ lane: 1, t: t + 0.75, text: 'STOP' });
    bits.push({
      lane: 1, t0: t + 0.25, t1: t + 1.25, label: 'P', kind: 'stop',
      info: 'STOP condition: SDA rises while SCL is high, as in I²C. The bus is free again.',
    });

    return { traces: [scl.trace, sda.trace], bits, fields, notes, duration: t + 1.75, unitTime: 1 / 12.5e6 };
  },
};
