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
  tags: ['asynchronous', 'single-ended', 'push-pull', 'full duplex', 'point-to-point', 'cable'],
  summary:
    'The traditional serial port. The framing is identical to UART, but a transceiver converts the logic levels into ' +
    'larger voltages and inverts them: a 1 (called mark) is a negative voltage between −3 and −15 V, and a 0 (space) ' +
    'is positive. The large voltage swing allows the signal to tolerate several meters of electrically noisy cable.',
  usedIn: 'Laboratory instruments, CNC machines and industrial controllers, console ports on network switches, and older PCs and modems.',
  facts: {
    clock: 'None. RS-232 carries standard UART frames, so both devices must use the same baud rate.',
    wires: 'TxD, RxD and ground at minimum. A full DB9 port adds the RTS/CTS, DTR/DSR, DCD and RI handshake lines.',
    drive: 'Push-pull and bipolar: −3 to −15 V represents a 1, and +3 to +15 V a 0. Transceivers such as the MAX3232 generate these voltages from a 3.3 V or 5 V supply using charge pumps.',
    duplex: 'Full duplex. TxD and RxD are separate wires.',
    topology: 'Point-to-point: one device at each end, traditionally a computer (DTE) and a modem (DCE).',
    addressing: 'None.',
    flow: 'Hardware flow control using RTS/CTS, or software flow control using XON/XOFF characters.',
    errors: 'Those provided by the UART framing: an optional parity bit and framing errors.',
    speed: 'Usually 9600 to 115200 baud. The original standard specified only 20 kbit/s; modern transceivers reach about 1 Mbit/s on short cables.',
    reach: 'About 15 m at moderate speeds. Longer cables work at lower baud rates.',
  },
  strengths: [
    'Large voltage swings tolerate noise far better than 3.3 V logic signals.',
    'Still common on industrial and laboratory equipment, and USB adapters are inexpensive.',
    'Simple: in software it is an ordinary UART.',
  ],
  limits: [
    'Requires a transceiver chip. Connecting RS-232 directly to a microcontroller pin can damage it.',
    'Single-ended, so a difference in ground voltage between the two devices appears as errors.',
    'Point-to-point only, and slow compared with differential links.',
    'Many connector pinouts and null-modem cable variants make wiring errors common.',
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
        'The original standard limits the load capacitance to 2500 pF, which corresponds to about 15 m of typical cable at 19.2 kbaud. Lower baud rates and low-capacitance cable allow considerably longer runs. For longer distances or multiple devices, RS-422 or [RS-485](?p=rs485) is the usual replacement.',
      ],
    },
  ],
  params: [
    ...uart.params,
    {
      key: 'swing', label: 'Line voltage', help: 'The voltage on the cable. Transceivers powered from 3.3 V typically produce about ±5.5 V, and classic ports about ±12 V. Both work, because receivers accept any level beyond ±3 V.', type: 'select', default: '12',
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
      { lane: 1, t: 0.15, text: 'idle (mark): negative voltage' },
      { lane: 1, t: 1, text: 'start bit (space): positive voltage' },
    ];
    const bits = w.bits.map((b) => ({
      ...b,
      info: `${b.info} On the RS-232 line, ${b.label === 'S' ? 'this bit is a positive voltage' : 'the voltage is inverted: a 1 is negative and a 0 is positive'}.`,
    }));
    return { ...w, traces: [tx, line.trace], bits, notes };
  },
};
