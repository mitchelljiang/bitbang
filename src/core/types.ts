/** A logic level on a wire. 'z' means released / high-impedance / don't care. */
export type Level = 0 | 1 | 'z';

/** One wire, described as the times at which its level changes. Time is in protocol units (e.g. bit periods). */
export interface Trace {
  name: string;
  points: { t: number; v: Level }[];
}

export type Kind = 'start' | 'stop' | 'data' | 'parity' | 'ack' | 'nack' | 'addr' | 'rw';

/** Who is driving the wire during a bit — matters for shared buses like I²C. */
export type Driver = 'controller' | 'target';

/** A single annotated bit on a lane, shown in the bit row under that trace. */
export interface Bit {
  lane: number;
  t0: number;
  t1: number;
  label: string;
  kind: Kind;
  info: string;
  /** Time at which the receiver samples this bit, if it's a sampled bit. */
  sample?: number;
  by?: Driver;
}

/** A higher-level grouping of bits (a byte, an address), shown in the field row. */
export interface Field {
  lane: number;
  t0: number;
  t1: number;
  label: string;
  kind: Kind;
}

export interface Waveform {
  traces: Trace[];
  bits: Bit[];
  fields: Field[];
  duration: number;
  /** Seconds per time unit, for the ruler. */
  unitTime: number;
}

export type Param =
  | { key: string; label: string; type: 'select'; options: { value: string; label: string }[]; default: string }
  | { key: string; label: string; type: 'text'; default: string; placeholder?: string };

export interface Protocol {
  id: string;
  name: string;
  summary: string;
  params: Param[];
  /** Throws an Error with a user-facing message on invalid input. */
  encode(params: Record<string, string>): Waveform;
}
