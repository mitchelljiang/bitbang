/**
 * The map file page: the map LLD wrote for a firmware in five files, beside what it adds up to per file in Flash and
 * SRAM. Click a file or any line of the map. The parser is exported; verify checks its totals against objdump.
 */
import { esc } from '../core/render';
import { CC } from './ccdata';

export interface MapRow { vma: number; lma: number; size: number; align: number; level: 0 | 1 | 2; name: string; file?: string; out: string }

/** Reads LLD's map: output sections, the input sections in each (file and section), and the symbols in those. */
export function parseMap(lines: readonly string[]): MapRow[] {
  const rows: MapRow[] = [];
  let out = '', file: string | undefined;
  for (const l of lines) {
    const m = l.match(/^\s*([0-9a-f]+)\s+([0-9a-f]+)\s+([0-9a-f]+)\s+(\d+) ( *)(\S.*)$/);
    if (!m) continue;
    const level = (m[5].length / 8) as 0 | 1 | 2;
    const name = m[6];
    if (level === 0) { out = name; file = undefined; }
    if (level === 1) file = name.match(/^(.+?):\(/)?.[1];
    rows.push({ vma: parseInt(m[1], 16), lma: parseInt(m[2], 16), size: parseInt(m[3], 16), align: Number(m[4]), level, name, file: level ? file : undefined, out });
  }
  return rows;
}

/** Bytes per file: Flash holds .text, .rodata and .data's starting values; SRAM holds .data and .bss. */
export function perFile(rows: MapRow[]) {
  const t: Record<string, { flash: number; sram: number }> = {};
  for (const r of rows.filter((x) => x.level === 1 && x.file)) {
    const e = (t[r.file!] ??= { flash: 0, sram: 0 });
    if (r.out === '.text' || r.out === '.rodata' || r.out === '.data') e.flash += r.size;
    if (r.out === '.data' || r.out === '.bss') e.sram += r.size;
  }
  return t;
}

const ROWS = parseMap(CC.map.lines);
const FILES = Object.keys(perFile(ROWS));
const TOT = perFile(ROWS);

export function mountMapfile(root: HTMLElement) {
  let file = '';
  let picked = -1;

  const flashUsed = CC.map.sections.filter((s) => s.name !== '.bss').reduce((n, s) => n + s.size, 0);
  const sramUsed = CC.map.sections.filter((s) => s.name === '.data' || s.name === '.bss').reduce((n, s) => n + s.size, 0);

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">The image</p>
      <h1>Map files</h1>
      <p>Ask the linker for a map (<code>-Map app.map</code>) and it writes down where it put everything: every
        output section, every input section in it and which file it came from, and every symbol, with addresses and
        sizes. It is the first place to look when the program does not fit. This is the real map of a firmware in
        five files. Click a file, or any line.</p>
    </section>
    <section class="debugger cc map" aria-label="Map file">
      <header class="dbg-bar"><span class="dbg-file">app.map</span><div class="dbg-controls"><span class="cc-cmd">ld.lld -T link.ld --gc-sections -Map app.map</span></div></header>
      <div class="dbg-body cc-body map-body">
        <div class="cc-pane"><p class="cc-head">app.map</p><pre class="dbg-code cc-src map-text" aria-label="Map file"><code></code></pre></div>
        <div class="cc-pane"><p class="cc-head">By file</p><div class="cc-rich map-sum"></div></div>
      </div>
      <p class="dbg-status cc-status" aria-live="polite"></p>
    </section>
    <section class="prose">
      <h2>Reading the columns</h2>
      <p><strong>VMA</strong> is where a thing is when the program runs, and <strong>LMA</strong> where it is stored;
        they differ only for <code>.data</code>, which runs from SRAM but is stored in Flash (see
        <a href="?p=linker-script" data-nav>linker scripts</a>). <strong>Size</strong> is in hex bytes, and
        <strong>Align</strong> the alignment the section needs. Then the name, indented by level: an output section;
        an input section, written <code>file.o:(section)</code>; and the symbols inside it. A function’s address ends
        in 1, the Thumb bit: <code>main</code> is at 0x08000000 but its symbol says 8000001.</p>
      <h2>Where the space went</h2>
      <p>Here the biggest single item is not code but <code>crc.c</code>’s lookup table: 256 entries of two bytes,
        512 bytes of <code>.rodata</code>, more than all the code together. The second surprise is
        <code>div.c</code>: the M0+ cannot divide, so each unsigned <code>/</code> here calls <code>__aeabi_uidiv</code>.
        In a real build that comes from the compiler’s runtime library, which the map lists the same way. Library code such as <code>printf</code> often turns out to be the largest thing
        in the map.</p>
      <h2>Throwing away what is not used</h2>
      <p>Each function and variable here was compiled into its own section, with <code>-ffunction-sections
        -fdata-sections</code>, and linked with <code>--gc-sections</code>. The linker starts from the entry point,
        follows every reference, and drops any section nothing reaches. Without those flags a whole file’s
        <code>.text</code> is one section, kept or dropped together. <code>--print-gc-sections</code> lists what
        was removed. <code>arm-none-eabi-size app.elf</code> gives the totals; the map gives the detail.</p>
    </section>`;

  const panel = root.querySelector<HTMLElement>('.map')!;
  const colour = (f: string) => `f${FILES.indexOf(f) % 6}`;

  function draw() {
    const rowFile = picked >= 0 ? ROWS[picked].file : undefined;
    const f = file || rowFile || '';
    panel.classList.toggle('picked', !!f || picked >= 0);
    const lines = CC.map.lines;
    let r = -1;
    panel.querySelector('.map-text code')!.innerHTML = lines.map((t, k) => {
      if (k === 0) return `<span class="ln map-head">${esc(t)}</span>`;
      const row = ROWS[++r];
      const mine = row.file && row.file === f;
      return `<span class="ln${row.file ? ` ${colour(row.file)}` : ' map-out'}${mine || picked === r ? ' on' : ''}${picked === r ? ' self' : ''}" data-row="${r}">${esc(t)}</span>`;
    }).join('');

    const bar = (key: 'flash' | 'sram', total: number) => {
      let at = 0;
      return `<div class="lds-bar map-bar">${FILES.map((x) => {
        const w = (TOT[x][key] / total) * 100;
        const s = `<i class="${colour(x)}${x === f ? ' on' : ''}" style="left:${at}%;width:${w}%"></i>`;
        at += w;
        return TOT[x][key] ? s : '';
      }).join('')}</div>`;
    };
    panel.querySelector('.map-sum')!.innerHTML = `
      <h4>Flash <span class="cc-dim">${flashUsed} bytes</span></h4>${bar('flash', flashUsed)}
      <h4>SRAM <span class="cc-dim">${sramUsed} bytes</span></h4>${bar('sram', sramUsed)}
      <table class="cc-dis map-files"><thead><tr><th>File</th><th>Flash</th><th>SRAM</th></tr></thead><tbody>${FILES.map((x) => `
        <tr class="ln${x === f ? ' on self' : ''}" data-file="${x}"><td><span class="lds-key ${colour(x)}"></span>${x}</td><td>${TOT[x].flash}</td><td>${TOT[x].sram || ''}</td></tr>`).join('')}
      </tbody></table>`;

    let say = `${FILES.length} files: ${flashUsed} bytes of Flash and ${sramUsed} of SRAM. The largest item is crc.o’s table, ${ROWS.find((x) => x.name === 'table')!.size} bytes.`;
    if (picked >= 0) {
      const row = ROWS[picked];
      const where = row.vma !== row.lma ? `runs at 0x${row.vma.toString(16)}, stored at 0x${row.lma.toString(16)}` : `at 0x${row.vma.toString(16)}`;
      say = row.level === 0 ? `The output section <code>${row.name}</code>, ${row.size} bytes, ${where}.`
        : row.level === 1 ? `<code>${esc(row.name)}</code>: ${row.size} bytes from ${row.file}, ${where}, aligned to ${row.align}.`
          : `The symbol <code>${esc(row.name)}</code>, ${row.size} bytes, ${where}${row.out === '.text' ? '. The 1 at the end is the Thumb bit' : ''}.`;
    } else if (file) say = `<code>${file}</code>: ${TOT[file].flash} bytes of Flash${TOT[file].sram ? ` and ${TOT[file].sram} of SRAM` : ''}.`;
    panel.querySelector('.cc-status')!.innerHTML = say;
  }

  panel.addEventListener('click', (e) => {
    const t = e.target as Element;
    const row = t.closest<HTMLElement>('[data-row]');
    const fl = t.closest<HTMLElement>('[data-file]');
    if (row) { const i = Number(row.dataset.row); picked = picked === i ? -1 : i; file = ''; }
    else if (fl) { file = file === fl.dataset.file ? '' : fl.dataset.file!; picked = -1; }
    else return;
    draw();
  });
  draw();
}
