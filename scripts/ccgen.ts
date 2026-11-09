/**
 * Builds the data behind the Compilers pages by running the real tools: Clang for C → Thumb (Cortex-M0+), its
 * preprocessor, objdump for object files, and LLD (from the `ziglang` package in .venv) for linking and map files.
 * `npm run gen-cc` writes the result to src/topics/ccdata.ts; `npm run verify` runs it again and checks the pages
 * still show exactly what the tools produce. Each build runs in its own scratch folder, up to eight at once.
 */
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const TARGET = ['--target=thumbv6m-none-eabi', '-mcpu=cortex-m0plus', '-ffreestanding', '-fno-unwind-tables',
  '-fno-asynchronous-unwind-tables', '-fno-common'];
const PY = resolve('.venv/bin/python');  // npm runs scripts from the package root

/** Whether every tool is here: Clang with an Arm backend, objdump and LLD. */
export function haveTools() {
  try {
    execFileSync('clang', ['--target=thumbv6m-none-eabi', '-c', '-x', 'c', '-', '-o', '/dev/null'], { input: '', stdio: ['pipe', 'ignore', 'ignore'] });
    execFileSync('objdump', ['--version'], { stdio: 'ignore' });
    return existsSync(PY) && /LLD/.test(execFileSync(PY, ['-m', 'ziglang', 'ld.lld', '--version'], { encoding: 'utf8' }));
  } catch {
    return false;
  }
}

/** One line of a listing: its text, the source line it came from (0 for none), and what it is. */
export interface AsmLine { t: string; src: number; kind: 'label' | 'ins' | 'data' | 'pad'; hex?: string }
export interface Build { asm: AsmLine[]; bytes: number; ins: number }

let running = 0;
const waiting: (() => void)[] = [];
/** A program's output; a failure rejects with its stderr. At most eight run at once. */
async function exec(cmd: string, args: string[], cwd: string) {
  if (running >= 8) await new Promise<void>((r) => waiting.push(r));
  running++;
  try {
    return await new Promise<string>((ok, fail) => execFile(cmd, args, { cwd, maxBuffer: 1 << 24 }, (e, out, err) =>
      (e ? fail(Object.assign(e, { stderr: String(err) })) : ok(String(out)))));
  } finally {
    running--;
    waiting.shift()?.();
  }
}

/** A scratch folder for one build. */
class Box {
  constructor(readonly dir: string) {}
  run = (cmd: string, args: string[]) => exec(cmd, args, this.dir);
  lld = (args: string[]) => this.run(PY, ['-m', 'ziglang', 'ld.lld', ...args]);
  write = (name: string, text: string) => writeFileSync(join(this.dir, name), text);
  read = (name: string) => readFileSync(join(this.dir, name), 'utf8');
}
/** One scratch folder for the whole run, holding a folder per build; removed when the process exits. */
let root = '';
const box = () => {
  if (!root) {
    root = mkdtempSync(join(tmpdir(), 'ccgen-'));
    process.on('exit', () => rmSync(root, { recursive: true, force: true }));
  }
  return new Box(mkdtempSync(join(root, 'b-')));
};
const tab = (s: string) => s.trim().replace(/\s+/, ' ').replace(/\t/g, ' ');

/** Reads `.text` from `clang -S -g`: labels, instructions and literal-pool words, each tagged with its source line. */
function listing(asm: string): AsmLine[] {
  const out: AsmLine[] = [];
  let line = 0, text = true;
  for (const raw of asm.split('\n')) {
    const s = raw.replace(/\s+@.*$/, '').replace(/^@.*$/, '');
    const loc = s.match(/^\s*\.loc\s+\d+\s+(\d+)/);
    if (loc) { line = Number(loc[1]); continue; }
    const sec = s.match(/^\s*\.(text|data|bss|section\s+([.\w]+))/);
    if (sec) { text = sec[1] === 'text' || !!sec[2]?.startsWith('.text'); continue; }
    if (!text || !s.trim()) continue;
    const label = s.match(/^([.\w$]+):/);
    if (label) {
      if (label[1].startsWith('.L') && !/^\.L(BB|CPI)/.test(label[1])) continue;
      if (!label[1].startsWith('.')) line = 0;
      out.push({ t: `${label[1]}:`, src: 0, kind: 'label' });
      continue;
    }
    const word = s.match(/^\s*\.long\s+(\S+)/);
    if (word) {
      const v = /^-?\d+$/.test(word[1]) ? `0x${(Number(word[1]) >>> 0).toString(16).padStart(8, '0')}` : word[1];
      out.push({ t: `.word ${v}`, src: line, kind: 'data' });
      continue;
    }
    if (/^\s+[a-z]/.test(s)) out.push({ t: tab(s), src: line, kind: 'ins' });
  }
  return out;
}

