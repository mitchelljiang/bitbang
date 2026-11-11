/**
 * Caches: a small, fast copy of recently used memory. The same 8 lines of 16 bytes are organized four ways: direct-mapped
 * (8 sets of 1 line), 2-way and 4-way set associative, and fully associative (1 set of 8). An address splits into tag,
 * index and offset; the index picks a set, any line in that set may hold it, and a full set evicts its least recently
 * used line. The access buttons all conflict on set 0, so each step up in associativity keeps one more of them. The page
 * also lays out the memory hierarchy, registers to Flash. The model is exported for the checks.
 */
import { hex3, markSeg, oneOf, seg, status, syncUrl } from './dbg';

const OFFSET_BITS = 4; // 16-byte lines
export const LINE_BYTES = 1 << OFFSET_BITS;
export const LINES = 8;
const ADDR_BITS = 12;

export const ORGS = ['direct', '2way', '4way', 'full'] as const;
export type Org = (typeof ORGS)[number];
export const WAYS: Record<Org, number> = { direct: 1, '2way': 2, '4way': 4, full: LINES };
const ORG_NAME: Record<Org, string> = { direct: 'Direct-mapped', '2way': '2-way', '4way': '4-way', full: 'Fully associative' };

export const setsOf = (org: Org) => LINES / WAYS[org];
const indexBits = (org: Org) => Math.log2(setsOf(org));

export interface Way { valid: boolean; tag: number; used: number }
export type Cache = Way[][];
export interface Fields { tag: number; index: number; offset: number }

export const newCache = (org: Org): Cache =>
  Array.from({ length: setsOf(org) }, () => Array.from({ length: WAYS[org] }, () => ({ valid: false, tag: 0, used: 0 })));

/** Splits `addr` for `org`: the offset within a line, the index of its set, and the tag that tells blocks apart. */
export const fields = (addr: number, org: Org): Fields => ({
  offset: addr & (LINE_BYTES - 1),
  index: (addr >> OFFSET_BITS) & (setsOf(org) - 1),
  tag: addr >> (OFFSET_BITS + indexBits(org)),
});

/** The first address of the line holding `tag` in set `index`. */
export const lineBase = (tag: number, index: number, org: Org) => (tag << (OFFSET_BITS + indexBits(org))) | (index << OFFSET_BITS);

export interface Access { hit: boolean; index: number; way: number; tag: number; offset: number; evicted: number | null }

/**
 * Looks up `addr`, updating `cache` in place; `now` orders the uses for LRU. A hit needs a valid line with a matching
 * tag in the address's set. A miss fills a free line if the set has one, or else replaces the least recently used line,
 * whose old address comes back as `evicted`.
 */
export function access(cache: Cache, org: Org, addr: number, now: number): Access {
  const { tag, index, offset } = fields(addr, org);
  const set = cache[index];
  let way = set.findIndex((w) => w.valid && w.tag === tag);
  const hit = way >= 0;
  let evicted: number | null = null;
  if (!hit) {
    way = set.findIndex((w) => !w.valid);
    if (way < 0) {
      way = set.reduce((lru, w, i) => (w.used < set[lru].used ? i : lru), 0);
      evicted = lineBase(set[way].tag, index, org);
    }
    set[way].valid = true;
    set[way].tag = tag;
  }
  set[way].used = now;
  return { hit, index, way, tag, offset, evicted };
}

/** How many of `addrs` hit when run, in order, through an empty cache of `org`. */
export function hitsFor(org: Org, addrs: number[]) {
  const cache = newCache(org);
  return addrs.filter((a, t) => access(cache, org, a, t + 1).hit).length;
}

/** Every button but s maps to set 0 in all four organizations, so they compete; s lands in another set. */
export const ACCESSES: { label: string; addr: number }[] = [
  { label: 'a[0]', addr: 0x100 }, { label: 'a[1]', addr: 0x104 }, { label: 'b', addr: 0x180 },
  { label: 'c', addr: 0x200 }, { label: 'd', addr: 0x280 }, { label: 'e', addr: 0x300 }, { label: 's', addr: 0x150 },
];

