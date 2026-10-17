/**
 * Memory-mapped I/O: a peripheral register is just an address, and writing to it changes hardware. A GPIO output
 * register drives sixteen pins, four of them LEDs; click the bits or type a value and the pins follow. The volatile
 * setting shows why the keyword is needed.
 */
import { bits, code, hexN, hoverTips, parseNumber, seg, markSeg, status, syncUrl } from './dbg';

/** The four pins wired to the Discovery board’s LEDs: bit → [name, colour]. */
const LEDS: Record<number, [string, string]> = { 12: ['green', '#4caf50'], 13: ['orange', '#ff9800'], 14: ['red', '#f44336'], 15: ['blue', '#2196f3'] };

export function mountMmio(root: HTMLElement) {
  let v = Number(new URLSearchParams(location.search).get('v') ?? NaN);
  if (!Number.isInteger(v) || v < 0 || v > 0xffff) v = 0x1000;
  let vol = (new URLSearchParams(location.search).get('vol') ?? '1') !== '0';

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">The address space</p>
      <h1>Memory-mapped I/O</h1>
      <p>A microcontroller’s peripherals, its GPIO pins, timers and serial ports, are controlled through registers that
        live at fixed addresses, in the same address space as memory. Writing to one of those addresses does not store a
        value in RAM; it changes the hardware. Here the output register of a GPIO port sits at
        <code>0x40020C14</code>, and each bit drives a pin. Click the bits, or type a value, and watch the pins.</p>
    </section>
    <section class="debugger mmio" aria-label="Memory-mapped I/O">
      <header class="dbg-bar">
        <span class="dbg-file">gpio.c</span>
        <span class="dbg-state"><i aria-hidden="true"></i>Paused</span>
        <div class="dbg-controls">
          ${seg('vol', 'volatile', [['1', 'volatile'], ['0', 'no volatile']])}
          <label class="dbg-set">ODR = <input type="text" spellcheck="false" autocomplete="off" aria-label="Set the register value"></label>
        </div>
      </header>
      <div class="dbg-body stacked">
        <pre class="dbg-code" aria-label="Source"><code></code></pre>
        <div class="dbg-vars">
          <h3>GPIOD_ODR <small>at 0x40020C14</small></h3>
          <div class="reg"></div>
          <h3>Port D pins</h3>
          <div class="pins"></div>
        </div>
      </div>
      <p class="dbg-status" aria-live="polite"></p>
    </section>
    <section class="prose">
      <h2>Why volatile</h2>
      <p>A peripheral register is not an ordinary variable. Its value can change on its own, when an input pin moves or a
        byte arrives, and writing to it has effects the compiler cannot see, such as turning on an LED. The
        <code>volatile</code> keyword tells the compiler that every read and write in the source must actually happen, in
        order. Without it, the optimiser is free to assume nothing else touches the address: it may keep the register in
        a CPU register, drop a read whose result looks unused, or merge two writes into one. Toggle the setting above:
        with <code>volatile</code> off, a loop that pulses a pin high then low can be optimised away entirely, because
        the compiler sees the final value is unchanged.</p>
      <h2>Set and clear without read-modify-write</h2>
      <p>Changing one pin with <code>ODR |= (1u &lt;&lt; 12)</code> is a <a href="?p=rmw" data-nav>read-modify-write</a>:
        read the whole register, change one bit, write it back. If an interrupt changes another pin in between, that
        change is lost. STM32 ports have a bit set/reset register, BSRR, whose low half sets pins and whose high half
        clears them, each in a single write that touches no other bit, so no read is needed and nothing can be lost.</p>
      <h2>How the address reaches the pin</h2>
      <p>The processor puts the address on the bus like any other access. The bus matrix sees that
        <code>0x4000_0000</code> and above belongs to the peripherals, not to RAM or flash, and routes the write to the
        GPIO block, which latches the bits onto its output pins. The peripheral’s registers are laid out at fixed offsets
        from its base address; vendor headers wrap them in a struct, so <code>GPIOD-&gt;ODR</code> compiles to exactly
        this address.</p>
    </section>`;

  function draw() {
    const onLeds = Object.keys(LEDS).map(Number).filter((b) => (v >> b) & 1);
    const type = 'uint16_t';
    const lines = [
      '#include <stdint.h>',
      `#define GPIOD_ODR (*(${vol ? 'volatile ' : ''}${type} *)0x40020C14)`,
      '',
      `GPIOD_ODR = ${hexN(v, 16)};`.padEnd(30) + `// ${onLeds.length ? 'on: ' + onLeds.map((b) => LEDS[b][0]).join(', ') : 'all LEDs off'}`,
    ];
    if (!vol) lines.push('', '// without volatile, the compiler may drop writes', '// it thinks no one can observe.');
    code(root, lines, 3);

    root.querySelector('.reg')!.innerHTML = bits('odr', v, 16, {
      editable: true,
      under: (i) => (LEDS[i] ? LEDS[i][0][0].toUpperCase() : `${i}`),
      tip: (i) => `Bit ${i} drives pin PD${i}${LEDS[i] ? `, the ${LEDS[i][0]} LED` : ''}. Click to ${((v >> i) & 1) ? 'clear' : 'set'} it.`,
    });

    root.querySelector('.pins')!.innerHTML = Array.from({ length: 16 }, (_, k) => 15 - k).map((i) => {
      const on = (v >> i) & 1;
      const led = LEDS[i];
      return `<span class="pin${on ? ' hi' : ''}${led ? ' led' : ''}"${led && on ? ` style="--led:${led[1]}"` : ''}>` +
        `<i></i><b>PD${i}</b><small>${on ? '1' : '0'}</small></span>`;
    }).join('');

    markSeg(root, 'vol', vol ? '1' : '0');
    const input = root.querySelector<HTMLInputElement>('.dbg-set input')!;
    if (document.activeElement !== input) input.value = hexN(v, 16);
    status(root, onLeds.length
      ? `Writing ${hexN(v, 16)} to 0x40020C14 drives ${onLeds.map((b) => `PD${b} high (the ${LEDS[b][0]} LED)`).join(', ')}. The write went to the GPIO hardware, not to memory.`
      : `${hexN(v, 16)} written to 0x40020C14: every pin of port D is low. This address is a peripheral register, so the write changed the pins, not a variable in RAM.`);
    syncUrl({ v: v.toString(), vol: vol ? '1' : '0' });
  }

  draw();
  hoverTips(root);
  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    const b = t.closest<HTMLElement>('.bitrow.editable .bit');
    const o = t.closest<HTMLElement>('[data-vol]');
    if (b) v ^= 1 << Number(b.dataset.bit);
    else if (o) vol = o.dataset.vol === '1';
    else return;
    draw();
  });
  root.querySelector('.dbg-set input')!.addEventListener('change', (e) => {
    const n = parseNumber((e.target as HTMLInputElement).value);
    if (n === null || n < 0 || n > 0xffff) return status(root, 'Type a 16-bit value, 0 to 0xFFFF, in decimal, hex (0x…) or binary (0b…).');
    v = n;
    draw();
  });
}
