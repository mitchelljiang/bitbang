/**
 * The object files page: sensor.c beside what `clang -c` made of it, read back with objdump: the sections and their
 * bytes, the symbol table, and the relocations the linker must fill in. Click any part to see what it is and what it
 * is linked to.
 */
import { esc } from '../core/render';
import { CC } from './ccdata';
import { highlight } from './dbg';

const O = CC.object;
const SRC = CC.src.obj.split('\n');
const hex = (n: number) => `0x${n.toString(16).padStart(2, '0')}`;
const spaced = (h: string) => (h.match(/../g) ?? []).join(' ');
/** The line where a symbol is declared: the first that names it. */
export const declLine = (name: string) => SRC.findIndex((l) => new RegExp(`\\b${name}\\b`).test(l)) + 1;
const SECTION_SAYS: Record<string, string> = {
  '.text': 'Code. It will go in Flash.',
  '.data': 'Variables with a starting value. The values are stored in the file; at startup they are copied from Flash to SRAM.',
  '.rodata': '<code>const</code> data. It stays in Flash and is read from there.',
  '.bss': 'Variables that start at zero. The file stores only the size; startup fills that much SRAM with zeros.',
};
const RELOC_SAYS: Record<string, string> = {
  R_ARM_THM_CALL: 'patch this <code>bl</code> so it reaches',
  R_ARM_ABS32: 'write the full 32-bit address of',
};

type Pick = { k: 'src' | 'sec' | 'sym' | 'rel'; v: string } | null;

