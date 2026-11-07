/**
 * Prints a map of the site: every page by section, the file that draws it, its panel type, its size, and whether
 * scripts/verify.ts tests its logic; then the big sections of src/style.css with their line numbers.
 *
 *   node .claude/skills/sweep/map.mjs [filter]      e.g. `map.mjs memory`, `map.mjs caches`
 *
 * Use it to find where something lives before reading code, and to spot pages with no tests or files that have
 * grown too large.
 */
import { readFileSync, existsSync } from 'node:fs';

const read = (f) => readFileSync(f, 'utf8');
const filter = process.argv[2]?.toLowerCase();
const verify = read('scripts/verify.ts');
const registry = read('src/topics/index.ts');

/** The file that draws page `id`: a topic module from the registry, or a protocol module. */
function fileOf(id) {
  const m = registry.match(new RegExp(`^  '?${id}'?: \\(\\) => import\\('\\./(\\w+)'\\)`, 'm'));
  if (m) return `src/topics/${m[1]}.ts`;
  for (const f of ['src/protocols/' + id + '.ts']) if (existsSync(f)) return f;
  const proto = read('src/protocols/index.ts').match(new RegExp(`import \\{ (\\w+) \\} from '\\./(\\w+)'`, 'g')) ?? [];
  for (const line of proto) {
    const [, name, file] = line.match(/\{ (\w+) \} from '\.\/(\w+)'/);
    if (new RegExp(`id: '${id}'`).test(read(`src/protocols/${file}.ts`))) return `src/protocols/${file}.ts`;
    void name;
  }
  return null;
}

const panelOf = (src) => /class="debugger mem/.test(src) ? 'memory instrument' : /traceHtml\(|class="trace/.test(src) ? 'logic analyzer'
  : /diagramHtml\(|class="diagram/.test(src) ? 'chip diagram' : /page\(\{|class="debugger/.test(src) ? 'debugger' : /encode\(/.test(src) ? 'oscilloscope' : '';

const sections = [['Protocols', 'src/catalog.ts'], ['Bits and bytes', 'src/bits.ts'], ['Memory', 'src/memory.ts'], ['Concurrency', 'src/concurrency.ts'], ['Peripherals', 'src/peripherals.ts'], ['Architecture', 'src/architecture.ts']];
for (const [title, file] of sections) {
  const rows = [];
  for (const m of read(file).matchAll(/\{[ \t]*id:[ \t]*'([a-z0-9-]+)',[ \t]*name:[ \t]*'((?:[^'\\]|\\.)*)'(.*)/g)) {
    const [, id, name, rest] = m;
    const f = fileOf(id);
    const status = f ? 'live' : /wip:/.test(rest) ? 'wip' : 'soon';
    const src = f ? read(f) : '';
    const tested = f ? (verify.includes(`'../src/${f.slice(4, -3)}'`) || f.startsWith('src/protocols/') ? 'tested' : 'NO TESTS') : '';
    const line = `  ${id.padEnd(14)} ${name.slice(0, 34).padEnd(35)} ${status.padEnd(5)} ${(f ?? '').padEnd(28)} ${panelOf(src).padEnd(18)} ${
      f ? String(src.split('\n').length).padStart(4) + ' lines' : ''}  ${tested}`;
    if (!filter || line.toLowerCase().includes(filter) || title.toLowerCase().includes(filter)) rows.push(line);
  }
  if (rows.length) console.log(`\n## ${title}\n${rows.join('\n')}`);
}

// The stylesheet's big sections, so a rule can be found by area.
if (!filter || 'css style'.includes(filter)) {
  console.log('\n## src/style.css sections');
  read('src/style.css').split('\n').forEach((l, i) => {
    const m = l.match(/^\/\* =+ (.+?) =+ \*\/$/) ?? l.match(/^\/\* ---- (.+?) ---- \*\/$/);
    if (m) console.log(`  ${String(i + 1).padStart(5)}  ${m[1]}`);
  });
}
