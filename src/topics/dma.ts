/**
 * DMA: a transfer engine moves data between a peripheral and memory with no instructions from the CPU. Here USART2's
 * receiver feeds DMA1 stream 5, which writes each byte into an 8-byte buffer in SRAM, counting down NDTR and raising
 * half-transfer and transfer-complete flags. Step through twelve bytes arriving in normal mode, where the stream stops
 * when the buffer is full and later bytes are lost, or circular mode, where it wraps and keeps going. `dma` is the
 * stream's bookkeeping, exported for the checks.
 */
import { esc } from '../core/render';
import { hexN, markSeg, seg, status, stepButtons, syncUrl, walkthrough } from './dbg';
import { eq } from './math';

export interface Xfer {
  /** Which byte of the stream this was. */
  byte: number;
  /** The buffer index it was written to, or null if the stream was off and it was lost. */
  index: number | null;
  /** NDTR after the transfer (circular mode reloads it to the buffer size after reaching 0). */
  ndtr: number;
  ht: boolean;
  tc: boolean;
}

/** The stream's bookkeeping for `bytes` arrivals into a buffer of `size`. */
export function dma(bytes: number, size: number, circular: boolean): Xfer[] {
  const out: Xfer[] = [];
  let ndtr = size, on = true, at = 0;
  for (let k = 0; k < bytes; k++) {
    if (!on) { out.push({ byte: k, index: null, ndtr, ht: false, tc: false }); continue; }
    const index = at;
    ndtr--;
    at++;
    const ht = ndtr === size / 2, tc = ndtr === 0;
    if (tc) { if (circular) { ndtr = size; at = 0; } else on = false; }
    out.push({ byte: k, index, ndtr, ht, tc });
  }
  return out;
}

export const SIZE = 8;
const BASE = 0x2000_0100;
const TEXT = 'HELLO WORLD!';

