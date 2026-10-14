import type { Bit, Field, Note, Protocol } from '../core/types';
import { TraceBuilder, hex } from '../core/util';

/** The IEEE 1149.1 TAP controller: for each state, where TMS = 0 and TMS = 1 lead on the next rising edge of TCK. */
export const TAP: Record<string, [string, string]> = {
  'Test-Logic-Reset': ['Run-Test/Idle', 'Test-Logic-Reset'],
  'Run-Test/Idle': ['Run-Test/Idle', 'Select-DR'],
  'Select-DR': ['Capture-DR', 'Select-IR'],
  'Capture-DR': ['Shift-DR', 'Exit1-DR'],
  'Shift-DR': ['Shift-DR', 'Exit1-DR'],
  'Exit1-DR': ['Pause-DR', 'Update-DR'],
  'Pause-DR': ['Pause-DR', 'Exit2-DR'],
  'Exit2-DR': ['Shift-DR', 'Update-DR'],
  'Update-DR': ['Run-Test/Idle', 'Select-DR'],
  'Select-IR': ['Capture-IR', 'Test-Logic-Reset'],
  'Capture-IR': ['Shift-IR', 'Exit1-IR'],
  'Shift-IR': ['Shift-IR', 'Exit1-IR'],
  'Exit1-IR': ['Pause-IR', 'Update-IR'],
  'Pause-IR': ['Pause-IR', 'Exit2-IR'],
  'Exit2-IR': ['Shift-IR', 'Update-IR'],
  'Update-IR': ['Run-Test/Idle', 'Select-DR'],
};

const parseHex = (text: string, bits: number, name: string) => {
  const s = text.trim().replace(/^0x/i, '');
  if (!/^[0-9a-f]+$/i.test(s)) throw new Error(`The ${name} should be a hex number.`);
  const v = parseInt(s, 16);
  if (v >= 2 ** bits) throw new Error(`The ${name} has to fit in ${bits} bits.`);
  return v;
};