/** The memory hierarchy of a typical 2020s desktop or laptop processor, fastest and smallest first. */
const LEVELS: { name: string; tech: string; cls: string; size: string; time: string; where: string }[] = [
  { name: 'Registers', tech: 'flip-flops', cls: 'ff', size: 'hundreds of bytes to a few KB', time: 'under 1 cycle', where: 'inside each core' },
  { name: 'L1 cache', tech: 'SRAM', cls: 'sram', size: '32–64 KB, split into instructions and data', time: '~4–5 cycles, ~1 ns', where: 'one per core' },
  { name: 'L2 cache', tech: 'SRAM', cls: 'sram', size: '256 KB–2 MB', time: '~12–16 cycles, ~3–5 ns', where: 'one per core' },
  { name: 'L3 cache', tech: 'SRAM', cls: 'sram', size: '8–64 MB', time: '~40–70 cycles, ~10–20 ns', where: 'shared by all cores, on the die' },
  { name: 'Main memory', tech: 'DRAM', cls: 'dram', size: '8–64 GB', time: '~80–100 ns', where: 'chips beside the processor' },
  { name: 'Storage', tech: 'NAND Flash', cls: 'flash', size: '256 GB–4 TB', time: '~50–100 µs to read', where: 'an SSD, over PCIe' },
];

