/**
 * Caches: a small, fast copy of recently used memory. This is a direct-mapped cache, the simplest kind: an address
 * splits into tag, index and offset, the index picks exactly one line, and a hit needs the stored tag to match. Access
 * addresses and watch lines fill, hit, and get evicted when two addresses map to the same line. access is exported for
 * the checks.
 */
import { status, syncUrl } from './dbg';

export const OFFSET_BITS = 4; // 16-byte lines
export const INDEX_BITS = 2; // 4 lines
export const LINES = 1 << INDEX_BITS;
const ADDR_BITS = 12;

export interface Line { valid: boolean; tag: number }
export interface Fields { tag: number; index: number; offset: number }

export const fields = (addr: number): Fields => ({
  offset: addr & ((1 << OFFSET_BITS) - 1),
  index: (addr >> OFFSET_BITS) & (LINES - 1),
  tag: addr >> (OFFSET_BITS + INDEX_BITS),
});

export interface Access { hit: boolean; index: number; tag: number; offset: number; evicted: boolean }

/** Look up `addr` in `lines`, updating it in place. A hit needs the line valid with a matching tag; a miss fills it. */
export function access(lines: Line[], addr: number): Access {
  const { tag, index, offset } = fields(addr);
  const line = lines[index];
  const hit = line.valid && line.tag === tag;
  const evicted = !hit && line.valid && line.tag !== tag;
  if (!hit) { line.valid = true; line.tag = tag; }
  return { hit, index, tag, offset, evicted };
}

const ACCESSES: { label: string; addr: number }[] = [
  { label: 'a[0]', addr: 0x100 }, { label: 'a[1]', addr: 0x104 },
  { label: 'b', addr: 0x140 }, { label: 'c', addr: 0x210 },
  { label: 'c+8', addr: 0x218 }, { label: 'd', addr: 0x300 },
];

const hex3 = (v: number) => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(3, '0');

