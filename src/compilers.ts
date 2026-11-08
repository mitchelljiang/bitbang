import type { Category } from './catalog';

/** Compiler topics, grouped for the section sidebar. Pages with an interactive page are registered in src/topics. */
export const compilerTopics: Category[] = [
  {
    id: 'start',
    name: 'Compilers',
    heading: 'Start here',
    blurb: 'The route through the section.',
    entries: [{ id: 'compilers-start', name: 'Overview', blurb: 'What this section covers, what to read first, and the words it uses.' }],
  },
  {
    id: 'build',
    name: 'The build',
    blurb: 'The steps that turn a .c file into a program the chip can run.',
    entries: [
      { id: 'preprocess', name: 'Preprocessor', blurb: '#include, #define and #if: the text the compiler actually sees.' },
      { id: 'compile', name: 'Compiling', blurb: 'One C function and the assembly it becomes, line by line.' },
      { id: 'objects', name: 'Object files', blurb: 'Sections, symbols and relocations: what an .o file holds before linking.' },
      { id: 'linking', name: 'Linking', blurb: 'How the linker joins object files and fixes every address.' },
    ],
  },
  {
    id: 'image',
    name: 'The image',
    blurb: 'What ends up in Flash, and where.',
    entries: [
      { id: 'linker-script', name: 'Linker scripts', blurb: 'MEMORY and SECTIONS: placing code in Flash and data in SRAM.' },
      { id: 'mapfile', name: 'Map files', blurb: 'Reading the linker’s map to find what takes up space.' },
    ],
  },
  {
    id: 'opt',
    name: 'Optimization',
    blurb: 'What the compiler may change, and what it must keep.',
    entries: [
      { id: 'optimize', name: 'Optimization levels', blurb: 'The same function at -O0, -O2 and -Os.' },
      { id: 'volatile', name: 'volatile', blurb: 'Why a register read in a loop disappears without it.' },
      { id: 'ub', name: 'Undefined behavior', blurb: 'Code the compiler may assume never runs, and what it does with that.' },
    ],
  },
];
