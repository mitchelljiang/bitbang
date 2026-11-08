/**
 * The linker scripts page: link.ld beside the two memory regions it describes, with the sections LLD placed in them
 * for three versions of a program, the last of which does not fit. The placement model is exported; verify checks it
 * against LLD for these programs and for random section sizes.
 */
import { esc } from '../core/render';
import { CC } from './ccdata';
import { markSeg, oneOf, seg, syncUrl } from './dbg';

export const REGIONS = { FLASH: { origin: 0x08000000, length: 64 * 1024 }, SRAM: { origin: 0x20000000, length: 20 * 1024 } };
export type Sec = '.text' | '.rodata' | '.data' | '.bss';
const ORDER: Sec[] = ['.text', '.rodata', '.data', '.bss'];
const up = (v: number, a: number) => Math.ceil(v / a) * a;

/**
 * Where the script puts each section, as LLD does: .text then .rodata in Flash; .data runs in SRAM but is loaded into
 * Flash after .rodata; .bss follows .data in SRAM. Each starts at its alignment. Returns LLD's error if a region
 * overflows, naming the first section that ends past it.
 */
export function place(sizes: Partial<Record<Sec, number>>, align: Partial<Record<Sec, number>>) {
  const out: { name: Sec; vma: number; lma: number; size: number }[] = [];
  let flash = REGIONS.FLASH.origin, sram = REGIONS.SRAM.origin;
  let error: string | undefined;
  const check = (name: Sec, region: keyof typeof REGIONS, end: number) => {
    const r = REGIONS[region], over = end - (r.origin + r.length);
    if (over > 0 && !error) error = `section '${name}' will not fit in region '${region}': overflowed by ${over} bytes`;
  };
  for (const name of ORDER) {
    const size = sizes[name];
    if (!size) continue;
    const a = align[name] ?? 1;
    if (name === '.text' || name === '.rodata') {
      flash = up(flash, a);
      out.push({ name, vma: flash, lma: flash, size });
      flash += size;
      check(name, 'FLASH', flash);
    } else {
      sram = up(sram, a);
      const lma = name === '.data' ? up(flash, a) : sram;
      out.push({ name, vma: sram, lma, size });
      sram += size;
      check(name, 'SRAM', sram);
      if (name === '.data') { flash = lma + size; check(name, 'FLASH', flash); }
    }
  }
  return { placed: out, error };
}

const PROGS = ['blink', 'table', 'buffer'] as const;
type Prog = (typeof PROGS)[number];
const PROG_SAYS: Record<Prog, string> = {
  blink: 'A small program: 28 bytes of code, a string, one initialized variable and one zeroed one.',
  table: 'The same program with <code>const uint16_t sine[4096]</code>: 8 KiB more <code>.rodata</code>, all in Flash. SRAM is unchanged.',
  buffer: 'The same program with <code>uint8_t frame[24 * 1024]</code>: 24 KiB of <code>.bss</code>, more than the 20 KiB of SRAM. LLD refuses to link it.',
};
const LINE_SAYS: [RegExp, string][] = [
  [/^MEMORY/, 'MEMORY names the chip’s memory regions, from its datasheet.'],
  [/FLASH \(rx\)/, 'Flash: 64 KiB from 0x08000000, readable and executable (rx). Code and constants go here.'],
  [/SRAM\s+\(rwx\)/, 'SRAM: 20 KiB from 0x20000000, readable, writable and executable. Variables and the stack go here.'],
  [/^SECTIONS/, 'SECTIONS lists the output sections in order, what goes into each, and where.'],
  [/\.text\s+:/, '.text collects every input section named .text or .text.something from every object, and places it in Flash.'],
  [/\.rodata\s+:/, '.rodata, the const data, follows the code in Flash.'],
  [/\.data\s+:/, '.data runs in SRAM (> SRAM) but is stored in Flash (AT > FLASH): its run address and load address differ. Startup copies it across.'],
  [/\.bss\s+:/, '.bss goes in SRAM after .data. It has no contents, so it takes no Flash.'],
  [/DISCARD/, '/DISCARD/ throws away input sections the program does not need, here the stack-unwinding tables C++ exceptions use.'],
];
const SEC_OF: [RegExp, Sec | 'FLASH' | 'SRAM'][] = [[/FLASH \(rx\)/, 'FLASH'], [/SRAM\s+\(rwx\)/, 'SRAM'], [/\.text\s+:/, '.text'], [/\.rodata\s+:/, '.rodata'], [/\.data\s+:/, '.data'], [/\.bss\s+:/, '.bss']];
const kib = (n: number) => (n >= 1024 ? `${(n / 1024).toFixed(n % 1024 ? 1 : 0)} KiB` : `${n} B`);
const h8 = (v: number) => `0x${v.toString(16).padStart(8, '0')}`;

