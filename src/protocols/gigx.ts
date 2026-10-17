import type { Bit, Field, Kind, Note, Protocol, TourStop } from '../core/types';
import { TraceBuilder, hex } from '../core/util';
import { FRAME_PARAMS, buildFrame } from './ethcommon';
import { encode8b10b } from './pcie';

const K = (x: number, y: number) => (y << 5) | x;
const NAME = (byte: number, k: boolean) => `${k ? 'K' : 'D'}${byte & 0x1f}.${byte >> 5}`;
const LETTERS = 'abcdeifghj';

/** One code group before encoding: a data byte, or a control (K) code. */
interface Group { byte: number; k: boolean; label: string; kind: Kind; info: string }

/**
 * The code groups for one frame, as IEEE 802.3 clause 36 sends them: idle, /S/ in place of the first preamble byte,
 * the rest of the frame as data, /T/ /R/ (and another /R/ if needed to end on an even position), then idle again. The
 * first idle after a frame is /I1/ if the running disparity is positive, which brings it back to negative. Exported for
 * the checks.
 */
export function gigxGroups(bytes: number[]) {
  const out: Group[] = [];
  const idle2 = () => out.push(
    { byte: K(28, 5), k: true, label: '/I2/ K28.5', kind: 'dummy', info: 'Idle, /I2/: the comma K28.5, whose bit pattern cannot appear anywhere else, so the receiver aligns to code-group boundaries on it.' },
    { byte: K(16, 2), k: false, label: 'D16.2', kind: 'dummy', info: 'Idle, /I2/, second half: D16.2.' },
  );
  idle2();
  idle2();
  out.push({ byte: K(27, 7), k: true, label: '/S/ K27.7', kind: 'start', info: 'Start of packet, /S/ (K27.7). It replaces the first byte of the preamble.' });
  bytes.slice(1).forEach((b) => out.push({ byte: b, k: false, label: NAME(b, false), kind: 'data', info: `Data byte ${hex(b)}, sent as ${NAME(b, false)}.` }));
  out.push({ byte: K(29, 7), k: true, label: '/T/ K29.7', kind: 'stop', info: 'End of packet, /T/ (K29.7).' });
  out.push({ byte: K(23, 7), k: true, label: '/R/ K23.7', kind: 'stop', info: 'Carrier extend, /R/ (K23.7), after /T/.' });
  if (out.length % 2) out.push({ byte: K(23, 7), k: true, label: '/R/ K23.7', kind: 'stop', info: 'A second /R/, so idle starts on an even code-group position.' });
  // Encode, choosing /I1/ or /I2/ for the first idle from the running disparity.
  const coded: (Group & { code: string; rdBefore: -1 | 1 })[] = [];
  let rd: -1 | 1 = -1;
  const push = (g: Group) => {
    const e = encode8b10b(g.byte, g.k, rd);
    coded.push({ ...g, code: e.code, rdBefore: rd });
    rd = e.rd;
  };
  out.forEach(push);
  const i1 = rd > 0;
  push({ byte: K(28, 5), k: true, label: i1 ? '/I1/ K28.5' : '/I2/ K28.5', kind: 'dummy',
    info: i1 ? 'Idle, /I1/: the running disparity is positive after the frame, and /I1/ brings it back to negative.' : 'Idle resumes, /I2/.' });
  push(i1
    ? { byte: K(5, 6), k: false, label: 'D5.6', kind: 'dummy', info: 'Idle, /I1/, second half: D5.6, which keeps the running disparity negative.' }
    : { byte: K(16, 2), k: false, label: 'D16.2', kind: 'dummy', info: 'Idle, /I2/, second half: D16.2.' });
  return coded;
}

