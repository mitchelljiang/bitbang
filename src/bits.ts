import type { Category } from './catalog';

/**
 * Bit manipulation topics, grouped for the Bit manipulation sidebar. None has an interactive page yet; each opens an
 * under-construction page with its `wip` text.
 */
export const bitTopics: Category[] = [
  {
    id: 'representation',
    name: 'Representing numbers',
    heading: 'Start here',
    blurb: 'How a pattern of bits stands for a number.',
    entries: [
      { id: 'binary', name: 'Binary and hexadecimal', blurb: 'Place values in base 2, and why each hex digit is four bits.',
        wip: 'Each bit in a binary number has a place value that is a power of two, just as each decimal digit has a place value that is a power of ten. Hexadecimal groups the bits four at a time, so each hex digit stands for exactly four bits; this is why registers, addresses and byte values are almost always written in hex.' },
      { id: 'twos', name: 'Two’s complement', blurb: 'How signed integers are stored, and why the same adder handles both signs.',
        wip: 'Two’s complement gives the most significant bit a negative place value. To negate a number, invert every bit and add 1. Because addition works the same way for signed and unsigned values, a processor needs only one adder; the difference appears only in how overflow and comparisons are interpreted.' },
      { id: 'fixed', name: 'Fixed point', blurb: 'Fractions stored as integers with an implied binary point.',
        wip: 'Fixed-point numbers place an imaginary binary point at a chosen position, so the bits to its right have place values of one half, one quarter and so on. They are used where floating-point hardware is unavailable or too slow, such as in digital signal processing on small microcontrollers.' },
      { id: 'float', name: 'IEEE 754 floating point', blurb: 'Sign, exponent and mantissa, and why 0.1 + 0.2 is not 0.3.',
        wip: 'An IEEE 754 number stores a sign bit, a biased exponent and a fraction with an implied leading 1. The format covers a very wide range of values, but most decimal fractions, such as 0.1, have no exact binary representation, so small rounding errors are unavoidable.' },
    ],
  },
  {
    id: 'operations',
    name: 'Bitwise operations',
    blurb: 'Working with individual bits inside a word.',
    entries: [
      { id: 'bitwise', name: 'AND, OR, XOR and NOT', blurb: 'The logic operations applied to every bit position at once.',
        wip: 'Bitwise operators apply a logic operation to each bit position independently. AND keeps only the bits set in both operands, OR keeps the bits set in either, XOR keeps the bits that differ, and NOT inverts every bit.' },
      { id: 'shifts', name: 'Shifts and rotates', blurb: 'Logical and arithmetic shifts, and rotates that wrap bits around.',
        wip: 'A left shift moves every bit toward the most significant end and fills with zeros, multiplying by a power of two. A right shift is either logical, filling with zeros, or arithmetic, copying the sign bit so that negative numbers stay negative. A rotate moves the bits that fall off one end back in at the other.' },
      { id: 'masks', name: 'Masks', blurb: 'Setting, clearing, toggling and testing bits in a register.',
        wip: 'A mask selects the bits an operation affects. OR with a mask sets those bits, AND with the inverted mask clears them, XOR toggles them, and AND tests them. These four patterns are how firmware configures hardware registers without disturbing the other bits.' },
      { id: 'rmw', name: 'Read-modify-write', blurb: 'Changing some bits of a hardware register without disturbing the rest.',
        wip: 'Changing a few bits of a memory-mapped hardware register takes three steps: read the register, change the bits with a mask, and write the value back. The register must be declared volatile so the compiler performs every access. If an interrupt changes the same register between the read and the write, its change is lost when the old value is written back. Status bits that clear when a 1 is written to them can also be cleared by accident. Many microcontrollers avoid these problems with dedicated set and clear registers, such as the BSRR register on STM32 GPIO ports, which change individual bits in a single write.' },
      { id: 'endianness', name: 'Endianness', blurb: 'The order in which the bytes of a multi-byte value are stored.',
        wip: 'A little-endian system stores the least significant byte of a value at the lowest address; a big-endian system stores the most significant byte first. Most processors are little-endian, while most network protocols send the most significant byte first, so values often need their bytes swapped at the boundary.' },
    ],
  },
];
