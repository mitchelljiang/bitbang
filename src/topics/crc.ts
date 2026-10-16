/**
 * The checksums and CRC page: an 8-bit checksum and CRC-8, stepped through byte by byte and bit by bit on the data
 * the reader types, so flipping a bit or swapping two bytes shows which errors each one catches.
 */
import { parseBytes } from '../core/util';
import { bits, code, flips, hex2, hexN, markSeg, oneOf, page, row, seg, status, syncUrl, table, wire } from './dbg';

export const METHODS = ['sum', 'crc8'] as const;
export type Method = (typeof METHODS)[number];
const POLY = 0x07;
const MAX = 4;

/** The checksum that makes data plus checksum add up to 0, modulo 256 (as in Intel HEX files). */
export const checksum = (data: number[]) => -data.reduce((s, d) => s + d, 0) & 0xff;

/** CRC-8 with polynomial 0x07, initial value 0, no reflection: the CRC-8 that SMBus uses for its packet error check. */
export function crc8(data: number[]) {
  let crc = 0;
  for (const d of data) {
    crc ^= d;
    for (let k = 0; k < 8; k++) crc = crc & 0x80 ? ((crc << 1) ^ POLY) & 0xff : (crc << 1) & 0xff;
  }
  return crc;
}

/** The two functions as they appear on the page, and the line each pause point is on. Exported so the checks can compile them. */
export const LISTINGS: Record<Method, string[]> = {
  sum: [
    'uint8_t checksum(const uint8_t *data, size_t len)',
    '{',
    '    uint8_t sum = 0;',
    '    for (size_t i = 0; i < len; i++)',
    '        sum += data[i];                 // wraps around at 256',
    '    return (uint8_t)-sum;               // data plus this adds up to 0',
    '}',
  ],
  crc8: [
    'uint8_t crc8(const uint8_t *data, size_t len)',
    '{',
    '    uint8_t crc = 0x00;',
    '    for (size_t i = 0; i < len; i++) {',
    '        crc ^= data[i];                 // the byte enters the register',
    '        for (int bit = 0; bit < 8; bit++)',
    '            crc = (crc & 0x80) ? (uint8_t)((crc << 1) ^ 0x07)',
    '                               : (uint8_t)(crc << 1);',
    '    }',
    '    return crc;',
    '}',
  ],
};

interface Step {
  pc: number;
  /** The byte being processed, or -1 before the first and after the last. */
  i: number;
  acc: number;
  say: string;
}

/** Every pause point of either function on `data`. Exported for the checks. */
export function steps(m: Method, data: number[]): Step[] {
  const out: Step[] = [];
  if (m === 'sum') {
    let sum = 0;
    out.push({ pc: 4, i: 0, acc: 0, say: 'sum starts at 0.' });
    data.forEach((d, i) => {
      const before = sum;
      sum = (sum + d) & 0xff;
      out.push({ pc: i + 1 < data.length ? 4 : 5, i: i + 1 < data.length ? i + 1 : -1, acc: sum,
        say: `sum += data[${i}]: ${before} + ${d} = ${before + d}${before + d > 255 ? `, which wraps to ${sum}` : ''}.` });
    });
    const c = checksum(data);
    out.push({ pc: 6, i: -1, acc: c, say: `The checksum is −${sum} mod 256 = ${hexN(c, 8)}. The receiver adds every byte and the checksum, and gets 0 if nothing changed.` });
    return out;
  }
  let crc = 0;
  out.push({ pc: 4, i: 0, acc: 0, say: 'crc starts at 0x00.' });
  data.forEach((d, i) => {
    crc ^= d;
    out.push({ pc: 6, i, acc: crc, say: `crc ^= data[${i}] (${hexN(d, 8)}): the byte is XORed into the register, ${hexN(crc, 8)}.` });
    for (let k = 0; k < 8; k++) {
      const top = crc >> 7;
      crc = top ? ((crc << 1) ^ POLY) & 0xff : (crc << 1) & 0xff;
      const nextByte = k === 7 && i + 1 < data.length;
      const end = k === 7 && !nextByte;
      out.push({ pc: end ? 9 : nextByte ? 4 : 6, i: end ? -1 : nextByte ? i + 1 : i, acc: crc,
        say: `Bit ${k + 1} of 8: the top bit was ${top}, so crc ${top ? 'shifts left and is XORed with the polynomial 0x07' : 'just shifts left'}.` +
          (end ? ` The CRC is ${hexN(crc, 8)}: the remainder of the data divided by the polynomial. The receiver runs the same function and compares.` : '') });
    }
  });
  return out;
}

