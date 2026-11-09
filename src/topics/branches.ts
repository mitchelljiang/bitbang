/**
 * The branches page: a run of one branch's outcomes, what each predictor guessed, and what the wrong guesses cost.
 * The predictors are exported; verify checks them against an independent implementation over every short pattern.
 */
import { markSeg, oneOf, reservedStatus, seg, stepButtons, syncUrl, walkthrough } from './dbg';

export const PREDICTORS = ['none', 'static', 'one', 'two'] as const;
export type Predictor = (typeof PREDICTORS)[number];

export interface Guess { predicted: boolean; actual: boolean; hit: boolean; before: number; after: number }

/** The guess for each execution of a branch. Both history predictors start out predicting not taken. */
export function predictAll(p: Predictor, outcomes: boolean[], backward: boolean): Guess[] {
  let state = p === 'two' ? 1 : 0;
  return outcomes.map((actual) => {
    const before = state;
    const predicted = p === 'none' ? false : p === 'static' ? backward : p === 'one' ? state === 1 : state >= 2;
    if (p === 'one') state = actual ? 1 : 0;
    if (p === 'two') state = actual ? Math.min(3, state + 1) : Math.max(0, state - 1);
    return { predicted, actual, hit: predicted === actual, before, after: state };
  });
}

/** Cycles for the run: one per branch, plus the refill for each wrong guess. */
export const runCost = (g: Guess[], refill: number) => g.length + g.filter((x) => !x.hit).length * refill;

const T = true, N = false;
const loop8 = [T, T, T, T, T, T, T, N];
export const PATTERNS: Record<string, { label: string; run: boolean[]; backward: boolean; code: string; say: string }> = {
  loop: { label: 'Loop', run: [...loop8, ...loop8], backward: true, code: 'for (i = 0; i < 8; i++) { … }   // twice', say: 'A loop’s branch back to the top: taken seven times, then not taken once.' },
  rare: { label: 'Rare error', run: [N, N, N, N, N, T, N, N, N, N, N, N, N, T, N, N], backward: false, code: 'if (status & ERROR) handle();', say: 'A forward branch that is almost never taken, like an error check.' },
  alt: { label: 'Alternating', run: [T, N, T, N, T, N, T, N, T, N, T, N, T, N, T, N], backward: false, code: 'if (i & 1) odd(); else even();', say: 'A branch that flips every time. History makes this worse, not better.' },
};
const KEYS = Object.keys(PATTERNS);
const LABEL: Record<Predictor, string> = { none: 'No prediction', static: 'Backward taken', one: '1-bit', two: '2-bit' };
const WHAT: Record<Predictor, string> = {
  none: 'Keep fetching the next instruction, as a Cortex-M0+ does. That is a guess of “not taken”, so every taken branch pays.',
  static: 'A fixed rule with no memory: a backward branch is probably a loop, so guess taken; a forward branch, not taken.',
  one: 'Remember what the branch did last time, and guess the same.',
  two: 'A counter from 0 to 3, up when taken and down when not. It takes two wrong guesses in a row to change its mind.',
};
const STATES: Record<Predictor, string[]> = { none: [], static: [], one: ['Not taken', 'Taken'], two: ['Strong N', 'Weak N', 'Weak T', 'Strong T'] };
const REFILLS = ['1', '2', '5'] as const;

