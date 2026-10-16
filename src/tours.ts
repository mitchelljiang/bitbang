/**
 * Walkthroughs for each protocol, built from the finished waveform so they follow whatever settings are chosen.
 * (10BASE-T builds its own inside its encoder.)
 */
import type { Bit, Field, TourStop, Waveform } from './core/types';
import { formatTime, hex, levelAt } from './core/util';

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

const valueOf = (w: Waveform, b: Bit) => (b.sample === undefined ? '?' : String(levelAt(w.traces[b.lane], b.sample + 1e-9)));

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
    overview(w, 'Overview',
      `${plural(all.length, 'byte')}, each transmitted as an independent frame. At ${p.baud} baud, one bit period is ` +
      `${time(w, 1)}; the complete transfer takes ${time(w, w.duration)}.`),
    stop('Idle state', 'Between frames, the line is held at logic high. The receiver monitors the line for a falling edge.',
      [0, startBit.t0], around(w, [0, startBit.t1], 0, 3)),
    stop('Start bit', 'The transmitter drives the line low for one bit period. This falling edge is the receiver\'s only ' +
      'timing reference: it starts an internal timer at the edge and measures every subsequent bit period from it.',
    [startBit.t0, startBit.t1], around(w, [startBit.t0, startBit.t1], 2, 4)),
    stop('Data bits', `${plural(data.length, 'data bit')} carrying ${field.label}, transmitted least significant bit first. ` +
      `The resulting bit sequence on the line is ${sent}.`, span(data), around(w, span(data), 1)),
    stop('Sampling point', 'The receiver samples each bit at the center of its period, marked by the dots. Sampling at the ' +
      'center provides the greatest margin against clock mismatch: the sample remains within the correct bit until the ' +
      'accumulated drift approaches half a bit period by the end of the frame.', [data[0].t0, data[0].t1], around(w, [data[0].t0, data[0].t1], 1.5)),
  ];
  if (parity) {
    tour.push(stop('Parity bit', `${p.parity === 'even' ? 'Even' : 'Odd'} parity: this bit makes the total number of 1s in ` +
      `the data and parity bits ${p.parity}. A single-bit error changes that count, and the receiver reports a parity error.`,
    [parity.t0, parity.t1], around(w, [parity.t0, parity.t1], 4, 3)));
  }
  tour.push(stop(stops.length > 1 ? 'Stop bits' : 'Stop bit', 'The line returns to logic high for at least one bit period. ' +
    'This guarantees that the next start bit produces a falling edge, regardless of the last data bit. If the receiver ' +
    'samples a 0 here, it reports a framing error, which typically indicates mismatched baud rates.', span(stops), around(w, span(stops), 4, 2)));
  if (all.length > 1) {
    tour.push(stop('Subsequent frame', 'Each byte is a complete frame with its own start bit, so the receiver resynchronizes ' +
      'on every byte. The two clocks therefore only need to agree over a span of about ten bits.', span(all[1]), around(w, span(all[1]), 2)));
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
      overview(w, 'Logic level and line level', 'The upper trace is the UART TX output at logic levels. The lower trace is ' +
        'the RS-232 line driven by the transceiver: the same frame, inverted and at much larger voltages.'),
      stop('Idle state (mark)', 'A UART idles at logic high, so the RS-232 line idles at a negative voltage. RS-232 refers to ' +
        'this state as mark, representing a 1.', [0, startBit.t0], around(w, [0, startBit.t1], 0, 3)),
      stop('Start bit (space)', 'The start bit is a 0, which RS-232 calls space and transmits as a positive voltage. The ' +
        'receiving transceiver inverts it again, so the remote UART receives a standard falling edge.',
      [startBit.t0, startBit.t1], around(w, [startBit.t0, startBit.t1], 2, 4)),
      ...base.slice(3, 4),
      stop('Voltage swing', `The line swings between ${w.traces[1].levels?.[0]} and ${w.traces[1].levels?.[1]}, and receivers ` +
        'accept any level beyond ±3 V. Noise coupled into a cable several meters long is small relative to that margin, ' +
        'which allows RS-232 to operate over longer distances than logic-level signals.', null, [0, w.duration]),
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
      overview(w, 'Overview', 'DI is the UART TX output feeding the transceiver. DE enables and disables the transceiver\'s ' +
        'driver. A and B are the two conductors of the twisted pair.'),
      stop('Bus released', 'While DE is low, the driver output is high-impedance and no device drives the pair. Fail-safe ' +
        'bias resistors, where present, hold the pair at a defined idle level, shown here at mid-level.', [0, on], around(w, [0, on], 0, 2)),
      stop('Driver enabled', 'DE is asserted shortly before the first bit, so the pair is already driven to the idle state ' +
        '(A above B) when the start bit begins.', [on, startBit.t0], around(w, [on, startBit.t1], 1, 2)),
      stop('Differential signaling', 'Each bit drives A and B in opposite directions, and the receiver evaluates only the ' +
        'difference between them. Noise that couples equally onto both conductors is rejected, which allows RS-485 links ' +
        'to exceed one kilometer.', [startBit.t0, startBit.t1 + 8], around(w, [startBit.t0, startBit.t1 + 8], 1)),
      ...base.slice(3, 4),
      stop('Driver disabled', 'After the final stop bit, DE is deasserted and the driver releases the bus so that another ' +
        'device can respond. Disabling it too early truncates the last byte; disabling it too late causes contention with ' +
        'the response.', [off - 1, off], around(w, [off - 1, off], 4, 2)),
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
      overview(w, 'Overview', `${plural(mosi.length, 'byte')} in each direction over ${mosi.length * 8} clock cycles. At this ` +
        `clock rate, one period is ${time(w, 1)}; the complete transfer takes ${time(w, w.duration)}.`),
      stop('Chip select asserted', 'The controller selects a single target by driving its CS line low. All other targets ' +
        'ignore the clock and keep MISO in a high-impedance state.', [csDown.t0, csDown.t1], around(w, [csDown.t0, csDown.t1], 1, 3)),
      stop(`Mode ${mode}: sampling edge`, `In mode ${mode}, the clock idles ${cpol ? 'high' : 'low'} and both devices sample ` +
        `data on the ${edge} edge, marked by the dots. Data changes on the opposite edge, so it is stable whenever it is ` +
        'sampled. If the two devices are configured for different modes, bits are sampled while they are changing.',
      [firstBit.t0, firstBit.t1], around(w, [firstBit.t0, firstBit.t1], 1.5)),
      stop('Full-duplex transfer', `During the first eight clock cycles, ${mosi[0].label} is shifted out on MOSI while ` +
        `${miso[0].label} is shifted in on MISO. The two shift registers form a ring, so every bit transmitted is matched ` +
        'by a bit received.', firstByte, around(w, firstByte, 1)),
    ];
    if (mosi.length > 1) {
      const rest: Range = [mosi[1].t0, mosi[mosi.length - 1].t1];
      tour.push(stop('Additional bytes', 'The controller continues clocking for as many bytes as the transaction requires. ' +
        'CS remains low throughout, so the target treats the sequence as a single command.', rest, around(w, rest, 1)));
    }
    tour.push(stop('Chip select deasserted', 'CS returns high, ending the transaction. Many devices execute the received ' +
      'command at this edge, and the target releases MISO.', [csUp.t0, csUp.t1], around(w, [csUp.t0, csUp.t1], 3, 1)));
    return tour;
  },

  qspi(w, p) {
    const cs = w.bits.filter((b) => b.lane === 0);
    const lanes = p.mode.split('').join('-');
    const describe = (f: Field): [string, string] | null => {
      if (f.kind === 'cmd') return ['Instruction', `${f.label}. ${p.mode === '444' ? 'In QPI mode, the instruction is also transferred over all four lines and requires 2 clock cycles.' : 'The instruction is transferred on IO0 alone and requires 8 clock cycles.'}`];
      if (f.kind === 'addr') return ['Address', `${f.label}, 24 bits. ${p.mode[1] === '4' ? 'Over four lines, the address requires 6 clock cycles; each cycle carries one nibble, with IO3 holding the most significant bit.' : 'Over a single line, the address requires 24 clock cycles.'}`];
      if (f.label === 'Mode bits') return ['Mode bits', 'Two clock cycles of mode bits. On many devices, a specific value here enables continuous read mode, in which the next read omits the instruction.'];
      if (f.kind === 'dummy') return ['Dummy cycles', `${f.label} cycles during which no device drives the IO lines. The flash uses this time to access its memory array, and the lines turn around from controller-driven to flash-driven.`];
      return null;
    };
    const tour: TourStop[] = [
      overview(w, 'Overview', `A ${lanes} read: the instruction uses ${p.mode[0]} line${p.mode[0] === '1' ? '' : 's'}, the ` +
        `address ${p.mode[1]}, and the data ${p.mode[2]}. Selecting other commands shows how the clock count changes for the same data.`),
      stop('Chip select asserted', 'CS is driven low to begin a command, as in standard SPI.', [cs[0].t0, cs[0].t1], around(w, [cs[0].t0, cs[0].t1], 1, 3)),
    ];
    for (const f of mergeData(w.fields)) {
      const d = f.kind === 'data'
        ? ['Data', `The flash returns ${f.label}. ${p.mode[2] === '4' ? 'All four lines carry data, so each byte requires 2 clock cycles.' : 'Data is returned on IO1 alone, so each byte requires 8 clock cycles.'}`] as [string, string]
        : describe(f);
      if (d) tour.push(stop(d[0], d[1], [f.t0, f.t1], around(w, [f.t0, f.t1], 1)));
    }
    const up = cs[cs.length - 1];
    tour.push(stop('Chip select deasserted', 'CS returns high, ending the read. While CS remains low, the flash continues to ' +
      'output data from consecutive addresses.', [up.t0, up.t1], around(w, [up.t0, up.t1], 3, 1)));
    return tour;
  },

  i2c(w, p) {
    const read = p.rw !== 'w';
    const tour = busStops(w, (f) => {
      if (f.label.includes('11110')) return ['10-bit address, first byte', `${f.label}. The reserved 11110 prefix excludes all 7-bit devices, and the byte carries the two most significant address bits.`];
      if (f.label.includes('A7–A0')) return ['10-bit address, second byte', `${f.label}: the eight least significant address bits. Only the target with the complete matching address acknowledges.`];
      if (f.kind === 'addr') {
        const r = f.label.endsWith('R');
        return [`Address (${r ? 'read' : 'write'})`, `${f.label}: the 7-bit address followed by the R/W bit. Each device compares the address with its own; ${w.bits.some((b) => b.kind === 'nack' && Math.abs(b.t0 - f.t1) < 1e-6) ? 'no device matches, so SDA remains high during the acknowledge bit (NACK).' : 'the matching device drives SDA low during the following clock cycle (ACK).'}`];
      }
      if (f.kind === 'cmd') return ['Register address', `${f.label}. The controller first writes the address of the register to be read. It does not issue a STOP, because a read follows immediately.`];
      return null;
    }, (b) => {
      if (b.label === 'S') return ['START condition', 'SDA falls while SCL is high. Because SDA changes only while SCL is low during data transfer, this condition uniquely marks the beginning of a transaction.'];
      if (b.label === 'Sr') return ['Repeated START', 'A START condition without a preceding STOP. The controller retains ownership of the bus and changes the transfer direction to read.'];
      if (b.label === 'P') return ['STOP condition', 'SDA rises while SCL is high, the inverse of the START condition. The bus is released.'];
      if (b.label === 'stretch') return ['Clock stretching', 'The target holds SCL low until it is ready to continue. The controller releases SCL, detects that the line remains low, and waits. This is possible because the bus is open-drain: any device can hold a line low.'];
      return null;
    });
    const data = w.fields.filter((f) => f.kind === 'data');
    if (data.length) {
      const r: Range = [data[0].t0, data[data.length - 1].t1 + 1];
      const at = tour.findIndex((s) => s.title === 'STOP condition');
      tour.splice(at, 0, stop('Data', `${data.map((f) => f.label).join(', ')}. ${read
        ? 'The target transmits each byte and the controller acknowledges it, except for the final byte, which the controller NACKs to end the read.'
        : 'The controller transmits each byte and the target acknowledges it.'}`, r, around(w, r, 1)));
    }
    const first = w.bits.find((b) => b.lane === 1 && b.label !== 'S')!;
    tour.splice(1, 0, stop('Rise time', 'The rising edges follow an RC curve. No device drives the lines high; the pull-up ' +
      'resistors charge the bus capacitance, which takes time. Falling edges are sharp because a device pulls the line ' +
      'low directly.', [first.t0, first.t1 + 1], around(w, [first.t0, first.t1 + 1], 1)));
    return [overview(w, 'Overview', `Two shared, open-drain lines. At ${+p.speed / 1000} kHz, one bit period is ` +
      `${time(w, 1)}; this transaction takes ${time(w, w.duration)}.`), ...tour];
  },

  i3c(w, p) {
    const tour = busStops(w, (f) => {
      if (f.label.startsWith('0x7E') && f.label.endsWith('W')) return ['Broadcast address', 'The broadcast address 0x7E, transmitted in open-drain mode. All I3C targets receive it, and a target requesting attention can win arbitration here by driving a bit low.'];
      if (f.label.startsWith('0x7E')) return ['Address request', '0x7E with R. During ENTDAA, this requests that the next target without a dynamic address respond.'];
      if (f.label.includes('ENTDAA')) return ['ENTDAA', 'Command code 0x07: enter dynamic address assignment. The byte is followed by a T-bit, the odd parity bit that I3C uses in place of an acknowledge.'];
      if (f.label.includes('ENTHDR0')) return ['ENTHDR0', 'Command code 0x20 switches all targets into HDR-DDR mode.'];
      if (f.label.startsWith('PID')) return ['Provisioned ID', `The target transmits its 48-bit Provisioned ID, ${f.label.slice(4)}, in open-drain mode. If several targets respond simultaneously, a 0 overrides a 1 on the bus, so the lowest ID wins arbitration.`];
      if (f.label.startsWith('BCR') || f.label.startsWith('DCR')) return [f.label.slice(0, 3), f.label.startsWith('BCR') ? 'Bus Characteristics Register: indicates interrupt capability, speed limitations and HDR support.' : 'Device Characteristics Register: a type code identifying the class of device.'];
      if (f.label.startsWith('Assign')) return ['Dynamic address assignment', `The controller assigns ${f.label.slice(7)} to the winning target as its dynamic address, followed by an odd parity bit. The target acknowledges.`];
      if (f.label.startsWith('Command')) return ['HDR-DDR command word', 'From this point, data is transferred on both clock edges. Each 20-bit word consists of 2 preamble bits, 16 payload bits and 2 parity bits.'];
      if (f.label.startsWith('CRC')) return ['CRC word', 'A preamble, the token 0xC and a CRC-5 computed over the data words allow the target to verify the complete message.'];
      if (f.kind === 'addr') return ['Target address', `${f.label}: the target's dynamic address, still in open-drain mode to permit arbitration. After the acknowledge, the bus switches to push-pull.`];
      if (f.kind === 'data' && w.fields.some((x) => x.label.startsWith('Command'))) return ['HDR-DDR data word', `${f.label}: 16 data bits in 8 clock cycles.`];
      if (f.kind === 'data') return ['Data', `${f.label}, transmitted in push-pull mode. Both edges are actively driven, which supports a 12.5 MHz clock. The following T-bit ${p.rw === 'r' ? 'indicates whether the target has more data' : 'carries odd parity'} in place of an acknowledge.`];
      return null;
    }, (b) => {
      if (b.label === 'S') return ['START condition', 'Identical to I²C: SDA falls while SCL is high.'];
      if (b.label === 'Sr') return ['Repeated START', 'A START condition without a preceding STOP. The controller retains the bus and begins the next phase.'];
      if (b.label === 'Exit') return ['HDR exit pattern', 'SCL is held low while SDA toggles four times. This pattern cannot occur in HDR data, so all targets recognize it and return to SDR mode.'];
      if (b.label === 'P') return ['STOP condition', 'SDA rises while SCL is high. The bus is released.'];
      return null;
    });
    const intro = p.rate === 'entdaa'
      ? 'Dynamic address assignment: the controller requests a response from any target without an address, the lowest ID wins arbitration, and that target receives an address.'
      : p.rate === 'ddr'
        ? 'Entry into HDR-DDR mode, a write transferred on both clock edges, and the exit back to SDR mode.'
        : 'A private transfer: the address phase in open-drain mode, followed by data in push-pull mode.';
    return [overview(w, 'Overview', `${intro} Duration: ${time(w, w.duration)}.`), ...tour];
  },

  onewire(w) {
    const reset = w.bits.find((b) => b.kind === 'start')!;
    const presence = w.bits.find((b) => b.kind === 'ack' || b.kind === 'nack')!;
    const writes = w.bits.filter((b) => b.kind === 'cmd');
    const reads = w.bits.filter((b) => b.kind === 'data');
    const zero = writes.find((b) => valueOf(w, b) === '0');
    const one = writes.find((b) => valueOf(w, b) === '1');
    const tour: TourStop[] = [
      overview(w, 'Overview', `A single line carries the entire transaction: a reset, ${plural(writes.length / 8, 'byte')} ` +
        `written${reads.length ? ` and ${plural(reads.length / 8, 'byte')} read` : ''}. Duration: ${time(w, w.duration)}.`),
      stop('Reset pulse', 'The controller holds the line low for at least 480 µs, considerably longer than any data slot. All ' +
        'devices on the bus reset their state and prepare for a new command.', [reset.t0, reset.t1], around(w, [reset.t0, reset.t1], 2)),
      stop(presence.kind === 'ack' ? 'Presence pulse' : 'No presence pulse', presence.kind === 'ack'
        ? 'Approximately 30 µs after the reset, each device drives the line low for 60 to 240 µs. The controller samples ' +
          'the line 70 µs after releasing it; a low level indicates that at least one device is present.'
        : 'The line remains high when the controller samples it, indicating that no device is present. The transaction ends here.',
      [presence.t0, presence.t1], around(w, [presence.t0, presence.t1], 6)),
    ];
    if (zero) tour.push(stop('Write 0 slot', 'Each bit occupies a 70 µs time slot initiated by a falling edge from the ' +
      'controller. To write a 0, the controller holds the line low for most of the slot. The device samples approximately ' +
      '30 µs into the slot and reads a low level.', [zero.t0, zero.t1], around(w, [zero.t0, zero.t1], 2)));
    if (one) tour.push(stop('Write 1 slot', 'To write a 1, the controller drives the line low for only a few microseconds ' +
      'before releasing it. By the time the device samples, the line has returned high.', [one.t0, one.t1], around(w, [one.t0, one.t1], 2)));
    w.fields.filter((x) => x.kind === 'cmd').forEach((f, i) => {
      tour.push(stop(f.label, i === 0
        ? 'Eight time slots form one byte, transmitted least significant bit first.'
        : 'The next command byte, in eight further time slots.', [f.t0, f.t1], around(w, [f.t0, f.t1], 3)));
    });
    if (reads.length) {
      const r = reads[0];
      tour.push(stop('Read slots', 'For a read, the controller initiates each slot with a brief low pulse and then releases ' +
        'the line. To return a 0, the device continues to hold the line low; to return a 1, it leaves the line released. ' +
        'The controller samples approximately 15 µs into the slot.', [r.t0, r.t1], around(w, [r.t0, r.t1], 2)));
      const rf = w.fields.filter((x) => x.kind === 'data');
      const rr = span(rf);
      tour.push(stop('Data read', `${rf.map((f) => f.label).join(', ')}. For a DS18B20 responding to Read Scratchpad, the ` +
        'first two bytes contain the temperature.', rr, around(w, rr, 3)));
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
      overview(w, 'Overview', `One stereo frame: a left-channel sample followed by a right-channel sample. At ` +
        `${+p.rate / 1000} kHz, this frame repeats ${p.rate} times per second, and SCK runs at ${+(1 / w.unitTime / 1e6).toFixed(3)} MHz.`),
      stop(standard ? 'Word select timing' : 'Word select alignment', standard
        ? 'WS falls to indicate the left channel, but the most significant bit of the left sample begins one clock cycle later. This one-cycle delay distinguishes standard I²S from the left-justified format.'
        : 'In the left-justified format, WS changes on the same clock cycle as the most significant bit of the sample.',
      [fall, msb.t1], around(w, [fall, msb.t1], 1.5, 3)),
      stop('Sign bit', 'Samples are signed two\'s complement values transmitted most significant bit first, so the first bit ' +
        'of each sample is the sign bit; a 1 indicates a negative value.', [msb.t0, msb.t1], around(w, [msb.t0, msb.t1], 2)),
      stop('Left-channel sample', `${left.label}, in two's complement.`, [left.t0, left.t1], around(w, [left.t0, left.t1], 1)),
    ];
    if (pad.length) {
      const pr = span(pad.slice(0, pad.length / 2));
      tour.push(stop('Padding', `A ${p.bits}-bit sample in a 32-bit slot leaves 8 trailing bits, transmitted as zeros. ` +
        'Because each sample is aligned to the most significant bit, a receiver configured for a shorter word length still ' +
        'receives the most significant bits correctly.', pr, around(w, pr, 2)));
    }
    tour.push(
      stop('Right channel', 'WS rises to indicate the right channel.', [rise, rise + 1], around(w, [rise, rise + 1], 3)),
      stop('Right-channel sample', `${right.label}. WS then falls again, and the next frame begins immediately with the ` +
        'following left-channel sample. The stream is continuous.', [right.t0, right.t1], around(w, [right.t0, right.t1], 1)),
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
      overview(w, 'Overview', 'TMS controls the 16-state TAP controller in every device, advancing one state on each ' +
        'rising edge of TCK. The labels below TMS show the current TAP state for each clock cycle.'),
      stop('TAP reset', 'Five clock cycles with TMS high place the TAP in Test-Logic-Reset from any starting state, so the ' +
        'debugger does not need to know the previous state. Reset also loads the IDCODE instruction.', [reset.t0, reset.t1], around(w, [reset.t0, reset.t1], 1, 3)),
    ];
    const idle = runs.find((f) => f.label === 'Run-Test/Idle')!;
    const toShift = [idle.t0, (shiftIr ?? shiftDr).t0] as Range;
    tour.push(stop('State transitions', `The TMS sequence 0, 1, 0, 0${shiftIr ? ', 1' : ''} moves the TAP through ` +
      `${shiftIr ? 'Run-Test/Idle, Select-DR, Select-IR and Capture-IR to Shift-IR' : 'Run-Test/Idle, Select-DR and Capture-DR to Shift-DR'}. ` +
      'Each transition is determined by TMS alone.', toShift, around(w, toShift, 1, 2)));
    if (shiftIr) {
      const r: Range = [shiftIr.t0, shiftIr.t1];
      tour.push(stop('Instruction register scan', `Four bits are shifted in on TDI, selecting instruction 0x${p.ir.toUpperCase()}. ` +
        'Simultaneously, the captured IR value is shifted out on TDO, ending in the fixed pattern 01, which tools use to ' +
        'locate each device in a chain. The new instruction takes effect in Update-IR.', r, around(w, r, 1, 3)));
    }
    const r: Range = [shiftDr.t0, shiftDr.t1];
    tour.push(stop('Data register scan: IDCODE', `32 bits are shifted out on TDO, least significant bit first: ${hex(idcode)}. ` +
      `Decoded: version ${idcode >>> 28}, part number 0x${((idcode >>> 12) & 0xffff).toString(16).toUpperCase()}, ` +
      `manufacturer 0x${((idcode >>> 1) & 0x7ff).toString(16).toUpperCase()} (JEDEC JEP106 code), and a mandatory 1 in ` +
      'bit 0. TMS is high on the final bit to exit Shift-DR.', r, around(w, r, 1)));
    const end: Range = [shiftDr.t1, w.duration];
    tour.push(stop('Return to idle', 'The TAP passes through Exit1-DR and Update-DR and returns to Run-Test/Idle, ready for ' +
      'the next scan.', end, around(w, end, 3, 0)));
    return tour;
  },

  swd(w, p) {
    const [req, ack, data] = w.fields;
    const trn = w.bits.filter((b) => b.label === 'Trn');
    const tour: TourStop[] = [
      overview(w, 'Overview', `A single ${p.op === 'r' ? 'read' : 'write'} transaction: an 8-bit request, a turnaround, ` +
        `a 3-bit acknowledge${data ? ', 32 data bits and a parity bit' : ''}. Total: ${plural(Math.round(w.duration - 1.5), 'clock cycle')}.`),
      stop('Request', `${req.label.split(':')[0]}: start bit, APnDP, RnW, address bits A[2] and A[3], parity, stop bit, and ` +
        'a park bit that drives the line high before the debugger releases it.', [req.t0, req.t1], around(w, [req.t0, req.t1], 1)),
      stop('Turnaround', 'For one cycle, no device drives SWDIO while control passes to the target. The turnaround ' +
        'prevents both devices from driving the line simultaneously.', [trn[0].t0, trn[0].t1], around(w, [trn[0].t0, trn[0].t1], 3)),
      stop('Acknowledge', `Three bits from the target: ${ack.label === 'ACK OK' ? 'OK, the request was accepted' : ack.label === 'ACK WAIT' ? 'WAIT, the request should be retried' : 'FAULT, a previous error must be cleared'}. ` +
        'The target changes SWDIO on rising edges, and the debugger samples it on falling edges.', [ack.t0, ack.t1], around(w, [ack.t0, ack.t1], 2)),
    ];
    if (data) {
      tour.push(stop(p.op === 'r' ? 'Read data' : 'Write data', `${data.label}: 32 bits, least significant bit first, ` +
        'followed by an even parity bit.', [data.t0, data.t1], around(w, [data.t0, data.t1], 1)));
    }
    if (trn[1]) tour.push(stop('Turnaround', 'Control of SWDIO passes back to the debugger.', [trn[1].t0, trn[1].t1], around(w, [trn[1].t0, trn[1].t1], 3)));
    // In a write the second turnaround comes before the data, so put the stops in time order.
    return [tour[0], ...tour.slice(1).sort((a, b) => a.focus![0] - b.focus![0])];
  },
};
