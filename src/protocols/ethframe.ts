import type { Bit, Field, Protocol, TourStop } from '../core/types';
import { TraceBuilder, hex } from '../core/util';
import { FRAME_PARAMS, buildFrame, macText } from './ethcommon';

/**
 * The Ethernet frame on its own: the bytes and bits every Ethernet sends, in the order it sends them, before any
 * physical layer turns them into a signal. Timing is shown at 100 Mbit/s, the most common speed.
 */
export const ethframe: Protocol = {
  id: 'ethframe',
  name: 'Ethernet frame',
  fullName: 'The IEEE 802.3 MAC frame',
  tags: ['embedded clock', 'differential', 'full duplex', 'star', 'addressed', 'cable', 'networking'],
  summary:
    'Every Ethernet, from 10 Mbit/s over copper to 400 Gbit/s over fiber, sends the same frame: a preamble, the ' +
    'destination and source MAC addresses, an EtherType, a payload of 46 to 1500 bytes, and a CRC-32. This page shows ' +
    'the frame as bits, in the order they are sent. The physical layer pages, starting with [10BASE-T](?p=ethernet), ' +
    'show how each one puts these same bits on the wire.',
  usedIn: 'Every wired network port, Wi-Fi bridges (which carry the same addresses and EtherType), and industrial networks such as EtherCAT and PROFINET.',
  facts: {
    clock: 'Not part of the frame. Each physical layer has its own way to recover the clock; the preamble gives the oldest ones time to lock on.',
    wires: 'Not part of the frame: 10BASE-T and 100BASE-TX use two pairs, 1000BASE-T uses all four, and 1000BASE-X uses a fiber pair.',
    drive: 'Set by the physical layer: Manchester, MLT-3, PAM-5 or light pulses.',
    duplex: 'Full duplex on a switched link; half duplex with collision detection on an old shared hub.',
    topology: 'Star, through switches. A switch learns which port each source address is on and forwards frames only where they need to go.',
    addressing: '48-bit MAC addresses for the destination and the source. All ones (ff:ff:ff:ff:ff:ff) is broadcast, and a 1 in the first bit sent marks multicast.',
    flow: 'None in the frame. Full-duplex links can send PAUSE frames, which are themselves Ethernet frames with EtherType 0x8808.',
    errors: 'A CRC-32 (the frame check sequence) over every byte from the destination address to the end of the payload. Damaged frames are dropped, not repaired.',
    speed: 'The frame is the same at every speed; this page draws it at 100 Mbit/s, 10 ns per bit.',
    reach: 'Set by the physical layer: 100 m on twisted pair, kilometres on fiber.',
  },
  strengths: [
    'One format at every speed and on every medium, so switches can connect 10 Mbit/s devices to 100 Gbit/s ones.',
    'Globally unique 48-bit addresses, assigned to manufacturers, so devices need no configuration to talk on a local network.',
    'A strong CRC-32 that catches every burst error up to 32 bits long.',
  ],
  limits: [
    'At least 84 bytes on the wire for even a 1-byte message, counting the preamble, padding and the gap between frames.',
    'No delivery guarantee: a damaged or dropped frame is gone unless a higher layer, such as TCP, sends it again.',
    'A maximum payload of 1500 bytes, unless both ends agree on jumbo frames.',
  ],
  legend: { start: 'preamble / SFD', addr: 'MAC address', cmd: 'EtherType', dummy: 'padding', parity: 'CRC-32' },
  deepDive: [
    {
      title: 'Bit order and multicast',
      body: [
        'Bytes are sent in order, and each byte least significant bit first. So the first bit of the destination address on the wire is the individual/group bit: a 1 there marks a multicast or broadcast frame, and a receiver can decide whether the frame might be for it after a single bit. The EtherType and the CRC are the exceptions to reading left to right: the EtherType goes most significant byte first, and the CRC least significant byte first.',
      ],
    },
    {
      title: 'EtherType or length',
      body: [
        'The two bytes after the source address have two meanings. A value of 1536 (0x0600) or more is an EtherType, which names the payload protocol. A value of 1500 or less is the length of the payload, used by the original IEEE 802.3 format, where an 802.2 LLC header inside the payload names the protocol instead. Almost all traffic today uses EtherTypes.',
      ],
    },
    {
      title: 'VLAN tags',
      body: [
        'A switch can add a 4-byte 802.1Q tag between the source address and the EtherType: the value 0x8100, then a 3-bit priority and a 12-bit VLAN number. VLANs split one physical network into separate logical ones, and the priority lets time-sensitive traffic go first.',
      ],
    },
    {
      title: 'Minimum and maximum size',
      body: [
        'From the destination address to the FCS, a frame is 64 to 1518 bytes (1522 with a VLAN tag). The minimum comes from the original shared-cable Ethernet: a frame had to last long enough for a collision at the far end of the network to be detected before the sender finished. Switched links no longer collide, but the minimum stayed, so every Ethernet can still interoperate.',
      ],
    },
  ],
  params: FRAME_PARAMS,

  encode(p) {
    const f = buildFrame(p);
    const bytes = new TraceBuilder('Byte', 'z');
    bytes.trace.bus = true;
    const line = new TraceBuilder('Bits', 'z');
    const bits: Bit[] = [];
    const fields: Field[] = [];
    const span: Record<string, [number, number]> = {};
    let t = 1;
    for (const sec of f.sections) {
      const start = t;
      sec.bytes.forEach((byte, n) => {
        bytes.trace.points.push({ t, v: 1, label: hex(byte) });
        for (let i = 0; i < 8; i++) {
          const v = ((byte >> i) & 1) as 0 | 1;
          line.set(t, v);
          bits.push({
            lane: 1, t0: t, t1: t + 1, label: `${i}`, kind: sec.kind, sample: t + 0.5,
            info: `${sec.info} Byte ${n + 1} of ${sec.bytes.length} (${hex(byte)}), bit ${i} = ${v}. Each byte goes out least significant bit first.`,
          });
          t++;
        }
      });
      fields.push({ lane: 1, t0: start, t1: t, label: sec.label, kind: sec.kind });
      span[sec.id] = [start, t];
    }
    bytes.trace.points.push({ t, v: 'z' });
    line.set(t, 'z');
    const duration = t + 2;
    const around = (r: [number, number], before = 4, after = 4): [number, number] => [Math.max(0, r[0] - before), Math.min(duration, r[1] + after)];
    const total = f.bytes.length;
    const broadcast = f.dst.every((b) => b === 0xff);
    const tour: TourStop[] = [
      {
        title: 'Overview',
        text: `One frame: ${total} bytes, ${total * 8} bits, in the order they are sent. Every Ethernet sends exactly these ` +
          'bits; the physical layer decides only how each one looks on the wire.',
        view: [0, duration], focus: null,
      },
      {
        title: 'Preamble',
        text: 'Seven bytes of 0x55. Sent least significant bit first, each is 10101010, so the preamble is a steady ' +
          'alternating pattern that carries no data and gives a receiver time to lock onto the signal.',
        view: around(span.preamble, 2, 4), focus: span.preamble,
      },
      {
        title: 'Start frame delimiter',
        text: 'One byte, 0xD5: the same alternating pattern except for its last two bits, 11. That break in the rhythm marks ' +
          'the start of the frame.',
        view: around(span.sfd, 16, 8), focus: span.sfd,
      },
      {
        title: 'Destination address',
        text: `Six bytes: ${macText(f.dst)}. ${broadcast
          ? 'All ones is the broadcast address, which every device accepts.'
          : 'A network interface ignores frames whose destination is neither its own address, a group it has joined, nor broadcast.'}` +
          ' The very first bit sent is the individual/group bit, so multicast is recognizable immediately.',
        view: around(span.dst), focus: span.dst,
      },
      {
        title: 'Source address',
        text: `Six bytes: ${macText(f.src)}. Switches note which port each source address arrives on, and use it to send ` +
          'replies only to that port.',
        view: around(span.src), focus: span.src,
      },
      {
        title: 'EtherType',
        text: `Two bytes, 0x${f.typeHex}, naming the payload protocol: 0x0800 is IPv4, 0x86DD is IPv6 and 0x0806 is ARP. ` +
          'Unlike the bits within each byte, the two bytes go most significant first.',
        view: around(span.type, 8, 8), focus: span.type,
      },
      {
        title: 'Payload',
        text: `The data: ${f.payload.length} byte${f.payload.length === 1 ? '' : 's'}. On most networks it is an IP packet, ` +
          'with headers of its own.',
        view: around(span.payload), focus: span.payload,
      },
      ...(span.padding ? [{
        title: 'Padding',
        text: `${f.pad} bytes of zeros, because the payload must be at least 46 bytes, which makes every frame at least 64 ` +
          'bytes from the destination address to the FCS.',
        view: around(span.padding), focus: span.padding,
      }] : []),
      {
        title: 'Frame check sequence',
        text: `A CRC-32 over the destination address through the padding: 0x${f.fcsHex}, sent least significant byte first. ` +
          'The receiver computes the same CRC over what it received, and drops the frame if they differ.',
        view: around(span.fcs), focus: span.fcs,
      },
    ];
    return { traces: [bytes.trace, line.trace], bits, fields, duration, unitTime: 1e-8, minPpu: 8, tour };
  },
};
