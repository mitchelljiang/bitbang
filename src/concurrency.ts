import type { Category } from './catalog';

/** Concurrency topics, grouped for the section sidebar. Pages with an interactive page are registered in src/topics. */
export const concurrencyTopics: Category[] = [
  {
    id: 'interrupting',
    name: 'Interrupting the program',
    blurb: 'How the processor stops what it is doing to handle something, and comes back.',
    entries: [
      { id: 'interrupts', name: 'Interrupts', blurb: 'The vector table, what the processor saves, and how a handler returns.' },
      { id: 'priorities', name: 'Priorities and nesting', blurb: 'Which interrupt wins, and when one can interrupt another.' },
    ],
  },
  {
    id: 'tasks',
    name: 'Running many tasks',
    blurb: 'How one processor is shared between several threads of execution.',
    entries: [
      { id: 'context', name: 'Context switching', blurb: 'What an RTOS saves and restores to swap one task for another.' },
      { id: 'scheduling', name: 'Scheduling', blurb: 'Choosing which ready task runs next, and when to switch.' },
    ],
  },
  {
    id: 'sharing',
    name: 'Sharing data safely',
    blurb: 'What goes wrong when two threads touch the same memory, and how to prevent it.',
    entries: [
      { id: 'races', name: 'Race conditions', blurb: 'Two tasks reading and writing the same variable, and the update that gets lost.' },
      { id: 'atomics', name: 'Atomics and critical sections', blurb: 'Load-exclusive and store-exclusive, disabling interrupts, and why volatile is not enough.' },
      { id: 'locks', name: 'Mutexes and semaphores', blurb: 'Taking turns, signalling between tasks, and priority inversion.' },
    ],
  },
];
