/**
 * The heap: memory handed out at runtime by malloc and returned by free, and why it fragments. A heap region is shown
 * as a row of cells; allocate and free blocks and watch the gaps appear. A second panel shows garbage collection,
 * the alternative to freeing by hand: mark what is reachable from the roots, then sweep the rest.
 */
import { esc } from '../core/render';
import { status, syncUrl } from './dbg';

const UNITS = 16; // each cell is 8 bytes, so 128 bytes of heap
const UNIT = 8;
const BASE = 0x20001000;
/** The blocks the buttons allocate, by name → size in units, and a colour. */
const BLOCKS: Record<string, { size: number; color: string }> = {
  a: { size: 3, color: '#5fd0a4' }, b: { size: 5, color: '#f0b45a' }, c: { size: 2, color: '#7fb1f5' }, d: { size: 4, color: '#e39ad0' },
};

/** First-fit allocation: the lowest run of `size` free cells, or -1 if none is big enough. Exported for the checks. */
export function firstFit(cells: (string | null)[], size: number): number {
  for (let i = 0; i + size <= cells.length; i++) {
    if (cells.slice(i, i + size).every((c) => c === null)) return i;
  }
  return -1;
}

/** The largest run of free cells: what the biggest single malloc could still get. */
function largestFree(cells: (string | null)[]): number {
  let best = 0, run = 0;
  for (const c of cells) { run = c === null ? run + 1 : 0; best = Math.max(best, run); }
  return best;
}

