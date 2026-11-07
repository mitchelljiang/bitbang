/**
 * Small, purposeful motion for the site's interactive panels. A segmented control's selection slides to the option
 * picked, bits that a redraw adds (widening uint8_t to uint16_t) grow out from the bits already there, and the explain
 * line fades its new text in, so a click reads as a change rather than a jump. Pages redraw by replacing HTML, so
 * instead of hooking each page this watches the panel and reacts to what changed. Reduced motion turns it all off (the
 * CSS transitions through the global rule, the animations here).
 */

const SEGS = '.dbg-seg, .mseg, .dbg-ops';
const PANELS = '.debugger, .trace, .diagram, .instrument';
const LINES = '.dbg-status, .tr-status, .dg-status, .explain';
const still = matchMedia('(prefers-reduced-motion: reduce)');

type Spot = { x: number; y: number; w: number; h: number };

function put(thumb: HTMLElement, { x, y, w, h }: Spot) {
  thumb.style.width = `${w}px`;
  thumb.style.height = `${h}px`;
  thumb.style.transform = `translate(${x}px, ${y}px)`;
}

/**
 * Moves a segmented control's thumb under its checked option; `instant` places it without sliding. Some pages rebuild
 * their controls on every draw, so `last` remembers each control's thumb by its label and a rebuilt one slides on from
 * where the old one stood.
 */
function place(seg: HTMLElement, last: Map<string, Spot>, instant = false) {
  let thumb = seg.querySelector<HTMLElement>(':scope > .seg-thumb');
  const key = seg.getAttribute('aria-label') ?? '';
  const from = thumb ? undefined : last.get(key);
  if (!thumb) {
    thumb = document.createElement('span');
    thumb.className = 'seg-thumb';
    thumb.setAttribute('aria-hidden', 'true');
    seg.prepend(thumb);
    seg.classList.add('glide');
  }
  const on = seg.querySelector<HTMLElement>('[aria-checked="true"]');
  // Nothing checked (a typed value that is not a preset): the thumb fades out where it is.
  if (!on) { thumb.style.opacity = '0'; last.delete(key); return; }
  const to = { x: on.offsetLeft, y: on.offsetTop, w: on.offsetWidth, h: on.offsetHeight };
  // Appearing from nothing it fades in at its option instead of sliding from wherever it was last.
  const jump = instant || from !== undefined || thumb.style.opacity !== '1';
  if (jump) {
    thumb.style.transition = 'none';
    put(thumb, from ?? to);
    void thumb.offsetWidth;
    thumb.style.transition = '';
  }
  put(thumb, to);
  thumb.style.opacity = '1';
  last.set(key, to);
}

/** Every bit cell in a panel, keyed by its variable and position. */
const bitKeys = (panel: HTMLElement) =>
  new Map([...panel.querySelectorAll<HTMLElement>('.bit[data-row][data-bit]')].map((b) => [`${b.dataset.row}:${b.dataset.bit}`, b]));

/** Watches every interactive panel under `root` for the rest of the page's life. */
export function animatePanels(root: HTMLElement) {
  const panels = [...root.querySelectorAll<HTMLElement>(PANELS)].filter((p) => !p.parentElement?.closest(PANELS));
  for (const panel of panels) {
    const last = new Map<string, Spot>();
    const sizes = new ResizeObserver((entries) => entries.forEach((e) => place(e.target as HTMLElement, last, true)));
    const sync = () => panel.querySelectorAll<HTMLElement>(SEGS).forEach((s) => {
      if (!s.querySelector(':scope > .seg-thumb')) sizes.observe(s);
      place(s, last);
    });
    sync();
    const line = panel.querySelector<HTMLElement>(LINES);
    let said = line?.textContent ?? '';
    let bits = bitKeys(panel);
    new MutationObserver((records) => {
      // A changed selection, or a redraw that brought new segmented controls with it.
      if (records.some((r) => r.type === 'attributes'
        || [...r.addedNodes].some((n) => n instanceof Element && (n.matches(SEGS) || n.querySelector(SEGS) !== null)))) sync();
      // Pages rewrite the explain line on every draw; only fade it when the words actually changed.
      if (line && line.textContent !== said) {
        said = line.textContent ?? '';
        if (!still.matches) line.animate([{ opacity: 0.5 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
      }
      // Bits new to a variable that was already shown: the high bits of a wider type. They come in from the bits
      // already there outward, so the eye sees the value gain places on the left rather than being redrawn.
      const now = bitKeys(panel);
      const rows = new Set([...bits.keys()].map((k) => k.split(':')[0]));
      const grown = [...now].filter(([k]) => !bits.has(k) && rows.has(k.split(':')[0])).map(([, b]) => b);
      bits = now;
      if (still.matches) return;
      grown.forEach((b, i) => b.animate([{ opacity: 0, transform: 'translateX(8px) scale(0.9)' }, { opacity: 1, transform: 'none' }],
        { duration: 220, delay: (grown.length - 1 - i) * 14, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)', fill: 'backwards' }));
    }).observe(panel, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['aria-checked'] });
  }
}
