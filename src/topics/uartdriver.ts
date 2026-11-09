/**
 * The interrupt-driven UART page: bytes arrive at a fixed rate into a hardware FIFO, and interrupts are off for a while.
 * `uartRun` is exported; verify checks it against an independent arrival-by-arrival count over a grid of settings.
 */
import { markSeg, oneOf, reservedStatus, seg, syncUrl } from './dbg';

/** Microseconds per byte: start bit, 8 data bits, stop bit. */
export const byteUs = (baud: number) => 10e6 / baud;
/** The longest interrupts can stay off before a byte is lost: FIFO depth × byte time. */
export const maxOffUs = (baud: number, depth: number) => depth * byteUs(baud);

/** Bytes arrive every `byteUs` from t = 0; the handler empties the FIFO at once unless interrupts are off in [off, off + us). */
export function uartRun(baud: number, depth: number, off: number, us: number, spanUs: number) {
  const t = byteUs(baud), points: { t: number; level: number; lost: boolean }[] = [];
  let level = 0, lost = 0;
  for (let k = 1; k * t <= spanUs; k++) {
    const at = k * t;
    const blocked = at >= off && at < off + us;
    if (!blocked) { level = 0; points.push({ t: at, level: 0, lost: false }); continue; }
    if (level < depth) { level++; points.push({ t: at, level, lost: false }); }
    else { lost++; points.push({ t: at, level, lost: true }); }
  }
  return { points, lost };
}

const BAUDS = ['9600', '115200', '1000000'] as const;
const DEPTHS = ['1', '8', '32'] as const;
const OFFS = ['100', '1000', '10000'] as const;
const label = (us: number) => (us >= 1000 ? `${us / 1000} ms` : `${us.toFixed(us < 100 ? 1 : 0)} µs`);