export function mountCaches(root: HTMLElement) {
  let lines: Line[] = Array.from({ length: LINES }, () => ({ valid: false, tag: 0 }));
  let log: { label: string; addr: number; r: Access }[] = [];
  let last: { label: string; addr: number } | null = null;

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Memory hardware</p>
      <h1>Caches</h1>
      <p>Main memory is far slower than the processor, so between them sits a cache: a small, fast copy of the lines of
        memory used most recently. The processor checks the cache first; a <b>hit</b> is quick, a <b>miss</b> pays the
        full cost of going to memory and brings a whole line back. Which line an address can occupy is fixed by some of
        its bits, so two addresses that share those bits fight over one slot. Access the locations below and watch.</p>
    </section>
    <section class="debugger mem cache" aria-label="Cache">
      <header class="dbg-bar">
        <span class="dbg-file">direct-mapped · ${LINES} lines × ${1 << OFFSET_BITS} B</span>
        <span class="dbg-state"><i aria-hidden="true"></i>cold</span>
        <div class="dbg-controls">
          ${ACCESSES.map((a) => `<button type="button" class="dbg-btn" data-addr="${a.addr}" data-label="${a.label}">${a.label} <small>${hex3(a.addr)}</small></button>`).join('')}
          <button type="button" class="dbg-btn" data-act="reset">Reset</button>
        </div>
      </header>
      <div class="ca-body">
        <div class="ca-cache"><h4>Cache</h4><div class="ca-lines"></div></div>
        <div class="ca-side"><div class="ca-break"></div><dl class="ca-stat"></dl><ol class="ca-log"></ol></div>
      </div>
      <p class="dbg-status" aria-live="polite"></p>
    </section>
    <section class="prose">
      <h2>How an address is split</h2>
      <p>The low bits are the <b>offset</b> into a line, the next bits are the <b>index</b> that picks a line, and the
        rest are the <b>tag</b> stored alongside the line to say which block of memory it currently holds. Because the
        index comes from fixed bits, an address has exactly one line it is allowed to live in. A hit is when that line is
        valid and its tag matches; otherwise it is a miss, the line is fetched from memory, and whatever was there is
        evicted. Fetching a whole line at once is a bet on <b>spatial locality</b>: nearby bytes, like the next elements
        of an array, will probably be wanted soon, so <code>a[1]</code> after <code>a[0]</code> is already present.</p>
      <h2>Conflict misses and associativity</h2>
      <p>In a direct-mapped cache, two hot addresses that happen to share an index knock each other out repeatedly even
        when the rest of the cache is empty, a conflict miss. The fix is <b>set associativity</b>: give each index several
        lines (ways), so a few tags can share a set. A 4-way cache tolerates four conflicting addresses before it has to
        evict, at the cost of comparing four tags per access. Fully associative caches let any address go anywhere but
        must check every tag, so real caches pick a middle point.</p>
      <h2>Caches and DMA disagree</h2>
      <p>A cache means there can be two copies of an address: the stale one in memory and the fresh one in the cache. That
        is invisible until something else touches memory directly. If <a href="?p=interconnect" data-nav>DMA</a> writes a
        buffer, the CPU may still read the old cached copy; if the CPU writes and DMA reads before the line is written
        back, DMA sends stale data. Firmware handles this by <b>cleaning</b> the cache (flushing writes out) before a DMA
        read and <b>invalidating</b> it (dropping cached copies) after a DMA write, or by placing DMA buffers in memory
        marked non-cacheable. Forgetting is a classic, maddening source of intermittent DMA bugs.</p>
    </section>`;

  function draw(note?: string) {
    root.querySelector('.ca-lines')!.innerHTML = lines.map((l, i) => {
      const holder = l.valid ? ACCESSES.find((a) => fields(a.addr).index === i && fields(a.addr).tag === l.tag) : null;
      const hit = last && fields(last.addr).index === i;
      return `<div class="ca-line${l.valid ? ' valid' : ''}${hit ? ' active' : ''}">
        <span class="cl-i">line ${i}</span>
        <span class="cl-v">${l.valid ? 'V' : '·'}</span>
        <span class="cl-tag">${l.valid ? 'tag 0x' + l.tag.toString(16).toUpperCase() : 'empty'}</span>
        <span class="cl-holds">${l.valid ? `holds ${hex3(l.tag << (OFFSET_BITS + INDEX_BITS) | (i << OFFSET_BITS))}–${hex3((l.tag << (OFFSET_BITS + INDEX_BITS) | (i << OFFSET_BITS)) + (1 << OFFSET_BITS) - 1)}${holder ? ` (${holder.label})` : ''}` : ''}</span>
      </div>`;
    }).join('');

    // Address breakdown of the last access, as tag | index | offset bits.
    if (last) {
      const f = fields(last.addr);
      const bin = (last.addr >>> 0).toString(2).padStart(ADDR_BITS, '0');
      const tagB = bin.slice(0, ADDR_BITS - OFFSET_BITS - INDEX_BITS);
      const idxB = bin.slice(ADDR_BITS - OFFSET_BITS - INDEX_BITS, ADDR_BITS - OFFSET_BITS);
      const offB = bin.slice(ADDR_BITS - OFFSET_BITS);
      root.querySelector('.ca-break')!.innerHTML =
        `<div class="cb-addr">${hex3(last.addr)} <small>${last.label}</small></div>
         <div class="cb-bits"><span class="cb-tag">${tagB}<small>tag ${f.tag}</small></span><span class="cb-idx">${idxB}<small>index ${f.index}</small></span><span class="cb-off">${offB}<small>offset ${f.offset}</small></span></div>`;
    } else root.querySelector('.ca-break')!.innerHTML = '<div class="cb-addr cb-empty">Access a location to see its tag · index · offset.</div>';

    const hits = log.filter((e) => e.r.hit).length;
    const rate = log.length ? Math.round((hits / log.length) * 100) : 0;
    root.querySelector('.ca-stat')!.innerHTML =
      `<div><dt>Accesses</dt><dd>${log.length}</dd></div><div><dt>Hits</dt><dd>${hits}</dd></div><div><dt>Hit rate</dt><dd>${rate}%</dd></div>`;

    root.querySelector('.ca-log')!.innerHTML = log.slice(-6).reverse().map((e) =>
      `<li class="${e.r.hit ? 'hit' : 'miss'}"><span>${e.label} ${hex3(e.addr)}</span><b>${e.r.hit ? 'hit' : e.r.evicted ? 'miss · evicts' : 'miss'}</b></li>`).join('')
      || '<li class="ca-none">no accesses yet</li>';

    status(root, note ?? 'A direct-mapped cache: each address has exactly one line it can live in, chosen by its index bits.');
    syncUrl({});
  }

  draw();
  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    const btn = t.closest<HTMLElement>('[data-addr]');
    const act = t.closest<HTMLElement>('[data-act]');
    if (btn) {
      const addr = Number(btn.dataset.addr);
      const label = btn.dataset.label!;
      const r = access(lines, addr);
      last = { label, addr };
      log.push({ label, addr, r });
      const f = fields(addr);
      const note = r.hit
        ? `Hit. ${label} at ${hex3(addr)} maps to line ${f.index}, which already holds tag 0x${f.tag.toString(16).toUpperCase()}, so the data is returned from the cache with no trip to memory.`
        : r.evicted
          ? `Miss, and a conflict. ${label} maps to line ${f.index}, but that line held a different tag, so its contents are evicted and ${label}’s line is fetched from memory. Two hot addresses sharing line ${f.index} would thrash.`
          : `Cold miss. ${label} at ${hex3(addr)} is not cached yet, so line ${f.index} is filled from memory. The whole ${1 << OFFSET_BITS}-byte line comes in, so the next few bytes will hit.`;
      draw(note);
    } else if (act) {
      lines = Array.from({ length: LINES }, () => ({ valid: false, tag: 0 }));
      log = []; last = null;
      draw('Cache cleared. Every line is cold again.');
    }
  });
}
