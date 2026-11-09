/**
 * Instructions: what one machine instruction looks like, in three instruction sets found on microcontrollers: Arm
 * Thumb (STM32, Raspberry Pi Pico), RISC-V (ESP32-C3, Pico 2) and Xtensa (ESP32). Five instructions in each, doing the
 * same jobs (load a constant, add a constant, add two registers, load a word, branch on a condition), drawn as their
 * bits split into fields. Click an operand bit to change it and the assembly, the hex word and the bytes in memory
 * follow. `encode`, `decode` and `asm` are exported; the checks compare Thumb with Clang's assembler and RISC-V and
 * Xtensa with the Capstone disassembler.
 */
import { esc } from '../core/render';
import { bits, hexN, markSeg, seg, syncUrl, wire, type BitGroup } from './dbg';
import { eq } from './math';

export type IsaId = 'thumb' | 'riscv' | 'xtensa';
export type Kind = 'op' | 'reg' | 'imm' | 'cond';
export interface Field {
  name: string; hi: number; lo: number; kind: Kind;
  /** The label above the field, if not its name. */
  head?: string;
  /** For an immediate split across fields: which bit of the immediate this field's lowest bit is. */
  at?: number;
}
export interface FormDef {
  id: string; label: string; fixed: number; fields: Field[]; dflt: number;
  /** The immediate: its width once its pieces are put together, whether it is signed, and the unit it counts in. */
  imm?: { bits: number; signed: boolean; scale: number; unit?: string };
  branch?: boolean;
}
export interface Isa {
  id: IsaId; label: string; chips: string; width: 16 | 24 | 32; addr: number; regBits: number; regRange: string;
  forms: FormDef[];
  reg: (n: number) => string;
  /** Where a branch at `addr` with immediate `imm` (already scaled to bytes) goes. */
  target: (addr: number, imm: number) => number;
}

const RV_ABI = ['zero', 'ra', 'sp', 'gp', 'tp', 't0', 't1', 't2', 's0', 's1', 'a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7',
  's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11', 't3', 't4', 't5', 't6'];

const op = (name: string, hi: number, lo: number, head?: string): Field => ({ name, hi, lo, kind: 'op', head });
const reg = (name: string, hi: number, lo: number): Field => ({ name, hi, lo, kind: 'reg' });
const imm = (name: string, hi: number, lo: number, at = 0, head?: string): Field => ({ name, hi, lo, kind: 'imm', at, head });
const cond = (name: string, hi: number, lo: number): Field => ({ name, hi, lo, kind: 'cond' });

