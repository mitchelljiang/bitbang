/**
 * Walkthroughs for each protocol, built from the finished waveform so they follow whatever settings are chosen.
 * (10BASE-T builds its own inside its encoder.)
 */
import type { Bit, Field, Level, TourStop, Waveform } from './core/types';
import { formatTime, hex } from './core/util';

type Range = [number, number];
type Params = Record<string, string>;

const span = (xs: { t0: number; t1: number }[]): Range => [Math.min(...xs.map((x) => x.t0)), Math.max(...xs.map((x) => x.t1))];
const around = (w: Waveform, r: Range, before = 2, after = before): Range =>
  [Math.max(0, r[0] - before), Math.min(w.duration, r[1] + after)];
const stop = (title: string, text: string, focus: Range | null, view?: Range): TourStop =>
  ({ title, text, focus, view: view ?? focus ?? [0, 1] });
const overview = (w: Waveform, title: string, text: string): TourStop => ({ title, text, view: [0, w.duration], focus: null });
const time = (w: Waveform, units: number) => formatTime(units * w.unitTime);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function levelAt(w: Waveform, lane: number, t: number): Level {
  let v = w.traces[lane].points[0].v;
  for (const p of w.traces[lane].points) {
    if (p.t > t + 1e-9) break;
    v = p.v;
  }
  return v;
}
const valueOf = (w: Waveform, b: Bit) => (b.sample === undefined ? '?' : String(levelAt(w, b.lane, b.sample)));

/** Splits bits into UART-style frames, each starting at a start bit. */
function frames(bits: Bit[]) {
  const out: Bit[][] = [];
  for (const b of bits) {
    if (b.kind === 'start') out.push([]);
    out[out.length - 1]?.push(b);
  }
  return out;
}

function uartStops(w: Waveform, p: Params, lane = 0): TourStop[] {
  const all = frames(w.bits.filter((b) => b.lane === lane));
  const f = all[0];
  const startBit = f[0];
  const data = f.filter((b) => b.kind === 'data');
  const parity = f.find((b) => b.kind === 'parity');
  const stops = f.filter((b) => b.kind === 'stop');
  const field = w.fields[0];
  const sent = data.map((b) => valueOf(w, b)).join(', ');
  const tour: TourStop[] = [
    overview(w, 'The whole transfer',
      `${plural(all.length, 'byte')}, each sent as its own frame. At ${p.baud} baud every bit lasts ${time(w, 1)}, so ` +
      `the whole thing takes ${time(w, w.duration)}.`),
    stop('Idle', 'Between frames the line sits high. Nothing is being sent, and the receiver is just waiting for the line to fall.',
      [0, startBit.t0], around(w, [0, startBit.t1], 0, 3)),
    stop('Start bit', 'The line drops low for exactly one bit. This falling edge is the only timing reference the receiver ' +
      'gets: it starts its own timer here and counts bit periods from it.', [startBit.t0, startBit.t1], around(w, [startBit.t0, startBit.t1], 2, 4)),
    stop('Data bits, least significant first', `${plural(data.length, 'data bit')} for ${field.label}. UART sends the lowest ` +
      `bit first, so the byte goes out "backwards": ${sent}.`, span(data), around(w, span(data), 1)),
    stop('Where the receiver looks', 'Each dot is a sample point, in the middle of a bit. That is as far as possible from both ' +
      'edges, so small differences between the two clocks don\'t matter. By the last bit the clocks may have drifted ' +
      'apart by almost half a bit and the sample still lands inside it.', [data[0].t0, data[0].t1], around(w, [data[0].t0, data[0].t1], 1.5)),
  ];
  if (parity) {
    tour.push(stop('Parity bit', `${p.parity === 'even' ? 'Even' : 'Odd'} parity: this bit makes the number of 1s ${p.parity}. ` +
      'If any single bit flips on the way, the count comes out wrong and the receiver flags an error.',
    [parity.t0, parity.t1], around(w, [parity.t0, parity.t1], 4, 3)));
  }
  tour.push(stop(stops.length > 1 ? 'Stop bits' : 'Stop bit', 'The line goes back high for at least one bit. That ' +
    'guarantees the next start bit has a falling edge to make, even if the last data bit was a 0. A 0 here is reported ' +
    'as a framing error, usually a sign that the baud rates don\'t match.', span(stops), around(w, span(stops), 4, 2)));
  if (all.length > 1) {
    tour.push(stop('The next byte', 'The next byte is a whole new frame with its own start bit, so the receiver resyncs ' +
      'on every byte. That\'s why the two clocks only have to agree for about ten bits at a time.', span(all[1]), around(w, span(all[1]), 2)));
  }
  return tour;
}