export function mountUartDriver(root: HTMLElement) {
  let baud = oneOf('b', BAUDS, '115200'), depth = oneOf('d', DEPTHS, '1'), off = oneOf('o', OFFS, '1000');
  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Moving data</p>
      <h1>Interrupt-driven UART</h1>
      <p>A UART receives one byte at a time, whether or not the program is ready. Waiting in a loop for each byte wastes the whole processor. An
        interrupt fixes that, but interrupts are sometimes turned off, and then the only thing holding the data is a small FIFO. Find out how long is too long.</p>
    </section>
    <section class="debugger uartd" aria-label="UART receive FIFO">
      <header class="dbg-bar"><span class="dbg-file">RX FIFO</span></header>
      <div class="pp-tabs bat-tabs">
        <span class="bat-c"><small>Baud</small>${seg('b', 'Baud rate', [['9600', '9600'], ['115200', '115200'], ['1000000', '1 M']])}</span>
        <span class="bat-c"><small>FIFO</small>${seg('d', 'FIFO depth', DEPTHS.map((d) => [d, d]))}</span>
        <span class="bat-c"><small>Interrupts off for</small>${seg('o', 'Time with interrupts off', [['100', '100 µs'], ['1000', '1 ms'], ['10000', '10 ms']])}</span>
      </div>
      <div class="ud-plot"></div>
      <div class="pp-read ud-read"></div>
      <p class="dbg-status" aria-live="polite"></p>
    </section>
    <section class="prose">
      <h2>How long a byte takes</h2>
      <p>With 8 data bits, a start bit and a stop bit, one byte is 10 bit times. At 115200 baud that is 86.8 µs, so at a 100 MHz core clock, polling burns about 8,700 cycles per byte just waiting. An interrupt
        handler that reads the byte costs perhaps a hundred.</p>
      <h2>The limit</h2>
      <p>While interrupts are off, bytes pile up in the FIFO, and when it is full the next byte is lost and the UART’s overrun flag is set. So the longest safe time is the FIFO’s depth times the byte time. A one-byte holding register at 115200 baud gives 86.8 µs. The RP2040’s UART has a 32-entry FIFO, which gives 2.8 ms.</p>
      <h2>What a driver does</h2>
      <p>The handler moves bytes from the FIFO into a <a href="?p=ring-buffer" data-nav>ring buffer</a> and returns. The UART can interrupt at a FIFO level instead of per byte, with a timeout for the final few, so the handler runs less often. Always check and clear the error flags: an unhandled overrun can leave the interrupt stuck asserted on some parts. For sustained high rates, see <a href="?p=dma-driver" data-nav>DMA drivers</a>.</p>
    </section>`;
  const panel = root.querySelector<HTMLElement>('.uartd')!;
  const text = (lost: number, safe: number, us: number) => lost ? `Interrupts were off for ${label(us)}, but the FIFO only covers ${label(safe)}. ${lost} byte${lost === 1 ? ' was' : 's were'} lost, and the UART set its overrun flag.` : `The FIFO covers ${label(safe)}, longer than the ${label(us)} with interrupts off. Nothing is lost: the handler empties it as soon as interrupts return.`;
  const offAtFor = (b: number, o: number) => Math.max(o * 0.5, byteUs(b) * 2);
  const spanFor = (b: number, o: number) => offAtFor(b, o) + o + Math.max(o * 0.5, byteUs(b) * 4);
  const say = reservedStatus(panel, BAUDS.flatMap((b) => DEPTHS.flatMap((d) => OFFS.map((o) => text(uartRun(Number(b), Number(d), offAtFor(Number(b), Number(o)), Number(o), spanFor(Number(b), Number(o))).lost, maxOffUs(Number(b), Number(d)), Number(o))))));
  function draw() {
    const b = Number(baud), d = Number(depth), o = Number(off);
    const offAt = offAtFor(b, o), span = spanFor(b, o);
    const r = uartRun(b, d, offAt, o, span);
    const x = (t: number) => (t / span) * 560, y = (l: number) => 120 - (l / d) * 108;
    const step = r.points.length > 400 ? Math.ceil(r.points.length / 400) : 1;
    let path = `M0 ${y(0)}`, prev = 0;
    r.points.forEach((p, i) => { if (i % step === 0 || p.level !== prev) { path += `H${x(p.t).toFixed(1)}V${y(p.level).toFixed(1)}`; prev = p.level; } });
    const firstLost = r.points.find((p) => p.lost);
    root.querySelector('.ud-plot')!.innerHTML = `<svg viewBox="0 0 560 130" preserveAspectRatio="none" aria-hidden="true"><rect x="${x(offAt)}" y="0" width="${x(o)}" height="130" class="off"/><path d="M0 ${y(d)}H560" class="th"/><path d="${path}H560" class="v"/>${firstLost ? `<rect x="${x(firstLost.t)}" y="0" width="${Math.max(2, x(offAt + o) - x(firstLost.t))}" height="130" class="lost"/>` : ''}</svg><span class="ud-t">FIFO full (${d})</span><span class="ud-off" style="left:${(x(offAt) / 560) * 100}%">interrupts off</span>`;
    root.querySelector('.ud-read')!.innerHTML = `<span>Byte time <b>${label(byteUs(b))}</b></span><span>Longest safe gap <b>${label(maxOffUs(b, d))}</b></span><span>Lost <b>${r.lost}</b></span>`;
    panel.classList.toggle('over', r.lost > 0);
    say(text(r.lost, maxOffUs(b, d), o));
    markSeg(root, 'b', baud); markSeg(root, 'd', depth); markSeg(root, 'o', off);
    syncUrl({ b: baud, d: depth, o: off });
  }
  panel.addEventListener('click', (e) => {
    const t = e.target as Element, a = t.closest<HTMLElement>('[data-b]'), c = t.closest<HTMLElement>('[data-d]'), g = t.closest<HTMLElement>('[data-o]');
    if (a) baud = a.dataset.b as typeof baud; else if (c) depth = c.dataset.d as typeof depth; else if (g) off = g.dataset.o as typeof off; else return;
    draw();
  });
  draw();
}
