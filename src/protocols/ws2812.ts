import type { Bit, Field, Note, Protocol, TourStop } from '../core/types';
import { TraceBuilder, hex } from '../core/util';

/** One diagram unit is 50 ns. WS2812B datasheet timings, each ±150 ns. */
const UNIT = 50e-9;
const PERIOD = 25; // 1.25 µs per bit, 800 kbit/s
const HIGH = { 0: 8, 1: 16 } as const; // 0.4 µs for a 0, 0.8 µs for a 1
/** A point between the two high times, to show how a 0 and a 1 differ. */
const SAMPLE = 12; // 0.6 µs
const CHANNELS = ['G', 'R', 'B'] as const;
const NAMES = { G: 'green', R: 'red', B: 'blue' };

/** Parses colors written as RRGGBB, one per LED. */
function parseColors(s: string) {
  const tokens = s.replace(/#|0x/gi, ' ').split(/[\s,]+/).filter(Boolean);
  if (!tokens.length) throw new Error('Enter at least one color, written as RRGGBB, such as FF0000 for red.');
  if (tokens.length > 4) throw new Error('Up to 4 LEDs are shown here; each one adds 24 bits.');
  return tokens.map((t) => {
    if (!/^[0-9a-f]{6}$/i.test(t)) throw new Error(`"${t}" is not a color. Write each as six hex digits, RRGGBB, such as FF8000.`);
    const v = parseInt(t, 16);
    return { R: v >> 16, G: (v >> 8) & 0xff, B: v & 0xff };
  });
}

export const ws2812: Protocol = {
  id: 'ws2812',
  name: 'WS2812',
  fullName: 'WS2812B addressable RGB LED (NeoPixel)',
  tags: ['asynchronous', 'single-ended', 'push-pull', 'simplex', 'daisy chain', 'chip-to-chip'],
  summary:
    'Addressable LED strips driven by a single data line. Every bit is a high pulse followed by a low one, 1.25 µs in ' +
    'all: a short high pulse is a 0 and a long one is a 1. Each LED keeps the first 24 bits it receives, its green, ' +
    'red and blue brightness, and passes everything after them to the next LED. A long low period latches the colors.',
  usedIn: 'LED strips and rings, sold as NeoPixels by Adafruit, in lighting, displays, wearables and hobby projects.',
  facts: {
    clock: 'None. Each bit begins with a rising edge, and the LED tells a 0 from a 1 by how long the line stays high.',
    wires: 'One data line (DIN) plus 5 V power and ground. Each LED drives its own DOUT into the next LED’s DIN.',
    drive: 'Push-pull. A 5 V LED often reads 3.3 V logic correctly, but the datasheet asks for 0.7 × VDD, so a level shifter is safer.',
    duplex: 'Simplex: data only flows from the controller down the chain. The LEDs never answer.',
    topology: 'A daisy chain: the controller feeds the first LED, and each LED regenerates the signal for the next.',
    addressing: 'None. An LED’s position in the chain is its address: the first 24 bits go to the first LED, the next 24 to the second, and so on.',
    flow: 'None. The controller sends whenever it likes; holding the line low for the reset time makes every LED show its new color at once.',
    errors: 'None. A timing error shows up as a wrong color.',
    speed: '800 kbit/s, so 30 µs per LED: about 1,000 LEDs at 30 frames per second.',
    reach: 'Centimeters to a few meters between the controller and the first LED. Each LED regenerates the signal, so the chain itself can be long; power is usually the limit.',
  },
  strengths: [
    'One data pin drives hundreds of individually colored LEDs.',
    'No addresses to configure: position in the chain decides which color goes where.',
    'The signal is regenerated at every LED, so it stays clean along long strips.',
  ],
  limits: [
    'Tight timing (±150 ns) is hard to meet by toggling a pin in software with interrupts enabled; SPI, PWM with DMA, or a dedicated peripheral is usually used instead.',
    'Updating one LED means resending every LED before it in the chain.',
    'No error checking or feedback: the controller cannot tell whether an LED received its color.',
  ],
  deepDive: [
    {
      title: 'Generating the timing',
      body: [
        'At 800 kbit/s each bit is only 1.25 µs, and the high time must be within about 150 ns. Common tricks avoid ' +
        'toggling a pin by hand: an [SPI](?p=spi) peripheral running at about 2.4 MHz sends each WS2812 bit as three SPI ' +
        'bits (100 for a 0 and 110 for a 1); a timer’s PWM output with DMA changes the duty cycle every period; and some ' +
        'microcontrollers, such as the RP2040 with its programmable I/O, generate the waveform in hardware.',
      ],
    },
    {
      title: 'Reset time',
      body: [
        'The original WS2812B datasheet asks for the line to stay low for more than 50 µs to latch the colors. Later ' +
        'revisions and many compatible LEDs need more than 280 µs, so libraries commonly wait at least 280 µs to be safe.',
      ],
    },
  ],
  legend: { start: 'reset (latch)', data: 'color bit' },
  params: [
    {
      key: 'colors', label: 'Colors', help: 'One color per LED, each written as six hex digits, RRGGBB, as in HTML. They are sent green first, then red, then blue, each most significant bit first.',
      type: 'text', default: 'FF0000 00FF00', placeholder: 'FF0000 00FF00',
    },
    {
      key: 'reset', label: 'Reset time', help: 'How long the line must stay low to latch the colors: more than 50 µs for the original WS2812B, and more than 280 µs for newer revisions and many compatible LEDs.',
      type: 'select', default: '280',
      options: [{ value: '280', label: '280 µs (newer LEDs)' }, { value: '50', label: '50 µs (original WS2812B)' }],
    },
  ],

  encode(p) {
    const leds = parseColors(p.colors);
    const din = new TraceBuilder('DIN', 0);
    const bits: Bit[] = [];
    const fields: Field[] = [];
    const notes: Note[] = [];
    const ledSpans: [number, number][] = [];
    const explained = new Set<number>();

    let t = 10;
    leds.forEach((led, n) => {
      const ledStart = t;
      if (n > 0) notes.push({ lane: 0, t, text: `LED ${n + 1}: passed along by LED ${n}` });
      for (const ch of CHANNELS) {
        const byte = led[ch];
        const start = t;
        for (let i = 7; i >= 0; i--) {
          const v = ((byte >> i) & 1) as 0 | 1;
          din.set(t, 1);
          din.set(t + HIGH[v], 0);
          if (!explained.has(v)) notes.push({ lane: 0, t, text: v ? '1: long high, 0.8 µs' : '0: short high, 0.4 µs' });
          explained.add(v);
          bits.push({
            lane: 0, t0: t, t1: t + PERIOD, label: `${ch}${i}`, kind: 'data', by: 'controller', sample: t + SAMPLE,
            info: `LED ${n + 1}, ${NAMES[ch]} bit ${i} = ${v}. The line goes high for ${v ? '0.8' : '0.4'} µs, then low for ` +
              `${v ? '0.45' : '0.85'} µs. The LED tells the two apart by the high time; at 0.6 µs, marked here, a 1 is still high and a 0 is already low.`,
          });
          t += PERIOD;
        }
        fields.push({ lane: 0, t0: start, t1: t, label: `${ch} ${hex(byte)}`, kind: 'data' });
      }
      ledSpans.push([ledStart, t]);
    });

    // The reset: the line stays low. Only its start is drawn; at true scale it would be far longer than the data.
    const resetUs = Number(p.reset);
    const resetEnd = t + 3 * PERIOD;
    notes.push({ lane: 0, t, text: `reset: low for over ${resetUs} µs latches the colors` });
    bits.push({
      lane: 0, t0: t, t1: resetEnd, label: 'Reset', kind: 'start', by: 'controller',
      info: `Reset: the controller holds the line low for more than ${resetUs} µs. Every LED then shows the color it ` +
        `received, all at the same moment, and gets ready for the next frame. Only the start of the reset is drawn; the ` +
        `whole of it would be ${Math.round((resetUs * 1e-6) / UNIT / ((t - 10) || 1))} times as long as the data above.`,
    });

    const view = (r: [number, number], pad = 6): [number, number] => [Math.max(0, r[0] - pad), r[1] + pad];
    const first = bits[0];
    const tour: TourStop[] = [
      { title: 'Overview', text: `${leds.length} LED${leds.length > 1 ? 's' : ''}, 24 bits each, then a reset. The line idles low.`, view: [0, resetEnd], focus: null },
      { title: 'One bit', text: 'Every bit starts with a rising edge and lasts 1.25 µs. Only the length of the high part carries information: about 0.4 µs for a 0 and 0.8 µs for a 1.', view: view([first.t0, first.t1 + PERIOD]), focus: [first.t0, first.t1] },
      { title: 'Green first', text: `The first byte is green, then red, then blue, each most significant bit first. This LED gets green ${hex(leds[0].G)}, red ${hex(leds[0].R)} and blue ${hex(leds[0].B)}.`, view: view(ledSpans[0]), focus: ledSpans[0] },
    ];
    if (leds.length > 1) {
      tour.push({ title: 'The next LED', text: 'The first LED kept its 24 bits and is now passing everything else to LED 2, regenerating the signal as it goes. Position in the chain is the only address.', view: view(ledSpans[1]), focus: ledSpans[1] });
    }
    tour.push({ title: 'Reset', text: `Holding the line low for more than ${resetUs} µs tells every LED to show its new color at once.`, view: [Math.max(0, t - 2 * PERIOD), resetEnd], focus: [t, resetEnd] });

    return { traces: [din.trace], bits, fields, notes, duration: resetEnd + 2, unitTime: UNIT, minPpu: 1.2, tour };
  },
};
