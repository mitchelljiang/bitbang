/**
 * Exports the text of every page into an Obsidian vault at ./obsidian, one markdown file per page, organised by
 * section. Each file has frontmatter naming the page id and its source file, so edits made in Obsidian can be traced
 * back to the TypeScript they came from. Run with the built site served on http://localhost:4321.
 *
 *   npm run build && (python3 -m http.server 4321 -d dist &) && node scripts/export-obsidian.mjs
 *
 * This is a one-way export for editing; applying edits back to src is done by hand, guided by the `source:` field.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(process.cwd(), 'obsidian');
const URL = 'http://localhost:4321';

// id -> source file, for the frontmatter.
const PROTO_FILE = { '100base': 'fast', '1000baset': 'gigt', '1000basex': 'gigx', rmii: 'mii' };
const TOPIC_FILE = {
  binary: 'numbers', twos: 'numbers', fixed: 'numbers', float: 'numbers', bitwise: 'bitwise',
  shifts: 'ops', masks: 'ops', rmw: 'ops', endianness: 'ops', tricks: 'tricks', flags: 'flags', crc: 'crc',
  bufover: 'bufover', stack: 'thestack', calls: 'calls', heap: 'heap', mmio: 'mmio', alignment: 'alignment', interrupts: 'interrupts',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (s) => s.toLowerCase().replace(/²/g, '2').replace(/³/g, '3').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function connect() {
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ['--headless=new', '--remote-debugging-port=9334', '--user-data-dir=/tmp/obs-prof', 'about:blank'], { stdio: 'ignore' });
  let ws;
  for (let i = 0; i < 150; i++) {
    try { const t = await (await fetch('http://127.0.0.1:9334/json')).json(); const p = t.find((x) => x.url === 'about:blank'); if (p) { ws = new WebSocket(p.webSocketDebuggerUrl); break; } } catch {}
    await sleep(200);
  }
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (pending.has(m.id)) { pending.get(m.id)(m.result ?? m.error); pending.delete(m.id); } });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalJson = async (expr) => (await send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression: expr })).result.value;
  return { chrome, send, evalJson };
}

/** Runs in the page: reads the visible page into a structured object of its text. */
const EXTRACT = `(() => {
  const txt = (el) => el ? el.textContent.replace(/\\s+/g, ' ').trim() : '';
  const main = [...document.querySelectorAll('main')].find((m) => !m.hidden);
  const page = main ? main.id : 'home';
  const out = { page, title: txt(document.querySelector(main ? '#' + main.id + ' h1' : '.hero h1')) };
  const proseFrom = (sel) => [...document.querySelectorAll(sel)].flatMap((sec) => {
    const parts = [];
    for (const n of sec.children) {
      const t = n.tagName;
      if (t === 'H2' || t === 'H3') parts.push({ h: txt(n), level: t === 'H2' ? 2 : 3 });
      else if (t === 'P') parts.push({ p: txt(n) });
      else if (t === 'UL' || t === 'OL') parts.push({ list: [...n.children].map((li) => txt(li)) });
      else if (t === 'PRE') parts.push({ code: n.textContent.replace(/\\n+$/,'') });
      else if (t === 'TABLE') parts.push({ table: [...n.querySelectorAll('tr')].map((tr) => [...tr.children].map((c) => txt(c))) });
    }
    return parts;
  });
  if (page === 'viz') {
    out.kind = 'protocol';
    out.crumbs = txt(document.querySelector('#crumb-cat'));
    out.full = txt(document.querySelector('#proto-full'));
    out.summary = txt(document.querySelector('#proto-summary'));
    out.usedIn = txt(document.querySelector('#proto-used'));
    out.tags = [...document.querySelectorAll('#proto-tags .tag-chip')].map(txt);
    out.glance = [...document.querySelectorAll('#glance dt')].map((dt, i) => [txt(dt), txt(document.querySelectorAll('#glance dd')[i])]);
    out.strengths = [...document.querySelectorAll('#strengths li')].map(txt);
    out.limits = [...document.querySelectorAll('#limits li')].map(txt);
    out.settings = [...document.querySelectorAll('#controls .ctl')].map((c) => [txt(c.querySelector('label')), txt(c.querySelector('.ctl-help'))]).filter((x) => x[0]);
    const extra = document.querySelector('#extra'); out.extra = extra && !extra.hidden ? { title: txt(document.querySelector('#extra-title')), intro: txt(document.querySelector('#extra-intro')) } : null;
    out.deep = [...document.querySelectorAll('#deep-body section')].map((sec) => ({ h: txt(sec.querySelector('h3')), body: [...sec.querySelectorAll('p')].map(txt) }));
  } else {
    out.kind = page === 'guide' ? 'guide' : page === 'about' ? 'about' : page === 'home' ? 'home' : 'topic';
    out.crumbs = txt(document.querySelector(main ? '#' + main.id + ' .crumbs' : null));
    if (page === 'home') { out.intro = [txt(document.querySelector('.hero p'))]; out.prose = []; return out; }
    const introSel = '#' + main.id + ' > .intro > p:not(.crumbs):not(.fullname):not(.used):not(.tags), #' + main.id + ' > header.intro > p:not(.crumbs)';
    out.intro = [...document.querySelectorAll(introSel)].map(txt);
    out.prose = proseFrom('#' + main.id + ' .prose, #' + main.id + ' .guide > section, #' + main.id + ' .about section, #' + main.id + ' > section:not(.intro):not(.debugger):not(.trace):not(.board):not(.diagram)');
    if (!out.prose.length) out.prose = proseFrom('#' + main.id + ' section');
  }
  return out;
})()`;

