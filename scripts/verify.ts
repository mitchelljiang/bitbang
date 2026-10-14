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
import type { Level, Protocol, Trace, Waveform } from '../src/core/types';
import { protocols } from '../src/protocols';
import { encode8b10b } from '../src/protocols/pcie';
import { TOURS } from '../src/tours';
import { fold, simulate } from '../src/eye';
import { SECTIONS } from '../src/guide';
import { index } from '../src/search';

type Params = Record<string, string>;
const P = Object.fromEntries(protocols.map((p) => [p.id, p]));
const enc = (id: string, o: Params = {}): Waveform => {
  const p: Protocol = P[id];
  return p.encode({ ...Object.fromEntries(p.params.map((x) => [x.key, x.default])), ...o });
};
const params = (id: string, o: Params = {}) => ({ ...Object.fromEntries(P[id].params.map((x) => [x.key, x.default])), ...o });
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
  ['jtag', {}], ['jtag', { seq: 'ir' }],
  ['swd', {}], ['swd', { op: 'w', port: 'ap', reg: '1', data: 'DEADBEEF' }], ['swd', { ack: 'wait' }], ['swd', { ack: 'fault', op: 'w' }],
  ['pci', {}], ['pci', { cmd: 'write', devsel: 'fast', wait: '0' }],
  ['pcie', {}], ['pcie', { content: 'skp' }], ['pcie', { content: 'ts1' }], ['pcie', { content: 'ts1', lanes: '4' }], ['pcie', { lanes: '4', content: 'data' }], ['pcie', { lanes: '8' }],
  ['usb', {}], ['usb', { xfer: 'out', data: 'FF FF 00' }], ['usb', { xfer: 'in', speed: 'low', data: '01 02 03', toggle: 'DATA1' }],
  ['usb', { xfer: 'out', data: '', hs: 'NAK' }], ['usb', { xfer: 'in', hs: 'NAK', data: '' }], ['usb', { speed: 'high' }],
  ['usb', { speed: 'high', xfer: 'out', data: 'FF FF 00 7E', hs: 'NYET' }], ['usb', { speed: 'high', xfer: 'in', hs: 'STALL', data: '' }],
];

// ---- 1. Bit check ----
/** Protocols whose bits can't be read straight off one wire, and the check that covers them instead. */
const COVERED_ELSEWHERE: Record<string, string> = {
  usb: 'sigrok USB decoders (NRZI: a bit value is a change, not a level)',
  pci: 'the PCI handshake rules (bus values, not single bits)',
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
  const pages = new Set(['basics', 'about', ...index.filter((e) => e.status !== 'soon').map((e) => e.id)]);
  const sources: [string, string][] = [['guide', SECTIONS]];
  for (const p of protocols) for (const d of p.deepDive ?? []) for (const para of d.body) sources.push([`${p.id}: ${d.title}`, para]);
  let count = 0;
  const broken: string[] = [];
  for (const [where, text] of sources) {
    for (const m of text.matchAll(/\?p=([a-z0-9]+)/g)) {
      count++;
      if (!pages.has(m[1])) broken.push(`${where} → ?p=${m[1]}`);
    }
  }
  check(`${count} links in Going deeper and the guide lead to existing pages`, broken.length === 0, broken.join('; '));
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
