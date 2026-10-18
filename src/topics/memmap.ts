/**
 * The memory map: on a Cortex-M the whole 4 GB address space is divided into fixed regions, and an address alone tells
 * you what it reaches, Flash, SRAM, a peripheral register or the core's own control block. Type an address, or pick a
 * landmark, and the map highlights the region it falls in. regionOf is exported for the checks.
 */
import { status, syncUrl } from './dbg';

export interface Region {
  id: string;
  name: string;
  lo: number;
  hi: number;
  /** What lives here, and why it matters. */
  use: string;
  /** A concrete landmark inside the region. */
  example?: string;
}

/** The ARMv7-M address space, with STM32F4 landmarks. High addresses first, the way a memory map is usually drawn. */
export const REGIONS: Region[] = [
  { id: 'vendor', name: 'Vendor / debug', lo: 0xe0100000, hi: 0xffffffff, use: 'Reserved for vendor-specific features and the debug ROM table.' },
  { id: 'ppb', name: 'Private Peripheral Bus', lo: 0xe0000000, hi: 0xe00fffff, use: 'The core’s own control registers: the NVIC, SysTick and the System Control Block at 0xE000E000. This is where the CPU configures its own interrupts and faults, not a peripheral on the bus.', example: 'SysTick → 0xE000E010' },
  { id: 'extdev', name: 'External device', lo: 0xa0000000, hi: 0xdfffffff, use: 'Off-chip devices mapped into the address space. Unlike external RAM, accesses here are never cached or buffered, so each one reaches the device in order.' },
  { id: 'extram', name: 'External RAM', lo: 0x60000000, hi: 0x9fffffff, use: 'Off-chip memory through the FSMC/FMC controller: SDRAM, static RAM or NOR flash, made to look like part of the address space.' },
  { id: 'periph', name: 'Peripheral', lo: 0x40000000, hi: 0x5fffffff, use: 'Memory-mapped peripheral registers: GPIO, timers, UART, SPI. A write here does not store a value, it changes hardware.', example: 'GPIOD→ODR → 0x40020C14' },
  { id: 'sram', name: 'SRAM', lo: 0x20000000, hi: 0x3fffffff, use: 'On-chip RAM. Globals (.data and .bss) sit at the bottom, the heap grows up from there, and the stack grows down from the top.', example: 'stack top → 0x2001FFF0' },
  { id: 'code', name: 'Code', lo: 0x00000000, hi: 0x1fffffff, use: 'Flash and the boot region. The vector table is at the very bottom; on reset the core reads the initial stack pointer and the reset address from here. Flash is aliased to 0x08000000.', example: 'vector table → 0x08000000' },
];

/** The region an address falls in, or undefined if it somehow matches none (it never should: the regions tile 0–4 GB). */
export const regionOf = (addr: number): Region | undefined =>
  REGIONS.find((r) => (addr >>> 0) >= r.lo && (addr >>> 0) <= r.hi);

/** Landmarks the reader can jump to, each tied to the page that explains it. */
const MARKS: { label: string; addr: number; note: string }[] = [
  { label: 'Vector table', addr: 0x08000000, note: 'The reset vector and interrupt handlers, read by the core on reset and on every interrupt.' },
  { label: 'A global', addr: 0x20000010, note: 'A variable in .data or .bss, placed in SRAM by the linker and initialised before main().' },
  { label: 'Stack top', addr: 0x2001fff0, note: 'The stack starts at the top of SRAM and grows down; SP is loaded from the vector table on reset.' },
  { label: 'GPIOD→ODR', addr: 0x40020c14, note: 'A peripheral register: writing a bit here drives a pin, because the peripheral lives in the address space.' },
  { label: 'SysTick', addr: 0xe000e010, note: 'The core’s own timer, in the Private Peripheral Bus, reached by the CPU but not sitting on the peripheral bus.' },
];

const hex8 = (v: number) => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(8, '0');