/** For I²C and I3C: one stop per field, plus the conditions and handshakes around them. */
function busStops(w: Waveform, describe: (f: Field) => [string, string] | null, extra: (b: Bit) => [string, string] | null): TourStop[] {
  const items: { t0: number; t1: number; stop: TourStop }[] = [];
  const sda = w.bits.filter((b) => b.lane === 1);
  for (const f of w.fields) {
    const d = describe(f);
    if (!d) continue;
    const after = sda.find((b) => Math.abs(b.t0 - f.t1) < 1e-6 && ['ack', 'nack', 'parity'].includes(b.kind));
    const r: Range = [f.t0, after ? after.t1 : f.t1];
    items.push({ t0: r[0], t1: r[1], stop: stop(d[0], d[1], r, around(w, r, 1.5)) });
  }
  for (const b of w.bits) {
    const d = extra(b);
    if (!d) continue;
    const r: Range = [b.t0, b.t1];
    items.push({ t0: r[0], t1: r[1], stop: stop(d[0], d[1], r, around(w, r, 3)) });
  }
  return items.sort((a, b) => a.t0 - b.t0).map((x) => x.stop);
}

/** Merges consecutive data fields into one stop, so a long write doesn't need a stop per byte. */
function mergeData(fields: Field[]): Field[] {
  const out: Field[] = [];
  for (const f of fields) {
    const last = out[out.length - 1];
    if (last && last.kind === 'data' && f.kind === 'data' && f.lane === last.lane && f.t0 - last.t1 <= 1.01) {
      out[out.length - 1] = { ...last, t1: f.t1, label: `${last.label}, ${f.label}` };
    } else out.push({ ...f });
  }
  return out;
}

