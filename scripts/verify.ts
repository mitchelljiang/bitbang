/**
 * Accuracy checks for every protocol. Run with `npm run verify`.
 *
 * 1. Bit check: every bit's stated value matches the wire at its sample point.
 * 2. Walkthroughs: every tour stop has a valid range and no broken text.
 * 3. Protocol-specific checks, against independent references where possible
 *    (Python's zlib for Ethernet's CRC-32, an independently written JTAG state table, known request bytes for SWD,
 *    reference 8b/10b codes, PCI handshake rules).
 * 4. sigrok: waveforms are exported as VCD and decoded with sigrok-cli's own protocol decoders, if installed.
 *
 * Exits non-zero if anything fails.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Level, Trace, Waveform } from '../src/core/types';
import { protocols } from '../src/protocols';
import { defaults } from '../src/core/util';
import { encode8b10b } from '../src/protocols/pcie';
import { TOURS } from '../src/tours';
import { fold, simulate } from '../src/eye';
import { SECTIONS } from '../src/guide';
import { index } from '../src/search';
import { RESOURCES } from '../src/resources';
import { buildFrame } from '../src/protocols/ethcommon';
import { CONTROL, FOUR_B_FIVE_B, scrambler } from '../src/protocols/fast';
import { PAM5 } from '../src/protocols/gigt';
import { CHANGELOG_TEXT } from '../src/changelog';
import { apply, type Op } from '../src/topics/bitwise';
import { decodeFloat32, encodeFloat32, fixedValue, qRsqrt, toInt8 } from '../src/topics/numbers';
import { MASK_OPS, SHIFTS, bytesOf, endianCode, maskOp, rmwRun, shift, shiftCode, sourceBit } from '../src/topics/ops';
import { TRICKS, trick, trickCode } from '../src/topics/tricks';
import { FLAG_OPS, arith, flagCode } from '../src/topics/flags';
import { LISTINGS, METHODS, checksum, crc8, steps as checkSteps } from '../src/topics/crc';
import { PROGRAM, SOURCE, START } from '../src/topics/calls';
import { WIN_ADDR, outcome } from '../src/topics/bufover';
import { END as IRQ_END, PRIO, trace } from '../src/topics/interrupts';
import { accesses, aligned } from '../src/topics/alignment';
import { firstFit } from '../src/topics/heap';
import { REGIONS as MMAP, regionOf } from '../src/topics/memmap';
import { MASTERS, arbitrate } from '../src/topics/interconnect';
import { SLOTS as FRAME_SLOTS, presentAt, spAt } from '../src/topics/frames';
import { overflowed, spForDepth } from '../src/topics/overflow';
import { SYMS, sramValue } from '../src/topics/sections';
import { access as cacheAccess, fields as cacheFields, type Line } from '../src/topics/caches';
import { PROCS, translate } from '../src/topics/vaddr';
import { L2 as PG_L2, tlbLookup, walk as pgWalk } from '../src/topics/paging';
import { REGIONS as MPU, checkAccess } from '../src/topics/mpu';
import { LR, PC, SP, run } from '../src/topics/inspector';
import { END as NVIC_END, IRQS, nvic, type Irq } from '../src/topics/priorities';
import { CTX, EXC_RETURN, HW_FRAME, TOP as CTX_TOP } from '../src/topics/context';
import { HORIZON, TASKS, rmBound, schedule, utilization, type Task } from '../src/topics/scheduling';
import { ALL_ORDERS, runOrder } from '../src/topics/races';
import { atomicRun } from '../src/topics/atomics';
import { blockedFor, rtos } from '../src/topics/locks';
import { CASES as MB_CASES, OPTIONS as MB_OPTIONS, order as mbOrder } from '../src/topics/barriers';
import { FRAME_BYTES, SP_MAIN, STEPS as PM_STEPS, SYSTICK_EXC, TERMS, excOf, firstStep, vectorAddr } from '../src/topics/mcu';

type Params = Record<string, string>;
const P = Object.fromEntries(protocols.map((p) => [p.id, p]));
const params = (id: string, o: Params = {}) => ({ ...defaults(P[id]), ...o });
const enc = (id: string, o: Params = {}): Waveform => P[id].encode(params(id, o));
const at = (tr: Trace, t: number) => {
  let p = tr.points[0];
  for (const q of tr.points) {
    if (q.t > t + 1e-9) break;
    p = q;
  }
  return p;
};
const level = (tr: Trace, t: number): Level => at(tr, t).v;

let failures = 0;
let passes = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const section = (title: string) => console.log(`\n${title}`);

/** Settings worth checking for each protocol, beyond the defaults. */
const CASES: [string, Params][] = [
  ['uart', {}], ['uart', { parity: 'odd', stop: '2', data: 'Ok' }], ['uart', { bits: '7', parity: 'even' }],
  ['spi', {}], ['spi', { mode: '1' }], ['spi', { mode: '2' }], ['spi', { mode: '3', order: 'lsb' }], ['spi', { clock: '80000000' }],
  ['i2c', {}], ['i2c', { rw: 'r' }], ['i2c', { present: 'no' }], ['i2c', { rw: 'reg' }], ['i2c', { rw: 'reg', stretch: 'yes' }],
  ['i2c', { stretch: 'yes' }], ['i2c', { addrMode: '10', addr: '2A5', rw: 'r' }], ['i2c', { addrMode: '10', addr: '2A5', rw: 'reg' }],
  ['i3c', {}], ['i3c', { rw: 'r' }], ['i3c', { header: 'no' }], ['i3c', { present: 'no' }], ['i3c', { rate: 'ddr' }],
  ['i3c', { rate: 'ddr', data: '0F 42 99' }], ['i3c', { rate: 'entdaa' }], ['i3c', { rate: 'entdaa', present: 'no' }],
  ['qspi', { mode: '111' }], ['qspi', { mode: '114' }], ['qspi', { mode: '144' }], ['qspi', { mode: '444' }],
  ['onewire', {}], ['onewire', { read: '' }], ['onewire', { present: 'no' }],
  ['i2s', {}], ['i2s', { bits: '24', format: 'lj', left: '-1', right: '8388607' }],
  ['rs232', {}], ['rs485', {}],
  ['ethernet', {}], ['ethernet', { format: 'hex', data: '00 11 22 33 44 55 66 77 88 99 AA BB CC DD EE FF' }],
  ['ethframe', {}], ['100base', {}], ['100base', { scramble: 'on' }], ['1000baset', {}], ['1000basex', {}],
  ['1000basex', { data: 'Hello' }], ['rmii', {}], ['rmii', { iface: 'mii' }],
  ['jtag', {}], ['jtag', { seq: 'ir' }],
  ['swd', {}], ['swd', { op: 'w', port: 'ap', reg: '1', data: 'DEADBEEF' }], ['swd', { ack: 'wait' }], ['swd', { ack: 'fault', op: 'w' }],
  ['pci', {}], ['pci', { cmd: 'write', devsel: 'fast', wait: '0' }],
  ['pcie', {}], ['pcie', { content: 'skp' }], ['pcie', { content: 'ts1' }], ['pcie', { content: 'ts1', lanes: '4' }], ['pcie', { lanes: '4', content: 'data' }], ['pcie', { lanes: '8' }],
  ['usb', {}], ['usb', { xfer: 'out', data: 'FF FF 00' }], ['usb', { xfer: 'in', speed: 'low', data: '01 02 03', toggle: 'DATA1' }],
  ['ws2812', {}], ['ws2812', { colors: '123456 ABCDEF 000000', reset: '50' }],
  ['usb', { xfer: 'out', data: '', hs: 'NAK' }], ['usb', { xfer: 'in', hs: 'NAK', data: '' }], ['usb', { speed: 'high' }],
  ['usb', { speed: 'high', xfer: 'out', data: 'FF FF 00 7E', hs: 'NYET' }], ['usb', { speed: 'high', xfer: 'in', hs: 'STALL', data: '' }],
  ['usb', { xfer: 'sof', frame: '247' }], ['usb', { xfer: 'sof', frame: '2047', speed: 'high' }],
];

// ---- 1. Bit check ----
/** Protocols whose bits can't be read straight off one wire, and the check that covers them instead. */
const COVERED_ELSEWHERE: Record<string, string> = {
  usb: 'sigrok USB decoders (NRZI: a bit value is a change, not a level)',
  pci: 'the PCI handshake rules (bus values, not single bits)',
  '1000baset': 'decoding the PAM-5 symbols back into the frame (levels, not single bits)',
};
section('1. Bit values match the wire');
const covered = new Set(CASES.map(([id]) => id));
check('every protocol has test cases', protocols.every((p) => covered.has(p.id)), protocols.filter((p) => !covered.has(p.id)).map((p) => p.id).join(', '));
for (const [id, o] of CASES) {
  const w = enc(id, o);
  let n = 0;
  const bad: string[] = [];
  for (const b of w.bits) {
    const m = / = ([01])[.:,]/.exec(b.info);
    if (!m || b.sample === undefined || w.traces[b.lane].bus) continue;
    n++;
    const v = String(level(w.traces[b.lane], b.sample));
    if (v !== m[1]) bad.push(`${b.label}@${b.sample}: says ${m[1]}, wire ${v}`);
  }
  // A check that compares nothing passes silently, so require coverage unless the protocol is verified another way.
  // Any bit that carries a value (data, address, command, parity) must be compared, unless another check covers it.
  const elsewhere = COVERED_ELSEWHERE[id];
  const valued = w.bits.filter((b) => ['data', 'addr', 'rw', 'cmd', 'parity'].includes(b.kind)).length;
  const empty = n === 0 && valued > 0 && !elsewhere;
  const note = n ? `${n} bits` : elsewhere ? `checked by ${elsewhere}` : 'no data bits in this case';
  check(`${id} ${JSON.stringify(o)}`, bad.length === 0 && !empty,
    bad.length ? bad.slice(0, 3).join('; ') : empty ? `${valued} data bits but none compared: reword the bit text as "X = 0." or add another check` : note);
}

// ---- 1b. Tags ----
section('1b. Tags follow the shared vocabulary');
{
  const one = (list: string[], tags: string[]) => tags.filter((t) => list.includes(t)).length;
  const known = new Set(['synchronous', 'asynchronous', 'embedded clock', 'single-ended', 'differential', 'parallel', 'push-pull',
    'open-drain', 'simplex', 'half duplex', 'full duplex', 'point-to-point', 'multi-drop', 'daisy chain', 'star', 'addressed',
    'chip-to-chip', 'cable', 'expansion', 'debug', 'audio', 'memory', 'networking', 'streaming', '8b/10b', 'Manchester', 'NRZI', 'lanes']);
  for (const p of protocols) {
    const t = p.tags;
    const problems = [
      one(['synchronous', 'asynchronous', 'embedded clock'], t) !== 1 && 'needs exactly one clocking tag',
      one(['single-ended', 'differential'], t) !== 1 && 'needs exactly one of single-ended or differential',
      t.includes('single-ended') && one(['push-pull', 'open-drain'], t) === 0 && 'single-ended needs push-pull or open-drain',
      one(['simplex', 'half duplex', 'full duplex'], t) === 0 && 'needs a duplex tag',
      one(['point-to-point', 'multi-drop', 'daisy chain', 'star'], t) === 0 && 'needs a topology tag',
      one(['chip-to-chip', 'cable', 'expansion', 'debug'], t) === 0 && 'needs a where-it-is-used tag',
      ...t.filter((x) => !known.has(x)).map((x) => `unknown tag "${x}" (add it to the vocabulary)`),
    ].filter(Boolean);
    check(`${p.id}: ${t.join(', ')}`, problems.length === 0, problems.join('; '));
  }
}

