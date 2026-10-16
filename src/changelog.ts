import { esc } from './core/render';

/**
 * The changelog page (?p=changelog). Add a release at the top of CHANGES, newest first. Each change is new (pages and
 * features), improved (design and usability) or fixed (bugs and corrections). Links to pages use `?p=id`.
 */
type Kind = 'new' | 'improved' | 'fixed';

const CHANGES: { date: string; items: [Kind, string][] }[] = [
  {
    date: '2026-10-16',
    items: [
      ['new', 'This changelog.'],
      ['improved', 'The home page says “Hi” in a different protocol on each visit: UART, RS-232, RS-485, SPI, I²C or I3C.'],
      ['improved', 'Back and Forward return to the same place on the page, and so does reloading.'],
      ['improved', 'On phones, long registers wrap one field at a time, the scope toolbar fits on two lines, and the home page readout stays on one line.'],
      ['improved', 'The Bit manipulation sidebar opens with a Start here group, as Protocols does.'],
      ['improved', 'Numbers that change while stepping through a frame keep the same width, so the text around them stays still.'],
      ['fixed', 'Copy link no longer shifts the buttons beside it when it changes to “Copied”.'],
      ['fixed', 'The 10BASE-T page no longer suggests the standard is obsolete; most Ethernet ports still support it.'],
    ],
  },
  {
    date: '2026-10-15',
    items: [
      ['new', 'A Bit manipulation section, drawn as a debugger paused on a few lines of C: [Binary and hexadecimal](?p=binary), [two’s complement](?p=twos), [fixed point](?p=fixed), [IEEE 754 floating point](?p=float) and [AND, OR, XOR and NOT](?p=bitwise).'],
      ['new', 'Quake III’s fast inverse square root, step by step, on the floating point page.'],
      ['new', '[WS2812](?p=ws2812) addressable LEDs.'],
      ['new', 'A Related resources section at the bottom of every page, for specifications, datasheets and videos.'],
      ['improved', 'Waveforms appear on a bench oscilloscope, with a channel color per wire, a readout bar, a graticule labeled with its time per division, and a cursor that follows the pointer.'],
      ['improved', 'A new home page that opens by sweeping “Hi” across the scope, then shows each section.'],
      ['improved', 'Section tabs in the header, a sidebar for each section, and Previous and Next links at the bottom of each page.'],
      ['improved', 'Walkthroughs center themselves in the window and move in a single motion.'],
      ['improved', 'Scrollbars are replaced by a thin progress line along the bottom of the window.'],
      ['improved', 'Settings are arranged in balanced rows, and the explanation box fits its text.'],
      ['fixed', 'The cursor time and the time per division now match the graticule exactly.'],
      ['fixed', 'Scrolling past the end of a waveform no longer shows a white band.'],
      ['fixed', 'Pages no longer flash unstyled content or move the footer while loading.'],
    ],
  },
  {
    date: '2026-10-14',
    items: [
      ['new', '[PCI](?p=pci), [PCIe](?p=pcie) with an interactive eye diagram, and [USB 2.0](?p=usb), including high speed.'],
      ['new', 'Search in the top bar, by name or tag.'],
      ['new', 'An [About](?p=about) page.'],
      ['improved', 'Every setting has an explanation of what it does to the diagram.'],
      ['improved', 'Going deeper sections for Quad SPI, 1-Wire, I²S, RS-232, RS-485, 10BASE-T, JTAG and SWD.'],
      ['improved', 'SPI clock rates up to 80 MHz.'],
      ['fixed', 'USB NAK and STALL handshakes for SETUP and IN transactions.'],
      ['fixed', 'Corrections found by automated accuracy checks against independent decoders.'],
    ],
  },
  {
    date: '2026-10-13',
    items: [
      ['new', 'bitbang launches with [UART](?p=uart), [SPI](?p=spi) and [I²C](?p=i2c).'],
      ['new', '[I3C](?p=i3c) including HDR-DDR, 10-bit I²C addresses, [Quad SPI](?p=qspi), [1-Wire](?p=onewire), [I²S](?p=i2s), [RS-232](?p=rs232) and [RS-485](?p=rs485).'],
      ['new', '[10BASE-T](?p=ethernet), [JTAG](?p=jtag) and [SWD](?p=swd).'],
      ['new', 'A guide, [How protocols work](?p=basics), and a spec sheet on every protocol page.'],
      ['new', 'Walkthroughs for every protocol, I²C register reads and clock stretching, and Going deeper sections.'],
      ['improved', 'The menu is grouped by protocol family.'],
      ['fixed', 'I3C samples data on the rising edge of SCL.'],
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
