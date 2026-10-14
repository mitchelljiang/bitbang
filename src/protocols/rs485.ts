import type { Level, Protocol } from '../core/types';
import { TraceBuilder } from '../core/util';
import { uart } from './uart';

/**
 * RS-485 is a differential physical layer, usually carrying UART frames. Shown here as a 2-wire, half-duplex
 * transceiver: the UART's TX feeds the driver input (DI), and DE turns the driver on only while sending.
 * A is drawn non-inverting (A above B means 1), the convention most transceiver datasheets use.
 */
export const rs485: Protocol = {
  id: 'rs485',
  name: 'RS-485',
  fullName: 'Recommended Standard 485 (now TIA‑485)',
  tags: ['asynchronous', 'differential', 'push-pull', 'half duplex', 'multi-drop', 'cable'],
  summary:
    'UART frames sent over a twisted pair as a voltage difference: A above B represents a 1, and B above A represents ' +
    'a 0. Noise affects both wires equally and cancels out, so links can exceed a kilometer, and dozens of devices can ' +
    'share the pair (32 standard loads, or up to 256 with low-load transceivers). Only one device may transmit at a ' +
    'time, so each transceiver has a driver-enable (DE) pin.',
  usedIn: 'Modbus RTU in industrial systems, DMX512 stage lighting, building automation (BACnet MS/TP), solar inverters and energy meters.',
  facts: {
    clock: 'None. RS-485 usually carries UART frames, so all devices use the same baud rate.',
    wires: 'A and B as a twisted pair, plus a ground reference. Full-duplex installations use two pairs.',
    drive: 'Differential. Receivers need only a 200 mV difference between A and B. When DE is low, the driver releases the pair entirely.',
    duplex: 'Half duplex on a single pair (the common two-wire arrangement), and full duplex on two pairs.',
    topology: 'A shared bus: 32 standard loads, or up to 256 with low-load transceivers, with a 120 Ω terminating resistor at each end.',
    addressing: 'None in RS-485 itself. Protocols built on it, such as Modbus and DMX512, add addresses.',
    flow: 'None. Software must enable and disable the driver and ensure that only one device transmits at a time.',
    errors: 'None in the electrical layer. Modbus RTU adds a CRC-16 to every message.',
    speed: 'Up to about 10 Mbit/s over short distances, and roughly 100 kbit/s at the full 1200 m.',
    reach: 'Up to 1200 m (4000 ft), which is why it is common in factories and buildings.',
  },
  strengths: [
    'Long cable runs: more than a kilometer at moderate speeds.',
    'Differential signaling rejects common-mode noise and ground differences.',
    'Many devices on a single inexpensive twisted pair.',
  ],
  limits: [
    'Half duplex: incorrect driver-enable timing truncates the end of a message or collides with the reply.',
    'Requires termination and bias resistors, and long buses also need a ground reference.',
    'Defines only the electrical layer, so a higher-level protocol is still required.',
    'Manufacturers disagree about which wire is labeled A and which is labeled B.',
  ],
  deepDive: [
    {
      title: 'Termination',
      body: [
        'At higher speeds or over long cables, signals reflect from the unterminated ends of the pair. A resistor equal to the cable\'s characteristic impedance, typically 120 Ω, at each of the two ends of the bus absorbs those reflections. Termination belongs only at the two physical ends, not at every device, and branches from the main cable should be kept short. Short, slow buses often work without it.',
      ],
    },
    {
      title: 'Fail-safe biasing',
      body: [
        'When no driver is enabled, termination pulls A and B to the same voltage, a differential of 0 V that receivers cannot interpret reliably. Bias resistors, a pull-up on A and a pull-down on B, hold the idle bus at a defined state of at least +200 mV, which receivers read as 1, the UART idle level. Many modern transceivers instead provide fail-safe behavior internally.',
      ],
    },
    {
      title: 'Unit loads and device count',
      body: [
        'The standard specifies the bus in unit loads, where one unit load is a 12 kΩ receiver input, and allows 32 unit loads. Transceivers rated at 1/4 or 1/8 unit load allow 128 or 256 devices on one bus.',
      ],
    },
    {
      title: 'Controlling the driver',
      body: [
        'In half-duplex operation, firmware must enable the driver before the first start bit and disable it only after the last stop bit has left the shift register. A common error is to disable the driver on the UART\'s transmit-buffer-empty event, which occurs one character early and truncates the final byte. The correct signal is transmission complete. Many microcontroller UARTs include an RS-485 mode that drives DE automatically.',
      ],
    },
    {
      title: 'Ground and the A/B naming',
      body: [
        'RS-485 is differential, but receivers tolerate only a limited common-mode voltage, typically −7 V to +12 V, so devices still need a shared ground reference; long runs between buildings often use isolated transceivers.',
        'The TIA standard defines A as the inverting line, but many transceiver manufacturers label their pins the opposite way. If a link does not communicate, swapping A and B is a reasonable first check.',
      ],
    },
    {
      title: 'Protocols carried over RS-485',
      body: [
        'RS-485 defines only the electrical layer. Common protocols on top of it include Modbus RTU (industrial control), DMX512 (stage lighting, at 250 kbaud with 2 stop bits and a break before each packet), Profibus DP and BACnet MS/TP.',
      ],
    },
  ],
  params: uart.params,

  encode(p) {
    const w = uart.encode(p);
    const di = w.traces[0];
    di.name = 'DI';
    const end = w.duration - 0.5;
    const de = new TraceBuilder('DE', 0);
    const a = new TraceBuilder('A', 'z');
    const b = new TraceBuilder('B', 'z');
    de.set(0.5, 1);
    for (const pt of di.points) {
      const t = Math.max(pt.t, 0.5);
      a.set(t, pt.v);
      b.set(t, (pt.v === 'z' ? 'z' : 1 - pt.v) as Level);
    }
    de.set(end, 0);
    a.set(end, 'z');
    b.set(end, 'z');

    const notes = [
      ...(w.notes ?? []),
      { lane: 1, t: 0.5, text: 'DE high: driver enabled' },
      { lane: 1, t: end, text: 'DE low: driver released' },
      { lane: 2, t: 0.05, text: 'released' },
      { lane: 3, t: 1, text: 'B always mirrors A' },
    ];
    const bits = w.bits.map((bit) => ({
      ...bit,
      info: `${bit.info} On the pair, a 1 drives A above B, and a 0 drives B above A.`,
    }));
    return { ...w, traces: [di, de.trace, a.trace, b.trace], bits, notes, duration: w.duration + 0.5 };
  },
};
