import type { Category } from './catalog';

/** C for embedded topics, grouped for the section sidebar. Pages with an interactive page are registered in src/topics. */
export const cTopics: Category[] = [
  {
    id: 'start',
    name: 'C for embedded',
    heading: 'Start here',
    blurb: 'The route through the section.',
    entries: [{ id: 'c-start', name: 'Overview', blurb: 'What this section covers, what to read first, and the words it uses.' }],
  },
  {
    id: 'vars',
    name: 'Variables and types',
    blurb: 'Where a variable lives, and what its type does to the code.',
    entries: [
      { id: 'keywords', name: 'Storage keywords', blurb: 'static, extern and const: where a variable lives and who can see it.' },
      { id: 'integers', name: 'Integer types', blurb: 'Sizes, promotion, and signed against unsigned in the generated code.' },
    ],
  },
  {
    id: 'layout',
    name: 'Data in memory',
    blurb: 'How structs and pointers map onto bytes and registers.',
    entries: [
      { id: 'structs', name: 'Structs and bit fields', blurb: 'Field order, padding, packed structs, bit fields and register maps.' },
      { id: 'pointers', name: 'Pointers', blurb: 'Register addresses, pointer arithmetic, struct members and function pointers.' },
    ],
  },
  {
    id: 'fns',
    name: 'Functions',
    blurb: 'What a call costs, and when there is no call at all.',
    entries: [
      { id: 'functions', name: 'Functions', blurb: 'inline, static, arguments in registers and on the stack, and passing structs.' },
    ],
  },
];
