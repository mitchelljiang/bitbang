import type { Bit, Field, Kind, Level, Note, Protocol } from '../core/types';
import { TraceBuilder, hex, parseBytes } from '../core/util';

/** CRC-15 of a bit sequence, polynomial 0x4599, starting from zero (CAN 2.0 part A, section 3.1.1). */
export function crc15(bits: number[]) {
  let crc = 0;
  for (const b of bits) {
    const top = ((crc >> 14) & 1) ^ b;
    crc = (crc << 1) & 0x7fff;
    if (top) crc ^= 0x4599;
  }
  return crc;
}

interface Raw { v: 0 | 1; label: string; kind: Kind; info: string; field: string }

const msb = (value: number, n: number) => Array.from({ length: n }, (_, i) => (Math.floor(value / 2 ** (n - 1 - i)) & 1) as 0 | 1);
const parseId = (s: string, max: number, what: string) => {
  const t = s.trim().replace(/^0x/i, '');
  if (!/^[0-9a-f]+$/i.test(t) || parseInt(t, 16) > max) throw new Error(`${what} must be hex, up to ${max.toString(16).toUpperCase()}`);
  return parseInt(t, 16);
};

/** The bits from start of frame to the end of the CRC sequence, before stuffing. */
function protectedBits(id: number, ext: boolean, remote: boolean, data: number[]) {
  const out: Raw[] = [];
  const add = (v: 0 | 1, label: string, kind: Kind, info: string, field: string) => out.push({ v, label, kind, info, field });
  add(0, 'SOF', 'start', 'Start of frame, always dominant. Every node synchronizes to this falling edge, so all of them start arbitrating together.', 'SOF');
  const base = ext ? Math.floor(id / 2 ** 18) : id;
  const idInfo = (i: number, v: number) => `Identifier bit ${i} = ${v}. A 0 is dominant, so at the first bit where two nodes differ, the node sending 1 sees the bus disagree and stops. The lowest identifier wins.`;
  msb(base, 11).forEach((v, k) => add(v, `ID${10 - k}`, 'addr', idInfo(10 - k, v), 'ID'));
  if (ext) {
    add(1, 'SRR', 'rw', 'Substitute remote request, always recessive. It sits where a standard frame has its RTR bit, so a standard frame beats an extended one with the same first 11 bits.', 'ID');
    add(1, 'IDE', 'cmd', 'Identifier extension, recessive: 18 more identifier bits follow.', 'ID');
    msb(id % 2 ** 18, 18).forEach((v, k) => add(v, `E${17 - k}`, 'addr', `Extended identifier bit ${17 - k} = ${v}.`, 'ID'));
    add(remote ? 1 : 0, 'RTR', 'rw', remote ? 'Remote transmission request, recessive: this frame asks for data and carries none.' : 'Remote transmission request, dominant: this is a data frame.', 'ID');
    add(0, 'r1', 'dummy', 'Reserved bit, sent dominant.', 'Control');
    add(0, 'r0', 'dummy', 'Reserved bit, sent dominant.', 'Control');
  } else {
    add(remote ? 1 : 0, 'RTR', 'rw', remote ? 'Remote transmission request, recessive: this frame asks for data and carries none. A data frame with the same identifier wins arbitration here.' : 'Remote transmission request, dominant: this is a data frame.', 'ID');
    add(0, 'IDE', 'cmd', 'Identifier extension, dominant: this is a standard frame with an 11-bit identifier.', 'Control');
    add(0, 'r0', 'dummy', 'Reserved bit, sent dominant.', 'Control');
  }
  msb(data.length, 4).forEach((v, k) => add(v, `DLC${3 - k}`, 'cmd', `Data length code bit ${3 - k} = ${v}. The code says ${data.length} data byte${data.length === 1 ? '' : 's'}.`, 'Control'));
  if (!remote) data.forEach((byte, n) => msb(byte, 8).forEach((v, k) => add(v, `D${7 - k}`, 'data', `Bit ${7 - k} of byte ${n} (${hex(byte)}) = ${v}, most significant bit first.`, `byte ${n}`)));
  const crc = crc15(out.map((b) => b.v));
  msb(crc, 15).forEach((v, k) => add(v, `C${14 - k}`, 'parity', `CRC bit ${14 - k} = ${v}. The 15-bit CRC covers everything from start of frame to the end of the data, before stuffing.`, 'CRC'));
  return { bits: out, crc };
}

