import type { Bit, Field, Kind, Note, Protocol, TourStop } from '../core/types';
import { TraceBuilder, hex, parseBytes } from '../core/util';

/*
 * 8b/10b encoding (Widmer–Franaszek), as used by PCIe Gen1 and Gen2.
 * Each table entry is [code for RD−, code for RD+], bits in transmission order (a b c d e i / f g h j).
 */
const D6: [string, string][] = [
  ['100111', '011000'], ['011101', '100010'], ['101101', '010010'], ['110001', '110001'],
  ['110101', '001010'], ['101001', '101001'], ['011001', '011001'], ['111000', '000111'],
  ['111001', '000110'], ['100101', '100101'], ['010101', '010101'], ['110100', '110100'],
  ['001101', '001101'], ['101100', '101100'], ['011100', '011100'], ['010111', '101000'],
  ['011011', '100100'], ['100011', '100011'], ['010011', '010011'], ['110010', '110010'],
  ['001011', '001011'], ['101010', '101010'], ['011010', '011010'], ['111010', '000101'],
  ['110011', '001100'], ['100110', '100110'], ['010110', '010110'], ['110110', '001001'],
  ['001110', '001110'], ['101110', '010001'], ['011110', '100001'], ['101011', '010100'],
];
const K28_6: [string, string] = ['001111', '110000'];
const D4: [string, string][] = [
  ['1011', '0100'], ['1001', '1001'], ['0101', '0101'], ['1100', '0011'],
  ['1101', '0010'], ['1010', '1010'], ['0110', '0110'], ['1110', '0001'],
];
const D4_A7: [string, string] = ['0111', '1000'];
const K4: [string, string][] = [
  ['1011', '0100'], ['0110', '1001'], ['1010', '0101'], ['1100', '0011'],
  ['1101', '0010'], ['0101', '1010'], ['1001', '0110'], ['0111', '1000'],
];

type RD = -1 | 1;
const ones = (s: string) => [...s].filter((c) => c === '1').length;
const pick = (pair: [string, string], rd: RD) => (rd < 0 ? pair[0] : pair[1]);
/** A sub-block with more 1s than 0s leaves RD positive, more 0s leaves it negative, and a balanced one leaves it alone. */
const nextRd = (code: string, rd: RD): RD => (ones(code) * 2 === code.length ? rd : ones(code) * 2 > code.length ? 1 : -1);

/** Encodes one byte as a 10-bit symbol. Returns the code and the running disparity after it. */
export function encode8b10b(byte: number, k: boolean, rd: RD): { code: string; rd: RD } {
  const x = byte & 0x1f;
  const y = byte >> 5;
  const six = k && x === 28 ? pick(K28_6, rd) : pick(D6[x], rd);
  const mid = nextRd(six, rd);
  let four: string;
  if (k) four = pick(K4[y], mid);
  else if (y === 7 && ((mid < 0 && (x === 17 || x === 18 || x === 20)) || (mid > 0 && (x === 11 || x === 13 || x === 14)))) {
    four = pick(D4_A7, mid); // the alternate D.x.A7 avoids a run of five identical bits across the boundary
  } else four = pick(D4[y], mid);
  return { code: six + four, rd: nextRd(four, mid) };
}

const name = (byte: number, k: boolean) => `${k ? 'K' : 'D'}${byte & 0x1f}.${byte >> 5}`;

type Sym = { byte: number; k: boolean; label: string; kind: Kind; info: string };

const COM = (info: string): Sym => ({ byte: 0xbc, k: true, label: 'COM', kind: 'start', info });
const PAD = (what: string): Sym => ({
  byte: 0xf7, k: true, label: 'PAD', kind: 'dummy',
  info: `PAD (K23.7) in the ${what} field: during the first stage of training, the link and lane numbers have not been assigned yet.`,
});