/** `objdump -d` of an object: each instruction or data word's bytes, in order. */
const encodings = async (b: Box, obj: string) => (await b.run('objdump', ['-d', '-z', obj])).split('\n')
  .map((l) => l.match(/^\s*[0-9a-f]+:\s+((?:[0-9a-f]{2,4} ?)+?)\s{2,}\t?(.+)$/))
  .filter((m): m is RegExpMatchArray => !!m)
  .map((m) => ({ hex: m[1].trim(), t: tab(m[2].replace(/\s+@.*$/, '')) }));

/** Compiles one C file at `opt` and lists its `.text`, with each instruction's encoding and the section's size. */
export async function compile(src: string, opt: string, extra: string[] = []): Promise<Build> {
  const b = box();
  b.write('x.c', src);
  const flags = [...TARGET, opt, ...extra];
  const [g, plainText] = await Promise.all([
    b.run('clang', [...flags, '-g', '-S', '-o', '-', 'x.c']),
    b.run('clang', [...flags, '-S', '-o', '-', 'x.c']),
    b.run('clang', [...flags, '-c', '-o', 'x.o', 'x.c']),
  ]);
  const asm = listing(g), plain = listing(plainText);
  const same = (a: AsmLine[]) => a.filter((l) => l.kind !== 'label').map((l) => l.t).join('\n');
  if (same(asm) !== same(plain)) throw new Error(`-g changed the code for\n${src}`);
  // Pair each line with its bytes. The assembler pads before a literal pool with `mov r8, r8`, which -S only shows
  // as an alignment directive, so those become padding lines.
  const [enc, size] = await Promise.all([encodings(b, 'x.o'), headers(b, 'x.o')]);
  const out: AsmLine[] = [];
  let e = 0;
  for (const l of asm) {
    if (l.kind === 'label') { out.push(l); continue; }
    while (enc[e]?.t === 'mov r8, r8' && l.t !== 'mov r8, r8') out.push({ t: 'nop', src: 0, kind: 'pad', hex: enc[e++].hex });
    if (!enc[e]) throw new Error(`objdump ran out of items for\n${src}`);
    if (l.kind === 'ins' && enc[e].t.split(' ')[0] !== l.t.split(' ')[0]) throw new Error(`${enc[e].t} ≠ ${l.t} in\n${src}`);
    out.push({ ...l, hex: enc[e++].hex });
  }
  while (enc[e]?.t === 'mov r8, r8') out.push({ t: 'nop', src: 0, kind: 'pad', hex: enc[e++].hex });
  if (e !== enc.length) throw new Error(`objdump lists ${enc.length} items, the listing ${e}, for\n${src}`);
  return { asm: out, bytes: size.filter((h) => h.name.startsWith('.text')).reduce((n, h) => n + h.size, 0), ins: out.filter((l) => l.kind === 'ins').length };
}

/** The size and addresses of each allocated section in an object or image, from `objdump -h`. */
async function headers(b: Box, file: string) {
  return (await b.run('objdump', ['-h', file])).split('\n')
    // An object file has no LMA column; there the load address is the VMA (both 0).
    .map((l) => l.match(/^\s*\d+\s+(\.\S+)\s+([0-9a-f]{8})\s+([0-9a-f]{8})(?:\s+([0-9a-f]{8}))?/))
    .filter((m): m is RegExpMatchArray => !!m && /^\.(text|data|bss|rodata)/.test(m[1]))
    .map((m) => ({ name: m[1], size: parseInt(m[2], 16), vma: parseInt(m[3], 16), lma: parseInt(m[4] ?? m[3], 16) }));
}

// ---------------------------------------------------------------------------------------------------------------
// The examples. Each page's C is written here once; the page shows it and what the tools made of it.

export const PRE_SRC = `#include <stdint.h>

#ifndef LED_PIN
#define LED_PIN 5
#endif
#define GPIOA_ODR (*(volatile uint32_t *)0x48000014)
#define BIT(n) (1u << (n))

#ifdef DEBUG
#define LOG(msg) uart_puts(msg)
#else
#define LOG(msg)
#endif

void uart_puts(const char *s);

/* Turn the LED on. */
void led_on(void) {
    GPIOA_ODR |= BIT(LED_PIN);  // set the pin
    LOG("led on");
}`;
export const PRE_VARIANTS = { plain: [], debug: ['-DDEBUG'], pin: ['-DLED_PIN=9'], both: ['-DDEBUG', '-DLED_PIN=9'] } as const;

/** One line of preprocessor output: text from led.c and its line there, or a run of lines pasted in from a header. */
export interface PreLine { t: string; src: number; from?: string; n?: number }

