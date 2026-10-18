/**
 * MPU and MMU: a Memory Protection Unit guards the address space without translating it. A few regions each carry a
 * base, size and permissions; every access is checked against them, and one that breaks the rules, or lands outside
 * every region, faults. Choose an access and see which region catches it. checkAccess is exported for the checks.
 */
import { markSeg, oneOf, seg, status, syncUrl } from './dbg';

type Perm = 'rw' | 'ro' | 'none';
export interface Region { name: string; base: number; size: number; priv: Perm; unpriv: Perm; exec: boolean }

/** A typical Cortex-M MPU layout. Later (higher-numbered) regions win where they overlap, as on hardware. */
export const REGIONS: Region[] = [
  { name: 'Flash (code)', base: 0x08000000, size: 0x100000, priv: 'ro', unpriv: 'ro', exec: true },
  { name: 'SRAM (data)', base: 0x20000000, size: 0x20000, priv: 'rw', unpriv: 'rw', exec: false },
  { name: 'Peripherals', base: 0x40000000, size: 0x100000, priv: 'rw', unpriv: 'none', exec: false },
  { name: 'Stack guard', base: 0x2001f800, size: 0x20, priv: 'none', unpriv: 'none', exec: false },
];

export type Op = 'read' | 'write' | 'exec';
export type Mode = 'priv' | 'unpriv';
export interface AccessResult { region: number; allowed: boolean; reason: string }

/** Check an access against the regions: the highest-numbered region that contains the address decides. */
export function checkAccess(regions: Region[], addr: number, op: Op, mode: Mode): AccessResult {
  let idx = -1;
  for (let i = regions.length - 1; i >= 0; i--) {
    const r = regions[i];
    if ((addr >>> 0) >= r.base && (addr >>> 0) < r.base + r.size) { idx = i; break; }
  }
  if (idx < 0) return { region: -1, allowed: false, reason: 'no region covers this address, so the default background rule denies it' };
  const r = regions[idx];
  if (op === 'exec' && !r.exec) return { region: idx, allowed: false, reason: `${r.name} is marked execute-never (XN); running code from it faults` };
  const perm = mode === 'priv' ? r.priv : r.unpriv;
  if (perm === 'none') return { region: idx, allowed: false, reason: `${r.name} grants ${mode === 'priv' ? 'privileged' : 'unprivileged'} code no access` };
  if (op === 'write' && perm === 'ro') return { region: idx, allowed: false, reason: `${r.name} is read-only, so the write faults` };
  return { region: idx, allowed: true, reason: `${r.name} allows ${mode === 'priv' ? 'privileged' : 'unprivileged'} ${op}` };
}

const MARKS = [
  { label: 'Flash code', addr: 0x08001000 }, { label: 'A global', addr: 0x20000100 },
  { label: 'GPIO reg', addr: 0x40020c14 }, { label: 'Stack guard', addr: 0x2001f810 },
  { label: 'Unmapped', addr: 0x60000000 },
];
const hex8 = (v: number) => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(8, '0');
const permText = (p: Perm) => (p === 'rw' ? 'read/write' : p === 'ro' ? 'read-only' : 'no access');

