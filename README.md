# bitbang

In-depth, bit-level timing diagrams of communication protocols: **[bitbang.fyi](https://bitbang.fyi)**

Type in some bytes, pick your settings, and see every bit that goes out on the wire. Click any bit to find out what it's doing there, or take the walkthrough for a guided tour of the frame.

## Protocols

| Group | Protocols |
|---|---|
| Synchronous buses | SPI, Quad SPI, I²C, I3C (SDR, HDR-DDR, ENTDAA) |
| Asynchronous serial | UART, RS-232, RS-485, 1-Wire |
| Expansion buses | PCI, PCIe Gen1/Gen2 (x1 to x8) |
| USB | USB 2.0 (low and full speed) |
| Audio | I²S |
| Networking | 10BASE-T Ethernet |
| Debug & programming | JTAG, SWD |

USB 3.x and USB4 have under-construction pages, and more protocols are listed in the menu as coming soon.

## What's on each page

- **A live timing diagram** drawn from your settings, with sample points, callouts, and lines drawn the way they behave: square edges for push-pull, slow RC rises for open-drain buses like I²C.
- **Bit-by-bit explanations.** Click a bit, step with ← →, or press Space to play.
- **A walkthrough** that zooms from one part of the frame to the next, with a short explanation at each stop.
- **At a glance:** clock, wires, drive, duplex, topology, addressing, flow control, error checking, speed and reach.
- **Trade-offs and "Going deeper":** what each protocol is good and bad at, and the practical details that trip people up.
- **Shareable links.** Every setting is in the URL.

There's also a [How protocols work](https://bitbang.fyi) guide, which is the home page.

## How the diagrams are checked

Every waveform is checked two ways:

1. **Bit check:** a script reads each waveform back off the wire at every sample point and confirms it matches what each bit claims to be.
2. **Independent decoders:** waveforms are exported as VCD files and decoded with [sigrok](https://sigrok.org)'s protocol decoders (UART, SPI, I²C, I²S, 1-Wire, JTAG, SWD, USB and SPI flash), which were written separately from the specs. 10BASE-T frames are checked against Python's `zlib.crc32`, PCIe's 8b/10b encoder against reference codes and the encoding's structural properties, and PCI transactions against the bus handshake rules.

There are no sigrok decoders for I3C, PCI or PCIe, so those are the least independently verified, especially I3C HDR-DDR and ENTDAA. Corrections are welcome.

## Develop

```sh
npm install
npm run dev     # http://localhost:5173
npm run build   # type-check + build to dist/
```

Plain TypeScript and Vite, with no framework. Diagrams are SVG generated in `src/core/render.ts`.

## Adding a protocol

1. Write `src/protocols/<name>.ts` exporting a `Protocol`. Its `encode(params)` turns the user's settings into a `Waveform`:
   - **traces:** one per wire, as a list of level changes over time (`openDrain` for pulled-up lines)
   - **bits:** annotated bits (start, data, ACK…) with an explanation and a sample time
   - **fields:** higher-level groupings, like bytes and addresses
   - **notes:** optional callouts drawn above a trace
2. Fill in `fullName`, `summary`, `usedIn`, `facts`, `strengths` and `limits`, and optionally `deepDive`.
3. Add it to `src/protocols/index.ts`, and give it an entry in `src/catalog.ts` so it shows up in the menu.
4. Optionally add a walkthrough in `src/tours.ts`.

The renderer, stepper, legend and walkthrough are all protocol-agnostic.

## Deploy

Pushing to `main` builds and deploys to GitHub Pages through `.github/workflows/deploy.yml`. `public/CNAME` points Pages at `bitbang.fyi`.

## Feedback

Spotted a mistake or want a protocol added? Use the **Send feedback** link at the bottom of the site, or open an issue.
