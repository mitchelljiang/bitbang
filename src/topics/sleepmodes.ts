/**
 * The sleep modes page: the RP2350's power states, which of its five power domains each keeps on, what wakes it, and
 * the power the datasheet measured (Tables 507, 1692 and 1693). Verify checks the states and numbers against those tables.
 */
import { markSeg, oneOf, reservedStatus, seg, syncUrl } from './dbg';

export const MODES = ['p00', 'p10', 'p13', 'p17'] as const;
export type Mode = (typeof MODES)[number];
export const DOMAINS = ['AON', 'SWCORE', 'XIP', 'SRAM0', 'SRAM1'] as const;
export type Domain = (typeof DOMAINS)[number];
/** The domains each power state keeps on, Table 507. Pc.m: c = 1 turns SWCORE off; m's bits turn off XIP, SRAM0, SRAM1. */
export const ON: Record<Mode, Domain[]> = {
  p00: ['AON', 'SWCORE', 'XIP', 'SRAM0', 'SRAM1'],
  p10: ['AON', 'XIP', 'SRAM0', 'SRAM1'],
  p13: ['AON', 'XIP'],
  p17: ['AON'],
};
/** Current in µA summed over the 3.3 V supplies, and total power in µW, as the datasheet tabulates them. */
export const POWER: Record<Mode, { ua: number; uw: number }> = {
  p00: { ua: 11000 + 212 + 455 + 22 + 1 + 90, uw: 38700 },
  p10: { ua: 128 + 0.5 + 11 + 22 + 1 + 3.5, uw: 548 },
  p13: { ua: 26 + 0.5 + 11 + 22 + 1 + 3.5, uw: 204 },
  p17: { ua: 19 + 0.5 + 11 + 22 + 1 + 3.5, uw: 188 },
};
export const WAKE_SOURCES = [['gpio', 'GPIO edge'], ['alarm', 'AON timer alarm'], ['uart', 'UART byte']] as const;
/** Low-power states wake only on a GPIO event or the timer alarm (6.2.3.2). */
export const wakes = (m: Mode, k: string) => m !== 'p00' && (k === 'gpio' || k === 'alarm');

const LABEL: Record<Mode, string> = { p00: 'P0.0 Run', p10: 'P1.0', p13: 'P1.3', p17: 'P1.7' };
const NAME: Record<Domain, string> = { AON: 'Always-on', SWCORE: 'Processors and peripherals', XIP: 'XIP cache, boot RAM', SRAM0: 'SRAM banks 0–3', SRAM1: 'SRAM banks 4–9' };
const WHAT: Record<Domain, string> = {
  AON: 'A small amount of logic that stays powered whenever DVDD is present. It controls every other domain and runs the timer that can wake the chip.',
  SWCORE: 'The switched core: both processors, the bus fabric and the peripherals. Powering it off loses their state.',
  XIP: 'The flash cache and boot RAM. It must be on whenever the switched core is.',
  SRAM0: 'The lower half of the large SRAM banks. A powered bank keeps its contents while the core is off.',
  SRAM1: 'The upper half of the large SRAM banks, and the scratch SRAMs.',
};
const SAY: Record<Mode, string> = {
  p00: 'Everything is powered. The figure is CoreMark on one core at 150 MHz: 38.7 mW in total.',
  p10: 'The switched core is off, so the processors have stopped and lost their state. All SRAM stays powered, so data survives.',
  p13: 'As P1.0, with both large SRAM domains off too. Only the cache and boot RAM keep their contents.',
  p17: 'Every memory is off and only the always-on domain is left: 188 µW. On waking, the program starts again with nothing retained.',
};

