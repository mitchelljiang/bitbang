/**
 * The brown-out page: a dip in the RP2350's core supply against the power-on reset and brown-out thresholds. The
 * datasheet's threshold table and timing are exported; verify checks all eighteen settings against the table.
 */
import { markSeg, reservedStatus, seg, syncUrl } from './dbg';

/** DVDD threshold in volts for a VSEL setting, RP2350 datasheet POWMAN BOD register, 0 to 17. */
export const bodVolts = (vsel: number) => Math.round((0.473 + 0.043 * vsel) * 1000) / 1000;
export const BOD_MAX_VSEL = 17;
/** The reset value of VSEL, 0x0b: 0.946 V. */
export const BOD_DEFAULT = 11;
export const POR_TYP = 0.957;
/** How long a brown-out must last before it asserts reset, in µs: typical and maximum (tBOD.ASSERT). */
export const ASSERT_US = { typ: 3, max: 10 };
export type Outcome = 'none' | 'maybe' | 'reset';

/** Whether a dip to `volts` for `us` resets the chip at this threshold. Between typical and maximum it may or may not. */
export function dipOutcome(volts: number, us: number, vsel: number): Outcome {
  if (volts >= bodVolts(vsel)) return 'none';
  if (us >= ASSERT_US.max) return 'reset';
  return us >= ASSERT_US.typ ? 'maybe' : 'none';
}

const DEPTHS = [['1', '1.05 V', 1.05], ['2', '0.90 V', 0.9], ['3', '0.75 V', 0.75]] as const;
const LENS = [['1', '1 µs', 1], ['2', '5 µs', 5], ['3', '100 µs', 100]] as const;

