import type { Bit, Field, Kind, Note, Protocol, TourStop } from '../core/types';
import { TraceBuilder, hex } from '../core/util';
import { FRAME_PARAMS, buildFrame } from './ethcommon';

/** 4B5B: each 4-bit nibble becomes a 5-bit code group with at least two 1s, so the line never stays still for long. */
export const FOUR_B_FIVE_B = ['11110', '01001', '10100', '10101', '01010', '01011', '01110', '01111',
  '10010', '10011', '10110', '10111', '11010', '11011', '11100', '11101'];
/** The control code groups that frame a packet, and the idle between packets. */
export const CONTROL = { I: '11111', J: '11000', K: '10001', T: '01101', R: '00111' } as const;

/**
 * The 100BASE-TX stream cipher: an 11-bit linear feedback shift register (x^11 + x^9 + 1) whose output is XORed onto
 * every code bit, so long runs of the same pattern don't concentrate energy at one frequency. The receiver runs the
 * same register, locked onto it during idle. Exported for the checks.
 */
export function scrambler(seed = 0x7ff) {
  let s = seed;
  return (bit: number) => {
    const k = ((s >> 10) ^ (s >> 8)) & 1;
    s = ((s << 1) | k) & 0x7ff;
    return bit ^ k;
  };
}

/** MLT-3: a 1 steps to the next level in the cycle 0, +1, 0, −1; a 0 stays. Exported for the checks. */
export function mlt3(code: number[]) {
  const cycle = [0, 1, 0, -1];
  let k = 0;
  return code.map((b) => (b ? cycle[(k = (k + 1) % 4)] : cycle[k]));
}

const IDLE = 4;