/** Each set's encodings, fields high bits first: Armv7-M ARM (16-bit Thumb), the RISC-V unprivileged spec (RV32I), the Xtensa ISA reference (RRR, RRI8). */
export const ISAS: Record<IsaId, Isa> = {
  thumb: {
    id: 'thumb', label: 'Arm Thumb', chips: 'STM32 · Pico', width: 16, addr: 0x0800_0100, regBits: 3, regRange: 'r0 to r7',
    reg: (n) => `r${n}`, target: (a, i) => a + 4 + i,
    forms: [
      { id: 'movs', label: 'MOVS imm', fixed: 0x2000, dflt: 0x232a, fields: [op('opcode', 15, 11), reg('Rd', 10, 8), imm('imm8', 7, 0)], imm: { bits: 8, signed: false, scale: 1 } },
      { id: 'addi', label: 'ADDS imm', fixed: 0x1c00, dflt: 0x1d51, fields: [op('opcode', 15, 9), imm('imm3', 8, 6), reg('Rn', 5, 3), reg('Rd', 2, 0)], imm: { bits: 3, signed: false, scale: 1 } },
      { id: 'addr', label: 'ADDS reg', fixed: 0x1800, dflt: 0x19c8, fields: [op('opcode', 15, 9), reg('Rm', 8, 6), reg('Rn', 5, 3), reg('Rd', 2, 0)] },
      { id: 'ldr', label: 'LDR', fixed: 0x6800, dflt: 0x68e2, fields: [op('opcode', 15, 11), imm('imm5', 10, 6), reg('Rn', 5, 3), reg('Rt', 2, 0)], imm: { bits: 5, signed: false, scale: 4, unit: 'word' } },
      { id: 'bcond', label: 'B<cond>', fixed: 0xd000, dflt: 0xd001, branch: true, fields: [op('opcode', 15, 12), cond('cond', 11, 8), imm('imm8', 7, 0)], imm: { bits: 8, signed: true, scale: 2, unit: 'halfword' } },
    ],
  },
  riscv: {
    id: 'riscv', label: 'RISC-V', chips: 'ESP32-C3 · Pico 2', width: 32, addr: 0x4200_0100, regBits: 5, regRange: 'x0 to x31',
    reg: (n) => RV_ABI[n], target: (a, i) => a + i,
    forms: [
      { id: 'lui', label: 'LUI', fixed: 0x37, dflt: 0x6000_4537, fields: [imm('imm20', 31, 12, 12, 'imm[31:12]'), reg('rd', 11, 7), op('opcode', 6, 0)], imm: { bits: 32, signed: false, scale: 1 } },
      { id: 'addi', label: 'ADDI', fixed: 0x13, dflt: 0x02a5_8513, fields: [imm('imm12', 31, 20, 0, 'imm[11:0]'), reg('rs1', 19, 15), op('funct3', 14, 12), reg('rd', 11, 7), op('opcode', 6, 0)], imm: { bits: 12, signed: true, scale: 1 } },
      { id: 'add', label: 'ADD', fixed: 0x33, dflt: 0x00c5_8533, fields: [op('funct7', 31, 25), reg('rs2', 24, 20), reg('rs1', 19, 15), op('funct3', 14, 12), reg('rd', 11, 7), op('opcode', 6, 0)] },
      { id: 'lw', label: 'LW', fixed: 0x2003, dflt: 0x00c5_a603, fields: [imm('imm12', 31, 20, 0, 'imm[11:0]'), reg('rs1', 19, 15), op('funct3', 14, 12), reg('rd', 11, 7), op('opcode', 6, 0)], imm: { bits: 12, signed: true, scale: 1 } },
      { id: 'bcond', label: 'B<cond>', fixed: 0x63, dflt: 0x00b5_1463, branch: true, imm: { bits: 13, signed: true, scale: 1 },
        fields: [imm('imm[12]', 31, 31, 12, '12'), imm('imm[10:5]', 30, 25, 5, '10:5'), reg('rs2', 24, 20), reg('rs1', 19, 15), cond('funct3', 14, 12),
          imm('imm[4:1]', 11, 8, 1, '4:1'), imm('imm[11]', 7, 7, 11, '11'), op('opcode', 6, 0)] },
    ],
  },
  xtensa: {
    id: 'xtensa', label: 'Xtensa', chips: 'ESP32 · ESP32-S3', width: 24, addr: 0x400d_0100, regBits: 4, regRange: 'a0 to a15',
    reg: (n) => `a${n}`, target: (a, i) => a + 4 + i,
    forms: [
      { id: 'movi', label: 'MOVI', fixed: 0xa002, dflt: 0x2a_a022, fields: [imm('imm8', 23, 16, 0, 'imm[7:0]'), op('r', 15, 12), imm('s', 11, 8, 8, 'imm[11:8]'), reg('t', 7, 4), op('op0', 3, 0)], imm: { bits: 12, signed: true, scale: 1 } },
      { id: 'addi', label: 'ADDI', fixed: 0xc002, dflt: 0x05_c322, fields: [imm('imm8', 23, 16), op('r', 15, 12), reg('s', 11, 8), reg('t', 7, 4), op('op0', 3, 0)], imm: { bits: 8, signed: true, scale: 1 } },
      { id: 'add', label: 'ADD', fixed: 0x80_0000, dflt: 0x80_2340, fields: [op('op2', 23, 20), op('op1', 19, 16), reg('r', 15, 12), reg('s', 11, 8), reg('t', 7, 4), op('op0', 3, 0)] },
      { id: 'l32i', label: 'L32I', fixed: 0x2002, dflt: 0x03_2122, fields: [imm('imm8', 23, 16), op('r', 15, 12), reg('s', 11, 8), reg('t', 7, 4), op('op0', 3, 0)], imm: { bits: 8, signed: false, scale: 4, unit: 'word' } },
      { id: 'bcond', label: 'B<cond>', fixed: 0x7, dflt: 0x04_1237, branch: true, fields: [imm('imm8', 23, 16), cond('r', 15, 12), reg('s', 11, 8), reg('t', 7, 4), op('op0', 3, 0)], imm: { bits: 8, signed: true, scale: 1 } },
    ],
  },
};
export const ISA_IDS = Object.keys(ISAS) as IsaId[];
export const formOf = (isa: IsaId, id: string) => ISAS[isa].forms.find((f) => f.id === id)!;