/** Inserts the opposite bit after any five equal bits. A stuff bit counts as the first of the next run. */
export function stuff<T extends { v: 0 | 1 }>(input: T[], makeStuff: (v: 0 | 1) => T) {
  const out: T[] = [];
  let run = 0, last: 0 | 1 | undefined;
  const push = (b: T) => {
    run = b.v === last ? run + 1 : 1;
    last = b.v;
    out.push(b);
  };
  for (const b of input) {
    push(b);
    if (run === 5) push(makeStuff((1 - b.v) as 0 | 1));
  }
  return out;
}

const stuffBit = (v: 0 | 1): Raw => ({
  v, label: 'stuff', kind: 'dummy', field: '',
  info: `Stuff bit = ${v}. After five equal bits the transmitter inserts one opposite bit, and every receiver removes it. It guarantees edges for the nodes to resynchronize on, because CAN has no clock wire.`,
});

export const can: Protocol = {
  id: 'can',
  name: 'CAN',
  fullName: 'Controller Area Network',
  tags: ['asynchronous', 'differential', 'half duplex', 'multi-drop', 'cable'],
  summary:
    'A two-wire differential bus where any node may start sending when the bus is idle. A dominant 0 overrides a recessive 1, ' +
    'so nodes that start together compare their identifiers bit by bit as they send, and the lowest identifier wins without losing a single bit. ' +
    'Frames name their contents, not a destination, and every node checks every frame.',
  usedIn: 'Vehicles (engine, brakes and body electronics, through OBD-II), industrial automation (CANopen, DeviceNet), robots, e-bikes and medical equipment.',
  facts: {
    clock: 'None. Nodes share a configured bit rate and resynchronize on recessive-to-dominant edges, which bit stuffing guarantees.',
    wires: 'CANH and CANL as a twisted pair, usually with a ground reference.',
    drive: 'Differential. Dominant drives CANH to about 3.5 V and CANL to about 1.5 V. Recessive drives neither, and termination pulls both to about 2.5 V.',
    duplex: 'Half duplex. Every node listens, including the one transmitting, which reads back each bit it sends.',
    topology: 'A linear bus with short stubs and a 120 Ω terminating resistor at each end.',
    addressing: 'Message identifiers of 11 or 29 bits, describing the content rather than a destination. Nodes filter for the identifiers they want.',
    flow: 'None beyond arbitration: a lower-priority frame waits for the bus to go idle and tries again.',
    errors: 'CRC-15, plus bit, stuff, form and acknowledgement checks. A node that detects an error sends an error frame, and the transmitter automatically retries.',
    speed: 'Up to 1 Mbit/s for classic CAN. CAN FD raises the data phase further.',
    reach: 'About 40 m at 1 Mbit/s and about 500 m at 125 kbit/s, because arbitration needs every node to see each bit within its bit time.',
  },
  strengths: [
    'Non-destructive arbitration: the highest-priority message gets through with no retransmission or added delay.',
    'Strong error detection, with automatic retransmission handled in hardware.',
    'Differential signaling tolerates the electrical noise of a vehicle.',
    'Nodes can be added without changing the others, because frames carry no destination.',
  ],
  limits: [
    'Only 8 data bytes per classic frame, and a standard frame adds 44 bits of overhead before stuffing.',
    'Bit rate is tied to bus length, because a bit has to reach every node during arbitration.',
    'A low-priority message can wait indefinitely on a heavily loaded bus.',
    'All nodes must be configured for the same bit timing.',
  ],
  deepDive: [
    {
      title: 'Why arbitration loses nothing',
      body: [
        'The bus behaves like a wired AND: if any node drives dominant, the bus is dominant. Every transmitter reads the bus while it sends. A node that sends recessive and reads dominant knows a higher-priority frame is on the bus, stops transmitting, and becomes a receiver. The winner never notices. It carries on as if it were alone, so no time is wasted.',
        'This is why identifiers must be unique among nodes that can send at the same time. Two nodes sending the same identifier with different data would both reach the data field, and the resulting bit error would have no winner.',
      ],
    },
    {
      title: 'Bit stuffing',
      body: [
        'After five consecutive equal bits, the transmitter adds one opposite bit, from start of frame through the CRC sequence. It serves two purposes: it guarantees edges that keep receivers in step, and six equal bits become a violation that error frames can use to signal a problem on purpose. It also means a frame’s length depends on its contents.',
      ],
    },
    {
      title: 'Sample point and bit timing',
      body: [
        'Each bit is divided into time quanta, and the bus is read at a sample point late in the bit, typically around 75 to 87.5%. The time before it has to cover the delay out to the farthest node and back, which is what links maximum length to bit rate. Controllers resynchronize on each recessive-to-dominant edge by lengthening or shortening a bit by a few quanta.',
      ],
    },
    {
      title: 'Error handling',
      body: [
        'A node that detects an error transmits six dominant bits, which breaks the stuffing rule and makes every other node reject the frame too. The transmitter then resends it automatically. Each node keeps transmit and receive error counters; one that accumulates too many goes error-passive, and then bus-off, so that a faulty node removes itself rather than jamming the bus.',
      ],
    },
    {
      title: 'The acknowledge slot',
      body: [
        'The transmitter sends the ACK slot recessive, and every node that received the frame correctly overwrites it with a dominant bit. It says that at least one node got it, not that the intended one did, since a CAN frame has no destination.',
      ],
    },
  ],
  params: [
    { key: 'id', label: 'ID', help: 'The message identifier, in hex. Lower numbers have higher priority.', type: 'text', default: '123', placeholder: '123' },
    { key: 'rival', label: 'Competing ID', help: 'A second node that starts sending at the same moment, in hex. Leave it empty for a single sender. The lower identifier wins, so its frame is the one shown.', type: 'text', default: '125', placeholder: '125' },
    { key: 'data', label: 'Data', help: 'Up to 8 data bytes in hex, such as DE AD. Leave it empty for a frame with no data.', type: 'text', default: 'A5 3C', placeholder: 'A5 3C' },
    {
      key: 'format', label: 'Format', help: 'A standard frame has an 11-bit identifier, and an extended frame a 29-bit one.', type: 'select', default: 'std',
      options: [{ value: 'std', label: 'Standard (11-bit)' }, { value: 'ext', label: 'Extended (29-bit)' }],
    },
    {
      key: 'type', label: 'Frame', help: 'A data frame carries bytes. A remote frame asks another node to send them, and has no data field.', type: 'select', default: 'data',
      options: [{ value: 'data', label: 'Data' }, { value: 'remote', label: 'Remote' }],
    },
    {
      key: 'ack', label: 'Receiver', help: 'Whether any other node acknowledges the frame. With nobody listening, the ACK slot stays recessive and the transmitter reports an error.', type: 'select', default: 'yes',
      options: [{ value: 'yes', label: 'Acknowledges' }, { value: 'no', label: 'None present' }],
    },
    {
      key: 'rate', label: 'Bit rate', help: 'The bus speed. Every node must use the same rate. It changes the timescale, not the shape of the frame.', type: 'select', default: '500',
      options: ['125', '250', '500', '1000'].map((v) => ({ value: v, label: v === '1000' ? '1 Mbit/s' : `${v} kbit/s` })),
    },
  ],

  encode(p) {
    const ext = p.format === 'ext';
    const max = ext ? 0x1fffffff : 0x7ff;
    const remote = p.type === 'remote';
    const a = parseId(p.id, max, 'ID');
    const b = p.rival.trim() ? parseId(p.rival, max, 'Competing ID') : undefined;
    if (b === a) throw new Error('Two nodes cannot send the same ID at once; use a different competing ID');
    const data = p.data.trim() ? parseBytes(p.data, 'hex', 8) : [];
    if (data.length > 8) throw new Error('A classic CAN frame carries at most 8 bytes');
    const winner = b === undefined ? a : Math.min(a, b);
    const built = protectedBits(winner, ext, remote, data);
    const wire = stuff(built.bits, stuffBit);

    let lostAt = -1;
    if (b !== undefined) {
      const loser = stuff(protectedBits(Math.max(a, b), ext, remote, data).bits, stuffBit);
      lostAt = wire.findIndex((x, i) => x.v !== loser[i].v);
    }

    const tail: Raw[] = [{ v: 1, label: 'CD', kind: 'stop', field: 'CRC', info: 'CRC delimiter, always recessive. Bit stuffing has ended here.' }];
    const acked = p.ack === 'yes';
    tail.push({
      v: acked ? 0 : 1, label: 'ACK', kind: acked ? 'ack' : 'nack', field: 'ACK',
      info: acked ? 'ACK slot. The transmitter sends recessive, and every node that received the frame correctly overwrites it with dominant.' : 'ACK slot left recessive: no other node acknowledged, so the transmitter reports an acknowledgement error and will retry.',
    });
    tail.push({ v: 1, label: 'AD', kind: 'stop', field: 'ACK', info: 'ACK delimiter, always recessive.' });
    for (let i = 0; i < 7; i++) tail.push({ v: 1, label: 'EOF', kind: 'stop', field: 'EOF', info: 'End of frame: seven recessive bits.' });
    for (let i = 0; i < 3; i++) tail.push({ v: 1, label: 'IFS', kind: 'dummy', field: 'Intermission', info: 'Intermission: three recessive bits before any node may start another frame.' });

    const bus = new TraceBuilder('Bus', 1);
    const canh = new TraceBuilder('CANH', 'z');
    const canl = new TraceBuilder('CANL', 'z');
    const lose = new TraceBuilder(b === undefined ? 'unused' : `ID ${Math.max(a, b).toString(16).toUpperCase()}`, 1);
    const bits: Bit[] = [];
    const fields: Field[] = [];
    const notes: Note[] = [{ lane: 0, t: 0.1, text: 'idle: recessive' }];
    let t = 1, current = '', fieldStart = t, fieldKind: Kind = 'start';
    const flush = (end: number) => {
      if (current) fields.push({ lane: 0, t0: fieldStart, t1: end, label: current === 'ID' ? `ID ${hex(winner).replace(/^0x/, '0x')}` : current === 'CRC' ? `CRC ${built.crc.toString(16).toUpperCase().padStart(4, '0')}` : current === 'Control' ? `DLC ${data.length}` : current, kind: fieldKind });
    };
    const all = [...wire, ...tail];
    all.forEach((r, i) => {
      const lv = r.v as Level;
      bus.set(t, lv);
      canh.set(t, r.v ? 'z' : 1);
      canl.set(t, r.v ? 'z' : 0);
      if (b !== undefined) lose.set(t, lostAt >= 0 && i >= lostAt ? 1 : r.v);
      const name = r.field || current;
      if (name !== current) { flush(t); current = name; fieldStart = t; fieldKind = r.kind; }
      bits.push({ lane: 0, t0: t, t1: t + 1, label: r.label, kind: r.kind, sample: t + 0.75, info: r.info, ...(r.label === 'ACK' && acked ? { by: 'target' as const } : {}) });
      t++;
    });
    flush(t);
    bus.set(t, 1);
    canh.set(t, 'z');
    canl.set(t, 'z');
    if (lostAt >= 0) notes.push({ lane: 3, t: 1 + lostAt, text: 'sends 1, reads 0: stops' });
    return {
      traces: b === undefined ? [bus.trace, canh.trace, canl.trace] : [bus.trace, canh.trace, canl.trace, lose.trace],
      bits, fields, notes, duration: t + 1, unitTime: 1 / (Number(p.rate) * 1000),
    };
  },
};
