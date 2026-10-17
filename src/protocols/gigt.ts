import type { Bit, Field, Protocol, TourStop } from '../core/types';
import { TraceBuilder, hex } from '../core/util';
import { FRAME_PARAMS, buildFrame } from './ethcommon';

/**
 * PAM-5 level for each pair of bits, in Gray code so neighboring levels differ by one bit. This page's own simplified
 * mapping: the standard scrambles the bits and adds a trellis code that also uses level 0. Exported for the checks.
 */
export const PAM5: Record<number, number> = { 0b00: -2, 0b01: -1, 0b11: 1, 0b10: 2 };
export const PAIRS = ['A', 'B', 'C', 'D'];
const IDLE = 4;

export const gigabitT: Protocol = {
  id: '1000baset',
  name: '1000BASE-T',
  fullName: 'Gigabit Ethernet over twisted pair (IEEE 802.3ab)',
  tags: ['embedded clock', 'differential', 'full duplex', 'star', 'addressed', 'cable', 'networking', 'lanes'],
  summary:
    'Ethernet at 1 Gbit/s over the same Cat 5 cable as 100BASE-TX, carrying the same [Ethernet frame](?p=ethframe). It ' +
    'gets ten times the speed by using all four pairs at once, in both directions at the same time, and by sending one of ' +
    'five voltage levels per symbol (PAM-5) at 125 Mbaud. Each pair carries 2 bits per symbol, so each symbol period ' +
    'moves a whole byte. This page shows that structure exactly, but maps bits straight onto levels: the standard also ' +
    'scrambles them and adds an error-correcting trellis code, which makes the real signal look like noise.',
  usedIn: 'Practically every wired port on PCs, laptops, routers and switches made in the last two decades, and gigabit PHY chips such as the RTL8211 and KSZ9031 on embedded Linux boards.',
  facts: {
    clock: 'Embedded. One end is the master and transmits with its own clock; the other, the slave, recovers that clock and transmits in step with it.',
    wires: 'All four twisted pairs in an RJ45 cable, called A, B, C and D, each carrying data in both directions at once.',
    drive: 'Differential, five levels from about −1 V to +1 V (PAM-5). Each end subtracts an estimate of its own transmitted signal, and its echo, from what it receives.',
    duplex: 'Full duplex on every pair at once, using echo cancellation instead of separate pairs per direction.',
    topology: 'Star: every device has its own cable to a switch.',
    addressing: '48-bit MAC addresses, in the frame.',
    flow: 'PAUSE frames on full-duplex links.',
    errors: 'The frame’s CRC-32, plus the trellis code, which lets the receiver correct small noise errors in the symbols before decoding them.',
    speed: '1 Gbit/s: 4 pairs × 125 Mbaud × 2 bits per symbol.',
    reach: '100 m of Cat 5e cable.',
  },
  strengths: [
    'Ten times 100BASE-TX over the same cable, with the same 125 Mbaud symbol rate per pair.',
    'Uses the cable fully: all four pairs, both directions at once.',
    'Autonegotiates with 10 and 100 Mbit/s devices on the same port.',
  ],
  limits: [
    'Needs heavy signal processing in the PHY: echo cancellation, crosstalk cancellation, equalization and a trellis decoder.',
    'Draws noticeably more power than 100BASE-TX, which matters on small embedded boards.',
    'Needs all four pairs connected; a cable wired for 100BASE-TX with two pairs falls back to 100 Mbit/s.',
  ],
  legend: { start: 'preamble / SFD', addr: 'MAC address', cmd: 'EtherType', dummy: 'padding / idle', parity: 'CRC-32' },
  deepDive: [
    {
      title: 'Both directions on every pair',
      body: [
        'Each end transmits on all four pairs while receiving on the same four pairs. A circuit called a hybrid separates the two, and an echo canceller subtracts an estimate of its own signal, including the reflections from connectors along the cable, from what arrives. What remains is the other end’s signal. Without this, 1 Gbit/s would need twice the pairs or twice the symbol rate.',
      ],
    },
    {
      title: 'What this page leaves out',
      body: [
        'The real coding, 8B1Q4, first scrambles the data with a 33-bit shift register so the signal has no patterns, then passes it through an 8-state trellis encoder that adds one bit of redundancy per symbol period. That extra bit is why PAM-5 has five levels instead of four: the receiver uses it to correct symbols that noise pushed toward a neighboring level. Start-of-stream and end-of-stream delimiters replace the edges of the preamble and frame. All of that changes which levels appear, but not the shape shown here: four pairs, five levels, a byte per symbol period.',
      ],
    },
    {
      title: 'Master and slave',
      body: [
        'During autonegotiation, one end becomes the master and the other the slave. The master transmits on its own clock; the slave recovers that clock from the signal and uses it to transmit. Both ends then share one clock, which the echo cancellers need.',
      ],
    },
  ],
  params: FRAME_PARAMS,

  encode(p) {
    const f = buildFrame(p);
    const byteLane = new TraceBuilder('Byte', 'z');
    byteLane.trace.bus = true;
    const pairs = PAIRS.map((n) => {
      const b = new TraceBuilder(`BI_D${n}`, 0);
      b.trace.span = [-2, 2];
      return b;
    });
    const bits: Bit[] = [];
    const fields: Field[] = [];
    const spans: Record<string, [number, number]> = {};
    let t = 1 + IDLE;
    for (const sec of f.sections) {
      const start = t;
      sec.bytes.forEach((byte, n) => {
        byteLane.trace.points.push({ t, v: 1, label: hex(byte) });
        pairs.forEach((pair, k) => {
          const two = (byte >> (2 * k)) & 3;
          const level = PAM5[two];
          pair.set(t, level);
          bits.push({
            lane: 1 + k, t0: t, t1: t + 1, label: two.toString(2).padStart(2, '0'), kind: sec.kind, sample: t + 0.5,
            info: `${sec.info} Byte ${n + 1} of ${sec.bytes.length} (${hex(byte)}): pair ${PAIRS[k]} carries bits ${2 * k + 1} and ${2 * k}, ${two.toString(2).padStart(2, '0')}, sent as level ${level > 0 ? '+' : ''}${level}.`,
          });
        });
        t++;
      });
      fields.push({ lane: 4, t0: start, t1: t, label: sec.label, kind: sec.kind });
      spans[sec.id] = [start, t];
    }
    byteLane.trace.points.push({ t, v: 'z' });
    for (const pair of pairs) pair.set(t, 0);
    const duration = t + IDLE;
    const tour: TourStop[] = [
      {
        title: 'Overview',
        text: `The same ${f.bytes.length}-byte frame in ${f.bytes.length} symbol periods of 8 ns: one byte per period, split ` +
          'across the four pairs. At 10BASE-T’s 10 Mbit/s, the same frame takes 100 times as long.',
        view: [0, duration], focus: null,
      },
      {
        title: 'A byte per symbol period',
        text: 'Each byte is split into four pairs of bits. Pair A carries bits 1 and 0, B bits 3 and 2, C bits 5 and 4, and D ' +
          'bits 7 and 6, all in the same 8 ns.',
        view: [spans.preamble[0] - 1, spans.preamble[0] + 12], focus: [spans.preamble[0], spans.preamble[0] + 1],
      },
      {
        title: 'Five levels',
        text: 'Each pair sends one of five levels per symbol. Two bits need only four, mapped here in Gray code so a small ' +
          'noise error changes only one bit. The real code uses the fifth level for its trellis code, which lets the ' +
          'receiver correct such errors.',
        view: [spans.dst[0] - 1, spans.dst[0] + 14], focus: [spans.dst[0], spans.dst[0] + 6],
      },
      {
        title: 'Both directions at once',
        text: 'While this end sends these symbols, the other end sends its own on the same four pairs. Each receiver ' +
          'subtracts its own signal, and its echo, from what it hears, and keeps what is left.',
        view: [spans.payload[0] - 4, spans.payload[0] + 16], focus: null,
      },
    ];
    return { traces: [byteLane.trace, ...pairs.map((p) => p.trace)], bits, fields, duration, unitTime: 8e-9, minPpu: 14, tour };
  },
};
