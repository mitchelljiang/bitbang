/**
 * Three numbers for the top of each protocol page, read at a glance before the detail: the wires, the speed and the
 * reach. Each is a short form of the protocol's own `facts` (wires, speed, reach), so keep the two in step. A protocol
 * without an entry (the Ethernet frame, whose wires and reach belong to the physical layer) shows no strip.
 */
export const QUICK: Record<string, { wires: string; speed: string; reach: string }> = {
  uart: { wires: 'TX, RX, GND', speed: '9600 baud to 3 Mbaud', reach: 'About 1 m' },
  spi: { wires: 'SCLK, MOSI, MISO, CS', speed: 'Commonly 1 to 50 MHz', reach: 'On the board' },
  i2c: { wires: 'SCL, SDA, GND', speed: '100 kHz to 3.4 MHz', reach: 'About 1 m (400 pF)' },
  i3c: { wires: 'SCL, SDA, GND', speed: '12.5 MHz clock (SDR)', reach: 'On the board' },
  qspi: { wires: 'CS, SCLK, IO0–IO3', speed: '50 to 133 MHz', reach: 'On the board' },
  onewire: { wires: 'DQ, GND', speed: '15 to 125 kbit/s', reach: 'Tens of meters' },
  i2s: { wires: 'SCK, WS, SD', speed: '3.072 MHz for 48 kHz stereo', reach: 'On the board' },
  rs232: { wires: 'TxD, RxD, GND', speed: '9600 to 115200 baud', reach: 'About 15 m' },
  rs485: { wires: 'A/B pair, GND', speed: 'Up to about 10 Mbit/s', reach: 'Up to 1200 m' },
  can: { wires: 'CANH/CANL pair', speed: 'Up to 1 Mbit/s', reach: '40 m at 1 Mbit/s' },
  ethernet: { wires: '2 twisted pairs', speed: '10 Mbit/s', reach: '100 m' },
  '100base': { wires: '2 twisted pairs', speed: '100 Mbit/s', reach: '100 m' },
  '1000baset': { wires: '4 twisted pairs', speed: '1 Gbit/s', reach: '100 m' },
  '1000basex': { wires: 'Fiber pair', speed: '1 Gbit/s', reach: '550 m to 5 km+' },
  rmii: { wires: '16 pins (MII), 7 (RMII)', speed: '100 Mbit/s', reach: 'Board traces' },
  jtag: { wires: 'TCK, TMS, TDI, TDO', speed: '1 to 50 MHz', reach: 'Short ribbon cable' },
  swd: { wires: 'SWCLK, SWDIO, GND', speed: '1 to 10 MHz, up to 50', reach: 'Short cable' },
  pci: { wires: '47 to 49 signals', speed: '133 MB/s (32-bit, 33 MHz)', reach: 'Motherboard and cards' },
  pcie: { wires: '2 pairs per lane', speed: '2.5 to 64 GT/s per lane', reach: 'Tens of centimeters' },
  usb: { wires: 'D+/D− pair, VBUS, GND', speed: '1.5 to 480 Mbit/s', reach: '5 m per cable' },
  ws2812: { wires: 'DIN, 5 V, GND', speed: '800 kbit/s', reach: 'Meters to the first LED' },
};
