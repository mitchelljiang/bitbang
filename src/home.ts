import { groupSteps, render } from './core/render';
import { protocols } from './protocols';

/** Builds the home page into `root`. Returns start/stop for the hero animation. */
export function mountHome(root: HTMLElement) {
  root.innerHTML = `
    <section class="hero">
      <div class="hero-text">
        <h1>Timing diagrams you can <em>poke at</em></h1>
        <p class="lede">Type in some bytes and see what actually goes out on the wire. Click any bit and it'll
          tell you what it's doing there.</p>
        <div class="cta">
          <a class="btn primary" href="?p=uart" data-nav>Try UART</a>
          <button class="btn" type="button" data-open-menu>Browse protocols</button>
        </div>
      </div>
      <figure class="hero-scope panel">
        <div class="hero-wave"></div>
        <figcaption class="hero-caption" aria-live="off"></figcaption>
      </figure>
    </section>`;

  // Hero: a real UART frame, stepped through on a loop.
  const wave = root.querySelector('.hero-wave') as HTMLElement;
  const caption = root.querySelector('.hero-caption') as HTMLElement;
  const uart = protocols.find((p) => p.id === 'uart')!;
  const params = Object.fromEntries(uart.params.map((p) => [p.key, p.default]));
  let timer: number | undefined;

  const draw = () => {
    const w = uart.encode({ ...params, data: 'Hi', parity: 'even' });
    const steps = groupSteps(w.bits);
    let i = -1;
    const drawn = render(wave, w, steps, { zoom: 'fit', onPick: (n) => show(n), onHover: () => {} });
    const show = (n: number) => {
      i = n;
      drawn.select(steps[i]);
      const bit = steps[i].bits[0];
      caption.innerHTML = `<span class="tag k-${bit.kind}">${bit.label}</span> ${bit.info.split('. ')[0]}.`;
    };
    return () => show((i + 1) % steps.length);
  };

  let advance = () => {};
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  return {
    start() {
      advance = draw();
      advance();
      if (!reduced && timer === undefined) timer = window.setInterval(() => advance(), 900);
    },
    stop() {
      clearInterval(timer);
      timer = undefined;
    },
  };
}