export function mountSleepModes(root: HTMLElement) {
  let mode = oneOf('m', MODES, 'p00');
  let woke = '';
  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Energy</p>
      <h1>Sleep modes</h1>
      <p>Stopping a clock saves the power a circuit spends switching, but the circuit still leaks. To save more, a chip must cut
        the power itself, and then whatever that part was storing is gone. The RP2350 divides its core into five power domains
        so you can choose. Pick a state to see what stays on, and try what wakes it up.</p>
    </section>
    <section class="debugger slp" aria-label="Power states">
      <header class="dbg-bar"><span class="dbg-file">RP2350</span><div class="dbg-controls">${seg('m', 'Power state', MODES.map((m) => [m, LABEL[m]]))}</div></header>
      <div class="slp-body">
        <div class="slp-blocks"></div>
        <div class="slp-right">
          <div class="slp-cur"></div>
          <div class="slp-wake"><small>Try to wake it</small>${WAKE_SOURCES.map(([k, l]) => `<button type="button" class="dbg-btn" data-w="${k}">${l}</button>`).join('')}</div>
        </div>
      </div>
      <p class="dbg-status" aria-live="polite"></p>
    </section>
    <section class="prose">
      <h2>Reading the names</h2>
      <p>A state is written Pc.m. If c is 1, the switched core is off. m is three bits, for XIP, SRAM0 and SRAM1, and a 1 means that domain is off.
        So P1.0 has only the core off, and P1.7 has every memory off too. In P0 states the program is running; P1 states are low-power.</p>
      <h2>What waking means</h2>
      <p>P1 states are woken by up to four GPIO events or by the timer alarm in the always-on domain. Nothing else can do it, since the peripherals have no power. The
        processors were off, so the chip does not carry on from where it stopped: it comes back through the boot path, and anything the program needs afterwards must be in a retained SRAM.</p>
      <h2>Sleep and Dormant</h2>
      <p>Within a P0 state the chip can also just stop clocks. <strong>Sleep</strong> is entered when both processors have enabled deep sleep and called <code>wfi</code>, with DMA stopped, and <code>SLEEP_EN</code> chooses which clocks stay on. <strong>Dormant</strong> stops the oscillators too. Both keep all state, so code resumes where it stopped, at a higher current than the P1 states. The datasheet does not tabulate their current, so they are not on the chart.</p>
      <h2>Reading the numbers</h2>
      <p>These are totals across the chip’s 3.3 V supplies, including flash on its QSPI pins. Notice that going from P1.3 to P1.7 saves little: the supplies outside the core already take most of what remains. A real board adds its regulator’s quiescent current, sensors and pull-ups, which often dominate at this level. See <a href="?p=battery-life" data-nav>battery life</a>.</p>
    </section>`;
  const panel = root.querySelector<HTMLElement>('.slp')!;
  const wakeSay = (m: Mode, k: string) => m === 'p00' ? 'The chip is already awake.' : wakes(m, k) ? `Awake. The always-on domain powers the core back up, and the chip restarts through its boot path.${m === 'p17' ? ' No SRAM survived.' : ''}` : 'Nothing happens. The UART is in the switched core, which has no power. Only a GPIO event or the timer alarm can wake the chip.';
  const say = reservedStatus(panel, [...Object.values(SAY), ...MODES.flatMap((m) => WAKE_SOURCES.map(([k]) => wakeSay(m, k))), ...Object.values(WHAT)]);
  function draw() {
    const scale = (uw: number) => (Math.log10(uw / 100) / Math.log10(100000 / 100)) * 100;
    const fmt = (uw: number) => (uw >= 1000 ? `${(uw / 1000).toFixed(1)} mW` : `${uw} µW`);
    root.querySelector('.slp-blocks')!.innerHTML = DOMAINS.map((d) => { const on = ON[mode].includes(d); return `<button type="button" class="slp-b${on ? ' on' : ''}" data-b="${d}"><i></i>${NAME[d]}<small>${on ? 'on' : 'off'}</small></button>`; }).join('');
    root.querySelector('.slp-cur')!.innerHTML = MODES.map((m) => `<div class="slp-row${m === mode ? ' on' : ''}"><span>${m === 'p00' ? 'P0.0' : LABEL[m]}</span><div><i style="width:${scale(POWER[m].uw)}%"></i></div><b>${fmt(POWER[m].uw)}</b></div>`).join('') + '<small class="slp-note">Total power, on a log scale</small>';
    say(woke ? wakeSay(mode, woke) : SAY[mode]);
    markSeg(root, 'm', mode);
    syncUrl({ m: mode });
  }
  panel.addEventListener('click', (e) => {
    const t = e.target as Element, m = t.closest<HTMLElement>('[data-m]'), w = t.closest<HTMLElement>('[data-w]'), b = t.closest<HTMLElement>('[data-b]');
    if (m) { mode = m.dataset.m as Mode; woke = ''; draw(); }
    else if (w) { woke = w.dataset.w!; draw(); }
    else if (b) { say(WHAT[b.dataset.b as Domain]); }
  });
  draw();
}
