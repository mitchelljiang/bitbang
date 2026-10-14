import type { Bit, Driver, Field, Kind, Note, Protocol } from '../core/types';
import { TraceBuilder, hex, parseBytes, printable } from '../core/util';

const BROADCAST = 0x7e;
const ENTHDR0 = 0x20;
const ENTDAA = 0x07;
/** Bus Characteristics Register sent during ENTDAA: 0x06 = can raise in-band interrupts, with a data byte. */
const BCR = 0x06;
/** Device Characteristics Register: 0x00 = generic device. */
const DCR = 0x00;

/** HDR-DDR word parity: P1 covers the odd payload bits, P0 the even ones, inverted. */
function ddrParity(word: number): [0 | 1, 0 | 1] {
  let p1 = 0;
  let p0 = 1;
  for (let i = 0; i < 16; i++) {
    if (i % 2) p1 ^= (word >> i) & 1;
    else p0 ^= (word >> i) & 1;
  }
  return [p1 as 0 | 1, p0 as 0 | 1];
}

/** CRC-5 (x⁵ + x² + 1, starting from 0x1F) over the data words, most significant bit first. */
function crc5(words: number[]) {
  let crc = 0x1f;
  for (const w of words) {
    for (let i = 15; i >= 0; i--) {
      const fb = ((crc >> 4) & 1) ^ ((w >> i) & 1);
      crc = (crc << 1) & 0x1f;
      if (fb) crc ^= 0x05;
    }
  }
  return crc;
}