export const TOURS: Record<string, (w: Waveform, p: Params) => TourStop[]> = {
  uart: (w, p) => uartStops(w, p),

  rs232(w, p) {
    const base = uartStops(w, p);
    const startBit = w.bits.find((b) => b.kind === 'start')!;
    return [
      overview(w, 'Two views of the same frame', 'The top line is the UART\'s TX pin, at logic levels. The bottom line is ' +
        'what the transceiver puts on the RS-232 cable: the same frame, flipped upside down and scaled up to large voltages.'),
      stop('Idle is negative', 'A UART idles high, so RS-232 idles at a negative voltage. In RS-232 terms this is "mark", a 1.',
        [0, startBit.t0], around(w, [0, startBit.t1], 0, 3)),
      stop('The start bit goes positive', 'The start bit is a 0, which RS-232 calls "space" and sends as a positive voltage. ' +
        'The receiving transceiver flips it back, so the UART on the far end sees an ordinary falling edge.',
      [startBit.t0, startBit.t1], around(w, [startBit.t0, startBit.t1], 2, 4)),
      ...base.slice(3, 4),
      stop('Why the big swing', `The line moves between ${w.traces[1].levels?.[0]} and ${w.traces[1].levels?.[1]}, and receivers ` +
        'accept anything beyond ±3 V. Noise picked up on a few meters of cable is small next to that, which is what makes ' +
        'RS-232 work over longer wires than 3.3 V logic.', null, [0, w.duration]),
      ...base.slice(-1),
    ];
  },

  rs485(w, p) {
    const base = uartStops(w, p);
    const de = w.traces[1].points;
    const on = de.find((x) => x.v === 1)!.t;
    const off = de[de.length - 1].t;
    const startBit = w.bits.find((b) => b.kind === 'start')!;
    return [
      overview(w, 'From UART to a twisted pair', 'DI is the UART\'s TX pin feeding the transceiver. DE switches the ' +
        'transceiver\'s driver on and off. A and B are the two wires of the twisted pair.'),
      stop('Released', 'Before DE goes high, nobody drives the pair. The bias resistors (if the bus has them) hold it at a ' +
        'weak idle, drawn here in the middle.', [0, on], around(w, [0, on], 0, 2)),
      stop('Driver on', 'DE goes high a moment before the first bit, so the pair is already at a solid idle (A above B) ' +
        'when the start bit arrives.', [on, startBit.t0], around(w, [on, startBit.t1], 1, 2)),
      stop('A and B mirror each other', 'Every bit drives A and B in opposite directions. The receiver only looks at which ' +
        'one is higher, so noise that hits both wires equally cancels out. That\'s how RS-485 runs for over a kilometer.',
      [startBit.t0, startBit.t1 + 8], around(w, [startBit.t0, startBit.t1 + 8], 1)),
      ...base.slice(3, 4),
      stop('Driver off', 'After the last stop bit, DE goes low and the driver lets go, so another device can answer. Turn it ' +
        'off too early and the end of the last byte is cut off; too late and it collides with the reply.',
      [off - 1, off], around(w, [off - 1, off], 4, 2)),
    ];
  },

  spi(w, p) {
    const mode = +p.mode;
    const cpol = mode >> 1;
    const cpha = mode & 1;
    const edge = cpha === cpol ? 'rising' : 'falling';
    const csDown = w.bits.find((b) => b.label === 'CS↓')!;
    const csUp = w.bits.find((b) => b.label === 'CS↑')!;
    const mosi = w.fields.filter((f) => f.lane === 2);
    const miso = w.fields.filter((f) => f.lane === 3);
    const firstBit = w.bits.find((b) => b.lane === 2)!;
    const firstByte: Range = [mosi[0].t0, mosi[0].t1];
    const tour: TourStop[] = [
      overview(w, 'The whole transfer', `${plural(mosi.length, 'byte')} each way, ${mosi.length * 8} clocks. At this clock ` +
        `speed one clock period is ${time(w, 1)}, so the transfer takes ${time(w, w.duration)}.`),
      stop('Chip select goes low', 'The controller picks one target by pulling its CS line low. Every other target ignores ' +
        'the clock and keeps MISO released.', [csDown.t0, csDown.t1], around(w, [csDown.t0, csDown.t1], 1, 3)),
      stop(`Mode ${mode}: the sampling edge`, `In mode ${mode} the clock idles ${cpol ? 'high' : 'low'}, and both sides read ` +
        `data on the ${edge} edge (the dots). Data changes on the other edge, so it's always steady when it's read. If the ` +
        'two sides disagree about the mode, every bit is read while it\'s changing.', [firstBit.t0, firstBit.t1], around(w, [firstBit.t0, firstBit.t1], 1.5)),
      stop('Both directions at once', `The first clock cycles shift ${mosi[0].label} out on MOSI while ${miso[0].label} comes ` +
        `back on MISO. SPI is two shift registers joined in a ring: every bit out is also a bit in.`, firstByte, around(w, firstByte, 1)),
    ];
    if (mosi.length > 1) {
      const rest: Range = [mosi[1].t0, mosi[mosi.length - 1].t1];
      tour.push(stop('More bytes', 'The controller keeps clocking for as many bytes as it wants. CS stays low the whole time, ' +
        'so the target treats it all as one command.', rest, around(w, rest, 1)));
    }
    tour.push(stop('Chip select goes high', 'CS goes high and the transfer is over. Many chips only act on a command at this ' +
      'moment, and the target lets go of MISO.', [csUp.t0, csUp.t1], around(w, [csUp.t0, csUp.t1], 3, 1)));
    return tour;
  },

  qspi(w, p) {
    const cs = w.bits.filter((b) => b.lane === 0);
    const lanes = p.mode.split('').join('-');
    const describe = (f: Field): [string, string] | null => {
      if (f.kind === 'cmd') return ['Instruction', `${f.label}. ${p.mode === '444' ? 'In QPI mode even the instruction uses all four lines, so it takes 2 clocks.' : 'The instruction always goes out on one line, IO0, so it takes 8 clocks.'}`];
      if (f.kind === 'addr') return ['Address', `${f.label}, 24 bits. ${p.mode[1] === '4' ? 'Over four lines that takes only 6 clocks: each clock carries a nibble, IO3 holding its top bit.' : 'On one line that\'s 24 clocks.'}`];
      if (f.label === 'Mode bits') return ['Mode bits', 'Two clocks of mode bits. A special value here can tell the flash to skip the instruction on the next read.'];
      if (f.kind === 'dummy') return ['Dummy clocks', `${f.label} clocks where nobody drives the IO lines. The flash uses them to fetch the data, and the lines turn around from the controller driving them to the flash driving them.`];
      return null;
    };
    const tour: TourStop[] = [
      overview(w, 'One flash read', `A ${lanes} read: instruction on ${p.mode[0]} line${p.mode[0] === '1' ? '' : 's'}, address on ` +
        `${p.mode[1]}, data on ${p.mode[2]}. Try the other modes in Command to compare clock counts for the same bytes.`),
      stop('Chip select goes low', 'CS goes low to start a command, just like plain SPI.', [cs[0].t0, cs[0].t1], around(w, [cs[0].t0, cs[0].t1], 1, 3)),
    ];
    for (const f of mergeData(w.fields)) {
      const d = f.kind === 'data'
        ? ['Data', `The flash answers: ${f.label}. ${p.mode[2] === '4' ? 'All four lines carry data, so each byte takes just 2 clocks.' : 'On one line, IO1, each byte takes 8 clocks.'}`] as [string, string]
        : describe(f);
      if (d) tour.push(stop(d[0], d[1], [f.t0, f.t1], around(w, [f.t0, f.t1], 1)));
    }
    const up = cs[cs.length - 1];
    tour.push(stop('Chip select goes high', 'CS goes high and the read ends. As long as CS stays low, the flash keeps sending the following bytes.',
      [up.t0, up.t1], around(w, [up.t0, up.t1], 3, 1)));
    return tour;
  },

  i2c(w, p) {
    const read = p.rw !== 'w';
    const tour = busStops(w, (f) => {
      if (f.label.includes('11110')) return ['10-bit address, first byte', `${f.label}. The 11110 prefix tells 7-bit devices this isn't for them, and carries the top two address bits.`];
      if (f.label.includes('A7–A0')) return ['10-bit address, second byte', `${f.label}: the low 8 address bits. Only the one target with the full address ACKs.`];
      if (f.kind === 'addr') {
        const r = f.label.endsWith('R');
        return [`Address, ${r ? 'read' : 'write'}`, `${f.label}: the 7-bit address followed by the R/W bit. Every device compares the address with its own; ${w.bits.some((b) => b.kind === 'nack' && Math.abs(b.t0 - f.t1) < 1e-6) ? 'nobody matches, so nobody pulls SDA low (NACK).' : 'the one that matches pulls SDA low in the next clock (ACK).'}`];
      }
      if (f.kind === 'cmd') return ['Register number', `${f.label}. The controller first writes which register it wants. It doesn't send STOP afterwards, because it's about to read.`];
      return null;
    }, (b) => {
      if (b.label === 'S') return ['START', 'SDA falls while SCL is high. During data SDA only changes while SCL is low, so this pattern can only mean "a transfer is starting".'];
      if (b.label === 'Sr') return ['Repeated START', 'Another START without a STOP first. The controller keeps the bus and turns the transfer around to read.'];
      if (b.label === 'P') return ['STOP', 'SDA rises while SCL is high, the mirror image of START. The bus is free again.'];
      if (b.label === 'stretch') return ['Clock stretching', 'The target holds SCL low because it isn\'t ready. The controller let go of SCL, sees it\'s still low, and waits. Open-drain makes this possible: anyone can hold a line low.'];
      return null;
    });
    const data = w.fields.filter((f) => f.kind === 'data');
    if (data.length) {
      const r: Range = [data[0].t0, data[data.length - 1].t1 + 1];
      const at = tour.findIndex((s) => s.title === 'STOP');
      tour.splice(at, 0, stop('Data', `${data.map((f) => f.label).join(', ')}. ${read
        ? 'The target sends each byte and the controller ACKs it, except the last, which it NACKs to say "that\'s enough".'
        : 'The controller sends each byte and the target ACKs it.'}`, r, around(w, r, 1)));
    }
    const first = w.bits.find((b) => b.lane === 1 && b.label !== 'S')!;
    tour.splice(1, 0, stop('Slow rises', 'Look at the rising edges: they curve. Nobody drives the lines high; a pull-up ' +
      'resistor does, and it takes time to charge the wire. Falling edges are sharp because a device pulls the line low directly.',
    [first.t0, first.t1 + 1], around(w, [first.t0, first.t1 + 1], 1)));
    return [overview(w, 'The whole transfer', `Two shared wires. At ${+p.speed / 1000} kHz each bit takes ${time(w, 1)}, ` +
      `and this transfer takes ${time(w, w.duration)}.`), ...tour];
  },

  i3c(w, p) {
    const tour = busStops(w, (f) => {
      if (f.label.startsWith('0x7E') && f.label.endsWith('W')) return ['Broadcast address', 'The broadcast address 0x7E, sent in open-drain. Every I3C target listens. A target that wants attention could pull a bit low here and win arbitration.'];
      if (f.label.startsWith('0x7E')) return ['"Who still needs an address?"', '0x7E with R. During ENTDAA this asks the next target without an address to answer.'];
      if (f.label.includes('ENTDAA')) return ['ENTDAA', 'The command 0x07: enter dynamic address assignment. It ends with a T-bit, the odd parity I3C uses instead of an ACK.'];
      if (f.label.includes('ENTHDR0')) return ['ENTHDR0', 'The command 0x20 switches every target into HDR-DDR mode.'];
      if (f.label.startsWith('PID')) return ['Provisioned ID', `The target sends its 48-bit ID, ${f.label.slice(4)}, in open-drain. If several targets answer at once, a 0 beats a 1 on the wire, so the lowest ID wins.`];
      if (f.label.startsWith('BCR') || f.label.startsWith('DCR')) return [f.label.slice(0, 3), f.label.startsWith('BCR') ? 'Bus characteristics: whether the target can raise interrupts, its speed limits, and its HDR support.' : 'Device characteristics: a type code saying what kind of device this is.'];
      if (f.label.startsWith('Assign')) return ['Address assigned', `The controller gives the winner ${f.label.slice(7)} as its dynamic address, with an odd parity bit, and the target ACKs.`];
      if (f.label.startsWith('Command')) return ['HDR-DDR command word', 'From here on, a bit moves on every clock edge. Each 20-bit word is 2 preamble bits, 16 payload bits and 2 parity bits.'];
      if (f.label.startsWith('CRC')) return ['CRC word', 'A preamble, the token 0xC and a CRC-5 over the data words let the target check the whole message.'];
      if (f.kind === 'addr') return ['Target address', `${f.label}: the target's dynamic address, still in open-drain so devices could arbitrate. After the ACK the bus switches to push-pull.`];
      if (f.kind === 'data' && w.fields.some((x) => x.label.startsWith('Command'))) return ['HDR-DDR data', `${f.label}: 16 bits of data on 8 clocks.`];
      if (f.kind === 'data') return ['Data', `${f.label}, in push-pull: sharp edges on both sides, so it can run at 12.5 MHz. The T-bit after it is ${p.rw === 'r' ? 'the target saying whether more data follows' : 'odd parity'}, instead of an ACK.`];
      return null;
    }, (b) => {
      if (b.label === 'S') return ['START', 'The same START as I²C: SDA falls while SCL is high.'];
      if (b.label === 'Sr') return ['Repeated START', 'A START without a STOP first: the controller keeps the bus and starts the next phase.'];
      if (b.label === 'Exit') return ['HDR exit pattern', 'SCL stays low while SDA toggles four times. That never happens in HDR data, so every target recognizes it and drops back to SDR.'];
      if (b.label === 'P') return ['STOP', 'SDA rises while SCL is high. The bus is free again.'];
      return null;
    });
    const intro = p.rate === 'entdaa'
      ? 'Dynamic address assignment: the controller asks who needs an address, the lowest ID wins arbitration, and it gets one.'
      : p.rate === 'ddr'
        ? 'A switch into HDR-DDR mode, a write using both clock edges, and the exit back to normal mode.'
        : 'A private transfer: the address phase in slow open-drain, then data in fast push-pull.';
    return [overview(w, 'The whole transfer', `${intro} It takes ${time(w, w.duration)}.`), ...tour];
  },

  onewire(w) {
    const reset = w.bits.find((b) => b.kind === 'start')!;
    const presence = w.bits.find((b) => b.kind === 'ack' || b.kind === 'nack')!;
    const writes = w.bits.filter((b) => b.kind === 'cmd');
    const reads = w.bits.filter((b) => b.kind === 'data');
    const zero = writes.find((b) => valueOf(w, b) === '0');
    const one = writes.find((b) => valueOf(w, b) === '1');
    const tour: TourStop[] = [
      overview(w, 'The whole transaction', `One wire carries everything: a reset, ${plural(writes.length / 8, 'byte')} written ` +
        `${reads.length ? `and ${plural(reads.length / 8, 'byte')} read` : ''}. It takes ${time(w, w.duration)}, which is why 1-Wire is slow.`),
      stop('Reset', 'The controller holds the line low for 480 µs, far longer than any bit. Every device on the wire stops and ' +
        'gets ready for a new command.', [reset.t0, reset.t1], around(w, [reset.t0, reset.t1], 2)),
      stop(presence.kind === 'ack' ? 'Presence pulse' : 'No presence pulse', presence.kind === 'ack'
        ? 'About 30 µs after the reset, every device pulls the line low for a while. The controller checks the line 70 µs ' +
          'after letting go: low means someone is there.'
        : 'The line stays high, so no device answered. The controller stops here.',
      [presence.t0, presence.t1], around(w, [presence.t0, presence.t1], 6)),
    ];
    if (zero) tour.push(stop('Writing a 0', 'Every bit is a 70 µs slot that the controller starts with a falling edge. For a 0 it ' +
      'keeps the line low for most of the slot. The device looks about 30 µs in and sees low.', [zero.t0, zero.t1], around(w, [zero.t0, zero.t1], 2)));
    if (one) tour.push(stop('Writing a 1', 'For a 1 the controller only pulls low for a few microseconds and lets go. By the time ' +
      'the device looks, 30 µs in, the line is back high.', [one.t0, one.t1], around(w, [one.t0, one.t1], 2)));
    w.fields.filter((x) => x.kind === 'cmd').forEach((f, i) => {
      tour.push(stop(f.label, i === 0
        ? 'Zooming back out: eight of those slots make a byte, sent least significant bit first.'
        : 'The next command byte, eight more slots.', [f.t0, f.t1], around(w, [f.t0, f.t1], 3)));
    });
    if (reads.length) {
      const r = reads[0];
      tour.push(stop('Read slots', 'To read, the controller still starts every slot with a short pulse, then lets go. A device ' +
        'answering 0 keeps holding the line low; for a 1 it does nothing. The controller looks 15 µs in.', [r.t0, r.t1], around(w, [r.t0, r.t1], 2)));
      const rf = w.fields.filter((x) => x.kind === 'data');
      const rr = span(rf);
      tour.push(stop('Data read back', `${rf.map((f) => f.label).join(', ')}. For a DS18B20 after Read Scratchpad, these first ` +
        'two bytes are the temperature.', rr, around(w, rr, 3)));
    }
    return tour;
  },

  i2s(w, p) {
    const standard = p.format === 'i2s';
    const ws = w.traces[1].points;
    const fall = ws.find((x, i) => i > 0 && x.v === 0)!.t;
    const rise = ws.find((x) => x.t > fall && x.v === 1)!.t;
    const [left, right] = w.fields;
    const msb = w.bits.find((b) => b.kind === 'data')!;
    const pad = w.bits.filter((b) => b.kind === 'dummy');
    const tour: TourStop[] = [
      overview(w, 'One stereo frame', `One left sample and one right sample. At ${+p.rate / 1000} kHz that pair repeats ` +
        `${p.rate} times a second, so SCK runs at ${+(1 / w.unitTime / 1e6).toFixed(3)} MHz.`),
      stop(standard ? 'WS changes one clock early' : 'WS lines up with the data', standard
        ? 'WS falls to say "left channel next", but the left sample\'s first bit starts one clock later. That one-clock delay is what makes it standard I²S rather than left-justified.'
        : 'In left-justified format, WS changes on the same clock as the first bit of the sample.',
      [fall, msb.t1], around(w, [fall, msb.t1], 1.5, 3)),
      stop('The sign bit', 'Samples are signed and sent most significant bit first, so the very first bit is the sign: 1 means negative.',
        [msb.t0, msb.t1], around(w, [msb.t0, msb.t1], 2)),
      stop('Left sample', `${left.label}, in two's complement.`, [left.t0, left.t1], around(w, [left.t0, left.t1], 1)),
    ];
    if (pad.length) {
      const pr = span(pad.slice(0, pad.length / 2));
      tour.push(stop('Padding', `A ${p.bits}-bit sample in a 32-bit slot leaves 8 bits of zeros. Because the sample starts at ` +
        'the top, a receiver expecting fewer bits still gets the important ones.', pr, around(w, pr, 2)));
    }
    tour.push(
      stop('WS goes high: right channel', 'WS rises to say the right channel is next.', [rise, rise + 1], around(w, [rise, rise + 1], 3)),
      stop('Right sample', `${right.label}. Then WS falls again and the next frame starts with the next left sample, with no gaps, forever.`,
        [right.t0, right.t1], around(w, [right.t0, right.t1], 1)),
    );
    return tour;
  },

  jtag(w, p) {
    const runs = w.fields;
    const find = (name: string) => runs.find((f) => f.label === name);
    const idcode = parseInt(p.idcode, 16) >>> 0;
    const shiftDr = find('Shift-DR')!;
    const shiftIr = find('Shift-IR');
    const reset = runs[0];
    const tour: TourStop[] = [
      overview(w, 'The whole sequence', 'TMS steers every chip\'s 16-state TAP controller, one rising TCK edge at a time. ' +
        'The labels under TMS show which state the TAP is in on each clock.'),
      stop('Reset from anywhere', 'Five clocks with TMS high reach Test-Logic-Reset from any state, so the debugger doesn\'t ' +
        'need to know where the TAP was. Reset also loads the IDCODE instruction.', [reset.t0, reset.t1], around(w, [reset.t0, reset.t1], 1, 3)),
    ];
    const idle = runs.find((f) => f.label === 'Run-Test/Idle')!;
    const toShift = [idle.t0, (shiftIr ?? shiftDr).t0] as Range;
    tour.push(stop('Walking to Shift', `TMS = 0, then 1, 0, 0${shiftIr ? ' and one more 1' : ''} steps through ` +
      `${shiftIr ? 'Run-Test/Idle, Select-DR, Select-IR and Capture-IR into Shift-IR' : 'Run-Test/Idle, Select-DR and Capture-DR into Shift-DR'}. ` +
      'Every move is decided by TMS alone.', toShift, around(w, toShift, 1, 2)));
    if (shiftIr) {
      const r: Range = [shiftIr.t0, shiftIr.t1];
      tour.push(stop('Shift-IR: load an instruction', `4 bits go in on TDI, picking instruction 0x${p.ir.toUpperCase()}. At the same ` +
        'time the old IR comes out on TDO, ending in 01, a fixed pattern tools use to find where each chip starts in a chain. ' +
        'Update-IR makes the new instruction take effect.', r, around(w, r, 1, 3)));
    }
    const r: Range = [shiftDr.t0, shiftDr.t1];
    tour.push(stop('Shift-DR: read the IDCODE', `32 bits come out on TDO, least significant first: ${hex(idcode)}. That's ` +
      `version ${idcode >>> 28}, part number 0x${((idcode >>> 12) & 0xffff).toString(16).toUpperCase()}, manufacturer ` +
      `0x${((idcode >>> 1) & 0x7ff).toString(16).toUpperCase()} (a JEDEC code), and a final 1. TMS goes high on the last bit to leave Shift-DR.`,
    r, around(w, r, 1)));
    const end: Range = [shiftDr.t1, w.duration];
    tour.push(stop('Back to idle', 'Exit1-DR, Update-DR, and back to Run-Test/Idle, ready for the next scan.', end, around(w, end, 3, 0)));
    return tour;
  },

  swd(w, p) {
    const [req, ack, data] = w.fields;
    const trn = w.bits.filter((b) => b.label === 'Trn');
    const tour: TourStop[] = [
      overview(w, 'One SWD transaction', `A ${p.op === 'r' ? 'read' : 'write'} on two wires: a request, a turnaround, ` +
        `the target's ACK${data ? ', then 32 bits of data and a parity bit' : ''}. ${plural(Math.round(w.duration - 1.5), 'clock')} in all.`),
      stop('Request', `${req.label.split(':')[0]}: start bit, DP or AP, read or write, two address bits, parity, stop, and ` +
        'a park bit that drives the line high before the debugger lets go.', [req.t0, req.t1], around(w, [req.t0, req.t1], 1)),
      stop('Turnaround', 'For a moment nobody drives SWDIO, while the target takes over. Without this, both sides could be ' +
        'driving the wire at once.', [trn[0].t0, trn[0].t1], around(w, [trn[0].t0, trn[0].t1], 3)),
      stop(ack.label, `Three bits from the target: ${ack.label === 'ACK OK' ? 'OK, the request was accepted' : ack.label === 'ACK WAIT' ? 'WAIT, try again later' : 'FAULT, an earlier error needs clearing'}. ` +
        'The target changes SWDIO on rising edges and the debugger reads it on falling edges.', [ack.t0, ack.t1], around(w, [ack.t0, ack.t1], 2)),
    ];
    if (data) {
      tour.push(stop(p.op === 'r' ? 'Data from the target' : 'Data from the debugger', `${data.label}: 32 bits least significant ` +
        'first, then even parity.', [data.t0, data.t1], around(w, [data.t0, data.t1], 1)));
    }
    if (trn[1]) tour.push(stop('Turnaround back', 'The other direction: the target lets go and the debugger takes the line back.', [trn[1].t0, trn[1].t1], around(w, [trn[1].t0, trn[1].t1], 3)));
    // In a write the second turnaround comes before the data, so put the stops in time order.
    return [tour[0], ...tour.slice(1).sort((a, b) => a.focus![0] - b.focus![0])];
  },
};
