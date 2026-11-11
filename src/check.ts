/**
 * The "Check yourself" block under a page: its questions from src/checks.ts, each a row of options. A wrong pick is
 * marked and can be tried again; the right one is marked and shows why. Options are shuffled on every visit, so the
 * position of the answer teaches nothing. Nothing is scored or stored. The questions load on demand, with the page.
 */
import type { Check } from './checks';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
/** Escapes text and sets `code` spans. */
const rich = (s: string) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');

let data: Promise<Record<string, Check[]>> | undefined;
const load = () => (data ??= import('./checks').then((m) => m.CHECKS));

function shuffled<T>(list: T[]) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function mountCheck(box: HTMLElement) {
  let ticket = 0;
  box.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('.ck-opt');
    const q = b?.closest<HTMLElement>('.ck-q');
    if (!b || !q || q.classList.contains('solved')) return;
    const right = b.dataset.right !== undefined;
    b.classList.add(right ? 'right' : 'wrong');
    b.setAttribute('aria-pressed', 'true');
    const say = q.querySelector<HTMLElement>('.ck-say')!;
    if (right) {
      q.classList.add('solved');
      for (const o of q.querySelectorAll<HTMLButtonElement>('.ck-opt')) if (o !== b) o.disabled = true;
      say.innerHTML = `<b>Right.</b> ${q.dataset.why}`;
    } else {
      b.disabled = true;
      say.innerHTML = '<b>Not that one.</b> Try another.';
    }
  });
  return {
    /** Shows the questions for page `id`, or nothing when it has none. */
    async show(id: string | null) {
      const mine = ++ticket;
      box.hidden = true;
      if (!id) return;
      const list = (await load())[id];
      if (mine !== ticket || !list?.length) return;
      box.innerHTML = `
        <h2 id="check-title">Check yourself</h2>
        <p class="ck-note">${list.length === 1 ? 'One question' : `${list.length} questions`} this page answers. Nothing is scored or saved.</p>
        ${list.map((c, i) => `
        <div class="ck-q" role="group" aria-labelledby="ck-${i}" data-why="${esc(rich(c.why))}">
          <p class="ck-ask" id="ck-${i}"><span aria-hidden="true">${i + 1}</span><span class="ck-text">${rich(c.q)}</span></p>
          <div class="ck-opts">${shuffled(c.options.map((o, k) => ({ o, right: k === c.answer }))).map(({ o, right }) =>
            `<button type="button" class="ck-opt"${right ? ' data-right' : ''}>${rich(o)}</button>`).join('')}</div>
          <p class="ck-say" aria-live="polite"></p>
        </div>`).join('')}`;
      box.hidden = false;
    },
  };
}
