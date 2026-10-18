/**
 * Stack frames: the activation record one function call leaves on the stack. Step through the prologue that builds the
 * frame, saved registers, the return address and locals, and the epilogue that tears it down and returns. spAt and
 * presentAt are exported for the checks.
 */
import { code, status, syncUrl } from './dbg';

const TOP = 0x20001f00; // the frame's top edge, where SP points on entry

export interface Slot { k: string; name: string; sub?: string; size: number; from: number; to: number }

/**
 * The frame's slots, highest address first. `from`/`to` are the step range each slot exists for: the saved registers
 * live from the prologue's push until the epilogue's pop; the locals only while the body runs.
 */
export const SLOTS: Slot[] = [
  { k: 'lr', name: 'saved LR', sub: 'return address', size: 4, from: 1, to: 5 },
  { k: 'r7', name: 'saved r7', size: 4, from: 1, to: 5 },
  { k: 'r6', name: 'saved r6', size: 4, from: 1, to: 5 },
  { k: 'r5', name: 'saved r5', size: 4, from: 1, to: 5 },
  { k: 'r4', name: 'saved r4', size: 4, from: 1, to: 5 },
  { k: 'i', name: 'int i', sub: 'local', size: 4, from: 2, to: 4 },
  { k: 'crc', name: 'int32_t crc', sub: 'local', size: 4, from: 2, to: 4 },
];

export const STEPS = [
  { asm: '; checksum() on entry', note: 'The caller left the return address in LR and the first arguments in r0–r3. SP still points at the caller’s frame; none of checksum()’s own state is on the stack yet.' },
  { asm: 'push {r4-r7, lr}', note: 'The prologue saves the registers checksum() will reuse and the return address, in one instruction. SP drops 20 bytes. These have to be restored before returning, or the caller’s values are gone.' },
  { asm: 'sub  sp, #8', note: 'Room for the two locals, crc and i. SP drops another 8 bytes, and the frame is complete: 28 bytes, every slot reached as a fixed offset from SP.' },
  { asm: '; function body', note: 'The body runs. The locals sit at the bottom of the frame and the saved registers above them. If checksum() calls another function now, that frame is pushed below this one, in last-in first-out order.' },
  { asm: 'add  sp, #8', note: 'The epilogue starts by discarding the locals: SP moves back up 8 bytes. Their bytes are still in RAM, but now above SP, free for the next call to overwrite.' },
  { asm: 'pop  {r4-r7, pc}', note: 'Restore the saved registers and load the saved return address straight into PC, which returns to the caller. SP is back exactly where it started, so the frame has vanished.' },
];

/** Slots present at a step, highest address first. */
export const presentAt = (step: number) => SLOTS.filter((s) => step >= s.from && step < s.to);
/** SP's address at a step: the top of the frame minus every present slot. */
export const spAt = (step: number) => TOP - presentAt(step).reduce((n, s) => n + s.size, 0);

