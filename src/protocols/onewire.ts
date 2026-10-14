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
  tags: ['asynchronous', 'single-ended', 'open-drain', 'half duplex', 'multi-drop', 'addressed', 'cable'],
  summary:
    'A bus that uses a single wire for data, and often for power as well. There is no clock: the controller begins ' +
    'every bit by pulling the line low, and the length of the low pulse determines the bit. A short pulse is a 1 and a ' +
    'long pulse is a 0. Every transaction begins with a reset pulse, to which devices respond with a presence pulse.',
  usedIn: 'DS18B20 temperature probes, iButton keys, and identification chips in battery packs, printer cartridges and laptop chargers.',
  facts: {
    clock: 'None. Each bit is a time slot that the controller begins with a falling edge, and devices time the rest of the slot from that edge.',
    wires: 'One data wire (DQ) plus ground. Devices can also draw their power from the data line, known as parasite power.',
    drive: 'Open-drain with a pull-up resistor, typically 4.7 kΩ. Any device can pull the line low; no device drives it high.',
    duplex: 'Half duplex: a single wire carrying data in one direction at a time.',
    topology: 'A shared bus: one controller and many devices on the same wire.',
    addressing: 'Every device has a unique 64-bit ROM ID programmed at the factory: an 8-bit family code, a 48-bit serial number and an 8-bit CRC. The Search ROM command discovers them.',
    flow: 'The controller begins every time slot, so it sets the pace. Devices respond only within slots that the controller opens.',
    errors: 'A CRC-8 protects the ROM ID and data such as the DS18B20 scratchpad. Individual bits are not checked.',
    speed: 'About 15 kbit/s at standard speed, and about 125 kbit/s in overdrive mode.',
    reach: 'Tens of meters with a simple pull-up resistor, and more with a stronger, actively switched pull-up.',
  },
  strengths: [
    'A single wire plus ground, even for power, which suits sensors at the end of long cables.',
    'Every device has a unique ID, so dozens of sensors can share one wire without any address configuration.',
    'Low-cost devices and minimal wiring.',
  ],
  limits: [
    'Slow: a single bit takes about 70 µs.',
    'Timing requirements are strict; a software implementation must keep interrupts disabled for the duration of each slot.',
    'Parasite-powered devices require a strong pull-up during operations such as temperature conversions.',
    'Largely a single-vendor ecosystem (Maxim, now part of Analog Devices).',
  ],
  legend: { start: 'reset', ack: 'presence', nack: 'no presence', cmd: 'command (written)', data: 'data (read)' },
  deepDive: [
    {
      title: 'The 64-bit ROM ID',
      body: [
        'Every 1-Wire device carries a factory-programmed 64-bit ID, transmitted least significant bit first: an 8-bit family code (0x28 for the DS18B20, 0x01 for the DS2401 serial number), a 48-bit serial number, and a CRC-8 over the first seven bytes (polynomial x⁸ + x⁵ + x⁴ + 1). The family code identifies the device type, and the CRC lets the controller verify that the ID was read correctly.',
      ],
    },
    {
      title: 'Search ROM: finding every device',
      body: [
        'The Search ROM command (0xF0) discovers all devices on the bus one ID at a time, as a binary tree search. For each bit position, every participating device transmits its ID bit and then the complement of that bit. Because the bus is wired-AND, the controller reads 0 then 1 if all devices have a 0, 1 then 0 if all have a 1, and 0 then 0 if both values are present.',
        'The controller then writes the bit value it chooses to follow, and devices whose ID differs drop out until the next search. After 64 bits exactly one ID has been read; repeating the search with different choices at each conflict enumerates the rest.',
      ],
    },
    {
      title: 'Parasite power',
      body: [
        'A device in parasite-power mode has no supply pin connected. It charges an internal capacitor from the data line while the line is high. Some operations, such as a DS18B20 temperature conversion, draw more current than the pull-up resistor can supply, so the controller must switch in a strong pull-up, typically a MOSFET to the supply rail, within about 10 µs of issuing the command and hold it for the duration of the conversion.',
      ],
    },
    {
      title: 'Reading a DS18B20',
      body: [
        'A typical temperature read is two transactions. The first is a reset, Skip ROM (0xCC) and Convert T (0x44), followed by a wait of up to 750 ms at 12-bit resolution. The second is a reset, Skip ROM and Read Scratchpad (0xBE), followed by nine bytes: the temperature (least significant byte first, in units of 1/16 °C), two alarm thresholds, a configuration byte, three reserved bytes and a CRC.',
        'The default read data on this page, 0x50 0x05, is 0x0550, or 85.0 °C. That is the DS18B20\'s power-on value, so a reading of exactly 85 °C usually means a conversion was never triggered or had not finished.',
      ],
    },
    {
      title: 'Overdrive speed',
      body: [
        'Many devices support overdrive, with timing roughly ten times shorter: for example, a reset low time of about 48 µs instead of 480 µs. The controller switches a device into overdrive with the Overdrive Skip ROM (0x3C) or Overdrive Match ROM (0x69) command.',
      ],
    },
    {
      title: 'Long cables',
      body: [
        '1-Wire can run tens to hundreds of meters, but cable capacitance slows each rise through the pull-up, and branches cause reflections. Linear topologies with short stubs work best. For long networks, bridge chips such as the DS2482 replace the simple resistor with an actively controlled pull-up and precise slot timing.',
      ],
    },
  ],
  params: [
    { key: 'write', label: 'Write', help: 'The command bytes the controller writes after the reset, in hexadecimal. The default, CC BE, is Skip ROM followed by Read Scratchpad.', type: 'text', default: 'CC BE', placeholder: 'CC BE (hex)' },
    { key: 'read', label: 'Then read', help: 'The bytes the device returns in read time slots, in hexadecimal. Leave empty for a write-only transaction.', type: 'text', default: '50 05', placeholder: '50 05 (hex, or empty)' },
    {
      key: 'present', label: 'Device', help: 'Whether a device answers the reset with a presence pulse. Missing shows what the controller sees on an empty bus.', type: 'select', default: 'yes',
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
      info: 'Reset pulse: the controller holds the line low for at least 480 µs, considerably longer than any bit. Every ' +
        'device on the wire abandons its current operation and prepares for a new command.',
    });
    const release = t + RESET_LOW * US;
    if (present) {
      const p0 = release + PRESENCE_WAIT * US;
      dq.set(p0, 0);
      dq.set(p0 + PRESENCE_LOW * US, 1);
      notes.push({ lane: 0, t: p0, text: 'presence: a device pulls the line low' });
      bits.push({
        lane: 0, t0: p0, t1: p0 + PRESENCE_LOW * US, label: 'Presence', kind: 'ack', by: 'target', sample: release + 7,
        info: 'Presence pulse: about 30 µs after the reset ends, every device pulls the line low for 60 to 240 µs. The ' +
          'controller samples the line 70 µs after releasing it; a low level indicates that at least one device is present.',
      });
    } else {
      bits.push({
        lane: 0, t0: release + PRESENCE_WAIT * US, t1: release + (PRESENCE_WAIT + PRESENCE_LOW) * US, label: 'None',
        kind: 'nack', sample: release + 7,
        info: 'No presence pulse: the line remains high when the controller samples it 70 µs after the reset, so no device ' +
          'is present, or none is powered. The transaction ends here.',
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
          info: `${info} It is written as a ${v ? 'short (6 µs)' : 'long (60 µs)'} low pulse. The device samples the line about ` +
            '30 µs into the slot: a low level is read as 0, and a high level as 1.',
        });
      } else {
        dq.set(t + 6 * US, 1);
        if (!v) {
          dq.set(t + 6 * US, 0);
          dq.set(t + 30 * US, 1);
        }
        bits.push({
          lane: 0, t0: t, t1: t + SLOT * US, label, kind, by: 'target', sample: t + 1.5,
          info: `${info} The controller pulls the line low briefly to begin the slot, then releases it. ${v
            ? 'The device leaves the line released, so it returns high: a 1.'
            : 'The device continues to hold the line low for about 30 µs: a 0.'} The controller samples the line 15 µs into the slot.`,
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
        if (n === 0) notes.push({ lane: 0, t, text: 'read slots: the device responds' });
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
