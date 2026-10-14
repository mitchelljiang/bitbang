import type { Bit, Driver, Field, Kind, Note, Protocol } from '../core/types';
import { TraceBuilder, bin, hex, parseBytes, printable } from '../core/util';

export const i2c: Protocol = {
  id: 'i2c',
  name: 'I²C',
  fullName: 'Inter-Integrated Circuit',
  tags: ['synchronous', 'single-ended', 'open-drain', 'half duplex', 'multi-drop', 'addressed', 'chip-to-chip'],
  summary:
    'A two-wire bus shared by many devices on the same board. Devices can pull either line low but never drive it ' +
    'high; pull-up resistors return the lines high. Each target has an address (7 bits, or optionally 10), and the ' +
    'receiver of each byte confirms it with an acknowledge bit (ACK).',
  usedIn: 'Temperature and motion sensors, EEPROMs, real-time clocks and small OLED displays, often many of them on the same two wires.',
  facts: {
    clock: 'Synchronous. The controller drives SCL, but a target can hold it low to pause a transfer, which is called clock stretching.',
    wires: 'SCL (clock) and SDA (data), plus ground, shared by every device, with one pull-up resistor on each line.',
    drive: 'Open-drain. Devices can only pull a line low; the pull-up resistor returns it high, which is why rising edges are slow.',
    duplex: 'Half duplex. SDA carries data in one direction at a time.',
    topology: 'A shared bus: many targets, and optionally several controllers, on the same two wires.',
    addressing: '7-bit addresses sent at the start of each transfer, giving about 112 usable addresses. An optional 10-bit mode sends the address in two bytes.',
    flow: 'An ACK or NACK after every byte, plus clock stretching when a target needs more time.',
    errors: 'An ACK confirms only that a byte was received, not that it was correct. There is no checksum, although SMBus adds an optional CRC-8 called PEC.',
    speed: '100 kHz (Standard mode), 400 kHz (Fast mode), 1 MHz (Fast-mode Plus), 3.4 MHz (High-speed mode, rarely used), and 5 MHz Ultra-fast mode, which is write-only and push-pull.',
    reach: 'Circuit-board distances. The specification allows at most 400 pF of bus capacitance, roughly a meter of wiring plus the connected devices.',
  },
  strengths: [
    'Two wires serve any number of devices, so adding a sensor requires no additional pins.',
    'Addressing and acknowledgments are built in, so a missing device is detected immediately.',
    'Several controllers can share one bus; arbitration on SDA determines which one proceeds, without corrupting data.',
  ],
  limits: [
    'Relatively slow, because the pull-up resistor must charge the bus capacitance on every rising edge.',
    'Choosing the pull-up value is a trade-off: smaller resistors give faster edges but consume more current.',
    'Many devices have fixed or limited address options, so two identical sensors can conflict.',
    'A single faulty device holding SDA low can stop the entire bus until it is reset.',
  ],
  deepDive: [
    {
      title: 'The register read',
      body: [
        'Most I²C sensors behave like a small memory with an internal pointer. To read from one, the controller writes ' +
        'the register number, issues a repeated START, sends the address again with the read bit set, and then reads. ' +
        'Most devices advance the pointer after each byte, so a multi-byte read returns consecutive registers.',
        'The repeated START matters because the controller keeps ownership of the bus, so another controller cannot ' +
        'begin a transfer between the write and the read. Set Direction to "Register read" above to see the complete sequence.',
      ],
    },
    {
      title: 'Choosing pull-up resistors',
      body: [
        'Smaller pull-up resistors produce faster rising edges, but every device pulling a line low must then sink more ' +
        'current. The specification limits that current to 3 mA in Standard and Fast mode, so the smallest pull-up is ' +
        'about (VDD − 0.4 V) / 3 mA, roughly 1 kΩ at 3.3 V.',
        'The largest value is set by the required rise time: R = t_r / (0.8473 × C_bus), where t_r is at most 1000 ns ' +
        'in Standard mode, 300 ns in Fast mode and 120 ns in Fast-mode Plus. A Fast-mode bus with 200 pF of capacitance ' +
        'therefore needs about 1.8 kΩ or less. Smaller buses with less capacitance are why 2.2 kΩ to 4.7 kΩ are the usual ' +
        'choices. A resistor that is too large makes the rising edges so slow that bits are misread.',
      ],
    },
    {
      title: 'Clock stretching',
      body: [
        'A target that needs more time can hold SCL low after the controller releases it. The controller must detect that ' +
        'SCL has not risen and wait, which is why it must read back the actual level of SCL rather than assuming it rose ' +
        'on schedule. Set Clock stretching above to see it.',
        'Not every controller handles stretching well. The original Raspberry Pi I²C controller had a well-known fault ' +
        'with short stretches, and SMBus limits how long a stretch may last.',
      ],
    },
    {
      title: 'Recovering a stuck bus',
      body: [
        'If the controller resets partway through a read, a target may be in the middle of sending a 0 and continue ' +
        'holding SDA low while it waits for clock pulses that never arrive. No other transfer can take place. The ' +
        'specification describes the remedy: the controller toggles SCL up to nine times until the target finishes its ' +
        'byte and releases SDA, then sends a STOP condition.',
      ],
    },
    {
      title: 'Resolving address conflicts',
      body: [
        'Many devices have one to three address pins that select between a small number of addresses, allowing two or ' +
        'four identical sensors on one bus. Beyond that, an I²C multiplexer such as the TCA9548A divides the bus into ' +
        'eight branches and connects one at a time. Some devices allow their address to be changed in software, and some ' +
        'designs use a second bus.',
      ],
    },
    {
      title: 'SMBus and PMBus',
      body: [
        'SMBus is a stricter variant of I²C designed for PC motherboards and batteries. It adds a timeout (a device that ' +
        'holds the clock low for more than about 35 ms is reset), a minimum clock speed, standard message formats such as ' +
        'read byte and block read, an optional CRC-8 called PEC, and an alert line. PMBus builds on SMBus to control ' +
        'power supplies. At 100 kHz, most I²C and SMBus devices interoperate without problems.',
      ],
    },
  ],
  legend: { cmd: 'register', dummy: 'clock stretch' },
  params: [
    { key: 'addr', label: 'Address', type: 'text', default: '50', placeholder: '50 (hex)' },
    {
      key: 'addrMode', label: 'Address size', type: 'select', default: '7',
      options: [{ value: '7', label: '7-bit' }, { value: '10', label: '10-bit' }],
    },
    {
      key: 'rw', label: 'Direction', type: 'select', default: 'w',
      options: [
        { value: 'w', label: 'Write (controller → target)' },
        { value: 'r', label: 'Read (target → controller)' },
        { value: 'reg', label: 'Register read (write, then read)' },
      ],
    },
    { key: 'reg', label: 'Register', type: 'text', default: '0F', placeholder: '0F (hex, for register reads)' },
    { key: 'data', label: 'Data', type: 'text', default: '00 2A', placeholder: '00 2A' },
    {
      key: 'format', label: 'As', type: 'select', default: 'hex',
      options: [{ value: 'hex', label: 'Hex' }, { value: 'text', label: 'Text' }],
    },
    {
      key: 'present', label: 'Target', type: 'select', default: 'yes',
      options: [{ value: 'yes', label: 'Responds (ACK)' }, { value: 'no', label: 'Missing (NACK)' }],
    },
    {
      key: 'stretch', label: 'Clock stretching', type: 'select', default: 'no',
      options: [{ value: 'no', label: 'None' }, { value: 'yes', label: 'Target stretches before data' }],
    },
    {
      key: 'speed', label: 'Speed', type: 'select', default: '100000',
      options: [
        { value: '100000', label: 'Standard (100 kHz)' },
        { value: '400000', label: 'Fast (400 kHz)' },
        { value: '1000000', label: 'Fast+ (1 MHz)' },
      ],
    },
  ],

  encode(p) {
    const ten = p.addrMode === '10';
    const addrText = p.addr.trim().replace(/^0x/i, '');
    if (!/^[0-9a-f]{1,3}$/i.test(addrText)) throw new Error('The address should be a hex number like 50 or 0x3C.');
    const addr = parseInt(addrText, 16);
    if (!ten && addr > 0x7f) {
      throw new Error(`${hex(addr)} is more than 7 bits. 7-bit addresses go from 0x00 to 0x7F. Switch Address size to 10-bit for larger ones.`);
    }
    if (ten && addr > 0x3ff) throw new Error(`${hex(addr)} is more than 10 bits. 10-bit addresses go from 0x000 to 0x3FF.`);
    const regMode = p.rw === 'reg';
    const read = p.rw === 'r' || regMode; // direction of the data bytes
    const present = p.present === 'yes';
    const regText = p.reg.trim().replace(/^0x/i, '');
    if (regMode && !/^[0-9a-f]{1,2}$/i.test(regText)) throw new Error('The register should be a hex byte, like 0F.');
    const reg = parseInt(regText || '0', 16);
    const bytes = parseBytes(p.data, p.format);

    const scl = new TraceBuilder('SCL', 1, true);
    const sda = new TraceBuilder('SDA', 1, true);
    const bits: Bit[] = [];
    const fields: Field[] = [];
    const notes: Note[] = [
      { lane: 0, t: 2, text: 'slow rise: only the pull-up resistor drives it high' },
      { lane: 1, t: 1, text: 'START: SDA falls while SCL is high' },
    ];

    // START: SDA falls while SCL is high, which is never allowed during normal data.
    sda.set(1, 0);
    scl.set(1.5, 0);
    bits.push({
      lane: 1, t0: 0.5, t1: 1.5, label: 'S', kind: 'start',
      info: 'START condition: SDA falls while SCL is still high. During data transfer, SDA changes only while SCL is low, ' +
        'so this pattern cannot be mistaken for a data bit. Every device on the bus begins listening for its address.',
    });

    let t = 1.5;
    const slot = (v: 0 | 1, label: string, kind: Kind, by: Driver, info: string) => {
      sda.set(t + 0.25, v); // change SDA while SCL is low
      scl.set(t + 0.5, 1); // receiver samples while SCL is high
      scl.set(t + 1, 0);
      bits.push({ lane: 1, t0: t, t1: t + 1, label, kind, by, sample: t + 0.75, info });
      t += 1;
    };

    // Repeated START: release SDA while SCL is low, raise SCL, then pull SDA low again while SCL is high.
    const repeatedStart = () => {
      sda.set(t + 0.25, 1);
      scl.set(t + 0.5, 1);
      sda.set(t + 1, 0);
      scl.set(t + 1.5, 0);
      bits.push({
        lane: 1, t0: t + 0.5, t1: t + 1.5, label: 'Sr', kind: 'start',
        info: 'Repeated START: a START condition without a preceding STOP. The controller keeps ownership of the bus, so ' +
          'no other controller can begin a transfer, and it can now resend the address with the direction set to read.',
      });
      t += 1.5;
    };

    const rwSlot = (r: boolean, info: string) =>
      slot(r ? 1 : 0, r ? 'R' : 'W', 'rw', 'controller', `Read/write bit = ${r ? 1 : 0} (${r ? 'read' : 'write'}). ${info}`);

    /** First byte of a 10-bit address: the reserved 11110 prefix, then A9 and A8, then R/W. */
    const tenBitHeader = (r: boolean) => {
      const start = t;
      for (const v of [1, 1, 1, 1, 0] as const) {
        slot(v, `${v}`, 'addr', 'controller',
          'Part of the reserved 11110 prefix. No 7-bit device has an address beginning with 11110, so all 7-bit devices ' +
          'ignore this transfer, and 10-bit devices recognize that the next two bits are the top of their address.');
      }
      for (const i of [9, 8]) {
        const v = ((addr >> i) & 1) as 0 | 1;
        slot(v, `A${i}`, 'addr', 'controller', `Address bit ${i} = ${v}, one of the two most significant bits of the 10-bit address ${hex(addr)}.`);
      }
      rwSlot(r, r
        ? 'After the repeated START, only the two most significant address bits are resent, now with the read bit set, ' +
          'and the target that was already addressed responds.'
        : 'The first byte of a 10-bit address always indicates a write, even for a read, because the second address ' +
          'byte must still be sent to the target.');
      const header = 0xf0 | ((addr >> 8) << 1) | (r ? 1 : 0);
      fields.push({ lane: 1, t0: start, t1: t, label: `${hex(header)} 11110+A9A8 ${r ? 'R' : 'W'}`, kind: 'addr' });
    };

    /** The register number a register read starts by writing, then the target's ACK. */
    const regByte = () => {
      const start = t;
      notes.push({ lane: 1, t: t + 0.25, text: 'write the register number' });
      for (let i = 7; i >= 0; i--) {
        const v = ((reg >> i) & 1) as 0 | 1;
        slot(v, `${i}`, 'cmd', 'controller',
          `Register bit ${i} = ${v}. Before reading, the controller writes the number of the register it wants: ${hex(reg)}. ` +
          'Most sensors behave like a small memory with an internal pointer, and this byte sets that pointer.');
      }
      fields.push({ lane: 1, t0: start, t1: t, label: `Register ${hex(reg)}`, kind: 'cmd' });
      slot(0, 'ACK', 'ack', 'target', `ACK: the target has stored ${hex(reg)} as its register pointer.`);
    };

    /** Clock stretching: the target holds SCL low after the controller releases it, and the controller waits. */
    const STRETCH = 3;
    const stretch = () => {
      notes.push({ lane: 0, t: t + 0.5, text: 'target holds SCL low: clock stretching' });
      bits.push({
        lane: 0, t0: t, t1: t + STRETCH + 0.5, label: 'stretch', kind: 'dummy', by: 'target',
        info: 'Clock stretching: the target is not ready yet (it may still be taking a measurement), so it holds SCL low. ' +
          'The controller releases SCL to begin the next bit, detects that the line is still low, and waits. This is ' +
          'possible because the lines are open-drain, so any device can hold a line low. When the target releases SCL, ' +
          'the line rises and the transfer continues exactly where it stopped.',
      });
      t += STRETCH;
    };

    const addrAck = (who: string) => {
      notes.push({ lane: 1, t: t + 0.25, text: present ? 'target pulls SDA low: ACK' : 'no response: NACK' });
      if (present) {
        slot(0, 'ACK', 'ack', 'target',
          `ACK: ${who} pulls SDA low during this clock cycle. The controller has released SDA, so the line is now driven ` +
          'by the target.');
      } else {
        slot(1, 'NACK', 'nack', 'controller',
          `NACK: no device responded to ${hex(addr)}, so the pull-up resistor held SDA high. The controller ends the ` +
          'transfer with a STOP condition. A bus scanner detects devices in exactly this way.');
      }
    };

    if (!ten) {
      const addrStart = t;
      for (let i = 6; i >= 0; i--) {
        const v = ((addr >> i) & 1) as 0 | 1;
        slot(v, `A${i}`, 'addr', 'controller',
          `Address bit ${i} = ${v}. The controller sends the 7-bit target address ${hex(addr)}, most significant bit ` +
          'first. Every device compares it with its own address.');
      }
      const firstRead = read && !regMode;
      rwSlot(firstRead,
        `Together with the address, this forms the first byte, ${hex((addr << 1) | (firstRead ? 1 : 0))}. For this reason, ` +
        'some datasheets list an "8-bit address", which is the 7-bit address shifted left by one bit.');
      fields.push({ lane: 1, t0: addrStart, t1: t, label: `${hex(addr)} ${firstRead ? 'R' : 'W'}`, kind: 'addr' });
      addrAck(`the target at ${hex(addr)} recognizes its address and`);
      if (regMode && present) {
        regByte();
        repeatedStart();
        const again = t;
        for (let i = 6; i >= 0; i--) {
          const v = ((addr >> i) & 1) as 0 | 1;
          slot(v, `A${i}`, 'addr', 'controller', `Address bit ${i} = ${v}. The same address is sent again, now followed by the read bit.`);
        }
        rwSlot(true, 'The controller now reads, starting from the register it has just selected.');
        fields.push({ lane: 1, t0: again, t1: t, label: `${hex(addr)} R`, kind: 'addr' });
        slot(0, 'ACK', 'ack', 'target', `ACK: the target at ${hex(addr)} is ready to send the contents of register ${hex(reg)}.`);
      }
    } else {
      tenBitHeader(false);
      addrAck(`every 10-bit target whose top two address bits are ${bin(addr >> 8, 2)}`);
      if (present) {
        const start = t;
        for (let i = 7; i >= 0; i--) {
          const v = ((addr >> i) & 1) as 0 | 1;
          slot(v, `A${i}`, 'addr', 'controller',
            `Address bit ${i} = ${v}. The second byte carries the eight least significant bits of the 10-bit address ${hex(addr)}.`);
        }
        fields.push({ lane: 1, t0: start, t1: t, label: `${hex(addr & 0xff)} A7–A0`, kind: 'addr' });
        slot(0, 'ACK', 'ack', 'target',
          `ACK: only the target with the complete address ${hex(addr)} responds, and it becomes the addressed target.`);
        if (regMode) regByte();
        if (read) {
          repeatedStart();
          tenBitHeader(true);
          slot(0, 'ACK', 'ack', 'target', `ACK: the target at ${hex(addr)} confirms that it is ready to send data.`);
        }
      }
    }

    if (present && p.stretch === 'yes') stretch();

    if (present) {
      bytes.forEach((b, idx) => {
        const start = t;
        const sender: Driver = read ? 'target' : 'controller';
        for (let i = 7; i >= 0; i--) {
          const v = ((b >> i) & 1) as 0 | 1;
          slot(v, `${i}`, 'data', sender,
            `Data bit ${i} of ${hex(b)} = ${v}, sent by the ${sender}, most significant bit first. The ${sender} changes ` +
            'SDA only while SCL is low, and the receiver reads it while SCL is high.');
        }
        fields.push({
          lane: 1, t0: start, t1: t, kind: 'data',
          label: regMode ? `${hex(reg + idx)}: ${hex(b)}` : `${hex(b)} ${printable(b)}`.trim(),
        });

        const lastRead = read && idx === bytes.length - 1;
        if (lastRead) {
          slot(1, 'NACK', 'nack', 'controller',
            'NACK from the controller: during a read, the controller acknowledges every byte except the last. Leaving SDA ' +
            'high here tells the target to stop sending.');
        } else {
          slot(0, 'ACK', 'ack', read ? 'controller' : 'target',
            `ACK: the ${read ? 'controller' : 'target'} pulls SDA low to confirm that it received the byte. The ` +
            `${sender} then sends the next byte.`);
        }
      });
    }

    // STOP: SDA rises while SCL is high.
    sda.set(t + 0.25, 0);
    scl.set(t + 0.5, 1);
    sda.set(t + 0.75, 1);
    notes.push({ lane: 1, t: t + 0.75, text: 'STOP: SDA rises while SCL is high' });
    bits.push({
      lane: 1, t0: t + 0.25, t1: t + 1.25, label: 'P', kind: 'stop',
      info: 'STOP condition: SDA rises while SCL is high, the reverse of the START condition. Both lines are released, ' +
        'and the bus is available to any controller.',
    });

    return { traces: [scl.trace, sda.trace], bits, fields, notes, duration: t + 1.75, unitTime: 1 / +p.speed };
  },
};