export function mountMpu(root: HTMLElement) {
  let op = oneOf('o', ['read', 'write', 'exec'] as const, 'write');
  let mode = oneOf('m', ['priv', 'unpriv'] as const, 'unpriv');
  const a0 = parseInt(new URLSearchParams(location.search).get('a') ?? '', 16);
  let addr = Number.isInteger(a0) ? a0 >>> 0 : 0x40020c14;

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Virtual memory</p>
      <h1>MPU and MMU</h1>
      <p>Not every processor has an MMU, but many have a lighter cousin: the Memory Protection Unit. It does not translate
        addresses, so there is still one address space; it only enforces rules on it. A handful of regions each say what
        range they cover and who may read, write or execute there, and any access that breaks a rule, or falls outside
        every region, faults instead of going through. Choose an access below and see which region decides its fate.</p>
    </section>
    <section class="debugger mem mpu" aria-label="MPU">
      <header class="dbg-bar">
        <span class="dbg-file">MPU · ${REGIONS.length} regions</span>
        <span class="dbg-state"><i aria-hidden="true"></i>checking</span>
        <div class="dbg-controls">
          ${seg('o', 'Operation', [['read', 'Read'], ['write', 'Write'], ['exec', 'Execute']])}
          ${seg('m', 'Mode', [['priv', 'Privileged'], ['unpriv', 'Unprivileged']])}
        </div>
      </header>
      <div class="mp-body">
        <div class="mp-access">
          <label class="dbg-set">addr <input type="text" spellcheck="false" aria-label="Address in hex" value="${hex8(addr)}"></label>
          <div class="mp-marks">${MARKS.map((m, i) => `<button type="button" class="dbg-btn" data-mark="${i}">${m.label}</button>`).join('')}</div>
        </div>
        <div class="mp-regions"></div>
        <div class="mp-verdict"></div>
      </div>
      <p class="dbg-status" aria-live="polite"></p>
    </section>
    <section class="prose">
      <h2>Protection without translation</h2>
      <p>The MPU is the cheap half of memory protection: no page tables, no TLB, no translation, just a comparator per
        region that checks each access against a base, a size and a permission set. That is enough to give an operating
        system real teeth on a microcontroller. User tasks run <b>unprivileged</b> and are boxed into their own regions,
        so a bug in one cannot scribble over the kernel, another task, or the peripherals; only privileged code can. It
        is the same idea as an <a href="?p=vaddr" data-nav>MMU</a>’s isolation, minus the address translation and the
        ability to oversubscribe memory.</p>
      <h2>Catching bugs at the source</h2>
      <p>Because a violation faults immediately, the MPU turns whole classes of silent corruption into a precise,
        reported error. Marking Flash read-only catches a wild pointer that tries to overwrite code; marking RAM
        execute-never stops a <a href="?p=bufover" data-nav>buffer overflow</a> from running data as instructions; a
        no-access region just below each task’s stack catches a <a href="?p=overflow" data-nav>stack overflow</a> the
        instant it crosses the line. The fault handler gets the faulting address and can log it or kill the offending
        task instead of letting the damage spread.</p>
      <h2>Regions, alignment and priority</h2>
      <p>The trade-off is coarseness. A classic Cortex-M MPU offers only a handful of regions (often eight), and each
        must be a power-of-two size aligned to its own size, so protection is laid out in blocks, not bytes. Where regions
        overlap, the highest-numbered one wins, which is exactly how the stack guard here sits inside the larger RAM
        region and overrides it. The newer Armv8-M MPU drops the power-of-two rule for simple base-and-limit regions, but
        the model, check every access against a small set of ranges, is the same.</p>
    </section>`;

  const input = root.querySelector<HTMLInputElement>('.dbg-set input')!;

  function draw(note?: string) {
    const res = checkAccess(REGIONS, addr, op, mode);

    root.querySelector('.mp-regions')!.innerHTML = REGIONS.map((r, i) => {
      const on = i === res.region;
      return `<div class="mp-region${on ? ' on' : ''}${on ? (res.allowed ? ' ok' : ' bad') : ''}">
        <div class="mr-head"><b>R${i} ${r.name}</b><span>${hex8(r.base)} · ${r.size >= 0x400 ? r.size / 1024 + ' KB' : r.size + ' B'}</span></div>
        <div class="mr-perm">priv ${permText(r.priv)} · unpriv ${permText(r.unpriv)} · ${r.exec ? 'executable' : 'XN'}</div>
      </div>`;
    }).join('');

    root.querySelector('.mp-verdict')!.innerHTML = `<div class="mp-v ${res.allowed ? 'ok' : 'bad'}">
      <span class="mp-vop">${mode === 'priv' ? 'privileged' : 'unprivileged'} ${op} @ ${hex8(addr)}</span>
      <b>${res.allowed ? '✓ allowed' : '✕ MemManage fault'}</b></div>`;

    markSeg(root, 'o', op);
    markSeg(root, 'm', mode);
    status(root, note ?? `${capitalize(mode)} ${op} at ${hex8(addr)}: ${res.allowed ? 'allowed — ' : 'faults — '}${res.reason}.`);
    syncUrl({ o: op, m: mode, a: (addr >>> 0).toString(16).toUpperCase() });
  }

  const capitalize = (s: string) => s === 'priv' ? 'Privileged' : s === 'unpriv' ? 'Unprivileged' : s;

  draw();
  input.addEventListener('input', () => {
    const v = parseInt(input.value.replace(/^0x/i, ''), 16);
    if (Number.isInteger(v)) { addr = v >>> 0; draw(); }
    else status(root, 'Type a hex address, such as 0x20000100.');
  });
  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    const o = t.closest<HTMLElement>('[data-o]');
    const m = t.closest<HTMLElement>('[data-m]');
    const mk = t.closest<HTMLElement>('[data-mark]');
    if (o) op = o.dataset.o as Op;
    else if (m) mode = m.dataset.m as Mode;
    else if (mk) { addr = MARKS[Number(mk.dataset.mark)].addr; input.value = hex8(addr); }
    else return;
    draw();
  });
}
