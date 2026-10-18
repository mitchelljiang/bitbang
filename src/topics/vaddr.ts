/**
 * Virtual and physical addresses: on a processor with an MMU, every program gets its own address space, and the MMU
 * maps each virtual page to a physical frame. Two programs can use the identical virtual address and never collide,
 * because each maps to a different frame; and two can share a frame on purpose. translate is exported for the checks.
 */
import { status, syncUrl } from './dbg';

const PAGE = 0x1000; // 4 KB pages, 12-bit offset
const FRAMES = 8;

export interface Proc { id: string; name: string; table: number[] } // vpage -> frame, -1 = unmapped

export const PROCS: Proc[] = [
  { id: 'a', name: 'Process A', table: [2, 5, -1, 1] },
  { id: 'b', name: 'Process B', table: [4, 2, 6, -1] },
];

export interface Xlate { vpage: number; offset: number; frame: number; paddr: number; fault: boolean }

/** Translate a virtual address for a process: virtual page → physical frame, offset carried through unchanged. */
export function translate(proc: Proc, vaddr: number): Xlate {
  const vpage = vaddr >> 12;
  const offset = vaddr & (PAGE - 1);
  const frame = proc.table[vpage] ?? -1;
  return { vpage, offset, frame, paddr: frame < 0 ? -1 : (frame << 12) | offset, fault: frame < 0 };
}

const hex4 = (v: number) => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(4, '0');

