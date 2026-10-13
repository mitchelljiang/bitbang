/**
 * "How protocols work": the questions every protocol answers, one section each.
 * Section ids match FactKey, so the spec sheet on each protocol page can link straight to them.
 */
const SECTIONS = `
<section id="clock">
  <h2>Clock: how does the receiver know when to read?</h2>
  <p>A receiver sees a voltage that changes over time. To turn that back into bits it has to know <em>when</em> to look.
    There are three common answers.</p>
  <ul>
    <li><b>Synchronous.</b> A separate clock wire ticks once per bit, and the receiver samples on one of its edges.
      SPI and I²C work this way. It's simple and tolerant of any speed, but costs a wire.</li>
    <li><b>Asynchronous.</b> No clock wire. Both sides agree on a bit rate ahead of time and run their own timers.
      UART resyncs on every start bit, so the timers only have to agree for about ten bits.</li>
    <li><b>Embedded clock.</b> The clock is mixed into the data with a line code (Manchester, 8b/10b) that guarantees
      frequent edges, and the receiver recovers timing from those edges. USB, Ethernet and PCIe do this to go fast
      over a single pair.</li>
  </ul>
</section>

<section id="wires">
  <h2>Wires and signaling</h2>
  <p><b>Single-ended</b> signals are one wire measured against ground: 0 V is a 0, and 3.3 V (or 5 V, or 1.8 V) is a 1.
    That's cheap, but any noise picked up along the way, or any difference between the two grounds, shows up directly
    in the signal.</p>
  <p><b>Differential</b> signals use a pair of wires driven in opposite directions, and the receiver looks only at the
    difference. Noise hits both wires about equally and cancels out, which is why long-distance and high-speed links
    (RS-485, CAN, USB, Ethernet, LVDS) are almost all differential.</p>
  <p>Logic levels also matter. A 3.3 V chip can be damaged by a 5 V signal, and RS-232 uses roughly ±12 V with the
    polarity inverted, so it needs a level shifter or transceiver before it reaches a microcontroller pin.</p>
</section>

<section id="drive">
  <h2>Drive: push-pull or open-drain</h2>
  <p>A <b>push-pull</b> output has a transistor to pull the wire high and another to pull it low, so it drives both
    edges hard and fast. But if two push-pull outputs on the same wire disagree, one fights the other, and that is a
    short circuit. So push-pull lines have exactly one driver at a time.</p>
  <p>An <b>open-drain</b> (or open-collector) output can only pull low. To get a 1, it lets go, and a pull-up resistor
    brings the wire high. Now any number of devices can share the wire safely: if anyone pulls low, the wire is low.
    This "wired-AND" is what makes I²C's shared bus, ACKs, clock stretching and arbitration possible.</p>
  <p>The cost is speed. The resistor has to charge the wire's capacitance on every rising edge, so rises follow a slow
    RC curve (the "shark fin" on the I²C diagram) while falls stay sharp. A smaller resistor rises faster but wastes
    more current every time a device pulls low.</p>
</section>

<section id="duplex">
  <h2>Duplex: which directions, and when</h2>
  <ul>
    <li><b>Simplex:</b> one direction only, like a GPS module that just streams position.</li>
    <li><b>Half duplex:</b> both directions, but taking turns on the same wire. I²C and RS-485 work like this, and
      something has to decide whose turn it is.</li>
    <li><b>Full duplex:</b> both directions at once, on separate wires. UART and SPI have one wire per direction.</li>
  </ul>
</section>

<section id="topology">
  <h2>Topology: who's connected to whom</h2>
  <ul>
    <li><b>Point-to-point:</b> exactly two devices (UART). Nothing to coordinate, but every new device needs new wires.</li>
    <li><b>Shared bus:</b> everyone on the same wires (I²C, CAN, RS-485). Cheap to extend, but devices need addresses and
      a way to avoid talking over each other.</li>
    <li><b>Star with selects:</b> shared data wires, plus a separate select wire to each device (SPI).</li>
    <li><b>Daisy chain:</b> each device's output feeds the next one's input (JTAG, some SPI parts, LED strips). Few wires,
      but data has to pass through every device to reach the last.</li>
  </ul>
</section>

<section id="addressing">
  <h2>Addressing and arbitration</h2>
  <p>On a shared bus, every message has to say who it's for. Protocols do this either with <b>wires</b> (SPI's chip
    selects: simple and fast, but one pin per device) or with <b>addresses</b> in the data (I²C's 7-bit address: no extra
    pins, but it costs time on every transfer, and two parts with the same fixed address can't share a bus).</p>
  <p>If more than one device can start a transfer, the protocol also needs <b>arbitration</b> for when two start at
    once. I²C and CAN use the wired-AND trick: every sender watches the wire while it transmits, and anyone who sends a 1
    but sees a 0 has lost and backs off. The winner never notices, so no time is wasted.</p>
</section>

<section id="framing">
  <h2>Framing: where does a message start?</h2>
  <p>A stream of bits is useless unless the receiver knows where each byte begins. UART uses a start bit, a falling
    edge out of idle. SPI uses chip select going low. I²C uses a START condition (SDA falling while SCL is high), a pattern
    that ordinary data is never allowed to produce. Faster links send a preamble or sync pattern, and some use
    <b>bit stuffing</b> (USB, CAN) to make sure the data itself can never look like a frame marker.</p>
  <p>Framing also fixes the <b>bit order</b>. UART sends the least significant bit first; I²C sends the most
    significant bit first; SPI can do either, depending on the chip.</p>
</section>

<section id="flow">
  <h2>Flow control: who sets the pace?</h2>
  <p>If the sender is faster than the receiver can handle, data gets dropped. Some protocols leave that to you. SPI's
    controller simply clocks as fast as it's told to. Others give the receiver a way to push back: UART's optional
    RTS/CTS wires or XON/XOFF characters, I²C's clock stretching (a target holds SCL low until it's ready), or an
    ACK/NACK after each chunk of data.</p>
</section>

<section id="errors">
  <h2>Error checking</h2>
  <ul>
    <li><b>Parity:</b> one extra bit that makes the count of 1s even (or odd). Catches any single flipped bit, but two
      flips in the same byte cancel out. Cheap, and weak.</li>
    <li><b>Checksum:</b> add up the bytes and send the total. Catches more, but misses errors that happen to balance out,
      such as two bytes swapped.</li>
    <li><b>CRC:</b> a remainder from polynomial division over the whole message. Catches every burst of errors shorter
      than the CRC and almost everything else, which is why Ethernet, USB, CAN and SD cards all use one.</li>
    <li><b>Acknowledgment:</b> the receiver confirms each byte or message. That tells you someone heard it, not that they
      heard it correctly, so an ACK is not error detection on its own.</li>
  </ul>
  <p>Detecting an error is only half of it. What to do next (retry, drop the message, reset the bus) is usually left to
    the layer above.</p>
</section>

<section id="speed">
  <h2>Speed: what limits it</h2>
  <p>Raw bit rate is rarely what limits you. Asynchronous links are limited by how well two independent clocks agree.
    Open-drain buses are limited by RC rise time. Fast synchronous links are limited by <b>skew</b>, the clock and data
    arriving at slightly different times. And every protocol spends some bits on overhead: UART's 8N1 uses 10 bits to send 8,
    and an I²C write of one byte also needs the address byte, two ACKs and the START and STOP conditions.</p>
</section>

<section id="reach">
  <h2>Reach: how far it goes</h2>
  <p>Speed and distance trade against each other. Longer wires add capacitance (slower edges), pick up more noise, and,
    once a wire is long compared to the edge time, cause reflections. The usual escape is to change the physical layer
    rather than the protocol: the same UART framing goes about 15 m as RS-232 and over a kilometer as differential
    RS-485.</p>
</section>`;

export function mountGuide(root: HTMLElement) {
  root.innerHTML = `
    <article class="guide">
      <header class="intro">
        <p class="crumbs">Guide</p>
        <h1>How protocols work</h1>
        <p>Every protocol is a set of answers to the same handful of questions: when to read a bit, who drives the wire,
          how a message starts, who it's for, and what happens when something goes wrong.</p>
      </header>
      <nav class="toc" aria-label="On this page">
        <a href="#clock">Clock</a><a href="#wires">Wires</a><a href="#drive">Drive</a><a href="#duplex">Duplex</a>
        <a href="#topology">Topology</a><a href="#addressing">Addressing</a><a href="#framing">Framing</a>
        <a href="#flow">Flow control</a><a href="#errors">Errors</a><a href="#speed">Speed</a><a href="#reach">Reach</a>
      </nav>
      ${SECTIONS}
    </article>`;
}
