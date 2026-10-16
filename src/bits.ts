import type { Category } from './catalog';

/** Bits and bytes topics, grouped for the section sidebar. Each has an interactive page in src/topics. */
export const bitTopics: Category[] = [
  {
    id: 'representation',
    name: 'Representing numbers',
    heading: 'Start here',
    blurb: 'How a pattern of bits stands for a number.',
    entries: [
      { id: 'binary', name: 'Binary and hexadecimal', blurb: 'Place values in base 2, and why each hex digit is four bits.' },
      { id: 'twos', name: 'Two’s complement', blurb: 'How signed integers are stored, and why the same adder handles both signs.' },
      { id: 'fixed', name: 'Fixed point', blurb: 'Fractions stored as integers with an implied binary point.' },
      { id: 'float', name: 'IEEE 754 floating point', blurb: 'Sign, exponent and mantissa, and why 0.1 + 0.2 is not 0.3.' },
    ],
  },
  {
    id: 'operations',
    name: 'Bitwise operations',
    blurb: 'Working with individual bits inside a word.',
    entries: [
      { id: 'bitwise', name: 'AND, OR, XOR and NOT', blurb: 'The logic operations applied to every bit position at once.' },
      { id: 'shifts', name: 'Shifts and rotates', blurb: 'Logical and arithmetic shifts, and rotates that wrap bits around.' },
      { id: 'masks', name: 'Masks', blurb: 'Setting, clearing, toggling and testing bits in a register.' },
      { id: 'tricks', name: 'Bit tricks', blurb: 'One-line idioms that find, clear and count bits, such as x & (x - 1).' },
      { id: 'rmw', name: 'Read-modify-write', blurb: 'Changing some bits of a hardware register without disturbing the rest.' },
      { id: 'endianness', name: 'Endianness', blurb: 'The order in which the bytes of a multi-byte value are stored.' },
    ],
  },
  {
    id: 'arithmetic',
    name: 'Arithmetic and error checking',
    blurb: 'What happens when a result does not fit, and how data is checked for errors.',
    entries: [
      { id: 'flags', name: 'Overflow and status flags', blurb: 'Carry, overflow, negative and zero, and why one adder needs both C and V.' },
      { id: 'crc', name: 'Checksums and CRC', blurb: 'How a receiver detects flipped bits, and why a CRC catches errors a checksum misses.' },
    ],
  },
];
