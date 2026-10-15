import { GUTTER } from './core/render';
import { formatTime } from './core/util';

interface View {
  ppu: number;
  duration: number;
  unitTime: number;
}

/**
 * Scope conveniences shared by every waveform: a vertical cursor that follows the pointer with its time shown in the
 * readout bar, as on a real scope, and soft fades on whichever edge has more waveform beyond it (there is no
 * scrollbar to say so). `view` returns the current drawing's scale, or null before anything is drawn.
 */
export function mountScopeAids(scope: HTMLElement, readout: HTMLElement, view: () => View | null) {
  const frame = scope.parentElement!;
  const line = Object.assign(document.createElement('div'), { className: 'cursor-line' });
  line.setAttribute('aria-hidden', 'true');
  line.hidden = true;
  frame.append(line);

  const hide = () => {
    line.hidden = true;
    const out = readout.querySelector('.rd-cursor');
    if (out) out.textContent = '';
  };
  scope.addEventListener('pointermove', (e) => {
    const v = view();
    if (!v || e.pointerType === 'touch') return hide();
    const box = scope.getBoundingClientRect();
    // The drawing starts inside the bezel (the scope's side border, clientLeft wide), not at its outer edge.
    const t = (scope.scrollLeft + e.clientX - box.left - scope.clientLeft - GUTTER) / v.ppu;
    if (t < 0 || t > v.duration) return hide();
    // The line is positioned within the frame's padding box, so measure from there, straight from the pointer.
    const outer = frame.getBoundingClientRect();
    line.hidden = false;
    line.style.left = `${e.clientX - outer.left - frame.clientLeft}px`;
    line.style.top = `${box.top - outer.top - frame.clientTop}px`;
    line.style.height = `${box.height}px`;
    const out = readout.querySelector('.rd-cursor');
    if (out) out.textContent = `Cursor ${formatTime(t * v.unitTime)}`;
  });
  scope.addEventListener('pointerleave', hide);

  const [left, right] = ['left', 'right'].map((side) => {
    const el = Object.assign(document.createElement('div'), { className: `edge-fade ${side}` });
    el.setAttribute('aria-hidden', 'true');
    frame.append(el);
    return el;
  });
  const fades = () => {
    const max = scope.scrollWidth - scope.clientWidth;
    // Inside the bezel: clientLeft is the bezel's width, clientWidth the screen's.
    const top = `${scope.offsetTop}px`;
    const height = `${scope.offsetHeight}px`;
    Object.assign(left.style, { top, height, left: `${scope.offsetLeft + scope.clientLeft}px` });
    Object.assign(right.style, { top, height, left: `${scope.offsetLeft + scope.clientLeft + scope.clientWidth - 48}px` });
    left.classList.toggle('on', scope.scrollLeft > 1);
    right.classList.toggle('on', scope.scrollLeft < max - 1);
  };
  scope.addEventListener('scroll', () => {
    fades();
    hide();
  }, { passive: true });

  /** Call after every redraw: the width, and so the fades, may have changed. */
  return { refresh: fades };
}
