/**
 * Memory-mapped I/O: a peripheral register is just an address, and writing to it changes hardware. A pin does nothing
 * until it is configured, so this page shows two registers, the mode register (MODER) that configures each pin and the
 * output register (ODR) that drives it. An LED lights only when its pin is both configured as an output and driven high.
 */
import { hexN, status, syncUrl } from './dbg';

const LEDS: [number, string, string][] = [[12, 'green', '#4caf50'], [13, 'orange', '#ff9800'], [14, 'red', '#f44336'], [15, 'blue', '#2196f3']];
const MODES = ['Input', 'Output', 'Alternate', 'Analog']; // MODER field: 00, 01, 10, 11
const SHORT = ['In', 'Out', 'Alt', 'An']; // narrow-screen labels

export function mountMmio(root: HTMLElement) {
  const q = new URLSearchParams(location.search);
  const read = (k: string, d: number) => { const n = parseInt(q.get(k) ?? '', 16); return Number.isInteger(n) ? n >>> 0 : d; };
  const mode: Record<number, number> = {};
  const out: Record<number, number> = {};
  for (const [p] of LEDS) { mode[p] = (read('m', 0) >>> (2 * p)) & 3; out[p] = (read('o', 0) >>> p) & 1; }

  const moder = () => LEDS.reduce((v, [p]) => v | (mode[p] << (2 * p)), 0) >>> 0;
  const odr = () => LEDS.reduce((v, [p]) => v | (out[p] << p), 0) >>> 0;
  const lit = (p: number) => mode[p] === 1 && out[p] === 1;

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">The address space</p>
      <h1>Memory-mapped I/O</h1>
      <p>A microcontroller’s peripherals, its GPIO pins, timers and serial ports, are controlled through registers that
        live at fixed addresses, in the same address space as memory. Writing to one of those addresses does not store a
        value in RAM; it changes the hardware. But a pin does nothing until it is configured. Each GPIO port has a
        <b>mode register</b> that says what every pin is, and an <b>output register</b> that drives the ones set to
        output. Set the mode and the output below; an LED lights only when its pin is an output <i>and</i> driven high.</p>
    </section>
    <section class="debugger mmio" aria-label="Memory-mapped I/O">
      <header class="dbg-bar">
        <span class="dbg-file">gpio.c</span>
        <span class="dbg-state"><i aria-hidden="true"></i>Paused</span>
        <span class="dbg-regs"></span>
      </header>
      <div class="dbg-body stacked">
        <pre class="dbg-code" aria-label="Source"><code></code></pre>
        <div class="dbg-vars">
          <h3>Port D, LED pins</h3>
          <table class="pintab"><thead><tr><th>Pin</th><th>MODER <small>mode</small></th><th>ODR <small>output</small></th><th>LED</th></tr></thead><tbody></tbody></table>
        </div>
      </div>
      <p class="dbg-status" aria-live="polite"></p>
    </section>
    <section class="prose">
      <h2>Configure, then drive</h2>
      <p>Setting a bit in the output register only does something if the pin is already an output. The reset state of
        most pins is input (or analog), so firmware’s first job is to write the configuration registers: set the mode to
        output, often the output type, speed and pull-up or pull-down too, and only then write the data register. And
        before any of that, the port’s clock must be enabled in the RCC block, or its registers read back as zero and
        ignore writes entirely. Forgetting one of these steps is the classic reason a first GPIO program does nothing.</p>
      <h2>Why volatile</h2>
      <p>A peripheral register is not an ordinary variable. Its value can change on its own, when an input pin moves or a
        byte arrives, and writing to it has effects the compiler cannot see. The <code>volatile</code> keyword on the
        register’s address tells the compiler that every read and write in the source must actually happen, in order.
        Without it, the optimiser is free to assume nothing else touches the address: it may keep the register in a CPU
        register, drop a read whose result looks unused, or merge two writes into one, so a routine that briefly pulses a
        pin could vanish entirely. Every peripheral access must go through a <code>volatile</code> pointer, which is why
        vendor headers declare the register structs <code>volatile</code>.</p>
      <h2>Set and clear without read-modify-write</h2>
      <p>Changing one pin with <code>ODR |= (1u &lt;&lt; 12)</code> is a <a href="?p=rmw" data-nav>read-modify-write</a>:
        read the whole register, change one bit, write it back. If an interrupt changes another pin in between, that
        change is lost. STM32 ports have a bit set/reset register, BSRR, whose low half sets pins and whose high half
        clears them, each in a single write that touches no other bit, so no read is needed and nothing can be lost.</p>
      <h2>How the address reaches the pin</h2>
      <p>The processor puts the address on the bus like any other access. The bus matrix sees that
        <code>0x4000_0000</code> and above belongs to the peripherals, not to RAM or flash, and routes the write to the
        GPIO block, which latches the bits onto its output pins. The peripheral’s registers sit at fixed offsets from its
        base address; vendor headers wrap them in a struct, so <code>GPIOD-&gt;MODER</code> and <code>GPIOD-&gt;ODR</code>
        compile to exactly these addresses.</p>
    </section>`;

  function draw() {
    const outs = LEDS.filter(([p]) => mode[p] === 1);
    const highs = LEDS.filter(([p]) => lit(p));
    const lines = [
      '#include <stdint.h>',
      '#define GPIOD_MODER (*(volatile uint32_t *)0x40020C00)',
      '#define GPIOD_ODR   (*(volatile uint16_t *)0x40020C14)',
      '',
    ];
    for (const [p, name] of outs) lines.push(`GPIOD_MODER |= (1u << ${2 * p});`.padEnd(32) + `// PD${p} (${name}) = output`);
    if (outs.length) lines.push('');
    for (const [p] of highs) lines.push(`GPIOD_ODR |= (1u << ${p});`.padEnd(32) + `// drive PD${p} high`);
    if (!highs.length) lines.push('// no pin is both an output and driven high');
    root.querySelector('.dbg-code code')!.innerHTML = lines.map((l, n) =>
      `<span class="ln"><span class="gutter">${n + 1}</span>${(l.replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/(\/\/.*)$/, '<span class="c-comment">$1</span>')
        .replace(/\b(volatile|uint32_t|uint16_t|include)\b/g, '<span class="c-type">$1</span>')
        .replace(/\b(0x[0-9A-F]+|\d+u?)\b/g, '<span class="c-num">$1</span>')) || ' '}</span>`).join('');

    root.querySelector('.dbg-regs')!.innerHTML = `MODER <b>${hexN(moder(), 32)}</b> · ODR <b>${hexN(odr(), 16)}</b>`;
    root.querySelector('.pintab tbody')!.innerHTML = LEDS.map(([p, name, color]) => `
      <tr${lit(p) ? ' class="on"' : ''}>
        <td class="pn">PD${p} <small>${name}</small></td>
        <td><div class="mseg" role="radiogroup" aria-label="PD${p} mode">${MODES.map((m, k) =>
          `<button type="button" role="radio" data-pin="${p}" data-mode="${k}" aria-checked="${mode[p] === k}" title="MODER field = ${k.toString(2).padStart(2, '0')}"><span class="lg">${m}</span><span class="sm">${SHORT[k]}</span></button>`).join('')}</div></td>
        <td><button type="button" class="obit${out[p] ? ' hi' : ''}" data-odr="${p}" aria-pressed="${!!out[p]}">${out[p]}</button></td>
        <td><span class="led${lit(p) ? ' on' : ''}" style="--led:${color}" aria-label="${name} LED ${lit(p) ? 'on' : 'off'}"></span></td>
      </tr>`).join('');

    const explain = () => {
      if (highs.length) return `${highs.map(([p, n]) => `PD${p} is an output and driven high, so the ${n} LED is on`).join('; ')}. The writes went to the GPIO hardware at 0x40020C00 and 0x40020C14, not to memory.`;
      const stuck = LEDS.filter(([p]) => out[p] && mode[p] !== 1);
      if (stuck.length) return `${stuck.map(([p]) => `PD${p}`).join(', ')} ${stuck.length === 1 ? 'is' : 'are'} set high in ODR but not configured as ${stuck.length === 1 ? 'an output' : 'outputs'}, so the write to ODR has no effect. Set the mode to Output.`;
      return 'No LED is lit. A pin lights only when its mode is Output and its ODR bit is 1.';
    };
    status(root, explain());
    syncUrl({ m: moder().toString(16).toUpperCase(), o: odr().toString(16).toUpperCase() });
  }

  draw();
  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    const m = t.closest<HTMLElement>('[data-mode]');
    const od = t.closest<HTMLElement>('[data-odr]');
    if (m) mode[Number(m.dataset.pin)] = Number(m.dataset.mode);
    else if (od) out[Number(od.dataset.odr)] ^= 1;
    else return;
    draw();
  });
}
