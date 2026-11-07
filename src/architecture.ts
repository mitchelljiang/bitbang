import type { Category } from './catalog';

/** Architecture topics, grouped for the section sidebar. Pages with an interactive page are registered in src/topics. */
export const architectureTopics: Category[] = [
  {
    id: 'start',
    name: 'Architecture',
    heading: 'Start here',
    blurb: 'The route through the section.',
    entries: [{ id: 'architecture-start', name: 'Overview', blurb: 'What this section covers, what to read first, and the words it uses.' }],
  },
  {
    id: 'isa',
    name: 'Instruction set',
    blurb: 'What the processor is told to do, one instruction at a time.',
    entries: [
      { id: 'instructions', name: 'Instructions', blurb: 'How an instruction packs its opcode, registers and constants into fields, in Arm Thumb, RISC-V and Xtensa.' },
      { id: 'registers', name: 'Registers', blurb: 'r0 to r15, the stack pointer, link register and program counter, and the status flags.' },
      { id: 'addressing', name: 'Addressing', blurb: 'Register, immediate and offset forms: how a load or store finds its address.' },
    ],
  },
  {
    id: 'exec',
    name: 'Execution',
    blurb: 'How the core runs a stream of instructions quickly.',
    entries: [
      { id: 'pipeline', name: 'Pipeline', blurb: 'Fetch, decode and execute overlapped, and what makes the pipeline stall.' },
      { id: 'branches', name: 'Branches', blurb: 'What a taken branch costs, and how prediction hides it.' },
    ],
  },
];