export function mountLinkerScript(root: HTMLElement) {
  let prog = oneOf('prog', PROGS, 'blink');
  let line = 0;
  const script = CC.src.ld.split('\n');

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">The image</p>
      <h1>Linker scripts</h1>
      <p>The linker does not know your chip. A linker script tells it where the memory is and which sections go where.
        This is a minimal one for a chip with 64 KiB of Flash and 20 KiB of SRAM. Pick a program to link, and click
        a line of the script to see what it places.</p>
    </section>
    <section class="debugger cc lds" aria-label="Linker script">
      <header class="dbg-bar"><span class="dbg-file">link.ld</span><div class="dbg-controls">${seg('prog', 'Program', [['blink', 'Blink'], ['table', '+ 8 KiB table'], ['buffer', '+ 24 KiB buffer']])}</div></header>
      <div class="dbg-body cc-body">
        <div class="cc-pane"><p class="cc-head">link.ld</p><pre class="dbg-code cc-src" aria-label="Linker script"><code></code></pre></div>
        <div class="cc-pane"><p class="cc-head">ld.lld -T link.ld</p><div class="cc-rich lds-out"></div></div>
      </div>
      <p class="dbg-status cc-status" aria-live="polite"></p>
    </section>
    <section class="prose">
      <h2>Memory, then sections</h2>
      <p>The <code>MEMORY</code> block copies the chip’s memory map from its datasheet: each region’s name, start
        and size. The <code>SECTIONS</code> block then builds the output file’s sections in order. Each line says
        which input sections to collect, with wildcards: <code>*(.text*)</code> means the <code>.text</code> sections,
        and any named <code>.text.something</code>, of every object file. <code>&gt; FLASH</code> says which region
        it runs in. Sections fill a region in order, each aligned as its contents need.</p>
      <h2>Two addresses for .data</h2>
      <p>A variable like <code>uint32_t period = 500</code> must be in SRAM to be written, but SRAM forgets
        everything at power-off. So <code>.data</code> has two addresses: a run address, its <em>VMA</em>, in SRAM,
        and a load address, its <em>LMA</em>, in Flash, given by <code>AT &gt; FLASH</code>. The 500 is stored at the
        LMA; the code uses the VMA. Startup copies one to the other before <code>main</code>, as the
        <a href="?p=sections" data-nav>startup</a> page shows. So <code>.data</code> costs its size twice: once in
        Flash and once in SRAM.</p>
      <h2>When it does not fit</h2>
      <p>The linker checks every region. Too much code, or a buffer too big for SRAM, is a link error rather than a
        crash at run time. The fix is to shrink something, move it (a <code>const</code> table belongs in Flash), or
        use a bigger chip. A real script also defines symbols the startup code reads, such as
        <code>_sidata</code>, <code>_sdata</code> and <code>_ebss</code> for the copy and clear, reserves room for
        the stack, and places the vector table at the very start of Flash, where the processor looks for it at
        reset. Vendor tools generate one for each chip.</p>
    </section>`;

  const panel = root.querySelector<HTMLElement>('.lds')!;

  function draw() {
    const run: { sizes: Record<string, number>; align: Record<string, number>; placed: { name: string; vma: number; lma: number; size: number }[]; error?: string } = CC.script[prog];
    const target = line ? SEC_OF.find(([re]) => re.test(script[line - 1]))?.[1] : undefined;
    panel.classList.toggle('picked', !!target);
    panel.querySelector('.cc-src code')!.innerHTML = script.map((t, k) => {
      const which = SEC_OF.find(([re]) => re.test(t))?.[1];
      return `<span class="ln${which ? ` s-${which.replace('.', '')}` : ''}${line === k + 1 ? ' on self' : ''}" data-line="${k + 1}"><span class="gutter">${k + 1}</span>${esc(t) || ' '}</span>`;
    }).join('');

    // With the error, show what would have been placed, from the model, so the overflow can be seen.
    const placed = run.placed.length ? run.placed : place(run.sizes as Record<Sec, number>, run.align as Record<Sec, number>).placed;
    const region = (name: 'FLASH' | 'SRAM') => {
      const r = REGIONS[name];
      const parts = placed.flatMap((p) => {
        const inR = (a: number) => a >= r.origin && a < r.origin + 0x10000000;
        const out: { name: string; at: number; size: number; load?: boolean }[] = [];
        if (inR(p.vma)) out.push({ name: p.name, at: p.vma, size: p.size });
        if (p.lma !== p.vma && inR(p.lma)) out.push({ name: p.name, at: p.lma, size: p.size, load: true });
        return out;
      });
      const used = Math.max(0, ...parts.map((p) => p.at + p.size)) - r.origin;
      const over = used > r.length;
      const scale = Math.max(r.length, used);
      const blocks = parts.map((p) => `<i class="b-${p.name.slice(1)}${p.load ? ' load' : ''}${target === p.name || target === name ? ' on' : ''}" style="left:${((p.at - r.origin) / scale) * 100}%;width:max(3px, ${(p.size / scale) * 100}%)" title="${p.name}${p.load ? ' (load copy)' : ''}"></i>`).join('');
      const rows = parts.map((p) => `<tr class="ln${target === p.name || target === name ? ' on' : ''}"><td><span class="lds-key b-${p.name.slice(1)}${p.load ? ' load' : ''}"></span>${p.name}${p.load ? ' <span class="cc-dim">load copy</span>' : ''}</td><td>${h8(p.at)}</td><td>${kib(p.size)}</td></tr>`).join('');
      return `<div class="lds-region${over ? ' over' : ''}">
        <h4>${name} <span class="cc-dim">${kib(Math.min(used, 1e9))} of ${kib(r.length)} used</span></h4>
        <div class="lds-bar">${blocks}${over ? `<b class="lds-end" style="left:${(r.length / scale) * 100}%"></b>` : ''}</div>
        <table class="cc-dis"><tbody>${rows}</tbody></table></div>`;
    };
    panel.querySelector('.lds-out')!.innerHTML = region('FLASH') + region('SRAM') +
      (run.error ? `<p class="lds-err">ld.lld: error: ${esc(run.error)}</p>` : '<p class="lds-ok">Linked.</p>');
    const says = line ? LINE_SAYS.find(([re]) => re.test(script[line - 1].trim()))?.[1] : undefined;
    panel.querySelector('.cc-status')!.innerHTML = says ?? PROG_SAYS[prog];
    markSeg(root, 'prog', prog);
    syncUrl({ prog });
  }

  panel.addEventListener('click', (e) => {
    const t = e.target as Element;
    const l = t.closest<HTMLElement>('[data-line]');
    const p = t.closest<HTMLElement>('[data-prog]');
    if (l) line = line === Number(l.dataset.line) ? 0 : Number(l.dataset.line);
    else if (p) prog = p.dataset.prog as Prog;
    else return;
    draw();
  });
  draw();
}
