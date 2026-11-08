/**
 * The linking page: main.o and math.o joined into app.elf one step at a time. Place the sections, give every symbol
 * its address, then fill in each relocation. The model is exported, and verify checks its bytes against LLD's.
 */
import { esc } from '../core/render';
import { CC } from './ccdata';
import { stepButtons, walkthrough, syncUrl } from './dbg';

const L = CC.link;
export const FLASH = 0x08000000, SRAM = 0x20000000;
const FILES = ['main.o', 'math.o'] as const;
type File = (typeof FILES)[number];
const align = (v: number, a: number) => Math.ceil(v / a) * a;
const h8 = (v: number) => `0x${(v >>> 0).toString(16).padStart(8, '0')}`;

/** A BL's offset from its two halfwords (Thumb-2 encoding T1: S, J1, J2, imm10, imm11). */
export function blOffset(hw1: number, hw2: number) {
  const s = (hw1 >> 10) & 1, i1 = 1 - (((hw2 >> 13) & 1) ^ s), i2 = 1 - (((hw2 >> 11) & 1) ^ s);
  const imm = (s << 24) | (i1 << 23) | (i2 << 22) | ((hw1 & 0x3ff) << 12) | ((hw2 & 0x7ff) << 1);
  return (imm << 7) >> 7;
}
/** The two halfwords of a BL with this offset. */
export function blEncode(off: number): [number, number] {
  const s = (off >>> 24) & 1, i1 = (off >> 23) & 1, i2 = (off >> 22) & 1;
  const j1 = (1 - i1) ^ s, j2 = (1 - i2) ^ s;
  return [0xf000 | (s << 10) | ((off >> 12) & 0x3ff), 0xd000 | (j1 << 13) | (j2 << 11) | ((off >> 1) & 0x7ff)];
}
const hw = (h: string) => h.split(' ').map((x) => parseInt(x, 16));
const word = (h: string) => { const b = h.split(' ').map((x) => parseInt(x, 16)); return (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0; };
const wordHex = (v: number) => [0, 8, 16, 24].map((k) => ((v >>> k) & 0xff).toString(16).padStart(2, '0')).join(' ');
const hwHex = (a: number[]) => a.map((x) => x.toString(16).padStart(4, '0')).join(' ');

export interface Patch { file: File; at: number; P: number; type: string; sym: string; S: number; A: number; value: number; before: string; after: string }

/**
 * The link, as LLD does it with the page's linker script: .text from each file in order in Flash, .data in SRAM with
 * its starting values stored in Flash after the code, .bss after .data, then every relocation filled in.
 */
export function linkModel() {
  const base: Record<string, number> = {};
  let flash = FLASH;
  for (const f of FILES) {
    const t = L[f].sections.find((s) => s.name === '.text');
    if (!t) continue;
    flash = align(flash, 4);
    base[`${f}.text`] = flash;
    flash += t.size;
  }
  const textEnd = flash;
  let sram = SRAM, load = align(textEnd, 4);
  const dataLoad: Record<string, number> = {};
  for (const sec of ['.data', '.bss']) for (const f of FILES) {
    const s = L[f].sections.find((x) => x.name === sec);
    if (!s) continue;
    sram = align(sram, 4);
    base[`${f}${sec}`] = sram;
    if (sec === '.data') { dataLoad[f] = load; load += s.size; }
    sram += s.size;
  }
  const syms: { name: string; addr: number; file: File; section: string; func: boolean }[] = [];
  for (const f of FILES) for (const s of L[f].syms) {
    if (s.section === '*UND*') continue;
    syms.push({ name: s.name, addr: base[`${f}${s.section}`] + s.value, file: f, section: s.section, func: s.kind === 'func' });
  }
  const addr = (n: string) => syms.find((s) => s.name === n)!.addr;
  const patches: Patch[] = [];
  for (const f of FILES) for (const r of L[f].relocs) {
    const row = L[f].dis.find((d) => d.at === r.offset)!;
    const P = base[`${f}.text`] + r.offset, S = addr(r.sym);
    if (r.type === 'R_ARM_THM_CALL') {
      const [a, b] = hw(row.hex);
      const A = blOffset(a, b), value = S + A - P;
      patches.push({ file: f, at: r.offset, P, type: r.type, sym: r.sym, S, A, value, before: row.hex, after: hwHex(blEncode(value)) });
    } else if (r.type === 'R_ARM_ABS32') {
      const A = word(row.hex), value = (S + A) >>> 0;
      patches.push({ file: f, at: r.offset, P, type: r.type, sym: r.sym, S, A, value, before: row.hex, after: wordHex(value) });
    } else throw new Error(`no model for ${r.type}`);
  }
  /** The finished .text, row by row, as objdump would list it. */
  const rows = FILES.flatMap((f) => L[f].dis.map((d) => {
    const p = patches.find((x) => x.file === f && x.at === d.at);
    return { addr: base[`${f}.text`] + d.at, hex: p ? p.after : d.hex, file: f };
  }));
  return { base, dataLoad, textEnd, syms, patches, rows };
}

const M = linkModel();
const STEPS = 5 + M.patches.length;
const relocText = (t: string) => (t === 'R_ARM_THM_CALL' ? 'a BL call' : 'a 32-bit address');

export function mountLinking(root: HTMLElement) {
  let step = Math.max(0, Math.min(STEPS - 1, Number(new URLSearchParams(location.search).get('step')) || 0));

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">The build</p>
      <h1>Linking</h1>
      <p>Two object files go in; one program comes out. The linker decides where every section lives, works out the
        address of every symbol, and then goes back and fills in each blank the compiler left. Step through it.</p>
    </section>
    <section class="debugger cc lnk" aria-label="Linker">
      <header class="dbg-bar"><span class="dbg-file">ld.lld -T link.ld main.o math.o</span><div class="dbg-controls">${stepButtons()}</div></header>
      <div class="dbg-body cc-body">
        <div class="cc-pane"><p class="cc-head">Inputs</p><div class="cc-rich lnk-in"></div></div>
        <div class="cc-pane"><p class="cc-head">app.elf</p><div class="cc-rich lnk-out"></div></div>
      </div>
      <p class="dbg-status cc-status" aria-live="polite"></p>
    </section>
    <section class="prose">
      <h2>The program</h2>
      <p><code>main.c</code> calls <code>add</code> and reads <code>counter</code>, both defined in
        <code>math.c</code>; it defines <code>total</code> itself. Compiled separately, each file is a
        <a href="?p=objects" data-nav>relocatable object</a> whose addresses start at 0, with three blanks in
        <code>main.o</code>. The linker script, on the <a href="?p=linker-script" data-nav>next page</a>, says that
        Flash starts at 0x08000000 and SRAM at 0x20000000.</p>
      <h2>Filling in a call</h2>
      <p>A Thumb <code>bl</code> does not hold the address it calls; it holds the distance from itself. The processor
        adds that to the address of the <code>bl</code> plus 4 (the pipeline has already moved on). In the object file
        the field holds −4, so the target would be the <code>bl</code> itself; the linker adds the real distance:
        value = S + A − P, where S is the symbol’s address, A the −4 already there, and P the address of the
        <code>bl</code>. Then it re-encodes the result across the instruction’s two halfwords, split into fields named S, J1,
        J2, imm10 and imm11.</p>
      <p>The distance must fit in 25 bits, ±16 MiB, which always holds within a microcontroller’s Flash. On larger
        chips the linker adds a small stub, a <em>veneer</em>, to reach further.</p>
      <h2>Filling in an address</h2>
      <p>The addresses of <code>counter</code> and <code>total</code> are stored after main’s code, where
        <code>ldr</code> loads them from. An <code>R_ARM_ABS32</code> relocation is simpler: write the symbol’s
        address, S + A, as four little-endian bytes. A function’s address would also get its lowest bit set, which
        tells the processor the target is Thumb code.</p>
      <h2>Load address and run address</h2>
      <p><code>counter</code> runs at 0x20000000 in SRAM, but SRAM is empty at power-up. So the linker stores its
        starting value, 40, in Flash right after the code, at its <em>load address</em>, and the startup code copies
        it over before <code>main</code>. <code>total</code>, in <code>.bss</code>, needs no copy: startup fills it
        with zero.</p>
    </section>`;

  const panel = root.querySelector<HTMLElement>('.lnk')!;

  function input(f: File) {
    const o = L[f];
    const patch = M.patches[step - 5];
    const rows = o.dis.map((d) => {
      const r = o.relocs.find((x) => x.offset === d.at);
      const lit = (step === 1 || (patch && patch.file === f && patch.at === d.at)) ? ' on' : '';
      const t = r ? (r.type === 'R_ARM_THM_CALL' ? `bl <b>${r.sym}</b> ?` : `.word <b>&amp;${r.sym}</b> ?`) : esc(d.t.replace(/ <.*>$/, ''));
      return `<tr class="ln${lit}${r ? ' blank' : ''}"><td>${(d.at).toString(16).padStart(2, '0')}</td><td class="cc-hexcell">${d.hex}</td><td>${t}</td></tr>`;
    }).join('');
    const data = o.sections.filter((s) => s.name !== '.text').map((s) => {
      const sym = o.syms.find((x) => x.section === s.name)!;
      const b = (o.bytes as Record<string, string>)[s.name];
      const lit = (step === 2 && s.name === '.data') || (step === 3 && s.name === '.bss') ? ' on' : '';
      return `<tr class="ln${lit}"><td>${s.name}</td><td class="cc-hexcell">${b ? (b.match(/../g) ?? []).join(' ') : `${s.size} bytes`}</td><td>${sym.name}</td></tr>`;
    }).join('');
    const und = o.syms.filter((s) => s.section === '*UND*').map((s) => s.name);
    return `<h4>${f}${und.length ? ` <span class="cc-dim">needs ${und.join(', ')}</span>` : ''}</h4>
      <table class="cc-dis"><tbody>${rows}${data}</tbody></table>`;
  }

  function output() {
    if (step === 0) return '<p class="cc-empty">Nothing placed yet.</p>';
    const done = M.patches.slice(0, Math.max(0, step - 4));
    const cur = M.patches[step - 5];
    const text = M.rows.map((r) => {
      const d = L[r.file].dis.find((x) => M.base[`${r.file}.text`] + x.at === r.addr)!;
      const p = M.patches.find((x) => x.file === r.file && M.base[`${r.file}.text`] + x.at === r.addr);
      const fixed = p && done.includes(p);
      const final = L['app.elf'].dis.find((x) => x.at === r.addr)!;
      const t = p ? (fixed ? esc(final.t.replace(/ <(\w+)>$/, ' ; $1')) : `${p.type === 'R_ARM_THM_CALL' ? 'bl' : '.word'} <b>${p.type === 'R_ARM_THM_CALL' ? '' : '&amp;'}${p.sym}</b> ?`) : esc(d.t.replace(/ <.*>$/, ''));
      return `<tr class="ln${p ? (fixed ? ' fixed' : ' blank') : ''}${cur === p && p ? ' on' : step === 1 ? ' on' : ''}"><td>${r.addr.toString(16)}</td><td class="cc-hexcell">${fixed ? p!.after : d.hex}</td><td>${t}</td></tr>`;
    }).join('');
    const data = step >= 2 ? `<tr class="ln${step === 2 ? ' on' : ''}"><td>${M.dataLoad['math.o'].toString(16)}</td><td class="cc-hexcell">28 00 00 00</td><td>counter = 40</td></tr>` : '';
    const sram = step >= 2 ? `<h4>SRAM</h4><table class="cc-dis"><tbody>
      <tr class="ln${step === 2 ? ' on' : ''}"><td>${M.base['math.o.data'].toString(16)}</td><td class="cc-hexcell">4 bytes</td><td>counter, copied at reset</td></tr>
      ${step >= 3 ? `<tr class="ln${step === 3 ? ' on' : ''}"><td>${M.base['main.o.bss'].toString(16)}</td><td class="cc-hexcell">4 bytes</td><td>total, zeroed at reset</td></tr>` : ''}
      </tbody></table>` : '';
    const syms = step >= 4 ? `<h4>Symbols</h4><table class="cc-dis"><tbody>${M.syms.map((s) =>
      `<tr class="ln${step === 4 || (cur && cur.sym === s.name) ? ' on' : ''}"><td>${s.addr.toString(16)}</td><td>${s.name}</td><td class="cc-dim">${s.file} ${s.section}</td></tr>`).join('')}</tbody></table>` : '';
    return `<h4>Flash</h4><table class="cc-dis"><tbody>${text}${data}</tbody></table>${sram}${syms}`;
  }

  function say() {
    if (step === 0) return 'Two object files, each starting at address 0. main.o has three blanks, marked with a dashed outline: a call to add and the addresses of counter and total. It cannot know any of them yet.';
    if (step === 1) return `Place <code>.text</code>: main.o’s ${L['main.o'].sections[0].size} bytes at the start of Flash, ${h8(FLASH)}, then math.o’s ${L['math.o'].sections[0].size} bytes right after, at ${h8(M.base['math.o.text'])}.`;
    if (step === 2) return `Place <code>.data</code>: counter runs from SRAM at ${h8(M.base['math.o.data'])}, but its starting value, 40 (28 00 00 00), is stored in Flash after the code, at ${h8(M.dataLoad['math.o'])}. Startup copies it across.`;
    if (step === 3) return `Place <code>.bss</code>: total at ${h8(M.base['main.o.bss'])}, after counter. It takes no Flash; startup clears it to zero.`;
    if (step === 4) return 'Every section has an address, so every symbol does: its section’s address plus its offset. The linker now resolves each name main.o asked for.';
    const p = M.patches[step - 5];
    if (p.type === 'R_ARM_THM_CALL') return `The call at ${h8(p.P)}: value = S + A − P = ${h8(p.S)} − 4 − ${h8(p.P)} = ${h8(p.value)}. Encoded as a BL, <code>${p.before}</code> becomes <code>${p.after}</code>: branch to ${h8(p.P)} + 4 + 0x${p.value.toString(16)} = ${h8(p.P + 4 + p.value)}, add.${step === STEPS - 1 ? ' Done.' : ''}`;
    return `${relocText(p.type)[0].toUpperCase()}${relocText(p.type).slice(1)} at ${h8(p.P)}: write ${p.sym}’s address, ${h8(p.value)}, low byte first: <code>${p.after}</code>.${step === STEPS - 1 ? ' Done: these are the same bytes LLD wrote to app.elf.' : ''}`;
  }

  const walk = walkthrough(root, { count: () => STEPS, at: () => step, go: (i) => { step = i; draw(); } });
  function draw() {
    panel.querySelector('.lnk-in')!.innerHTML = FILES.map(input).join('');
    panel.querySelector('.lnk-out')!.innerHTML = output();
    panel.querySelector('.cc-status')!.innerHTML = say();
    walk.sync();
    syncUrl({ step: String(step) });
  }
  draw();
}
