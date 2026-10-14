import type { Bit, Driver, Field, Kind, Note, Protocol } from '../core/types';
import { TraceBuilder, hex } from '../core/util';

const ACKS: Record<string, { bits: number; name: string; info: string }> = {
  ok: { bits: 0b001, name: 'OK', info: 'OK: the target accepted the request.' },
  wait: { bits: 0b010, name: 'WAIT', info: 'WAIT: the target is busy (for example, a slow memory access is still running). The debugger should try the same request again.' },
  fault: { bits: 0b100, name: 'FAULT', info: 'FAULT: an earlier access failed, and the target refuses new ones until the debugger clears the error flags.' },
};

const REGS: Record<string, string[]> = {
  dp: ['DPIDR (read) / ABORT (write)', 'CTRL/STAT', 'SELECT (write) / RESEND (read)', 'RDBUFF'],
  ap: ['AP register 0x0', 'AP register 0x4', 'AP register 0x8', 'AP register 0xC'],
};

export const swd: Protocol = {
  id: 'swd',
  name: 'SWD',
  fullName: 'Serial Wire Debug (Arm)',
  summary:
    'Arm\'s two-pin replacement for JTAG. The debugger sends an 8-bit request naming a register, both sides take a ' +
    'turnaround clock to swap who drives SWDIO, the target answers with a 3-bit ACK, and then 32 bits of data and a ' +
    'parity bit go one way or the other.',
  usedIn: 'Programming and debugging almost every Arm Cortex-M microcontroller (STM32, nRF52, RP2040 and others) through ST-Link, J-Link or CMSIS-DAP probes.',
  facts: {
    clock: 'Synchronous. The debugger drives SWCLK. It changes SWDIO on the falling edge and the target samples on the rising edge; the target changes SWDIO on the rising edge and the debugger samples on the falling edge.',
    wires: 'SWCLK and SWDIO, plus ground. An optional SWO pin streams trace output.',
    drive: 'Push-pull, with a pull-up on SWDIO. Whenever the direction changes there is a turnaround clock where nobody drives.',
    duplex: 'Half duplex on the single SWDIO wire.',
    topology: 'Point-to-point: one probe, one chip. SWD version 2 adds a multi-drop mode.',
    addressing: 'Each request picks the debug port (DP) or an access port (AP) and one of four registers. The DP\'s SELECT register chooses which AP and register bank.',
    flow: 'The target can answer WAIT, and the debugger retries the request.',
    errors: 'An even-parity bit on every request and every 32-bit data word, and a FAULT ACK when something went wrong.',
    speed: 'Typically 1 to 10 MHz, and up to about 50 MHz with fast probes.',
    reach: 'A short cable from the debug probe to the board.',
  },
  strengths: [
    'Only two pins, versus four or five for JTAG, with the same debug access on Arm chips.',
    'ACKs and parity make it more robust than raw JTAG.',
    'Supported by practically every Cortex-M chip and every Arm debug probe.',
  ],
  limits: [
    'Arm only.',
    'No daisy chain (outside SWD v2 multi-drop) and no boundary scan.',
    'A packet spends several clocks on the request, turnarounds and ACK for every 32-bit access.',
  ],
  legend: { cmd: 'request', ack: 'ACK', dummy: 'turnaround', start: 'start / stop / park' },
  params: [
    {
      key: 'op', label: 'Operation', type: 'select', default: 'r',
      options: [{ value: 'r', label: 'Read' }, { value: 'w', label: 'Write' }],
    },
    {
      key: 'port', label: 'Port', type: 'select', default: 'dp',
      options: [{ value: 'dp', label: 'Debug port (DP)' }, { value: 'ap', label: 'Access port (AP)' }],
    },
    {
      key: 'reg', label: 'Register', type: 'select', default: '0',
      options: [0, 1, 2, 3].map((i) => ({ value: `${i}`, label: `0x${(i * 4).toString(16).toUpperCase()}` })),
    },
    { key: 'data', label: 'Data', type: 'text', default: '2BA01477', placeholder: '2BA01477 (hex, 32-bit)' },
    {
      key: 'ack', label: 'Target answers', type: 'select', default: 'ok',
      options: Object.entries(ACKS).map(([value, a]) => ({ value, label: a.name })),
    },
  ],

  encode(p) {
    const read = p.op === 'r';
    const ap = p.port === 'ap';
    const reg = +p.reg & 3;
    const text = p.data.trim().replace(/^0x/i, '');
    if (!/^[0-9a-f]{1,8}$/i.test(text)) throw new Error('The data should be up to 8 hex digits, like 2BA01477.');
    const data = parseInt(text, 16) >>> 0;
    const ack = ACKS[p.ack] ?? ACKS.ok;
    const regName = REGS[ap ? 'ap' : 'dp'][reg];

    const clk = new TraceBuilder('SWCLK', 0);
    const io = new TraceBuilder('SWDIO', 0);
    const bits: Bit[] = [];
    const fields: Field[] = [];
    const notes: Note[] = [];
    let t = 1;

    const tick = () => {
      clk.set(t + 0.5, 1);
      clk.set(t + 1, 0);
      t++;
    };
    /** The debugger's bits change on the falling edge and are read by the target on the next rising edge. */
    const hostBit = (v: 0 | 1, label: string, kind: Kind, info: string) => {
      io.set(t, v);
      bits.push({ lane: 1, t0: t, t1: t + 1, label, kind, by: 'controller', sample: t + 0.5, info });
      tick();
    };
    /**
     * The target's bits change on a rising edge and are read by the debugger on the next falling edge. Its first bit
     * starts on the rising edge inside the turnaround clock, so it's read right as that clock ends.
     */
    const targetBit = (v: 0 | 1, label: string, kind: Kind, info: string) => {
      io.set(t - 0.5, v);
      bits.push({ lane: 1, t0: t - 0.5, t1: t + 0.5, label, kind, by: 'target', sample: t, info });
      tick();
    };
    /** One turnaround clock. The cell covers the time nobody drives SWDIO, until the new driver's first edge. */
    const turnaround = (to: Driver, from: number) => {
      io.set(from, 'z');
      const until = to === 'target' ? t + 0.5 : t + 1;
      bits.push({
        lane: 1, t0: from, t1: until, label: 'Trn', kind: 'dummy',
        info: `Turnaround: for one clock nobody drives SWDIO (the pull-up holds it), while control passes to the ${to === 'target' ? 'target' : 'debugger'}. ` +
          'Without it, both sides could drive the wire at once.',
      });
      tick();
    };

    // Request: Start, APnDP, RnW, A[2], A[3], Parity, Stop, Park.
    const a2 = (reg & 1) as 0 | 1;
    const a3 = ((reg >> 1) & 1) as 0 | 1;
    const parity = ((+ap + +read + a2 + a3) % 2) as 0 | 1;
    const reqStart = t;
    notes.push({ lane: 1, t, text: 'request from the debugger' });
    hostBit(1, 'S', 'start', 'Start bit = 1. Every request begins with a 1.');
    hostBit(ap ? 1 : 0, 'AP', 'cmd', `APnDP = ${+ap}: this request is for the ${ap ? 'access port (AP)' : 'debug port (DP)'}.`);
    hostBit(read ? 1 : 0, 'R', 'cmd', `RnW = ${+read}: ${read ? 'read' : 'write'}.`);
    hostBit(a2, 'A2', 'cmd', `A[2] = ${a2}. With A[3], it picks register 0x${(reg * 4).toString(16).toUpperCase()}: ${regName}.`);
    hostBit(a3, 'A3', 'cmd', `A[3] = ${a3}.`);
    hostBit(parity, 'P', 'parity', `Parity = ${parity}: even parity over APnDP, RnW, A[2] and A[3], so their 1s plus this bit add up to an even number.`);
    hostBit(0, 'Sp', 'stop', 'Stop bit = 0.');
    hostBit(1, 'Pk', 'start', 'Park bit = 1. The debugger drives the line high before letting go, so the pull-up has nothing to fight.');
    const request = 1 | (+ap << 1) | (+read << 2) | (a2 << 3) | (a3 << 4) | (parity << 5) | (1 << 7);
    fields.push({ lane: 1, t0: reqStart, t1: t, label: `Request ${hex(request)}: ${read ? 'read' : 'write'} ${ap ? 'AP' : 'DP'} 0x${(reg * 4).toString(16).toUpperCase()}`, kind: 'cmd' });

    turnaround('target', t);

    const ackStart = t - 0.5;
    notes.push({ lane: 1, t: ackStart, text: `ACK ${ack.name}` });
    for (let i = 0; i < 3; i++) {
      const v = ((ack.bits >> i) & 1) as 0 | 1;
      targetBit(v, `${i}`, p.ack === 'ok' ? 'ack' : 'nack', `ACK bit ${i} = ${v}, least significant bit first. ${ack.info}`);
    }
    fields.push({ lane: 1, t0: ackStart, t1: t - 0.5, label: `ACK ${ack.name}`, kind: p.ack === 'ok' ? 'ack' : 'nack' });

    let dataParity = 0;
    for (let i = 0; i < 32; i++) dataParity ^= (data >>> i) & 1;

    if (p.ack === 'ok' && read) {
      const start = t - 0.5;
      for (let i = 0; i < 32; i++) {
        const v = ((data >>> i) & 1) as 0 | 1;
        targetBit(v, `${i}`, 'data', `Data bit ${i} = ${v}, least significant bit first, sent by the target. ${regName} reads as ${hex(data)}.`);
      }
      targetBit(dataParity as 0 | 1, 'P', 'parity', `Parity = ${dataParity}: even parity over the 32 data bits.`);
      fields.push({ lane: 1, t0: start, t1: t - 0.5, label: `${hex(data)} + parity`, kind: 'data' });
      turnaround('controller', t - 0.5);
    } else if (p.ack === 'ok') {
      turnaround('controller', t - 0.5);
      const start = t;
      for (let i = 0; i < 32; i++) {
        const v = ((data >>> i) & 1) as 0 | 1;
        hostBit(v, `${i}`, 'data', `Data bit ${i} = ${v}, least significant bit first, sent by the debugger to ${regName}.`);
      }
      hostBit(dataParity as 0 | 1, 'P', 'parity', `Parity = ${dataParity}: even parity over the 32 data bits.`);
      fields.push({ lane: 1, t0: start, t1: t, label: `${hex(data)} + parity`, kind: 'data' });
    } else {
      turnaround('controller', t - 0.5);
    }

    // A few idle clocks with SWDIO low end the transfer.
    io.set(t, 0);
    for (let i = 0; i < 2; i++) tick();

    return { traces: [clk.trace, io.trace], bits, fields, notes, duration: t + 0.5, unitTime: 1 / 4e6 };
  },
};
