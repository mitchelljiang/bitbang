import { esc } from './core/render';

/**
 * The changelog page (?p=changelog). Add a release at the top of CHANGES, newest first. Each change is new (pages and
 * features), improved (design and usability) or fixed (bugs and corrections). Write terse fragments, not full
 * sentences, and fold small design fixes into one "Minor UI/UX fixes and updates" line; only big changes get their own.
 * Links use `?p=id`.
 */
type Kind = 'new' | 'improved' | 'fixed';

const CHANGES: { date: string; items: [Kind, string][] }[] = [
  {
    date: '2026-11-07',
    items: [
      ['new', 'Peripherals section: [GPIO](?p=gpio), [debouncing](?p=debounce), [timers](?p=timers), [PWM](?p=pwm), [watchdog](?p=watchdog), [ADC](?p=adc), [DAC](?p=dac), [DMA](?p=dma).'],
      ['new', 'Architecture section, starting with [instruction encoding](?p=instructions) for Arm Thumb, RISC-V and Xtensa, checked against Clang and Capstone.'],
      ['new', 'Compilers section: [preprocessor](?p=preprocess), [compiling](?p=compile), [object files](?p=objects), [linking](?p=linking), [linker scripts](?p=linker-script), [map files](?p=mapfile), [optimization levels](?p=optimize), [volatile](?p=volatile), [undefined behavior](?p=ub). Real Clang and LLD output for a Cortex-M0+.'],
      ['improved', 'Three tabs: Data, Hardware and Software, with their sections in the sidebar.'],
      ['improved', 'Icons on the tabs, and a drawing for each section on the home page.'],
      ['new', 'Start here page for every section, such as [Architecture](?p=architecture-start): the route, what to read first, and the words used.'],
      ['improved', 'Formulas typeset as equations.'],
      ['improved', 'Phone header matches the desktop one: logo, search and theme on one row, sections below.'],
      ['fixed', 'Previous and Next open the new page at the top.'],
      ['fixed', 'Phone: [scheduling](?p=scheduling) policies, [function calls](?p=calls) buttons and the [bus matrix](?p=interconnect) no longer spill out of their panels.'],
      ['improved', 'Minor UI/UX fixes and updates.'],
    ],
  },
  {
    date: '2026-10-22',
    items: [
      ['improved', 'Faster first load: each page loads on demand.'],
      ['improved', 'Smooth motion: sliding selections, settling bits, a gliding [memory map](?p=memmap) highlight.'],
      ['improved', 'Hover and press feedback on buttons.'],
      ['improved', 'Same step controls everywhere: Back, Step, Play, Restart.'],
      ['improved', 'Consistent controls; diagrams no longer resize or shift as values change.'],
      ['improved', 'Minor UI/UX fixes and updates.'],
    ],
  },
  {
    date: '2026-10-21',
    items: [
      ['improved', 'Minor UI/UX fixes and updates.'],
    ],
  },
  {
    date: '2026-10-20',
    items: [
      ['new', 'Concurrency start page: [Parts and terms](?p=mcu), with a glossary.'],
      ['new', 'Concurrency complete: [priorities](?p=priorities), [context switching](?p=context), [scheduling](?p=scheduling), [races](?p=races), [atomics](?p=atomics), [mutexes and semaphores](?p=locks).'],
      ['new', '[Memory ordering and barriers](?p=barriers): DMB, DSB and ISB.'],
      ['improved', 'Concurrency traces drawn as a logic analyzer.'],
      ['improved', 'Minor UI/UX fixes and updates.'],
    ],
  },
  {
    date: '2026-10-18',
    items: [
      ['new', 'Memory complete: [memory map](?p=memmap), [bus matrix](?p=interconnect), [stack frames](?p=frames), [stack overflow](?p=overflow), [startup](?p=sections), [SRAM, DRAM and Flash](?p=cells), [caches](?p=caches), [virtual memory](?p=vaddr), [paging and the TLB](?p=paging), [MPU and MMU](?p=mpu).'],
      ['new', 'USB 2.0 [start-of-frame packets](?p=usb).'],
      ['improved', 'Memory diagrams drawn as a bench instrument.'],
      ['improved', 'Minor UI/UX fixes and updates.'],
    ],
  },
  {
    date: '2026-10-17',
    items: [
      ['new', 'Memory section: [function calls](?p=calls) on a Cortex-M4.'],
      ['new', '[Buffer overflow](?p=bufover): overwriting the return address, and the defenses.'],
      ['new', '[Memory-mapped I/O](?p=mmio), [alignment](?p=alignment), [the stack](?p=stack), [the heap](?p=heap) with garbage collection.'],
      ['new', 'Concurrency section: [interrupts](?p=interrupts) on a trace timeline.'],
      ['new', 'Ethernet: [the frame](?p=ethframe), [100BASE-TX](?p=100base), [1000BASE-T](?p=1000baset), [1000BASE-X](?p=1000basex), [MII and RMII](?p=rmii).'],
      ['improved', 'Minor UI/UX fixes and updates.'],
    ],
  },
  {
    date: '2026-10-16',
    items: [
      ['new', '[Shifts and rotates](?p=shifts), [masks](?p=masks), [bit tricks](?p=tricks), [read-modify-write](?p=rmw), [endianness](?p=endianness), [overflow and status flags](?p=flags) and [checksums and CRC](?p=crc).'],
      ['new', 'This changelog.'],
      ['improved', 'Bit manipulation is now Bits and bytes.'],
      ['improved', 'The home page says “Hi” in a random protocol.'],
      ['improved', 'Minor UI/UX fixes and updates.'],
    ],
  },
  {
    date: '2026-10-15',
    items: [
      ['new', 'Bit manipulation: [binary and hex](?p=binary), [two’s complement](?p=twos), [fixed point](?p=fixed), [floating point](?p=float) and [bitwise logic](?p=bitwise).'],
      ['new', '[WS2812](?p=ws2812) LEDs.'],
      ['new', 'Related resources on every page.'],
      ['improved', 'Waveforms shown on an oscilloscope.'],
      ['improved', 'New home page and section navigation.'],
      ['improved', 'Minor UI/UX fixes and updates.'],
    ],
  },
  {
    date: '2026-10-14',
    items: [
      ['new', '[PCI](?p=pci), [PCIe](?p=pcie) with an eye diagram, and [USB 2.0](?p=usb).'],
      ['new', 'Search, and an [About](?p=about) page.'],
      ['improved', 'Every setting explained, and more Going deeper sections.'],
      ['fixed', 'USB NAK and STALL handshakes, and other accuracy fixes.'],
    ],
  },
  {
    date: '2026-10-13',
    items: [
      ['new', 'Launch with [UART](?p=uart), [SPI](?p=spi) and [I²C](?p=i2c).'],
      ['new', '[I3C](?p=i3c), [Quad SPI](?p=qspi), [1-Wire](?p=onewire), [I²S](?p=i2s), [RS-232](?p=rs232), [RS-485](?p=rs485), [10BASE-T](?p=ethernet), [JTAG](?p=jtag) and [SWD](?p=swd).'],
      ['new', '[How protocols work](?p=basics), spec sheets and walkthroughs.'],
      ['fixed', 'I3C sampling edge.'],
    ],
  },
];

