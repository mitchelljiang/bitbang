# bitbang

See communication protocols at the bit level: **[bitbang.fyi](https://bitbang.fyi)**

Type some bytes, pick your settings, and step through the frame bit by bit, with an explanation of what each bit is doing on the wire. Currently covers UART, SPI and I²C.

## Develop

```sh
npm install
npm run dev     # http://localhost:5173
npm run build   # type-check + build to dist/
```

## Adding a protocol

Each protocol is a single file in `src/protocols/` that exports a `Protocol`. Its `encode(params)` turns the user's settings into a `Waveform`:

- **traces**: one per wire, as a list of level changes over time
- **bits**: annotated bits (start, data, ACK…) with an explanation and sample time
- **fields**: higher-level groupings, like bytes and addresses

The renderer and stepper are protocol-agnostic. Add the new protocol to `src/protocols/index.ts` and it becomes a link in the Protocols menu. The first protocol in that list is what the site opens on.

## Deploy

Pushing to `main` builds and deploys to GitHub Pages through `.github/workflows/deploy.yml`. `public/CNAME` points Pages at `bitbang.fyi`.
