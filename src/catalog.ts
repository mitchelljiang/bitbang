/**
 * Every protocol bitbang covers or plans to cover, grouped for the home page.
 * An entry is live when a protocol with the same id exists in src/protocols.
 */
export interface Entry {
  id: string;
  name: string;
  full?: string;
  blurb: string;
  /** The signal names, shown as a hint of what's on the wire. */
  wires: string;
}

export interface Category {
  id: string;
  name: string;
  blurb: string;
  entries: Entry[];
}

export const catalog: Category[] = [
  {
    id: 'low-speed',
    name: 'Low-speed I/O',
    blurb: 'Simple serial links, from chip to chip on a board up to across a building.',
    entries: [
      { id: 'uart', name: 'UART', blurb: 'No clock. Both ends agree on a speed ahead of time and trust each other.', wires: 'TX · RX' },
      { id: 'rs232', name: 'RS-232', blurb: 'UART at ±12 V, inverted. The old serial port.', wires: 'TxD · RxD · GND' },
      { id: 'rs485', name: 'RS-485', blurb: 'UART over a differential pair. Long cables, many devices.', wires: 'A · B' },
      { id: 'spi', name: 'SPI', blurb: 'Clock, data out, data in, chip select. Fast and dumb in a good way.', wires: 'SCLK · MOSI · MISO · CS' },
      { id: 'qspi', name: 'Quad SPI', blurb: 'SPI with four data lines. How most microcontrollers read external flash.', wires: 'SCLK · IO0–3 · CS' },
      { id: 'i2c', name: 'I²C', blurb: 'Two wires shared by everything on the board. Every byte gets an ACK.', wires: 'SCL · SDA' },
      { id: 'i3c', name: 'I3C', blurb: 'I²C, but faster, and targets can interrupt.', wires: 'SCL · SDA' },
      { id: 'onewire', name: '1-Wire', blurb: 'Data and power on the same wire, in microsecond time slots.', wires: 'DQ' },
      { id: 'ws2812', name: 'WS2812', full: 'NeoPixel', blurb: 'LED strips. A long pulse is a 1, a short one is a 0.', wires: 'DIN' },
    ],
  },
  {
    id: 'high-speed',
    name: 'High-speed I/O',
    blurb: 'Differential pairs, line coding, clock recovery.',
    entries: [
      { id: 'usb', name: 'USB 2.0', blurb: 'NRZI, bit stuffing, and a sync pattern in front of every packet.', wires: 'D+ · D−' },
      { id: 'pcie', name: 'PCIe', blurb: '8b/10b on the early generations, 128b/130b after that.', wires: 'TX± · RX±' },
      { id: 'mipi', name: 'MIPI CSI-2', blurb: 'Camera lanes that drop in and out of a low-power mode.', wires: 'CLK± · D0–3±' },
      { id: 'hdmi', name: 'HDMI', full: 'TMDS', blurb: '8 bits in, 10 bits out, with as few transitions as possible.', wires: 'D0–2± · CLK±' },
      { id: 'sata', name: 'SATA', blurb: '8b/10b symbols, primitives and frames.', wires: 'TX± · RX±' },
    ],
  },
  {
    id: 'networking',
    name: 'Networking & fieldbus',
    blurb: 'Board to board and machine to machine, usually over longer cables.',
    entries: [
      { id: 'ethernet', name: '10BASE-T', full: 'Ethernet', blurb: 'Manchester encoding, a long preamble, and a CRC at the end.', wires: 'TX± · RX±' },
      { id: 'can', name: 'CAN', blurb: 'The lowest ID wins arbitration, one bit at a time. Basically every car has one.', wires: 'CANH · CANL' },
      { id: 'lin', name: 'LIN', blurb: 'A cheap single-wire car bus. Mostly UART underneath.', wires: 'LIN' },
      { id: 'modbus', name: 'Modbus RTU', full: 'RS-485', blurb: 'Request and response over a twisted pair. All over industrial gear.', wires: 'A · B' },
    ],
  },
  {
    id: 'audio',
    name: 'Audio',
    blurb: 'Getting samples from one chip to another.',
    entries: [
      { id: 'i2s', name: 'I²S', blurb: 'Bit clock, word select, data. Left channel, then right.', wires: 'SCK · WS · SD' },
      { id: 'pdm', name: 'PDM', blurb: 'What a MEMS microphone puts out: one bit at a time, very fast.', wires: 'CLK · DATA' },
      { id: 'spdif', name: 'S/PDIF', blurb: 'Self-clocking digital audio over coax or optical.', wires: 'DATA' },
    ],
  },
  {
    id: 'debug',
    name: 'Debug & programming',
    blurb: 'How a debugger gets inside the chip.',
    entries: [
      { id: 'jtag', name: 'JTAG', blurb: 'A 16-state machine that you walk around with TMS.', wires: 'TCK · TMS · TDI · TDO' },
      { id: 'swd', name: 'SWD', blurb: 'ARM\'s two-pin answer to JTAG.', wires: 'SWCLK · SWDIO' },
    ],
  },
  {
    id: 'wireless',
    name: 'Wireless & IR',
    blurb: 'No wire at all.',
    entries: [
      { id: 'nec', name: 'NEC IR', blurb: 'TV remote codes. 38 kHz bursts, with the data hidden in the gaps.', wires: 'IR' },
      { id: 'ook', name: '433 MHz OOK', blurb: 'Carrier on, carrier off. Garage doors and weather stations.', wires: 'RF' },
      { id: 'ble', name: 'Bluetooth LE', blurb: 'Advertising packets: preamble, access address, payload, CRC.', wires: 'RF' },
    ],
  },
];

export const categoryOf = (id: string) => catalog.find((c) => c.entries.some((e) => e.id === id));
