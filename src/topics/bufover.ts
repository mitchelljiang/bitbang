/**
 * Buffer overflow: how writing past a stack array overwrites the saved return address, and what stops it. A short
 * function with an 8-byte buffer and an unchecked copy is shown with its stack frame in memory; as the input grows it
 * spills into the saved registers and the return address, and the page shows what the function returns into. The
 * machine code is what Clang emits for a Cortex-M4, with and without the stack protector.
 */
import { esc } from '../core/render';
import { hexN, highlight, oneOf, seg, markSeg, syncUrl } from './dbg';

const BUF = 8;
const BASE = 0x2001ffc0; // address of buf[0]
const RET = 0x08000457; // the real saved return address, in main(); Thumb, so odd
const WIN = 0x08000521; // an existing function the overflow can be aimed at (the classic teaching target)

/** A region of the frame, low address first. `size` bytes, starting at buf[0] + `off`. */
interface Slot { off: number; size: number; kind: 'buf' | 'canary' | 'reg' | 'ret' | 'beyond'; name: string; orig: number[] }

const le = (v: number, n = 4) => Array.from({ length: n }, (_, i) => (v >>> (8 * i)) & 0xff);

/** The frame layout, without the stack protector and with it (which inserts a canary above the buffer). */
function layout(canary: boolean): Slot[] {
  const buf: Slot = { off: 0, size: BUF, kind: 'buf', name: 'buf[8]', orig: new Array(BUF).fill(0) };
  const reg: Slot = { off: 0, size: 4, kind: 'reg', name: 'saved r4', orig: le(0x20000100) };
  const ret: Slot = { off: 0, size: 4, kind: 'ret', name: 'return address', orig: le(RET) };
  const beyond: Slot = { off: 0, size: 8, kind: 'beyond', name: 'caller’s frame', orig: [...le(0x2001ffe0), ...le(0x08000312)] };
  const slots = canary
    ? [buf, { off: 0, size: 4, kind: 'canary' as const, name: 'canary', orig: le(0x3af1c200) }, reg, ret, beyond]
    : [buf, reg, ret, beyond];
  let off = 0;
  for (const s of slots) { s.off = off; off += s.size; }
  return slots;
}

export const WIN_ADDR = WIN;

/** What greet() does on return, given the input: it fits, it is caught by the canary, it crashes, or it is redirected. */
export function outcome(value: string, format: string, canary: boolean) {
  const bytes = written(value, format);
  const all = layout(canary);
  const ret = all.find((s) => s.kind === 'ret')!;
  const can = all.find((s) => s.kind === 'canary');
  const reached = (s: Slot | undefined) => s !== undefined && bytes.length > s.off;
  const retVal = Array.from({ length: 4 }, (_, i) => (ret.off + i < bytes.length ? bytes[ret.off + i] : ret.orig[i]))
    .reduce((acc, b, i) => acc | (b << (8 * i)), 0) >>> 0;
  const result = canary && reached(can) ? 'caught'
    : !reached(ret) ? 'returns'
    : (retVal | 1) === (WIN | 1) ? 'redirected'
    : 'crash';
  return { length: bytes.length, retVal, result } as const;
}

/** The bytes strcpy writes: the input, then one null terminator. */
function written(value: string, format: string): number[] {
  if (format === 'hex') {
    const toks = value.trim().replace(/0x/gi, ' ').split(/[\s,]+/).filter(Boolean);
    const out: number[] = [];
    for (const t of toks) {
      if (!/^[0-9a-f]{1,2}$/i.test(t)) throw new Error(`“${t}” is not a hex byte.`);
      out.push(parseInt(t, 16));
    }
    return [...out, 0];
  }
  return [...new TextEncoder().encode(value), 0];
}

const SOURCE = [
  'void greet(const char *name)',
  '{',
  '    char buf[8];',
  '    strcpy(buf, name);     // no length check',
  '    show(buf);',
  '}',
];

/** The compiled greet(), one listing per build. The last real instruction is where the return address is used. */
const ASM = {
  plain: [
    'push {r4, lr}',
    'sub  sp, #8',
    'mov  r4, sp',
    'bl   strcpy',
    'mov  r0, r4',
    'bl   show',
    'add  sp, #8',
    'pop  {r4, pc}      // returns into whatever is in the saved slot',
  ],
  canary: [
    'push {r4, lr}',
    'sub  sp, #16',
    'ldr  r2, [__stack_chk_guard]',
    'add  r4, sp, #4',
    'str  r2, [sp, #12]        // put the canary above buf',
    'bl   strcpy',
    'mov  r0, r4',
    'bl   show',
    'ldr  r0, [sp, #12]        // read the canary back',
    'ldr  r1, [__stack_chk_guard]',
    'cmp  r1, r0               // unchanged?',
    'popeq {r4, pc}            // yes: return normally',
    'bl   __stack_chk_fail     // no: abort, do not return',
  ],
};

