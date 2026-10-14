/** A logic level on a wire. 'z' means released / high-impedance / don't care. */
export type Level = 0 | 1 | 'z';

/** One wire, described as the times at which its level changes. Time is in protocol units (e.g. bit periods). */
export interface Trace {
  name: string;
  /** `soft` marks a rise that happens through a pull-up rather than a driver, for buses that switch modes (I3C). */
  points: { t: number; v: Level; soft?: boolean }[];
  /** Pulled high by a resistor (I²C), so it rises slowly along an RC curve and falls fast. */
  openDrain?: boolean;
  /** Labels for the low and high levels when they aren't plain logic levels, e.g. ['−12 V', '+12 V']. */
  levels?: [string, string];
}

export type Kind = 'start' | 'stop' | 'data' | 'parity' | 'ack' | 'nack' | 'addr' | 'rw' | 'cmd' | 'dummy';

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

/** A short callout written above a trace, pointing at one moment (e.g. "idle high"). */
export interface Note {
  lane: number;
  t: number;
  text: string;
}

export interface Waveform {
  traces: Trace[];
  bits: Bit[];
  fields: Field[];
  notes?: Note[];
  duration: number;
  /** Seconds per time unit, for the ruler. */
  unitTime: number;
  /** Smallest pixels-per-unit "fit" will use before scrolling. Lower it when one unit is a small slice of a bit. */
  minPpu?: number;
}

export type Param =
  | { key: string; label: string; type: 'select'; options: { value: string; label: string }[]; default: string }
  | { key: string; label: string; type: 'text'; default: string; placeholder?: string };

/** The questions every protocol has to answer. Each one has a section in the guide page. */
export type FactKey = 'clock' | 'wires' | 'drive' | 'duplex' | 'topology' | 'addressing' | 'flow' | 'errors' | 'speed' | 'reach';

export interface Protocol {
  id: string;
  name: string;
  summary: string;
  /** Where you'd run into it in practice: a short list of real parts and uses. */
  usedIn: string;
  facts: Record<FactKey, string>;
  /** Renames legend entries for this protocol, e.g. 1-Wire calls its start kind "reset". Keyed by LEGEND keys. */
  legend?: Partial<Record<Kind, string>>;
  strengths: string[];
  limits: string[];
  params: Param[];
  /** Throws an Error with a user-facing message on invalid input. */
  encode(params: Record<string, string>): Waveform;
}