function body(parts) {
  const md = [];
  for (const p of parts) {
    if (p.h) md.push((p.level === 3 ? '### ' : '## ') + p.h);
    else if (p.p) md.push(p.p);
    else if (p.list) md.push(p.list.map((x) => '- ' + x).join('\n'));
    else if (p.code) md.push('```c\n' + p.code + '\n```');
    else if (p.table) md.push(p.table.map((r, i) => '| ' + r.join(' | ') + ' |' + (i === 0 ? '\n| ' + r.map(() => '---').join(' | ') + ' |' : '')).join('\n'));
  }
  return md.join('\n\n');
}

function toMarkdown(d, meta) {
  const fm = ['---', `id: ${d.page === 'home' ? 'home' : meta.id}`, `title: ${JSON.stringify(d.title)}`,
    `section: ${meta.section}`, meta.group ? `group: ${meta.group}` : '', `source: ${meta.source}`, `url: ${meta.url}`, '---', ''].filter((x) => x !== '');
  const lines = [...fm, `# ${d.title}`];
  if (d.full) lines.push(`*${d.full}*`);
  if (d.kind === 'protocol') {
    lines.push('', '## Summary', d.summary, '', '## Used in', d.usedIn);
    if (d.tags?.length) lines.push('', `**Tags:** ${d.tags.join(', ')}`);
    if (d.glance?.length) lines.push('', '## At a glance', d.glance.map(([k, v]) => `- **${k}:** ${v}`).join('\n'));
    if (d.strengths?.length) lines.push('', '## Strengths', d.strengths.map((s) => `- ${s}`).join('\n'));
    if (d.limits?.length) lines.push('', '## Limits', d.limits.map((s) => `- ${s}`).join('\n'));
    if (d.settings?.length) lines.push('', '## Settings', d.settings.map(([k, v]) => `- **${k}** — ${v}`).join('\n'));
    if (d.extra) lines.push('', `## ${d.extra.title}`, d.extra.intro);
    if (d.deep?.length) lines.push('', '## Going deeper', ...d.deep.flatMap((s) => [`### ${s.h}`, ...s.body]));
  } else {
    if (d.intro?.length) lines.push('', '## Intro', ...d.intro);
    if (d.prose?.length) { lines.push(''); lines.push(body(d.prose)); }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}

(async () => {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const { chrome, send, evalJson } = await connect();
  await send('Page.enable');
  const go = async (q) => { await send('Page.navigate', { url: `${URL}/${q}` }); await sleep(900); };

  // Build the page list from the sidebars of each section.
  const sections = [];
  await go('?p=uart');
  const tabs = await evalJson(`[...document.querySelectorAll('#tabs a')].map((a) => ({ name: a.querySelector('.long').textContent, href: a.getAttribute('href') }))`);
  for (const tab of tabs) {
    await go(tab.href);
    const groups = await evalJson(`[...document.querySelectorAll('.side-nav .side-group')].map((g) => ({ group: g.querySelector('h3').textContent, pages: [...g.querySelectorAll('a[data-nav]:not(.wip)')].map((a) => ({ id: new URL(a.href).searchParams.get('p'), name: a.textContent.trim() })) }))`);
    sections.push({ section: tab.name, groups });
  }

  const index = [`# bitbang text\n`,
    `The text of every page, exported from the site for editing. The \`source:\` field in each note names the TypeScript it came from.\n`,
    `> **Workflow.** Edit the prose in these notes, then ask Claude to "pull text from obsidian" and it will apply your changes to the \`source:\` files. Re-running \`npm run export-text\` regenerates these notes from \`src\` and overwrites them, so pull your edits in first.\n`];
  const srcOf = (id, kind) => kind === 'protocol' ? `src/protocols/${PROTO_FILE[id] ?? id}.ts` : TOPIC_FILE[id] ? `src/topics/${TOPIC_FILE[id]}.ts` : id === 'basics' ? 'src/guide.ts' : id === 'about' ? 'src/about.ts' : `src/topics/${id}.ts`;

  for (const { section, groups } of sections) {
    const dir = join(OUT, slug(section));
    mkdirSync(dir, { recursive: true });
    index.push(`## ${section}`);
    for (const { group, pages } of groups) {
      for (const { id } of pages) {
        if (id === 'basics') continue;
        await go(`?p=${id}`);
        const d = await evalJson(EXTRACT);
        const meta = { id, section, group, source: srcOf(id, d.kind), url: `?p=${id}` };
        const file = `${slug(d.title)}.md`;
        writeFileSync(join(dir, file), toMarkdown(d, meta));
        index.push(`- [[${slug(d.title)}|${d.title}]] — ${group}`);
      }
    }
    index.push('');
  }

  // The guide, About and the home page.
  mkdirSync(join(OUT, 'pages'), { recursive: true });
  index.push('## Other pages');
  for (const [q, id, section] of [['?p=basics', 'basics', 'Pages'], ['?p=about', 'about', 'Pages'], ['', 'home', 'Pages']]) {
    await go(q);
    const d = await evalJson(EXTRACT);
    const meta = { id, section, group: '', source: srcOf(id, d.kind), url: q || './' };
    writeFileSync(join(OUT, 'pages', `${slug(d.title)}.md`), toMarkdown(d, meta));
    index.push(`- [[${slug(d.title)}|${d.title}]]`);
  }

  writeFileSync(join(OUT, 'README.md'), index.join('\n') + '\n');
  chrome.kill();
  console.log('Exported to', OUT);
  process.exit(0);
})();
