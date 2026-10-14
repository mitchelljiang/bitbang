import type { Bit, Field, Note, Protocol } from '../core/types';
import { TraceBuilder, hex } from '../core/util';

export const i2s: Protocol = {
  id: 'i2s',
  name: 'I²S',
  fullName: 'Inter-IC Sound',
  summary:
    'A continuous stream of audio samples. The bit clock (SCK) ticks once per bit, word select (WS) says which channel ' +
    'is being sent (low for left, high for right), and SD carries each sample most significant bit first. In standard ' +
    'I²S, WS changes one clock before the sample it belongs to.',
  usedIn: 'Audio DACs and codecs, digital MEMS microphones, Bluetooth audio chips, and smart speakers.',
  facts: {
    clock: 'Synchronous. The controller drives SCK and WS continuously. Codecs often also want a master clock (MCLK) at 256 times the sample rate.',
    wires: 'SCK, WS and SD, plus ground, and optionally MCLK. Recording and playback use separate SD lines that share the clocks.',
    drive: 'Push-pull.',
    duplex: 'One direction per SD line. Full duplex uses two SD lines on the same SCK and WS.',
    topology: 'Point-to-point, usually a microcontroller and a codec. TDM variants put 4 to 16 channels on one data line.',
    addressing: 'None. The level of WS says which channel the current sample is for.',
    flow: 'None. Samples stream at a fixed rate and can\'t be paused, so the sender must always have the next one ready.',
    errors: 'None. A corrupted bit is heard as a click in the audio.',
    speed: 'SCK = sample rate × channels × bits per slot. 48 kHz stereo with 32-bit slots is 3.072 MHz.',
    reach: 'Board level. Long cables need a different link, such as S/PDIF or USB audio.',
  },
  strengths: [
    'Very simple: no addresses, no commands and no overhead; only samples.',
    'Sample-accurate timing, which is exactly what audio needs.',
    'Supported by almost every audio codec and most microcontrollers with audio features.',
  ],
  limits: [
    'Suited only to audio-like data: fixed-size samples at a steady rate.',
    'No error checking or acknowledgment of any kind.',
    'Several near-identical formats exist (standard I²S, left-justified, right-justified). Picking the wrong one gives distorted or very loud audio.',
    'Limited to two channels per data line unless TDM is used.',
  ],
  legend: { dummy: 'padding' },
  params: [
    { key: 'left', label: 'Left sample', type: 'text', default: '12000', placeholder: '12000 (signed)' },
    { key: 'right', label: 'Right sample', type: 'text', default: '-3000', placeholder: '-3000 (signed)' },
    {
      key: 'bits', label: 'Bits', type: 'select', default: '16',
      options: [{ value: '16', label: '16-bit in 16-bit slots' }, { value: '24', label: '24-bit in 32-bit slots' }],
    },
    {
      key: 'format', label: 'Format', type: 'select', default: 'i2s',
      options: [{ value: 'i2s', label: 'Standard I²S' }, { value: 'lj', label: 'Left-justified' }],
    },
    {
      key: 'rate', label: 'Sample rate', type: 'select', default: '48000',
      options: [{ value: '44100', label: '44.1 kHz' }, { value: '48000', label: '48 kHz' }],
    },
  ],

  encode(p) {
    const depth = +p.bits;
    const slot = depth === 24 ? 32 : 16;
    const max = 2 ** (depth - 1);
    const parse = (text: string, name: string) => {
      const v = Number(text.trim());
      if (!Number.isInteger(v)) throw new Error(`The ${name} sample should be a whole number, like 12000 or -3000.`);
      if (v < -max || v >= max) throw new Error(`A ${depth}-bit sample goes from ${-max} to ${max - 1}.`);
      return v < 0 ? v + 2 * max : v; // two's complement
    };
    const left = parse(p.left, 'left');
    const right = parse(p.right, 'right');
    const standard = p.format === 'i2s';
    const delay = standard ? 1 : 0;

    const sck = new TraceBuilder('SCK', 0);
    const ws = new TraceBuilder('WS', 1);
    const sd = new TraceBuilder('SD', 0);
    const bits: Bit[] = [];
    const fields: Field[] = [];
    const notes: Note[] = [];

    const start = 2; // first clock of the left slot, leaving room for WS to change early
    const end = start + 2 * slot + 1;
    for (let c = 0; c < end; c++) {
      sck.set(c + 0.5, 1);
      sck.set(c + 1, 0);
    }

    // WS leads the data by one clock in standard I²S, and lines up with it in left-justified.
    ws.set(start - delay, 0);
    ws.set(start + slot - delay, 1);
    ws.set(start + 2 * slot - delay, 0);
    notes.push({ lane: 1, t: start - delay, text: standard ? 'WS low: left channel, one clock early' : 'WS low: left channel' });
    notes.push({ lane: 1, t: start + slot - delay, text: 'WS high: right' });

    const word = (value: number, from: number, channel: string) => {
      const pad = slot - depth;
      for (let i = 0; i < slot; i++) {
        const t = from + i;
        const bitIndex = depth - 1 - i;
        if (i < depth) {
          const v = ((value >> bitIndex) & 1) as 0 | 1;
          sd.set(t, v);
          bits.push({
            lane: 2, t0: t, t1: t + 1, label: `${bitIndex}`, kind: 'data', sample: t + 0.5,
            info: `${channel} sample, bit ${bitIndex} = ${v}. Samples are signed two's complement and sent most ` +
              `significant bit first${i === 0 ? ', so this first bit is the sign: 1 means negative' : ''}. SD changes on ` +
              'the falling edge of SCK and the receiver reads it on the rising edge.',
          });
        } else {
          sd.set(t, 0);
          bits.push({
            lane: 2, t0: t, t1: t + 1, label: '0', kind: 'dummy', sample: t + 0.5,
            info: `Padding: a ${depth}-bit sample in a ${slot}-bit slot leaves ${pad} unused bits, sent as 0. Because the ` +
              'sample starts at the MSB, a receiver expecting more or fewer bits still gets the loud part right.',
          });
        }
      }
      const signed = value >= max ? value - 2 * max : value;
      fields.push({ lane: 2, t0: from, t1: from + depth, label: `${channel} ${signed} (${hex(value)})`, kind: 'data' });
    };
    word(left, start, 'Left');
    word(right, start + slot, 'Right');
    notes.push({ lane: 2, t: start, text: 'MSB first' });

    const fs = +p.rate;
    return {
      traces: [sck.trace, ws.trace, sd.trace],
      bits, fields, notes, duration: end, unitTime: 1 / (fs * 2 * slot),
    };
  },
};
