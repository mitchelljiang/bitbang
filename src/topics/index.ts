import { mountBitwise } from './bitwise';
import { mountBinary, mountFixed, mountFloat, mountTwos } from './numbers';
import { mountCrc } from './crc';
import { mountFlags } from './flags';
import { mountEndian, mountMasks, mountRmw, mountShifts } from './ops';
import { mountBufover } from './bufover';
import { mountInterrupts } from './interrupts';
import { mountAlignment } from './alignment';
import { mountHeap } from './heap';
import { mountTheStack } from './thestack';
import { mountMmio } from './mmio';
import { mountCalls } from './calls';
import { mountTricks } from './tricks';

/** The interactive page for each Bits and bytes and Memory topic, by id. */
export const topics: Record<string, (root: HTMLElement) => void> = {
  binary: mountBinary,
  twos: mountTwos,
  fixed: mountFixed,
  float: mountFloat,
  bitwise: mountBitwise,
  shifts: mountShifts,
  masks: mountMasks,
  tricks: mountTricks,
  rmw: mountRmw,
  endianness: mountEndian,
  flags: mountFlags,
  crc: mountCrc,
  calls: mountCalls,
  bufover: mountBufover,
  interrupts: mountInterrupts,
  mmio: mountMmio,
  alignment: mountAlignment,
  stack: mountTheStack,
  heap: mountHeap,
};