export function mountMemmap(root: HTMLElement) {
  const q = new URLSearchParams(location.search).get('a');
  const start = parseInt(q ?? '', 16);
  let addr = Number.isInteger(start) ? start >>> 0 : 0x20000010;

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">The address space</p>
      <h1>Memory map</h1>
      <p>A processor has one address space, and everything it can reach has an address in it: the program in Flash, the
        variables in RAM, every peripheral register, even the core’s own controls. On a Cortex-M the 4 GB space is split
        into fixed regions, so the top bits of an address alone tell you what kind of thing it reaches. Type an address,
        or pick a landmark, and see which region it lands in.</p>
    </section>
    <section class="debugger mem memmap" aria-label="Memory map">
      <header class="dbg-bar">
        <span class="dbg-file">STM32F4 · address space</span>
        <span class="dbg-state"><i aria-hidden="true"></i>4 GB</span>
        <div class="dbg-controls">
          <label class="dbg-set">addr <input type="text" inputmode="text" spellcheck="false" aria-label="Address in hex" value="${hex8(addr)}"></label>
          <div class="mm-marks">${MARKS.map((m, i) => `<button type="button" class="dbg-btn" data-mark="${i}">${m.label}</button>`).join('')}</div>
        </div>
      </header>
      <div class="mm-body"></div>
      <p class="dbg-status" aria-live="polite"></p>
    </section>
    <section class="prose">
      <h2>Why the map is fixed</h2>
      <p>The ARMv7-M architecture defines these regions for every Cortex-M part, so a compiler, a debugger and an
        operating system all agree on what an address means without asking the chip. A vendor then places its real Flash
        and RAM inside the Code and SRAM regions and wires its peripherals into the Peripheral region. That is why the
        same <a href="?p=interrupts" data-nav>vector table</a> layout and the same <code>0xE000E000</code> system
        registers work on parts from every manufacturer.</p>
      <h2>Alias regions</h2>
      <p>The Code region starts at <code>0x00000000</code>, but the Flash is usually also visible at
        <code>0x08000000</code>. On reset the core fetches the initial stack pointer and reset address from address 0, so
        the boot configuration maps either Flash, system memory or RAM to appear there. The two addresses reach the same
        bytes; the alias just lets the vector table live at address 0 where the hardware expects it.</p>
      <h2>Reading the top bits</h2>
      <p>Because the regions fall on half-gigabyte boundaries, the processor decides where an access goes from the high
        bits of the address, long before the full address is known. That is how one <a href="?p=interconnect" data-nav>bus
        matrix</a> routes a load to Flash, RAM or a peripheral: it switches on the top nibble. An address in the
        <a href="?p=mmio" data-nav>Peripheral</a> region is handed to the peripheral bus; one in SRAM goes to the memory
        controller.</p>
    </section>`;

  const input = root.querySelector<HTMLInputElement>('.dbg-set input')!;

  function draw(note?: string) {
    const here = regionOf(addr)!;
    root.querySelector('.mm-body')!.innerHTML = REGIONS.map((r) => {
      const on = r.id === here.id;
      const span = `${hex8(r.lo)} – ${hex8(r.hi)}`;
      return `<div class="mm-region${on ? ' on' : ''}" data-region="${r.id}">
        <div class="mm-head"><span class="mm-name">${r.name}</span><span class="mm-range">${span}</span></div>
        <div class="mm-use">${r.use}${r.example ? ` <span class="mm-ex">${r.example}</span>` : ''}</div>
        ${on ? `<div class="mm-here">${hex8(addr)} is here<span>offset +0x${(addr - r.lo >>> 0).toString(16).toUpperCase()} into ${r.name}</span></div>` : ''}
      </div>`;
    }).join('');

    const offset = (addr - here.lo) >>> 0;
    status(root, note ?? `${hex8(addr)} is in the <b>${here.name}</b> region, 0x${offset.toString(16).toUpperCase()} bytes above its base ${hex8(here.lo)}. ${here.use}`);
    syncUrl({ a: (addr >>> 0).toString(16).toUpperCase() });
  }

  function setAddr(v: number, note?: string) {
    addr = v >>> 0;
    input.value = hex8(addr);
    draw(note);
  }

  draw();
  input.addEventListener('input', () => {
    const v = parseInt(input.value.replace(/^0x/i, ''), 16);
    if (Number.isInteger(v)) { addr = v >>> 0; draw(); }
    else status(root, 'Type a hex address, such as 0x20000010 or 40020C14.');
  });
  root.addEventListener('click', (e) => {
    const mk = (e.target as Element).closest<HTMLElement>('[data-mark]');
    if (mk) { const m = MARKS[Number(mk.dataset.mark)]; setAddr(m.addr, `<b>${m.label}</b> is at ${hex8(m.addr)}, in the ${regionOf(m.addr)!.name} region. ${m.note}`); }
  });
}