export function mountBufover(root: HTMLElement) {
  const q = new URLSearchParams(location.search);
  let value = q.get('s') ?? 'Mia';
  let format = oneOf('f', ['text', 'hex'] as const, 'text');
  let canary = q.get('c') === '1';

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">The stack</p>
      <h1>Buffer overflow</h1>
      <p>A local array lives on the stack, just below the registers the function saved when it started, including the
        address it will return to. If the program writes past the end of the array, it overwrites those saved values.
        Overwrite the return address and the function returns to the wrong place: a crash, or, if an attacker chose the
        bytes, somewhere of their choosing. Type into <code>name</code> and watch it spill down the frame.</p>
    </section>
    <section class="debugger mem bufover" aria-label="Buffer overflow">
      <header class="dbg-bar">
        <span class="dbg-file">greet.c</span>
        <span class="dbg-state"><i aria-hidden="true"></i>Paused</span>
        <div class="dbg-controls">
          ${seg('c', 'Stack protector', [['0', 'No protector'], ['1', 'Stack protector']])}
          ${seg('f', 'Input as', [['text', 'Text'], ['hex', 'Hex bytes']])}
          <label class="dbg-set">name = <input type="text" spellcheck="false" autocomplete="off" aria-label="The name passed to greet"></label>
          <button type="button" class="dbg-btn" data-act="win">Aim at win()</button>
        </div>
      </header>
      <div class="dbg-body stacked">
        <pre class="dbg-code" aria-label="Compiled greet()"><code></code></pre>
        <div class="dbg-vars"><h3>Stack frame of greet() <small>low address at the top; strcpy writes downward</small></h3><div class="frame"></div></div>
      </div>
      <p class="dbg-status" aria-live="polite"></p>
    </section>
    <section class="prose">
      <h2>Why it happens</h2>
      <p>C does not check array bounds. <code>strcpy</code> copies bytes until it meets a zero, however long the source
        is, into a buffer of whatever size. The bytes that do not fit keep going into the next addresses, which on the
        stack are the saved registers and the return address. The same flaw is in <code>gets</code>,
        <code>sprintf</code>, <code>scanf("%s")</code> and any loop that copies until a terminator without counting.</p>
      <h2>What an attacker gains</h2>
      <p>The function ends with <code>pop {r4, pc}</code>, which loads the saved word straight into the program counter.
        Whoever controls that word controls where the program goes next. The simplest result is a crash. A deliberate
        overflow instead writes the address of code already in the program, as the “Aim at win()” button does, so the
        return jumps there with the attacker’s chosen arguments. Chaining many such returns, return-oriented
        programming, can run arbitrary logic without injecting a single new instruction.</p>
      <h2>What stops it</h2>
      <ul>
        <li><b>Count the bytes.</b> Use <code>strncpy</code>, <code>snprintf</code> or <code>memcpy</code> with a length,
          or check the length before copying. This is the real fix; the rest are safety nets.</li>
        <li><b>Stack canary.</b> With the stack protector on, the compiler puts a known value just above the buffer and
          checks it has not changed before returning. An overflow that reaches the return address must cross the canary
          first, so the program aborts instead of returning. Turn it on above to see the extra code.</li>
        <li><b>Execute-never memory.</b> A Cortex-M marks the stack and other data regions non-executable, so an attacker
          cannot run new instructions placed in the buffer. This is why real attacks reuse existing code instead.</li>
        <li><b>Stack limit and the MPU.</b> Armv8-M stack limit registers and an MPU region below the stack turn an
          overflow into a fault at the moment it crosses a boundary, before it can do harm.</li>
      </ul>
      <p>On a desktop, address space layout randomisation (ASLR) also moves code to unpredictable addresses each run, so
        the attacker cannot know where <code>win()</code> is. Most microcontrollers run code from a fixed address in
        flash, so they have no ASLR, which makes careful coding and the canary matter more.</p>
    </section>`;

  const slots = () => layout(canary);

  function draw() {
    let bytes: number[] = [];
    let err = '';
    try {
      bytes = written(value, format);
    } catch (e) {
      err = (e as Error).message;
    }

    const asm = canary ? ASM.canary : ASM.plain;
    // The code pane: the compiled function, highlighting the line that uses the return address.
    const asmPc = canary ? asm.length - 2 : asm.length - 1;
    root.querySelector('.dbg-code code')!.innerHTML =
      SOURCE.map((l, n) => `<span class="ln${n === 3 ? ' pc' : ''}"><span class="gutter">${n + 1}</span>${highlight(l) || ' '}</span>`).join('') +
      '<span class="ln sep"><span class="gutter"></span>greet, compiled:</span>' +
      asm.map((l, n) => `<span class="ln asm${n === asmPc ? ' pc' : ''}"><span class="gutter"></span>${highlight(l) || ' '}</span>`).join('');

    // Place the written bytes into the frame, byte by byte from buf[0] downward.
    const all = slots();
    const total = all[all.length - 1].off + all[all.length - 1].size;
    const value8 = Array.from({ length: total }, (_, i) => {
      const s = all.find((x) => i >= x.off && i < x.off + x.size)!;
      return { b: i < bytes.length ? bytes[i] : s.orig[i - s.off], over: i < bytes.length, kind: s.kind };
    });

    const byteCell = (c: { b: number; over: boolean; kind: string }) => {
      const printable = c.b >= 0x20 && c.b < 0x7f;
      return `<span class="by${c.over ? ' over' : ''}" title="${hexN(c.b, 8).replace('0x000000', '0x')}">` +
        `<b>${c.b.toString(16).toUpperCase().padStart(2, '0')}</b>` +
        `<i>${c.over && printable ? esc(String.fromCharCode(c.b)) : c.over ? '·' : ''}</i></span>`;
    };

    root.querySelector('.frame')!.innerHTML = all.map((s) => {
      const cells = Array.from({ length: s.size }, (_, k) => byteCell(value8[s.off + k])).join('');
      const touched = s.off < bytes.length;
      const addr = `0x${(BASE + s.off).toString(16).toUpperCase()}`;
      return `<div class="row k-${s.kind}${touched ? ' touched' : ''}">` +
        `<span class="addr">${addr}</span><span class="cells">${cells}</span><span class="rname">${esc(s.name)}</span></div>`;
    }).join('');

    // The consequence on return.
    const ret = slots().find((s) => s.kind === 'ret')!;
    const canarySlot = slots().find((s) => s.kind === 'canary');
    const reached = (s: Slot | undefined) => s !== undefined && bytes.length > s.off;
    const newRet = Array.from({ length: 4 }, (_, i) => (ret.off + i < bytes.length ? bytes[ret.off + i] : ret.orig[i]));
    const retVal = newRet.reduce((acc, b, i) => acc | (b << (8 * i)), 0) >>> 0;
    const el = root.querySelector('.dbg-status')!;
    el.classList.remove('bad', 'warn', 'ok');

    if (err) {
      el.classList.add('warn');
      el.textContent = err;
    } else if (canary && reached(canarySlot)) {
      el.classList.add('warn');
      el.textContent = `The overflow changed the canary above buf. Before returning, greet() checks it, finds it wrong, and calls __stack_chk_fail, which halts the program. The return address may be corrupt too, but the function never reaches the return. The overflow is caught.`;
    } else if (!reached(ret)) {
      el.classList.add('ok');
      const touchedReg = reached(slots().find((s) => s.kind === 'reg'));
      el.textContent = touchedReg
        ? `${bytes.length} bytes written. It spilled past buf into saved r4, but the return address is untouched, so greet() still returns to ${hexN(RET, 32)}. Keep typing to reach the return address.`
        : `${bytes.length} of 8 bytes used (the last is strcpy’s null terminator). It fits in buf, and greet() returns normally to ${hexN(RET, 32)}.`;
    } else if (retVal === WIN || retVal === (WIN | 1) || retVal === (WIN & ~1)) {
      el.classList.add('bad');
      el.textContent = `The return address is now ${hexN(retVal, 32)}: the address of win(). pop {r4, pc} loads it into the program counter, so greet() “returns” into win() instead of its caller. The overflow has redirected the program.`;
    } else {
      el.classList.add('bad');
      el.textContent = `The return address is now ${hexN(retVal, 32)}, built from the overflowing bytes. pop {r4, pc} jumps there; it is not the start of a valid instruction, so the processor takes a HardFault. That is the crash a stray overflow usually causes.`;
    }

    root.querySelector<HTMLInputElement>('.dbg-set input')!.placeholder = format === 'hex' ? '41 42 43 …' : 'a name';
    const input = root.querySelector<HTMLInputElement>('.dbg-set input')!;
    if (document.activeElement !== input) input.value = value;
    markSeg(root, 'c', canary ? '1' : '0');
    markSeg(root, 'f', format);
    root.querySelector<HTMLButtonElement>('[data-act="win"]')!.hidden = canary;
    syncUrl({ s: value, f: format, c: canary ? '1' : '0' });
  }

  draw();
  root.querySelector('.dbg-set input')!.addEventListener('input', (e) => {
    value = (e.target as HTMLInputElement).value;
    draw();
  });
  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    const c = t.closest<HTMLElement>('[data-c]');
    const f = t.closest<HTMLElement>('[data-f]');
    if (c) canary = c.dataset.c === '1';
    else if (f) format = f.dataset.f as 'text' | 'hex';
    else if (t.closest('[data-act="win"]')) {
      // The exact bytes to fill buf and the saved registers, then set the return address to win() (Thumb bit set).
      const fill = Array.from({ length: slots().find((s) => s.kind === 'ret')!.off }, () => 0x41);
      value = [...fill, ...le(WIN | 1)].map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
      format = 'hex';
    } else return;
    draw();
  });
}