export const i3c: Protocol = {
  id: 'i3c',
  name: 'I3C',
  fullName: 'Improved Inter-Integrated Circuit',
  summary:
    'I²C\'s successor, on the same two wires. The controller drives SCL push-pull at up to 12.5 MHz. Each transfer ' +
    'starts in open-drain mode so devices can arbitrate and acknowledge, then switches to push-pull for the data. ' +
    'Data bytes end with a parity bit instead of an ACK. In HDR-DDR mode, data moves on both clock edges.',
  usedIn: 'Newer phone and wearable sensors, sensor hubs, and the sideband bus on DDR5 memory modules (JEDEC uses I3C Basic).',
  facts: {
    clock: 'Synchronous. The controller drives SCL push-pull, up to 12.5 MHz. Targets can\'t stretch the clock.',
    wires: 'SCL and SDA, plus ground, shared by every device, as in I²C.',
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
  deepDive: [
    {
      title: 'Dynamic addressing',
      body: [
        'I²C addresses are fixed in silicon, or set by one or two pins, so two identical sensors often can\'t share a bus. ' +
        'An I3C device instead ships with a unique 48-bit Provisioned ID, and the controller hands each device a short ' +
        '7-bit dynamic address when the bus starts up.',
        'The controller picks the numbers, and that matters: lower addresses win arbitration, so giving a device a low ' +
        'address gives its interrupts higher priority.',
      ],
    },
    {
      title: 'ENTDAA: how the addresses are handed out',
      body: [
        'The controller broadcasts the ENTDAA command (0x07). Then it repeats one question: a repeated START and 0x7E ' +
        'with R, requesting a response from the next device without an address. Every device still waiting ACKs and starts sending ' +
        'its 48-bit ID, then its BCR and DCR, most significant bit first, all in open-drain.',
        'On an open-drain wire a 0 always wins. A device that transmits a 1 but reads back a 0 has lost arbitration and stops transmitting. ' +
        'After 64 bits exactly one device is left, the one with the lowest ID. The controller sends it a 7-bit address ' +
        'plus an odd parity bit, it ACKs, and it sits out the rest. When the question gets no ACK, every device has an ' +
        'address. Set Transfer to ENTDAA above to step through one round.',
      ],
    },
    {
      title: 'BCR and DCR',
      body: [
        'The two bytes after the ID describe the device. The Bus Characteristics Register (BCR) says whether it can ' +
        'raise interrupts and whether a data byte follows them, whether it has speed limits, whether it supports HDR ' +
        'modes, and whether it can act as a controller. The Device Characteristics Register (DCR) is a type code ' +
        'from a MIPI-maintained list, so software can tell an accelerometer from a gyroscope without asking.',
      ],
    },
    {
      title: 'In-band interrupts',
      body: [
        'An I²C sensor usually needs its own interrupt pin. An I3C target instead pulls SDA low while the bus is idle. ' +
        'The controller responds by clocking an address phase, and the target puts its own address on the wire with R. ' +
        'If several targets do this at once, the open-drain arbitration lets the lowest address through. The controller ' +
        'ACKs to accept the interrupt, or NACKs to say "not now", and may read a data byte describing the event.',
      ],
    },
    {
      title: 'Hot-Join',
      body: [
        'A device that powers up after the bus is already running can announce itself by sending the reserved address ' +
        '0x02 with W during an arbitration. The controller then runs ENTDAA again to give it an address, without ' +
        'disturbing the devices that already have one.',
      ],
    },
    {
      title: 'Common Command Codes (CCCs)',
      body: [
        'Bus management happens through commands sent to 0x7E. Codes 0x00 to 0x7F are broadcast to every target; ' +
        'codes 0x80 to 0xFE are direct, followed by a repeated START and one target\'s address.',
        'Some useful ones: ENEC and DISEC turn interrupts and Hot-Join on and off, RSTDAA makes every device forget its ' +
        'dynamic address, SETDASA turns a known static address into a dynamic one without running ENTDAA, SETMWL and ' +
        'SETMRL set the longest allowed write and read, GETPID, GETBCR, GETDCR and GETSTATUS read a device\'s identity ' +
        'and state, and ENTHDR0 to ENTHDR7 (0x20 to 0x27) switch into the HDR modes.',
      ],
    },
    {
      title: 'Sharing a bus with I²C',
      body: [
        'Legacy I²C targets can stay on an I3C bus as long as they have the 50 ns spike filter that Fast-mode I²C ' +
        'requires. I3C keeps its SCL high pulses short enough that the filter hides them, so an I²C device never ' +
        'mistakes I3C traffic for a START or for data addressed to it. The I²C devices keep their static addresses, ' +
        'and the controller talks to them at I²C speeds.',
      ],
    },
    {
      title: 'Even faster: the HDR modes',
      body: [
        'HDR-DDR, shown above, puts a bit on both clock edges. The ternary modes, HDR-TSP and HDR-TSL, go further: ' +
        'they encode data in the combined transitions of SCL and SDA, so both wires carry information (TSL is the ' +
        'variant that tolerates I²C devices on the bus). HDR-BT, bulk transport, can add extra data lanes. Every HDR ' +
        'mode is entered with an ENTHDR command and left with the HDR exit pattern.',
      ],
    },
    {
      title: 'Handing over control',
      body: [
        'A bus can have more than one device able to act as controller. A secondary controller asks for the bus with ' +
        'a request that works like an in-band interrupt, and the active controller hands over with a command ' +
        '(GETACCCR). This lets, say, a sensor hub run the bus while the main processor sleeps.',
      ],
    },
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
    {
      key: 'rate', label: 'Transfer', type: 'select', default: 'sdr',
      options: [
        { value: 'sdr', label: 'Private transfer, SDR' },
        { value: 'ddr', label: 'Private transfer, HDR-DDR' },
        { value: 'entdaa', label: 'ENTDAA: assign the address' },
      ],
    },
    { key: 'pid', label: 'Provisioned ID (ENTDAA)', type: 'text', default: '1A2B3C4D5E6F', placeholder: '1A2B3C4D5E6F (48-bit hex)' },
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
    const ddr = p.rate === 'ddr';
    const entdaa = p.rate === 'entdaa';
    const pidText = p.pid.trim().replace(/^0x/i, '');
    if (entdaa && !/^[0-9a-f]{1,12}$/i.test(pidText)) throw new Error('The provisioned ID should be up to 12 hex digits (48 bits).');
    const pid = entdaa ? BigInt('0x' + pidText) : 0n;
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

    /** HDR-DDR: the clock keeps its speed, but SDA carries a bit on every edge, rising and falling. */
    const hdrDdr = () => {
      let level: 0 | 1 = 0;
      const bit = (v: 0 | 1, label: string, kind: Kind, info: string) => {
        sda.set(t, v);
        level = level ? 0 : 1;
        scl.set(t + 0.25, level);
        bits.push({
          lane: 1, t0: t, t1: t + 0.5, label, kind, by: 'controller', sample: t + 0.25,
          info: `${info} Sampled on the ${level ? 'rising' : 'falling'} edge of SCL: in HDR-DDR both edges carry a bit.`,
        });
        t += 0.5;
      };
      const word = (pre: [0 | 1, 0 | 1], payload: number, label: string, kind: (i: number) => Kind, what: (i: number, v: number) => string) => {
        const start = t;
        bit(pre[0], 'p', 'start', `Preamble bit 1 = ${pre[0]}.`);
        bit(pre[1], 'p', 'start', `Preamble bit 0 = ${pre[1]}. The two preamble bits say what kind of word follows.`);
        for (let i = 15; i >= 0; i--) {
          const v = ((payload >> i) & 1) as 0 | 1;
          bit(v, `${i}`, kind(i), what(i, v));
        }
        const [p1, p0] = ddrParity(payload);
        bit(p1, 'P1', 'parity', `Parity bit P1 = ${p1}, covering payload bits 15, 13, … 1.`);
        bit(p0, 'P0', 'parity', `Parity bit P0 = ${p0}, covering payload bits 14, 12, … 0, inverted.`);
        fields.push({ lane: 1, t0: start, t1: t, label, kind: kind(15) });
      };

      notes.push({ lane: 1, t, text: 'HDR-DDR: a bit on every clock edge' });
      const command = (0 << 15) | (0x00 << 8) | (addr << 1);
      word([0, 1], command, `Command, write to ${hex(addr)}`,
        (i) => (i === 15 ? 'rw' : i >= 8 ? 'cmd' : i >= 1 ? 'addr' : 'parity'),
        (i, v) => i === 15
          ? `Command word bit 15 = ${v}: 0 means write. The command word starts with preamble 01.`
          : i >= 8
            ? `Command code bit ${i - 8} = ${v}. The 7-bit command code is defined by the target; 0x00 is used here.`
            : i >= 1
              ? `Target address bit ${i - 1} = ${v}. Bits 7 to 1 carry the dynamic address ${hex(addr)}.`
              : `Bit 0 = ${v}: reserved, sent as 0 here.`);

      const words: number[] = [];
      for (let i = 0; i < bytes.length; i += 2) words.push((bytes[i] << 8) | (bytes[i + 1] ?? 0));
      words.forEach((w, n) =>
        word([1, 1], w, `${hex(w >> 8)} ${hex(w & 0xff)}`, () => 'data',
          (i, v) => `Data word ${n + 1}, bit ${i} = ${v}. HDR-DDR moves data in 16-bit words, two bytes at a time` +
            `${bytes.length % 2 && n === words.length - 1 ? ' (the odd last byte is padded with 0x00)' : ''}.`));

      const crc = crc5(words);
      const crcStart = t;
      bit(0, 'p', 'start', 'Preamble bit 1 = 0. A 0 here means this is not another data word.');
      bit(1, 'p', 'start', 'Preamble bit 0 = 1.');
      for (let i = 3; i >= 0; i--) {
        const v = ((0xc >> i) & 1) as 0 | 1;
        bit(v, `${i}`, 'stop', `Token bit ${i} = ${v}. The token 0xC marks this as the CRC word.`);
      }
      for (let i = 4; i >= 0; i--) {
        const v = ((crc >> i) & 1) as 0 | 1;
        bit(v, `${i}`, 'parity', `CRC-5 bit ${i} = ${v}. The CRC covers all the data words, so the target can check the whole message.`);
      }
      fields.push({ lane: 1, t0: crcStart, t1: t, label: `CRC 0x${crc.toString(16).toUpperCase().padStart(2, '0')}`, kind: 'parity' });

      // Exit pattern: SCL held low while SDA toggles, which can never happen during HDR-DDR data.
      if (level) {
        scl.set(t + 0.25, 0);
        t += 0.5;
      }
      const exitStart = t;
      notes.push({ lane: 1, t: t + 0.1, text: 'exit: SDA toggles while SCL is low' });
      for (let k = 0; k < 4; k++) {
        sda.set(t + 0.1 + k * 0.4, 1);
        sda.set(t + 0.3 + k * 0.4, 0);
      }
      t += 1.7;
      bits.push({
        lane: 1, t0: exitStart, t1: t, label: 'Exit', kind: 'stop',
        info: 'HDR exit pattern: the controller holds SCL low and toggles SDA, with four falling edges. Data never changes ' +
          'like this in HDR-DDR, so every target recognizes it and goes back to SDR mode. A STOP follows.',
      });
    };

    const ack = (info: string) => {
      notes.push({ lane: 1, t: t + 0.25, text: present ? 'ACK, then push-pull: sharp edges' : 'no response: NACK' });
      if (present) slot(0, true, 'ACK', 'ack', 'target', info);
      else {
        slot(1, true, 'NACK', 'nack', 'controller',
          `NACK: no target has the address ${hex(addr)}, so SDA stays high. The controller ends the transfer with STOP.`);
      }
    };

    /** Repeated START: release SDA while SCL is low, raise SCL, then pull SDA low again while SCL is high. */
    const repeatedStart = (info: string) => {
      sda.set(t + 0.25, 1, true);
      scl.set(t + 0.5, 1);
      sda.set(t + 1, 0);
      scl.set(t + 1.5, 0);
      bits.push({ lane: 1, t0: t + 0.5, t1: t + 1.5, label: 'Sr', kind: 'start', info });
      t += 1.5;
    };

    if (entdaa) {
      notes.push({ lane: 1, t: t + 0.25, text: 'ENTDAA stays open-drain, so targets can arbitrate' });
      addressByte(BROADCAST, false, 'Every I3C command starts with the broadcast address 0x7E.');
      slot(0, true, 'ACK', 'ack', 'target', 'ACK to the broadcast: every target pulls SDA low together.');
      const cccStart = t;
      for (let i = 7; i >= 0; i--) {
        const v = ((ENTDAA >> i) & 1) as 0 | 1;
        slot(v, false, `${i}`, 'cmd', 'controller',
          `Command bit ${i} = ${v}. The broadcast command code ${hex(ENTDAA)} is ENTDAA, "enter dynamic address ` +
          'assignment". Every target that doesn\'t have a dynamic address yet gets ready to take part.');
      }
      slot(0, false, 'T', 'parity', 'controller', `T-bit = 0: odd parity. ${hex(ENTDAA)} already has three 1-bits.`);
      fields.push({ lane: 1, t0: cccStart, t1: t - 1, label: `${hex(ENTDAA)} ENTDAA`, kind: 'cmd' });

      const ask = (first: boolean) => {
        repeatedStart(first
          ? 'Repeated START. Now the controller asks, over and over, until nobody answers.'
          : 'Repeated START: the controller asks again, in case more targets are waiting.');
        addressByte(BROADCAST, true,
          'The controller sends 0x7E with R. During ENTDAA this means "next target without an address, send your ID."');
      };
      ask(true);
      if (!present) {
        notes.push({ lane: 1, t: t + 0.25, text: 'no target without an address: NACK' });
        slot(1, true, 'NACK', 'nack', 'controller', 'NACK: no target is waiting for an address, so ENTDAA is over.');
      } else {
        slot(0, true, 'ACK', 'ack', 'target', 'ACK: at least one target still needs an address.');
        const id = (pid << 16n) | BigInt((BCR << 8) | DCR);
        const idStart = t;
        notes.push({ lane: 1, t: t + 0.25, text: '48-bit ID, BCR, DCR: the lowest ID wins' });
        for (let i = 63; i >= 0; i--) {
          const v = Number((id >> BigInt(i)) & 1n) as 0 | 1;
          const where = i >= 16 ? `Provisioned ID bit ${i - 16}` : i >= 8 ? `BCR bit ${i - 8}` : `DCR bit ${i}`;
          slot(v, true, i >= 16 ? `${i - 16}` : i >= 8 ? `B${i - 8}` : `D${i}`, 'data', 'target',
            `${where} = ${v}. The target sends its 64-bit identity most significant bit first, in open-drain. If another ` +
            'target sends a 0 while this one sends a 1, the wire reads 0, this target sees it lost, and it drops out ' +
            'until the next round. So the lowest ID always wins, with no collision.');
        }
        fields.push({ lane: 1, t0: idStart, t1: idStart + 48, label: `PID 0x${pidText.toUpperCase().padStart(12, '0')}`, kind: 'data' });
        fields.push({ lane: 1, t0: idStart + 48, t1: idStart + 56, label: `BCR ${hex(BCR)}`, kind: 'data' });
        fields.push({ lane: 1, t0: idStart + 56, t1: idStart + 64, label: `DCR ${hex(DCR)}`, kind: 'data' });

        const daStart = t;
        notes.push({ lane: 1, t: t + 0.25, text: `controller assigns ${hex(addr)}` });
        let ones = 0;
        for (let i = 6; i >= 0; i--) {
          const v = ((addr >> i) & 1) as 0 | 1;
          ones += v;
          slot(v, true, `A${i}`, 'addr', 'controller',
            `New dynamic address bit ${i} = ${v}. The controller gives the winning target the address ${hex(addr)}. ` +
            'It chooses the numbers itself, so it can give important devices low addresses, which win interrupt arbitration.');
        }
        const par = (1 - (ones % 2)) as 0 | 1;
        slot(par, true, 'P', 'parity', 'controller', `Parity = ${par}: odd parity over the 7 address bits.`);
        fields.push({ lane: 1, t0: daStart, t1: t, label: `Assign ${hex(addr)}`, kind: 'addr' });
        slot(0, true, 'ACK', 'ack', 'target',
          `ACK: the target accepts ${hex(addr)} as its dynamic address and sits out the rest of ENTDAA.`);

        ask(false);
        notes.push({ lane: 1, t: t + 0.25, text: 'all targets addressed: NACK' });
        slot(1, true, 'NACK', 'nack', 'controller',
          'NACK: every target has an address now, so no device pulls SDA low. The controller ends ENTDAA with STOP.');
      }
    } else if (ddr) {
      if (read) throw new Error('The HDR-DDR diagram only covers writes so far. Set Direction to Write.');
      notes.push({ lane: 1, t: t + 0.25, text: 'open-drain: slow rises, so devices can share SDA' });
      addressByte(BROADCAST, false,
        'HDR mode is entered with a broadcast command, so the frame starts with the broadcast address 0x7E.');
      slot(0, true, 'ACK', 'ack', 'target', 'ACK to the broadcast: the targets pull SDA low together.');
      const cccStart = t;
      notes.push({ lane: 1, t: t + 0.25, text: 'ENTHDR0: switch to HDR-DDR' });
      for (let i = 7; i >= 0; i--) {
        const v = ((ENTHDR0 >> i) & 1) as 0 | 1;
        slot(v, false, `${i}`, 'cmd', 'controller',
          `Command bit ${i} = ${v}. The broadcast command code ${hex(ENTHDR0)} is ENTHDR0, "enter HDR mode 0", which is ` +
          'HDR-DDR. After this byte every I3C target switches to double data rate.');
      }
      slot(1, false, 'T', 'parity', 'controller', `T-bit = 1: odd parity for ${hex(ENTHDR0)}, which has one 1-bit.`);
      fields.push({ lane: 1, t0: cccStart, t1: t - 1, label: `${hex(ENTHDR0)} ENTHDR0`, kind: 'cmd' });
      hdrDdr();
    } else {
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
