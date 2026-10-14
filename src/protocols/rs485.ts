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
  summary:
    'UART frames sent over a twisted pair as a difference in voltage: A above B is a 1, B above A is a 0. Noise ' +
    'hits both wires equally and cancels out, so it runs for over a kilometer, and up to 32 devices can share the ' +
    'pair. Only one may drive it at a time, so each transceiver has a driver-enable (DE) pin.',
  usedIn: 'Modbus RTU in factories, DMX512 stage lighting, building automation (BACnet MS/TP), solar inverters and energy meters.',
  facts: {
    clock: 'None. It usually carries UART frames, so both ends agree on a baud rate.',
    wires: 'A and B as a twisted pair, plus a ground reference. Full-duplex setups use two pairs.',
    drive: 'Differential. Receivers only need a 200 mV difference between A and B. When DE is low the driver lets go of the pair completely.',
    duplex: 'Half duplex on one pair (the common 2-wire setup), full duplex on two pairs.',
    topology: 'Multi-drop bus: 32 standard loads, or up to 256 with low-load transceivers, with a 120 Ω terminator at each end.',
    addressing: 'None in RS-485 itself. Protocols on top of it, like Modbus or DMX512, add addresses.',
    flow: 'None. Software has to switch DE on and off and make sure only one device talks at a time.',
    errors: 'None in the physical layer. Modbus RTU adds a CRC-16 to every message.',
    speed: 'Up to about 10 Mbit/s over short runs, and roughly 100 kbit/s at the full 1200 m.',
    reach: 'Up to 1200 m (4000 ft), which is why it shows up in factories and buildings.',
  },
  strengths: [
    'Long cables: over a kilometer at moderate speeds.',
    'Differential signaling shrugs off noise and ground differences.',
    'Many devices on one cheap twisted pair.',
  ],
  limits: [
    'Half duplex: getting the DE timing wrong cuts off the end of a message or collides with the reply.',
    'Needs termination and bias resistors, and long buses need a ground reference too.',
    'It\'s only an electrical standard, so you still need a protocol on top.',
    'Vendors disagree about which wire is called A and which is B.',
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
      { lane: 1, t: 0.5, text: 'DE high: driver on' },
      { lane: 1, t: end, text: 'DE low: let go' },
      { lane: 2, t: 0.05, text: 'released' },
      { lane: 3, t: 1, text: 'B is always the mirror of A' },
    ];
    const bits = w.bits.map((bit) => ({
      ...bit,
      info: `${bit.info} On the pair, a 1 means A is driven above B and a 0 means B is above A.`,
    }));
    return { ...w, traces: [di, de.trace, a.trace, b.trace], bits, notes, duration: w.duration + 0.5 };
  },
};
