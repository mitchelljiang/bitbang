import type { Bit, Field, Note, Protocol, TourStop } from '../core/types';
import { TraceBuilder, hex } from '../core/util';
import { FRAME_PARAMS, buildFrame } from './ethcommon';

const IDLE = 3;

/**
 * MII and RMII: the transmit side of the interface between a microcontroller's Ethernet controller (the MAC) and the
 * PHY chip that drives the cable, at 100 Mbit/s. MII sends a nibble per 25 MHz clock, RMII two bits per 50 MHz clock.
 */
export const mii: Protocol = {
  id: 'rmii',
  name: 'MII and RMII',
  fullName: 'Media Independent Interface, and Reduced MII',
  tags: ['synchronous', 'single-ended', 'push-pull', 'full duplex', 'point-to-point', 'chip-to-chip', 'networking', 'parallel'],
  summary:
    'A microcontroller’s Ethernet controller does not drive the cable itself. It hands the [Ethernet frame](?p=ethframe) ' +
    'to a PHY chip, which turns it into [100BASE-TX](?p=100base) or [10BASE-T](?p=ethernet) on the cable. MII is the ' +
    'parallel interface between the two: 4 data bits per 25 MHz clock at 100 Mbit/s. RMII, the reduced version most ' +
    'microcontrollers use, sends 2 bits per 50 MHz clock on fewer pins. Both carry the frame’s bytes, preamble included, ' +
    'with an enable signal around them.',
  usedIn: 'STM32, i.MX RT, ESP32 and most other microcontrollers with Ethernet, connected to PHYs such as the LAN8720, DP83848 and KSZ8081.',
  facts: {
    clock: 'Synchronous. MII: the PHY drives TX_CLK at 25 MHz. RMII: one 50 MHz REF_CLK, from an oscillator or the PHY, shared by both chips. Data is sampled on the rising edge.',
    wires: 'MII: TXD0–TXD3, TX_EN and TX_CLK to transmit, the same again to receive, plus collision and carrier sense: 16 pins. RMII: TXD0–TXD1, TX_EN, RXD0–RXD1, CRS_DV and REF_CLK: 7 pins. Both add MDC and MDIO for configuration.',
    drive: 'Single-ended 3.3 V logic, push-pull, over a few centimetres of board trace.',
    duplex: 'Full duplex: separate transmit and receive signals.',
    topology: 'Point-to-point: one MAC to one PHY. The MDIO management bus alone can reach up to 32 PHYs.',
    addressing: 'None on the data lines. MDIO uses a 5-bit PHY address and a 5-bit register number.',
    flow: 'None; TX_EN marks each frame, and the PHY keeps up at the line rate.',
    errors: 'None added. The frame’s CRC-32 travels through unchanged, and the PHY can flag a receive error on RX_ER.',
    speed: '100 Mbit/s: 4 bits × 25 MHz (MII) or 2 bits × 50 MHz (RMII). At 10 Mbit/s, MII’s clock slows to 2.5 MHz, while RMII keeps 50 MHz and holds each bit pair for 10 cycles.',
    reach: 'A few centimetres to a few tens of centimetres of board trace.',
  },
  strengths: [
    'Media independent, as the name says: the same controller works with any PHY, for copper or fiber.',
    'RMII needs only 7 pins for 100 Mbit/s, which is why it is the default on microcontrollers.',
    'Carries the frame as plain bytes, easy to probe with a logic analyzer.',
  ],
  limits: [
    'RMII’s 50 MHz clock needs careful board layout, and both chips must share it.',
    'Limited to 100 Mbit/s; gigabit needs RGMII (4 bits on both clock edges at 125 MHz) or SGMII.',
    'Only for short distances on one board.',
  ],
  legend: { start: 'preamble / SFD', addr: 'MAC address', cmd: 'EtherType', dummy: 'padding', parity: 'CRC-32' },
  deepDive: [
    {
      title: 'MDIO: configuring the PHY',
      body: [
        'Besides the data signals, two pins, MDC (a clock) and MDIO (data), let the controller read and write the PHY’s registers: start autonegotiation, read the link status, set the speed. Each transaction is a 32-bit preamble of 1s, then the operation, a 5-bit PHY address, a 5-bit register number and 16 bits of data. Register 1 bit 2 is the standard “link up” bit that network drivers poll.',
      ],
    },
    {
      title: 'The receive side',
      body: [
        'Receiving mirrors transmitting: the PHY drives RXD with RX_DV (MII) or CRS_DV (RMII) around each frame. On RMII, CRS_DV also means carrier sense, so it can toggle near the end of a frame while the PHY drains its buffer, which controllers have to allow for.',
      ],
    },
    {
      title: 'RGMII for gigabit',
      body: [
        'Gigabit PHYs use RGMII: 4 data bits sampled on both edges of a 125 MHz clock, 8 bits per cycle. It needs a delay of about 2 ns between clock and data, added either in the PHY, in the controller, or by a longer trace, and a mismatch there is one of the most common reasons a new embedded Linux board has no network.',
      ],
    },
  ],
  params: [
    {
      key: 'iface', label: 'Interface', help: 'MII sends 4 bits per 25 MHz clock; RMII sends 2 bits per 50 MHz clock on fewer pins. Both run at 100 Mbit/s.', type: 'select', default: 'rmii',
      options: [{ value: 'rmii', label: 'RMII (2 bits, 50 MHz)' }, { value: 'mii', label: 'MII (4 bits, 25 MHz)' }],
    },
    ...FRAME_PARAMS,
  ],

  encode(p) {
    const f = buildFrame(p);
    const width = p.iface === 'mii' ? 4 : 2;
    const clk = new TraceBuilder(width === 4 ? 'TX_CLK' : 'REF_CLK', 0);
    const en = new TraceBuilder('TX_EN', 0);
    const txd = Array.from({ length: width }, (_, k) => new TraceBuilder(`TXD${k}`, 0));
    const bits: Bit[] = [];
    const fields: Field[] = [];
    const notes: Note[] = [];
    const spans: Record<string, [number, number]> = {};
    const tick = (t: number) => {
      clk.set(t, 0);
      clk.set(t + 0.5, 1);
    };
    let t = 0;
    for (let k = 0; k < IDLE; k++) tick(t++);
    en.set(t, 1);
    notes.push({ lane: 1, t, text: 'TX_EN high: frame starts' });
    for (const sec of f.sections) {
      const start = t;
      sec.bytes.forEach((byte, n) => {
        for (let chunk = 0; chunk < 8 / width; chunk++) {
          tick(t);
          txd.forEach((line, k) => {
            const bit = chunk * width + k;
            const v = ((byte >> bit) & 1) as 0 | 1;
            line.set(t, v);
            bits.push({
              lane: 2 + k, t0: t, t1: t + 1, label: `${bit}`, kind: sec.kind, sample: t + 0.5,
              info: `${sec.info} Byte ${n + 1} of ${sec.bytes.length} (${hex(byte)}), bit ${bit} on TXD${k} = ${v}. The receiver samples it on the rising clock edge; each byte goes low ${width === 4 ? 'nibble' : 'bits'} first.`,
            });
          });
          t++;
        }
      });
      fields.push({ lane: 1 + width, t0: start, t1: t, label: sec.label, kind: sec.kind });
      spans[sec.id] = [start, t];
    }
    en.set(t, 0);
    txd.forEach((line) => line.set(t, 0));
    for (let k = 0; k < IDLE; k++) tick(t++);
    const duration = t;
    const clocks = f.bytes.length * (8 / width);
    const tour: TourStop[] = [
      {
        title: 'Overview',
        text: `The same ${f.bytes.length}-byte frame, preamble included, as ${clocks} clock cycles of ${width} bits on ` +
          `${width === 4 ? 'MII' : 'RMII'}. TX_EN goes high for exactly the length of the frame.`,
        view: [0, duration], focus: null,
      },
      {
        title: 'TX_EN marks the frame',
        text: 'The controller raises TX_EN with the first bits of the preamble and lowers it after the last bit of the CRC. ' +
          'The PHY starts transmitting on the cable when TX_EN rises.',
        view: [0, IDLE + 10], focus: [IDLE, IDLE + 1],
      },
      {
        title: `${width} bits per clock`,
        text: `Each rising edge of ${width === 4 ? 'TX_CLK' : 'REF_CLK'} transfers ${width} bits, least significant first: ` +
          `${width === 4 ? 'a nibble, low nibble first' : 'two bits, bits 1 and 0 first, then 3 and 2, and so on'}. ` +
          'The preamble 0x55 appears as the same pattern on every cycle.',
        view: [IDLE - 1, IDLE + 12], focus: [IDLE, IDLE + 8 / width],
      },
      {
        title: 'End of frame',
        text: 'After the CRC, TX_EN falls and the data lines go quiet. The PHY finishes sending the frame and returns the ' +
          'cable to idle.',
        view: [spans.fcs[0] - 2, duration], focus: [spans.fcs[1], spans.fcs[1] + 1],
      },
    ];
    return { traces: [clk.trace, en.trace, ...txd.map((l) => l.trace)], bits, fields, notes, duration, unitTime: width === 4 ? 4e-8 : 2e-8, minPpu: 16, tour };
  },
};
