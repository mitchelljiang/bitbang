import type { Category } from './catalog';

/** Power and clocks topics, grouped for the section sidebar. Pages with an interactive page are registered in src/topics. */
export const powerTopics: Category[] = [
  {
    id: 'start',
    name: 'Power and clocks',
    heading: 'Start here',
    blurb: 'The route through the section.',
    entries: [{ id: 'power-start', name: 'Overview', blurb: 'What this section covers, what to read first, and the words it uses.' }],
  },
  {
    id: 'clocks',
    name: 'Clocks',
    blurb: 'Where the chip’s frequencies come from.',
    entries: [{ id: 'clock-tree', name: 'Clock tree', blurb: 'A crystal, a PLL and its dividers: how 12 MHz becomes 125 MHz, and what limits each stage.' }],
  },
  {
    id: 'energy',
    name: 'Energy',
    blurb: 'Stopping work to save current, and surviving a sagging supply.',
    entries: [
      { id: 'sleep-modes', name: 'Sleep modes', blurb: 'What stops in Sleep and Dormant, what wakes the chip, and how much current each saves.' },
      { id: 'battery-life', name: 'Battery life', blurb: 'Average current from a duty cycle, and how long a battery lasts.' },
      { id: 'brownout', name: 'Brown-out', blurb: 'When the supply sags: power-on reset, brown-out detection and its threshold.' },
    ],
  },
];
