/**
 * Every protocol bitbang covers or plans to cover, grouped for the Protocols sidebar.
 * An entry is live when a protocol with the same id exists in src/protocols.
 */
export interface Entry {
  id: string;
  name: string;
  full?: string;
  blurb: string;
  /** The signal names, shown as a hint of what's on the wire. */
  wires?: string;
  /** Has a page that says it's under construction, instead of being an unlinked "soon" item. */
  wip?: string;
}

export interface Category {
  id: string;
  name: string;
  blurb: string;
  entries: Entry[];
}

export const catalog: Category[] = [
  {
    id: 'asynchronous',
    name: 'Asynchronous serial',
    blurb: 'No clock line: timing comes from an agreed baud rate or from pulse widths.',
    entries: [
      { id: 'uart', name: 'UART', blurb: 'Two wires and no clock line; both devices agree on a baud rate in advance.', wires: 'TX · RX' },
      { id: 'rs232', name: 'RS-232', blurb: 'UART at inverted ±12 V levels: the traditional serial port.', wires: 'TxD · RxD · GND' },
      { id: 'rs485', name: 'RS-485', blurb: 'UART over a differential pair, for long cables and many devices.', wires: 'A · B' },
      { id: 'onewire', name: '1-Wire', blurb: 'Data and power on a single wire, in microsecond time slots.', wires: 'DQ' },
      { id: 'ws2812', name: 'WS2812', full: 'NeoPixel', blurb: 'Addressable LED strips, where a long pulse is a 1 and a short pulse is a 0.', wires: 'DIN' },
    ],
  },
  {
    id: 'synchronous',
    name: 'Synchronous buses',
    blurb: 'A controller drives a clock line, and data is read on its edges.',
    entries: [
      { id: 'spi', name: 'SPI', blurb: 'Clock, data out, data in and chip select. Simple and fast.', wires: 'SCLK · MOSI · MISO · CS' },
      { id: 'qspi', name: 'Quad SPI', blurb: 'SPI with four data lines, used by most microcontrollers to read external flash.', wires: 'SCLK · IO0–3 · CS' },
      { id: 'i2c', name: 'I²C', blurb: 'Two wires shared by every device on the board, with an acknowledgment for each byte.', wires: 'SCL · SDA' },
      { id: 'i3c', name: 'I3C', blurb: 'A faster successor to I²C, with dynamic addresses and in-band interrupts.', wires: 'SCL · SDA' },
    ],
  },
  {
    id: 'expansion',
    name: 'Expansion buses',
    blurb: 'Connections inside a computer, to expansion cards and drives.',
    entries: [
      { id: 'pci', name: 'PCI', blurb: 'The parallel bus that PCI Express replaced: 32 shared lines and a 33 MHz clock.', wires: 'AD[31:0] · C/BE# · FRAME# · …' },
      { id: 'pcie', name: 'PCIe', blurb: 'Serial lanes using 8b/10b encoding in early generations and 128b/130b from Gen3.', wires: 'TX± · RX±' },
      { id: 'sata', name: 'SATA', blurb: 'Storage link built from 8b/10b symbols, primitives and frames.', wires: 'TX± · RX±' },
    ],
  },
  {
    id: 'usb',
    name: 'USB',
    blurb: 'Plug-in devices, connected through a host.',
    entries: [
      { id: 'usb', name: 'USB 2.0', blurb: 'Host-controlled packets using NRZI encoding, bit stuffing and a sync pattern.', wires: 'D+ · D−' },
      { id: 'usb3', name: 'USB 3.x', blurb: 'SuperSpeed links with separate transmit and receive pairs.', wires: 'SSTX± · SSRX± · D+ · D−',
        wip: 'USB 3.x (SuperSpeed) adds two dedicated differential pairs alongside the USB 2.0 pair, one for each direction, so it is full duplex. The first generation (5 Gbit/s) uses 8b/10b encoding with scrambling, the same encoding as PCIe Gen1 and Gen2; later generations (10 and 20 Gbit/s) use 128b/132b. Packets are framed with dedicated K-symbol sequences, and link training resembles PCIe.' },
      { id: 'usb4', name: 'USB4', blurb: 'Carries USB, DisplayPort and PCIe traffic over a single USB-C link.', wires: 'TX1± · TX2± · RX1± · RX2±',
        wip: 'USB4 is built on the Thunderbolt 3 protocol. It runs two lanes per direction over a USB-C cable at up to 20 Gbit/s each (40 Gbit/s in total, 80 Gbit/s in version 2 with PAM3 signaling), and instead of a single protocol it carries tunnels: USB 3.x, DisplayPort and PCIe traffic share the link at the same time, allocated by a connection manager.' },
    ],
  },
  {
    id: 'video',
    name: 'Video & display',
    blurb: 'High-bandwidth links for cameras and displays.',
    entries: [
      { id: 'hdmi', name: 'HDMI', full: 'TMDS', blurb: 'TMDS encoding: 8 bits become 10, with as few transitions as possible.', wires: 'D0–2± · CLK±' },
      { id: 'mipi', name: 'MIPI CSI-2', blurb: 'Camera lanes that switch between high-speed and low-power modes.', wires: 'CLK± · D0–3±' },
    ],
  },
  {
    id: 'networking',
    name: 'Networking',
    blurb: 'Computer to computer, with packets, addresses and a CRC.',
    entries: [
      { id: 'ethernet', name: '10BASE-T', full: 'Ethernet', blurb: 'Manchester-encoded frames with a preamble, MAC addresses and a CRC.', wires: 'TX± · RX±' },
    ],
  },
  {
    id: 'industrial',
    name: 'Automotive & industrial',
    blurb: 'Shared buses that tie together the sensors, motors and controllers in a car or a factory.',
    entries: [
      { id: 'can', name: 'CAN', blurb: 'Bitwise arbitration where the lowest ID wins. Standard in vehicles.', wires: 'CANH · CANL' },
      { id: 'lin', name: 'LIN', blurb: 'A low-cost single-wire vehicle bus, based on UART framing.', wires: 'LIN' },
      { id: 'modbus', name: 'Modbus RTU', full: 'RS-485', blurb: 'Request-and-response messaging over RS-485, widely used in industrial equipment.', wires: 'A · B' },
    ],
  },
  {
    id: 'audio',
    name: 'Audio',
    blurb: 'Digital audio between chips and devices.',
    entries: [
      { id: 'i2s', name: 'I²S', blurb: 'Bit clock, word select and data, carrying left and right audio samples.', wires: 'SCK · WS · SD' },
      { id: 'pdm', name: 'PDM', blurb: 'The high-rate 1-bit output of digital MEMS microphones.', wires: 'CLK · DATA' },
      { id: 'spdif', name: 'S/PDIF', blurb: 'Self-clocking digital audio over coax or optical.', wires: 'DATA' },
    ],
  },
  {
    id: 'debug',
    name: 'Debug & programming',
    blurb: 'How a debugger connects to the inside of a chip.',
    entries: [
      { id: 'jtag', name: 'JTAG', blurb: 'A 16-state TAP controller, navigated with TMS.', wires: 'TCK · TMS · TDI · TDO' },
      { id: 'swd', name: 'SWD', blurb: 'Arm\'s two-pin alternative to JTAG.', wires: 'SWCLK · SWDIO' },
    ],
  },
  {
    id: 'wireless',
    name: 'Wireless & IR',
    blurb: 'Links without a physical connection.',
    entries: [
      { id: 'nec', name: 'NEC IR', blurb: 'Television remote codes, sent as 38 kHz bursts with data encoded in the gaps.', wires: 'IR' },
      { id: 'ook', name: '433 MHz OOK', blurb: 'Carrier switched on and off, used by garage doors and weather stations.', wires: 'RF' },
      { id: 'ble', name: 'Bluetooth LE', blurb: 'Advertising packets: preamble, access address, payload, CRC.', wires: 'RF' },
    ],
  },
];

export const categoryOf = (id: string) => catalog.find((c) => c.entries.some((e) => e.id === id));