export function mountDma(root: HTMLElement) {
  const q = new URLSearchParams(location.search);
  let circular = q.get('mode') === 'circ';
  let at = 0; // bytes arrived so far

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Data</p>
      <h1>DMA</h1>
      <p>Copying every received byte out of a peripheral costs the CPU an interrupt per byte. A <b>DMA controller</b> does
        the copying instead: the peripheral asks for a transfer, DMA moves the byte from the peripheral's register to
        the next address in a buffer, and the CPU is told only when a batch is ready. Below, a UART receives twelve bytes
        into an 8-byte buffer. Step through them and watch the count, the addresses and the flags.</p>
    </section>
    <section class="debugger mem periph dma" aria-label="DMA transfer">
      <header class="dbg-bar pf-bar">
        <span class="dbg-file">USART2 RX → DMA1 stream 5</span>
        <div class="pf-ctls">
          <div class="pf-ctl"><span>Mode</span>${seg('mode', 'DMA mode', [['normal', 'Normal'], ['circ', 'Circular']])}</div>
        </div>
        <div class="dbg-controls">${stepButtons()}</div>
      </header>
      <div class="pf-screen dm-screen">
        <div class="pf-readout"></div>
        <div class="dm-flow"></div>
        <div class="dm-buf"></div>
        <ol class="dm-log"></ol>
      </div>
      <p class="dbg-status" aria-live="polite"></p>
    </section>
    <section class="prose">
      <h2>What the stream is told</h2>
      <p>Before the first byte, firmware programs the stream once: the source (USART2's data register, a fixed address),
        the destination (the buffer, with the address incremented after each byte), the transfer size and the count, NDTR.
        Each time the UART receives a byte it raises a request; DMA reads the byte, writes it to memory, adds one to the
        address and subtracts one from NDTR. The CPU runs other code throughout, sharing the bus with DMA through the
        <a href="?p=interconnect" data-nav>bus matrix</a>.</p>
      ${eq(String.raw`\mathrm{address}_k = \mathrm{M0AR} + k \qquad \mathrm{NDTR}_k = N - k`)}
      <h2>Half-transfer and transfer-complete</h2>
      <p>When half the count has moved, the stream sets its half-transfer flag, HTIF; when NDTR reaches zero, the
        transfer-complete flag, TCIF. Either can raise an interrupt. In normal mode the stream then switches itself off,
        and the next byte to arrive waits in the UART; any after it are lost, an overrun. In circular mode
        NDTR reloads and the address wraps to the start, so the buffer is reused forever: while DMA fills the second
        half, the CPU processes the first half, which the half-transfer interrupt said was ready, and the other way round.
        This is the usual way to receive a continuous stream, and the same scheme feeds a
        <a href="?p=dac" data-nav>DAC</a> from a table.</p>
      <h2>Caches and ordering</h2>
      <p>On a chip with a data cache, DMA writes memory behind the CPU's back, so the CPU must invalidate the cached copy
        before reading the buffer, or it reads stale bytes; see <a href="?p=caches" data-nav>Caches</a>. And a CPU that
        writes a buffer and then starts DMA must make sure the writes landed first, which is what a barrier is for; see
        <a href="?p=barriers" data-nav>Memory ordering and barriers</a>.</p>
    </section>`;

  const walk = walkthrough(root, { count: () => TEXT.length + 1, at: () => at, go: (i) => { at = i; draw(); } });

  function draw() {
    const xs = dma(TEXT.length, SIZE, circular).slice(0, at);
    const cur = xs[xs.length - 1];
    const cells: (string | null)[] = Array(SIZE).fill(null);
    xs.forEach((x) => { if (x.index !== null) cells[x.index] = TEXT[x.byte]; });
    const ndtr = cur ? cur.ndtr : SIZE;
    const on = !xs.some((x) => x.tc) || circular;
    // The first byte after the stream stops waits in the UART's data register; each one after that is lost (an overrun).
    const lost = Math.max(0, xs.filter((x) => x.index === null).length - 1);
    const next = circular || on ? (cur && cur.index !== null ? (cur.tc ? 0 : cur.index + 1) : 0) : null;
    root.querySelector('.pf-readout')!.innerHTML = `<span>NDTR <b>${ndtr}</b></span><span>Next address <b>${next === null ? '—' : hexN(BASE + next, 32)}</b></span><span>Stream <b class="${on ? 'good' : 'bad'}">${on ? 'on' : 'off'}</b></span><span>Lost <b class="${lost ? 'bad' : ''}">${lost}</b></span>`;
    root.querySelector('.dm-flow')!.innerHTML = `
      <span class="dm-box">USART2 DR<b>${cur ? esc(show(TEXT[cur.byte])) : '—'}</b></span>
      <span class="dm-arrow${cur && cur.index !== null ? ' on' : cur ? ' off' : ''}" aria-hidden="true"></span>
      <span class="dm-box">DMA1 stream 5<b>${cur ? (cur.index === null ? 'off' : `byte ${cur.byte} → [${cur.index}]`) : 'ready'}</b></span>
      <span class="dm-arrow${cur && cur.index !== null ? ' on' : ''}" aria-hidden="true"></span>
      <span class="dm-box">rx_buf<b>${hexN(BASE, 32)}</b></span>`;
    root.querySelector('.dm-buf')!.innerHTML = cells.map((c, i) => `
      <span class="dm-cell${c === null ? '' : ' full'}${cur && cur.index === i ? ' cur' : ''}">
        <small>[${i}]</small><b>${c === null ? '·' : esc(show(c))}</b><small>${hexN(BASE + i, 32).slice(-3)}</small></span>`).join('');
    const log = xs.flatMap((x) => [
      ...(x.ht ? [`<li class="ht">byte ${x.byte}: half-transfer, HTIF → interrupt: process [0]…[3]</li>`] : []),
      ...(x.tc ? [`<li class="tc">byte ${x.byte}: transfer complete, TCIF → ${circular ? 'interrupt: process [4]…[7]; NDTR reloads to 8' : 'interrupt; the stream turns itself off'}</li>`] : []),
      ...(x.index === null && x.byte === SIZE + 1 ? ['<li class="bad">byte 9 is lost: the UART still holds byte 8 unread, an overrun (ORE)</li>'] : []),
    ]).slice(-4);
    root.querySelector('.dm-log')!.innerHTML = log.join('') || '<li class="idle">No flags yet. The CPU has not been interrupted.</li>';
    markSeg(root, 'mode', circular ? 'circ' : 'normal');
    status(root, explain(cur, circular));
    walk.sync();
    syncUrl({ mode: circular ? 'circ' : 'normal' });
  }

  draw();
  root.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('.pf-bar [role=radio]');
    if (!b?.dataset.mode) return;
    circular = b.dataset.mode === 'circ';
    at = 0;
    draw();
  });
}

const show = (c: string) => (c === ' ' ? '␠' : c);

function explain(x: Xfer | undefined, circular: boolean) {
  if (!x) return `The stream is set up: source USART2's data register, destination rx_buf at ${hexN(BASE, 32)}, NDTR = ${SIZE}, ${circular ? 'circular' : 'normal'} mode. Press Step as the bytes arrive.`;
  const ch = `'${show(TEXT[x.byte])}'`;
  if (x.index === null) return `Byte ${x.byte} (${ch}) arrives, but the stream switched itself off when NDTR reached 0. Nothing collects it: ${x.byte === SIZE ? 'it waits in the UART\'s data register' : 'the UART still holds byte 8 unread, so this byte is lost, an overrun'}. Normal mode is for one block; use circular mode for a stream.`;
  if (x.tc) return circular
    ? `Byte ${x.byte} (${ch}) fills [${x.index}] and NDTR reaches 0: transfer complete. The interrupt tells the CPU the second half is ready, and in circular mode NDTR reloads to ${SIZE} and the next byte goes to [0] again.`
    : `Byte ${x.byte} (${ch}) fills [${x.index}] and NDTR reaches 0: transfer complete, and the CPU gets one interrupt for all ${SIZE} bytes. In normal mode the stream now turns itself off.`;
  if (x.ht) return `Byte ${x.byte} (${ch}) fills [${x.index}], and NDTR = ${x.ndtr}: half the count has moved, so the half-transfer flag rises. The CPU can process [0]…[3] while DMA keeps filling [4]…[7].`;
  return `Byte ${x.byte} (${ch}) arrives; DMA writes it to [${x.index}] at ${hexN(BASE + x.index!, 32)}, adds one to the address and counts NDTR down to ${x.ndtr}. The CPU did nothing.`;
}
