import type { Bit, Driver, Field, Kind, Note, Protocol } from '../core/types';
import { TraceBuilder, hex, parseBytes, printable } from '../core/util';

/** Lines used per phase, written the way flash datasheets do: instruction-address-data. */
const MODES: Record<string, { cmd: number; name: string; lanes: [number, number, number]; mode: number; dummy: number }> = {
  '111': { cmd: 0x0b, name: 'Fast Read', lanes: [1, 1, 1], mode: 0, dummy: 8 },
  '114': { cmd: 0x6b, name: 'Fast Read Quad Output', lanes: [1, 1, 4], mode: 0, dummy: 8 },
  '144': { cmd: 0xeb, name: 'Fast Read Quad I/O', lanes: [1, 4, 4], mode: 2, dummy: 4 },
  '444': { cmd: 0xeb, name: 'Fast Read Quad I/O, QPI mode', lanes: [4, 4, 4], mode: 2, dummy: 4 },
};

export const qspi: Protocol = {
  id: 'qspi',
  name: 'Quad SPI',
  fullName: 'Quad Serial Peripheral Interface',
  summary:
    'SPI with four data lines instead of one each way. A flash read sends an instruction, an address and some dummy ' +
    'clocks, then the flash answers four bits per clock. Which phases use one line and which use four depends on the ' +
    'command, written as instruction-address-data (1-1-4, 1-4-4 and so on).',
  usedIn: 'External flash on microcontrollers (often running code straight from it), ESP32 and RP2040 boards, FPGA ' +
    'configuration flash, and some displays.',
  facts: {
    clock: 'Synchronous. The controller drives SCLK, almost always in SPI mode 0, and both sides sample on the rising edge.',
    wires: 'CS, SCLK and four bidirectional data lines IO0 to IO3. In single-line commands, IO0 is MOSI and IO1 is MISO, while IO2 and IO3 double as the write-protect and hold pins.',
    drive: 'Push-pull. Each IO line switches direction partway through a read, and the dummy clocks give both sides time to swap.',
    duplex: 'Half duplex in quad phases, since all four lines carry one direction at a time.',
    topology: 'Usually one controller and one flash chip; a second chip needs its own CS.',
    addressing: 'The CS line picks the chip, and a 24-bit (or 32-bit) address inside the command picks the byte.',
    flow: 'None on the bus. Writes and erases take milliseconds, so the controller polls a status register until the chip is ready.',
    errors: 'None on the bus. Some flash chips add ECC inside the memory array.',
    speed: 'Commonly 50 to 133 MHz. At 4 bits per clock that is up to about 66 MB/s; DDR modes double it.',
    reach: 'Board level only, with short traces.',
  },
  strengths: [
    'Four times the throughput of plain SPI with only two extra pins.',
    'Fast enough to run code directly from external flash (execute in place).',
    'Backward compatible: the same chip still accepts plain single-line SPI commands.',
  ],
  limits: [
    'Commands, dummy cycle counts and quad-enable bits differ between flash vendors, so drivers need per-chip settings.',
    'The bus has to switch direction, which costs dummy clocks on every read.',
    'Signal integrity gets hard at 100+ MHz: traces need matched lengths and short runs.',
  ],
  legend: { cmd: 'instruction' },
  deepDive: [
    {
      title: 'Execute in place (XIP)',
      body: [
        'Most QSPI controllers have a memory-mapped mode in which the external flash appears as ordinary read-only memory. When the CPU fetches an instruction from that address range, the controller issues the read command automatically. This allows code to run directly from external flash, at the cost of higher latency than internal flash, which caches mitigate.',
        'Continuous read mode reduces the overhead further: after the first read, the mode bits tell the flash to expect another read, so subsequent accesses skip the instruction byte.',
      ],
    },
    {
      title: 'Enabling quad mode',
      body: [
        'In single-line mode, IO2 and IO3 serve as the write-protect (WP#) and hold (HOLD#) pins. Most flash devices therefore require a Quad Enable (QE) bit in a status register to be set before quad commands work; on many Winbond parts it is bit 1 of Status Register 2. If quad reads return incorrect data while single-line reads succeed, an unset QE bit is the usual cause. On many devices the bit is non-volatile, so it only needs to be set once.',
      ],
    },
    {
      title: 'Dummy cycles and clock rate',
      body: [
        'The number of dummy cycles a read requires depends on the clock frequency: the flash needs a fixed amount of time to access its array, so faster clocks need more cycles. Some devices make the count configurable. If the controller and the flash disagree on the count, every byte is read shifted by a few bits.',
      ],
    },
    {
      title: '3-byte and 4-byte addresses',
      body: [
        'A 24-bit address reaches 16 MB. Larger devices either switch into 4-byte address mode (command 0xB7, Enter 4-Byte Address Mode) or provide separate 4-byte commands, such as 0xEC for a quad I/O read with a 4-byte address.',
      ],
    },
    {
      title: 'SFDP: discovering capabilities',
      body: [
        'Most modern flash devices implement Serial Flash Discoverable Parameters (JEDEC JESD216), a table read with command 0x5A. It describes the supported read commands, their dummy cycle counts, the address modes and the erase sizes, which allows a driver to configure a device it has no specific knowledge of.',
      ],
    },
    {
      title: 'Beyond quad: DTR and octal',
      body: [
        'Double transfer rate (DTR) modes transfer data on both clock edges. Octal SPI, standardized as xSPI (JESD251), uses eight data lines and a data strobe (DQS) that the flash drives alongside the data, so the controller can sample reliably at 200 MHz DDR and above, for roughly 400 MB/s.',
      ],
    },
  ],
  params: [
    {
      key: 'mode', label: 'Command', type: 'select', default: '144',
      options: Object.entries(MODES).map(([value, m]) => ({
        value, label: `${m.lanes.join('-')}  ${m.name} (${hex(m.cmd)})`,
      })),
    },
    { key: 'addr', label: 'Address', type: 'text', default: '001000', placeholder: '001000 (hex, 24-bit)' },
    { key: 'data', label: 'Data read back', type: 'text', default: 'DE AD BE EF', placeholder: 'DE AD BE EF' },
    {
      key: 'format', label: 'As', type: 'select', default: 'hex',
      options: [{ value: 'hex', label: 'Hex' }, { value: 'text', label: 'Text' }],
    },
    {
      key: 'clock', label: 'Clock', type: 'select', default: '50000000',
      options: [
        { value: '10000000', label: '10 MHz' },
        { value: '50000000', label: '50 MHz' },
        { value: '133000000', label: '133 MHz' },
      ],
    },
  ],

  encode(p) {
    const m = MODES[p.mode] ?? MODES['144'];
    const addrText = p.addr.trim().replace(/^0x/i, '');
    if (!/^[0-9a-f]{1,6}$/i.test(addrText)) throw new Error('The address should be up to 6 hex digits, like 001000.');
    const addr = parseInt(addrText, 16);
    const bytes = parseBytes(p.data, p.format);

    const cs = new TraceBuilder('CS', 1);
    const sclk = new TraceBuilder('SCLK', 0);
    const io = [0, 1, 2, 3].map((i) => new TraceBuilder(`IO${i}`, 'z'));
    const bits: Bit[] = [];
    const fields: Field[] = [];
    const notes: Note[] = [];

    cs.set(1, 0);
    let t = 1;

    /** Shifts `value` out over `lanes` lines, MSB first: one bit per clock on IO0, or a nibble per clock on IO3..IO0. */
    const phase = (value: number, nBits: number, lanes: number, kind: Kind, by: Driver, title: string, info: string) => {
      const start = t;
      const width = lanes === 4 ? 4 : 1;
      for (let c = 0; c < nBits / width; c++) {
        const shift = nBits - width * (c + 1);
        const chunk = (value >> shift) & (width === 4 ? 0xf : 1);
        if (width === 1) {
          const lane = by === 'controller' ? 0 : 1;
          const v = (chunk & 1) as 0 | 1;
          io[lane].set(t, v);
          bits.push({ lane: 2 + lane, t0: t, t1: t + 1, label: `${shift}`, kind, by, sample: t + 0.5, info: `${title}, bit ${shift} = ${v}. ${info}` });
        } else {
          for (let l = 0; l < 4; l++) {
            const v = ((chunk >> l) & 1) as 0 | 1;
            io[l].set(t, v);
            bits.push({
              lane: 2 + l, t0: t, t1: t + 1, label: `${shift + l}`, kind, by, sample: t + 0.5,
              info: `${title}, bit ${shift + l} = ${v}. Four lines move a whole nibble (${hex(chunk).slice(-1)}h) per clock: ` +
                `IO3 carries the highest bit of it and IO0 the lowest. ${info}`,
            });
          }
        }
        sclk.set(t + 0.5, 1);
        sclk.set(t + 1, 0);
        t++;
      }
      fields.push({ lane: 5, t0: start, t1: t, label: title, kind });
    };

    const [iLanes, aLanes, dLanes] = m.lanes;
    phase(m.cmd, 8, iLanes, 'cmd', 'controller', `Instruction ${hex(m.cmd)}`,
      iLanes === 1
        ? `The command byte always goes out one bit per clock on IO0 (MOSI) unless the chip is in QPI mode. ${hex(m.cmd)} is "${m.name}".`
        : `In QPI mode even the instruction uses all four lines, so it takes 2 clocks instead of 8.`);
    notes.push({ lane: 2, t: 1, text: iLanes === 1 ? 'instruction: 1 line, 8 clocks' : 'instruction: 4 lines, 2 clocks' });

    const aStart = t;
    phase(addr, 24, aLanes, 'addr', 'controller', `Address 0x${addr.toString(16).toUpperCase().padStart(6, '0')}`,
      `The 24-bit address of the first byte to read, most significant bit first.`);
    if (aLanes === 4) notes.push({ lane: 2, t: aStart, text: 'address: 4 lines, 6 clocks' });

    if (m.mode) {
      phase(0x00, 8, 4, 'dummy', 'controller', 'Mode bits',
        'Mode bits M7 to M0. Some chips let a special value here skip the instruction on the next read ("continuous read"). 0x00 means a normal read.');
    }

    // Dummy clocks: no device drives the IO lines while they turn around from controller to flash.
    const dStart = t;
    for (let l = 0; l < 4; l++) if (dLanes === 4 || l < 2) io[l].set(t, 'z');
    for (let c = 0; c < m.dummy; c++) {
      bits.push({
        lane: dLanes === 4 ? 2 : 3, t0: t, t1: t + 1, label: 'D', kind: 'dummy',
        info: `Dummy clock ${c + 1} of ${m.dummy}. The flash needs a few clocks to fetch the data from its memory array, and ` +
          'the IO lines need time to switch from the controller driving them to the flash driving them.',
      });
      sclk.set(t + 0.5, 1);
      sclk.set(t + 1, 0);
      t++;
    }
    fields.push({ lane: 5, t0: dStart, t1: t, label: `${m.dummy} dummy`, kind: 'dummy' });
    notes.push({ lane: dLanes === 4 ? 2 : 3, t: dStart, text: 'turnaround' });

    const dataStart = t;
    bytes.forEach((b) =>
      phase(b, 8, dLanes, 'data', 'target', `${hex(b)} ${printable(b)}`.trim(),
        dLanes === 4
          ? 'The flash now drives all four lines, so each byte takes only 2 clocks.'
          : 'The flash shifts the byte out on IO1 (MISO), one bit per clock.'));
    notes.push({ lane: dLanes === 4 ? 2 : 3, t: dataStart, text: dLanes === 4 ? 'data: 4 lines, 2 clocks per byte' : 'data on IO1, 8 clocks per byte' });

    cs.set(t + 0.5, 1);
    for (const tr of io) tr.set(t + 0.5, 'z');
    bits.unshift({
      lane: 0, t0: 0.5, t1: 1.5, label: 'CS↓', kind: 'start',
      info: 'Chip select goes low, which starts a new command. Everything that follows is clocked by SCLK in SPI mode 0.',
    });
    bits.push({
      lane: 0, t0: t, t1: t + 1, label: 'CS↑', kind: 'stop',
      info: `Chip select goes high, which ends the read. ${bytes.length} byte${bytes.length === 1 ? '' : 's'} took ` +
        `${Math.round(t - 1)} clocks in total. As long as CS stays low, the flash keeps sending the following bytes.`,
    });

    return {
      traces: [cs.trace, sclk.trace, ...io.map((b) => b.trace)],
      bits, fields, notes, duration: t + 1.5, unitTime: 1 / +p.clock,
    };
  },
};
