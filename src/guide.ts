/**
 * "How protocols work": the questions every protocol answers, one section each.
 * Section ids match FactKey, so the spec sheet on each protocol page can link straight to them.
 */
export const SECTIONS = `
<section id="clock">
  <h2>Clock: how the receiver knows when to read</h2>
  <p>A receiver sees a voltage that changes over time. To convert it back into bits, it must know <em>when</em> to
    sample the signal. There are three common approaches.</p>
  <ul>
    <li><b>Synchronous.</b> A separate clock line marks each bit, and the receiver samples on one of its edges. This is
      simple and works at any speed, but requires an additional wire.</li>
    <li><b>Asynchronous.</b> There is no clock line. Both devices agree on a bit rate in advance, and each times the bits
      with its own clock.</li>
    <li><b>Embedded clock.</b> The timing is carried within the data by a line code, such as Manchester or 8b/10b, that
      guarantees frequent transitions. The receiver recovers the clock from those transitions.</li>
  </ul>
</section>

<section id="wires">
  <h2>Wires and signaling</h2>
  <p><b>Single-ended</b> signals use one wire measured against ground: 0 V represents a 0, and 3.3 V (or 5 V, or 1.8 V)
    represents a 1. This is inexpensive, but any noise picked up along the way, and any difference between the two
    devices' ground voltages, appears directly in the signal.</p>
  <p><b>Differential</b> signals use a pair of wires driven in opposite directions, and the receiver measures only the
    difference between them. Noise affects both wires almost equally and cancels out, which is why nearly all
    long-distance and high-speed links, including <a href="?p=rs485" data-nav>RS-485</a>, CAN, <a href="?p=usb" data-nav>USB</a> and
    <a href="?p=ethernet" data-nav>Ethernet</a>, are differential.</p>
  <p>Logic levels also matter. A 3.3 V device can be damaged by a 5 V signal, and <a href="?p=rs232" data-nav>RS-232</a> uses roughly
    ±12 V with inverted polarity, so it requires a transceiver before it reaches a microcontroller pin.</p>
</section>

<section id="drive">
  <h2>Drive: push-pull or open-drain</h2>
  <p>A <b>push-pull</b> output has one transistor that drives the line high and another that drives it low, so both
    edges are fast. If two push-pull outputs on the same line disagree, however, they work against each other, which is
    effectively a short circuit. Push-pull lines must therefore have exactly one driver at a time.</p>
  <p>An <b>open-drain</b> (or open-collector) output can only pull the line low. To produce a 1, it releases the line,
    and a pull-up resistor brings it high. Any number of devices can then share the line safely: if any device pulls
    it low, the line is low. This behavior, called wired-AND, is what makes the shared bus, acknowledgments, clock
    stretching and arbitration of <a href="?p=i2c" data-nav>I²C</a> possible.</p>
  <p>The cost is speed. The resistor must charge the capacitance of the line on every rising edge, so rising edges
    follow a slow RC curve, visible on the I²C diagram, while falling edges remain sharp. A smaller resistor produces
    faster rising edges but consumes more current whenever a device pulls the line low.</p>
</section>

<section id="duplex">
  <h2>Duplex: which directions, and when</h2>
  <ul>
    <li><b>Simplex:</b> one direction only, such as a GPS module that continuously sends position data.</li>
    <li><b>Half duplex:</b> both directions, taking turns on the same wires. I²C and RS-485 work this way, and the
      protocol must determine which device transmits at any moment.</li>
    <li><b>Full duplex:</b> both directions at once, on separate wires. <a href="?p=uart" data-nav>UART</a> and <a href="?p=spi" data-nav>SPI</a> each use
      one wire per direction.</li>
  </ul>
</section>

<section id="topology">
  <h2>Topology: how devices are connected</h2>
  <ul>
    <li><b>Point-to-point:</b> exactly two devices, as in UART. No coordination is needed, but every additional device
      requires additional wires.</li>
    <li><b>Shared bus:</b> all devices on the same wires, as in I²C, CAN and RS-485. Adding devices is inexpensive, but
      each device needs an address, and the protocol must prevent devices from transmitting at the same time.</li>
    <li><b>Star with selects:</b> shared data lines, plus a separate select line to each device, as in SPI.</li>
    <li><b>Daisy chain:</b> each device's output feeds the next device's input, as in <a href="?p=jtag" data-nav>JTAG</a>, some SPI
      devices and LED strips. Few wires are needed, but data must pass through every device to reach the last one.</li>
  </ul>
</section>

<section id="addressing">
  <h2>Addressing and arbitration</h2>
  <p>On a shared bus, every message must identify its recipient. Protocols do this either with <b>wires</b>, such as
    the chip-select lines of SPI, which are simple and fast but require one pin per device, or with <b>addresses</b> in
    the data, such as the 7-bit address of I²C, which needs no extra pins but adds time to every transfer and prevents
    two devices with the same fixed address from sharing a bus.</p>
  <p>If more than one device can begin a transfer, the protocol also needs <b>arbitration</b> for when two begin at
    the same moment. I²C and CAN use wired-AND arbitration: every transmitter monitors the line while it sends, and a
    device that sends a 1 but reads back a 0 has lost and withdraws. The winning device is unaffected, so no time is lost.</p>
</section>

<section id="framing">
  <h2>Framing: where a message begins</h2>
  <p>A stream of bits is meaningless unless the receiver knows where each byte begins. UART uses a start bit, a falling
    edge from the idle level. SPI uses the chip-select line going low. I²C uses a START condition, in which SDA falls
    while SCL is high, a pattern that ordinary data never produces. Faster links send a preamble or synchronization
    pattern, and some use <b>bit stuffing</b>, as in USB and CAN, to ensure that the data itself never resembles a frame
    marker.</p>
  <p>Framing also determines the <b>bit order</b>. UART sends the least significant bit first, I²C sends the most
    significant bit first, and SPI can use either, depending on the device.</p>
</section>

<section id="flow">
  <h2>Flow control: who sets the pace</h2>
  <p>If the transmitter sends faster than the receiver can process, data is lost. Some protocols leave this to the
    application: an SPI controller clocks at whatever rate it is configured for. Others give the receiver a way to slow
    the transmitter: the optional RTS/CTS lines or XON/XOFF characters of UART, clock stretching in I²C (a target holds
    SCL low until it is ready), or an acknowledgment after each block of data.</p>
</section>

<section id="errors">
  <h2>Error checking</h2>
  <ul>
    <li><b>Parity:</b> one additional bit that makes the number of 1s even (or odd). It detects any single changed bit,
      but two changes in the same byte cancel out. It is inexpensive but weak.</li>
    <li><b>Checksum:</b> the sum of the bytes, sent with the message. It detects more errors, but misses changes that
      balance out, such as two bytes exchanging places.</li>
    <li><b>CRC:</b> the remainder of a polynomial division over the whole message. It detects every burst of errors
      shorter than the CRC and nearly all others, which is why Ethernet, USB, CAN and SD cards all use one.</li>
    <li><b>Acknowledgment:</b> the receiver confirms each byte or message. This confirms that the data arrived, not that
      it arrived intact, so an acknowledgment alone is not error detection.</li>
  </ul>
  <p>Error handling is usually left to the layer above.</p>
</section>

<section id="speed">
  <h2>Speed: what limits it</h2>
  <p>The raw bit rate is rarely the limiting factor. Asynchronous links are limited by how closely two independent
    clocks agree. Open-drain buses are limited by the RC rise time. Fast synchronous links are limited by <b>skew</b>,
    the small difference in arrival time between clock and data. Every protocol also spends some bits on overhead: UART
    with 8N1 sends 10 bits for every 8 bits of data, and an I²C write of one byte also requires an address byte, two
    acknowledgments, and the START and STOP conditions.</p>
</section>

<section id="reach">
  <h2>Reach: how far it goes</h2>
  <p>Speed and distance trade against each other. Longer wires add capacitance, which slows the edges, pick up more
    noise, and, once a wire is long relative to the edge time, cause reflections. The usual solution is to change the
    electrical layer rather than the protocol: the same UART framing reaches about 15 m as RS-232 and more than a
    kilometer as differential RS-485.</p>
</section>`

export function mountGuide(root: HTMLElement) {
  root.innerHTML = `
    <article class="guide">
      <header class="intro">
        <p class="crumbs">Guide</p>
        <h1>How protocols work</h1>
        <p>Every protocol answers the same small set of questions: when to read a bit, which device drives the line, where
          a message begins, which device it is for, and what happens when an error occurs.</p>
      </header>
      <nav class="toc" aria-label="On this page">
        <a href="#clock">Clock</a><a href="#wires">Wires</a><a href="#drive">Drive</a><a href="#duplex">Duplex</a>
        <a href="#topology">Topology</a><a href="#addressing">Addressing</a><a href="#framing">Framing</a>
        <a href="#flow">Flow control</a><a href="#errors">Errors</a><a href="#speed">Speed</a><a href="#reach">Reach</a>
      </nav>
      ${SECTIONS}
    </article>`;
}
