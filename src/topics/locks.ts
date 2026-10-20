/**
 * Mutexes and semaphores, run on a small preemptive fixed-priority RTOS model with a mutex and a binary semaphore.
 * Two mutex scenarios show priority inversion, a medium task delaying a high one through a low one that holds the
 * lock, and how priority inheritance bounds it. The third shows a semaphore as a signal from an interrupt to a task.
 */
import { markSeg, oneOf, seg, syncUrl } from './dbg';
import { stepper, traceHtml, type Bar, type Lane, type Mark, type Step } from './timeline';

export type Mode = 'plain' | 'inherit' | 'signal';
export const MODES: Mode[] = ['plain', 'inherit', 'signal'];
type Obj = 'm' | 's';
type Op = { run: number } | { take: Obj } | { give: Obj } | { loop: number };
export interface TaskDef { id: string; name: string; prio: number; releases: number[]; ops: Op[]; color: string; sub: string }

/** In FreeRTOS a higher number is a higher priority, the opposite of the NVIC. */
const MUTEX_TASKS: TaskDef[] = [
  { id: 'H', name: 'High', prio: 3, releases: [4], ops: [{ run: 1 }, { take: 'm' }, { run: 2 }, { give: 'm' }, { run: 1 }], color: 'var(--ch3)', sub: 'priority 3' },
  { id: 'M', name: 'Medium', prio: 2, releases: [6], ops: [{ run: 8 }], color: 'var(--ch6)', sub: 'priority 2' },
  { id: 'L', name: 'Low', prio: 1, releases: [0], ops: [{ run: 2 }, { take: 'm' }, { run: 6 }, { give: 'm' }, { run: 1 }], color: 'var(--ch2)', sub: 'priority 1' },
];
const SIGNAL_TASKS: TaskDef[] = [
  { id: 'I', name: 'UART IRQ', prio: 9, releases: [4, 14], ops: [{ run: 1 }, { give: 's' }], color: 'var(--ch6)', sub: 'interrupt' },
  { id: 'R', name: 'RX task', prio: 3, releases: [0], ops: [{ take: 's' }, { run: 3 }, { loop: 0 }], color: 'var(--ch3)', sub: 'priority 3' },
  { id: 'B', name: 'Background', prio: 1, releases: [0], ops: [{ run: 99 }], color: 'var(--ch2)', sub: 'priority 1' },
];
export const END = 22;

export interface Tick { run: string | null; hold: boolean; eff: number; state: Record<string, 'run' | 'ready' | 'blocked' | 'off'> }
export interface Sim { tasks: TaskDef[]; ticks: Tick[]; events: { t: number; text: string }[]; owner: (string | null)[] }