export function mountVaddr(root: HTMLElement) {
  const q = new URLSearchParams(location.search).get('v');
  let sel = { proc: 'a', vpage: 0 };
  if (q) { const [p, v] = q.split(':'); if (PROCS.some((x) => x.id === p) && +v >= 0 && +v < 4) sel = { proc: p, vpage: +v }; }

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Virtual memory</p>
      <h1>Virtual and physical addresses</h1>
      <p>On a desktop or phone, the address a program uses is not the address in the memory chips. Each program runs in
        its own <b>virtual</b> address space, starting at the same low addresses as every other, and the memory
        management unit translates each access to a real <b>physical</b> address as it happens. So two programs can both
        use <code>0x0000</code> and never clash: the MMU sends each to different physical memory. A microcontroller has no
        MMU, so there the two are the same. Pick a page in either process.</p>
    </section>
    <section class="debugger mem vmem" aria-label="Virtual and physical addresses">
      <header class="dbg-bar">
        <span class="dbg-file">MMU · ${PAGE / 1024} KB pages</span>
        <span class="dbg-state"><i aria-hidden="true"></i>translating</span>
      </header>
      <div class="vm-body">
        <div class="vm-proc" data-col="a"></div>
        <div class="vm-phys"><h4>Physical memory</h4><div class="vm-frames"></div></div>
        <div class="vm-proc" data-col="b"></div>
      </div>
      <p class="dbg-status" aria-live="polite"></p>
    </section>
    <section class="prose">
      <h2>What the translation buys</h2>
      <p>Three things, all from the same mechanism. <b>Isolation</b>: a program can only name addresses in its own map, so
        it physically cannot read or corrupt another’s memory, no matter what pointer it builds. <b>Flexibility</b>: the
        physical frames behind a program need not be contiguous or even all present, which is what lets the operating
        system hand out memory in scattered frames and move it around. <b>Sharing</b>: pointing two maps at the same
        frame, as A’s page 0 and B’s page 1 are here, shares memory deliberately, which is how shared libraries live in
        physical memory once and appear in every process.</p>
      <h2>Pages, not bytes</h2>
      <p>Translation works a page at a time, not a byte at a time, or the map would be as large as the memory it
        describes. The low bits, the <b>offset</b> within a page, pass through untouched; only the high bits, the page
        number, are looked up and replaced with a frame number. With 4 KB pages that is the low 12 bits carried through
        and the rest translated. The lookup table itself, the <a href="?p=paging" data-nav>page table</a>, is what the
        next page is about.</p>
      <h2>When a page is not mapped</h2>
      <p>A virtual page with no frame behind it, like A’s page 2 here, causes a <b>page fault</b> on access. That is not
        always an error: the OS uses it deliberately, to load a page from disk on first use (demand paging), to grow the
        stack, or to copy a shared page only when it is first written. A fault that corresponds to nothing valid is the
        segfault a buggy program earns. A microcontroller has no such net, which is why a bad pointer there simply reads
        or writes whatever physical address it names.</p>
    </section>`;

  function procCol(proc: Proc) {
    const rows = proc.table.map((frame, vp) => {
      const on = sel.proc === proc.id && sel.vpage === vp;
      const va = vp << 12;
      return `<button type="button" class="vm-page${on ? ' on' : ''}${frame < 0 ? ' unmapped' : ''}" data-proc="${proc.id}" data-vpage="${vp}" aria-pressed="${on}">
        <span class="vp-va">${hex4(va)}</span><span class="vp-arrow">${frame < 0 ? '✕' : '→'}</span><span class="vp-fr">${frame < 0 ? 'unmapped' : 'frame ' + frame}</span></button>`;
    }).join('');
    return `<h4>${proc.name} <small>virtual</small></h4><div class="vm-pages">${rows}</div>`;
  }

  function draw(note?: string) {
    const proc = PROCS.find((p) => p.id === sel.proc)!;
    const x = translate(proc, (sel.vpage << 12) | 0x24);

    for (const p of PROCS) root.querySelector(`.vm-proc[data-col="${p.id}"]`)!.innerHTML = procCol(p);

    root.querySelector('.vm-frames')!.innerHTML = Array.from({ length: FRAMES }, (_, f) => {
      const users = PROCS.flatMap((p) => p.table.map((fr, vp) => ({ p, vp, fr }))).filter((u) => u.fr === f);
      const active = !x.fault && x.frame === f;
      const shared = new Set(users.map((u) => u.p.id)).size > 1;
      return `<div class="vm-frame${active ? ' active' : ''}${users.length ? ' used' : ''}${shared ? ' shared' : ''}">
        <span class="vf-n">frame ${f}</span><span class="vf-a">${hex4(f << 12)}</span>
        <span class="vf-u">${users.map((u) => `<i class="u-${u.p.id}">${u.p.name[8]}·p${u.vp}</i>`).join('')}</span></div>`;
    }).join('');

    if (!note) {
      note = x.fault
        ? `${proc.name}’s page at ${hex4(sel.vpage << 12)} is not mapped to any frame, so touching it raises a page fault. Nothing physical backs this virtual address.`
        : `${proc.name} reads ${hex4((sel.vpage << 12) | 0x24)}: page ${x.vpage} maps to frame ${x.frame}, and the offset 0x024 is carried through, so the physical address is ${hex4(x.paddr)}. ${sameNote(proc, sel.vpage)}`;
    }
    status(root, note);
    syncUrl({ v: `${sel.proc}:${sel.vpage}` });
  }

  function sameNote(proc: Proc, vp: number) {
    const other = PROCS.find((p) => p.id !== proc.id)!;
    if (vp === 0 && other.table[0] >= 0 && other.table[0] !== proc.table[0])
      return `The same virtual address in ${other.name} maps to frame ${other.table[0]} instead: identical address, different memory.`;
    const frame = proc.table[vp];
    const sharer = PROCS.flatMap((p) => p === proc ? [] : p.table.map((fr, v) => ({ p, v, fr }))).find((u) => u.fr === frame);
    if (sharer) return `Frame ${frame} is also mapped by ${sharer.p.name}’s page ${sharer.v}, so the two processes share this memory on purpose.`;
    return '';
  }

  draw();
  root.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-proc][data-vpage]');
    if (b) { sel = { proc: b.dataset.proc!, vpage: Number(b.dataset.vpage) }; draw(); }
  });
}