export const gigabitX: Protocol = {
  id: '1000basex',
  name: '1000BASE-X',
  fullName: 'Gigabit Ethernet over fiber (IEEE 802.3z)',
  tags: ['embedded clock', 'differential', 'full duplex', 'point-to-point', 'cable', 'networking', '8b/10b'],
  summary:
    'Ethernet at 1 Gbit/s over fiber (1000BASE-SX and LX), or over short copper links (CX) and backplanes. It carries ' +
    'the same [Ethernet frame](?p=ethframe) in 8b/10b code, the same code as [PCIe](?p=pcie) Gen1 and SATA: every byte ' +
    'becomes 10 bits with a balanced number of 1s and 0s, at 1.25 Gbaud. Control codes mark the start and end of each ' +
    'frame and fill the gaps between them, and on fiber each 1 is a pulse of light.',
  usedIn: 'SFP fiber modules in switches and routers, SGMII links between Ethernet controllers and PHY chips, and gigabit backplanes.',
  facts: {
    clock: 'Embedded. 8b/10b guarantees frequent transitions, and the receiver aligns to code-group boundaries on the K28.5 comma in every idle.',
    wires: 'A pair of fibers, one per direction, usually in an SFP module; or a differential copper pair each way for CX and SGMII.',
    drive: 'On fiber, light on for a 1 and off for a 0; on copper, a differential pair.',
    duplex: 'Full duplex, a fiber in each direction.',
    topology: 'Point-to-point: each fiber link connects one port to one other port.',
    addressing: '48-bit MAC addresses, in the frame.',
    flow: 'PAUSE frames, negotiated by the 1000BASE-X autonegotiation code words sent during idle.',
    errors: 'The frame’s CRC-32, plus 8b/10b itself: a code group that is not in the table, or that breaks the running disparity, is a detected error.',
    speed: '1 Gbit/s of data, 1.25 Gbaud on the line, because 8b/10b sends 10 bits for every 8.',
    reach: 'About 550 m on multimode fiber (SX), 5 km or more on single-mode fiber (LX), 25 m on copper (CX).',
  },
  strengths: [
    'DC-balanced code that works through capacitors, transformers and optical receivers alike.',
    'Every 10-bit code group is checked twice, against the table and against the running disparity, so bit errors are caught right away.',
    'The same physical coding as Fibre Channel, PCIe Gen1 and SATA, so the hardware is well understood and widely shared.',
  ],
  limits: [
    '20% of the line rate is spent on coding: 1.25 Gbaud carries 1 Gbit/s. 10 Gbit/s Ethernet switched to 64b/66b to cut that to 3%.',
    'Needs an optical module and fiber, or very short copper.',
    'Point-to-point only; every link needs a switch port at each end.',
  ],
  legend: { start: '/S/ /T/ /R/ delimiters', dummy: 'idle /I/' },
  deepDive: [
    {
      title: 'Running disparity',
      body: [
        'Each data byte has two possible 10-bit codes, one with more 1s and one with more 0s (or a single balanced code). The transmitter tracks the running disparity, whether it has sent more 1s or more 0s so far, and picks the code that brings it back toward balance. The signal never drifts away from its average, which is what lets it pass through capacitors and optical receivers.',
      ],
    },
    {
      title: 'The comma',
      body: [
        'K28.5 contains the sequence 0011111 or 1100000, which no combination of other code groups can produce. A receiver that has lost track of where code groups begin finds it in the next idle, and aligns to it. That is why every idle starts with K28.5.',
      ],
    },
    {
      title: 'SGMII',
      body: [
        'Many Ethernet controllers connect to their PHY chip with SGMII: the same 8b/10b coding as 1000BASE-X, on one differential pair each way, at 1.25 Gbaud. At 100 and 10 Mbit/s it repeats each byte 10 or 100 times, so the line rate never changes.',
      ],
    },
  ],
  params: FRAME_PARAMS,

  encode(p) {
    const f = buildFrame(p);
    const groups = gigxGroups(f.bytes);
    const names = new TraceBuilder('Codes', 'z');
    names.trace.bus = true;
    const light = new TraceBuilder('Light', 0);
    light.trace.levels = ['off', 'on'];
    const bits: Bit[] = [];
    const fields: Field[] = [];
    const notes: Note[] = [];
    let t = 1;
    groups.forEach((g) => {
      // The short name fits in a code group's slot: K28.5, D16.2, /S/ and so on.
      names.trace.points.push({ t, v: 1, label: g.label.includes(' ') && g.label.startsWith('/I') ? g.label.split(' ')[1] : g.label.split(' ')[0] });
      [...g.code].forEach((c, i) => {
        const v = +c as 0 | 1;
        light.set(t, v);
        bits.push({
          lane: 1, t0: t, t1: t + 1, label: LETTERS[i], kind: g.kind, sample: t + 0.5,
          info: `${g.info} Code ${g.code.slice(0, 6)} ${g.code.slice(6)} (running disparity ${g.rdBefore < 0 ? 'RD−' : 'RD+'} before it), bit ${LETTERS[i]} = ${v}.`,
        });
        t++;
      });
    });
    names.trace.points.push({ t, v: 'z' });
    // Fields: idle, start, the frame's sections (one code group per byte, minus the replaced first preamble byte), end, idle.
    const s = 1 + 4 * 10;
    fields.push({ lane: 1, t0: 1, t1: s, label: 'Idle', kind: 'dummy' }, { lane: 1, t0: s, t1: s + 10, label: '/S/', kind: 'start' });
    let at = s + 10;
    const spans: Record<string, [number, number]> = {};
    f.sections.forEach((sec, k) => {
      const n = (k === 0 ? sec.bytes.length - 1 : sec.bytes.length) * 10;
      if (n) fields.push({ lane: 1, t0: at, t1: at + n, label: k === 0 ? 'Preamble (6 × 0x55)' : sec.label, kind: sec.kind });
      spans[sec.id] = [at, at + n];
      at += n;
    });
    const endAt = at;
    const endGroups = groups.filter((g) => g.kind === 'stop').length;
    fields.push({ lane: 1, t0: at, t1: at + endGroups * 10, label: '/T/ /R/', kind: 'stop' });
    fields.push({ lane: 1, t0: at + endGroups * 10, t1: t, label: 'Idle', kind: 'dummy' });
    notes.push({ lane: 1, t: s, text: '/S/ start of packet' });
    const duration = t + 1;
    const tour: TourStop[] = [
      {
        title: 'Overview',
        text: `The same ${f.bytes.length}-byte frame, as ${groups.length} code groups of 10 bits at 1.25 Gbaud: idle, a start ` +
          'code, one code group per byte, an end code, and idle again. The lower trace is the light on the fiber.',
        view: [0, duration], focus: null,
      },
      {
        title: 'Idle and the comma',
        text: 'Between frames, the transmitter repeats /I2/: K28.5 then D16.2. K28.5 contains a pattern of five 1s or five ' +
          '0s that no other combination of codes can produce, so the receiver can always find where code groups begin.',
        view: [0, s + 2], focus: [1, s],
      },
      {
        title: 'Start of packet',
        text: '/S/ (K27.7) replaces the first byte of the preamble. Control codes cannot be confused with data, so the frame ' +
          'starts exactly here.',
        view: [s - 12, s + 30], focus: [s, s + 10],
      },
      {
        title: '8b/10b data',
        text: 'Each byte becomes one 10-bit code group with five 1s and five 0s, or six and four. The running disparity ' +
          'decides which of a byte’s two codes is sent, so over time the light is on exactly half the time.',
        view: [spans.dst[0] - 2, spans.dst[0] + 32], focus: [spans.dst[0], spans.dst[0] + 30],
      },
      {
        title: 'End of packet',
        text: '/T/ (K29.7) ends the frame and /R/ (K23.7) follows, with a second /R/ if needed so the next idle starts on an ' +
          'even position. Then idle resumes.',
        view: [endAt - 12, Math.min(duration, endAt + endGroups * 10 + 22)], focus: [endAt, endAt + endGroups * 10],
      },
    ];
    return { traces: [names.trace, light.trace], bits, fields, notes, duration, unitTime: 8e-10, minPpu: 6, tour };
  },
};
