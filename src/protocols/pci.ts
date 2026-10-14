import type { Bit, Field, Level, Note, Protocol, TourStop } from '../core/types';
import { TraceBuilder } from '../core/util';

/** Signals change a little after each rising edge (clock-to-output delay) and are sampled on the next one. */
const CO = 0.15;
const DEVSEL_CLOCKS: Record<string, number> = { fast: 1, medium: 2, slow: 3 };

const hex32 = (v: number) => `0x${(v >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;

/** A bus trace: one labelled value per segment, or 'z' when nobody drives it. */
class BusBuilder {
  trace;
  constructor(name: string) {
    this.trace = { name, bus: true, points: [{ t: 0, v: 'z' as Level }] as { t: number; v: Level; label?: string }[] };
  }
  set(t: number, label: string | null) {
    this.trace.points.push(label === null ? { t, v: 'z' } : { t, v: 1, label });
  }
}

export const pci: Protocol = {
  id: 'pci',
  name: 'PCI',
  fullName: 'Peripheral Component Interconnect',
  tags: ['synchronous', 'single-ended', 'parallel', 'push-pull', 'half duplex', 'multi-drop', 'addressed', 'expansion'],
  summary:
    'The parallel bus PCI Express replaced. Every card shares 32 multiplexed address/data lines (AD) and a common ' +
    '33 MHz clock. A transaction is an address phase followed by one or more data phases, and a word moves only on ' +
    'a rising clock edge where both the initiator (IRDY#) and the target (TRDY#) signal that they are ready. Signals ' +
    'ending in # are active low.',
  usedIn: 'Desktop PCs from the mid-1990s to the late 2000s (sound, network and early graphics cards), industrial ' +
    'systems such as CompactPCI, and the configuration model that PCI Express still uses.',
  facts: {
    clock: 'Synchronous: one shared 33 MHz (or 66 MHz) clock. Every signal is sampled on its rising edge.',
    wires: '32 multiplexed address/data lines, 4 command/byte-enable lines, control lines (FRAME#, IRDY#, TRDY#, DEVSEL#, STOP#), parity, and a request/grant pair for devices that can act as bus master: 47 signals for a 32-bit target-only device, 49 for a bus master.',
    drive: 'Push-pull, using reflected-wave switching. Control lines are sustained tri-state: a driver must drive them high for one clock before releasing them, and pull-ups hold them high afterward.',
    duplex: 'Half duplex: one transaction at a time on the shared bus.',
    topology: 'A shared multi-drop bus, typically with up to four or five slots. Bridges create additional buses.',
    addressing: '32-bit memory and I/O addresses (64-bit with a dual address cycle). Configuration accesses select a slot with its dedicated IDSEL line.',
    flow: 'IRDY# and TRDY# handshake every data phase, so either side can insert wait states. A target can also end a transaction early with STOP#.',
    errors: 'Even parity (PAR) over AD and C/BE#, with PERR# reporting data parity errors and SERR# reporting system errors.',
    speed: '133 MB/s peak for 32 bits at 33 MHz, 533 MB/s for 64 bits at 66 MHz, and up to about 1 GB/s with PCI-X at 133 MHz, shared by every device on the bus.',
    reach: 'A motherboard and its add-in cards. Reflected-wave signaling depends on short bus traces.',
  },
  strengths: [
    'Simple, synchronous transfers with efficient bursts.',
    'Plug and play: a standard configuration space lets software discover and configure every device. PCI Express kept it.',
    'Broad, long-lived industry support.',
  ],
  limits: [
    'All devices share one bus, so they share its bandwidth.',
    'Skew and reflections between dozens of parallel lines limit how fast the clock can run.',
    'Many pins per device, and only one transaction at a time.',
  ],
  deepDive: [
    {
      title: 'Why PCI was replaced by a serial link',
      body: [
        'A parallel bus sends every bit of a word at the same moment, so every line must arrive within a fraction of a ' +
        'clock period of the others. As clock rates rose, the small differences in length and loading between 32 or 64 ' +
        'lines, together with reflections on a bus shared by several slots, consumed the timing budget. PCI-X reached ' +
        '133 MHz with fewer slots per bus; going further required a different approach.',
        '[PCI Express](?p=pcie) replaced the shared bus with point-to-point serial lanes, each of which recovers its own clock from ' +
        'its own data. Lanes can then differ in delay by many bits, because the receiver realigns them, and bandwidth ' +
        'scales by adding lanes rather than by raising one shared clock.',
      ],
    },
    {
      title: 'Multiplexed address and data',
      body: [
        'To save pins, the same 32 AD lines carry the address in the first clock of a transaction and data afterward. ' +
        'The four C/BE# lines likewise carry the command during the address phase (for example 0110 for Memory Read and ' +
        '0111 for Memory Write) and byte enables during data phases, where a 0 marks each byte lane that carries valid data.',
      ],
    },
    {
      title: 'Turnaround cycles',
      body: [
        'In a read, the initiator drives the address and the target drives the data on the same AD lines. A turnaround ' +
        'clock in which neither drives them sits between the two, so their output drivers never conflict. Writes need no ' +
        'turnaround on AD, because the initiator drives both the address and the data.',
      ],
    },
    {
      title: 'DEVSEL# and subtractive decode',
      body: [
        'Every target decodes the address, and the one that owns it asserts DEVSEL# one, two or three clocks later (fast, ' +
        'medium or slow decode). If no target responds by then, a subtractive-decode bridge, typically the one leading to ' +
        'legacy ISA devices, may claim the transaction. If nothing claims it, the initiator ends it with a master abort.',
      ],
    },
    {
      title: 'Arbitration and bus mastering',
      body: [
        'Any card can become the initiator. Each slot has its own REQ# and GNT# lines to a central arbiter; a device ' +
        'asserts REQ#, waits for GNT#, and starts its transaction when the bus is idle. This bus mastering let network ' +
        'and disk controllers move data to memory without the CPU, and the same idea continues as DMA over PCI Express.',
      ],
    },
  ],
  legend: { addr: 'address phase', dummy: 'turnaround / wait', data: 'data transfer' },
  params: [
    {
      key: 'cmd', label: 'Command', help: 'The bus command, sent on C/BE# during the address phase.', type: 'select', default: 'read',
      options: [{ value: 'read', label: 'Memory Read (0110)' }, { value: 'write', label: 'Memory Write (0111)' }],
    },
    { key: 'addr', label: 'Address', help: 'The 32-bit memory address, in hexadecimal.', type: 'text', default: '1000', placeholder: '1000 (hex)' },
    { key: 'data', label: 'Data words', help: 'One to four 32-bit words, in hexadecimal. More than one word makes a burst, which transfers one word per clock cycle.', type: 'text', default: 'CAFEF00D 12345678', placeholder: 'CAFEF00D 12345678 (32-bit hex)' },
    {
      key: 'devsel', label: 'Target decode', help: 'How quickly the target claims the transaction by asserting DEVSEL#: one, two or three clock cycles after the address phase.', type: 'select', default: 'medium',
      options: [
        { value: 'fast', label: 'Fast DEVSEL# (1 clock)' },
        { value: 'medium', label: 'Medium DEVSEL# (2 clocks)' },
        { value: 'slow', label: 'Slow DEVSEL# (3 clocks)' },
      ],
    },
    {
      key: 'wait', label: 'Target wait states', help: 'Clock cycles the target adds before it is ready for the first data word, which it signals by holding TRDY# high.', type: 'select', default: '1',
      options: ['0', '1', '2'].map((v) => ({ value: v, label: v })),
    },
  ],

  encode(p) {
    const read = p.cmd !== 'write';
    const addrText = p.addr.trim().replace(/^0x/i, '');
    if (!/^[0-9a-f]{1,8}$/i.test(addrText)) throw new Error('The address should be up to 8 hex digits, like 1000.');
    const addr = parseInt(addrText, 16) >>> 0;
    const words = p.data.trim().split(/[\s,]+/).filter(Boolean).map((w) => w.replace(/^0x/i, ''));
    if (!words.length) throw new Error('Enter at least one 32-bit data word, like CAFEF00D.');
    if (words.length > 4) throw new Error('Keep it to 4 data words or fewer.');
    for (const w of words) if (!/^[0-9a-f]{1,8}$/i.test(w)) throw new Error(`"${w}" is not a 32-bit hex word.`);
    const data = words.map((w) => parseInt(w, 16) >>> 0);
    const waits = +p.wait;

    // Rising edges fall on whole numbers. The address phase is sampled on edge 2.
    const devselEdge = 2 + DEVSEL_CLOCKS[p.devsel];
    const firstEdge = Math.max(devselEdge, read ? 4 : 3) + waits;
    const lastEdge = firstEdge + data.length - 1;
    const end = lastEdge + 3;

    const clk = new TraceBuilder('CLK', 0);
    for (let n = 1; n <= end; n++) {
      clk.set(n, 1);
      clk.set(n + 0.5, 0);
    }
    const frame = new TraceBuilder('FRAME#', 1);
    const ad = new BusBuilder('AD');
    const cbe = new BusBuilder('C/BE#');
    const irdy = new TraceBuilder('IRDY#', 1);
    const trdy = new TraceBuilder('TRDY#', 1);
    const devsel = new TraceBuilder('DEVSEL#', 1);

    frame.set(1 + CO, 0);
    frame.set(Math.max(2, lastEdge - 1) + CO, 1); // FRAME# goes high when the final data phase begins
    ad.set(1 + CO, hex32(addr));
    cbe.set(1 + CO, read ? '0110' : '0111');
    cbe.set(2 + CO, '0000');
    irdy.set(2 + CO, 0);
    devsel.set(devselEdge - 1 + CO, 0);
    trdy.set(firstEdge - 1 + CO, 0);
    if (read) {
      ad.set(2 + CO, null); // turnaround
      ad.set(firstEdge - 1 + CO, hex32(data[0]));
    } else {
      ad.set(2 + CO, hex32(data[0]));
    }
    for (let k = 1; k < data.length; k++) ad.set(firstEdge + k - 1 + CO, hex32(data[k]));
    ad.set(lastEdge + CO, null);
    cbe.set(lastEdge + CO, null);
    irdy.set(lastEdge + CO, 1);
    trdy.set(lastEdge + CO, 1);
    devsel.set(lastEdge + CO, 1);

    const bits: Bit[] = [];
    const fields: Field[] = [];
    const notes: Note[] = [];
    const cell = (edge: number, kind: Bit['kind'], label: string, info: string) =>
      bits.push({ lane: 2, t0: edge - 1, t1: edge, label, kind, sample: edge, by: kind === 'data' && read ? 'target' : undefined, info });

    cell(2, 'addr', 'Addr', `Address phase. The initiator drives the address ${hex32(addr)} on AD and the command ` +
      `${read ? '0110 (Memory Read)' : '0111 (Memory Write)'} on C/BE#, and pulls FRAME# low to start the transaction. ` +
      'Every target samples them on this rising edge.');
    for (let e = 3; e <= lastEdge; e++) {
      const k = e - firstEdge;
      if (k >= 0) {
        cell(e, 'data', `D${k}`, `Data phase ${k + 1}: IRDY# and TRDY# are both low on this rising edge, so ${hex32(data[k])} ` +
          `moves from the ${read ? 'target to the initiator' : 'initiator to the target'}.` +
          (e === lastEdge ? ' FRAME# is already high, which marks this as the final data phase.' : ''));
      } else if (read && e === 3) {
        cell(e, 'dummy', 'Tar', 'Turnaround: the initiator has stopped driving AD and the target has not started yet, so ' +
          'the two never drive the lines at the same time.');
      } else {
        const why = e < devselEdge ? 'the target has not claimed the transaction yet (DEVSEL# is still high)' : 'the target is not ready (TRDY# is high)';
        cell(e, 'dummy', 'Wait', `Wait state: ${why}, so no data moves on this edge.`);
      }
    }
    fields.push({ lane: 2, t0: 1, t1: 2, label: 'Address', kind: 'addr' });
    data.forEach((_, k) => fields.push({ lane: 2, t0: firstEdge + k - 1, t1: firstEdge + k, label: `Data ${k + 1}`, kind: 'data' }));

    notes.push({ lane: 1, t: 1 + CO, text: 'FRAME# low: transaction starts' });
    notes.push({ lane: 6, t: devselEdge - 1 + CO, text: 'target claims the address' });
    notes.push({ lane: 5, t: firstEdge - 1 + CO, text: 'target ready' });
    if (read) notes.push({ lane: 2, t: 2 + CO, text: 'turnaround' });

    const view = (a: number, b: number): [number, number] => [Math.max(0, a), Math.min(end + 1, b)];
    const tour: TourStop[] = [
      { title: 'Overview', text: `A ${read ? 'Memory Read' : 'Memory Write'} of ${data.length} word${data.length === 1 ? '' : 's'}. ` +
        'Every signal is sampled on the rising edge of the shared clock; the gray cells under AD mark clocks where no data moves.',
      view: [0, end + 1], focus: null },
      { title: 'Address phase', text: `FRAME# falls and the initiator places the address ${hex32(addr)} on AD and the command on ` +
        'C/BE#. Every device on the bus samples them on the next rising edge.', view: view(0, 4), focus: [1, 2] },
    ];
    if (read) tour.push({ title: 'Turnaround', text: 'For one clock, AD is not driven while ownership passes from the initiator to the target.', view: view(1, 5), focus: [2, 3] });
    tour.push({ title: 'Address claimed', text: `The target recognizes the address and pulls DEVSEL# low, ${DEVSEL_CLOCKS[p.devsel]} clock${DEVSEL_CLOCKS[p.devsel] === 1 ? '' : 's'} after the address phase (${p.devsel} decode).`, view: view(1, devselEdge + 2), focus: [devselEdge - 1, devselEdge] });
    if (firstEdge > (read ? 4 : 3) || waits) tour.push({ title: 'Wait states', text: 'IRDY# is low, but TRDY# is still high, so no data moves on these edges.', view: view(2, firstEdge + 1), focus: [Math.max(read ? 3 : 2, devselEdge - 1), firstEdge - 1] });
    tour.push({ title: 'Data transfer', text: `On each rising edge where IRDY# and TRDY# are both low, one 32-bit word moves: ${data.map(hex32).join(', ')}. A burst transfers one word per clock.`, view: view(firstEdge - 2, lastEdge + 2), focus: [firstEdge - 1, lastEdge] });
    tour.push({ title: 'End of transaction', text: 'FRAME# went high during the final data phase. After the last transfer the initiator and target release IRDY#, TRDY#, DEVSEL# and AD, and the bus becomes idle.', view: view(lastEdge - 2, end + 1), focus: [lastEdge, end] });

    return {
      traces: [clk.trace, frame.trace, ad.trace, cbe.trace, irdy.trace, trdy.trace, devsel.trace],
      bits, fields, notes, duration: end + 1, unitTime: 1 / 33.33e6, tour,
    };
  },
};
