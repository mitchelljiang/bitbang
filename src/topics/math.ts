/**
 * Equations in page prose, written in LaTeX and drawn as MathML, which every current browser renders natively. Only the
 * small subset the pages use is understood: \frac, subscripts and superscripts, \mathrm and \text, \lfloor / \rfloor,
 * \left / \right, a few symbols and spaces. The LaTeX is kept on the element as `alttext`, so the Obsidian export can
 * write it back out as $$…$$.
 */
import { esc } from '../core/render';

const SYMBOL: Record<string, string> = {
  cdot: '·', times: '×', div: '÷', approx: '≈', le: '≤', ge: '≥', lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉',
  Omega: 'Ω', mu: 'μ', pm: '±', to: '→', gg: '≫', ll: '≪',
};
const SPACE: Record<string, string> = { ',': '0.17em', ';': '0.28em', ' ': '0.33em', quad: '1em', qquad: '2em' };
const OPS = '+-=()[]/,<>|!';

/** Converts the LaTeX subset to MathML (the inner content of a <math> element). */
export function mathml(src: string): string {
  let i = 0;
  const group = (): string => {
    // A braced group, or a single atom when there are no braces.
    while (src[i] === ' ') i++;
    if (src[i] === '{') {
      i++;
      const out = seq('}');
      i++;
      return `<mrow>${out}</mrow>`;
    }
    return atom() ?? '';
  };
  const raw = () => { // the text inside {…}, as written
    while (src[i] === ' ') i++;
    const start = ++i;
    let depth = 1;
    while (i < src.length && depth) { if (src[i] === '{') depth++; else if (src[i] === '}') depth--; i++; }
    return src.slice(start, i - 1);
  };
  const atom = (): string | null => {
    const c = src[i];
    if (c === undefined) return null;
    if (c === '\\') {
      const m = /^\\([A-Za-z]+|.)/.exec(src.slice(i))!;
      const name = m[1];
      i += m[0].length;
      if (name === 'frac') { const a = group(), b = group(); return `<mfrac>${a}${b}</mfrac>`; }
      if (name === 'mathrm') return `<mi mathvariant="normal">${esc(raw())}</mi>`;
      if (name === 'text') return `<mtext>${esc(raw())}</mtext>`;
      if (name === 'left' || name === 'right') return atom();
      if (SPACE[name]) return `<mspace width="${SPACE[name]}"/>`;
      if (SYMBOL[name]) return /[A-Za-zΩμ]/.test(SYMBOL[name]) ? `<mi mathvariant="normal">${SYMBOL[name]}</mi>` : `<mo>${SYMBOL[name]}</mo>`;
      return `<mtext>${esc(name)}</mtext>`;
    }
    if (/[0-9.]/.test(c)) { const m = /^[0-9.]+/.exec(src.slice(i))![0]; i += m.length; return `<mn>${m}</mn>`; }
    if (/[A-Za-z]/.test(c)) { i++; return `<mi>${c}</mi>`; }
    if (OPS.includes(c)) { i++; return `<mo>${c === '-' ? '−' : esc(c)}</mo>`; }
    i++;
    return c === ' ' ? '' : `<mo>${esc(c)}</mo>`;
  };
  const seq = (stop?: string) => {
    let out = '';
    while (i < src.length && src[i] !== stop) {
      if (src[i] === ' ') { i++; continue; }
      let base = atom();
      if (base === null) break;
      if (base === '') continue;
      let sub = '', sup = '';
      for (;;) {
        while (src[i] === ' ') i++;
        if (src[i] === '_') { i++; sub = group(); } else if (src[i] === '^') { i++; sup = group(); } else break;
      }
      if (sub && sup) base = `<msubsup>${base}${sub}${sup}</msubsup>`;
      else if (sub) base = `<msub>${base}${sub}</msub>`;
      else if (sup) base = `<msup>${base}${sup}</msup>`;
      out += base;
    }
    return out;
  };
  return seq();
}

/** A displayed equation, for a page's prose. */
export const eq = (latex: string) => `<div class="eq"><math display="block" alttext="${esc(latex)}">${mathml(latex)}</math></div>`;
