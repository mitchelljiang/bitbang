import type { Level, Trace } from './types';

export const MAX_BYTES = 16;

/** Builds a Trace, collapsing redundant points. */
export class TraceBuilder {
  trace: Trace;

  constructor(name: string, initial: Level, openDrain = false) {
    this.trace = { name, points: [{ t: 0, v: initial }], ...(openDrain && { openDrain }) };
  }

  set(t: number, v: Level, soft = false): void {
    const pts = this.trace.points;
    const last = pts[pts.length - 1];
    if (last.v === v) return;
    if (last.t === t) {
      pts.pop();
      if (pts.length && pts[pts.length - 1].v === v) return;
    }
    pts.push(soft ? { t, v, soft } : { t, v });
  }
}

/** Parses "A5 3C", "0xA5,0x3C" or "a53c" (hex) or plain text into bytes. */
export function parseBytes(input: string, format: string): number[] {
  let bytes: number[];
  if (format === 'text') {
    bytes = [...new TextEncoder().encode(input)];
  } else {
    const tokens = input.replace(/0x/gi, ' ').split(/[\s,]+/).filter(Boolean);
    bytes = [];
    for (const tok of tokens) {
      if (!/^[0-9a-f]+$/i.test(tok)) throw new Error(`"${tok}" isn't a hex byte.`);
      const padded = tok.length % 2 ? '0' + tok : tok;
      for (let i = 0; i < padded.length; i += 2) bytes.push(parseInt(padded.slice(i, i + 2), 16));
    }
  }
  if (bytes.length === 0) throw new Error('Enter at least one byte to send.');
  if (bytes.length > MAX_BYTES) throw new Error(`That's ${bytes.length} bytes — keep it to ${MAX_BYTES} or fewer.`);
  return bytes;
}

export const hex = (b: number) => '0x' + b.toString(16).toUpperCase().padStart(2, '0');

export const bin = (b: number, n = 8) => b.toString(2).padStart(n, '0');

export const printable = (b: number) => (b >= 0x20 && b < 0x7f ? `'${String.fromCharCode(b)}'` : '');

/** Formats seconds as a short human string: 104 µs, 1.25 ms, 500 ns. */
export function formatTime(s: number): string {
  if (s === 0) return '0';
  const abs = Math.abs(s);
  const [scale, unit] = abs >= 1e-3 ? [1e3, 'ms'] : abs >= 1e-6 ? [1e6, 'µs'] : [1e9, 'ns'];
  return `${+(s * scale).toPrecision(3)} ${unit}`;
}
