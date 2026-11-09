/**
 * The DMA drivers page: a circular buffer filled by DMA, with an interrupt at each half, and code that has to process
 * one half before DMA comes back to it. `dmaRun` is exported; verify checks it against a byte-by-byte simulation.
 */
import { markSeg, oneOf, reservedStatus, seg, syncUrl } from './dbg';

export interface Half { which: 'A' | 'B'; ready: number; start: number; end: number; deadline: number; late: boolean }

/** Half `k` is ready at (k + 1) × half time, and DMA starts overwriting it one half time later. Processing is serial. */
export function dmaRun(size: number, byteUs: number, procUs: number, halves = 8): Half[] {
  const h = (size / 2) * byteUs, out: Half[] = [];
  let free = 0;
  for (let k = 0; k < halves; k++) {
    const ready = (k + 1) * h, start = Math.max(ready, free), end = start + procUs, deadline = ready + h;
    free = end;
    out.push({ which: k % 2 ? 'B' : 'A', ready, start, end, deadline, late: end > deadline });
  }
  return out;
}

const SIZES = ['64', '256', '1024'] as const;
const PROCS = ['50', '500', '5000'] as const;
const BAUD = 1_000_000, BYTE_US = 10e6 / BAUD;
const t = (us: number) => (us >= 1000 ? `${(us / 1000).toFixed(us % 1000 ? 2 : 0)} ms` : `${us} µs`);

export function mountDmaDriver(root: HTMLElement) {
  let size = oneOf('n', SIZES, '256'), proc = oneOf('p', PROCS, '500');
  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Moving data</p>
      <h1>DMA drivers</h1>
      <p>At high rates, even an interrupt per byte is too much. <a href="?p=dma" data-nav>DMA</a> moves the bytes on its own, and a circular buffer means it never has to stop. The code only hears about it twice per
        trip, at the halfway point and at the end, and it has a deadline. This is a UART at 1 Mbaud, so 100,000 bytes per second.</p>
    </section>
    <section class="debugger dmad" aria-label="DMA circular buffer">
      <header class="dbg-bar"><span class="dbg-file">rx_buffer</span></header>
      <div class="pp-tabs bat-tabs">
        <span class="bat-c"><small>Buffer</small>${seg('n', 'Buffer size', SIZES.map((s) => [s, `${s} bytes`]))}</span>
        <span class="bat-c"><small>Processing one half</small>${seg('p', 'Processing time', PROCS.map((p) => [p, t(Number(p))]))}</span>
      </div>
      <div class="dd-plot"></div>
      <div class="pp-read dd-read"></div>
      <p class="dbg-status" aria-live="polite"></p>
    </section>
    <section class="prose">
      <h2>Two halves</h2>
      <p>In circular mode the DMA wraps to the start of the buffer by itself. The half-transfer interrupt says the first half is full, and DMA is now writing the second. The complete interrupt says the reverse. So the code
        always has one stable half to read while the other is being filled.</p>
      <h2>The deadline</h2>
      <p>A half becomes ready, and DMA comes back to overwrite it one half-time later. So the processing must keep up: on average, and for every half. Doubling the buffer doubles the deadline and adds latency, because data waits longer before anyone looks at it. Choosing a size is that trade.</p>
      <h2>Things drivers get wrong</h2>
      <p>On a chip with a data cache, the CPU can read stale copies of what DMA wrote, so the buffer must be uncached or the cache invalidated first; see <a href="?p=caches" data-nav>caches</a>. A variable-length message may stop in the middle of a half, so a UART driver also needs an idle-line interrupt and reads the DMA’s remaining-count register to learn how many bytes have arrived. Finally, a driver has to notice when it has fallen behind, rather than silently handing back overwritten data.</p>
    </section>`;
  const panel = root.querySelector<HTMLElement>('.dmad')!;
  const text = (late: number, h: number, p: number) => late ? `Processing takes ${t(p)}, but a half arrives every ${t(h)}. The code falls behind, and DMA overwrites ${late} of 8 halves before they are finished.` : `A new half arrives every ${t(h)} and takes ${t(p)} to process, so the code has time to spare: ${Math.round((p / h) * 100)}% of the CPU.`;
  const say = reservedStatus(panel, SIZES.flatMap((n) => PROCS.map((p) => text(dmaRun(Number(n), BYTE_US, Number(p)).filter((x) => x.late).length, (Number(n) / 2) * BYTE_US, Number(p)))));
  function draw() {
    const n = Number(size), p = Number(proc), hs = dmaRun(n, BYTE_US, p), span = Math.max(...hs.map((x) => Math.max(x.end, x.deadline)));
    const X = (v: number) => `${(v / span) * 100}%`;
    root.querySelector('.dd-plot')!.innerHTML = hs.map((h, i) => `<div class="dd-row"><span>${h.which}</span><div class="dd-track"><i class="fill" style="left:${X(h.ready - (n / 2) * BYTE_US)};width:${X((n / 2) * BYTE_US)}"></i><i class="proc${h.late ? ' late' : ''}" style="left:${X(h.start)};width:${X(h.end - h.start)}"></i><b style="left:${X(h.deadline)}"></b></div></div>${i === hs.length - 1 ? '<p class="dd-key"><i class="fill"></i>DMA filling<i class="proc"></i>Processing<i class="dl"></i>Overwritten from here</p>' : ''}`).join('');
    const late = hs.filter((x) => x.late).length, h = (n / 2) * BYTE_US;
    root.querySelector('.dd-read')!.innerHTML = `<span>Half every <b>${t(h)}</b></span><span>Interrupts <b>${Math.round(1e6 / h)}</b> per second</span><span>Lost halves <b>${late}</b></span>`;
    panel.classList.toggle('over', late > 0);
    say(text(late, h, p));
    markSeg(root, 'n', size); markSeg(root, 'p', proc);
    syncUrl({ n: size, p: proc });
  }
  panel.addEventListener('click', (e) => {
    const x = e.target as Element, a = x.closest<HTMLElement>('[data-n]'), b = x.closest<HTMLElement>('[data-p]');
    if (a) size = a.dataset.n as typeof size; else if (b) proc = b.dataset.p as typeof proc; else return;
    draw();
  });
  draw();
}
