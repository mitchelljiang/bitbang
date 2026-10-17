/**
 * The Ethernet frame (the IEEE 802.3 MAC frame), shared by every Ethernet page. Each physical layer page sends exactly
 * these bytes, so switching between them shows the same frame on very different wires.
 */
import type { Kind, Param } from '../core/types';
import { parseBytes, parseHex } from '../core/util';

export const MIN_PAYLOAD = 46;

/** CRC-32 as used by Ethernet (reflected, polynomial 0x04C11DB7, start and finish with all ones). */
export function crc32(bytes: number[]) {
  let crc = 0xffffffff;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const mac = (text: string, name: string) => {
  const bytes = parseBytes(text.replace(/[:-]/g, ' '), 'hex');
  if (bytes.length !== 6) throw new Error(`The ${name} MAC address needs exactly 6 bytes, like 02:00:00:00:00:01.`);
  return bytes;
};
export const macText = (b: number[]) => b.map((x) => x.toString(16).padStart(2, '0')).join(':');

/** The frame's settings, the same on every Ethernet page. */
export const FRAME_PARAMS: Param[] = [
  { key: 'dst', label: 'Destination', help: 'The destination MAC address, as six hexadecimal bytes. ff:ff:ff:ff:ff:ff is the broadcast address, which every device accepts.', type: 'text', default: 'ff:ff:ff:ff:ff:ff', placeholder: 'ff:ff:ff:ff:ff:ff' },
  { key: 'src', label: 'Source', help: 'The MAC address of the sender, as six hexadecimal bytes.', type: 'text', default: '02:00:00:00:00:01', placeholder: '02:00:00:00:00:01' },
  { key: 'type', label: 'EtherType', help: 'The EtherType, a 2-byte code that identifies the payload protocol, such as 0800 for IPv4. 88B5 is reserved for local experiments.', type: 'text', default: '88B5', placeholder: '88B5 (hex)' },
  { key: 'data', label: 'Payload', help: 'The frame payload, up to 46 bytes here (Ethernet allows up to 1500). Shorter payloads are padded with zeros to 46 bytes, the minimum, so the frame is the same length either way.', type: 'text', default: 'Hi', placeholder: 'Hi' },
  {
    key: 'format', label: 'As', help: 'Whether the payload is read as text characters or as hexadecimal bytes.', type: 'select', default: 'text',
    options: [{ value: 'text', label: 'Text' }, { value: 'hex', label: 'Hex' }],
  },
];

export interface Section {
  /** A short name for walkthroughs and spans: preamble, sfd, dst, src, type, payload, padding, fcs. */
  id: string;
  bytes: number[];
  label: string;
  kind: Kind;
  info: string;
}

/** The frame from the settings: its sections in transmission order, from the preamble to the FCS. */
export function buildFrame(p: Record<string, string>) {
  const dst = mac(p.dst, 'destination');
  const src = mac(p.src, 'source');
  const type = parseHex(p.type, 4, 'The EtherType should be up to 4 hex digits, like 0800 or 88B5.');
  const typeHex = type.toString(16).toUpperCase().padStart(4, '0');
  // Up to the 46-byte minimum: shorter payloads are padded to it, so any length up to 46 sends a frame of the same size.
  const payload = parseBytes(p.data, p.format, MIN_PAYLOAD);
  const pad = Math.max(0, MIN_PAYLOAD - payload.length);
  const body = [...dst, ...src, type >> 8, type & 0xff, ...payload, ...new Array(pad).fill(0)];
  const fcs = crc32(body);
  const fcsHex = fcs.toString(16).toUpperCase().padStart(8, '0');
  const sections: Section[] = [
    { id: 'preamble', bytes: new Array(7).fill(0x55), label: 'Preamble (7 × 0x55)', kind: 'start',
      info: 'Preamble: seven 0x55 bytes, an alternating 1010… pattern. It carries no data; it gives the receiver time to lock onto the signal.' },
    { id: 'sfd', bytes: [0xd5], label: 'SFD 0xD5', kind: 'start',
      info: 'Start frame delimiter 0xD5. It looks like the preamble except it ends in 11, which tells the receiver the frame starts with the next bit.' },
    { id: 'dst', bytes: dst, label: `To ${macText(dst)}`, kind: 'addr',
      info: `Destination MAC address ${macText(dst)}.${dst.every((b) => b === 0xff) ? ' All ones means broadcast: every device accepts it.' : ''}` },
    { id: 'src', bytes: src, label: `From ${macText(src)}`, kind: 'addr', info: `Source MAC address ${macText(src)}.` },
    { id: 'type', bytes: [type >> 8, type & 0xff], label: `Type 0x${typeHex}`, kind: 'cmd',
      info: 'EtherType: what kind of payload follows (0x0800 is IPv4, 0x86DD is IPv6, 0x88B5 is reserved for local experiments). It is sent most significant byte first.' },
    { id: 'payload', bytes: payload, label: `Payload (${payload.length} byte${payload.length === 1 ? '' : 's'})`, kind: 'data', info: 'Payload.' },
    { id: 'padding', bytes: new Array(pad).fill(0), label: `Padding (${pad} bytes)`, kind: 'dummy',
      info: 'Padding: the payload must be at least 46 bytes, so the frame is at least 64 bytes from the destination address to the FCS.' },
    { id: 'fcs', bytes: [0, 8, 16, 24].map((s) => (fcs >>> s) & 0xff), label: `FCS 0x${fcsHex}`, kind: 'parity',
      info: 'Frame check sequence: a CRC-32 over everything from the destination address to the end of the padding, sent least significant byte first. The receiver recomputes it and drops the frame if the values differ.' },
  ].filter((s) => s.bytes.length > 0) as Section[];
  return { sections, dst, src, typeHex, payload, pad, body, fcs, fcsHex, bytes: sections.flatMap((s) => s.bytes) };
}

export type Frame = ReturnType<typeof buildFrame>;
