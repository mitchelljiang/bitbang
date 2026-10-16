import type { Bit, Driver, Field, Kind, Note, Protocol } from '../core/types';
import { TraceBuilder, hex, parseBytes, parseHex, printable } from '../core/util';

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
  tags: ['synchronous', 'single-ended', 'push-pull', 'half duplex', 'point-to-point', 'chip-to-chip', 'memory'],
  summary:
    'SPI with four data lines instead of one in each direction. A flash read sends an instruction, an address and a ' +
    'number of dummy clock cycles, after which the flash returns four bits per clock. Each command specifies how many ' +
    'lines its instruction, address and data phases use, written as 1-1-4, 1-4-4 and so on.',
  usedIn: 'External flash memory for microcontrollers (often running code directly from it), ESP32 and RP2040 boards, FPGA configuration flash, and some displays.',
  facts: {
    clock: 'Synchronous. The controller drives SCLK, usually in SPI mode 0 (most flash devices also accept mode 3), and both devices sample on the rising edge.',
    wires: 'CS, SCLK and four bidirectional data lines, IO0 to IO3. In single-line commands, IO0 acts as MOSI and IO1 as MISO, while IO2 and IO3 serve as the write-protect and hold pins.',
    drive: 'Push-pull. Each IO line changes direction partway through a read, and the dummy cycles give both devices time to switch.',
    duplex: 'Half duplex during four-line phases, because all four lines carry data in one direction at a time.',
    topology: 'Usually one controller and one flash device; a second device needs its own CS line.',
    addressing: 'The CS line selects the device, and a 24-bit (or 32-bit) address within the command selects the byte.',
    flow: 'None on the bus. Writes and erases take milliseconds, so the controller polls a status register until the device is ready.',
    errors: 'None on the bus. Some flash devices add error correction (ECC) inside the memory array.',
    speed: 'Commonly 50 to 133 MHz. At four bits per clock, that is up to about 66 MB/s, and double transfer rate (DTR) modes double it.',
    reach: 'Circuit-board distances only, with short traces.',
  },
  strengths: [
    'Four times the throughput of standard SPI with only two additional pins.',
    'Fast enough for a processor to run code directly from external flash, known as execute in place.',
    'Backward compatible: the same device still accepts standard single-line SPI commands.',
  ],
  limits: [
    'Commands, dummy cycle counts and quad-enable settings differ between flash vendors, so drivers need device-specific configuration.',
    'The bus must change direction during every read, which costs dummy cycles.',
    'Signal integrity becomes difficult above 100 MHz: traces must be short and closely matched in length.',
  ],
  deepDive: [
    {
      title: 'Execute in place (XIP)',
      body: [
        'Most QSPI controllers have a memory-mapped mode in which the external flash appears as ordinary read-only memory. ' +
        'When the processor fetches an instruction from that address range, the controller issues the read command ' +
        'automatically. This allows code to run directly from external flash, at the cost of higher latency than internal ' +
        'flash, which caches reduce.',
        'Continuous read mode reduces the overhead further: after the first read, the mode bits tell the flash to expect ' +
        'another read, so subsequent accesses omit the instruction byte.',
      ],
    },
    {
      title: 'Enabling quad mode',
      body: [
        'In single-line mode, IO2 and IO3 serve as the write-protect (WP#) and hold (HOLD#) pins. Most flash devices ' +
        'therefore require a Quad Enable (QE) bit in a status register to be set before quad commands work; on many ' +
        'Winbond devices it is bit 1 of Status Register 2. If quad reads return incorrect data while single-line reads ' +
        'succeed, an unset QE bit is the most likely cause. On many devices the bit is non-volatile, so it only needs to ' +
        'be set once.',
      ],
    },
    {
      title: 'Dummy cycles and clock rate',
      body: [
        'The number of dummy cycles a read requires depends on the clock frequency: the flash needs a fixed amount of time ' +
        'to access its memory array, so faster clocks require more cycles. Some devices make the count configurable. If ' +
        'the controller and the flash disagree on the count, every byte is read shifted by several bits.',
      ],
    },
    {
      title: '3-byte and 4-byte addresses',
      body: [
        'A 24-bit address reaches 16 MB. Larger devices either switch into 4-byte address mode (command 0xB7, Enter ' +
        '4-Byte Address Mode) or provide separate 4-byte commands, such as 0xEC for a quad I/O read with a 4-byte address.',
      ],
    },
    {
      title: 'SFDP: discovering capabilities',
      body: [
        'Most modern flash devices implement Serial Flash Discoverable Parameters (JEDEC JESD216), a table read with ' +
        'command 0x5A. It describes the supported read commands, their dummy cycle counts, the address modes and the ' +
        'erase sizes, which allows a driver to configure a device it has no specific knowledge of.',
      ],
    },
    {
      title: 'Beyond quad: DTR and octal',
      body: [
        'Double transfer rate (DTR) modes transfer data on both clock edges. Octal SPI, standardized as xSPI (JESD251), ' +
        'uses eight data lines and a data strobe (DQS) that the flash drives alongside the data, so the controller can ' +
        'sample reliably at 200 MHz DDR and above, for roughly 400 MB/s.',
      ],
    },
  ],
  legend: { cmd: 'instruction' },
  params: [
    {
      key: 'mode', label: 'Command', help: 'The read command. The three numbers give the lines used for the instruction, the address and the data: 1-4-4, for example, sends the instruction on one line and the address and data on four.', type: 'select', default: '144',
      options: Object.entries(MODES).map(([value, m]) => ({
        value, label: `${m.lanes.join('-')}  ${m.name} (${hex(m.cmd)})`,
      })),
    },
    { key: 'addr', label: 'Address', help: 'The 24-bit flash address to read from, in hexadecimal.', type: 'text', default: '001000', placeholder: '001000 (hex, 24-bit)' },
    { key: 'data', label: 'Data read back', help: 'The bytes the flash returns from that address.', type: 'text', default: 'DE AD BE EF', placeholder: 'DE AD BE EF' },
    {
      key: 'format', label: 'As', help: 'Whether the data is read as hexadecimal bytes or as text characters.', type: 'select', default: 'hex',
      options: [{ value: 'hex', label: 'Hex' }, { value: 'text', label: 'Text' }],
    },
    {
      key: 'clock', label: 'Clock', help: 'The SCLK frequency. It changes the timescale; the number of clock cycles depends only on the command.', type: 'select', default: '50000000',
      options: [
        { value: '10000000', label: '10 MHz' },
        { value: '50000000', label: '50 MHz' },
        { value: '133000000', label: '133 MHz' },
      ],
    },
  ],

  encode(p) {
    const m = MODES[p.mode] ?? MODES['144'];
    const addr = parseHex(p.addr, 6, 'The address should be up to 6 hex digits, like 001000.');
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
              info: `${title}, bit ${shift + l} = ${v}. Four lines transfer a 4-bit nibble (${hex(chunk).slice(-1)}h) per clock: ` +
                `IO3 carries its most significant bit and IO0 its least significant bit. ${info}`,
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
        ? `The instruction is sent one bit per clock on IO0 (MOSI) unless the device is in QPI mode. ${hex(m.cmd)} is "${m.name}".`
        : `In QPI mode the instruction also uses all four lines, so it takes 2 clock cycles instead of 8.`);
    notes.push({ lane: 2, t: 1, text: iLanes === 1 ? 'instruction: 1 line, 8 clocks' : 'instruction: 4 lines, 2 clocks' });

    const aStart = t;
    phase(addr, 24, aLanes, 'addr', 'controller', `Address 0x${addr.toString(16).toUpperCase().padStart(6, '0')}`,
      `The 24-bit address of the first byte to read, most significant bit first.`);
    if (aLanes === 4) notes.push({ lane: 2, t: aStart, text: 'address: 4 lines, 6 clocks' });

    if (m.mode) {
      phase(0x00, 8, 4, 'dummy', 'controller', 'Mode bits',
        'Mode bits M7 to M0. On many devices, a specific value here enables continuous read mode, in which the next read omits the instruction. 0x00 selects a normal read.');
    }

    // Dummy clocks: no device drives the IO lines while they turn around from controller to flash.
    const dStart = t;
    for (let l = 0; l < 4; l++) if (dLanes === 4 || l < 2) io[l].set(t, 'z');
    for (let c = 0; c < m.dummy; c++) {
      bits.push({
        lane: dLanes === 4 ? 2 : 3, t0: t, t1: t + 1, label: 'D', kind: 'dummy',
        info: `Dummy cycle ${c + 1} of ${m.dummy}. The flash uses these cycles to read the data from its memory array, and ` +
          'the IO lines change from being driven by the controller to being driven by the flash.',
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
          ? 'The flash now drives all four lines, so each byte takes only 2 clock cycles.'
          : 'The flash shifts the byte out on IO1 (MISO), one bit per clock cycle.'));
    notes.push({ lane: dLanes === 4 ? 2 : 3, t: dataStart, text: dLanes === 4 ? 'data: 4 lines, 2 clocks per byte' : 'data on IO1, 8 clocks per byte' });

    cs.set(t + 0.5, 1);
    for (const tr of io) tr.set(t + 0.5, 'z');
    bits.unshift({
      lane: 0, t0: 0.5, t1: 1.5, label: 'CS↓', kind: 'start',
      info: 'Chip select goes low, beginning a new command. Every following bit is clocked by SCLK in SPI mode 0.',
    });
    bits.push({
      lane: 0, t0: t, t1: t + 1, label: 'CS↑', kind: 'stop',
      info: `Chip select goes high, ending the read. Reading ${bytes.length} byte${bytes.length === 1 ? '' : 's'} took ` +
        `${Math.round(t - 1)} clock cycles in total. While CS remains low, the flash continues to send data from consecutive addresses.`,
    });

    return {
      traces: [cs.trace, sclk.trace, ...io.map((b) => b.trace)],
      bits, fields, notes, duration: t + 1.5, unitTime: 1 / +p.clock,
    };
  },
};
