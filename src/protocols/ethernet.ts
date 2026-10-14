import type { Bit, Field, Kind, Note, Protocol, TourStop } from '../core/types';
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
  tags: ['embedded clock', 'differential', 'half duplex', 'full duplex', 'star', 'addressed', 'cable', 'networking', 'Manchester'],
  summary:
    'The original twisted-pair Ethernet. Every bit is Manchester encoded: a 1 is a low-to-high transition in the middle ' +
    'of the bit and a 0 is high-to-low, so the receiver can recover the clock from the data itself. A frame is a ' +
    'preamble, two MAC addresses, a type, at least 46 bytes of payload, and a CRC-32.',
  usedIn: 'Legacy hubs and networks, low-cost microcontroller Ethernet controllers such as the ENC28J60, and the frame format every faster Ethernet still uses.',
  facts: {
    clock: 'Embedded. Manchester encoding guarantees a transition in every bit, and the 56-bit preamble gives the receiver time to lock onto it.',
    wires: 'Two twisted pairs in an RJ45 cable: one to transmit (pins 1 and 2) and one to receive (pins 3 and 6).',
    drive: 'Differential, about ±2.5 V, through an isolation transformer. Manchester has no DC component, which is what lets it pass through the transformer.',
    duplex: 'Half duplex on a hub, where everyone shares the medium and collisions are detected. Full duplex on a switch.',
    topology: 'Star: every device has its own cable to a hub or switch.',
    addressing: '48-bit MAC addresses for the destination and the source. All ones (ff:ff:ff:ff:ff:ff) is broadcast.',
    flow: 'On a hub, collision detection and random backoff. Full-duplex links can send PAUSE frames.',
    errors: 'A CRC-32 (the frame check sequence) on every frame. Frames that fail are silently dropped.',
    speed: '10 Mbit/s. Manchester sends two signal elements (half-bits) per bit, so the line runs at 20 Mbaud.',
    reach: '100 m per cable.',
  },
  strengths: [
    'Self-clocking and DC-balanced, so it works through isolation transformers with no separate clock wire.',
    'Globally unique MAC addresses and a strong CRC on every frame.',
    'Its frame format is still the one every Ethernet uses, from 100 Mbit/s to 400 Gbit/s.',
  ],
  limits: [
    'Manchester doubles the signaling rate, so faster Ethernets switched to more efficient codes.',
    'High overhead for small messages: 8 bytes of preamble, padding to a 64-byte minimum frame, and a gap between frames.',
    'Obsolete as a physical layer; current ports run at 100 Mbit/s or faster, although most can still fall back to 10BASE-T.',
  ],
  legend: { start: 'preamble / SFD', addr: 'MAC address', cmd: 'EtherType', dummy: 'padding', parity: 'CRC-32', stop: 'end of frame' },
  deepDive: [
    {
      title: 'Link pulses and autonegotiation',
      body: [
        'When no frames are being sent, a 10BASE-T transmitter emits a normal link pulse (NLP), a single pulse roughly every 16 ms, so the other end knows the cable is connected. Faster Ethernet replaced these with bursts of fast link pulses that carry autonegotiation messages advertising each side\'s capabilities. A 10BASE-T device still appears to a modern port as a device sending plain link pulses, and the port falls back to 10 Mbit/s.',
      ],
    },
    {
      title: 'Collisions and CSMA/CD',
      body: [
        'On a hub, every device shares one collision domain. A device listens before transmitting (carrier sense), and if it detects another transmission while sending, it sends a 32-bit jam signal, stops, and waits a random number of slot times before retrying, doubling the range after each collision (binary exponential backoff).',
        'One slot time is 512 bit times, 51.2 µs at 10 Mbit/s, which is exactly the 64-byte minimum frame: a frame must last long enough for a collision at the far end of the network to be detected before the sender finishes. Switches and full-duplex links have eliminated collisions in practice.',
      ],
    },
    {
      title: 'Interframe gap',
      body: [
        'After each frame, a transmitter must wait at least 96 bit times, 9.6 µs at 10 Mbit/s, before starting the next preamble. Together with the preamble and minimum frame size, this sets the maximum frame rate: about 14,880 minimum-size frames per second at 10 Mbit/s.',
      ],
    },
    {
      title: 'Isolation transformers',
      body: [
        'Every Ethernet port connects to the cable through transformers, often built into the RJ45 jack, which provide at least 1500 V of isolation between devices. Transformers cannot pass a DC level, which is why Ethernet uses line codes such as Manchester that average to zero.',
      ],
    },
    {
      title: 'Faster Ethernet, same frame',
      body: [
        '100BASE-TX replaced Manchester with 4B5B coding and three-level MLT-3 signaling at 125 Mbaud. 1000BASE-T uses all four pairs in both directions at once, with five-level PAM-5 signaling and echo cancellation. The frame format shown here, from preamble to FCS, is unchanged at every speed.',
      ],
    },
    {
      title: 'Bit order and multicast',
      body: [
        'Because each byte is sent least significant bit first, the very first bit of the destination address on the wire is the individual/group bit. A 1 there marks a multicast or broadcast frame, so a receiver can decide whether to accept the frame after a single bit.',
      ],
    },
  ],
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
        info: 'EtherType: what kind of payload follows (0x0800 is IPv4, 0x86DD is IPv6, 0x88B5 is reserved for local experiments). It is sent most significant byte first.' },
      { bytes: payload, label: `Payload (${payload.length} byte${payload.length === 1 ? '' : 's'})`, kind: 'data', info: 'Payload.' },
      { bytes: new Array(pad).fill(0), label: `Padding (${pad} bytes)`, kind: 'dummy',
        info: `Padding: the payload must be at least 46 bytes so the whole frame is at least 64 bytes. On a shared hub, that minimum length is what guarantees a sender is still transmitting when news of a collision reaches it.` },
      { bytes: fcsBytes, label: `FCS 0x${fcs.toString(16).toUpperCase().padStart(8, '0')}`, kind: 'parity',
        info: 'Frame check sequence: a CRC-32 over everything from the destination address to the end of the padding. The receiver recomputes it and discards the frame if the values differ.' },
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
    const span: Record<string, [number, number]> = {};
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
      span[sec.kind === 'addr' ? (span.dst ? 'src' : 'dst') : sec.label.split(' ')[0].toLowerCase()] = [start, t];
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

    const duration = t + 3;
    const end = t;
    const pad1 = (r: [number, number], before = 4, after = 4): [number, number] => [Math.max(0, r[0] - before), Math.min(duration, r[1] + after)];
    const us = (bitsCount: number) => `${(bitsCount * 0.1).toFixed(1)} µs`;
    const totalBytes = 8 + frame.length + 4;
    const tour: TourStop[] = [
      {
        title: 'Overview',
        text: `One Ethernet frame: ${totalBytes} bytes (${totalBytes * 8} bits), transmitted in ${us(totalBytes * 8)}. The ` +
          'upper trace shows the data bits; the lower trace shows the Manchester-encoded signal on the cable.',
        view: [0, duration], focus: null,
      },
      {
        title: 'Manchester encoding',
        text: 'Each bit contains a transition at its midpoint: low-to-high represents a 1 and high-to-low represents a 0. ' +
          'An additional transition at the bit boundary is inserted where needed to set up the next mid-bit transition; ' +
          'the receiver disregards it. Because every bit contains an edge, the receiver can recover the clock from the data.',
        view: [1, 5],
      },
      {
        title: 'Preamble',
        text: 'Seven bytes of 0x55, producing an alternating 1010… pattern. The preamble carries no data; it provides 56 bits ' +
          'of regular transitions for the receiver to synchronize its clock before the frame begins.',
        view: pad1(span.preamble), focus: span.preamble,
      },
      {
        title: 'Start frame delimiter',
        text: 'A single byte, 0xD5. It continues the preamble pattern except for its final two bits, which are 11 rather than ' +
          '10. This deviation signals that the frame begins with the next bit.',
        view: pad1(span.sfd, 16, 8), focus: span.sfd,
      },
      {
        title: 'Destination address',
        text: `Six bytes identifying the intended recipient: ${macText(dst)}. ${dst.every((b) => b === 0xff)
          ? 'An address of all ones is the broadcast address, which every device on the network accepts.'
          : 'A network interface discards frames whose destination is neither its own address nor the broadcast address.'}`,
        view: pad1(span.dst), focus: span.dst,
      },
      {
        title: 'Source address',
        text: `Six bytes identifying the sender: ${macText(src)}. Switches record the port on which each source address ` +
          'appears, which allows them to forward return traffic to the correct port.',
        view: pad1(span.src), focus: span.src,
      },
      {
        title: 'EtherType',
        text: `Two bytes, 0x${typeText.toUpperCase().padStart(4, '0')}, identifying the payload protocol; for example, 0x0800 ` +
          'is IPv4, 0x86DD is IPv6 and 0x0806 is ARP. Although bits within each byte are sent least significant first, the ' +
          'two bytes of this field are sent most significant byte first.',
        view: pad1(span.type, 8, 8), focus: span.type,
      },
      {
        title: 'Payload',
        text: `The frame's data: ${payload.length} byte${payload.length === 1 ? '' : 's'}. On a typical network, the payload ` +
          'is an IP packet with its own headers.',
        view: pad1(span.payload), focus: span.payload,
      },
      ...(span.padding ? [{
        title: 'Padding',
        text: `${pad} bytes of zeros, added because the payload must be at least 46 bytes. This enforces a minimum frame ` +
          'length of 64 bytes, which on shared-medium networks ensured that a sender was still transmitting when a ' +
          'collision was detected.',
        view: pad1(span.padding), focus: span.padding,
      }] : []),
      {
        title: 'Frame check sequence',
        text: `A CRC-32 computed over the destination address through the end of the padding: 0x${fcs.toString(16).toUpperCase().padStart(8, '0')}. ` +
          'The receiver recomputes the CRC and discards the frame if the values differ. CRC-32 detects all burst errors ' +
          'up to 32 bits long.',
        view: pad1(span.fcs), focus: span.fcs,
      },
      {
        title: 'End of frame',
        text: 'The transmitter holds the line high for approximately two bit periods, then stops driving it, and the line ' +
          'returns to 0 V. After the interframe gap, the next frame may begin with its own preamble.',
        view: [end - 8, duration], focus: [end, end + 2],
      },
    ];

    return { traces: [data.trace, tx.trace], bits, fields, notes, duration, unitTime: 1e-7, minPpu: 8, tour };
  },
};