/** Thumb's condition codes by value; 1110 and 1111 are not branches but UDF and SVC. */
export const COND = ['eq', 'ne', 'cs', 'cc', 'mi', 'pl', 'vs', 'vc', 'hi', 'ls', 'ge', 'lt', 'gt', 'le'];
const COND_TEXT = ['equal (Z set)', 'not equal (Z clear)', 'carry set, unsigned ≥', 'carry clear, unsigned <', 'negative (N set)', 'positive or zero (N clear)',
  'overflow (V set)', 'no overflow (V clear)', 'unsigned >', 'unsigned ≤', 'signed ≥', 'signed <', 'signed >', 'signed ≤'];
/** RISC-V's branches by funct3; 010 and 011 are unassigned. */
const RV_COND = ['beq', 'bne', null, null, 'blt', 'bge', 'bltu', 'bgeu'];
const RV_TEXT = ['=', '≠', '', '', '< (signed)', '≥ (signed)', '< (unsigned)', '≥ (unsigned)'];
/** Xtensa's branches by the r field. BBCI and BBSI use r's low bit as the top bit of a 5-bit bit number. */
const XT_COND = ['bnone', 'beq', 'blt', 'bltu', 'ball', 'bbc', 'bbci', 'bbci', 'bany', 'bne', 'bge', 'bgeu', 'bnall', 'bbs', 'bbsi', 'bbsi'];

const width = (f: Field) => f.hi - f.lo + 1;
const fieldVal = (w: number, f: Field) => (w >>> f.lo) & ((1 << width(f)) - 1);
const opMask = (form: FormDef) => form.fields.filter((f) => f.kind === 'op').reduce((m, f) => m | (((1 << width(f)) - 1) << f.lo), 0) >>> 0;

/** The word for a form and its operand values, by field name. */
export function encode(isa: IsaId, id: string, ops: Record<string, number>) {
  const form = formOf(isa, id);
  return form.fields.reduce((w, f) => (f.kind === 'op' ? w : (w | ((ops[f.name] & ((1 << width(f)) - 1)) << f.lo)) >>> 0), form.fixed) >>> 0;
}
/** Each field of a word, read as the given form. */
export const decode = (isa: IsaId, id: string, w: number) => Object.fromEntries(formOf(isa, id).fields.map((f) => [f.name, fieldVal(w, f)]));
/** Whether a word has the form's opcode bits. */
export const opcodeOk = (isa: IsaId, id: string, w: number) => ((w ^ formOf(isa, id).fixed) & opMask(formOf(isa, id))) === 0;

/** The immediate, put together from its fields and sign-extended, before scaling. */
function rawImm(form: FormDef, w: number) {
  if (!form.imm) return 0;
  const v = form.fields.filter((f) => f.kind === 'imm').reduce((a, f) => a + fieldVal(w, f) * 2 ** (f.at ?? 0), 0);
  return form.imm.signed && v >= 2 ** (form.imm.bits - 1) ? v - 2 ** form.imm.bits : v;
}
/** The immediate in its final unit: bytes for offsets, the value for constants. */
export const immOf = (form: FormDef, w: number) => rawImm(form, w) * (form.imm?.scale ?? 1);
/** Where a branch goes. */
export const target = (isa: IsaId, w: number, addr = ISAS[isa].addr) => ISAS[isa].target(addr, immOf(formOf(isa, 'bcond'), w)) >>> 0;
/** Thumb's branch target for an imm8, kept for the checks: the branch's address + 4 (the PC reads ahead) + imm8 × 2. */
export const thumbTarget = (addr: number, imm8: number) => addr + 4 + (imm8 & 0x80 ? imm8 - 0x100 : imm8) * 2;
const xtBit = (o: Record<string, number>) => ((o.r & 1) << 4) | o.t;