export function mountFrames(root: HTMLElement) {
  const q = Number(new URLSearchParams(location.search).get('k'));
  let step = Number.isInteger(q) && q >= 0 && q < STEPS.length ? q : 0;

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">The call stack</p>
      <h1>Stack frames</h1>
      <p>Each call in progress owns a slice of the stack, its frame, holding everything that call needs to resume: the
        address to return to, the registers it borrowed and must give back, and its local variables. The compiler builds
        the frame in a short <b>prologue</b> at the start of the function and tears it down in an <b>epilogue</b> at the
        end. Step through both and watch the frame appear slot by slot and then disappear.</p>
    </section>
    <section class="debugger mem frames" aria-label="Stack frames">
      <header class="dbg-bar">
        <span class="dbg-file">checksum()</span>
        <span class="dbg-state"><i aria-hidden="true"></i>stepping</span>
        <div class="dbg-controls">
          <button type="button" class="dbg-btn" data-act="prev">‹ Prev</button>
          <span class="sf-step" aria-live="polite"></span>
          <button type="button" class="dbg-btn" data-act="next">Next ›</button>
          <button type="button" class="dbg-btn" data-act="reset">Reset</button>
        </div>
      </header>
      <div class="dbg-body stacked">
        <pre class="dbg-code" aria-label="Prologue and epilogue"><code></code></pre>
        <div class="dbg-vars"><h3>checksum() frame <small>high address at the top; SP is the frame’s low edge</small></h3><div class="sf-stack"></div></div>
      </div>
      <p class="dbg-status" aria-live="polite"></p>
    </section>
    <section class="prose">
      <h2>Why save and restore registers</h2>
      <p>The calling convention splits the registers in two. Some are <i>caller-saved</i>: a function may clobber them
        freely, so the caller must copy anything it still needs before calling. The rest are <i>callee-saved</i>, r4–r11
        on Arm: a function that wants to use them must put the old values back before it returns. That is what the
        <code>push {r4-r7, …}</code> in the prologue and the matching <code>pop</code> in the epilogue are for. The return
        address in LR is saved the same way, because any nested call would overwrite LR.</p>
      <h2>The frame pointer</h2>
      <p>Everything in the frame is reached as an offset from SP, so in principle no other register is needed. But SP can
        move during the body, for example to pass arguments to another call, which would change every offset. To avoid
        that, the compiler can dedicate a register, the <b>frame pointer</b> (r7 in Thumb, r11 in Arm), to hold a fixed
        anchor into the frame, so locals keep a constant offset no matter what SP does. Optimised builds often omit it and
        track the offsets themselves, freeing the register; that is what <code>-fomit-frame-pointer</code> does.</p>
      <h2>Reading it in a debugger</h2>
      <p>A backtrace is just this structure walked in reverse. Each frame’s saved LR says where its caller will resume,
        and the saved frame pointer (or the known frame size) says where the caller’s frame begins, so the debugger can
        hop from frame to frame all the way back to <code>main()</code>. Corrupt the saved return address, as a
        <a href="?p=bufover" data-nav>buffer overflow</a> does, and the backtrace, and the return, go wrong.</p>
    </section>`;

  function draw(note?: string) {
    const s = STEPS[step];
    code(root, STEPS.map((x) => x.asm), step, 0);

    const present = presentAt(step);
    const sp = spAt(step);
    let a = TOP;
    const rows = SLOTS.map((slot) => {
      const on = present.includes(slot);
      if (!on) return `<div class="sf-slot gone"><span class="sa"></span><span class="sn">${slot.name}${slot.sub ? ` <small>${slot.sub}</small>` : ''}</span><span class="sz"></span></div>`;
      a -= slot.size;
      const isNew = step === slot.from;
      return `<div class="sf-slot k-${slot.k === 'lr' ? 'ret' : slot.sub === 'local' ? 'loc' : 'reg'}${isNew ? ' fresh' : ''}"><span class="sa">0x${a.toString(16).toUpperCase()}</span><span class="sn">${slot.name}${slot.sub ? ` <small>${slot.sub}</small>` : ''}</span><span class="sz">${slot.size} B</span></div>`;
    }).join('');
    root.querySelector('.sf-stack')!.innerHTML = rows +
      `<div class="sf-sp"><b>SP</b> → 0x${sp.toString(16).toUpperCase()} <span>${TOP - sp} bytes · grows ↓</span></div>`;

    root.querySelector('.sf-step')!.textContent = `step ${step + 1} / ${STEPS.length}`;
    root.querySelector<HTMLButtonElement>('[data-act="prev"]')!.disabled = step === 0;
    root.querySelector<HTMLButtonElement>('[data-act="next"]')!.disabled = step === STEPS.length - 1;
    status(root, note ?? s.note);
    syncUrl({ k: String(step) });
  }

  draw();
  root.addEventListener('click', (e) => {
    const act = (e.target as Element).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'next' && step < STEPS.length - 1) step++;
    else if (act === 'prev' && step > 0) step--;
    else if (act === 'reset') step = 0;
    else return;
    draw();
  });
}
