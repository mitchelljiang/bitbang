/**
 * Scheduling: three periodic tasks share one CPU over one hyperperiod. The reader picks the policy, preemptive by
 * rate-monotonic priority, the same with the priorities backwards, round-robin time slicing, or cooperative, and can
 * change each task's execution time. A tick-by-tick simulator draws who runs, who waits, and which deadlines are missed.
 */
import { oneOf, seg, markSeg, syncUrl } from './dbg';
import { plural, stepper, traceHtml, type Bar, type Lane, type Mark, type Step } from './timeline';

export type TaskId = 't1' | 't2' | 't3';
export interface Task { id: TaskId; name: string; what: string; period: number; c: number; color: string }
export type Policy = 'rm' | 'rev' | 'rr' | 'coop';
export const POLICIES: Policy[] = ['rm', 'rev', 'rr', 'coop'];

/** The task set: utilization 2/4 + 2/10 + 5/20 = 0.95, above the rate-monotonic bound for three tasks yet schedulable. */
export const TASKS: Task[] = [
  { id: 't1', name: 'Sensor', what: 'read the IMU', period: 4, c: 2, color: 'var(--ch2)' },
  { id: 't2', name: 'Control', what: 'run the control loop', period: 10, c: 2, color: 'var(--ch6)' },
  { id: 't3', name: 'Logger', what: 'write the log', period: 20, c: 5, color: 'var(--ch5)' },
];
/** One hyperperiod: the schedule repeats after the least common multiple of the periods. */
export const HORIZON = 20;

export interface Run { task: TaskId | 'idle'; t0: number; t1: number }
export interface Job { task: TaskId; release: number; deadline: number; left: number; done: number | null }
export interface Schedule { runs: Run[]; jobs: Job[]; ready: { task: TaskId; t0: number; t1: number }[] }

/** Utilization, the fraction of the CPU the tasks need, and the Liu and Layland bound n(2^(1/n) − 1). */
export const utilization = (tasks: Task[]) => tasks.reduce((u, t) => u + t.c / t.period, 0);
export const rmBound = (n: number) => n * (2 ** (1 / n) - 1);

/**
 * Simulates the CPU one 1 ms tick at a time. Each job is released at a multiple of its period and is due by the next
 * release. rm and rev are preemptive fixed-priority (shorter period first, or the reverse); coop runs a job to completion
 * once started; rr gives every ready task a 1 ms slice in turn. A late job keeps running; its miss is recorded.
 */
export function schedule(tasks: Task[], policy: Policy, horizon = HORIZON): Schedule {
  const jobs: Job[] = [];
  const rank = (id: TaskId) => {
    const t = tasks.find((x) => x.id === id)!;
    return policy === 'rev' ? -t.period : t.period;
  };
  const queue: TaskId[] = [];
  let current: Job | null = null;
  const units: (Job | null)[] = [];
  for (let t = 0; t < horizon; t++) {
    for (const k of tasks) if (t % k.period === 0) {
      jobs.push({ task: k.id, release: t, deadline: t + k.period, left: k.c, done: null });
      if (!queue.includes(k.id)) queue.push(k.id);
    }
    const open = jobs.filter((j) => j.left > 0);
    const first = (id: TaskId) => open.find((j) => j.task === id)!;
    const readyIds = [...new Set(open.map((j) => j.task))];
    let pick: Job | null = null;
    if (readyIds.length) {
      if (policy === 'coop' && current && current.left > 0) pick = current;
      else if (policy === 'rr') {
        // Round-robin: the task that just used its slice goes to the back of the queue.
        if (current && current.left > 0 && queue[0] === current.task) queue.push(queue.shift()!);
        pick = first(queue.find((id) => readyIds.includes(id))!);
      } else pick = first(readyIds.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))[0]);
    }
    units.push(pick);
    if (pick) {
      pick.left -= 1;
      if (pick.left === 0) {
        pick.done = t + 1;
        if (!open.some((j) => j !== pick && j.task === pick!.task)) queue.splice(queue.indexOf(pick.task), 1);
      }
    }
    current = pick;
  }
  // Merge consecutive ticks of the same job (or of idle) into one bar.
  const runs: Run[] = [];
  units.forEach((j, t) => {
    const last = runs[runs.length - 1];
    const task = j ? j.task : 'idle';
    if (last && last.task === task && last.t1 === t && (j === null || units[t - 1] === j)) last.t1 = t + 1;
    else runs.push({ task, t0: t, t1: t + 1 });
  });
  // Ready but not running: from release until done, minus the ticks it ran.
  const ready: Schedule['ready'] = [];
  for (const k of tasks) {
    let from = -1;
    for (let t = 0; t <= horizon; t++) {
      const waiting = t < horizon && jobs.some((j) => j.task === k.id && j.release <= t && (j.done ?? Infinity) > t) && units[t]?.task !== k.id;
      if (waiting && from < 0) from = t;
      if (!waiting && from >= 0) { ready.push({ task: k.id, t0: from, t1: t }); from = -1; }
    }
  }
  return { runs, jobs, ready };
}