export function mountBranches(root: HTMLElement) {
  let pred = oneOf('pred', PREDICTORS, 'two');
  let pat = oneOf('pat', KEYS as readonly string[], 'loop');
  let refill = oneOf('refill', REFILLS, '2');
  let at = 0;

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Execution</p>
      <h1>Branches</h1>
      <p>A branch is only decided in Execute, but the pipeline has already fetched what comes after it. If it guessed wrong,
        that work is thrown away and refilled. So the processor guesses, and the guess is worth getting right. Pick how
        it guesses, then step through one branch running over and over.</p>
    </section>
    <section class="debugger brn" aria-label="Branch prediction">
      <header class="dbg-bar"><span class="dbg-file br-code"></span><div class="dbg-controls">${seg('pat', 'Branch', KEYS.map((k) => [k, PATTERNS[k].label]))}${stepButtons()}</div></header>
      <div class="pp-tabs">${seg('pred', 'Predictor', PREDICTORS.map((p) => [p, LABEL[p]]))}<span class="br-refill"><small>Refill cycles</small>${seg('refill', 'Refill cycles', REFILLS.map((r) => [r, r]))}</span></div>
      <div class="br-body">
        <div class="br-run"></div>
        <div class="br-states"></div>
        <table class="br-table"></table>
      </div>
      <p class="dbg-status" aria-live="polite"></p>
    </section>
    <section class="prose">
      <h2>What a wrong guess costs</h2>
      <p>A wrong guess costs one refill: the cycles needed to get the correct instruction through the pipeline’s early
        stages. That is 1 cycle on a two-stage Cortex-M0+, around 2 on a three-stage Cortex-M4, and more on anything deeper.
        Slow Flash adds to it. See <a href="?p=pipeline" data-nav>the pipeline</a> for the cycles themselves.</p>
      <h2>Why two bits</h2>
      <p>A loop’s branch is taken again and again and then falls through once. A 1-bit predictor gets that exit wrong, then
        also gets the first branch of the next run wrong, because it remembers the exit. Two bits ride over one surprise:
        the counter slips from strong to weak and still guesses taken. So a 2-bit predictor misses once per loop and a 1-bit
        predictor twice.</p>
      <h2>On a microcontroller</h2>
      <p>The Cortex-M0+ and Cortex-M4 have no history table; with so few stages, it would save little. The Cortex-M7, with
        six stages, does predict dynamically. Fast predictors in larger processors are the same idea with more history.</p>
      <p>You can also avoid the question. A branch that is hard to predict can sometimes be replaced by arithmetic, which is
        why <code>-Os</code> turned the comparison on the <a href="?p=ub" data-nav>undefined behavior</a> page into
        <code>subs</code>, <code>rsbs</code> and <code>adcs</code> instead of a jump. And when code must take exactly the same time
        whatever the data, as cryptography must, avoiding branches matters regardless of how good the prediction is.</p>
    </section>`;

  const panel = root.querySelector<HTMLElement>('.brn')!;
  const stepText = (g: Guess, i: number, n: number) => `<b>Run ${i + 1} of ${n}.</b> Guessed ${g.predicted ? 'taken' : 'not taken'}; it was ${g.actual ? 'taken' : 'not taken'}. ${g.hit ? 'Correct, so the pipeline keeps going.' : 'Wrong: the pipeline is refilled.'}`;
  const ghosts = KEYS.flatMap((k) => [`${PATTERNS[k].say} ${WHAT.two}`, `${PATTERNS[k].say} ${WHAT.static}`, `${PATTERNS[k].say} ${WHAT.none}`]).concat(stepText({ predicted: false, actual: true, hit: false, before: 0, after: 0 }, 9, 16));
  const say = reservedStatus(panel, ghosts);
  const count = () => PATTERNS[pat].run.length + 1;
  const w = walkthrough(root, { count, at: () => at, go: (i) => { at = i; draw(); } });

  function draw() {
    const p = PATTERNS[pat], cost = Number(refill);
    const g = predictAll(pred, p.run, p.backward);
    root.querySelector('.br-code')!.textContent = p.code;
    root.querySelector('.br-run')!.innerHTML = `
      <span class="br-l">Guess</span>${g.map((x, i) => `<i class="br-c${i < at ? (x.predicted ? ' t' : ' n') : ''}${i === at - 1 ? ' now' : ''}">${i < at ? (x.predicted ? 'T' : 'N') : ''}</i>`).join('')}
      <span class="br-l">Actual</span>${g.map((x, i) => `<i class="br-c${i < at ? (x.actual ? ' t' : ' n') : ''}${i === at - 1 ? ' now' : ''}">${i < at ? (x.actual ? 'T' : 'N') : ''}</i>`).join('')}
      <span class="br-l">Result</span>${g.map((x, i) => `<i class="br-c mark${i < at ? (x.hit ? ' ok' : ' bad') : ''}${i === at - 1 ? ' now' : ''}">${i < at ? (x.hit ? '✓' : '✗') : ''}</i>`).join('')}`;
    const cur = at ? g[at - 1].after : g[0]?.before ?? 0;
    const names = STATES[pred];
    const none = (q: Predictor) => `<span class="br-s none">${q === 'none' ? 'No state: always fetches the next instruction' : 'No state: decided by the branch’s direction'}</span>`;
    const chips = (list: string[], on: number) => list.map((n, i) => `<span class="br-s${i === on ? ' on' : ''}">${n}</span>`).join('');
    root.querySelector('.br-states')!.innerHTML = `<div>${names.length ? chips(names, cur) : none(pred)}</div>` +
      [none('none'), none('static'), chips(STATES.two, -1)].map((h) => `<div class="cc-ghost" aria-hidden="true">${h}</div>`).join('');
    root.querySelector('.br-table')!.innerHTML = `<thead><tr><th>Predictor</th><th>Wrong</th><th>Cycles</th></tr></thead><tbody>${PREDICTORS.map((q) => {
      const x = predictAll(q, p.run, p.backward);
      return `<tr class="${q === pred ? 'on' : ''}"><td>${LABEL[q]}</td><td>${x.filter((y) => !y.hit).length} of ${x.length}</td><td>${runCost(x, cost)}</td></tr>`;
    }).join('')}</tbody>`;
    say(at ? stepText(g[at - 1], at - 1, g.length) : `${p.say} ${WHAT[pred]}`);
    markSeg(root, 'pat', pat); markSeg(root, 'pred', pred); markSeg(root, 'refill', refill);
    syncUrl({ pat, pred, refill });
    w.sync();
  }

  panel.addEventListener('click', (e) => {
    const t = e.target as Element;
    const a = t.closest<HTMLElement>('[data-pat]'), b = t.closest<HTMLElement>('[data-pred]'), c = t.closest<HTMLElement>('[data-refill]');
    if (a) { pat = a.dataset.pat as string; at = 0; }
    else if (b) { pred = b.dataset.pred as Predictor; at = 0; }
    else if (c) refill = c.dataset.refill as (typeof REFILLS)[number];
    else return;
    draw();
  });
  draw();
}