export function mountBrownout(root: HTMLElement) {
  let d = '2', l = '3', vsel = BOD_DEFAULT;
  root.innerHTML = `
    <section class="intro">
      <p class="crumbs">Energy</p>
      <h1>Brown-out</h1>
      <p>When a supply sags, digital logic does not stop cleanly. It keeps running with marginal timing and can misread flash or corrupt
        memory. So a chip watches its own supply and holds itself in reset when the voltage is too low. This is the
        RP2350’s 1.1 V core supply, with a dip you can shape.</p>
    </section>
    <section class="debugger bod" aria-label="Brown-out detection">
      <header class="dbg-bar"><span class="dbg-file">DVDD</span><div class="dbg-controls"><span class="bat-c"><small>Dip to</small>${seg('d', 'Dip depth', DEPTHS.map(([k, t]) => [k, t]))}</span><span class="bat-c"><small>For</small>${seg('l', 'Dip length', LENS.map(([k, t]) => [k, t]))}</span></div></header>
      <div class="bod-plot"></div>
      <div class="clk-ctl"><span class="clk-st"><small>BOD threshold (VSEL)</small><button type="button" class="dbg-btn" data-s="-1" aria-label="Lower threshold">−</button><output class="bod-v"></output><button type="button" class="dbg-btn" data-s="1" aria-label="Raise threshold">+</button></span></div>
      <p class="dbg-status" aria-live="polite"></p>
    </section>
    <section class="prose">
      <h2>Two detectors</h2>
      <p><strong>Power-on reset</strong> holds the chip in reset as the supply comes up, until DVDD passes a threshold of typically 0.957 V.
        <strong>Brown-out detection</strong> does the reverse job during operation: if DVDD falls below its threshold, nominally
        0.946 V at power-on, it resets the chip. The threshold can be set in steps of 43 mV from 0.473 V to 1.204 V through the VSEL field of the BOD register, and the chip stays in reset until DVDD is back above 101% of it. Note that the register’s field list still marks 0.860 V as the default; its reset value of 0x0b and the prose both give 0.946 V.</p>
      <h2>Why a short dip can pass</h2>
      <p>A detector with no delay would reset on every spike. The RP2350’s takes typically 3 µs, and at most 10 µs, to act on a low supply.
        Between those two figures it may or may not reset, so a robust design treats the whole window as unknown.</p>
      <h2>Choosing a threshold</h2>
      <p>Too low, and the chip keeps running on a voltage it is not specified for. Too high, and normal ripple resets it. Keep it above the
        lowest voltage at which the chip’s clock speed is guaranteed, and fix the cause of real dips: decoupling capacitors near the power pins and a regulator that can supply
        the load step. After a reset, the <a href="?p=watchdog" data-nav>watchdog</a> and reset-reason registers tell the firmware what happened, so it can record the event.</p>
    </section>`;
  const panel = root.querySelector<HTMLElement>('.bod')!;
  const text = (o: Outcome, v: number, t: number, us: number) => o === 'reset' ? `The dip to ${v.toFixed(2)} V is below the ${t.toFixed(3)} V threshold for ${us} µs, longer than the 10 µs maximum: the chip resets.` : o === 'maybe' ? `Below the ${t.toFixed(3)} V threshold for ${us} µs, between the typical 3 µs and the maximum 10 µs. It may or may not reset.` : v >= t ? `The dip to ${v.toFixed(2)} V stays above the ${t.toFixed(3)} V threshold, so nothing happens. The chip keeps running.` : `Below the ${t.toFixed(3)} V threshold, but for only ${us} µs, too short to assert reset.`;
  const all = [text('reset', 0.75, 1.118, 100), text('maybe', 0.75, 1.118, 5), text('none', 1.05, 0.473, 1), text('none', 0.75, 1.118, 1)];
  const say = reservedStatus(panel, all);
  function draw() {
    const v = DEPTHS.find((x) => x[0] === d)![2], us = LENS.find((x) => x[0] === l)![2], t = bodVolts(vsel), o = dipOutcome(v, us, vsel);
    const y = (x: number) => 150 - ((x - 0.4) / (1.3 - 0.4)) * 140;
    const w = us === 1 ? 14 : us === 5 ? 40 : 180;
    const x0 = 130, x1 = x0 + w;
    const line = o === 'reset' ? `M0 ${y(1.1)}H${x0}L${x0 + 8} ${y(v)}H${x1}L${x1 + 8} ${y(0.5)}H${x1 + 90}L${x1 + 100} ${y(1.1)}H560` : `M0 ${y(1.1)}H${x0}L${x0 + 8} ${y(v)}H${x1}L${x1 + 8} ${y(1.1)}H560`;
    root.querySelector('.bod-plot')!.innerHTML = `<svg viewBox="0 0 560 160" preserveAspectRatio="none" aria-hidden="true"><path d="M0 ${y(t)}H560" class="th"/><path d="M0 ${y(POR_TYP)}H560" class="por"/><path d="${line}" class="v ${o}"/></svg><span class="bod-t" style="top:${(y(t) / 160) * 100}%">BOD ${t.toFixed(3)} V</span><span class="bod-t por" style="top:${(y(POR_TYP) / 160) * 100}%">POR 0.957 V</span>`;
    root.querySelector('.bod-v')!.textContent = `${vsel.toString(2).padStart(5, '0')}`;
    root.querySelector<HTMLButtonElement>('[data-s="-1"]')!.disabled = vsel === 0;
    root.querySelector<HTMLButtonElement>('[data-s="1"]')!.disabled = vsel === BOD_MAX_VSEL;
    panel.dataset.o = o;
    say(text(o, v, t, us));
    markSeg(root, 'd', d); markSeg(root, 'l', l);
    syncUrl({ d, l, v: String(vsel) });
  }
  panel.addEventListener('click', (e) => {
    const t = e.target as Element, a = t.closest<HTMLElement>('[data-d]'), b = t.closest<HTMLElement>('[data-l]'), c = t.closest<HTMLElement>('[data-s]');
    if (a) d = a.dataset.d!; else if (b) l = b.dataset.l!; else if (c) vsel += Number(c.dataset.s); else return;
    draw();
  });
  draw();
}