/** The assembly the way a disassembler writes it (RISC-V without pseudo-instructions such as li). Null if the word is not an instruction. */
export function asm(isa: IsaId, id: string, w: number, addr = ISAS[isa].addr): string | null {
  const o = decode(isa, id, w), form = formOf(isa, id), r = ISAS[isa].reg, i = immOf(form, w), t = hexN(target(isa, w, addr), 32);
  if (isa === 'thumb') switch (id) {
    case 'movs': return `movs ${r(o.Rd)}, #${i}`;
    case 'addi': return `adds ${r(o.Rd)}, ${r(o.Rn)}, #${i}`;
    case 'addr': return `adds ${r(o.Rd)}, ${r(o.Rn)}, ${r(o.Rm)}`;
    case 'ldr': return `ldr ${r(o.Rt)}, [${r(o.Rn)}, #${i}]`;
    default: return o.cond === 14 ? `udf #${o.imm8}` : o.cond === 15 ? `svc #${o.imm8}` : `b${COND[o.cond]} ${t}`;
  }
  if (isa === 'riscv') switch (id) {
    case 'lui': return `lui ${r(o.rd)}, 0x${o.imm20.toString(16)}`;
    case 'addi': return `addi ${r(o.rd)}, ${r(o.rs1)}, ${i}`;
    case 'add': return `add ${r(o.rd)}, ${r(o.rs1)}, ${r(o.rs2)}`;
    case 'lw': return `lw ${r(o.rd)}, ${i}(${r(o.rs1)})`;
    default: return RV_COND[o.funct3] ? `${RV_COND[o.funct3]} ${r(o.rs1)}, ${r(o.rs2)}, ${t}` : null;
  }
  switch (id) {
    case 'movi': return `movi ${r(o.t)}, ${i}`;
    case 'addi': return `addi ${r(o.t)}, ${r(o.s)}, ${i}`;
    case 'add': return `add ${r(o.r)}, ${r(o.s)}, ${r(o.t)}`;
    case 'l32i': return `l32i ${r(o.t)}, ${r(o.s)}, ${i}`;
    default: {
      const m = XT_COND[o.r];
      return m === 'bbci' || m === 'bbsi' ? `${m} ${r(o.s)}, ${xtBit(o)}, ${t}` : `${m} ${r(o.s)}, ${r(o.t)}, ${t}`;
    }
  }
}

const XT_TEXT: Record<string, (s: string, t: string, b: number) => string> = {
  bnone: (s, t) => `no bit is set in both ${s} and ${t}`, beq: (s, t) => `${s} = ${t}`, blt: (s, t) => `${s} < ${t} (signed)`,
  bltu: (s, t) => `${s} < ${t} (unsigned)`, ball: (s, t) => `every bit set in ${t} is also set in ${s}`, bbc: (s, t) => `bit number ${t} (its low 5 bits) of ${s} is clear`,
  bbci: (s, _t, b) => `bit ${b} of ${s} is clear`, bany: (s, t) => `${s} and ${t} share any set bit`, bne: (s, t) => `${s} ≠ ${t}`,
  bge: (s, t) => `${s} ≥ ${t} (signed)`, bgeu: (s, t) => `${s} ≥ ${t} (unsigned)`, bnall: (s, t) => `some bit set in ${t} is clear in ${s}`,
  bbs: (s, t) => `bit number ${t} (its low 5 bits) of ${s} is set`, bbsi: (s, _t, b) => `bit ${b} of ${s} is set`,
};

const jump = (isa: IsaId, w: number) => {
  const d = target(isa, w) - ISAS[isa].addr;
  return `jump to ${hexN(target(isa, w), 32)}, ${d >= 0 ? `${d} bytes ahead` : `${-d} bytes back`}. Otherwise carry on.`;
};