export function mountCaches(root: HTMLElement) {
  let org = oneOf('o', ORGS, 'direct');
  let cache = newCache(org);
  let log: { label: string; addr: number; r: Access }[] = [];
  let last: { label: string; addr: number; r: Access } | null = null;

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Memory hardware</p>
      <h1>Caches</h1>
      <p>Main memory is far slower than the processor, so between them sits a cache: a small, fast copy of the lines of
        memory used most recently. The processor checks the cache first; a <b>hit</b> is quick, a <b>miss</b> pays the
        full cost of going to memory and brings a whole line back. Some of an address’s bits pick the set of lines it may
        occupy, so addresses that share those bits compete for room. Pick how the same eight lines are organized, access
        the locations below, and watch.</p>
    </section>
    <section class="debugger mem cache" aria-label="Cache">
      <header class="dbg-bar">
        <span class="dbg-file"></span>
        <div class="dbg-controls">
          ${seg('o', 'Organization', ORGS.map((o) => [o, ORG_NAME[o]]))}
        </div>
        <div class="ca-acts">
          ${ACCESSES.map((a) => `<button type="button" class="dbg-btn" data-addr="${a.addr}" data-label="${a.label}">${a.label} <small>${hex3(a.addr)}</small></button>`).join('')}
          <button type="button" class="dbg-btn" data-act="reset">Reset</button>
        </div>
      </header>
      <div class="ca-body">
        <div class="ca-cache"><h4></h4><div class="ca-sets"></div></div>
        <div class="ca-side"><div class="ca-break"></div><dl class="ca-stat"></dl><div class="ca-cmp"></div><ol class="ca-log"></ol></div>
      </div>
      <p class="dbg-status" aria-live="polite"></p>
    </section>
    <section class="prose">
      <h2>How an address is split</h2>
      <p>The low bits are the <b>offset</b> into a line, the next bits are the <b>index</b> that picks a set, and the
        rest are the <b>tag</b> stored alongside each line to say which block of memory it currently holds. A hit is when
        some line in the address’s set is valid and its tag matches; otherwise it is a miss, the line is fetched from
        memory, and if the set is full one of its lines is evicted. Fetching a whole line at once is a bet on
        <b>spatial locality</b>: nearby bytes, like the next elements of an array, will probably be wanted soon, so
        <code>a[1]</code> after <code>a[0]</code> is already present.</p>
      <h2>Direct-mapped, set associative, fully associative</h2>
      <p>The organizations differ only in how many lines share a set. <b>Direct-mapped</b> gives every set one line, so an
        address has exactly one place to go: the lookup is a single tag compare, but two hot addresses that share an index
        knock each other out even when the rest of the cache is empty, a <b>conflict miss</b>. <b>Set associative</b>
        caches give each set several lines, called ways: a 2-way set holds two blocks with the same index, a 4-way set
        four, at the cost of comparing that many tags in parallel on every access. <b>Fully associative</b> is one set
        holding every line, so any block can go anywhere and only the cache’s total size limits it, but every tag must be
        checked, which is why it is kept for small structures such as the <a href="?p=paging" data-nav>TLB</a>. Each
        extra way halves the number of sets, so the index loses a bit and the tag gains one. Real L1 caches are typically
        8- to 12-way, and larger caches often 16-way.</p>
      <p>When a set is full, a <b>replacement policy</b> chooses which line to evict. This page uses <b>least recently
        used</b> (LRU), which evicts the line untouched for longest. Tracking exact LRU gets expensive with many ways, so
        hardware often approximates it (pseudo-LRU) or picks a line at random. Run a[0], b, c, d, e, then a[0] again:
        only the fully associative cache still has a[0], because only it can hold all five.</p>
      <h2>Where caches sit: the memory hierarchy</h2>
      <p>A computer stacks memories from small and fast to large and slow, and each level holds copies of the data the
        level above is most likely to want next. The fast levels are <a href="?p=cells" data-nav>SRAM</a>, a latch per
        bit, which is quick but large and power-hungry, so there is little of it. Main memory is DRAM, a capacitor per
        bit: far denser, but slower and in need of constant refresh. Below that, Flash keeps data with the power off. The
        figures are typical for a recent desktop or laptop processor and vary between designs.</p>
      <figure class="hier" aria-label="The memory hierarchy, fastest first">
        ${LEVELS.map((l, i) => `
        <div class="hier-row">
          <div class="hier-bar ${l.cls}" style="--w: ${34 + i * 13}%"><b>${l.name}</b><small>${l.tech}</small></div>
          <dl class="hier-facts"><div><dt>Size</dt><dd>${l.size}</dd></div><div><dt>Access</dt><dd>${l.time}</dd></div><div><dt>Where</dt><dd>${l.where}</dd></div></dl>
        </div>`).join('')}
        <figcaption>Each step down is roughly ten times larger and several times slower. L1 is split so an instruction
          fetch and a data access can happen in the same cycle; L2 and L3 hold both. A miss in every cache goes to DRAM,
          about a hundred times slower than an L1 hit.</figcaption>
      </figure>
      <h2>On a microcontroller</h2>
      <p>A microcontroller flattens this hierarchy. An STM32F407 has no data cache at all: its 192 KB of SRAM, including
        64 KB of core-coupled memory, answers at the full 168 MHz with no wait states, so there is nothing for a cache to
        hide. The slow level is the on-chip Flash that holds the program: at 168 MHz each read needs five wait states. ST
        puts a small accelerator, the ART, between the core and the Flash: it prefetches ahead, and holds 64 lines of
        128 bits of instructions and 8 lines of data, which is a cache in all but name. Larger Cortex-M7 parts such as
        the STM32F7 add true L1 instruction and data caches of 4 to 16 KB each, and application processors such as a
        phone’s Cortex-A cores have the full L1, L2 and L3 stack above.</p>
      <h2>Caches and DMA disagree</h2>
      <p>A cache means there can be two copies of an address: the stale one in memory and the fresh one in the cache. That
        is invisible until something else touches memory directly. If <a href="?p=interconnect" data-nav>DMA</a> writes a
        buffer, the CPU may still read the old cached copy; if the CPU writes and DMA reads before the line is written
        back, DMA sends stale data. Firmware handles this by <b>cleaning</b> the cache (flushing writes out) before a DMA
        read and <b>invalidating</b> it (dropping cached copies) after a DMA write, or by placing DMA buffers in memory
        marked non-cacheable. Forgetting is a classic, maddening source of intermittent DMA bugs.</p>
    </section>`;

  const labelOf = (base: number) => ACCESSES.find((a) => (a.addr & ~(LINE_BYTES - 1)) === base)?.label;

  function draw(note?: string) {
    const ways = WAYS[org], sets = setsOf(org);
    const kind = ways === 1 ? 'line' : 'set';
    root.querySelector('.cache .dbg-file')!.textContent = `${ORG_NAME[org].toLowerCase()} · ${sets} set${sets > 1 ? 's' : ''} × ${ways} way${ways > 1 ? 's' : ''} × ${LINE_BYTES} B`;
    root.querySelector('.ca-cache h4')!.textContent = `Cache: ${LINES} lines of ${LINE_BYTES} bytes`;

    root.querySelector('.ca-sets')!.innerHTML = cache.map((set, i) => {
      const full = set.every((w) => w.valid) && ways > 1;
      const lru = full ? set.reduce((m, w, k) => (w.used < set[m].used ? k : m), 0) : -1;
      return `<div class="ca-set${last && last.r.index === i ? ' active' : ''}">
        <span class="cs-i">${kind} ${i}</span>
        <div class="cs-ways" style="--ways: ${Math.min(ways, 4)}">${set.map((w, k) => {
          const base = lineBase(w.tag, i, org);
          const here = last && last.r.index === i && last.r.way === k;
          return w.valid
            ? `<div class="cw valid${here ? (last!.r.hit ? ' hit' : ' fill') : ''}${k === lru ? ' lru' : ''}"><b>${labelOf(base) ?? hex3(base)}</b><small>tag 0x${w.tag.toString(16).toUpperCase()}</small>${k === lru ? '<i>next out</i>' : ''}</div>`
            : '<div class="cw"><small>empty</small></div>';
        }).join('')}</div>
      </div>`;
    }).join('');

    // Address breakdown of the last access: tag | index | offset bits. Fully associative has no index.
    if (last) {
      const f = fields(last.addr, org);
      const ib = indexBits(org);
      const bin = (last.addr >>> 0).toString(2).padStart(ADDR_BITS, '0');
      const tagB = bin.slice(0, ADDR_BITS - OFFSET_BITS - ib);
      const idxB = bin.slice(ADDR_BITS - OFFSET_BITS - ib, ADDR_BITS - OFFSET_BITS);
      const offB = bin.slice(ADDR_BITS - OFFSET_BITS);
      root.querySelector('.ca-break')!.innerHTML =
        `<div class="cb-addr">${hex3(last.addr)} <small>${last.label}</small></div>
         <div class="cb-bits"><span class="cb-tag">${tagB}<small>tag 0x${f.tag.toString(16).toUpperCase()}</small></span>${ib ? `<span class="cb-idx">${idxB}<small>index ${f.index}</small></span>` : ''}<span class="cb-off">${offB}<small>offset ${f.offset}</small></span></div>`;
    } else root.querySelector('.ca-break')!.innerHTML = '<div class="cb-addr cb-empty">Access a location to see its tag · index · offset.</div>';

    const hits = log.filter((e) => e.r.hit).length;
    const rate = log.length ? Math.round((hits / log.length) * 100) : 0;
    root.querySelector('.ca-stat')!.innerHTML =
      `<div><dt>Accesses</dt><dd>${log.length}</dd></div><div><dt>Hits</dt><dd>${hits}</dd></div><div><dt>Hit rate</dt><dd>${rate}%</dd></div>`;

    // The same accesses replayed on every organization, so the trade-off is one glance.
    const addrs = log.map((e) => e.addr);
    root.querySelector('.ca-cmp')!.innerHTML = `<h4>The same accesses on each cache</h4><div class="cc-rows">${ORGS.map((o) => {
      const h = hitsFor(o, addrs);
      return `<div class="cc-row${o === org ? ' on' : ''}"><span>${ORG_NAME[o]}</span><i style="--f: ${addrs.length ? h / addrs.length : 0}"></i><b>${h} / ${addrs.length}</b></div>`;
    }).join('')}</div>`;

    root.querySelector('.ca-log')!.innerHTML = log.slice(-4).reverse().map((e) =>
      `<li class="${e.r.hit ? 'hit' : 'miss'}"><span>${e.label} ${hex3(e.addr)}</span><b>${e.r.hit ? 'hit' : e.r.evicted !== null ? 'miss · evicts' : 'miss'}</b></li>`).join('')
      || '<li class="ca-none">no accesses yet</li>';

    markSeg(root, 'o', org);
    status(root, note ?? (ways === 1
      ? 'Direct-mapped: each address has exactly one line it can live in, chosen by its index bits.'
      : ways === LINES
        ? 'Fully associative: one set of all eight lines, so any address can go in any line. Only the cache’s size limits it.'
        : `${ways}-way set associative: the index picks one of ${sets} sets, and the address can go in any of its ${ways} lines.`));
    syncUrl({ o: org });
  }

  draw();
  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    const btn = t.closest<HTMLElement>('[data-addr]');
    const act = t.closest<HTMLElement>('[data-act]');
    const o = t.closest<HTMLElement>('[data-o]');
    if (o) {
      org = o.dataset.o as Org;
      // Replay what was accessed so far on the new organization, so switching compares like with like.
      cache = newCache(org);
      log = log.map((x, i) => ({ ...x, r: access(cache, org, x.addr, i + 1) }));
      last = log.length ? log[log.length - 1] : null;
      draw(log.length ? `The same ${log.length} accesses replayed on a ${ORG_NAME[org].toLowerCase()} cache.` : undefined);
    } else if (btn) {
      const addr = Number(btn.dataset.addr);
      const label = btn.dataset.label!;
      const r = access(cache, org, addr, log.length + 1);
      last = { label, addr, r };
      log.push(last);
      const where = WAYS[org] === 1 ? `line ${r.index}` : `set ${r.index}`;
      const tag = `tag 0x${r.tag.toString(16).toUpperCase()}`;
      const note = r.hit
        ? `Hit. ${label} at ${hex3(addr)} maps to ${where}, which already holds ${tag}, so the data comes from the cache with no trip to memory.`
        : r.evicted !== null
          ? WAYS[org] === 1
            ? `Miss, and a conflict. ${label} maps to ${where}, but that line held ${labelOf(r.evicted) ?? hex3(r.evicted)}, so it is evicted and ${label}’s line is fetched from memory. Two hot addresses sharing a line thrash.`
            : `Miss, and ${where} is full, so its least recently used line, ${labelOf(r.evicted) ?? hex3(r.evicted)}, is evicted to make room for ${label}. More ways would have kept it.`
          : `Cold miss. ${label} at ${hex3(addr)} is not cached yet, so a free line in ${where} is filled from memory. The whole ${LINE_BYTES}-byte line comes in, so the next few bytes will hit.`;
      draw(note);
    } else if (act) {
      cache = newCache(org);
      log = []; last = null;
      draw('Cache cleared. Every line is cold again.');
    }
  });
}
