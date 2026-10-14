import type { Bit, Field, Note, Protocol } from '../core/types';
import { TraceBuilder, hex } from '../core/util';

export const i2s: Protocol = {
  id: 'i2s',
  name: 'I²S',
  fullName: 'Inter-IC Sound',
  tags: ['synchronous', 'single-ended', 'push-pull', 'simplex', 'point-to-point', 'chip-to-chip', 'audio', 'streaming'],
  summary:
    'A continuous stream of digital audio samples between chips. The bit clock (SCK) marks each bit, word select (WS) ' +
    'indicates which channel is being sent (low for left, high for right), and the serial data line (SD) carries each ' +
    'sample, most significant bit first. In standard I²S, WS changes one clock cycle before the sample it belongs to.',
  usedIn: 'Audio DACs and codecs, digital MEMS microphones, Bluetooth audio chips and smart speakers.',
  facts: {
    clock: 'Synchronous. The controller drives SCK and WS continuously. Codecs often also require a master clock (MCLK) at 256 times the sample rate.',
    wires: 'SCK, WS and SD, plus ground, and optionally MCLK. Recording and playback use separate SD lines that share the same clocks.',
    drive: 'Push-pull.',
    duplex: 'Each SD line carries data in one direction only. Full duplex uses two SD lines on the same SCK and WS.',
    topology: 'Point-to-point, usually a microcontroller and a codec. TDM variants carry 4 to 16 channels on one data line.',
    addressing: 'None. The level of WS indicates which channel the current sample belongs to.',
    flow: 'None. Samples stream at a fixed rate and cannot be paused, so the transmitter must always have the next sample ready.',
    errors: 'None. A corrupted bit is heard as a click in the audio.',
    speed: 'SCK equals the sample rate × the number of channels × the bits per slot. 48 kHz stereo with 32-bit slots requires 3.072 MHz.',
    reach: 'Circuit-board distances. Longer connections require a different link, such as S/PDIF or USB audio.',
  },
  strengths: [
    'Very simple: no addresses, no commands and no overhead; only samples.',
    'Sample-accurate timing, which is exactly what audio requires.',
    'Supported by almost every audio codec and by most microcontrollers with audio features.',
  ],
  limits: [
    'Suited only to audio-like data: fixed-size samples at a steady rate.',
    'No error checking or acknowledgment of any kind.',
    'Several similar formats exist (standard I²S, left-justified and right-justified), and selecting the wrong one produces distorted or very loud audio.',
    'Limited to two channels per data line unless TDM is used.',
  ],
  legend: { dummy: 'padding' },
  deepDive: [
    {
      title: 'Master clock and sample-rate families',
      body: [
        'Most audio codecs require a master clock (MCLK) at a fixed multiple of the sample rate, commonly 256 × fs, to run their internal oversampling converters. That is 12.288 MHz for 48 kHz and 11.2896 MHz for 44.1 kHz. Because neither frequency divides evenly into the other, equipment that supports both rate families typically needs two crystals or a fractional PLL.',
      ],
    },
    {
      title: 'Which side drives the clocks',
      body: [
        'Either side can generate SCK and WS. When the codec is the clock source, the microcontroller follows the codec\'s clock domain, which is common for recording. When the microcontroller is the source, it must produce exact rates from its own clock tree. Both sides must agree on which one drives the clocks; if both drive them, the outputs contend.',
      ],
    },
    {
      title: 'I²S, left-justified and right-justified',
      body: [
        'The three common formats differ only in where the sample sits relative to the WS edge. Standard I²S starts the most significant bit one clock after the edge. Left-justified starts it on the edge. Right-justified aligns the least significant bit with the end of the slot, so the receiver must know the word length in advance.',
        'A format mismatch shifts every sample by one or more bits, which typically doubles or halves the amplitude, or corrupts the sign bit and produces loud distortion.',
      ],
    },
    {
      title: 'TDM: more than two channels',
      body: [
        'Time-division multiplexing (TDM) extends the same idea to many channels. A short frame-sync pulse replaces WS, followed by a fixed number of slots, for example eight 32-bit slots per frame. At 48 kHz that requires a 12.288 MHz bit clock. TDM is used for microphone arrays, multichannel codecs and automotive audio.',
      ],
    },
    {
      title: 'PDM microphones',
      body: [
        'Many digital MEMS microphones output pulse-density modulation (PDM) instead of I²S: a single-bit stream at several megahertz whose density of 1s follows the audio waveform. Two microphones can share one data line by transmitting on opposite clock edges. The receiver must apply a decimation filter to convert PDM to PCM samples. Microphones with an I²S output, such as the INMP441, contain that filter internally.',
      ],
    },
  ],
  params: [
    { key: 'left', label: 'Left sample', help: 'The left-channel sample as a signed whole number. A 16-bit sample ranges from −32768 to 32767.', type: 'text', default: '12000', placeholder: '12000 (signed)' },
    { key: 'right', label: 'Right sample', help: 'The right-channel sample as a signed whole number.', type: 'text', default: '-3000', placeholder: '-3000 (signed)' },
    {
      key: 'bits', label: 'Bits', help: 'The sample size and slot size. 24-bit samples are usually sent in 32-bit slots, with the remaining bits filled with zeros.', type: 'select', default: '16',
      options: [{ value: '16', label: '16-bit in 16-bit slots' }, { value: '24', label: '24-bit in 32-bit slots' }],
    },
    {
      key: 'format', label: 'Format', help: 'Standard I²S starts each sample one clock cycle after WS changes; left-justified starts it on the same clock cycle. Both devices must use the same format.', type: 'select', default: 'i2s',
      options: [{ value: 'i2s', label: 'Standard I²S' }, { value: 'lj', label: 'Left-justified' }],
    },
    {
      key: 'rate', label: 'Sample rate', help: 'The audio sample rate. It sets the bit clock frequency: sample rate × 2 channels × slot size.', type: 'select', default: '48000',
      options: [{ value: '44100', label: '44.1 kHz' }, { value: '48000', label: '48 kHz' }],
    },
  ],

  encode(p) {
    const depth = +p.bits;
    const slot = depth === 24 ? 32 : 16;
    const max = 2 ** (depth - 1);
    const parse = (text: string, name: string) => {
      const v = Number(text.trim());
      if (!Number.isInteger(v)) throw new Error(`The ${name} sample must be a whole number, such as 12000 or -3000.`);
      if (v < -max || v >= max) throw new Error(`A ${depth}-bit sample ranges from ${-max} to ${max - 1}.`);
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
    notes.push({ lane: 1, t: start - delay, text: standard ? 'WS low: left channel, one clock cycle early' : 'WS low: left channel' });
    notes.push({ lane: 1, t: start + slot - delay, text: 'WS high: right channel' });

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
            info: `${channel} sample, bit ${bitIndex} = ${v}. Samples are signed two's complement values sent most ` +
              `significant bit first${i === 0 ? ', so this first bit is the sign bit, where 1 indicates a negative value' : ''}. ` +
              'SD changes on the falling edge of SCK, and the receiver samples it on the rising edge.',
          });
        } else {
          sd.set(t, 0);
          bits.push({
            lane: 2, t0: t, t1: t + 1, label: '0', kind: 'dummy', sample: t + 0.5,
            info: `Padding: a ${depth}-bit sample in a ${slot}-bit slot leaves ${pad} unused bits, sent as 0. Because the ` +
              'sample is aligned to its most significant bit, a receiver configured for a different word length still ' +
              'receives the most significant bits correctly.',
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