/** Runs the scenario for `mode` one 1 ms tick at a time. */
export function rtos(mode: Mode): Sim {
  const tasks = mode === 'signal' ? SIGNAL_TASKS : MUTEX_TASKS;
  const inherit = mode === 'inherit';
  const name = (id: string) => tasks.find((x) => x.id === id)!.name;
  const st = Object.fromEntries(tasks.map((x) => [x.id, { active: false, pc: 0, left: -1, blocked: null as Obj | null }]));
  const mutex = { owner: null as string | null, waiters: [] as string[] };
  const sem = { count: 0, waiters: [] as string[] };
  const base = (id: string) => tasks.find((x) => x.id === id)!.prio;
  const eff = (id: string): number => !inherit || mutex.owner !== id ? base(id) : Math.max(base(id), ...mutex.waiters.map(eff));
  const events: Sim['events'] = [];
  const ticks: Tick[] = [];
  const owner: (string | null)[] = [];
  const say = (t: number, text: string) => events.push({ t, text });
  let prev: string | null = null;

  for (let t = 0; t < END; t++) {
    const released = tasks.filter((x) => x.releases.includes(t)).map((x) => x.id);
    for (const id of released) Object.assign(st[id], { active: true, pc: 0, left: -1, blocked: null });
    let cur: string | null = null;
    for (let guard = 0; guard < 20; guard++) {
      const ready = tasks.filter((x) => st[x.id].active && !st[x.id].blocked).map((x) => x.id);
      if (!ready.length) { cur = null; break; }
      cur = ready.sort((a, b) => eff(b) - eff(a) || (b === prev ? 1 : 0) - (a === prev ? 1 : 0))[0];
      const s = st[cur];
      const op = tasks.find((x) => x.id === cur)!.ops[s.pc];
      if (!op) { s.active = false; if (cur !== 'I') say(t, `${name(cur)} finishes.`); continue; }
      if ('loop' in op) { s.pc = op.loop; continue; }
      if ('take' in op && op.take === 'm') {
        if (mutex.owner === null) { mutex.owner = cur; s.pc++; say(t, `${name(cur)} takes the mutex.`); }
        else {
          s.blocked = 'm'; mutex.waiters.push(cur);
          say(t, `${name(cur)} tries to take the mutex, but ${name(mutex.owner)} holds it, so ${name(cur)} blocks.${inherit
            ? ` With priority inheritance, ${name(mutex.owner)} is raised to ${name(cur)}’s priority, ${base(cur)}, until it gives the mutex back.` : ''}`);
        }
        continue;
      }
      if ('take' in op) {
        if (sem.count > 0) { sem.count--; s.pc++; say(t, `${name(cur)} takes the semaphore.`); }
        else { s.blocked = 's'; sem.waiters.push(cur); say(t, `${name(cur)} calls <code>xSemaphoreTake</code>, but the semaphore is empty, so it blocks until something gives it, using no CPU while it waits.`); }
        continue;
      }
      if ('give' in op && op.give === 'm') {
        const was = eff(cur);
        const w = mutex.waiters.sort((a, b) => eff(b) - eff(a))[0];
        mutex.owner = null;
        if (w) { mutex.waiters = mutex.waiters.filter((x) => x !== w); mutex.owner = w; st[w].blocked = null; st[w].pc++; }
        s.pc++;
        say(t, `${name(cur)} gives the mutex${w ? `, and ${name(w)}, which was waiting, takes it` : ''}.${was > base(cur) ? ` ${name(cur)}’s priority drops back to ${base(cur)}.` : ''}`);
        continue;
      }
      if ('give' in op) {
        const w = sem.waiters.sort((a, b) => base(b) - base(a))[0];
        if (w) { sem.waiters = sem.waiters.filter((x) => x !== w); st[w].blocked = null; st[w].pc++; }
        else sem.count = 1;
        s.pc++;
        say(t, `The handler calls <code>xSemaphoreGiveFromISR</code>${w ? `, which wakes ${name(w)}. It outranks the task that was interrupted, so the handler requests a context switch and returns straight into ${name(w)}` : ''}.`);
        continue;
      }
      if (s.left < 0) s.left = op.run;
      break;
    }
    // Releases, described against whoever got the CPU this tick.
    for (const id of released) {
      if (id === cur) say(t, `${name(id)} ${mode === 'signal' && id === 'I' ? 'fires' : 'is released'}${prev && prev !== id && st[prev].active ? ` and preempts ${name(prev)}` : ''}.`);
      else if (cur && !(mode === 'signal' && t === 0)) say(t, `${name(id)} is released, but ${name(cur)} is running at priority ${eff(cur)}${eff(cur) > base(cur) ? ', inherited' : ''}, higher than ${name(id)}’s ${base(id)}, so ${name(id)} waits.`);
    }
    if (cur) {
      const s = st[cur];
      s.left--;
      if (s.left === 0) { s.pc++; s.left = -1; }
    }
    const state: Tick['state'] = {};
    for (const x of tasks) state[x.id] = x.id === cur ? 'run' : !st[x.id].active ? 'off' : st[x.id].blocked ? 'blocked' : 'ready';
    ticks.push({ run: cur, hold: cur !== null && mutex.owner === cur, eff: cur ? eff(cur) : 0, state });
    owner.push(mutex.owner);
    prev = cur;
  }
  return { tasks, ticks, events, owner };
}

/** How long High waited for the mutex: ticks spent blocked. */
export const blockedFor = (sim: Sim, id: string, upTo = END) => sim.ticks.slice(0, upTo).filter((k) => k.state[id] === 'blocked').length;

const TEXT: Record<Mode, string> = { plain: 'Plain mutex', inherit: 'Priority inheritance', signal: 'Semaphore signal' };