/** What the instruction does, in words. */
function meaning(isa: IsaId, id: string, w: number) {
  const o = decode(isa, id, w), form = formOf(isa, id), r = ISAS[isa].reg, i = immOf(form, w);
  if (isa === 'thumb') switch (id) {
    case 'movs': return `${r(o.Rd)} = ${i}, and set the N and Z flags from the result.`;
    case 'addi': return `${r(o.Rd)} = ${r(o.Rn)} + ${i}, and set the N, Z, C and V flags.`;
    case 'addr': return `${r(o.Rd)} = ${r(o.Rn)} + ${r(o.Rm)}, and set the N, Z, C and V flags.`;
    case 'ldr': return `Load the 32-bit word at address ${r(o.Rn)} + ${i} into ${r(o.Rt)}.`;
    default: return o.cond >= 14
      ? `Not a branch: cond ${o.cond.toString(2)} is reserved, so this encoding is ${o.cond === 14 ? 'UDF, permanently undefined, which raises a fault' : 'SVC, a supervisor call into the operating system'}.`
      : `If ${COND_TEXT[o.cond]}, ${jump(isa, w)}`;
  }
  if (isa === 'riscv') {
    const zero = (n: number) => (n === 0 ? ' The destination is x0, which always reads 0, so the result is thrown away.' : '');
    switch (id) {
      case 'lui': return `${r(o.rd)} = ${hexN(i, 32)}: the top 20 bits of a constant, with the low 12 cleared. An ADDI after it fills those in, which is how a full 32-bit address is built.${zero(o.rd)}`;
      case 'addi': return o.rs1 === 0
        ? `${r(o.rd)} = 0 + ${i}. Adding to x0 is how RISC-V loads a small constant; assemblers write it li ${r(o.rd)}, ${i}.${zero(o.rd)}`
        : `${r(o.rd)} = ${r(o.rs1)} + ${i}. No flags are set: RISC-V has none.${zero(o.rd)}`;
      case 'add': return `${r(o.rd)} = ${r(o.rs1)} + ${r(o.rs2)}. No flags are set: RISC-V has none, and its branches compare two registers instead.${zero(o.rd)}`;
      case 'lw': return `Load the 32-bit word at address ${r(o.rs1)} + ${i} into ${r(o.rd)}.${zero(o.rd)}`;
      default: return RV_COND[o.funct3]
        ? `If ${r(o.rs1)} ${RV_TEXT[o.funct3]} ${r(o.rs2)}, ${jump(isa, w)}`
        : `Not an instruction: funct3 ${o.funct3.toString(2).padStart(3, '0')} is unassigned for branches, so the core raises an illegal-instruction exception.`;
    }
  }
  switch (id) {
    case 'movi': return `${r(o.t)} = ${i}. The 12-bit constant is split in two: its top four bits sit in the s field, its low eight in imm8.`;
    case 'addi': return `${r(o.t)} = ${r(o.s)} + ${i}.`;
    case 'add': return `${r(o.r)} = ${r(o.s)} + ${r(o.t)}. No flags are set: Xtensa has none, and its branches compare registers instead.`;
    case 'l32i': return `Load the 32-bit word at address ${r(o.s)} + ${i} into ${r(o.t)}.`;
    default: return `If ${XT_TEXT[XT_COND[o.r]](r(o.s), r(o.t), xtBit(o))}, ${jump(isa, w)}`;
  }
}

