import type { Bit, Field, Kind, Level, Note, Protocol, TourStop } from '../core/types';
import { TraceBuilder, hex, parseBytes } from '../core/util';

const PID: Record<string, number> = {
  OUT: 0xe1, IN: 0x69, SETUP: 0x2d, SOF: 0xa5, DATA0: 0xc3, DATA1: 0x4b, ACK: 0xd2, NAK: 0x5a, STALL: 0x1e,
};

/** CRC5 over the 11 token bits (address then endpoint, LSB first). Returns the 5 bits in transmission order. */
export function crc5(bits: number[]): number[] {
  let crc = 0x1f;
  for (const b of bits) {
    const fb = ((crc >> 4) & 1) ^ b;
    crc = (crc << 1) & 0x1f;
    if (fb) crc ^= 0x05;
  }
  crc = ~crc & 0x1f;
  return [4, 3, 2, 1, 0].map((i) => (crc >> i) & 1); // sent most significant bit first
}

/** CRC16 over the data bytes (polynomial 0x8005, reflected). Returns the two CRC bytes in transmission order. */
export function crc16(bytes: number[]): [number, number] {
  let crc = 0xffff;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
  }
  crc = ~crc & 0xffff;
  return [crc & 0xff, crc >> 8];
}

const lsbFirst = (v: number, n: number) => Array.from({ length: n }, (_, i) => (v >> i) & 1);

type Seg = { bits: number[]; label: string; kind: Kind; info: string };
type Packet = { name: string; by: 'controller' | 'target'; segs: Seg[] };

