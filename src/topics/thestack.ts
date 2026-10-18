/**
 * The stack: the region of SRAM a program uses to keep track of the functions it is in the middle of. Call a function
 * to push its frame, return to pop it. The stack pointer moves down as frames are added, showing why the stack "grows
 * down" and what each frame holds.
 */
import { status, syncUrl } from './dbg';

const TOP = 0x20020000; // end of SRAM; the stack starts here and grows down

interface Slot { name: string; size: number; note: string }
interface Fn { name: string; slots: Slot[] }

/** The functions that can be on the stack, each with the local storage its frame needs. */
const FNS: Record<string, Fn> = {
  main: { name: 'main()', slots: [
    { name: 'argc / argv', size: 8, note: 'main’s own locals' },
  ] },
  read_line: { name: 'read_line()', slots: [
    { name: 'return address', size: 4, note: 'where to resume in the caller' },
    { name: 'saved r4–r7', size: 16, note: 'registers the caller still needs' },
    { name: 'char buf[16]', size: 16, note: 'the local line buffer' },
  ] },
  parse_int: { name: 'parse_int()', slots: [
    { name: 'return address', size: 4, note: 'where to resume in the caller' },
    { name: 'int value, sign', size: 8, note: 'locals being built up' },
  ] },
  checksum: { name: 'checksum()', slots: [
    { name: 'return address', size: 4, note: 'where to resume in the caller' },
    { name: 'uint32_t crc, i', size: 8, note: 'the running total and index' },
  ] },
};

export function mountTheStack(root: HTMLElement) {
  const start = new URLSearchParams(location.search).get('s');
  let callStack: string[] = ['main'];
  if (start) { const ids = start.split(',').filter((x) => FNS[x]); if (ids[0] === 'main') callStack = ids.slice(0, 5); }
  let note = 'The program starts in main(). Its frame sits at the top of the stack; the stack pointer, SP, is just below it.';

  const callable = ['read_line', 'parse_int', 'checksum'];
  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">The call stack</p>
      <h1>The stack</h1>
      <p>When one function calls another, the caller is not finished: it is waiting, partway through, for the callee to
        return. The stack is where each paused function’s state is kept, the return address, the registers it needs
        again, and its local variables, as a frame. Calls push a frame and returns pop one, always in last-in,
        first-out order. On a Cortex-M the stack starts at the top of SRAM and grows downward. Call and return below.</p>
    </section>
    <section class="debugger mem stackpage" aria-label="The stack">
      <header class="dbg-bar">
        <span class="dbg-file">SRAM · the stack</span>
        <span class="dbg-state"><i aria-hidden="true"></i>Running</span>
        <div class="dbg-controls">
          ${callable.map((f) => `<button type="button" class="dbg-btn" data-call="${f}">Call ${FNS[f].name}</button>`).join('')}
          <button type="button" class="dbg-btn" data-act="return">Return</button>
          <button type="button" class="dbg-btn" data-act="reset">Reset</button>
        </div>
      </header>
      <div class="stk-body">
        <div class="stk-view"></div>
        <div class="stk-side">
          <dl class="stk-regs"></dl>
          <p class="stk-chain"></p>
        </div>
      </div>
      <p class="dbg-status" aria-live="polite"></p>
    </section>
    <section class="prose">
      <h2>One pointer, moved on every call</h2>
      <p>The stack is not a special kind of memory, only a convention around one register: the stack pointer, SP. To make
        room for a frame, a function subtracts its size from SP; to free it, the function adds it back. Everything in a
        frame is reached as an offset from SP (or from a frame pointer the compiler sometimes keeps as a stable
        reference). Because the frames are freed in the exact reverse of the order they were created, the stack never
        fragments: there is only ever one free edge, where SP points.</p>
      <h2>Why it grows down</h2>
      <p>Placing the stack at the top of RAM and the program’s other data at the bottom lets the two grow toward each
        other and share whatever is left, instead of each needing a fixed reservation. The convention is historical as
        much as technical, but every Cortex-M follows it: reset loads SP from the first word of the vector table, the top
        of the stack, and each push moves it down.</p>
      <h2>Running out</h2>
      <p>Nothing automatically stops the stack growing into the data below it. Deep recursion or a large local array can
        push SP past the bottom of its region and quietly corrupt whatever is there. Firmware guards against this by
        filling the stack with a known pattern and watching how much stays untouched, by placing an
        <a href="?p=mpu" data-nav>MPU</a> region at the limit, or, on newer cores, with a stack-limit register that
        faults the instant SP crosses a set address.</p>
    </section>`;

  function addr(upToFrame: number): number {
    let a = TOP;
    for (let f = 0; f < upToFrame; f++) a -= FNS[callStack[f]].slots.reduce((s, x) => s + x.size, 0);
    return a;
  }

  function draw() {
    const sp = addr(callStack.length);
    const used = TOP - sp;
    // Frames from the top of memory (main) downward; within a frame, the highest address first.
    root.querySelector('.stk-view')!.innerHTML = `<div class="stk-top">0x${TOP.toString(16).toUpperCase()} · top of SRAM</div>` +
      callStack.map((id, f) => {
        const fn = FNS[id];
        let a = addr(f);
        const slots = fn.slots.map((s) => { a -= s.size; return `<div class="stk-slot"><span class="sa">0x${a.toString(16).toUpperCase()}</span><span class="sn">${s.name}</span><span class="sz">${s.size} B</span></div>`; }).join('');
        return `<div class="stk-frame${f === callStack.length - 1 ? ' cur' : ''}"><div class="stk-fn">${fn.name}${f === 0 ? ' <small>entry</small>' : ''}</div>${slots}</div>`;
      }).join('') +
      `<div class="stk-sp"><b>SP</b> → 0x${sp.toString(16).toUpperCase()} <span>${used} bytes used · grows ↓</span></div>`;

    root.querySelector('.stk-regs')!.innerHTML =
      `<div><dt>SP</dt><dd>0x${sp.toString(16).toUpperCase()}</dd></div>` +
      `<div><dt>Depth</dt><dd>${callStack.length} frame${callStack.length === 1 ? '' : 's'}</dd></div>` +
      `<div><dt>Used</dt><dd>${used} bytes</dd></div>`;
    root.querySelector('.stk-chain')!.innerHTML = 'Call chain: ' + callStack.map((id) => FNS[id].name).join(' → ');
    root.querySelector<HTMLButtonElement>('[data-act="return"]')!.disabled = callStack.length === 1;
    root.querySelectorAll<HTMLButtonElement>('[data-call]').forEach((b) => (b.disabled = callStack.length >= 5));
    status(root, note);
    syncUrl({ s: callStack.join(',') });
  }

  draw();
  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    const call = t.closest<HTMLElement>('[data-call]')?.dataset.call;
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (call && callStack.length < 5) {
      const fn = FNS[call];
      const size = fn.slots.reduce((s, x) => s + x.size, 0);
      callStack.push(call);
      note = `${FNS[callStack[callStack.length - 2]].name} calls ${fn.name}. SP drops by ${size} bytes to make room for its frame: the return address, any registers it must preserve, and its locals.`;
    } else if (act === 'return' && callStack.length > 1) {
      const fn = FNS[callStack.pop()!];
      note = `${fn.name} returns. Its frame is freed by moving SP back up, and the processor resumes ${FNS[callStack[callStack.length - 1]].name} at the saved return address. The bytes are still in RAM, but they are above SP now, free to be overwritten by the next call.`;
    } else if (act === 'reset') {
      callStack = ['main'];
      note = 'Back to just main() on the stack.';
    } else return;
    draw();
  });
}
