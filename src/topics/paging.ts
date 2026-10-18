/**
 * Page tables and the TLB: the MMU turns a virtual page into a physical frame by walking a tree of tables, one index
 * per level, then caches the result in the TLB so the next access to that page skips the walk. Access addresses and
 * watch the two-level walk, and the TLB turn a repeat access into a hit. walk and tlbLookup are exported for the checks.
 */
import { status, syncUrl } from './dbg';

// 12-bit virtual address: L1 index (2) | L2 index (2) | offset (8). 256-byte pages.
const L1_SHIFT = 10, L2_SHIFT = 8, OFFSET_MASK = 0xff;

/** The level-2 tables, one per present level-1 entry. A missing key is a level-1 miss; a -1 entry is a level-2 miss. */
export const L2: Record<number, number[]> = {
  0: [3, 7, -1, 5],
  1: [1, -1, 2, 9],
  3: [6, 4, 8, -1],
};

export interface Walk { l1: number; l2: number; offset: number; frame: number; paddr: number; fault: 'none' | 'l1' | 'l2' }

/** Walk the page table for a virtual address: level-1 index, then level-2 index, then the offset carried through. */
export function walk(vaddr: number): Walk {
  const l1 = (vaddr >> L1_SHIFT) & 3;
  const l2 = (vaddr >> L2_SHIFT) & 3;
  const offset = vaddr & OFFSET_MASK;
  const table = L2[l1];
  if (!table) return { l1, l2, offset, frame: -1, paddr: -1, fault: 'l1' };
  const frame = table[l2];
  if (frame < 0) return { l1, l2, offset, frame: -1, paddr: -1, fault: 'l2' };
  return { l1, l2, offset, frame, paddr: (frame << L2_SHIFT) | offset, fault: 'none' };
}

export interface TlbEntry { vpage: number; frame: number }
/** The TLB caches virtual-page → frame. A lookup is a hit when the page is present. */
export const tlbLookup = (tlb: TlbEntry[], vpage: number) => tlb.find((e) => e.vpage === vpage);

const PRESETS = [
  { label: 'p', addr: 0x024 }, { label: 'p+64', addr: 0x064 }, { label: 'q', addr: 0x124 },
  { label: 'r', addr: 0x424 }, { label: 's', addr: 0x224 }, { label: 't', addr: 0xc24 },
];
const hex3 = (v: number) => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(3, '0');
const vpageOf = (addr: number) => addr >> L2_SHIFT;

