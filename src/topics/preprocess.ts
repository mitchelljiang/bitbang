/**
 * The preprocessor page: led.c on the left, and what `clang -E` hands the compiler on the right, for each mix of
 * -DDEBUG and -DLED_PIN=9. Each output line is tagged with the source line it came from, read from the preprocessor's
 * own line markers.
 */
import { CC } from './ccdata';
import { explorer, explorerHtml, maxRows, type Out } from './cc';
import { markSeg, oneOf, seg, syncUrl } from './dbg';

const DEBUG = ['off', 'on'] as const;
const PIN = ['5', '9'] as const;
/** The variant the generator built for these flags. */
const preVariant = (debug: string, pin: string) =>
  debug === 'on' ? (pin === '9' ? 'both' : 'debug') : pin === '9' ? 'pin' : 'plain';

const PRE_SRC = CC.src.pre;

export function mountPreprocess(root: HTMLElement) {
  let debug = oneOf('debug', DEBUG, 'off');
  let pin = oneOf('pin', PIN, '5');

  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">The build</p>
      <h1>Preprocessor</h1>
      <p>Before the compiler reads a line of C, the preprocessor rewrites the file as text. It pastes in every
        <code>#include</code>, replaces every macro with its definition, keeps or drops the code inside
        <code>#if</code>, and deletes the comments. The compiler only ever sees the result on the right. Turn the
        flags on and off, and click any line to see where it went.</p>
    </section>
    ${explorerHtml({
      file: 'led.c', label: 'Preprocessor',
      controls: `${seg('debug', '-DDEBUG', [['off', 'No DEBUG'], ['on', '-DDEBUG']])}
        ${seg('pin', 'LED pin', [['5', 'LED_PIN 5'], ['9', '-DLED_PIN=9']])}`,
    })}
    <section class="prose">
      <h2>Text in, text out</h2>
      <p>The preprocessor knows nothing about C’s types or functions. <code>#define LED_PIN 5</code> tells it to
        replace the word <code>LED_PIN</code> with the text <code>5</code> wherever it appears, and
        <code>BIT(n)</code> is the same with a parameter: <code>BIT(LED_PIN)</code> becomes
        <code>(1u &lt;&lt; (5))</code>. That is why macros are written with so many brackets. Without them,
        <code>#define BIT(n) 1u &lt;&lt; n</code> would turn <code>BIT(2) + 1</code> into
        <code>1u &lt;&lt; 2 + 1</code>, which C reads as <code>1u &lt;&lt; 3</code>.</p>
      <p><code>GPIOA_ODR</code> expands to <code>(*(volatile uint32_t *)0x48000014)</code>: a pointer to the
        output register at that address, dereferenced. Writing to it writes to the pins, as on the
        <a href="?p=mmio" data-nav>memory-mapped I/O</a> page.</p>
      <h2>Flags change the program</h2>
      <p><code>-DDEBUG</code> on the compiler’s command line is the same as <code>#define DEBUG</code> at the top of
        the file. With it, <code>LOG("led on")</code> becomes a call to <code>uart_puts</code>; without it, the macro
        is empty and the line vanishes, so a release build carries no logging code at all. <code>-DLED_PIN=9</code>
        defines <code>LED_PIN</code> before the file does, so the <code>#ifndef</code> skips the default. One source
        file can serve several boards this way.</p>
      <h2>#include is a paste</h2>
      <p><code>#include &lt;stdint.h&gt;</code> copies that header into the file, here ${CC.pre.plain[0].n} lines of
        <code>typedef</code>s that give <code>uint32_t</code> its meaning. A larger header can pull in thousands of
        lines, which is a large part of why C builds are slow. The result of all this, one <code>.c</code> file with
        its headers pasted in, is a <em>translation unit</em>: the compiler works on one at a time and knows nothing
        about the others until the <a href="?p=linking" data-nav>linker</a> joins them.</p>
      <p>Run <code>clang -E led.c</code> or <code>gcc -E led.c</code> to see this output yourself. The lines starting
        with <code>#</code> in the real output are line markers, which tell the compiler which file and line each
        part came from so its error messages point at your source; they are hidden here and drawn as colors.</p>
    </section>`;

  const views = Object.values(CC.pre).map((lines) => ({ src: PRE_SRC, out: lines }));
  const { draw } = explorer(root, maxRows(views), () => {
    const lines = CC.pre[preVariant(debug, pin)];
    const out: Out[] = lines.map((l) => ('from' in l
      ? { t: l.from as string, src: 0, kind: 'from' as const, n: l.n as number }
      : { t: l.t, src: l.src, kind: 'text' as const }));
    markSeg(root, 'debug', debug);
    markSeg(root, 'pin', pin);
    syncUrl({ debug, pin });
    const code = out.filter((o) => o.kind === 'text').length;
    return {
      src: PRE_SRC, out, head: `clang -E${debug === 'on' ? ' -DDEBUG' : ''}${pin === '9' ? ' -DLED_PIN=9' : ''}`,
      summary: `${PRE_SRC.split('\n').length} lines in, ${code} lines of C out, plus the header. Every
        <code>#</code> line and comment is gone, and ${debug === 'on' ? '<code>LOG</code> became a call' : '<code>LOG("led on")</code> became nothing'}.`,
    };
  }, (o) => (o.kind === 'from' ? `The contents of <${o.t}>, pasted where the #include was.` : null));

  root.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-debug], [data-pin]');
    if (!b) return;
    if (b.dataset.debug) debug = b.dataset.debug as typeof debug;
    if (b.dataset.pin) pin = b.dataset.pin as typeof pin;
    draw();
  });
}