const POLICY_TEXT: Record<Policy, string> = {
  rm: 'Preemptive, rate-monotonic: the shorter the period, the higher the priority.',
  rev: 'Preemptive, with the priorities backwards: the longest period gets the highest priority.',
  rr: 'Round-robin: every ready task gets a 1 ms time slice in turn, regardless of urgency.',
  coop: 'Cooperative: the highest-priority ready task runs, but nobody is interrupted; a task keeps the CPU until it finishes.',
};

export function mountScheduling(root: HTMLElement) {
  let policy = oneOf<Policy>('pol', POLICIES, 'rm');
  const tasks = TASKS.map((t) => ({ ...t }));
  const cq = new URLSearchParams(location.search).get('c') ?? '';
  if (/^\d{3}$/.test(cq)) tasks.forEach((t, i) => (t.c = Math.max(1, Math.min(t.period - 1, Number(cq[i])))));

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Running many tasks</p>
      <h1>Scheduling</h1>
      <p>Three tasks share one CPU, each released every few milliseconds with a fixed amount of work that must be done
        before its next release. The scheduler decides who runs at every tick. Pick a policy, click a task’s work time to
        change it, and see whether every deadline is still met.</p>
    </section>
    ${traceHtml({ label: 'Scheduler trace', title: 'RTOS scheduler · 1 ms tick',
      controls: `${seg('pol', 'Scheduling policy', [['rm', 'Rate-monotonic'], ['rev', 'Backwards'], ['rr', 'Round-robin'], ['coop', 'Cooperative']])}<span class="sc-load"></span>` })}
    <section class="prose">
      <h2>Fixed priorities and rate-monotonic order</h2>
      <p>Most RTOS kernels, FreeRTOS and Zephyr among them, use preemptive fixed-priority scheduling: the highest-priority
        ready task always runs, and a more important task becoming ready takes the CPU immediately. The art is choosing the
        priorities. Rate-monotonic assignment gives the highest priority to the task with the shortest period, and for
        independent periodic tasks whose deadline is their next release, it is the best fixed assignment there is: if any
        fixed priority order meets every deadline, this one does.</p>
      <h2>Utilization and the bound</h2>
      <p>Utilization is the fraction of the CPU the tasks need, the sum of each task’s work divided by its period. It is a property of the task set, shown next to the policies, not a live reading: it changes only when a task’s work does. Above
        100% no policy can keep up. Liu and Layland proved that rate-monotonic scheduling always meets every deadline if
        utilization is at most n(2<sup>1/n</sup> − 1), about 78% for three tasks. That bound is sufficient, not necessary:
        this task set needs 95% and still fits, which an exact response-time analysis confirms. Raise a task’s work time
        and watch where it stops fitting.</p>
      <h2>Why not round-robin or cooperative</h2>
      <p>Round-robin is fair, but fairness is not what a real-time system needs: the sensor task gets the same share as
        the logger even when its deadline is much closer. Cooperative scheduling avoids preemption and the races it causes,
        but one long task delays everyone: here the logger, once started, holds the CPU while the sensor’s deadline
        passes. Getting the priorities backwards is just as bad, which is why the order matters more than the speed.</p>
    </section>`;

  const st = stepper(root);
  const nameOf = (id: TaskId | 'idle') => (id === 'idle' ? 'Idle' : tasks.find((t) => t.id === id)!.name);

  function load() {
    const sc = schedule(tasks, policy);
    const u = utilization(tasks);
    const misses = sc.jobs.filter((j) => (j.done ?? Infinity) > j.deadline && j.deadline <= HORIZON);
    const lanes: Lane[] = [
      ...tasks.map((t) => ({ id: t.id, name: t.name, color: t.color,
        sub: `T ${t.period} · <button type="button" class="tr-chip" data-c="${t.id}" aria-label="${t.name} work ${t.c} ms. Click to change.">C ${t.c}</button>` })),
      { id: 'idle', name: 'Idle', sub: 'nothing ready', color: 'var(--ln-dim)' },
    ];
    const bars: Bar[] = sc.runs.map((r) => ({ lane: r.task, t0: r.t0, t1: r.t1, kind: r.task === 'idle' ? 'bg' : 'run' }));
    bars.push(...sc.ready.map((r) => ({ lane: r.task, t0: r.t0, t1: r.t1, kind: 'ready' as const })));
    const marks: Mark[] = [
      ...sc.jobs.map((j) => ({ lane: j.task, t: j.release, kind: 'fire' as const, title: `${nameOf(j.task)} released at ${j.release} ms` })),
      ...misses.map((j) => ({ lane: j.task, t: j.deadline, kind: 'miss' as const, title: `${nameOf(j.task)} misses its ${j.deadline} ms deadline` })),
    ];
    const steps: Step[] = sc.runs.map((r, i) => {
      const prev = sc.runs[i - 1];
      const released = tasks.filter((t) => r.t0 % t.period === 0 && r.t0 > 0).map((t) => t.id);
      const job = sc.jobs.find((j) => j.task === r.task && j.release <= r.t0 && (j.done ?? Infinity) >= r.t1);
      let why: string;
      if (r.task === 'idle') why = 'No task has work left, so the CPU idles until the next release.';
      else if (!prev) why = `Every task is released at 0 ms. ${nameOf(r.task)} goes first: ${policy === 'rr' ? 'it is first in the round-robin queue' : policy === 'rev' ? 'with the priorities backwards, it has the highest' : 'it has the shortest period, so the highest priority'}.`;
      else if (prev.task !== 'idle' && prev.task !== r.task && sc.jobs.some((j) => j.task === prev.task && j.release <= prev.t0 && (j.done ?? Infinity) > prev.t1))
        why = policy === 'rr' ? `${nameOf(prev.task)}’s 1 ms slice is up, so ${nameOf(r.task)}, next in the queue, gets the CPU.`
          : `${nameOf(r.task)} is released and preempts ${nameOf(prev.task)}, which has a lower priority${policy === 'rm' ? ' because its period is longer' : ''}.`;
      else if (prev.task === 'idle') why = `${nameOf(r.task)} is released and the CPU is free.`;
      else if (prev.task === r.task) why = `${nameOf(r.task)} finished one job and starts its next, already released.`;
      else why = `${nameOf(prev.task)} finished${policy === 'coop' ? ' and yields' : ''}, so ${policy === 'rr' ? `${nameOf(r.task)}, next in the queue,` : `the highest-priority ready task, ${nameOf(r.task)},`} runs.`;
      if (released.length && !why.includes('released') && r.task !== 'idle') why += ` ${released.map(nameOf).join(' and ')} ${released.length > 1 ? 'are' : 'is'} released at ${r.t0} ms.`;
      const done = job && job.done === r.t1 ? ` It finishes its job at ${r.t1} ms${job.done > job.deadline ? ', late' : `, ${job.deadline - job.done} ms before its deadline`}.` : '';
      const missed = misses.filter((j) => j.deadline > r.t0 && j.deadline <= r.t1)
        .map((j) => ` <span class="bad">${nameOf(j.task)} misses its ${j.deadline} ms deadline.</span>`).join('');
      const nMiss = misses.filter((j) => j.deadline <= r.t1).length;
      return { bar: i, at: r.t1, lane: r.task, note: why + done + missed,
        readout: [`t = ${r.t1} ms`, `CPU: <b>${nameOf(r.task)}</b>`, 
          `<span class="${nMiss ? 'bad' : 'good'}">${nMiss ? plural(nMiss, 'missed deadline') : 'No misses'}</span>`] };
    });
    steps[0].note = `${POLICY_TEXT[policy]} ${steps[0].note}`;
    st.load({ lanes, bars, marks, end: HORIZON, every: 5, minor: 1 }, steps);
    // The task set's load, a fixed property of the tasks, beside the settings rather than in the live readout.
    root.querySelector('.sc-load')!.innerHTML = `Tasks need <b class="${u > 1 ? 'bad' : u > rmBound(3) ? '' : 'good'}">${Math.round(u * 100)}%</b> of the CPU · rate-monotonic is guaranteed up to ${Math.round(rmBound(3) * 100)}%`;
    markSeg(root, 'pol', policy);
    syncUrl({ pol: policy, c: tasks.map((t) => t.c).join('') });
  }
  load();

  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    const p = t.closest<HTMLElement>('[data-pol]');
    const c = t.closest<HTMLElement>('[data-c]');
    if (p) { policy = p.dataset.pol as Policy; load(); }
    else if (c) {
      const k = tasks.find((x) => x.id === c.dataset.c)!;
      k.c = k.c % (k.period - 1) + 1;
      load();
      root.querySelector<HTMLElement>(`[data-c="${k.id}"]`)?.focus();
    }
  });
}
