import type { Bit, Field, Kind, Note, Protocol } from '../core/types';
import { TraceBuilder, hex, parseBytes } from '../core/util';

const MIN_PAYLOAD = 46;

/** CRC-32 as used by Ethernet (reflected, polynomial 0x04C11DB7, start and finish with all ones). */
export function crc32(bytes: number[]) {
  let crc = 0xffffffff;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const mac = (text: string, name: string) => {
  const bytes = parseBytes(text.replace(/[:-]/g, ' '), 'hex');
  if (bytes.length !== 6) throw new Error(`The ${name} MAC address needs exactly 6 bytes, like 02:00:00:00:00:01.`);
  return bytes;
};
const macText = (b: number[]) => b.map((x) => x.toString(16).padStart(2, '0')).join(':');

export const ethernet: Protocol = {
  id: 'ethernet',
  name: '10BASE-T',
  fullName: '10 Mbit/s Ethernet over twisted pair (IEEE 802.3i)',
  summary:
    'The original twisted-pair Ethernet. Every bit is Manchester encoded: a 1 is a low-to-high transition in the middle ' +
    'of the bit and a 0 is high-to-low, so the receiver can recover the clock from the data itself. A frame is a ' +
    'preamble, two MAC addresses, a type, at least 46 bytes of payload, and a CRC-32.',
  usedIn: 'Old hubs and networks, cheap microcontroller Ethernet chips like the ENC28J60, and the frame format every faster Ethernet still uses.',
  facts: {
    clock: 'Embedded. Manchester encoding guarantees a transition in every bit, and the 56-bit preamble gives the receiver time to lock onto it.',
    wires: 'Two twisted pairs in an RJ45 cable: one to transmit (pins 1 and 2) and one to receive (pins 3 and 6).',
    drive: 'Differential, about ±2.5 V, through an isolation transformer. Manchester has no DC component, which is what lets it pass through the transformer.',
    duplex: 'Half duplex on a hub, where everyone shares the medium and collisions are detected. Full duplex on a switch.',
    topology: 'Star: every device has its own cable to a hub or switch.',
    addressing: '48-bit MAC addresses for the destination and the source. All ones (ff:ff:ff:ff:ff:ff) is broadcast.',
    flow: 'On a hub, collision detection and random backoff. Full-duplex links can send PAUSE frames.',
    errors: 'A CRC-32 (the frame check sequence) on every frame. Frames that fail are silently dropped.',
    speed: '10 Mbit/s. Manchester needs two signal levels per bit, so the line runs at 20 Mbaud.',
    reach: '100 m per cable.',
  },
  strengths: [
    'Self-clocking and DC-balanced, so it works through isolation transformers with no separate clock wire.',
    'Globally unique MAC addresses and a strong CRC on every frame.',
    'Its frame format is still the one every Ethernet uses, from 100 Mbit/s to 400 Gbit/s.',
  ],
  limits: [
    'Manchester doubles the signaling rate, so faster Ethernets switched to more efficient codes.',
    'Lots of overhead for small messages: 8 bytes of preamble, padding to a 64-byte minimum frame, and a gap between frames.',
    'Obsolete as a physical layer; today\'s ports run 100 Mbit/s and up, though most still fall back to 10BASE-T.',
  ],
  legend: { start: 'preamble / SFD', addr: 'MAC address', cmd: 'EtherType', dummy: 'padding', parity: 'CRC-32', stop: 'end of frame' },
  params: [
    { key: 'dst', label: 'Destination', type: 'text', default: 'ff:ff:ff:ff:ff:ff', placeholder: 'ff:ff:ff:ff:ff:ff' },
    { key: 'src', label: 'Source', type: 'text', default: '02:00:00:00:00:01', placeholder: '02:00:00:00:00:01' },
    { key: 'type', label: 'EtherType', type: 'text', default: '88B5', placeholder: '88B5 (hex)' },
    { key: 'data', label: 'Payload', type: 'text', default: 'Hi', placeholder: 'Hi' },
    {
      key: 'format', label: 'As', type: 'select', default: 'text',
      options: [{ value: 'text', label: 'Text' }, { value: 'hex', label: 'Hex' }],
    },
  ],

  encode(p) {
    const dst = mac(p.dst, 'destination');
    const src = mac(p.src, 'source');
    const typeText = p.type.trim().replace(/^0x/i, '');
    if (!/^[0-9a-f]{1,4}$/i.test(typeText)) throw new Error('The EtherType should be up to 4 hex digits, like 0800 or 88B5.');
    const type = parseInt(typeText, 16);
    const payload = parseBytes(p.data, p.format);
    const pad = Math.max(0, MIN_PAYLOAD - payload.length);

    const frame = [...dst, ...src, type >> 8, type & 0xff, ...payload, ...new Array(pad).fill(0)];
    const fcs = crc32(frame);
    const fcsBytes = [0, 8, 16, 24].map((s) => (fcs >>> s) & 0xff); // least significant byte first

    const sections: { bytes: number[]; label: string; kind: Kind; info: string }[] = [
      { bytes: new Array(7).fill(0x55), label: 'Preamble (7 × 0x55)', kind: 'start',
        info: 'Preamble: seven 0x55 bytes, an alternating 1010… pattern. It carries no data; it gives the receiver 56 bits to lock its clock onto the transitions.' },
      { bytes: [0xd5], label: 'SFD 0xD5', kind: 'start',
        info: 'Start frame delimiter 0xD5. It looks like the preamble except it ends in 11, which tells the receiver the frame starts with the next bit.' },
      { bytes: dst, label: `To ${macText(dst)}`, kind: 'addr',
        info: `Destination MAC address ${macText(dst)}.${dst.every((b) => b === 0xff) ? ' All ones means broadcast: every device accepts it.' : ''}` },
      { bytes: src, label: `From ${macText(src)}`, kind: 'addr', info: `Source MAC address ${macText(src)}.` },
      { bytes: [type >> 8, type & 0xff], label: `Type 0x${typeText.toUpperCase().padStart(4, '0')}`, kind: 'cmd',
        info: 'EtherType: what kind of payload follows (0x0800 is IPv4, 0x86DD is IPv6, 0x88B5 is reserved for local experiments). It\'s sent most significant byte first.' },
      { bytes: payload, label: `Payload (${payload.length} byte${payload.length === 1 ? '' : 's'})`, kind: 'data', info: 'Payload.' },
      { bytes: new Array(pad).fill(0), label: `Padding (${pad} bytes)`, kind: 'dummy',
        info: `Padding: the payload must be at least 46 bytes so the whole frame is at least 64 bytes. On a shared hub, that minimum length is what guarantees a sender is still transmitting when news of a collision reaches it.` },
      { bytes: fcsBytes, label: `FCS 0x${fcs.toString(16).toUpperCase().padStart(8, '0')}`, kind: 'parity',
        info: 'Frame check sequence: a CRC-32 over everything from the destination address to the end of the padding. The receiver recomputes it and drops the frame if it doesn\'t match.' },
    ];

    const data = new TraceBuilder('Data', 'z');
    const tx = new TraceBuilder('TX±', 'z');
    tx.trace.levels = ['−2.5 V', '+2.5 V'];
    const bits: Bit[] = [];
    const fields: Field[] = [];
    const notes: Note[] = [];
    const noteFor: Partial<Record<string, string>> = {
      'Preamble (7 × 0x55)': 'preamble: 1010… so the receiver can lock on',
      'SFD 0xD5': 'SFD ends in 11',
      [`Padding (${pad} bytes)`]: 'padding up to the 64-byte minimum',
    };

    let t = 1;
    for (const sec of sections) {
      if (!sec.bytes.length) continue;
      const start = t;
      if (noteFor[sec.label]) notes.push({ lane: 1, t, text: noteFor[sec.label]! });
      sec.bytes.forEach((byte, n) => {
        for (let i = 0; i < 8; i++) {
          const v = ((byte >> i) & 1) as 0 | 1;
          data.set(t, v);
          // IEEE 802.3 Manchester: the second half of each bit equals the bit, so 1 is low→high and 0 is high→low.
          tx.set(t, v ? 0 : 1);
          tx.set(t + 0.5, v);
          bits.push({
            lane: 1, t0: t, t1: t + 1, label: `${i}`, kind: sec.kind, sample: t + 0.5,
            info: `${sec.info} Byte ${n + 1} of ${sec.bytes.length} (${hex(byte)}), bit ${i} = ${v}. Bytes go out least ` +
              `significant bit first. On the wire, a ${v} is a ${v ? 'low-to-high' : 'high-to-low'} transition in the middle of the bit.`,
          });
          t++;
        }
      });
      fields.push({ lane: 1, t0: start, t1: t, label: sec.label, kind: sec.kind });
    }

    // End of frame: hold high briefly (TP_IDL), then go quiet at 0 V.
    data.set(t, 'z');
    tx.set(t, 1);
    tx.set(t + 2, 'z');
    notes.push({ lane: 1, t: t + 2, text: 'idle: 0 V' });
    bits.push({
      lane: 1, t0: t, t1: t + 2, label: 'End', kind: 'stop',
      info: 'End of frame: the transmitter holds the line high for about two bit times (TP_IDL), then stops driving it. ' +
        'Between frames, 10BASE-T sends a short "link pulse" every 16 ms so each end knows the cable is connected.',
    });

    return { traces: [data.trace, tx.trace], bits, fields, notes, duration: t + 3, unitTime: 1e-7, minPpu: 8 };
  },
};
