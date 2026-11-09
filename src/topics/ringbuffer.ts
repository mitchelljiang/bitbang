/**
 * The ring buffer page: one writer, one reader, a head, a tail and a slot left empty. The model is exported; verify runs
 * the same operations through the C shown on the page, compiled natively, and compares every result.
 */
import { esc } from '../core/render';
import { reservedStatus, syncUrl } from './dbg';

export const RING_N = 8;
export const RING_C = `#define N 8
static uint8_t buf[N];
static volatile unsigned head, tail;

// Called only by the interrupt
int put(uint8_t b) {
    unsigned next = (head + 1) % N;
    if (next == tail)
        return 0;  // full
    buf[head] = b;
    head = next;
    return 1;
}

// Called only by the main loop
int get(uint8_t *b) {
    if (tail == head)
        return 0;  // empty
    *b = buf[tail];
    tail = (tail + 1) % N;
    return 1;
}`;

export interface Ring { buf: number[]; head: number; tail: number }
export const newRing = (n = RING_N): Ring => ({ buf: new Array(n).fill(0), head: 0, tail: 0 });
export function ringPut(r: Ring, b: number) {
  const next = (r.head + 1) % r.buf.length;
  if (next === r.tail) return false;
  r.buf[r.head] = b;
  r.head = next;
  return true;
}
export function ringGet(r: Ring): number | null {
  if (r.tail === r.head) return null;
  const b = r.buf[r.tail];
  r.tail = (r.tail + 1) % r.buf.length;
  return b;
}
export const ringCount = (r: Ring) => (r.head - r.tail + r.buf.length) % r.buf.length;

export function mountRingBuffer(root: HTMLElement) {
  const r = newRing();
  let code = 65, last = '';
  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Moving data</p>
      <h1>Ring buffers</h1>
      <p>An interrupt receives bytes whenever they arrive; the main loop handles them when it can. A ring buffer sits between the two. The
        interrupt writes at the head, the main loop reads at the tail, and neither needs a lock. Put in some bytes, take some out, and fill it up.</p>
    </section>
    <section class="debugger ring" aria-label="Ring buffer">
      <header class="dbg-bar"><span class="dbg-file">ring.c</span><div class="dbg-controls"><button type="button" class="dbg-btn" data-a="put">Interrupt: put</button><button type="button" class="dbg-btn" data-a="get">Main: get</button><button type="button" class="dbg-btn" data-a="burst">Burst of 3</button><button type="button" class="dbg-btn" data-a="reset">Reset</button></div></header>
      <div class="dbg-body">
        <pre class="dbg-code"><code>${esc(RING_C).split('\n').map((l) => `<span class="ln rb-ln">${l || ' '}</span>`).join('')}</code></pre>
        <div class="dbg-vars rb-right"><div class="rb-cells"></div><div class="rb-mark"></div><div class="pp-read rb-read"></div></div>
      </div>
      <p class="dbg-status" aria-live="polite"></p>
    </section>
    <section class="prose">
      <h2>Why one slot stays empty</h2>
      <p>Head equal to tail has to mean one thing. If the buffer could fill completely, a full buffer and an empty one would both have head equal to tail. Giving up
        one slot makes the test simple: empty when they are equal, full when the next head would reach the tail. An 8-slot buffer holds 7 bytes.</p>
      <h2>Why it needs no lock</h2>
      <p>Each index has one writer: only the interrupt changes <code>head</code>, only the main loop changes <code>tail</code>. And the writer stores the byte before
        it moves <code>head</code>, so the reader never sees a slot that has not been filled. On a single-core Cortex-M with word-sized indexes, <code>volatile</code> is enough. On
        multi-core chips the two steps also need the ordering guarantees of <a href="?p=barriers" data-nav>barriers</a> or C11 atomics. With more than one writer on either side it is no longer safe: use a <a href="?p=locks" data-nav>lock</a>.</p>
      <h2>Sizing it</h2>
      <p>The buffer has to hold everything that arrives during the longest time the main loop is busy. A power-of-two size also lets <code>% N</code> become <code>&amp; (N - 1)</code>, which matters on a chip with no divide instruction.</p>
    </section>`;
  const panel = root.querySelector<HTMLElement>('.ring')!;
  const says = {
    start: 'Empty: head and tail are at the same slot.',
    put: 'The interrupt stored a byte and moved the head.',
    get: 'The main loop read a byte and moved the tail.',
    full: 'Full: the next head would hit the tail, so the byte is refused. The driver counts this as an overrun.',
    empty: 'Empty, so there is nothing to read. get returns 0.',
  };
  const say = reservedStatus(panel, Object.values(says));
  function draw() {
    root.querySelector('.rb-cells')!.innerHTML = r.buf.map((b, i) => {
      const live = r.tail <= r.head ? i >= r.tail && i < r.head : i >= r.tail || i < r.head;
      return `<span class="rb-c${live ? ' live' : ''}">${live ? String.fromCharCode(b) : ''}</span>`;
    }).join('');
    root.querySelector('.rb-mark')!.innerHTML = r.buf.map((_, i) => `<span>${i === r.tail ? '<b class="t">tail</b>' : ''}${i === r.head ? '<b class="h">head</b>' : ''}</span>`).join('');
    root.querySelector('.rb-read')!.innerHTML = `<span><b>${ringCount(r)}</b> of ${r.buf.length - 1} used</span>`;
    say(says[(last || 'start') as keyof typeof says]);
    syncUrl({});
  }
  const put = () => { if (ringPut(r, code)) { code = code === 90 ? 65 : code + 1; last = 'put'; } else last = 'full'; };
  panel.addEventListener('click', (e) => {
    const a = (e.target as Element).closest<HTMLElement>('[data-a]')?.dataset.a;
    if (a === 'put') put();
    else if (a === 'burst') { put(); put(); put(); }
    else if (a === 'get') last = ringGet(r) === null ? 'empty' : 'get';
    else if (a === 'reset') { Object.assign(r, newRing()); code = 65; last = ''; }
    else return;
    draw();
  });
  draw();
}