export const jtag: Protocol = {
  id: 'jtag',
  name: 'JTAG',
  fullName: 'Joint Test Action Group (IEEE 1149.1)',
  tags: ['synchronous', 'single-ended', 'push-pull', 'full duplex', 'daisy chain', 'chip-to-chip', 'debug'],
  summary:
    'A standard port for testing and debugging chips. Every JTAG device contains the same 16-state controller, the ' +
    'TAP, which the TMS line steps through one TCK clock edge at a time. In two of its states, Shift-IR and Shift-DR, ' +
    'a shift register connects TDI to TDO, so a bit is shifted in as another is shifted out. Shifting into the ' +
    'instruction register selects an operation, and shifting through a data register carries it out.',
  usedIn: 'Programming and debugging microcontrollers, CPUs and FPGAs, and boundary-scan testing of solder joints on assembled boards.',
  facts: {
    clock: 'Synchronous. The debugger drives TCK. TMS and TDI are sampled on the rising edge, and TDO changes on the falling edge.',
    wires: 'TCK, TMS, TDI and TDO, plus an optional TRST reset line and ground.',
    drive: 'Push-pull. TDO is only driven in the Shift-IR and Shift-DR states and is high-Z the rest of the time.',
    duplex: 'Full duplex while shifting: one bit goes in on TDI as one comes out on TDO.',
    topology: 'Daisy chain: TDO of each chip feeds TDI of the next, and they all share TCK and TMS.',
    addressing: 'None. Chips in a chain are told apart by position; devices not being accessed are given the 1-bit BYPASS instruction.',
    flow: 'None. The debugger sets the pace, and TMS alone decides what the chips do next.',
    errors: 'None in the protocol. Tools sanity-check the chain by reading IDCODEs and watching for the known patterns the standard requires.',
    speed: 'TCK from about 1 to 50 MHz, limited by the slowest chip in the chain and the cable.',
    reach: 'A short ribbon cable from the debug probe to the board.',
  },
  strengths: [
    'One standard port for testing, debugging and programming almost any complex chip.',
    'Many chips can share four wires in one chain.',
    'Boundary scan can test the connections on a board without running any code on it.',
  ],
  limits: [
    'Requires four or five pins, a significant cost on a small microcontroller (the motivation for SWD).',
    'Every access spends extra clocks walking the state machine.',
    'A chain runs at the speed of its slowest chip, and one dead chip breaks the whole chain.',
    'The instructions used for debugging and flash programming are vendor-specific.',
  ],
  legend: { cmd: 'TMS', addr: 'instruction (IR)', data: 'data (DR)' },
  deepDive: [
    {
      title: 'Boundary scan',
      body: [
        'JTAG was created for testing assembled boards. Every pin of a compliant chip has a boundary-scan cell that can capture the pin\'s state or override it. With the EXTEST instruction, a tester drives values onto one chip\'s pins and reads them on another\'s, verifying each solder joint and trace without running any firmware. BSDL files describe each chip\'s boundary-scan cells for test software.',
      ],
    },
    {
      title: 'Required instructions',
      body: [
        'IEEE 1149.1 requires BYPASS, SAMPLE/PRELOAD and EXTEST. BYPASS must use the all-ones opcode and selects a 1-bit data register, which shortens the chain through devices that are not being accessed. IDCODE is optional but nearly universal, and a device that implements it selects it automatically on reset.',
      ],
    },
    {
      title: 'Scanning a chain',
      body: [
        'In a chain, the instruction register lengths add up, and every IR scan must shift a full instruction into every device. To access one device, a debugger places the others in BYPASS, so each contributes a single bit to the data path.',
        'After reset, a DR scan reads every device\'s IDCODE back to back. Because every IDCODE ends in a 1 and every BYPASS register captures a 0, a debugger can count the devices and identify each one.',
      ],
    },
    {
      title: 'Debug and programming',
      body: [
        'Debug access is built on vendor-defined instructions. On Arm processors, the JTAG-DP uses DPACC and APACC instructions to reach the same debug access port that [SWD](?p=swd) uses. RISC-V cores expose a debug transport module, and FPGAs load configuration bitstreams through dedicated JTAG instructions.',
      ],
    },
    {
      title: 'Adaptive clocking',
      body: [
        'Some older Arm cores synchronize JTAG to their own clock and return a copy of TCK on an RTCK pin. A debugger using adaptive clocking waits for each RTCK edge before continuing, so it never runs faster than the core can follow, which matters when the core runs from a slow clock.',
      ],
    },
    {
      title: 'Fewer pins: cJTAG',
      body: [
        'IEEE 1149.7, compact JTAG, carries the same TAP operations over two pins, TCKC and TMSC, by multiplexing TMS, TDI and TDO onto a single bidirectional line. It addresses the same pin-count problem as SWD, on non-Arm devices as well.',
      ],
    },
  ],
  params: [
    { key: 'idcode', label: 'IDCODE', type: 'text', default: '4BA00477', placeholder: '4BA00477 (hex, 32-bit)' },
    {
      key: 'seq', label: 'Sequence', type: 'select', default: 'dr',
      options: [
        { value: 'dr', label: 'Reset, then read IDCODE' },
        { value: 'ir', label: 'Load IDCODE instruction, then read' },
      ],
    },
    { key: 'ir', label: 'Instruction', type: 'text', default: 'E', placeholder: 'E (hex, 4-bit IR)' },
    {
      key: 'clock', label: 'TCK', type: 'select', default: '1000000',
      options: [{ value: '1000000', label: '1 MHz' }, { value: '10000000', label: '10 MHz' }],
    },
  ],

  encode(p) {
    const idcode = parseHex(p.idcode, 32, 'IDCODE');
    if (!(idcode & 1)) throw new Error('Bit 0 of an IDCODE is always 1, which is how a debugger distinguishes an IDCODE from the 1-bit BYPASS register.');
    const withIr = p.seq === 'ir';
    const ir = parseHex(p.ir, 4, 'instruction');

    const tck = new TraceBuilder('TCK', 0);
    const tms = new TraceBuilder('TMS', 1);
    const tdi = new TraceBuilder('TDI', 1);
    const tdo = new TraceBuilder('TDO', 'z');
    const bits: Bit[] = [];
    const fields: Field[] = [];
    const notes: Note[] = [];

    let state = 'Test-Logic-Reset';
    let t = 1;
    // Each cycle: TMS/TDI (and TDO) change at the falling edge, then everything is sampled on the rising edge.
    const runs: { state: string; t0: number }[] = [];
    const cycle = (m: 0 | 1, tdiBit?: { v: 0 | 1; info: string; kind: 'addr' | 'data' }, tdoBit?: { v: 0 | 1; info: string; kind: 'addr' | 'data' }) => {
      const from = state;
      const to = TAP[from][m];
      tms.set(t, m);
      if (tdiBit) tdi.set(t, tdiBit.v);
      tdo.set(t, tdoBit ? tdoBit.v : 'z');
      tck.set(t + 0.5, 1);
      tck.set(t + 1, 0);
      bits.push({
        lane: 1, t0: t, t1: t + 1, label: `${m}`, kind: 'cmd', by: 'controller', sample: t + 0.5,
        info: `TMS = ${m}. On this rising edge the TAP moves from ${from} to ${to}.`,
      });
      if (tdiBit) bits.push({ lane: 2, t0: t, t1: t + 1, label: '', kind: tdiBit.kind, by: 'controller', sample: t + 0.5, info: tdiBit.info });
      if (tdoBit) bits.push({ lane: 3, t0: t, t1: t + 1, label: '', kind: tdoBit.kind, by: 'target', sample: t + 0.5, info: tdoBit.info });
      if (!runs.length || runs[runs.length - 1].state !== from) runs.push({ state: from, t0: t });
      state = to;
      t++;
    };

    // Five TMS=1 clocks reach Test-Logic-Reset from any state, which also loads IDCODE (or BYPASS) into the IR.
    notes.push({ lane: 1, t, text: '5 × TMS=1: reset from any state' });
    for (let i = 0; i < 5; i++) cycle(1);
    runs[0].state = 'reset';
    cycle(0); // → Run-Test/Idle

    const shift = (n: number, value: number, kind: 'addr' | 'data', what: string, tdoValue: number, tdoWhat: string) => {
      notes.push({ lane: 2, t, text: kind === 'addr' ? 'Shift-IR: instruction in' : 'Shift-DR: data out on TDO' });
      for (let i = 0; i < n; i++) {
        const v = ((value >> i) & 1) as 0 | 1;
        const o = ((tdoValue >>> i) & 1) as 0 | 1;
        const last = i === n - 1;
        cycle(last ? 1 : 0,
          { v, kind, info: `TDI = ${v}: ${what} bit ${i}, least significant bit first.` },
          { v: o, kind, info: `TDO = ${o}: ${tdoWhat} bit ${i}.${last ? ' TMS is 1 on this last bit, so the TAP leaves Shift as it shifts.' : ''}` });
        const lastBit = bits[bits.length - 1];
        lastBit.label = `${i}`;
        bits[bits.length - 2].label = `${i}`;
      }
    };

    if (withIr) {
      for (const m of [1, 1, 0, 0] as const) cycle(m); // Select-DR, Select-IR, Capture-IR → Shift-IR
      shift(4, ir, 'addr', `instruction ${hex(ir)}`, 0b0001,
        'Captured IR value; the standard forces its two lowest bits to 01, which lets tools find where each chip starts in a chain:');
      cycle(1); // Exit1-IR → Update-IR
      cycle(1); // Update-IR → Select-DR
      cycle(0); // → Capture-DR
      cycle(0); // → Shift-DR
    } else {
      for (const m of [1, 0, 0] as const) cycle(m); // Select-DR, Capture-DR → Shift-DR
    }
    shift(32, 0, 'data', 'Filler (the TDI value has no effect while IDCODE is read)', idcode,
      `IDCODE ${hex(idcode)} (version, part number, manufacturer, and a 1)`);
    cycle(1); // Exit1-DR → Update-DR
    cycle(0); // → Run-Test/Idle
    runs.push({ state, t0: t });

    runs.forEach((r, i) => {
      const t1 = runs[i + 1]?.t0 ?? t + 1;
      fields.push({ lane: 1, t0: r.t0, t1, label: r.state === 'reset' ? 'Reset' : r.state, kind: 'cmd' });
    });
    tms.set(t, 0);
    tdo.set(t, 'z');

    return { traces: [tck.trace, tms.trace, tdi.trace, tdo.trace], bits, fields, notes, duration: t + 1, unitTime: 1 / +p.clock };
  },
};