export const usb: Protocol = {
  id: 'usb',
  name: 'USB 2.0',
  fullName: 'Universal Serial Bus 2.0 (low and full speed)',
  tags: ['embedded clock', 'differential', 'half duplex', 'star', 'addressed', 'cable', 'NRZI'],
  summary:
    'Data travels on a differential pair, D+ and D−, as NRZI: a 0 is a change of state and a 1 is no change. After six ' +
    '1s in a row the transmitter inserts an extra 0 (bit stuffing) so the receiver always sees transitions to stay in ' +
    'sync. Every transfer is a short exchange of packets: a token from the host, an optional data packet, and a handshake.',
  usedIn: 'Keyboards, mice, game controllers, microcontroller boards, serial adapters, and the fallback mode of every faster USB port.',
  facts: {
    clock: 'Embedded. Each packet starts with a SYNC pattern the receiver locks onto, and bit stuffing guarantees a transition at least every seven bits.',
    wires: 'D+ and D− as a twisted pair, plus VBUS (5 V) and ground.',
    drive: 'Differential, 3.3 V, push-pull. Both lines low (SE0) is a special state that ends every packet. Pull-up resistors on the device tell the host its speed.',
    duplex: 'Half duplex: the host and the device take turns on the same pair.',
    topology: 'A tiered star: a host at the root, hubs fanning out, and up to 127 devices.',
    addressing: 'The host assigns each device a 7-bit address when it connects. Each device has up to 16 endpoint numbers, each with an IN and an OUT direction, selected in the token.',
    flow: 'Host-controlled. The host polls every device; a device that is not ready answers NAK, and the host retries later.',
    errors: 'CRC5 on tokens and CRC16 on data packets, plus PID check bits. Packets that fail receive no handshake and are retried.',
    speed: 'Low speed 1.5 Mbit/s, full speed 12 Mbit/s, high speed 480 Mbit/s (high speed uses different, lower-voltage signaling).',
    reach: '5 m per cable; hubs extend it, up to five hubs deep.',
  },
  strengths: [
    'One connector for almost everything, with power included.',
    'Plug and play: devices describe themselves, and standard classes need no custom drivers.',
    'Reliable delivery for bulk and control transfers, with automatic retries.',
  ],
  limits: [
    'Host-centric: devices cannot talk to each other, and every transfer waits for the host to poll.',
    'Protocol overhead is large for small transfers: tokens, handshakes and gaps around every packet.',
    'Implementing a device requires a full protocol stack, descriptors and, for products, a vendor ID.',
  ],
  deepDive: [
    {
      title: 'J, K and SE0',
      body: [
        'USB names line states rather than voltages. At full speed, J is D+ high and D− low, which is also the idle state; ' +
        'K is the opposite. Low speed swaps them. SE0 (single-ended zero) is both lines low: two bit times of SE0 end ' +
        'every packet, and a long SE0 resets the device.',
        'The host learns a device\'s speed from its pull-up resistor: 1.5 kΩ on D+ for full speed, on D− for low speed.',
      ],
    },
    {
      title: 'Bit stuffing',
      body: [
        'NRZI produces no transitions for a run of 1s, so after six consecutive 1s the transmitter inserts a 0, which ' +
        'forces a transition. The receiver removes it again. Stuffing makes packet length depend on the data: a payload ' +
        'of 0xFF bytes is noticeably longer on the wire than the same number of 0x00 bytes.',
      ],
    },
    {
      title: 'Transactions and transfers',
      body: [
        'A transaction is a token, an optional data packet and a handshake. SETUP and OUT carry data from the host; IN asks ' +
        'the device to send. DATA0 and DATA1 alternate on each successful transaction, so if an ACK is lost and the host ' +
        'resends, the device recognizes the duplicate.',
        'Transactions build four transfer types: control (enumeration and configuration), bulk (storage, printers), ' +
        'interrupt (keyboards, mice) and isochronous (audio and video, with guaranteed bandwidth but no retries).',
      ],
    },
    {
      title: 'Enumeration',
      body: [
        'When a device connects, the host resets it, reads its device descriptor at address 0 (the SETUP packet shown by ' +
        'default here is that request: GET_DESCRIPTOR for the device descriptor), assigns it an address, and reads the ' +
        'configuration descriptors that list its interfaces and endpoints. The class codes in those descriptors let the ' +
        'operating system load a generic driver for keyboards, storage, audio and serial devices.',
      ],
    },
    {
      title: 'High speed',
      body: [
        'High-speed USB (480 Mbit/s) keeps the same packets, NRZI and bit stuffing, but signals differently: the ' +
        'transmitter drives a current into 45 Ω terminations at each end, giving roughly 400 mV swings. Packets start ' +
        'with a 32-bit SYNC and end with an 8-bit stuffing violation instead of SE0. A device starts at full speed and ' +
        'negotiates high speed during reset with a sequence of chirps.',
      ],
    },
  ],
  legend: { start: 'SYNC / EOP', cmd: 'PID', addr: 'address / endpoint', parity: 'CRC', dummy: 'stuffed bit', ack: 'handshake' },
  params: [
    {
      key: 'xfer', label: 'Transaction', help: 'The transaction type. SETUP and OUT carry data from the host to the device; IN asks the device to send data to the host.', type: 'select', default: 'setup',
      options: [
        { value: 'setup', label: 'SETUP (host sends a request)' },
        { value: 'out', label: 'OUT (host sends data)' },
        { value: 'in', label: 'IN (device sends data)' },
      ],
    },
    { key: 'addr', label: 'Address', help: 'The device address, from 0 to 127. A newly connected device uses address 0 until the host assigns it one.', type: 'text', default: '0', placeholder: '0 (decimal, 0-127)' },
    { key: 'ep', label: 'Endpoint', help: 'The endpoint number, from 0 to 15. Endpoint 0 is the control endpoint that every device provides.', type: 'text', default: '0', placeholder: '0 (0-15)' },
    { key: 'data', label: 'Data', help: 'The data packet payload, in hexadecimal. A SETUP packet is always exactly 8 bytes; the default is the standard GET_DESCRIPTOR request.', type: 'text', default: '80 06 00 01 00 00 12 00', placeholder: '80 06 00 01 00 00 12 00' },
    {
      key: 'toggle', label: 'Data PID', help: 'DATA0 and DATA1 alternate on successful transactions, which lets the receiver recognize a retransmitted packet.', type: 'select', default: 'DATA0',
      options: [{ value: 'DATA0', label: 'DATA0' }, { value: 'DATA1', label: 'DATA1' }],
    },
    {
      key: 'hs', label: 'Handshake', help: 'The handshake that ends the transaction: ACK for success, NAK when the receiver is busy, and STALL when the endpoint cannot complete the request.', type: 'select', default: 'ACK',
      options: [{ value: 'ACK', label: 'ACK' }, { value: 'NAK', label: 'NAK' }, { value: 'STALL', label: 'STALL' }],
    },
    {
      key: 'speed', label: 'Speed', help: 'Low speed swaps the idle levels of D+ and D− and limits data packets to 8 bytes. Both speeds use the same packets.', type: 'select', default: 'full',
      options: [{ value: 'full', label: 'Full speed (12 Mbit/s)' }, { value: 'low', label: 'Low speed (1.5 Mbit/s)' }],
    },
  ],

  encode(p) {
    const addr = Number(p.addr.trim());
    const ep = Number(p.ep.trim());
    if (!Number.isInteger(addr) || addr < 0 || addr > 127) throw new Error('The address should be a whole number from 0 to 127.');
    if (!Number.isInteger(ep) || ep < 0 || ep > 15) throw new Error('The endpoint should be a whole number from 0 to 15.');
    const bytes = p.data.trim() ? parseBytes(p.data, 'hex') : [];
    const low = p.speed === 'low';
    if (low && bytes.length > 8) throw new Error('Low-speed data packets carry at most 8 bytes.');
    if (p.xfer === 'setup' && bytes.length !== 8) throw new Error('A SETUP packet\'s data is always exactly 8 bytes (the request).');
    const tokenName = p.xfer.toUpperCase();
    const dataFromHost = p.xfer !== 'in';

    const sync = (): Seg => ({ bits: [0, 0, 0, 0, 0, 0, 0, 1], label: 'SYNC', kind: 'start',
      info: 'SYNC: seven 0s and a 1. In NRZI each 0 is a transition, so the line alternates K, J, K, J… and the receiver locks onto the bit rate; the final two K states mark where the packet begins.' });
    const pid = (name: string): Seg => ({ bits: lsbFirst(PID[name], 8), label: name, kind: name === 'ACK' || name === 'NAK' || name === 'STALL' ? 'ack' : 'cmd',
      info: `PID ${name} (${hex(PID[name])}): a 4-bit packet type followed by its complement, which lets the receiver detect a corrupted PID.` });

    const tokenBits = [...lsbFirst(addr, 7), ...lsbFirst(ep, 4)];
    const packets: Packet[] = [
      {
        name: `${tokenName} token`, by: 'controller', segs: [
          sync(), pid(tokenName),
          { bits: lsbFirst(addr, 7), label: `ADDR ${addr}`, kind: 'addr', info: `Device address ${addr}, 7 bits, least significant first.${addr === 0 ? ' Address 0 is where every device answers before the host assigns its address.' : ''}` },
          { bits: lsbFirst(ep, 4), label: `ENDP ${ep}`, kind: 'addr', info: `Endpoint ${ep}, 4 bits.${ep === 0 ? ' Endpoint 0 is the control endpoint every device has.' : ''}` },
          { bits: crc5(tokenBits), label: 'CRC5', kind: 'parity', info: 'CRC5 over the address and endpoint, sent inverted and most significant bit first.' },
        ],
      },
      {
        name: `${p.toggle} packet`, by: dataFromHost ? 'controller' : 'target', segs: [
          sync(), pid(p.toggle),
          ...bytes.map((b, i): Seg => ({ bits: lsbFirst(b, 8), label: hex(b), kind: 'data', info: `Data byte ${i + 1}, ${hex(b)}, least significant bit first.` })),
          { bits: [...lsbFirst(crc16(bytes)[0], 8), ...lsbFirst(crc16(bytes)[1], 8)], label: 'CRC16', kind: 'parity', info: 'CRC16 over the data bytes, sent inverted.' },
        ],
      },
      { name: `${p.hs} handshake`, by: dataFromHost ? 'target' : 'controller', segs: [sync(), pid(p.hs)] },
    ];

    // Line states: J is idle. Full speed J = D+ high; low speed J = D− high.
    const dp = new TraceBuilder('D+', low ? 0 : 1);
    const dm = new TraceBuilder('D−', low ? 1 : 0);
    const J = () => [low ? 0 : 1, low ? 1 : 0] as [Level, Level];
    const K = () => [low ? 1 : 0, low ? 0 : 1] as [Level, Level];
    const put = (t: number, [a, b]: [Level, Level]) => { dp.set(t, a); dm.set(t, b); };

    const bits: Bit[] = [];
    const fields: Field[] = [];
    const notes: Note[] = [];
    const spans: Record<string, [number, number]> = {};
    let t = 2;
    for (const pk of packets) {
      const start = t;
      let state: 'J' | 'K' = 'J';
      let ones = 0;
      const emit = (b: number, label: string, kind: Kind, info: string) => {
        if (b === 0) state = state === 'J' ? 'K' : 'J';
        put(t, state === 'J' ? J() : K());
        bits.push({ lane: 0, t0: t, t1: t + 1, label, kind, by: pk.by, sample: t + 0.5,
          info: `${info} Bit value ${b}: ${b ? 'no change' : 'a transition'} in NRZI, so the line ${b ? 'stays' : 'switches to'} ${state}.` });
        t++;
      };
      for (const seg of pk.segs) {
        const s0 = t;
        seg.bits.forEach((b, i) => {
          emit(b, seg.kind === 'data' || seg.kind === 'parity' ? `${i}` : seg.label === 'SYNC' ? `${b}` : `${i}`, seg.kind, seg.info);
          ones = b ? ones + 1 : 0;
          if (ones === 6 && seg.label !== 'SYNC') {
            emit(0, 'S', 'dummy', 'Stuffed bit: the six previous bits were all 1s, so the transmitter inserts a 0 to force a transition. The receiver discards it.');
            ones = 0;
          }
        });
        fields.push({ lane: 0, t0: s0, t1: t, label: seg.label, kind: seg.kind });
      }
      // End of packet: two bit times of SE0, then one of J.
      put(t, [0, 0]);
      bits.push({ lane: 0, t0: t, t1: t + 2, label: 'SE0', kind: 'stop', by: pk.by,
        info: 'End of packet: both lines are held low (SE0) for two bit times, then the line returns to J (idle). SE0 can never occur inside a packet.' });
      put(t + 2, J());
      t += 3;
      spans[pk.name] = [start, t];
      t += 4; // inter-packet gap
    }
    notes.push({ lane: 0, t: 2, text: 'SYNC: alternating K/J to lock onto' });
    const firstEop = bits.find((b) => b.label === 'SE0')!;
    notes.push({ lane: 1, t: firstEop.t0, text: 'SE0: both lines low ends the packet' });
    const stuffed = bits.find((b) => b.label === 'S');
    if (stuffed) notes.push({ lane: 0, t: stuffed.t0, text: 'stuffed 0 after six 1s' });

    const ui = 1 / (low ? 1.5e6 : 12e6);
    const view = (r: [number, number], pad = 3): [number, number] => [Math.max(0, r[0] - pad), r[1] + pad];
    const [tok, dat, hsk] = packets.map((pk) => spans[pk.name]);
    const tour: TourStop[] = [
      { title: 'Overview', text: `One ${tokenName} transaction: a token from the host, a data packet from the ${dataFromHost ? 'host' : 'device'}, and a handshake from the ${dataFromHost ? 'device' : 'host'}. Between packets the bus idles in the J state.`, view: [0, t], focus: null },
      { title: 'SYNC', text: 'Every packet begins with SYNC: seven 0s and a 1. Because NRZI encodes a 0 as a transition, the line alternates between K and J, giving the receiver regular edges to lock its clock onto.', view: view([tok[0], tok[0] + 8], 2), focus: [tok[0], tok[0] + 8] },
      { title: 'Token packet', text: `PID ${tokenName}, then the 7-bit address ${addr} and 4-bit endpoint ${ep}, protected by a 5-bit CRC. Every device sees the token; only the addressed one responds.`, view: view(tok), focus: tok },
      { title: 'End of packet', text: 'Both D+ and D− are held low for two bit times (SE0), a state that cannot occur within a packet, and then the line returns to idle.', view: view([firstEop.t0, firstEop.t1 + 1], 4), focus: [firstEop.t0, firstEop.t1 + 1] },
      { title: 'Data packet', text: `${p.toggle} with ${bytes.length} byte${bytes.length === 1 ? '' : 's'} and a 16-bit CRC.${p.xfer === 'setup' ? ' This 8-byte SETUP payload is the GET_DESCRIPTOR request a host sends first to every new device.' : ''}`, view: view(dat), focus: dat },
    ];
    if (stuffed) tour.push({ title: 'Bit stuffing', text: 'After six consecutive 1s, the transmitter inserts a 0 so that the line changes state. The receiver counts the 1s too and discards the inserted bit.', view: view([stuffed.t0 - 6, stuffed.t1], 3), focus: [stuffed.t0 - 6, stuffed.t1] });
    tour.push({ title: 'Handshake', text: p.hs === 'ACK' ? 'ACK: the data arrived intact.' : p.hs === 'NAK' ? 'NAK: the receiver is busy; the host will retry the transaction later.' : 'STALL: the endpoint cannot complete the request, for example because it is not supported.', view: view(hsk), focus: hsk });

    return { traces: [dp.trace, dm.trace], bits, fields, notes, duration: t, unitTime: ui, tour };
  },
};