/** What a field's value means, for the label under it. Split immediates are explained in the readout instead. */
function foot(isa: IsaId, form: FormDef, f: Field, w: number) {
  const v = fieldVal(w, f);
  if (f.kind === 'op') return width(f) >= 3 ? 'fixed' : undefined;
  if (f.kind === 'reg') return isa === 'xtensa' && form.branch && f.name === 't' && /^bb.i$/.test(XT_COND[fieldVal(w, form.fields.find((x) => x.name === 'r')!)]) ? `#${xtBit(decode(isa, form.id, w))}` : ISAS[isa].reg(v);
  if (f.kind === 'cond') return isa === 'thumb' ? (v < 14 ? COND[v] : v === 14 ? 'udf' : 'svc') : isa === 'riscv' ? RV_COND[v] ?? '—' : XT_COND[v];
  const pieces = form.fields.filter((x) => x.kind === 'imm').length;
  if (pieces > 1 || f.at) return width(f) >= 8 ? hexN(v, width(f) > 8 ? 16 : 8) : undefined;
  const i = immOf(form, w);
  return form.branch ? `${i >= 0 ? '+' : ''}${i}` : `${isa === 'thumb' ? '#' : ''}${i}`;
}

function tip(isa: IsaId, form: FormDef, f: Field, i: number) {
  if (f.kind === 'op') return `Bit ${i} is part of the opcode: ${f.name} is fixed for ${form.label.split(' ')[0]}. Changing it would make a different instruction.`;
  const place = 2 ** (i - f.lo);
  if (f.kind === 'reg') return `Bit ${i} is worth ${place} in ${f.name}, a ${ISAS[isa].regBits}-bit register number: ${ISAS[isa].regRange}.`;
  if (f.kind === 'cond') return `Bit ${i} is worth ${place} in ${f.name}, which picks the condition.`;
  const im = form.imm!, k = i - f.lo + (f.at ?? 0);
  if (im.signed && k === im.bits - 1) return `Bit ${i} is the sign of the immediate: set, the value is negative.`;
  const pieces = form.fields.filter((x) => x.kind === 'imm').length;
  if (pieces > 1 || f.at) return `Bit ${i} is bit ${k} of the immediate, worth ${2 ** k >= 4096 ? `0x${(2 ** k).toString(16).toUpperCase()}` : 2 ** k}.`;
  return `Bit ${i} is worth ${place} in ${f.name}${im.scale > 1 ? `, which counts ${im.unit}s: ${place * im.scale} bytes` : ''}.`;
}

/** The immediate, assembled step by step, for the readout. */
function immText(form: FormDef, w: number) {
  if (!form.imm) return 'None: all three operands are registers.';
  const im = form.imm, raw = rawImm(form, w), v = raw * im.scale;
  const pieces = form.fields.filter((f) => f.kind === 'imm').sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  const sign = (n: number) => (form.branch && n >= 0 ? `+${n}` : String(n));
  let s: string;
  if (pieces.length > 1) {
    const low = pieces[pieces.length - 1].at ?? 0;
    s = `${pieces.map((f) => fieldVal(w, f).toString(2).padStart(width(f), '0')).join(' ')}${low ? ` ${'0'.repeat(low)}` : ''} = ${sign(raw)}`;
  } else if (pieces[0].at) s = `${pieces[0].name} << ${pieces[0].at} = ${hexN(v, 32)}`;
  else s = im.scale > 1 ? `${pieces[0].name} × ${im.scale} = ${sign(v)} bytes` : `${pieces[0].name} = ${sign(v)}`;
  return s;
}
/** For a branch, where it goes, counted from its own address. */
function targetText(isa: IsaId, w: number) {
  const v = immOf(formOf(isa, 'bcond'), w);
  return `${hexN(ISAS[isa].addr, 32)}${isa === 'riscv' ? '' : ' + 4'} ${v >= 0 ? '+' : '−'} ${Math.abs(v)} = ${hexN(target(isa, w), 32)}`;
}

const bytesOf = (w: number, n: number) => Array.from({ length: n / 8 }, (_, k) => ((w >>> (8 * k)) & 0xff).toString(16).toUpperCase().padStart(2, '0'));

