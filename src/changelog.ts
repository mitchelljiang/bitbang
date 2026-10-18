import { esc } from './core/render';

/**
 * The changelog page (?p=changelog). Add a release at the top of CHANGES, newest first. Each change is new (pages and
 * features), improved (design and usability) or fixed (bugs and corrections). Keep entries short, and fold small
 * design fixes into one "Minor UI/UX fixes and updates" line; only big changes get their own. Links use `?p=id`.
 */
type Kind = 'new' | 'improved' | 'fixed';

const CHANGES: { date: string; items: [Kind, string][] }[] = [
  {
    date: '2026-10-18',
    items: [
      ['new', 'The Memory section is complete: the [memory map](?p=memmap), the [bus matrix](?p=interconnect), [stack frames](?p=frames), [stack overflow](?p=overflow), [sections and startup](?p=sections), [SRAM, DRAM and Flash](?p=cells), [caches](?p=caches), [virtual memory](?p=vaddr), [page tables and the TLB](?p=paging), and the [MPU and MMU](?p=mpu).'],
      ['new', 'Start-of-frame (SOF) packets on the [USB 2.0](?p=usb) page.'],
      ['improved', 'The Memory section’s diagrams are drawn as a bench instrument, the same family as the oscilloscope.'],
      ['improved', 'Minor UI/UX fixes and updates.'],
    ],
  },
  {
    date: '2026-10-17',
    items: [
      ['new', 'A Memory section, starting with [function calls](?p=calls) on a Cortex-M4.'],
      ['new', 'A [buffer overflow](?p=bufover) page: how an unchecked copy overwrites the return address, and what stops it.'],
      ['new', 'More Memory pages: [memory-mapped I/O](?p=mmio), [alignment](?p=alignment), [the stack](?p=stack) and [the heap](?p=heap), with garbage collection.'],
      ['new', 'A Concurrency section, drawn as a trace timeline, starting with [interrupts](?p=interrupts).'],
      ['new', 'Ethernet: [the frame](?p=ethframe), [100BASE-TX](?p=100base), [1000BASE-T](?p=1000baset), [1000BASE-X](?p=1000basex) and [MII and RMII](?p=rmii).'],
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
const linkify = (s: string) => esc(s).replace(/\[([^\]]+)\]\((\?p=[a-z0-9]+)\)/g, '<a href="$2" data-nav>$1</a>');

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
