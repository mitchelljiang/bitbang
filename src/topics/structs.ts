/**
 * The structs page: one struct in five forms (natural order, largest first, packed, bit fields, and a peripheral's
 * register map), each with a function that uses it, compiled at -Os. Under the code, a strip draws the struct to
 * scale from Clang's own record layout: each field in its colour and the padding hatched. Click a field to see why
 * it sits where it does. `pieces` turns a layout into those segments; verify checks it.
 */
import { esc } from '../core/render';
import { C } from './cdata';
import { asOut, explorer, explorerHtml, maxRows, sizeNote } from './cc';
import { markSeg, oneOf, seg, syncUrl } from './dbg';

export const STRUCT_CASES = ['order', 'reorder', 'packed', 'bitfield', 'regmap'] as const;
type Case = (typeof STRUCT_CASES)[number];
const NAMES: Record<Case, string> = { order: 'As written', reorder: 'Largest first', packed: 'packed', bitfield: 'Bit fields', regmap: 'Register map' };

interface Field { name: string; type: string; offset: number; bits?: number[]; line: number }
interface Layout { name: string; size: number; align: number; fields: Field[] }
/** Bytes per type, for the types the examples use. */
const BYTES: Record<string, number> = { uint8_t: 1, uint16_t: 2, uint32_t: 4, 'volatile uint32_t': 4 };

/** One stretch of the strip: a field (index into fields) or padding, from `at` for `n` units (bytes, or bits). */
export interface Piece { field: number; at: number; n: number }

/**
 * The layout as consecutive pieces, in bytes, or in bits of the first word when the struct is all bit fields.
 * Gaps between fields, and after the last, are padding (field -1).
 */
export function pieces(l: Layout): { unit: 'byte' | 'bit'; total: number; parts: Piece[] } {
  const bits = l.fields.every((f) => f.bits);
  const unit = bits ? 'bit' as const : 'byte' as const;
  const total = bits ? l.size * 8 : l.size;
  const spans = l.fields.map((f, i) => bits
    ? { field: i, at: f.offset * 8 + f.bits![0], n: f.bits![1] - f.bits![0] + 1 }
    : { field: i, at: f.offset, n: BYTES[f.type] }).sort((a, b) => a.at - b.at);
  const parts: Piece[] = [];
  let at = 0;
  for (const s of spans) {
    if (s.at > at) parts.push({ field: -1, at, n: s.at - at });
    parts.push(s);
    at = s.at + s.n;
  }
  if (at < total) parts.push({ field: -1, at, n: total - at });
  return { unit, total, parts };
}

const SAY: Record<Case, string> = {
  order: 'Each field sits at a multiple of its own size, so value cannot start at 1: the compiler adds 3 bytes of padding after kind. Then the struct’s size is rounded up to a multiple of 4, so that in an array every element’s value is aligned too: 3 more bytes after flags. 6 bytes of data in 12. Reading value is one <code>ldr</code> from offset 4.',
  reorder: 'The same three fields, largest first. Now value is at 0, the two bytes follow it, and only 2 bytes of padding are needed at the end: 8 bytes instead of 12. Sorting fields from largest to smallest alignment is the simplest way to shrink a struct. The code is the same single <code>ldr</code>.',
  packed: '<code>__attribute__((packed))</code> removes all padding: 6 bytes. But value is now at offset 1, and the Cortex-M0+ cannot load a word from an address that is not a multiple of 4. So the compiler reads it one byte at a time and puts the four together: 11 instructions instead of 2. Packed structs suit data sent over a wire; copy the fields out into a normal struct to work on them.',
  bitfield: 'Bit fields pack four fields into one 32-bit word. Setting enable compiles to a load of the whole word, an OR with 4 (bit 2) and a store of the whole word: a read-modify-write. The bit order inside the word, and the size of access, are chosen by the compiler and the ABI, not by the C standard.',
  regmap: 'A struct laid over a peripheral’s registers: each field a volatile uint32_t, so SR is at offset 0, DR at 4, BRR at 8, CR1 at 12, matching the reference manual. <code>USART2-&gt;DR = c</code> becomes one <code>str</code> to the base address + 4. This is how vendor headers such as CMSIS describe every peripheral.',
};