export function mountInstructions(root: HTMLElement) {
  const q = new URLSearchParams(location.search);
  let isa: IsaId = ISA_IDS.find((x) => x === q.get('isa')) ?? 'thumb';
  let form = ISAS[isa].forms.find((f) => f.id === q.get('f')) ?? ISAS[isa].forms[0];
  const fromUrl = parseInt(q.get('w') ?? '', 16);
  let word = Number.isInteger(fromUrl) && fromUrl >= 0 && fromUrl < 2 ** ISAS[isa].width && opcodeOk(isa, form.id, fromUrl) ? fromUrl : form.dflt;
  let last: number | null = null;
  let shownForms: IsaId | null = null;

  const html = `
    <section class="intro">
      <p class="crumbs">Instruction set</p>
      <h1>Instructions</h1>
      <p>A program in Flash is a list of numbers, and each one is an instruction: a few bits that say what to do, and the
        rest saying to what. Which bits mean what is the chip's <b>instruction set</b>. Pick one of the three found on
        common microcontrollers, then an instruction, and click its operand bits: the assembly, the hex word and the
        bytes that sit in memory all follow. The opcode bits, with a dashed outline, are what make it that instruction.</p>
    </section>
    <section class="debugger instr" aria-label="Instruction encoding">
      <header class="dbg-bar">
        ${seg('isa', 'Instruction set', ISA_IDS.map((x) => [x, ISAS[x].label]))}
        <span class="dbg-file in-chips"></span>
        <div class="in-forms"></div>
      </header>
      <div class="dbg-body stacked">
        <pre class="dbg-code" aria-label="Listing"><code></code></pre>
        <div class="dbg-vars">
          <h3>Encoding</h3>
          <div class="in-bits"></div>
          <dl class="in-read"></dl>
        </div>
      </div>
      <p class="dbg-status" aria-live="polite"></p>
    </section>
    <section class="prose">
      <h2>Fields packed into bits</h2>
      <p>The processor decodes an instruction by looking at a few fixed bits first. They pick the instruction; the bits
        around them are fields whose meaning that instruction defines. In Thumb's <code>movs r3, #42</code> the top five
        bits, 00100, say "move an 8-bit constant", the next three name the register, and the low eight are the constant
        itself. Because every field has a fixed position, the hardware can pull all of them out at once, in the same
        cycle, with no searching.</p>
      <h2>Three instruction sets</h2>
      <p><b>Arm Thumb</b> is what every Arm Cortex-M runs: the STM32 family, the Raspberry Pi Pico's RP2040, and most
        other Arm microcontrollers. The common instructions are 16 bits, and Thumb-2 adds 32-bit ones for everything
        else. Arm's phone and desktop chips use a different, fixed 32-bit encoding, so their bits will not match these.
        <b>RISC-V</b> is an open instruction set, run by the ESP32-C3 and C6 and by the Pico 2's RP2350, which can
        boot either its Arm or its RISC-V cores. Its base instructions are 32 bits; the compressed extension adds 16-bit
        forms of the common ones. <b>Xtensa</b> is the core in the original ESP32 and the ESP32-S3. Its instructions are
        24 bits, three bytes, with 16-bit short forms (written with <code>.n</code>) for the most common.</p>
      <p>Thumb's arithmetic sets the N, Z, C and V flags, and a conditional branch tests them. RISC-V and Xtensa have no
        flags: a branch names two registers and compares them itself.</p>
      <h2>Register fields</h2>
      <p>The width of a register field sets how many registers an instruction can name. Thumb's 16-bit encodings have
        3-bit fields, so they reach only r0 to r7; compilers prefer those registers so that code fits in 16 bits. RISC-V
        has 5-bit fields for all 32 registers, and keeps rd, rs1 and rs2 in the same bit positions in every instruction,
        so the hardware can read the registers before it has worked out what the instruction is. Xtensa's 4-bit fields
        name 16 registers, a0 to a15, a window onto 64 physical registers that slides along on each function call.</p>
      <h2>Immediates are scaled and split</h2>
      <p>An immediate field counts in the unit that makes sense. Thumb's word load counts words, so imm5 = 3 means 12 bytes,
        and Xtensa's L32I does the same; RISC-V's LW counts bytes, so its offset can be any value from −2048 to 2047.
        Some immediates are split across fields to keep the rest in place. RISC-V's branch scatters its offset so that the
        sign is always bit 31 and the register fields never move, and drops the offset's bit 0, which is always zero.
        Xtensa's MOVI puts the top four bits of its constant where a register field would be.</p>
      <p>A branch's offset is counted from different places. On a Cortex-M the PC reads as the branch's address plus 4,
        a leftover of the pipeline fetching ahead; Xtensa also adds 4; RISC-V counts from the branch itself:</p>
      ${eq(String.raw`\text{Thumb:}\; a + 4 + 2 \cdot \mathrm{imm8} \qquad \text{RISC-V:}\; a + \mathrm{imm} \qquad \text{Xtensa:}\; a + 4 + \mathrm{imm8}`)}
      <p>The bytes in memory are the word's low byte first: the instruction stream is
        <a href="?p=endianness" data-nav>little-endian</a> like the data, in all three. To see a short Thumb program run
        instruction by instruction, see <a href="?p=calls" data-nav>Function calls</a>.</p>
    </section>`;

  function draw() {
    const I = ISAS[isa], n = I.width;
    const fieldOf = (i: number) => form.fields.find((f) => i <= f.hi && i >= f.lo)!;
    const groups: BitGroup[] = form.fields.map((f) => ({ hi: f.hi, lo: f.lo, head: f.head ?? f.name, foot: foot(isa, form, f, word) ?? '\u00a0', split: width(f) > 8 ? 4 : undefined }));
    const box = root.querySelector<HTMLElement>('.in-bits')!;
    box.className = `in-bits w${n}`;
    box.innerHTML = bits('word', word, n, {
      editable: true, groups, flipped: (i) => last !== null && ((last ^ word) >>> i) & 1 ? true : false,
      fill: (i) => fieldOf(i).kind === 'op', tip: (i) => tip(isa, form, fieldOf(i), i),
    });
    const text = asm(isa, form.id, word);
    const bytes = bytesOf(word, n).join(' ');
    root.querySelector('.in-read')!.innerHTML = `
      <div><dt>Assembly</dt><dd><code>${text ? esc(text) : 'not an instruction'}</code></dd></div>
      <div><dt>Immediate</dt><dd><code>${esc(immText(form, word))}</code></dd></div>${form.branch ? `
      <div><dt>Target</dt><dd><code>${esc(targetText(isa, word))}</code></dd></div>` : ''}
      <div><dt>Hex</dt><dd><code>${hexN(word, n)}</code></dd></div>
      <div><dt>In memory</dt><dd><code>${bytes}</code> <small>from ${hexN(I.addr, 32)}, low byte first</small></dd></div>`;
    root.querySelector('.dbg-code code')!.innerHTML = `<span class="ln pc"><span class="c-comment">${hexN(I.addr, 32)}:</span>  ${bytes}    <b>${text ? esc(text) : `.word ${hexN(word, 32)}`}</b></span>`;
    root.querySelector('.in-chips')!.textContent = `${I.chips} · ${n}-bit`;
    if (shownForms !== isa) root.querySelector('.in-forms')!.innerHTML = seg('f', 'Instruction', I.forms.map((f) => [f.id, esc(f.label)]));
    shownForms = isa;
    root.querySelector('.dbg-status')!.innerHTML = esc(meaning(isa, form.id, word)) + ' Click an operand bit to change it.';
    markSeg(root, 'isa', isa);
    markSeg(root, 'f', form.id);
    syncUrl({ isa, f: form.id, w: word.toString(16).toUpperCase() });
  }

  wire(root, html, draw);
  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    const s = t.closest<HTMLElement>('[data-isa]');
    if (s) { isa = s.dataset.isa as IsaId; form = ISAS[isa].forms[0]; word = form.dflt; last = null; draw(); return; }
    const f = t.closest<HTMLElement>('[data-f]');
    if (f) { form = formOf(isa, f.dataset.f!); word = form.dflt; last = null; draw(); return; }
    const b = t.closest<HTMLElement>('.bit[data-row="word"]');
    if (!b) return;
    const i = Number(b.dataset.bit);
    const fld = form.fields.find((x) => i <= x.hi && i >= x.lo)!;
    if (fld.kind === 'op') { root.querySelector('.dbg-status')!.textContent = tip(isa, form, fld, i); return; }
    last = word;
    word = (word ^ (1 << i)) >>> 0;
    draw();
  });
}
