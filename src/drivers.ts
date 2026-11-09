import type { Category } from './catalog';

/** Driver topics, grouped for the section sidebar. Pages with an interactive page are registered in src/topics. */
export const driverTopics: Category[] = [
  {
    id: 'start',
    name: 'Drivers',
    heading: 'Start here',
    blurb: 'The route through the section.',
    entries: [{ id: 'drivers-start', name: 'Overview', blurb: 'What this section covers, what to read first, and the words it uses.' }],
  },
  {
    id: 'registers',
    name: 'Talking to hardware',
    blurb: 'How C reaches a peripheral, and what a layer costs.',
    entries: [
      { id: 'register-layer', name: 'Register access', blurb: 'Macros, struct overlays and set/clear registers, and the instructions each one becomes.' },
      { id: 'hal', name: 'HAL design', blurb: 'A direct write, a function call, or a table of function pointers: what portability costs.' },
    ],
  },
  {
    id: 'data',
    name: 'Moving data',
    blurb: 'Getting bytes between an interrupt or DMA and the main program.',
    entries: [
      { id: 'ring-buffer', name: 'Ring buffers', blurb: 'A head, a tail and one empty slot: passing bytes safely from an interrupt to the main loop.' },
      { id: 'uart-driver', name: 'Interrupt-driven UART', blurb: 'How long interrupts can stay off before a received byte is lost.' },
      { id: 'dma-driver', name: 'DMA drivers', blurb: 'A circular buffer, half and full interrupts, and how fast the code has to keep up.' },
    ],
  },
];