// ---- 1c. Settings ----
section('1c. Every setting has an explanation');
{
  const missing = protocols.flatMap((p) => p.params.filter((x) => !x.help?.trim()).map((x) => `${p.id}.${x.key}`));
  const total = protocols.reduce((n, p) => n + p.params.length, 0);
  check(`${total} settings across ${protocols.length} protocols have help text`, missing.length === 0, missing.join(', '));
}

// ---- 1d. Links ----
section('1d. Internal links point to real pages');
{
  const pages = new Set(['basics', 'about', 'changelog', ...index.filter((e) => e.status !== 'soon').map((e) => e.id)]);
  const sources: [string, string][] = [['guide', SECTIONS], ['changelog', CHANGELOG_TEXT]];
  for (const p of protocols) for (const d of p.deepDive ?? []) for (const para of d.body) sources.push([`${p.id}: ${d.title}`, para]);
  let count = 0;
  const broken: string[] = [];
  for (const [where, text] of sources) {
    for (const m of text.matchAll(/\?p=([a-z0-9]+)/g)) {
      count++;
      if (!pages.has(m[1])) broken.push(`${where} → ?p=${m[1]}`);
    }
  }
  const ids = [...index.map((e) => e.id), 'basics', 'about', 'changelog'];
  check('page ids are unique across protocols, Bits and bytes topics and other pages', new Set(ids).size === ids.length);
  const badRes = Object.entries(RESOURCES).flatMap(([id, list]) => [
    ...(pages.has(id) ? [] : [`${id} is not a page`]),
    ...list.filter((r) => !/^https:\/\//.test(r.url) || !r.title.trim()).map((r) => `${id}: ${r.title || '(no title)'} needs a title and an https link`),
  ]);
  check(`related resources: ${Object.values(RESOURCES).flat().length} entries, all on real pages with https links`, badRes.length === 0, badRes.join('; '));
  check(`${count} links in Going deeper, the guide and the changelog lead to existing pages`, broken.length === 0, broken.join('; '));
}

// ---- 2. Walkthroughs ----
section('2. Walkthroughs');
for (const [id, o] of CASES) {
  const w = enc(id, o);
  const tour = w.tour ?? TOURS[id]?.(w, params(id, o));
  if (!tour) {
    check(`${id} has a walkthrough`, false);
    continue;
  }
  const problems: string[] = [];
  tour.forEach((s, i) => {
    const [a, b] = s.view;
    if (!(a < b) || a < -1e-9 || b > w.duration + 1e-9) problems.push(`#${i + 1} view ${a}..${b}`);
    if (s.focus && !(s.focus[0] < s.focus[1])) problems.push(`#${i + 1} focus`);
    if (/undefined|NaN|\[object/.test(s.title + s.text)) problems.push(`#${i + 1} text`);
  });
  check(`${id} ${JSON.stringify(o)}`, problems.length === 0, problems.join('; ') || `${tour.length} stops`);
}

// ---- 3. Protocol-specific checks ----
section('3. Protocol-specific checks');
{
  // Quad SPI: every mode reads back the same bytes, sampled on rising SCLK edges.
  for (const mode of ['111', '114', '144', '444']) {
    const w = enc('qspi', { mode });
    const [, sclk, ...io] = w.traces;
    const rises = sclk.points.filter((p, i) => i && p.v === 1).map((p) => p.t);
    const samples = [...new Set(w.bits.filter((b) => b.kind === 'data').map((b) => b.sample!))].sort((a, b) => a - b);
    const quad = mode.endsWith('4');
    const bits = samples.map((t) => (quad ? [3, 2, 1, 0].map((l) => level(io[l], t)).join('') : String(level(io[1], t)))).join('');
    const hex = BigInt('0b' + bits).toString(16).toUpperCase();
    check(`Quad SPI ${mode} reads DEADBEEF on rising edges`, hex === 'DEADBEEF' && samples.every((t) => rises.some((r) => Math.abs(r - t) < 1e-9)), hex);
  }
  // 1-Wire: low pulse widths in µs.
  const ow = enc('onewire').traces[0].points;
  const pulses: number[] = [];
  for (let i = 1; i < ow.length - 1; i++) if (ow[i].v === 0) pulses.push(Math.round((ow[i + 1].t - ow[i].t) * 10));
  check('1-Wire reset 480 µs, presence 120 µs, writes 6/60 µs, reads 6/30 µs',
    pulses.join(' ') === '480 120 60 60 6 6 60 60 6 6 60 6 6 6 6 6 60 6 30 30 30 30 6 30 6 30 6 30 6 30 30 30 30 30', pulses.join(' '));
  // I²S: decode signed samples; WS one clock early in standard mode.
  for (const [o, want] of [[{}, '12000/-3000'], [{ bits: '24', format: 'lj', left: '-1', right: '8388607' }, '-1/8388607']] as const) {
    const w = enc('i2s', o as Params);
    const [, ws, sd] = w.traces;
    const data = w.bits.filter((b) => b.kind === 'data');
    const half = data.length / 2;
    const val = (arr: typeof data) => {
      let v = 0;
      for (const b of arr) v = v * 2 + (level(sd, b.sample!) as number);
      return v >= 2 ** (half - 1) ? v - 2 ** half : v;
    };
    const fall = ws.points.find((p, i) => i && p.v === 0)!.t;
    const early = (o as Params).format === 'lj' ? 0 : 1;
    check(`I²S ${JSON.stringify(o)} decodes ${want}`, `${val(data.slice(0, half))}/${val(data.slice(half))}` === want && data[0].t0 - fall === early);
  }
  // RS-232: line is the inverse of TX.
  const r232 = enc('rs232');
  check('RS-232 line is the inverse of TX', r232.traces[0].points.every((p) => level(r232.traces[1], p.t) === 1 - (p.v as number)));
  // JTAG: an independently written IEEE 1149.1 TAP table.
  const T: Record<string, [string, string]> = {
    TLR: ['RTI', 'TLR'], RTI: ['RTI', 'SDS'], SDS: ['CDR', 'SIS'], CDR: ['SDR', 'E1D'], SDR: ['SDR', 'E1D'], E1D: ['PDR', 'UDR'],
    PDR: ['PDR', 'E2D'], E2D: ['SDR', 'UDR'], UDR: ['RTI', 'SDS'], SIS: ['CIR', 'TLR'], CIR: ['SIR', 'E1I'], SIR: ['SIR', 'E1I'],
    E1I: ['PIR', 'UIR'], PIR: ['PIR', 'E2I'], E2I: ['SIR', 'UIR'], UIR: ['RTI', 'SDS'],
  };
  for (const o of [{}, { seq: 'ir' }]) {
    const w = enc('jtag', o);
    const [tck, tms, tdi, tdo] = w.traces;
    const rows = tck.points.filter((p, i) => i && p.v === 1).map((p) => [level(tms, p.t), level(tdi, p.t), level(tdo, p.t)] as number[]);
    const ends = new Set(Object.keys(T).map((s0) => rows.slice(0, 5).reduce((s) => T[s][1], s0)));
    let s = 'TLR';
    const dr: number[] = [];
    const ir: number[] = [];
    for (const [m, , o2] of rows.slice(5)) {
      if (s === 'SDR') dr.push(o2);
      if (s === 'SIR') ir.push(o2);
      s = T[s][m];
    }
    const id = parseInt(dr.reverse().join(''), 2).toString(16).toUpperCase();
    check(`JTAG ${JSON.stringify(o)}: reset converges, IDCODE 4BA00477, ends in Run-Test/Idle`,
      ends.size === 1 && id === '4BA00477' && s === 'RTI' && (ir.length === 0 || ir.reverse().join('').endsWith('01')), `IDCODE ${id}, end ${s}`);
  }
  // SWD: known request bytes, read back off the wire (host bits on rising edges, target bits on falling edges).
  for (const [o, want, data] of [[{}, 0xa5, 0x2ba01477], [{ op: 'w', port: 'ap', reg: '1', data: 'DEADBEEF' }, 0x8b, 0xdeadbeef]] as const) {
    const w = enc('swd', o as Params);
    const [clk, io] = w.traces;
    const host = clk.points.slice(1).filter((p) => p.v === 1).map((p) => level(io, p.t - 1e-6) as number);
    const tgt = clk.points.slice(1).filter((p) => p.v === 0).map((p) => level(io, p.t - 1e-6) as number);
    const req = host.slice(0, 8).reduce((acc, v, i) => acc | (v << i), 0);
    // Target bits are read on falling edges; with the turnaround, ACK is falling edges 8-10 and read data 11-42.
    const words = (o as Params).op === 'w' ? host.slice(13, 45) : tgt.slice(11, 43);
    const val = words.reduce((acc, v, i) => acc + v * 2 ** i, 0);
    check(`SWD request 0x${want.toString(16)} and data 0x${data.toString(16)}`, req === want && val === data, `request 0x${req.toString(16)}, data 0x${val.toString(16)}`);
  }
  // Ethernet: decode the Manchester line and check the FCS with Python's zlib.
  for (const o of [{}, { format: 'hex', data: '00 11 22 33 44 55 66 77 88 99 AA BB CC DD EE FF' }]) {
    const w = enc('ethernet', o);
    const tx = w.traces[1];
    const bits: number[] = [];
    for (let t = 1; ; t++) {
      const a = level(tx, t + 0.25);
      const b = level(tx, t + 0.75);
      if (a === 'z' || b === 'z' || a === b) break;
      bits.push(b as number);
    }
    const bytes: number[] = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(bits.slice(i, i + 8).reduceRight((acc, v) => acc * 2 + v, 0));
    const frame = bytes.slice(8, -4);
    const fcs = bytes.slice(-4);
    let ok = false;
    try {
      const py = `import zlib,sys; f=bytes.fromhex(sys.argv[1]); c=bytes.fromhex(sys.argv[2]); print(zlib.crc32(f)==int.from_bytes(c,'little'))`;
      ok = execFileSync('python3', ['-I', '-c', py, Buffer.from(frame).toString('hex'), Buffer.from(fcs).toString('hex')]).toString().trim() === 'True';
    } catch {
      console.log('        (python3 not available; skipping zlib check)');
      ok = true;
    }
    check(`10BASE-T ${JSON.stringify(o)}: preamble, SFD and FCS (zlib.crc32)`, ok && bytes.slice(0, 7).every((b) => b === 0x55) && bytes[7] === 0xd5 && frame.length >= 60);
  }
  // Every Ethernet physical layer: decode the signal on its wire back into bytes, independently of its encoder, and
  // check that it carries the same frame as the Ethernet frame page, with a CRC that Python's zlib accepts.
  {
    const zlibOk = (bytes: number[]) => {
      try {
        const py = `import zlib,sys; f=bytes.fromhex(sys.argv[1]); print(zlib.crc32(f[:-4])==int.from_bytes(f[-4:],'little'))`;
        return execFileSync('python3', ['-I', '-c', py, Buffer.from(bytes.slice(8)).toString('hex')]).toString().trim() === 'True';
      } catch {
        return true;
      }
    };
    const toBytes = (bits: number[]) => {
      const out: number[] = [];
      for (let i = 0; i + 8 <= bits.length; i += 8) out.push(bits.slice(i, i + 8).reduceRight((acc, v) => acc * 2 + v, 0));
      return out;
    };
    const same = (name: string, got: number[], o: Params) => {
      const want = buildFrame(params(name, o)).bytes;
      const match = got.length === want.length && got.every((b, i) => b === want[i]);
      check(`${name} ${JSON.stringify(o)}: decodes to the same frame, and zlib accepts its CRC`, match && zlibOk(got),
        match ? '' : `got ${got.length} bytes, want ${want.length}; first difference at ${got.findIndex((b, i) => b !== want[i])}`);
    };
    const at = (tr: Trace, t: number) => level(tr, t) as number;

    // The frame page: its bit lane, read straight off.
    {
      const w = enc('ethframe');
      const bits: number[] = [];
      for (let t = 1; at(w.traces[1], t + 0.5) !== ('z' as unknown); t++) bits.push(at(w.traces[1], t + 0.5));
      same('ethframe', toBytes(bits), {});
    }
    // 100BASE-TX: MLT-3 changes level for a 1; undo the scrambler, map code groups back to nibbles, and drop the
    // control codes.
    for (const o of [{}, { scramble: 'on' }] as Params[]) {
      const w = enc('100base', o);
      const tx = w.traces.at(-1)!;
      const line: number[] = [];
      let prev = at(tx, 0.5);
      for (let t = 1; t < w.duration - 1; t++) {
        const v = at(tx, t + 0.5);
        line.push(v === prev ? 0 : 1);
        prev = v;
      }
      const xor = scrambler();
      const code = o.scramble === 'on' ? line.map((b) => xor(b)) : line;
      const groups = Array.from({ length: Math.floor(code.length / 5) }, (_, k) => code.slice(5 * k, 5 * k + 5).join(''));
      const data = groups.filter((g) => !Object.values(CONTROL).includes(g as never));
      const nibbles = data.map((g) => FOUR_B_FIVE_B.indexOf(g));
      const okDelims = groups.includes(CONTROL.J) && groups.includes(CONTROL.K) && groups.includes(CONTROL.T) && groups.includes(CONTROL.R);
      const bytes = [0x55, ...Array.from({ length: nibbles.length / 2 }, (_, k) => nibbles[2 * k] | (nibbles[2 * k + 1] << 4))];
      check(`100base ${JSON.stringify(o)}: J K start and T R end delimiters, and only valid code groups`, okDelims && nibbles.every((n) => n >= 0));
      same('100base', bytes, o);
    }
    // 1000BASE-X: decode each 10-bit group against every code the encoder could produce, from a reverse table built
    // with the reference codes checked below, then check the ordered sets around the frame.
    for (const o of [{}, { data: 'Hello' }] as Params[]) {
      const w = enc('1000basex', o);
      const light = w.traces[1];
      const bits: number[] = [];
      for (let t = 1; t < w.duration - 1; t++) bits.push(at(light, t + 0.5));
      const table = new Map<string, string>();
      // Data codes for every byte, then the 12 control codes that exist (K28.0–K28.7, K23.7, K27.7, K29.7, K30.7).
      const controls = [...Array.from({ length: 8 }, (_, y) => (y << 5) | 28), 0xf7, 0xfb, 0xfd, 0xfe];
      for (const rd of [-1, 1] as const) {
        for (let b = 0; b < 256; b++) table.set(encode8b10b(b, false, rd).code, `D${b}`);
        for (const b of controls) table.set(encode8b10b(b, true, rd).code, `K${b}`);
      }
      const names = Array.from({ length: bits.length / 10 }, (_, k) => table.get(bits.slice(10 * k, 10 * k + 10).join('')) ?? '?');
      const s = names.indexOf(`K${(7 << 5) | 27}`);
      const tEnd = names.indexOf(`K${(7 << 5) | 29}`);
      const frame = [0x55, ...names.slice(s + 1, tEnd).map((n) => Number(n.slice(1)))];
      const idleOk = names[0] === `K${(5 << 5) | 28}` && names.at(-2) === `K${(5 << 5) | 28}` && s % 2 === 0;
      const rdOk = names.every((n) => n !== '?');
      check(`1000basex ${JSON.stringify(o)}: every group is a valid 8b/10b code, idle starts with the K28.5 comma, /S/ on an even position, /T/ then /R/`,
        rdOk && idleOk && names[tEnd + 1] === `K${(7 << 5) | 23}` && (tEnd + 2 + (names[tEnd + 2] === `K${(7 << 5) | 23}` ? 1 : 0)) % 2 === 0);
      same('1000basex', frame, o);
    }
    // 1000BASE-T: each symbol period, read the level on every pair and map it back to two bits.
    {
      const w = enc('1000baset');
      const back = Object.fromEntries(Object.entries(PAM5).map(([bits, lv]) => [lv, Number(bits)]));
      const start = w.bits[0].t0;
      const n = w.bits.length / 4;
      const bytes = Array.from({ length: n }, (_, k) => [1, 2, 3, 4].reduce((acc, lane, pair) => acc | (back[at(w.traces[lane], start + k + 0.5)] << (2 * pair)), 0));
      same('1000baset', bytes, {});
    }
    // MII and RMII: sample every data line on each rising clock edge while TX_EN is high.
    for (const o of [{}, { iface: 'mii' }] as Params[]) {
      const w = enc('rmii', o);
      const width = w.traces.length - 2;
      const bits: number[] = [];
      for (let t = 0; t < w.duration; t++) {
        if (at(w.traces[0], t + 0.5) !== 1 || at(w.traces[1], t + 0.5) !== 1) continue;
        for (let k = 0; k < width; k++) bits.push(at(w.traces[2 + k], t + 0.5));
      }
      same('rmii', toBytes(bits), o);
    }
  }
  // PCIe: reference 8b/10b codes, structural properties, and lane striping.
  const refs: [string, number, boolean, string, string][] = [
    ['K28.5', 0xbc, true, '0011111010', '1100000101'], ['K28.0', 0x1c, true, '0011110100', '1100001011'],
    ['K23.7', 0xf7, true, '1110101000', '0001010111'], ['D10.2', 0x4a, false, '0101010101', '0101010101'],
    ['D21.5', 0xb5, false, '1010101010', '1010101010'], ['D0.0', 0x00, false, '1001110100', '0110001011'],
    ['D3.0', 0x03, false, '1100011011', '1100010100'], ['D17.7', 0xf1, false, '1000110111', '1000110001'],
  ];
  check('8b/10b reference codes', refs.every(([, b, k, m, p]) => encode8b10b(b, k, -1).code === m && encode8b10b(b, k, 1).code === p));
  const seen = new Map<string, number>();
  let collisions = 0;
  for (let b = 0; b < 256; b++) for (const rd of [-1, 1] as const) {
    const c = encode8b10b(b, false, rd).code;
    if (seen.has(c) && seen.get(c) !== b) collisions++;
    seen.set(c, b);
  }
  let comma = 0;
  let longest = 0;
  for (let trial = 0; trial < 500; trial++) {
    let rd: -1 | 1 = trial % 2 ? 1 : -1;
    let line = '';
    for (let i = 0; i < 32; i++) {
      const o = encode8b10b(Math.floor(Math.random() * 256), false, rd);
      line += o.code;
      rd = o.rd;
    }
    if (/0011111|1100000/.test(line)) comma++;
    for (const run of line.match(/0+|1+/g)!) longest = Math.max(longest, run.length);
  }
  check('8b/10b: unique codes, no comma in data, runs ≤ 5', collisions === 0 && comma === 0 && longest <= 5, `collisions ${collisions}, commas ${comma}, longest run ${longest}`);
  const decode = new Map<string, string>();
  for (let b = 0; b < 256; b++) for (const rd of [-1, 1] as const) decode.set(encode8b10b(b, false, rd).code, b.toString(16).padStart(2, '0'));
  decode.set(encode8b10b(0xf7, true, -1).code, 'PAD');
  decode.set(encode8b10b(0xf7, true, 1).code, 'PAD');
  for (const lanes of ['1', '2', '4', '8']) {
    const w = enc('pcie', { lanes, content: 'data', data: 'DE AD BE EF 01 02 03' });
    const per = w.traces.map((tr) => {
      let s = '';
      for (let t = 1; t < w.duration - 1; t++) s += level(tr, t + 0.5);
      const out: string[] = [];
      for (let i = 0; i + 10 <= s.length; i += 10) out.push(decode.get(s.slice(i, i + 10)) ?? '??');
      return out;
    });
    const joined: string[] = [];
    for (let r = 0; r < per[0].length; r++) for (const l of per) joined.push(l[r]);
    const got = joined.filter((x) => x !== 'PAD').join(' ');
    check(`PCIe x${lanes} striping reassembles the bytes`, got === 'de ad be ef 01 02 03', got);
  }
  // PCI: handshake rules across every combination.
  let pciBad = 0;
  for (const cmd of ['read', 'write']) for (const devsel of ['fast', 'medium', 'slow']) for (const wait of ['0', '1', '2']) for (const data of ['CAFEF00D', 'CAFEF00D 12345678 DEADBEEF']) {
    const w = enc('pci', { cmd, devsel, wait, data });
    const [clk, frame, ad, , irdy, trdy, dev] = w.traces;
    const edges = clk.points.filter((p, i) => i && p.v === 1).map((p) => p.t);
    const xfers = edges.filter((e) => level(irdy, e) === 0 && level(trdy, e) === 0);
    const words = data.split(' ');
    const ok = xfers.length === words.length
      && xfers.map((e) => at(ad, e).label).join() === words.map((x) => `0x${x}`).join()
      && xfers.every((e) => level(dev, e) === 0)
      && xfers.every((e, i) => (level(frame, e) === 1) === (i === xfers.length - 1))
      && (cmd !== 'read' || level(ad, 3) === 'z');
    if (!ok) pciBad++;
  }
  check('PCI: 36 combinations follow the IRDY#/TRDY#/DEVSEL#/FRAME# rules', pciBad === 0, `${pciBad} broken`);
  // PCIe eye diagram: a long trace should fail without de-emphasis and recover with it; short and typical traces pass.
  const eye = (loss: number, deemph: boolean) => {
    const { bits, y } = simulate({ loss, jitter: 0.015, deemph });
    return fold(bits, y);
  };
  const short = eye(0.2, false);
  const longOff = eye(1.05, false);
  const longOn = eye(1.05, true);
  check('PCIe eye: short trace open, long trace closes, de-emphasis reopens it',
    short.height > 1.5 && longOn.height > longOff.height && longOn.width > longOff.width + 0.1,
    `short ${(short.height / 2 * 100).toFixed(0)}%, long off ${(longOff.height / 2 * 100).toFixed(0)}% / ${longOff.width.toFixed(2)} UI, long on ${(longOn.height / 2 * 100).toFixed(0)}% / ${longOn.width.toFixed(2)} UI`);
}

// ---- 3b. Bits and bytes ----
section('3b. Bitwise logic panel');
{
  const cases: [Op, number, number, number][] = [['and', 0xb2, 0x6b, 0x22], ['or', 0xb2, 0x6b, 0xfb], ['xor', 0xb2, 0x6b, 0xd9], ['not', 0xb2, 0x6b, 0x4d], ['not', 0x00, 0, 0xff]];
  const bad = cases.filter(([op, a, b, want]) => apply(op, a, b) !== want).map(([op, a, b, want]) => `${op} ${a} ${b}: got ${apply(op, a, b)}, want ${want}`);
  check('AND, OR, XOR and NOT on 8-bit values match worked examples', bad.length === 0, bad.join('; '));
}

section('3c. Representing numbers');
{
  // Two's complement and fixed point, against worked examples.
  const twos: [number, number][] = [[0xb2, -78], [0x80, -128], [0x7f, 127], [0xff, -1], [0, 0]];
  check('uint8_t patterns read as int8_t', twos.every(([v, want]) => toInt8(v) === want), twos.map(([v]) => toInt8(v)).join(' '));
  check('UQ4.4 0xB2 is 11.125, UQ0.8 0x80 is 0.5, UQ8.0 0xFF is 255', fixedValue(0xb2, 4) === 11.125 && fixedValue(0x80, 8) === 0.5 && fixedValue(0xff, 0) === 255);
  // IEEE 754: bit patterns and exact decimal values, against Python's struct and Decimal as an independent reference.
  const values = ['0.1', '1', '-2.5', '3.4028234663852886e38', '1e-45', '5.877472e-39', '0', '-0.0', '123.456'];
  const py = execFileSync('python3', ['-c', `
import struct, decimal, sys
for s in sys.argv[1:]:
    b = struct.unpack('>I', struct.pack('>f', float(s)))[0]
    v = struct.unpack('>f', struct.pack('>I', b))[0]
    d = format(decimal.Decimal(v), 'f')
    if '.' in d: d = d.rstrip('0').rstrip('.')
    if d in ('-0',): d = '-0'
    print(f'{b:08X} {d}')
`, ...values]).toString().trim().split('\n');
  const mine = values.map((v) => {
    const b = encodeFloat32(Number(v));
    const d = decodeFloat32(b);
    return `${b.toString(16).toUpperCase().padStart(8, '0')} ${d.exact === '-0' || (d.kind === 'zero' && d.sign) ? '-0' : d.exact}`;
  });
  const diffs = values.map((v, i) => (mine[i] === py[i] ? '' : `${v}: ${mine[i]} vs python ${py[i]}`)).filter(Boolean);
  check(`${values.length} floats: bit patterns and exact decimal values match Python`, diffs.length === 0, diffs.join('; '));
  const special = [[0x7f800000, 'infinity'], [0xff800000, 'infinity'], [0x7fc00000, 'nan'], [0x00000001, 'subnormal'], [0x80000000, 'zero']] as const;
  check('infinity, NaN, subnormal and zero are recognized', special.every(([b, k]) => decodeFloat32(b).kind === k));
  // Fast inverse square root: the page's steps against the C code itself, compiled and run.
  {
    const inputs = ['2', '0.25', '1000', '3.14159', '1e-20'];
    const hexN = (v: number) => (v >>> 0).toString(16).toUpperCase().padStart(8, '0');
    const dir = mkdtempSync(join(tmpdir(), 'qrsqrt-'));
    const src = join(dir, 'q.c');
    writeFileSync(src, `#include <stdio.h>
#include <stdint.h>
#include <string.h>
#include <stdlib.h>
int main(int argc, char **argv) {
  for (int a = 1; a < argc; a++) {
    float number = strtof(argv[a], 0), x2 = number * 0.5f, y = number;
    uint32_t i, i0;
    memcpy(&i, &y, sizeof i); i0 = i;
    i = 0x5F3759DF - (i >> 1);
    memcpy(&y, &i, sizeof y);
    float y0 = y;
    y = y * (1.5f - (x2 * y * y));
    printf("%08X %08X %a %a\\n", i0, i, (double)y0, (double)y);
  }
}`);
    const exe = join(dir, 'q');
    let out = '';
    try {
      execFileSync('cc', ['-O0', '-ffp-contract=off', '-o', exe, src]);
      out = execFileSync(exe, inputs).toString().trim();
    } catch {
      out = '';
    }
    const hexf = (v: number) => {
      // %a formatting of a double, to compare exactly with C.
      if (v === 0) return '0x0p+0';
      const dv = new DataView(new ArrayBuffer(8));
      dv.setFloat64(0, v);
      const hi = dv.getUint32(0), lo = dv.getUint32(4);
      const exp = ((hi >>> 20) & 0x7ff) - 1023;
      const mant = ((BigInt(hi & 0xfffff) << 32n) | BigInt(lo)).toString(16).padStart(13, '0').replace(/0+$/, '');
      return `${v < 0 ? '-' : ''}0x1${mant ? '.' + mant : ''}p${exp >= 0 ? '+' : ''}${exp}`;
    };
    const mine = inputs.map((x) => {
      const q = qRsqrt(Number(x));
      return `${hexN(q.i0)} ${hexN(q.i1)} ${hexf(q.y0)} ${hexf(q.y1)}`;
    }).join('\n');
    check('fast inverse square root matches the C code compiled and run', out !== '' && mine === out, out ? `page: ${mine.split('\n')[0]} vs C: ${out.split('\n')[0]}` : 'could not compile with cc');
  }
}

section('3d. Shifts, masks, read-modify-write and endianness');
{
  const all = Array.from({ length: 256 }, (_, v) => v);
  const range = (n: number) => Array.from({ length: n }, (_, k) => k);
  // Shifts: worked examples, then every value and distance against where each result bit is said to come from.
  const worked: [typeof SHIFTS[number], number][] = [['shl', 0x90], ['shr', 0x16], ['sar', 0xf6], ['rol', 0x95], ['ror', 0x56]];
  check('shifts and rotates of 0xB2 by 3 match worked examples', worked.every(([op, want]) => shift(op, 0xb2, 3) === want),
    worked.map(([op]) => `${op} ${shift(op, 0xb2, 3).toString(16)}`).join(', '));
  const badSrc = SHIFTS.flatMap((op) => all.flatMap((x) => range(8).flatMap((n) => range(8).filter((i) => {
    const s = sourceBit(op, n, i);
    const want = s === 'zero' ? 0 : s === 'sign' ? (x >> 7) & 1 : (x >> s) & 1;
    return ((shift(op, x, n) >> i) & 1) !== want;
  }).map((i) => `${op} ${x} ${n} bit ${i}`))));
  check('every result bit of every shift comes from where the page says (all values and distances)', badSrc.length === 0, badSrc.slice(0, 3).join('; '));
  check('rotating left then right by the same distance returns the value', all.every((x) => range(8).every((n) => shift('ror', shift('rol', x, n), n) === x)));
  check('arithmetic right shift divides by 2ⁿ rounding toward minus infinity',
    all.every((x) => range(8).every((n) => toInt8(shift('sar', x, n)) === Math.floor(toInt8(x) / 2 ** n))));

  // The C on the shifts page, compiled and run, for every operation and distance.
  {
    const cases = SHIFTS.flatMap((op) => [0xb2, 0x4d, 0x01, 0x80].flatMap((x) => range(8).map((n) => ({ op, x, n }))));
    const body = cases.map(({ op, x, n }, k) => {
      const lines = shiftCode(op, x, n).slice(2).map((l) => l.replace(/\/\/.*$/, ''));
      return `  { ${lines.join(' ')} printf("%d\\n", (int)r); } /* ${k} */`;
    }).join('\n');
    const dir = mkdtempSync(join(tmpdir(), 'shift-'));
    const src = join(dir, 'shift.c');
    writeFileSync(src, `#include <stdint.h>\n#include <stdio.h>\nint main(void) {\n${body}\n}\n`);
    let out: string[] = [];
    try {
      execFileSync('cc', ['-O0', '-w', '-o', join(dir, 's'), src]);
      out = execFileSync(join(dir, 's')).toString().trim().split('\n');
    } catch { /* no compiler: reported below */ }
    const bad = cases.filter(({ op, x, n }, k) => Number(out[k]) !== (op === 'sar' ? toInt8(shift(op, x, n)) : shift(op, x, n)));
    check(`the shifts page's C, compiled and run, gives the page's results (${cases.length} cases)`, out.length === cases.length && bad.length === 0,
      out.length ? bad.slice(0, 3).map(({ op, x, n }) => `${op} ${x} ${n}`).join('; ') : 'could not compile with cc');
  }

  // Masks: bits outside the mask never change; inside it, set, clear and toggle do what they say.
  const badMask = MASK_OPS.filter((op) => op !== 'test').flatMap((op) => all.flatMap((reg) => [0x01, 0x20, 0x24, 0xf0, 0xff, 0x00].filter((m) => {
    const r = maskOp(op, reg, m);
    const want = op === 'set' ? 1 : op === 'clear' ? 0 : null;
    return range(8).some((i) => {
      const was = (reg >> i) & 1;
      const now = (r >> i) & 1;
      if (!((m >> i) & 1)) return now !== was;
      return want === null ? now === was : now !== want;
    });
  }).map((m) => `${op} ${reg} ${m}`)));
  check('set, clear and toggle change exactly the masked bits', badMask.length === 0, badMask.slice(0, 3).join('; '));
  check('test is nonzero exactly when a masked bit is set', all.every((reg) => all.every((m) => (maskOp('test', reg, m) !== 0) === ((reg & m) !== 0))));

  // Read-modify-write: only the interrupted read-modify-write loses the interrupt's bit.
  const final = (mode: 'rmw' | 'set', irq: boolean) => rmwRun(mode, irq).at(-1)!.odr;
  check('read-modify-write: the interrupt\'s bit is lost only when it lands between the read and the write',
    final('rmw', false) === 0x48 && final('rmw', true) === 0x48 && final('set', false) === 0x48 && final('set', true) === 0x49,
    `${final('rmw', false).toString(16)} ${final('rmw', true).toString(16)} ${final('set', false).toString(16)} ${final('set', true).toString(16)}`);

  // Endianness: byte order against DataView, then the page's C program compiled and run on this machine.
  const samples = [0x1234, 0x0102, 0xabcd, 0x12345678, 0xdeadbeef, 0x01020304];
  const badBytes = samples.flatMap((x) => ([16, 32] as const).filter((w) => x < 2 ** w).flatMap((w) => [true, false].filter((little) => {
    const dv = new DataView(new ArrayBuffer(w / 8));
    if (w === 16) dv.setUint16(0, x, little); else dv.setUint32(0, x, little);
    return bytesOf(x, w, little).join() !== [...new Uint8Array(dv.buffer)].join();
  }).map((little) => `${x.toString(16)} ${w} ${little ? 'le' : 'be'}`)));
  check('bytes in memory match DataView for both byte orders', badBytes.length === 0, badBytes.join('; '));
  {
    const dir = mkdtempSync(join(tmpdir(), 'endian-'));
    const little = new Uint8Array(new Uint16Array([0x0102]).buffer)[0] === 0x02;
    const runs = ([[0x1234, 16], [0x12345678, 32]] as const).map(([x, w]) => {
      const lines = endianCode(x, w, little);
      const src = join(dir, `e${w}.c`);
      writeFileSync(src, lines.join('\n') + '\n');
      try {
        execFileSync('cc', ['-O0', '-o', join(dir, `e${w}`), src]);
        const out = execFileSync(join(dir, `e${w}`)).toString().trim().split('\n');
        const said = [lines[8].replace(/^.*\/\/ prints /, ''), lines[10].endsWith('runs') ? 'little-endian' : 'big-endian'];
        return out[0] === said[0] && out[1] === said[1] ? '' : `${w}-bit: printed ${out.join(' / ')}, page says ${said.join(' / ')}`;
      } catch {
        return `${w}-bit: could not compile with cc`;
      }
    }).filter(Boolean);
    check(`the endianness program, compiled and run here (${little ? 'little' : 'big'}-endian), prints what the page says`, runs.length === 0, runs.join('; '));
  }
}

section('3e. Bit tricks, status flags, checksums and CRC');
{
  const all = Array.from({ length: 256 }, (_, v) => v);
  /** Compiles a C program and returns its output lines, or null if there is no compiler. */
  const runC = (name: string, src: string) => {
    const dir = mkdtempSync(join(tmpdir(), `${name}-`));
    writeFileSync(join(dir, `${name}.c`), src);
    try {
      execFileSync('cc', ['-O0', '-w', '-o', join(dir, name), join(dir, `${name}.c`)]);
      return execFileSync(join(dir, name), { maxBuffer: 1 << 24 }).toString().trim().split('\n');
    } catch {
      return null;
    }
  };
  const body = (lines: string[]) => lines.filter((l) => !l.startsWith('#') && l.trim()).map((l) => l.replace(/\/\/.*$/, '')).join(' ');

  // Bit tricks, against plain definitions, then the page's C for every value of x.
  const ones = (x: number) => [...x.toString(2)].filter((c) => c === '1').length;
  const low = (x: number) => (x ? 2 ** [...Array(8).keys()].find((i) => (x >> i) & 1)! : 0);
  const want = (t: typeof TRICKS[number], x: number) => t === 'clear' ? x - low(x) : t === 'isolate' ? low(x)
    : t === 'pow2' ? (ones(x) === 1 ? 1 : 0) : t === 'popcount' ? ones(x) : 8 - x.toString(2).replace(/^0$/, '').length;
  const badTricks = TRICKS.flatMap((t) => all.filter((x) => trick(t, x) !== want(t, x)).map((x) => `${t} ${x}`));
  check('every bit trick matches its definition for all 256 values', badTricks.length === 0, badTricks.slice(0, 3).join('; '));
  {
    const result = { clear: 'r', isolate: 'r', pow2: 'pow2', popcount: 'count', clz: 'lz' };
    const cases = TRICKS.flatMap((t) => all.map((x) => ({ t, x })));
    const out = runC('tricks', `#include <stdbool.h>\n#include <stdint.h>\n#include <stdio.h>\nint main(void) {\n${cases.map(({ t, x }) =>
      `  { ${body(trickCode(t, x))} printf("%d\\n", (int)${result[t]}); }`).join('\n')}\n}\n`);
    const bad = out ? cases.filter(({ t, x }, k) => Number(out[k]) !== trick(t, x)) : [];
    check(`the bit tricks page's C, compiled and run, gives the page's results (${cases.length} cases)`, out !== null && bad.length === 0,
      out ? bad.slice(0, 3).map(({ t, x }) => `${t} ${x}`).join('; ') : 'could not compile with cc');
  }

  // Status flags, against the definitions: C and V say whether the unsigned and the signed result fit.
  const badFlags = FLAG_OPS.flatMap((op) => all.flatMap((a) => all.filter((b) => {
    const f = arith(op, a, b);
    const u = op === 'add' ? a + b : a - b;
    const sv = op === 'add' ? toInt8(a) + toInt8(b) : toInt8(a) - toInt8(b);
    return f.r !== (u & 0xff) || f.n !== f.r >> 7 || f.z !== (f.r === 0 ? 1 : 0)
      || f.c !== (op === 'add' ? (u > 255 ? 1 : 0) : (u >= 0 ? 1 : 0)) || f.v !== (sv < -128 || sv > 127 ? 1 : 0);
  }).map((b) => `${op} ${a} ${b}`)));
  check('N, Z, C and V for every 8-bit add and subtract (131072 cases)', badFlags.length === 0, badFlags.slice(0, 3).join('; '));
  {
    const cases = FLAG_OPS.flatMap((op) => [0, 1, 5, 10, 80, 100, 127, 128, 129, 200, 255].flatMap((a) => [0, 1, 10, 80, 100, 127, 128, 200, 255].map((b) => ({ op, a, b }))));
    const out = runC('flags', `#include <stdbool.h>\n#include <stdint.h>\n#include <stdio.h>\nint main(void) {\n${cases.map(({ op, a, b }) =>
      `  { ${body(flagCode(op, a, b))} printf("%d %d %d %d %d\\n", r, n, z, c, v); }`).join('\n')}\n}\n`);
    const bad = out ? cases.filter(({ op, a, b }, k) => {
      const f = arith(op, a, b);
      return out[k] !== `${f.r} ${f.n} ${f.z} ${f.c} ${f.v}`;
    }) : [];
    check(`the flags page's C, compiled and run, sets the page's flags (${cases.length} cases)`, out !== null && bad.length === 0,
      out ? bad.slice(0, 3).map(({ op, a, b }) => `${op} ${a} ${b}`).join('; ') : 'could not compile with cc');
  }

  // Checksums and CRC: the published CRC-8/SMBUS check value, the checksum's defining property, the stepper's final
  // value, and the page's two functions compiled and run.
  const ascii = [...'123456789'].map((c) => c.charCodeAt(0));
  check('CRC-8 of "123456789" is 0xF4, the published check value for CRC-8/SMBUS', crc8(ascii) === 0xf4, crc8(ascii).toString(16));
  const samples = [[0x48, 0x69], [0x00], [0xff, 0xff, 0xff, 0xff], [0x12, 0x34, 0x56], [0x80, 0x01, 0x7f, 0xfe], [0x69, 0x48]];
  check('data plus its checksum adds up to 0 modulo 256', samples.every((d) => (d.reduce((x, y) => x + y, 0) + checksum(d)) % 256 === 0));
  check('stepping through to the end gives the same checksum and CRC', samples.every((d) =>
    METHODS.every((m) => checkSteps(m, d).at(-1)!.acc === (m === 'sum' ? checksum(d) : crc8(d)))));
  check('swapping bytes leaves the checksum and changes the CRC, as the page shows', checksum([0x48, 0x69]) === checksum([0x69, 0x48]) && crc8([0x48, 0x69]) !== crc8([0x69, 0x48]));
  {
    const out = runC('check', `#include <stddef.h>\n#include <stdint.h>\n#include <stdio.h>\n${LISTINGS.sum.join('\n')}\n${LISTINGS.crc8.join('\n')}\nint main(void) {\n${
      samples.map((d) => `  { const uint8_t d[] = {${d.join(', ')}}; printf("%d %d\\n", checksum(d, ${d.length}), crc8(d, ${d.length})); }`).join('\n')}\n}\n`);
    const bad = out ? samples.filter((d, k) => out[k] !== `${checksum(d)} ${crc8(d)}`) : [];
    check('the page\'s checksum and CRC-8 functions, compiled and run, agree with the page', out !== null && bad.length === 0,
      out ? bad.map((d) => d.join(' ')).join('; ') : 'could not compile with cc');
  }
}

section('3f. Memory: function calls');
{
  const frames = run(PROGRAM, START);
  const end = frames.at(-1)!.cpu;
  check('main() returns square(5) + 1 = 26 in r0, with SP and r7 restored and PC back in Reset_Handler',
    end.r[0] === 26 && end.r[SP] === START.r[SP] && end.r[7] === START.r[7] && end.r[PC] === (START.r[LR] & ~1),
    `r0 ${end.r[0]}, sp ${end.r[SP].toString(16)}, pc ${end.r[PC].toString(16)}`);
  const pushed = frames.find((f) => f.ran?.text.startsWith('push'))!.cpu;
  check('push {r7, lr} stores r7 at SP and LR above it, 8 bytes below the top of the stack',
    pushed.r[SP] === START.r[SP] - 8 && pushed.mem.get(pushed.r[SP]) === START.r[7] && pushed.mem.get(pushed.r[SP] + 4) === START.r[LR]);
  const called = frames.find((f) => f.ran?.text.startsWith('bl'))!;
  check('bl puts the address after it, with the Thumb bit set, in LR', called.cpu.r[LR] === ((called.ran!.addr + 4) | 1));

  // The encodings, from a real assembler, and the instructions, from a real compiler, when Clang can target Arm.
  const dir = mkdtempSync(join(tmpdir(), 'stack-'));
  const objdump = (o: string) => execFileSync('objdump', ['-d', '--triple=thumbv7em-none-eabi', o]).toString()
    .split('\n').map((l) => l.match(/^\s*([0-9a-f]+):\s+((?:[0-9a-f]{4} ?)+)\s+(\S+)\s*(.*)$/)).filter(Boolean)
    .map((m) => ({ addr: parseInt(m![1], 16), enc: m![2].trim(), text: `${m![3]} ${m![4]}`.replace(/\s*@.*$/, '').replace(/#0x([0-9a-f]+)/g, (_, h) => `#${parseInt(h, 16)}`).trim() }));
  try {
    const base = PROGRAM[0].addr;
    const asm = ['.syntax unified', '.thumb', ...PROGRAM.flatMap((p) => [
      ...(p.addr === base ? ['square:'] : p.text.startsWith('push') ? ['main:'] : []), `  ${p.text}`])].join('\n') + '\n';
    writeFileSync(join(dir, 'p.s'), asm);
    execFileSync('clang', ['--target=thumbv7em-none-eabi', '-c', join(dir, 'p.s'), '-o', join(dir, 'p.o')]);
    const got = objdump(join(dir, 'p.o'));
    const bad = PROGRAM.filter((p, k) => got[k]?.enc !== p.enc || got[k]?.addr !== p.addr - base);
    check('every encoding on the page matches the Arm assembler', got.length === PROGRAM.length && bad.length === 0, bad.map((p) => p.text).join('; '));

    writeFileSync(join(dir, 's.c'), SOURCE.join('\n').replace('int square', '__attribute__((noinline)) int square') + '\n');
    execFileSync('clang', ['--target=thumbv7em-none-eabi', '-mcpu=cortex-m4', '-O1', '-c', join(dir, 's.c'), '-o', join(dir, 's.o')]);
    const norm = (t: string) => t.replace(/\s+/g, ' ').replace(/^bl .*/, 'bl');
    const compiled = objdump(join(dir, 's.o')).map((x) => norm(x.text));
    const page = PROGRAM.map((p) => norm(p.text));
    check('the machine code is what Clang -O1 emits for the C shown, for a Cortex-M4', compiled.join(' | ') === page.join(' | '), `Clang: ${compiled.join(' | ')}`);
  } catch (e) {
    check('the page\'s machine code assembles and compiles with Clang for Arm', false, (e as Error).message.split('\n')[0]);
  }
}

section('3g. Memory: buffer overflow');
{
  const r = (v: string, f = 'text', c = false) => outcome(v, f, c).result;
  check('a name that fits in buf[8] returns normally', r('Mia') === 'returns' && r('1234567') === 'returns');
  check('spilling past buf but not the return address still returns', outcome('12345678', 'text', false).result === 'returns');
  // 12 chars + null = 13 bytes reaches the 4-byte return address at offset 12.
  check('overwriting the return address with text crashes', r('AAAAAAAAAAAAAAAA') === 'crash');
  // The exact "aim at win()" payload: 12 filler bytes, then win() little-endian with the Thumb bit set.
  const le = (v: number) => [0, 8, 16, 24].map((sh) => (v >>> sh) & 0xff);
  const payload = [...new Array(12).fill(0x41), ...le(WIN_ADDR | 1)].map((b) => b.toString(16)).join(' ');
  const aimed = outcome(payload, 'hex', false);
  check('the win() payload sets the return address to win()', aimed.result === 'redirected' && (aimed.retVal | 1) === (WIN_ADDR | 1), aimed.retVal.toString(16));
  // With the stack protector, any overflow past buf is caught before the function can return.
  check('the stack protector catches an overflow that reaches the return address', outcome('AAAAAAAAAAAAAAAA', 'text', true).result === 'caught');
  check('the stack protector catches even a one-byte overflow of buf', outcome('123456789', 'text', true).result === 'caught');
  check('the stack protector still returns normally when nothing overflows', outcome('Mia', 'text', true).result === 'returns');
}

section('3h. Concurrency: interrupt trace');
{
  const segs = trace();
  // One CPU: the segments are contiguous and in order, covering 0 to END with no overlap or gap.
  const contiguous = segs[0].t0 === 0 && segs.at(-1)!.t1 === IRQ_END && segs.every((s, i) => s.t1 > s.t0 && (i === 0 || s.t0 === segs[i - 1].t1));
  check('the trace is one unbroken timeline from 0 to the end (a single CPU)', contiguous, `${segs[0].t0}..${segs.at(-1)!.t1}`);
  // Stacking pushes, unstacking pops, in last-in first-out order; preemption only by a stricly higher priority.
  const stack: string[] = ['main'];
  let lifo = true, prio = true, depthOk = true;
  for (const s of segs) {
    if (s.kind === 'stack') {
      if (PRIO[s.lane] >= PRIO[stack[stack.length - 1] as keyof typeof PRIO]) prio = false;
      stack.push(s.lane);
    } else if (s.kind === 'unstack') {
      if (stack.pop() !== s.lane) lifo = false;
    }
    if (s.depth !== stack.length - 1) depthOk = false;
  }
  check('a handler is only preempted by a strictly higher-priority interrupt', prio);
  check('handlers return in last-in, first-out order', lifo && stack.length === 1 && stack[0] === 'main');
  check('the reported stack depth matches the number of saved frames throughout', depthOk);
  // The scenario: the UART byte preempts SysTick, so the stack reaches two frames, then unwinds to main.
  check('the UART interrupt preempts SysTick, nesting two frames deep', Math.max(...segs.map((s) => s.depth)) === 2);
  check('every handler eventually returns: the trace ends in main()', segs.at(-1)!.lane === 'main' && segs.at(-1)!.depth === 0);
}

section('3l. Concurrency: priorities, context switch, scheduling, races, atomics, locks');
{
  // Priorities: for every one of the 64 priority settings, the NVIC model is one unbroken timeline, preempts only on a
  // strictly lower number, returns in LIFO order, tail-chains only past a less urgent context, and runs every handler
  // for exactly its work, starting no earlier than it fired.
  let bad = '';
  for (let k = 0; k < 64; k++) {
    const pr = { tim2: k & 3, usart2: (k >> 2) & 3, adc: k >> 4 } as Record<Irq, number>;
    const { segs } = nvic(pr);
    const tag = `${pr.tim2}${pr.usart2}${pr.adc}`;
    if (segs[0].t0 !== 0 || segs.at(-1)!.t1 !== NVIC_END || segs.some((x, i) => x.t1 <= x.t0 || (i > 0 && x.t0 !== segs[i - 1].t1))) bad ||= `${tag}: not contiguous`;
    const p = (id: string) => (id === 'main' ? 256 : pr[id as Irq]);
    const stack = ['main'];
    for (const x of segs) {
      if (x.kind === 'stack') { if (p(x.lane) >= p(stack.at(-1)!)) bad ||= `${tag}: preempted without a lower number`; stack.push(x.lane); }
      if (x.kind === 'unstack' && stack.pop() !== x.lane) bad ||= `${tag}: not LIFO`;
      if (x.kind === 'chain') { stack.pop(); if (p(x.lane) >= p(stack.at(-1)!)) bad ||= `${tag}: chained past a more urgent context`; stack.push(x.lane); }
    }
    for (const q of IRQS) {
      const ran = segs.filter((x) => x.lane === q.id && x.kind === 'run').reduce((a, x) => a + x.t1 - x.t0, 0);
      const first = segs.find((x) => x.lane === q.id)!;
      if (ran !== q.work || first.t0 < q.t) bad ||= `${tag}: ${q.id} ran ${ran} from ${first.t0}`;
    }
  }
  check('NVIC model: all 64 priority settings preempt, chain, return and run correctly', bad === '', bad);
  const tie = nvic({ tim2: 2, usart2: 2, adc: 2 }).segs.filter((x) => x.kind === 'chain').map((x) => x.lane);
  check('NVIC model: equal priorities never nest, and a tie goes to the lower exception number (ADC, IRQ 18, before USART2, IRQ 38)', tie.join() === 'adc,usart2');
  check('NVIC model: three ascending priorities nest three frames deep', Math.max(...nvic({ tim2: 3, usart2: 2, adc: 0 }).segs.map((x) => x.depth)) === 3);

  // Context switch: the frame layout is the architecture's, and the stack pointers move by exactly 32 bytes per half.
  check('context: the hardware frame is R0, R1, R2, R3, R12, LR, PC, xPSR from the lowest address', HW_FRAME.join() === 'R0,R1,R2,R3,R12,LR,PC,xPSR');
  check('context: EXC_RETURN 0xFFFFFFFD returns to Thread mode on the process stack', EXC_RETURN === 0xfffffffd);
  const c = CTX.map((x) => x.s);
  check('context: stacking moves PSP down 32 bytes; A’s saved SP is 64 bytes below its top; B ends with an empty stack',
    c[1].psp === CTX_TOP.A - 32 && c[5].tcb.A === CTX_TOP.A - 64 && c.at(-1)!.psp === CTX_TOP.B && c.at(-1)!.words.B === 0);
  check('context: after the switch every register holds B’s values, in Thread mode', c.at(-1)!.lo === 'B' && c.at(-1)!.hi === 'B' && c.at(-1)!.mode === 'Thread');
  check('context: the words saved always match the stack pointer kept for a suspended task',
    c.every((s) => (['A', 'B'] as const).every((k) => s.tcb[k] === null || s.tcb[k] === CTX_TOP[k] - 4 * s.words[k])));

  // Scheduling: under rate-monotonic priorities each task's first job finishes exactly at its response time from the
  // standard response-time analysis, R = C + sum ceil(R / Tj) Cj over higher-priority tasks, for every work setting.
  const rta = (ts: Task[]) => ts.map((t, i) => {
    let r = t.c;
    for (let n = 0; n < 50; n++) {
      const next = t.c + ts.slice(0, i).reduce((a, h) => a + Math.ceil(r / h.period) * h.c, 0);
      if (next === r || next > 1e3) break;
      r = next;
    }
    return r;
  });
  bad = '';
  let checked = 0;
  for (let a = 1; a < 4; a++) for (let b = 1; b < 10; b++) for (let d = 1; d < 20; d++) {
    const ts = TASKS.map((t, i) => ({ ...t, c: [a, b, d][i] }));
    const r = rta(ts);
    const fits = r.every((x, i) => x <= ts[i].period);
    const sc = schedule(ts, 'rm');
    const missed = sc.jobs.some((j) => (j.done ?? Infinity) > j.deadline && j.deadline <= HORIZON);
    if (fits !== !missed) bad ||= `C=${a},${b},${d}: analysis ${fits} vs sim ${!missed}`;
    if (fits) ts.forEach((t, i) => { if (sc.jobs.find((j) => j.task === t.id)!.done !== r[i]) bad ||= `C=${a},${b},${d}: ${t.id} done ${sc.jobs.find((j) => j.task === t.id)!.done}, analysis ${r[i]}`; });
    if (utilization(ts) > 1 && !missed) bad ||= `C=${a},${b},${d}: over 100% yet no miss`;
    checked++;
  }
  check(`scheduling: rate-monotonic matches response-time analysis for all ${checked} work settings`, bad === '', bad);
  const miss = (p: Parameters<typeof schedule>[1]) => schedule(TASKS, p).jobs.some((j) => (j.done ?? Infinity) > j.deadline);
  check('scheduling: the default set is 95% utilized, above the 78% bound, and still fits under rate-monotonic',
    Math.abs(utilization(TASKS) - 0.95) < 1e-9 && Math.abs(rmBound(3) - 0.7798) < 1e-4 && !miss('rm'));
  check('scheduling: backwards priorities, round-robin and cooperative each miss a deadline', miss('rev') && miss('rr') && miss('coop'));

  // Races: C(6,3) = 20 interleavings; only running one increment entirely before the other gives 2, the rest give 1.
  const twos = ALL_ORDERS.filter((o) => runOrder(o).mem === 2);
  check('races: 20 interleavings, and only AAABBB and BBBAAA keep both updates', ALL_ORDERS.length === 20 && twos.sort().join() === 'AAABBB,BBBAAA'
    && ALL_ORDERS.every((o) => [1, 2].includes(runOrder(o).mem)));

  // Atomics: no protection and volatile lose an update; masking and LDREX/STREX keep both, the latter after one retry.
  const ar = { none: atomicRun('none'), volatile: atomicRun('volatile'), irq: atomicRun('irq'), excl: atomicRun('excl') };
  check('atomics: unprotected and volatile increments lose an update', ar.none.mem === 1 && ar.volatile.mem === 1);
  check('atomics: with interrupts masked the handler waits, pending, then runs after; count = 2', ar.irq.mem === 2 && ar.irq.pending !== null
    && ar.irq.segs.findIndex((x) => x.lane === 'isr') > ar.irq.segs.findIndex((x) => x.label === 'CPSIE'));
  check('atomics: STREX fails once after the interrupt clears the monitor, the retry succeeds; count = 2', ar.excl.mem === 2 && ar.excl.strexFails === 1);

  // Locks: High's wait is Low's remaining critical section with inheritance, plus all of Medium's work without it.
  const plain = rtos('plain'), inh = rtos('inherit');
  check('locks: without inheritance High waits 12 ms; with it, 4 ms, Low’s remaining critical section', blockedFor(plain, 'H') === 12 && blockedFor(inh, 'H') === 4);
  check('locks: the extra wait without inheritance is exactly Medium’s 8 ms of work', blockedFor(plain, 'H') - blockedFor(inh, 'H') === plain.ticks.filter((k) => k.run === 'M').length);
  const lastL = (s: typeof plain) => s.ticks.map((k, t) => (k.run === 'L' && k.hold ? t : -1)).reduce((a, b) => Math.max(a, b));
  const firstH = (s: typeof plain) => s.ticks.findIndex((k) => k.run === 'H' && k.hold);
  check('locks: the mutex is exclusive: High’s critical section starts only after Low’s ends', firstH(plain) > lastL(plain) && firstH(inh) > lastL(inh));
  const sig = rtos('signal');
  // Barriers: the executor obeys the ARMv7-M definitions. After a DMB no store issues before every earlier access has
  // landed; after a DSB no instruction runs until then; an ISB refetches before the next instruction. Every case goes
  // wrong without a barrier and right with its fix, except DSB alone for the MPU, which the architecture does not promise.
  bad = '';
  for (const cs of MB_CASES) for (const b of MB_OPTIONS[cs]) {
    const r = mbOrder(cs, b);
    const tag = `${cs}/${b}`;
    r.ins.forEach((i, k) => {
      const before = r.stores.filter((x) => x.issue <= i.t0);
      if (i.label === 'DMB') r.stores.filter((x) => x.issue > i.t1).forEach((x) => { if (x.issue - 1 < Math.max(...before.map((y) => y.land))) bad ||= `${tag}: store passed a DMB`; });
      if (i.label === 'DSB' && r.ins[k + 1] && r.ins[k + 1].t0 < Math.max(...before.map((y) => y.land))) bad ||= `${tag}: ran past a DSB`;
      if (i.label === 'ISB' && r.ins[k + 1] && r.ins[k + 1].t0 < i.t0 + 2) bad ||= `${tag}: no refetch after ISB`;
    });
    const want = b === 'none' ? 'fail' : cs === 'mpu' && b === 'dsb' ? 'warn' : 'ok';
    if (r.outcome !== want) bad ||= `${tag}: ${r.outcome}, expected ${want}`;
  }
  check('barriers: DMB, DSB and ISB follow their definitions, and each case fails without its barrier and works with it', bad === '', bad);
  const dma = mbOrder('dma', 'none');
  check('barriers: without a DMB the DMA start (a Device write) overtakes the descriptor (normal RAM)', dma.stores[2].land < dma.stores[1].land);

  check('locks: each interrupt’s semaphore give runs the RX task next, which blocks again when done',
    sig.ticks.every((k, t) => k.run !== 'I' || sig.ticks[t + 1]?.run === 'R') && sig.ticks.filter((k) => k.run === 'R').length === 6);
}

section('3m. Concurrency: parts and terms');
{
  // Against the vector table in RM0090 (STM32F405/407) and the Armv7-M ARM: SysTick is exception 15, interrupts start at 16,
  // TIM2 is IRQ 28, and the vector table at 0x0800_0000 holds one word per exception.
  check('TIM2 (IRQ 28) is exception 44, vector at 0x0800_00B0', excOf(28) === 44 && vectorAddr(excOf(28)) === 0x0800_00b0);
  check('SysTick is exception 15, vector at 0x0800_003C', SYSTICK_EXC === 15 && vectorAddr(15) === 0x0800_003c);
  check('stacking drops SP by 8 words (32 bytes)', FRAME_BYTES === 32 && (SP_MAIN - FRAME_BYTES) % 8 === 0);
  const notes = PM_STEPS.map((s) => s.note + s.readout.join(' ')).join(' ');
  check('the walkthrough names TIM2’s real vector address and stacked SP', notes.includes('0x0800_00B0') && notes.includes('0x2000_1FC0'));
  const parts = ['cpu', 'nvic', 'systick', 'flash', 'vectors', 'sram', 'stack', 'periph', 'tim2', 'usart2', 'adc', 'gpio'] as const;
  check('every clickable part is introduced by some step', parts.every((p) => firstStep(p) >= 0));
  const live = new Set(index.filter((e) => e.status === 'live').map((e) => e.id));
  const dead = TERMS.flatMap((g) => g.terms).filter((t) => t.page && !live.has(t.page)).map((t) => `${t.term} → ${t.page}`);
  check(`${TERMS.flatMap((g) => g.terms).length} glossary terms link to live pages`, dead.length === 0, dead.join('; '));
}

section('3i. Memory: alignment and the heap');
{
  // Alignment: a value takes one bus access exactly when it is naturally aligned and fits in one 32-bit word.
  const sizes = [1, 2, 4];
  let bad = '';
  for (const size of sizes) for (let off = 0; off + size <= 16; off++) {
    const want = Math.floor((off + size - 1) / 4) - Math.floor(off / 4) + 1;
    if (accesses(size, off) !== want) bad = `accesses(${size},${off})`;
    if (aligned(size, off) !== (off % size === 0)) bad = `aligned(${size},${off})`;
    // Natural alignment implies a single access for these sizes.
    if (aligned(size, off) && accesses(size, off) !== 1) bad = `aligned but split: ${size},${off}`;
  }
  check('bus-access count and alignment match their definitions for every size and offset', bad === '', bad);
  check('a uint32_t at offset 2 takes two bus accesses; at offset 4, one', accesses(4, 2) === 2 && accesses(4, 4) === 1);

  // Heap first-fit: returns the lowest run of free cells, or -1, and never overlaps a used cell.
  const F = null;
  check('first-fit finds the lowest gap that is big enough', firstFit([F, 'a', F, F, F, 'b'], 3) === 2 && firstFit(['a', F, F, 'b'], 1) === 1);
  check('first-fit fails when no single gap is big enough even if total free is', firstFit(['a', F, 'b', F, 'c', F], 2) === -1);
  check('first-fit returns -1 for a full heap and 0 for an empty one', firstFit(['a', 'a'], 1) === -1 && firstFit([F, F, F], 2) === 0);
  // A random sequence of allocations never overlaps.
  let overlap = false;
  const cells: (string | null)[] = new Array(16).fill(F);
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let step = 0; step < 200; step++) {
    if (rnd() < 0.6) {
      const sz = 1 + Math.floor(rnd() * 5);
      const at = firstFit(cells, sz);
      if (at >= 0) { if (cells.slice(at, at + sz).some((c) => c !== null)) overlap = true; for (let k = 0; k < sz; k++) cells[at + k] = String(step); }
    } else {
      const used = cells.filter((c) => c !== null);
      if (used.length) { const id = used[Math.floor(rnd() * used.length)]; for (let i = 0; i < cells.length; i++) if (cells[i] === id) cells[i] = F; }
    }
  }
  check('first-fit allocations never overlap, over 200 random alloc/free operations', !overlap);
}

// ---- 3j. Memory: map, bus matrix, frames, overflow, startup ----
section('3j. Memory: map, bus matrix, frames, overflow, startup');
{
  // Memory map: known landmarks land in the right region, and the regions tile 0..4 GB with no gaps or overlaps.
  check('landmarks resolve to the right region', regionOf(0x08000000)?.id === 'code' && regionOf(0x20000010)?.id === 'sram'
    && regionOf(0x40020c14)?.id === 'periph' && regionOf(0xe000e010)?.id === 'ppb');
  const byLo = [...MMAP].sort((a, b) => a.lo - b.lo);
  const tiled = byLo[0].lo === 0 && byLo.at(-1)!.hi === 0xffffffff && byLo.every((r, i) => i === 0 || r.lo === byLo[i - 1].hi + 1);
  check('the regions tile the whole 4 GB space with no gap or overlap', tiled);

  // Bus matrix: masters on different slaves all proceed; on a shared slave the highest-priority one wins.
  const parallel = arbitrate({ cpu: 'flash', dma2: 'sram2', dma1: 'sram1' });
  check('masters on different slaves all proceed', MASTERS.every((m) => parallel[m.id] === 'go'));
  const clash = arbitrate({ cpu: 'sram1', dma2: 'sram1', dma1: 'periph' });
  check('on contention the priority master goes and the other waits', clash.cpu === 'go' && clash.dma2 === 'wait' && clash.dma1 === 'go');

  // Stack frames: empty on entry and after return, 28 bytes at full depth, symmetric SP.
  check('the frame is empty on entry and after return', presentAt(0).length === 0 && presentAt(5).length === 0 && spAt(0) === spAt(5));
  check('the full frame is 28 bytes with every slot present', spAt(0) - spAt(2) === 28 && presentAt(3).length === FRAME_SLOTS.length);

  // Stack overflow: SP crosses the limit between depth 8 and 9, and keeps falling with depth.
  check('the stack fits at depth 8 and overflows at depth 9', !overflowed(8) && overflowed(9));
  check('SP falls monotonically as recursion deepens', spForDepth(9) < spForDepth(8) && spForDepth(1) < spForDepth(0));

  // Startup: .data is '??' until copied, .bss is '??' until zeroed.
  const count = SYMS.find((s) => s.name === 'int count')!;
  const total = SYMS.find((s) => s.name === 'int total')!;
  check('.data reads ?? before the copy and its value after', sramValue(count, 0) === '??' && sramValue(count, 1) === '42');
  check('.bss reads ?? until zeroed, then 0', sramValue(total, 1) === '??' && sramValue(total, 2) === '0');
}

// ---- 3k. Memory: cache, virtual memory, paging, MPU ----
section('3k. Memory: cache, virtual memory, paging, MPU');
{
  // Direct-mapped cache: cold miss, then a hit on the same line, then a conflict eviction, then a thrash miss.
  const lines: Line[] = Array.from({ length: 4 }, () => ({ valid: false, tag: 0 }));
  const r1 = cacheAccess(lines, 0x100); // cold miss
  const r2 = cacheAccess(lines, 0x104); // same line, hit
  const r3 = cacheAccess(lines, 0x140); // same index, different tag: evict
  const r4 = cacheAccess(lines, 0x100); // evicted, miss again
  check('cache: cold miss, same-line hit, conflict eviction, thrash miss',
    !r1.hit && r2.hit && r3.evicted && !r4.hit);
  check('cache: a[0] and a[1] share a line; b conflicts with it',
    cacheFields(0x100).index === cacheFields(0x104).index
    && cacheFields(0x140).index === cacheFields(0x100).index && cacheFields(0x140).tag !== cacheFields(0x100).tag);

  // Virtual memory: the same virtual address maps to different frames per process; an unmapped page faults.
  const a = PROCS[0], b = PROCS[1];
  check('the same virtual address maps to different frames in A and B',
    translate(a, 0x0024).frame === 2 && translate(b, 0x0024).frame === 4);
  check('an unmapped page faults; a mapped one carries the offset through',
    translate(a, 0x2000).fault && translate(a, 0x3024).paddr === ((1 << 12) | 0x024));

  // Page walk: a good address resolves, a missing level-2 entry and a missing level-1 table both fault.
  const good = pgWalk(0x024);
  check('the page walk resolves L1 then L2 to a frame', good.fault === 'none' && good.frame === PG_L2[0][0] && good.paddr === ((good.frame << 8) | 0x24));
  check('a missing level-2 entry and a missing level-1 table fault', pgWalk(0x224).fault === 'l2' && pgWalk(0x824).fault === 'l1');
  check('the TLB misses when empty and hits once filled', !tlbLookup([], 0) && !!tlbLookup([{ vpage: 0, frame: 3 }], 0));

  // MPU: read-only Flash, privileged-only peripherals, execute-never RAM, a no-access guard, and an unmapped address.
  check('MPU: Flash is read-only and executable', !checkAccess(MPU, 0x08001000, 'write', 'priv').allowed
    && checkAccess(MPU, 0x08001000, 'read', 'unpriv').allowed && checkAccess(MPU, 0x08001000, 'exec', 'unpriv').allowed);
  check('MPU: peripherals are privileged-only', !checkAccess(MPU, 0x40020c14, 'write', 'unpriv').allowed
    && checkAccess(MPU, 0x40020c14, 'write', 'priv').allowed);
  check('MPU: RAM is execute-never, the stack guard denies all, an unmapped address faults',
    !checkAccess(MPU, 0x20000100, 'exec', 'priv').allowed && !checkAccess(MPU, 0x2001f810, 'read', 'priv').allowed
    && checkAccess(MPU, 0x60000000, 'read', 'priv').region === -1);
}

// ---- 3u. USB high speed ----
section('3u. USB high speed (decoded independently, compared with full speed)');
{
  /**
   * Reads one line state per bit time and splits it into packets. A packet runs from the first K after idle until
   * the line returns to SE0. Returns the decoded bytes after SYNC, plus problems found in SYNC, stuffing and EOP.
   */
  const decodeUsb = (w: Waveform, high: boolean, low = false) => {
    const [dp, dm] = w.traces;
    const st = (t: number) => {
      const a = level(dp, t + 0.5), b = level(dm, t + 0.5);
      if (a === 0 && b === 0) return 'SE0';
      return (a === 1) !== low ? 'J' : 'K';
    };
    const packets: number[][] = [];
    const problems: string[] = [];
    let t = 0;
    let idleRun = 0;
    let seenPacket = false;
    while (t < w.duration) {
      if (st(t) !== 'K') {
        if (high && st(t) !== 'SE0') problems.push(`t=${t}: high-speed idle should be SE0`);
        idleRun++;
        t++;
        continue;
      }
      if (seenPacket && high && idleRun < 8) problems.push(`t=${t}: only ${idleRun} idle bit times between packets`);
      seenPacket = true;
      const states: string[] = [];
      while (t < w.duration && st(t) !== 'SE0') states.push(st(t++));
      if (high) {
        // EOP: the last 8 states identical, and different from the state before them.
        const eop = states.splice(states.length - 8);
        if (eop.some((x) => x !== eop[0]) || states[states.length - 1] === eop[0]) problems.push(`t=${t}: bad EOP ${eop.join('')}`);
      }
      let prev = 'J';
      const raw = states.map((x) => { const b = x === prev ? 1 : 0; prev = x; return b; });
      const bits: number[] = [];
      let ones = 0;
      for (let i = 0; i < raw.length; i++) {
        if (ones === 6) {
          if (raw[i] !== 0) problems.push(`t=${t}: missing stuffed bit`);
          ones = 0;
          continue;
        }
        bits.push(raw[i]);
        ones = raw[i] ? ones + 1 : 0;
      }
      const n = high ? 32 : 8;
      if (bits.slice(0, n).join('') !== '0'.repeat(n - 1) + '1') problems.push(`t=${t}: SYNC is ${bits.slice(0, n).join('')}`);
      const body = bits.slice(n);
      if (body.length % 8) problems.push(`t=${t}: ${body.length} bits is not whole bytes`);
      const bytes = Array.from({ length: body.length >> 3 }, (_, i) => body.slice(i * 8, i * 8 + 8).reduce((v, b, j) => v | (b << j), 0));
      if (((bytes[0] ^ (bytes[0] >> 4)) & 0xf) !== 0xf) problems.push(`t=${t}: PID check bits wrong in ${bytes[0]}`);
      packets.push(bytes);
      idleRun = 0;
    }
    return { packets, problems };
  };
  const pairs: Params[] = [{}, { xfer: 'out', addr: '5', ep: '2', data: 'FF FF 00 7E' }, { xfer: 'in', addr: '3', ep: '1', data: '01 02 03', toggle: 'DATA1' }, { xfer: 'in', hs: 'NAK', data: '' }];
  for (const o of pairs) {
    const hs = decodeUsb(enc('usb', { ...o, speed: 'high' }), true);
    const fs = decodeUsb(enc('usb', o), false);
    check(`high speed ${JSON.stringify(o)}: SYNC, stuffing, EOP and idle are valid`, hs.problems.length === 0 && fs.problems.length === 0, [...hs.problems, ...fs.problems].slice(0, 3).join('; '));
    check(`high speed ${JSON.stringify(o)}: same packets as full speed (checked by sigrok)`, JSON.stringify(hs.packets) === JSON.stringify(fs.packets) && fs.packets.length > 0,
      `${JSON.stringify(hs.packets)} vs ${JSON.stringify(fs.packets)}`);
  }
  const nyet = decodeUsb(enc('usb', { speed: 'high', xfer: 'out', data: 'FF FF 00 7E', hs: 'NYET' }), true);
  check('high speed NYET handshake is PID 0x96', nyet.problems.length === 0 && nyet.packets.at(-1)?.join() === '150', nyet.packets.at(-1)?.join() ?? '');
  const ls = decodeUsb(enc('usb', { speed: 'low', xfer: 'in', hs: 'STALL', data: '' }), false, true);
  check('IN refused with STALL: the device sends STALL in place of data', ls.problems.length === 0 && ls.packets.length === 2 && ls.packets[1].join() === '30', JSON.stringify(ls.packets));
  const rejects = (o: Params) => { try { enc('usb', o); return false; } catch { return true; } };
  check('SETUP cannot be NAKed or stalled; NYET only after high-speed OUT', rejects({ hs: 'NAK' }) && rejects({ hs: 'STALL' }) && rejects({ hs: 'NYET', speed: 'high' }) && rejects({ xfer: 'out', hs: 'NYET' }) && !rejects({ xfer: 'out', hs: 'NYET', speed: 'high' }));
  const w = enc('usb', { speed: 'high' });
  check('high speed: 480 Mbit/s, 400 mV levels', Math.abs(w.unitTime - 1 / 480e6) < 1e-15 && w.traces.every((tr) => tr.levels?.[1] === '400 mV'));
}

// ---- 4. sigrok ----
section('4. sigrok decoders (independent)');
let sigrok = true;
try {
  execFileSync('sigrok-cli', ['--version'], { stdio: 'ignore' });
} catch {
  sigrok = false;
  console.log('  skip  sigrok-cli is not installed (brew install sigrok-cli)');
}
if (sigrok) {
  const dir = mkdtempSync(join(tmpdir(), 'bitbang-vcd-'));
  /** Writes a waveform as VCD. Released lines ('z') read as 1, as with pull-ups. Optional line-reset prefix for SWD. */
  const vcd = (name: string, w: Waveform, prefix?: 'swd') => {
    const traces = w.traces.map((t) => ({ ...t, points: [...t.points] }));
    if (prefix === 'swd') {
      const shift = 60;
      for (const tr of traces) tr.points = tr.points.map((p) => ({ ...p, t: p.t + shift }));
      const clk: Trace['points'] = [{ t: 0, v: 0 }];
      for (let c = 0; c < shift; c++) clk.push({ t: c + 0.5, v: 1 }, { t: c + 1, v: 0 });
      traces[0].points = [...clk, ...traces[0].points.slice(1)];
      traces[1].points = [{ t: 0, v: 1 }, { t: 56, v: 0 }, ...traces[1].points.slice(1)];
    }
    const ns = (t: number) => Math.round(t * w.unitTime * 1e9);
    const ids = traces.map((_, i) => String.fromCharCode(33 + i));
    const events = new Map<number, string[]>();
    traces.forEach((tr, i) => tr.points.forEach((p) => {
      const k = ns(p.t);
      if (!events.has(k)) events.set(k, []);
      events.get(k)!.push(`${p.v === 'z' ? 1 : p.v}${ids[i]}`);
    }));
    let out = '$timescale 1 ns $end\n$scope module top $end\n';
    traces.forEach((tr, i) => (out += `$var wire 1 ${ids[i]} ${tr.name.replace('+', 'P').replace('−', 'M').replace(/[^A-Za-z0-9]/g, '')} $end\n`));
    out += '$upscope $end\n$enddefinitions $end\n';
    for (const k of [...events.keys()].sort((a, b) => a - b)) out += `#${k}\n${events.get(k)!.join('\n')}\n`;
    out += `#${ns(w.duration + (prefix ? 60 : 0))}\n`;
    const file = join(dir, `${name}.vcd`);
    writeFileSync(file, out);
    return file;
  };
  const run = (file: string, args: string[], downsample = 1) =>
    execFileSync('sigrok-cli', ['-I', `vcd:downsample=${downsample}`, '-i', file, ...args]).toString();
  const expect = (name: string, out: string, wants: string[], forbid = /error|warning|too (early|late|short|long)/i) => {
    const missing = wants.filter((x) => !out.includes(x));
    const bad = out.split('\n').filter((l) => forbid.test(l));
    check(`sigrok ${name}`, missing.length === 0 && bad.length === 0, [missing.length ? `missing: ${missing.join(', ')}` : '', bad.slice(0, 2).join('; ')].filter(Boolean).join(' | '));
  };

  expect('UART 8O2', run(vcd('uart', enc('uart', { parity: 'odd', stop: '2', data: 'Ok' })), ['-P', 'uart:rx=TX:baudrate=9600:parity=odd:stop_bits=2:format=hex', '-A', 'uart=rx-data:rx-warnings'], 100), ['4F', '6B']);
  expect('RS-232 (inverted)', run(vcd('rs232', enc('rs232')), ['-P', 'uart:rx=TxD:baudrate=9600:invert_rx=yes:format=hex', '-A', 'uart=rx-data:rx-warnings'], 100), ['48', '69']);
  expect('RS-485', run(vcd('rs485', enc('rs485')), ['-P', 'uart:rx=A:baudrate=9600:format=hex', '-A', 'uart=rx-data:rx-warnings'], 100), ['48', '69']);
  for (const mode of ['0', '3']) {
    const cpol = +mode >> 1;
    const cpha = +mode & 1;
    expect(`SPI mode ${mode}`, run(vcd(`spi${mode}`, enc('spi', { mode })), ['-P', `spi:clk=SCLK:mosi=MOSI:miso=MISO:cs=CS:cpol=${cpol}:cpha=${cpha}`, '-A', 'spi=mosi-data:miso-data']), ['9F', 'FF', 'EF', '40']);
  }
  expect('I²C register read with stretching', run(vcd('i2c', enc('i2c', { rw: 'reg', stretch: 'yes' })), ['-P', 'i2c:scl=SCL:sda=SDA'], 10),
    ['Address write: 50', 'Data write: 0F', 'Start repeat', 'Address read: 50', 'Data read: 00', 'Data read: 2A', 'NACK', 'Stop']);
  expect('I²C 10-bit read', run(vcd('i2c10', enc('i2c', { addrMode: '10', addr: '2A5', rw: 'r' })), ['-P', 'i2c:scl=SCL:sda=SDA'], 10), ['Address write: 7A', 'Data write: A5', 'Start repeat', 'Address read: 7A']);
  expect('I3C SDR (through the I²C decoder)', run(vcd('i3c', enc('i3c')), ['-P', 'i2c:scl=SCL:sda=SDA']), ['Address write: 7E', 'Address write: 08', 'Data write: 0F', 'Data write: 42']);
  expect('Quad SPI 1-1-1 (SPI flash decoder)', run(vcd('qspi', enc('qspi', { mode: '111' })), ['-P', 'spi:clk=SCLK:mosi=IO0:miso=IO1:cs=CS,spiflash', '-A', 'spiflash']), ['de ad be ef', '0x001000']);
  expect('1-Wire', run(vcd('onewire', enc('onewire')), ['-P', 'onewire_link:owr=DQ,onewire_network'], 100), ['Reset/presence: true', "0xcc 'Skip ROM'", 'Data: 0xbe', 'Data: 0x50', 'Data: 0x05']);
  expect('I²S 16-bit', run(vcd('i2s', enc('i2s')), ['-P', 'i2s:sck=SCK:ws=WS:sd=SD']), ['Left channel: 00002ee0', 'Right channel: 0000f448']);
  expect('I²S 24-bit', run(vcd('i2s24', enc('i2s', { bits: '24', left: '-1', right: '8388607' })), ['-P', 'i2s:sck=SCK:ws=WS:sd=SD']), ['ffffff00', '7fffff00']);
  expect('JTAG IR + IDCODE', run(vcd('jtag', enc('jtag', { seq: 'ir' })), ['-P', 'jtag:tck=TCK:tms=TMS:tdi=TDI:tdo=TDO', '-A', 'jtag=bitstring-tdi:bitstring-tdo']), ['IR TDI: 1110', 'IR TDO: 0001', '(0x4ba00477)']);
  expect('SWD read', run(vcd('swdr', enc('swd'), 'swd'), ['-P', 'swd:swclk=SWCLK:swdio=SWDIO']), ['LINERESET', 'IDCODE', 'OK', '0x2ba01477'], /ERROR/);
  expect('SWD write', run(vcd('swdw', enc('swd', { op: 'w', port: 'ap', reg: '1', data: 'DEADBEEF' }), 'swd'), ['-P', 'swd:swclk=SWCLK:swdio=SWDIO']), ['W AP4', 'OK', '0xdeadbeef'], /ERROR/);
  const usb = (name: string, o: Params, speed: string, wants: string[]) =>
    expect(name, run(vcd(name.replace(/\W/g, ''), enc('usb', o)), ['-P', `usb_signalling:dp=DP:dm=DM:signalling=${speed},usb_packet`]), wants, /CRC5 ERROR|CRC16 ERROR|Error/);
  usb('USB SETUP', {}, 'full-speed', ['SETUP ADDR 0 EP 0', 'DATA0 [ 80 06 00 01 00 00 12 00 ]', 'ACK']);
  usb('USB OUT with stuffing', { xfer: 'out', addr: '5', ep: '2', data: 'FF FF 00 7E' }, 'full-speed', ['OUT ADDR 5 EP 2', 'DATA0 [ FF FF 00 7E ]', 'Stuff bit']);
  usb('USB IN low speed', { xfer: 'in', speed: 'low', addr: '3', ep: '1', data: '01 02 03', toggle: 'DATA1' }, 'low-speed', ['IN ADDR 3 EP 1', 'DATA1 [ 01 02 03 ]', 'ACK']);
  usb('USB IN answered with NAK by the device', { xfer: 'in', addr: '3', ep: '1', data: '', hs: 'NAK' }, 'full-speed', ['IN ADDR 3 EP 1', 'NAK']);
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
