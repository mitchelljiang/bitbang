# bitbang

An interactive site for learning embedded systems: **[bitbang.fyi](https://bitbang.fyi)**

It's for students and early-career engineers who know some C and want to see what the hardware actually does: the bits on a wire, the bytes in memory, the order things run in. Each page answers one question with a diagram you can change, followed by a few paragraphs of explanation.

## What's covered

| Area | Sections |
|---|---|
| **Data** | Bits and bytes, Protocols |
| **Hardware** | Architecture, Memory, Peripherals, Power and clocks |
| **Software** | C for embedded, Compilers, Concurrency, Drivers |

Every section starts with an overview that sets out the route through it and what to read first. Settings are kept in the URL, so any view can be shared. Pages list their sources, with datasheets first where there are any.

## Status

The site is live and under active development. All ten sections are published, and a few protocols are still marked as in progress or coming soon. Recent changes are on the [changelog](https://bitbang.fyi/?p=changelog).

## How it's checked

Accuracy matters more than coverage here, so page logic is tested against independent references wherever one exists: published specifications and datasheets, real compilers and linkers, and third-party protocol decoders. Listings on the C and Compilers pages are real tool output. A browser test also loads every page and exercises its controls.

## Develop

```sh
npm install
npm run dev      # local dev server
npm run build    # type-check and build to dist/
npm run verify   # accuracy checks
npm run smoke    # every page in headless Chrome
```

Plain TypeScript and Vite, with no framework or runtime dependencies. Some checks use external tools such as Clang, Python and sigrok, and are skipped when those aren't installed.

## Deploy

Pushing to `main` builds and deploys to GitHub Pages through `.github/workflows/deploy.yml`.

## Feedback

Spotted a mistake or want something added? Please open an issue.
