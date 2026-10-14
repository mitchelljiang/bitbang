import type { Level, Protocol } from '../core/types';
import { TraceBuilder } from '../core/util';
import { uart } from './uart';

const SWINGS: Record<string, [string, string]> = {
  '5': ['−5.5 V', '+5.5 V'],
  '12': ['−12 V', '+12 V'],
};

/** RS-232 is UART framing on an inverted, bipolar line: a logic 1 is a negative voltage. */
export const rs232: Protocol = {
  id: 'rs232',
  name: 'RS-232',
  fullName: 'Recommended Standard 232 (now TIA‑232)',
  summary:
    'The old serial port. The framing is exactly UART, but a transceiver turns the logic levels into large voltages ' +
    'and inverts them: a 1 (called mark) is negative, somewhere between −3 and −15 V, and a 0 (space) is positive. ' +
    'The big swing is what lets it survive a few meters of noisy cable.',
  usedIn: 'Lab instruments, CNC machines and industrial controllers, console ports on network switches, and older PCs and modems.',
  facts: {
    clock: 'None. It carries ordinary UART frames, so both ends agree on a baud rate.',
    wires: 'TxD, RxD and ground at minimum. A full DB9 port adds RTS/CTS, DTR/DSR, DCD and RI handshake lines.',
    drive: 'Push-pull and bipolar: −3 to −15 V is a 1 and +3 to +15 V is a 0. Chips like the MAX3232 make those voltages from a 3.3 or 5 V supply with charge pumps.',
    duplex: 'Full duplex. TxD and RxD are separate wires.',
    topology: 'Point-to-point. One device on each end, traditionally a computer (DTE) and a modem (DCE).',
    addressing: 'None.',
    flow: 'Hardware flow control on RTS/CTS, or software XON/XOFF characters.',
    errors: 'Whatever the UART framing has: an optional parity bit and framing errors.',
    speed: 'Usually 9600 to 115200 baud. The original standard only promised 20 kbit/s; modern transceivers manage around 1 Mbit/s on short cables.',
    reach: 'About 15 m at moderate speeds. Longer cables work at lower baud rates.',
  },
  strengths: [
    'Large voltage swings tolerate noise far better than 3.3 V UART pins.',
    'Still everywhere on industrial and lab equipment, and USB adapters are cheap.',
    'Simple: the software side is just a UART.',
  ],
  limits: [
    'Needs a transceiver chip. Wiring RS-232 straight to a microcontroller pin can destroy it.',
    'Single-ended, so a difference in ground voltage between the two ends shows up as errors.',
    'Point-to-point only, and slow compared to anything differential.',
    'Many connector pinouts and "null modem" cable variants to get wrong.',
  ],
  params: [
    ...uart.params,
    {
      key: 'swing', label: 'Line voltage', type: 'select', default: '12',
      options: [{ value: '5', label: '±5.5 V (3.3 V transceiver)' }, { value: '12', label: '±12 V (classic)' }],
    },
  ],

  encode(p) {
    const w = uart.encode(p);
    const tx = w.traces[0];
    tx.name = 'TX';
    tx.levels = ['0 V', '3.3 V'];
    const line = new TraceBuilder('TxD', 0);
    line.trace.levels = SWINGS[p.swing] ?? SWINGS['12'];
    for (const pt of tx.points) line.set(pt.t, (pt.v === 'z' ? 'z' : 1 - pt.v) as Level);

    const notes = [
      ...(w.notes ?? []),
      { lane: 1, t: 0.15, text: 'idle (mark) is negative' },
      { lane: 1, t: 1, text: 'start bit (space): positive' },
    ];
    const bits = w.bits.map((b) => ({
      ...b,
      info: `${b.info} On the RS-232 wire this is ${b.label === 'S' ? 'positive' : 'the inverse voltage: a 1 is negative and a 0 is positive'}.`,
    }));
    return { ...w, traces: [tx, line.trace], bits, notes };
  },
};