export function mountObjects(root: HTMLElement) {
  let pick: Pick = null;

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">The build</p>
      <h1>Object files</h1>
      <p>Compiling one <code>.c</code> file gives one <code>.o</code> file: machine code that is not yet a program.
        It sorts everything into sections, names what it defines and what it needs in a symbol table, and leaves
        blanks wherever an address is not known yet, each with a note, a <em>relocation</em>, saying what belongs
        there. This is <code>sensor.o</code> as objdump reads it. Click any part.</p>
    </section>
    <section class="debugger cc objs" aria-label="Object file">
      <header class="dbg-bar"><span class="dbg-file">sensor.c</span><div class="dbg-controls"><span class="cc-cmd">clang -Os -c sensor.c</span></div></header>
      <div class="dbg-body cc-body">
        <div class="cc-pane"><p class="cc-head">sensor.c</p><pre class="dbg-code cc-src" aria-label="C source"><code></code></pre></div>
        <div class="cc-pane"><p class="cc-head">sensor.o</p><div class="cc-rich"></div></div>
      </div>
      <p class="dbg-status cc-status" aria-live="polite"></p>
    </section>
    <section class="prose">
      <h2>Sections</h2>
      <p>The compiler sorts by what the linker and the startup code must do with each thing. Code goes in
        <code>.text</code>, and <code>const</code> data in <code>.rodata</code>; both stay in Flash. A variable with
        a starting value goes in <code>.data</code>: it lives in SRAM, but its starting value must be kept in Flash
        and copied at reset. A variable that starts at zero goes in <code>.bss</code>, which costs no Flash at all,
        only a size. The <a href="?p=sections" data-nav>startup</a> page runs that copy and clear.</p>
      <p><code>scale</code> is missing. It is <code>static</code>, so no other file can change it, and nothing in this
        one does, so the compiler used the value 3 directly: <code>movs r1, #3</code>. Neither the variable nor its
        symbol survives.</p>
      <h2>Symbols</h2>
      <p>The symbol table lists every name the file defines, with its section, offset and size, and every name it uses
        but does not define, marked undefined (<code>*UND*</code>). Global symbols can be seen by other files;
        <code>static</code> ones are local and cannot clash with a name elsewhere. When the linker finds two global
        definitions of the same name, or none, that is the familiar “multiple definition” or “undefined reference”
        error.</p>
      <h2>Relocations</h2>
      <p>The call to <code>read_adc</code> is encoded as <code>f7ff fffe</code>: a <code>bl</code> with a placeholder
        offset, since read_adc could be anywhere. The addresses of <code>count</code> and <code>last</code>, stored
        after the code for <code>ldr</code> to load, are zero for now. Each blank has a relocation naming the symbol
        and how to fill it in. Every address in the file also starts at 0: the <a href="?p=linking" data-nav>linker</a>
        decides where each section goes, then works through the relocations.</p>
      <p>To look inside an object yourself: <code>arm-none-eabi-objdump -h -t -r -d sensor.o</code>, or
        <code>nm sensor.o</code> for just the symbols.</p>
    </section>`;

  const panel = root.querySelector<HTMLElement>('.objs')!;

  /** What the pick relates to: source lines, sections, symbols, relocations and .text offsets to light up. */
  function related(p: Pick) {
    const r = { src: new Set<number>(), sec: new Set<string>(), sym: new Set<string>(), rel: new Set<number>(), at: new Set<number>() };
    if (!p) return r;
    const addSym = (name: string) => {
      const s = O.syms.find((x) => x.name === name);
      if (!s) return;
      r.sym.add(name);
      r.src.add(declLine(name));
      if (s.section !== '*UND*') r.sec.add(s.section);
      O.relocs.forEach((x, i) => { if (x.sym === name) { r.rel.add(i); r.at.add(x.offset); } });
    };
    if (p.k === 'sym') addSym(p.v);
    if (p.k === 'sec') { r.sec.add(p.v); O.syms.filter((s) => s.section === p.v).forEach((s) => { r.sym.add(s.name); r.src.add(declLine(s.name)); }); }
    if (p.k === 'rel') { const x = O.relocs[Number(p.v)]; r.rel.add(Number(p.v)); r.at.add(x.offset); r.sym.add(x.sym); r.src.add(declLine(x.sym)); }
    if (p.k === 'src') {
      r.src.add(Number(p.v));
      O.syms.filter((s) => declLine(s.name) === Number(p.v)).forEach((s) => addSym(s.name));
    }
    return r;
  }

  function say(p: Pick) {
    if (!p) return `${O.sections.length} sections, ${O.syms.length} symbols and ${O.relocs.length} relocations. Every offset starts at 0, and three places are still blank.`;
    if (p.k === 'sec') {
      const s = O.sections.find((x) => x.name === p.v)!;
      return `<code>${p.v}</code>, ${s.size} bytes. ${SECTION_SAYS[p.v] ?? ''}`;
    }
    if (p.k === 'rel') {
      const x = O.relocs[Number(p.v)];
      return `At offset ${hex(x.offset)} in .text, ${x.type}: ${RELOC_SAYS[x.type] ?? 'fill in'} <code>${esc(x.sym)}</code>. The bytes there are a placeholder until the linker knows where ${esc(x.sym)} is.`;
    }
    const name = p.k === 'sym' ? p.v : O.syms.find((s) => declLine(s.name) === Number(p.v))?.name;
    const s = O.syms.find((x) => x.name === name);
    if (!s) {
      const n = Number(p.v);
      if (/scale/.test(SRC[n - 1])) return '<code>scale</code> left nothing in the file. It is static and never changes, so the compiler put the 3 straight into the code.';
      return n > 9 ? 'Code inside <code>sensor_read</code>, so part of the 36 bytes of .text.' : 'This line does not make anything in the object file.';
    }
    if (s.section === '*UND*') return `<code>${s.name}</code> is used here but defined in another file, so it is undefined (*UND*). The call to it is a relocation for the linker.`;
    return `<code>${s.name}</code>: a ${s.bind} ${s.kind === 'func' ? 'function' : 'variable'} in <code>${s.section}</code> at offset ${hex(s.value)}, ${s.size} bytes. ${SECTION_SAYS[s.section] ?? ''}`;
  }

  function draw() {
    const r = related(pick);
    const on = (yes: boolean) => (yes ? ' on' : '');
    const self = (k: string, v: string) => (pick && pick.k === k && pick.v === v ? ' self' : '');
    panel.classList.toggle('picked', !!pick);
    panel.querySelector('.cc-src code')!.innerHTML = SRC.map((t, k) =>
      `<span class="ln${on(r.src.has(k + 1))}${self('src', String(k + 1))}" data-k="src" data-v="${k + 1}"><span class="gutter">${k + 1}</span>${highlight(t) || ' '}</span>`).join('');
    const sections = O.sections.map((s) => {
      const b = CC.object.bytes[s.name as keyof typeof CC.object.bytes] as string | undefined;
      return `<tr class="ln${on(r.sec.has(s.name))}${self('sec', s.name)}" data-k="sec" data-v="${s.name}"><td><code>${s.name}</code></td><td>${s.size}</td><td class="cc-hexcell">${s.name === '.text' ? 'code, below' : b ? spaced(b) : '<i>size only</i>'}</td></tr>`;
    }).join('');
    const syms = O.syms.map((s) => `<tr class="ln${on(r.sym.has(s.name))}${self('sym', s.name)}" data-k="sym" data-v="${s.name}"><td><code>${s.name}</code></td><td>${s.section === '*UND*' ? '<i>undefined</i>' : s.section}</td><td>${s.section === '*UND*' ? '' : hex(s.value)}</td><td>${s.size || ''}</td><td>${s.bind}</td></tr>`).join('');
    const rels = O.relocs.map((x, i) => `<tr class="ln${on(r.rel.has(i))}${self('rel', String(i))}" data-k="rel" data-v="${i}"><td>${hex(x.offset)}</td><td>${x.type}</td><td><code>${x.sym}</code></td></tr>`).join('');
    const code = O.dis.map((d) => {
      const rel = O.relocs.findIndex((x) => x.offset === d.at);
      return `<tr class="ln${on(r.at.has(d.at))}${rel >= 0 ? ' blank' : ''}"${rel >= 0 ? ` data-k="rel" data-v="${rel}"` : ''}><td>${hex(d.at)}</td><td class="cc-hexcell">${d.hex}</td><td>${esc(d.t.replace(/ <.*>$/, ''))}</td></tr>`;
    }).join('');
    panel.querySelector('.cc-rich')!.innerHTML = `
      <h4>Sections</h4><table><thead><tr><th>Name</th><th>Bytes</th><th>Contents</th></tr></thead><tbody>${sections}</tbody></table>
      <h4>Symbols</h4><table><thead><tr><th>Name</th><th>Section</th><th>Offset</th><th>Size</th><th>Bind</th></tr></thead><tbody>${syms}</tbody></table>
      <h4>Relocations</h4><table><thead><tr><th>Offset</th><th>Type</th><th>Symbol</th></tr></thead><tbody>${rels}</tbody></table>
      <h4>.text</h4><table class="cc-dis"><tbody>${code}</tbody></table>`;
    panel.querySelector('.cc-status')!.innerHTML = say(pick);
  }

  panel.addEventListener('click', (e) => {
    const l = (e.target as Element).closest<HTMLElement>('[data-k]');
    if (!l) return;
    const next = { k: l.dataset.k as NonNullable<Pick>['k'], v: l.dataset.v! };
    pick = pick && pick.k === next.k && pick.v === next.v ? null : next;
    draw();
  });
  draw();
}
