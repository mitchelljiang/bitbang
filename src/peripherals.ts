import type { Category } from './catalog';

/** Peripheral topics, grouped for the section sidebar. Pages with an interactive page are registered in src/topics. */
export const peripheralTopics: Category[] = [
  {
    id: 'start',
    name: 'Peripherals',
    heading: 'Start here',
    blurb: 'The route through the section.',
    entries: [{ id: 'peripherals-start', name: 'Overview', blurb: 'What this section covers, what to read first, and the words it uses.' }],
  },
  {
    id: 'pins',
    name: 'Pins',
    blurb: 'How a pin drives a wire, and how it reads one.',
    entries: [
      { id: 'gpio', name: 'GPIO', blurb: 'Push-pull and open-drain outputs, pull-up and pull-down resistors, and what an input reads.' },
      { id: 'debounce', name: 'Debouncing', blurb: 'Why one button press looks like many, and how to count it once.' },
    ],
  },
  {
    id: 'time',
    name: 'Time',
    blurb: 'Counting clock edges to measure and make time.',
    entries: [
      { id: 'timers', name: 'Timers', blurb: 'The prescaler, the counter and the auto-reload register, and how they set an update rate.' },
      { id: 'pwm', name: 'PWM', blurb: 'A compare register turns the counter into a square wave with a chosen duty cycle.' },
      { id: 'watchdog', name: 'Watchdog', blurb: 'A timer that resets the chip unless the program keeps proving it is alive.' },
    ],
  },
  {
    id: 'analog',
    name: 'Analog',
    blurb: 'Turning voltages into numbers and back.',
    entries: [
      { id: 'adc', name: 'ADC', blurb: 'A successive-approximation converter finds a voltage one bit at a time.' },
      { id: 'dac', name: 'DAC', blurb: 'A number becomes a voltage, one step of the reference at a time.' },
    ],
  },
  {
    id: 'data',
    name: 'Data',
    blurb: 'Moving data without the processor.',
    entries: [
      { id: 'dma', name: 'DMA', blurb: 'A transfer engine copies between a peripheral and memory while the CPU runs other code.' },
    ],
  },
];