export function mountCrc(root: HTMLElement) {
  const q = new URLSearchParams(location.search);
  let m = oneOf('m', METHODS, 'crc8');
  let data = (() => {
    try {
      const d = parseBytes(q.get('d') ?? '', 'hex');
      return d.length <= MAX ? d : [0x48, 0x69];
    } catch {
      return [0x48, 0x69];
    }
  })();
  let at = 0;

  const html = page({
    crumbs: 'Arithmetic and error checking',
    title: 'Checksums and CRC',
    intro: 'Noise can flip bits on the way from sender to receiver. Both ends compute a short value from the data, and if the receiver’s does not match the one sent, the data changed. Step through an 8-bit checksum and a CRC, then flip a bit of the data or swap two bytes to see which one notices.',
    file: 'check.c',
    controls: `
      ${seg('m', 'Method', [['sum', 'Checksum'], ['crc8', 'CRC-8']])}
      <label class="dbg-set">data = <input type="text" spellcheck="false" autocomplete="off" aria-label="Set data, as hex bytes"></label>
      <button type="button" class="dbg-btn" data-act="step">Step</button>
      <button type="button" class="dbg-btn" data-act="run">Run</button>
      <button type="button" class="dbg-btn" data-act="restart">Restart</button>
      <button type="button" class="dbg-btn" data-act="swap">Swap bytes</button>`,
    body: '<div class="vars-wrap"></div>',
    after: `<section class="prose">
      <h2>What each one catches</h2>
      <table class="op-table">
        <thead><tr><th scope="col">Error</th><th scope="col">Parity bit</th><th scope="col">8-bit checksum</th><th scope="col">CRC-8</th></tr></thead>
        <tbody>
          <tr><th scope="row">One bit flipped</th><td>Caught</td><td>Caught</td><td>Caught</td></tr>
          <tr><th scope="row">Two bits flipped</th><td>Missed</td><td>Usually caught</td><td>Caught in short messages</td></tr>
          <tr><th scope="row">Bytes swapped</th><td>Missed</td><td>Missed</td><td>Caught</td></tr>
          <tr><th scope="row">A burst of up to 8 bits</th><td>Missed if even</td><td>Usually caught</td><td>Caught</td></tr>
        </tbody>
      </table>
      <h2>Why a CRC is stronger</h2>
      <p>A checksum adds the bytes, and addition does not care about order, so swapped bytes give the same sum. A CRC
        treats the whole message as one long binary number and divides it by the polynomial, using XOR instead of
        subtraction; the CRC is the remainder. Every bit affects every later step, so the position of each bit matters.
        A polynomial with 8 bits after the leading 1 catches every error burst up to 8 bits long, and 0x07 also catches
        every error that flips an odd number of bits.</p>
      <h2>Where they are used</h2>
      <p>This CRC-8 is the packet error check of SMBus, which runs on <a href="?p=i2c" data-nav>I²C</a>.
        <a href="?p=usb" data-nav>USB</a> protects tokens with a 5-bit CRC and data with a 16-bit one,
        <a href="?p=ethernet" data-nav>Ethernet</a> ends every frame with a 32-bit CRC, and
        <a href="?p=uart" data-nav>UART</a> can add a single parity bit. Intel HEX files end each line with the
        checksum above. Many microcontrollers have a CRC unit that computes these in hardware, and software versions
        usually use a 256-entry table to process a byte at a time.</p>
    </section>`,
  });

  function draw() {
    const all = steps(m, data);
    at = Math.min(at, all.length - 1);
    const s = all[at];
    const prev = at > 0 ? all[at - 1].acc : null;
    code(root, LISTINGS[m], s.pc);
    const name = m === 'sum' ? 'sum' : 'crc';
    const done = at === all.length - 1;
    root.querySelector('.vars-wrap')!.innerHTML = table(
      data.map((d, k) => row(`data[${k}]`, k === s.i ? 'current' : '', `<code class="hex">${hexN(d, 8)}</code>`,
        bits(`d${k}`, d, 8, { editable: true, tip: (b) => `Bit ${b} of data[${k}]. Click to flip it, as noise on the wire would.` }))).join('') +
      row(done ? (m === 'sum' ? 'return' : 'crc') : name, 'uint8_t', `<code class="hex">${hexN(s.acc, 8)}</code>`,
        bits('acc', s.acc, 8, { flipped: flips(prev, s.acc), tip: (b) => (m === 'crc8' && b === 7 ? 'The top bit decides whether the next shift XORs in the polynomial.' : `Bit ${b} of ${name}.`) }),
        prev !== null && prev !== s.acc) +
      (m === 'crc8' ? row('poly', '', '<code class="hex">0x07</code> <small>x⁸ + x² + x + 1</small>', bits('poly', POLY, 8)) : ''),
    );
    markSeg(root, 'm', m);
    root.querySelector<HTMLButtonElement>('[data-act="step"]')!.disabled = done;
    root.querySelector<HTMLButtonElement>('[data-act="run"]')!.disabled = done;
    root.querySelector<HTMLButtonElement>('[data-act="swap"]')!.disabled = data.length < 2;
    const input = root.querySelector<HTMLInputElement>('.dbg-set input')!;
    if (document.activeElement !== input) input.value = data.map(hex2).join(' ');
    status(root, `Step ${at + 1} of ${all.length}. ${s.say}`);
    syncUrl({ m, d: data.map(hex2).join('') });
  }

  wire(root, html, draw);
  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    const k = t.closest<HTMLElement>('.bitrow.editable .bit');
    const s = t.closest<HTMLElement>('[data-m]');
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    const end = () => steps(m, data).length - 1;
    if (k) {
      // An edit is a corrupted message: show its result right away, to compare with the one before.
      const n = Number(k.dataset.row!.slice(1));
      const before = (m === 'sum' ? checksum : crc8)(data);
      data[n] ^= 1 << Number(k.dataset.bit);
      at = end();
      draw();
      const after = (m === 'sum' ? checksum : crc8)(data);
      status(root, `Bit ${k.dataset.bit} of data[${n}] flipped. The ${m === 'sum' ? 'checksum' : 'CRC'} went from ${hexN(before, 8)} to ${hexN(after, 8)}${after === before ? ': the error goes unnoticed.' : ', so the receiver notices.'}`);
      return;
    }
    if (s) {
      m = s.dataset.m as Method;
      at = 0;
    } else if (act === 'step') at++;
    else if (act === 'run') at = end();
    else if (act === 'restart') at = 0;
    else if (act === 'swap' && data.length > 1) {
      const before = (m === 'sum' ? checksum : crc8)(data);
      [data[0], data[1]] = [data[1], data[0]];
      at = end();
      draw();
      const after = (m === 'sum' ? checksum : crc8)(data);
      status(root, `data[0] and data[1] swapped. The ${m === 'sum' ? 'checksum stays' : 'CRC went from'} ${m === 'sum' ? hexN(after, 8) : `${hexN(before, 8)} to ${hexN(after, 8)}`}${after === before ? ': addition ignores order, so the error goes unnoticed.' : ', so the receiver notices.'}`);
      return;
    } else return;
    draw();
  });
  root.querySelector('.dbg-set input')!.addEventListener('change', (e) => {
    try {
      const d = parseBytes((e.target as HTMLInputElement).value, 'hex');
      if (d.length > MAX) throw new Error(`Up to ${MAX} bytes, so every step fits on screen.`);
      data = d;
      at = 0;
      draw();
    } catch (err) {
      status(root, `${(err as Error).message} Type hex bytes, such as 48 69.`);
    }
  });
}