export const pcie: Protocol = {
  id: 'pcie',
  name: 'PCIe',
  fullName: 'PCI Express',
  summary:
    'A serial, point-to-point link built from lanes, each a differential pair in each direction. There is no clock ' +
    'wire: the receiver recovers timing from transitions in the data. Gen1 and Gen2 guarantee those transitions with ' +
    '8b/10b encoding, which maps every byte to a 10-bit symbol; this diagram shows one lane at that level.',
  usedIn: 'Graphics cards, NVMe SSDs, network adapters, M.2 Wi-Fi modules, and Thunderbolt and USB4 tunnels.',
  facts: {
    clock: 'Embedded. Both ends share a 100 MHz reference clock, but the receiver recovers bit timing from the data transitions with a clock and data recovery (CDR) circuit.',
    wires: 'Per lane, one differential pair for each direction. Links are x1, x2, x4, x8 or x16 lanes, plus a reference clock pair and sideband signals such as PERST#.',
    drive: 'Differential and low-swing (roughly 0.8 to 1.2 V peak-to-peak differential), AC-coupled through capacitors at the transmitter.',
    duplex: 'Full duplex: each direction of each lane has its own pair.',
    topology: 'Point-to-point links. A root complex at the CPU connects to devices directly or through switches, forming a tree.',
    addressing: 'Packets (TLPs) are routed by memory address or by bus, device and function number, in the packet header.',
    flow: 'Credit-based: each receiver advertises how much buffer space it has, and a transmitter never sends more than it has credit for.',
    errors: 'Every TLP carries an LCRC, and the data link layer acknowledges each one and replays any that fail. 8b/10b also detects invalid symbols.',
    speed: 'Per lane and direction: Gen1 2.5 GT/s (250 MB/s), Gen2 5 GT/s (500 MB/s), Gen3 8 GT/s with 128b/130b (about 985 MB/s), doubling each generation to Gen6 at 64 GT/s with PAM4 signaling.',
    reach: 'Board traces and connectors, typically tens of centimeters; retimers and cables extend it.',
  },
  strengths: [
    'Scales from one lane to sixteen with the same protocol.',
    'Very high bandwidth with reliable delivery: corrupted packets are retransmitted automatically.',
    'Software-compatible with the original PCI configuration model.',
  ],
  limits: [
    'Complex: link training, three protocol layers and strict signal-integrity requirements.',
    'Requires dedicated transceiver hardware; it cannot be bit-banged.',
    '8b/10b spends 20% of the line rate on encoding, which is why Gen3 moved to 128b/130b.',
  ],
  deepDive: [
    {
      title: 'Why 8b/10b',
      body: [
        'A receiver that recovers its clock from the data needs regular transitions, and an AC-coupled link needs the ' +
        'signal to average to zero. 8b/10b provides both: every 10-bit symbol contains either five 1s, or four or six, ' +
        'and the line never carries more than five identical bits in a row.',
        'The encoder tracks the running disparity (RD), the running excess of 1s over 0s. When the next symbol has an ' +
        'unbalanced code, the encoder picks the variant that pushes RD back toward zero, so RD only ever alternates ' +
        'between −1 and +1.',
      ],
    },
    {
      title: 'Symbols and the comma',
      body: [
        'A symbol is named Dx.y or Kx.y: x is the value of the low 5 bits and y the value of the high 3 bits. D symbols ' +
        'carry data bytes; K symbols are control characters with no data meaning. K28.5, called COM, contains the bit ' +
        'pattern 0011111 or 1100000, which cannot occur anywhere else in a valid stream. The receiver uses it to find ' +
        'symbol boundaries, a process called symbol lock.',
      ],
    },
    {
      title: 'Link training',
      body: [
        'After reset, each lane transmits training sequences: TS1 and TS2 ordered sets of 16 symbols. They establish bit ' +
        'and symbol lock, negotiate the link width and data rate, assign link and lane numbers, and correct lane ' +
        'reversal and polarity inversion. Only after training completes are packets exchanged.',
      ],
    },
    {
      title: 'Scrambling',
      body: [
        'Real links also scramble every data byte with a 16-bit LFSR before 8b/10b encoding, so long repeated data does ' +
        'not concentrate radiated energy at a few frequencies. K symbols are not scrambled, and COM resets the scrambler. ' +
        'This diagram shows unscrambled bytes so the encoding is easier to follow.',
      ],
    },
    {
      title: 'Gen3 and later',
      body: [
        'From Gen3, PCIe replaced 8b/10b with 128b/130b: a 2-bit sync header followed by 128 scrambled bits, reducing the ' +
        'overhead from 20% to about 1.5%. Transition density then relies on scrambling alone. Gen6 changes again, to ' +
        'PAM4 signaling with fixed-size FLITs and forward error correction.',
      ],
    },
  ],
  legend: { start: 'COM (comma)', dummy: 'PAD / SKP', addr: 'link / lane number', cmd: 'training parameters', data: 'data / identifier' },
  params: [
    {
      key: 'content', label: 'Lane carries', type: 'select', default: 'ts1',
      options: [
        { value: 'ts1', label: 'TS1 training set' },
        { value: 'skp', label: 'SKP ordered set' },
        { value: 'data', label: 'Data bytes (8b/10b)' },
      ],
    },
    { key: 'data', label: 'Bytes', type: 'text', default: 'DE AD BE EF', placeholder: 'DE AD BE EF (for data bytes)' },
    {
      key: 'lanes', label: 'Link width', type: 'select', default: '1',
      options: ['1', '2', '4', '8'].map((n) => ({ value: n, label: `x${n}` })),
    },
    {
      key: 'rate', label: 'Generation', type: 'select', default: '2.5',
      options: [{ value: '2.5', label: 'Gen1 (2.5 GT/s)' }, { value: '5', label: 'Gen2 (5 GT/s)' }],
    },
    {
      key: 'rd', label: 'Starting RD', type: 'select', default: '-1',
      options: [{ value: '-1', label: 'RD− (negative)' }, { value: '1', label: 'RD+ (positive)' }],
    },
  ],

  encode(p) {
    const content = p.content;
    let symbols: Sym[];
    if (content === 'skp') {
      symbols = [
        COM('COM (K28.5) begins the SKP ordered set.'),
        ...[1, 2, 3].map(() => ({
          byte: 0x1c, k: true, label: 'SKP', kind: 'dummy' as Kind,
          info: 'SKP (K28.0). The two ends of a link run from clocks that differ slightly, so each receiver has an ' +
            'elastic buffer that can drop or add SKP symbols to compensate. Transmitters send a SKP ordered set at ' +
            'regular intervals.',
        })),
      ];
    } else if (content === 'data') {
      symbols = parseBytes(p.data, 'hex').map((b) => ({
        byte: b, k: false, label: hex(b), kind: 'data' as Kind,
        info: `Data byte ${hex(b)}, encoded as ${name(b, false)}.`,
      }));
    } else {
      symbols = [
        COM('COM (K28.5) begins the TS1 ordered set and marks the symbol boundary.'),
        PAD('link number'),
        PAD('lane number'),
        { byte: 0x80, k: false, label: 'N_FTS', kind: 'cmd', info: 'N_FTS = 0x80: the number of fast training sequences this receiver needs to regain lock when leaving a low-power state.' },
        { byte: 0x06, k: false, label: 'Rate', kind: 'cmd', info: 'Data rate identifier 0x06: this port supports 2.5 GT/s and 5 GT/s.' },
        { byte: 0x00, k: false, label: 'Ctrl', kind: 'cmd', info: 'Training control 0x00: no hot reset, loopback, disable link or scrambling-disable request.' },
        ...Array.from({ length: 10 }, (_, i) => ({
          byte: 0x4a, k: false, label: 'ID', kind: 'data' as Kind,
          info: `TS1 identifier ${i + 1} of 10: D10.2 (0x4A). Its code, 0101010101, is balanced and alternates every bit, ` +
            'which gives the receiver many transitions to train its clock recovery on.',
        })),
      ];
    }

    const lanes = +p.lanes || 1;
    // Ordered sets go out on every lane at once. Data bytes are striped: byte k goes to lane k mod N,
    // and lanes left without a byte in the last round send PAD.
    const perLane: Sym[][] = Array.from({ length: lanes }, () => []);
    if (content === 'data') {
      symbols.forEach((s, k) => perLane[k % lanes].push({
        ...s,
        info: lanes > 1 ? `${s.info} As byte ${k} of the packet, it goes to lane ${k % lanes} (byte number mod ${lanes}).` : s.info,
      }));
      const longest = Math.max(...perLane.map((l) => l.length));
      for (const l of perLane) while (l.length < longest) l.push(PAD('final striping round'));
    } else {
      for (const l of perLane) l.push(...symbols);
    }

    const traces = [];
    const bits: Bit[] = [];
    const fields: Field[] = [];
    const notes: Note[] = [];
    const letters = 'abcdeifghj';
    let t = 1;
    for (let lane = 0; lane < lanes; lane++) {
      const tx = new TraceBuilder(lanes > 1 ? `L${lane} TX±` : 'TX±', 0);
      tx.trace.levels = ['−', '+'];
      let rd = (+p.rd < 0 ? -1 : 1) as RD;
      t = 1;
      for (const s of perLane[lane]) {
        const before = rd;
        const out = encode8b10b(s.byte, s.k, rd);
        rd = out.rd;
        const start = t;
        [...out.code].forEach((c, i) => {
          const v = +c as 0 | 1;
          tx.set(t, v);
          bits.push({
            lane, t0: t, t1: t + 1, label: letters[i], kind: s.kind, sample: t + 0.5,
            info: `${s.info} Bit ${letters[i]} = ${v} of ${out.code.slice(0, 6)} ${out.code.slice(6)}. ` +
              `${i < 6 ? 'The first six bits encode the low 5 bits of the byte' : 'The last four bits encode the high 3 bits'}. ` +
              `Running disparity on this lane was ${before < 0 ? 'RD−' : 'RD+'} before this symbol and is ${rd < 0 ? 'RD−' : 'RD+'} after it.`,
          });
          t++;
        });
        fields.push({ lane, t0: start, t1: t, label: `${s.label} ${name(s.byte, s.k)}`, kind: s.kind });
      }
      traces.push(tx.trace);
    }
    if (perLane[0][0]?.k && perLane[0][0].byte === 0xbc) notes.push({ lane: 0, t: 3, text: 'comma: 11111 (or 00000) marks the symbol boundary' });

    const ui = 1 / (+p.rate * 1e9);
    const lane0 = fields.filter((f) => f.lane === 0);
    const count = perLane[0].length;
    const tour: TourStop[] = [
      { title: 'Overview', text: `${lanes > 1 ? `A x${lanes} link: ${lanes} lanes, each its own serial link. ` : ''}${count} symbols per ` +
        `lane, ${count * 10} bits at ${p.rate} GT/s (${(ui * 1e12).toFixed(0)} ps per bit). Each 8-bit value is transmitted as a 10-bit symbol.`,
      view: [0, t + 1], focus: null },
      { title: `First symbol: ${lane0[0].label}`, text: `The 10-bit code splits into a 6-bit sub-block for the low five bits and ` +
        'a 4-bit sub-block for the high three. Each sub-block has one or two possible codes, chosen by the running disparity.',
      view: [0, 12], focus: [lane0[0].t0, lane0[0].t1] },
    ];
    if (lanes > 1) {
      tour.push({
        title: content === 'data' ? 'Byte striping' : 'Every lane at once',
        text: content === 'data'
          ? `Consecutive bytes go to consecutive lanes: byte 0 to lane 0, byte 1 to lane 1, and so on, wrapping after lane ${lanes - 1}. ` +
            'Each lane encodes its bytes with its own running disparity and recovers its own clock, so the lanes do not need to ' +
            'arrive in step: the receiver realigns them using the COM symbols of ordered sets.'
          : 'Ordered sets are transmitted on every lane simultaneously. The receiver uses the COM symbols to align the lanes ' +
            'with each other, because each lane may arrive with a different delay.',
        view: [0, Math.min(t + 1, 42)], focus: [lane0[0].t0, Math.min(t, 41)],
      });
    }
    if (content === 'ts1') {
      tour.push(
        { title: 'Link and lane numbers', text: 'Two PAD symbols: during the first stage of link training, the link and lane numbers are not yet assigned.', view: [lane0[1].t0 - 2, lane0[2].t1 + 2], focus: [lane0[1].t0, lane0[2].t1] },
        { title: 'Training parameters', text: 'N_FTS, the supported data rates and the training control bits. Both ends compare these to agree on how the link will operate.', view: [lane0[3].t0 - 2, lane0[5].t1 + 2], focus: [lane0[3].t0, lane0[5].t1] },
        { title: 'TS1 identifier', text: 'Ten D10.2 symbols identify this as a TS1. D10.2 encodes as 0101010101 regardless of running disparity: perfectly balanced, with a transition on every bit.', view: [lane0[6].t0 - 2, t + 1], focus: [lane0[6].t0, t] },
      );
    } else if (lane0.length > 1) {
      tour.push({ title: 'Running disparity', text: 'Following a lane through its symbols, the counts of 1s and 0s never drift apart by more than one symbol\'s worth: whenever a symbol has more of one value, the next unbalanced symbol is chosen to have more of the other.', view: [0, t + 1], focus: [lane0[1].t0, t] });
    }

    return { traces, bits, fields, notes, duration: t + 1, unitTime: ui, tour };
  },
};