const LABEL: Record<Kind, string> = { new: 'New', improved: 'Improved', fixed: 'Fixed' };

/** Plain text with [text](?p=id) links to other pages. */
const linkify = (s: string) => esc(s).replace(/\[([^\]]+)\]\((\?p=[a-z0-9-]+)\)/g, '<a href="$2" data-nav>$1</a>');

const day = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
const ORDER: Kind[] = ['new', 'improved', 'fixed'];

/** The text of every entry, for the link checks. */
export const CHANGELOG_TEXT = CHANGES.flatMap((c) => c.items.map(([, t]) => t)).join('\n');

/** A vertical timeline: one node per release, its date beside it, and its changes tagged New, Improved or Fixed. */
export function mountChangelog(root: HTMLElement) {
  root.innerHTML = `
    <article class="changelog">
      <header class="intro">
        <p class="crumbs">Changelog</p>
        <h1>What’s new</h1>
        <p>New pages, design and usability changes, and fixes, newest first.</p>
      </header>
      <ol class="timeline">${CHANGES.map((c) => `
        <li class="release">
          <p class="when"><time datetime="${c.date}">${day(c.date)}</time><span>${c.items.length} changes</span></p>
          <ul class="changes">${[...c.items].sort((x, y) => ORDER.indexOf(x[0]) - ORDER.indexOf(y[0])).map(([k, t]) => `
            <li class="change ${k}"><span class="kind">${LABEL[k]}</span><span>${linkify(t)}</span></li>`).join('')}
          </ul>
        </li>`).join('')}
      </ol>
    </article>`;
}
