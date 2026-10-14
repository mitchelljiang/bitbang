import type { Bit, Field, Note, Protocol } from '../core/types';
import { TraceBuilder, hex, parseBytes } from '../core/util';

/** Standard-speed timings in µs. One diagram unit is 10 µs. */
const US = 0.1;
const SLOT = 70;
const RESET_LOW = 480;
/** Reset low time plus recovery. The spec's minimum recovery is 480 µs; real controllers leave some margin. */
const RESET_SLOT = RESET_LOW + 500;
const PRESENCE_WAIT = 30;
const PRESENCE_LOW = 120;

const COMMANDS: Record<number, string> = {
  0x33: 'Read ROM', 0x55: 'Match ROM', 0xcc: 'Skip ROM', 0xf0: 'Search ROM', 0xec: 'Alarm Search',
  0x44: 'Convert T', 0xbe: 'Read Scratchpad', 0x4e: 'Write Scratchpad', 0x48: 'Copy Scratchpad', 0xb4: 'Read Power Supply',
};

export const onewire: Protocol = {
  id: 'onewire',
  name: '1-Wire',
  fullName: 'Dallas/Maxim single-wire bus',
  summary:
    'One wire for data, and often for power too. There is no clock: the controller starts every bit by pulling the ' +
    'line low, and how long it stays low is the bit. A short pulse is a 1 and a long one is a 0. Every transaction ' +
    'starts with a reset pulse, which devices answer with a presence pulse.',
  usedIn: 'DS18B20 temperature probes, iButton keys, ID chips in battery packs, printer cartridges and laptop chargers.',
  facts: {
    clock: 'None. Each bit is a time slot the controller starts with a falling edge, and devices time the rest from that edge.',
    wires: 'One data wire (DQ) plus ground. Devices can even run on "parasite power" stolen from the data line.',
    drive: 'Open-drain with a pull-up resistor, typically 4.7 kΩ. Anyone can pull the line low; nobody drives it high.',
    duplex: 'Half duplex. One wire, one direction at a time.',
    topology: 'Multi-drop bus: one controller and many devices on the same wire.',
    addressing: 'Every chip has a unique 64-bit ROM ID burned in at the factory: an 8-bit family code, a 48-bit serial number and an 8-bit CRC. A Search ROM command discovers them.',
    flow: 'The controller starts every slot, so it sets the pace. Devices only answer within slots it opens.',
    errors: 'CRC-8 on the ROM ID and on data like the DS18B20\'s scratchpad. Nothing per bit.',
    speed: 'About 15 kbit/s at standard speed, and about 125 kbit/s in overdrive mode.',
    reach: 'Tens of meters with a plain pull-up, and more with a stronger, actively switched pull-up.',
  },
  strengths: [
    'A single wire plus ground, even for power, which makes it ideal for probes on long cables.',
    'Every device has a unique ID, so you can put dozens of sensors on one wire with no address setup.',
    'Cheap parts and very simple wiring.',
  ],
  limits: [
    'Slow: a single bit takes about 70 µs.',
    'Timing is tight. Bit-banging it means keeping interrupts off for the length of each slot.',
    'Parasite-powered devices need a strong pull-up during operations like temperature conversions.',
    'Mostly a single-vendor ecosystem (Maxim, now Analog Devices).',
  ],
  legend: { start: 'reset', ack: 'presence', nack: 'no presence', cmd: 'command (written)', data: 'data (read)' },
  params: [
    { key: 'write', label: 'Write', type: 'text', default: 'CC BE', placeholder: 'CC BE (hex)' },
    { key: 'read', label: 'Then read', type: 'text', default: '50 05', placeholder: '50 05 (hex, or empty)' },
    {
      key: 'present', label: 'Device', type: 'select', default: 'yes',
      options: [{ value: 'yes', label: 'Present' }, { value: 'no', label: 'Missing' }],
    },
  ],

  encode(p) {
    const writes = parseBytes(p.write, 'hex');
    const reads = p.read.trim() ? parseBytes(p.read, 'hex') : [];
    const present = p.present === 'yes';

    const dq = new TraceBuilder('DQ', 1, true);
    const bits: Bit[] = [];
    const fields: Field[] = [];
    const notes: Note[] = [];

    // Reset and presence.
    let t = 1;
    dq.set(t, 0);
    dq.set(t + RESET_LOW * US, 1);
    notes.push({ lane: 0, t, text: 'reset: held low for 480 µs' });
    bits.push({
      lane: 0, t0: t, t1: t + RESET_LOW * US, label: 'Reset', kind: 'start', by: 'controller',
      info: 'Reset pulse: the controller holds the line low for at least 480 µs, much longer than any bit. Every device ' +
        'on the wire stops what it was doing and gets ready for a new command.',
    });
    const release = t + RESET_LOW * US;
    if (present) {
      const p0 = release + PRESENCE_WAIT * US;
      dq.set(p0, 0);
      dq.set(p0 + PRESENCE_LOW * US, 1);
      notes.push({ lane: 0, t: p0, text: 'presence: a device pulls low' });
      bits.push({
        lane: 0, t0: p0, t1: p0 + PRESENCE_LOW * US, label: 'Presence', kind: 'ack', by: 'target', sample: release + 7,
        info: 'Presence pulse: about 30 µs after the reset ends, every device pulls the line low for 60 to 240 µs. The ' +
          'controller checks the line 70 µs after releasing it. Low means at least one device is there.',
      });
    } else {
      bits.push({
        lane: 0, t0: release + PRESENCE_WAIT * US, t1: release + (PRESENCE_WAIT + PRESENCE_LOW) * US, label: 'None',
        kind: 'nack', sample: release + 7,
        info: 'No presence pulse: the line stays high when the controller checks it 70 µs after the reset, so there is ' +
          'no device on the wire (or it isn\'t powered). The controller stops here.',
      });
    }
    t += RESET_SLOT * US;

    const slot = (v: 0 | 1, read: boolean, label: string, kind: 'cmd' | 'data', info: string) => {
      // The controller always opens the slot with a falling edge.
      dq.set(t, 0);
      if (!read) {
        dq.set(t + (v ? 6 : 60) * US, 1);
        bits.push({
          lane: 0, t0: t, t1: t + SLOT * US, label, kind, by: 'controller', sample: t + 3,
          info: `${info} Written as a ${v ? 'short (6 µs)' : 'long (60 µs)'} low pulse. The device looks at the line about ` +
            '30 µs into the slot: still low means 0, back high means 1.',
        });
      } else {
        dq.set(t + 6 * US, 1);
        if (!v) {
          dq.set(t + 6 * US, 0);
          dq.set(t + 30 * US, 1);
        }
        bits.push({
          lane: 0, t0: t, t1: t + SLOT * US, label, kind, by: 'target', sample: t + 1.5,
          info: `${info} The controller pulls low for a moment to start the slot, then lets go. ${v
            ? 'The device leaves the line alone, so it floats back high: a 1.'
            : 'The device keeps holding it low for about 30 µs: a 0.'} The controller reads the line 15 µs into the slot.`,
        });
      }
      t += SLOT * US;
    };

    const explained = new Set<number>();
    if (present) {
      for (const b of writes) {
        const start = t;
        for (let i = 0; i < 8; i++) {
          const v = ((b >> i) & 1) as 0 | 1;
          if (!explained.has(v)) notes.push({ lane: 0, t, text: v ? 'write 1: short pulse' : 'write 0: long pulse' });
          explained.add(v);
          slot(v, false, `${i}`, 'cmd', `Bit ${i} of ${hex(b)} = ${v}, least significant bit first.`);
        }
        fields.push({ lane: 0, t0: start, t1: t, label: `${hex(b)} ${COMMANDS[b] ?? ''}`.trim(), kind: 'cmd' });
      }
      reads.forEach((b, n) => {
        const start = t;
        if (n === 0) notes.push({ lane: 0, t, text: 'read slots: the device answers' });
        for (let i = 0; i < 8; i++) {
          const v = ((b >> i) & 1) as 0 | 1;
          slot(v, true, `${i}`, 'data', `Read bit ${i} of ${hex(b)} = ${v}.`);
        }
        fields.push({ lane: 0, t0: start, t1: t, label: hex(b), kind: 'data' });
      });
    }

    return { traces: [dq.trace], bits, fields, notes, duration: t + 2, unitTime: 1e-5, minPpu: 5 };
  },
};