export function mountLocks(root: HTMLElement) {
  let mode = oneOf<Mode>('m', MODES, 'plain');

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Sharing data safely</p>
      <h1>Mutexes and semaphores</h1>
      <p>A mutex lets tasks take turns with shared data: take it, use the data, give it back, and anyone else who wants it
        waits. A semaphore lets one part of the system signal another. Both make tasks wait, and waiting interacts with
        priorities in ways that are easy to get wrong. Compare a plain mutex with one that uses priority inheritance, then
        see a semaphore carry a signal from an interrupt.</p>
    </section>
    ${traceHtml({ label: 'Mutex and semaphore trace', title: 'FreeRTOS · 1 ms tick', controls: seg('m', 'Scenario', MODES.map((m) => [m, TEXT[m]])) })}
    <section class="prose">
      <h2>Priority inversion</h2>
      <p>Low takes a mutex, then High preempts it and asks for the same mutex. High must wait for Low to finish with it,
        which is fine if that takes a moment. But Medium, which needs no mutex, outranks Low, so whenever it is ready it
        runs instead of Low, and Low cannot finish and release the mutex. High is now waiting on Medium, a task of lower
        priority, for as long as Medium cares to run. This is priority inversion, and the delay has no bound.</p>
      <h2>Priority inheritance</h2>
      <p>The fix is to have the mutex lift whoever holds it to the priority of the most important task waiting for it.
        Low briefly runs at High’s priority, so Medium cannot get in, and High waits only for Low’s critical section,
        then Low drops back. In 1997 the Mars Pathfinder lander kept resetting itself because a high-priority bus task
        waited on a mutex held by a low-priority one while medium-priority work ran. Engineers fixed it from Earth by
        turning on priority inheritance for that mutex. FreeRTOS mutexes inherit priority; binary semaphores do not, which
        is the main reason to use a mutex, not a semaphore, to protect data.</p>
      <h2>Semaphores as signals</h2>
      <p>A semaphore counts, and taking it when it is zero blocks until someone gives it. Used as a signal, the giver and
        the taker are different: here a UART interrupt gives the semaphore and a task waiting on it wakes. The handler
        stays a few instructions long, and the real work happens in a task, at a priority the designer chooses. This is
        deferred interrupt processing, and it is how most RTOS drivers are built.</p>
    </section>`;

  const st = stepper(root);
  function load() {
    const sim = rtos(mode);
    const lanes: Lane[] = sim.tasks.map((x) => ({ id: x.id, name: x.name, sub: x.sub, color: x.color }));
    // One bar per run of identical state on each lane: running (holding the mutex or not, at which priority), ready, blocked.
    const bars: Bar[] = [];
    const runBars: { i: number; t0: number; t1: number; id: string }[] = [];
    for (const x of sim.tasks) {
      let t0 = 0;
      for (let t = 1; t <= END; t++) {
        const a = sim.ticks[t0], b = sim.ticks[t];
        const same = b && b.state[x.id] === a.state[x.id] && (a.state[x.id] !== 'run' || (b.hold === a.hold && b.eff === a.eff));
        if (same) continue;
        const s = a.state[x.id];
        if (s === 'run') { runBars.push({ i: bars.length, t0, t1: t, id: x.id }); bars.push({ lane: x.id, t0, t1: t, kind: a.hold ? 'hold' : 'run' }); }
        else if (s !== 'off') bars.push({ lane: x.id, t0, t1: t, kind: s });
        t0 = t;
      }
    }
    // Label the bars wide enough to read: holding the mutex, and at which priority if it was inherited.
    for (const r of runBars) {
      const k = sim.ticks[r.t0];
      const def = sim.tasks.find((x) => x.id === r.id)!;
      bars[r.i].label = r.t1 - r.t0 < 3 ? '' : k.hold ? (k.eff > def.prio ? `mutex · prio ${k.eff}` : 'mutex') : '';
    }
    runBars.sort((a, b) => a.t0 - b.t0);
    const marks: Mark[] = sim.tasks.flatMap((x) => x.releases.filter((t) => t > 0 || mode !== 'signal').map((t) => ({ lane: x.id, t, kind: 'fire' as const, title: `${x.name} ${x.id === 'I' ? 'fires' : 'is released'} at ${t} ms` })));
    const name = (id: string) => sim.tasks.find((x) => x.id === id)!.name;
    const steps: Step[] = runBars.map((r) => {
      const k = sim.ticks[r.t0];
      const def = sim.tasks.find((x) => x.id === r.id)!;
      const ev = sim.events.filter((e) => e.t >= r.t0 && e.t < r.t1).map((e) => e.text).join(' ');
      let what = `${name(r.id)} runs${k.hold ? ' its critical section, holding the mutex' : ''}${k.eff > def.prio ? `, at priority ${k.eff}, inherited from High` : ''}.`;
      if (mode !== 'signal' && k.state.H === 'blocked' && r.id === 'M')
        what += ' <span class="bad">This is priority inversion: High waits for the mutex, Low holds it, and Medium, which needs neither, outranks Low and keeps it from finishing.</span>';
      if (mode !== 'signal' && r.id === 'H' && k.hold) what += ` High waited ${blockedFor(sim, 'H', r.t0)} ms for the mutex.`;
      const owner = sim.owner[r.t1 - 1];
      return { bar: r.i, at: r.t1, lane: r.id, note: `${ev} ${what}`.trim(),
        readout: [`t = ${r.t1} ms`, `CPU: <b>${name(r.id)}${k.eff > def.prio ? ` (prio ${k.eff})` : ''}</b>`,
          ...(mode === 'signal'
            ? [`RX task: <b>${sim.ticks[r.t1 - 1].state.R === 'blocked' ? 'blocked on semaphore' : sim.ticks[r.t1 - 1].state.R}</b>`]
            : [`Mutex: <b>${owner ? `held by ${name(owner)}` : 'free'}</b>`, `High blocked: <b class="${blockedFor(sim, 'H', r.t1) > 4 ? 'bad' : ''}">${blockedFor(sim, 'H', r.t1)} ms</b>`])] };
    });
    st.load({ lanes, bars, marks, end: END, every: 2, minor: 1 }, steps);
    markSeg(root, 'm', mode);
    syncUrl({ m: mode });
  }
  load();

  root.addEventListener('click', (e) => {
    const m = (e.target as Element).closest<HTMLElement>('[data-m]');
    if (m) { mode = m.dataset.m as Mode; load(); }
  });
}
