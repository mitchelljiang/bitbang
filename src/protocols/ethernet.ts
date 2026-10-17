import type { Bit, Field, Note, Protocol, TourStop } from '../core/types';
import { TraceBuilder, hex } from '../core/util';
import { FRAME_PARAMS, buildFrame } from './ethcommon';

export const ethernet: Protocol = {
  id: 'ethernet',
  name: '10BASE-T',
  fullName: '10 Mbit/s Ethernet over twisted pair (IEEE 802.3i)',
  tags: ['embedded clock', 'differential', 'half duplex', 'full duplex', 'star', 'addressed', 'cable', 'networking', 'Manchester'],
  summary:
    'Ethernet at 10 Mbit/s over twisted-pair cable. It was the first twisted-pair Ethernet standard, from 1990, and most ' +
    'Ethernet ports still support it as their slowest speed. Every bit is Manchester encoded: a 1 is a low-to-high transition in the middle ' +
    'of the bit and a 0 is high-to-low, so the receiver can recover the clock from the data itself. It carries the same ' +
    '[Ethernet frame](?p=ethframe) as every faster Ethernet.',
  usedIn: 'Low-cost microcontroller Ethernet controllers such as the ENC28J60, the 10 Mbit/s mode of most Ethernet ports, and the frame format every faster Ethernet still uses.',
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
        '[100BASE-TX](?p=100base) replaced Manchester with 4B5B coding and three-level MLT-3 signaling at 125 Mbaud. [1000BASE-T](?p=1000baset) uses all four pairs in both directions at once, with five-level PAM-5 signaling and echo cancellation, and [1000BASE-X](?p=1000basex) sends 8b/10b code over fiber. The frame shown here, from preamble to FCS, is unchanged at every speed.',
      ],
    },
    {
      title: 'Bit order and multicast',
      body: [
        'Because each byte is sent least significant bit first, the very first bit of the destination address on the wire is the individual/group bit. A 1 there marks a multicast or broadcast frame, so a receiver can decide whether to accept the frame after a single bit.',
      ],
    },
  ],
  params: FRAME_PARAMS,

  encode(p) {
    const f = buildFrame(p);
    const data = new TraceBuilder('Data', 'z');
    const tx = new TraceBuilder('TX±', 'z');
    tx.trace.levels = ['−2.5 V', '+2.5 V'];
    const bits: Bit[] = [];
    const fields: Field[] = [];
    const notes: Note[] = [];
    const noteFor: Partial<Record<string, string>> = {
      preamble: 'preamble: 1010… so the receiver can lock on',
      sfd: 'SFD ends in 11',
      padding: 'padding up to the 64-byte minimum',
    };

    let t = 1;
    const span: Record<string, [number, number]> = {};
    for (const sec of f.sections) {
      const start = t;
      if (noteFor[sec.id]) notes.push({ lane: 1, t, text: noteFor[sec.id]! });
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
      span[sec.id] = [start, t];
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
    const total = f.bytes.length;
    const tour: TourStop[] = [
      {
        title: 'Overview',
        text: `One Ethernet frame: ${total} bytes (${total * 8} bits), sent in ${(total * 0.8).toFixed(1)} µs at 10 Mbit/s. ` +
          'The upper trace shows the data bits; the lower trace shows the Manchester-encoded signal on the cable.',
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
        text: 'Seven bytes of 0x55: 56 bits of perfectly regular transitions, which a 10BASE-T receiver needs to lock its ' +
          'clock recovery onto the signal before any data arrives. Faster Ethernets lock on during idle instead, but keep ' +
          'the preamble so the frame stays the same.',
        view: [Math.max(0, span.preamble[0] - 2), span.preamble[0] + 24], focus: span.preamble,
      },
      {
        title: 'Start frame delimiter',
        text: 'A single byte, 0xD5. It continues the preamble pattern except for its final two bits, which are 11 rather than ' +
          '10. Those two 1s in a row are the only break in the rhythm, and they mark where the frame begins.',
        view: [span.sfd[0] - 16, span.sfd[1] + 8], focus: span.sfd,
      },
      {
        title: 'The frame',
        text: `Addresses, EtherType, payload, padding and the CRC-32, ${total - 8} bytes in all, each Manchester encoded ` +
          'like the preamble. These fields are the same on every Ethernet; the Ethernet frame page explains each one.',
        view: [span.dst[0] - 4, Math.min(duration, span.fcs[1] + 2)], focus: [span.dst[0], span.fcs[1]],
      },
      {
        title: 'End of frame',
        text: 'The transmitter holds the line high for approximately two bit periods, then stops driving it, and the line ' +
          'returns to 0 V. After the interframe gap of 96 bit times, the next frame may begin with its own preamble.',
        view: [end - 8, duration], focus: [end, end + 2],
      },
    ];

    return { traces: [data.trace, tx.trace], bits, fields, notes, duration, unitTime: 1e-7, minPpu: 8, tour };
  },
};
