/**
 * Lists candidates for removal. Every line is a lead to check, not a verdict: class names built at runtime
 * (`k-${kind}`, `m-${m.kind}`) and exports read only by scripts/verify.ts show up here and must stay.
 *
 *   node .claude/skills/sweep/deadcode.mjs
 *
 * - exports: exported names never mentioned outside their own file (drop `export`, or delete if unused inside too)
 * - css: class selectors in src/style.css whose name never appears in src/ or index.html
 * - ids: #id selectors and getElementById/$('#…') targets with no matching id="…"
 * - dup selectors: the same selector written in more than one rule (merge them, or delete the overridden one)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const ts = walk('src').filter((f) => f.endsWith('.ts'));
const src = Object.fromEntries([...ts, 'index.html', 'scripts/verify.ts'].map((f) => [f, readFileSync(f, 'utf8')]));
const css = readFileSync('src/style.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const all = Object.values(src).join('\n');
const word = (w) => new RegExp(`(^|[^\\w-])${w.replace(/[$]/g, '\\$')}($|[^\\w-])`);

// Exports nobody else imports.
const lonely = [];
for (const f of ts) {
  for (const m of src[f].matchAll(/^export (?:const|function|interface|type|class|let) (\w+)/gm)) {
    const name = m[1];
    const elsewhere = Object.entries(src).some(([g, text]) => g !== f && word(name).test(text));
    if (!elsewhere) {
      const uses = src[f].split(word(name)).length - 1;
      lonely.push(`${f}  ${name}${uses <= 1 ? '  (unused even here: delete)' : '  (used only here: drop export)'}`);
    }
  }
}

// CSS classes with no mention in the markup or code. A name that only appears as part of a template
// (`tr-seg k-${b.kind}`) is matched by its prefix, so `k-run` passes when `k-${` exists.
const classes = new Set([...css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]).filter((c) => !/^\d/.test(c)));
const prefixes = [...all.matchAll(/([\w-]{2,})\$\{/g)].map((m) => m[1]);
const deadCss = [...classes].filter((c) => !word(c).test(all) && !prefixes.some((p) => c.startsWith(p))).sort();

// ids.
const ids = new Set([...css.matchAll(/#([a-zA-Z][\w-]*)/g)].map((m) => m[1]).filter((i) => !/^[0-9a-fA-F]{3,8}$/.test(i)));
const deadIds = [...ids].filter((i) => !new RegExp(`id=["'\`]${i}["'\`]|id: ?'${i}'`).test(all)).sort();

// Selectors repeated across rules (top level only; media queries legitimately repeat).
const top = css.replace(/@media[^{]+\{([^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
const seen = new Map();
for (const m of top.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
  for (const sel of m[1].split(',').map((s) => s.trim()).filter(Boolean)) seen.set(sel, (seen.get(sel) ?? 0) + 1);
}
const dups = [...seen].filter(([, n]) => n > 1).map(([s, n]) => `${s}  ×${n}`);

const show = (title, list) => console.log(`\n## ${title} (${list.length})\n${list.map((l) => `  ${l}`).join('\n') || '  none'}`);
show('exports not imported elsewhere', lonely);
show('css classes never referenced', deadCss);
show('css ids never referenced', deadIds);
show('selectors in more than one top-level rule', dups);
