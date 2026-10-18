/**
 * Stack overflow: the stack grows down from the top of SRAM, and nothing automatically stops it growing past the room
 * reserved for it into the globals below. Recurse deeper and watch SP cross the limit, then see how each guard, none,
 * an MPU region, or a painted stack, reacts. spForDepth and overflowed are exported for the checks.
 */
import { markSeg, oneOf, seg, status, syncUrl } from './dbg';

const TOP = 0x20020000; // top of SRAM: SP starts here
const STACK = 0x800; // 2 KB reserved for the stack
const LIMIT = TOP - STACK; // 0x2001F800
const FRAME = 0x100; // 256 bytes per recursion level
const FLOOR = LIMIT - 0x600; // how far below the limit the view shows (the globals band)
const MODES = ['none', 'mpu', 'paint'] as const;
type Mode = (typeof MODES)[number];

export const spForDepth = (depth: number) => TOP - depth * FRAME;
export const overflowed = (depth: number) => spForDepth(depth) < LIMIT;

export function mountOverflow(root: HTMLElement) {
  let mode = oneOf('g', MODES, 'none');
  const d0 = Number(new URLSearchParams(location.search).get('d'));
  let depth = Number.isInteger(d0) && d0 >= 0 && d0 <= 11 ? d0 : 0;

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">The call stack</p>
      <h1>Stack overflow</h1>
      <p>The stack is given a fixed slice of RAM, but nothing in the hardware forces it to stay inside it. Every call
        pushes a <a href="?p=frames" data-nav>frame</a> and moves SP down; deep enough recursion, or one large local
        array, pushes SP past the bottom of its region and into whatever is there, usually the globals. Recurse below and
        watch SP fall toward the limit, then try each way firmware guards against crossing it.</p>
    </section>
    <section class="debugger mem sover" aria-label="Stack overflow">
      <header class="dbg-bar">
        <span class="dbg-file">SRAM · stack region</span>
        <span class="dbg-state"><i aria-hidden="true"></i>${STACK} B reserved</span>
        <div class="dbg-controls">
          ${seg('g', 'Guard', [['none', 'No guard'], ['mpu', 'MPU region'], ['paint', 'Stack painting']])}
          <button type="button" class="dbg-btn" data-act="less">− Return</button>
          <button type="button" class="dbg-btn" data-act="more">Recurse +</button>
          <button type="button" class="dbg-btn" data-act="reset">Reset</button>
        </div>
      </header>
      <div class="so-body">
        <div class="so-bar"></div>
        <dl class="so-stat"></dl>
      </div>
      <p class="dbg-status" aria-live="polite"></p>
    </section>
    <section class="prose">
      <h2>Why it is dangerous and quiet</h2>
      <p>With no guard, overrunning the stack is simply a write to an address below the limit, an ordinary store that the
        hardware carries out. It overwrites the globals, or another task’s stack, and execution continues with corrupted
        data. The crash, if there is one, comes later and somewhere else, which makes a stack overflow one of the hardest
        embedded bugs to track down. Recursion and large stack-allocated buffers are the usual causes, which is why
        safety-critical coding standards bound recursion and cap local array sizes.</p>
      <h2>Catching it at the line</h2>
      <p>The cleanest guard puts an <a href="?p=mpu" data-nav>MPU</a> region with no access permission just below the
        stack. The instant SP crosses it and the function writes, the access faults, so the error is reported exactly
        when and where it happens instead of corrupting memory silently. Armv8-M adds a dedicated stack-limit register,
        <code>MSPLIM</code>/<code>PSPLIM</code>, that faults on the SP update itself, even before any write.</p>
      <h2>Measuring it after the fact</h2>
      <p>A cheaper, common technique is <b>stack painting</b>: fill the whole stack region with a known value such as
        <code>0xDEADBEEF</code> at startup, then later scan from the bottom for the first byte still unchanged. The gap
        tells you the deepest the stack ever reached, the high-water mark. It does not stop an overflow, and it only
        measures what has happened so far, but it is how an RTOS reports per-task stack usage so you can size each stack
        with a margin.</p>
    </section>`;

  function draw(note?: string) {
    const over = overflowed(depth);
    // In MPU mode the first access past the limit faults, so SP is shown stopped at the limit.
    const sp = mode === 'mpu' && over ? LIMIT : spForDepth(depth);
    const range = TOP - FLOOR;
    const pct = (addr: number) => ((TOP - addr) / range) * 100;
    const limitPct = pct(LIMIT);
    const usedPct = Math.min(pct(sp), 100);
    const faulted = mode === 'mpu' && over;
    const cls = over && !faulted ? 'bad' : faulted ? 'warn' : '';

    root.querySelector('.so-bar')!.innerHTML = `
      <div class="so-region so-globals" style="top:${limitPct}%"><span>.bss / globals</span></div>
      <div class="so-region so-stackregion" style="height:${limitPct}%"><span>stack region · ${STACK} B</span></div>
      <div class="so-used ${cls}" style="height:${usedPct}%"></div>
      <div class="so-limit" style="top:${limitPct}%"><span>limit 0x${LIMIT.toString(16).toUpperCase()}</span></div>
      <div class="so-sp ${cls}" style="top:${Math.min(usedPct, 100)}%"><span class="tag"><b>SP</b> 0x${sp.toString(16).toUpperCase()}</span></div>`;

    const beyond = Math.max(0, LIMIT - spForDepth(depth));
    root.querySelector('.so-stat')!.innerHTML =
      `<div><dt>Depth</dt><dd>${depth} frame${depth === 1 ? '' : 's'}</dd></div>` +
      `<div><dt>Used</dt><dd>${TOP - spForDepth(depth)} / ${STACK} B</dd></div>` +
      `<div><dt>Past limit</dt><dd>${beyond} B</dd></div>`;

    markSeg(root, 'g', mode);
    root.querySelector<HTMLButtonElement>('[data-act="less"]')!.disabled = depth === 0;
    root.querySelector<HTMLButtonElement>('[data-act="more"]')!.disabled = depth >= 11;
    const el = root.querySelector('.dbg-status')! as HTMLElement;
    el.className = 'dbg-status' + (cls ? ` ${cls}` : '');
    status(root, note ?? explain(over, beyond));
    syncUrl({ g: mode, d: String(depth) });
  }

  function explain(over: boolean, beyond: number) {
    if (!over) return `${depth} frame${depth === 1 ? '' : 's'} deep, SP is still ${spForDepth(depth) - LIMIT} bytes above the limit. The stack is within its region; everything below it is untouched.`;
    if (mode === 'none') return `SP has crossed the limit by ${beyond} bytes. With no guard the writes just land in the globals below and execution carries on with the data silently corrupted. The crash, if any, comes later and elsewhere.`;
    if (mode === 'mpu') return `The frame’s first write below the limit hits the MPU guard region and faults immediately. SP is caught right at 0x${LIMIT.toString(16).toUpperCase()}, so the overflow is reported exactly where it happened instead of corrupting memory.`;
    return `SP is ${beyond} bytes past the limit. Stack painting does not stop this, but the overwritten 0xDEADBEEF pattern lets a later high-water-mark check report that the stack reached this depth, so you can catch it in testing and size the stack with margin.`;
  }

  draw();
  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    const g = t.closest<HTMLElement>('[data-g]');
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (g) mode = g.dataset.g as Mode;
    else if (act === 'more' && depth < 11) depth++;
    else if (act === 'less' && depth > 0) depth--;
    else if (act === 'reset') { depth = 0; mode = 'none'; }
    else return;
    draw();
  });
}