export function mountPaging(root: HTMLElement) {
  let tlb: TlbEntry[] = [];
  let cur: { addr: number; label: string; hit: boolean } | null = { addr: 0x024, label: 'p', hit: false };

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Virtual memory</p>
      <h1>Page tables and the TLB</h1>
      <p>The map from virtual pages to physical frames is itself a structure in memory: the page table. Storing one entry
        per page would be enormous, so it is a tree, walked a few bits of the address at a time. That walk costs extra
        memory accesses on every translation, so the MMU keeps a small cache of recent translations, the TLB, and checks
        it first. Access an address below to watch the walk, then access the same page again to watch the TLB answer it.</p>
    </section>
    <section class="debugger mem pgtab" aria-label="Page tables and the TLB">
      <header class="dbg-bar">
        <span class="dbg-file">2-level walk</span>
        <span class="dbg-state"><i aria-hidden="true"></i>256 B pages</span>
        <div class="dbg-controls">
          ${PRESETS.map((p) => `<button type="button" class="dbg-btn" data-addr="${p.addr}" data-label="${p.label}">${hex3(p.addr)}</button>`).join('')}
          <button type="button" class="dbg-btn" data-act="reset">Clear TLB</button>
        </div>
      </header>
      <div class="pg-body"></div>
      <p class="dbg-status" aria-live="polite"></p>
    </section>
    <section class="prose">
      <h2>Why a tree, and why it is walked</h2>
      <p>A flat table with one entry per virtual page would need megabytes per process, almost all of it describing pages
        that are never used. A multi-level table only spends memory on the branches that exist: the top level points at
        second-level tables, which point at frames, and an absent branch costs one empty entry instead of a whole table.
        The price is that a translation now reads one table per level before it reaches the frame, so on a 64-bit machine
        with four levels, one load can mean four hidden loads first. That is the <b>page-table walk</b>, and it is done in
        hardware by the MMU.</p>
      <h2>The TLB</h2>
      <p>Paying for a walk on every access would be ruinous, but programs touch the same handful of pages over and over,
        so the translations repeat. The <b>translation lookaside buffer</b> is a small, fully associative cache of
        recent virtual-page → frame mappings, checked before any walk. A TLB hit translates in effectively no time; only
        a miss walks the table and then fills the TLB. Hit rates are normally well over 99%, which is the only reason
        paged memory is fast enough to use at all.</p>
      <h2>Context switches and flushes</h2>
      <p>Because each process has its own page table, the same virtual page means different frames in different processes,
        so a naive TLB has to be flushed on every <a href="?p=context" data-nav>context switch</a>, and every entry is a
        cold miss afterward. Real processors avoid most of that by tagging TLB entries with an address-space identifier,
        so entries from several processes coexist and survive the switch. Changing a page table also means invalidating
        the stale TLB entries by hand, a step that, forgotten, produces translations that quietly point at the wrong
        memory.</p>
    </section>`;

  function draw(note?: string) {
    const w = walk(cur!.addr);
    const bin = (cur!.addr >>> 0).toString(2).padStart(12, '0');
    const vpage = vpageOf(cur!.addr);
    const inTlb = tlbLookup(tlb, vpage);

    const l1rows = [0, 1, 2, 3].map((i) => {
      const present = !!L2[i];
      const on = i === w.l1;
      return `<div class="pg-ent${on ? ' on' : ''}${present ? '' : ' empty'}"><span>[${i}]</span><b>${present ? '→ L2 table ' + i : '—'}</b></div>`;
    }).join('');
    const l2tab = L2[w.l1];
    const l2rows = l2tab
      ? [0, 1, 2, 3].map((i) => {
          const on = i === w.l2;
          const fr = l2tab[i];
          return `<div class="pg-ent${on ? ' on' : ''}${fr < 0 ? ' empty' : ''}"><span>[${i}]</span><b>${fr < 0 ? '— fault' : '→ frame ' + fr}</b></div>`;
        }).join('')
      : '<div class="pg-ent empty"><span>—</span><b>no table</b></div>';

    const paLabel = w.fault !== 'none' ? '<span class="pg-fault">page fault</span>'
      : `<b>${'0x' + (w.paddr >>> 0).toString(16).toUpperCase().padStart(3, '0')}</b>`;

    root.querySelector('.pg-body')!.innerHTML = `
      <div class="pg-va">
        <span class="pg-va-h">virtual ${hex3(cur!.addr)} <small>${cur!.label}</small></span>
        <div class="pg-va-bits"><span class="b-l1">${bin.slice(0, 2)}<small>L1 ${w.l1}</small></span><span class="b-l2">${bin.slice(2, 4)}<small>L2 ${w.l2}</small></span><span class="b-off">${bin.slice(4)}<small>offset 0x${w.offset.toString(16).toUpperCase().padStart(2, '0')}</small></span></div>
      </div>
      <div class="pg-walk ${inTlb && cur!.hit ? 'skipped' : ''}">
        <div class="pg-tab"><h4>Level-1 table</h4>${l1rows}</div>
        <div class="pg-tab"><h4>Level-2 table ${L2[w.l1] ? w.l1 : ''}</h4>${l2rows}</div>
        <div class="pg-out"><h4>Physical</h4><div class="pg-pa">${paLabel}</div></div>
      </div>
      <div class="pg-tlb"><h4>TLB <small>virtual page → frame</small></h4><div class="pg-tlb-rows">${
        tlb.length ? tlb.map((e) => `<div class="pg-tlb-row${e.vpage === vpage && cur!.hit ? ' hit' : ''}"><span>page ${e.vpage}</span><b>frame ${e.frame}</b></div>`).join('') : '<div class="pg-tlb-row empty">empty</div>'
      }</div></div>`;

    status(root, note ?? 'Pick an address to translate it.');
    syncUrl({});
  }

  draw('Access an address to walk the page table.');
  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    const btn = t.closest<HTMLElement>('[data-addr]');
    const act = t.closest<HTMLElement>('[data-act]');
    if (btn) {
      const addr = Number(btn.dataset.addr);
      const label = btn.dataset.label!;
      const vpage = vpageOf(addr);
      const hit = !!tlbLookup(tlb, vpage);
      const w = walk(addr);
      cur = { addr, label, hit };
      let note: string;
      if (hit) {
        note = `TLB hit. Page ${vpage} is already cached as frame ${w.frame}, so the MMU skips the walk entirely and translates ${hex3(addr)} to its physical address in effectively no time.`;
      } else if (w.fault !== 'none') {
        note = w.fault === 'l1'
          ? `Level-1 miss: entry ${w.l1} has no level-2 table, so this whole 1 KB range is unmapped. The access faults; nothing is added to the TLB.`
          : `Level-2 miss: the table exists but entry ${w.l2} has no frame, so page ${vpage} is not mapped. The access faults.`;
      } else {
        if (!tlbLookup(tlb, vpage)) tlb = [...tlb, { vpage, frame: w.frame }].slice(-5);
        note = `TLB miss, so the MMU walks: level-1 entry ${w.l1} gives the level-2 table, level-2 entry ${w.l2} gives frame ${w.frame}, and the offset is carried through, so ${hex3(addr)} → 0x${(w.paddr >>> 0).toString(16).toUpperCase().padStart(3, '0')}. The mapping is now cached in the TLB, so the next access to page ${vpage} hits.`;
      }
      draw(note);
    } else if (act) { tlb = []; draw('TLB cleared. Every translation will walk the table again until it refills.'); }
  });
}