function fieldSay(l: Layout, i: number) {
  const f = l.fields[i];
  if (f.bits) {
    const lo = f.offset * 8 + f.bits[0], n = f.bits[1] - f.bits[0] + 1;
    return `<code>${esc(f.name)}</code>: ${n} bit${n > 1 ? 's' : ''}, bit${n > 1 ? `s ${lo + n - 1} to ${lo}` : ` ${lo}`} of the word. Reading it is a load, a shift and a mask; writing it is a load, a mask, an OR and a store.`;
  }
  const size = BYTES[f.type], prev = l.fields[i - 1];
  const gap = prev ? f.offset - (prev.offset + BYTES[prev.type]) : 0;
  return `<code>${esc(f.type)} ${esc(f.name)}</code>: ${size} byte${size > 1 ? 's' : ''} at offset ${f.offset}.`
    + (gap ? ` ${gap} byte${gap > 1 ? 's' : ''} of padding before it, so it starts at a multiple of ${size}.` : '')
    + (l.align === 1 && size > 1 && f.offset % size ? ` In a packed struct it is misaligned: offset ${f.offset} is not a multiple of ${size}.` : '');
}

export function mountStructs(root: HTMLElement) {
  let c = oneOf('s', STRUCT_CASES, 'order');
  let field = -1;

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Data in memory</p>
      <h1>Structs and bit fields</h1>
      <p>A struct’s fields are stored in the order they are written, but not always side by side: the compiler adds
        padding so each field is aligned. Pick a version of the struct and compare its layout and the code that reads
        it. The strip under the code is drawn from Clang’s own record layout. Click a field, in the strip or in the
        source, to see why it sits where it does.</p>
    </section>
    ${explorerHtml({ file: 'packet.c', label: 'Structs', cls: 'st', controls: seg('s', 'Struct', STRUCT_CASES.map((k) => [k, NAMES[k]])) })}
    <section class="prose">
      <h2>Padding</h2>
      <p>Each type has an alignment, usually its size: a <code>uint32_t</code> starts at an address that is a multiple
        of 4 (the <a href="?p=alignment" data-nav>alignment</a> page shows why). Inside a struct the compiler keeps
        every field aligned by inserting unused bytes before it, and pads the end so the size is a multiple of the
        largest alignment. Padding bytes hold whatever was there before, so never compare structs with
        <code>memcmp</code>, and clear a struct before sending it anywhere. <code>sizeof</code> and
        <code>offsetof</code> tell you the real numbers; <code>_Static_assert(sizeof(struct packet) == 8, "")</code>
        makes the build fail if they ever change.</p>
      <h2>packed</h2>
      <p>A packed struct has no padding, which is what a protocol header or a file format needs. The price is that
        fields may be misaligned. The Cortex-M3 and M4 can load a misaligned word, slowly, but the M0 and M0+ cannot,
        so the compiler splits every access into bytes. Taking the address of a packed field, as in
        <code>uint32_t *p = &amp;pkt.value</code>, is worse: the pointer forgets that it is misaligned, and the load
        through it faults.</p>
      <h2>Bit fields</h2>
      <p>Bit fields are tidy for flags inside your own data. For hardware registers they are risky: the order of the
        bits, whether a field can cross a word, and how wide each access is are all up to the compiler and the ABI.
        Every write is a read-modify-write, at whatever width the compiler picks, which can clear a status bit that is cleared by writing
        1. Vendor headers use plain <code>uint32_t</code> registers and masks instead, such as
        <code>USART2-&gt;CR1 |= USART_CR1_UE</code> (see <a href="?p=masks" data-nav>masks</a> and
        <a href="?p=rmw" data-nav>read-modify-write</a>).</p>
      <h2>Register maps</h2>
      <p>A struct of <code>volatile uint32_t</code> with no gaps lays out exactly like a block of registers, so a
        pointer to it at the peripheral’s base address gives every register a name. Reserved gaps in the memory map
        become arrays such as <code>uint32_t RESERVED0[2]</code>, so the offsets keep matching the manual.</p>
    </section>`;

  const panel = root.querySelector<HTMLElement>('.st')!;
  const strip = document.createElement('div');
  strip.className = 'st-strip';
  panel.querySelector('.cc-body')!.after(strip);

  const layout = (): Layout => C.structs[c].layout as Layout;
  function drawStrip() {
    const l = layout(), p = pieces(l);
    // Redrawing replaces the buttons: keep keyboard focus on the same one.
    const focused = strip.contains(document.activeElement) ? (document.activeElement as HTMLElement) : null;
    const refocus = focused && `.${focused.classList[0]}[data-field="${focused.dataset.field}"]`;
    const pad = p.parts.filter((x) => x.field < 0).reduce((n, x) => n + x.n, 0);
    // Bytes run left to right from offset 0, to one scale for every struct; bits are drawn as a register is, 31 on the left.
    const scale = p.unit === 'bit' ? 32 : 16;
    const left = (x: Piece) => (p.unit === 'bit' ? scale - x.at - x.n : x.at);
    const ticks = p.unit === 'bit' ? [31, 24, 16, 8, 0] : [0, 4, 8, 12, 16];
    strip.innerHTML = `
      <p class="cc-head">${esc(l.name)} · sizeof ${l.size} · align ${l.align} · ${pad ? `${pad} ${p.unit}${pad > 1 ? 's' : ''} of padding` : 'no padding'}</p>
      <div class="st-row">${p.parts.map((x) => `<button type="button" class="st-cell${x.field < 0 ? ' pad' : ` f c${x.field % 6}`}${x.field >= 0 && x.field === field ? ' on' : ''}${x.field >= 0 && (x.n / scale) * 700 > l.fields[x.field].name.length * 8 + 10 ? ' fit' : ''}"
        ${x.field >= 0 ? `data-field="${x.field}"` : 'tabindex="-1"'} style="left:${(left(x) / scale) * 100}%;width:${(x.n / scale) * 100}%"
        title="${x.field < 0 ? 'padding' : esc(l.fields[x.field].name)}"><span>${x.field < 0 ? '' : esc(l.fields[x.field].name)}</span></button>`).join('')}</div>
      <div class="st-ticks">${ticks.map((t) => `<span style="left:${((p.unit === 'bit' ? 31.5 - t : t) / scale) * 100}%">${p.unit === 'bit' ? t : `+${t}`}</span>`).join('')}</div>
      <div class="st-legend">${l.fields.map((f, i) => `<button type="button" class="st-key${i === field ? ' on' : ''}" data-field="${i}"><i class="c${i % 6}"></i>${esc(f.name)}</button>`).join('')}</div>`;
    if (refocus) strip.querySelector<HTMLElement>(refocus)?.focus({ preventScroll: true });
    strip.classList.toggle('st-bits', p.unit === 'bit');
    panel.classList.toggle('has-field', field >= 0);
    if (field >= 0) {
      panel.classList.add('picked');
      panel.querySelector(`.cc-src .ln[data-src="${l.fields[field].line}"]`)?.classList.add('on', 'self');
    }
  }

  const views = STRUCT_CASES.map((k) => {
    const l = C.structs[k].layout as Layout;
    return { src: C.src.structs[k], out: C.structs[k].asm, say: [SAY[k], ...l.fields.map((_, i) => fieldSay(l, i))] };
  });
  const { draw } = explorer(root, maxRows(views), () => {
    const b = C.structs[c];
    markSeg(root, 's', c);
    syncUrl({ s: c });
    queueMicrotask(drawStrip);
    return {
      src: C.src.structs[c], out: asOut(b.asm), head: `packet.s · -Os · ${sizeNote(b)}`,
      summary: field >= 0 ? fieldSay(layout(), field) : SAY[c],
    };
  });

  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    const k = t.closest<HTMLElement>('[data-s]');
    const f = t.closest<HTMLElement>('[data-field]');
    // The explorer has already redrawn by now, so this line is detached: no looking for its pane.
    const src = t.closest<HTMLElement>('[data-src]');
    if (k) { c = k.dataset.s as Case; field = -1; draw(true); return; }
    // A field, picked in the strip or by its line of source.
    const i = f ? Number(f.dataset.field) : src ? layout().fields.findIndex((x) => x.line === Number(src.dataset.src)) : -1;
    if (i >= 0) { field = field === i ? -1 : i; draw(true); }
    else if (field >= 0 && t.closest('.ln')) { field = -1; draw(); }
  });
}
