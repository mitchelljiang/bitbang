/**
 * The page's scroll position, as a line along the bottom of the window that fills from left to right and reaches the
 * right edge at the bottom of the page. It stands in for the scrollbar, which is hidden. Pages that fit in the window
 * have no line.
 */
export function mountProgress() {
  const bar = Object.assign(document.createElement('div'), { className: 'progress' });
  bar.setAttribute('aria-hidden', 'true');
  document.body.append(bar);
  let queued = false;
  const update = () => {
    queued = false;
    const el = document.documentElement;
    const range = el.scrollHeight - window.innerHeight;
    bar.hidden = range < 4;
    bar.style.transform = `scaleX(${range > 0 ? Math.min(1, window.scrollY / range) : 0})`;
  };
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  // Content changes height when switching pages or settings, which changes how far there is to scroll.
  new ResizeObserver(schedule).observe(document.body);
  update();
}