export function mountHeap(root: HTMLElement) {
  let cells: (string | null)[] = new Array(UNITS).fill(null);
  let note = 'The heap starts empty. Allocate a block and malloc finds room for it; free one and the room goes back.';
  // Garbage-collection demo: a chain of list nodes, with the root at index `rootAt`.
  const NODES = ['head', 'n2', 'n3', 'n4'];
  let rootAt = 0;
  let swept: number[] = [];

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Where data lives</p>
      <h1>The heap</h1>
      <p>Globals and locals have their memory decided before a function runs, but sometimes a program does not know how
        much it will need until it is running. The heap is the pool that <code>malloc</code> hands out from and
        <code>free</code> returns to, in any order. That freedom is the catch: free blocks in the middle and the space
        comes back in scattered pieces, so a later request can fail even when the total free space is plenty. Allocate
        and free below.</p>
    </section>
    <section class="debugger heap" aria-label="The heap">
      <header class="dbg-bar">
        <span class="dbg-file">heap.c</span>
        <span class="dbg-state"><i aria-hidden="true"></i>${UNITS * UNIT} bytes</span>
        <div class="dbg-controls">
          ${Object.entries(BLOCKS).map(([n, b]) => `<button type="button" class="dbg-btn" data-alloc="${n}">malloc ${n} (${b.size * UNIT} B)</button>`).join('')}
          <button type="button" class="dbg-btn" data-act="reset">Reset</button>
        </div>
      </header>
      <div class="heap-body">
        <div class="hp-map"></div>
        <p class="hp-note">Click an allocated block to <code>free</code> it.</p>
        <dl class="hp-stat"></dl>
      </div>
      <p class="dbg-status" aria-live="polite"></p>
    </section>
    <section class="prose">
      <h2>Fragmentation</h2>
      <p>Every <code>malloc</code> must return one contiguous block. After a run of allocations and frees, the free space
        is broken into gaps between the blocks still in use. The total might be large, but if no single gap is big
        enough, the request fails: this is external fragmentation, and on a long-running system it is the quiet way a
        heap “fills up” while half empty. A general-purpose allocator also keeps bookkeeping next to each block and rounds
        sizes up for alignment, so the memory actually used is always more than the bytes asked for.</p>
      <h2>Why much firmware avoids the heap</h2>
      <p>On a microcontroller with no virtual memory, fragmentation cannot be hidden by remapping pages, and a failed
        allocation deep in a long-running system is hard to recover from. So safety-critical firmware often forbids
        <code>malloc</code> after startup entirely: it allocates everything up front, or uses fixed-size memory pools,
        where every block is the same size so they are interchangeable and nothing fragments. The MISRA C guidelines used
        in automotive code ban dynamic allocation for exactly this reason.</p>
      <h2>Garbage collection</h2>
      <p>Languages like Java, Go, Python and JavaScript do not make you call <code>free</code>. A garbage collector finds
        memory no longer in use and reclaims it automatically. The classic method is mark and sweep: start from the
        roots, the variables the program can reach directly, follow every reference, and mark everything found; then
        sweep the heap and free whatever was not marked, because nothing can reach it any more. Below, advancing the list
        head leaves the earlier nodes with nothing pointing at them, and a collection frees them.</p>
      <section class="debugger gc" aria-label="Garbage collection">
        <header class="dbg-bar">
          <span class="dbg-file">mark &amp; sweep</span>
          <span class="dbg-state"><i aria-hidden="true"></i>reachable from root</span>
          <div class="dbg-controls">
            <button type="button" class="dbg-btn" data-gc="advance">head = head-&gt;next</button>
            <button type="button" class="dbg-btn primary" data-gc="collect">Run GC</button>
            <button type="button" class="dbg-btn" data-gc="reset">Reset</button>
          </div>
        </header>
        <div class="gc-body"><div class="gc-root"></div><div class="gc-chain"></div></div>
        <p class="dbg-status gc-status" aria-live="polite"></p>
      </section>
      <p>Garbage collection removes a whole class of bugs, forgetting to free, freeing twice, using memory after freeing
        it, but it costs time and memory, and a collection can pause the program at an unpredictable moment. That pause is
        why hard real-time and most embedded systems do not use it, and why the languages that do work hard to make their
        collectors incremental and quick.</p>
    </section>`;

  function drawHeap() {
    const free = cells.filter((c) => c === null).length;
    const big = largestFree(cells);
    root.querySelector('.hp-map')!.innerHTML = cells.map((c, i) => {
      const b = c ? BLOCKS[c] : null;
      const firstOfBlock = c && cells[i - 1] !== c;
      return `<span class="hp-cell${c ? ' used' : ''}" data-i="${i}"${b ? ` data-block="${c}" style="--c:${b.color}"` : ''}>` +
        `${firstOfBlock ? `<b>${c}</b>` : ''}<small>0x${(BASE + i * UNIT).toString(16).toUpperCase().slice(-3)}</small></span>`;
    }).join('');
    root.querySelector('.hp-stat')!.innerHTML =
      `<div><dt>In use</dt><dd>${(UNITS - free) * UNIT} B</dd></div>` +
      `<div><dt>Free</dt><dd>${free * UNIT} B</dd></div>` +
      `<div><dt>Largest gap</dt><dd>${big * UNIT} B</dd></div>`;
    status(root, note);
    syncUrl({ h: cells.map((c) => c ?? '.').join('') });
  }

  function drawGc() {
    root.querySelector('.gc-root')!.innerHTML = `<span class="gc-label">root</span><span class="gc-arrow">→</span>`;
    root.querySelector('.gc-chain')!.innerHTML = NODES.map((n, i) => {
      const reachable = i >= rootAt;
      const isSwept = swept.includes(i);
      const cls = ['gc-node', isSwept ? 'swept' : reachable ? 'reach' : 'orphan', i === rootAt && !isSwept ? 'rooted' : ''].filter(Boolean).join(' ');
      return `<span class="${cls}">${esc(n)}</span>${i < NODES.length - 1 ? '<span class="gc-arrow">→</span>' : ''}`;
    }).join('');
    const live = NODES.length - rootAt;
    const orphans = rootAt - swept.filter((i) => i < rootAt).length;
    const el = root.querySelector('.gc-status')!;
    el.textContent = swept.length
      ? `Swept: ${swept.map((i) => NODES[i]).join(', ')} had no path from the root, so they were freed. ${live} node${live === 1 ? '' : 's'} remain reachable.`
      : rootAt === 0
        ? 'The root points at head, and each node points to the next, so all four are reachable. Nothing to collect.'
        : `root now points at ${NODES[rootAt]}. ${orphans} earlier node${orphans === 1 ? '' : 's'} (${NODES.slice(0, rootAt).join(', ')}) can no longer be reached from the root. Run GC to reclaim ${orphans === 1 ? 'it' : 'them'}.`;
  }

  drawHeap();
  drawGc();
  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    const alloc = t.closest<HTMLElement>('[data-alloc]')?.dataset.alloc;
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    const freeCell = t.closest<HTMLElement>('.hp-cell.used');
    const gc = t.closest<HTMLElement>('[data-gc]')?.dataset.gc;
    if (alloc) {
      if (cells.includes(alloc)) { note = `Block ${alloc} is already allocated. Free it first.`; drawHeap(); return; }
      const sz = BLOCKS[alloc].size;
      const at = firstFit(cells, sz);
      if (at < 0) note = `malloc(${sz * UNIT}) for ${alloc} fails: ${largestFree(cells) * UNIT} bytes are free, but not ${sz * UNIT} in a row. The heap is fragmented.`;
      else { for (let k = 0; k < sz; k++) cells[at + k] = alloc; note = `malloc(${sz * UNIT}) returns 0x${(BASE + at * UNIT).toString(16).toUpperCase()}: the first gap big enough for ${alloc}.`; }
      drawHeap();
    } else if (freeCell) {
      const id = freeCell.dataset.block!;
      cells = cells.map((c) => (c === id ? null : c));
      note = `free(${id}): its cells go back to the pool. If they sit between two other blocks, they become a gap.`;
      drawHeap();
    } else if (act === 'reset') { cells = new Array(UNITS).fill(null); note = 'Heap cleared.'; drawHeap(); }
    else if (gc === 'advance') { if (rootAt < NODES.length - 1 && !swept.length) rootAt++; drawGc(); }
    else if (gc === 'collect') { swept = Array.from({ length: rootAt }, (_, i) => i).filter((i) => !swept.includes(i)); drawGc(); }
    else if (gc === 'reset') { rootAt = 0; swept = []; drawGc(); }
  });
}