/** Reads `clang -E` output, following its `# line "file"` markers to tag each line with where it came from. */
export function preLines(text: string, main: string): PreLine[] {
  const out: PreLine[] = [];
  let file = main, line = 1;
  for (const raw of text.split('\n')) {
    const m = raw.match(/^# (\d+) "([^"]*)"/);
    if (m) { line = Number(m[1]); file = m[2]; continue; }
    const at = line++;
    if (!raw.trim()) continue;
    if (file === main) { out.push({ t: raw, src: at }); continue; }
    const name = file.replace(/^.*\//, '');
    const last = out[out.length - 1];
    if (last?.from === name) last.n! += 1;
    else out.push({ t: '', src: 0, from: name, n: 1 });
  }
  return out;
}

export const COMPILE_SRC: Record<string, string> = {
  add: `int add(int a, int b) {
    return a + b;
}`,
  clamp: `int clamp(int x, int max) {
    if (x > max)
        return max;
    return x;
}`,
  sum: `int sum(const int *p, int n) {
    int s = 0;
    for (int i = 0; i < n; i++)
        s += p[i];
    return s;
}`,
  toggle: `#include <stdint.h>
#define GPIO_OUT (*(volatile uint32_t *)0xD0000010)

void led_toggle(void) {
    GPIO_OUT ^= 1u << 25;   // the Pico's LED
}`,
  call: `int square(int x);

int sum_sq(int a, int b) {
    return square(a) + square(b);
}`,
};

export const OPT_SRC: Record<string, string> = {
  sum: COMPILE_SRC.sum,
  sumto: `int sum_to(int n) {
    int s = 0;
    for (int i = 0; i < n; i++)
        s += i;
    return s;
}`,
  scale: `int scale(int x) {
    int y = x * 10;
    return y / 4;
}`,
};
export const OPT_LEVELS = ['-O0', '-O1', '-O2', '-Os'] as const;

/** Each volatile example, with and without the keyword. */
export const VOL_SRC: Record<string, [string, string]> = {
  poll: [`#include <stdint.h>
#define UART_SR (*(uint32_t *)0x40004400)

void wait_rx(void) {
    while (!(UART_SR & (1u << 5)))
        ;   // wait for a byte
}`, `#include <stdint.h>
#define UART_SR (*(volatile uint32_t *)0x40004400)

void wait_rx(void) {
    while (!(UART_SR & (1u << 5)))
        ;   // wait for a byte
}`],
  flag: [`int ready;   // set by an interrupt

void wait_ready(void) {
    while (!ready)
        ;
}`, `volatile int ready;   // set by an interrupt

void wait_ready(void) {
    while (!ready)
        ;
}`],
  delay: [`void delay(void) {
    for (int i = 0; i < 1000; i++)
        ;
}`, `void delay(void) {
    for (volatile int i = 0; i < 1000; i++)
        ;
}`],
};

/** Each undefined-behavior example, as written and fixed. */
export const UB_SRC: Record<string, [string, string]> = {
  overflow: [`int has_room(int x) {
    return x + 1 > x;   // false only if x + 1 wraps
}`, `#include <limits.h>

int has_room(int x) {
    return x < INT_MAX;
}`],
  null: [`int read(int *p) {
    int v = *p;
    if (p == 0)
        return -1;
    return v;
}`, `int read(int *p) {
    if (p == 0)
        return -1;
    return *p;
}`],
  bounds: [`int table[4];

int in_table(int v) {
    for (int i = 0; i <= 4; i++)
        if (table[i] == v)
            return 1;
    return 0;
}`, `int table[4];

int in_table(int v) {
    for (int i = 0; i < 4; i++)
        if (table[i] == v)
            return 1;
    return 0;
}`],
};

// Object files and linking: one small program in two files.
export const OBJ_SRC = `#include <stdint.h>

extern int read_adc(int ch);

int last;                   // no value: .bss
int count = 1;              // a value: .data
const char name[] = "temp"; // const: .rodata
static int scale = 3;       // static: only this file

int sensor_read(void) {     // code: .text
    count++;
    last = read_adc(0) * scale;
    return last;
}`;

export const LINK_SRC = {
  'main.c': `extern int add(int a, int b);
extern int counter;
int total;

int main(void) {
    total = add(counter, 2);
    return 0;
}`,
  'math.c': `int counter = 40;

int add(int a, int b) {
    return a + b;
}`,
};

export const LINK_SCRIPT = `MEMORY {
  FLASH (rx)  : ORIGIN = 0x08000000, LENGTH = 64K
  SRAM  (rwx) : ORIGIN = 0x20000000, LENGTH = 20K
}

SECTIONS {
  .text   : { *(.text*) }   > FLASH
  .rodata : { *(.rodata*) } > FLASH
  .data   : { *(.data*) }   > SRAM AT > FLASH
  .bss    : { *(.bss*) }    > SRAM
  /DISCARD/ : { *(.ARM.exidx*) }
}`;

/** The programs on the linker-script page: the same firmware, then with a lookup table, then with a big buffer. */
export const SCRIPT_SRC: Record<string, string> = {
  blink: `#include <stdint.h>

uint32_t ticks;                  // .bss
uint32_t period = 500;           // .data
const char hello[] = "blink v1"; // .rodata

void tick(void) {                // .text
    if (++ticks >= period)
        ticks = 0;
}`,
  table: `#include <stdint.h>

uint32_t ticks;
uint32_t period = 500;
const char hello[] = "blink v1";
const uint16_t sine[4096] = { 1 };  // 8 KiB in Flash

void tick(void) {
    if (++ticks >= period)
        ticks = sine[ticks & 4095];
}`,
  buffer: `#include <stdint.h>

uint32_t ticks;
uint32_t period = 500;
const char hello[] = "blink v1";
uint8_t frame[24 * 1024];        // 24 KiB in SRAM

void tick(void) {
    if (++ticks < sizeof frame)
        frame[ticks] = 1;
}`,
};

/** A firmware in four files, for the map file. */
export const MAP_SRC: Record<string, string> = {
  'main.c': `#include <stdint.h>
void uart_init(uint32_t baud);
void uart_puts(const char *s);
uint16_t crc16(const uint8_t *p, int n);
int format_u32(char *out, uint32_t v);

static char line[32];
uint32_t boots = 1;

int main(void) {
    uart_init(115200);
    format_u32(line, boots);
    uart_puts(line);
    return crc16((const uint8_t *)line, 32);
}`,
  'uart.c': `#include <stdint.h>
#define UART0 ((volatile uint32_t *)0x40034000)

void uart_init(uint32_t baud) {
    UART0[9] = 125000000 / (16 * baud);
    UART0[12] = 0x301;
}

void uart_puts(const char *s) {
    while (*s) {
        while (UART0[6] & (1u << 5))
            ;
        UART0[0] = *s++;
    }
}`,
  'crc.c': `#include <stdint.h>
static const uint16_t table[256] = { 0x0000, 0x1021, 0x2042 };

uint16_t crc16(const uint8_t *p, int n) {
    uint16_t crc = 0xFFFF;
    while (n--)
        crc = (crc << 8) ^ table[(crc >> 8) ^ *p++];
    return crc;
}`,
  'fmt.c': `#include <stdint.h>
static uint8_t scratch[64];

int format_u32(char *out, uint32_t v) {
    int n = 0;
    do {
        scratch[n++] = '0' + v % 10;
        v /= 10;
    } while (v);
    for (int i = 0; i < n; i++)
        out[i] = scratch[n - 1 - i];
    out[n] = 0;
    return n;
}`,
  'div.c': `#include <stdint.h>
// The M0+ has no divide instruction, so the compiler calls this for
// every unsigned /. It stands in for the runtime library.
uint32_t __aeabi_uidiv(uint32_t n, uint32_t d) {
    uint32_t q = 0, r = 0;
    for (int i = 31; i >= 0; i--) {
        r = (r << 1) | ((n >> i) & 1);
        if (r >= d) {
            r -= d;
            q |= 1u << i;
        }
    }
    return q;
}`,
};

// ---------------------------------------------------------------------------------------------------------------

export interface Sym { name: string; value: number; size: number; section: string; bind: 'global' | 'local'; kind: 'func' | 'object' | 'none' }
export interface Reloc { offset: number; type: string; sym: string; section: string }

/** Everything objdump says about an object or image that the pages draw. */
async function inspect(b: Box, file: string) {
  const [sections, symText, relText, disText] = await Promise.all([
    headers(b, file), b.run('objdump', ['-t', file]), b.run('objdump', ['-r', file]), b.run('objdump', ['-d', '-z', file]),
  ]);
  // objdump -t: value, seven flag characters (bind first, type last), section, a tab, size and name.
  const syms: Sym[] = symText.split('\n')
    .map((l) => l.match(/^([0-9a-f]{8}) (.{7}) (\S+)\t([0-9a-f]{8}) (\S+)$/))
    .filter((m): m is RegExpMatchArray => !!m && m[2][6] !== 'f' && !/^[$.]/.test(m[5]))
    .map((m) => ({
      name: m[5], value: parseInt(m[1], 16), size: parseInt(m[4], 16), section: m[3],
      bind: m[2][0] === 'l' ? 'local' as const : 'global' as const,
      kind: m[2][6] === 'F' ? 'func' as const : m[2][6] === 'O' ? 'object' as const : 'none' as const,
    }));
  const relocs: Reloc[] = [];
  let sec = '';
  for (const l of relText.split('\n')) {
    const h = l.match(/^RELOCATION RECORDS FOR \[(\S+)\]/);
    if (h) { sec = h[1].replace(/^\.rel/, ''); continue; }
    const m = l.match(/^([0-9a-f]{8}) (R_ARM_\w+)\s+(\S+)/);
    if (m && !sec.startsWith('.ARM') && !sec.startsWith('.debug')) relocs.push({ offset: parseInt(m[1], 16), type: m[2], sym: m[3], section: sec });
  }
  const bytes: Record<string, string> = {};
  await Promise.all(sections.filter((s) => !s.name.startsWith('.bss')).map(async (s) => {
    bytes[s.name] = (await b.run('objdump', ['-s', '-j', s.name, file])).split('\n')
      .map((l) => l.match(/^ [0-9a-f]+ ((?:[0-9a-f]{2,8} ){1,4})/)?.[1].replace(/ /g, '') ?? '').join('');
  }));
  const dis = disText.split('\n')
    .map((l) => l.match(/^\s*([0-9a-f]+):\s+((?:[0-9a-f]{2,4} ?)+?)\s{2,}\t?(.+)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ at: parseInt(m[1], 16), hex: m[2].trim(), t: tab(m[3].replace(/\s+@.*$/, '')) }));
  return { sections, syms, relocs, bytes: Object.fromEntries(Object.entries(bytes).sort()), dis };
}

export interface Placement { name: string; vma: number; lma: number; size: number }
export interface ScriptRun { sizes: Record<string, number>; align: Record<string, number>; placed: Placement[]; error?: string }

/** Each output section's alignment, from an LLD map. */
const mapAligns = (text: string) => Object.fromEntries(text.split('\n')
  .map((l) => l.match(/^\s*[0-9a-f]+\s+[0-9a-f]+\s+[0-9a-f]+\s+(\d+) (\.(?:text|rodata|data|bss))$/))
  .filter((m): m is RegExpMatchArray => !!m).map((m) => [m[2], Number(m[1])]));

/**
 * Links objects with a linker script and reports where LLD put each section, or its error. The alignments come
 * from a second link into regions big enough for anything, since a failed link writes no map.
 */
async function linkWith(b: Box, objs: string[], script = LINK_SCRIPT): Promise<ScriptRun> {
  const sizes: Record<string, number> = {};
  for (const o of objs) for (const h of await headers(b, o)) {
    const key = h.name.match(/^\.(text|rodata|data|bss)/)![0];
    sizes[key] = (sizes[key] ?? 0) + h.size;
  }
  b.write('roomy.ld', script.replace(/LENGTH = \w+/g, 'LENGTH = 256M'));
  b.write('link.ld', script);
  const [, result] = await Promise.all([
    b.lld(['-T', 'roomy.ld', '-e', '0', '-Map', 'roomy.map', ...objs, '-o', 'roomy.elf']),
    b.lld(['-T', 'link.ld', '-e', '0', ...objs, '-o', 'app.elf']).then(() => null, (e: { stderr?: string }) =>
      (String(e.stderr ?? e).split('\n').find((l) => /error:/.test(l)) ?? 'error').replace(/^.*?error: /, '')),
  ]);
  const align = mapAligns(b.read('roomy.map'));
  if (result !== null) return { sizes, align, placed: [], error: result };
  return { sizes, align, placed: (await headers(b, 'app.elf')).map((h) => ({ name: h.name, vma: h.vma, lma: h.lma, size: h.size })) };
}

/** Links an object with sections of exactly these sizes and alignments (log2), for checking the placement model. */
export async function linkSynthetic(s: Record<'text' | 'rodata' | 'data' | 'bss', [number, number]>) {
  const flags = { text: '"ax",%progbits', rodata: '"a",%progbits', data: '"aw",%progbits', bss: '"aw",%nobits' };
  const b = box();
  b.write('s.s', Object.entries(s).map(([k, [size, a]]) =>
    `.section .${k},${flags[k as keyof typeof flags]}\n.p2align ${a}\n.space ${size}\n`).join(''));
  await b.run('clang', ['--target=thumbv6m-none-eabi', '-c', 's.s', '-o', 's.o']);
  return linkWith(b, ['s.o']);
}

/**
 * Links a run of `bl` instructions, the i-th at address 4i and aimed `offset` bytes past its PC (the bl + 4), and
 * returns the halfwords LLD wrote for each: [offset, hw1, hw2][]. For checking the page's BL encoder.
 */
export async function assembleBl(offsets: number[]) {
  const b = box();
  // Each target is left undefined and given to LLD with --defsym as a Thumb address (bit 0 set), so the linker, not
  // the assembler, works out the distance, as it does on the page.
  b.write('bl.s', ['.syntax unified', '.thumb', '.text', ...offsets.map((_, i) => `  bl t${i}`)].join('\n') + '\n');
  b.write('bl.ld', 'SECTIONS { .text 0 : { *(.text) } }');
  await b.run('clang', ['--target=thumbv6m-none-eabi', '-c', 'bl.s', '-o', 'bl.o']);
  await b.lld(['-T', 'bl.ld', '-e', '0', ...offsets.flatMap((o, i) => ['--defsym', `t${i}=${4 * i + 4 + o + 1}`]), 'bl.o', '-o', 'bl.elf']);
  const hex = (await b.run('objdump', ['-s', '-j', '.text', 'bl.elf'])).split('\n')
    .map((l) => l.match(/^ [0-9a-f]+ ((?:[0-9a-f]{2,8} ){1,4})/)?.[1].replace(/ /g, '') ?? '').join('');
  const le = (x: string) => parseInt(x.slice(2, 4) + x.slice(0, 2), 16);
  return offsets.map((o, i): [number, number, number] => [o, le(hex.slice(8 * i, 8 * i + 4)), le(hex.slice(8 * i + 4, 8 * i + 8))]);
}

// ---------------------------------------------------------------------------------------------------------------
// C for embedded. Each page's C, and what Clang made of it: code, where each variable went, and struct layouts.

const KEY_HEAD = '#include <stdint.h>\n\n';
/** One variable, declared six ways. */
export const KEY_SRC: Record<string, string> = {
  local: `${KEY_HEAD}uint32_t tick(void) {
  uint32_t count = 5;   // a local variable
  return ++count;
}`,
  global: `${KEY_HEAD}uint32_t count;   // a global: any file can use it

uint32_t tick(void) {
  return ++count;
}`,
  static: `${KEY_HEAD}static uint32_t count = 5;   // only this file can use it

uint32_t tick(void) {
  return ++count;
}`,
  staticlocal: `${KEY_HEAD}uint32_t tick(void) {
  static uint32_t count;   // keeps its value between calls
  return ++count;
}`,
  const: `${KEY_HEAD}const uint32_t limit = 100;   // read-only

uint32_t room(uint32_t used) {
  return limit - used;
}`,
  extern: `${KEY_HEAD}extern uint32_t count;   // defined in another file

uint32_t tick(void) {
  return ++count;
}`,
};
/** The variable each example declares. */
export const KEY_VAR: Record<string, string> = { local: 'count', global: 'count', static: 'count', staticlocal: 'tick.count', const: 'limit', extern: 'count' };

/** Integer examples, each in two versions. */
export const INT_SRC: Record<string, [string, string]> = {
  narrow: [`#include <stdint.h>

uint8_t add(uint8_t a, uint8_t b) {
  return a + b;   // added as int, then cut to 8 bits
}`, `#include <stdint.h>

uint32_t add(uint32_t a, uint32_t b) {
  return a + b;   // already 32 bits: nothing to cut
}`],
  compare: [`int below(int a, unsigned b) {
  return a < b;   // a is converted to unsigned first
}`, `int below(int a, int b) {
  return a < b;   // both signed
}`],
  divide: [`int half(int x) {
  return x / 2;   // rounds toward zero: -3 / 2 is -1
}`, `unsigned half(unsigned x) {
  return x / 2;   // never negative: just a shift
}`],
};

/** The types whose size and alignment the integer page lists, measured by Clang. */
export const C_TYPES = ['char', 'short', 'int', 'long', 'long long', 'float', 'double', 'void *', 'enum mode', '_Bool'];

/** Struct examples: a layout, and a function that uses it. */
export const STRUCT_SRC: Record<string, string> = {
  order: `#include <stdint.h>

struct packet {
  uint8_t  kind;
  uint32_t value;
  uint8_t  flags;
};

uint32_t get(const struct packet *p) {
  return p->value;
}`,
  reorder: `#include <stdint.h>

struct packet {
  uint32_t value;
  uint8_t  kind;
  uint8_t  flags;
};

uint32_t get(const struct packet *p) {
  return p->value;
}`,
  packed: `#include <stdint.h>

struct packet {
  uint8_t  kind;
  uint32_t value;
  uint8_t  flags;
} __attribute__((packed));

uint32_t get(const struct packet *p) {
  return p->value;
}`,
  bitfield: `#include <stdint.h>

struct control {
  uint32_t mode   : 2;
  uint32_t enable : 1;
  uint32_t div    : 5;
  uint32_t count  : 12;
};

void start(struct control *c) {
  c->enable = 1;
}`,
  regmap: `#include <stdint.h>

typedef struct {
  volatile uint32_t SR;    // status
  volatile uint32_t DR;    // data
  volatile uint32_t BRR;   // baud rate
  volatile uint32_t CR1;   // control
} USART_t;

#define USART2 ((USART_t *)0x40004400)

void send(uint8_t c) {
  while (!(USART2->SR & (1u << 7)))
    ;
  USART2->DR = c;
}`,
};

/** Pointer examples. */
export const PTR_SRC: Record<string, string> = {
  register: `#include <stdint.h>

#define GPIOA_ODR (*(volatile uint32_t *)0x48000014)

void led_on(void) {
  GPIOA_ODR = 1u << 5;
}`,
  index: `#include <stdint.h>

uint32_t at32(const uint32_t *p, int i) {
  return p[i];       // the address p + 4 × i
}

uint8_t at8(const uint8_t *p, int i) {
  return p[i];       // the address p + i
}

uint32_t next(const uint32_t *p) {
  return *(p + 1);   // 4 bytes on, not 1
}`,
  member: `#include <stdint.h>

struct point { int32_t x, y; };

int32_t sum(const struct point *p) {
  return p->x + p->y;
}

void move(struct point *p, int32_t dx) {
  p->x += dx;
}`,
  fnptr: `typedef void (*handler_t)(void);

void start(void);
void stop(void);
void reset(void);

static const handler_t table[] = { start, stop, reset };

void run(unsigned cmd) {
  if (cmd < 3)
    table[cmd]();
}`,
};

/** Function examples, each in two versions. */
const GPIO_T = `typedef struct {
    volatile uint32_t MODER, OTYPER, OSPEEDR, PUPDR;
    volatile uint32_t IDR, ODR, BSRR, LCKR;
} gpio_t;
#define GPIOA ((gpio_t *)0x40020000)
`;
export const DRV_SRC = {
  raw: `#include <stdint.h>
#define GPIOA_ODR (*(volatile uint32_t *)0x40020014)

void led_on(void) {
    GPIOA_ODR |= 1u << 5;
}
`,
  overlay: `#include <stdint.h>
${GPIO_T}
void led_on(void) {
    GPIOA->ODR |= 1u << 5;
}
`,
  setclr: `#include <stdint.h>
${GPIO_T}
void led_on(void) {
    GPIOA->BSRR = 1u << 5;
}
`,
  direct: `#include <stdint.h>
#define GPIOA_BSRR (*(volatile uint32_t *)0x40020018)

void blink_once(void) {
    GPIOA_BSRR = 1u << 5;
}
`,
  call: `void gpio_write(int pin, int on);

void blink_once(void) {
    gpio_write(5, 1);
}
`,
  ops: `struct gpio_ops { void (*write)(int pin, int on); };
struct led { const struct gpio_ops *ops; int pin; };

void blink_once(struct led *led) {
    led->ops->write(led->pin, 1);
}
`,
};

export const FN_SRC: Record<string, [string, string]> = {
  inline: [`#include <stdint.h>

static inline uint32_t clamp(uint32_t x, uint32_t max) {
  return x > max ? max : x;
}

uint32_t level(uint32_t a, uint32_t b) {
  return clamp(a, 100) + clamp(b, 100);
}`, `#include <stdint.h>

__attribute__((noinline))
static uint32_t clamp(uint32_t x, uint32_t max) {
  return x > max ? max : x;
}

uint32_t level(uint32_t a, uint32_t b) {
  return clamp(a, 100) + clamp(b, 100);
}`],
  args: [`int mix(int a, int b, int c, int d);

int call(void) {
  return mix(1, 2, 3, 4);
}`, `int mix(int a, int b, int c, int d, int e, int f);

int call(void) {
  return mix(1, 2, 3, 4, 5, 6);
}`],
  static: [`int helper(int x) {
  return x * 3;
}

int used(int x) {
  return x + 1;
}`, `static int helper(int x) {
  return x * 3;
}

int used(int x) {
  return x + 1;
}`],
  struct: [`struct point { int x, y; };

int sum(struct point p) {
  return p.x + p.y;
}`, `struct point { int x, y; };

int sum(const struct point *p) {
  return p->x + p->y;
}`],
};

export interface Field { name: string; type: string; offset: number; bits?: [number, number]; line: number }
export interface Layout { name: string; size: number; align: number; fields: Field[] }

/** The first struct in Clang's `-fdump-record-layouts` output: each field's offset (and bits), and the totals. */
export function recordLayout(dump: string, src: string): Layout {
  const block = dump.split('*** Dumping AST Record Layout')[1];
  if (!block) throw new Error(`no record layout for\n${src}`);
  const lines = block.split('\n').map((l) => l.trimEnd()).filter(Boolean);
  const name = lines[0].replace(/^\s*0 \|\s*/, '');
  const fields: Field[] = [];
  for (const l of lines.slice(1)) {
    const m = l.match(/^\s*(\d+)(?::(\d+)-(\d+))? \|\s+(.+?)\s+(\w+)$/);
    if (!m) continue;
    const line = src.split('\n').findIndex((t) => new RegExp(`\\b${m[5]}\\s*[:;]`).test(t)) + 1;
    fields.push({ name: m[5], type: m[4], offset: Number(m[1]), ...(m[2] ? { bits: [Number(m[2]), Number(m[3])] as [number, number] } : {}), line });
  }
  const t = block.match(/\[sizeof=(\d+), align=(\d+)/);
  if (!t) throw new Error(`no size in the layout of\n${src}`);
  return { name, size: Number(t[1]), align: Number(t[2]), fields };
}

async function layoutOf(src: string) {
  const b = box();
  b.write('x.c', src);
  return recordLayout(await b.run('clang', [...TARGET, '-Os', '-c', '-o', 'x.o', '-Xclang', '-fdump-record-layouts', 'x.c']), src);
}

/** Runs `f` on each entry of `o` at once, keeping the keys. */
const each = <T, U>(o: Record<string, T>, f: (v: T, k: string) => Promise<U>) =>
  Promise.all(Object.entries(o).map(async ([k, v]) => [k, await f(v, k)] as const)).then((e) => Object.fromEntries(e) as Record<string, U>);

/** Builds the C pages' data. */
export async function generateC() {
  const keys = each(KEY_SRC, async (src, k) => {
    const name = KEY_VAR[k];
    const b = box();
    b.write('x.c', src);
    await b.run('clang', [...TARGET, '-Os', '-c', '-o', 'x.o', 'x.c']);
    const [build, info] = await Promise.all([compile(src, '-Os'), inspect(b, 'x.o')]);
    const sym = info.syms.find((x) => x.name === name);
    return { ...build, name, sym: sym ? { name, section: sym.section, size: sym.size, bind: sym.bind } : null, relocs: info.relocs.map((r) => r.sym) };
  });
  const ints = each(INT_SRC, (v) => Promise.all(v.map((s) => compile(s, '-Os'))));
  const sizes = (async () => {
    const one = async (t: string) => {
      const head = 'enum mode { OFF, ON };\n';
      const [a, b] = await Promise.all([layoutOf(`${head}struct s { ${t} x; };\nstruct s v;`), layoutOf(`${head}struct s { char c; ${t} x; };\nstruct s v;`)]);
      return { type: t, size: a.size, align: b.fields[1].offset };
    };
    return Promise.all(C_TYPES.map(one));
  })();
  const structs = each(STRUCT_SRC, async (s) => ({ layout: await layoutOf(s), ...(await compile(s, '-Os')) }));
  const ptrs = each(PTR_SRC, (s) => compile(s, '-Os'));
  const fns = each(FN_SRC, (v) => Promise.all(v.map((s) => compile(s, '-Os'))));
  const drv = each(DRV_SRC, (s) => compile(s, '-Os'));
  return {
    src: { keys: KEY_SRC, ints: INT_SRC, structs: STRUCT_SRC, ptrs: PTR_SRC, fns: FN_SRC, drv: DRV_SRC },
    keys: await keys, ints: await ints, sizes: await sizes, structs: await structs, ptrs: await ptrs, fns: await fns, drv: await drv,
  };
}

/** Builds all the data. Throws if a tool is missing or disagrees with itself. */
export async function generate() {
  {
    const versions = exec('clang', ['--version'], box().dir);
    const pre = (async () => {
      const b = box();
      b.write('led.c', PRE_SRC);
      return Object.fromEntries(await Promise.all(Object.entries(PRE_VARIANTS).map(async ([k, d]) =>
        [k, preLines(await b.run('clang', [...TARGET, ...d, '-E', 'led.c']), 'led.c')] as const)));
    })();
    const compiled = each(COMPILE_SRC, (s) => compile(s, '-Os'));
    const optimized = each(OPT_SRC, (s) => Promise.all(OPT_LEVELS.map((o) => compile(s, o).then((r) => [o, r] as const))).then(Object.fromEntries));
    const vol = each(VOL_SRC, (v) => Promise.all(v.map((s) => compile(s, '-Os'))));
    const ub = each(UB_SRC, (v) => Promise.all(v.map((s) => compile(s, '-Os'))));

    const object = (async () => {
      const b = box();
      b.write('sensor.c', OBJ_SRC);
      await b.run('clang', [...TARGET, '-Os', '-c', 'sensor.c', '-o', 'sensor.o']);
      return inspect(b, 'sensor.o');
    })();

    const link = (async () => {
      const b = box();
      await Promise.all(Object.entries(LINK_SRC).map(([f, s]) => {
        b.write(f, s);
        return b.run('clang', [...TARGET, '-Os', '-c', f, '-o', f.replace('.c', '.o')]);
      }));
      b.write('link.ld', LINK_SCRIPT);
      await b.lld(['-T', 'link.ld', '-e', 'main', 'main.o', 'math.o', '-o', 'app.elf']);
      const [m, n, a] = await Promise.all([inspect(b, 'main.o'), inspect(b, 'math.o'), inspect(b, 'app.elf')]);
      return { 'main.o': m, 'math.o': n, 'app.elf': a };
    })();

    const script = each(SCRIPT_SRC, async (s) => {
      const b = box();
      b.write('p.c', s);
      await b.run('clang', [...TARGET, '-Os', '-c', 'p.c', '-o', 'p.o']);
      return linkWith(b, ['p.o']);
    });

    const map = (async () => {
      const b = box();
      const objs = await Promise.all(Object.keys(MAP_SRC).map(async (f) => {
        b.write(f, MAP_SRC[f]);
        await b.run('clang', [...TARGET, '-Os', '-ffunction-sections', '-fdata-sections', '-c', f, '-o', f.replace('.c', '.o')]);
        return f.replace('.c', '.o');
      }));
      b.write('link.ld', LINK_SCRIPT);
      await b.lld(['-T', 'link.ld', '-e', 'main', '--gc-sections', '-Map', 'app.map', ...objs, '-o', 'fw.elf']);
      // The map's allocated rows (non-zero VMA), without the $t/$d markers that only tell a disassembler Thumb from data.
      return {
        lines: b.read('app.map').split('\n').filter((l, i) => i === 0 || (/^\s*[1-9a-f][0-9a-f]*\s/.test(l) && !/\s\$[td]$/.test(l))),
        sections: await headers(b, 'fw.elf'),
      };
    })();

    const src = { pre: PRE_SRC, compile: COMPILE_SRC, opt: OPT_SRC, vol: VOL_SRC, ub: UB_SRC, obj: OBJ_SRC, link: LINK_SRC, ld: LINK_SCRIPT, script: SCRIPT_SRC, map: MAP_SRC };
    return {
      clang: (await versions).split('\n')[0].replace(/\s*\(.*\)$/, ''), src,
      pre: await pre, compiled: await compiled, optimized: await optimized, vol: await vol, ub: await ub,
      object: await object, link: await link, script: await script, map: await map,
    };
  }
}