export const fastEthernet: Protocol = {
  id: '100base',
  name: '100BASE-TX',
  fullName: 'Fast Ethernet over twisted pair (IEEE 802.3u)',
  tags: ['embedded clock', 'differential', 'full duplex', 'star', 'addressed', 'cable', 'networking'],
  summary:
    'Ethernet at 100 Mbit/s over two twisted pairs, the speed of most microcontroller Ethernet ports. It carries the ' +
    'same [Ethernet frame](?p=ethframe), but replaces Manchester with two steps. 4B5B coding turns every 4 bits into a ' +
    '5-bit code group, adding control codes that mark where a frame starts and ends. Then MLT-3 signaling sends a 1 as ' +
    'a step to the next of three voltage levels, so the cable carries 125 Mbaud with its energy below about 31 MHz.',
  usedIn: 'The Ethernet ports of STM32, ESP32 (with an external PHY), i.MX RT and most other microcontrollers, PHY chips such as the LAN8720 and DP83848, and the 100 Mbit/s mode of every Ethernet port.',
  facts: {
    clock: 'Embedded. 4B5B guarantees transitions often enough for the receiver to recover the clock, and idle code groups keep the receiver locked between frames.',
    wires: 'Two twisted pairs in an RJ45 cable, one to transmit (pins 1 and 2) and one to receive (pins 3 and 6), as in 10BASE-T.',
    drive: 'Differential, three levels: −1 V, 0 V and +1 V, through an isolation transformer.',
    duplex: 'Full duplex on a switch, with a separate pair for each direction.',
    topology: 'Star: every device has its own cable to a switch.',
    addressing: '48-bit MAC addresses, in the frame.',
    flow: 'PAUSE frames on full-duplex links.',
    errors: 'The frame’s CRC-32, plus invalid code groups: a receiver that sees a 5-bit pattern outside the table knows the signal was corrupted.',
    speed: '100 Mbit/s of data, 125 Mbaud on the cable, because 4B5B sends 5 bits for every 4.',
    reach: '100 m of Cat 5 cable.',
  },
  strengths: [
    'Ten times the speed of 10BASE-T on the same two pairs, with the same frame.',
    'MLT-3 needs only a quarter of the bandwidth of the bit rate, which is what lets 125 Mbaud travel over Cat 5 cable.',
    'Control code groups mark frame boundaries and idle, so the receiver always knows where it is.',
  ],
  limits: [
    'Uses only two of the four pairs in the cable.',
    '4B5B spends 20% of the signal on coding: 125 Mbaud carries 100 Mbit/s.',
    'Needs a scrambler and an equalizer in the receiver, so the PHY is far more complex than 10BASE-T’s.',
  ],
  legend: { start: 'J K / T R delimiters', addr: 'MAC address', cmd: 'EtherType', dummy: 'padding', parity: 'CRC-32' },
  deepDive: [
    {
      title: 'Why 4B5B',
      body: [
        'Of the 32 possible 5-bit patterns, 4B5B uses the 16 that have no more than one leading 0 and no more than two trailing 0s, so even a run of code groups has no more than three 0s in a row. Since MLT-3 changes level on every 1, the receiver sees a step at least every four bit times. The remaining patterns provide control codes: J and K start a stream, T and R end it, and 11111 is idle.',
      ],
    },
    {
      title: 'Why MLT-3',
      body: [
        'MLT-3 cycles through 0, +1, 0, −1, and moves one step for each 1. Even a stream of all 1s takes four bit times to complete one full cycle, so the highest frequency on the cable is a quarter of the bit rate: 31.25 MHz at 125 Mbaud. That keeps the signal within what Cat 5 cable carries well, and reduces radiated noise.',
      ],
    },
    {
      title: 'The scrambler',
      body: [
        'A stream of idle code groups or a long run of the same data would put most of the energy at a few frequencies, which radiates as interference. 100BASE-TX XORs every code bit with the output of an 11-bit shift register, spreading the energy evenly. The receiver runs an identical register and locks it onto the incoming idle pattern, then undoes the scrambling. Turn the scrambler setting on to see the real cable signal; it is off by default so the MLT-3 steps follow the code groups visibly.',
      ],
    },
    {
      title: 'Autonegotiation',
      body: [
        'Before any frames are sent, the two ends exchange bursts of fast link pulses that advertise the speeds and duplex modes each supports, and both pick the best they have in common. That is how a 100BASE-TX port connects to a 10BASE-T device, or a gigabit port to a 100 Mbit/s one.',
      ],
    },
  ],
  params: [
    ...FRAME_PARAMS,
    {
      key: 'scramble', label: 'Scrambler', help: 'Whether to apply the scrambler, as a real 100BASE-TX transmitter always does. Off shows the code groups directly in the MLT-3 signal, which is easier to follow.', type: 'select', default: 'off',
      options: [{ value: 'off', label: 'Off (clearer)' }, { value: 'on', label: 'On (as on the cable)' }],
    },
  ],

  encode(p) {
    const f = buildFrame(p);
    const scrambled = p.scramble === 'on';
    // The code groups: idle, then J K in place of the first preamble byte, every remaining byte as two nibbles (low
    // first), then T R and idle again.
    const groups: { code: string; nibble: string; kind: Kind; info: string }[] = [];
    const idle = () => groups.push({ code: CONTROL.I, nibble: 'I', kind: 'dummy', info: 'Idle code group, 11111, sent continuously between frames so the receiver stays locked.' });
    for (let k = 0; k < IDLE; k++) idle();
    groups.push({ code: CONTROL.J, nibble: 'J', kind: 'start', info: 'J, the first half of the start-of-stream delimiter. J and K replace the first byte of the preamble.' });
    groups.push({ code: CONTROL.K, nibble: 'K', kind: 'start', info: 'K, the second half of the start-of-stream delimiter: the frame’s data follows.' });
    const sectionAt: { kind: Kind; info: string; byte: number; n: number; of: number }[] = [];
    f.sections.forEach((sec) => sec.bytes.forEach((byte, n) => sectionAt.push({ kind: sec.kind, info: sec.info, byte, n, of: sec.bytes.length })));
    const spans: Record<string, [number, number]> = {};
    sectionAt.slice(1).forEach((s) => {
      for (const half of [s.byte & 0xf, s.byte >> 4]) {
        groups.push({ code: FOUR_B_FIVE_B[half], nibble: half.toString(16).toUpperCase(), kind: s.kind,
          info: `${s.info} Byte ${s.n + 1} of ${s.of} (${hex(s.byte)}), ${half === (s.byte & 0xf) ? 'low' : 'high'} nibble ${half.toString(16).toUpperCase()}h, sent as ${FOUR_B_FIVE_B[half]}.` });
      }
    });
    groups.push({ code: CONTROL.T, nibble: 'T', kind: 'stop', info: 'T, the first half of the end-of-stream delimiter.' });
    groups.push({ code: CONTROL.R, nibble: 'R', kind: 'stop', info: 'R, the second half of the end-of-stream delimiter. Idle follows.' });
    for (let k = 0; k < IDLE; k++) idle();

    const nib = new TraceBuilder('Code', 'z');
    nib.trace.bus = true;
    const code = new TraceBuilder('4B5B', 0);
    const scr = new TraceBuilder('Scrambled', 0);
    const tx = new TraceBuilder('TX±', 0);
    tx.trace.span = [-1, 1];
    tx.trace.levels = ['−1 V', '+1 V'];
    const bits: Bit[] = [];
    const fields: Field[] = [];
    const notes: Note[] = [];
    const xor = scrambler();
    const stream: number[] = [];
    let t = 1;
    groups.forEach((g, gi) => {
      nib.trace.points.push({ t, v: 1, label: g.nibble });
      [...g.code].forEach((c, i) => {
        const b = +c;
        code.set(t, b as 0 | 1);
        const s = scrambled ? xor(b) : b;
        scr.set(t, s as 0 | 1);
        stream.push(s);
        bits.push({
          lane: 1, t0: t, t1: t + 1, label: `${i}`, kind: g.kind, sample: t + 0.5,
          info: `${g.info} Code bit ${i + 1} of 5 = ${b}.${scrambled ? ` After the scrambler it is ${s}.` : ''} On the cable, ${s ? 'a 1 moves MLT-3 to its next level' : 'a 0 leaves MLT-3 where it is'}.`,
        });
        t++;
      });
      void gi;
    });
    nib.trace.points.push({ t, v: 'z' });
    const levels = mlt3(stream);
    levels.forEach((v, k) => tx.set(1 + k, v));

    // Fields over the code bits: delimiters, then each frame section (two code groups per byte).
    let at = 1 + IDLE * 5;
    fields.push({ lane: 1, t0: at, t1: at + 10, label: 'J K', kind: 'start' });
    spans.jk = [at, at + 10];
    at += 10;
    f.sections.forEach((sec, k) => {
      const n = (k === 0 ? sec.bytes.length - 1 : sec.bytes.length) * 10;
      if (n) fields.push({ lane: 1, t0: at, t1: at + n, label: k === 0 ? 'Preamble (6 × 0x55)' : sec.label, kind: sec.kind });
      spans[sec.id] = [at, at + n];
      at += n;
    });
    fields.push({ lane: 1, t0: at, t1: at + 10, label: 'T R', kind: 'stop' });
    spans.tr = [at, at + 10];
    notes.push({ lane: 1, t: spans.jk[0], text: 'J K: start of stream' }, { lane: 1, t: spans.tr[0], text: 'T R: end of stream' });

    const duration = t + 1;
    const traces = scrambled ? [nib.trace, code.trace, scr.trace, tx.trace] : [nib.trace, code.trace, tx.trace];
    const total = f.bytes.length;
    const tour: TourStop[] = [
      {
        title: 'Overview',
        text: `The same ${total}-byte frame as on the 10BASE-T page, sent as ${groups.length - 2 * IDLE} code groups of 5 bits at ` +
          `125 Mbaud. Each byte becomes two code groups, low nibble first, and the bottom trace is the three-level MLT-3 signal on the cable.`,
        view: [0, duration], focus: null,
      },
      {
        title: 'Idle',
        text: 'Between frames the transmitter sends idle code groups, 11111, continuously. Unlike 10BASE-T, the line is never quiet, ' +
          'so the receiver stays locked onto the signal and a frame can start without a long preamble to synchronize on.',
        view: [0, 1 + IDLE * 5 + 4], focus: [1, 1 + IDLE * 5],
      },
      {
        title: 'Start of stream: J K',
        text: 'Two control code groups, J (11000) and K (10001), replace the first byte of the preamble. Neither is a data ' +
          'code, so they mark the start of a frame unambiguously.',
        view: [spans.jk[0] - 6, spans.jk[1] + 10], focus: spans.jk,
      },
      {
        title: '4B5B code groups',
        text: 'Each nibble is replaced by a 5-bit code group from a fixed table. The table only uses patterns with plenty of ' +
          '1s, so there are never more than three 0s in a row, and the receiver sees a step often enough to stay in time.',
        view: [spans.dst[0] - 2, spans.dst[0] + 22], focus: [spans.dst[0], spans.dst[0] + 20],
      },
      {
        title: 'MLT-3',
        text: 'The cable signal moves one step through the cycle 0, +1, 0, −1 for every 1 and stays put for every 0. A full ' +
          'cycle takes at least four bits, so the highest frequency on the cable is only 31.25 MHz, a quarter of the bit rate.',
        view: [spans.dst[0] - 2, spans.dst[0] + 22], focus: [spans.dst[0], spans.dst[0] + 20],
      },
      {
        title: 'End of stream: T R',
        text: 'After the CRC, T (01101) and R (00111) mark the end of the frame, and idle resumes.',
        view: [spans.tr[0] - 10, Math.min(duration, spans.tr[1] + 12)], focus: spans.tr,
      },
    ];
    return { traces, bits, fields, notes, duration, unitTime: 8e-9, minPpu: 8, tour };
  },
};
