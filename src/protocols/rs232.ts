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
    errors: 'Those provided by the UART framing: an optional parity bit and framing errors.',
    speed: 'Usually 9600 to 115200 baud. The original standard only promised 20 kbit/s; modern transceivers manage around 1 Mbit/s on short cables.',
    reach: 'About 15 m at moderate speeds. Longer cables work at lower baud rates.',
  },
  strengths: [
    'Large voltage swings tolerate noise far better than 3.3 V UART pins.',
    'Still everywhere on industrial and lab equipment, and USB adapters are inexpensive.',
    'Simple: in software it is an ordinary UART.',
  ],
  limits: [
    'Needs a transceiver chip. Wiring RS-232 straight to a microcontroller pin can destroy it.',
    'Single-ended, so a difference in ground voltage between the two ends shows up as errors.',
    'Point-to-point only, and slow compared to anything differential.',
    'Many connector pinouts and "null modem" cable variants to get wrong.',
  ],
  deepDive: [
    {
      title: 'DTE and DCE',
      body: [
        'RS-232 defines two device roles. Data terminal equipment (DTE), such as a computer, transmits on TxD and receives on RxD. Data circuit-terminating equipment (DCE), such as a modem, uses the same pin names from the DTE\'s perspective, so a straight-through cable connects a DTE to a DCE correctly.',
        'Connecting two DTE devices requires a null-modem cable or adapter, which crosses TxD with RxD and the handshake lines with their counterparts. A link that stays silent is very often a straight cable where a null modem was needed, or the reverse.',
      ],
    },
    {
      title: 'The DB9 connector',
      body: [
        'On a DB9 DTE connector: 1 DCD (carrier detect), 2 RxD, 3 TxD, 4 DTR (terminal ready), 5 ground, 6 DSR (set ready), 7 RTS (request to send), 8 CTS (clear to send), 9 RI (ring indicator). Many modern devices use only pins 2, 3 and 5.',
      ],
    },
    {
      title: 'The handshake lines today',
      body: [
        'RTS and CTS remain in use for hardware flow control. DTR also has a common secondary use: many development boards, including Arduino boards, connect DTR through a capacitor to the microcontroller\'s reset pin, so opening the serial port resets the board into its bootloader.',
      ],
    },
    {
      title: 'Levels and transceivers',
      body: [
        'Receivers interpret any voltage above +3 V as space (0) and below −3 V as mark (1); the region between is undefined. Drivers output between ±5 V and ±15 V. Transceivers such as the MAX232 (5 V supply) and MAX3232 (3 to 5.5 V) generate these voltages with internal charge pumps.',
        'Many inexpensive USB serial adapters provide 3.3 V or 5 V logic levels, not RS-232. Connecting one to an RS-232 port fails because of the inverted polarity and can damage the adapter because of the voltage.',
      ],
    },
    {
      title: 'Cable length',
      body: [
        'The original standard limits the load capacitance to 2500 pF, which corresponds to about 15 m of typical cable at 19.2 kbaud. Lower baud rates and low-capacitance cable allow considerably longer runs. For longer distances or multiple devices, RS-422 or RS-485 is the usual replacement.',
      ],
    },
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
